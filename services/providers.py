"""AI provider registry and runtime selection.

LabClear uses three model slots:

* ``llm``    — the language model that plans, writes and reviews answers
* ``vision`` — the model that reads a lab report image (OCR)
* ``guard``  — the safety check run on every customer message and every answer

Each agent that writes with the language model (planner, the two assistant roles and the reviewer)
shares the ``llm`` slot by default. A manager can give any of them its own provider, model and key
(slot ``agent_<id>``), for example a different model family for a more independent review.

A manager picks the provider, model and API key for each slot on /staff → AI providers.
The choice is stored encrypted in the business database (the same Fernet store as customer
data). When nothing is saved for a slot, environment variables are used instead
(``LLM_PROVIDER`` / ``LLM_API_KEY`` / ``LLM_MODEL`` and the VISION_ and GUARD_ equivalents).

API keys are never returned to the browser; the admin view only shows the last four characters.
"""
from __future__ import annotations

import ipaddress
import json
import threading
import time
from dataclasses import dataclass
from urllib.parse import urlparse

from config import settings

SLOTS = {
    "llm": "Language model",
    "vision": "Report reading (OCR)",
    "guard": "Safety check",
}

# Agents that use the language model. Each shares the "llm" slot unless it has its own setting.
AGENTS = {
    "plan": ("Planner", "Reads each message and chooses the action, the search and the assistant role."),
    "advisor": ("Health-check Advisor", "Writes answers about packages, booking and payment."),
    "explainer": ("Report Explainer", "Writes explanations of the values in a confirmed lab report."),
    "review": ("Reviewer", "Checks every draft against its sources before it is shown. A different model family makes this check more independent."),
}


def agent_slot(agent: str) -> str:
    return "agent_" + agent


def is_agent(slot: str) -> bool:
    return slot.startswith("agent_") and slot[6:] in AGENTS


def kind_of(slot: str) -> str:
    """The provider capability a slot needs: agents need a language model."""
    return "llm" if is_agent(slot) else slot


def slot_name(slot: str) -> str:
    return AGENTS[slot[6:]][0] + " model" if is_agent(slot) else SLOTS.get(slot, slot).lower()


@dataclass(frozen=True)
class Preset:
    id: str
    label: str
    protocol: str          # openai_chat | anthropic_messages | typhoon_ocr | systemone_iapp | systemone_typesafe
    base_url: str
    default_model: str
    slots: tuple[str, ...]
    price_in: float        # THB per one million input tokens (estimate, editable)
    price_out: float       # THB per one million output tokens
    key_url: str
    vision_model: str = ""  # default model when the preset is used for report reading


# Prices are conservative THB estimates (about 36 THB per USD) used only by the spending cap.
PRESETS: dict[str, Preset] = {p.id: p for p in [
    Preset("typhoon", "Typhoon (SCB 10X)", "openai_chat", "https://api.opentyphoon.ai/v1",
           "typhoon-v2.5-30b-a3b-instruct", ("llm",), 10, 10, "https://playground.opentyphoon.ai"),
    Preset("typhoon_ocr", "Typhoon OCR", "typhoon_ocr", "https://api.opentyphoon.ai/v1",
           "typhoon-ocr", ("vision",), 10, 10, "https://playground.opentyphoon.ai", "typhoon-ocr"),
    Preset("openai", "OpenAI (ChatGPT)", "openai_chat", "https://api.openai.com/v1",
           "gpt-4.1-mini", ("llm", "vision"), 15, 60, "https://platform.openai.com/api-keys", "gpt-4.1-mini"),
    Preset("anthropic", "Anthropic (Claude)", "anthropic_messages", "https://api.anthropic.com/v1",
           "claude-haiku-4-5", ("llm",), 36, 180, "https://console.anthropic.com/settings/keys"),
    Preset("gemini", "Google Gemini", "openai_chat", "https://generativelanguage.googleapis.com/v1beta/openai",
           "gemini-flash-latest", ("llm", "vision"), 11, 90, "https://aistudio.google.com/apikey", "gemini-flash-latest"),
    Preset("huggingface", "Hugging Face", "openai_chat", "https://router.huggingface.co/v1",
           "openai/gpt-oss-120b", ("llm",), 6, 25, "https://huggingface.co/settings/tokens"),
    Preset("openrouter", "OpenRouter", "openai_chat", "https://openrouter.ai/api/v1",
           "openai/gpt-4.1-mini", ("llm", "vision"), 15, 60, "https://openrouter.ai/keys", "openai/gpt-4.1-mini"),
    Preset("xai", "xAI (Grok)", "openai_chat", "https://api.x.ai/v1",
           "grok-4.7", ("llm",), 72, 216, "https://console.x.ai"),
    Preset("moonshot", "Moonshot (Kimi)", "openai_chat", "https://api.moonshot.ai/v1",
           "kimi-k2.6", ("llm",), 22, 90, "https://platform.moonshot.ai/console/api-keys"),
    Preset("qwen", "Alibaba (Qwen)", "openai_chat", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
           "qwen-plus", ("llm",), 15, 45, "https://modelstudio.console.alibabacloud.com"),
    Preset("deepseek", "DeepSeek", "openai_chat", "https://api.deepseek.com",
           "deepseek-chat", ("llm",), 10, 15, "https://platform.deepseek.com/api_keys"),
    Preset("iapp_systemone", "iApp OpenThai-SystemOne", "systemone_iapp",
           "https://api.iapp.co.th/v3/store/openthai/systemone", "openthai-systemone", ("guard",), 0, 0,
           "https://iapp.co.th/en/docs/llm/openthai-systemone"),
    Preset("typesafe_jev", "TypeSafe Jev", "systemone_typesafe", "https://api.typesafe.ai/v1/systemone",
           "jev-latest", ("guard",), 10, 0, "https://docs.typesafe.ai/introduction"),
    Preset("custom", "Custom (OpenAI-compatible)", "openai_chat", "", "", ("llm", "vision"), 0, 0, ""),
]}

