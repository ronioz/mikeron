"""Shared test setup: a throwaway database, stand-in prices and closes, and an email outbox.

The tests need the Docker database running (docker compose up -d db). They
create the database mikeronn_test, empty it before every test and drop it at
the end. They never touch the real database: the address is set below, before
any app code runs, and a name like the real database's is refused.
"""

import os
import re
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from helpers import PROJECT, drop, recreate, scratch_url, sign_up

TEST_DB = "mikeronn_test"

# app/db.py builds its engine from these when first imported, so they are set
# before anything imports the app. scratch_url refuses the real database.
os.environ.update(
    DATABASE_URL=scratch_url(TEST_DB),
    FINNHUB_API_KEY="",
    TWELVE_DATA_API_KEY="",
    MAIL_BACKEND="log",
    SIGN_UP_OPEN="true",
)


@pytest.fixture(scope="session", autouse=True)
def database() -> Iterator[None]:
    from alembic import command
    from alembic.config import Config

    recreate(TEST_DB)
    command.upgrade(Config(str(PROJECT / "alembic.ini")), "head")
    yield
    from app.db import engine

    engine.dispose()
    drop(TEST_DB)


@pytest.fixture(autouse=True)
def empty_database() -> None:
    from sqlalchemy import text

    from app import limits
    from app.db import engine

    with engine.begin() as conn:
        # Sessions, codes and trades go with the users they belong to.
        conn.execute(
            text("TRUNCATE users, trades, quotes, closes, close_fetches RESTART IDENTITY CASCADE")
        )
    for limit in limits.ALL:
        limit.clear()


class Outbox:
    """Stands in for the mail service: keeps what would have been sent."""

    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str]] = []

    def send(self, to: str, subject: str, text: str) -> None:
        self.sent.append((to, subject, text))

    def to(self, email: str) -> list[tuple[str, str, str]]:
        return [message for message in self.sent if message[0] == email]

    def code_for(self, email: str) -> str:
        """The code in the latest email to the address."""
        messages = self.to(email)
        assert messages, f"no email to {email}"
        found = re.search(r"\b(\d{6})\b", messages[-1][1])
        assert found, f"the latest email to {email} has no code: {messages[-1][1]!r}"
        return found.group(1)


# Fixed prices in place of Finnhub's. Other tickers are unknown to it.
PRICES = {"SPY": Decimal(600), "MU": Decimal(100)}


class StandInPrices:
    def fetch(self, tickers):
        return {ticker: PRICES.get(ticker) for ticker in tickers}


class StandInCloses:
    """Stands in for Twelve Data: hands out the closes a test gives it and notes what was asked."""

    def __init__(self) -> None:
        # Per ticker, (day, close) pairs. A ticker not listed is unknown to it.
        self.closes: dict[str, list[tuple]] = {}
        # Tickers whose lookup fails, as during an outage or over the rate limit.
        self.failing: set[str] = set()
        self.asked: list[list[str]] = []

    def fetch(self, tickers):
        self.asked.append(list(tickers))
        return {
            ticker: self.closes.get(ticker) for ticker in tickers if ticker not in self.failing
        }


class Clock:
    """The time the closes are asked for, which a test can move."""

    def __init__(self) -> None:
        # A Tuesday evening in New York (18:00), an hour after that day's close settled.
        self.now = datetime(2026, 10, 6, 22, 0, tzinfo=UTC)


@pytest.fixture
def outbox() -> Outbox:
    return Outbox()


@pytest.fixture
def closes() -> StandInCloses:
    return StandInCloses()


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def app(outbox: Outbox, closes: StandInCloses, clock: Clock):
    from app.closes import CloseCache, get_close_cache
    from app.mail import get_mailer
    from app.main import app
    from app.prices import QuoteCache, get_quote_cache

    prices = QuoteCache(StandInPrices(), timedelta(0))
    close_cache = CloseCache(closes, lambda: clock.now)
    app.dependency_overrides[get_quote_cache] = lambda: prices
    app.dependency_overrides[get_close_cache] = lambda: close_cache
    app.dependency_overrides[get_mailer] = lambda: outbox
    yield app
    app.dependency_overrides.clear()


@pytest.fixture
def new_client(app) -> Iterator[Callable[[], object]]:
    """Makes test clients, each a browser of its own with its own cookies."""
    from fastapi.testclient import TestClient

    clients = []

    def make() -> TestClient:
        client = TestClient(app)
        clients.append(client)
        return client

    yield make
    for client in clients:
        client.close()


@pytest.fixture
def account(new_client, outbox: Outbox):
    """Makes a confirmed account and returns a browser signed in to it."""
    from app import limits

    def make(email: str = "ana@example.com", password: str = "ana-password-1", **plan):
        client = new_client()
        response = sign_up(client, email, password, **plan)
        assert response.status_code == 202, response.text
        code = outbox.code_for(email)
        response = client.post("/api/auth/confirm", json={"email": email, "code": code})
        assert response.status_code == 200, response.text
        # Setting up isn't what a test checks, so its emails don't count
        # against the test's own.
        limits.CODE_EMAILS_PER_MINUTE.clear()
        limits.CODE_EMAILS_PER_HOUR.clear()
        return client

    return make
