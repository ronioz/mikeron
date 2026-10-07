"""Every account sees, sells from and changes only its own trades."""

from helpers import trade

ANA = "ana@example.com"
BEN = "ben@example.com"


def test_accounts_see_only_their_own_trades(account):
    ana, ben = account(ANA), account(BEN)
    assert ana.post("/api/trades", json=trade("SPY", "10", "500", "2026-09-01")).status_code == 201
    assert ben.post("/api/trades", json=trade("MU", "1", "90", "2026-09-02")).status_code == 201

    assert [t["ticker"] for t in ana.get("/api/trades").json()] == ["SPY"]
    assert [t["ticker"] for t in ben.get("/api/trades").json()] == ["MU"]
    assert ana.get("/api/summary").json()["trade_count"] == 1
    assert [p["ticker"] for p in ben.get("/api/portfolio").json()["positions"]] == ["MU"]


def test_one_accounts_shares_never_cover_anothers_sale(account):
    ana, ben = account(ANA), account(BEN)
    ana.post("/api/trades", json=trade("SPY", "10", "500", "2026-09-01"))

    # Ben holds no SPY, however much Ana does.
    response = ben.post("/api/trades", json=trade("SPY", "1", "600", "2026-09-10", side="sell"))
    assert response.status_code == 422
    assert response.json()["detail"][0]["msg"] == "You held no SPY on 2026-09-10."

    # His own shares cover his own sale, and Ana's stay untouched.
    ben.post("/api/trades", json=trade("SPY", "2", "550", "2026-09-05"))
    assert (
        ben.post("/api/trades", json=trade("SPY", "2", "600", "2026-09-10", side="sell")).status_code
        == 201
    )
    ana_buy = ana.get("/api/trades").json()[0]
    assert ana_buy["remaining_shares"] == "10.00000000"
    assert ana_buy["realized_gain"] is None
    assert ana.get("/api/summary").json()["sale_count"] == 0
    assert ana.get("/api/summary").json()["cash"] == "0"


def test_other_accounts_trades_are_not_found(account):
    ana, ben = account(ANA), account(BEN)
    created = ana.post("/api/trades", json=trade("SPY", "10", "500", "2026-09-01")).json()
    path = f"/api/trades/{created['id']}"

    assert ben.get(path).status_code == 404
    assert ben.put(path, json=trade("SPY", "1", "1", "2026-09-01")).status_code == 404
    assert ben.delete(path).status_code == 404
    unchanged = ana.get(path).json()
    assert (unchanged["shares"], unchanged["price"]) == ("10.00000000", "500.0000")


def test_an_owner_in_the_request_is_ignored(account):
    ana, ben = account(ANA), account(BEN)
    ana_id = ana.post("/api/trades", json=trade("SPY", "1", "500", "2026-09-01")).json()["id"]
    sneaky = trade("MU", "1", "90", "2026-09-02", user_id=1, id=ana_id)
    created = ben.post("/api/trades", json=sneaky).json()

    assert created["id"] != ana_id
    assert [t["ticker"] for t in ana.get("/api/trades").json()] == ["SPY"]
    assert [t["ticker"] for t in ben.get("/api/trades").json()] == ["MU"]


def test_the_plan_is_per_account(account):
    ana, ben = account(ANA), account(BEN)
    changed = {"plan_amount": "50", "plan_period": "quarterly"}
    assert ana.patch("/api/me", json=changed).status_code == 200
    mine, his = ana.get("/api/summary").json(), ben.get("/api/summary").json()
    assert (mine["plan_amount"], mine["plan_period"]) == ("50.0000", "quarterly")
    # Ben's is still the one he signed up with.
    assert (his["plan_amount"], his["plan_period"]) == ("30.0000", "monthly")


def test_nothing_is_shown_without_signing_in(account, new_client):
    ana = account(ANA)
    trade_id = ana.post("/api/trades", json=trade("SPY", "1", "500", "2026-09-01")).json()["id"]
    stranger = new_client()
    for path in ("/api/trades", f"/api/trades/{trade_id}", "/api/summary", "/api/portfolio", "/api/me"):
        assert stranger.get(path).status_code == 401, path
    assert stranger.post("/api/trades", json=trade("SPY", "1", "1", "2026-09-01")).status_code == 401


def test_brokers_are_kept_and_checked(account):
    ana = account(ANA)
    created = ana.post("/api/trades", json=trade("SPY", "1", "500", "2026-09-01", broker="tbc"))
    assert created.json()["broker"] == "tbc"
    unknown = ana.post("/api/trades", json=trade("SPY", "1", "500", "2026-09-01", broker="xyz"))
    assert unknown.status_code == 422
    assert unknown.json()["detail"][0]["loc"] == ["body", "broker"]
    blank = ana.post("/api/trades", json=trade("SPY", "1", "500", "2026-09-01", broker=""))
    assert blank.json()["broker"] is None


def test_a_trade_needs_no_reason(account):
    ana = account(ANA)
    without = trade("SPY", "1", "500", "2026-09-01")
    del without["thesis"]
    created = ana.post("/api/trades", json=without)
    assert created.status_code == 201
    assert created.json()["thesis"] == ""
    # Only spaces is the same as nothing written.
    blank = ana.post("/api/trades", json=trade("SPY", "1", "500", "2026-09-01", thesis="  \n "))
    assert blank.json()["thesis"] == ""
    # A reason can be taken off a trade that had one.
    written = ana.post("/api/trades", json=trade("MU", "1", "90", "2026-09-02")).json()
    cleared = ana.put(f"/api/trades/{written['id']}", json={**without, "ticker": "MU"})
    assert cleared.json()["thesis"] == ""


def test_a_new_trade_starts_with_the_last_broker_used(account):
    ana, ben = account(ANA), account(BEN)
    assert ana.get("/api/me").json()["last_broker"] is None
    ana.post("/api/trades", json=trade("SPY", "1", "500", "2026-09-01", broker="tbc"))
    # Recorded later, though dated earlier: what counts is the latest one entered.
    ana.post("/api/trades", json=trade("MU", "1", "90", "2025-01-01", broker="bog"))
    # Trades without a broker don't reset it.
    ana.post("/api/trades", json=trade("MU", "1", "90", "2026-09-03"))
    assert ana.get("/api/me").json()["last_broker"] == "bog"
    assert ben.get("/api/me").json()["last_broker"] is None
