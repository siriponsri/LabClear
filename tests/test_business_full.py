"""Full business release: catalog discovery, staff-confirmed booking, payment simulator,
notifications, organization quotations, documents and the LINE simulator.

Doubles: only the LLM agent in the LINE worker test (marked). Storage, auth, CSRF,
signatures and state transitions are real.
"""
from __future__ import annotations

import json
import secrets
import time

import pytest

from routers import business
from services import business_ops as ops
from services import business_store as db
from tests.test_business_v3 import book, client, confirmed, isolated, promote, slot, staff_confirm  # noqa: F401

API = "/api/business"


# ------------------------------------------------------------ catalog

def test_catalog_search_filter_sort_and_reset():
    c = client(False)
    everything = c.get(API + "/catalog/search").json()
    assert everything["total"] == 18 and everything["is_demo"]
    lipid = c.get(API + "/catalog/search", params={"q": "lipid"}).json()
    assert lipid["total"] >= 3 and all("lipid" in (p["name"] + " ".join(p["services"])).lower() for p in lipid["packages"])
    org = c.get(API + "/catalog/search", params={"segment": "organization"}).json()
    assert {p["id"] for p in org["packages"]} == {"P16", "P17", "P18"}
    cheap = c.get(API + "/catalog/search", params={"max_price": 600, "sort": "price_desc"}).json()["packages"]
    assert cheap and all(p["price_thb"] <= 600 for p in cheap)
    assert [p["price_thb"] for p in cheap] == sorted([p["price_thb"] for p in cheap], reverse=True)
    none = c.get(API + "/catalog/search", params={"q": "no-such-test-xyz"}).json()
    assert none["total"] == 0 and none["packages"] == []
    no_review = c.get(API + "/catalog/search", params={"review": "excluded", "segment": "individual"}).json()["packages"]
    assert no_review and not any(p["staff_review_required"] for p in no_review)
    assert c.get(API + "/catalog/search", params={"segment": "bogus"}).status_code == 422


def test_catalog_detail_and_compare_use_same_canonical_prices():
    c = client(False)
    detail = c.get(API + "/catalog/P02").json()
    assert detail["package"]["price_thb"] == 1690 and len(detail["branches"]) == 3
    assert c.get(API + "/catalog/P99").status_code == 404
    comparison = c.get(API + "/catalog/compare", params={"ids": "P01,P03"}).json()
    assert [p["id"] for p in comparison["packages"]] == ["P01", "P03"]
    assert comparison["price_difference"] == [0, 2890 - 1190]
    hba1c = next(s for s in comparison["services"] if s["name"] == "HbA1c")
    assert hba1c["included"] == [False, True]
    assert c.get(API + "/catalog/compare", params={"ids": "P01"}).status_code == 422
    # The quote endpoint the LLM preview uses returns the identical price.
    signed = client()
    assert signed.post(API + "/quotes", json={"package_ids": ["P02"]}).json()["total_thb"] == detail["package"]["price_thb"]


def test_manager_price_edit_reaches_search_detail_and_quotes():
    manager = client(); promote(manager)
    assert manager.put(API + "/staff/catalog/P01", json={"price_thb": 1250, "active": True}).status_code == 200
    c = client()
    assert c.get(API + "/catalog/P01").json()["package"]["price_thb"] == 1250
    assert next(p for p in c.get(API + "/catalog/search").json()["packages"] if p["id"] == "P01")["price_thb"] == 1250
    assert c.post(API + "/quotes", json={"package_ids": ["P01"]}).json()["total_thb"] == 1250
    assert manager.put(API + "/staff/catalog/P01", json={"price_thb": 1250, "active": False}).status_code == 200
    assert all(p["id"] != "P01" for p in c.get(API + "/catalog/search").json()["packages"])


# ------------------------------------------------------------ booking lifecycle

