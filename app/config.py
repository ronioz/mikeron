from decimal import Decimal
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Docker Compose passes these in as environment variables. When the app is
    # run directly during development, the same .env file is read from here.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://trades:trades@localhost:5432/trades"
    monthly_budget: Decimal = Decimal(30)
    app_username: str = "admin"
    # Empty password disables the login prompt (fine locally, set one when hosting).
    app_password: str = ""
    # Empty key turns live prices off; everything else keeps working.
    finnhub_api_key: str = ""
    finnhub_base_url: str = "https://finnhub.io/api/v1"
    # How long a fetched price is reused before asking the provider again.
    price_ttl_seconds: int = 60

    @field_validator("database_url")
    @classmethod
    def use_psycopg3_driver(cls, value: str) -> str:
        # Hosting providers hand out postgres:// or postgresql:// URLs, which
        # SQLAlchemy would route to the psycopg2 driver we don't install.
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix):]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
