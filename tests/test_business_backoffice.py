"""Back office additions: customers and payments views for staff, the stored answer
verification receipt and report observations, and the website 404 page.

Doubles: the LLM agent in the receipt test (marked). Storage, auth, CSRF, staff scope,
payment signatures and state transitions are real.
"""
from __future__ import annotations

import secrets

from routers import business
from services import business_ops as ops
from services import business_store as db
from tests.test_business_v3 import book, client, confirmed, isolated, promote, slot, staff_confirm  # noqa: F401

API = "/api/business"


def _pay(c, b, method="promptpay", outcome="success"):
    txn = c.post(API + "/payments/checkout", json={"booking_id": b["id"], "method": method}).json()["txn"]
    with db.transaction() as tx:
        row = tx.get(txn["id"])
    raw = ops.sim_event_payload(row, outcome)
    assert c.post(API + "/payments/simulator/webhook", content=raw, headers={"x-simulator-signature": ops.sim_sign(raw)}).status_code == 200
    return txn


def test_staff_customers_list_scope_search_and_detail_privacy():
    email = "cust-" + secrets.token_hex(3) + "@test.invalid"
    c = client(email=email); b = confirmed(c)
    c.post(API + "/handoffs", json={"summary": "Question about preparation"})
    manager = client(); promote(manager)
    listed = manager.get(API + "/staff/customers").json()
    row = next(r for r in listed["customers"] if r["label"] == email)
    assert row["bookings"] == 1 and row["confirmed"] == 1 and row["open_cases"] >= 1 and row["channel"] == "Website account"
    assert manager.get(API + "/staff/customers", params={"q": email[:8]}).json()["total"] >= 1
    assert manager.get(API + "/staff/customers", params={"q": "nobody-matches-this"}).json()["total"] == 0
    detail = manager.get(API + "/staff/customers/" + row["id"]).json()
    assert detail["customer"]["label"] == email and detail["bookings"][0]["id"] == b["id"]
    # No report values, no chat text, no password hash in the staff view.
    text = str(detail)
    assert "password" not in text and "messages" not in text and set(detail["reports"]) == {"count", "confirmed"}
    with db.transaction() as tx:
        assert any(a["data"]["action"] == "customer.viewed" and a["data"]["object_id"] == row["id"] for a in tx.find("audit"))
    # Staff at another center cannot see this customer; customers cannot call the endpoint at all.
    other = client(); uid = promote(other, "staff")
    with db.transaction() as tx:
        u = tx.get(uid); u["data"]["branch"] = "CNX01"; tx.put(uid, "user", uid, u["data"])
    assert all(r["id"] != row["id"] for r in other.get(API + "/staff/customers").json()["customers"])
    assert other.get(API + "/staff/customers/" + row["id"]).status_code == 404
    assert c.get(API + "/staff/customers").status_code == 403


def test_staff_payments_list_states_totals_and_center_receipts():
    c = client(); paid = confirmed(c)
    _pay(c, paid)
    center = confirmed(c, time="10:30")
    manager = client(); promote(manager)
    assert manager.post(API + f"/staff/bookings/{center['id']}/settle").status_code == 200
    d = manager.get(API + "/staff/payments").json()
    assert d["mode"] == "SIMULATED_INTEGRATION"
    mine = [p for p in d["payments"] if p["booking_id"] in (paid["id"], center["id"])]
    kinds = {p["kind"]: p for p in mine}
    assert kinds["test_payment"]["state"] == "succeeded" and kinds["test_payment"]["events"] == 1 and kinds["test_payment"]["amount_thb"] == 1690
    assert kinds["center_receipt"]["state"] == "center" and kinds["center_receipt"]["amount_thb"] == 1690
    assert d["totals"]["succeeded"] >= 1 and d["totals"]["center"] >= 1 and d["money"]["center_thb"] >= 1690
    only = manager.get(API + "/staff/payments", params={"state": "succeeded"}).json()["payments"]
    assert only and all(p["state"] == "succeeded" for p in only)
    assert manager.get(API + "/staff/payments", params={"state": "bogus"}).status_code == 422
    assert c.get(API + "/staff/payments").status_code == 403


def test_answer_receipt_and_verified_observations_are_stored_with_the_turn(monkeypatch):
    # Double: agent output shaped like business_agent.run; storage and rendering inputs are real.
    async def agent(message, context):
        f = context["report"]["fields"][0]
        return {"reply": "Your glucose [nlm-reading-results]", "sources": [{"id": "nlm-reading-results", "title": "t", "url": "https://medlineplus.gov/", "publisher": "p", "data_class": "public_education"}],
                "action": None, "dot": {"id": "explainer", "name": "Report Explainer"}, "ui": [],
                "observations": [{"field_id": f["id"], "value": f["value"], "unit": f["unit"], "reference": f["reference"], "status": f["status"]}],
                "checks": {"input_safety": "passed", "citations_validated": 1, "independent_review": "passed", "output_safety": "passed", "observations": 1}}
    monkeypatch.setattr(business.business_agent, "run", agent)
    c = client()
    rid = "report_" + secrets.token_hex(8); owner = c.get(API + "/workspace").json()["user"]["id"]
    with db.transaction() as tx:
        tx.put(rid, "report", owner, {"label": "r", "confirmed": True, "fields": [{"id": "r1", "name": "Glucose", "value": "101", "unit": "mg/dL", "reference": "70-99", "printed_flag": "H", "status": "high"}]})
    assert c.post(API + "/reports/select", json={"report_id": rid}).status_code == 200
    assert c.post(API + "/chat", json={"message": "explain"}).status_code == 200
    m = c.get(API + "/workspace").json()["conversation"]["messages"][-1]
    assert m["checks"]["independent_review"] == "passed" and m["checks"]["citations_validated"] == 1
    assert m["observations"] == [{"field_id": "r1", "value": "101", "unit": "mg/dL", "reference": "70-99", "status": "high", "name": "Glucose"}]


def test_run_returns_receipt_only_after_all_checks():
    # The receipt is built at the single success return of business_agent.run; every check raises before it.
    import inspect
    from services import business_agent
    src = inspect.getsource(business_agent.run)
    tail = src[src.index("validate_answer(answer"):]
    assert tail.index("review_failed") < tail.index("'checks'") and tail.index("guard.check(answer.reply") < tail.index("'checks'")


def test_website_404_is_a_page_and_api_404_stays_json():
    c = client(False)
    page = c.get("/no-such-page", headers={"Accept": "text/html"})
    assert page.status_code == 404 and "This page is unavailable" in page.text and "Browse health checks" in page.text
    api = c.get("/api/business/no-such-endpoint", headers={"Accept": "text/html"})
    assert api.status_code == 404 and api.headers["content-type"].startswith("application/json")
