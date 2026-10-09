"""Bounded AI provider calls: one attempt, no fallback, no request-body logging, no secrets in errors.

Every call first counts against the durable call cap (PROVIDER_BUDGET_CYCLE_ID / CLOUD_CALL_LIMIT)
and the project THB ledger, both stored in the business database. With FREE_ONLY_POLICY_PATH set
(free-first trial), services/free_policy.py checks the exact endpoint/model and the shared quota
before either of them, so a refused call never reaches the network."""
from __future__ import annotations

import asyncio
import os
import re
from typing import Any
from urllib.parse import urlparse

import logging

import httpx
from config import settings
from services.providers import RuntimeProvider


log = logging.getLogger("labclear.provider")

_SLOT_NAMES = {"guard": "safety check", "llm": "language model", "vision": "report reader"}


def _name(slot: str) -> str:
    from services.providers import is_agent, slot_name
    return slot_name(slot) if is_agent(slot) else _SLOT_NAMES.get(slot, slot)
_STATUS_HINTS = {400: "request not accepted", 401: "API key not accepted", 402: "no credit left on the account",
                 403: "key not allowed to use this model", 404: "model name or URL not found",
                 413: "request too large", 422: "request not accepted", 429: "rate or usage limit reached"}
_SECRETISH = re.compile(r"(sk-[A-Za-z0-9_-]{6,}|Bearer\s+\S+|[A-Za-z0-9_-]{32,})")


def rejection_error(slot: str, status: int, detail: str = "", label: str = "") -> "ConversationError":
    """Name the service and HTTP status so the owner can fix the right setting; never echo secrets."""
    name = f"The {_name(slot)}" + (f" ({label})" if label else "")
    hint = _STATUS_HINTS.get(status, "server error" if status >= 500 else "request refused")
    # Provider errors can echo prompts, reports or credentials in arbitrary formats.
    # Keep metadata only: redacting key-like strings cannot protect Guest content.
    log.warning("provider_rejected slot=%s status=%s", slot, status)
    return ConversationError("provider_rejected",
        f"{name} rejected the request (HTTP {status}: {hint}). Check its key, model and usage limit.", 502)


class ConversationError(Exception):
    def __init__(self, code: str, message: str, status: int = 503):
        self.code, self.message, self.status = code, message, status
        super().__init__(message)


def provider_for(slot: str) -> RuntimeProvider:
    from services.providers import runtime
    return runtime(slot)


def validate_server_url(url: str) -> str:
    """Only server configuration supplies endpoints; never accept a model/user URL."""
    parsed = urlparse(url)
    local = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if parsed.username or parsed.password or parsed.query or parsed.fragment or not parsed.hostname:
        raise ConversationError("endpoint_invalid", "A provider endpoint is invalid.")
    if parsed.scheme != "https" and not (local and parsed.scheme == "http"):
        raise ConversationError("endpoint_invalid", "Provider endpoints must use HTTPS.")
    return url.rstrip("/")


async def reserve(slot: str):
    if not settings.PROVIDER_NETWORK_ENABLED:
        raise ConversationError("offline", "AI is not connected yet. The site owner needs to set PROVIDER_NETWORK_ENABLED=true.")
    return _reserve_durable(slot)


def _reserve_durable(slot: str):
    """Call cap kept in the business database (SQLite locally, PostgreSQL when hosted).

    The cap is the owner-configured PROVIDER_BUDGET_CYCLE_ID with CLOUD_CALL_LIMIT calls; the count
    survives restarts and redeploys, and failed calls count too. A new cycle ID starts a new count.
    The THB ledger (cost_ledger) still applies on top of this count."""
    import time
    from services import business_store as db
    cycle = settings.PROVIDER_BUDGET_CYCLE_ID
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,79}", cycle) or not 1 <= settings.CLOUD_CALL_LIMIT <= 100000:
        raise ConversationError("cycle_required", "Configure PROVIDER_BUDGET_CYCLE_ID and a positive CLOUD_CALL_LIMIT before enabling AI.")
    with db.transaction() as tx:
        key = "provider_calls_" + db.digest(cycle)
        row = tx.get(key)
        data = row["data"] if row else {"cycle": cycle, "used": 0, "by_slot": {}, "started_at": time.time()}
        if data["used"] >= settings.CLOUD_CALL_LIMIT:
            raise ConversationError("budget_exhausted", "The configured call limit is exhausted. Contact the administrator.", 429)
        data["used"] += 1
        data["by_slot"][slot] = data["by_slot"].get(slot, 0) + 1
        data.update(limit=settings.CLOUD_CALL_LIMIT, last_at=time.time())
        tx.put(key, "provider_calls", "system", data, "open")
    return None


def durable_call_status() -> dict | None:
    """Count for the configured cycle, for the staff budget view."""
    from services import business_store as db
    with db.transaction() as tx:
        row = tx.get("provider_calls_" + db.digest(settings.PROVIDER_BUDGET_CYCLE_ID or "-"))
    data = row["data"] if row else {}
    return {"cycle": settings.PROVIDER_BUDGET_CYCLE_ID or None, "used": data.get("used", 0), "limit": settings.CLOUD_CALL_LIMIT,
            "by_slot": data.get("by_slot", {}), "storage": "postgresql" if os.getenv("DATABASE_URL") else "sqlite"}


