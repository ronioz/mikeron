from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Docker Compose passes these in as environment variables. When the app is
    # run directly during development, the same .env file is read from here.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://trades:trades@localhost:5432/trades"
    # Whether anyone can create an account. Existing accounts work either way.
    sign_up_open: bool = True
    # How long a browser or the app stays signed in after it was last used.
    session_days: int = 90
    # "log" writes emails into the server log instead of sending them, fine on
    # one computer. "smtp" sends them through the server below (Resend's, say).
    mail_backend: Literal["log", "smtp"] = "log"
    smtp_host: str = ""
    # 465 is encrypted from the start; any other port (587) upgrades with STARTTLS.
    smtp_port: int = 465
    smtp_username: str = ""
    smtp_password: str = ""
    # Who emails come from, such as "Mikeronn <codes@example.com>".
    mail_from: str = ""
    # Empty key turns live prices off; everything else keeps working.
    finnhub_api_key: str = ""
    finnhub_base_url: str = "https://finnhub.io/api/v1"
    # How long a fetched price is reused before asking the provider again.
    price_ttl_seconds: int = 60
    # Closing prices for the graph. Empty key turns the graph off.
    twelve_data_api_key: str = ""
    twelve_data_base_url: str = "https://api.twelvedata.com"

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