def test_slots_use_branch_capacity_and_requests_hold_capacity(monkeypatch):
    with db.transaction() as tx:
        branches = db.branches(tx)
        for b in branches["branches"]:
            if b["id"] == "CNX01":
                b["capacity_per_slot"] = 1
        tx.put("configuration_branches", "configuration", "system", branches)
    c = client()
    day = slot()
    before = {s["time"]: s for s in c.get(API + "/slots", params={"branch_id": "CNX01", "date": day}).json()["slots"]}
    assert before["10:00"]["available"] == 1 and before["10:00"]["capacity"] == 1
    assert book(c, branch_id="CNX01", time="10:00").status_code == 200
    after = {s["time"]: s for s in c.get(API + "/slots", params={"branch_id": "CNX01", "date": day}).json()["slots"]}
    assert after["10:00"]["available"] == 0
    other = client()
    assert book(other, branch_id="CNX01", time="10:00").json()["code"] == "slot_full"
    # Another branch keeps its own capacity.
    assert book(other, branch_id="BKK01", time="10:00").status_code == 200


def test_staff_confirm_decline_and_branch_permission():
    c = client(); b = book(c).json()
    assert b["state"] == "requested"
    other_branch = client(); uid = promote(other_branch, "staff")
    with db.transaction() as tx:
        u = tx.get(uid); u["data"]["branch"] = "CNX01"; tx.put(uid, "user", uid, u["data"])
    assert other_branch.post(API + f"/staff/bookings/{b['id']}/decision", json={"decision": "confirm"}).status_code == 404
    assert c.post(API + f"/staff/bookings/{b['id']}/decision", json={"decision": "confirm"}).status_code == 403
    confirmed_row = staff_confirm(b["id"])
    assert confirmed_row["state"] == "confirmed"
    manager = client(); promote(manager)
    assert manager.post(API + f"/staff/bookings/{b['id']}/decision", json={"decision": "decline"}).status_code == 409
    d = book(client()).json()
    declined = manager.post(API + f"/staff/bookings/{d['id']}/decision", json={"decision": "decline", "note": "Center closed for training"})
    assert declined.json()["state"] == "declined"


def test_customer_can_withdraw_request_and_reschedule_needs_reconfirmation():
    c = client(); b = book(c).json()
    r = c.post(API + f"/bookings/{b['id']}/change", json={"operation": "cancel"})
    assert r.json()["state"] == "cancelled"
    b2 = confirmed(c, time="11:00")
    moved = c.post(API + f"/bookings/{b2['id']}/change", json={"operation": "reschedule", "date": slot(), "time": "13:00"}).json()
    assert moved["state"] == "requested" and moved["data"]["time"] == "13:00"


def test_calendar_file_only_after_confirmation_and_owner_only():
    c = client(); b = book(c).json()
    assert c.get(API + f"/bookings/{b['id']}/calendar.ics").status_code == 409
    staff_confirm(b["id"])
    r = c.get(API + f"/bookings/{b['id']}/calendar.ics")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/calendar")
    text = r.content.decode()
    assert "BEGIN:VCALENDAR" in text and "TZID=Asia/Bangkok:" in text and "simulation" in text.lower()
    assert f"{slot().replace('-', '')}T090000" in text
    assert client().get(API + f"/bookings/{b['id']}/calendar.ics").status_code == 404


# ------------------------------------------------------------ payment simulator

def _start(c, b, method="promptpay"):
    r = c.post(API + "/payments/checkout", json={"booking_id": b["id"], "method": method})
    assert r.status_code == 200, r.text
    return r.json()["txn"]