def _settle_gate(gate, usage, outcome: str) -> None:
    if gate is not None:
        from services import free_policy
        free_policy.settle(gate, usage, outcome)


async def post_json(url: str, headers: dict[str, str], body: dict, slot: str, timeout: float,
                    price: dict | None = None, model: str = "", label: str = "") -> dict:
    endpoint = validate_server_url(url)
    gate = None
    if settings.FREE_ONLY_POLICY_PATH:
        if not settings.PROVIDER_NETWORK_ENABLED:
            raise ConversationError("offline", "AI is not connected yet. The site owner needs to set PROVIDER_NETWORK_ENABLED=true.")
        from services import free_policy
        gate = await free_policy.admit(endpoint, model or str(body.get("model") or ""), body)
        price = gate.price  # zero only because the reviewed policy verified this exact endpoint as free
    await reserve(slot)
    from services import cost_ledger
    # THB reservation after the call-count gate; both must pass before any request.
    cost = cost_ledger.reserve(model or str(body.get("model") or slot + "-service"), body, price)
    try:
        async with httpx.AsyncClient(timeout=min(timeout, 75), follow_redirects=False) as client:
            async with client.stream("POST", endpoint, headers=headers, json=body) as response:
                if response.status_code >= 300:
                    detail = ""
                    try:
                        detail = (await response.aread())[:2000].decode("utf-8", "replace")
                    except Exception:
                        pass
                    raise rejection_error(slot, response.status_code, detail, label)
                data = bytearray()
                async for chunk in response.aiter_bytes():
                    data.extend(chunk)
                    if len(data) > 1_000_000:
                        raise ConversationError("provider_response_invalid", "A service returned an oversized response.", 502)
                import json
                result = json.loads(data)
                if not isinstance(result, dict):
                    raise ValueError
        cost_ledger.settle(cost, result.get("usage"), "succeeded")
        _settle_gate(gate, result.get("usage"), "succeeded")
        return result
    except asyncio.CancelledError:
        cost_ledger.settle(cost, None, "cancelled")
        _settle_gate(gate, None, "cancelled")
        raise
    except (httpx.HTTPError, ValueError, ConversationError) as exc:
        cost_ledger.settle(cost, None, "failed")
        _settle_gate(gate, None, "failed")
        if isinstance(exc, ConversationError):
            raise
        raise ConversationError("service_unavailable", "A connected service could not complete this request. Please try again.", 502) from None


async def complete(messages: list[dict], *, slot: str = "llm", json_mode: bool = False, max_tokens: int = 2400) -> str:
    provider = provider_for(slot)
    if not provider.ready:
        raise ConversationError("provider_not_configured",
            f"The {_name(slot)} is not set up. A manager can add it on /staff → AI providers.")
    if provider.protocol not in {"openai_chat", "anthropic_messages", "typhoon_ocr"}:
        raise ConversationError("provider_not_configured", f"{provider.label} cannot be used for this step.")
    headers = {"Authorization": f"Bearer {provider.api_key}", "Content-Type": "application/json"}
    payload: dict[str, Any] = {"model": provider.model, "messages": messages, "stream": False}
    from services.providers import UPGRADE_AGENTS
    if provider.preset == 'openrouter' and slot.removeprefix('agent_') in UPGRADE_AGENTS:
        if not provider.provider_allowlist:
            raise ConversationError('data_policy', 'Configure reviewed OpenRouter endpoint IDs for this role.', 409)
        payload['provider'] = {'only': list(provider.provider_allowlist), 'allow_fallbacks': False,
                               'data_collection': 'deny', 'zdr': True}
    # OpenAI's current models take max_completion_tokens; other compatible APIs use max_tokens.
    payload["max_completion_tokens" if provider.preset == "openai" else "max_tokens"] = max_tokens
    endpoint = provider.base_url.rstrip("/") + "/chat/completions"
    if slot == "guard":
        payload["temperature"] = 0
    from services.model_registry import supports_response_format
    if json_mode and supports_response_format(provider.model):
        payload["response_format"] = {"type": "json_object"}
    if provider.protocol == "anthropic_messages":
        payload = {"model": provider.model, "max_tokens": max_tokens,
            "system": "\n".join(m["content"] for m in messages if m["role"] == "system"),
            "messages": [m for m in messages if m["role"] != "system"]}
        headers = {"x-api-key": provider.api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"}
        endpoint = provider.base_url.rstrip("/") + "/messages"
    data = await post_json(endpoint, headers, payload, slot, provider.timeout_seconds,
                           provider.price, provider.model, provider.label)
    try:
        if provider.protocol == "anthropic_messages":
            if data.get("stop_reason") in {"max_tokens", "refusal"}:
                raise ValueError
            raw = "".join(x["text"] for x in data["content"] if x.get("type") == "text")
        else:
            choice = data["choices"][0]
            if choice.get("finish_reason") in {"length", "content_filter"}:
                raise ValueError
            raw = choice["message"]["content"]
        if not isinstance(raw, str) or not raw.strip() or len(raw) > 50_000:
            raise ValueError
        return raw.strip()
    except (KeyError, IndexError, TypeError, ValueError):
        raise ConversationError("provider_response_invalid", "The model returned an incomplete response. Please try again.", 502) from None
