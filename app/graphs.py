"""Turns trades and daily closing prices into the points a graph draws: what
everything held was worth at each close.

Like app/portfolio.py, everything here is plain arithmetic on its arguments:
no database, no network.
"""

import calendar
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Protocol, get_args

from app.cash import build_cash_book
from app.closes import DayClose
from app.ledger import build_ledger
from app.models import SELL, Trade
from app.schemas import Graph, Graphs, Spacing, ValuePoint

ZERO = Decimal(0)

# How many months back a graph reaches: the further apart its points, the
# further back. A yearly graph has no limit and goes back to the first trade.
REACH: dict[Spacing, int] = {"daily": 3, "weekly": 24, "monthly": 120}


class Dated(Protocol):
    @property
    def day(self) -> date: ...


def first_day(spacing: Spacing, latest: date) -> date | None:
    """The earliest day a graph ending on `latest` shows, or None for no limit."""
    months = REACH.get(spacing)
    if months is None:
        return None
    # Months counted from year 0, so going back across a new year is plain subtraction.
    index = latest.year * 12 + latest.month - 1 - months
    year, month = index // 12, index % 12 + 1
    # The 31st has no namesake in a shorter month: its last day stands in.
    return date(year, month, min(latest.day, calendar.monthrange(year, month)[1]))


def _period(day: date, spacing: Spacing) -> tuple[int, ...]:
    """Which week, month or year a day belongs to. Weeks run Monday to Sunday."""
    if spacing == "weekly":
        year, week, _ = day.isocalendar()
        return year, week
    if spacing == "monthly":
        return day.year, day.month
    if spacing == "yearly":
        return (day.year,)
    return (day.toordinal(),)


def space_out[T: Dated](points: Sequence[T], spacing: Spacing) -> list[T]:
    """Keep the last point of each day, week, month or year. `points` must be oldest first.

    The period going on now is kept too, with the latest point so far, so every
    spacing ends on the same one.
    """
    last: dict[tuple[int, ...], T] = {}
    for point in points:
        last[_period(point.day, spacing)] = point
    return list(last.values())


@dataclass
class Holdings:
    """What was held from the end of a day with trades until the next one."""

    day: date
    # For each ticker held: how many shares, and what they cost with their part of the fees.
    shares: dict[str, Decimal]
    cost: dict[str, Decimal]
    # Cash from sales not spent on purchases yet.
    cash: Decimal
    # The user's own money put in so far: purchases with their fees, less what cash paid for.
    money_in: Decimal


def holdings_by_day(trades: Sequence[Trade]) -> list[Holdings]:
    """What was held at the end of each day with trades, oldest first.

    Each day is worked out afresh from the trades up to it, with the same
    ledger and cash book as the rest of the app, so the last one always agrees
    with the portfolio page. That is a pass over the trades for every day with
    trades: plenty quick for a journal of hundreds.
    """
    held = []
    for day in sorted({trade.trade_date for trade in trades}):
        so_far = [trade for trade in trades if trade.trade_date <= day]
        cash = build_cash_book(so_far)
        shares: dict[str, Decimal] = {}
        cost: dict[str, Decimal] = {}
        for lot in build_ledger(so_far).lots.values():
            if lot.remaining > 0:
                ticker = lot.trade.ticker
                shares[ticker] = shares.get(ticker, ZERO) + lot.remaining
                cost[ticker] = cost.get(ticker, ZERO) + lot.cost_of(lot.remaining)
        money_in = sum(
            (trade.net_amount - cash.used[trade.id] for trade in so_far if trade.side != SELL),
            ZERO,
        )
        held.append(Holdings(day, shares, cost, cash.balance, money_in))
    return held


def value_by_day(
    held: Sequence[Holdings], closes: Mapping[str, Sequence[DayClose]]
) -> tuple[list[ValuePoint], list[str]]:
    """What everything held was worth at each day's close, oldest first, from the first trade on.

    A day counts once any ticker has a close for it. A ticker without one that
    day is counted at its latest earlier close, and a ticker that never had one
    at what its shares cost, as the portfolio page counts a ticker with no live
    price. Also returns the tickers counted at cost on the last day.
    """
    if not held:
        return [], []
    days = sorted(
        {close.day for history in closes.values() for close in history if close.day >= held[0].day}
    )
    latest: dict[str, Decimal] = {}
    read = dict.fromkeys(closes, 0)
    now = 0
    points = []
    at_cost: list[str] = []
    for day in days:
        while now + 1 < len(held) and held[now + 1].day <= day:
            now += 1
        for ticker, history in closes.items():
            while read[ticker] < len(history) and history[read[ticker]].day <= day:
                latest[ticker] = history[read[ticker]].close
                read[ticker] += 1
        holdings = held[now]
        at_cost = sorted(ticker for ticker in holdings.shares if ticker not in latest)
        shares_worth = sum(
            (
                holdings.cost[ticker] if ticker in at_cost else shares * latest[ticker]
                for ticker, shares in holdings.shares.items()
            ),
            ZERO,
        )
        points.append(
            ValuePoint(day=day, value=shares_worth + holdings.cash, money_in=holdings.money_in)
        )
    return points, at_cost


def build_graphs(
    trades: Sequence[Trade], closes: Mapping[str, Sequence[DayClose]], *, closes_enabled: bool
) -> Graphs:
    """The portfolio's value over time at every spacing.

    `closes` hold the days of every ticker traded, oldest first, from the first
    trade on or a little before.
    """
    points, at_cost = value_by_day(holdings_by_day(trades), closes)
    graphs = Graphs(
        closes_enabled=closes_enabled,
        trade_count=len(trades),
        graphs={spacing: Graph(points=[]) for spacing in get_args(Spacing)},
        unpriced=at_cost,
    )
    if not points:
        return graphs
    last = points[-1]
    for spacing in get_args(Spacing):
        since = first_day(spacing, last.day)
        shown = [point for point in points if since is None or point.day >= since]
        graphs.graphs[spacing] = Graph(points=space_out(shown, spacing))
    graphs.trades_after = sum(1 for trade in trades if trade.trade_date > last.day)
    if last.money_in > 0:
        graphs.total_gain = last.value - last.money_in
        graphs.total_gain_pct = graphs.total_gain / last.money_in * 100
    return graphs
