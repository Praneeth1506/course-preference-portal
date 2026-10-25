
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Query
from pymongo import MongoClient

from member2.course_schema import CourseResponse

load_dotenv(Path(__file__).with_name(".env"))

MONGODB_URL = os.getenv("MONGODB_URL")
DATABASE_NAME = os.getenv(
    "DATABASE_NAME",
    "course_preference_portal"
)

client = (
    MongoClient(MONGODB_URL, serverSelectionTimeoutMS=5000)
    if MONGODB_URL
    else None
)

db = client[DATABASE_NAME] if client else None
courses_collection = db["courses"] if db is not None else None

router = APIRouter(
    prefix="/api/courses",
    tags=["Courses"]
)


def format_course(course):
    return {
        "id": str(course["_id"]),
        "course_code": course["course_code"],
        "course_name": course["course_name"],
        "semester": course["semester"]
    }


@router.get("/", response_model=list[CourseResponse])
def get_courses(
    semester: int | None = Query(default=None, ge=1, le=8)
):
    if courses_collection is None:
        raise HTTPException(
            status_code=503,
            detail="Database configuration is missing."
        )

    try:
        client.admin.command("ping")

        query = {}
        if semester is not None:
            query["semester"] = semester

        results = courses_collection.find(query).sort(
            "course_code", 1
        )

        return [format_course(course) for course in results]

    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail="Unable to retrieve courses. Check your Atlas connection."
        ) from error
