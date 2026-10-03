"""Works out which purchased shares each sale used up.

Shares of a ticker are sold oldest first (first in, first out). That decides
how much of every purchase is still held and what each sale gained or lost.
Nothing here is stored: it is recomputed from the trades whenever it is needed,
so editing or deleting a trade can never leave it out of date.
"""

from collections import deque
from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal

from app.models import SELL, Trade

ZERO = Decimal(0)


class OversoldError(Exception):
    """A sale asks for more shares than were held on its date."""

    def __init__(self, sale: Trade, held: Decimal) -> None:
        super().__init__(
            f"sale {sale.id}: {sale.shares} {sale.ticker} on {sale.trade_date}, {held} held"
        )
        # Plain values rather than the trade itself, which may be rolled back.
        self.sale_id = sale.id
        self.ticker = sale.ticker
        self.on = sale.trade_date
        self.wanted = sale.shares
        self.held = held
        # Set by whoever saves a trade: is the sale being saved the one that doesn't fit?
        self.direct = False


@dataclass
class Lot:
    """One purchase and what has happened to its shares since."""

    trade: Trade
    remaining: Decimal
    # Gain made on the part of this purchase that has been sold.
    realized: Decimal = ZERO

    @property
    def sold(self) -> Decimal:
        return self.trade.shares - self.remaining


@dataclass
class Sale:
    trade: Trade
    # What the shares sold had cost to buy.
    cost: Decimal = ZERO

    @property
    def gain(self) -> Decimal:
        return self.trade.amount - self.cost


@dataclass
class Ledger:
    """Every purchase and sale, keyed by trade id."""

    lots: dict[int, Lot]
    sales: dict[int, Sale]


def build_ledger(trades: Iterable[Trade]) -> Ledger:
    """Match each sale to the oldest shares still held of its ticker.

    Raises OversoldError if a sale needs more shares than were held on its date.
    """
    by_ticker: dict[str, list[Trade]] = {}
    for trade in trades:
        by_ticker.setdefault(trade.ticker, []).append(trade)

    ledger = Ledger(lots={}, sales={})
    for history in by_ticker.values():
        # Oldest first. On the same day purchases come before sales, so shares
        # bought and sold on one day are available to that sale.
        history.sort(key=lambda trade: (trade.trade_date, trade.side == SELL, trade.id))
        held: deque[Lot] = deque()
        for trade in history:
            if trade.side != SELL:
                lot = Lot(trade=trade, remaining=trade.shares)
                ledger.lots[trade.id] = lot
                held.append(lot)
                continue

            available = sum((lot.remaining for lot in held), ZERO)
            if trade.shares > available:
                raise OversoldError(trade, available)

            sale = Sale(trade=trade)
            ledger.sales[trade.id] = sale
            needed = trade.shares
            while needed > 0:
                lot = held[0]
                used = min(lot.remaining, needed)
                lot.remaining -= used
                lot.realized += used * (trade.price - lot.trade.price)
                sale.cost += used * lot.trade.price
                needed -= used
                if lot.remaining == 0:
                    held.popleft()
    return ledger
