"""Business API additions: catalog search/compare, decisions, notifications,
organization inquiries, documents, payment simulator and LINE simulator.

All routes reuse the session, CSRF, ownership and role checks of routers.business.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime

from fastapi import APIRouter, Request
from fastapi.responses import Response
from pydantic import Field

from routers.business import (TZ, ConversationError, Strict, conversation, msg, session_row, staff,
                              staff_ticket, ticket_create)
from services import business_documents as documents
from services import business_ops as ops
from services import business_store as db

router = APIRouter(prefix="/api/business")


# ------------------------------------------------------------ catalog (public)

@router.get("/catalog/search")
async def catalog_search(q: str = "", segment: str = "", branch_id: str = "", max_price: int | None = None,
                         min_price: int | None = None, review: str = "", sort: str = "featured"):
    if segment not in ("", "individual", "organization") or review not in ("", "excluded", "only"):
        raise ConversationError("filter_invalid", "Unknown filter value.", 422)
    return ops.catalog_search(None, q, segment, branch_id, max_price, min_price, review, sort)


@router.get("/catalog/compare")
async def catalog_compare(ids: str = ""):
    return ops.compare(None, [i.strip() for i in ids.split(",")])


@router.get("/catalog/{package_id}")
async def catalog_detail(package_id: str):
    return ops.package_detail(None, package_id)


@router.get("/modes")
async def integration_modes():
    return {"modes": ops.modes(), "is_demo": True}


@router.get("/dots")
async def dots_roster():
    from services import business_dots
    return {"dots": business_dots.public_roster(), "routing": "automatic", "is_demo": True}


class DotToggle(Strict):
    enabled: bool


@router.put("/staff/dots/{dot_id}")
async def toggle_dot(dot_id: str, body: DotToggle, request: Request):
    from services import business_dots
    with db.transaction() as tx:
        user = staff(tx, request)
        if user["data"]["role"] != "manager":
            raise ConversationError("forbidden", "Manager access required.", 403)
        config = business_dots.roster(tx)
        dot = next((d for d in config["dots"] if d["id"] == dot_id), None)
        if not dot:
            raise ConversationError("not_found", "Unknown assistant role.", 404)
        dot["enabled"] = body.enabled
        config["version"] = "edited-" + secrets.token_hex(6)
        tx.put("configuration_dots", "configuration", "system", config)
        tx.audit(user["id"], "dot." + ("enabled" if body.enabled else "disabled"), dot_id)
        return {"dots": business_dots.public_roster(tx), "version": config["version"]}


@router.get("/staff/budget")
async def budget_status(request: Request):
    from config import settings
    from services import cost_ledger
    with db.transaction() as tx:
        user = staff(tx, request)
        if user["data"]["role"] != "manager":
            raise ConversationError("forbidden", "Manager access required.", 403)
    return {"cost": cost_ledger.status(), "network_enabled": settings.PROVIDER_NETWORK_ENABLED,
            "call_cycle": settings.PROVIDER_BUDGET_CYCLE_ID or None,
            "call_limits": {"llm": settings.PROVIDER_BUDGET_LLM_LIMIT, "ocr": settings.PROVIDER_BUDGET_OCR_LIMIT},
            "hosted_calls": __import__("services.conversation_transport", fromlist=["durable_call_status"]).durable_call_status()}


# ------------------------------------------------------------ notifications

class ReadNotices(Strict):
    ids: list[str] | None = Field(default=None, max_length=100)


def _audiences(tx, request, mutation: bool) -> list[str]:
    user, _ = session_row(tx, request, mutation)
    if request.url.path.endswith("/staff/notifications") or request.url.path.endswith("/staff/notifications/read"):
        if user["data"].get("role") not in ("staff", "manager", "clinical"):
            raise ConversationError("forbidden", "Staff access required.", 403)
        return ops.staff_audiences(tx, user)
    return [user["id"]]


@router.get("/notifications")
@router.get("/staff/notifications")
async def notifications(request: Request):
    with db.transaction() as tx:
        return ops.list_notifications(tx, _audiences(tx, request, False))


@router.post("/notifications/read")
@router.post("/staff/notifications/read")
async def notifications_read(body: ReadNotices, request: Request):
    with db.transaction() as tx:
        return {"updated": ops.mark_read(tx, _audiences(tx, request, True), body.ids)}


# ------------------------------------------------------------ booking decisions

class Decision(Strict):
    decision: str = Field(pattern="^(confirm|decline)$")
    note: str = Field(default="", max_length=500)


@router.post("/staff/bookings/{booking_id}/decision")
async def booking_decision(booking_id: str, body: Decision, request: Request):
    with db.transaction() as tx:
        user = staff(tx, request)
        booking = tx.get(booking_id)
        if not booking or booking["kind"] != "booking" or (user["data"]["role"] != "manager" and booking["branch"] != user["data"].get("branch")):
            raise ConversationError("not_found", "Booking unavailable.", 404)
        d = booking["data"]
        target = "confirmed" if body.decision == "confirm" else "declined"
        if booking["state"] == target:
            return booking
        if booking["state"] != "requested":
            raise ConversationError("invalid_state", f"A {booking['state']} appointment cannot be {target}.", 409)
        start = datetime.strptime(d["date"] + " " + d["time"], "%Y-%m-%d %H:%M").replace(tzinfo=TZ)
        if body.decision == "confirm" and start <= datetime.now(TZ):
            raise ConversationError("slot_past", "This slot has passed. Decline it and ask the customer to choose another time.", 409)
        d.update(decided_by=user["id"], decided_at=time.time(), decision_note=body.note)
        row = tx.put(booking_id, "booking", booking["owner"], d, target, booking["branch"])
        tx.audit(user["id"], "booking." + target, booking_id)
        if target == "confirmed":
            ops.notify(tx, booking["owner"], "Appointment confirmed",
                       f"{d['date']} at {d['time']}. You can now pay by test payment or at the center, or add it to your calendar.",
                       booking_id, "/app?view=bookings")
        else:
            ops.notify(tx, booking["owner"], "Appointment request declined",
                       (body.note or "This slot could not be confirmed.") + " Choose another time or contact our team.",
                       booking_id, "/app?view=bookings")
        return row


@router.get("/bookings/{booking_id}/calendar.ics")
async def booking_calendar(booking_id: str, request: Request):
    with db.transaction() as tx:
        user, _ = session_row(tx, request, False)
        booking = tx.own(booking_id, user["id"], "booking")
        if booking["state"] != "confirmed":
            raise ConversationError("not_confirmed", "Calendar files are available after confirmation.", 409)
        branch = ops.branch(tx, booking["branch"]) or {"name": booking["branch"], "area": ""}
        body = documents.appointment_ics(booking, branch)
    return Response(body, media_type="text/calendar; charset=utf-8", headers={
        "Content-Disposition": f'attachment; filename="labclear-{booking_id[-8:]}.ics"', "Cache-Control": "no-store"})


# ------------------------------------------------------------ organization inquiries and quotes

class Inquiry(Strict):
    organization: str = Field(min_length=2, max_length=160)
    contact_name: str = Field(min_length=2, max_length=120)
    headcount: int = Field(ge=20, le=10000)
    service_mode: str = Field(pattern="^(center|onsite)$")
    branch_id: str = Field(min_length=3, max_length=10)
    preferred_date: str = Field(default="", max_length=10)
    package_ids: list[str] = Field(default_factory=list, max_length=3)
    notes: str = Field(default="", max_length=1000)


@router.post("/organizations/inquiries")
async def organization_inquiry(body: Inquiry, request: Request):
    with db.transaction() as tx:
        user, _ = session_row(tx, request)
        if not user["data"].get("password"):
            raise ConversationError("account_required", "Create an account or sign in so you can follow your quotation.", 409)
        if not ops.branch(tx, body.branch_id):
            raise ConversationError("branch_invalid", "Choose one of our centers.", 422)
        if body.preferred_date:
            try:
                if datetime.strptime(body.preferred_date, "%Y-%m-%d").date() <= datetime.now(TZ).date():
                    raise ValueError
            except ValueError:
                raise ConversationError("date_invalid", "Choose a future preferred date (YYYY-MM-DD).", 422) from None
        org_ids = {p["id"] for p in db.catalog(tx)["packages"] if p["segment"] == "organization" and p.get("active", True)}
        if any(i not in org_ids for i in body.package_ids):
            raise ConversationError("package_invalid", "Choose organization packages only.", 422)
        inquiry = tx.put("inquiry_" + secrets.token_hex(12), "org_inquiry", user["id"], {**body.model_dump(), "email": user["data"]["email"], "at": time.time()}, "submitted", body.branch_id)
        summary = f"Organization inquiry: {body.organization}, {body.headcount} people, {'onsite' if body.service_mode == 'onsite' else 'at center'}"
        ticket = ticket_create(tx, user["id"], summary, pause_bot=False, extra={"inquiry_id": inquiry["id"], "branch_id": body.branch_id, "topic": "organization"})
        inquiry["data"]["ticket_id"] = ticket["id"]
        tx.put(inquiry["id"], "org_inquiry", user["id"], inquiry["data"], "submitted", body.branch_id)
        tx.audit(user["id"], "organization.inquiry", inquiry["id"])
        ops.notify(tx, user["id"], "Organization request received",
                   "Our coordinators will prepare a quotation. You will see it in My appointments.", inquiry["id"], "/app?view=bookings")
        return {"inquiry": tx.get(inquiry["id"]), "ticket_id": ticket["id"]}


@router.get("/organizations/inquiries")
async def my_inquiries(request: Request):
    with db.transaction() as tx:
        user, _ = session_row(tx, request, False)
        return {"inquiries": tx.find("org_inquiry", user["id"])}


@router.get("/staff/tickets/{ticket_id}/inquiry")
async def ticket_inquiry(ticket_id: str, request: Request):
    with db.transaction() as tx:
        _, ticket = staff_ticket(tx, request, ticket_id)
        inquiry = tx.get(ticket["data"].get("inquiry_id", "")) if ticket["data"].get("inquiry_id") else None
        quotes = [q for q in tx.find("corporate_quote", ticket["owner"]) if q["data"].get("ticket_id") == ticket_id]
        return {"inquiry": inquiry, "quotes": quotes}


@router.get("/quotes/{quote_id}/document.pdf")
async def quote_document(quote_id: str, request: Request):
    with db.transaction() as tx:
        user, _ = session_row(tx, request, False)
        quote = tx.get(quote_id)
        is_staff = user["data"].get("role") in ("staff", "manager", "clinical")
        allowed = quote and quote["kind"] == "corporate_quote" and (
            quote["owner"] == user["id"] or (is_staff and (user["data"]["role"] == "manager" or quote["branch"] == user["data"].get("branch"))))
        if not allowed:
            raise ConversationError("not_found", "This quotation is unavailable.", 404)
        branch = ops.branch(tx, quote["branch"]) or {"name": quote["branch"]}
        body = documents.quotation_pdf(quote, branch["name"])
    return Response(body, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="labclear-quotation-{quote_id[-8:]}-v{quote["data"].get("version", 1)}.pdf"',
        "Cache-Control": "no-store"})


# ------------------------------------------------------------ payment simulator

class SimOutcome(Strict):
    outcome: str = Field(pattern="^(success|failure|expire|cancel)$")


@router.get("/payments/simulator/{txn_id}")
async def sim_status(txn_id: str, request: Request):
    with db.transaction() as tx:
        user, _ = session_row(tx, request, False)
        txn = tx.own(txn_id, user["id"], "payment_txn")
        return ops.sim_view(tx, txn)


@router.post("/payments/simulator/{txn_id}/events")
async def sim_trigger(txn_id: str, body: SimOutcome, request: Request):
    """The simulator panel acts as the payer's test bank app and sends a signed event."""
    with db.transaction() as tx:
        user, _ = session_row(tx, request)
        txn = tx.own(txn_id, user["id"], "payment_txn")
        if body.outcome == "expire" and txn["state"] == "pending":
            txn["data"]["expires_at"] = time.time() - 1
            tx.put(txn["id"], "payment_txn", txn["owner"], txn["data"], txn["state"], txn["branch"])
    raw = ops.sim_event_payload(txn, body.outcome)
    result = ops.sim_apply(raw, ops.sim_sign(raw))
    with db.transaction() as tx:
        return {**result, "txn": ops.sim_view(tx, tx.get(txn_id))}


