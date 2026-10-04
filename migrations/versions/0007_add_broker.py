"""add broker

Trades can say which broker they were placed with. Existing trades have none
recorded.

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-04
"""
import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trades", sa.Column("broker", sa.String(length=12), nullable=True))


def downgrade() -> None:
    # The older schema has nowhere to keep a broker. Refuse rather than
    # silently forget where trades were placed.
    has_brokers = op.get_bind().execute(
        sa.text("SELECT 1 FROM trades WHERE broker IS NOT NULL LIMIT 1")
    )
    if has_brokers.first() is not None:
        raise RuntimeError("Clear every trade's broker before downgrading past 0007.")
    op.drop_column("trades", "broker")
