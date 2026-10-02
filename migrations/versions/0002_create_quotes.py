"""create quotes

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-02
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "quotes",
        sa.Column("ticker", sa.String(length=12), primary_key=True),
        sa.Column("price", sa.Numeric(18, 4), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("quotes")
