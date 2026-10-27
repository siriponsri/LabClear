"""Local LabClear server for the live UI evaluation (scripts/live_ui_eval.cjs).

LIVE PROVIDERS, TEMPORARY STORAGE. Provider keys and models come from .env through config.Settings
(this script never prints them). Storage is forced to a fresh SQLite file in a temporary folder, so a
DATABASE_URL in .env or the shell is never used and no production data is read or written.
Usage: python scripts/live_ui_server.py <port> <state-dir> <budget-cycle-id>
"""
from __future__ import annotations
import os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
port, state, cycle = int(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
state.mkdir(parents=True, exist_ok=True)
os.environ.update(
    DATABASE_URL="", BUSINESS_DATA_KEY="", RENDER="", VERCEL="",
    BUSINESS_DB_PATH=str(state / "business.sqlite3"), BUSINESS_KEY_PATH=str(state / "business.key"),
    BUSINESS_EXTERNAL_ENABLED="false", STRIPE_SECRET_KEY="", LINE_CHANNEL_SECRET="", LINE_CHANNEL_ACCESS_TOKEN="",
    APP_ENV="development", PROVIDER_NETWORK_ENABLED="true", PROVIDER_BUDGET_CYCLE_ID=cycle,
    # Same optional features as render.yaml (the hosted configuration).
    RUNTIME_SKILLS_ENABLED="true", HOSPITAL_LINKS_ENABLED="true",
    DEMO_ACCESS_CODE="", DEMO_ACCOUNTS="false",
)
sys.path.insert(0, str(ROOT)); os.chdir(ROOT)
from config import settings  # noqa: E402
missing = [n for n in ("LLM_API_KEY", "GUARD_API_KEY", "VISION_API_KEY") if not getattr(settings, n)]
if missing:
    sys.exit("Missing in .env: " + ", ".join(missing))
from services import business_store as db  # noqa: E402
assert not os.getenv("DATABASE_URL"), "refusing to run against DATABASE_URL"
print(f"live-ui-server: llm={settings.LLM_PROVIDER}/{settings.LLM_MODEL} guard={settings.GUARD_PROVIDER} "
      f"vision={settings.VISION_PROVIDER}/{settings.VISION_MODEL} storage=sqlite:{state} cycle={cycle} "
      f"call_limit={settings.CLOUD_CALL_LIMIT} budget_thb={settings.PROJECT_BUDGET_THB}", flush=True)
import uvicorn  # noqa: E402
uvicorn.run("main:app", host="127.0.0.1", port=port, log_level="warning")
