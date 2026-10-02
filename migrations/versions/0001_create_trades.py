"""create trades

Revision ID: 0001
Revises:
Create Date: 2026-10-02
"""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trades",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ticker", sa.String(length=12), nullable=False),
        sa.Column("buy_price", sa.Numeric(18, 4), nullable=False),
        sa.Column("shares", sa.Numeric(18, 8), nullable=False),
        sa.Column("trade_date", sa.Date(), nullable=False),
        sa.Column("thesis", sa.Text(), nullable=False),
        sa.Column("forecast", sa.Text(), nullable=False),
        sa.Column("take_profit", sa.Numeric(18, 4), nullable=True),
        sa.Column("stop_loss", sa.Numeric(18, 4), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_trades_ticker", "trades", ["ticker"])
    op.create_index("ix_trades_trade_date", "trades", ["trade_date"])


def downgrade() -> None:
    op.drop_index("ix_trades_trade_date", table_name="trades")
    op.drop_index("ix_trades_ticker", table_name="trades")
    op.drop_table("trades")