# Llama Guard through OpenRouter keeps its own preset so the guard slot can use it.
PRESETS["llama_guard"] = Preset("llama_guard", "Llama Guard 4 (OpenRouter)", "openai_chat", "https://openrouter.ai/api/v1",
                                "meta-llama/llama-guard-4-12b", ("guard",), 7, 7, "https://openrouter.ai/keys")

DEFAULTS = {"llm": "typhoon", "vision": "typhoon_ocr", "guard": "iapp_systemone"}
SETTINGS_ID = "configuration_ai_providers"


class ProviderSetupError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


@dataclass(frozen=True)
class RuntimeProvider:
    slot: str
    preset: str
    label: str
    protocol: str
    base_url: str
    model: str
    api_key: str
    timeout_seconds: float
    enabled: bool
    price: dict
    source: str          # "app" (saved by a manager) or "environment"

    @property
    def ready(self) -> bool:
        return bool(self.enabled and self.api_key and self.model and self.base_url)


# ------------------------------------------------------------ stored settings

_cache: dict = {"at": 0.0, "data": None}
_lock = threading.Lock()
CACHE_SECONDS = 10.0


def _read_saved(tx=None) -> dict:
    from services import business_store as db
    if tx is not None:
        row = tx.get(SETTINGS_ID)
        return row["data"] if row else {}
    with _lock:
        if _cache["data"] is not None and time.time() - _cache["at"] < CACHE_SECONDS:
            return _cache["data"]
    try:
        with db.transaction() as active:
            data = _read_saved(active)
    except Exception:
        data = {}  # storage not configured yet: fall back to environment variables
    with _lock:
        _cache.update(at=time.time(), data=data)
    return data


def clear_cache() -> None:
    with _lock:
        _cache.update(at=0.0, data=None)


def _env(slot: str) -> dict:
    prefix = {"llm": "LLM", "vision": "VISION", "guard": "GUARD"}[slot]
    return {
        "preset": getattr(settings, f"{prefix}_PROVIDER") or DEFAULTS[slot],
        "model": getattr(settings, f"{prefix}_MODEL"),
        "api_key": getattr(settings, f"{prefix}_API_KEY"),
        "base_url": getattr(settings, f"{prefix}_BASE_URL"),
        "enabled": settings.VISION_ENABLED if slot == "vision" else True,
    }


def _env_price(model: str) -> dict | None:
    """Optional MODEL_PRICES_THB override, tolerant of quotes pasted around the JSON."""
    raw = settings.MODEL_PRICES_THB.strip().strip("'").strip()
    if not raw:
        return None
    if raw.startswith('"') and raw.endswith('"'):
        raw = raw[1:-1].replace('\\"', '"')
    try:
        table = json.loads(raw)
        row = table.get(model)
        if row is None:
            return None
        return {"input_per_mtok": float(row["input_per_mtok"]), "output_per_mtok": float(row["output_per_mtok"])}
    except (ValueError, KeyError, TypeError, AttributeError):
        return None