@router.post("/payments/simulator/webhook")
async def sim_webhook(request: Request):
    return ops.sim_apply(await request.body(), request.headers.get("x-simulator-signature", ""))


# ------------------------------------------------------------ LINE simulator (staff/manager)

class LineSimMessage(Strict):
    line_user_id: str = Field(pattern=r"^Usim[0-9a-f]{8,32}$")
    text: str = Field(min_length=1, max_length=2000)
    event_id: str = Field(default="", max_length=60)


@router.post("/staff/line-simulator/events")
async def line_sim_event(body: LineSimMessage, request: Request):
    """Builds a LINE-shaped webhook event, signs it with the simulator secret and feeds the
    same verify -> enqueue path as the real webhook. Delivery goes to the simulated transport."""
    with db.transaction() as tx:
        user = staff(tx, request)
        if user["data"]["role"] != "manager":
            raise ConversationError("forbidden", "Manager access required for the channel simulator.", 403)
    from services import business_integrations as integration
    event_id = body.event_id or "simline_" + secrets.token_hex(10)
    payload = {"destination": "Usimulator", "events": [{
        "type": "message", "mode": "active", "timestamp": int(time.time() * 1000), "webhookEventId": event_id,
        "source": {"type": "user", "userId": body.line_user_id}, "replyToken": "sim-" + secrets.token_hex(8),
        "message": {"type": "text", "id": str(secrets.randbelow(10**12)), "text": body.text}}]}
    raw = json.dumps(payload, separators=(",", ":")).encode()
    secret = integration.line_secret()
    signature = base64.b64encode(hmac.new(secret.encode(), raw, hashlib.sha256).digest()).decode()
    integration.enqueue_line(integration.verify_line(raw, signature))
    return {"queued": True, "event_id": event_id, "mode": ops.line_mode()}


