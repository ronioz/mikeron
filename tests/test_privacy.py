"""The privacy page's contact details, which anyone can read."""

from app.config import get_settings


def test_anyone_can_read_who_runs_the_site(new_client, monkeypatch):
    client = new_client()
    # Nothing is made up when the host hasn't said.
    assert client.get("/api/privacy").json() == {"operator_name": "", "contact_email": ""}
    monkeypatch.setattr(get_settings(), "operator_name", "Ana Example")
    monkeypatch.setattr(get_settings(), "contact_email", "privacy@example.com")
    # No one is signed in.
    response = client.get("/api/privacy")
    assert response.status_code == 200
    assert response.json() == {
        "operator_name": "Ana Example",
        "contact_email": "privacy@example.com",
    }