def test_simulator_success_is_signed_idempotent_and_amount_checked():
    c = client(); b = confirmed(c)
    txn = _start(c, b)
    assert txn["state"] == "pending" and txn["amount_thb"] == 1690 and txn["mode"] == "SIMULATED_INTEGRATION"
    assert _start(c, b)["id"] == txn["id"]  # re-open returns the same pending transaction
    assert c.post(API + "/payments/checkout", json={"booking_id": b["id"], "method": "card"}).status_code == 409
    with db.transaction() as tx:
        row = tx.get(txn["id"])
    wrong = ops.sim_event_payload(row, "success", amount_thb=1)
    assert c.post(API + "/payments/simulator/webhook", content=wrong, headers={"x-simulator-signature": ops.sim_sign(wrong)}).status_code == 409
    raw = ops.sim_event_payload(row, "success")
    assert c.post(API + "/payments/simulator/webhook", content=raw, headers={"x-simulator-signature": "t=1,v1=bad"}).status_code == 400
    ok = c.post(API + "/payments/simulator/webhook", content=raw, headers={"x-simulator-signature": ops.sim_sign(raw)})
    assert ok.json()["state"] == "succeeded"
    replay = c.post(API + "/payments/simulator/webhook", content=raw, headers={"x-simulator-signature": ops.sim_sign(raw)})
    assert replay.json()["duplicate"] is True
    booking = c.get(API + "/workspace").json()["bookings"][0]
    assert booking["data"]["payment_status"] == "paid"
    # A later failure event cannot reverse a settled payment.
    late = ops.sim_event_payload(row, "failure")
    assert c.post(API + "/payments/simulator/webhook", content=late, headers={"x-simulator-signature": ops.sim_sign(late)}).status_code == 409


def test_simulator_failure_expiry_cancel_allow_new_attempt():
    c = client(); b = confirmed(c)
    first = _start(c, b)
    assert c.post(API + f"/payments/simulator/{first['id']}/events", json={"outcome": "failure"}).json()["state"] == "failed"
    second = _start(c, b)
    assert second["id"] != first["id"]
    assert c.post(API + f"/payments/simulator/{second['id']}/events", json={"outcome": "expire"}).json()["txn"]["state"] == "expired"
    third = _start(c, b, "card")
    assert c.post(API + f"/payments/simulator/{third['id']}/events", json={"outcome": "cancel"}).json()["state"] == "cancelled"
    # Success after expiry time is recorded as expiry, never as paid.
    fourth = _start(c, b)
    with db.transaction() as tx:
        row = tx.get(fourth["id"]); row["data"]["expires_at"] = time.time() - 5
        tx.put(row["id"], "payment_txn", row["owner"], row["data"], row["state"], row["branch"])
    raw = ops.sim_event_payload(row, "success")
    assert c.post(API + "/payments/simulator/webhook", content=raw, headers={"x-simulator-signature": ops.sim_sign(raw)}).json()["state"] == "expired"
    assert c.get(API + "/workspace").json()["bookings"][0]["data"]["payment_status"] == "pending"


def test_simulator_transactions_are_private_and_refund_needs_manager():
    c = client(); b = confirmed(c); txn = _start(c, b)
    stranger = client()
    assert stranger.get(API + f"/payments/simulator/{txn['id']}").status_code == 404
    assert stranger.post(API + f"/payments/simulator/{txn['id']}/events", json={"outcome": "success"}).status_code == 404
    assert c.post(API + f"/payments/simulator/{txn['id']}/events", json={"outcome": "success"}).json()["state"] == "succeeded"
    staff_user = client(); promote(staff_user, "staff")
    assert staff_user.post(API + f"/staff/bookings/{b['id']}/refund", json={"reason": "Synthetic refund"}).status_code == 403
    manager = client(); promote(manager)
    assert manager.post(API + f"/staff/bookings/{b['id']}/refund", json={"reason": "Synthetic refund"}).json()["status"] == "refunded"
    assert manager.post(API + f"/staff/bookings/{b['id']}/refund", json={"reason": "Synthetic refund"}).json()["status"] == "refunded"
    assert c.get(API + f"/payments/simulator/{txn['id']}").json()["state"] == "refunded"


def test_payment_needs_confirmed_booking_and_center_choice_is_recorded():
    c = client(); b = book(c).json()
    assert c.post(API + "/payments/checkout", json={"booking_id": b["id"], "method": "center"}).json()["code"] == "awaiting_confirmation"
    staff_confirm(b["id"])
    assert c.post(API + "/payments/checkout", json={"booking_id": b["id"], "method": "center"}).status_code == 200
    assert c.get(API + "/workspace").json()["bookings"][0]["data"]["payment_method"] == "center"


# ------------------------------------------------------------ notifications

