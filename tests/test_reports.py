"""Reading a broker's trade report: from the words found in a screenshot to a trade.

Every report here is made up. They are shaped like the banks' own, with an
invented trade in them: a real one shows a real person's money, and stays out
of the repository.
"""

from datetime import date
from decimal import Decimal

import pytest
from helpers import trade

from app.reports import Word, read, rows

TODAY = date(2026, 10, 7)


def under(*lines: str | tuple[str, str]) -> list[Word]:
    """Words where Bank of Georgia's report has them: each name with its figure right under it.

    A line given alone stands by itself, like the date at the top. The words
    are handed over bottom to top, since a recognition keeps no promised order.
    """
    words: list[Word] = []
    top = 300
    for line in lines:
        # A name is set smaller than the figure under it.
        for text, height in [(line, 40)] if isinstance(line, str) else zip(line, (33, 39), strict=True):
            left = 50
            for part in text.split():
                words.append(Word(part, left, top, left + 22 * len(part), top + height))
                left += 22 * len(part) + 12
            top += height + 28
        top += 90
    return words[::-1]


def beside(*lines: str | tuple[str, str]) -> list[Word]:
    """Words where TBC Bank's report has them: each name at the left, its figure at the right edge.

    A line given alone stands by itself at the left. The words are handed over
    a column at a time, every name and then every figure.
    """
    words = []
    for number, line in enumerate(lines):
        name, figure = (line, "") if isinstance(line, str) else line
        top = 100 + number * 150
        left = 80
        # Names are set smaller than figures, so the two don't line up exactly.
        for part in name.split():
            words.append(Word(part, left, top + 6, left + 20 * len(part), top + 44))
            left += 20 * len(part) + 14
        left = 2000 - sum(24 * len(part) + 14 for part in figure.split())
        for part in figure.split():
            words.append(Word(part, left, top, left + 24 * len(part), top + 50))
            left += 24 * len(part) + 14
    return sorted(words, key=lambda word: (word.left > 1000, word.top))


def as_sent(words: list[Word], latin: list[Word] | None = None) -> dict:
    sent = {"words": [word._asdict() for word in words]}
    if latin is not None:
        sent["latin"] = [word._asdict() for word in latin]
    return sent


def english_only(report: list[Word]) -> list[Word]:
    """The report as read knowing English only: every Georgian word gibberish, the rest as it is."""
    return [
        word._replace(text="0bLEHM6dy") if any("ა" <= letter <= "ჿ" for letter in word.text) else word
        for word in report
    ]


def bank_of_georgia(
    sentence: str = "Buy 0.5 shares of KO at 61.2345 FULL fill", rest: str = "", **changed: str
) -> list[Word]:
    """A purchase as Bank of Georgia reports it: half a share of KO at $61.2345, $30.62 in all.

    `rest` is what of the sentence didn't fit on its line and went onto the next.
    """
    figures = {
        "date": "14:05 03 აგვ, 2026",
        "amount": "-30.62 $",
        "shares": "0.5",
        "price": "61.23 $",
        **changed,
    }
    return under(
        "14:05 3 აგვისტო 2026",
        "-30.62 $",
        "დეტალები",
        ("ტრანზაქციის თარიღი", figures["date"]),
        ("ინსტრუმენტის დასახელება", "Coca-Cola Co."),
        ("ინსტრუმენტის იდენტიფიკატორი", "KO"),
        ("ტრანზაქციის თანხა", figures["amount"]),
        ("ფასიანი ქაღალდების რაოდენობა", figures["shares"]),
        ("ფასიანი ქაღალდის ფასი", figures["price"]),
        ("კომენტარი", sentence),
        *([rest] if rest else []),
        ("ტრანზაქციის ნომერი", "NA.0a1b2c3d-1111-2222-3333-444455556666"),
        ("შეკვეთის ნომერი", "NAAA000001"),
    )


