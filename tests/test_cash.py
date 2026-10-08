"""Cash from sales: how much of it a purchase could use, and saying what paid for one once it is saved."""

from decimal import Decimal

from helpers import trade


def record(client, *what, **extra) -> dict:
    response = client.post("/api/trades", json=trade(*what, **extra))
    assert response.status_code == 201, response.text
    return response.json()


def pay(client, saved: dict, from_cash: bool):
    return client.patch(f"/api/trades/{saved['id']}", json={"paid_from_cash": from_cash})


def cash(client, saved: dict) -> tuple[Decimal | None, Decimal | None]:
    """How much cash from sales a trade used, and how much there was for it."""
    now = client.get(f"/api/trades/{saved['id']}").json()
    return tuple(None if now[name] is None else Decimal(now[name]) for name in ("cash_used", "cash_available"))


def sold_for_130(client) -> dict:
    """A share bought and then sold on 10 August, which leaves $130 of cash."""
    record(client, "SPY", "1", "100", "2026-08-01")
    return record(client, "SPY", "1", "130", "2026-08-10", side="sell")


def test_a_purchase_is_told_how_much_cash_from_sales_there_was_for_it(account):
    ana = account()
    early = record(ana, "MU", "1", "50", "2026-08-05")
    sale = sold_for_130(ana)
    small = record(ana, "MU", "1", "50", "2026-08-12")
    large = record(ana, "MU", "2", "100", "2026-08-20", fee="1.50")
    # Bought before anything was sold.
    assert cash(ana, early) == (0, 0)
    # All of the small one, and what there is towards the large one's $201.50 with its fee.
    # Neither has used any: both were paid with new money, so the $130 is there for each.
    assert cash(ana, small) == (0, 50)
    assert cash(ana, large) == (0, 130)
    # A sale isn't paid for.
    assert cash(ana, sale) == (None, None)


def test_cash_pays_what_it_can_and_the_rest_is_new_money(account):
    ana = account()
    sold_for_130(ana)
    large = record(ana, "MU", "2", "100", "2026-08-20")
    before = ana.get(f"/api/trades/{large['id']}").json()
    assert Decimal(ana.get("/api/portfolio").json()["cash"]) == 130

    answer = pay(ana, large, True)
    assert answer.status_code == 200, answer.text
    after = answer.json()
    # $130 of the $200 from cash, which is all there was. The other $70 is new money.
    assert (after["paid_from_cash"], Decimal(after["cash_used"]), Decimal(after["net_amount"])) == (True, 130, 200)
    assert Decimal(ana.get("/api/portfolio").json()["cash"]) == 0
    # Nothing else about the trade is touched. When its price was looked up isn't part of it.
    changed = {name for name in after if after[name] != before[name]} - {"price_at"}
    assert changed == {"paid_from_cash", "cash_used", "updated_at"}

    # And back again.
    assert pay(ana, large, False).json()["paid_from_cash"] is False
    assert cash(ana, large) == (0, 130)
    assert Decimal(ana.get("/api/portfolio").json()["cash"]) == 130


def test_cash_is_spent_once_and_the_oldest_purchase_has_it_first(account):
    ana = account()
    sold_for_130(ana)
    # Saved the later one first: it is the dates that count.
    large = record(ana, "MU", "2", "100", "2026-08-20")
    small = record(ana, "MU", "1", "50", "2026-08-12")
    assert pay(ana, large, True).status_code == 200
    assert cash(ana, large) == (130, 130)
    # The earlier one takes its $50, which leaves $80 for the later one.
    assert pay(ana, small, True).status_code == 200
    assert cash(ana, small) == (50, 50)
    assert cash(ana, large) == (80, 80)
    assert pay(ana, small, False).status_code == 200
    assert cash(ana, large) == (130, 130)


def test_only_a_purchase_of_ones_own_is_paid_with_anything(account, new_client):
    ana = account("ana@example.com")
    sale = sold_for_130(ana)
    purchase = record(ana, "MU", "1", "50", "2026-08-12")
    refused = pay(ana, sale, True)
    assert refused.status_code == 422
    assert refused.json()["detail"] == "A sale isn't paid for: what it brings in becomes cash."
    assert pay(account("ben@example.com", "ben-password-1"), purchase, True).status_code == 404
    assert pay(new_client(), purchase, True).status_code == 401
    assert ana.patch(f"/api/trades/{purchase['id']}", json={}).status_code == 422
    assert cash(ana, purchase) == (0, 50)
