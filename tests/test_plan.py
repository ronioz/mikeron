"""The plan: an amount of new money and how often, and what the journal counts against it."""

from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from helpers import trade

from app.models import Trade
from app.portfolio import build_summary, period_bounds


@pytest.mark.parametrize(
    ("period", "today", "start", "next_start"),
    [
        # Weeks run Monday to Sunday, also across the turn of a year.
        ("weekly", "2026-10-05", "2026-10-05", "2026-10-12"),
        ("weekly", "2026-10-06", "2026-10-05", "2026-10-12"),
        ("weekly", "2026-10-11", "2026-10-05", "2026-10-12"),
        ("weekly", "2026-01-01", "2025-12-29", "2026-01-05"),
        ("monthly", "2026-10-06", "2026-10-01", "2026-11-01"),
        ("monthly", "2026-12-31", "2026-12-01", "2027-01-01"),
        ("monthly", "2028-02-29", "2028-02-01", "2028-03-01"),
        ("quarterly", "2026-01-01", "2026-01-01", "2026-04-01"),
        ("quarterly", "2026-03-31", "2026-01-01", "2026-04-01"),
        ("quarterly", "2026-09-30", "2026-07-01", "2026-10-01"),
        ("quarterly", "2026-10-06", "2026-10-01", "2027-01-01"),
        ("quarterly", "2026-12-31", "2026-10-01", "2027-01-01"),
    ],
)
def test_where_a_period_starts_and_the_next_begins(period, today, start, next_start):
    assert period_bounds(period, date.fromisoformat(today)) == (
        date.fromisoformat(start),
        date.fromisoformat(next_start),
    )


def spy(id: int, on: str, dollars: int, side: str = "buy", from_cash: bool = False) -> Trade:
    """One share of SPY changing hands, as the database would hand it over."""
    return Trade(
        id=id,
        side=side,
        ticker="SPY",
        price=Decimal(dollars),
        shares=Decimal(1),
        trade_date=date.fromisoformat(on),
        thesis="test",
        forecast="",
        paid_from_cash=from_cash,
        fee=Decimal(0),
    )


# A Wednesday. Its week began on Monday the 16th, its quarter on 1 October.
TODAY = date(2026, 11, 18)
PURCHASES = [
    spy(1, "2026-09-30", 80),  # last quarter
    spy(2, "2026-10-31", 40),  # this quarter, but last month
    spy(3, "2026-11-15", 20),  # this month, but last week: a Sunday
    spy(4, "2026-11-16", 10),  # this week
]


def summary_of(trades: list[Trade], period: str):
    return build_summary(
        trades,
        {},
        prices_enabled=False,
        plan_amount=Decimal(25),
        plan_period=period,
        today=TODAY,
    )


@pytest.mark.parametrize(
    ("period", "counted"), [("weekly", 10), ("monthly", 30), ("quarterly", 70)]
)
def test_the_journal_counts_the_period_the_plan_runs_by(period, counted):
    summary = summary_of(PURCHASES, period)
    assert summary.this_period == counted
    assert summary.this_period_from_cash == 0
    assert (summary.plan_amount, summary.plan_period) == (25, period)


def test_only_new_money_counts_against_the_plan():
    # This week a share is sold for $50, and one bought for $60 with that cash.
    trades = [
        *PURCHASES,
        spy(5, "2026-11-17", 50, side="sell"),
        spy(6, "2026-11-17", 60, from_cash=True),
    ]
    summary = summary_of(trades, "weekly")
    # The $10 purchase, and the $10 the cash didn't cover.
    assert summary.this_period == 20
    assert summary.this_period_from_cash == 50


def test_the_journal_follows_a_change_of_plan(account):
    ana = account(plan_amount="20", plan_period="weekly")
    today = datetime.now(UTC).date().isoformat()
    assert ana.post("/api/trades", json=trade("SPY", "1", "15", today)).status_code == 201
    assert ana.post("/api/trades", json=trade("SPY", "1", "500", "2020-01-02")).status_code == 201

    for amount, period in (("20", "weekly"), ("100", "quarterly"), ("0", "monthly")):
        plan = {"plan_amount": amount, "plan_period": period}
        assert ana.patch("/api/me", json=plan).status_code == 200
        summary = ana.get("/api/summary").json()
        assert (Decimal(summary["plan_amount"]), summary["plan_period"]) == (Decimal(amount), period)
        # Today's purchase is in every period going on now; the one from 2020 in none.
        assert Decimal(summary["this_period"]) == 15, period