def tbc_bank(**changed: str) -> list[Word]:
    """A purchase as TBC Bank reports it: 0.4 of a share of PEP at $150.25, $60.10 in all."""
    figures = {
        "kind": "ყიდვა",
        "shares": "0.4",
        "price": "150.25 $",
        "amount": "-60.10 $",
        "date": "2026, 14 აგვისტო, 11:20:45",
        **changed,
    }
    return beside(
        "ტრანზაქციის დეტალები",
        "14 აგვისტო, 2026",
        f"{figures['kind']} - PEP, PepsiCo, Inc.",
        figures["amount"],
        "დეტალები",
        ("ტრანზაქციის ტიპი", figures["kind"]),
        ("აქციის სიმბოლო", "PEP"),
        ("აქციის სახელი", "PepsiCo, Inc."),
        ("აქციების რაოდენობა", figures["shares"]),
        ("დავალების შესრულების ფასი", figures["price"]),
        ("თანხა", figures["amount"]),
        ("თარიღი", figures["date"]),
        "კომენტარი",
    )


def text(report: list[Word]) -> list[str]:
    return [row.text for row in rows(report)]


# Bank of Georgia: a name with its figure under it, and the trade again in a sentence.


def test_words_are_put_back_into_rows_by_where_they_sat():
    assert text(bank_of_georgia())[3:7] == [
        "ტრანზაქციის თარიღი",
        "14:05 03 აგვ, 2026",
        "ინსტრუმენტის დასახელება",
        "Coca-Cola Co.",
    ]
    # The names come in one column and the figures in another: a row is what sat level.
    assert text(tbc_bank())[5:9] == [
        "ტრანზაქციის ტიპი ყიდვა",
        "აქციის სიმბოლო PEP",
        "აქციის სახელი PepsiCo, Inc.",
        "აქციების რაოდენობა 0.4",
    ]


def test_a_bank_of_georgia_report_is_read():
    reading = read(bank_of_georgia(), TODAY)
    assert (reading.broker, reading.side, reading.ticker) == ("bog", "buy", "KO")
    # The exact price, from the sentence, not the one rounded to the cent in its own row.
    assert (reading.shares, reading.price) == (Decimal("0.5"), Decimal("61.2345"))
    assert reading.trade_date == date(2026, 8, 3)
    # The report doesn't show the fee.
    assert reading.fee is None
    # Half a share at $61.2345 comes to the $30.62 shown.
    assert reading.adds_up is True


def test_a_bank_of_georgia_sale_is_read():
    # Money coming in has no sign there: the sentence says it was a sale.
    sale = bank_of_georgia("Sell 0.5 shares of KO at 61.2345 FULL fill", amount="30.62 $")
    reading = read(sale, TODAY)
    assert (reading.broker, reading.side, reading.ticker, reading.adds_up) == ("bog", "sell", "KO", True)


def test_figures_are_better_guessed_by_the_reading_that_knows_english_only():
    # Knowing Georgian too, the recognition spoiled a digit, a sign and a day.
    spoiled = bank_of_georgia(
        "Buy 0.5 shares of KO at 61.2#45 FULL fill", price="61.23 %", date="14:05 08 აგვ, 2026"
    )
    reading = read(spoiled, TODAY, latin=english_only(bank_of_georgia()))
    assert (reading.ticker, reading.shares, reading.price) == ("KO", Decimal("0.5"), Decimal("61.2345"))
    # The month from the reading that knows Georgian, its day from the one that doesn't.
    assert reading.trade_date == date(2026, 8, 3)
    assert (reading.broker, reading.adds_up) == ("bog", True)


def test_a_spoiled_sentence_leaves_the_rows_to_go_by():
    reading = read(bank_of_georgia("Buy 0.5 shares of KO at 61.2#45 FULL fill"), TODAY)
    # The price as its row has it, to the cent, which still comes to the amount.
    assert (reading.side, reading.ticker) == ("buy", "KO")
    assert (reading.shares, reading.price, reading.adds_up) == (Decimal("0.5"), Decimal("61.23"), True)