def runtime(slot: str, tx=None) -> RuntimeProvider:
    if slot not in SLOTS and not is_agent(slot):
        raise ProviderSetupError(f"Unknown AI slot: {slot}")
    saved = _read_saved(tx).get(slot)
    if is_agent(slot) and not saved:
        # Shared: the agent uses the language model settings.
        shared = runtime("llm", tx)
        return RuntimeProvider(slot, shared.preset, shared.label, shared.protocol, shared.base_url, shared.model,
                               shared.api_key, shared.timeout_seconds, shared.enabled, shared.price, "shared")
    kind = kind_of(slot)
    row, source = (saved, "app") if saved else (_env(slot), "environment")
    preset = PRESETS.get(row.get("preset") or DEFAULTS[kind]) or PRESETS[DEFAULTS[kind]]
    model = (row.get("model") or (preset.vision_model if slot == "vision" else "") or preset.default_model).strip()
    base_url = (row.get("base_url") or "").strip() if preset.id == "custom" else preset.base_url
    price = None
    if row.get("price_in") is not None and row.get("price_out") is not None:
        price = {"input_per_mtok": float(row["price_in"]), "output_per_mtok": float(row["price_out"])}
    price = price or _env_price(model) or {"input_per_mtok": preset.price_in, "output_per_mtok": preset.price_out}
    timeout = {"llm": settings.LLM_TIMEOUT_SECONDS, "vision": settings.VISION_TIMEOUT_SECONDS,
               "guard": settings.GUARD_TIMEOUT_SECONDS}[kind]
    return RuntimeProvider(slot, preset.id, preset.label, preset.protocol, base_url, model,
                           (row.get("api_key") or "").strip(), timeout, bool(row.get("enabled", True)), price, source)


# ------------------------------------------------------------ admin view and updates

def _mask(key: str) -> str:
    return ("•••• " + key[-4:]) if len(key) >= 8 else ("set" if key else "")


def _view(p: RuntimeProvider, label: str) -> dict:
    return {"label": label, "source": p.source, "preset": p.preset, "provider_label": p.label, "model": p.model,
            "base_url": p.base_url if p.preset == "custom" else "", "enabled": p.enabled,
            "key": _mask(p.api_key), "ready": p.ready,
            "price_in": p.price["input_per_mtok"], "price_out": p.price["output_per_mtok"]}


def public_view(tx) -> dict:
    slots = {slot: _view(runtime(slot, tx), label) for slot, label in SLOTS.items()}
    agents = {agent: {**_view(runtime(agent_slot(agent), tx), label), "slot": agent_slot(agent), "help": help_text}
              for agent, (label, help_text) in AGENTS.items()}
    presets = [{"id": x.id, "label": x.label, "slots": list(x.slots), "default_model": x.default_model,
                "vision_model": x.vision_model, "price_in": x.price_in, "price_out": x.price_out,
                "key_url": x.key_url} for x in PRESETS.values()]
    return {"slots": slots, "agents": agents, "presets": presets, "network_enabled": settings.PROVIDER_NETWORK_ENABLED}


def _check_custom_url(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    local = host in {"localhost", "127.0.0.1", "::1"}
    if parsed.scheme != "https" and not (local and parsed.scheme == "http"):
        raise ProviderSetupError("A custom endpoint must use https:// (http:// is allowed only for localhost).")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ProviderSetupError("A custom endpoint must not contain credentials, a query or a fragment.")
    try:
        ip = ipaddress.ip_address(host)
        if not local and (ip.is_private or ip.is_link_local or ip.is_reserved or ip.is_loopback):
            raise ProviderSetupError("A custom endpoint must not point to a private network address.")
    except ValueError:
        pass  # a host name, not an IP literal
    return url.rstrip("/")


def save(tx, slot: str, preset_id: str, model: str, api_key: str | None, base_url: str,
         enabled: bool, price_in: float | None, price_out: float | None) -> None:
    if slot not in SLOTS and not is_agent(slot):
        raise ProviderSetupError("Unknown AI slot.")
    preset = PRESETS.get(preset_id)
    if not preset or kind_of(slot) not in preset.slots:
        raise ProviderSetupError("This provider cannot be used for this slot.")
    data = dict(_read_saved(tx))
    previous = data.get(slot) or {}
    key = (api_key or "").strip()
    if not key and previous.get("preset") == preset_id:
        key = previous.get("api_key", "")  # blank field keeps the saved key for the same provider
    if not key:
        raise ProviderSetupError("Enter the API key for this provider.")
    if any(c.isspace() for c in key) or len(key) > 400:
        raise ProviderSetupError("The API key looks invalid (it contains spaces or is too long).")
    row = {"preset": preset_id, "model": (model or "").strip()[:120], "api_key": key, "enabled": bool(enabled),
           "base_url": _check_custom_url(base_url.strip()) if preset_id == "custom" else "", "updated_at": time.time()}
    if preset_id == "custom" and not row["base_url"]:
        raise ProviderSetupError("Enter the endpoint URL for the custom provider.")
    if preset_id == "custom" and not row["model"]:
        raise ProviderSetupError("Enter the model name for the custom provider.")
    for name, value in (("price_in", price_in), ("price_out", price_out)):
        if value is not None:
            if not 0 <= value <= 100000:
                raise ProviderSetupError("Prices must be between 0 and 100,000 THB per million tokens.")
            row[name] = float(value)
    data[slot] = row
    tx.put(SETTINGS_ID, "configuration", "system", data)
    clear_cache()


def reset(tx, slot: str) -> None:
    data = dict(_read_saved(tx))
    data.pop(slot, None)
    tx.put(SETTINGS_ID, "configuration", "system", data)
    clear_cache()
