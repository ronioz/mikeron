from datetime import UTC, datetime

from fastapi import APIRouter

from app import crud
from app.db import DbSession
from app.deps import CurrentUser
from app.portfolio import build_portfolio, build_summary
from app.prices import Quotes
from app.schemas import Portfolio, Summary

router = APIRouter(tags=["portfolio"])


@router.get("/summary")
def get_summary(user: CurrentUser, db: DbSession, quotes: Quotes) -> Summary:
    trades = crud.list_trades(db, user)
    latest = quotes.get(db, {trade.ticker for trade in trades})
    return build_summary(
        trades,
        latest,
        prices_enabled=quotes.enabled,
        monthly_budget=user.monthly_budget,
        # The server doesn't know the visitor's time zone, so the month rolls over in UTC.
        today=datetime.now(UTC).date(),
    )


@router.get("/portfolio")
def get_portfolio(user: CurrentUser, db: DbSession, quotes: Quotes) -> Portfolio:
    trades = crud.list_trades(db, user)
    latest = quotes.get(db, {trade.ticker for trade in trades})
    return build_portfolio(trades, latest, prices_enabled=quotes.enabled)
