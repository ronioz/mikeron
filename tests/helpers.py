"""What the tests share: where the test databases live, and small builders.

Nothing here imports the app, so conftest.py can use it before the app's
database address is set.
"""

import os
from pathlib import Path
from urllib.parse import quote

import psycopg
from dotenv import dotenv_values

PROJECT = Path(__file__).resolve().parent.parent

_env = {**dotenv_values(PROJECT / ".env"), **os.environ}
_user = _env.get("POSTGRES_USER") or "trades"
_password = _env.get("POSTGRES_PASSWORD") or "trades"
REAL_DB = _env.get("POSTGRES_DB") or "trades"

# The Docker database server, published on this computer.
SERVER = f"{quote(_user, safe='')}:{quote(_password, safe='')}@127.0.0.1:5432"


def scratch_url(name: str, driver: str = "postgresql+psycopg") -> str:
    """The address of a throwaway database, refusing anything named like the real one."""
    if name in (REAL_DB, "trades"):
        raise RuntimeError(f"refusing: {name} is the real database's name")
    return f"{driver}://{SERVER}/{name}"


def server_command(sql: str) -> None:
    """Run SQL on the Postgres server itself, outside any test database."""
    with psycopg.connect(f"postgresql://{SERVER}/postgres", autocommit=True) as conn:
        conn.execute(sql)


def recreate(name: str) -> None:
    scratch_url(name)
    server_command(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
    server_command(f'CREATE DATABASE "{name}"')


def drop(name: str) -> None:
    scratch_url(name)
    server_command(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')


def trade(ticker: str, shares: str, price: str, date: str, side: str = "buy", **extra) -> dict:
    """A trade as the form sends it."""
    return {
        "side": side,
        "ticker": ticker,
        "price": price,
        "shares": shares,
        "trade_date": date,
        "thesis": "test",
        **extra,
    }


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
