"""Manager-only AI provider settings: pick the provider, model and API key for each slot.

Keys are stored encrypted in the business database and are never sent back to the browser.
Every change is written to the audit log (without the key).
"""
from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import Field

from routers.business import ConversationError, Strict, staff
from services import business_store as db
from services import providers

router = APIRouter(prefix="/api/business/staff/ai-providers")


class ProviderInput(Strict):
    preset: str = Field(min_length=2, max_length=40)
    model: str = Field(default="", max_length=120)
    api_key: str = Field(default="", max_length=400)
    base_url: str = Field(default="", max_length=300)
    enabled: bool = True
    price_in: float | None = Field(default=None, ge=0, le=100000)
    price_out: float | None = Field(default=None, ge=0, le=100000)
    provider_allowlist: list[str] = Field(default_factory=list, max_length=10)


def _manager(tx, request):
    user = staff(tx, request)
    if user["data"]["role"] != "manager":
        raise ConversationError("forbidden", "Manager access required.", 403)
    return user


def _slot(slot: str) -> str:
    if slot not in providers.SLOTS and not providers.is_agent(slot):
        raise ConversationError("not_found", "Unknown AI slot.", 404)
    return slot


@router.get("")
async def view(request: Request):
    with db.transaction() as tx:
        _manager(tx, request)
        return providers.public_view(tx)


@router.get('/registry')
async def candidate_registry(request: Request):
    with db.transaction() as tx:
        _manager(tx, request)
    from services.model_registry import registry
    return registry()


@router.put("/{slot}")
async def update(slot: str, body: ProviderInput, request: Request):
    with db.transaction() as tx:
        user = _manager(tx, request)
        try:
            providers.save(tx, _slot(slot), body.preset, body.model, body.api_key, body.base_url,
                           body.enabled, body.price_in, body.price_out, body.provider_allowlist)
        except providers.ProviderSetupError as exc:
            raise ConversationError("provider_setup", exc.message, 422) from None
        tx.audit(user["id"], f"ai_provider.saved.{slot}.{body.preset}", slot)
        return providers.public_view(tx)


@router.delete("/{slot}")
async def remove(slot: str, request: Request):
    with db.transaction() as tx:
        user = _manager(tx, request)
        providers.reset(tx, _slot(slot))
        tx.audit(user["id"], f"ai_provider.reset.{slot}", slot)
        return providers.public_view(tx)


@router.post("/{slot}/test")
async def test(slot: str, request: Request):
    """One small real call through the normal cap and THB ledger. Runs outside the DB transaction."""
    with db.transaction() as tx:
        _manager(tx, request)
    slot = _slot(slot)
    provider = providers.runtime(slot)
    identity = {"provider": provider.preset, "model": provider.model}
    from services import conversation_guard, conversation_transport as transport
    if providers.kind_of(slot) == "llm":
        # The chat needs JSON replies, so test exactly that rather than free text.
        from services.conversation_agent import extract_json
        raw = await transport.complete([
            {"role": "system", "content": "Return only a JSON object."},
            {"role": "user", "content": 'Reply with {"ok": true, "language": "Thai"}.'}],
            slot=slot, json_mode=True, max_tokens=300)
        try:
            ok = extract_json(raw).get("ok") in (True, "true")
        except ValueError:
            ok = False
        if ok:
            return {"ok": True, "status": "LIVE_TESTED", **identity,
                    "message": "The model returned valid JSON for this test only. Medical accuracy and role suitability are not verified."}
        return {"ok": False, "message": "The language model replied, but not with the JSON the chat needs. "
                                        "Try another model for this provider."}
    if slot == "guard":
        await conversation_guard.check("What does an HbA1c test measure?", "input")
        return {"ok": True, "status": "LIVE_TESTED", **identity, "message": "The safety check classified one normal question as safe; broader safety evaluation is not verified."}
    return {"ok": False, "status": "NOT_RUN", **identity,
            "message": "OCR was not called. To test it explicitly, open My reports and use a synthetic sample; provider charges may apply."}
