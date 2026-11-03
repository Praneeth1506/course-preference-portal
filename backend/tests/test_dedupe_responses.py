"""The one-off clean-up of duplicate responses saved before the one-per-faculty rule."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from bson import ObjectId

from scripts.dedupe_responses import apply, plan


def legacy_response(db, form_id, faculty_id, minutes, name="Faculty"):
    start = datetime(2026, 10, 1, tzinfo=timezone.utc)
    return db.responses.insert_one(
        {
            "form_id": form_id,
            "faculty_name": name,
            "faculty_id": faculty_id,
            "answers": [],
            "submitted_at": start + timedelta(minutes=minutes),
        }
    ).inserted_id


def test_keeps_first_response_per_faculty_and_form(db):
    form_a, form_b = ObjectId(), ObjectId()
    legacy_response(db, form_a, " fac001", 10)
    first = legacy_response(db, form_a, "FAC001", 0, name="First")
    legacy_response(db, form_a, "FAC001", 5)
    other_form = legacy_response(db, form_b, "FAC001", 1)

    changes = plan(db)
    assert sum(len(later) for _, later in changes) == 2
    assert db.responses.count_documents({}) == 4  # planning writes nothing

    apply(db, changes)

    assert db.responses.count_documents({}) == 2
    kept = db.responses.find_one({"_id": first})
    assert (kept["faculty_name"], kept["faculty_id_key"]) == ("First", "fac001")
    assert db.responses.find_one({"_id": other_form})["faculty_id_key"] == "fac001"
    assert plan(db) == []
