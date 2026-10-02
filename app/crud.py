from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Trade
from app.schemas import TradeIn


def list_trades(db: Session) -> list[Trade]:
    query = select(Trade).order_by(Trade.trade_date.desc(), Trade.id.desc())
    return list(db.scalars(query))


def get_trade(db: Session, trade_id: int) -> Trade | None:
    return db.get(Trade, trade_id)


def create_trade(db: Session, data: TradeIn) -> Trade:
    trade = Trade(**data.model_dump())
    db.add(trade)
    db.commit()
    db.refresh(trade)
    return trade


def update_trade(db: Session, trade: Trade, data: TradeIn) -> Trade:
    for field, value in data.model_dump().items():
        setattr(trade, field, value)
    db.commit()
    db.refresh(trade)
    return trade


def delete_trade(db: Session, trade: Trade) -> None:
    db.delete(trade)
    db.commit()
