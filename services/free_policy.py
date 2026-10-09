"""Free-only provider policy and shared quota scheduler for the free-first trial profile.

Off unless ``FREE_ONLY_POLICY_PATH`` names a reviewed policy file. When on, every provider call in
``conversation_transport.post_json`` passes through ``admit`` **before** the call cap, the THB ledger
and the network:

1. The exact (https host, path, model) tuple must be listed in the policy. Anything else (a saved
   Admin slot pointing at another provider, a paid fallback, a redirect target, a guessed OCR path)
   is refused with ``free_policy_blocked``. Redirects are never followed by the transport.
2. The entry must be ``VERIFIED_FREE_FOR_THIS_ACCOUNT`` with a ``verified_at`` date no older than
   ``MAX_VERIFICATION_AGE_DAYS`` and a written ``evidence`` note; an OFFLINE_DOUBLE entry is accepted
   only when ``FREE_ONLY_ALLOW_OFFLINE_DOUBLES`` is set by the offline benchmark server. Unknown or
   unverified status is ``free_policy_unverified`` (fail closed, never a default price of zero).
3. A shared quota (one durable record per run in the business database, so every role and process
   shares it) enforces per-minute application rates, per-run caps on text calls, OCR calls and guard
   decisions, a run time limit and the provider's daily decision limit. When a minute window is full
   the call waits (bounded) instead of firing; when a cap is reached the call is refused with
   ``free_quota_exhausted``. Resuming a run keeps the counts.

The THB cost ledger and the call cap still run for every call. Free entries are priced at zero only
because the policy says the account was verified free on a stated date; ``observed_cost`` stays
unknown to the application. Application code cannot guarantee an external bill is zero; the owner
still checks the provider console.
"""
from __future__ import annotations

import asyncio
import json
import math
import re
import time
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from config import settings
from services.conversation_transport import ConversationError

VERIFIED = "VERIFIED_FREE_FOR_THIS_ACCOUNT"
OFFLINE_DOUBLE = "OFFLINE_DOUBLE"
MAX_VERIFICATION_AGE_DAYS = 7
MAX_WAIT_SECONDS = 65.0


class Endpoint(BaseModel):
    model_config = ConfigDict(extra="allow")
    family: Literal["text", "ocr", "guard"]
    protocol: str
    host: str = Field(pattern=r"^[a-z0-9.-]+$")
    path: str = Field(pattern=r"^/[A-Za-z0-9._/-]*$")
    model: str = Field(min_length=1, max_length=120)
    price_status: str
    price_in_thb_per_mtok: float = Field(ge=0)
    price_out_thb_per_mtok: float = Field(ge=0)
    verified_at: str = ""
    evidence: str = ""
    app_rate_per_minute: int = Field(ge=1, le=600)
    daily_decisions: int | None = Field(default=None, ge=1)


class RunLimits(BaseModel):
    max_minutes: int = Field(ge=1, le=240)
    text_calls: int = Field(ge=1, le=5000)
    ocr_calls: int = Field(ge=0, le=500)
    guard_decisions: int = Field(ge=0, le=10000)
    retries_per_logical_call: int = Field(ge=0, le=2)
    concurrency: Literal[1] = 1


class Policy(BaseModel):
    model_config = ConfigDict(extra="allow")
    policy_id: str = Field(pattern=r"^[A-Za-z0-9._-]{1,60}$")
    policy_version: str
    mode: Literal["LIVE_FREE", "OFFLINE_DOUBLES_ONLY"]
    reviewed_by: str = ""
    reviewed_at: str = ""
    account_label: str = ""
    data_policy_reviewed: bool = False
    endpoints: list[Endpoint] = Field(min_length=1, max_length=10)
    run_limits: RunLimits
    decision_counting: Literal["questions_x_labels"] = "questions_x_labels"


_cache: dict = {}


def load(path: str | None = None) -> Policy:
    path = path or settings.FREE_ONLY_POLICY_PATH
    try:
        p = Path(path)
        stamp = (str(p.resolve()), p.stat().st_mtime_ns)
        if _cache.get("stamp") != stamp:
            _cache.update(stamp=stamp, policy=Policy.model_validate(json.loads(p.read_text(encoding="utf-8"))))
        return _cache["policy"]
    except (OSError, ValueError, ValidationError):
        raise ConversationError("free_policy_invalid", "The free-only provider policy is missing or invalid. No provider was called.", 503) from None


def active() -> bool:
    return bool(settings.FREE_ONLY_POLICY_PATH)


