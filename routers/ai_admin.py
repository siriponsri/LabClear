"""Manager-only AI provider settings: pick the provider, model and API key for each slot.

Keys are stored encrypted in the business database and are never sent back to the browser.
Every change is written to the audit log (without the key).
"""
from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import Field

from config import settings
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
def view(request: Request):
    with db.transaction() as tx:
        _manager(tx, request)
        data = providers.public_view(tx)
    from services import agent_tools, free_policy, runtime_skills
    manifest = runtime_skills._manifest()
    data["free_policy"] = free_policy.status()
    data["harness"] = {"tools_schema": agent_tools.SCHEMA_VERSION,
                       "tools": [{k: t[k] for k in ("name", "version", "scope", "timeout_seconds", "max_items", "description")} for t in agent_tools.describe()],
                       "skills": {"package": manifest["id"], "version": manifest["version"], "enabled": settings.RUNTIME_SKILLS_ENABLED,
                                  "modules": [{"file": name, "id": meta["id"], "version": meta["version"], "sha256": manifest["modules"][name][:16]}
                                              for name, meta in manifest.get("module_meta", {}).items()]}}
    return data


@router.get('/registry')
def candidate_registry(request: Request):
    with db.transaction() as tx:
        _manager(tx, request)
    from services.model_registry import registry
    return registry()


@router.put("/{slot}")
def update(slot: str, body: ProviderInput, request: Request):
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
def remove(slot: str, request: Request):
    with db.transaction() as tx:
        user = _manager(tx, request)
        providers.reset(tx, _slot(slot))
        tx.audit(user["id"], f"ai_provider.reset.{slot}", slot)
        return providers.public_view(tx)


@router.post("/{slot}/test")
async def test(slot: str, request: Request):
    """One small real call through the normal cap and THB ledger. Runs outside the DB transaction,
    as an admitted workflow with its own deadline (services/execution.py)."""
    from services import execution
    def manager(tx):
        return _manager(tx, request)["id"]
    owner = await execution.offload(_in_tx, manager)
    slot = _slot(slot)
    ctx = execution.start("/api/business/staff/ai-providers/test", "ai", owner)
    return await execution.respond(request, ctx, lambda emit: _test(slot, request))


def _in_tx(fn):
    with db.transaction() as tx:
        return fn(tx)


async def _test(slot: str, request: Request):
    from services import execution
    provider = providers.runtime(slot)
    identity = {"provider": provider.preset, "model": provider.model}
    def record(ok, tx):
        user = _manager(tx, request)
        providers.record_test(tx, slot, provider, ok)
        tx.audit(user['id'], 'ai_provider.test.'+('passed' if ok else 'failed'), slot)
    async def receipt(ok):
        await execution.offload(_in_tx, lambda tx: record(ok, tx))
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
        await receipt(ok)
        if ok:
            return {"ok": True, "status": "LIVE_TESTED", **identity,
                    "message": "The model returned valid JSON for this test only. Medical accuracy and role suitability are not verified."}
        return {"ok": False, "message": "The language model replied, but not with the JSON the chat needs. "
                                        "Try another model for this provider."}
    if slot == "guard":
        await conversation_guard.check("What does an HbA1c test measure?", "input")
        await receipt(True)
        return {"ok": True, "status": "LIVE_TESTED", **identity, "message": "The safety check classified one normal question as safe; broader safety evaluation is not verified."}
    return {"ok": False, "status": "NOT_RUN", **identity,
            "message": "OCR was not called. To test it explicitly, open My reports and use a synthetic sample; provider charges may apply."}
