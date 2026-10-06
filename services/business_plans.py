"""Lab-report plans: Free and LabClear Plus (355 THB for 30 days, simulated payment).

The server owns entitlements. Free accounts get one AI report reading of one image; Plus
removes the one-report limit, reads up to three pages or images at once and unlocks the
lab dashboard (results over time). Payment uses the same signed simulator as appointments;
no real money moves and nothing renews automatically.
"""
from __future__ import annotations

import json
import re
import secrets
import time
from datetime import datetime
from pathlib import Path

from services import business_store as db
from services.conversation_transport import ConversationError

ROOT = Path(__file__).resolve().parents[1]


def plans() -> dict:
    return json.loads((ROOT / "business_data/plans.json").read_text(encoding="utf-8"))


def plan(plan_id: str) -> dict:
    found = next((p for p in plans()["plans"] if p["id"] == plan_id), None)
    if not found:
        raise ConversationError("plan_unknown", "Unknown plan.", 404)
    return found


def _subscriptions(tx, owner: str) -> list[dict]:
    return sorted(tx.find("subscription", owner), key=lambda s: s["created"])


def current(tx, owner: str) -> dict | None:
    """The newest subscription, expired lazily when its period has ended."""
    subs = _subscriptions(tx, owner)
    if not subs:
        return None
    sub = subs[-1]
    if sub["state"] == "active" and sub["data"].get("period_end", 0) < time.time():
        sub = tx.put(sub["id"], "subscription", owner, sub["data"], "expired")
        tx.audit("system", "subscription.expired", sub["id"])
    return sub


def entitlement(tx, owner: str) -> dict:
    sub = current(tx, owner)
    active = bool(sub and sub["state"] == "active")
    p = plan("plus" if active else "free")
    used = (tx.get(owner) or {}).get("data", {}).get("ai_reads_used", 0)
    limits = p["limits"]
    return {
        "plan": p["id"], "plan_name": p["name"], "active": active,
        "period_end": sub["data"].get("period_end") if active else None,
        "ai_reads_used": used, "ai_reads_limit": limits["ai_reads"],
        "images_per_read": limits["images_per_read"], "trends": limits["trends"],
        "can_read": limits["ai_reads"] is None or used < limits["ai_reads"],
        "subscription": view(sub) if sub else None, "mode": "SIMULATED_INTEGRATION",
    }


def require_read(tx, owner: str, images: int) -> dict:
    ent = entitlement(tx, owner)
    if images > ent["images_per_read"]:
        raise ConversationError("subscription_required", f"Reading {images} pages or images at once needs LabClear Plus. The Free plan reads one image.", 402)
    if not ent["can_read"]:
        raise ConversationError("subscription_required", "Your free AI report reading has been used. LabClear Plus reads more reports and shows them over time.", 402)
    return ent


def count_read(tx, owner: str) -> None:
    u = tx.get(owner)
    if u and u["kind"] == "user":
        u["data"]["ai_reads_used"] = u["data"].get("ai_reads_used", 0) + 1
        tx.put(owner, "user", owner, u["data"])


def uncount_read(tx, owner: str) -> None:
    """Return a reserved reading when the reader failed before producing a draft."""
    u = tx.get(owner)
    if u and u["kind"] == "user" and u["data"].get("ai_reads_used", 0) > 0:
        u["data"]["ai_reads_used"] -= 1
        tx.put(owner, "user", owner, u["data"])


def view(sub: dict) -> dict:
    d = sub["data"]
    return {"id": sub["id"], "state": sub["state"], "plan": d["plan"], "price_thb": d["price_thb"], "period_days": d["period_days"],
            "period_start": d.get("period_start"), "period_end": d.get("period_end"), "payment_status": d.get("payment_status"),
            "active_txn": d.get("active_txn", ""), "renewals": d.get("renewals", 0), "mode": "SIMULATED_INTEGRATION"}


def start_checkout(tx, owner: str, method: str) -> dict:
    """Open (or reuse) a pending Plus order; activation happens only on a signed success event."""
    u = tx.get(owner)
    if not u or not (u["data"].get("password") or u["data"].get("line_verified")):
        raise ConversationError("account_required", "Create an account or sign in before subscribing.", 409)
    p = plan("plus")
    sub = current(tx, owner)
    if sub and sub["state"] == "active" and sub["data"]["period_end"] - time.time() > 7 * 86400:
        raise ConversationError("subscription_active", "Plus is already active. You can renew in the last 7 days of the period.", 409)
    pending = next((s for s in _subscriptions(tx, owner) if s["state"] == "pending"), None)
    if not pending:
        renewing_from = sub["id"] if sub and sub["state"] == "active" else ""
        pending = tx.put("sub_" + secrets.token_hex(12), "subscription", owner, {
            "plan": p["id"], "price_thb": p["price_thb"], "period_days": p["period_days"], "payment_status": "pending",
            "renews": renewing_from, "requested_at": time.time()}, "pending")
        tx.audit(owner, "subscription.requested", pending["id"])
    return pending


