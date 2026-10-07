from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app import crud, fees, reports
from app.db import DbSession
from app.deps import CurrentUser
from app.ledger import OversoldError
from app.models import SELL, User
from app.portfolio import build_portfolio
from app.prices import QuoteCache, Quotes
from app.routers.trades import not_enough_shares, plain, valued
from app.schemas import ReportedTrade, ReportIn, TradeIn

router = APIRouter(prefix="/reports", tags=["reports"])


def _refused(why: str, code: int = status.HTTP_422_UNPROCESSABLE_CONTENT) -> HTTPException:
    """The answer when a report's trade isn't added: a sentence saying why, to be shown as it is."""
    return HTTPException(status_code=code, detail=why)


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


@router.post("/add", status_code=status.HTTP_201_CREATED)
def add_report(report: ReportIn, user: CurrentUser, db: DbSession, quotes: Quotes) -> ReportedTrade:
    """Find the trade in the words of a broker's report and add it to the journal.

    Nobody looks the figures over first, so the trade is only added when the
    report shows all of it and its own arithmetic holds: the price times the
    shares has to come to the amount. Otherwise nothing is added, and the
    answer says why in a sentence.
    """
    words = [reports.Word(**word.model_dump()) for word in report.words]
    latin = report.latin and [reports.Word(**word.model_dump()) for word in report.latin]
    reading = reports.read(words, today=datetime.now(UTC).date(), latin=latin)
    if not reading.found:
        raise _refused(
            "No trade was found in that picture. It has to show the whole "
            "report of a finished trade, as the bank's app does."
        )
    if reading.missing:
        raise _refused(
            f"The report shows no readable {_listed(reading.missing)}, so the trade wasn't added."
        )
    if not reading.adds_up:
        raise _refused(
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
        raise _refused(
            "The figures read from the report can't be saved as a trade, so nothing was added."
        ) from problem

    # The same screenshot chosen twice, or a trade that was typed in earlier.
    same = crud.same_trade(db, user, data)
    if same is not None:
        raise _refused(
            f"That trade is already in your journal: the {_kind(same.side)} of "
            f"{plain(same.shares)} {same.ticker} on {same.trade_date}. Nothing was added.",
            status.HTTP_409_CONFLICT,
        )
    try:
        trade = crud.create_trade(db, user, data)
    except OversoldError as problem:
        if not problem.direct:
            raise not_enough_shares(problem) from problem
        held = f"only held {plain(problem.held)}" if problem.held > 0 else "held none"
        raise _refused(
            f"The report is of a sale of {plain(problem.wanted)} {problem.ticker} on "
            f"{problem.on}, but you {held} then. Add the purchase first."
        ) from problem
    return ReportedTrade(trade=valued(trade, user, db, quotes), fee_worked_out=worked_out)

