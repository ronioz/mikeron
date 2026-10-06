from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    false,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

BUY = "buy"
SELL = "sell"

# Where a session's token is kept: a browser cookie, or the iOS app's Keychain.
WEB = "web"
APP = "app"

# What an emailed code is for.
CONFIRM = "confirm"
RESET = "reset"

# How often a plan's amount is meant to be put in.
WEEKLY = "weekly"
MONTHLY = "monthly"
QUARTERLY = "quarterly"


class User(Base):
    """Someone with an account. Their trades, sessions and codes go when they do."""

    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        # Stored lowercased, so one address can't sign up twice in different case.
        CheckConstraint("email = lower(email)", name="ck_users_email_lowercase"),
        CheckConstraint("plan_amount >= 0", name="ck_users_plan_amount_not_negative"),
        CheckConstraint(
            "plan_period IN ('weekly', 'monthly', 'quarterly')", name="ck_users_plan_period"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320))
    # Argon2 hash. Empty until a password is chosen, which lets the owner's
    # account exist before they pick one (see migration 0006).
    password_hash: Mapped[str | None] = mapped_column(Text)
    # When the address was confirmed with an emailed code. Until then the
    # account can't sign in.
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Their plan: how much new money they mean to put in, and how often. Both
    # are asked for when signing up, with nothing assumed, and the journal
    # compares each period's purchases with the amount.
    plan_amount: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    plan_period: Mapped[str] = mapped_column(String(9))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class UserSession(Base):
    """One signed-in browser or app.

    The device holds a random token. Only the token's SHA-256 is stored, so a
    copy of the database can't be used to sign in, and deleting the row signs
    the device out at once.
    """

    __tablename__ = "sessions"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_sessions_token_hash"),
        CheckConstraint("client IN ('web', 'app')", name="ck_sessions_client"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE", name="fk_sessions_user_id_users"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64))
    client: Mapped[str] = mapped_column(String(3))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    # Loaded with the session in one query: every signed-in request needs both.
    user: Mapped[User] = relationship(lazy="joined", innerjoin=True)


class EmailCode(Base):
    """A 6-digit code emailed to confirm an address or to reset a password.

    Stored as its SHA-256 only. It lasts a few minutes and a few wrong guesses,
    and a newer code for the same purpose replaces it.
    """

    __tablename__ = "email_codes"
    __table_args__ = (
        CheckConstraint("purpose IN ('confirm', 'reset')", name="ck_email_codes_purpose"),
        Index("ix_email_codes_user_id_purpose", "user_id", "purpose"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE", name="fk_email_codes_user_id_users")
    )
    purpose: Mapped[str] = mapped_column(String(7))
    code_hash: Mapped[str] = mapped_column(String(64))
    # Wrong guesses so far.
    attempts: Mapped[int] = mapped_column(server_default="0")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Trade(Base):
    """A purchase or a sale. Sales leave the forecast and price targets empty."""

    __tablename__ = "trades"
    __table_args__ = (
        CheckConstraint("side IN ('buy', 'sell')", name="ck_trades_side"),
        CheckConstraint("side = 'buy' OR NOT paid_from_cash", name="ck_trades_cash_buys_only"),
        CheckConstraint("fee >= 0", name="ck_trades_fee_not_negative"),
        # Every question asked of the trades is about one person's, and the
        # check that sales have their shares asks per ticker.
        Index("ix_trades_user_id_ticker", "user_id", "ticker"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Whose journal the trade belongs to. Set by the server, never by the request.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE", name="fk_trades_user_id_users")
    )
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
    # Purchases only: paid with cash from earlier sales rather than new money.
    # How much cash there was to use is worked out in cash.py.
    paid_from_cash: Mapped[bool] = mapped_column(Boolean, server_default=false())
    # The broker's commission on the trade, in dollars. A purchase's fee adds to
    # what it cost; a sale's comes off what it brought in.
    fee: Mapped[Decimal] = mapped_column(Numeric(18, 4), server_default="0")
    # Which broker the trade was placed with, such as "bog", or empty if not
    # recorded. A sale uses the shares bought at its own broker first, and the
    # portfolio can be seen broker by broker; cash is counted across brokers
    # together. The API checks the name, so adding a broker needs no migration.
    broker: Mapped[str | None] = mapped_column(String(12))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    @property
    def amount(self) -> Decimal:
        """What the shares changed hands for, before any fee: price times shares."""
        return self.price * self.shares

    @property
    def net_amount(self) -> Decimal:
        """The money the trade moved, fee included: what a purchase cost with its
        fee, or what a sale brought in after its fee."""
        return self.amount - self.fee if self.side == SELL else self.amount + self.fee

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


class Close(Base):
    """A ticker's closing price on one trading day, kept so the graph needn't ask for it again."""

    __tablename__ = "closes"

    ticker: Mapped[str] = mapped_column(String(12), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    # Adjusted for share splits, so the whole history is on one scale.
    close: Mapped[Decimal] = mapped_column(Numeric(18, 6))


class CloseFetch(Base):
    """When a ticker's closes were last asked for, whether or not the provider had any."""

    __tablename__ = "close_fetches"

    ticker: Mapped[str] = mapped_column(String(12), primary_key=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
