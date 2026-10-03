"""Works out the cash that sales leave, and which purchases spent it.

Selling shares turns them into cash, less the sale's fee. A purchase marked as
paid from that cash uses what there is on its date for its cost and its fee;
any part the cash can't cover counts as new money. Like the ledger, nothing
here is stored: it is recomputed from the trades whenever it is needed, so
editing or deleting a sale moves the cash with it.
"""

from collections.abc import Iterable
from dataclasses import dataclass, field
from decimal import Decimal

from app.models import SELL, Trade

ZERO = Decimal(0)


@dataclass
class CashBook:
    # Cash from sales not spent on purchases yet.
    balance: Decimal = ZERO
    # For each purchase, by trade id: how much of its cost and fee came from that cash.
    used: dict[int, Decimal] = field(default_factory=dict)


def build_cash_book(trades: Iterable[Trade]) -> CashBook:
    """Follow the cash from every sale, oldest first. Needs every trade, of every ticker."""
    book = CashBook()
    # On the same day sales come first, so money from a sale can pay for that day's purchases.
    for trade in sorted(trades, key=lambda trade: (trade.trade_date, trade.side != SELL, trade.id)):
        if trade.side == SELL:
            book.balance += trade.net_amount
            continue
        spent = min(book.balance, trade.net_amount) if trade.paid_from_cash else ZERO
        book.used[trade.id] = spent
        book.balance -= spent
    return book
