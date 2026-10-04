"""Account chores for whoever runs the server.

    python -m app.manage set-password EMAIL

With Docker, in a terminal (the password is typed, never echoed):

    docker compose exec web python -m app.manage set-password you@example.com
"""

import argparse
import getpass
import sys

from app import accounts, security
from app.db import SessionLocal
from app.schemas import PASSWORD_MAX, PASSWORD_MIN


def set_password(email: str) -> int:
    email = email.strip().lower()
    with SessionLocal() as db:
        user = accounts.find_user(db, email)
        if user is None:
            print(f"No account has the email address {email}.", file=sys.stderr)
            return 1
        password = getpass.getpass("New password: ")
        if not PASSWORD_MIN <= len(password) <= PASSWORD_MAX:
            print(
                f"A password needs {PASSWORD_MIN} to {PASSWORD_MAX} characters.", file=sys.stderr
            )
            return 1
        if getpass.getpass("The same password again: ") != password:
            print("The two passwords were different. Nothing changed.", file=sys.stderr)
            return 1
        user.password_hash = security.hash_password(password)
        # Like a reset: anyone signed in with the old password is signed out.
        accounts.end_sessions(db, user)
    print(f"Password set. Sign in with {email}.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m app.manage", description=__doc__.split("\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)
    command = commands.add_parser("set-password", help="choose a new password for an account")
    command.add_argument("email")
    args = parser.parse_args()
    return set_password(args.email)


if __name__ == "__main__":
    sys.exit(main())
