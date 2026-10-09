"""Typed tools for the conversation harness: the language model proposes, Python decides.

The planner model chooses an action, a role and search terms; everything that must be exact runs
here as a typed tool: catalog and policy lookup, deterministic package comparison, BM25 evidence
retrieval, confirmed report rows and booking/quotation previews. Each tool has

* a strict input model (unknown fields such as ``actor`` or ``organization_id`` are rejected; the
  actor, tenant and role come only from the server-side ToolContext),
* a permission scope checked against the answering role's server-defined ``reads``/``actions``,
* a timeout, a maximum output size, and
* an audit record (tool, version, scope, SHA-256 of the arguments, outcome, time, output size) that
  is returned with the answer under ``checks.tools`` and never contains the arguments themselves.

There is no shell, ``eval``/``exec``, URL fetch, file path or model-written code. A tool can only
read server data or build an unconfirmed preview; bookings, payments and approvals still need the
customer's confirmation and the existing backend policy.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, constr

from services.conversation_transport import ConversationError

SCHEMA_VERSION = "labclear-tools-1.0.0"
PackageId = constr(pattern=r"^P\d{2}$")


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Record(BaseModel):
    """An evidence record as the writer and validators already use it."""
    model_config = ConfigDict(extra="allow")
    id: str = Field(min_length=1, max_length=120)
    title: str = Field(max_length=300)
    content: str = Field(max_length=20000)
    data_class: Literal["synthetic_business", "public_reference", "public_education", "organization_private"]


class Records(BaseModel):
    records: list[Record]
    mode: str = ""


class NoArguments(StrictInput):
    pass


class LookupPackages(StrictInput):
    package_ids: list[PackageId] = Field(default_factory=list, max_length=18)
    segment: Literal["", "individual", "organization"] = ""
    max_price_thb: int | None = Field(default=None, ge=0, le=100000)


class ComparePackages(StrictInput):
    package_ids: list[PackageId] = Field(min_length=2, max_length=4)


class RetrieveEvidence(StrictInput):
    query: str = Field(min_length=1, max_length=700)
    limit: int = Field(default=6, ge=1, le=8)


class ConfirmedReportRows(StrictInput):
    field_ids: list[constr(pattern=r"^[A-Za-z0-9_-]{1,20}$")] = Field(default_factory=list, max_length=60)


class PreviewBooking(StrictInput):
    kind: Literal["quote", "book"]
    package_ids: list[PackageId] = Field(min_length=1, max_length=5)
    branch_id: constr(pattern=r"^[A-Z0-9]{0,10}$") = ""
    date: constr(pattern=r"^(\d{4}-\d{2}-\d{2})?$") = ""
    time: constr(pattern=r"^(\d{2}:\d{2})?$") = ""


class HospitalOffer(StrictInput):
    offer_id: constr(pattern=r"^[A-Za-z0-9_-]{0,40}$") = ""


@dataclass
class ToolContext:
    """Server-side facts. Never built from model output."""
    role_id: str
    scopes: frozenset[str]
    biz: dict
    report: dict | None = None
    search: Callable[[str, int], Awaitable[tuple[list[dict], str]]] | None = None
    quote: Callable[[list[str]], dict] | None = None
    audit: list[dict] = field(default_factory=list)

    @staticmethod
    def for_role(dot: dict, **kwargs) -> "ToolContext":
        scopes = frozenset(dot.get("reads", [])) | {"action:" + a for a in dot.get("actions", [])}
        return ToolContext(role_id=dot["id"], scopes=scopes, **kwargs)


@dataclass(frozen=True)
class Tool:
    name: str
    version: str
    arguments: type[StrictInput]
    scope: str
    timeout_seconds: float
    max_items: int
    max_chars: int
    run: Callable[[ToolContext, Any], Awaitable[dict]]
    description: str


# ------------------------------------------------------------------ implementations

def _package_record(p: dict) -> dict:
    return {"id": "rs-" + p["id"].lower(), "title": p["name"], "content": json.dumps(p, ensure_ascii=False),
            "data_class": "synthetic_business", "url": "/packages/" + p["id"], "publisher": "LabClear demo",
            "reviewed_at": "2026-10-05"}


async def _lookup_packages(ctx: ToolContext, a: LookupPackages) -> dict:
    rows = [p for p in ctx.biz["catalog"]["packages"] if p.get("active", True)]
    if a.package_ids:
        rows = [p for p in rows if p["id"] in set(a.package_ids)]
    if a.segment:
        rows = [p for p in rows if p.get("segment") == a.segment]
    if a.max_price_thb is not None:
        rows = [p for p in rows if p["price_thb"] <= a.max_price_thb]
    return {"records": [_package_record(p) for p in rows]}


async def _compare_packages(ctx: ToolContext, a: ComparePackages) -> dict:
    index = {p["id"]: p for p in ctx.biz["catalog"]["packages"] if p.get("active", True)}
    missing = [i for i in a.package_ids if i not in index]
    if missing or len(set(a.package_ids)) != len(a.package_ids):
        raise ConversationError("tool_arguments_invalid", "A package to compare is unavailable.", 422)
    chosen = [index[i] for i in a.package_ids]
    services = [set(p.get("services", [])) for p in chosen]
    shared = sorted(set.intersection(*services))
    table = {"catalog_version": ctx.biz["catalog"].get("version"), "computed_by": "agent_tools.compare_packages (deterministic)",
             "packages": [{"id": p["id"], "name": p["name"], "price_thb": p["price_thb"], "price_unit": p.get("price_unit"),
                           "segment": p.get("segment"), "services": p.get("services", []),
                           "only_in_this_package": sorted(set(p.get("services", [])) - set().union(*(s for j, s in enumerate(services) if j != i)))}
                          for i, p in enumerate(chosen)],
             "shared_services": shared,
             "note": "Counts of tests are not clinical benefit; suitability needs staff review."}
    return {"records": [{"id": "rs-compare", "title": "Package comparison: " + ", ".join(p["name"] for p in chosen),
                         "content": json.dumps(table, ensure_ascii=False), "data_class": "synthetic_business",
                         "url": "/compare?ids=" + ",".join(a.package_ids), "publisher": "LabClear demo"}]}


async def _lookup_branches(ctx: ToolContext, a: NoArguments) -> dict:
    return {"records": [{"id": "rs-branches", "title": "Demo centers", "content": json.dumps(ctx.biz["branches"]),
                         "data_class": "synthetic_business", "url": "/centers", "publisher": "LabClear demo"}]}


async def _lookup_policies(ctx: ToolContext, a: NoArguments) -> dict:
    return {"records": [{"id": "rs-policy", "title": "Demo service policy", "content": json.dumps(ctx.biz["policy"]),
                         "data_class": "synthetic_business", "url": "/help", "publisher": "LabClear demo"}]}


async def _retrieve_evidence(ctx: ToolContext, a: RetrieveEvidence) -> dict:
    records, mode = await ctx.search(a.query, a.limit)
    return {"records": records, "mode": mode}


async def _confirmed_report_rows(ctx: ToolContext, a: ConfirmedReportRows) -> dict:
    report = ctx.report
    if not report or not report.get("confirmed"):
        raise ConversationError("confirmation_required", "Confirm the report values before they are explained.", 409)
    if a.field_ids:
        wanted = set(a.field_ids)
        report = {**report, "fields": [f for f in report.get("fields", []) if f.get("id") in wanted]}
    return {"report": report}


async def _preview_booking(ctx: ToolContext, a: PreviewBooking) -> dict:
    if "action:" + a.kind not in ctx.scopes:
        raise ConversationError("tool_forbidden", "This assistant role cannot prepare that preview.", 403)
    quote = ctx.quote(list(a.package_ids))
    return {"preview": {"type": a.kind, "quote": quote, "branch_id": a.branch_id, "date": a.date, "time": a.time,
                        "confirmed": False}}


async def _hospital_offer(ctx: ToolContext, a: HospitalOffer) -> dict:
    from config import settings
    from services import hospital_links
    if not settings.HOSPITAL_LINKS_ENABLED:
        raise ConversationError("feature_disabled", "Official hospital links are not enabled.", 409)
    offers = [o for o in hospital_links.catalog() if not a.offer_id or o.get("id") == a.offer_id]
    # External offers are never clinical evidence, never a booking and never a partnership claim.
    return {"offers": [{k: o.get(k) for k in ("id", "hospital", "branch", "variant", "url", "detail_url", "state", "price_thb",
                                               "checked_at", "booking_confirmed", "partnership_verified")} for o in offers]}


TOOLS: dict[str, Tool] = {t.name: t for t in [
    Tool("lookup_packages", "1.0.0", LookupPackages, "catalog", 2, 40, 60000, _lookup_packages,
         "Active catalog packages, optionally filtered by IDs, segment or maximum price."),
    Tool("compare_packages", "1.0.0", ComparePackages, "catalog", 2, 1, 20000, _compare_packages,
         "Deterministic side-by-side of two to four active packages: prices, units and shared/unique services."),
    Tool("lookup_branches", "1.0.0", NoArguments, "branches", 2, 1, 20000, _lookup_branches, "Demo centers and opening hours."),
    Tool("lookup_policies", "1.0.0", NoArguments, "policies", 2, 1, 20000, _lookup_policies, "Service, payment, cancellation and privacy policy."),
    Tool("retrieve_evidence", "1.0.0", RetrieveEvidence, "medical", 10, 8, 60000, _retrieve_evidence,
         "BM25 search over the verified medical knowledge catalog (no embedding API)."),
    Tool("get_confirmed_report_rows", "1.0.0", ConfirmedReportRows, "report", 2, 1, 80000, _confirmed_report_rows,
         "Rows of the customer's own confirmed report; never unconfirmed OCR."),
    Tool("preview_booking", "1.0.0", PreviewBooking, "catalog", 2, 1, 20000, _preview_booking,
         "Unconfirmed quotation or appointment preview from catalog prices. Creates nothing."),
    Tool("get_external_hospital_offer", "1.0.0", HospitalOffer, "catalog", 2, 20, 20000, _hospital_offer,
         "Reviewed official hospital offers (flag HOSPITAL_LINKS_ENABLED). Not booking, partnership or clinical evidence."),
]}


def describe() -> list[dict]:
    """Schemas for documentation and the staff view."""
    return [{"name": t.name, "version": t.version, "scope": t.scope, "timeout_seconds": t.timeout_seconds,
             "max_items": t.max_items, "max_chars": t.max_chars, "description": t.description,
             "input_schema": t.arguments.model_json_schema()} for t in TOOLS.values()]


def _limit(output: dict, tool: Tool) -> tuple[dict, bool, int, int]:
    truncated = False
    for key in ("records", "offers"):
        if isinstance(output.get(key), list) and len(output[key]) > tool.max_items:
            output[key], truncated = output[key][:tool.max_items], True
    text = json.dumps(output, ensure_ascii=False, default=str)
    if len(text) > tool.max_chars:
        raise ConversationError("tool_output_too_large", "A data lookup returned more than its limit.", 502)
    items = sum(len(output[k]) for k in ("records", "offers") if isinstance(output.get(k), list)) or (1 if output else 0)
    return output, truncated, items, len(text)


async def invoke(ctx: ToolContext, name: str, arguments: dict | None = None) -> dict:
    tool = TOOLS.get(name)
    args_json = json.dumps(arguments or {}, ensure_ascii=False, sort_keys=True, default=str)
    entry = {"tool": name, "version": tool.version if tool else None, "scope": tool.scope if tool else None,
             "role": ctx.role_id, "args_sha256": hashlib.sha256(args_json.encode()).hexdigest()[:16], "ok": False}
    started = time.perf_counter()
    try:
        if tool is None:
            raise ConversationError("tool_unknown", "Unknown tool.", 500)
        if tool.scope not in ctx.scopes:
            raise ConversationError("tool_forbidden", "This assistant role cannot use that data.", 403)
        try:
            parsed = tool.arguments.model_validate(arguments or {})
        except ValidationError:
            raise ConversationError("tool_arguments_invalid", "A data lookup had invalid arguments.", 422) from None
        output = await asyncio.wait_for(tool.run(ctx, parsed), timeout=tool.timeout_seconds)
        if "records" in output:
            output = {**Records.model_validate(output).model_dump(), **{k: v for k, v in output.items() if k not in ("records", "mode")}}
        output, truncated, items, chars = _limit(output, tool)
        entry.update(ok=True, items=items, chars=chars, truncated=truncated)
        return output
    except asyncio.TimeoutError:
        entry["code"] = "tool_timeout"
        raise ConversationError("tool_timeout", "A data lookup took too long. Please try again.", 504) from None
    except ValidationError:
        entry["code"] = "tool_output_invalid"
        raise ConversationError("tool_output_invalid", "A data lookup returned invalid data.", 502) from None
    except ConversationError as exc:
        entry["code"] = exc.code
        raise
    finally:
        entry["ms"] = round((time.perf_counter() - started) * 1000, 1)
        ctx.audit.append(entry)