def apply_payment(tx, sub: dict, target: str, txn: dict) -> None:
    """Called by the payment simulator when a Plus order's test payment changes state."""
    from services.business_ops import notify
    d = sub["data"]
    if target == "succeeded":
        now = time.time()
        base = now
        prev = tx.get(d.get("renews", "")) if d.get("renews") else None
        if prev and prev["state"] == "active" and prev["data"].get("period_end", 0) > now:
            base = prev["data"]["period_end"]  # renewing early keeps the remaining days
            tx.put(prev["id"], "subscription", prev["owner"], prev["data"], "renewed")
        d.update(payment_status="paid", period_start=now, period_end=base + d["period_days"] * 86400, active_txn="",
                 payment_reference=txn["data"]["reference"])
        tx.put(sub["id"], "subscription", sub["owner"], d, "active")
        notify(tx, sub["owner"], "LabClear Plus is active", "Plus runs until " + datetime.fromtimestamp(d["period_end"]).strftime("%d %b %Y") + ". Test payment, no real money moved.", sub["id"], "/app?view=plan")
    elif target in ("failed", "expired", "cancelled"):
        d.update(active_txn="", last_payment_outcome=target)
        tx.put(sub["id"], "subscription", sub["owner"], d, sub["state"])
        notify(tx, sub["owner"], "Plus payment " + target, "Your plan did not change. You can try the test payment again.", sub["id"], "/app?view=plan")
    elif target == "refunded":
        d.update(payment_status="refunded", period_end=time.time())
        tx.put(sub["id"], "subscription", sub["owner"], d, "cancelled")
        notify(tx, sub["owner"], "Plus refunded", "The simulated refund is complete and Plus has ended.", sub["id"], "/app?view=plan")


# ------------------------------------------------------------ lab dashboard and Lab Report

_NUM = re.compile(r"^\s*[<>≤≥]?\s*(-?\d+(?:[.,]\d+)?)")


def number(value: str) -> float | None:
    m = _NUM.match(str(value or "").replace(",", ""))
    return float(m.group(1)) if m else None


def _key(name: str, unit: str) -> str:
    return re.sub(r"[^a-z0-9ก-๙]+", " ", (name or "").lower()).strip() + "|" + (unit or "").strip().lower()


def _date(r: dict) -> str:
    return r["data"].get("collected_date") or datetime.fromtimestamp(r["created"]).strftime("%Y-%m-%d")


def confirmed_reports(tx, owner: str) -> list[dict]:
    reps = [r for r in tx.find("report", owner) if r["data"].get("confirmed")]
    return sorted(reps, key=lambda r: (_date(r), r["created"]))


def lab_report(tx, owner: str, report_id: str) -> dict:
    """Structured Lab Report for one confirmed report. Status values come from the confirmed fields
    (computed by Python at normalisation), never from a model."""
    r = tx.own(report_id, owner, "report")
    if not r["data"].get("confirmed"):
        raise ConversationError("unconfirmed", "Check and confirm the report fields first.", 409)
    rows = [{k: f.get(k, "") for k in ("id", "name", "value", "unit", "reference", "printed_flag", "status")} for f in r["data"]["fields"]]
    counts = {s: sum(1 for x in rows if x["status"] == s) for s in ("within", "high", "low", "unknown")}
    previous = None
    if entitlement(tx, owner)["trends"]:
        earlier = [x for x in confirmed_reports(tx, owner) if x["id"] != r["id"] and _date(x) <= _date(r)]
        if earlier:
            prev = earlier[-1]; prev_rows = {_key(f.get("name"), f.get("unit")): f for f in prev["data"]["fields"]}
            previous = {"report_id": prev["id"], "label": prev["data"].get("label", ""), "date": _date(prev)}
            for x in rows:
                p = prev_rows.get(_key(x["name"], x["unit"]))
                if p:
                    a, b = number(p.get("value")), number(x["value"])
                    x["previous"] = {"value": p.get("value"), "status": p.get("status"), "change": round(b - a, 4) if a is not None and b is not None else None}
    return {"id": r["id"], "label": r["data"].get("label", "My report"), "date": _date(r), "generated_at": time.time(),
            "rows": rows, "counts": counts, "previous": previous, "trends": previous is not None,
            "note": "Values and ranges are exactly as printed on your report and confirmed by you. Status compares each value with the range printed on the same report. This is not a diagnosis."}


def trends(tx, owner: str) -> dict:
    ent = entitlement(tx, owner)
    reps = confirmed_reports(tx, owner)
    if not ent["trends"]:
        raise ConversationError("subscription_required", "The lab dashboard over time is part of LabClear Plus.", 402)
    series: dict[str, dict] = {}
    for r in reps:
        for f in r["data"]["fields"]:
            k = _key(f.get("name"), f.get("unit"))
            s = series.setdefault(k, {"key": k, "name": f.get("name", ""), "unit": f.get("unit", ""), "points": []})
            s["points"].append({"report_id": r["id"], "date": _date(r), "value": f.get("value", ""), "number": number(f.get("value")),
                                "reference": f.get("reference", ""), "status": f.get("status", "unknown")})
    out = []
    for s in series.values():
        pts = s["points"]; last = pts[-1]; prev = pts[-2] if len(pts) > 1 else None
        change = round(last["number"] - prev["number"], 4) if prev and last["number"] is not None and prev["number"] is not None else None
        out.append({**s, "latest": last, "previous": prev, "change": change, "count": len(pts)})
    out.sort(key=lambda s: (-s["count"], s["latest"]["status"] not in ("high", "low"), s["name"].lower()))
    return {"reports": [{"id": r["id"], "label": r["data"].get("label", ""), "date": _date(r)} for r in reps], "tests": out}
