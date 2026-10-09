from __future__ import annotations

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "LabClear"
    APP_ENV: str = "development"
    # Same-origin UI needs no CORS. Set an explicit comma-separated allowlist
    # only when a separate trusted frontend must call this API.
    CORS_ALLOWED_ORIGINS: str = ""
    # Optional: exact browser origins of a separate front end whose proxy may call /api. Empty keeps
    # the default rule: the browser Origin must equal this service's own Host.
    TRUSTED_ORIGINS: str = ""

    # CEO upgrade: opt-in only. Existing deployments keep their current paths.
    LANDING_PREVIEW_ENABLED: bool = False
    ORG_DOCUMENTS_ENABLED: bool = False
    ORG_REFERENCE_INFERENCE_ENABLED: bool = False
    HOSPITAL_LINKS_ENABLED: bool = False
    RUNTIME_SKILLS_ENABLED: bool = False
    MEDICAL_HARNESS_ENABLED: bool = False
    # Test environments only (APP_ENV=test): extra JSON list of author-generated synthetic fixture hashes
    # the medical harness may accept as uploads; see services/synthetic_fixtures.py.
    SYNTHETIC_FIXTURE_MANIFEST: str = ""

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

    # Free-first trial profile (off by default). FREE_ONLY_POLICY_PATH names a reviewed policy of exact
    # free endpoint/model tuples; every provider call must match it and pass its shared quota before the
    # call cap, the ledger and the network. See services/free_policy.py and
    # docs/testing.md (Live free-tier runs). The two other values are set by the benchmark servers.
    FREE_ONLY_POLICY_PATH: str = ""
    FREE_ONLY_RUN_ID: str = ""
    FREE_ONLY_ALLOW_OFFLINE_DOUBLES: bool = False

    # Request resilience (docs/operations/resilience.md). One single-process service: these limits
    # are per instance. A deadline covers the whole workflow (admission, storage, providers, OCR and
    # finalization); a bounded cleanup runs after it.
    CHAT_DEADLINE_SECONDS: float = Field(220.0, ge=30, le=600)
    REPORT_DEADLINE_SECONDS: float = Field(150.0, ge=30, le=600)
    STREAM_HEARTBEAT_SECONDS: float = Field(10.0, ge=2, le=30)
    AI_MAX_IN_FLIGHT: int = Field(2, ge=1, le=16)
    OCR_MAX_IN_FLIGHT: int = Field(1, ge=1, le=16)
    # Automatic transport retries are not implemented (P1: idempotency first); only 0 is accepted.
    PROVIDER_TRANSPORT_RETRIES: int = Field(0, ge=0, le=0)
    # Report files are rasterized in a separate, killable process with these limits.
    DOCUMENT_WORKER_SECONDS: float = Field(30.0, ge=2, le=120)
    DOCUMENT_WORKER_MEMORY_MB: int = Field(384, ge=192, le=4096)
    # On SIGTERM: stop admitting work, let in-flight requests finish, cancel what remains after this.
    SHUTDOWN_DRAIN_SECONDS: float = Field(20.0, ge=1, le=25)

    @model_validator(mode="after")
    def _resilience_limits(self):
        if self.OCR_MAX_IN_FLIGHT > self.AI_MAX_IN_FLIGHT:
            raise ValueError("OCR_MAX_IN_FLIGHT must not exceed AI_MAX_IN_FLIGHT: report reading counts toward the AI limit.")
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
