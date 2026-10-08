from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "LabClear"
    APP_ENV: str = "development"
    # Same-origin UI needs no CORS. Set an explicit comma-separated allowlist
    # only when a separate trusted frontend must call this API.
    CORS_ALLOWED_ORIGINS: str = ""

    # CEO upgrade: opt-in only. Existing deployments keep their current paths.
    LANDING_PREVIEW_ENABLED: bool = False
    ORG_DOCUMENTS_ENABLED: bool = False
    ORG_REFERENCE_INFERENCE_ENABLED: bool = False
    HOSPITAL_LINKS_ENABLED: bool = False
    RUNTIME_SKILLS_ENABLED: bool = False
    MEDICAL_HARNESS_ENABLED: bool = False

    # AI providers. A manager can override all of these on /staff → AI providers;
    # these variables are the fallback when nothing is saved there.
    # Provider ids: see services/providers.py (typhoon, openai, anthropic, gemini, huggingface,
    # openrouter, xai, moonshot, qwen, deepseek, custom; guard: iapp_systemone, typesafe_jev, llama_guard).
    LLM_PROVIDER: str = "typhoon"
    LLM_API_KEY: str = ""
    LLM_MODEL: str = ""             # empty = the provider's default model
    LLM_BASE_URL: str = ""          # only for LLM_PROVIDER=custom
    LLM_TIMEOUT_SECONDS: float = 60.0

    VISION_ENABLED: bool = False
    VISION_PROVIDER: str = "typhoon_ocr"
    VISION_API_KEY: str = ""
    VISION_MODEL: str = ""
    VISION_BASE_URL: str = ""
    VISION_TIMEOUT_SECONDS: float = 60.0
    IMAGE_MAX_BYTES: int = 3 * 1024 * 1024
    IMAGE_MAX_PIXELS: int = 12 * 1000 * 1000
    MAX_EXTRACTION_FIELDS: int = 30

    GUARD_PROVIDER: str = "iapp_systemone"
    GUARD_API_KEY: str = ""
    GUARD_MODEL: str = ""
    GUARD_BASE_URL: str = ""
    GUARD_TIMEOUT_SECONDS: float = 20.0

    # Product behavior
    CHAT_RATE_LIMIT_REQUESTS: int = 120
    CHAT_RATE_LIMIT_WINDOW_SECONDS: int = 60
    # Optional: when set, AI requests must send this code (12+ characters) in X-LabClear-Access.
    DEMO_ACCESS_CODE: str = ""

    # Spending controls (server owner only). AI calls are off until PROVIDER_NETWORK_ENABLED=true.
    # Every call is counted in the business database per PROVIDER_BUDGET_CYCLE_ID up to
    # CLOUD_CALL_LIMIT; a new cycle ID starts a new count.
    PROVIDER_NETWORK_ENABLED: bool = False
    PROVIDER_BUDGET_CYCLE_ID: str = ""
    CLOUD_CALL_LIMIT: int = 200

    # Project-total THB cost ledger (not monthly). Fail-closed: the prior spend must be stated.
    # Prices come from the provider settings (THB per one million tokens); MODEL_PRICES_THB is an
    # optional JSON override: {"model-name": {"input_per_mtok": 10, "output_per_mtok": 10}}.
    COST_LEDGER_ENABLED: bool = True
    PROJECT_BUDGET_THB: float = 300.0
    PROJECT_BUDGET_PRIOR_SPEND_THB: str = ""
    MODEL_PRICES_THB: str = ""
    COST_IMAGE_TOKEN_ESTIMATE: int = 1500

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
