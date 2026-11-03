"""Course catalogue endpoints.

The catalogue is loaded from the 2023 regulations with ``python -m app.seed``
(see ``app/regulation.py``) and is read-only through the API, with one
exception: open electives, often offered by other departments, are entered by
an administrator here and stored with ``category: "OE"`` and
``source: "manual"``. They are ordinary courses, so the form builder lists them
alongside the rest of the catalogue.

The semester filter and database-unavailable handling come from Member 2's
original course API (member2/course_routes.py).
"""

from __future__ import annotations

import logging
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pymongo.database import Database
from pymongo.errors import ConnectionFailure, PyMongoError

from ..database import get_database
from ..regulation import CATEGORY_LABELS
from ..schemas import CourseListResponse, CourseResponse, OpenElectiveInput
from ..security import get_current_admin
from ..utils import parse_object_id, serialize_catalogue_course, utcnow

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/courses", tags=["courses"])


def _server_error(detail: str, action: str) -> HTTPException:
    logger.exception("Database error while %s", action)
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=detail
    )


@router.get("", response_model=CourseListResponse)
def list_courses(
    semester: int | None = Query(default=None, ge=1, le=20),
    category: str | None = Query(default=None, max_length=10),
    db: Database = Depends(get_database),
    _admin: str = Depends(get_current_admin),
) -> dict:
    query: dict[str, Any] = {}
    if semester is not None:
        query["semester"] = semester
    if category is not None:
        category = category.strip().upper()
        if category not in CATEGORY_LABELS:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown category. Use one of: {', '.join(CATEGORY_LABELS)}.",
            )
        query["category"] = category
    try:
        courses = list(db.courses.find(query).sort([("semester", 1), ("code", 1)]))
    except ConnectionFailure as exc:
        logger.error("MongoDB unavailable while loading courses: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to retrieve courses. Check the database connection.",
        ) from exc
    except PyMongoError as exc:
        raise _server_error("Could not load courses.", "listing courses") from exc

    return {"courses": [serialize_catalogue_course(course) for course in courses]}


def _ensure_code_available(
    db: Database, code: str, exclude_id: ObjectId | None = None
) -> None:
    # A course both programmes teach is stored as e.g. "23Z402/23N402" with
    # each code in ``codes``, so "23N402" alone is also taken.
    query: dict[str, Any] = {
        "$or": [{"code": code}, {"course_code": code}, {"codes": code}]
    }
    if exclude_id is not None:
        query["_id"] = {"$ne": exclude_id}
    if db.courses.find_one(query) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A course with code {code} already exists.",
        )


def _load_manual_elective(db: Database, course_id: str) -> dict[str, Any]:
    object_id = parse_object_id(course_id, "course ID")
    try:
        course = db.courses.find_one({"_id": object_id})
    except PyMongoError as exc:
        raise _server_error("Could not load the course.", "loading a course") from exc
    if course is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course not found."
        )
    if course.get("category") != "OE" or course.get("source") != "manual":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Only manually added open electives can be changed here. "
                "Regulation courses are updated with python -m app.seed."
            ),
        )
    return course


def _forms_using(
    db: Database, course_id: ObjectId, *, published_only: bool = False
) -> list[str]:
    query: dict[str, Any] = {"questions.course_ids": course_id}
    if published_only:
        query["status"] = "published"
    return [form.get("title") or str(form["_id"]) for form in db.forms.find(query)]


@router.post(
    "/open-electives",
    response_model=CourseResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_open_elective(
    payload: OpenElectiveInput,
    db: Database = Depends(get_database),
    _admin: str = Depends(get_current_admin),
) -> dict[str, Any]:
    try:
        _ensure_code_available(db, payload.course_code)
        now = utcnow()
        document = {
            "_id": ObjectId(),
            "code": payload.course_code,
            "name": payload.course_name,
            "semester": payload.semester,
            "category": "OE",
            "credits": payload.credits,
            "elective_group": "Open Elective",
            "offered_by": payload.offered_by,
            "source": "manual",
            "created_at": now,
            "updated_at": now,
        }
        db.courses.insert_one(document)
    except PyMongoError as exc:
        raise _server_error(
            "Could not add the open elective.", "creating an open elective"
        ) from exc
    return serialize_catalogue_course(document)


@router.put("/open-electives/{course_id}", response_model=CourseResponse)
def update_open_elective(
    course_id: str,
    payload: OpenElectiveInput,
    db: Database = Depends(get_database),
    _admin: str = Depends(get_current_admin),
) -> dict[str, Any]:
    course = _load_manual_elective(db, course_id)
    try:
        _ensure_code_available(db, payload.course_code, exclude_id=course["_id"])
        if payload.semester != course.get("semester"):
            # A published question may be restricted to the old semester, and
            # submissions are re-validated against it.
            published = _forms_using(db, course["_id"], published_only=True)
            if published:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "The semester cannot change while published forms use "
                        f"this course: {', '.join(published)}."
                    ),
                )
        updates = {
            "code": payload.course_code,
            "name": payload.course_name,
            "semester": payload.semester,
            "credits": payload.credits,
            "offered_by": payload.offered_by,
            "updated_at": utcnow(),
        }
        db.courses.update_one({"_id": course["_id"]}, {"$set": updates})
    except PyMongoError as exc:
        raise _server_error(
            "Could not update the open elective.", "updating an open elective"
        ) from exc
    return serialize_catalogue_course({**course, **updates})


@router.delete(
    "/open-electives/{course_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_open_elective(
    course_id: str,
    db: Database = Depends(get_database),
    _admin: str = Depends(get_current_admin),
) -> Response:
    course = _load_manual_elective(db, course_id)
    try:
        used_by = _forms_using(db, course["_id"])
        if used_by:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "This open elective is used in: "
                    f"{', '.join(used_by)}. Remove it from those forms first."
                ),
            )
        db.courses.delete_one({"_id": course["_id"]})
    except PyMongoError as exc:
        raise _server_error(
            "Could not delete the open elective.", "deleting an open elective"
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
