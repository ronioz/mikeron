"""Turns trades and live quotes into the figures the API reports.

Everything here is plain arithmetic on its arguments: no database, no network.
"""

from collections.abc import Mapping, Sequence
from datetime import date, timedelta
from decimal import Decimal

from app.cash import CashBook, build_cash_book
from app.ledger import Ledger, Lot, build_ledger
from app.models import QUARTERLY, SELL, WEEKLY, Quote, Trade
from app.schemas import Portfolio, Position, Summary, Totals, TradeOut, YearTotal

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
        cost = sum((lot.cost_of(lot.remaining) for lot in lots), ZERO)
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
    trades: Sequence[Trade],
    positions: Sequence[Position],
    ledger: Ledger,
    cash: CashBook,
    quotes: Mapping[str, Quote],
    *,
    prices_enabled: bool,
) -> Totals:
    invested = sum((position.cost for position in positions), ZERO)
    traded = sum((trade.amount for trade in trades), ZERO)
    fees = sum((trade.fee for trade in trades), ZERO)
    # The user's own money: every purchase with its fee, less what cash from sales paid for.
    money_in = sum(
        (trade.net_amount - cash.used[trade.id] for trade in trades if trade.side != SELL), ZERO
    )
    totals = Totals(
        invested=invested,
        money_in=money_in,
        cash=cash.balance,
        realized_gain=sum((sale.gain for sale in ledger.sales.values()), ZERO),
        sale_count=len(ledger.sales),
        fees=fees,
        fees_pct=fees / traded * 100 if traded > 0 else None,
        prices_enabled=prices_enabled,
        # With nothing held, the cash is everything there is, priced or not.
        total_value=cash.balance if not positions else None,
    )
    if prices_enabled:
        priced = [position for position in positions if position.current_price is not None]
        totals.unpriced = sorted(
            position.ticker for position in positions if position.current_price is None
        )
        if priced:
            totals.current_value = sum((position.value for position in positions), ZERO)
            totals.total_value = totals.current_value + cash.balance
            totals.gain = totals.current_value - invested
            totals.gain_pct = totals.gain / invested * 100
            totals.price_at = min(quotes[position.ticker].fetched_at for position in priced)

    # Everything there is now against everything put in: the gain on the shares
    # still held and every sale's gain together.
    if totals.total_value is not None and money_in > 0:
        totals.total_gain = totals.total_value - money_in
        totals.total_gain_pct = totals.total_gain / money_in * 100
    return totals


def build_portfolio(
    trades: Sequence[Trade], quotes: Mapping[str, Quote], *, prices_enabled: bool
) -> Portfolio:
    ledger = build_ledger(trades)
    positions = build_positions(ledger, quotes)
    cash = build_cash_book(trades)
    totals = _totals(trades, positions, ledger, cash, quotes, prices_enabled=prices_enabled)
    return Portfolio(positions=positions, **totals.model_dump())


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
    positions = build_positions(ledger, quotes)
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