def test_a_figure_misread_in_one_place_is_taken_from_the_other():
    # The sentence's share count has a 6 for the 5; its row has it right.
    reading = read(bank_of_georgia("Buy 0.6 shares of KO at 61.2345 FULL fill"), TODAY)
    assert (reading.shares, reading.price, reading.adds_up) == (Decimal("0.5"), Decimal("61.2345"), True)


def test_figures_misread_everywhere_are_noticed():
    reading = read(bank_of_georgia("Buy 0.6 shares of KO at 61.2345 FULL fill", shares="0.6"), TODAY)
    assert (reading.shares, reading.adds_up) == (Decimal("0.6"), False)


def test_a_sentence_broken_over_two_lines_is_read():
    report = bank_of_georgia("Buy 0.5 shares of KO at", rest="61.2345 FULL fill")
    assert read(report, TODAY).price == Decimal("61.2345")


def test_without_the_sentence_only_a_sign_tells_the_side():
    assert read(bank_of_georgia("Bvy O.5 shares"), TODAY).side == "buy"
    # No sign: money coming in, or a minus that wasn't read. Not for the rules to guess.
    assert read(bank_of_georgia("Bvy O.5 shares", amount="30.62 $"), TODAY).side is None


# TBC Bank: a name with its figure beside it, each figure shown once.


def test_a_tbc_bank_report_is_read():
    reading = read(tbc_bank(), TODAY)
    assert (reading.broker, reading.side, reading.ticker) == ("tbc", "buy", "PEP")
    assert (reading.shares, reading.price) == (Decimal("0.4"), Decimal("150.25"))
    # Written the other way round there: the year, the day, the month.
    assert reading.trade_date == date(2026, 8, 14)
    assert reading.fee is None
    assert reading.adds_up is True


def test_a_tbc_bank_sale_is_read():
    reading = read(tbc_bank(kind="გაყიდვა", amount="+60.10 $"), TODAY)
    # "გაყიდვა" (selling) contains "ყიდვა" (buying): it must not read as a purchase.
    assert (reading.broker, reading.side, reading.ticker, reading.adds_up) == ("tbc", "sell", "PEP", True)


def test_each_reading_can_be_wrong_and_the_amount_says_which():
    report = english_only(tbc_bank())
    # Knowing English only, the recognition lost the price's decimal point...
    lost_point = [word._replace(text="15025") if word.text == "150.25" else word for word in report]
    reading = read(tbc_bank(), TODAY, latin=lost_point)
    assert (reading.shares, reading.price, reading.adds_up) == (Decimal("0.4"), Decimal("150.25"), True)
    # ...and knowing Georgian too, it took a 5 for a 6 and the kind of trade for gibberish.
    reading = read(tbc_bank(price="160.25 §", kind="yn3so"), TODAY, latin=report)
    assert (reading.shares, reading.price, reading.adds_up) == (Decimal("0.4"), Decimal("150.25"), True)
    assert (reading.side, reading.ticker) == ("buy", "PEP")


def test_a_price_wrong_in_both_readings_is_noticed():
    wrong = tbc_bank(price="160.25 $")
    reading = read(wrong, TODAY, latin=english_only(wrong))
    assert (reading.price, reading.adds_up) == (Decimal("160.25"), False)


# Whatever the report.


def test_a_picture_of_something_else_holds_no_trade():
    assert not read(under("Happy birthday!", "See you on Saturday"), TODAY).found


# A plainer report in English, as another bank might show it.
PLAIN = beside(
    ("Instrument", "MU - Micron Technology"),
    ("Side", "Buy"),
    ("Quantity", "0.1348"),
    ("Price", "$222.5519"),
    ("Amount", "$30.00"),
    ("Commission", "$0.09"),
    ("Date", "06.10.2026 17:42"),
)


def test_a_plain_report_in_english_is_read():
    reading = read(PLAIN, TODAY)
    assert (reading.broker, reading.side, reading.ticker) == (None, "buy", "MU")
    assert (reading.shares, reading.price) == (Decimal("0.1348"), Decimal("222.5519"))
    assert (reading.fee, reading.trade_date) == (Decimal("0.09"), date(2026, 10, 6))
    assert reading.adds_up is True


