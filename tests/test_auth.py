"""Signing up, confirming, signing in and out, and resetting a password."""

from datetime import timedelta

from helpers import bearer
from sqlalchemy import text

from app import limits
from app.config import get_settings
from app.db import engine

ANA = "ana@example.com"
PASSWORD = "ana-password-1"


def sign_in(browser, email=ANA, password=PASSWORD, **extra):
    return browser.post(
        "/api/auth/sign-in", json={"email": email, "password": password, **extra}
    )


def run_sql(sql: str, **params) -> None:
    with engine.begin() as conn:
        conn.execute(text(sql), params)


def test_sign_up_confirm_and_use_the_journal(new_client, outbox):
    client = new_client()
    response = client.post("/api/auth/sign-up", json={"email": "Ana@Example.com", "password": PASSWORD})
    assert response.status_code == 202
    assert response.json() == {"email": ANA}
    # Nothing is open until the address is confirmed.
    assert client.get("/api/me").status_code == 401

    code = outbox.code_for(ANA)
    response = client.post("/api/auth/confirm", json={"email": ANA, "code": code})
    assert response.status_code == 200
    assert response.json()["account"]["email"] == ANA
    # A browser gets a cookie that page scripts can't read, never the token itself.
    assert response.json()["token"] is None
    assert "httponly" in response.headers["set-cookie"].lower()

    assert client.get("/api/me").json()["email"] == ANA
    assert client.get("/api/trades").json() == []
    assert client.get("/api/summary").json()["monthly_budget"] == "30.0000"


def test_a_taken_address_gets_the_same_answer_and_keeps_its_password(account, new_client, outbox):
    account(ANA, PASSWORD)
    stranger = new_client()
    response = stranger.post(
        "/api/auth/sign-up", json={"email": ANA, "password": "someone-else-1"}
    )
    assert response.status_code == 202
    assert response.json() == {"email": ANA}
    # The address's owner hears about it; no code goes out.
    assert outbox.to(ANA)[-1][1] == "You already have a Mikeronn account"
    assert sign_in(new_client(), password="someone-else-1").status_code == 401
    assert sign_in(new_client()).status_code == 200


def test_an_unconfirmed_sign_up_is_replaced_by_the_next(new_client, outbox):
    first = new_client()
    first.post("/api/auth/sign-up", json={"email": ANA, "password": "first-password"})
    first_code = outbox.code_for(ANA)
    limits.CODE_EMAILS_PER_MINUTE.clear()
    second = new_client()
    second.post("/api/auth/sign-up", json={"email": ANA, "password": "second-password"})
    second_code = outbox.code_for(ANA)
    # Only the newest code works, and with it the newest password.
    if first_code != second_code:
        response = first.post("/api/auth/confirm", json={"email": ANA, "code": first_code})
        assert response.status_code == 422
    response = second.post("/api/auth/confirm", json={"email": ANA, "code": second_code})
    assert response.status_code == 200
    assert sign_in(new_client(), password="first-password").status_code == 401
    assert sign_in(new_client(), password="second-password").status_code == 200


def test_five_wrong_codes_use_the_code_up(new_client, outbox):
    client = new_client()
    client.post("/api/auth/sign-up", json={"email": ANA, "password": PASSWORD})
    code = outbox.code_for(ANA)
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        response = client.post("/api/auth/confirm", json={"email": ANA, "code": wrong})
        assert response.status_code == 422
        assert response.json()["detail"][0]["loc"] == ["body", "code"]
    response = client.post("/api/auth/confirm", json={"email": ANA, "code": code})
    assert response.status_code == 422

    # One new code a minute; once the minute has passed, a new code works again.
    assert client.post("/api/auth/resend-code", json={"email": ANA}).status_code == 429
    limits.CODE_EMAILS_PER_MINUTE.clear()
    assert client.post("/api/auth/resend-code", json={"email": ANA}).status_code == 202
    response = client.post("/api/auth/confirm", json={"email": ANA, "code": outbox.code_for(ANA)})
    assert response.status_code == 200


def test_an_expired_code_fails(new_client, outbox):
    client = new_client()
    client.post("/api/auth/sign-up", json={"email": ANA, "password": PASSWORD})
    run_sql("UPDATE email_codes SET expires_at = now() - interval '1 second'")
    response = client.post("/api/auth/confirm", json={"email": ANA, "code": outbox.code_for(ANA)})
    assert response.status_code == 422


def test_a_code_with_spaces_is_accepted(new_client, outbox):
    client = new_client()
    client.post("/api/auth/sign-up", json={"email": ANA, "password": PASSWORD})
    code = outbox.code_for(ANA)
    spaced = f"{code[:3]} {code[3:]}"
    assert client.post("/api/auth/confirm", json={"email": ANA, "code": spaced}).status_code == 200


