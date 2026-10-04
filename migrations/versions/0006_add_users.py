"""add users

Accounts. People sign up with an email address and a password, confirm the
address with an emailed code, and see only their own trades. Each signed-in
browser or app is a session.

Trades recorded before accounts existed go to the owner, whose address has to
be given: alembic -x owner_email=you@example.com upgrade head. The owner's
account starts without a password; python -m app.manage set-password sets one.

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-04
"""
import re

import sqlalchemy as sa
from alembic import context, op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

OWNER_HELP = """\
This database has trades but no accounts yet, so say whose they are:

    docker compose run --rm web alembic -x owner_email=you@example.com upgrade head

(or, outside Docker: uv run alembic -x owner_email=you@example.com upgrade head)"""


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=True),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("monthly_budget", sa.Numeric(18, 4), server_default="30", nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("email", name="uq_users_email"),
        sa.CheckConstraint("email = lower(email)", name="ck_users_email_lowercase"),
        sa.CheckConstraint("monthly_budget >= 0", name="ck_users_budget_not_negative"),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("client", sa.String(length=3), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "last_used_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_sessions_user_id_users", ondelete="CASCADE"
        ),
        sa.UniqueConstraint("token_hash", name="uq_sessions_token_hash"),
        sa.CheckConstraint("client IN ('web', 'app')", name="ck_sessions_client"),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_table(
        "email_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("purpose", sa.String(length=7), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_email_codes_user_id_users", ondelete="CASCADE"
        ),
        sa.CheckConstraint("purpose IN ('confirm', 'reset')", name="ck_email_codes_purpose"),
    )
    op.create_index("ix_email_codes_user_id_purpose", "email_codes", ["user_id", "purpose"])

    # Every trade gets an owner. The column starts out empty so the trades
    # already recorded can be handed to the owner before it becomes required.
    op.add_column("trades", sa.Column("user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_trades_user_id_users", "trades", "users", ["user_id"], ["id"], ondelete="CASCADE"
    )
    bind = op.get_bind()
    if bind.execute(sa.text("SELECT 1 FROM trades LIMIT 1")).first() is not None:
        owner_email = context.get_x_argument(as_dictionary=True).get("owner_email", "")
        owner_email = owner_email.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", owner_email):
            raise RuntimeError(OWNER_HELP)
        # The owner typed the address themselves, so it counts as confirmed.
        owner_id = bind.execute(
            sa.text(
                "INSERT INTO users (email, email_verified_at) VALUES (:email, now()) RETURNING id"
            ),
            {"email": owner_email},
        ).scalar_one()
        bind.execute(sa.text("UPDATE trades SET user_id = :owner"), {"owner": owner_id})
    op.alter_column("trades", "user_id", nullable=False)
    op.create_index("ix_trades_user_id_ticker", "trades", ["user_id", "ticker"])


def downgrade() -> None:
    # The older schema keeps one journal. Refuse rather than pour several
    # people's trades into it.
    users = op.get_bind().execute(sa.text("SELECT count(*) FROM users")).scalar_one()
    if users > 1:
        raise RuntimeError("Delete all accounts but one before downgrading past 0006.")
    op.drop_index("ix_trades_user_id_ticker", table_name="trades")
    op.drop_constraint("fk_trades_user_id_users", "trades", type_="foreignkey")
    op.drop_column("trades", "user_id")
    op.drop_index("ix_email_codes_user_id_purpose", table_name="email_codes")
    op.drop_table("email_codes")
    op.drop_index("ix_sessions_user_id", table_name="sessions")
    op.drop_table("sessions")
    op.drop_table("users")
