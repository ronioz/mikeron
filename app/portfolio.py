"""Turns trades and live quotes into the figures the API reports.

Everything here is plain arithmetic on its arguments: no database, no network.
"""

from collections.abc import Iterable, Mapping, Sequence
from datetime import date, timedelta
from decimal import Decimal
from typing import get_args

from app.cash import CashBook, build_cash_book
from app.ledger import Ledger, Lot, Sale, build_ledger
from app.models import QUARTERLY, SELL, WEEKLY, Quote, Trade
from app.schemas import (
    Broker,
    BrokerPortfolio,
    Portfolio,
    Position,
    ShareTotals,
    Summary,
    Totals,
    TradeOut,
    YearTotal,
)

ZERO = Decimal(0)


def value_trades(trades: Sequence[Trade], quotes: Mapping[str, Quote]) -> list[TradeOut]:
    """Describe each trade with its outcome so far.

    `trades` must hold every trade: what happened to a purchase depends on the
    later sales of its ticker, and the cash it could use on every earlier sale.
    """
    ledger = build_ledger(trades)
    cash = build_cash_book(trades)
    return [_value_trade(trade, ledger, cash, quotes) for trade in trades]


def _value_trade(
    trade: Trade, ledger: Ledger, cash: CashBook, quotes: Mapping[str, Quote]
) -> TradeOut:
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

    out.cash_used = cash.used[trade.id]
    out.cash_available = cash.available[trade.id]
    lot = ledger.lots[trade.id]
    out.remaining_shares = lot.remaining
    if lot.sold > 0:
        out.realized_gain = lot.realized
        out.realized_gain_pct = lot.realized / lot.cost_of(lot.sold) * 100
    if price is not None and lot.remaining > 0:
        # Against what the shares still held cost, their part of the fee included.
        cost = lot.cost_of(lot.remaining)
        out.current_value = lot.remaining * price
        out.gain = out.current_value - cost
        out.gain_pct = out.gain / cost * 100
    return out


