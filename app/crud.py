from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ledger import OversoldError, build_ledger
from app.models import Trade
from app.schemas import TradeIn


def list_trades(db: Session) -> list[Trade]:
    """Every trade, newest first."""
    return list(db.scalars(select(Trade).order_by(Trade.trade_date.desc(), Trade.id.desc())))


def get_trade(db: Session, trade_id: int) -> Trade | None:
    return db.get(Trade, trade_id)


def _commit(db: Session, tickers: set[str], saved: Trade | None = None) -> None:
    """Commit the pending change, unless it leaves a sale without enough shares.

    Any edit can do that: selling too much, moving a sale before its purchase,
    or shrinking or deleting a purchase that a later sale relies on. In that
    case the change is undone and OversoldError is raised.
    """
    db.flush()
    try:
        build_ledger(db.scalars(select(Trade).where(Trade.ticker.in_(tickers))))
    except OversoldError as problem:
        problem.direct = saved is not None and problem.sale_id == saved.id
        db.rollback()
        raise
    db.commit()


def create_trade(db: Session, data: TradeIn) -> Trade:
    trade = Trade(**data.model_dump())
    db.add(trade)
    _commit(db, {trade.ticker}, saved=trade)
    db.refresh(trade)
    return trade


def update_trade(db: Session, trade: Trade, data: TradeIn) -> Trade:
    # A changed ticker affects the holdings of both the old and the new one.
    tickers = {trade.ticker, data.ticker}
    for field, value in data.model_dump().items():
        setattr(trade, field, value)
    _commit(db, tickers, saved=trade)
    db.refresh(trade)
    return trade


def delete_trade(db: Session, trade: Trade) -> None:
    ticker = trade.ticker
    db.delete(trade)
    _commit(db, {ticker})
