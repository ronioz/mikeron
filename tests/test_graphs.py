"""Graphs: what everything held was worth at each close, a point per day, week, month or
year, and the cache that keeps the closing prices."""

import json
import threading
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import pytest
from helpers import trade

from app.closes import (
    CloseCache,
    DayClose,
    TwelveDataProvider,
    get_close_cache,
    last_settlement,
)
from app.graphs import build_graphs, first_day, holdings_by_day, space_out, value_by_day
from app.models import Trade

SPACINGS = ["daily", "weekly", "monthly", "yearly"]


def trading_days(first: str, last: str, start: int = 100) -> list[DayClose]:
    """Monday to Friday between two days, each closing a dollar above the one before."""
    day, end = date.fromisoformat(first), date.fromisoformat(last)
    closes = []
    while day <= end:
        if day.weekday() < 5:
            closes.append(DayClose(day, Decimal(start + len(closes))))
        day += timedelta(days=1)
    return closes


def days(closes: list[DayClose]) -> list[str]:
    return [str(close.day) for close in closes]


def deal(
    id: int,
    on: str,
    ticker: str,
    shares: int,
    dollars: int,
    side: str = "buy",
    fee: int = 0,
    from_cash: bool = False,
) -> Trade:
    """Shares changing hands, as the database would hand the trade over."""
    return Trade(
        id=id,
        side=side,
        ticker=ticker,
        price=Decimal(dollars),
        shares=Decimal(shares),
        trade_date=date.fromisoformat(on),
        thesis="test",
        forecast="",
        paid_from_cash=from_cash,
        fee=Decimal(fee),
        broker=None,
    )


def worth(trades: list[Trade], closes: dict[str, list[DayClose]]):
    return value_by_day(holdings_by_day(trades), closes)


# The arithmetic: what was held, and what it was worth.

# Monday to Wednesday. SPY closes at 100, 101, 102 and MU at 50, 51, 52.
WEEK = {
    "SPY": trading_days("2026-10-05", "2026-10-07"),
    "MU": trading_days("2026-10-05", "2026-10-07", start=50),
}


def test_the_value_is_every_share_held_at_that_days_close():
    trades = [deal(1, "2026-10-05", "SPY", 2, 100), deal(2, "2026-10-06", "MU", 10, 51)]
    points, at_cost = worth(trades, WEEK)
    assert [(str(point.day), point.value, point.money_in) for point in points] == [
        ("2026-10-05", 200, 200),
        # MU joins on the day it was bought, at that day's close.
        ("2026-10-06", 202 + 510, 710),
        ("2026-10-07", 204 + 520, 710),
    ]
    assert at_cost == []


def test_a_sale_turns_shares_into_cash_that_still_counts():
    trades = [
        deal(1, "2026-10-05", "SPY", 2, 100),
        deal(2, "2026-10-06", "SPY", 1, 110, side="sell", fee=1),
        deal(3, "2026-10-07", "MU", 2, 52, from_cash=True),
    ]
    points, _ = worth(trades, WEEK)
    assert [(point.value, point.money_in) for point in points] == [
        (200, 200),
        # One share left, and what the sale brought in after its fee.
        (101 + 109, 200),
        # Bought with that cash: $5 of it is left, and no new money went in.
        (102 + 104 + 5, 200),
    ]


def test_a_missing_close_is_filled_from_the_day_before_and_a_ticker_with_none_counts_at_cost():
    closes = {
        "SPY": WEEK["SPY"],
        # Nothing for Tuesday.
        "MU": [close for close in WEEK["MU"] if close.day.day != 6],
        "ZZZZ": [],
    }
    trades = [
        deal(1, "2026-10-05", "SPY", 1, 100),
        deal(2, "2026-10-05", "MU", 1, 50),
        deal(3, "2026-10-05", "ZZZZ", 4, 5, fee=2),
    ]
    points, at_cost = worth(trades, closes)
    # ZZZZ at the $22 it cost, fee included, every day.
    assert [point.value for point in points] == [100 + 50 + 22, 101 + 50 + 22, 102 + 52 + 22]
    assert at_cost == ["ZZZZ"]