def build_positions(lots: Iterable[Lot], quotes: Mapping[str, Quote]) -> list[Position]:
    """Add up what is still held of each ticker in these purchases, largest holding first."""
    by_ticker: dict[str, list[Lot]] = {}
    for lot in lots:
        by_ticker.setdefault(lot.trade.ticker, []).append(lot)

    positions = []
    for ticker, bought in by_ticker.items():
        shares = sum((lot.remaining for lot in bought), ZERO)
        if shares == 0:
            continue
        cost = sum((lot.cost_of(lot.remaining) for lot in bought), ZERO)
        quote = quotes.get(ticker)
        price = quote.price if quote is not None else None
        value = shares * price if price is not None else cost
        positions.append(
            Position(
                ticker=ticker,
                shares=shares,
                cost=cost,
                average_price=cost / shares,
                first_trade_date=min(lot.trade.trade_date for lot in bought),
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


def _share_totals(
    trades: Iterable[Trade],
    positions: Sequence[Position],
    sales: Iterable[Sale],
    quotes: Mapping[str, Quote],
    *,
    prices_enabled: bool,
) -> ShareTotals:
    """What is held, sold and paid in fees: by every trade, or by one broker's."""
    trades, sales = list(trades), list(sales)
    invested = sum((position.cost for position in positions), ZERO)
    traded = sum((trade.amount for trade in trades), ZERO)
    fees = sum((trade.fee for trade in trades), ZERO)
    totals = ShareTotals(
        invested=invested,
        realized_gain=sum((sale.gain for sale in sales), ZERO),
        sale_count=len(sales),
        fees=fees,
        fees_pct=fees / traded * 100 if traded > 0 else None,
        prices_enabled=prices_enabled,
    )
    if prices_enabled:
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


def _totals(
    trades: Sequence[Trade],
    positions: Sequence[Position],
    ledger: Ledger,
    cash: CashBook,
    quotes: Mapping[str, Quote],
    *,
    prices_enabled: bool,
) -> Totals:
    shares = _share_totals(
        trades, positions, ledger.sales.values(), quotes, prices_enabled=prices_enabled
    )
    # The user's own money: every purchase with its fee, less what cash from sales paid for.
    money_in = sum(
        (trade.net_amount - cash.used[trade.id] for trade in trades if trade.side != SELL), ZERO
    )
    totals = Totals(
        **shares.model_dump(),
        money_in=money_in,
        cash=cash.balance,
        # With nothing held, the cash is everything there is, priced or not.
        total_value=cash.balance if not positions else None,
    )
    if totals.current_value is not None:
        totals.total_value = totals.current_value + cash.balance

    # Everything there is now against everything put in: the gain on the shares
    # still held and every sale's gain together.
    if totals.total_value is not None and money_in > 0:
        totals.total_gain = totals.total_value - money_in
        totals.total_gain_pct = totals.total_gain / money_in * 100
    return totals


def _by_broker(
    trades: Sequence[Trade], ledger: Ledger, quotes: Mapping[str, Quote], *, prices_enabled: bool
) -> list[BrokerPortfolio]:
    """The portfolio split by where its trades were placed.

    A part holds what is left of the shares bought at its broker, and the sales
    and fees of the trades placed there, so the parts add up to the whole.
    Empty when no trade names a broker: there is nothing to tell apart.
    """
    used = {trade.broker for trade in trades}
    if used <= {None}:
        return []
    parts = []
    for broker in (*get_args(Broker), None):
        if broker not in used:
            continue
        positions = build_positions(
            (lot for lot in ledger.lots.values() if lot.trade.broker == broker), quotes
        )
        totals = _share_totals(
            (trade for trade in trades if trade.broker == broker),
            positions,
            (sale for sale in ledger.sales.values() if sale.trade.broker == broker),
            quotes,
            prices_enabled=prices_enabled,
        )
        parts.append(BrokerPortfolio(broker=broker, positions=positions, **totals.model_dump()))
    return parts


def build_portfolio(
    trades: Sequence[Trade], quotes: Mapping[str, Quote], *, prices_enabled: bool
) -> Portfolio:
    ledger = build_ledger(trades)
    positions = build_positions(ledger.lots.values(), quotes)
    cash = build_cash_book(trades)
    totals = _totals(trades, positions, ledger, cash, quotes, prices_enabled=prices_enabled)
    return Portfolio(
        positions=positions,
        by_broker=_by_broker(trades, ledger, quotes, prices_enabled=prices_enabled),
        **totals.model_dump(),
    )


def period_bounds(period: str, today: date) -> tuple[date, date]:
    """The first day of the plan period `today` is in, and the first day of the next.

    Weeks run Monday to Sunday. Months and quarters are the calendar's.
    """
    if period == WEEKLY:
        monday = today - timedelta(days=today.weekday())
        return monday, monday + timedelta(days=7)
    months = 3 if period == QUARTERLY else 1
    # Months counted from year 0, so December to January is plain addition.
    first = (today.year * 12 + today.month - 1) // months * months
    return _first_of_month(first), _first_of_month(first + months)


def _first_of_month(index: int) -> date:
    return date(index // 12, index % 12 + 1, 1)


def build_summary(
    trades: Sequence[Trade],
    quotes: Mapping[str, Quote],
    *,
    prices_enabled: bool,
    plan_amount: Decimal,
    plan_period: str,
    today: date,
) -> Summary:
    cash = build_cash_book(trades)
    years: dict[int, YearTotal] = {}
    # The purchases of the plan's period going on now, with their fees, split
    # into new money and cash from sales reused.
    period_start, next_period = period_bounds(plan_period, today)
    this_period = ZERO
    this_period_from_cash = ZERO
    for trade in trades:
        traded = trade.trade_date
        year = years.setdefault(
            traded.year,
            YearTotal(year=traded.year, trade_count=0, bought=ZERO, sold=ZERO, fees=ZERO),
        )
        year.trade_count += 1
        year.fees += trade.fee
        if trade.side == SELL:
            year.sold += trade.amount
            continue
        year.bought += trade.amount
        if period_start <= traded < next_period:
            from_cash = cash.used[trade.id]
            this_period += trade.net_amount - from_cash
            this_period_from_cash += from_cash

    ledger = build_ledger(trades)
    positions = build_positions(ledger.lots.values(), quotes)
    totals = _totals(trades, positions, ledger, cash, quotes, prices_enabled=prices_enabled)
    return Summary(
        trade_count=len(trades),
        plan_amount=plan_amount,
        plan_period=plan_period,
        this_period=this_period,
        this_period_from_cash=this_period_from_cash,
        years=sorted(years.values(), key=lambda total: total.year, reverse=True),
        **totals.model_dump(),
    )
