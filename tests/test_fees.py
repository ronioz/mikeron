"""What a bank charges for a trade, by its tariff (docs/bank_and_brokerage_commissions.md)."""

from decimal import Decimal

import pytest

from app.fees import commission


def held(dollars: int):
    """What the shares held with the broker were worth before the trade."""
    return lambda: Decimal(dollars)


def not_asked() -> Decimal:
    raise AssertionError("this tariff doesn't turn on what is held")


@pytest.mark.parametrize(
    ("shares", "price", "portfolio", "fee"),
    [
        # 0.3% of the trade.
        ("2.5", "100", 5000, "0.75"),
        ("4.2", "100", 5000, "1.26"),
        # To the cent, a half going up: 0.3% of $215 is 64.5 cents.
        ("2.15", "100", 5000, "0.65"),
        # No less than fifty cents, however small the trade...
        ("0.4", "100", 5000, "0.50"),
        ("1.6666", "100", 5000, "0.50"),
        ("1.67", "100", 5000, "0.50"),
        # ...and no more than forty dollars, however large.
        ("133.33", "100", 50000, "40.00"),
        ("1000", "100", 500000, "40.00"),
        # Nothing at all while what is held there is worth $1,000 or less.
        ("2.5", "100", 0, "0"),
        ("2.5", "100", 1000, "0"),
        ("2.5", "100", 1001, "0.75"),
    ],
)
def test_bank_of_georgia_charges_by_the_size_of_the_trade(shares, price, portfolio, fee):
    assert commission("bog", Decimal(shares), Decimal(price), held(portfolio)) == Decimal(fee)


def test_tbc_bank_charges_nothing_for_a_trade_in_its_app():
    assert commission("tbc", Decimal("0.4"), Decimal("150.25"), not_asked) == 0
    assert commission("tbc", Decimal(500), Decimal("150.25"), not_asked) == 0


def test_a_broker_without_a_tariff_has_no_fee_worked_out():
    assert commission(None, Decimal(1), Decimal(100), not_asked) is None