def test_the_graph_starts_with_the_first_trade():
    closes = {"SPY": trading_days("2026-09-28", "2026-10-07")}
    # Recorded on a Saturday: the first close after it is Monday's.
    points, _ = worth([deal(1, "2026-10-03", "SPY", 1, 100)], closes)
    assert [str(point.day) for point in points] == ["2026-10-05", "2026-10-06", "2026-10-07"]
    assert worth([], closes) == ([], [])


def test_the_gain_is_the_last_value_against_the_money_put_in():
    trades = [deal(1, "2026-10-05", "SPY", 2, 100), deal(2, "2026-10-08", "SPY", 1, 103)]
    built = build_graphs(trades, WEEK, closes_enabled=True)
    last = built.graphs["daily"].points[-1]
    assert (str(last.day), last.value, last.money_in) == ("2026-10-07", 204, 200)
    assert (built.total_gain, built.total_gain_pct) == (4, 2)
    # Thursday's purchase is after the last close there is.
    assert (built.trade_count, built.trades_after) == (2, 1)
    # Three days in one week, month and year: a single point at each wider spacing, the same one.
    assert all(built.graphs[wider].points == [last] for wider in SPACINGS[1:])


def test_a_trade_made_after_the_last_close_has_nothing_to_draw_yet():
    built = build_graphs([deal(1, "2026-10-08", "SPY", 1, 103)], WEEK, closes_enabled=True)
    assert all(built.graphs[spacing].points == [] for spacing in SPACINGS)
    assert (built.trade_count, built.total_gain) == (1, None)


# The arithmetic: spacing the points out.


def test_a_weekly_graph_keeps_each_weeks_last_close():
    # Two whole weeks, then the Monday and Tuesday of a third.
    closes = trading_days("2026-09-21", "2026-10-06")
    assert days(space_out(closes, "weekly")) == ["2026-09-25", "2026-10-02", "2026-10-06"]


def test_a_week_cut_short_by_a_holiday_ends_on_its_last_trading_day():
    # No trading on Good Friday, April 3.
    closes = [close for close in trading_days("2026-03-30", "2026-04-10") if close.day.day != 3]
    assert days(space_out(closes, "weekly")) == ["2026-04-02", "2026-04-10"]


def test_monthly_and_yearly_graphs_keep_the_last_close_of_each():
    closes = trading_days("2024-11-01", "2026-10-06")
    assert days(space_out(closes, "monthly"))[:3] == ["2024-11-29", "2024-12-31", "2025-01-31"]
    assert days(space_out(closes, "yearly")) == ["2024-12-31", "2025-12-31", "2026-10-06"]


@pytest.mark.parametrize("spacing", SPACINGS)
def test_every_spacing_ends_on_the_latest_close(spacing):
    closes = trading_days("2024-11-01", "2026-10-06")
    assert space_out(closes, spacing)[-1] == closes[-1]


def test_how_far_back_each_spacing_reaches():
    latest = date(2026, 10, 6)
    assert first_day("daily", latest) == date(2026, 7, 6)
    assert first_day("weekly", latest) == date(2024, 10, 6)
    assert first_day("monthly", latest) == date(2016, 10, 6)
    assert first_day("yearly", latest) is None
    # Three months before May 31 there is no February 31.
    assert first_day("daily", date(2026, 5, 31)) == date(2026, 2, 28)


@pytest.mark.parametrize(
    ("utc", "final"),
    [
        # A Tuesday in New York: at 16:59 its close hasn't settled, at 17:00 it has.
        ("2026-10-06 20:59", "2026-10-05"),
        ("2026-10-06 21:00", "2026-10-06"),
        # Sunday, and Sunday night in New York when it is Monday already in UTC.
        ("2026-10-04 12:00", "2026-10-02"),
        ("2026-10-05 03:00", "2026-10-02"),
        # After New York's clocks went back an hour, 17:00 there is 22:00 UTC.
        ("2026-11-02 21:30", "2026-10-30"),
        ("2026-11-02 22:00", "2026-11-02"),
    ],
)
def test_a_days_close_is_final_at_five_in_new_york(utc, final):
    now = datetime.fromisoformat(utc).replace(tzinfo=UTC)
    assert str(last_settlement(now).date()) == final


