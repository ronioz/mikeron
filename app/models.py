from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

BUY = "buy"
SELL = "sell"


class Trade(Base):
    """A purchase or a sale. Sales leave the forecast and price targets empty."""

    __tablename__ = "trades"
    __table_args__ = (CheckConstraint("side IN ('buy', 'sell')", name="ck_trades_side"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    side: Mapped[str] = mapped_column(String(4), server_default=BUY)
    ticker: Mapped[str] = mapped_column(String(12), index=True)
    # The price per share that was paid, or received for a sale.
    price: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    # 8 decimal places so fractional-share trades are stored exactly.
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
    def amount(self) -> Decimal:
        """What changed hands: the cost of a purchase or the proceeds of a sale."""
        return self.price * self.shares

    @property
    def take_profit_pct(self) -> Decimal | None:
        return self._pct_from_price(self.take_profit)

    @property
    def stop_loss_pct(self) -> Decimal | None:
        return self._pct_from_price(self.stop_loss)

    def _pct_from_price(self, target: Decimal | None) -> Decimal | None:
        if target is None:
            return None
        return (target - self.price) / self.price * 100


class Quote(Base):
    """The latest price fetched for a ticker, cached so every request can reuse it."""

    __tablename__ = "quotes"

    ticker: Mapped[str] = mapped_column(String(12), primary_key=True)
    # NULL means the price provider doesn't know this ticker.
    price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