def _age_days(value: str) -> float | None:
    try:
        return (date.today() - date.fromisoformat(value[:10])).days
    except ValueError:
        return None


def entry_status(policy: Policy, e: Endpoint) -> str:
    """'' when callable, otherwise the reason."""
    if e.price_status == OFFLINE_DOUBLE:
        return "" if (policy.mode == "OFFLINE_DOUBLES_ONLY" and settings.FREE_ONLY_ALLOW_OFFLINE_DOUBLES) else "offline_double_outside_offline_run"
    if policy.mode != "LIVE_FREE":
        return "policy_mode_not_live"
    if e.price_status != VERIFIED:
        return "free_status_unverified"
    age = _age_days(e.verified_at)
    if age is None or age < 0 or age > MAX_VERIFICATION_AGE_DAYS:
        return "verification_stale_or_missing"
    if not e.evidence.strip():
        return "verification_evidence_missing"
    if e.price_in_thb_per_mtok or e.price_out_thb_per_mtok:
        return "priced_entry_not_free"
    return ""


def match(url: str, model: str) -> tuple[Policy, Endpoint]:
    policy = load()
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.port not in (None, 443) or parts.username or parts.query:
        raise ConversationError("free_policy_blocked", "This provider endpoint is not on the reviewed free-only list. No request was sent.", 409)
    for e in policy.endpoints:
        if (parts.hostname or "") == e.host and parts.path == e.path and model == e.model:
            reason = entry_status(policy, e)
            if reason:
                raise ConversationError("free_policy_unverified", f"The free-only policy does not allow this endpoint yet ({reason}). No request was sent.", 409)
            return policy, e
    raise ConversationError("free_policy_blocked", "This provider endpoint is not on the reviewed free-only list. No request was sent.", 409)


def decisions(body: dict) -> int:
    """Conservative System One usage: every typed question times its labels (never 1 request = 1 decision)."""
    questions = (body or {}).get("questions") or {}
    return sum(max(1, len((q or {}).get("criteria") or {})) for q in questions.values()) or 1


@dataclass
class Gate:
    endpoint: Endpoint
    run_id: str
    decisions: int
    queued_ms: int
    started: float

    @property
    def price(self) -> dict:
        return {"input_per_mtok": self.endpoint.price_in_thb_per_mtok, "output_per_mtok": self.endpoint.price_out_thb_per_mtok}


def _key(run_id: str) -> str:
    from services import business_store as db
    return "free_quota_" + db.digest(run_id)


def _day_key(policy: Policy, family: str) -> str:
    from services import business_store as db
    return "free_quota_day_" + db.digest(f"{policy.account_label}|{family}|{datetime.now(timezone.utc).date().isoformat()}")


def _blank(run_id: str) -> dict:
    return {"run_id": run_id, "started_at": time.time(), "text_calls": 0, "ocr_calls": 0, "guard_requests": 0,
            "guard_decisions": 0, "input_tokens": 0, "output_tokens": 0, "provider_ms": 0, "queue_ms": 0,
            "blocked": 0, "failed": 0, "window": {"text": [], "ocr": [], "guard": []}}


def _try_acquire(policy: Policy, e: Endpoint, run_id: str, cost_decisions: int) -> float:
    """0 when the call was counted; otherwise seconds to wait. Raises when a cap is reached."""
    from services import business_store as db
    limits = policy.run_limits
    now = time.time()
    with db.transaction() as tx:
        row = tx.get(_key(run_id))
        data = row["data"] if row else _blank(run_id)
        window = [t for t in data["window"].get(e.family, []) if now - t < 60]
        caps = {"text": ("text_calls", limits.text_calls), "ocr": ("ocr_calls", limits.ocr_calls),
                "guard": ("guard_decisions", limits.guard_decisions)}
        field_name, cap = caps[e.family]
        increment = cost_decisions if e.family == "guard" else 1
        exhausted = ""
        if now - data["started_at"] > limits.max_minutes * 60:
            exhausted = "run time limit"
        elif data[field_name] + increment > cap:
            exhausted = f"{field_name} cap {cap}"
        if not exhausted and e.family == "guard" and e.daily_decisions:
            day = tx.get(_day_key(policy, e.family))
            used = day["data"]["decisions"] if day else 0
            if used + increment > e.daily_decisions:
                exhausted = f"daily decisions {e.daily_decisions}"
        if exhausted:
            data["blocked"] += 1
            tx.put(_key(run_id), "free_quota", "system", data, "open")
        elif len(window) >= e.app_rate_per_minute:
            return max(0.05, 60 - (now - window[0]) + 0.05)
        else:
            window.append(now)
            data["window"][e.family] = window
            data[field_name] += increment
            if e.family == "guard":
                data["guard_requests"] += 1
                day_key = _day_key(policy, e.family)
                day = tx.get(day_key)
                tx.put(day_key, "free_quota_day", "system", {"decisions": (day["data"]["decisions"] if day else 0) + increment}, "open")
            tx.put(_key(run_id), "free_quota", "system", data, "open")
    if exhausted:
        # Raised after the transaction commits, so the refusal is counted durably.
        raise ConversationError("free_quota_exhausted", f"The free-only trial quota is used up ({exhausted}). Resume later; no request was sent.", 429)
    return 0.0


