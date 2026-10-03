"""add paid_from_cash

A purchase can be paid with cash from earlier sales instead of new money.
Every existing trade was paid with new money.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-03
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "trades",
        sa.Column("paid_from_cash", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.create_check_constraint(
        "ck_trades_cash_buys_only", "trades", "side = 'buy' OR NOT paid_from_cash"
    )


def downgrade() -> None:
    # The older schema can't tell which purchases reused cash from sales.
    # Refuse rather than silently turn them into new money.
    marked = op.get_bind().execute(sa.text("SELECT 1 FROM trades WHERE paid_from_cash LIMIT 1"))
    if marked.first() is not None:
        raise RuntimeError(
            "Mark every purchase as paid with new money before downgrading past 0004."
        )
    op.drop_constraint("ck_trades_cash_buys_only", "trades", type_="check")
    op.drop_column("trades", "paid_from_cash")
