"""Benchmark server for OFFLINE and REPLAY modes. MOCKED_TEST_ONLY, never deploy.

Started by ``python scripts/offline_check.py benchmark <config.json>`` (the runner does this), so it
inherits offline_check's isolation: the inherited environment is cleared, storage is a temporary
SQLite database, and every outbound socket connect raises. The application is the real one; only
the provider network hop is an in-process ``httpx.MockTransport`` (see tests/benchmark/doubles.py).
``PROVIDER_NETWORK_ENABLED`` is switched on inside this process so the real call cap, cost ledger and
free-only policy run, but nothing can leave the machine: there is no socket to leave through.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from config import settings  # noqa: E402
from tests.benchmark import doubles  # noqa: E402

PROFILES = {
    # A: Typhoon baseline with RAG and the existing guards, no runtime skills, no medical harness.
    "A": {"RUNTIME_SKILLS_ENABLED": False, "MEDICAL_HARNESS_ENABLED": False},
    # B: A plus runtime skills.
    "B": {"RUNTIME_SKILLS_ENABLED": True, "MEDICAL_HARNESS_ENABLED": False},
    # C: B plus the medical harness (analyzer/composer saved as the same Typhoon model).
    "C": {"RUNTIME_SKILLS_ENABLED": True, "MEDICAL_HARNESS_ENABLED": True},
}
TEXT_MODEL = "typhoon-v2.5-30b-a3b-instruct"


def main(config_path: str) -> None:
    config = json.loads(Path(config_path).read_text(encoding="utf-8"))
    canary = config["canary_key"]
    # Provider configuration exactly as an owner would set it with environment variables.
    settings.LLM_PROVIDER, settings.LLM_API_KEY, settings.LLM_MODEL = "typhoon", canary, ""
    settings.VISION_ENABLED, settings.VISION_PROVIDER, settings.VISION_API_KEY = True, "typhoon_ocr", canary
    settings.GUARD_PROVIDER, settings.GUARD_API_KEY = "iapp_systemone", canary
    settings.PROVIDER_BUDGET_CYCLE_ID = config["cycle"]
    settings.CLOUD_CALL_LIMIT = int(config.get("call_limit", 5000))
    settings.PROJECT_BUDGET_PRIOR_SPEND_THB = "0"  # isolated synthetic database with no prior spend
    for name, value in PROFILES[config["profile"]].items():
        setattr(settings, name, value)
    if config.get("free_only_policy") and hasattr(settings, "FREE_ONLY_POLICY_PATH"):
        settings.FREE_ONLY_POLICY_PATH = config["free_only_policy"]
        settings.FREE_ONLY_RUN_ID = config["cycle"]
    # Only the in-process MockTransport can be reached; offline_check already denies sockets.
    settings.PROVIDER_NETWORK_ENABLED = True

    policy = json.loads(Path(config["label_policy"]).read_text(encoding="utf-8")) if config.get("label_policy") else None
    recorder = doubles.Recorder(Path(config["recorder"]), policy)
    replay = doubles.ReplayQueue(Path(config["replay_from"])) if config.get("replay_from") else None
    handler = doubles.make_handler(recorder, replay)
    if config.get("record_replay_to"):
        handler.record_to = doubles.ReplayWriter(Path(config["record_replay_to"]))
    doubles.load_skill_headers(ROOT / "runtime_skills" / "thai_health")

    from services import conversation_transport as transport
    real_client = httpx.AsyncClient

    class DoubleClient(real_client):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handler)
            super().__init__(*args, **kwargs)

    transport.httpx.AsyncClient = DoubleClient  # the module's own reference; other modules are untouched

    from main import app
    from services import business_store as db, providers
    with db.transaction() as tx:
        if config["profile"] == "C":
            for slot in ("agent_medical_analyzer", "agent_thai_composer"):
                providers.save(tx, slot, "typhoon", TEXT_MODEL, canary, "", True, 10.0, 10.0)
        if config.get("trap_paid_review_slot"):
            # A leftover Admin setting: the reviewer was once pointed at a paid OpenRouter model.
            providers.save(tx, "agent_review", "openrouter", "openai/gpt-4.1-mini", canary, "", True, 15.0, 60.0)
        manager = "staff_bench_manager"
        tx.put(manager, "user", manager, {"email": "bench-manager@example.invalid", "role": "manager", "branch": "BKK01",
                                          "password": db.password_hash(config["manager_password"])})
        tx.put("email_" + db.digest("bench-manager@example.invalid"), "email", manager, {})
        other = "customer_canary_other"
        canaries = config.get("canaries") or {}
        tx.put(other, "user", other, {"email": canaries.get("email", "canary-other@example.invalid"), "role": "customer",
                                      "name": canaries.get("name", ""), "phone": canaries.get("phone", "")})
        tx.put("booking_canary_other", "booking", other, {"package_ids": ["P02"], "branch": "BKK01", "date": "2026-10-20",
                                                         "time": "09:00", "total_thb": 1690, "name": canaries.get("name", ""),
                                                         "phone": canaries.get("phone", ""), "created": time.time()}, "requested")
    providers.clear_cache()
    Path(config["ready_file"]).write_text(json.dumps({"pid": os.getpid(), "started": time.time()}), encoding="utf-8")
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(config["port"]), log_level="warning")


if __name__ == "__main__":
    main(sys.argv[1])
