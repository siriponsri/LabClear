"""Lab-report product: Free and LabClear Plus (355 THB for 30 days, simulated payment).

Doubles: the report reader (no OCR provider runs in tests). Storage, sessions, CSRF,
entitlements, payment signatures and state transitions are real.
"""
from __future__ import annotations

import time

from routers import business
from services import business_ops as ops
from services import business_store as db
from services.lab_fields_v2 import ReportField, normalize
from tests.test_business_v3 import client, isolated, promote  # noqa: F401

API = "/api/business"
PNG = (business.DEMO_ROOT / "png" / "01_A_Liver.png").read_bytes()


def reader(monkeypatch, value="42", fail=False):
    async def read(raw):
        if fail:
            from services.conversation_transport import ConversationError
            raise ConversationError("provider_rejected", "test double failure", 502)
        return {"fields": normalize([ReportField(name="ALT", value=value, unit="U/L", reference="0-40")]), "warnings": [], "confirmed": False}
    monkeypatch.setattr(business, "read_report", read)


def upload(c, n=1):
    files = [("files", (f"page{i}.png", PNG, "image/png")) for i in range(n)]
    return c.post(API + "/reports/read", files=files)


def confirm(c, report_id, value, date):
    r = c.post(API + "/reports/confirm", json={"report_id": report_id, "label": "Check " + date, "collected_date": date,
               "same_person_confirmed": True, "fields": [{"name": "ALT", "value": value, "unit": "U/L", "reference": "0-40"}]})
    assert r.status_code == 200, r.text


