"""Accounts in the database: people, their signed-in devices, and emailed codes.

The rules about who may do what live in the routers. This module only reads
and writes, and commits when a step is complete.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import security
from app.config import get_settings
from app.models import EmailCode, User, UserSession

# How long an emailed code works, and how many wrong guesses it survives.
CODE_LIFETIME = timedelta(minutes=15)
CODE_ATTEMPTS = 5
# Accounts whose address was never confirmed are removed after this long, so
# someone who mistyped their address can sign up again with it later.
UNCONFIRMED_LIFETIME = timedelta(days=7)
# A session's expiry moves forward at most this often, so most requests don't
# write to the database just to say they happened.
SESSION_REFRESH = timedelta(days=1)


def now() -> datetime:
    return datetime.now(UTC)


def find_user(db: Session, email: str) -> User | None:
    """The account with this address, which must already be lowercased."""
    return db.scalar(select(User).where(User.email == email))


def save_sign_up(db: Session, email: str, password_hash: str) -> User:
    """Create an unconfirmed account, or give an unconfirmed one this new password.

    A sign-up that was never confirmed is only a request: whoever confirms the
    address with the emailed code becomes the account's owner.
    """
    user = find_user(db, email)
    if user is None:
        user = User(email=email, password_hash=password_hash)
        db.add(user)
    else:
        user.password_hash = password_hash
    db.commit()
    return user


def delete_user(db: Session, user: User) -> None:
    # The database removes their trades, sessions and codes with them.
    db.execute(delete(User).where(User.id == user.id))
    db.commit()


def forget_unconfirmed(db: Session) -> None:
    """Remove accounts whose address was never confirmed within UNCONFIRMED_LIFETIME."""
    db.execute(
        delete(User).where(
            User.email_verified_at.is_(None), User.created_at < now() - UNCONFIRMED_LIFETIME
        )
    )
    db.commit()


def start_session(db: Session, user: User, client: str) -> tuple[UserSession, str]:
    """Sign a browser or the app in. Returns the session and the token to hand over."""
    token = security.new_token()
    session = UserSession(
        user_id=user.id,
        token_hash=security.fingerprint(token),
        client=client,
        last_used_at=now(),
        expires_at=now() + timedelta(days=get_settings().session_days),
    )
    db.add(session)
    # Sessions that ran out are cleared here rather than by a scheduled job.
    db.execute(delete(UserSession).where(UserSession.expires_at <= now()))
    db.commit()
    return session, token


def find_session(db: Session, token: str) -> UserSession | None:
    """The live session holding this token, with its user."""
    return db.scalar(
        select(UserSession).where(
            UserSession.token_hash == security.fingerprint(token), UserSession.expires_at > now()
        )
    )


def keep_session(db: Session, session: UserSession) -> bool:
    """Move the session's expiry forward if a day has passed. Returns whether it moved."""
    current = now()
    if current - session.last_used_at < SESSION_REFRESH:
        return False
    session.last_used_at = current
    session.expires_at = current + timedelta(days=get_settings().session_days)
    db.commit()
    return True


def end_session(db: Session, session: UserSession) -> None:
    db.execute(delete(UserSession).where(UserSession.id == session.id))
    db.commit()


def end_sessions(db: Session, user: User, keep: UserSession | None = None) -> None:
    """Sign the user out everywhere, except on the `keep` session if given."""
    query = delete(UserSession).where(UserSession.user_id == user.id)
    if keep is not None:
        query = query.where(UserSession.id != keep.id)
    db.execute(query)
    db.commit()


def issue_code(db: Session, user: User, purpose: str) -> str:
    """A new code for the purpose. Any earlier one for it stops working."""
    db.execute(delete(EmailCode).where(EmailCode.user_id == user.id, EmailCode.purpose == purpose))
    code = security.new_code()
    db.add(
        EmailCode(
            user_id=user.id,
            purpose=purpose,
            code_hash=security.fingerprint(code),
            attempts=0,
            expires_at=now() + CODE_LIFETIME,
        )
    )
    db.commit()
    return code


def use_code(db: Session, user: User, purpose: str, code: str) -> bool:
    """Whether the code is right. A right code is used up; a wrong one costs an attempt.

    A right code's removal is left for the caller to commit, together with
    whatever the code allowed, so one can't happen without the other.
    """
    # Locked, so two guesses at once can't both slip under the attempt limit.
    row = db.scalar(
        select(EmailCode)
        .where(
            EmailCode.user_id == user.id,
            EmailCode.purpose == purpose,
            EmailCode.expires_at > now(),
        )
        .with_for_update()
    )
    if row is None or row.attempts >= CODE_ATTEMPTS:
        db.rollback()
        return False
    if security.matches(code, row.code_hash):
        db.delete(row)
        return True
    row.attempts += 1
    db.commit()
    return False
