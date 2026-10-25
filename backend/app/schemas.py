"""Pydantic request/response models.

Validation here protects the API boundary (types, lengths, empty strings).
Cross-document rules such as "this course belongs to this question" are
enforced in the routers because they require database lookups.
"""

from __future__ import annotations

from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from pydantic import BaseModel, ConfigDict, Field, field_validator


def _strip(value: Any) -> Any:
    return value.strip() if isinstance(value, str) else value


def _canonical_course_ids(value: Any) -> Any:
    if not isinstance(value, list):
        return value
    cleaned: list[str] = []
    for raw in value:
        if not isinstance(raw, str):
            raise ValueError("Course IDs must be strings.")
        candidate = raw.strip()
        if not candidate:
            raise ValueError("Course IDs must not be empty.")
        try:
            canonical = str(ObjectId(candidate))
        except (InvalidId, TypeError) as exc:
            raise ValueError(f"Invalid course ID: {candidate}") from exc
        if canonical not in cleaned:
            cleaned.append(canonical)
    return cleaned


class QuestionInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    question_id: str | None = Field(default=None, max_length=64)
    text: str = Field(min_length=1, max_length=500)
    course_ids: list[str] = Field(default_factory=list)
    semester: int | None = Field(default=None, ge=1, le=20)

    @field_validator("question_id", mode="before")
    @classmethod
    def blank_question_id_is_none(cls, value: Any) -> Any:
        stripped = _strip(value)
        return None if stripped == "" else stripped

    @field_validator("text", mode="before")
    @classmethod
    def strip_text(cls, value: Any) -> Any:
        return _strip(value)

    @field_validator("course_ids", mode="before")
    @classmethod
    def normalize_course_ids(cls, value: Any) -> Any:
        return _canonical_course_ids(value)


class FormCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    questions: list[QuestionInput] = Field(default_factory=list, max_length=50)

    @field_validator("title", "description", mode="before")
    @classmethod
    def strip_text_fields(cls, value: Any) -> Any:
        return _strip(value)

    @field_validator("questions")
    @classmethod
    def unique_provided_question_ids(
        cls, value: list[QuestionInput]
    ) -> list[QuestionInput]:
        provided = [q.question_id for q in value if q.question_id]
        if len(provided) != len(set(provided)):
            raise ValueError("Question IDs must be unique within a form.")
        return value


class FormUpdate(FormCreate):
    """A full replacement of a draft's editable fields."""


class LoginRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)

    @field_validator("username", mode="before")
    @classmethod
    def strip_username(cls, value: Any) -> Any:
        return _strip(value)

    # Passwords are intentionally not stripped: whitespace can be meaningful.


class AnswerInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    question_id: str = Field(min_length=1, max_length=64)
    course_id: str = Field(min_length=1, max_length=64)

    @field_validator("question_id", "course_id", mode="before")
    @classmethod
    def strip_ids(cls, value: Any) -> Any:
        return _strip(value)


class FacultyResponseInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    faculty_name: str = Field(min_length=1, max_length=200)
    faculty_id: str = Field(min_length=1, max_length=100)
    answers: list[AnswerInput] = Field(min_length=1, max_length=100)

    @field_validator("faculty_name", "faculty_id", mode="before")
    @classmethod
    def strip_faculty_fields(cls, value: Any) -> Any:
        return _strip(value)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    username: str


class AdminInfo(BaseModel):
    username: str
    role: str = "admin"


class PublishResponse(BaseModel):
    form_id: str
    status: str
    public_token: str
    public_url: str
    published_at: str | None = None


class MessageResponse(BaseModel):
    message: str
