"""add sales

Trades gain a side (buy or sell). Every existing trade is a purchase. The price
column loses its "buy_" prefix because a sale stores its sell price there.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-02
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("trades", "buy_price", new_column_name="price")
    op.add_column(
        "trades",
        sa.Column("side", sa.String(length=4), server_default="buy", nullable=False),
    )
    op.create_check_constraint("ck_trades_side", "trades", "side IN ('buy', 'sell')")


def downgrade() -> None:
    # The older schema has no way to hold a sale. Refuse rather than silently
    # turn sales into purchases.
    has_sales = op.get_bind().execute(sa.text("SELECT 1 FROM trades WHERE side = 'sell' LIMIT 1"))
    if has_sales.first() is not None:
        raise RuntimeError("Delete the recorded sales before downgrading past 0003.")
    op.drop_constraint("ck_trades_side", "trades", type_="check")
    op.drop_column("trades", "side")
    op.alter_column("trades", "price", new_column_name="buy_price")
