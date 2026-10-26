"""Course catalogue: API contract, semester filter, and seed data (Member 2 integration)."""

from __future__ import annotations

import pytest
from bson import ObjectId
from pymongo.errors import ServerSelectionTimeoutError

from app import seed as seed_module
from app.database import get_database
from app.main import app
from tests.utils import insert_course


def test_course_fields_and_id_serialization(client, db, admin_headers):
    course_id = insert_course(db, "23N501", "Machine Learning", 5)

    response = client.get("/api/courses", headers=admin_headers)

    assert response.status_code == 200
    assert response.json() == {
        "courses": [
            {
                "course_id": str(course_id),
                "course_code": "23N501",
                "course_name": "Machine Learning",
                "semester": 5,
            }
        ]
    }


def test_courses_can_be_filtered_by_semester(client, db, admin_headers):
    insert_course(db, "CS301", "Databases", 3)
    insert_course(db, "CS302", "Operating Systems", 3)
    insert_course(db, "CS401", "Machine Learning", 4)

    response = client.get("/api/courses?semester=3", headers=admin_headers)

    assert response.status_code == 200
    assert [c["course_code"] for c in response.json()["courses"]] == ["CS301", "CS302"]


@pytest.mark.parametrize("value", ["0", "21", "abc"])
def test_invalid_semester_filter_rejected(client, admin_headers, value):
    response = client.get(f"/api/courses?semester={value}", headers=admin_headers)

    assert response.status_code == 422


def test_courses_require_admin_token(client):
    assert client.get("/api/courses").status_code == 401


def test_course_ids_are_accepted_by_form_creation(client, db, admin_headers):
    insert_course(db, "23N501", "Machine Learning", 5)
    insert_course(db, "23N502", "DBMS", 5)
    ids = [c["course_id"] for c in client.get("/api/courses", headers=admin_headers).json()["courses"]]

    response = client.post(
        "/api/forms",
        headers=admin_headers,
        json={"title": "T", "questions": [{"text": "Q1", "course_ids": ids}]},
    )

    assert response.status_code == 201
    stored = db.forms.find_one({"_id": ObjectId(response.json()["form_id"])})
    assert stored["questions"][0]["course_ids"] == [ObjectId(i) for i in ids]


class _UnreachableCollection:
    def find(self, *args, **kwargs):
        raise ServerSelectionTimeoutError("down")


class _UnreachableDatabase:
    courses = _UnreachableCollection()


def test_database_unavailable_returns_503(client, admin_headers):
    app.dependency_overrides[get_database] = lambda: _UnreachableDatabase()

    response = client.get("/api/courses", headers=admin_headers)

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Unable to retrieve courses. Check the database connection."
    }


@pytest.fixture
def seed_db(db, monkeypatch):
    monkeypatch.setattr(seed_module, "get_database", lambda: db)
    return db


def test_seed_loads_member2_courses_and_is_repeatable(seed_db, capsys):
    seed_module.seed()
    seed_module.seed()

    expected = len(seed_module.COURSES) + len(seed_module.MEMBER2_COURSES)
    assert seed_db.courses.count_documents({}) == expected
    assert seed_db.forms.count_documents({}) == 1
    course = seed_db.courses.find_one({"code": "23N501"})
    assert (course["name"], course["semester"]) == ("Machine Learning", 5)


def test_seed_migrates_member2_legacy_records_in_place(seed_db):
    legacy_id = seed_db.courses.insert_one(
        {"course_code": "23N501", "course_name": "Machine Learning", "semester": 5}
    ).inserted_id

    seed_module.seed()

    migrated = seed_db.courses.find_one({"_id": legacy_id})
    assert (migrated["code"], migrated["name"]) == ("23N501", "Machine Learning")
    assert seed_db.courses.count_documents({"$or": [{"code": "23N501"}, {"course_code": "23N501"}]}) == 1


def test_seed_refuses_with_member2_unique_index(seed_db):
    seed_db.courses.create_index("course_code", unique=True)

    with pytest.raises(SystemExit, match="dropIndex\\('course_code_1'\\)"):
        seed_module.seed()

    assert seed_db.courses.count_documents({}) == 0
