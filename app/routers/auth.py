"""Signing up, confirming an address, signing in and out, resetting a password.

No answer here reveals whether an address has an account. Signing up and
asking for a reset code get the same reply either way, emails go out after the
response, and an unknown address takes as long to refuse as a wrong password.
"""

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app import accounts, limits, mail, security
from app.config import get_settings
from app.db import DbSession
from app.deps import (
    CurrentSession,
    check_limit,
    clear_session_cookie,
    client_ip,
    set_session_cookie,
)
from app.mail import Mail, Mailer
from app.models import APP, CONFIRM, RESET, User
from app.schemas import (
    Account,
    AuthOptions,
    CodeSent,
    ConfirmIn,
    EmailIn,
    ResetPasswordIn,
    SignedIn,
    SignInIn,
    SignUpIn,
)

router = APIRouter(prefix="/auth", tags=["auth"])

CODE_EMAIL_LIMITS = (limits.CODE_EMAILS_PER_MINUTE, limits.CODE_EMAILS_PER_HOUR)


def _count_code_email(email: str) -> None:
    """Count a code email to the address, or refuse with 429 if it has had enough.

    Counted whether or not the address has an account, so a refusal gives
    nothing away.
    """
    for limit in CODE_EMAIL_LIMITS:
        check_limit(limit, email)
    for limit in CODE_EMAIL_LIMITS:
        limit.add(email)


def _send_code(
    db: Session, background: BackgroundTasks, mailer: Mailer, user: User, purpose: str
) -> None:
    code = accounts.issue_code(db, user, purpose)
    background.add_task(mailer.send, user.email, *mail.code_email(purpose, code))


def _wrong_code() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=[
            {
                "type": "wrong_code",
                "loc": ["body", "code"],
                "msg": "That code is wrong or has expired.",
            }
        ],
    )


def _sign_in(
    request: Request, response: Response, db: Session, user: User, client: str
) -> SignedIn:
    session, token = accounts.start_session(db, user, client)
    signed_in = SignedIn(account=Account.model_validate(user))
    if client == APP:
        signed_in.token = token
        signed_in.expires_at = session.expires_at
    else:
        set_session_cookie(request, response, token, session.expires_at)
    return signed_in


@router.get("/options")
def get_options() -> AuthOptions:
    return AuthOptions(sign_up_open=get_settings().sign_up_open)


@router.post("/sign-up", status_code=status.HTTP_202_ACCEPTED)
def sign_up(
    data: SignUpIn, request: Request, background: BackgroundTasks, db: DbSession, mailer: Mail
) -> CodeSent:
    """Start an account. A code to confirm the address is emailed to it."""
    if not get_settings().sign_up_open:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Sign-up is closed at the moment."
        )
    ip = client_ip(request)
    check_limit(limits.SIGN_UPS, ip)
    _count_code_email(data.email)
    limits.SIGN_UPS.add(ip)
    accounts.forget_unconfirmed(db)
    # Hashed on every path, so the reply takes as long whether or not the
    # address already has an account.
    password_hash = security.hash_password(data.password)
    existing = accounts.find_user(db, data.email)
    if existing is not None and existing.email_verified_at is not None:
        # Tell the address's owner, and only them, that they already have one.
        background.add_task(mailer.send, existing.email, *mail.already_registered_email())
        return CodeSent(email=data.email)
    user = accounts.save_sign_up(
        db, data.email, password_hash, data.plan_amount, data.plan_period
    )
    _send_code(db, background, mailer, user, CONFIRM)
    return CodeSent(email=data.email)


@router.post("/resend-code", status_code=status.HTTP_202_ACCEPTED)
def resend_code(
    data: EmailIn, background: BackgroundTasks, db: DbSession, mailer: Mail
) -> CodeSent:
    """Email a new code to an address waiting to be confirmed."""
    _count_code_email(data.email)
    user = accounts.find_user(db, data.email)
    if user is not None and user.email_verified_at is None:
        _send_code(db, background, mailer, user, CONFIRM)
    return CodeSent(email=data.email)


@router.post("/confirm")
def confirm(data: ConfirmIn, request: Request, response: Response, db: DbSession) -> SignedIn:
    """Confirm the address with the emailed code, and sign in."""
    ip = client_ip(request)
    check_limit(limits.CODE_FAILURES, ip)
    user = accounts.find_user(db, data.email)
    if (
        user is None
        or user.email_verified_at is not None
        or not accounts.use_code(db, user, CONFIRM, data.code)
    ):
        limits.CODE_FAILURES.add(ip)
        raise _wrong_code()
    user.email_verified_at = accounts.now()
    return _sign_in(request, response, db, user, data.client)


@router.post("/sign-in")
def sign_in(
    data: SignInIn, request: Request, response: Response, db: DbSession, mailer: Mail
) -> SignedIn:
    key = (client_ip(request), data.email)
    check_limit(limits.SIGN_IN_FAILURES, key)
    user = accounts.find_user(db, data.email)
    # Checked even without an account (against a stand-in hash), so an unknown
    # address takes as long to refuse as a wrong password.
    password_ok = security.check_password(user.password_hash if user else None, data.password)
    if user is None or not password_ok:
        limits.SIGN_IN_FAILURES.add(key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Wrong email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.email_verified_at is None:
        # The password was right, so saying why is safe. A fresh code helps
        # whoever comes back after the first one expired.
        if not any(limit.wait(user.email) for limit in CODE_EMAIL_LIMITS):
            _count_code_email(user.email)
            code = accounts.issue_code(db, user, CONFIRM)
            # Sent before answering: an error response doesn't run background
            # tasks. Timing gives nothing away here, the password being right.
            mailer.send(user.email, *mail.code_email(CONFIRM, code))
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Confirm your email address first with the code we emailed you.",
        )
    if user.password_hash is not None and security.needs_rehash(user.password_hash):
        user.password_hash = security.hash_password(data.password)
    return _sign_in(request, response, db, user, data.client)


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(
    data: EmailIn, background: BackgroundTasks, db: DbSession, mailer: Mail
) -> CodeSent:
    """Email a code for choosing a new password, if the address has an account."""
    _count_code_email(data.email)
    user = accounts.find_user(db, data.email)
    if user is not None and user.email_verified_at is not None:
        _send_code(db, background, mailer, user, RESET)
    return CodeSent(email=data.email)


@router.post("/reset-password")
def reset_password(
    data: ResetPasswordIn, request: Request, response: Response, db: DbSession
) -> SignedIn:
    """Choose a new password with the emailed code, and sign in."""
    ip = client_ip(request)
    check_limit(limits.CODE_FAILURES, ip)
    user = accounts.find_user(db, data.email)
    if (
        user is None
        or user.email_verified_at is None
        or not accounts.use_code(db, user, RESET, data.code)
    ):
        limits.CODE_FAILURES.add(ip)
        raise _wrong_code()
    user.password_hash = security.hash_password(data.new_password)
    # Whoever knew the old password is signed out everywhere.
    accounts.end_sessions(db, user)
    return _sign_in(request, response, db, user, data.client)


@router.post("/sign-out", status_code=status.HTTP_204_NO_CONTENT)
def sign_out(
    session: CurrentSession, request: Request, response: Response, db: DbSession
) -> None:
    accounts.end_session(db, session)
    clear_session_cookie(request, response)
