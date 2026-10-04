"""Passwords, session tokens and emailed codes: making them and checking them."""

import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

# Argon2id with the library's defaults (the second option RFC 9106 recommends).
# A hash records its own parameters, so stronger ones later can still check
# old hashes, and needs_rehash says when one should be redone.
_hasher = PasswordHasher()
# Checked when there is no hash to check against, so an unknown email address
# takes as long to refuse as a wrong password and can't be told apart by timing.
_DUMMY_HASH = _hasher.hash("not anyone's password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def check_password(password_hash: str | None, password: str) -> bool:
    """Whether the password is right. Without a hash it never is, but takes as long."""
    try:
        _hasher.verify(password_hash or _DUMMY_HASH, password)
    except (VerificationError, InvalidHashError):
        return False
    return password_hash is not None


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def new_token() -> str:
    """A session token: 32 random bytes as URL-safe text."""
    return secrets.token_urlsafe(32)


def new_code() -> str:
    """A 6-digit code to email, leading zeros included."""
    return f"{secrets.randbelow(1_000_000):06d}"


def fingerprint(secret: str) -> str:
    """What is stored in place of a token or code: its SHA-256, in hex."""
    return hashlib.sha256(secret.encode()).hexdigest()


def matches(secret: str, stored_fingerprint: str) -> bool:
    # compare_digest keeps the comparison constant-time.
    return secrets.compare_digest(fingerprint(secret), stored_fingerprint)
