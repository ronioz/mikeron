from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session

from app import crud, fees, reports
from app.db import DbSession
from app.deps import CurrentUser
from app.models import User
from app.portfolio import build_portfolio
from app.prices import QuoteCache, Quotes
from app.schemas import ReportIn, TradeReading

router = APIRouter(prefix="/reports", tags=["reports"])


def _held_with(
    broker: str | None, until: date | None, user: User, db: Session, quotes: QuoteCache
) -> Decimal:
    """What the shares the person holds with a broker are worth, going by their journal.

    At live prices, or at what they cost where there is none. Only trades up
    to the report's day count, so a trade filled in late isn't judged by what
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


@router.post("/read")
def read_report(report: ReportIn, user: CurrentUser, db: DbSession, quotes: Quotes) -> TradeReading:
    """Find the trade in the words of a broker's report, to fill in the trade form.

    Nothing is saved: the form is, once its figures have been checked.
    """
    words = [reports.Word(**word.model_dump()) for word in report.words]
    latin = report.latin and [reports.Word(**word.model_dump()) for word in report.latin]
    reading = reports.read(words, today=datetime.now(UTC).date(), latin=latin)
    if not reading.found:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="No trade was found in that picture. It has to show the whole "
            "report of a finished trade, as the bank's app does.",
        )
    found = TradeReading.model_validate(reading)
    if found.fee is None and found.shares is not None and found.price is not None:
        # The banks' reports don't show what the trade was charged: it is worked
        # out from the bank's tariff, which can turn on how much is held there.
        fee = fees.commission(
            found.broker,
            found.shares,
            found.price,
            held=lambda: _held_with(found.broker, found.trade_date, user, db, quotes),
        )
        if fee is not None:
            found.fee, found.fee_worked_out = fee, True
    return found
