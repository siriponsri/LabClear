"""Project-total THB cost ledger for provider calls.

The whole project may spend at most PROJECT_BUDGET_THB
(300 THB) until coursework submission. This is a running total, never a monthly or
per-deployment allowance, and it is stored in the durable business database so a
restart or redeploy cannot reset it.

Every call reserves its worst-case cost atomically before the request. After the
response, the reservation is settled with reported usage when available. A failed,
cancelled or timed-out call keeps its full reservation (it may have been billed).
Unknown prior spend or an unpriced model blocks the call (fail closed).
"""
from __future__ import annotations

import json
import math
import secrets
import time
from dataclasses import dataclass

from config import settings
from services.conversation_transport import ConversationError

LEDGER_ID = "cost_ledger_project"


@dataclass
class CostReservation:
    id: str
    model: str
    estimate_thb: float
    price: dict | None = None


def prices() -> dict[str, dict[str, float]]:
    """Optional MODEL_PRICES_THB override table. Quotes pasted around the JSON are tolerated."""
    raw = settings.MODEL_PRICES_THB.strip().strip("'").strip()
    if raw.startswith('"') and raw.endswith('"'):
        raw = raw[1:-1].replace('\\"', '"')
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return {str(k): {"input_per_mtok": float(v["input_per_mtok"]), "output_per_mtok": float(v["output_per_mtok"])}
                for k, v in data.items()}
    except (ValueError, KeyError, TypeError, AttributeError):
        raise ConversationError("price_table_invalid",
            'MODEL_PRICES_THB is not valid JSON. Remove it (prices then come from /staff → AI providers) or use '
            '{"model": {"input_per_mtok": 10, "output_per_mtok": 10}}.', 503) from None


def prior_spend() -> float:
    raw = settings.PROJECT_BUDGET_PRIOR_SPEND_THB.strip()
    if raw == "":
        raise ConversationError("budget_prior_unknown",
                                "Set PROJECT_BUDGET_PRIOR_SPEND_THB to the amount already spent before enabling paid calls.", 503)
    try:
        value = float(raw)
    except ValueError:
        raise ConversationError("budget_prior_unknown", "PROJECT_BUDGET_PRIOR_SPEND_THB must be a number.", 503) from None
    if not math.isfinite(value) or value < 0:
        raise ConversationError("budget_prior_unknown", "PROJECT_BUDGET_PRIOR_SPEND_THB cannot be negative.", 503)
    return value


def _count_tokens(body: dict) -> int:
    """UTF-8 byte upper bound for text tokens plus configured image allowance.

    Character/3 undercounts Thai. Image pricing still requires owner verification.
    """
    images = 0
    text_chars = 0

    def walk(value):
        nonlocal images, text_chars
        if isinstance(value, dict):
            if value.get("type") in ("image_url", "image", "input_image"):
                images += 1
                return
            for key, item in value.items():
                if key in ("model", "max_tokens", "stream", "temperature", "response_format"):
                    continue
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)
        elif isinstance(value, str):
            text_chars += len(value.encode('utf-8'))

    walk(body)
    return text_chars + 256 + images * settings.COST_IMAGE_TOKEN_ESTIMATE


def estimate(model: str, body: dict, price: dict | None = None) -> float:
    if price is None:
        table = prices()
        if model not in table:
            raise ConversationError("price_unknown", "No price is set for this model. Set it on /staff → AI providers.", 503)
        price = table[model]
    if any(not math.isfinite(float(price[k])) or float(price[k]) < 0
           for k in ("input_per_mtok", "output_per_mtok")):
        raise ConversationError("price_unknown", "Model prices must be finite and non-negative.", 503)
    output = int(body.get("max_completion_tokens") or body.get("max_tokens") or 512)
    if output < 1 or output > 100000:
        raise ConversationError("token_limit_invalid", "Invalid output token limit.", 503)
    return round((_count_tokens(body) * price["input_per_mtok"] + output * price["output_per_mtok"]) / 1_000_000, 6)