def test_what_a_report_leaves_out_is_left_empty():
    reading = read(beside(("Instrument", "MU"), ("Quantity", "2")), TODAY)
    assert (reading.ticker, reading.shares) == ("MU", 2)
    assert (reading.side, reading.price, reading.fee, reading.trade_date) == (None,) * 4
    # Nothing to check the figures against.
    assert reading.adds_up is None


@pytest.mark.parametrize(
    ("shown", "day"),
    [
        # Bank of Georgia's two ways, under the name and at the top of the report.
        ("09:41 17 სექ, 2026", date(2026, 9, 17)),
        ("09:41 17 სექტემბერი 2026", date(2026, 9, 17)),
        # TBC Bank's two.
        ("2026, 17 სექტემბერი, 09:41:10", date(2026, 9, 17)),
        ("17 სექტემბერი, 2026", date(2026, 9, 17)),
        ("06.10.2026 17:42", date(2026, 10, 6)),
        ("06/10/2026", date(2026, 10, 6)),
        ("2026-10-06", date(2026, 10, 6)),
        ("6 Oct 2026", date(2026, 10, 6)),
        ("October 6, 2026", date(2026, 10, 6)),
        # Tomorrow already, where the phone is: Tbilisi is ahead of the server's clock.
        ("08.10.2026", date(2026, 10, 8)),
        # Not a day anyone has traded on yet, so not this trade's.
        ("06.10.2027", None),
        ("31.02.2026", None),
    ],
)
def test_dates_as_reports_write_them(shown: str, day: date | None):
    assert read(beside(("Instrument", "MU"), ("Date", shown)), TODAY).trade_date == day


@pytest.mark.parametrize(
    ("shown", "amount", "price"),
    [
        ("2,345.67 $", "120.00 $", "2345.67"),
        ("222.5519", "$30.00", "222.5519"),
        # The amount, shown to the cent, tells which mark the report splits decimals with.
        ("1 234,56 USD", "30,00 USD", "1234.56"),
        # Kept to the four decimals a price is stored with.
        ("$71.054321", "$30.00", "71.0543"),
    ],
)
def test_prices_as_reports_write_them(shown: str, amount: str, price: str):
    reading = read(beside(("Instrument", "MU"), ("Price", shown), ("Amount", amount)), TODAY)
    assert reading.price == Decimal(price)


# Over the API: each report's trade goes straight into the journal, or its answer says why not.


# The sale of what tbc_bank() buys, on the same day.
TBC_SALE = tbc_bank(kind="გაყიდვა", amount="+60.10 $")
# A report whose shares and price don't come to its amount.
MISREAD = bank_of_georgia("Buy 0.6 shares of KO at 61.2345 FULL fill", shares="0.6")


def send(client, *reports: dict):
    return client.post("/api/reports/add", json={"reports": list(reports)})


def outcomes(client, *reports: list[Word]) -> list[dict]:
    """What became of each of several reports sent together, in the order sent."""
    response = send(client, *(as_sent(report) for report in reports))
    assert response.status_code == 200, response.text
    return response.json()


def add(client, report: list[Word], latin: list[Word] | None = None) -> dict:
    """Send one report by itself, and hand back the trade it added."""
    response = send(client, as_sent(report, latin))
    assert response.status_code == 200, response.text
    [outcome] = response.json()
    assert outcome["problem"] is None, outcome["problem"]
    return outcome["added"]


def refusal(client, report: list[Word]) -> str:
    """Why a report's trade wasn't added, having checked that nothing was."""
    before = client.get("/api/trades").json()
    [outcome] = outcomes(client, report)
    assert outcome["added"] is None
    assert client.get("/api/trades").json() == before
    return outcome["problem"]


