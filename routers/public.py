"""Read-only public JSON (catalog, centers, sources, feature flags). No personal data, no model calls.

Every endpoint is session-free except /membership, which reports only the caller's own
organization role so a client does not have to probe with a 403.

It exposes the same catalog, centers, policies and sources the assistant reads. Feature flags are
reported as booleans so a client can hide switched-off pages; the flags themselves are changed
only by the server owner (see docs/deploy/render.md).
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from fastapi import APIRouter, Request

from config import settings
from services import business_dots, business_plans
from services import business_ops as ops
from services import business_store as db
from services.conversation_transport import ConversationError
from services.release_info import VERSION

ROOT = Path(__file__).resolve().parents[1]
router = APIRouter(prefix="/api/business/site")

SEGMENTS = [
    {"id": "core", "query": "segment=individual&review=excluded"},
    {"id": "follow", "query": "segment=individual&review=only"},
    {"id": "org", "query": "segment=organization"},
    {"id": "budget", "query": "max_price=1000&sort=price_asc"},
]

# The reviewed corpus has no publisher_type field; group its four publishers for the website.
PUBLISHER_TYPES = {
    "Siriraj Hospital": "thai_hospital",
    "Faculty of Medicine Siriraj Hospital, Mahidol University": "thai_hospital",
    "Srinagarind Hospital, KKU": "thai_hospital",
    "MedlinePlus · U.S. National Library of Medicine": "international_reference",
}


def _publisher_type(record: dict) -> str:
    return record.get("publisher_type") or PUBLISHER_TYPES.get(record.get("publisher", ""), "other")


def _sources() -> dict:
    data = json.loads((ROOT / "knowledge/evidence/catalog.json").read_text(encoding="utf-8"))
    publishers: dict[str, int] = {}
    groups: dict[str, int] = {}
    for r in data["records"]:
        publishers[r.get("publisher", "")] = publishers.get(r.get("publisher", ""), 0) + 1
        kind = _publisher_type(r)
        groups[kind] = groups.get(kind, 0) + 1
    return {"version": data.get("version", ""), "records": data["records"], "publishers": publishers, "publisher_types": groups}


def _plans() -> dict:
    return {p["id"]: p for p in business_plans.plans()["plans"]}


def features() -> dict:
    """Which optional pages the website may show. Booleans only; nothing else is exposed."""
    return {
        "org_documents": settings.ORG_DOCUMENTS_ENABLED,
        "org_reference_inference": settings.ORG_REFERENCE_INFERENCE_ENABLED,
        "hospital_links": settings.HOSPITAL_LINKS_ENABLED,
        "landing_preview": settings.LANDING_PREVIEW_ENABLED,
    }


@router.get("/features")
async def feature_flags():
    return features()


@router.get("/common")
async def common():
    """Everything most pages need in one call: catalog, centers, policies, plans and roles."""
    src = _sources()
    return {"version": VERSION, "catalog": db.catalog(), "branches": db.branches()["branches"], "policies": db.policies(),
            "plans": _plans(), "dots": business_dots.public_roster(), "segments": SEGMENTS, "features": features(),
            "sources": {"count": len(src["records"]), "publishers": len(src["publishers"]), "publisher_types": src["publisher_types"]},
            "maps_embed_key": bool(os.getenv("GOOGLE_MAPS_EMBED_KEY")), "google_sign_in": bool(os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET"))}


@router.get("/home")
async def home():
    catalog = db.catalog()
    branches = db.branches()["branches"]
    packages = [p for p in catalog["packages"] if p.get("active", True)]
    groups = {
        "core": [p for p in packages if p["segment"] == "individual" and not p.get("staff_review_required")],
        "follow": [p for p in packages if p["segment"] == "individual" and p.get("staff_review_required")],
        "org": [p for p in packages if p["segment"] == "organization"],
        "budget": sorted([p for p in packages if p["price_thb"] < 1000], key=lambda p: p["price_thb"]),
    }
    src = _sources()
    top = sorted(src["publishers"].items(), key=lambda x: -x[1])
    return {
        "groups": groups, "counts": {k: len(v) for k, v in groups.items()}, "total": len(packages),
        "featured": next((p for p in groups["core"] if p["id"] == "P02"), groups["core"][0] if groups["core"] else None),
        "branches": branches, "policies": db.policies(), "catalog_version": catalog["version"],
        "dots": business_dots.public_roster(), "plans": _plans(), "features": features(),
        "source_count": len(src["records"]), "publisher_count": len(src["publishers"]),
        "publishers": [{"name": n, "records": c} for n, c in top], "publisher_types": src["publisher_types"],
        "capacity": sum(b["capacity_per_slot"] for b in branches),
        "ladder": sorted(groups["core"], key=lambda p: p["price_thb"]),
        "min_price": min((p["price_thb"] for p in groups["core"]), default=0),
    }


@router.get("/sources")
async def sources():
    from services.knowledge_admin import active_records
    src = _sources()
    # Records a manager paused in Admin are not searched, so they are not listed either.
    records = sorted(active_records(src["records"]), key=lambda r: (r.get("publisher", ""), r.get("title", "")))
    keep = ("id", "title", "url", "publisher", "aliases", "content", "data_class", "reviewed_at", "page", "language", "topics", "rights",
            "rag_approval", "verification_status")
    return {"version": src["version"], "publishers": src["publishers"], "publisher_types": src["publisher_types"],
            "records": [{**{k: r.get(k) for k in keep}, "publisher_type": _publisher_type(r)} for r in records]}


@router.get("/packages/{package_id}")
async def package(package_id: str):
    detail = ops.package_detail(None, package_id)
    related = [p for p in db.catalog()["packages"] if p.get("active", True) and p["id"] != package_id
               and p["segment"] == detail["package"]["segment"]][:3]
    return {**detail, "related": related}


@router.get("/compare")
async def compare(ids: str = ""):
    try:
        return {"comparison": ops.compare(None, [i.strip() for i in ids.split(",")]), "error": ""}
    except ConversationError as exc:
        return {"comparison": None, "error": str(exc), "code": exc.code}


@router.get("/hospital-links")
async def hospital_links():
    """Official external hospital pages (Codex HOSPITAL_LINKS_ENABLED). Never booking or clinical advice."""
    if not settings.HOSPITAL_LINKS_ENABLED:
        raise ConversationError("feature_disabled", "Hospital links are disabled.", 404)
    from services.hospital_links import catalog
    data = json.loads((ROOT / "business_data/hospital_links.json").read_text(encoding="utf-8"))
    return {"version": data.get("version", ""), "mode": data.get("mode", ""), "affiliation": data.get("affiliation", ""),
            "offers": catalog()}


@router.get("/membership")
async def membership(request: Request):
    """The caller's own organization role (reader/editor) or none. Never another user's data."""
    if not settings.ORG_DOCUMENTS_ENABLED:
        return {"enabled": False, "member": False, "role": ""}
    from routers.business import session_row
    with db.transaction() as tx:
        try:
            user, _ = session_row(tx, request, False)
        except ConversationError:
            return {"enabled": True, "member": False, "role": ""}
        data = user["data"]
        member = not user["id"].startswith("guest_") and bool(data.get("organization_id"))
        return {"enabled": True, "member": member, "role": data.get("organization_role", "") if member else ""}