def _ledger(tx) -> dict:
    row = tx.get(LEDGER_ID)
    return row["data"] if row else {"settled_thb": 0.0, "reserved_thb": 0.0, "calls": 0, "created": time.time()}


def status() -> dict:
    from services import business_store as db
    cap = settings.PROJECT_BUDGET_THB
    try:
        prior = prior_spend()
    except ConversationError:
        prior = None
    try:
        with db.transaction() as tx:
            data = _ledger(tx)
    except ConversationError:
        return {"available": False, "cap_thb": cap, "scope": "project_total"}
    used = data["settled_thb"] + data["reserved_thb"]
    return {
        "available": True, "scope": "project_total", "cap_thb": cap, "prior_spend_thb": prior,
        "settled_thb": round(data["settled_thb"], 4), "reserved_thb": round(data["reserved_thb"], 4), "calls": data["calls"],
        "remaining_thb": None if prior is None else round(max(0.0, cap - prior - used), 4),
        "priced_models": _priced_models(),
        "enabled": settings.COST_LEDGER_ENABLED,
    }


def _priced_models() -> list[str]:
    try:
        from services.providers import SLOTS, runtime
        return sorted({runtime(slot).model for slot in SLOTS if runtime(slot).model})
    except Exception:
        return []


def reserve(model: str, body: dict, price: dict | None = None) -> CostReservation | None:
    if not settings.COST_LEDGER_ENABLED:
        return None
    from services import business_store as db
    cost = estimate(model, body, price)
    prior = prior_spend()
    if not math.isfinite(settings.PROJECT_BUDGET_THB) or settings.PROJECT_BUDGET_THB <= 0:
        raise ConversationError("budget_invalid", "The project budget must be finite and positive.", 503)
    with db.transaction() as tx:
        data = _ledger(tx)
        if prior + data["settled_thb"] + data["reserved_thb"] + cost > settings.PROJECT_BUDGET_THB:
            raise ConversationError("budget_exhausted",
                                    "The configured project AI budget would be exceeded. AI replies are paused; non-AI features still work.", 429)
        data["reserved_thb"] += cost
        data["calls"] += 1
        tx.put(LEDGER_ID, "cost_ledger", "system", data, "active")
        rid = "cost_" + secrets.token_hex(10)
        tx.put(rid, "cost_entry", "system", {"model": model, "estimate_thb": cost, "at": time.time()}, "reserved")
    return CostReservation(rid, model, cost, price)


def settle(reservation: CostReservation | None, usage: dict | None, outcome: str) -> float | None:
    if reservation is None:
        return
    from services import business_store as db
    actual = reservation.estimate_thb
    if outcome == "succeeded" and isinstance(usage, dict):
        try:
            price = reservation.price or prices()[reservation.model]
            prompt = int(usage.get("prompt_tokens", usage.get("input_tokens")))
            completion = int(usage.get("completion_tokens", usage.get("output_tokens")))
            if prompt < 0 or completion < 0:
                raise ValueError
            actual = round((prompt * price["input_per_mtok"] + completion * price["output_per_mtok"]) / 1_000_000, 6)
        except (KeyError, TypeError, ValueError):
            actual = reservation.estimate_thb  # usage missing: keep the conservative estimate
    with db.transaction() as tx:
        entry = tx.get(reservation.id)
        if not entry or entry['state'] != 'reserved':
            return  # settlement retries must not charge the same reservation twice
        data = _ledger(tx)
        data["reserved_thb"] = max(0.0, data["reserved_thb"] - reservation.estimate_thb)
        data["settled_thb"] += actual
        tx.put(LEDGER_ID, "cost_ledger", "system", data, "active")
        if entry:
            entry["data"].update(actual_thb=actual, outcome=outcome, settled_at=time.time())
            tx.put(reservation.id, "cost_entry", "system", entry["data"], "settled")
    return actual
