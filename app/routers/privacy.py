"""Who runs this copy of Mikeronn, for the privacy page, which anyone can read."""

from fastapi import APIRouter

from app.config import get_settings
from app.schemas import PrivacyContact

router = APIRouter(prefix="/privacy", tags=["privacy"])


@router.get("")
def get_contact() -> PrivacyContact:
    settings = get_settings()
    return PrivacyContact(
        operator_name=settings.operator_name, contact_email=settings.contact_email
    )
