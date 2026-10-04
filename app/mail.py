"""Email: the codes that confirm an address or reset a password.

With MAIL_BACKEND=log, the default, each email is written to the server log
instead of being sent, which is all a computer without a mail service can do.
With MAIL_BACKEND=smtp it goes through any provider's SMTP server, Resend's for
example. Emails are sent after the response (FastAPI background tasks), so a
slow mail server doesn't hold up the page.
"""

import logging
import smtplib
from email.message import EmailMessage
from functools import lru_cache
from typing import Annotated, Protocol

from fastapi import Depends

from app.config import get_settings
from app.models import CONFIRM

logger = logging.getLogger(__name__)

# Seconds to wait for the mail server.
TIMEOUT = 10


class Mailer(Protocol):
    def send(self, to: str, subject: str, text: str) -> None: ...


class LogMailer:
    def send(self, to: str, subject: str, text: str) -> None:
        # Warning level, so it shows with uvicorn's default logging.
        logger.warning(
            "Email to %s, not sent because MAIL_BACKEND is log:\nSubject: %s\n\n%s",
            to,
            subject,
            text,
        )


class SmtpMailer:
    def __init__(self, host: str, port: int, username: str, password: str, sender: str) -> None:
        if not host or not sender:
            raise ValueError("MAIL_BACKEND=smtp needs SMTP_HOST and MAIL_FROM")
        self._host = host
        self._port = port
        self._username = username
        self._password = password
        self._sender = sender

    def send(self, to: str, subject: str, text: str) -> None:
        message = EmailMessage()
        message["From"] = self._sender
        message["To"] = to
        message["Subject"] = subject
        message.set_content(text)
        try:
            # Port 465 is encrypted from the start; the others upgrade with STARTTLS.
            if self._port == 465:
                smtp = smtplib.SMTP_SSL(self._host, self._port, timeout=TIMEOUT)
            else:
                smtp = smtplib.SMTP(self._host, self._port, timeout=TIMEOUT)
            with smtp:
                if self._port != 465:
                    smtp.starttls()
                if self._username:
                    smtp.login(self._username, self._password)
                smtp.send_message(message)
        except (OSError, smtplib.SMTPException) as exc:
            # The response has already gone, so the log is the only place to say so.
            logger.error("Could not send email to %s: %s", to, exc)


@lru_cache
def get_mailer() -> Mailer:
    settings = get_settings()
    if settings.mail_backend == "smtp":
        return SmtpMailer(
            settings.smtp_host,
            settings.smtp_port,
            settings.smtp_username,
            settings.smtp_password,
            settings.mail_from,
        )
    return LogMailer()


Mail = Annotated[Mailer, Depends(get_mailer)]


def code_email(purpose: str, code: str) -> tuple[str, str]:
    """The subject and text of an email carrying a code."""
    # The code leads the subject, so it shows in the notification and iOS can
    # offer to fill it in.
    if purpose == CONFIRM:
        text = (
            f"Your code is {code}\n\n"
            "Type it where Mikeronn asks for it to confirm your email address. "
            "It works for 15 minutes.\n\n"
            "If you didn't sign up for Mikeronn, you can ignore this email.\n"
        )
        return f"{code} is your Mikeronn code", text
    text = (
        f"Your code is {code}\n\n"
        "Type it where Mikeronn asks for it, then choose a new password. "
        "It works for 15 minutes.\n\n"
        "If you didn't ask to reset your password, you can ignore this email: "
        "your password stays as it is.\n"
    )
    return f"{code} is your Mikeronn password reset code", text


def already_registered_email() -> tuple[str, str]:
    """Sent instead of a code when someone signs up with an address that has an account."""
    text = (
        "Someone, hopefully you, tried to create a Mikeronn account with this "
        "email address, but it already has one.\n\n"
        'Sign in instead, or choose "Forgot your password?" on the sign-in page '
        "if you don't remember it.\n\n"
        "If it wasn't you, you can ignore this email.\n"
    )
    return "You already have a Mikeronn account", text
