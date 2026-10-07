"""Reading a broker's trade report.

The report is a screenshot, and it stays on the device that took it: there the
words in it are recognised (frontend/src/ocr.ts), and only those words, with
where each one sat, arrive here. This module puts them back into rows and
finds the trade in them with regular expressions. It stores nothing and asks
no outside service: the trade it finds is saved by whoever asked for it
(app/routers/reports.py), and the words are then forgotten.

The picture is read twice. Knowing Georgian and English at once, the
recognition gets the Georgian names right but now and then spoils a Latin
letter or a digit: "$" comes out as "%", a 5 as a 6. Knowing English only, it
makes nothing of the Georgian and is better with figures, though not always
right either: it can lose a decimal point. So names and months are taken from
the first reading, and every figure is taken from both, as two guesses. Where
the words sat says which figure belongs to which name, and the amount settles
which guess is right: the price times the shares has to come to it.

The rules were written against two reports of a finished trade, both with the
bank's app set to Georgian:

- Bank of Georgia's has each name with its figure under it, and says the trade
  over again in one English sentence, "Buy 0.5 shares of KO at 61.2345 FULL
  fill", which has the exact price.
- TBC Bank's has each name with its figure beside it, at the right edge.

When a bank changes its report, add a made-up one shaped like the new one to
tests/test_reports.py, then change the rules until it is read.
"""

import re
import unicodedata
from collections import Counter
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_EVEN, Decimal
from typing import NamedTuple

# How far the price times the shares may be from the amount a report shows
# before a figure is taken for misread: the amount is rounded to the cent, and
# so can the price be, which is half a cent a share.
CENT = Decimal("0.01")
HALF_CENT = Decimal("0.005")


class Word(NamedTuple):
    """A word as it was read, and where: in pixels from the picture's top left corner."""

    text: str
    left: float
    top: float
    right: float
    bottom: float


class Row(NamedTuple):
    """The words that stood side by side, left to right."""

    words: tuple[Word, ...]

    @property
    def text(self) -> str:
        return " ".join(word.text for word in self.words)

    @property
    def top(self) -> float:
        return min(word.top for word in self.words)

    @property
    def bottom(self) -> float:
        return max(word.bottom for word in self.words)


@dataclass
class Reading:
    """What a report says about one trade. None where it shows nothing readable."""

    broker: str | None = None
    side: str | None = None
    ticker: str | None = None
    price: Decimal | None = None
    shares: Decimal | None = None
    fee: Decimal | None = None
    trade_date: date | None = None
    # Whether the price times the shares comes to the amount the report shows.
    # None when it shows no amount to check against.
    adds_up: bool | None = None

    @property
    def found(self) -> bool:
        """Whether this looks like a trade at all."""
        return self.ticker is not None and (self.price is not None or self.shares is not None)

    @property
    def missing(self) -> list[str]:
        """What a trade can't be saved without and the report shows nothing readable for, by name.

        The amount is one of them: it is what the price and the shares are
        checked against, and nobody else checks them before the trade is saved.
        """
        needed = {
            "buy or sell": self.side,
            "ticker": self.ticker,
            "date": self.trade_date,
            "price": self.price,
            "shares": self.shares,
        }
        names = [name for name, value in needed.items() if value is None]
        # With a price and shares, nothing to check them against means no amount.
        if self.adds_up is None and self.price is not None and self.shares is not None:
            names.append("amount")
        return names


def rows(words: Iterable[Word]) -> list[Row]:
    """The words put back into rows, top to bottom, each read left to right.

    A recognition hands words over in an order of its own: a report with names
    at the left and figures at the right can arrive a column at a time. Where
    the words sat says which belong together.
    """
    lines: list[list[Word]] = []
    # The span of the tallest word in the row being filled: a small name and a
    # large figure share a row when either one's middle is level with the other.
    top = bottom = 0.0
    for word in sorted(words, key=lambda word: word.top + word.bottom):
        word = word._replace(text=_plain(word.text))
        if not word.text:
            continue
        middle = (word.top + word.bottom) / 2
        if lines and (top < middle < bottom or word.top < (top + bottom) / 2 < word.bottom):
            lines[-1].append(word)
            if word.bottom - word.top > bottom - top:
                top, bottom = word.top, word.bottom
        else:
            lines.append([word])
            top, bottom = word.top, word.bottom
    return [Row(tuple(sorted(line, key=lambda word: word.left))) for line in lines]


