"""Seed sample courses and a demo draft form.

Run from the ``backend`` directory:

    python -m app.seed

The script is idempotent: courses are upserted by their course code and the
demo form is only created when the forms collection is empty. It never deletes
existing data.
"""

from __future__ import annotations

from bson import ObjectId

from .database import ensure_indexes, get_database
from .utils import utcnow

COURSES = [
    {"code": "CS101", "name": "Introduction to Programming", "semester": 1},
    {"code": "CS201", "name": "Data Structures", "semester": 2},
    {"code": "CS301", "name": "Database Systems", "semester": 3},
    {"code": "CS302", "name": "Operating Systems", "semester": 3},
    {"code": "CS401", "name": "Machine Learning", "semester": 4},
    {"code": "CS402", "name": "Computer Networks", "semester": 4},
    {"code": "MA201", "name": "Discrete Mathematics", "semester": 2},
    {"code": "MA301", "name": "Probability and Statistics", "semester": 3},
]


def seed() -> None:
    db = get_database()
    ensure_indexes(db, force=True)

    for course in COURSES:
        db.courses.update_one(
            {"code": course["code"]},
            {
                "$set": {
                    "code": course["code"],
                    "name": course["name"],
                    "semester": course["semester"],
                    "updated_at": utcnow(),
                },
                "$setOnInsert": {"created_at": utcnow()},
            },
            upsert=True,
        )

    if db.forms.count_documents({}) == 0:
        by_code = {
            course["code"]: course["_id"]
            for course in db.courses.find(
                {"code": {"$in": [course["code"] for course in COURSES]}}
            )
        }
        now = utcnow()
        db.forms.insert_one(
            {
                "_id": ObjectId(),
                "title": "Faculty Course Preferences - Fall 2026",
                "description": (
                    "Select one preferred course for each teaching assignment."
                ),
                "status": "draft",
                "questions": [
                    {
                        "question_id": "q1",
                        "text": "Preferred course for Semester 3 teaching",
                        "order": 1,
                        "course_ids": [
                            by_code["CS301"],
                            by_code["CS302"],
                            by_code["MA301"],
                        ],
                        "semester": None,
                    },
                    {
                        "question_id": "q2",
                        "text": "Preferred course for Semester 4 teaching",
                        "order": 2,
                        "course_ids": [by_code["CS401"], by_code["CS402"]],
                        "semester": None,
                    },
                ],
                "created_at": now,
                "updated_at": now,
            }
        )
        print("Created demo draft form: Faculty Course Preferences - Fall 2026")
    else:
        print("Forms already exist; demo form not created.")

    print(f"Courses available: {db.courses.count_documents({})}")
    print(f"Forms available: {db.forms.count_documents({})}")
    print(
        "Administrator credentials come from ADMIN_USERNAME / ADMIN_PASSWORD "
        "(see backend/.env.example)."
    )


if __name__ == "__main__":
    seed()
