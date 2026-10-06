"""Bounded provider calls for v2; no retry, fallback, request-body logging or secrets in errors."""
from __future__ import annotations

import asyncio
import os
import re
from typing import Any
from urllib.parse import urlparse

import logging

import httpx
from config import settings
from services.provider_budget import reserve_provider_attempt, finish_provider_attempt, ProviderBudgetError
from services.provider_config import runtime_provider, RuntimeProvider


log = logging.getLogger("labclear.provider")

_SERVICE_NAMES = {"guard": "The safety check (OpenRouter Llama Guard)", "llm": "The Typhoon language model",
                  "vision": "Typhoon OCR"}
_STATUS_HINTS = {400: "request not accepted", 401: "API key not accepted", 402: "no credit left on the account",
                 403: "key not allowed to use this model", 404: "model name or URL not found",
                 413: "request too large", 422: "request not accepted", 429: "rate or usage limit reached"}
_SECRETISH = re.compile(r"(sk-[A-Za-z0-9_-]{6,}|Bearer\s+\S+|[A-Za-z0-9_-]{32,})")


def rejection_error(slot: str, status: int, detail: str = "") -> "ConversationError":
    """Name the service and HTTP status so the owner can fix the right setting; never echo secrets."""
    name = _SERVICE_NAMES.get(slot, f"The {slot} service")
    hint = _STATUS_HINTS.get(status, "server error" if status >= 500 else "request refused")
    snippet = _SECRETISH.sub("[redacted]", " ".join(detail.split()))[:300]
    log.warning("provider_rejected slot=%s status=%s detail=%s", slot, status, snippet)
    return ConversationError("provider_rejected",
        f"{name} rejected the request (HTTP {status}: {hint}). Check its key, model and usage limit.", 502)


class ConversationError(Exception):
    def __init__(self, code: str, message: str, status: int = 503):
        self.code, self.message, self.status = code, message, status
        super().__init__(message)


def provider_for(slot: str) -> RuntimeProvider:
    if slot == "guard":
        return runtime_provider("guard", fallback_base_url=settings.GUARD_BASE_URL,
            fallback_model=settings.GUARD_MODEL, fallback_key=settings.GUARD_API_KEY,
            fallback_timeout=settings.GUARD_TIMEOUT_SECONDS)
    vision = slot == "vision"
    return runtime_provider("ocr" if vision else "llm",
        fallback_base_url=settings.VISION_BASE_URL if vision else settings.LLM_BASE_URL,
        fallback_model=settings.VISION_MODEL if vision else settings.LLM_MODEL,
        fallback_key=settings.VISION_API_KEY if vision else settings.LLM_API_KEY,
        fallback_timeout=settings.VISION_TIMEOUT_SECONDS if vision else settings.LLM_TIMEOUT_SECONDS)


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
        raise ConversationError("offline", "AI is not connected yet. The site owner needs to add the model keys and set PROVIDER_NETWORK_ENABLED=true.")
    if os.getenv("DATABASE_URL"):
        return _reserve_durable(slot)
    try:
        # Guard/retrieval calls consume the LLM allowance; vision consumes OCR.
        return reserve_provider_attempt("ocr" if slot == "vision" else "llm", "ocr" if slot == "vision" else "chat")
    except ProviderBudgetError as exc:
        raise ConversationError(exc.code, exc.message, 429 if "exhausted" in exc.code else 503) from None


def _reserve_durable(slot: str):
    """Hosted call cap kept in the business PostgreSQL database (Render and similar hosts).

    Hosts such as Render's free plan wipe the disk on every restart and offer no shell, so the
    local SQLite cycle cannot be created or kept there. The cap is the owner-configured
    PROVIDER_BUDGET_CYCLE_ID with CLOUD_CALL_LIMIT calls; the count survives restarts and
    redeploys. A new cycle ID starts a new count.
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
    """Count for the configured cycle when the durable hosted cap is in use, for the staff budget view."""
    if not os.getenv("DATABASE_URL"):
        return None
    from services import business_store as db
    with db.transaction() as tx:
        row = tx.get("provider_calls_" + db.digest(settings.PROVIDER_BUDGET_CYCLE_ID or "-"))
    data = row["data"] if row else {}
    return {"cycle": settings.PROVIDER_BUDGET_CYCLE_ID or None, "used": data.get("used", 0), "limit": settings.CLOUD_CALL_LIMIT,
            "by_slot": data.get("by_slot", {}), "storage": "postgresql"}


def finish(reservation, outcome: str, reason: str | None = None):
    if reservation:
        try:
            finish_provider_attempt(reservation, outcome, reason)
        except ProviderBudgetError:
            pass  # Reservation remains consumed; never refund an uncertain call.


async def post_json(url: str, headers: dict[str, str], body: dict, slot: str, timeout: float) -> dict:
    endpoint = validate_server_url(url)
    reservation = await reserve(slot)
    from services import cost_ledger
    try:
        # THB reservation after the call-count gate; both must pass before any request.
        cost = cost_ledger.reserve(str(body.get("model") or slot + "-service"), body)
    except ConversationError:
        finish(reservation, "failed", "cost_blocked")
        raise
    try:
        async with httpx.AsyncClient(timeout=min(timeout, 75), follow_redirects=False) as client:
            async with client.stream("POST", endpoint, headers=headers, json=body) as response:
                if response.status_code >= 300:
                    detail = ""
                    try:
                        detail = (await response.aread())[:2000].decode("utf-8", "replace")
                    except Exception:
                        pass
                    raise rejection_error(slot, response.status_code, detail)
                data = bytearray()
                async for chunk in response.aiter_bytes():
                    data.extend(chunk)
                    if len(data) > 1_000_000:
                        raise ConversationError("provider_response_invalid", "A service returned an oversized response.", 502)
                import json
                result = json.loads(data)
                if not isinstance(result, dict):
                    raise ValueError
        finish(reservation, "succeeded")
        cost_ledger.settle(cost, result.get("usage"), "succeeded")
        return result
    except asyncio.CancelledError:
        finish(reservation, "failed", "cancelled")
        cost_ledger.settle(cost, None, "cancelled")
        raise
    except (httpx.HTTPError, ValueError, ConversationError) as exc:
        finish(reservation, "failed", "request_failed")
        cost_ledger.settle(cost, None, "failed")
        if isinstance(exc, ConversationError):
            raise
        raise ConversationError("service_unavailable", "A connected service could not complete this request. Please try again.", 502) from None


async def complete(messages: list[dict], *, slot: str = "llm", json_mode: bool = False, max_tokens: int = 2400) -> str:
    provider = provider_for(slot)
    if not provider.enabled or not provider.api_key or not provider.model:
        raise ConversationError("provider_not_configured", f"The {slot} model is not configured. Add its API key to the server environment.")
    headers = {"Authorization": f"Bearer {provider.api_key}", "Content-Type": "application/json"}
    payload: dict[str, Any] = {"model": provider.model, "messages": messages, "stream": False, "max_tokens": max_tokens}
    endpoint = provider.base_url.rstrip("/") + "/chat/completions"
    if slot == "guard":
        payload["temperature"] = 0
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    if provider.protocol == "anthropic_messages":
        payload = {"model": provider.model, "max_tokens": max_tokens,
            "system": "\n".join(m["content"] for m in messages if m["role"] == "system"),
            "messages": [m for m in messages if m["role"] != "system"]}
        headers = {"x-api-key": provider.api_key, "anthropic-version": "2023-06-01"}
        endpoint = provider.base_url.rstrip("/") + "/messages"
    data = await post_json(endpoint, headers, payload, slot, provider.timeout_seconds)
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