@router.get("/staff/line-simulator/outbox")
async def line_sim_outbox(request: Request):
    with db.transaction() as tx:
        user = staff(tx, request)
        if user["data"]["role"] != "manager":
            raise ConversationError("forbidden", "Manager access required for the channel simulator.", 403)
        jobs = [{"id": j["id"], "kind": j["kind"], "state": j["state"], "error_code": j["data"].get("error_code", ""),
                 "created": j["created"]} for kind in ("line_job", "line_outbox") for j in tx.find(kind)]
        sent = [{"id": r["id"], "to": r["data"]["to"], "text": r["data"]["text"], "at": r["data"]["at"]}
                for r in tx.find("line_sim_delivery")]
        return {"jobs": jobs[-50:], "deliveries": sent[-50:], "mode": ops.line_mode()}


@router.post("/staff/line-simulator/run")
async def line_sim_run(request: Request):
    with db.transaction() as tx:
        user = staff(tx, request)
        if user["data"]["role"] != "manager":
            raise ConversationError("forbidden", "Manager access required for the channel simulator.", 403)
    from services.business_worker import once
    return await once()


# ------------------------------------------------------------ admin dashboard

def _scope(tx, user: dict, branch: str) -> set[str]:
    all_ids = {b["id"] for b in db.branches(tx)["branches"]}
    if user["data"]["role"] == "manager":
        return {branch} if branch in all_ids else all_ids
    return {user["data"].get("branch", "")}


