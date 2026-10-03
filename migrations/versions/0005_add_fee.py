"""add fee

Trades record the broker's commission. Every existing trade had no fee.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-03
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "trades",
        sa.Column("fee", sa.Numeric(18, 4), server_default="0", nullable=False),
    )
    op.create_check_constraint("ck_trades_fee_not_negative", "trades", "fee >= 0")


def downgrade() -> None:
    # The older schema has nowhere to keep a fee. Refuse rather than silently
    # forget fees and change every gain they were part of.
    has_fees = op.get_bind().execute(sa.text("SELECT 1 FROM trades WHERE fee <> 0 LIMIT 1"))
    if has_fees.first() is not None:
        raise RuntimeError("Set every trade's fee to 0 before downgrading past 0005.")
    op.drop_constraint("ck_trades_fee_not_negative", "trades", type_="check")
    op.drop_column("trades", "fee")
