from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from config import settings


class ProviderConfigError(Exception):
    """Raised when local provider configuration cannot be read or validated."""


@dataclass(frozen=True)
class ProviderDefinition:
    provider_id: str
    label: str
    kind: str
    base_url: str
    protocol: str
    default_model: str
    verified: str
    note: str


@dataclass(frozen=True)
class RuntimeProvider:
    provider_id: str
    base_url: str
    model: str
    api_key: str
    timeout_seconds: float
    enabled: bool
    protocol: str


PROVIDER_CATALOG: dict[str, ProviderDefinition] = {
    "iapp_openthai2": ProviderDefinition(
        "iapp_openthai2", "iApp OpenThai 2.0", "llm", "https://api.iapp.co.th/v3/llm/openthai2p0",
        "openai_chat", "openthai2.0", "documentation-reviewed", "Separate from NECTEC OpenThaiLLM. Check current pricing and account access.",
    ),
    "llama_guard": ProviderDefinition(
        "llama_guard", "Llama Guard", "guard", "https://openrouter.ai/api/v1",
        "openai_chat", "meta-llama/llama-guard-4-12b", "contract-tested", "Input and output safety classification for conversation v2.",
    ),
    "typhoon_llm": ProviderDefinition(
        "typhoon_llm", "OpenTyphoon LLM", "llm", "https://api.opentyphoon.ai/v1",
        "openai_chat", "typhoon-v2.5-30b-a3b-instruct", "verified", "OpenAI-compatible chat completions.",
    ),
    "typhoon_ocr": ProviderDefinition(
        "typhoon_ocr", "Typhoon OCR", "ocr", "https://api.opentyphoon.ai/v1",
        "typhoon_ocr_document", "typhoon-ocr", "verified", "Separate OCR document contract using multimodal chat payloads.",
    ),
    "openthai_systemone": ProviderDefinition(
        "openthai_systemone", "OpenThai-SystemOne", "systemone", "https://api.iapp.co.th/v3/store/openthai/systemone",
        "systemone", "openthai-systemone", "verified", "Typed decision API; no generated text; shadow-only by default.",
    ),
    "openrouter": ProviderDefinition(
        "openrouter", "OpenRouter", "llm", "https://openrouter.ai/api/v1", "openai_chat",
        "openai/gpt-4o-mini", "verified", "OpenAI-compatible chat completions.",
    ),
    "openai": ProviderDefinition(
        "openai", "OpenAI", "llm", "https://api.openai.com/v1", "openai_chat", "gpt-4o-mini",
        "verified", "OpenAI-compatible chat completions.",
    ),
    "groq": ProviderDefinition(
        "groq", "Groq", "llm", "https://api.groq.com/openai/v1", "openai_chat", "openai/gpt-oss-20b",
        "verified", "OpenAI-compatible endpoint documented by Groq.",
    ),
    "deepseek": ProviderDefinition(
        "deepseek", "DeepSeek", "llm", "https://api.deepseek.com", "openai_chat", "deepseek-chat",
        "verified", "OpenAI-compatible chat completions.",
    ),
    "huggingface": ProviderDefinition(
        "huggingface", "Hugging Face Inference", "llm", "https://router.huggingface.co/v1", "openai_chat",
        "openai/gpt-oss-120b:fastest", "verified", "OpenAI-compatible chat endpoint; provider selection is model-suffix based.",
    ),
    "lmstudio": ProviderDefinition(
        "lmstudio", "LM Studio (local)", "llm", "http://127.0.0.1:1234/v1", "openai_chat", "",
        "verified", "Local OpenAI-compatible server; no remote key is required.",
    ),
    "opencode": ProviderDefinition(
        "opencode", "OpenCode-compatible", "llm", "http://127.0.0.1:4096/v1", "openai_chat", "",
        "compatibility", "Compatibility slot; endpoint remains fixed to the local OpenCode bridge.",
    ),
    "gemini": ProviderDefinition(
        "gemini", "Google Gemini", "llm", "https://generativelanguage.googleapis.com/v1beta/openai", "openai_chat",
        "gemini-2.5-flash", "compatibility", "Gemini OpenAI-compatibility path; verify account/model access before live use.",
    ),
    "claude": ProviderDefinition(
        "claude", "Anthropic Claude", "llm", "https://api.anthropic.com/v1", "anthropic_messages",
        "claude-sonnet-4-5", "verified", "Native Messages API requires a separate adapter; not used by the current chat path.",
    ),
    "maxplus": ProviderDefinition(
        "maxplus", "MaxPlus AI", "llm", "https://api.maxplus-ai.cc/v1", "openai_chat",
        "gpt-5.4-mini", "verified", "OpenAI-compatible pool endpoint; paid entitlement is owner-controlled and never a fallback.",
    ),
}

