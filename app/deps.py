from collections.abc import Hashable
from datetime import datetime
from ipaddress import ip_address
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import APIKeyCookie, HTTPAuthorizationCredentials, HTTPBearer

from app import accounts, crud
from app.config import get_settings
from app.db import DbSession
from app.limits import Limit
from app.models import WEB, Trade, User, UserSession

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

# The cookie that keeps a browser signed in. Page scripts can't read it.
SESSION_COOKIE = "mikeronn_session"

# Declared as FastAPI security schemes so the API docs (/docs) and generated
# clients know both ways of signing a request.
bearer_token = HTTPBearer(
    auto_error=False,
    description="For the app: the token from signing in with client \"app\".",
)
session_cookie = APIKeyCookie(
    name=SESSION_COOKIE,
    auto_error=False,
    description="For browsers: set by signing in with client \"web\".",
)


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
        # Neither header means a non-browser client such as curl or the iOS app,
        # which CSRF cannot use: they send the token themselves.
        allowed = origin is None or urlsplit(origin).netloc == request.headers.get("host")
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Cross-site request blocked"
        )


def client_ip(request: Request) -> str:
    """The network address a request came from, which the attempt limits count by.

    Behind a reverse proxy that is the proxy's own address, unless the proxy
    passes the visitor's on. X-Forwarded-For does that (uvicorn reads it when
    FORWARDED_ALLOW_IPS trusts the proxy), but some proxies only add to what
    the visitor sent in it, so a visitor can name any address and get a fresh
    count. Where the host has a header visitors can't send, CLIENT_IP_HEADER
    names it and it is believed instead.
    """
    header = get_settings().client_ip_header
    if header:
        try:
            # Read as an address, so nothing else can become a key to count by.
            return str(ip_address(request.headers.get(header, "").strip()))
        except ValueError:
            # Not sent, as on the host's own health checks from inside.
            pass
    return request.client.host if request.client else "unknown"


def check_limit(limit: Limit, key: Hashable) -> None:
    """Refuse with 429 if the key has had all the tries the limit allows."""
    wait = limit.wait(key)
    if wait:
        minutes = max(1, round(wait / 60))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many tries. Please wait {minutes} minute"
            f"{'' if minutes == 1 else 's'} and try again.",
            headers={"Retry-After": str(wait)},
        )


def set_session_cookie(request: Request, response: Response, token: str, expires: datetime) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        expires=expires,
        path="/",
        httponly=True,
        # Sent when following a link to the app, not with other sites' requests.
        samesite="lax",
        # Over HTTPS the cookie is never sent unencrypted. Plain HTTP on this
        # computer (localhost) has nothing to encrypt with.
        secure=request.url.scheme == "https",
    )


def clear_session_cookie(request: Request, response: Response) -> None:
    response.delete_cookie(
        SESSION_COOKIE,
        path="/",
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
    )


def get_current_session(
    request: Request,
    response: Response,
    db: DbSession,
    bearer: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_token)],
    cookie: Annotated[str | None, Depends(session_cookie)],
) -> UserSession:
    """The signed-in session making this request, or a 401."""
    token = bearer.credentials if bearer is not None else cookie
    session = accounts.find_session(db, token) if token else None
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to continue.",
            # Bearer rather than Basic, so browsers don't pop up their own login box.
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Each day of use keeps the device signed in for another SESSION_DAYS.
    if accounts.keep_session(db, session) and session.client == WEB:
        set_session_cookie(request, response, token, session.expires_at)
    return session


CurrentSession = Annotated[UserSession, Depends(get_current_session)]


def get_current_user(session: CurrentSession) -> User:
    return session.user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_trade_or_404(trade_id: int, user: CurrentUser, db: DbSession) -> Trade:
    # Someone else's trade is "not found" rather than "forbidden", which would
    # confirm that a trade with that number exists.
    trade = crud.get_trade(db, user, trade_id)
    if trade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")
    return trade


CurrentTrade = Annotated[Trade, Depends(get_trade_or_404)]
