"""Sending email over SMTP, with stand-ins for the mail server's connections."""

import smtplib
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from email.utils import parsedate_to_datetime
from typing import Self

import pytest

from app.mail import SmtpMailer, code_email
from app.models import CONFIRM


class Server:
    """Stands in for an smtplib connection, noting what the mailer does with it."""

    def __init__(self, encrypted: bool, host: str, port: int) -> None:
        self.encrypted = encrypted
        self.address = (host, port)
        self.steps: list[object] = []
        self.sent: list[EmailMessage] = []

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *exc) -> None:
        self.steps.append("quit")

    def starttls(self) -> None:
        self.steps.append("starttls")

    def login(self, username: str, password: str) -> None:
        self.steps.append(("login", username, password))

    def send_message(self, message: EmailMessage) -> None:
        self.sent.append(message)


@pytest.fixture
def servers(monkeypatch) -> list[Server]:
    """The connections the mailer opens, in place of real ones."""
    opened: list[Server] = []

    def connect(encrypted: bool):
        def open_one(host: str, port: int, timeout: float) -> Server:
            server = Server(encrypted, host, port)
            opened.append(server)
            return server

        return open_one

    monkeypatch.setattr(smtplib, "SMTP", connect(False))
    monkeypatch.setattr(smtplib, "SMTP_SSL", connect(True))
    return opened


def mailer(port: int) -> SmtpMailer:
    return SmtpMailer(
        "smtp.example.com", port, "login@example.com", "smtp-key", "Mikeronn <codes@example.com>"
    )


def test_an_email_goes_out_over_starttls_with_the_headers_mail_needs(servers):
    mailer(2525).send("ana@example.com", *code_email(CONFIRM, "123456"))
    [server] = servers
    assert (server.encrypted, server.address) == (False, ("smtp.example.com", 2525))
    assert server.steps == ["starttls", ("login", "login@example.com", "smtp-key"), "quit"]
    [message] = server.sent
    assert message["From"] == "Mikeronn <codes@example.com>"
    assert message["To"] == "ana@example.com"
    assert message["Subject"] == "123456 is your Mikeronn code"
    assert "Your code is 123456" in message.get_content()
    # Dated now, with a Message-ID in the sender's domain: smtplib adds neither.
    assert abs(datetime.now(UTC) - parsedate_to_datetime(message["Date"])) < timedelta(minutes=1)
    assert message["Message-ID"].endswith("@example.com>")


def test_port_465_is_encrypted_from_the_start(servers):
    mailer(465).send("ana@example.com", "Subject", "Text")
    [server] = servers
    assert server.encrypted
    assert "starttls" not in server.steps


def test_an_email_that_cant_be_sent_is_logged(servers, monkeypatch, caplog):
    def refuse(self, message):
        raise smtplib.SMTPSenderRefused(550, b"Sender not valid", "codes@example.com")

    monkeypatch.setattr(Server, "send_message", refuse)
    # The response has gone by then, so nothing may be raised.
    mailer(2525).send("ana@example.com", "Subject", "Text")
    assert "Could not send email to ana@example.com" in caplog.text


def test_the_sender_needs_an_address():
    with pytest.raises(ValueError, match="MAIL_FROM"):
        SmtpMailer("smtp.example.com", 2525, "", "", "Mikeronn")