async def admit(url: str, model: str, body: dict) -> Gate:
    policy, e = match(url, model)
    run_id = settings.FREE_ONLY_RUN_ID or settings.PROVIDER_BUDGET_CYCLE_ID or "free-only"
    cost = decisions(body) if e.family == "guard" else 1
    waited = 0.0
    while True:
        pause = _try_acquire(policy, e, run_id, cost)
        if not pause:
            break
        if waited + pause > MAX_WAIT_SECONDS:
            raise ConversationError("free_quota_exhausted", "The free-only per-minute limit did not clear in time. No request was sent.", 429)
        await asyncio.sleep(pause)
        waited += pause
    return Gate(e, run_id, cost, round(waited * 1000), time.perf_counter())


def settle(gate: Gate | None, usage: dict | None, outcome: str) -> None:
    if gate is None:
        return
    from services import business_store as db
    elapsed = round((time.perf_counter() - gate.started) * 1000)
    with db.transaction() as tx:
        row = tx.get(_key(gate.run_id))
        if not row:
            return
        data = row["data"]
        data["provider_ms"] += elapsed
        data["queue_ms"] += gate.queued_ms
        if outcome != "succeeded":
            data["failed"] += 1
        if isinstance(usage, dict):
            for dst, names in (("input_tokens", ("prompt_tokens", "input_tokens")), ("output_tokens", ("completion_tokens", "output_tokens"))):
                value = next((usage[n] for n in names if n in usage), None)
                if isinstance(value, int) and value >= 0:
                    data[dst] += value
        tx.put(_key(gate.run_id), "free_quota", "system", data, "open")


def status() -> dict:
    """For the staff budget and AI-provider views; never includes keys."""
    if not active():
        return {"active": False}
    try:
        policy = load()
    except ConversationError as exc:
        return {"active": True, "valid": False, "error": exc.code}
    from services import business_store as db
    run_id = settings.FREE_ONLY_RUN_ID or settings.PROVIDER_BUDGET_CYCLE_ID or "free-only"
    with db.transaction() as tx:
        row = tx.get(_key(run_id))
    usage = {k: v for k, v in (row["data"] if row else _blank(run_id)).items() if k != "window"}
    return {"active": True, "valid": True, "policy_id": policy.policy_id, "policy_version": policy.policy_version,
            "mode": policy.mode, "reviewed_at": policy.reviewed_at, "run_limits": policy.run_limits.model_dump(),
            "endpoints": [{"family": e.family, "host": e.host, "path": e.path, "model": e.model, "price_status": e.price_status,
                           "verified_at": e.verified_at, "callable": not entry_status(policy, e),
                           "reason": entry_status(policy, e), "app_rate_per_minute": e.app_rate_per_minute} for e in policy.endpoints],
            "usage": usage}


# ------------------------------------------------------------------ preflight (no inference)

def estimate(cases: list[dict], profile: str) -> dict:
    """Worst-case provider use for the selected cases, counting one answer rewrite and one JSON retry."""
    text = ocr = decisions_ = 0
    for c in cases:
        turns = len(c.get("turns") or [1])
        if c.get("kind") == "image":
            ocr += 1
            text += 2 + 5 + (1 if profile == "C" else 0)       # rows (+retry), plan, writer x2, review x2, analyzer
            decisions_ += 3 * 2 + 5 * 2                           # document x2, input + output
        else:
            text += turns * (5 + (1 if profile == "C" else 0))
            decisions_ += turns * 5 * 2
    return {"text_calls": text, "ocr_calls": ocr, "guard_decisions": decisions_,
            "basis": "worst case per case: planner, writer + one rewrite, reviewer + one rewrite, JSON retry; guard 5 labels per message direction, 3 per document check"}


