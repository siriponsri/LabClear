"""LIVE_FREE trial server for scripts/benchmark_labclear.py. Never a production server.

The runner starts this only after the free-only preflight passed. It builds the environment
itself (nothing inherited except PATH/HOME/TMP and an HTTPS proxy/CA if the owner's machine needs
one), so a production ``.env``, ``DATABASE_URL`` or saved paid Admin slot can never leak in:

* storage is a SQLite database inside the run folder (kept for ``resume``; synthetic data only),
* provider keys come from ``LABCLEAR_TRIAL_TYPHOON_API_KEY`` / ``LABCLEAR_TRIAL_IAPP_API_KEY``,
* ``FREE_ONLY_POLICY_PATH`` points at the reviewed policy, so every call passes the exact
  host/path/model check, the shared quota scheduler, the call cap and the THB ledger,
* an extra httpx request hook refuses any host that is not in the policy (defence in depth),
* the server listens on 127.0.0.1 only.

``--print-effective-slots`` resolves every AI slot exactly as the trial server would and prints
them without keys, for the preflight. It makes no network call.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEXT_MODEL = "typhoon-v2.5-30b-a3b-instruct"
PROFILES = {"A": {"RUNTIME_SKILLS_ENABLED": False, "MEDICAL_HARNESS_ENABLED": False},
            "B": {"RUNTIME_SKILLS_ENABLED": True, "MEDICAL_HARNESS_ENABLED": False},
            "C": {"RUNTIME_SKILLS_ENABLED": True, "MEDICAL_HARNESS_ENABLED": True}}


def configure(config: dict, folder: Path) -> None:
    keep = {"PATH", "HOME", "TMP", "TEMP", "SYSTEMROOT", "HTTPS_PROXY", "SSL_CERT_FILE", "REQUESTS_CA_BUNDLE",
            "LABCLEAR_TRIAL_TYPHOON_API_KEY", "LABCLEAR_TRIAL_IAPP_API_KEY"}
    for key in list(os.environ):
        if key not in keep:
            del os.environ[key]
    os.environ.update(APP_ENV="test", DATABASE_URL="", BUSINESS_EXTERNAL_ENABLED="false", DEMO_ACCOUNTS="false",
                      BUSINESS_DB_PATH=str(folder / "trial.sqlite3"), BUSINESS_KEY_PATH=str(folder / "trial.key"))
    os.chdir(folder)  # no repository .env can be read from here
    sys.path.insert(0, str(ROOT))
    from config import settings
    typhoon = os.environ.get("LABCLEAR_TRIAL_TYPHOON_API_KEY", "")
    iapp = os.environ.get("LABCLEAR_TRIAL_IAPP_API_KEY", "")
    settings.LLM_PROVIDER, settings.LLM_API_KEY, settings.LLM_MODEL = "typhoon", typhoon, TEXT_MODEL
    settings.VISION_ENABLED, settings.VISION_PROVIDER, settings.VISION_API_KEY, settings.VISION_MODEL = True, "typhoon_ocr", typhoon, "typhoon-ocr"
    settings.GUARD_PROVIDER, settings.GUARD_API_KEY = "iapp_systemone", iapp
    for name, value in PROFILES[config["profile"]].items():
        setattr(settings, name, value)
    settings.FREE_ONLY_POLICY_PATH = config["free_only_policy"]
    settings.FREE_ONLY_RUN_ID = config["cycle"]
    settings.PROVIDER_BUDGET_CYCLE_ID = config["cycle"]
    policy = json.loads(Path(config["free_only_policy"]).read_text(encoding="utf-8"))
    limits = policy["run_limits"]
    settings.CLOUD_CALL_LIMIT = limits["text_calls"] + limits["ocr_calls"] + limits["guard_decisions"]
    # The trial ledger is a new isolated database: nothing was spent from it before.
    settings.PROJECT_BUDGET_PRIOR_SPEND_THB = "0"
    settings.PROVIDER_NETWORK_ENABLED = True
    os.chdir(ROOT)


def seed(config: dict) -> None:
    from services import business_store as db, providers
    policy = json.loads(Path(config["free_only_policy"]).read_text(encoding="utf-8"))
    text = next(e for e in policy["endpoints"] if e["family"] == "text")
    with db.transaction() as tx:
        key = os.environ.get("LABCLEAR_TRIAL_TYPHOON_API_KEY", "")
        if config["profile"] == "C" and key:
            for slot in ("agent_medical_analyzer", "agent_thai_composer"):
                if not tx.get(providers.SETTINGS_ID) or slot not in (tx.get(providers.SETTINGS_ID)["data"] or {}):
                    providers.save(tx, slot, "typhoon", TEXT_MODEL, key, "", True,
                                   float(text["price_in_thb_per_mtok"]), float(text["price_out_thb_per_mtok"]))
        if not tx.get("staff_bench_manager"):
            tx.put("staff_bench_manager", "user", "staff_bench_manager", {"email": "bench-manager@example.invalid", "role": "manager",
                                                                            "branch": "BKK01", "password": db.password_hash(config["manager_password"])})
            tx.put("email_" + db.digest("bench-manager@example.invalid"), "email", "staff_bench_manager", {})
        else:
            row = tx.get("staff_bench_manager")
            row["data"]["password"] = db.password_hash(config["manager_password"])
            tx.put("staff_bench_manager", "user", "staff_bench_manager", row["data"])
        if not tx.get("customer_canary_other"):
            c = config.get("canaries") or {}
            tx.put("customer_canary_other", "user", "customer_canary_other", {"email": c.get("email", ""), "role": "customer",
                                                                                "name": c.get("name", ""), "phone": c.get("phone", "")})
            tx.put("booking_canary_other", "booking", "customer_canary_other", {"package_ids": ["P02"], "branch": "BKK01", "date": "2026-10-20",
                                                                               "time": "09:00", "total_thb": 1690, "name": c.get("name", ""),
                                                                               "phone": c.get("phone", ""), "created": time.time()}, "requested")
    providers.clear_cache()


def guard_hosts(config: dict) -> None:
    """Refuse any request to a host outside the policy before it leaves the process."""
    import httpx
    from services import conversation_transport as transport
    policy = json.loads(Path(config["free_only_policy"]).read_text(encoding="utf-8"))
    hosts = {e["host"] for e in policy["endpoints"]}
    real = httpx.AsyncClient

    async def check(request: httpx.Request) -> None:
        if request.url.scheme != "https" or request.url.host not in hosts:
            raise httpx.RequestError("host outside the free-only policy", request=request)

    record = Path(config["record_replay_to"]) if config.get("record_replay_to") else None

    class RecordingTransport(httpx.AsyncHTTPTransport):
        """Save each provider response (synthetic inputs only) for a later REPLAY run."""

        async def handle_async_request(self, request):
            response = await super().handle_async_request(request)
            body = await response.aread()
            try:
                sent, got = json.loads(request.content or b"{}"), json.loads(body or b"{}")
                if "systemone" in request.url.path:
                    stage, content = "guard", got
                else:
                    stage, content = _stage_of(sent), got["choices"][0]["message"]["content"]
                with record.open("a", encoding="utf-8") as fh:
                    fh.write(json.dumps({"stage": stage, "content": content}, ensure_ascii=False) + "\n")
            except (ValueError, KeyError, IndexError, TypeError):
                pass  # an unparseable response is not replayable; the live row still records the outcome
            headers = [(k, v) for k, v in response.headers.items() if k.lower() not in ("content-encoding", "content-length", "transfer-encoding")]
            return httpx.Response(response.status_code, headers=headers, content=body, request=request)

    class PolicyClient(real):
        def __init__(self, *args, **kwargs):
            hooks = kwargs.pop("event_hooks", None) or {}
            hooks = {**hooks, "request": [*hooks.get("request", []), check]}
            if record is not None:
                kwargs["transport"] = RecordingTransport(proxy=os.environ.get("HTTPS_PROXY") or None)
            super().__init__(*args, event_hooks=hooks, **kwargs)

    transport.httpx.AsyncClient = PolicyClient


def _stage_of(body: dict) -> str:
    """Same stage names as tests/benchmark/doubles.py so a recording can be replayed."""
    messages = body.get("messages") or []
    if any(isinstance(m.get("content"), list) for m in messages):
        return "ocr"
    system = next((m.get("content", "") for m in messages if m.get("role") == "system" and isinstance(m.get("content"), str)), "")
    for prefix, stage in (("You are LabClear's LLM conversation planner", "planner"), ("You are LabClear, a conversational", "writer"),
                          ("Verify this draft", "reviewer"), ("Read the laboratory report", "rows"), ("Analyze only the supplied evidence", "analyzer")):
        if system.startswith(prefix):
            return stage
    return "other_llm"


def effective_slots(config: dict) -> dict:
    from urllib.parse import urlsplit
    from config import settings
    from services import providers
    out = {}
    harness = settings.MEDICAL_HARNESS_ENABLED
    for slot in list(providers.SLOTS) + [providers.agent_slot(a) for a in providers.AGENTS]:
        p = providers.runtime(slot)
        if p.protocol in ("systemone_iapp", "systemone_typesafe"):
            url = p.base_url
        else:
            url = p.base_url.rstrip("/") + ("/messages" if p.protocol == "anthropic_messages" else "/chat/completions")
        parts = urlsplit(url)
        upgrade = slot.removeprefix("agent_") in providers.UPGRADE_AGENTS
        out[slot] = {"source": p.source, "preset": p.preset, "protocol": p.protocol, "host": parts.hostname, "path": parts.path,
                     "model": p.model, "ready": p.ready, "key_present": bool(p.api_key),
                     "will_be_called": bool(p.enabled and (not upgrade or harness))}
    return out


def main() -> None:
    args = sys.argv[1:]
    print_slots = args[:1] == ["--print-effective-slots"]
    config = json.loads(Path(args[-1]).read_text(encoding="utf-8"))
    folder = Path(config.get("state_dir") or tempfile.mkdtemp(prefix="labclear-trial-"))
    folder.mkdir(parents=True, exist_ok=True)
    configure(config, folder)
    seed(config)
    if print_slots:
        print(json.dumps(effective_slots(config)))
        return
    guard_hosts(config)
    from main import app
    Path(config["ready_file"]).write_text(json.dumps({"pid": os.getpid(), "started": time.time()}), encoding="utf-8")
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(config["port"]), log_level="warning")


if __name__ == "__main__":
    main()