def _plain(text: str) -> str:
    """One way of writing each character, so the rules meet a single spelling."""
    text = unicodedata.normalize("NFKC", text)
    # Every kind of dash and minus becomes a hyphen; spaces inside a word go.
    return "".join(re.sub(r"[‐-―−]", "-", text).split())


# Bank of Georgia's own account of the order, in English whatever language the
# app is set to: "Buy 0.5 shares of KO at 61.2345 FULL fill". A figure the
# recognition spoiled ("61.2#45") doesn't fit, and the rows are used instead.
_ORDER = re.compile(
    r"\b(?P<side>buy|sell)\s+(?P<shares>\d[\d.,]*)\s+shares?\s+of\s+"
    r"(?P<ticker>[A-Z][A-Z0-9]{0,5}(?:[.\-][A-Z]{1,2})?)\s+at\s+(?P<price>\d[\d.,]*)(?!\S)",
    re.IGNORECASE,
)

# What a row's name is, per field: Bank of Georgia's, then TBC Bank's, then
# plainer ones in both languages. Each is tried at the start of a row. The
# figure is beside the name or, when the name fills its row, under it.
_NAMES = {
    "ticker": r"ინსტრუმენტის იდენტიფიკატორი|აქციის სიმბოლო|ticker|symbol|instrument",
    "side": r"ტრანზაქციის ტიპი|side|operation",
    "shares": r"ფასიანი ქაღალდების რაოდენობა|აქციების რაოდენობა|რაოდენობა|quantity|shares",
    "price": r"ფასიანი ქაღალდის ფასი|დავალების შესრულების ფასი|ფასი|price",
    "amount": r"ტრანზაქციის თანხა|თანხა|amount|total",
    "fee": r"საკომისიო|commission|fee",
    "date": r"ტრანზაქციის თარიღი|თარიღი|date",
}
_NAMED = {
    field: re.compile(rf"(?:{names})\b\s*:?\s*", re.IGNORECASE) for field, names in _NAMES.items()
}

# Selling is looked for first: the Georgian for it contains the word for buying.
_SELL = re.compile(r"\b(?:sell|sold|sale)\b|გაყიდვა", re.IGNORECASE)
_BUY = re.compile(r"\b(?:buy|bought|purchase)\b|ყიდვა", re.IGNORECASE)

# Neither report carries its bank's name. Each is known by a row the other
# doesn't have.
_BROKERS = {
    "bog": re.compile(r"ინსტრუმენტის იდენტიფიკატორი"),
    "tbc": re.compile(r"აქციის სიმბოლო|დავალების შესრულების ფასი"),
}

# A ticker as the form accepts it, written in capitals in the report.
_TICKER = re.compile(r"\b[A-Z][A-Z0-9]{0,5}(?:[.\-][A-Z]{1,2})?\b")
# Words in capitals that aren't one.
_NOT_TICKERS = {"USD", "GEL", "EUR", "GBP", "BUY", "SELL", "ETF", "ID", "FULL"}

# Digits with the marks that group and split them: 1,234.56 or 1 234,56 or 0.1348.
_NUMBER = re.compile(r"\d{1,3}(?: \d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)*")

# Months by their first three letters, which is enough in both languages.
_MONTH_NAMES = (
    ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"),
    ("იან", "თებ", "მარ", "აპრ", "მაი", "ივნ", "ივლ", "აგვ", "სექ", "ოქტ", "ნოე", "დეკ"),
)
_MONTHS = {
    name: month for names in _MONTH_NAMES for month, name in enumerate(names, start=1)
}
_WORD = r"[^\W\d_]+"
# Dates written in figures only.
_FIGURE_DATES = (
    # 2026-10-06
    re.compile(r"\b(?P<year>\d{4})-(?P<month>\d{1,2})-(?P<day>\d{1,2})\b"),
    # 06.10.2026 and 06/10/2026: the day first, as Georgia writes it.
    re.compile(r"\b(?P<day>\d{1,2})[./-](?P<month>\d{1,2})[./-](?P<year>\d{4})\b"),
)
# Dates naming the month. Beside each, the same date as the reading that knows
# no Georgian shows it: its month is gibberish ("03 dgd, 2026"), but its day
# and year are the better guess.
_NAMED_DATES = (
    # Bank of Georgia's "03 აგვ, 2026", and the top of TBC Bank's report.
    (
        re.compile(rf"\b(?P<day>\d{{1,2}}) (?P<name>{_WORD})\.?,? (?P<year>\d{{4}})\b"),
        re.compile(r"\b(?P<day>\d{1,2}) \S+ (?P<year>\d{4})\b"),
    ),
    # TBC Bank's "2026, 14 აგვისტო, 11:20:45"
    (
        re.compile(rf"\b(?P<year>\d{{4}}),? (?P<day>\d{{1,2}}) (?P<name>{_WORD})"),
        re.compile(r"\b(?P<year>\d{4}),? (?P<day>\d{1,2}) \S"),
    ),
    # Oct 6, 2026
    (re.compile(rf"\b(?P<name>{_WORD})\.? (?P<day>\d{{1,2}}),? (?P<year>\d{{4}})\b"), None),
)


