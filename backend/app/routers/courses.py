"""Course catalogue endpoints.

Read-only catalogue for the administrator form builder, with the semester
filter and database-unavailable handling from Member 2's original course API
(member2/course_routes.py). Courses are seeded with ``python -m app.seed``.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pymongo.database import Database
from pymongo.errors import ConnectionFailure, PyMongoError

from ..database import get_database
from ..schemas import CourseListResponse
from ..security import get_current_admin
from ..utils import serialize_course

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/courses", tags=["courses"])


@router.get("", response_model=CourseListResponse)
def list_courses(
    semester: int | None = Query(default=None, ge=1, le=20),
    db: Database = Depends(get_database),
    _admin: str = Depends(get_current_admin),
) -> dict:
    query = {} if semester is None else {"semester": semester}
    try:
        courses = list(db.courses.find(query).sort([("semester", 1), ("code", 1)]))
    except ConnectionFailure as exc:
        logger.error("MongoDB unavailable while loading courses: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to retrieve courses. Check the database connection.",
        ) from exc
    except PyMongoError as exc:
        logger.exception("Failed to load courses")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not load courses.",
        ) from exc

    return {"courses": [serialize_course(course) for course in courses]}
