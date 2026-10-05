"""The signed-in person's own account: settings, password, devices, deletion."""

from fastapi import APIRouter, HTTPException, Request, Response, status

from app import accounts, crud, limits, security
from app.db import DbSession
from app.deps import (
    CurrentSession,
    CurrentUser,
    check_limit,
    clear_session_cookie,
    client_ip,
)
from app.models import User
from app.schemas import Account, AccountUpdate, PasswordChangeIn, PasswordIn

router = APIRouter(prefix="/me", tags=["account"])


def _require_password(request: Request, user: User, password: str, field: str) -> None:
    """Refuse unless the password is the user's own: a stolen session isn't enough."""
    key = (client_ip(request), user.email)
    check_limit(limits.SIGN_IN_FAILURES, key)
    if not security.check_password(user.password_hash, password):
        limits.SIGN_IN_FAILURES.add(key)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[
                {
                    "type": "wrong_password",
                    "loc": ["body", field],
                    "msg": "That isn't your current password.",
                }
            ],
        )


@router.get("")
def get_account(user: CurrentUser, db: DbSession) -> Account:
    account = Account.model_validate(user)
    account.last_broker = crud.last_broker(db, user)
    return account


@router.patch("")
def update_account(data: AccountUpdate, user: CurrentUser, db: DbSession) -> Account:
    user.plan_amount = data.plan_amount
    user.plan_period = data.plan_period
    db.commit()
    return Account.model_validate(user)


@router.put("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    data: PasswordChangeIn, session: CurrentSession, request: Request, db: DbSession
) -> None:
    _require_password(request, session.user, data.current_password, "current_password")
    session.user.password_hash = security.hash_password(data.new_password)
    # Other devices signed in with the old password are signed out; this one stays.
    accounts.end_sessions(db, session.user, keep=session)


@router.delete("/sessions", status_code=status.HTTP_204_NO_CONTENT)
def sign_out_other_devices(session: CurrentSession, db: DbSession) -> None:
    accounts.end_sessions(db, session.user, keep=session)


@router.post("/delete", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    data: PasswordIn,
    session: CurrentSession,
    request: Request,
    response: Response,
    db: DbSession,
) -> None:
    """Delete the account and every trade in it, for good."""
    _require_password(request, session.user, data.password, "password")
    accounts.delete_user(db, session.user)
    clear_session_cookie(request, response)
