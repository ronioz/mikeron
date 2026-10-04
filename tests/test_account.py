"""The signed-in person's own account: password, devices, plan, deletion."""

from helpers import trade
from sqlalchemy import text

from app.db import engine

ANA = "ana@example.com"
BEN = "ben@example.com"
PASSWORD = "ana-password-1"


def sign_in(client, password=PASSWORD):
    return client.post("/api/auth/sign-in", json={"email": ANA, "password": password})


def count(sql: str, **params) -> int:
    with engine.connect() as conn:
        return conn.execute(text(sql), params).scalar_one()


def test_changing_the_password_signs_out_other_devices(account, new_client):
    laptop = account(ANA, PASSWORD)
    phone = new_client()
    assert sign_in(phone).status_code == 200

    wrong = laptop.put(
        "/api/me/password",
        json={"current_password": "not-it-at-all", "new_password": "new-password-1"},
    )
    assert wrong.status_code == 422
    assert wrong.json()["detail"][0]["loc"] == ["body", "current_password"]

    right = laptop.put(
        "/api/me/password", json={"current_password": PASSWORD, "new_password": "new-password-1"}
    )
    assert right.status_code == 204
    assert laptop.get("/api/me").status_code == 200
    assert phone.get("/api/me").status_code == 401
    assert sign_in(new_client(), "new-password-1").status_code == 200


def test_signing_out_other_devices(account, new_client):
    laptop = account(ANA, PASSWORD)
    phone = new_client()
    sign_in(phone)
    assert laptop.delete("/api/me/sessions").status_code == 204
    assert laptop.get("/api/me").status_code == 200
    assert phone.get("/api/me").status_code == 401


def test_deleting_the_account_removes_everything_in_it(account, new_client):
    ana, ben = account(ANA, PASSWORD), account(BEN)
    ana.post("/api/trades", json=trade("SPY", "1", "500", "2026-09-01"))
    ben.post("/api/trades", json=trade("MU", "1", "90", "2026-09-02"))
    ana_id = count("SELECT id FROM users WHERE email = :email", email=ANA)

    wrong = ana.post("/api/me/delete", json={"password": "not-it-at-all"})
    assert wrong.status_code == 422
    assert wrong.json()["detail"][0]["loc"] == ["body", "password"]

    response = ana.post("/api/me/delete", json={"password": PASSWORD})
    assert response.status_code == 204
    assert 'mikeronn_session=""' in response.headers["set-cookie"]
    assert ana.get("/api/me").status_code == 401
    assert sign_in(new_client()).status_code == 401
    for table in ("trades", "sessions", "email_codes"):
        assert count(f"SELECT count(*) FROM {table} WHERE user_id = :id", id=ana_id) == 0, table
    assert count("SELECT count(*) FROM users WHERE id = :id", id=ana_id) == 0

    # Everyone else's journal is untouched.
    assert [t["ticker"] for t in ben.get("/api/trades").json()] == ["MU"]


def test_the_monthly_plan_cannot_be_negative(account):
    ana = account()
    response = ana.patch("/api/me", json={"monthly_budget": "-1"})
    assert response.status_code == 422
    assert ana.get("/api/me").json()["monthly_budget"] == "30.0000"