# The page's data, through the API.


def graphs(client) -> dict:
    response = client.get("/api/graphs")
    assert response.status_code == 200, response.text
    return response.json()


def points(client, spacing: str = "daily") -> list[dict]:
    return graphs(client)["graphs"][spacing]["points"]


def buy(client, ticker: str, shares: str = "1", price: str = "100", on: str = "2026-09-01") -> None:
    response = client.post("/api/trades", json=trade(ticker, shares, price, on))
    assert response.status_code == 201, response.text


def last_day(client) -> str:
    return points(client)[-1]["day"]


def test_graphs_need_someone_signed_in(new_client):
    assert new_client().get("/api/graphs").status_code == 401


def test_the_total_counts_everything_held_each_day(account, closes):
    # From Monday, August 31: SPY closes at 600, 601, ..., MU from 90 and SNDK from 40.
    closes.closes = {
        "SPY": trading_days("2026-08-31", "2026-10-06", start=600),
        "MU": trading_days("2026-08-31", "2026-10-06", start=90),
        "SNDK": trading_days("2026-08-31", "2026-10-06", start=40),
    }
    ana = account()
    buy(ana, "MU", price="90")
    buy(ana, "SPY", shares="2", price="500")
    buy(ana, "SNDK", price="40")
    sale = trade("SNDK", "1", "45", "2026-09-02", side="sell")
    assert ana.post("/api/trades", json=sale).status_code == 201

    answer = graphs(ana)
    assert answer["closes_enabled"] is True and answer["trade_count"] == 4
    assert list(answer["graphs"]) == SPACINGS
    daily = answer["graphs"]["daily"]["points"]
    first, second, last = daily[0], daily[1], daily[-1]
    # The first trade's day, not the first day there are closes for.
    assert first["day"] == "2026-09-01"
    assert Decimal(first["value"]) == 2 * 601 + 91 + 41
    # SNDK sold: its $45 is cash now, and still part of the total.
    assert Decimal(second["value"]) == 2 * 602 + 92 + 45
    assert {Decimal(point["money_in"]) for point in daily} == {1130}
    assert Decimal(answer["total_gain"]) == Decimal(last["value"]) - 1130
    assert answer["unpriced"] == [] and answer["trades_after"] == 0
    # The ticker sold since is asked for too: it was part of the total while it was held.
    assert closes.asked == [["MU", "SNDK", "SPY"]]


def test_someone_elses_trades_stay_out(account, closes):
    closes.closes = {
        "SPY": trading_days("2026-09-01", "2026-10-06", start=600),
        "MU": trading_days("2026-09-01", "2026-10-06", start=90),
    }
    ana, ben = account("ana@example.com"), account("ben@example.com")
    buy(ana, "SPY", shares="5", price="600")
    buy(ben, "MU", price="90")
    assert Decimal(points(ben)[0]["value"]) == 90


def test_each_spacing_reaches_further_back(account, closes):
    closes.closes = {"SPY": trading_days("2015-01-01", "2026-10-06")}
    ana = account()
    buy(ana, "SPY", on="2015-01-02")
    drawn = graphs(ana)["graphs"]
    assert {spacing: drawn[spacing]["points"][0]["day"] for spacing in SPACINGS} == {
        "daily": "2026-07-06",
        "weekly": "2024-10-11",
        "monthly": "2016-10-31",
        "yearly": "2015-12-31",
    }
    assert {drawn[spacing]["points"][-1]["day"] for spacing in SPACINGS} == {"2026-10-06"}