def test_a_report_adds_its_trade_for_someone_signed_in(account, new_client):
    report, latin = bank_of_georgia(), english_only(bank_of_georgia())
    assert send(new_client(), as_sent(report, latin)).status_code == 401
    ana = account()
    added = add(ana, report, latin)
    saved = added["trade"]
    assert (saved["side"], saved["ticker"], saved["broker"]) == ("buy", "KO", "bog")
    assert (saved["price"], saved["shares"], saved["trade_date"]) == ("61.2345", "0.50000000", "2026-08-03")
    # Not on the report: worked out from the bank's tariff, which charges
    # nothing while what is held there is worth $1,000 or less.
    assert (saved["fee"], added["fee_worked_out"]) == ("0.0000", True)
    # What a report can't tell is as the form starts it.
    assert (saved["thesis"], saved["forecast"], saved["paid_from_cash"]) == ("", "", False)
    assert (saved["take_profit"], saved["stop_loss"]) == (None, None)
    # It is in the journal, as that trade.
    assert [listed["id"] for listed in ana.get("/api/trades").json()] == [saved["id"]]
    assert ana.get(f"/api/trades/{saved['id']}").json()["ticker"] == "KO"


def test_the_fee_is_worked_out_from_what_is_held_at_the_bank(account):
    ana = account()
    # Two shares of SPY at Bank of Georgia, worth $1,200 at the tests' price of $600.
    assert ana.post("/api/trades", json=trade("SPY", "2", "450", "2026-07-01", broker="bog")).status_code == 201
    added = add(ana, bank_of_georgia())
    # 0.3% of $30.62 is nine cents: the least the bank takes is fifty.
    assert (added["trade"]["fee"], added["fee_worked_out"]) == ("0.5000", True)
    assert added["trade"]["net_amount"] == "31.117250000000"
    # A bigger trade pays the 0.3%.
    bigger = bank_of_georgia("Buy 10 shares of KO at 61.2345 FULL fill", shares="10", amount="-612.35 $")
    assert add(ana, bigger)["trade"]["fee"] == "1.8400"


def test_only_what_was_held_by_the_day_of_the_trade_counts(account):
    ana = account()
    # Bought a month after the trade in the report, and at the other bank.
    assert ana.post("/api/trades", json=trade("SPY", "2", "450", "2026-09-01", broker="bog")).status_code == 201
    assert ana.post("/api/trades", json=trade("SPY", "2", "450", "2026-07-01", broker="tbc")).status_code == 201
    assert add(ana, bank_of_georgia())["trade"]["fee"] == "0.0000"


def test_a_purchase_from_a_report_is_new_money_and_says_what_cash_could_pay(account):
    ana = account()
    # A share bought and sold before the report's trade, which leaves $470 of cash.
    assert ana.post("/api/trades", json=trade("SPY", "1", "450", "2026-07-01")).status_code == 201
    assert ana.post("/api/trades", json=trade("SPY", "1", "470", "2026-07-15", side="sell")).status_code == 201
    saved = add(ana, bank_of_georgia())["trade"]
    # The report doesn't say what paid for it: that is said afterwards, on the page.
    assert (saved["paid_from_cash"], Decimal(saved["cash_used"])) == (False, 0)
    assert Decimal(saved["cash_available"]) == Decimal(saved["net_amount"]) == Decimal("30.61725")


def test_a_fee_the_report_shows_is_taken_as_it_is(account):
    added = add(account(), PLAIN)
    assert (added["trade"]["ticker"], added["trade"]["fee"], added["fee_worked_out"]) == ("MU", "0.0900", False)
    # No row says which bank the report is from, so the trade names none.
    assert added["trade"]["broker"] is None


def test_the_other_banks_sale_is_added_too(account):
    ana = account()
    assert ana.post("/api/trades", json=trade("PEP", "1", "140", "2026-08-01", broker="tbc")).status_code == 201
    added = add(ana, TBC_SALE, english_only(TBC_SALE))
    saved = added["trade"]
    assert (saved["broker"], saved["side"], saved["ticker"]) == ("tbc", "sell", "PEP")
    assert (saved["price"], saved["trade_date"]) == ("150.2500", "2026-08-14")
    # TBC's app charges nothing for a trade.
    assert (saved["fee"], added["fee_worked_out"]) == ("0.0000", True)
    # A sale's gain is worked out like any other's: 0.4 of a share bought at $140.
    assert saved["realized_gain"] == "4.100000000000"