def preflight(policy_path: str | None, *, profile: str, cases: list[dict], env, candidate: dict, effective_slots=None) -> dict:
    blockers, warnings, checks = [], [], {}
    checks["candidate"] = candidate
    if candidate.get("working_tree_dirty"):
        blockers.append("WORKING_TREE_DIRTY: commit the candidate before a live run so results map to one SHA")
    if not policy_path:
        blockers.append("POLICY_MISSING: pass --policy with a reviewed free-only policy")
        policy = None
    else:
        try:
            policy = Policy.model_validate(json.loads(Path(policy_path).read_text(encoding="utf-8")))
        except (OSError, ValueError, ValidationError) as exc:
            policy = None
            blockers.append(f"POLICY_INVALID: {type(exc).__name__}")
    if policy:
        checks["policy"] = {"policy_id": policy.policy_id, "version": policy.policy_version, "mode": policy.mode,
                            "reviewed_by": bool(policy.reviewed_by), "reviewed_at": policy.reviewed_at, "account_label": bool(policy.account_label)}
        if policy.mode != "LIVE_FREE":
            blockers.append("POLICY_NOT_LIVE: an OFFLINE_DOUBLES_ONLY policy cannot authorise live calls")
        if not (policy.reviewed_by and policy.reviewed_at and policy.account_label):
            blockers.append("POLICY_NOT_REVIEWED: reviewed_by, reviewed_at and account_label are required")
        if not policy.data_policy_reviewed:
            blockers.append("DATA_POLICY_NOT_REVIEWED: confirm the providers' data terms allow these synthetic inputs")
        statuses = {}
        for e in policy.endpoints:
            reason = ""
            if e.price_status != VERIFIED:
                reason = "FREE_STATUS_UNVERIFIED"
            else:
                age = _age_days(e.verified_at)
                if age is None or age < 0 or age > MAX_VERIFICATION_AGE_DAYS:
                    reason = "VERIFICATION_STALE_OR_MISSING"
                elif not e.evidence.strip():
                    reason = "VERIFICATION_EVIDENCE_MISSING"
                elif e.price_in_thb_per_mtok or e.price_out_thb_per_mtok:
                    reason = "PRICED_ENTRY_NOT_FREE"
            statuses[f"{e.family} {e.host}{e.path} {e.model}"] = reason or "VERIFIED"
            if reason:
                blockers.append(f"{reason}: {e.family} {e.host}{e.path} model {e.model}")
        checks["endpoints"] = statuses
        need = estimate(cases, profile)
        limits = policy.run_limits
        checks["quota_estimate"] = need
        for key, cap in (("text_calls", limits.text_calls), ("ocr_calls", limits.ocr_calls), ("guard_decisions", limits.guard_decisions)):
            if need[key] > cap:
                blockers.append(f"QUOTA_PLAN_EXCEEDS_CAP: {key} worst case {need[key]} > {cap}; run a smaller suite or resume across days")
        guard = next((e for e in policy.endpoints if e.family == "guard"), None)
        if guard and guard.daily_decisions and need["guard_decisions"] > guard.daily_decisions:
            blockers.append(f"QUOTA_PLAN_EXCEEDS_DAILY_DECISIONS: {need['guard_decisions']} > {guard.daily_decisions}")
    keys = {"LABCLEAR_TRIAL_TYPHOON_API_KEY": bool(env.get("LABCLEAR_TRIAL_TYPHOON_API_KEY")),
            "LABCLEAR_TRIAL_IAPP_API_KEY": bool(env.get("LABCLEAR_TRIAL_IAPP_API_KEY"))}
    checks["credentials_present"] = keys
    for name, present in keys.items():
        if not present:
            blockers.append(f"NO_CREDENTIALS: {name} is not set in the runner's environment (owner's secure channel; never in chat, files or the ZIP)")
    if effective_slots is not None:
        checks["effective_slots"] = effective_slots
        if policy:
            allowed = {(e.host, e.path, e.model) for e in policy.endpoints}
            for slot, s in effective_slots.items():
                if not s.get("will_be_called"):
                    continue
                if (s.get("host"), s.get("path"), s.get("model")) not in allowed:
                    blockers.append(f"EFFECTIVE_SLOT_OUTSIDE_POLICY: {slot} -> {s.get('host')}{s.get('path')} {s.get('model')} (source {s.get('source')})")
    checks["target"] = "local trial server started by the runner (127.0.0.1); production URLs are never accepted"
    checks["inputs"] = "the benchmark dataset is synthetic only and hash-verified by the runner before every run"
    return {"status": "PASS" if not blockers else "BLOCKED", "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "profile": profile, "cases": len(cases), "blockers": blockers, "warnings": warnings, "checks": checks,
            "inference_calls_made": 0}