def test_the_day_going_on_is_left_out_until_its_close_is_final(account, closes, clock):
    # Tuesday at 11:00 in New York. The provider lists Tuesday already, at the latest price.
    clock.now = datetime(2026, 10, 6, 15, 0, tzinfo=UTC)
    closes.closes = {"SPY": trading_days("2026-09-28", "2026-10-06")}
    ana = account()
    buy(ana, "SPY")
    assert last_day(ana) == "2026-10-05"

    # An hour after trading ended, Tuesday's close counts, and is fetched without being asked twice.
    clock.now = datetime(2026, 10, 6, 21, 0, tzinfo=UTC)
    assert last_day(ana) == "2026-10-06"
    assert len(closes.asked) == 2


def test_a_trade_made_today_waits_for_todays_close(account, closes, clock):
    clock.now = datetime(2026, 10, 6, 15, 0, tzinfo=UTC)
    closes.closes = {
        "SPY": trading_days("2026-09-28", "2026-10-06"),
        "MU": trading_days("2026-09-28", "2026-10-06", start=90),
    }
    ana = account()
    buy(ana, "SPY")
    buy(ana, "MU", on="2026-10-06")
    answer = graphs(ana)
    last = answer["graphs"]["daily"]["points"][-1]
    # Monday's close: SPY only, and only the money put into it.
    assert last["day"] == "2026-10-05"
    assert (Decimal(last["value"]), Decimal(last["money_in"])) == (105, 100)
    assert answer["trades_after"] == 1

    clock.now = datetime(2026, 10, 6, 21, 0, tzinfo=UTC)
    answer = graphs(ana)
    last = answer["graphs"]["daily"]["points"][-1]
    assert last["day"] == "2026-10-06"
    assert (Decimal(last["value"]), Decimal(last["money_in"])) == (202, 200)
    assert answer["trades_after"] == 0


def test_closes_are_asked_for_once_per_trading_day(account, closes, clock):
    # Friday evening in New York.
    clock.now = datetime(2026, 10, 9, 22, 0, tzinfo=UTC)
    closes.closes = {"SPY": trading_days("2026-09-28", "2026-10-09")}
    ana = account()
    buy(ana, "SPY")
    for _ in range(3):
        graphs(ana)
    assert len(closes.asked) == 1

    # Nothing closes over the weekend, nor on Monday before trading ends.
    saturday = datetime(2026, 10, 10, 12, 0, tzinfo=UTC)
    monday_afternoon = datetime(2026, 10, 12, 20, 0, tzinfo=UTC)
    for later in (saturday, monday_afternoon):
        clock.now = later
        graphs(ana)
    assert len(closes.asked) == 1

    clock.now = datetime(2026, 10, 12, 21, 0, tzinfo=UTC)
    graphs(ana)
    assert len(closes.asked) == 2


def test_a_failed_lookup_keeps_earlier_closes_and_is_tried_again_a_minute_later(
    account, closes, clock
):
    closes.closes = {"SPY": trading_days("2026-09-28", "2026-10-06")}
    ana = account()
    buy(ana, "SPY")
    assert last_day(ana) == "2026-10-06"

    # The next evening the provider can't be reached.
    clock.now += timedelta(days=1)
    closes.failing = {"SPY"}
    closes.closes = {"SPY": trading_days("2026-09-28", "2026-10-07")}
    assert last_day(ana) == "2026-10-06"
    assert last_day(ana) == "2026-10-06"
    assert len(closes.asked) == 2

    closes.failing = set()
    clock.now += timedelta(seconds=61)
    assert last_day(ana) == "2026-10-07"
    assert len(closes.asked) == 3


def test_a_ticker_the_provider_lacks_counts_at_cost_and_isnt_asked_for_again(account, closes):
    closes.closes = {"SPY": trading_days("2026-09-28", "2026-10-06")}
    ana = account()
    buy(ana, "SPY")
    buy(ana, "ZZZZ", shares="4", price="5")
    for _ in range(2):
        answer = graphs(ana)
        assert answer["unpriced"] == ["ZZZZ"]
        # SPY at its close, and ZZZZ at the $20 paid for it.
        assert Decimal(answer["graphs"]["daily"]["points"][0]["value"]) == 100 + 20
    assert closes.asked == [["SPY", "ZZZZ"]]


