"""Turns trades and live quotes into the figures the API reports.

Everything here is plain arithmetic on its arguments: no database, no network.
"""

from collections.abc import Mapping, Sequence
from datetime import date
from decimal import Decimal

from app.ledger import Ledger, Lot, build_ledger
from app.models import SELL, Quote, Trade
from app.schemas import Portfolio, Position, Summary, Totals, TradeOut, YearTotal

ZERO = Decimal(0)


def value_trades(trades: Sequence[Trade], quotes: Mapping[str, Quote]) -> list[TradeOut]:
    """Describe each trade with its outcome so far.

    `trades` must hold every trade of each ticker involved, since what happened
    to a purchase depends on the sales that came after it.
    """
    ledger = build_ledger(trades)
    return [_value_trade(trade, ledger, quotes) for trade in trades]


def _value_trade(trade: Trade, ledger: Ledger, quotes: Mapping[str, Quote]) -> TradeOut:
    out = TradeOut.model_validate(trade)
    quote = quotes.get(trade.ticker)
    price = quote.price if quote is not None else None
    if quote is not None and price is not None:
        out.current_price = price
        out.price_at = quote.fetched_at

    if trade.side == SELL:
        sale = ledger.sales[trade.id]
        out.cost_basis = sale.cost
        out.realized_gain = sale.gain
        out.realized_gain_pct = sale.gain / sale.cost * 100
        return out

    lot = ledger.lots[trade.id]
    out.remaining_shares = lot.remaining
    if lot.sold > 0:
        out.realized_gain = lot.realized
        out.realized_gain_pct = lot.realized / (lot.sold * trade.price) * 100
    if price is not None and lot.remaining > 0:
        out.current_value = lot.remaining * price
        out.gain = lot.remaining * (price - trade.price)
        out.gain_pct = (price - trade.price) / trade.price * 100
    return out


def build_positions(ledger: Ledger, quotes: Mapping[str, Quote]) -> list[Position]:
    """Add up what is still held of each ticker, largest holding first."""
    by_ticker: dict[str, list[Lot]] = {}
    for lot in ledger.lots.values():
        by_ticker.setdefault(lot.trade.ticker, []).append(lot)

    positions = []
    for ticker, lots in by_ticker.items():
        shares = sum((lot.remaining for lot in lots), ZERO)
        if shares == 0:
            continue
        cost = sum((lot.remaining * lot.trade.price for lot in lots), ZERO)
        quote = quotes.get(ticker)
        price = quote.price if quote is not None else None
        value = shares * price if price is not None else cost
        positions.append(
            Position(
                ticker=ticker,
                shares=shares,
                cost=cost,
                average_price=cost / shares,
                first_trade_date=min(lot.trade.trade_date for lot in lots),
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
    positions: Sequence[Position],
    ledger: Ledger,
    quotes: Mapping[str, Quote],
    *,
    prices_enabled: bool,
) -> Totals:
    invested = sum((position.cost for position in positions), ZERO)
    totals = Totals(
        invested=invested,
        realized_gain=sum((sale.gain for sale in ledger.sales.values()), ZERO),
        sale_count=len(ledger.sales),
        prices_enabled=prices_enabled,
    )
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
    ledger = build_ledger(trades)
    positions = build_positions(ledger, quotes)
    totals = _totals(positions, ledger, quotes, prices_enabled=prices_enabled)
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
            traded.year, YearTotal(year=traded.year, trade_count=0, bought=ZERO, sold=ZERO)
        )
        year.trade_count += 1
        if trade.side == SELL:
            year.sold += trade.amount
            continue
        year.bought += trade.amount
        if (traded.year, traded.month) == (today.year, today.month):
            this_month += trade.amount

    ledger = build_ledger(trades)
    positions = build_positions(ledger, quotes)
    totals = _totals(positions, ledger, quotes, prices_enabled=prices_enabled)
    return Summary(
        trade_count=len(trades),
        this_month=this_month,
        monthly_budget=monthly_budget,
        years=sorted(years.values(), key=lambda total: total.year, reverse=True),
        **totals.model_dump(),
    )
