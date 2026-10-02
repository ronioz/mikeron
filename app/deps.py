import secrets
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from app import crud
from app.config import get_settings
from app.db import DbSession
from app.models import Trade

basic_auth = HTTPBasic(auto_error=False)

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def reject_cross_site_writes(request: Request) -> None:
    """Refuse state-changing requests that another website triggered (CSRF).

    A browser sends such a request with the saved login attached, so this relies
    on headers the browser sets itself and page scripts cannot change:
    Sec-Fetch-Site, or Origin where that is missing (older browsers, and plain
    HTTP on anything but localhost).
    """
    if request.method in SAFE_METHODS:
        return
    fetch_site = request.headers.get("sec-fetch-site")
    if fetch_site is not None:
        allowed = fetch_site in ("same-origin", "none")
    else:
        origin = request.headers.get("origin")
        # Neither header means a non-browser client such as curl, which CSRF cannot use.
        allowed = origin is None or urlsplit(origin).netloc == request.headers.get("host")
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Cross-site request blocked"
        )


def require_login(
    credentials: Annotated[HTTPBasicCredentials | None, Depends(basic_auth)],
) -> None:
    settings = get_settings()
    if not settings.app_password:
        return
    if credentials is not None:
        # compare_digest keeps the comparison constant-time.
        user_ok = secrets.compare_digest(
            credentials.username.encode(), settings.app_username.encode()
        )
        password_ok = secrets.compare_digest(
            credentials.password.encode(), settings.app_password.encode()
        )
        if user_ok and password_ok:
            return
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Login required",
        headers={"WWW-Authenticate": "Basic"},
    )


def get_trade_or_404(trade_id: int, db: DbSession) -> Trade:
    trade = crud.get_trade(db, trade_id)
    if trade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")
    return trade


CurrentTrade = Annotated[Trade, Depends(get_trade_or_404)]