def test_notifications_come_from_events_and_are_isolated():
    c = client(); b = book(c).json()
    mine = c.get(API + "/notifications").json()
    assert mine["unread"] == 1 and mine["notifications"][0]["title"] == "Appointment request sent"
    assert client().get(API + "/notifications").json()["unread"] == 0
    manager = client(); promote(manager)
    staff_notes = manager.get(API + "/staff/notifications").json()
    assert any(n["title"] == "New appointment request" and n["ref"] == b["id"] for n in staff_notes["notifications"])
    assert c.get(API + "/staff/notifications").status_code == 403
    staff_confirm(b["id"])
    titles = [n["title"] for n in c.get(API + "/notifications").json()["notifications"]]
    assert titles[0] == "Appointment confirmed"
    assert c.post(API + "/notifications/read", json={}).json()["updated"] == 2
    assert c.get(API + "/notifications").json()["unread"] == 0


# ------------------------------------------------------------ organization inquiry and quotes

def _inquiry(c, **kw):
    body = {"organization": "Example Logistics (synthetic)", "contact_name": "Test Coordinator", "headcount": 40,
            "service_mode": "onsite", "branch_id": "BKK01", "preferred_date": slot(), "package_ids": ["P17"], "notes": "Morning only", **kw}
    return c.post(API + "/organizations/inquiries", json=body)


def test_organization_inquiry_validation():
    assert _inquiry(client(False)).json()["code"] == "account_required"
    c = client()
    assert _inquiry(c, headcount=5).status_code == 422
    assert _inquiry(c, package_ids=["P02"]).json()["code"] == "package_invalid"
    assert _inquiry(c, preferred_date="2020-01-01").json()["code"] == "date_invalid"
    assert _inquiry(c, branch_id="XXX01").json()["code"] == "branch_invalid"


def test_inquiry_to_versioned_quote_to_acceptance_and_pdf():
    c = client(); r = _inquiry(c); assert r.status_code == 200, r.text
    ticket_id = r.json()["ticket_id"]
    assert c.get(API + "/workspace").json()["conversation"]["mode"] == "bot"  # inquiry does not pause the assistant
    manager = client(); promote(manager)
    assert manager.post(API + f"/staff/tickets/{ticket_id}/state", json={"state": "staff"}).status_code == 200
    quote_body = {"ticket_id": ticket_id, "package_id": "P17", "people": 40, "date": slot(), "time": "09:00",
                  "branch_id": "BKK01", "venue": "Synthetic office, Bangkok", "travel_fee_thb": 1500}
    v1 = manager.post(API + "/staff/quotes", json=quote_body).json()
    assert v1["data"]["version"] == 1 and v1["data"]["total_thb"] == 1490 * 40 + 1500
    v2 = manager.post(API + "/staff/quotes", json={**quote_body, "people": 45, "note": "Revised headcount"}).json()
    assert v2["data"]["version"] == 2
    quotes = {q["id"]: q["state"] for q in c.get(API + "/workspace").json()["quotes"]}
    assert quotes == {v1["id"]: "superseded", v2["id"]: "offered"}
    assert c.post(API + "/quotes/accept", json={"quote_id": v1["id"]}).json()["code"] == "quote_superseded"
    pdf = c.get(API + f"/quotes/{v2['id']}/document.pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF-1.4") and pdf.content.rstrip().endswith(b"%%EOF")
    assert b"Not a tax invoice" in pdf.content and b"Version" in pdf.content
    assert client().get(API + f"/quotes/{v2['id']}/document.pdf").status_code == 404
    assert manager.get(API + f"/quotes/{v2['id']}/document.pdf").status_code == 200
    accepted = c.post(API + "/quotes/accept", json={"quote_id": v2["id"]}).json()
    assert accepted["state"] == "confirmed" and accepted["data"]["organization"] is True
    assert manager.post(API + "/staff/quotes", json=quote_body).json()["code"] == "quote_accepted"
    inquiry_view = manager.get(API + f"/staff/tickets/{ticket_id}/inquiry").json()
    assert inquiry_view["inquiry"]["data"]["organization"].startswith("Example Logistics")
    assert len(inquiry_view["quotes"]) == 2


