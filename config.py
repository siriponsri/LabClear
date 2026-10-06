from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # App / brand
    APP_NAME: str = "LabClear"
    APP_ENV: str = "development"
    # Same-origin UI needs no CORS. Set an explicit comma-separated allowlist
    # only when a separate trusted frontend must call this API.
    CORS_ALLOWED_ORIGINS: str = ""

    # LLM: OpenAI-compatible provider (Typhoon by default)
    LLM_BASE_URL: str = "https://api.opentyphoon.ai/v1"
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "typhoon-v2.5-30b-a3b-instruct"
    LLM_TIMEOUT_SECONDS: float = 60.0

    # Product behavior
    CHAT_RATE_LIMIT_REQUESTS: int = 120
    CHAT_RATE_LIMIT_WINDOW_SECONDS: int = 60
    # Optional local provider overrides file (never used on a hosted deployment).
    LOCAL_DEMO_MODE: bool = False
    ADMIN_SETTINGS_PATH: str = "data/admin_settings.json"
    ADMIN_SECRET_STORAGE_KEY: str = ""

    # Provider calls are off until the owner enables them. Hosted: calls are counted in
    # PostgreSQL per PROVIDER_BUDGET_CYCLE_ID up to CLOUD_CALL_LIMIT. Local: SQLite file.
    PROVIDER_NETWORK_ENABLED: bool = False
    PROVIDER_BUDGET_PATH: str = "data/provider_budget.sqlite3"
    PROVIDER_BUDGET_CYCLE_ID: str = ""
    PROVIDER_BUDGET_LLM_LIMIT: int = 5
    PROVIDER_BUDGET_OCR_LIMIT: int = 5
    PROVIDER_BUDGET_SYSTEMONE_LIMIT: int = 5

    # Vision/OCR is opt-in. A text-capable model is never assumed to support images.
    VISION_ENABLED: bool = False
    VISION_BASE_URL: str = "https://api.opentyphoon.ai/v1"
    VISION_API_KEY: str = ""
    VISION_MODEL: str = "typhoon-ocr"
    VISION_TIMEOUT_SECONDS: float = 60.0
    IMAGE_MAX_BYTES: int = 3 * 1024 * 1024
    IMAGE_MAX_PIXELS: int = 12 * 1000 * 1000
    MAX_EXTRACTION_FIELDS: int = 30

    # Safety model (Llama Guard 4 via OpenRouter) screens every input and answer.
    GUARD_BASE_URL: str = "https://openrouter.ai/api/v1"
    GUARD_API_KEY: str = ""
    GUARD_MODEL: str = "meta-llama/llama-guard-4-12b"
    GUARD_SERVICE_URL: str = ""
    GUARD_SERVICE_TOKEN: str = ""
    GUARD_TIMEOUT_SECONDS: float = 20.0
    # Optional: when set, AI requests must send this code (12+ characters) in X-LabClear-Access.
    DEMO_ACCESS_CODE: str = ""
    CLOUD_CALL_LIMIT: int = 200

    # Project-total THB cost ledger (300 THB for the whole
    # project, not monthly). Fail-closed: unknown prior spend or an
    # unpriced model blocks paid calls. Prices are THB per one million tokens.
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
