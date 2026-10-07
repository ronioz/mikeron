from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session

from app import crud
from app.db import DbSession
from app.deps import CurrentTrade, CurrentUser
from app.ledger import OversoldError
from app.models import Trade, User
from app.portfolio import value_trades
from app.prices import QuoteCache, Quotes
from app.schemas import TradeIn, TradeOut

router = APIRouter(prefix="/trades", tags=["trades"])

# The three helpers below also serve app/routers/reports.py, which saves a
# trade too: the one a broker's report shows.


def valued(trade: Trade, user: User, db: Session, quotes: QuoteCache) -> TradeOut:
    # What happened to a purchase depends on the later sales of its ticker, and
    # the cash it could use on every earlier sale, so the whole journal counts.
    # Only this trade's price is needed, though.
    every = value_trades(crud.list_trades(db, user), quotes.get(db, [trade.ticker]))
    return next(out for out in every if out.id == trade.id)


def plain(number: Decimal) -> str:
    return f"{number.normalize():f}"


def not_enough_shares(problem: OversoldError) -> HTTPException:
    if problem.direct:
        # The sale being saved is the one that doesn't fit, so the message
        # belongs next to its share count in the form.
        held = f"only held {plain(problem.held)}" if problem.held > 0 else "held no"
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[
                {
                    "type": "not_enough_shares",
                    "loc": ["body", "shares"],
                    "msg": f"You {held} {problem.ticker} on {problem.on}.",
                }
            ],
        )
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=(
            f"That would leave your sale of {plain(problem.wanted)} {problem.ticker} "
            f"on {problem.on} without enough shares. Change or delete that sale first."
        ),
    )


@router.get("")
def list_trades(user: CurrentUser, db: DbSession, quotes: Quotes) -> list[TradeOut]:
    trades = crud.list_trades(db, user)
    return value_trades(trades, quotes.get(db, {trade.ticker for trade in trades}))


@router.post("", status_code=status.HTTP_201_CREATED)
def create_trade(data: TradeIn, user: CurrentUser, db: DbSession, quotes: Quotes) -> TradeOut:
    try:
        trade = crud.create_trade(db, user, data)
    except OversoldError as problem:
        raise not_enough_shares(problem) from problem
    return valued(trade, user, db, quotes)


@router.get("/{trade_id}")
def get_trade(trade: CurrentTrade, user: CurrentUser, db: DbSession, quotes: Quotes) -> TradeOut:
    return valued(trade, user, db, quotes)


@router.put("/{trade_id}")
def update_trade(
    trade: CurrentTrade, data: TradeIn, user: CurrentUser, db: DbSession, quotes: Quotes
) -> TradeOut:
    try:
        trade = crud.update_trade(db, trade, data)
    except OversoldError as problem:
        raise not_enough_shares(problem) from problem
    return valued(trade, user, db, quotes)


@router.delete("/{trade_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trade(trade: CurrentTrade, db: DbSession) -> None:
    try:
        crud.delete_trade(db, trade)
    except OversoldError as problem:
        raise not_enough_shares(problem) from problem
