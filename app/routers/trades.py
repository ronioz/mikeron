from fastapi import APIRouter, status
from sqlalchemy.orm import Session

from app import crud
from app.db import DbSession
from app.deps import CurrentTrade
from app.models import Trade
from app.portfolio import value_trade
from app.prices import QuoteCache, Quotes
from app.schemas import TradeIn, TradeOut

router = APIRouter(prefix="/trades", tags=["trades"])


def _valued(trade: Trade, db: Session, quotes: QuoteCache) -> TradeOut:
    return value_trade(trade, quotes.get(db, [trade.ticker]))


@router.get("")
def list_trades(db: DbSession, quotes: Quotes) -> list[TradeOut]:
    trades = crud.list_trades(db)
    latest = quotes.get(db, {trade.ticker for trade in trades})
    return [value_trade(trade, latest) for trade in trades]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_trade(data: TradeIn, db: DbSession, quotes: Quotes) -> TradeOut:
    return _valued(crud.create_trade(db, data), db, quotes)


@router.get("/{trade_id}")
def get_trade(trade: CurrentTrade, db: DbSession, quotes: Quotes) -> TradeOut:
    return _valued(trade, db, quotes)


@router.put("/{trade_id}")
def update_trade(trade: CurrentTrade, data: TradeIn, db: DbSession, quotes: Quotes) -> TradeOut:
    return _valued(crud.update_trade(db, trade, data), db, quotes)


@router.delete("/{trade_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trade(trade: CurrentTrade, db: DbSession) -> None:
    crud.delete_trade(db, trade)
