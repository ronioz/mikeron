"""Works out which purchased shares each sale used up.

Shares of a ticker are sold oldest first (first in, first out), those bought
at the sale's own broker before any others. That decides how much of every
purchase is still held and what each sale gained or lost.
Gains are after fees: shares carry their part of the fee paid to buy them, and
a sale's own fee comes off what it brought in.
Nothing here is stored: it is recomputed from the trades whenever it is needed,
so editing or deleting a trade can never leave it out of date.
"""

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


def _fee_share(trade: Trade, shares: Decimal) -> Decimal:
    """The part of a trade's fee that goes with some of its shares."""
    return trade.fee * shares / trade.shares


@dataclass
class Lot:
    """One purchase and what has happened to its shares since."""

    trade: Trade
    remaining: Decimal
    # Gain made on the part of this purchase that has been sold, after fees.
    realized: Decimal = ZERO

    @property
    def sold(self) -> Decimal:
        return self.trade.shares - self.remaining

    def cost_of(self, shares: Decimal) -> Decimal:
        """What some of this purchase's shares cost, with their part of its fee."""
        return shares * self.trade.price + _fee_share(self.trade, shares)


@dataclass
class Sale:
    trade: Trade
    # What the shares sold had cost to buy, with their part of the purchases' fees.
    cost: Decimal = ZERO

    @property
    def gain(self) -> Decimal:
        # What the sale brought in after its own fee, against what those shares cost.
        return self.trade.net_amount - self.cost


@dataclass
class Ledger:
    """Every purchase and sale, keyed by trade id."""

    lots: dict[int, Lot]
    sales: dict[int, Sale]


def build_ledger(trades: Iterable[Trade]) -> Ledger:
    """Match each sale to the oldest shares still held of its ticker.

    A broker can only sell what is held with it, so a sale first uses the
    shares bought at its own broker. Whether there are enough shares is asked
    of all brokers together: if the sale's own run short, the rest follow,
    oldest first, rather than the sale being refused over a label.

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
        held: list[Lot] = []
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
            # Sorting keeps the order within each group, so both stay oldest first.
            for lot in sorted(held, key=lambda lot: lot.trade.broker != trade.broker):
                if needed == 0:
                    break
                used = min(lot.remaining, needed)
                cost = lot.cost_of(used)
                # What these shares brought in, after their part of the sale's fee.
                proceeds = used * trade.price - _fee_share(trade, used)
                lot.remaining -= used
                lot.realized += proceeds - cost
                sale.cost += cost
                needed -= used
            held = [lot for lot in held if lot.remaining > 0]
    return ledger
