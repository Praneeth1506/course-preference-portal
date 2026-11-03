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
    """A full replacement of a form's editable fields.

    Published forms keep their token, and their edits must stay publishable.
    """


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


MIN_ADMIN_PASSWORD_LENGTH = 8
# bcrypt only uses the first 72 bytes of a password; longer ones are refused
# rather than silently truncated.
MAX_ADMIN_PASSWORD_BYTES = 72


class ChangePasswordRequest(BaseModel):
    # Passwords are intentionally not stripped: whitespace can be meaningful.
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=MIN_ADMIN_PASSWORD_LENGTH, max_length=200)

    @field_validator("new_password")
    @classmethod
    def check_new_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("The new password cannot be only spaces.")
        if len(value.encode("utf-8")) > MAX_ADMIN_PASSWORD_BYTES:
            raise ValueError(
                f"The new password must be at most {MAX_ADMIN_PASSWORD_BYTES} bytes."
            )
        return value


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


class CourseResponse(BaseModel):
    """A course as returned by GET /api/courses (adapted from member2/course_schema.py).

    ``course_id`` is the MongoDB ``_id`` as a 24-character hex string; it is the
    value the form builder sends back in ``questions[].course_ids``.
    """

    course_id: str
    course_code: str
    course_name: str
    semester: int | None = None
    category: str | None = None
    credits: int | None = None
    elective_group: str | None = None
    offered_by: str | None = None
    source: str | None = None
    # Empty for open electives added by an administrator: any programme.
    programmes: list[str] = []

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "course_id": "6711c0ffee0000000000abcd",
                "course_code": "23N501",
                "course_name": "Machine Learning -2",
                "semester": 5,
                "category": "PC",
                "credits": 4,
                "elective_group": None,
                "offered_by": None,
                "source": "regulation",
            }
        }
    )


class CourseListResponse(BaseModel):
    courses: list[CourseResponse]


class OpenElectiveInput(BaseModel):
    """An open elective entered by hand, typically offered by another department."""

    model_config = ConfigDict(str_strip_whitespace=True)

    course_code: str = Field(min_length=1, max_length=20, pattern=r"^[A-Za-z0-9_-]+$")
    course_name: str = Field(min_length=1, max_length=200)
    offered_by: str | None = Field(default=None, max_length=200)
    semester: int | None = Field(default=None, ge=1, le=20)
    credits: int | None = Field(default=3, ge=0, le=20)

    @field_validator("course_code", mode="before")
    @classmethod
    def normalize_code(cls, value: Any) -> Any:
        stripped = _strip(value)
        return stripped.upper() if isinstance(stripped, str) else stripped

    @field_validator("course_name", mode="before")
    @classmethod
    def strip_name(cls, value: Any) -> Any:
        return _strip(value)

    @field_validator("offered_by", mode="before")
    @classmethod
    def blank_offered_by_is_none(cls, value: Any) -> Any:
        stripped = _strip(value)
        return None if stripped == "" else stripped
