"""Course catalogue endpoints.

The repository had no existing course module, so this supplies the minimal
read-only catalogue needed by the administrator form builder. Courses are
seeded with ``python -m app.seed``.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pymongo.database import Database
from pymongo.errors import PyMongoError

from ..database import get_database
from ..security import get_current_admin
from ..utils import serialize_course

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/courses", tags=["courses"])


@router.get("")
def list_courses(
    db: Database = Depends(get_database),
    _admin: str = Depends(get_current_admin),
) -> dict:
    try:
        courses = list(db.courses.find().sort([("semester", 1), ("code", 1)]))
    except PyMongoError as exc:
        logger.exception("Failed to load courses")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not load courses.",
        ) from exc

    return {"courses": [serialize_course(course) for course in courses]}
