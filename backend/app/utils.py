"""Small helpers for ObjectId handling, timestamps, and JSON serialization."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException, status


def utcnow() -> datetime:
    """Timezone-aware UTC timestamp used for every stored date."""
    return datetime.now(timezone.utc)


def parse_object_id(value: str, field_name: str = "id") -> ObjectId:
    """Convert a string to an ObjectId or raise a clean HTTP 400."""
    if not isinstance(value, str) or not ObjectId.is_valid(value.strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field_name}.",
        )
    return ObjectId(value.strip())


def normalize_object_id(value: Any) -> str | None:
    """Return the canonical 24-character hex form of a value, or None.

    Canonicalizing before comparisons prevents differently-cased or
    whitespace-padded representations of the same ID from bypassing
    duplicate/allowed-course checks.
    """
    if isinstance(value, ObjectId):
        return str(value)
    if not isinstance(value, str):
        return None
    try:
        return str(ObjectId(value.strip()))
    except (InvalidId, TypeError):
        return None


def iso_utc(value: datetime | None) -> str | None:
    """Serialize a datetime as an ISO-8601 UTC string ending in ``Z``."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def serialize_course(course: dict[str, Any]) -> dict[str, Any]:
    return {
        "course_id": str(course["_id"]),
        "course_code": course.get("code", ""),
        "course_name": course.get("name", ""),
        "semester": course.get("semester"),
    }


def build_public_url(token: str, base_url: str) -> str:
    return f"{base_url.rstrip('/')}/forms/{token}"
