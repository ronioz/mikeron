from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi import APIRouter
from pydantic import JsonValue, ValidationError
from sqlalchemy.orm import Session

from app import crud, fees, reports
from app.db import DbSession
from app.deps import CurrentUser
from app.ledger import OversoldError
from app.models import SELL, Trade, User
from app.portfolio import build_portfolio, value_trades
from app.prices import QuoteCache, Quotes
from app.routers.trades import not_enough_shares, plain
from app.schemas import ReportedTrade, ReportIn, ReportOutcome, ReportsIn, TradeIn

router = APIRouter(prefix="/reports", tags=["reports"])


class _Refused(Exception):
    """A report's trade isn't added. Raised with a sentence saying why, to be shown as it is."""


def _listed(names: list[str]) -> str:
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"


def _kind(side: str) -> str:
    return "sale" if side == SELL else "purchase"


def _held_with(
    broker: str | None, until: date | None, user: User, db: Session, quotes: QuoteCache
) -> Decimal:
    """What the shares the person holds with a broker are worth, going by their journal.

    At live prices, or at what they cost where there is none. Only trades up
    to the report's day count, so a trade added late isn't judged by what
    was bought after it.
    """
    trades = [
        trade for trade in crud.list_trades(db, user) if until is None or trade.trade_date <= until
    ]
    latest = quotes.get(db, {trade.ticker for trade in trades})
    held = build_portfolio(trades, latest, prices_enabled=quotes.enabled)
    return sum(
        (position.value for part in held.by_broker if part.broker == broker for position in part.positions),
        Decimal(0),
    )


@router.post("/add")
def add_reports(
    sent: ReportsIn, user: CurrentUser, db: DbSession, quotes: Quotes
) -> list[ReportOutcome]:
    """Find the trade in the words of each broker's report and add it to the journal.

    Every report gets an answer of its own, in the order they were sent: its
    trade, or a sentence saying why it wasn't added. One that isn't added
    doesn't hold up the others.

    Nobody looks the figures over first, so a trade is only added when its
    report shows all of it and its own arithmetic holds: the price times the
    shares has to come to the amount.
    """
    today = datetime.now(UTC).date()
    readings = [_read(report, today) for report in sent.reports]
    # Added oldest first, and a day's purchases before its sales, as the ledger
    # counts them: pictures are chosen in any order, and a sale has to find the
    # shares bought in another of them, as a fee that turns on what is held has
    # to count them. A report with no readable date isn't added at all.
    oldest_first = sorted(
        range(len(readings)),
        key=lambda at: (readings[at].trade_date or date.max, readings[at].side == SELL),
    )
    # Both by the report's place among those sent.
    added: dict[int, tuple[int, bool]] = {}
    outcomes: dict[int, ReportOutcome] = {}
    for at in oldest_first:
        try:
            trade, fee_worked_out = _add(readings[at], user, db, quotes)
            # Its id, not the trade: a later report that is refused undoes its
            # own change, which makes the trades loaded so far stale.
            added[at] = (trade.id, fee_worked_out)
        except _Refused as why:
            outcomes[at] = ReportOutcome(problem=str(why))
    if added:
        # Valued once all of them are in: one report's sale changes what
        # became of another's purchase.
        journal = crud.list_trades(db, user)
        new = {trade_id for trade_id, _ in added.values()}
        latest = quotes.get(db, {trade.ticker for trade in journal if trade.id in new})
        valued = {out.id: out for out in value_trades(journal, latest)}
        for at, (trade_id, fee_worked_out) in added.items():
            outcomes[at] = ReportOutcome(
                added=ReportedTrade(trade=valued[trade_id], fee_worked_out=fee_worked_out)
            )
    return [outcomes[at] for at in range(len(readings))]


def _read(sent: JsonValue, today: date) -> reports.Reading:
    try:
        report = ReportIn.model_validate(sent)
    except ValidationError:
        # Not what a picture of a report reads as, so no trade is found in it.
        return reports.Reading()
    words = [reports.Word(**word.model_dump()) for word in report.words]
    latin = report.latin and [reports.Word(**word.model_dump()) for word in report.latin]
    return reports.read(words, today=today, latin=latin)


def _add(
    reading: reports.Reading, user: User, db: Session, quotes: QuoteCache
) -> tuple[Trade, bool]:
    """Add the trade a report showed, and say whether its fee had to be worked out.

    Raises _Refused, having added nothing, when the report can't be trusted
    or the journal can't take its trade.
    """
    if not reading.found:
        raise _Refused(
            "No trade was found in that picture. It has to show the whole "
            "report of a finished trade, as the bank's app does."
        )
    if reading.missing:
        raise _Refused(
            f"The report shows no readable {_listed(reading.missing)}, so the trade wasn't added."
        )
    if not reading.adds_up:
        raise _Refused(
            "The price times the shares doesn't come to the amount on the report, "
            "so a figure was probably misread. The trade wasn't added."
        )

    fee, worked_out = reading.fee, False
    if fee is None:
        # The banks' reports don't show what the trade was charged: it is worked
        # out from the bank's tariff, which can turn on how much is held there.
        fee = fees.commission(
            reading.broker,
            reading.shares,
            reading.price,
            held=lambda: _held_with(reading.broker, reading.trade_date, user, db, quotes),
        )
        worked_out = fee is not None
    try:
        # Checked like a trade from the form. What a report can't tell is left
        # as the form starts it: paid with new money, and no reason written.
        data = TradeIn(
            side=reading.side,
            ticker=reading.ticker,
            price=reading.price,
            shares=reading.shares,
            trade_date=reading.trade_date,
            fee=fee,
            broker=reading.broker,
        )
    except ValidationError as problem:
        raise _Refused(
            "The figures read from the report can't be saved as a trade, so it wasn't added."
        ) from problem

    # The same screenshot chosen twice, or a trade that was typed in earlier.
    same = crud.same_trade(db, user, data)
    if same is not None:
        raise _Refused(
            f"That trade is already in your journal: the {_kind(same.side)} of "
            f"{plain(same.shares)} {same.ticker} on {same.trade_date}. It wasn't added again."
        )
    try:
        return crud.create_trade(db, user, data), worked_out
    except OversoldError as problem:
        if not problem.direct:
            raise _Refused(not_enough_shares(problem).detail) from problem
        held = f"only held {plain(problem.held)}" if problem.held > 0 else "held none"
        raise _Refused(
            f"The report is of a sale of {plain(problem.wanted)} {problem.ticker} on "
            f"{problem.on}, but you {held} then. Add the purchase first."
        ) from problem
