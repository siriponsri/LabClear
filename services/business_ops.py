"""Business operations added for the full business web app.

Catalog search/compare, notifications from events, booking decisions, the payment
simulator, organization inquiries and integration mode metadata.

Rules owned here (never by the model or the browser):
- prices come from the canonical catalog; totals are recomputed server-side;
- payment state changes only through signed provider/simulator events that match
  the transaction amount, currency and booking;
- every simulated integration is labelled by the server, not by the client.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import time

from services import business_store as db
from services.conversation_transport import ConversationError

SIM_TXN_MINUTES = 15
ACTIVE_BOOKING_STATES = ("requested", "confirmed")

# ---------------------------------------------------------------- modes

def payment_mode() -> str:
    # With external integrations enabled and a Stripe key present, the provider path is used
    # (and rejects any non-test key). Otherwise the built-in simulator owns card/PromptPay.
    if os.getenv("BUSINESS_EXTERNAL_ENABLED") == "true" and os.getenv("STRIPE_SECRET_KEY", ""):
        return "PROVIDER_SANDBOX"
    return "SIMULATED_INTEGRATION"


def line_mode() -> str:
    if os.getenv("BUSINESS_EXTERNAL_ENABLED") == "true" and os.getenv("LINE_CHANNEL_ACCESS_TOKEN") and os.getenv("LINE_CHANNEL_SECRET"):
        return "PROVIDER_SANDBOX"
    return "SIMULATED_INTEGRATION"


def modes() -> dict:
    from config import settings
    from services.providers import runtime

    def model_state(slot: str) -> str:
        if not settings.PROVIDER_NETWORK_ENABLED:
            return "UNAVAILABLE"
        try:
            ready = runtime("llm").ready and runtime("guard").ready
        except Exception:
            ready = False
        return "LIVE_MODEL" if ready else "UNAVAILABLE"

    return {
        "business_data": {"mode": "SIMULATED_BUSINESS_DATA", "label": "Simulated packages, prices and centers"},
        "assistant": {"mode": model_state("llm"), "label": "Conversation model"},
        "payment": {"mode": payment_mode(), "label": "Payments (test only, no real money)"},
        "line": {"mode": line_mode(), "label": "LINE channel"},
        "calendar": {"mode": "SIMULATED_INTEGRATION", "label": "Center calendar and .ics export"},
        "email": {"mode": "NOT_CONNECTED", "label": "Email delivery is not connected; notifications appear in the app"},
        "maps": {"mode": "PROVIDER_SANDBOX" if os.getenv("GOOGLE_MAPS_EMBED_KEY") else "LINK_ONLY", "label": "Maps"},
        "retrieval": {"mode": "LOCAL_BM25", "label": f"Evidence search (BM25 over {_source_count()} approved records)"},
        "plans": {"mode": "SIMULATED_INTEGRATION", "label": "LabClear Plus, 355 THB for 30 days (test payment only)"},
    }


def _source_count() -> int:
    from services.evidence_search import corpus
    from services.knowledge_admin import active_records
    return len(active_records(corpus()))


# ---------------------------------------------------------------- catalog

def _matches(package: dict, query: str) -> int:
    if not query:
        return 1
    haystack = " ".join([package["name"], " ".join(package["services"]), package.get("notes", ""), package["id"]]).lower()
    terms = [t for t in query.lower().replace("/", " ").split() if t]
    score = 0
    for term in terms:
        if term not in haystack:
            return 0
        score += 3 if term in package["name"].lower() else 1
    return score


def catalog_search(tx, q: str = "", segment: str = "", branch_id: str = "", max_price: int | None = None,
                   min_price: int | None = None, review: str = "", sort: str = "featured") -> dict:
    catalog = db.catalog(tx)
    q = (q or "").strip()[:80]
    rows = []
    for order, package in enumerate(catalog["packages"]):
        if not package.get("active", True):
            continue
        score = _matches(package, q)
        if not score:
            continue
        if segment and package["segment"] != segment:
            continue
        if branch_id and branch_id not in package.get("branch_ids", []):
            continue
        if max_price is not None and package["price_thb"] > max_price:
            continue
        if min_price is not None and package["price_thb"] < min_price:
            continue
        if review == "excluded" and package.get("staff_review_required"):
            continue
        if review == "only" and not package.get("staff_review_required"):
            continue
        rows.append((score, order, package))
    keys = {
        "price_asc": lambda r: (r[2]["price_thb"], r[1]),
        "price_desc": lambda r: (-r[2]["price_thb"], r[1]),
        "name": lambda r: (r[2]["name"].lower(), r[1]),
        "relevance": lambda r: (-r[0], r[1]),
        "featured": lambda r: r[1],
    }
    rows.sort(key=keys.get(sort, keys["featured"]))
    return {"packages": [r[2] for r in rows], "total": len(rows), "catalog_version": catalog["version"],
            "is_demo": True, "applied": {"q": q, "segment": segment, "branch_id": branch_id, "max_price": max_price,
                                         "min_price": min_price, "review": review, "sort": sort if sort in keys else "featured"}}


def package_detail(tx, package_id: str) -> dict:
    catalog = db.catalog(tx)
    package = next((p for p in catalog["packages"] if p["id"] == package_id and p.get("active", True)), None)
    if not package:
        raise ConversationError("not_found", "This health check is unavailable.", 404)
    branches = [b for b in db.branches(tx)["branches"] if b["id"] in package.get("branch_ids", [])]
    return {"package": package, "branches": branches, "catalog_version": catalog["version"], "policy": db.policies(tx)}


def compare(tx, ids: list[str]) -> dict:
    ids = [i for i in dict.fromkeys(ids) if i][:3]
    if len(ids) < 2:
        raise ConversationError("compare_invalid", "Choose two or three health checks to compare.", 422)
    catalog = db.catalog(tx)
    index = {p["id"]: p for p in catalog["packages"] if p.get("active", True)}
    if any(i not in index for i in ids):
        raise ConversationError("package_invalid", "A health check in this comparison is unavailable.", 422)
    selected = [index[i] for i in ids]
    services: list[str] = []
    for package in selected:
        for service in package["services"]:
            if service not in services:
                services.append(service)
    cheapest = min(p["price_thb"] for p in selected)
    return {
        "packages": selected,
        "services": [{"name": s, "included": [s in p["services"] for p in selected]} for s in services],
        "price_difference": [p["price_thb"] - cheapest for p in selected],
        "catalog_version": catalog["version"], "is_demo": True,
    }

# ---------------------------------------------------------------- notifications

def notify(tx, audience: str, title: str, body: str, ref: str = "", link: str = "") -> dict:
    return tx.put("notice_" + secrets.token_hex(12), "notification", audience,
                  {"title": title[:140], "body": body[:500], "ref": ref, "link": link, "at": time.time()}, "unread")


def notify_staff(tx, branch: str, title: str, body: str, ref: str = "", link: str = "") -> dict:
    return notify(tx, "staff:" + (branch or "all"), title, body, ref, link)


def staff_audiences(tx, user: dict) -> list[str]:
    if user["data"].get("role") == "manager":
        return ["staff:all"] + ["staff:" + b["id"] for b in db.branches(tx)["branches"]]
    return ["staff:all", "staff:" + (user["data"].get("branch") or "all")]


def list_notifications(tx, audiences: list[str], limit: int = 50) -> dict:
    rows = [r for a in audiences for r in tx.find("notification", a)]
    rows.sort(key=lambda r: r["data"]["at"], reverse=True)
    rows = rows[:limit]
    return {"notifications": [{"id": r["id"], "state": r["state"], **r["data"]} for r in rows],
            "unread": sum(r["state"] == "unread" for r in rows)}


def mark_read(tx, audiences: list[str], ids: list[str] | None) -> int:
    count = 0
    for audience in audiences:
        for row in tx.find("notification", audience, "unread"):
            if ids is None or row["id"] in ids:
                tx.put(row["id"], "notification", audience, row["data"], "read")
                count += 1
    return count

# ---------------------------------------------------------------- capacity

def used_capacity(tx, branch_id: str, date: str, time_: str, exclude: str = "") -> int:
    return sum(1 for x in tx.find("booking")
               if x["id"] != exclude and not x["data"].get("organization") and x["branch"] == branch_id
               and x["state"] in ACTIVE_BOOKING_STATES and x["data"]["date"] == date and x["data"]["time"] == time_)


def branch(tx, branch_id: str) -> dict | None:
    return next((b for b in db.branches(tx)["branches"] if b["id"] == branch_id), None)

# ---------------------------------------------------------------- payment simulator

def _sim_secret() -> bytes:
    return db.derived_secret("payment-simulator")


def sim_sign(raw: bytes, stamp: int | None = None) -> str:
    stamp = int(stamp or time.time())
    mac = hmac.new(_sim_secret(), str(stamp).encode() + b"." + raw, hashlib.sha256).hexdigest()
    return f"t={stamp},v1={mac}"


def sim_verify(raw: bytes, signature: str) -> dict:
    try:
        fields = dict(p.split("=", 1) for p in signature.split(","))
        stamp = int(fields["t"])
        expected = hmac.new(_sim_secret(), str(stamp).encode() + b"." + raw, hashlib.sha256).hexdigest()
        valid = abs(time.time() - stamp) <= 300 and hmac.compare_digest(expected, fields.get("v1", ""))
    except (KeyError, ValueError):
        valid = False
    if not valid:
        raise ConversationError("signature_invalid", "Invalid simulator signature.", 400)
    try:
        event = json.loads(raw)
    except ValueError:
        raise ConversationError("payload_invalid", "Invalid simulator payload.", 400) from None
    if not isinstance(event, dict) or not str(event.get("id", "")).startswith("simevt_"):
        raise ConversationError("payload_invalid", "Invalid simulator event.", 400)
    return event


def sim_create(tx, booking: dict, method: str) -> dict:
    """Create (or return the active) simulated transaction for a confirmed booking or a Plus order.

    The order id is kept under `booking_id` for compatibility with existing records;
    `order_kind` says whether it points at a booking or a subscription."""
    d = booking["data"]
    kind = booking["kind"]
    for txn in tx.find("payment_txn", booking["owner"]):
        if txn["data"]["booking_id"] == booking["id"] and txn["state"] == "pending":
            if txn["data"]["expires_at"] > time.time():
                if txn["data"]["method"] != method:
                    raise ConversationError("checkout_active", "Another test payment is already open for this order. Cancel it first.", 409)
                return txn
            _apply(tx, txn, {"type": "payment.expired", "id": "simevt_" + secrets.token_hex(10)}, system=True)
    amount = d["total_thb"] if kind == "booking" else d["price_thb"]
    txn = tx.put("paysim_" + secrets.token_hex(12), "payment_txn", booking["owner"], {
        "booking_id": booking["id"], "order_kind": kind, "amount_thb": amount, "currency": "THB", "method": method,
        "expires_at": time.time() + SIM_TXN_MINUTES * 60, "events": [], "mode": "SIMULATED_INTEGRATION",
        "reference": "SIM-" + secrets.token_hex(4).upper()}, "pending", booking.get("branch", ""))
    d.update(payment_provider="simulator", payment_method=method, active_txn=txn["id"])
    tx.put(booking["id"], kind, booking["owner"], d, booking["state"], booking.get("branch", ""))
    tx.audit(booking["owner"], "payment.sim_created", txn["id"])
    return txn


def sim_event_payload(txn: dict, outcome: str, amount_thb: int | None = None) -> bytes:
    kinds = {"success": "payment.succeeded", "failure": "payment.failed", "expire": "payment.expired",
             "cancel": "payment.cancelled", "refund": "payment.refunded"}
    if outcome not in kinds:
        raise ConversationError("outcome_invalid", "Unknown simulator outcome.", 422)
    event = {"id": "simevt_" + secrets.token_hex(10), "type": kinds[outcome], "txn_id": txn["id"],
             "booking_id": txn["data"]["booking_id"], "amount_satang": (txn["data"]["amount_thb"] if amount_thb is None else amount_thb) * 100,
             "currency": "thb", "created": int(time.time())}
    return json.dumps(event, separators=(",", ":")).encode()


TRANSITIONS = {
    "payment.succeeded": ({"pending"}, "succeeded"),
    "payment.failed": ({"pending"}, "failed"),
    "payment.expired": ({"pending"}, "expired"),
    "payment.cancelled": ({"pending"}, "cancelled"),
    "payment.refunded": ({"succeeded"}, "refunded"),
}


def _apply(tx, txn: dict, event: dict, system: bool = False) -> dict:
    allowed, target = TRANSITIONS[event["type"]]
    if txn["state"] not in allowed:
        raise ConversationError("payment_state", f"A {txn['state']} test payment cannot become {target}.", 409)
    booking = tx.get(txn["data"]["booking_id"])
    if not booking or booking["kind"] != txn["data"].get("order_kind", "booking"):
        raise ConversationError("payment_mismatch", "Payment does not match an active order.", 409)
    bd = booking["data"]
    txn["data"]["events"] = (txn["data"]["events"] + [{"id": event["id"], "type": event["type"], "at": time.time()}])[-20:]
    tx.put(txn["id"], "payment_txn", txn["owner"], txn["data"], target, txn["branch"])
    if booking["kind"] == "subscription":
        from services import business_plans
        business_plans.apply_payment(tx, booking, target, tx.get(txn["id"]))
        tx.put("simevent_" + db.digest(event["id"]), "payment_event", "system", {"type": event["type"], "txn_id": txn["id"]}, "processed")
        tx.audit("payment-simulator", event["type"], txn["id"])
        return tx.get(txn["id"])
    if target == "succeeded":
        if booking["state"] == "cancelled" or bd.get("payment_status") in ("refunded", "refund_pending"):
            from routers.business import ticket_create
            ticket_create(tx, booking["owner"], "Test payment received for a cancelled or refunded appointment. Staff resolution required.", pause_bot=False)
        else:
            bd.update(payment_status="paid", payment_reference=txn["data"]["reference"], receipt_id="sim-receipt-" + secrets.token_hex(6))
        notify(tx, booking["owner"], "Test payment received", f"{txn['data']['amount_thb']:,} THB was recorded by the payment simulator. No real money moved.", booking["id"], "/app?view=bookings")
        notify_staff(tx, booking["branch"], "Test payment received", f"Appointment {booking['id'][-8:]} is paid (simulation).", booking["id"])
    elif target in ("failed", "expired", "cancelled"):
        if bd.get("active_txn") == txn["id"]:
            bd["active_txn"] = ""
        bd["last_payment_outcome"] = target
        notify(tx, booking["owner"], "Test payment " + target, "You can start a new test payment or choose pay at center.", booking["id"], "/app?view=bookings")
    elif target == "refunded":
        bd.update(payment_status="refunded", refund_reference="sim-refund-" + secrets.token_hex(6))
        notify(tx, booking["owner"], "Refund recorded", "The simulated refund is complete. No real money moved.", booking["id"], "/app?view=bookings")
    tx.put(booking["id"], "booking", booking["owner"], bd, booking["state"], booking["branch"])
    tx.put("simevent_" + db.digest(event["id"]), "payment_event", "system", {"type": event["type"], "txn_id": txn["id"]}, "processed")
    tx.audit("payment-simulator", event["type"], txn["id"])
    return tx.get(txn["id"])


def sim_apply(raw: bytes, signature: str) -> dict:
    event = sim_verify(raw, signature)
    if event.get("type") not in TRANSITIONS:
        raise ConversationError("payload_invalid", "Unsupported simulator event.", 400)
    with db.transaction() as tx:
        if tx.get("simevent_" + db.digest(event["id"])):
            return {"received": True, "duplicate": True}
        txn = tx.get(str(event.get("txn_id", "")))
        if not txn or txn["kind"] != "payment_txn" or txn["data"]["booking_id"] != event.get("booking_id"):
            raise ConversationError("payment_mismatch", "Payment does not match an active order.", 409)
        if event.get("currency") != "thb" or event.get("amount_satang") != txn["data"]["amount_thb"] * 100:
            raise ConversationError("payment_mismatch", "Payment amount or currency does not match the order.", 409)
        if event["type"] == "payment.succeeded" and txn["data"]["expires_at"] < time.time():
            _apply(tx, txn, {"type": "payment.expired", "id": "simevt_" + secrets.token_hex(10)}, system=True)
            return {"received": True, "state": "expired"}
        txn = _apply(tx, txn, event)
        return {"received": True, "state": txn["state"]}


def sim_view(tx, txn: dict) -> dict:
    """Lazily expire a pending transaction, then return a public view."""
    if txn["state"] == "pending" and txn["data"]["expires_at"] < time.time():
        txn = _apply(tx, txn, {"type": "payment.expired", "id": "simevt_" + secrets.token_hex(10)}, system=True)
    d = txn["data"]
    return {"id": txn["id"], "state": txn["state"], "booking_id": d["booking_id"], "order_kind": d.get("order_kind", "booking"), "amount_thb": d["amount_thb"],
            "currency": d["currency"], "method": d["method"], "expires_at": d["expires_at"], "reference": d["reference"],
            "mode": "SIMULATED_INTEGRATION", "events": d["events"]}
