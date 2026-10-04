"""Migration 0006 hands the trades already recorded to the owner, and never guesses.

Runs alembic as its own process against a database of its own, at the schema
the real one had before accounts (0005) with two trades in it.
"""

import os
import subprocess
import sys

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
        conn.execute("INSERT INTO users (email) VALUES ('other@example.com')")
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
