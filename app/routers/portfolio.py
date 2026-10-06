from datetime import UTC, datetime, timedelta

from fastapi import APIRouter

from app import crud
from app.closes import Closes
from app.db import DbSession
from app.deps import CurrentUser
from app.graphs import build_graphs
from app.portfolio import build_portfolio, build_summary
from app.prices import Quotes
from app.schemas import Graphs, Portfolio, Summary

router = APIRouter(tags=["portfolio"])


@router.get("/summary")
def get_summary(user: CurrentUser, db: DbSession, quotes: Quotes) -> Summary:
    trades = crud.list_trades(db, user)
    latest = quotes.get(db, {trade.ticker for trade in trades})
    return build_summary(
        trades,
        latest,
        prices_enabled=quotes.enabled,
        plan_amount=user.plan_amount,
        plan_period=user.plan_period,
        # The server doesn't know the visitor's time zone, so the plan's week,
        # month or quarter rolls over in UTC.
        today=datetime.now(UTC).date(),
    )


@router.get("/portfolio")
def get_portfolio(user: CurrentUser, db: DbSession, quotes: Quotes) -> Portfolio:
    trades = crud.list_trades(db, user)
    latest = quotes.get(db, {trade.ticker for trade in trades})
    return build_portfolio(trades, latest, prices_enabled=quotes.enabled)


@router.get("/graphs")
def get_graphs(user: CurrentUser, db: DbSession, closes: Closes) -> Graphs:
    """What everything held was worth at each close: a point per day, week, month and year."""
    trades = crud.list_trades(db, user)
    # Every ticker ever traded: one sold since was still part of the total while it was held.
    tickers = {trade.ticker for trade in trades}
    # A week before the first trade, in case that day itself had no close.
    since = min((trade.trade_date for trade in trades), default=None)
    if since is not None:
        since -= timedelta(days=7)
    return build_graphs(trades, closes.get(db, tickers, since), closes_enabled=closes.enabled)
