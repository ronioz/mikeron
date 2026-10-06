"""Closing prices: a provider interface and a database-backed cache in front of it."""

import http.client
import json
import logging
import threading
import urllib.error
import urllib.request
from collections.abc import Callable, Iterable, Sequence
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from functools import lru_cache
from typing import Annotated, NamedTuple, Protocol
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from fastapi import Depends
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Close, CloseFetch

logger = logging.getLogger(__name__)

# After a failed lookup, wait this long before asking the provider again. Its
# free plan allows eight requests a minute, so a minute later there is room.
RETRY_DELAY = timedelta(seconds=60)
# Seconds to wait for one ticker's closes: twenty years of days, about 600 kB.
TIMEOUT = 10
# The most days the provider hands over in one request: about twenty years.
MAX_DAYS = 5000
# How the provider says it has nothing for a ticker: not one it knows (400,
# 404) or one outside the plan (403). Asking again a minute later won't help.
NO_DATA = {400, 403, 404}

# Every ticker here trades on a US exchange. They shut at 16:00 in New York,
# and an hour later the day's close has settled. Until they shut, the provider
# reports the latest price as the day's close.
MARKET = ZoneInfo("America/New_York")
FINAL_AT = time(17, 0)


class DayClose(NamedTuple):
    day: date
    close: Decimal


def last_settlement(now: datetime) -> datetime:
    """The latest moment at which a trading day's close became final."""
    local = now.astimezone(MARKET)
    day = local.date() if local.time() >= FINAL_AT else local.date() - timedelta(days=1)
    # No trading on Saturday or Sunday. A holiday isn't known here: it only
    # costs one request that brings nothing new.
    while day.weekday() > 4:
        day -= timedelta(days=1)
    return datetime.combine(day, FINAL_AT, MARKET)


class CloseProvider(Protocol):
    def fetch(self, tickers: Sequence[str]) -> dict[str, list[DayClose] | None]:
        """Return each ticker's closes, oldest first, or None where it has none.

        Tickers whose lookup failed (network error, rate limit) are left out.
        The day going on may be among them, with the latest price as its close.
        """
        ...


class TwelveDataProvider:
    def __init__(self, api_key: str, base_url: str) -> None:
        if not base_url.startswith(("https://", "http://")):
            raise ValueError("TWELVE_DATA_BASE_URL must be an http(s) URL")
        self._base_url = base_url.rstrip("/")
        # The key goes in a header so it never appears in URLs or error messages.
        self._headers = {
            "Authorization": f"apikey {api_key}",
            "User-Agent": "mikeron-trade-journal",
        }

    def fetch(self, tickers: Sequence[str]) -> dict[str, list[DayClose] | None]:
        # One request brings one ticker's days, so ask for them side by side.
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(self._fetch_one, tickers))
        return {ticker: closes for ticker, (ok, closes) in zip(tickers, results, strict=True) if ok}

    def _fetch_one(self, ticker: str) -> tuple[bool, list[DayClose] | None]:
        # Closes come adjusted for share splits unless asked otherwise.
        query = urlencode({"symbol": ticker, "interval": "1day", "outputsize": MAX_DAYS})
        request = urllib.request.Request(
            f"{self._base_url}/time_series?{query}", headers=self._headers
        )
        try:
            try:
                with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                    body = json.load(response)
                # A refusal can also arrive as an ordinary answer that says "error".
                refused = body["code"] if body["status"] == "error" else None
            except urllib.error.HTTPError as exc:
                refused = exc.code
            if refused in NO_DATA:
                return True, None
            if refused is not None:
                raise ValueError(f"the provider answered {refused}")
            closes = sorted(
                DayClose(date.fromisoformat(bar["datetime"][:10]), Decimal(bar["close"]))
                for bar in body["values"]
            )
        except (
            OSError,  # connection problems, timeouts and HTTP error statuses
            http.client.HTTPException,
            ArithmeticError,
            KeyError,
            TypeError,
            ValueError,
        ) as exc:
            logger.warning("Closing prices lookup failed for %s: %s", ticker, exc)
            return False, None
        return True, closes


class CloseCache:
    """Serves closes from the database, fetching a ticker's again once a new close is final."""

    def __init__(
        self,
        provider: CloseProvider | None,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._provider = provider
        self._clock = clock
        self._lock = threading.Lock()
        self._retry_after = datetime.min.replace(tzinfo=UTC)

    @property
    def enabled(self) -> bool:
        return self._provider is not None

    def get(
        self, db: Session, tickers: Iterable[str], since: date | None = None
    ) -> dict[str, list[DayClose]]:
        """Return each ticker's final closes from `since` on, oldest first.

        A ticker has none if the provider has nothing for it or couldn't be
        asked yet. With closing prices turned off the result is always empty.
        """
        wanted = set(tickers)
        if self._provider is None or not wanted:
            return {}
        now = self._clock()
        if self._stale(db, wanted, now):
            with self._lock:
                # Another request may have fetched these tickers while this one waited.
                stale = self._stale(db, wanted, now)
                if stale:
                    self._refresh(db, self._provider, stale, now)
        closes: dict[str, list[DayClose]] = {ticker: [] for ticker in wanted}
        stored = select(Close.ticker, Close.day, Close.close).where(Close.ticker.in_(wanted))
        if since is not None:
            stored = stored.where(Close.day >= since)
        for ticker, day, close in db.execute(stored.order_by(Close.day)):
            closes[ticker].append(DayClose(day, close))
        return closes

    def _stale(self, db: Session, wanted: set[str], now: datetime) -> set[str]:
        if now < self._retry_after:
            return set()
        fresh = db.scalars(
            select(CloseFetch.ticker).where(
                CloseFetch.ticker.in_(wanted), CloseFetch.fetched_at >= last_settlement(now)
            )
        )
        return wanted - set(fresh)

    def _refresh(
        self, db: Session, provider: CloseProvider, stale: set[str], now: datetime
    ) -> None:
        histories = provider.fetch(sorted(stale))
        if len(histories) < len(stale):
            self._retry_after = now + RETRY_DELAY
        if not histories:
            return
        final = last_settlement(now).date()
        for ticker, closes in histories.items():
            # With nothing from the provider, whatever was stored earlier stays.
            if closes is None:
                continue
            # The whole history is replaced: a share split changes every earlier close.
            db.execute(delete(Close).where(Close.ticker == ticker))
            days = {day: close for day, close in closes if day <= final}
            if days:
                db.execute(
                    insert(Close),
                    [{"ticker": ticker, "day": day, "close": close} for day, close in days.items()],
                )
        asked = insert(CloseFetch).values(
            [{"ticker": ticker, "fetched_at": now} for ticker in histories]
        )
        db.execute(
            asked.on_conflict_do_update(
                index_elements=[CloseFetch.ticker],
                set_={"fetched_at": asked.excluded.fetched_at},
            )
        )
        db.commit()


@lru_cache
def get_close_cache() -> CloseCache:
    settings = get_settings()
    provider = None
    if settings.twelve_data_api_key:
        provider = TwelveDataProvider(settings.twelve_data_api_key, settings.twelve_data_base_url)
    return CloseCache(provider)


Closes = Annotated[CloseCache, Depends(get_close_cache)]