def read(words: Iterable[Word], today: date, latin: Iterable[Word] | None = None) -> Reading:
    """Find the trade in a report's words.

    `words` is the picture read knowing Georgian and English, `latin` the same
    picture read knowing English only, as a second guess at every figure.
    `today` rules out dates still to come.
    """
    named = rows(words)
    figures = named if latin is None else rows(latin)
    written = " ".join(row.text for row in named)
    in_figures = " ".join(row.text for row in figures)
    comma = _decimal_comma(in_figures)
    reading = Reading()

    reading.broker = next((broker for broker, mark in _BROKERS.items() if mark.search(written)), None)

    def guesses(field: str) -> list[str]:
        """Every guess at what the report shows for the field, the better reading's first."""
        return [text for pair in _shown(named, figures, field) for text in reversed(pair) if text]

    def numbers(field: str) -> list[Decimal]:
        return [number for text in guesses(field) if (number := _number(text, comma)) is not None]

    # Bank of Georgia's sentence, once from each reading.
    orders = [order for text in dict.fromkeys((in_figures, written)) if (order := _ORDER.search(text))]

    # The shares and the price, from the most exact guess to the least: the
    # sentence has the price to four decimals, its row to the cent.
    shares = [*(_number(order["shares"], comma) for order in orders), *numbers("shares")]
    prices = [*(_number(order["price"], comma) for order in orders), *numbers("price")]
    count, price, reading.adds_up = _settled(shares, prices, numbers("amount"))
    # Kept to the decimals a trade is stored with, so the form takes them as they are.
    reading.shares = _positive(count, places=8)
    reading.price = _positive(price, places=4)

    fee = next(iter(numbers("fee")), None)
    reading.fee = None if fee is None else _rounded(fee, places=4)

    reading.ticker = _agreed(
        [
            *(order["ticker"].upper() for order in orders),
            *map(_ticker, guesses("ticker")),
        ]
    )

    # Money going out is a purchase, and coming in with a plus sign a sale.
    # Without a sign nothing is concluded: one may simply not have been read.
    signs = {"-": "buy", "+": "sell"}
    reading.side = _agreed(
        [
            *(order["side"].lower() for order in orders),
            *map(_side, guesses("side")),
            *(signs.get(amount[:1]) for amount in guesses("amount")),
            _side(written),
        ]
    )

    reading.trade_date = _agreed(
        [
            *(
                day
                for said, in_digits in _shown(named, figures, "date")
                for day in (_date(said, in_digits, today), _date(said, None, today))
            ),
            _date(written, None, today),
        ]
    )
    return reading


def _shown(named: list[Row], figures: list[Row], field: str) -> Iterator[tuple[str, str | None]]:
    """What stands for the field, wherever a row is named for it: beside the name, or under it.

    Each is given twice: as the reading that knows Georgian has it, and as the
    one that reads figures better has it, when there are two readings and that
    one found something in the same place.
    """
    twice = figures is not named
    for row in named:
        name = _NAMED[field].match(row.text)
        if name is None:
            continue
        # How many of the row's words the name takes up.
        taken = offset = 0
        for word in row.words:
            if offset >= name.end():
                break
            taken += 1
            offset += len(word.text) + 1
        if taken < len(row.words):
            # Beside: what the other reading has to the right of the name.
            edge = row.words[taken - 1].right
            level = _level(figures, row) if twice else None
            beside = " ".join(
                word.text for word in (level.words if level else ()) if (word.left + word.right) / 2 > edge
            )
            yield " ".join(word.text for word in row.words[taken:]), beside or None
        else:
            below = _below(named, row)
            under = _below(figures, row) if twice else None
            if below or under:
                yield (below.text if below else ""), (under.text if under else None)


