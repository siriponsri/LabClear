"""Frontend development API: the real Codex FastAPI app with an OFFLINE stand-in for the AI.

MOCKED, NEVER DEPLOY. Adapted from the Claude 4.0.0 branch for integration 4.0. Use it to build
and test the Next.js UI (web/) without any provider key:

    python scripts/dev_mock_api.py                     # serves 127.0.0.1:8000, flags as in the fixture
    UAT_FLAGS=off python scripts/dev_mock_api.py       # every new Codex flag off (default deployment)

It runs inside the same isolation as ``scripts/offline_check.py``: the inherited environment is
cleared, storage is a temporary SQLite file and outbound sockets are refused. Every route,
session, CSRF, origin, permission and storage rule is the real one. Only the language model and
the report reader are replaced by tests/browser/fixture_server.py doubles, extended here with Thai
sample replies. TRUSTED_ORIGINS lists the local Next.js origins so its /api proxy is accepted.
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path
import socket
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
FLAGS = os.getenv("UAT_FLAGS", "fixture")
PORT = int(os.getenv("PORT", "8000"))
ORIGINS = os.getenv("TRUSTED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")

# Same isolation as scripts/offline_check.py: no inherited configuration or credentials.
keep = {"path", "home", "tmp", "temp", "systemroot", "windir"}
for key in list(os.environ):
    if key.lower() not in keep:
        del os.environ[key]
folder = tempfile.mkdtemp(prefix="labclear-webmock-")
os.environ.update(APP_ENV="test", DATABASE_URL="", PROVIDER_NETWORK_ENABLED="false", DEMO_ACCOUNTS="true",
                  BUSINESS_DB_PATH=str(Path(folder) / "business.sqlite3"), BUSINESS_KEY_PATH=str(Path(folder) / "business.key"),
                  BUSINESS_EXTERNAL_ENABLED="false", TRUSTED_ORIGINS=ORIGINS)


def _denied(*_args, **_kwargs):
    raise RuntimeError("DEV_MOCK_API: outbound network forbidden; use a test double")


_connect = socket.socket.connect


def _loopback_only(sock, address):
    # Accepting browser connections needs no connect(); only loopback self-checks are allowed.
    host = address[0] if isinstance(address, tuple) else ""
    if host in {"127.0.0.1", "::1", "localhost"}:
        return _connect(sock, address)
    return _denied()


socket.socket.connect = _loopback_only
socket.create_connection = _denied

sys.path.insert(0, str(ROOT))
os.chdir(ROOT)
from config import settings  # noqa: E402
from tests.browser import fixture_server as fx  # noqa: E402  (patches the app on import)
from routers import business as b  # noqa: E402
from services import business_store as db  # noqa: E402

assert not settings.PROVIDER_NETWORK_ENABLED
if FLAGS == "off":
    for name in ("LANDING_PREVIEW_ENABLED", "ORG_DOCUMENTS_ENABLED", "ORG_REFERENCE_INFERENCE_ENABLED",
                 "HOSPITAL_LINKS_ENABLED", "RUNTIME_SKILLS_ENABLED", "MEDICAL_HARNESS_ENABLED"):
        setattr(settings, name, False)

_test_double = fx.agent
SRC = [{"id": "nlm-a1c", "title": "Hemoglobin A1c test", "url": "https://medlineplus.gov/lab-tests/hemoglobin-a1c-hba1c-test/",
        "publisher": "MedlinePlus · U.S. National Library of Medicine", "data_class": "public_education"},
       {"id": "nlm-reading-results", "title": "How to understand your lab results", "url": "https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/",
        "publisher": "MedlinePlus · U.S. National Library of Medicine", "data_class": "public_education"}]


async def agent(message, context, emit=None):
    if message.startswith("UI_TEST_"):
        return await _test_double(message, context, emit)
    steps = [("safety_in", "Your message passed the safety check", "UI test double"),
             ("plan", "Plan: answer the question, as the Report Explainer", "คำถามเกี่ยวกับค่าผลตรวจ จึงให้ผู้อธิบายผลตอบ (test double)"),
             ("search", 'Found 2 medical sources for "HbA1c"', "Hemoglobin A1c test; How to understand your lab results"),
             ("draft", "Draft written and checked", "2 cited sources; 0 report values matched exactly"),
             ("review", "Second review passed", "UI test double"),
             ("safety_out", "The answer passed the safety check", "UI test double")]
    trace = []
    for sid, label, detail in steps:
        if emit:
            await emit({"type": "step", "id": sid, "state": "running", "label": label, "detail": ""})
        await asyncio.sleep(0.35)
        if emit:
            await emit({"type": "step", "id": sid, "state": "done", "label": label, "detail": detail})
        trace.append({"id": sid, "label": label, "detail": detail})
    report = context.get("report")
    observations = []
    if report and report.get("fields"):
        f = report["fields"][0]
        observations = [{"field_id": f["id"], "value": f.get("value", ""), "unit": f.get("unit", ""), "reference": f.get("reference", ""), "status": f.get("status", "unknown"), "name": f.get("name", "")}]
    if any(w in message for w in ("จอง", "นัด", "book")):
        return {"reply": "ได้เลยครับ นี่คือคำขอนัดหมายสำหรับ **Workday Check** ที่ศูนย์กรุงเทพฯ กรุณาตรวจรายละเอียดแล้วกดยืนยัน ทีมงานจะยืนยันเวลาให้อีกครั้ง",
                "sources": [], "action": {"type": "book", "quote": db.quote(["P02"]), "branch_id": "BKK01", "date": fx._next_open_day(4), "time": "10:30"},
                "dot": {"id": "advisor", "name": "Health-check Advisor"}, "trace": trace, "followups": ["ต้องงดอาหารก่อนตรวจไหม", "เปลี่ยนเป็นวันเสาร์ได้ไหม"],
                "checks": {"input_safety": "passed", "citations_validated": 0, "independent_review": "passed", "output_safety": "passed", "observations": 0}}
    return {"reply": ("**HbA1c** คือค่าน้ำตาลสะสม สะท้อนระดับน้ำตาลในเลือดโดยเฉลี่ยช่วงประมาณ 2–3 เดือนที่ผ่านมา [nlm-a1c]\n\n"
                      "- ใช้ประกอบการคัดกรองและติดตามเบาหวาน แต่การแปลผลต้องดูช่วงอ้างอิงที่พิมพ์บนใบรายงานของห้องแล็บนั้นเสมอ [nlm-reading-results]\n"
                      "- ค่าที่อยู่นอกช่วงอ้างอิงไม่ได้แปลว่าเป็นโรคเสมอไป ควรปรึกษาแพทย์เพื่อประเมินร่วมกับประวัติและอาการ [nlm-reading-results]\n\n"
                      "_(คำตอบตัวอย่างจากโหมดทดสอบ ไม่ได้เรียก AI จริง)_"),
            "sources": SRC, "observations": observations, "action": None, "followups": ["HbA1c ต้องงดอาหารไหม", "ควรตรวจซ้ำบ่อยแค่ไหน"],
            "dot": {"id": "explainer", "name": "Report Explainer"}, "trace": trace,
            "checks": {"input_safety": "passed", "citations_validated": 2, "independent_review": "passed", "output_safety": "passed", "observations": len(observations)}}


b.business_agent.run = agent

if __name__ == "__main__":
    import uvicorn
    from main import app
    print(f"dev_mock_api: MOCKED AI, flags={FLAGS}, trusted origins={ORIGINS}, storage={folder}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
