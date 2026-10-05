"""Brokers: which shares a sale uses, and the portfolio seen broker by broker."""

from datetime import date
from decimal import Decimal

from helpers import trade

from app.ledger import build_ledger
from app.models import Trade
from app.portfolio import build_portfolio


def spy(id: int, on: str, shares: int, dollars: int, broker: str | None, side: str = "buy") -> Trade:
    """Shares of SPY changing hands at a broker, as the database would hand it over."""
    return Trade(
        id=id,
        side=side,
        ticker="SPY",
        price=Decimal(dollars),
        shares=Decimal(shares),
        trade_date=date.fromisoformat(on),
        thesis="test",
        forecast="",
        paid_from_cash=False,
        fee=Decimal(1),
        broker=broker,
    )


# Ten shares at each broker, the older ones at Bank of Georgia.
BOUGHT = [spy(1, "2026-01-05", 10, 100, "bog"), spy(2, "2026-02-05", 10, 200, "tbc")]


def left(ledger) -> dict[int, Decimal]:
    return {id: lot.remaining for id, lot in ledger.lots.items()}


def test_a_sale_uses_the_shares_at_its_own_broker_first():
    ledger = build_ledger([*BOUGHT, spy(3, "2026-03-05", 4, 250, "tbc", side="sell")])
    # Not the oldest shares, which are at the other broker.
    assert left(ledger) == {1: 10, 2: 6}
    # Four shares at $200, with their part of the $1 paid to buy ten.
    assert ledger.sales[3].cost == Decimal("800.4")


def test_a_sale_too_big_for_its_broker_goes_on_to_the_rest():
    ledger = build_ledger([*BOUGHT, spy(3, "2026-03-05", 13, 250, "tbc", side="sell")])
    assert left(ledger) == {1: 7, 2: 0}


def test_a_sale_naming_no_broker_uses_the_oldest_shares():
    ledger = build_ledger([*BOUGHT, spy(3, "2026-03-05", 4, 250, None, side="sell")])
    assert left(ledger) == {1: 6, 2: 10}


def test_the_parts_add_up_to_the_whole_portfolio():
    trades = [
        *BOUGHT,
        spy(3, "2026-03-05", 4, 250, "tbc", side="sell"),
        spy(4, "2026-03-06", 2, 300, None),
    ]
    portfolio = build_portfolio(trades, {}, prices_enabled=False)
    parts = {part.broker: part for part in portfolio.by_broker}
    # Brokers in the order the form offers them, then the trades naming none.
    assert list(parts) == ["tbc", "bog", None]

    held = {broker: part.positions[0].shares for broker, part in parts.items()}
    assert held == {"tbc": 6, "bog": 10, None: 2}
    assert sum(held.values()) == portfolio.positions[0].shares == 18
    for figure in ("invested", "realized_gain", "sale_count", "fees"):
        whole = getattr(portfolio, figure)
        assert sum(getattr(part, figure) for part in parts.values()) == whole, figure
    # The sale was at TBC, and so is its gain.
    assert (parts["tbc"].sale_count, parts["bog"].sale_count) == (1, 0)
    assert parts["tbc"].realized_gain == portfolio.realized_gain


def test_a_portfolio_with_no_brokers_has_no_parts():
    trades = [spy(1, "2026-01-05", 10, 100, None), spy(2, "2026-02-05", 3, 120, None, side="sell")]
    assert build_portfolio(trades, {}, prices_enabled=False).by_broker == []


def test_the_api_reports_each_brokers_part(account):
    ana = account()
    assert ana.post("/api/trades", json=trade("SPY", "2", "500", "2026-09-01", broker="bog")).status_code == 201
    assert ana.post("/api/trades", json=trade("MU", "1", "90", "2026-09-02", broker="tbc")).status_code == 201
    portfolio = ana.get("/api/portfolio").json()
    assert [p["ticker"] for p in portfolio["positions"]] == ["SPY", "MU"]
    parts = {part["broker"]: [p["ticker"] for p in part["positions"]] for part in portfolio["by_broker"]}
    assert parts == {"tbc": ["MU"], "bog": ["SPY"]}
    # Each part has live values of its own (the tests' stand-in prices).
    values = {part["broker"]: Decimal(part["current_value"]) for part in portfolio["by_broker"]}
    assert values == {"tbc": 100, "bog": 1200}
