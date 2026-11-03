"""Load the regulation course catalogue.

Run from the ``backend`` directory:

    python -m app.seed                 # upsert regulation courses
    python -m app.seed --prune-legacy  # also delete unused pre-regulation courses

The script is idempotent: courses are upserted by their course code, and it
never creates forms or responses. A course both
programmes teach has a joined code such as ``23Z402/23N402``; an existing
record under either code is updated in place, so forms that use it keep
working. Without
``--prune-legacy`` it never deletes anything. Open electives added by an
administrator (``source: "manual"``) are never touched.
"""

from __future__ import annotations

import argparse

from bson import ObjectId

from .database import ensure_indexes, get_database
from .regulation import PROGRAMMES, REGULATION, REGULATION_COURSES
from .utils import utcnow

# Member 2's original seed created this unique index. Courses stored here have
# no course_code field, so with that index in place only one could be inserted.
LEGACY_UNIQUE_INDEX = "course_code_1"


def _has_legacy_unique_index(db) -> bool:
    info = db.courses.index_information().get(LEGACY_UNIQUE_INDEX)
    return bool(info and info.get("unique"))


def _existing_course(db, course: dict) -> dict | None:
    """The stored record for a regulation course, under any of its codes.

    Also matches records written by Member 2's original seed, which stored the
    code as course_code; they gain code/name in place. A record already under
    the joined code wins over one under a single programme's code. Open
    electives an administrator added are never matched.
    """
    codes = [course["code"], *course["codes"]]
    matches = list(
        db.courses.find(
            {
                "source": {"$ne": "manual"},
                "$or": [
                    {"code": {"$in": codes}},
                    {"course_code": {"$in": codes}},
                    {"codes": {"$in": course["codes"]}},
                ],
            }
        )
    )
    matches.sort(key=lambda found: found.get("code") != course["code"])
    return matches[0] if matches else None


def upsert_regulation_courses(db) -> int:
    for course in REGULATION_COURSES:
        now = utcnow()
        existing = _existing_course(db, course)
        db.courses.update_one(
            {"_id": existing["_id"] if existing else ObjectId()},
            {
                "$set": {
                    **course,
                    "regulation": REGULATION,
                    "source": "regulation",
                    "updated_at": now,
                },
                # Records seeded before CSE courses were added had one programme.
                "$unset": {"programme": ""},
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )
    return len(REGULATION_COURSES)


def legacy_courses(db) -> list[dict]:
    """Courses from before the regulation import (no ``source`` field)."""
    regulation_codes = [
        code for course in REGULATION_COURSES for code in [course["code"], *course["codes"]]
    ]
    return list(
        db.courses.find(
            {"source": {"$exists": False}, "code": {"$nin": regulation_codes}}
        ).sort("code", 1)
    )


def prune_legacy_courses(db) -> tuple[list[str], list[str]]:
    """Delete legacy courses no form references; return (deleted, kept) codes."""
    referenced = {
        course_id
        for form in db.forms.find({}, {"questions.course_ids": 1})
        for question in form.get("questions") or []
        for course_id in question.get("course_ids") or []
    }
    deleted: list[str] = []
    kept: list[str] = []
    for course in legacy_courses(db):
        label = course.get("code") or str(course["_id"])
        if course["_id"] in referenced:
            kept.append(label)
        else:
            db.courses.delete_one({"_id": course["_id"]})
            deleted.append(label)
    return deleted, kept


def seed(*, prune_legacy: bool = False) -> None:
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

    count = upsert_regulation_courses(db)
    print(
        f"Upserted {count} courses from the {REGULATION} regulations "
        f"({', '.join(PROGRAMMES)})."
    )

    if prune_legacy:
        deleted, kept = prune_legacy_courses(db)
        if deleted:
            print(f"Deleted unused pre-regulation courses: {', '.join(deleted)}")
        if kept:
            print(
                "Kept pre-regulation courses still used by a form: "
                + ", ".join(kept)
            )
    else:
        leftover = [course.get("code") or str(course["_id"]) for course in legacy_courses(db)]
        if leftover:
            print(
                "Courses not in the regulation (rerun with --prune-legacy to "
                f"delete the unused ones): {', '.join(leftover)}"
            )

    print(f"Courses available: {db.courses.count_documents({})}")
    print(f"Forms available: {db.forms.count_documents({})}")
    print(
        "Administrator credentials come from ADMIN_USERNAME and "
        "ADMIN_PASSWORD_HASH (or ADMIN_PASSWORD); see backend/.env.example."
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--prune-legacy",
        action="store_true",
        help="delete pre-regulation courses that no form references",
    )
    seed(prune_legacy=parser.parse_args().prune_legacy)