def test_pdf_writer_produces_parseable_document():
    import pypdfium2 as pdfium
    from services.business_documents import render_pdf
    raw = render_pdf([("title", "Test")] + [("body", "Line %d with (parentheses) and \\ slash" % i) for i in range(120)])
    doc = pdfium.PdfDocument(raw)
    assert len(doc) >= 2
    assert "parentheses" in doc[0].get_textpage().get_text_range()


# ------------------------------------------------------------ LINE simulator

def test_line_simulator_runs_through_adapter_queue_and_dedups(monkeypatch):
    manager = client(); promote(manager)
    customer = client()
    assert customer.post(API + "/staff/line-simulator/events", json={"line_user_id": "Usim0123abcd", "text": "hi"}).status_code == 403
    sent = manager.post(API + "/staff/line-simulator/events", json={"line_user_id": "Usim0123abcd", "text": "Hello", "event_id": "simline_fixed01"})
    assert sent.status_code == 200 and sent.json()["mode"] == "SIMULATED_INTEGRATION"
    manager.post(API + "/staff/line-simulator/events", json={"line_user_id": "Usim0123abcd", "text": "Hello", "event_id": "simline_fixed01"})
    outbox = manager.get(API + "/staff/line-simulator/outbox").json()
    assert len([j for j in outbox["jobs"] if j["kind"] == "line_job"]) == 1  # replayed event deduplicated

    async def double(message, context):  # MOCKED_TEST_ONLY: agent double, not model evidence
        return {"reply": "Simulated assistant reply.", "sources": [], "action": None}
    monkeypatch.setattr(business.business_agent, "run", double)
    from config import settings
    monkeypatch.setattr(settings, "PROVIDER_NETWORK_ENABLED", True)
    assert manager.post(API + "/staff/line-simulator/run").json()["processed"] == 1
    deliveries = manager.get(API + "/staff/line-simulator/outbox").json()["deliveries"]
    assert deliveries and deliveries[0]["to"] == "Usim0123abcd" and deliveries[0]["text"] == "Simulated assistant reply."


def test_line_signature_still_required_on_public_webhook():
    c = client(False)
    raw = json.dumps({"events": []}).encode()
    assert c.post(API + "/line/webhook", content=raw, headers={"x-line-signature": "bad"}).status_code == 400


def test_modes_are_server_owned():
    modes = client(False).get(API + "/modes").json()["modes"]
    assert modes["payment"]["mode"] == "SIMULATED_INTEGRATION"
    assert modes["business_data"]["mode"] == "SIMULATED_BUSINESS_DATA"
    assert modes["assistant"]["mode"] == "UNAVAILABLE"
    assert modes["email"]["mode"] == "NOT_CONNECTED"


# ------------------------------------------------------------ chat retry

def test_failed_turn_is_marked_and_retry_does_not_duplicate(monkeypatch):
    from services.conversation_transport import ConversationError
    calls = []

    async def flaky(message, context):  # MOCKED_TEST_ONLY
        calls.append(message)
        if len(calls) == 1:
            raise ConversationError("service_unavailable", "Temporary failure.", 502)
        return {"reply": "Recovered answer.", "sources": [], "action": None}
    monkeypatch.setattr(business.business_agent, "run", flaky)
    c = client()
    assert c.post(API + "/chat", json={"message": "What does a lipid profile include?"}).status_code == 502
    messages = c.get(API + "/workspace").json()["conversation"]["messages"]
    assert len(messages) == 1 and messages[0]["failed"] and messages[0]["retryable"]
    r = c.post(API + "/chat/retry", json={"message_id": messages[0]["id"]})
    assert r.status_code == 200 and r.json()["reply"] == "Recovered answer."
    messages = c.get(API + "/workspace").json()["conversation"]["messages"]
    assert [m["role"] for m in messages] == ["user", "assistant"] and not messages[0].get("failed")
    assert calls == ["What does a lipid profile include?"] * 2
    assert c.post(API + "/chat/retry", json={"message_id": messages[0]["id"]}).status_code == 409


