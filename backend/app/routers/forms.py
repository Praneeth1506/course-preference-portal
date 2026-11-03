"""Administrator form endpoints, including publishing and response listing.

Forms are stored in the ``forms`` collection. Courses referenced by a question
are stored as an ordered array of ObjectIds in ``questions[].course_ids``.
Responses are stored in the ``responses`` collection with a real ObjectId
``form_id`` and answers in form-question order.
"""

from __future__ import annotations

import logging
import secrets
from typing import Any
from urllib.parse import quote

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError, PyMongoError

from ..config import settings
from ..database import get_database
from ..export import XLSX_MEDIA_TYPE, export_filename, responses_workbook
from ..schemas import FormCreate, FormUpdate, PublishResponse, QuestionInput
from ..security import get_current_admin
from ..utils import (
    build_public_url,
    iso_utc,
    normalize_object_id,
    parse_object_id,
    serialize_course,
    utcnow,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/forms", tags=["forms"])

MAX_TOKEN_ATTEMPTS = 5
# Starlette renamed this constant; support both without triggering the
# deprecation warning on newer releases.
HTTP_422 = getattr(status, "HTTP_422_UNPROCESSABLE_CONTENT", 422)


def _server_error(detail: str, action: str) -> HTTPException:
    logger.exception("Database error while %s", action)
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=detail
    )


def _build_question_docs(
    inputs: list[QuestionInput], reserved_ids: set[str] | None = None
) -> list[dict[str, Any]]:
    """Normalize question IDs and order, storing course IDs as ObjectIds.

    New questions never take an ID in ``reserved_ids``, so a question added to
    a published form cannot inherit the answers of one that was removed.
    """
    used_ids: set[str] = {q.question_id for q in inputs if q.question_id}
    used_ids |= reserved_ids or set()
    docs: list[dict[str, Any]] = []

    for index, question in enumerate(inputs):
        question_id = question.question_id
        if not question_id:
            candidate_index = index + 1
            while f"q{candidate_index}" in used_ids:
                candidate_index += 1
            question_id = f"q{candidate_index}"
            used_ids.add(question_id)

        docs.append(
            {
                "question_id": question_id,
                "text": question.text,
                "order": index + 1,
                "course_ids": [ObjectId(cid) for cid in question.course_ids],
                "semester": question.semester,
            }
        )
    return docs


def _question_sort_key(question: dict[str, Any], index: int) -> tuple[int, int]:
    order = question.get("order")
    if not isinstance(order, int):
        order = index + 1
    return order, index


def _ordered_questions(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        question
        for _, question in sorted(
            enumerate(questions),
            key=lambda pair: _question_sort_key(pair[1], pair[0]),
        )
    ]


def _collect_course_map(
    db: Database, questions: list[dict[str, Any]]
) -> dict[str, dict[str, Any]]:
    """Bulk-load every course referenced by the given questions."""
    course_ids: dict[str, ObjectId] = {}
    for question in questions:
        for raw in question.get("course_ids") or []:
            canonical = normalize_object_id(raw)
            if canonical:
                course_ids[canonical] = ObjectId(canonical)

    if not course_ids:
        return {}

    courses = db.courses.find({"_id": {"$in": list(course_ids.values())}})
    return {str(course["_id"]): course for course in courses}


def _serialize_admin_form(db: Database, form: dict[str, Any]) -> dict[str, Any]:
    questions = form.get("questions") or []
    course_map = _collect_course_map(db, questions)

    serialized_questions = []
    for question in _ordered_questions(questions):
        course_ids = [
            canonical
            for canonical in (
                normalize_object_id(raw) for raw in question.get("course_ids") or []
            )
            if canonical
        ]
        serialized_questions.append(
            {
                "question_id": question.get("question_id"),
                "text": question.get("text", ""),
                "order": question.get("order"),
                "semester": question.get("semester"),
                "course_ids": course_ids,
                "courses": [
                    serialize_course(course_map[cid])
                    for cid in course_ids
                    if cid in course_map
                ],
            }
        )

    public_token = form.get("public_token")
    result = {
        "form_id": str(form["_id"]),
        "title": form.get("title", ""),
        "description": form.get("description"),
        "status": form.get("status", "draft"),
        "public_token": public_token,
        "questions": serialized_questions,
        "created_at": iso_utc(form.get("created_at")),
        "updated_at": iso_utc(form.get("updated_at")),
        "published_at": iso_utc(form.get("published_at")),
    }
    if form.get("status") == "published" and public_token:
        result["public_url"] = build_public_url(
            public_token, settings.frontend_base_url
        )
    return result