SLOT_DEFAULTS: dict[str, tuple[str, bool]] = {
    "guard": ("llama_guard", True),
    "llm": ("typhoon_llm", True),
    "ocr": ("typhoon_ocr", True),
    "systemone": ("openthai_systemone", False),
}
SLOT_PROVIDER_IDS: dict[str, set[str]] = {
    "guard": {"llama_guard"},
    "llm": {provider_id for provider_id, definition in PROVIDER_CATALOG.items() if definition.kind == "llm"},
    "ocr": {"typhoon_ocr"},
    "systemone": {"openthai_systemone"},
}

_STORE_LOCK = threading.RLock()


def _default_state() -> dict[str, Any]:
    return {
        "version": 1,
        "providers": {
            slot: {
                "provider_id": provider_id,
                "enabled": enabled,
                "model": PROVIDER_CATALOG[provider_id].default_model,
                "timeout_seconds": 60.0,
                "api_key": None,
                "shadow_mode": slot == "systemone",
            }
            for slot, (provider_id, enabled) in SLOT_DEFAULTS.items()
        },
        "updated_at": None,
    }


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _storage_key() -> bytes:
    configured = settings.ADMIN_SECRET_STORAGE_KEY.strip()
    if configured:
        return hashlib.sha256(configured.encode("utf-8")).digest()
    if not settings.LOCAL_DEMO_MODE or os.getenv("RENDER"):
        raise ProviderConfigError("Local secret persistence is disabled outside local-demo mode.")
    key_path = Path(settings.ADMIN_SETTINGS_PATH).with_suffix(".key")
    key_path.parent.mkdir(parents=True, exist_ok=True)
    if key_path.exists():
        try:
            key = _unb64(key_path.read_text(encoding="ascii").strip())
            if len(key) == 32:
                return key
        except (OSError, ValueError):
            pass
    key = secrets.token_bytes(32)
    key_path.write_text(_b64(key), encoding="ascii")
    return key


