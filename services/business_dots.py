"""Assistant roles ("Dots") and whitelisted page commands.

A Dot is an AI role with server-enforced permissions. The planner may choose which
enabled Dot answers a turn, but this module decides what that Dot is allowed to
propose and read. Routing is automatic inside one conversation; the customer never
has to pick an agent.

Page commands are suggestions the browser renders as one-click buttons. They only
navigate or prefill; they never confirm, pay or book on their own.
"""
from __future__ import annotations

import re
from datetime import datetime

from services import business_store as db

UI_TYPES = {"open_view", "filter_catalog", "open_package", "open_compare", "prefill_booking", "open_org_form", "highlight_report_field"}
CUSTOMER_VIEWS = {"packages", "book", "bookings", "reports", "notifications"}
DEFAULT_DOT = "advisor"


def roster(tx=None) -> dict:
    return db.configuration("dots", tx)


def enabled(tx=None) -> dict[str, dict]:
    return {d["id"]: d for d in roster(tx)["dots"] if d.get("enabled", True)}


def public_roster(tx=None) -> list[dict]:
    return [{k: d[k] for k in ("id", "name", "role", "summary")} | {"enabled": d.get("enabled", True)} for d in roster(tx)["dots"]]


def choose(plan_dot: str, dots: dict[str, dict]) -> dict | None:
    if plan_dot in dots:
        return dots[plan_dot]
    if DEFAULT_DOT in dots:
        return dots[DEFAULT_DOT]
    return next(iter(dots.values()), None)


def owner_of(action: str, dots: dict[str, dict]) -> str:
    """The first enabled Dot allowed to perform an action (used for transparent re-routing)."""
    return next((d["id"] for d in dots.values() if action in d["actions"]), "")


def _valid_date(value: str) -> bool:
    try:
        datetime.strptime(value, "%Y-%m-%d")
        return True
    except (TypeError, ValueError):
        return False


def validate_ui(commands: list[dict], dot: dict, catalog: dict, branches: dict, report: dict | None) -> list[dict]:
    """Keep at most two commands this Dot may issue, with arguments checked against real data."""
    active = {p["id"]: p for p in catalog["packages"] if p.get("active", True)}
    branch_ids = {b["id"] for b in branches["branches"]}
    fields = {f.get("id") for f in (report or {}).get("fields", []) if isinstance(f, dict)}
    clean: list[dict] = []
    for raw in commands or []:
        if not isinstance(raw, dict):
            continue
        kind, args = raw.get("type"), raw.get("args") or {}
        if kind not in UI_TYPES or kind not in dot["ui"] or not isinstance(args, dict):
            continue
        if kind == "open_view" and args.get("view") in CUSTOMER_VIEWS:
            clean.append({"type": kind, "args": {"view": args["view"]}})
        elif kind == "filter_catalog":
            out = {}
            q = str(args.get("q", ""))[:80]
            if q and re.fullmatch(r"[\w\s/+\-.,()]{1,80}", q):
                out["q"] = q
            if args.get("segment") in ("individual", "organization"):
                out["segment"] = args["segment"]
            if isinstance(args.get("max_price"), int) and 0 < args["max_price"] <= 1_000_000:
                out["max_price"] = args["max_price"]
            if out:
                clean.append({"type": kind, "args": out})
        elif kind == "open_package" and args.get("package_id") in active:
            clean.append({"type": kind, "args": {"package_id": args["package_id"], "name": active[args["package_id"]]["name"]}})
        elif kind == "open_compare":
            ids = [i for i in dict.fromkeys(args.get("package_ids") or []) if i in active][:3]
            if len(ids) >= 2:
                clean.append({"type": kind, "args": {"package_ids": ids}})
        elif kind == "prefill_booking":
            pid = args.get("package_id")
            p = active.get(pid)
            if not p or p["segment"] != "individual" or p.get("staff_review_required"):
                continue
            out = {"package_id": pid, "name": p["name"]}
            if args.get("branch_id") in branch_ids and args["branch_id"] in p.get("branch_ids", []):
                out["branch_id"] = args["branch_id"]
            if _valid_date(args.get("date", "")):
                out["date"] = args["date"]
            clean.append({"type": kind, "args": out})
        elif kind == "open_org_form":
            clean.append({"type": kind, "args": {}})
        elif kind == "highlight_report_field" and args.get("field_id") in fields:
            clean.append({"type": kind, "args": {"field_id": args["field_id"]}})
        if len(clean) == 2:
            break
    return clean


def assert_no_sales(text: str, catalog: dict) -> None:
    """Fail closed if a role without sales tools names a price or a package."""
    from services.conversation_transport import ConversationError
    lowered = text.lower()
    if "฿" in text or re.search(r"\b(thb|baht)\b", lowered) or any(p["name"].lower() in lowered for p in catalog["packages"]):
        raise ConversationError("role_violation", "The answer went outside the report explainer's role and was withheld. Ask the Health-check Advisor about packages.", 502)