def test_a_share_split_replaces_the_whole_history(account, closes, clock):
    before = trading_days("2026-09-28", "2026-10-06", start=1000)
    closes.closes = {"SPY": before}
    ana = account()
    buy(ana, "SPY")
    assert Decimal(points(ana)[0]["value"]) == 1000

    # After a ten-for-one split every earlier close comes back a tenth of what
    # it was, and here the oldest day is no longer handed out at all.
    clock.now += timedelta(days=1)
    closes.closes = {
        "SPY": [DayClose(day, close / 10) for day, close in before[1:]]
        + [DayClose(date(2026, 10, 7), Decimal("100.7"))]
    }
    after = points(ana)
    assert (after[0]["day"], Decimal(after[0]["value"])) == ("2026-09-29", Decimal("100.1"))
    assert len(after) == len(before)


def test_without_a_key_there_is_nothing_to_draw(app, account):
    app.dependency_overrides[get_close_cache] = lambda: CloseCache(None)
    ana = account()
    buy(ana, "SPY")
    assert graphs(ana) == {
        "closes_enabled": False,
        "trade_count": 1,
        "graphs": {spacing: {"points": []} for spacing in SPACINGS},
        "total_gain": None,
        "total_gain_pct": None,
        "unpriced": [],
        "trades_after": 0,
    }


# Twelve Data itself, against a local server that answers as it does.


def _bars(*closes: tuple[str, str]) -> dict:
    # Newest first, every figure a string, as the real service sends them.
    values = [
        {"datetime": day, "open": "1", "high": "1", "low": "1", "close": close, "volume": "1"}
        for day, close in closes
    ]
    return {"meta": {"symbol": "AAPL", "interval": "1day"}, "values": values, "status": "ok"}


ANSWERS = {
    "AAPL": (200, _bars(("2026-10-05", "332.89001"), ("2026-10-02", "333.69000"))),
    "NOPE": (404, {"code": 404, "message": "**symbol** not found", "status": "error"}),
    # A refusal sent as an ordinary answer.
    "SOFT": (200, {"code": 404, "message": "**symbol** not found", "status": "error"}),
    "ABROAD": (403, {"code": 403, "message": "available on a higher plan", "status": "error"}),
    "BUSY": (429, {"code": 429, "message": "out of API credits", "status": "error"}),
    "SOFTBUSY": (200, {"code": 429, "message": "out of API credits", "status": "error"}),
    "DOWN": (502, "<html>Bad gateway</html>"),
}


@pytest.fixture
def twelve_data():
    seen: list[tuple[str, str | None]] = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            seen.append((self.path, self.headers.get("Authorization")))
            status, body = ANSWERS[parse_qs(urlparse(self.path).query)["symbol"][0]]
            self.send_response(status)
            self.end_headers()
            self.wfile.write((body if isinstance(body, str) else json.dumps(body)).encode())

        def log_message(self, *args: object) -> None:
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}", seen
    server.shutdown()
    server.server_close()


def test_twelve_datas_answers_are_read_as_it_sends_them(twelve_data):
    url, seen = twelve_data
    found = TwelveDataProvider("secret-key", url).fetch(list(ANSWERS))
    assert found == {
        # Oldest first, to the last digit.
        "AAPL": [
            DayClose(date(2026, 10, 2), Decimal("333.69000")),
            DayClose(date(2026, 10, 5), Decimal("332.89001")),
        ],
        # Nothing to be had for these, so there is no point asking again soon.
        "NOPE": None,
        "SOFT": None,
        "ABROAD": None,
        # Over the rate limit or out of order: left out, to be asked for again.
    }
    # The key travels in a header, never in the address.
    assert len(seen) == len(ANSWERS)
    assert all(key == "apikey secret-key" and "secret-key" not in path for path, key in seen)
