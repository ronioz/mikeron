"""Turns trades and live quotes into the figures the API reports.

Everything here is plain arithmetic on its arguments: no database, no network.
"""

from collections.abc import Mapping, Sequence
from datetime import date
from decimal import Decimal

from app.models import Quote, Trade
from app.schemas import Portfolio, Position, Summary, Totals, TradeOut, YearTotal

ZERO = Decimal(0)


def value_trade(trade: Trade, quotes: Mapping[str, Quote]) -> TradeOut:
    out = TradeOut.model_validate(trade)
    quote = quotes.get(trade.ticker)
    if quote is not None and quote.price is not None:
        out.current_price = quote.price
        out.current_value = trade.shares * quote.price
        out.gain = out.current_value - trade.cost
        out.gain_pct = out.gain / trade.cost * 100
        out.price_at = quote.fetched_at
    return out


def build_positions(trades: Sequence[Trade], quotes: Mapping[str, Quote]) -> list[Position]:
    """Group trades by ticker, largest holding first."""
    by_ticker: dict[str, list[Trade]] = {}
    for trade in trades:
        by_ticker.setdefault(trade.ticker, []).append(trade)

    positions = []
    for ticker, group in by_ticker.items():
        shares = sum((trade.shares for trade in group), ZERO)
        cost = sum((trade.cost for trade in group), ZERO)
        quote = quotes.get(ticker)
        price = quote.price if quote is not None else None
        value = shares * price if price is not None else cost
        positions.append(
            Position(
                ticker=ticker,
                shares=shares,
                cost=cost,
                average_price=cost / shares,
                trade_count=len(group),
                first_trade_date=min(trade.trade_date for trade in group),
                current_price=price,
                value=value,
                gain=value - cost if price is not None else None,
                gain_pct=(value - cost) / cost * 100 if price is not None else None,
                share_pct=ZERO,
            )
        )

    total = sum((position.value for position in positions), ZERO)
    for position in positions:
        position.share_pct = position.value / total * 100
    return sorted(positions, key=lambda position: (-position.value, position.ticker))


def _totals(
    positions: Sequence[Position], quotes: Mapping[str, Quote], *, prices_enabled: bool
) -> Totals:
    invested = sum((position.cost for position in positions), ZERO)
    totals = Totals(invested=invested, prices_enabled=prices_enabled)
    if not prices_enabled:
        return totals

    priced = [position for position in positions if position.current_price is not None]
    totals.unpriced = sorted(
        position.ticker for position in positions if position.current_price is None
    )
    if priced:
        totals.current_value = sum((position.value for position in positions), ZERO)
        totals.gain = totals.current_value - invested
        totals.gain_pct = totals.gain / invested * 100
        totals.price_at = min(quotes[position.ticker].fetched_at for position in priced)
    return totals


def build_portfolio(
    trades: Sequence[Trade], quotes: Mapping[str, Quote], *, prices_enabled: bool
) -> Portfolio:
    positions = build_positions(trades, quotes)
    totals = _totals(positions, quotes, prices_enabled=prices_enabled)
    return Portfolio(positions=positions, **totals.model_dump())


def build_summary(
    trades: Sequence[Trade],
    quotes: Mapping[str, Quote],
    *,
    prices_enabled: bool,
    monthly_budget: Decimal,
    today: date,
) -> Summary:
    years: dict[int, YearTotal] = {}
    this_month = ZERO
    for trade in trades:
        traded = trade.trade_date
        year = years.setdefault(
            traded.year, YearTotal(year=traded.year, trade_count=0, invested=ZERO)
        )
        year.trade_count += 1
        year.invested += trade.cost
        if (traded.year, traded.month) == (today.year, today.month):
            this_month += trade.cost

    totals = _totals(build_positions(trades, quotes), quotes, prices_enabled=prices_enabled)
    return Summary(
        trade_count=len(trades),
        this_month=this_month,
        monthly_budget=monthly_budget,
        years=sorted(years.values(), key=lambda total: total.year, reverse=True),
        **totals.model_dump(),
    )
