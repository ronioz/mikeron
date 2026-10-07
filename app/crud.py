from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ledger import OversoldError, build_ledger
from app.models import Trade, User
from app.schemas import TradeIn

CENT = Decimal("0.01")


def list_trades(db: Session, user: User) -> list[Trade]:
    """Every trade in the user's journal, newest first."""
    return list(
        db.scalars(
            select(Trade)
            .where(Trade.user_id == user.id)
            .order_by(Trade.trade_date.desc(), Trade.id.desc())
        )
    )


def get_trade(db: Session, user: User, trade_id: int) -> Trade | None:
    """One of the user's trades. Someone else's counts as missing."""
    return db.scalar(select(Trade).where(Trade.id == trade_id, Trade.user_id == user.id))


def last_broker(db: Session, user: User) -> str | None:
    """The broker of the trade the user recorded most recently, among those with one."""
    return db.scalar(
        select(Trade.broker)
        .where(Trade.user_id == user.id, Trade.broker.is_not(None))
        .order_by(Trade.id.desc())
        .limit(1)
    )


def same_trade(db: Session, user: User, data: TradeIn) -> Trade | None:
    """A trade already in the user's journal that this one would repeat.

    The same kind, ticker, day and number of shares, at a price within a cent:
    a report gives the price to four decimals, and whoever typed the trade in
    earlier may have kept only the cents. The broker isn't compared, since a
    trade typed in may name none.
    """
    return db.scalar(
        select(Trade)
        .where(
            Trade.user_id == user.id,
            Trade.side == data.side,
            Trade.ticker == data.ticker,
            Trade.trade_date == data.trade_date,
            Trade.shares == data.shares,
            func.abs(Trade.price - data.price) < CENT,
        )
        .order_by(Trade.id)
        .limit(1)
    )


def _commit(db: Session, user_id: int, tickers: set[str], saved: Trade | None = None) -> None:
    """Commit the pending change, unless it leaves a sale without enough shares.

    Any edit can do that: selling too much, moving a sale before its purchase,
    or shrinking or deleting a purchase that a later sale relies on. In that
    case the change is undone and OversoldError is raised. Only the user's own
    trades count: one person's shares never cover another's sale.
    """
    db.flush()
    try:
        build_ledger(
            db.scalars(select(Trade).where(Trade.user_id == user_id, Trade.ticker.in_(tickers)))
        )
    except OversoldError as problem:
        problem.direct = saved is not None and problem.sale_id == saved.id
        db.rollback()
        raise
    db.commit()


def create_trade(db: Session, user: User, data: TradeIn) -> Trade:
    # The owner comes from the session, never from the request body.
    trade = Trade(**data.model_dump(), user_id=user.id)
    db.add(trade)
    _commit(db, user.id, {trade.ticker}, saved=trade)
    db.refresh(trade)
    return trade


def update_trade(db: Session, trade: Trade, data: TradeIn) -> Trade:
    # A changed ticker affects the holdings of both the old and the new one.
    tickers = {trade.ticker, data.ticker}
    for field, value in data.model_dump().items():
        setattr(trade, field, value)
    _commit(db, trade.user_id, tickers, saved=trade)
    db.refresh(trade)
    return trade


def delete_trade(db: Session, trade: Trade) -> None:
    user_id, ticker = trade.user_id, trade.ticker
    db.delete(trade)
    _commit(db, user_id, {ticker})