def _serialize_form_summary(form: dict[str, Any], response_count: int) -> dict[str, Any]:
    public_token = form.get("public_token")
    summary = {
        "form_id": str(form["_id"]),
        "title": form.get("title", ""),
        "description": form.get("description"),
        "status": form.get("status", "draft"),
        "question_count": len(form.get("questions") or []),
        "response_count": response_count,
        "public_token": public_token,
        "created_at": iso_utc(form.get("created_at")),
        "updated_at": iso_utc(form.get("updated_at")),
        "published_at": iso_utc(form.get("published_at")),
    }
    if form.get("status") == "published" and public_token:
        summary["public_url"] = build_public_url(
            public_token, settings.frontend_base_url
        )
    return summary


def _validate_publishable(db: Database, form: dict[str, Any]) -> None:
    """Raise HTTP 422 unless the form is complete and internally consistent."""
    title = (form.get("title") or "").strip()
    if not title:
        raise HTTPException(
            status_code=HTTP_422,
            detail="Form title is required before publishing.",
        )

    questions = form.get("questions") or []
    if not questions:
        raise HTTPException(
            status_code=HTTP_422,
            detail="A form must contain at least one question before publishing.",
        )

    seen_question_ids: set[str] = set()
    referenced_ids: set[str] = set()
    per_question_ids: list[tuple[dict[str, Any], list[str]]] = []

    for question in questions:
        question_id = (question.get("question_id") or "").strip()
        if not question_id:
            raise HTTPException(
                status_code=HTTP_422,
                detail="Every question must have a question ID.",
            )
        if question_id in seen_question_ids:
            raise HTTPException(
                status_code=HTTP_422,
                detail=f"Duplicate question ID: {question_id}.",
            )
        seen_question_ids.add(question_id)

        if not (question.get("text") or "").strip():
            raise HTTPException(
                status_code=HTTP_422,
                detail=f"Question {question_id} must have text.",
            )

        raw_course_ids = question.get("course_ids") or []
        if not raw_course_ids:
            raise HTTPException(
                status_code=HTTP_422,
                detail=f"Question {question_id} must allow at least one course.",
            )

        canonical_ids: list[str] = []
        for raw in raw_course_ids:
            canonical = normalize_object_id(raw)
            if not canonical:
                raise HTTPException(
                    status_code=HTTP_422,
                    detail=f"Question {question_id} contains an invalid course ID.",
                )
            canonical_ids.append(canonical)
            referenced_ids.add(canonical)
        per_question_ids.append((question, canonical_ids))

    try:
        courses = list(
            db.courses.find(
                {"_id": {"$in": [ObjectId(cid) for cid in referenced_ids]}}
            )
        )
    except PyMongoError as exc:
        raise _server_error("Could not validate the form.", "validating courses") from exc

    course_map = {str(course["_id"]): course for course in courses}

    missing = sorted(referenced_ids - set(course_map))
    if missing:
        raise HTTPException(
            status_code=HTTP_422,
            detail="The form references courses that no longer exist.",
        )

    for course in courses:
        if not str(course.get("code") or "").strip() or not str(
            course.get("name") or ""
        ).strip():
            raise HTTPException(
                status_code=HTTP_422,
                detail="The form references an invalid course record.",
            )

    # Respect an optional per-question semester restriction if one is present.
    # Courses with no fixed semester (most electives) suit any semester.
    for question, canonical_ids in per_question_ids:
        question_id = question.get("question_id")
        semester = question.get("semester")
        if semester is None:
            continue
        for cid in canonical_ids:
            course_semester = course_map[cid].get("semester")
            if course_semester is not None and course_semester != semester:
                raise HTTPException(
                    status_code=HTTP_422,
                    detail=(
                        f"Question {question_id} is restricted to semester "
                        f"{semester}, but one of its courses is not."
                    ),
                )

    # A course may be offered in several questions, but faculty pick each
    # course only once, so every question must be able to get its own course.
    stuck = _unanswerable_question(per_question_ids)
    if stuck is not None:
        raise HTTPException(
            status_code=HTTP_422,
            detail=(
                f"Question {stuck} cannot be answered with a different course "
                "from the other questions. Add more courses."
            ),
        )


