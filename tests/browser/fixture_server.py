"""Offline UI harness ONLY. Never deploy.

MOCKED_TEST_ONLY: the LLM agent and OCR reader are explicit doubles so browser tests can
exercise the real UI, HTTP routes, storage, permissions and state machines. Results from
this server are UI/flow evidence, never model or OCR quality evidence.
"""
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from config import settings  # noqa: E402
from main import app  # noqa: E402
from routers import business as b  # noqa: E402
from services import business_store as db  # noqa: E402
from services.conversation_transport import ConversationError  # noqa: E402
from services.lab_fields_v2 import ReportField, normalize  # noqa: E402

settings.PROVIDER_NETWORK_ENABLED = False
b.provider_authorize = lambda request: None
b.request_rate_limiter.allow = lambda request: True
_failed_once: set[str] = set()


def _next_open_day(days: int = 3) -> str:
    day = datetime.now(b.TZ) + timedelta(days=days)
    while day.weekday() == 6:
        day += timedelta(days=1)
    return day.strftime("%Y-%m-%d")


async def agent(message, context):
    # Explicit test double, not product routing or an LLM quality evaluation.
    if message == "UI_TEST_BOOK":
        return {"reply": "Offline UI test double: please review your appointment request.", "sources": [],
                "action": {"type": "book", "quote": db.quote(["P02"]), "branch_id": "BKK01", "date": _next_open_day(4), "time": "10:30"}}
    if message == "UI_TEST_FAIL_ONCE" and message not in _failed_once:
        _failed_once.add(message)
        raise ConversationError("service_unavailable", "A connected service could not complete this request. Please try again.", 502)
    if message == "UI_TEST_SOURCES":
        return {"reply": "Offline UI test double with a source link.", "sources": [
            {"id": "nlm-reading-results", "title": "How to understand your lab results", "url": "https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/", "publisher": "MedlinePlus", "data_class": "public_education"}],
            "action": None, "followups": ["What does a reference range mean?"]}
    if message == "UI_TEST_DOCK":
        return {"reply": "Offline UI test double: here is a shortcut.", "sources": [], "action": None,
                "dot": {"id": "advisor", "name": "Health-check Advisor"},
                "ui": [{"type": "prefill_booking", "args": {"package_id": "P02", "name": "Workday Check", "branch_id": "BKK01"}}]}
    return {"reply": "Offline UI test double: your question was received.", "sources": [], "action": None,
            "dot": {"id": "advisor", "name": "Health-check Advisor"}}


b.business_agent.run = agent


async def read(raw):
    return {"fields": normalize([ReportField(name="Glucose", value="100", unit="mg/dL", reference="70–99", printed_flag="H")]),
            "warnings": ["OFFLINE UI TEST DOUBLE — not measured OCR output."], "confirmed": False}


b.read_report = read
with db.transaction() as tx:
    for uid, email, role, branch in [("ui_test_manager", "staff@example.invalid", "manager", "BKK01"),
                                     ("ui_test_staff_cnx", "cnx-staff@example.invalid", "staff", "CNX01")]:
        tx.put(uid, "user", uid, {"email": email, "password": db.password_hash("ui-test-only-password"), "role": role, "branch": branch})
        tx.put("email_" + db.digest(email), "email", uid, {})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("UI_TEST_PORT", "8098")), log_level="error")
