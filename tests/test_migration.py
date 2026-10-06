"""The migrations that move what is already recorded, and never guess.

0006 hands the trades recorded before accounts to the owner, and 0008 keeps
the amounts accounts already have as monthly plans. Each test runs alembic as
its own process against a database of its own, at the schema the real one had
just before.
"""

import os
import subprocess
import sys
from decimal import Decimal

import psycopg
import pytest
from helpers import PROJECT, SERVER, drop, recreate, scratch_url

MIGRATION_DB = "mikeronn_migration_test"


def alembic(*args: str) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "DATABASE_URL": scratch_url(MIGRATION_DB)}
    # The tests look at the exit status themselves: some expect a failure.
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=PROJECT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def connect() -> psycopg.Connection:
    return psycopg.connect(f"postgresql://{SERVER}/{MIGRATION_DB}", autocommit=True)


@pytest.fixture
def before_accounts():
    recreate(MIGRATION_DB)
    result = alembic("upgrade", "0005")
    assert result.returncode == 0, result.stderr
    with connect() as conn:
        conn.execute(
            "INSERT INTO trades (side, ticker, price, shares, trade_date, thesis, forecast)"
            " VALUES ('buy', 'SPY', 500, 2, '2026-09-01', 'why', ''),"
            " ('sell', 'SPY', 600, 1, '2026-09-10', 'why', '')"
        )
    yield
    drop(MIGRATION_DB)


def test_without_an_owner_nothing_changes(before_accounts):
    result = alembic("upgrade", "head")
    assert result.returncode != 0
    assert "owner_email" in result.stderr
    with connect() as conn:
        assert conn.execute("SELECT version_num FROM alembic_version").fetchone() == ("0005",)
        tables = {row[0] for row in conn.execute("SELECT tablename FROM pg_tables")}
        assert "users" not in tables


def test_the_trades_go_to_the_owner(before_accounts):
    result = alembic("-x", "owner_email=Me@Example.com", "upgrade", "head")
    assert result.returncode == 0, result.stderr
    with connect() as conn:
        users = conn.execute(
            "SELECT id, email, password_hash, email_verified_at IS NOT NULL FROM users"
        ).fetchall()
        assert len(users) == 1
        owner_id, email, password_hash, confirmed = users[0]
        # Lowercased, confirmed, and waiting for a password from app.manage.
        assert (email, password_hash, confirmed) == ("me@example.com", None, True)
        owners = conn.execute("SELECT DISTINCT user_id FROM trades").fetchall()
        assert owners == [(owner_id,)]
        nullable = conn.execute(
            "SELECT is_nullable FROM information_schema.columns"
            " WHERE table_name = 'trades' AND column_name = 'user_id'"
        ).fetchone()
        assert nullable == ("NO",)


def test_downgrading_refuses_to_merge_accounts(before_accounts):
    assert alembic("-x", "owner_email=me@example.com", "upgrade", "head").returncode == 0
    with connect() as conn:
        conn.execute(
            "INSERT INTO users (email, plan_amount, plan_period)"
            " VALUES ('other@example.com', 50, 'monthly')"
        )
    result = alembic("downgrade", "0005")
    assert result.returncode != 0
    assert "Delete all accounts but one" in result.stderr

    with connect() as conn:
        conn.execute("DELETE FROM users WHERE email = 'other@example.com'")
    result = alembic("downgrade", "0005")
    assert result.returncode == 0, result.stderr
    with connect() as conn:
        assert conn.execute("SELECT count(*) FROM trades").fetchone() == (2,)
        columns = {
            row[0]
            for row in conn.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'trades'"
            )
        }
        assert "user_id" not in columns


@pytest.fixture
def before_plans():
    """Before 0008: two accounts, one on the $30 a month that every account used to start with."""
    recreate(MIGRATION_DB)
    result = alembic("upgrade", "0007")
    assert result.returncode == 0, result.stderr
    with connect() as conn:
        conn.execute("INSERT INTO users (email) VALUES ('me@example.com')")
        conn.execute(
            "INSERT INTO users (email, monthly_budget) VALUES ('other@example.com', 125.5)"
        )
    yield
    drop(MIGRATION_DB)


def test_amounts_already_stored_become_monthly_plans(before_plans):
    result = alembic("upgrade", "head")
    assert result.returncode == 0, result.stderr
    with connect() as conn:
        plans = conn.execute(
            "SELECT email, plan_amount, plan_period FROM users ORDER BY email"
        ).fetchall()
        assert plans == [
            ("me@example.com", Decimal("30.0000"), "monthly"),
            ("other@example.com", Decimal("125.5000"), "monthly"),
        ]
        # From here on nothing is filled in for a new account.
        with pytest.raises(psycopg.errors.NotNullViolation):
            conn.execute("INSERT INTO users (email) VALUES ('new@example.com')")
        with pytest.raises(psycopg.errors.NotNullViolation):
            conn.execute("INSERT INTO users (email, plan_amount) VALUES ('new@example.com', 10)")
        with pytest.raises(psycopg.errors.CheckViolation):
            conn.execute(
                "INSERT INTO users (email, plan_amount, plan_period)"
                " VALUES ('new@example.com', 10, 'yearly')"
            )


def test_downgrading_refuses_to_call_every_plan_monthly(before_plans):
    assert alembic("upgrade", "0008").returncode == 0
    with connect() as conn:
        conn.execute("UPDATE users SET plan_period = 'weekly' WHERE email = 'other@example.com'")
    result = alembic("downgrade", "0007")
    assert result.returncode != 0
    assert "plan monthly" in result.stderr
    with connect() as conn:
        assert conn.execute("SELECT version_num FROM alembic_version").fetchone() == ("0008",)
        conn.execute("UPDATE users SET plan_period = 'monthly'")

    result = alembic("downgrade", "0007")
    assert result.returncode == 0, result.stderr
    with connect() as conn:
        amounts = conn.execute("SELECT monthly_budget FROM users ORDER BY email").fetchall()
        assert amounts == [(Decimal("30.0000"),), (Decimal("125.5000"),)]
        # New accounts start at $30 again, as that schema had it.
        conn.execute("INSERT INTO users (email) VALUES ('new@example.com')")
        new = conn.execute("SELECT monthly_budget FROM users WHERE email = 'new@example.com'")
        assert new.fetchone() == (Decimal("30.0000"),)
