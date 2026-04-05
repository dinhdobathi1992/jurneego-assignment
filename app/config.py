"""
Application configuration — loads settings from environment variables.

Uses pydantic-settings so every config value is validated at startup.
If a required env var is missing, the app fails fast with a clear error.
"""

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """All configuration for the application, loaded from .env or environment."""

    # ---------- Database ----------
    database_url: str = "postgresql://jurnee:jurnee_secret@db:5432/jurnee_ai"

    # ---------- AI Provider ----------
    # "mock" = no external API needed (for testing/local dev)
    # "bedrock" = AWS Bedrock (Claude)
    # "litellm" = LiteLLM proxy (supports 100+ models)
    ai_provider: str = "mock"

    # ---------- AWS Bedrock ----------
    aws_region: str = "us-east-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    bedrock_model_id: str = "anthropic.claude-3-haiku-20240307-v1:0"

    # ---------- LiteLLM ----------
    litellm_api_base: str = "http://litellm:4000"
    litellm_model: str = "gpt-4o-mini"
    litellm_api_key: str = ""

    # ---------- Authentication ----------
    # Comma-separated list of valid API keys, e.g. "key1,key2"
    api_keys: list[str] = ["jurnee-demo-key-change-me"]

    @field_validator("api_keys", mode="before")
    @classmethod
    def parse_api_keys(cls, v: object) -> list[str]:
        if isinstance(v, str):
            return [k.strip() for k in v.split(",") if k.strip()]
        return v  # type: ignore[return-value]

    # ---------- Safety ----------
    safety_enabled: bool = True
    safety_llm_check: bool = False

    # ---------- Application ----------
    app_env: str = "development"
    log_level: str = "INFO"
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


# Single global instance — import this everywhere
settings = Settings()