def subscribe(c, outcome="success"):
    r = c.post(API + "/subscriptions/checkout", json={"method": "promptpay"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["simulator_url"].startswith("/pay/sim/") and body["txn"]["amount_thb"] == 355 and body["txn"]["order_kind"] == "subscription"
    with db.transaction() as tx:
        row = tx.get(body["txn"]["id"])
    raw = ops.sim_event_payload(row, outcome)
    assert c.post(API + "/payments/simulator/webhook", content=raw, headers={"x-simulator-signature": ops.sim_sign(raw)}).status_code == 200
    return body


def test_plans_are_published_with_the_355_baht_plus_price():
    d = client(False).get(API + "/plans").json()
    plus = next(p for p in d["plans"] if p["id"] == "plus")
    assert plus["price_thb"] == 355 and plus["period_days"] == 30 and plus["limits"] == {"ai_reads": None, "images_per_read": 3, "trends": True}
    free = next(p for p in d["plans"] if p["id"] == "free")
    assert free["limits"] == {"ai_reads": 1, "images_per_read": 1, "trends": False}


def test_free_plan_reads_one_report_of_one_image_and_samples_do_not_count(monkeypatch):
    reader(monkeypatch)
    c = client()
    ent = c.get(API + "/subscription").json()
    assert ent["plan"] == "free" and ent["can_read"] and ent["images_per_read"] == 1
    # Two images at once needs Plus; nothing is reserved when the check fails.
    r = upload(c, 2)
    assert r.status_code == 402 and r.json()["code"] == "subscription_required"
    assert c.get(API + "/subscription").json()["ai_reads_used"] == 0
    # A synthetic sample is free.
    assert c.post(API + "/demos/01_A_Liver/read").status_code == 200
    assert c.get(API + "/subscription").json()["ai_reads_used"] == 0
    first = upload(c)
    assert first.status_code == 200 and first.json()["entitlement"]["ai_reads_used"] == 1
    assert first.json()["data"]["pages"] == 1 and "original" not in first.json()["data"]
    again = upload(c)
    assert again.status_code == 402 and again.json()["code"] == "subscription_required"


def test_failed_reading_returns_the_reserved_free_read(monkeypatch):
    reader(monkeypatch, fail=True)
    c = client()
    assert upload(c).status_code == 502
    assert c.get(API + "/subscription").json()["ai_reads_used"] == 0


def test_plus_needs_an_account_and_activates_only_on_a_signed_success(monkeypatch):
    guest = client(False)
    r = guest.post(API + "/subscriptions/checkout", json={"method": "promptpay"})
    assert r.status_code == 409 and r.json()["code"] == "account_required"
    c = client()
    assert c.post(API + "/subscriptions/checkout", json={"method": "center"}).status_code == 422
    subscribe(c, "failure")
    assert c.get(API + "/subscription").json()["plan"] == "free"
    subscribe(c)
    ent = c.get(API + "/subscription").json()
    assert ent["plan"] == "plus" and ent["active"] and ent["trends"] and ent["images_per_read"] == 3 and ent["ai_reads_limit"] is None
    assert 29.9 * 86400 < ent["period_end"] - time.time() <= 30 * 86400
    # Renewing is possible only in the last 7 days.
    r = c.post(API + "/subscriptions/checkout", json={"method": "card"})
    assert r.status_code == 409 and r.json()["code"] == "subscription_active"
    notes = c.get(API + "/notifications").json()
    assert any("Plus is active" in n["title"] for n in notes.get("notifications", notes if isinstance(notes, list) else []))


def test_plus_reads_several_images_and_unlocks_trends_and_change_since_last_report(monkeypatch):
    c = client()
    reader(monkeypatch, "38")
    first = upload(c).json()
    confirm(c, first["id"], "38", "2026-04-01")
    assert c.get(API + "/reports/trends").status_code == 402
    lab = c.get(API + f"/reports/{first['id']}/lab-report").json()
    assert lab["rows"][0]["status"] == "within" and lab["previous"] is None and "not a diagnosis" in lab["note"]
    subscribe(c)
    reader(monkeypatch, "52")
    second = upload(c, 3)
    assert second.status_code == 200 and second.json()["data"]["pages"] == 3
    assert c.get(API + f"/reports/{second.json()['id']}/source", params={"page": 3}).status_code == 200
    assert c.get(API + f"/reports/{second.json()['id']}/source", params={"page": 4}).status_code == 404
    assert upload(c, 4).status_code == 422
    confirm(c, second.json()["id"], "52", "2026-10-01")
    trends = c.get(API + "/reports/trends").json()
    alt = trends["tests"][0]
    assert alt["name"] == "ALT" and alt["count"] == 2 and alt["change"] == 14 and alt["latest"]["status"] == "high"
    assert [p["date"] for p in alt["points"]] == ["2026-04-01", "2026-10-01"]
    lab = c.get(API + f"/reports/{second.json()['id']}/lab-report").json()
    assert lab["previous"]["date"] == "2026-04-01" and lab["rows"][0]["previous"]["change"] == 14
    # Another account cannot read this Lab Report.
    assert client().get(API + f"/reports/{second.json()['id']}/lab-report").status_code == 404


def test_expired_plus_falls_back_to_free(monkeypatch):
    c = client(); subscribe(c)
    with db.transaction() as tx:
        sub = next(s for s in tx.find("subscription") if s["state"] == "active")
        sub["data"]["period_end"] = time.time() - 1
        tx.put(sub["id"], "subscription", sub["owner"], sub["data"], "active")
    ent = c.get(API + "/subscription").json()
    assert ent["plan"] == "free" and ent["subscription"]["state"] == "expired"
    assert c.get(API + "/reports/trends").status_code == 402


def test_staff_see_plus_payments_and_a_manager_refund_ends_plus():
    c = client(); body = subscribe(c)
    manager = client(); promote(manager)
    pays = manager.get(API + "/staff/payments").json()
    row = next(p for p in pays["payments"] if p["id"] == body["txn"]["id"])
    assert row["kind"] == "subscription" and row["amount_thb"] == 355 and row["items"] == ["LabClear Plus, 30 days"]
    assert pays["money"]["plus_thb"] >= 355
    dash = manager.get(API + "/staff/dashboard").json()
    assert dash["lab_reports"]["plus_active"] >= 1 and dash["lab_reports"]["plus_revenue_thb"] >= 355
    # Branch staff do not see company-wide subscriptions.
    branch_staff = client(); promote(branch_staff, "staff")
    assert all(p["kind"] != "subscription" for p in branch_staff.get(API + "/staff/payments").json()["payments"])
    assert branch_staff.post(API + f"/staff/subscriptions/{body['subscription']['id']}/refund", json={"reason": "Customer request"}).status_code == 403
    r = manager.post(API + f"/staff/subscriptions/{body['subscription']['id']}/refund", json={"reason": "Customer request"})
    assert r.status_code == 200 and r.json()["state"] == "cancelled"
    assert c.get(API + "/subscription").json()["plan"] == "free"


def test_lab_report_pages_render_without_report_data():
    c = client(False)
    page = c.get("/lab-reports")
    assert page.status_code == 200 and "฿355" in page.text and "Read my report free" in page.text
    # The printable page is a shell; values load with the owner's session, never embedded.
    shell = c.get("/lab-report/report_does_not_matter")
    assert shell.status_code == 200 and 'data-lab-report="report_does_not_matter"' in shell.text and "/static/js/lab_report.js" in shell.text
    home = c.get("/")
    assert "/lab-reports" in home.text and "data-hero3d" in home.text and "/static/js/motion.js" in home.text


def test_hosted_call_cap_is_kept_in_the_database(monkeypatch):
    """Render's free plan has no shell and wipes its disk; with DATABASE_URL the cap lives in the business DB."""
    import asyncio
    from config import settings
    from services import conversation_transport as transport
    from services.conversation_transport import ConversationError
    monkeypatch.setenv("DATABASE_URL", "postgresql://unused.invalid/db")
    monkeypatch.setattr(settings, "PROVIDER_NETWORK_ENABLED", True)
    monkeypatch.setattr(settings, "PROVIDER_BUDGET_CYCLE_ID", "")
    # Use the test SQLite store in place of PostgreSQL; the counting logic is the same.
    real = db.transaction
    monkeypatch.setattr(db, "transaction", lambda: (monkeypatch.delenv("DATABASE_URL", raising=False), real())[1])
    try:
        asyncio.run(transport.reserve("llm"))
        raise AssertionError("expected cycle_required")
    except ConversationError as e:
        assert e.code == "cycle_required"
    monkeypatch.setenv("DATABASE_URL", "postgresql://unused.invalid/db")
    monkeypatch.setattr(settings, "PROVIDER_BUDGET_CYCLE_ID", "demo-1")
    monkeypatch.setattr(settings, "CLOUD_CALL_LIMIT", 2)
    for _ in range(2):
        monkeypatch.setenv("DATABASE_URL", "postgresql://unused.invalid/db")
        assert asyncio.run(transport.reserve("llm")) is None
    monkeypatch.setenv("DATABASE_URL", "postgresql://unused.invalid/db")
    try:
        asyncio.run(transport.reserve("guard"))
        raise AssertionError("expected budget_exhausted")
    except ConversationError as e:
        assert e.code == "budget_exhausted" and e.status == 429
    with real() as tx:
        row = tx.get("provider_calls_" + db.digest("demo-1"))
    assert row["data"]["used"] == 2 and row["data"]["by_slot"] == {"llm": 2}


def test_provider_rejection_names_service_and_status_without_secrets(caplog):
    from services.conversation_transport import rejection_error
    with caplog.at_level("WARNING", logger="labclear.provider"):
        err = rejection_error("guard", 402, '{"error":{"message":"Insufficient credits","key":"sk-or-v1-abcdef123456"}}', "Llama Guard 4 (OpenRouter)")
    assert "OpenRouter" in err.message and "HTTP 402" in err.message and "credit" in err.message
    assert "sk-or-v1-abcdef123456" not in caplog.text and "Insufficient credits" in caplog.text
    assert "HTTP 401" in rejection_error("llm", 401, "", "Typhoon").message and "Typhoon" in rejection_error("llm", 401, "", "Typhoon").message