def test_safety_block_is_not_retryable(monkeypatch):
    from services.conversation_transport import ConversationError

    async def blocked(message, context):  # MOCKED_TEST_ONLY
        raise ConversationError("safety_blocked", "Blocked.", 422)
    monkeypatch.setattr(business.business_agent, "run", blocked)
    c = client()
    c.post(API + "/chat", json={"message": "unsafe request"})
    m = c.get(API + "/workspace").json()["conversation"]["messages"][0]
    assert m["failed"] and not m["retryable"]
    assert c.post(API + "/chat/retry", json={"message_id": m["id"]}).status_code == 409


def test_budget_status_is_manager_only():
    c = client()
    assert c.get(API + "/staff/budget").status_code == 403
    m = client(); promote(m)
    body = m.get(API + "/staff/budget").json()
    assert body["cost"]["scope"] == "project_total" and body["cost"]["cap_thb"] == 300.0


# ------------------------------------------------------------ admin dashboard

def test_dashboard_metrics_come_from_records_and_respect_branch_scope():
    c = client(); b1 = confirmed(c); book(c, time="10:00")
    other = client(); book(other, branch_id="CNX01", time="10:00")
    txn = c.post(API + "/payments/checkout", json={"booking_id": b1["id"], "method": "card"}).json()["txn"]
    c.post(API + f"/payments/simulator/{txn['id']}/events", json={"outcome": "success"})
    m = client(); promote(m)
    d = m.get(API + "/staff/dashboard").json()
    assert d["bookings"]["by_state"]["confirmed"] == 1 and d["bookings"]["by_state"]["requested"] == 2
    assert d["money"]["paid_thb"] == 1690 and d["money"]["test_payments"]["succeeded"] == 1
    assert d["funnel"] == {"requested": 3, "confirmed": 1, "paid": 1}
    bkk = next(x for x in d["capacity"] if x["branch_id"] == "BKK01")
    assert sum(day["used"] for day in bkk["days"]) == 2 and bkk["days"][0]["capacity"] == 18 * 3
    only_cnx = m.get(API + "/staff/dashboard", params={"branch": "CNX01"}).json()
    assert only_cnx["scope"] == ["CNX01"] and only_cnx["bookings"]["by_state"]["requested"] == 1
    branch_staff = client(); uid = promote(branch_staff, "staff")
    with db.transaction() as tx:
        u = tx.get(uid); u["data"]["branch"] = "CNX01"; tx.put(uid, "user", uid, u["data"])
    scoped = branch_staff.get(API + "/staff/dashboard", params={"branch": "BKK01"}).json()
    assert scoped["scope"] == ["CNX01"] and scoped["money"]["paid_thb"] == 0
    assert c.get(API + "/staff/dashboard").status_code == 403


def test_first_response_time_and_audit_log():
    c = client(); c.post(API + "/handoffs", json={"summary": "Need help"})
    m = client(); promote(m)
    tid = m.get(API + "/staff/inbox").json()["tickets"][0]["id"]
    m.post(API + f"/staff/tickets/{tid}/state", json={"state": "staff"})
    m.post(API + f"/staff/tickets/{tid}/messages", json={"message": "Hello"})
    assert m.get(API + "/staff/dashboard").json()["tickets"]["median_first_response_minutes"] is not None
    events = m.get(API + "/staff/audit").json()["events"]
    assert {"handoff.requested", "handoff.staff", "staff.message"} <= {e["action"] for e in events}
    assert c.get(API + "/staff/audit").status_code == 403


def test_manager_capacity_change_applies_to_slots_immediately():
    m = client(); promote(m)
    assert m.put(API + "/staff/branches/KKC01", json={"capacity_per_slot": 1}).status_code == 200
    assert m.put(API + "/staff/branches/KKC01", json={"capacity_per_slot": 0}).status_code == 422
    c = client()
    s = c.get(API + "/slots", params={"branch_id": "KKC01", "date": slot()}).json()["slots"]
    assert all(x["capacity"] == 1 for x in s)
    assert book(c, branch_id="KKC01", time="11:00").status_code == 200
    assert book(client(), branch_id="KKC01", time="11:00").json()["code"] == "slot_full"
    assert client().put(API + "/staff/branches/KKC01", json={"capacity_per_slot": 5}).status_code == 403