def test_a_picture_that_shows_no_trade_adds_nothing(account):
    assert refusal(account(), under("Happy birthday!")).startswith("No trade was found")


def test_a_report_with_something_unreadable_adds_nothing(account):
    ana = account()
    # No sentence and no sign on the amount: nothing says whether it was bought or sold.
    unsigned = bank_of_georgia("Bvy O.5 shares", amount="30.62 $")
    assert refusal(ana, unsigned) == (
        "The report shows no readable buy or sell, so the trade wasn't added."
    )
    cut_off = beside(("Instrument", "MU"), ("Quantity", "2"))
    assert refusal(ana, cut_off) == (
        "The report shows no readable buy or sell, date and price, so the trade wasn't added."
    )


def test_figures_that_cant_be_checked_against_an_amount_add_nothing(account):
    # Everything but the amount, as when the screenshot was cut short.
    report = beside(("Instrument", "MU"), ("Side", "Buy"), ("Quantity", "2"), ("Price", "$90.00"), ("Date", "06.10.2026"))
    assert refusal(account(), report) == "The report shows no readable amount, so the trade wasn't added."


def test_figures_that_dont_come_to_the_amount_add_nothing(account):
    assert "a figure was probably misread" in refusal(account(), MISREAD)


def test_the_same_report_isnt_added_twice(account):
    ana = account()
    add(ana, bank_of_georgia())
    assert refusal(ana, bank_of_georgia()) == (
        "That trade is already in your journal: the purchase of 0.5 KO on 2026-08-03. It wasn't added again."
    )
    assert len(ana.get("/api/trades").json()) == 1


def test_a_trade_typed_in_earlier_isnt_added_again(account):
    ana = account()
    # Typed from the report's row, which has the price to the cent, and with no broker named.
    assert ana.post("/api/trades", json=trade("KO", "0.5", "61.23", "2026-08-03")).status_code == 201
    assert refusal(ana, bank_of_georgia()).startswith("That trade is already in your journal")
    # Another day's, another count of shares or another price is another trade.
    for other in [
        trade("PEP", "0.4", "150.25", "2026-08-13"),
        trade("PEP", "0.3", "150.25", "2026-08-14"),
        trade("PEP", "0.4", "150.26", "2026-08-14"),
    ]:
        assert ana.post("/api/trades", json=other).status_code == 201
    add(ana, tbc_bank())


def test_someone_elses_trade_doesnt_stand_in_the_way(account):
    add(account("ana@example.com"), bank_of_georgia())
    add(account("ben@example.com", "ben-password-1"), bank_of_georgia())


def test_a_sale_of_shares_that_werent_held_adds_nothing(account):
    ana = account()
    assert refusal(ana, TBC_SALE) == (
        "The report is of a sale of 0.4 PEP on 2026-08-14, but you held none then. Add the purchase first."
    )
    assert ana.post("/api/trades", json=trade("PEP", "0.1", "140", "2026-08-01")).status_code == 201
    assert "but you only held 0.1 then" in refusal(ana, TBC_SALE)


def test_a_sale_that_would_leave_a_later_one_short_adds_nothing(account):
    ana = account()
    assert ana.post("/api/trades", json=trade("PEP", "0.5", "140", "2026-08-01")).status_code == 201
    assert ana.post("/api/trades", json=trade("PEP", "0.5", "155", "2026-09-01", side="sell")).status_code == 201
    assert refusal(ana, TBC_SALE) == (
        "That would leave your sale of 0.5 PEP on 2026-09-01 without enough shares. "
        "Change or delete that sale first."
    )


def test_figures_no_trade_could_have_add_nothing(account):
    # More shares than a trade is stored with, though they do come to the amount.
    huge = beside(
        ("Instrument", "MU"),
        ("Side", "Buy"),
        ("Quantity", "12345678901"),
        ("Price", "$1.00"),
        ("Amount", "$12345678901.00"),
        ("Date", "06.10.2026"),
    )
    assert refusal(account(), huge) == (
        "The figures read from the report can't be saved as a trade, so it wasn't added."
    )


