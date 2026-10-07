"""What a bank charges for a trade, worked out from its tariff.

Neither bank's report of a trade shows the fee: it is booked as a transaction
of its own. So when a trade is filled in from a report, its fee is worked out
here instead, for the person to check against what the bank took.

The tariffs are written up in docs/bank_and_brokerage_commissions.md. They
change: when one does, change it here and there.
"""

from collections.abc import Callable
from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")

# Bank of Georgia, investing in the mobile bank: nothing while the portfolio
# there is worth $1,000 or less, and after that 0.3% of the trade, no less than
# $0.50 and no more than $40. (Penny stocks are charged even under $1,000; how
# much isn't in the tariff, so they aren't told apart here.)
BOG_FREE_UP_TO = Decimal(1000)
BOG_RATE = Decimal("0.003")
BOG_LEAST = Decimal("0.50")
BOG_MOST = Decimal(40)

# TBC Bank, investing in the mobile bank: no charge for a trade. The $0.02 a
# share with a $4 minimum is TBC Capital's brokerage platform, another product.
TBC_FEE = Decimal(0)


def commission(
    broker: str | None, shares: Decimal, price: Decimal, held: Callable[[], Decimal]
) -> Decimal | None:
    """The fee a broker's tariff sets for a trade, to the cent. None for a broker with no tariff here.

    `held` tells what the person's shares with that broker were worth before
    the trade. It is only asked when the tariff depends on it.
    """
    if broker == "bog":
        if held() <= BOG_FREE_UP_TO:
            return Decimal(0)
        fee = min(max(shares * price * BOG_RATE, BOG_LEAST), BOG_MOST)
        return fee.quantize(CENT, rounding=ROUND_HALF_UP)
    if broker == "tbc":
        return TBC_FEE
    return None