@router.get("/staff/dashboard")
async def dashboard(request: Request, branch: str = "", days: int = 7):
    """Operational metrics computed from stored records. Money values are simulated."""
    from datetime import timedelta
    days = max(1, min(days, 30))
    with db.transaction() as tx:
        user = staff(tx, request)
        scope = _scope(tx, user, branch)
        branches = [b for b in db.branches(tx)["branches"] if b["id"] in scope]
        bookings = [b for b in tx.find("booking") if b["branch"] in scope]
        tickets = [t for t in tx.find("ticket") if t["branch"] in scope or (t["branch"] == "" and user["data"]["role"] == "manager")]
        quotes = [q for q in tx.find("corporate_quote") if q["branch"] in scope]
        txns = [t for t in tx.find("payment_txn") if t["branch"] in scope]
        now = datetime.now(TZ)
        by_state = {s: sum(b["state"] == s for b in bookings) for s in ("requested", "confirmed", "declined", "cancelled")}
        waiting = [b for b in bookings if b["state"] == "requested"]
        oldest = max((time.time() - b["data"].get("requested_at", b["created"]) for b in waiting), default=0)
        individual = [b for b in bookings if not b["data"].get("organization")]
        money = {
            "paid_thb": sum(b["data"]["total_thb"] for b in bookings if b["data"].get("payment_status") == "paid"),
            "unpaid_confirmed_thb": sum(b["data"]["total_thb"] for b in bookings if b["state"] == "confirmed" and b["data"].get("payment_status") == "pending"),
            "refunded_thb": sum(b["data"]["total_thb"] for b in bookings if b["data"].get("payment_status") == "refunded"),
            "test_payments": {s: sum(t["state"] == s for t in txns) for s in ("pending", "succeeded", "failed", "expired", "cancelled", "refunded")},
            "mode": "SIMULATED_INTEGRATION",
        }
        capacity = []
        for b in branches:
            series = []
            day = now.date()
            while len(series) < days:
                if day.weekday() != 6:
                    ds = day.strftime("%Y-%m-%d")
                    slots = 18 * b["capacity_per_slot"]
                    used = sum(1 for x in individual if x["branch"] == b["id"] and x["data"]["date"] == ds and x["state"] in ops.ACTIVE_BOOKING_STATES)
                    series.append({"date": ds, "used": used, "capacity": slots})
                day += timedelta(days=1)
            total = sum(s["capacity"] for s in series)
            capacity.append({"branch_id": b["id"], "name": b["name"], "capacity_per_slot": b["capacity_per_slot"], "days": series,
                             "utilization": round(sum(s["used"] for s in series) / total, 4) if total else 0})
        responded = [t["data"]["first_response_at"] - t["created"] for t in tickets if t["data"].get("first_response_at")]
        responded.sort()
        median = responded[len(responded) // 2] if responded else None
        funnel = {"requested": len(individual), "confirmed": sum(b["state"] == "confirmed" for b in individual),
                  "paid": sum(b["data"].get("payment_status") == "paid" for b in individual)}
        dots = {}
        if user["data"]["role"] == "manager":
            for c in tx.find("conversation"):
                for m in c["data"].get("messages", []):
                    if m.get("role") == "assistant" and isinstance(m.get("dot"), dict):
                        dots[m["dot"]["name"]] = dots.get(m["dot"]["name"], 0) + 1
                    if m.get("failed"):
                        dots["Unanswered turns"] = dots.get("Unanswered turns", 0) + 1
        lab = None
        if user["data"]["role"] == "manager" and not branch:
            # The lab-report product is not tied to a center: one company-wide block for managers.
            subs = tx.find("subscription")
            plus_txns = [t for t in tx.find("payment_txn") if t["data"].get("order_kind") == "subscription"]
            lab = {"plus_active": sum(1 for x in subs if x["state"] == "active" and x["data"].get("period_end", 0) > time.time()),
                   "plus_revenue_thb": sum(t["data"]["amount_thb"] for t in plus_txns if t["state"] == "succeeded"),
                   "plus_refunded_thb": sum(t["data"]["amount_thb"] for t in plus_txns if t["state"] == "refunded"),
                   "ai_reads": sum(u["data"].get("ai_reads_used", 0) for u in tx.find("user")),
                   "reports_confirmed": sum(1 for r in tx.find("report") if r["data"].get("confirmed")),
                   "price_thb": 355, "mode": "SIMULATED_INTEGRATION"}
        return {
            "generated_at": time.time(), "scope": sorted(scope), "role": user["data"]["role"], "days": days,
            "bookings": {"by_state": by_state, "awaiting_oldest_minutes": round(oldest / 60), "upcoming_confirmed": sum(
                1 for b in bookings if b["state"] == "confirmed" and b["data"]["date"] >= now.strftime("%Y-%m-%d"))},
            "funnel": funnel, "money": money, "capacity": capacity,
            "tickets": {"open": sum(t["state"] != "closed" for t in tickets), "waiting": sum(t["state"] == "waiting" for t in tickets),
                        "with_staff": sum(t["state"] == "staff" for t in tickets), "median_first_response_minutes": None if median is None else round(median / 60, 1)},
            "quotes": {s: sum(q["state"] == s for q in quotes) for s in ("offered", "accepted", "superseded")} | {
                "accepted_thb": sum(q["data"]["total_thb"] for q in quotes if q["state"] == "accepted")},
            "assistant": dots, "lab_reports": lab, "is_demo": True,
        }


@router.get("/staff/audit")
async def audit_log(request: Request, limit: int = 100):
    with db.transaction() as tx:
        user = staff(tx, request)
        if user["data"]["role"] != "manager":
            raise ConversationError("forbidden", "Manager access required.", 403)
        rows = sorted(tx.find("audit"), key=lambda r: r["created"], reverse=True)[:max(1, min(limit, 300))]
        users = {}
        out = []
        for r in rows:
            actor = r["owner"]
            if actor not in users:
                u = tx.get(actor)
                users[actor] = (u["data"].get("role", "customer") if u and u["kind"] == "user" else actor.split("_")[0]) if actor else "system"
            out.append({"at": r["created"], "actor_role": users[actor], "actor": actor[-6:], "action": r["data"]["action"], "object": r["data"]["object_id"][-10:]})
        return {"events": out}


class BranchEdit(Strict):
    capacity_per_slot: int = Field(ge=1, le=20)


@router.put("/staff/branches/{branch_id}")
async def edit_branch(branch_id: str, body: BranchEdit, request: Request):
    with db.transaction() as tx:
        user = staff(tx, request)
        if user["data"]["role"] != "manager":
            raise ConversationError("forbidden", "Manager access required.", 403)
        config = db.branches(tx)
        b = next((x for x in config["branches"] if x["id"] == branch_id), None)
        if not b:
            raise ConversationError("not_found", "Unknown center.", 404)
        b["capacity_per_slot"] = body.capacity_per_slot
        config["version"] = "edited-" + secrets.token_hex(6)
        tx.put("configuration_branches", "configuration", "system", config)
        tx.audit(user["id"], "branch.capacity", branch_id)
        return {"branch": b, "version": config["version"]}


# ------------------------------------------------------------ staff: customers and payments

def _customer_label(tx, owner: str) -> dict:
    """Staff-facing identity: email for registered accounts, otherwise channel and a short reference."""
    u = tx.get(owner)
    d = u["data"] if u and u["kind"] == "user" else {}
    if d.get("email"):
        return {"id": owner, "label": d["email"], "channel": "Website account"}
    if d.get("line_verified"):
        return {"id": owner, "label": "LINE customer …" + owner[-6:], "channel": "LINE (simulated)"}
    return {"id": owner, "label": "Guest …" + owner[-6:], "channel": "Website guest"}


def _in_scope(record: dict, scope: set[str], user: dict) -> bool:
    return record["branch"] in scope or (record["branch"] == "" and user["data"]["role"] == "manager")


@router.get("/staff/customers")
async def staff_customers(request: Request, branch: str = "", q: str = ""):
    """Customers with at least one appointment, case, quotation or payment in the staff member's scope."""
    q = q.strip().lower()[:80]
    with db.transaction() as tx:
        user = staff(tx, request)
        scope = _scope(tx, user, branch)
        rows: dict[str, dict] = {}

        def row(owner: str) -> dict:
            if owner not in rows:
                rows[owner] = _customer_label(tx, owner) | {"bookings": 0, "requested": 0, "confirmed": 0, "open_cases": 0,
                                                             "quotes": 0, "paid_thb": 0, "last_activity": 0}
            return rows[owner]
        for b in tx.find("booking"):
            if b["branch"] in scope:
                r = row(b["owner"]); r["bookings"] += 1
                r["requested"] += b["state"] == "requested"; r["confirmed"] += b["state"] == "confirmed"
                if b["data"].get("payment_status") == "paid":
                    r["paid_thb"] += b["data"]["total_thb"]
                r["last_activity"] = max(r["last_activity"], b["data"].get("requested_at", b["created"]), b["created"])
        for t in tx.find("ticket"):
            if _in_scope(t, scope, user):
                r = row(t["owner"]); r["open_cases"] += t["state"] != "closed"; r["last_activity"] = max(r["last_activity"], t["created"])
        for x in tx.find("corporate_quote"):
            if x["branch"] in scope:
                r = row(x["owner"]); r["quotes"] += 1; r["last_activity"] = max(r["last_activity"], x["created"])
        out = [r for r in rows.values() if not q or q in r["label"].lower()]
        out.sort(key=lambda r: r["last_activity"], reverse=True)
        return {"customers": out[:300], "total": len(out), "scope": sorted(scope)}


@router.get("/staff/customers/{owner}")
async def staff_customer(owner: str, request: Request):
    """One customer's service history inside the staff scope. Report values and chat text are not included;
    staff read a conversation only through its case."""
    with db.transaction() as tx:
        user = staff(tx, request)
        scope = _scope(tx, user, "")
        bookings = [b for b in tx.find("booking", owner) if b["branch"] in scope]
        tickets = [t for t in tx.find("ticket", owner) if _in_scope(t, scope, user)]
        quotes = [x for x in tx.find("corporate_quote", owner) if x["branch"] in scope]
        txns = [t for t in tx.find("payment_txn", owner) if _in_scope(t, scope, user)]
        if not (bookings or tickets or quotes or txns):
            raise ConversationError("not_found", "This customer has no records at your center.", 404)
        reports = tx.find("report", owner)
        from services import business_plans
        ent = business_plans.entitlement(tx, owner)
        tx.audit(user["id"], "customer.viewed", owner)
        return {
            "customer": _customer_label(tx, owner),
            "bookings": [{"id": b["id"], "state": b["state"], "branch": b["branch"], **{k: b["data"].get(k) for k in (
                "items", "date", "time", "total_thb", "payment_status", "payment_method", "organization", "decision_note")}} for b in bookings],
            "tickets": [{"id": t["id"], "state": t["state"], "branch": t["branch"], "created": t["created"], "summary": t["data"].get("summary", ""),
                         "topic": t["data"].get("topic", "")} for t in tickets],
            "quotes": [{"id": x["id"], "state": x["state"], "version": x["data"].get("version", 1), "total_thb": x["data"]["total_thb"],
                        "people": x["data"].get("people"), "date": x["data"].get("date")} for x in quotes],
            "payments": [ops.sim_view(tx, t) for t in txns],
            "reports": {"count": len(reports), "confirmed": sum(1 for r in reports if r["data"].get("confirmed"))},
            "plan": {k: ent[k] for k in ("plan", "plan_name", "active", "period_end", "ai_reads_used")},
        }


@router.get("/staff/payments")
async def staff_payments(request: Request, branch: str = "", state: str = ""):
    """Test-payment transactions and center receipts in scope. No real money moves in this release."""
    if state not in ("", "pending", "succeeded", "failed", "expired", "cancelled", "refunded", "center"):
        raise ConversationError("filter_invalid", "Unknown payment state.", 422)
    with db.transaction() as tx:
        user = staff(tx, request)
        scope = _scope(tx, user, branch)
        items = []
        bookings = {b["id"]: b for b in tx.find("booking") if b["branch"] in scope}
        manager_all = user["data"]["role"] == "manager" and not branch
        for t in tx.find("payment_txn"):
            # Plus subscriptions are not tied to a center (branch ""); managers see them in the all-centers view.
            if not (t["branch"] in scope or (t["branch"] == "" and manager_all)):
                continue
            v = ops.sim_view(tx, t)
            b = bookings.get(v["booking_id"])
            plus = v["order_kind"] == "subscription"
            last = v["events"][-1] if v["events"] else None
            items.append({"id": v["id"], "kind": "subscription" if plus else "test_payment", "state": v["state"], "method": v["method"], "amount_thb": v["amount_thb"],
                          "reference": v["reference"], "booking_id": v["booking_id"], "branch": t["branch"], "created": t["created"],
                          "items": ["LabClear Plus, 30 days"] if plus else [i["name"] for i in b["data"]["items"]] if b else [],
                          "customer": _customer_label(tx, t["owner"])["label"],
                          "last_event": last.get("type") if isinstance(last, dict) else None, "events": len(v["events"])})
        for b in bookings.values():
            d = b["data"]
            if d.get("payment_method") == "center" and d.get("payment_status") in ("paid", "refunded", "refund_pending"):
                items.append({"id": "center_" + b["id"][-10:], "kind": "center_receipt", "state": "center", "method": "center",
                              "amount_thb": d["total_thb"], "reference": "Center receipt", "booking_id": b["id"], "branch": b["branch"],
                              "created": d.get("paid_at", b["created"]), "items": [i["name"] for i in d["items"]],
                              "customer": _customer_label(tx, b["owner"])["label"], "last_event": d.get("payment_status"), "events": 0})
        totals = {s: sum(1 for i in items if i["state"] == s) for s in ("pending", "succeeded", "failed", "expired", "cancelled", "refunded", "center")}
        money = {"succeeded_thb": sum(i["amount_thb"] for i in items if i["state"] == "succeeded"),
                 "center_thb": sum(i["amount_thb"] for i in items if i["state"] == "center"),
                 "refunded_thb": sum(i["amount_thb"] for i in items if i["state"] == "refunded"),
                 "plus_thb": sum(i["amount_thb"] for i in items if i["state"] == "succeeded" and i["kind"] == "subscription")}
        shown = [i for i in items if not state or i["state"] == state]
        shown.sort(key=lambda i: i["created"], reverse=True)
        return {"payments": shown[:300], "totals": totals, "money": money, "mode": "SIMULATED_INTEGRATION", "scope": sorted(scope)}