def test_an_unconfirmed_account_cannot_sign_in(new_client, outbox):
    client = new_client()
    client.post("/api/auth/sign-up", json={"email": ANA, "password": PASSWORD})
    # A wrong password says nothing about the account.
    assert sign_in(client, password="wrong-password").status_code == 401

    limits.CODE_EMAILS_PER_MINUTE.clear()
    emails_before = len(outbox.to(ANA))
    response = sign_in(client)
    assert response.status_code == 403
    # Whoever comes back after the first code expired gets a fresh one.
    assert len(outbox.to(ANA)) == emails_before + 1


def test_wrong_passwords_are_limited(account, new_client):
    account()
    client = new_client()
    for _ in range(10):
        assert sign_in(client, password="wrong-password").status_code == 401
    response = sign_in(client)
    assert response.status_code == 429
    assert int(response.headers["retry-after"]) > 0


def test_an_unknown_address_is_refused_like_a_wrong_password(account, new_client):
    account()
    unknown = sign_in(new_client(), email="nobody@example.com")
    wrong = sign_in(new_client(), password="wrong-password")
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json()


def test_the_app_gets_a_token_to_send_as_bearer(account, new_client):
    account()
    response = sign_in(new_client(), client="app")
    assert response.status_code == 200
    assert "set-cookie" not in response.headers
    token = response.json()["token"]
    assert len(token) >= 40
    assert response.json()["expires_at"]

    app = new_client()
    assert app.get("/api/me").status_code == 401
    assert app.get("/api/me", headers=bearer(token)).json()["email"] == ANA


def test_signing_out_ends_the_session(account, new_client):
    browser = account()
    assert browser.post("/api/auth/sign-out").status_code == 204
    assert browser.get("/api/me").status_code == 401

    token = sign_in(new_client(), client="app").json()["token"]
    app = new_client()
    assert app.post("/api/auth/sign-out", headers=bearer(token)).status_code == 204
    assert app.get("/api/me", headers=bearer(token)).status_code == 401


def test_an_expired_session_is_refused(account):
    browser = account()
    run_sql("UPDATE sessions SET expires_at = now() - interval '1 second'")
    assert browser.get("/api/me").status_code == 401


def test_a_used_session_stays_signed_in_longer(account):
    browser = account()
    run_sql(
        "UPDATE sessions SET last_used_at = now() - interval '2 days',"
        " expires_at = now() + interval '1 day'"
    )
    response = browser.get("/api/me")
    assert response.status_code == 200
    # The cookie is renewed along with the session.
    assert "mikeronn_session" in response.headers["set-cookie"]
    with engine.connect() as conn:
        left = conn.execute(text("SELECT expires_at - now() FROM sessions")).scalar_one()
    assert left > timedelta(days=get_settings().session_days - 1)


def test_resetting_a_password_signs_out_everywhere(account, new_client, outbox):
    browser = account()
    token = sign_in(new_client(), client="app").json()["token"]

    someone = new_client()
    assert someone.post("/api/auth/forgot-password", json={"email": ANA}).status_code == 202
    code = outbox.code_for(ANA)
    assert "reset" in outbox.to(ANA)[-1][1]
    response = someone.post(
        "/api/auth/reset-password",
        json={"email": ANA, "code": code, "new_password": "brand-new-password"},
    )
    assert response.status_code == 200
    assert someone.get("/api/me").status_code == 200

    assert browser.get("/api/me").status_code == 401
    assert new_client().get("/api/me", headers=bearer(token)).status_code == 401
    assert sign_in(new_client()).status_code == 401
    assert sign_in(new_client(), password="brand-new-password").status_code == 200


def test_forgot_password_answers_the_same_for_unknown_addresses(account, new_client, outbox):
    account()
    known = new_client().post("/api/auth/forgot-password", json={"email": ANA})
    unknown = new_client().post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert known.status_code == unknown.status_code == 202
    assert known.json().keys() == unknown.json().keys()
    assert outbox.to("nobody@example.com") == []


def test_code_emails_are_limited_per_address(new_client):
    client = new_client()
    for email in (ANA, "nobody@example.com"):
        assert client.post("/api/auth/forgot-password", json={"email": email}).status_code == 202
        # A second within the minute is refused, whether or not the address has an account.
        assert client.post("/api/auth/forgot-password", json={"email": email}).status_code == 429


def test_sign_up_can_be_closed(new_client):
    settings = get_settings()
    settings.sign_up_open = False
    try:
        client = new_client()
        assert client.get("/api/auth/options").json() == {"sign_up_open": False}
        response = client.post("/api/auth/sign-up", json={"email": ANA, "password": PASSWORD})
        assert response.status_code == 403
    finally:
        settings.sign_up_open = True


def test_short_passwords_and_bad_addresses_are_refused(new_client):
    client = new_client()
    response = client.post("/api/auth/sign-up", json={"email": ANA, "password": "short"})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "password"]
    response = client.post("/api/auth/sign-up", json={"email": "not-an-address", "password": PASSWORD})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "email"]


def test_other_websites_cannot_sign_people_in(new_client):
    response = new_client().post(
        "/api/auth/sign-in",
        json={"email": ANA, "password": PASSWORD},
        headers={"Sec-Fetch-Site": "cross-site"},
    )
    assert response.status_code == 403
