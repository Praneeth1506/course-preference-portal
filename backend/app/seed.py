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

# Department courses from Member 2's member2/seed_courses.py, converted from
# its course_code / course_name fields to this collection's code / name.
MEMBER2_COURSES = [
    {"code": "23N501", "name": "Machine Learning", "semester": 5},
    {"code": "23N502", "name": "Database Management Systems", "semester": 5},
    {"code": "23N503", "name": "Operating Systems", "semester": 5},
    {"code": "23N504", "name": "Computer Networks", "semester": 5},
    {"code": "23N401", "name": "Data Structures", "semester": 4},
    {"code": "23N402", "name": "Design and Analysis of Algorithms", "semester": 4},
    {"code": "23N301", "name": "Object Oriented Programming", "semester": 3},
    {"code": "23N302", "name": "Computer Organization", "semester": 3},
]

# Member 2's original seed created this unique index. Courses stored here have
# no course_code field, so with that index in place only one could be inserted.
LEGACY_UNIQUE_INDEX = "course_code_1"


def _has_legacy_unique_index(db) -> bool:
    info = db.courses.index_information().get(LEGACY_UNIQUE_INDEX)
    return bool(info and info.get("unique"))


def seed() -> None:
    db = get_database()
    if _has_legacy_unique_index(db):
        raise SystemExit(
            f"The courses collection has the unique index '{LEGACY_UNIQUE_INDEX}' "
            "from Member 2's original seed script, which blocks courses stored "
            "with the code/name fields. Remove it once (no documents are "
            "deleted) and rerun this seed:\n"
            f"    db.courses.dropIndex('{LEGACY_UNIQUE_INDEX}')"
        )
    ensure_indexes(db, force=True)

    for course in COURSES + MEMBER2_COURSES:
        db.courses.update_one(
            # Also match records written by Member 2's original seed, which
            # stored the code as course_code; they gain code/name in place.
            {"$or": [{"code": course["code"]}, {"course_code": course["code"]}]},
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
        "Administrator credentials come from ADMIN_USERNAME and "
        "ADMIN_PASSWORD_HASH (or ADMIN_PASSWORD); see backend/.env.example."
    )


if __name__ == "__main__":
    seed()