def _level(lines: list[Row], row: Row) -> Row | None:
    """The row of another reading that sat where this one did."""
    middle = (row.top + row.bottom) / 2
    return next((other for other in lines if other.top < middle < other.bottom), None)


def _below(lines: list[Row], name: Row) -> Row | None:
    """The row right under a name: its figure. None when the next row is too far down to be."""
    reach = name.bottom + 3 * (name.bottom - name.top)
    for row in lines:
        if (row.top + row.bottom) / 2 > name.bottom:
            return row if row.top < reach else None
    return None


def _agreed[T](guesses: Iterable[T | None]) -> T | None:
    """What most of the guesses say. When they are split evenly, the earliest of them."""
    counted = Counter(guess for guess in guesses if guess is not None)
    return max(counted, key=counted.__getitem__, default=None)


def _side(text: str) -> str | None:
    if _SELL.search(text):
        return "sell"
    if _BUY.search(text):
        return "buy"
    return None


def _ticker(text: str) -> str | None:
    for found in _TICKER.finditer(text):
        if found.group() not in _NOT_TICKERS:
            return found.group()
    return None


def _settled(
    shares: list[Decimal | None], prices: list[Decimal | None], amounts: list[Decimal]
) -> tuple[Decimal | None, Decimal | None, bool | None]:
    """The shares and the price to believe, and whether they come to the amount shown.

    Each list is of guesses, the most exact first. The first price that, with
    some guess at the shares, comes to an amount the report shows is taken:
    a misread figure doesn't.
    """
    counts = [count for count in dict.fromkeys(shares) if count is not None]
    costs = [price for price in dict.fromkeys(prices) if price is not None]
    for price in costs:
        for count in counts:
            if any(abs(count * price - amount) <= CENT + count * HALF_CENT for amount in amounts):
                return count, price, True
    count = counts[0] if counts else None
    price = costs[0] if costs else None
    # Nothing came to the amount: a figure is wrong. With one of the three
    # missing there was nothing to check.
    return count, price, False if counts and costs and amounts else None


def _decimal_comma(text: str) -> bool:
    """Whether the report writes decimals with a comma (30,00) rather than a point.

    Money is shown to the cent, so two digits after a mark give it away.
    """
    commas = len(re.findall(r"\d,\d{2}\b(?![.,]\d)", text))
    points = len(re.findall(r"\d\.\d{2}\b(?![.,]\d)", text))
    return commas > points


def _number(text: str, comma: bool) -> Decimal | None:
    """The first number in the text, read with the report's decimal mark. Its sign is left out."""
    found = _NUMBER.search(text)
    if found is None:
        return None
    digits = found.group().replace(" ", "")
    # Longer than any amount of money or count of shares: a misreading, or not a number.
    if len(digits) > 15:
        return None
    decimal, grouping = (",", ".") if comma else (".", ",")
    digits = digits.replace(grouping, "")
    if digits.count(decimal) > 1:
        return None
    return Decimal(digits.replace(decimal, "."))


def _rounded(number: Decimal, places: int) -> Decimal:
    return number.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_EVEN)


def _positive(number: Decimal | None, places: int) -> Decimal | None:
    """The number, unless it is missing or rounds to nothing: no trade has no price or shares."""
    if number is None:
        return None
    return _rounded(number, places) or None


def _date(text: str, figures: str | None, today: date) -> date | None:
    """The first believable date in the text.

    `figures` is the same text as the reading that knows no Georgian has it,
    whose day and year are tried before the text's own.
    """
    for source in (figures, text):
        for pattern in _FIGURE_DATES if source else ():
            for found in pattern.finditer(source):
                day = _day(found["year"], int(found["month"]), found["day"], today)
                if day:
                    return day
    for pattern, in_figures in _NAMED_DATES:
        exact = in_figures.search(figures) if figures and in_figures else None
        for found in pattern.finditer(text):
            month = _MONTHS.get(found["name"][:3].lower())
            if month is None:
                continue
            for digits in filter(None, (exact, found)):
                day = _day(digits["year"], month, digits["day"], today)
                if day:
                    return day
    return None


def _day(year: str, month: int, day: str, today: date) -> date | None:
    try:
        found = date(int(year), month, int(day))
    except ValueError:
        return None
    # A day ahead is allowed: the phone may be a time zone ahead of the server.
    return found if date(2000, 1, 1) <= found <= today + timedelta(days=1) else None
