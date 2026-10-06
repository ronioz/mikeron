"""create closes

Closing prices for the graphs: one row per ticker and trading day, and when
each ticker's were last asked for. Both only hold what the provider said, so
they start empty and fill as graphs are looked at.

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-06
"""
import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "closes",
        sa.Column("ticker", sa.String(length=12), primary_key=True),
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("close", sa.Numeric(18, 6), nullable=False),
    )
    op.create_table(
        "close_fetches",
        sa.Column("ticker", sa.String(length=12), primary_key=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    # Nothing of the user's is lost: the closes can be fetched again.
    op.drop_table("close_fetches")
    op.drop_table("closes")
