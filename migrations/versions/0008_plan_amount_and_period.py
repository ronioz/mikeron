"""a plan of one's own: an amount and how often

Accounts no longer start with a $30 monthly plan. Signing up asks for the
amount and for how often it is put in: every week, month or quarter. The
amounts already stored are kept, as monthly plans.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-06
"""
import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

AMOUNT = sa.Numeric(18, 4)


def upgrade() -> None:
    # No amount is assumed any more: whoever makes an account gives their own.
    op.alter_column("users", "monthly_budget", existing_type=AMOUNT, server_default=None)
    op.alter_column("users", "monthly_budget", existing_type=AMOUNT, new_column_name="plan_amount")
    op.execute(
        "ALTER TABLE users RENAME CONSTRAINT ck_users_budget_not_negative"
        " TO ck_users_plan_amount_not_negative"
    )
    # "monthly" only fills in the accounts there already are.
    op.add_column(
        "users",
        sa.Column("plan_period", sa.String(length=9), server_default="monthly", nullable=False),
    )
    op.alter_column("users", "plan_period", existing_type=sa.String(length=9), server_default=None)
    op.create_check_constraint(
        "ck_users_plan_period", "users", "plan_period IN ('weekly', 'monthly', 'quarterly')"
    )


def downgrade() -> None:
    # The older schema only knows monthly amounts. Refuse rather than silently
    # turn a weekly or quarterly plan into a monthly one.
    others = op.get_bind().execute(
        sa.text("SELECT 1 FROM users WHERE plan_period <> 'monthly' LIMIT 1")
    )
    if others.first() is not None:
        raise RuntimeError("Make every account's plan monthly before downgrading past 0008.")
    op.drop_constraint("ck_users_plan_period", "users", type_="check")
    op.drop_column("users", "plan_period")
    op.execute(
        "ALTER TABLE users RENAME CONSTRAINT ck_users_plan_amount_not_negative"
        " TO ck_users_budget_not_negative"
    )
    op.alter_column("users", "plan_amount", existing_type=AMOUNT, new_column_name="monthly_budget")
    op.alter_column("users", "monthly_budget", existing_type=AMOUNT, server_default="30")