def test_more_words_than_a_report_holds_are_no_report(account):
    flood = [Word("MU", 0, 0, 10, 10)] * 1501
    assert refusal(account(), flood).startswith("No trade was found")


# Several at once: every report gets its own answer, and one refused doesn't stop the rest.


def test_each_of_several_reports_gets_its_own_answer(account):
    ana = account()
    first, second, third, fourth = outcomes(ana, bank_of_georgia(), MISREAD, under("Happy birthday!"), tbc_bank())
    # In the order they were sent, each with a trade or a reason and never both.
    assert (first["added"]["trade"]["ticker"], first["problem"]) == ("KO", None)
    assert second["added"] is None and "a figure was probably misread" in second["problem"]
    assert third["added"] is None and third["problem"].startswith("No trade was found")
    assert (fourth["added"]["trade"]["ticker"], fourth["problem"]) == ("PEP", None)
    # The two that could be added are in the journal, whatever became of the others.
    assert sorted(saved["ticker"] for saved in ana.get("/api/trades").json()) == ["KO", "PEP"]


def test_something_that_is_no_report_doesnt_turn_the_others_away(account):
    ana = account()
    flood = {"words": [Word("MU", 0, 0, 10, 10)._asdict()] * 1501}
    response = send(ana, flood, "a picture", {"words": "none"}, as_sent(bank_of_georgia()))
    assert response.status_code == 200, response.text
    *others, last = response.json()
    assert all(other["problem"].startswith("No trade was found") for other in others)
    assert last["added"]["trade"]["ticker"] == "KO"


def test_a_sale_sent_ahead_of_its_purchase_still_finds_its_shares(account):
    ana = account()
    # A week before it was sold, and on the very day: either way the purchase goes in first.
    for bought in [tbc_bank(date="2026, 07 აგვისტო, 09:30:00"), tbc_bank()]:
        sale, purchase = outcomes(ana, TBC_SALE, bought)
        assert (sale["problem"], purchase["problem"]) == (None, None)
        assert (sale["added"]["trade"]["side"], purchase["added"]["trade"]["side"]) == ("sell", "buy")
        # Each is told as it stands once both are in: the purchase is sold out.
        assert purchase["added"]["trade"]["remaining_shares"] == "0E-8"
        # Cleared for the next one, the sale first: its purchase can't go while it stands.
        for saved in (sale, purchase):
            assert ana.delete(f"/api/trades/{saved['added']['trade']['id']}").status_code == 204


def test_a_fee_counts_what_an_earlier_report_in_the_same_lot_bought(account):
    # Twenty shares two days before the half share, and sent after it. Once
    # they are held, at the tests' price of $600 a share, the bank charges.
    earlier = bank_of_georgia(
        "Buy 20 shares of KO at 61.2345 FULL fill", date="09:15 01 აგვ, 2026", shares="20", amount="-1224.69 $"
    )
    later, first = outcomes(account(), bank_of_georgia(), earlier)
    # Nothing was held when the twenty were bought.
    assert (first["added"]["trade"]["trade_date"], first["added"]["trade"]["fee"]) == ("2026-08-01", "0.0000")
    assert (later["added"]["trade"]["trade_date"], later["added"]["trade"]["fee"]) == ("2026-08-03", "0.5000")


def test_the_same_report_twice_in_one_lot_is_added_once(account):
    ana = account()
    once, again = outcomes(ana, bank_of_georgia(), bank_of_georgia())
    assert once["added"]["trade"]["ticker"] == "KO"
    assert again["problem"].startswith("That trade is already in your journal")
    assert len(ana.get("/api/trades").json()) == 1


def test_a_lot_holds_some_reports_and_no_more_than_thirty(account):
    ana = account()
    assert send(ana).status_code == 422
    assert send(ana, *[as_sent(under("Happy birthday!"))] * 31).status_code == 422
    assert len(outcomes(ana, *[under("Happy birthday!")] * 30)) == 30
    assert ana.get("/api/trades").json() == []