def _unanswerable_question(
    per_question_ids: list[tuple[dict[str, Any], list[str]]],
) -> str | None:
    """Return the ID of a question left without a distinct course, if any.

    Bipartite matching of questions to courses (augmenting paths).
    """
    matched_by: dict[str, int] = {}

    def assign(index: int, visited: set[str]) -> bool:
        for course_id in per_question_ids[index][1]:
            if course_id in visited:
                continue
            visited.add(course_id)
            holder = matched_by.get(course_id)
            if holder is None or assign(holder, visited):
                matched_by[course_id] = index
                return True
        return False

    for index, (question, _course_ids) in enumerate(per_question_ids):
        if not assign(index, set()):
            return question.get("question_id")
    return None


def _removed_questions(
    form: dict[str, Any], new_questions: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Questions dropped from a published form, kept to label earlier answers."""
    kept = {question["question_id"] for question in new_questions}
    removed = {
        question["question_id"]: question
        for question in form.get("removed_questions") or []
        if question.get("question_id") not in kept
    }
    for question in form.get("questions") or []:
        question_id = question.get("question_id")
        if question_id and question_id not in kept:
            removed[question_id] = {
                "question_id": question_id,
                "text": question.get("text", ""),
            }
    return list(removed.values())


def _used_question_ids(db: Database, form: dict[str, Any]) -> set[str]:
    """Question IDs the form has had or that responses have answered."""
    ids = {
        str(question.get("question_id"))
        for question in [*(form.get("questions") or []), *(form.get("removed_questions") or [])]
        if question.get("question_id")
    }
    answered = db.responses.distinct("answers.question_id", {"form_id": form["_id"]})
    return ids | {str(question_id) for question_id in answered if question_id}


def _generate_public_token() -> str:
    """256+ bits of cryptographically secure randomness, URL-safe."""
    return secrets.token_urlsafe(settings.public_token_bytes)


def _publish_form_document(db: Database, form: dict[str, Any]) -> dict[str, Any]:
    """Assign a unique token and mark the form published.

    Repeated/concurrent publishes are handled with a conditional update: the
    first writer wins and a losing request re-reads and returns that writer's
    token, so clients always receive a token that is actually stored.
    """
    form_id: ObjectId = form["_id"]
    conditional = {
        "_id": form_id,
        "$or": [
            {"status": {"$ne": "published"}},
            {"public_token": {"$in": [None, ""]}},
        ],
    }

    for _attempt in range(MAX_TOKEN_ATTEMPTS):
        token = _generate_public_token()

        try:
            collision = db.forms.find_one(
                {"public_token": token, "_id": {"$ne": form_id}}
            )
        except PyMongoError as exc:
            raise _server_error(
                "Could not publish the form.", "checking token uniqueness"
            ) from exc
        if collision is not None:
            continue

        now = utcnow()
        updates = {
            "status": "published",
            "public_token": token,
            "published_at": now,
            "updated_at": now,
        }
        try:
            result = db.forms.update_one(conditional, {"$set": updates})
        except DuplicateKeyError:
            # Unique index caught a race; try another token.
            continue
        except PyMongoError as exc:
            raise _server_error(
                "Could not publish the form.", "publishing the form"
            ) from exc

        if result.matched_count:
            return {**form, **updates}

        # Another request published the form first. Return its result.
        try:
            current = db.forms.find_one({"_id": form_id})
        except PyMongoError as exc:
            raise _server_error(
                "Could not publish the form.", "re-reading the form"
            ) from exc
        if current is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Form not found."
            )
        if current.get("status") == "published" and current.get("public_token"):
            return current

    logger.error("Exhausted public-token attempts for form %s", form_id)
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not generate a unique public link. Please try again.",
    )


def _publish_response(form: dict[str, Any]) -> PublishResponse:
    token = form["public_token"]
    return PublishResponse(
        form_id=str(form["_id"]),
        status="published",
        public_token=token,
        public_url=build_public_url(token, settings.frontend_base_url),
        published_at=iso_utc(form.get("published_at")),
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def create_form(
    payload: FormCreate,
    db: Database = Depends(get_database),
    _admin: str = Depends(get_current_admin),
) -> dict[str, Any]:
    now = utcnow()
    document = {
        "_id": ObjectId(),
        "title": payload.title,
        "description": payload.description,
        "questions": _build_question_docs(payload.questions),
        "status": "draft",
        "created_at": now,
        "updated_at": now,
    }
    try:
        db.forms.insert_one(document)
    except PyMongoError as exc:
        raise _server_error("Could not create the form.", "creating a form") from exc
    return _serialize_admin_form(db, document)


@router.get("")
def list_forms(
    db: Database = Depends(get_database),
    _admin: str = Depends(get_current_admin),
) -> dict[str, Any]:
    try:
        forms = list(db.forms.find().sort("created_at", -1))
        counts: dict[ObjectId, int] = {}
        if forms:
            pipeline = [
                {"$match": {"form_id": {"$in": [form["_id"] for form in forms]}}},
                {"$group": {"_id": "$form_id", "count": {"$sum": 1}}},
            ]
            counts = {
                row["_id"]: row["count"] for row in db.responses.aggregate(pipeline)
            }
    except PyMongoError as exc:
        raise _server_error("Could not load forms.", "listing forms") from exc

    return {
        "forms": [
            _serialize_form_summary(form, counts.get(form["_id"], 0))
            for form in forms
        ]
    }


@router.get("/{form_id}")
def get_form(
    form_id: str,
    db: Database = Depends(get_database),
    _admin: str = Depends(get_current_admin),
) -> dict[str, Any]:
    object_id = parse_object_id(form_id, "form ID")
    try:
        form = db.forms.find_one({"_id": object_id})
    except PyMongoError as exc:
        raise _server_error("Could not load the form.", "loading a form") from exc
    if form is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Form not found."
        )
    return _serialize_admin_form(db, form)


@router.put("/{form_id}")
def update_form(
    form_id: str,
    payload: FormUpdate,
    db: Database = Depends(get_database),
    _admin: str = Depends(get_current_admin),
) -> dict[str, Any]:
    object_id = parse_object_id(form_id, "form ID")
    try:
        form = db.forms.find_one({"_id": object_id})
    except PyMongoError as exc:
        raise _server_error("Could not load the form.", "loading a form") from exc
    if form is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Form not found."
        )
    is_published = form.get("status") == "published"
    try:
        reserved_ids = _used_question_ids(db, form) if is_published else set()
    except PyMongoError as exc:
        raise _server_error("Could not update the form.", "loading answered questions") from exc

    updates = {
        "title": payload.title,
        "description": payload.description,
        "questions": _build_question_docs(payload.questions, reserved_ids),
        "updated_at": utcnow(),
    }
    # A published form is live, so its edits must stay publishable. The token
    # and link are kept, and earlier responses stay as they were submitted.
    if is_published:
        _validate_publishable(db, {**form, **updates})
        updates["removed_questions"] = _removed_questions(form, updates["questions"])
    try:
        db.forms.update_one({"_id": object_id}, {"$set": updates})
    except PyMongoError as exc:
        raise _server_error("Could not update the form.", "updating a form") from exc

    return _serialize_admin_form(db, {**form, **updates})


@router.post("/{form_id}/publish", response_model=PublishResponse)
def publish_form(
    form_id: str,
    db: Database = Depends(get_database),
    _admin: str = Depends(get_current_admin),
) -> PublishResponse:
    """Publish a draft form and return its shareable public URL.

    Re-publishing an already published form returns the same token. This keeps
    the operation idempotent and prevents existing shared links from breaking.
    """
    object_id = parse_object_id(form_id, "form ID")
    try:
        form = db.forms.find_one({"_id": object_id})
    except PyMongoError as exc:
        raise _server_error("Could not publish the form.", "loading a form") from exc
    if form is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Form not found."
        )

    if form.get("status") == "published" and form.get("public_token"):
        return _publish_response(form)

    _validate_publishable(db, form)
    published = _publish_form_document(db, form)
    return _publish_response(published)


def _response_listing(db: Database, form_id: str) -> dict[str, Any]:
    """Load a form's responses with course details, newest first."""
    object_id = parse_object_id(form_id, "form ID")
    try:
        form = db.forms.find_one({"_id": object_id})
    except PyMongoError as exc:
        raise _server_error(
            "Could not load responses.", "loading the form"
        ) from exc
    if form is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Form not found."
        )

    questions = _ordered_questions(form.get("questions") or [])
    question_order = {
        question.get("question_id"): index
        for index, question in enumerate(questions)
    }
    question_text = {
        question.get("question_id"): question.get("text", "")
        for question in [*(form.get("removed_questions") or []), *questions]
    }

    try:
        responses = list(
            db.responses.find({"form_id": object_id}).sort(
                [("submitted_at", -1), ("_id", -1)]
            )
        )
    except PyMongoError as exc:
        raise _server_error(
            "Could not load responses.", "listing responses"
        ) from exc

    # One bulk course lookup for every answer, regardless of response count.
    course_ids: set[str] = set()
    for response in responses:
        for answer in response.get("answers") or []:
            canonical = normalize_object_id(answer.get("course_id"))
            if canonical:
                course_ids.add(canonical)

    try:
        courses = (
            list(db.courses.find({"_id": {"$in": [ObjectId(cid) for cid in course_ids]}}))
            if course_ids
            else []
        )
    except PyMongoError as exc:
        raise _server_error(
            "Could not load responses.", "resolving courses"
        ) from exc
    course_map = {str(course["_id"]): course for course in courses}

    serialized_responses = []
    for response in responses:
        answers = []
        for answer in response.get("answers") or []:
            canonical = normalize_object_id(answer.get("course_id"))
            course = course_map.get(canonical) if canonical else None
            question_id = answer.get("question_id")
            answers.append(
                {
                    "question_id": question_id,
                    "question_text": question_text.get(question_id),
                    # Answered before the question was removed from the form.
                    "question_removed": question_id not in question_order,
                    "course_id": canonical,
                    "course_code": course.get("code") if course else None,
                    "course_name": course.get("name") if course else None,
                    "semester": course.get("semester") if course else None,
                }
            )
        answers.sort(
            key=lambda answer: question_order.get(answer["question_id"], 10**6)
        )
        serialized_responses.append(
            {
                "response_id": str(response["_id"]),
                "faculty_name": response.get("faculty_name", ""),
                "faculty_id": response.get("faculty_id", ""),
                "answers": answers,
                "submitted_at": iso_utc(response.get("submitted_at")),
            }
        )

    return {
        "form_id": str(form["_id"]),
        "form_title": form.get("title", ""),
        "questions": [
            {"question_id": question.get("question_id"), "text": question.get("text", "")}
            for question in questions
        ],
        "responses": serialized_responses,
        "total": len(serialized_responses),
    }


@router.get("/{form_id}/responses")
def list_responses(
    form_id: str,
    db: Database = Depends(get_database),
    _admin: str = Depends(get_current_admin),
) -> dict[str, Any]:
    return _response_listing(db, form_id)


@router.get("/{form_id}/responses/export")
def export_responses(
    form_id: str,
    tz: str | None = Query(default=None, max_length=64),
    db: Database = Depends(get_database),
    _admin: str = Depends(get_current_admin),
) -> Response:
    """Download the responses as an Excel workbook.

    ``tz`` is the admin's IANA time zone for the submission times; UTC if
    missing or unknown.
    """
    listing = _response_listing(db, form_id)
    content = responses_workbook(listing, tz)
    filename = export_filename(listing["form_title"])
    return Response(
        content=content,
        media_type=XLSX_MEDIA_TYPE,
        headers={
            "Content-Disposition": (
                f"attachment; filename=\"{filename}\"; "
                f"filename*=UTF-8''{quote(filename)}"
            )
        },
    )
