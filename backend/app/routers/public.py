"""Public (unauthenticated) form retrieval and response submission.

These endpoints are keyed exclusively by the published form's random public
token. A form ID supplied by the browser is never trusted as a substitute for
the token, and unpublished forms are indistinguishable from unknown tokens.
"""

from __future__ import annotations

import logging
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pymongo.database import Database
from pymongo.errors import PyMongoError

from ..database import get_database
from ..schemas import FacultyResponseInput
from ..utils import (
    iso_utc,
    normalize_object_id,
    serialize_course,
    utcnow,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/public/forms", tags=["public"])

HTTP_422 = getattr(status, "HTTP_422_UNPROCESSABLE_CONTENT", 422)


def _not_found() -> HTTPException:
    # Deliberately identical for unknown tokens and unpublished forms so the
    # endpoint cannot be used to discover drafts.
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Form not found or not published.",
    )


def _server_error(detail: str, action: str) -> HTTPException:
    logger.exception("Database error while %s", action)
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=detail
    )


def _find_published_form(db: Database, token: str) -> dict[str, Any]:
    token = (token or "").strip()
    if not token:
        raise _not_found()
    try:
        form = db.forms.find_one({"public_token": token, "status": "published"})
    except PyMongoError as exc:
        raise _server_error("Could not load the form.", "loading a public form") from exc
    if form is None:
        raise _not_found()
    return form


def _ordered_questions(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def sort_key(pair: tuple[int, dict[str, Any]]) -> tuple[int, int]:
        index, question = pair
        order = question.get("order")
        return (order if isinstance(order, int) else index + 1, index)

    return [question for _, question in sorted(enumerate(questions), key=sort_key)]


def _course_map(
    db: Database, questions: list[dict[str, Any]]
) -> dict[str, dict[str, Any]]:
    ids: set[str] = set()
    for question in questions:
        for raw in question.get("course_ids") or []:
            canonical = normalize_object_id(raw)
            if canonical:
                ids.add(canonical)
    if not ids:
        return {}
    try:
        courses = db.courses.find({"_id": {"$in": [ObjectId(cid) for cid in ids]}})
    except PyMongoError as exc:
        raise _server_error("Could not load the form.", "loading form courses") from exc
    return {str(course["_id"]): course for course in courses}


@router.get("/{token}")
def get_public_form(
    token: str,
    db: Database = Depends(get_database),
) -> dict[str, Any]:
    """Return a published form for faculty, without authentication."""
    form = _find_published_form(db, token)
    questions = _ordered_questions(form.get("questions") or [])
    course_map = _course_map(db, questions)

    serialized_questions = []
    for question in questions:
        courses = []
        for raw in question.get("course_ids") or []:
            canonical = normalize_object_id(raw)
            course = course_map.get(canonical) if canonical else None
            # A course deleted after publication is silently omitted; the rest
            # of the form remains usable.
            if course is not None:
                courses.append(serialize_course(course))
        serialized_questions.append(
            {
                "question_id": question.get("question_id"),
                "text": question.get("text", ""),
                "order": question.get("order"),
                "semester": question.get("semester"),
                "courses": courses,
            }
        )

    return {
        "form_id": str(form["_id"]),
        "title": form.get("title", ""),
        "description": form.get("description"),
        "questions": serialized_questions,
    }


@router.post("/{token}/responses", status_code=status.HTTP_201_CREATED)
def submit_response(
    token: str,
    payload: FacultyResponseInput,
    db: Database = Depends(get_database),
) -> dict[str, Any]:
    """Validate and store one faculty member's course preferences."""
    form = _find_published_form(db, token)
    questions = _ordered_questions(form.get("questions") or [])
    if not questions:
        raise HTTPException(
            status_code=HTTP_422,
            detail="This form has no questions and cannot accept responses.",
        )

    # Reject duplicate/unknown/missing question IDs before doing course work.
    submitted_by_question: dict[str, Any] = {}
    for answer in payload.answers:
        if answer.question_id in submitted_by_question:
            raise HTTPException(
                status_code=HTTP_422,
                detail=f"Duplicate answer for question {answer.question_id}.",
            )
        submitted_by_question[answer.question_id] = answer

    expected_ids = [str(question.get("question_id")) for question in questions]
    expected_set = set(expected_ids)
    submitted_set = set(submitted_by_question)

    unexpected = sorted(submitted_set - expected_set)
    if unexpected:
        raise HTTPException(
            status_code=HTTP_422,
            detail=f"Unexpected question answer: {unexpected[0]}.",
        )

    missing = [qid for qid in expected_ids if qid not in submitted_set]
    if missing:
        raise HTTPException(
            status_code=HTTP_422,
            detail=f"Missing answer for question {missing[0]}.",
        )

    selected_course_ids: set[str] = set()
    answer_documents: list[dict[str, Any]] = []

    for question in questions:
        question_id = str(question.get("question_id"))
        answer = submitted_by_question[question_id]

        canonical_course_id = normalize_object_id(answer.course_id)
        if canonical_course_id is None:
            raise HTTPException(
                status_code=HTTP_422,
                detail=f"Invalid course selected for question {question_id}.",
            )

        allowed_course_ids = {
            canonical
            for canonical in (
                normalize_object_id(raw) for raw in question.get("course_ids") or []
            )
            if canonical
        }
        if canonical_course_id not in allowed_course_ids:
            raise HTTPException(
                status_code=HTTP_422,
                detail=(
                    f"The selected course is not available for question "
                    f"{question_id}."
                ),
            )

        if canonical_course_id in selected_course_ids:
            raise HTTPException(
                status_code=HTTP_422,
                detail="The same course cannot be selected for multiple questions.",
            )
        selected_course_ids.add(canonical_course_id)

        answer_documents.append(
            {
                "question_id": question_id,
                "course_id": ObjectId(canonical_course_id),
            }
        )

    # Confirm every selected course still exists and satisfies any per-question
    # semester restriction. This closes the gap between publish-time validation
    # and a course later being deleted or changed.
    try:
        courses = list(
            db.courses.find(
                {
                    "_id": {
                        "$in": [ObjectId(cid) for cid in selected_course_ids]
                    }
                }
            )
        )
    except PyMongoError as exc:
        raise _server_error(
            "Could not submit preferences.", "loading selected courses"
        ) from exc

    course_map = {str(course["_id"]): course for course in courses}
    if len(course_map) != len(selected_course_ids):
        raise HTTPException(
            status_code=HTTP_422,
            detail="One or more selected courses are no longer available.",
        )

    for question in questions:
        semester = question.get("semester")
        if semester is None:
            continue
        question_id = str(question.get("question_id"))
        selected = submitted_by_question[question_id]
        canonical = normalize_object_id(selected.course_id)
        if course_map[canonical].get("semester") != semester:
            raise HTTPException(
                status_code=HTTP_422,
                detail=(
                    f"The selected course does not satisfy the semester "
                    f"restriction for question {question_id}."
                ),
            )

    submitted_at = utcnow()
    document = {
        "_id": ObjectId(),
        "form_id": form["_id"],
        "faculty_name": payload.faculty_name,
        "faculty_id": payload.faculty_id,
        "answers": answer_documents,
        "submitted_at": submitted_at,
    }
    try:
        db.responses.insert_one(document)
    except PyMongoError as exc:
        raise _server_error("Could not submit preferences.", "saving a response") from exc

    return {
        "message": "Course preferences submitted successfully",
        "response_id": str(document["_id"]),
        "submitted_at": iso_utc(submitted_at),
    }
