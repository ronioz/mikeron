from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import DateTime, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Trade(Base):
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticker: Mapped[str] = mapped_column(String(12), index=True)
    buy_price: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    # 8 decimal places so fractional-share purchases are stored exactly.
    shares: Mapped[Decimal] = mapped_column(Numeric(18, 8))
    trade_date: Mapped[date] = mapped_column(index=True)
    thesis: Mapped[str] = mapped_column(Text)
    forecast: Mapped[str] = mapped_column(Text)
    take_profit: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    stop_loss: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    @property
    def cost(self) -> Decimal:
        return self.buy_price * self.shares

    @property
    def take_profit_pct(self) -> Decimal | None:
        return self._pct_from_buy(self.take_profit)

    @property
    def stop_loss_pct(self) -> Decimal | None:
        return self._pct_from_buy(self.stop_loss)

    def _pct_from_buy(self, price: Decimal | None) -> Decimal | None:
        if price is None:
            return None
        return (price - self.buy_price) / self.buy_price * 100


class Quote(Base):
    """The latest price fetched for a ticker, cached so every request can reuse it."""

    __tablename__ = "quotes"

    ticker: Mapped[str] = mapped_column(String(12), primary_key=True)
    # NULL means the price provider doesn't know this ticker.
    price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