def _crypt(secret: str) -> str:
    key = _storage_key()
    nonce = secrets.token_bytes(16)
    plaintext = secret.encode("utf-8")
    ciphertext = bytearray()
    for counter in range((len(plaintext) + 31) // 32):
        block = hmac.new(key, nonce + counter.to_bytes(4, "big"), hashlib.sha256).digest()
        start = counter * 32
        ciphertext.extend(a ^ b for a, b in zip(plaintext[start : start + 32], block))
    tag = hmac.new(key, nonce + bytes(ciphertext), hashlib.sha256).digest()
    return "v1." + _b64(nonce + bytes(ciphertext) + tag)


def _decrypt(value: str | None) -> str | None:
    if not value:
        return None
    if not value.startswith("v1."):
        raise ProviderConfigError("Provider secret storage format is invalid.")
    raw = _unb64(value[3:])
    if len(raw) < 48:
        raise ProviderConfigError("Provider secret storage format is invalid.")
    key = _storage_key()
    nonce, ciphertext, tag = raw[:16], raw[16:-32], raw[-32:]
    expected = hmac.new(key, nonce + ciphertext, hashlib.sha256).digest()
    if not hmac.compare_digest(expected, tag):
        raise ProviderConfigError("Provider secret storage integrity check failed.")
    plaintext = bytearray()
    for counter in range((len(ciphertext) + 31) // 32):
        block = hmac.new(key, nonce + counter.to_bytes(4, "big"), hashlib.sha256).digest()
        start = counter * 32
        plaintext.extend(a ^ b for a, b in zip(ciphertext[start : start + 32], block))
    return bytes(plaintext).decode("utf-8")


def _path() -> Path:
    return Path(settings.ADMIN_SETTINGS_PATH)


def _validate_state(state: Any) -> dict[str, Any]:
    if not isinstance(state, dict) or state.get("version") != 1 or not isinstance(state.get("providers"), dict):
        raise ProviderConfigError("Provider configuration is invalid.")
    defaults = _default_state()
    # Add the new guard slot without rewriting keys, counters or older slots.
    state["providers"].setdefault("guard", defaults["providers"]["guard"])
    for slot in SLOT_DEFAULTS:
        row = state["providers"].get(slot)
        if not isinstance(row, dict):
            raise ProviderConfigError("Provider configuration is invalid.")
        provider_id = row.get("provider_id")
        if provider_id not in SLOT_PROVIDER_IDS[slot]:
            raise ProviderConfigError("Provider selection is not allowlisted.")
        if not isinstance(row.get("enabled"), bool) or not isinstance(row.get("model"), str):
            raise ProviderConfigError("Provider configuration is invalid.")
        timeout = row.get("timeout_seconds")
        if not isinstance(timeout, (int, float)) or not 1 <= float(timeout) <= 300:
            raise ProviderConfigError("Provider timeout must be between 1 and 300 seconds.")
        row.setdefault("shadow_mode", defaults["providers"][slot]["shadow_mode"])
        if row["shadow_mode"] != (slot == "systemone"):
            raise ProviderConfigError("SystemOne shadow mode cannot be disabled by this surface.")
    return state


class ProviderSettingsStore:
    """Local-only encrypted provider settings; cloud persistence is intentionally unsupported."""

    def read(self) -> dict[str, Any]:
        path = _path()
        with _STORE_LOCK:
            if not path.exists():
                return _default_state()
            try:
                state = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError) as exc:
                raise ProviderConfigError("Provider configuration could not be read.") from exc
            state = _validate_state(state)
            for row in state["providers"].values():
                row["api_key"] = _decrypt(row.get("api_key"))
            return state

    def write(self, state: dict[str, Any]) -> None:
        if not settings.LOCAL_DEMO_MODE or os.getenv("RENDER"):
            raise ProviderConfigError("Provider settings can be persisted only in explicit local-demo mode.")
        state = _validate_state(state)
        payload = json.loads(json.dumps(state))
        for row in payload["providers"].values():
            if row.get("api_key"):
                row["api_key"] = _crypt(row["api_key"])
        payload["updated_at"] = int(time.time())
        path = _path()
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        with _STORE_LOCK:
            temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            temporary.replace(path)

    def update(self, slot: str, values: dict[str, Any]) -> dict[str, Any]:
        return self.update_many({slot: values})

    def update_many(self, updates: dict[str, dict[str, Any]]) -> dict[str, Any]:
        if not updates or any(slot not in SLOT_DEFAULTS for slot in updates):
            raise ProviderConfigError("Unknown provider slot.")
        state = self.read()
        for slot, values in updates.items():
            row = state["providers"][slot]
            row.update({key: values[key] for key in ("provider_id", "enabled", "model", "timeout_seconds") if key in values})
            if values.get("clear_api_key"):
                row["api_key"] = None
            elif values.get("api_key"):
                row["api_key"] = values["api_key"]
        self.write(state)
        return state


def public_snapshot(state: dict[str, Any] | None = None) -> dict[str, Any]:
    state = state or ProviderSettingsStore().read()
    providers: dict[str, Any] = {}
    for slot, row in state["providers"].items():
        definition = PROVIDER_CATALOG[row["provider_id"]]
        providers[slot] = {
            "slot": slot,
            "provider_id": row["provider_id"],
            "label": definition.label,
            "enabled": row["enabled"],
            "model": row["model"],
            "timeout_seconds": row["timeout_seconds"],
            "configured": bool(row.get("api_key")) or (slot == "llm" and bool(settings.LLM_API_KEY)) or (slot == "ocr" and bool(settings.VISION_API_KEY)) or (slot == "guard" and bool(settings.GUARD_API_KEY)),
            "shadow_mode": bool(row.get("shadow_mode")),
            "protocol": definition.protocol,
            "endpoint": definition.base_url,
            "verified": definition.verified,
            "note": definition.note,
        }
    return {
        "local_demo_mode": bool(settings.LOCAL_DEMO_MODE and not os.getenv("RENDER")),
        "persistence": "local-only" if settings.LOCAL_DEMO_MODE and not os.getenv("RENDER") else "blocked-online",
        "providers": providers,
        "catalog": {
            provider_id: {
                "label": definition.label,
                "kind": definition.kind,
                "endpoint": definition.base_url,
                "protocol": definition.protocol,
                "default_model": definition.default_model,
                "verified": definition.verified,
                "note": definition.note,
            }
            for provider_id, definition in PROVIDER_CATALOG.items()
        },
    }


def runtime_provider(slot: str, *, fallback_base_url: str, fallback_model: str, fallback_key: str, fallback_timeout: float) -> RuntimeProvider:
    try:
        state = ProviderSettingsStore().read()
        row = state["providers"].get(slot)
        if row and row.get("enabled") and row.get("api_key"):
            definition = PROVIDER_CATALOG[row["provider_id"]]
            return RuntimeProvider(
                row["provider_id"], definition.base_url, row["model"], row["api_key"],
                float(row["timeout_seconds"]), True, definition.protocol,
            )
    except ProviderConfigError:
        pass
    return RuntimeProvider(
        "environment", fallback_base_url.rstrip("/"), fallback_model, fallback_key,
        float(fallback_timeout), bool(fallback_key), "openai_chat",
    )


def catalog_for_slot(slot: str) -> list[dict[str, Any]]:
    return [
        {
            "provider_id": provider_id,
            "label": definition.label,
            "endpoint": definition.base_url,
            "protocol": definition.protocol,
            "default_model": definition.default_model,
            "verified": definition.verified,
            "note": definition.note,
        }
        for provider_id, definition in PROVIDER_CATALOG.items()
        if provider_id in SLOT_PROVIDER_IDS.get(slot, set())
    ]
