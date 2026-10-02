"""Live prices: a provider interface and a database-backed cache in front of it."""

import http.client
import json
import logging
import threading
import urllib.request
from collections.abc import Iterable, Sequence
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from functools import lru_cache
from typing import Annotated, Protocol
from urllib.parse import urlencode

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Quote

logger = logging.getLogger(__name__)

# After a failed lookup, wait this long before asking the provider again, so an
# outage or a rate limit doesn't add a timeout to every page load.
RETRY_DELAY = timedelta(seconds=60)
# Seconds to wait for the provider before giving up on a price.
TIMEOUT = 3


class PriceProvider(Protocol):
    def fetch(self, tickers: Sequence[str]) -> dict[str, Decimal | None]:
        """Return the current price per ticker, or None where the ticker is unknown.

        Tickers whose lookup failed (network error, rate limit) are left out.
        """
        ...


class FinnhubProvider:
    def __init__(self, api_key: str, base_url: str) -> None:
        if not base_url.startswith(("https://", "http://")):
            raise ValueError("FINNHUB_BASE_URL must be an http(s) URL")
        self._base_url = base_url.rstrip("/")
        # The key goes in a header so it never appears in URLs or error messages.
        self._headers = {"X-Finnhub-Token": api_key, "User-Agent": "mikeron-trade-journal"}

    def fetch(self, tickers: Sequence[str]) -> dict[str, Decimal | None]:
        # Finnhub quotes one symbol per request, so ask for them side by side.
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(self._fetch_one, tickers))
        return {ticker: price for ticker, (ok, price) in zip(tickers, results, strict=True) if ok}

    def _fetch_one(self, ticker: str) -> tuple[bool, Decimal | None]:
        url = f"{self._base_url}/quote?{urlencode({'symbol': ticker})}"
        request = urllib.request.Request(url, headers=self._headers)
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                current = json.load(response, parse_float=Decimal)["c"]
            # Finnhub answers an unknown symbol with zeros rather than an error.
            price = Decimal(current) if current else None
        except (
            OSError,  # connection problems, timeouts and HTTP error statuses
            http.client.HTTPException,
            ArithmeticError,
            KeyError,
            TypeError,
            ValueError,
        ) as exc:
            logger.warning("Price lookup failed for %s: %s", ticker, exc)
            return False, None
        return True, price


class QuoteCache:
    """Serves quotes from the database, refreshing out-of-date ones from the provider."""

    def __init__(self, provider: PriceProvider | None, ttl: timedelta) -> None:
        self._provider = provider
        self._ttl = ttl
        self._lock = threading.Lock()
        self._retry_after = datetime.min.replace(tzinfo=UTC)

    @property
    def enabled(self) -> bool:
        return self._provider is not None

    def get(self, db: Session, tickers: Iterable[str]) -> dict[str, Quote]:
        """Return the latest known quote per ticker.

        A ticker is missing from the result only if no price was ever fetched for
        it. With live prices turned off the result is always empty.
        """
        wanted = set(tickers)
        if self._provider is None or not wanted:
            return {}
        if self._stale(db, wanted):
            with self._lock:
                # Another request may have refreshed these tickers while this one waited.
                stale = self._stale(db, wanted)
                if stale:
                    self._refresh(db, self._provider, stale)
        quotes = db.scalars(select(Quote).where(Quote.ticker.in_(wanted)))
        return {quote.ticker: quote for quote in quotes}

    def _stale(self, db: Session, wanted: set[str]) -> set[str]:
        now = datetime.now(UTC)
        if now < self._retry_after:
            return set()
        fresh = db.scalars(
            select(Quote.ticker).where(
                Quote.ticker.in_(wanted), Quote.fetched_at >= now - self._ttl
            )
        )
        return wanted - set(fresh)

    def _refresh(self, db: Session, provider: PriceProvider, stale: set[str]) -> None:
        now = datetime.now(UTC)
        prices = provider.fetch(sorted(stale))
        if len(prices) < len(stale):
            self._retry_after = now + RETRY_DELAY
        if not prices:
            return
        rows = [
            {"ticker": ticker, "price": price, "fetched_at": now}
            for ticker, price in prices.items()
        ]
        upsert = insert(Quote).values(rows)
        upsert = upsert.on_conflict_do_update(
            index_elements=[Quote.ticker],
            set_={"price": upsert.excluded.price, "fetched_at": upsert.excluded.fetched_at},
        )
        db.execute(upsert)
        db.commit()


@lru_cache
def get_quote_cache() -> QuoteCache:
    settings = get_settings()
    provider = None
    if settings.finnhub_api_key:
        provider = FinnhubProvider(settings.finnhub_api_key, settings.finnhub_base_url)
    return QuoteCache(provider, timedelta(seconds=settings.price_ttl_seconds))


Quotes = Annotated[QuoteCache, Depends(get_quote_cache)]
