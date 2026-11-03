"""Course catalogue: API contract, semester filter, and regulation seed data."""

from __future__ import annotations

from collections import Counter

import pytest
from bson import ObjectId
from pymongo.errors import ServerSelectionTimeoutError

from app import seed as seed_module
from app.database import get_database
from app.main import app
from app.regulation import AIML, CSE, REGULATION_COURSES
from tests.utils import insert_course, insert_form, question_doc


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
                "category": None,
                "credits": None,
                "elective_group": None,
                "offered_by": None,
                "source": None,
                "programmes": [],
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


class _NoStoredPassword:
    def find_one(self, *args, **kwargs):
        return None


class _UnreachableDatabase:
    # The token check reads admin_credentials; only courses is unreachable.
    admin_credentials = _NoStoredPassword()
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


def test_seed_loads_regulation_courses_and_is_repeatable(seed_db):
    seed_module.seed()
    seed_module.seed()

    assert seed_db.courses.count_documents({}) == len(REGULATION_COURSES)
    assert seed_db.forms.count_documents({}) == 0  # the seed never creates forms
    course = seed_db.courses.find_one({"code": "23N501"})
    assert (course["name"], course["semester"], course["category"]) == (
        "Machine Learning -2",
        5,
        "PC",
    )
    assert (course["credits"], course["regulation"], course["source"]) == (
        4,
        "2023",
        "regulation",
    )
    assert course["programmes"] == [AIML]


def test_courses_both_programmes_teach_identically_share_one_record(seed_db):
    seed_module.seed()

    shared = seed_db.courses.find_one({"code": "23Z402/23N402"})
    assert (shared["name"], shared["semester"], shared["credits"]) == (
        "Database Management Systems",
        4,
        3,
    )
    assert shared["codes"] == ["23Z402", "23N402"]
    assert shared["programmes"] == [CSE, AIML]
    # Same code in both programmes: no joined code.
    assert seed_db.courses.find_one({"code": "23G105"})["programmes"] == [CSE, AIML]
    # Electives may be numbered differently in each programme.
    assert seed_db.courses.find_one({"code": "23Z017/23N020"})["name"] == "Generative AI"
    assert seed_db.courses.count_documents({"codes": "23N402"}) == 1


def test_same_name_with_different_semester_or_credits_stays_separate(seed_db):
    seed_module.seed()

    cse = seed_db.courses.find_one({"code": "23Z501"})
    aiml = seed_db.courses.find_one({"code": "23N404"})
    assert cse["name"] == aiml["name"] == "Operating Systems"
    assert (cse["semester"], cse["credits"], cse["programmes"]) == (5, 3, [CSE])
    assert (aiml["semester"], aiml["credits"], aiml["programmes"]) == (4, 4, [AIML])


def test_regulation_electives_have_no_fixed_semester(seed_db):
    seed_module.seed()

    elective = seed_db.courses.find_one({"code": "23Z017/23N020"})
    assert (elective["name"], elective["category"], elective["semester"]) == (
        "Generative AI",
        "PE",
        None,
    )
    # 23ZO01-04 are shared; 23NO03 and 23NO04 are AI&ML only.
    assert seed_db.courses.count_documents({"category": "OE"}) == 6
    assert seed_db.courses.find_one({"code": "23IP15"}) is None


@pytest.mark.parametrize(
    "programme, expected",
    [
        (CSE, {"HS": 10, "BS": 29, "ES": 28, "PC": 58, "EEC": 15, "MC": 0}),
        (AIML, {"HS": 10, "BS": 29, "ES": 26, "PC": 60, "EEC": 15, "MC": 0}),
    ],
)
def test_regulation_core_credits_match_the_credit_summary(programme, expected):
    totals = Counter()
    for course in REGULATION_COURSES:
        if course["elective_group"] is None and programme in course["programmes"]:
            totals[course["category"]] += course["credits"]
    # Each regulation's "Summary of Credit Distribution", less the one
    # two-credit language elective slot in Semester II.
    assert totals == expected


def test_regulation_codes_are_unique():
    codes = [code for course in REGULATION_COURSES for code in course["codes"]]
    assert len(codes) == len(set(codes))


def test_seed_migrates_member2_legacy_records_in_place(seed_db):
    legacy_id = seed_db.courses.insert_one(
        {"course_code": "23N501", "course_name": "Machine Learning", "semester": 5}
    ).inserted_id

    seed_module.seed()

    migrated = seed_db.courses.find_one({"_id": legacy_id})
    assert (migrated["code"], migrated["name"]) == ("23N501", "Machine Learning -2")
    assert seed_db.courses.count_documents({"$or": [{"code": "23N501"}, {"course_code": "23N501"}]}) == 1


def test_seed_joins_codes_on_earlier_single_programme_records(seed_db):
    # Seeded before CSE courses were added; a form already uses it.
    earlier = seed_db.courses.insert_one(
        {
            "code": "23N402",
            "name": "Database Management Systems",
            "semester": 4,
            "programme": AIML,
            "source": "regulation",
        }
    ).inserted_id
    insert_form(seed_db, questions=[question_doc("q1", [earlier])])

    seed_module.seed()

    updated = seed_db.courses.find_one({"_id": earlier})
    assert updated["code"] == "23Z402/23N402"
    assert updated["programmes"] == [CSE, AIML]
    assert "programme" not in updated
    assert seed_db.courses.count_documents({"codes": "23Z402"}) == 1


def test_seed_keeps_legacy_courses_unless_pruning(seed_db, capsys):
    unused = insert_course(seed_db, "CS101", "Introduction to Programming", 1)
    used = insert_course(seed_db, "CS301", "Database Systems", 3)
    insert_form(seed_db, questions=[question_doc("q1", [used])])

    seed_module.seed()
    assert "CS101, CS301" in capsys.readouterr().out
    assert seed_db.courses.find_one({"_id": unused}) is not None

    seed_module.seed(prune_legacy=True)
    output = capsys.readouterr().out
    assert seed_db.courses.find_one({"_id": unused}) is None
    assert seed_db.courses.find_one({"_id": used}) is not None
    assert "Deleted unused pre-regulation courses: CS101" in output
    assert "still used by a form: CS301" in output


def test_seed_never_prunes_manual_open_electives(seed_db):
    manual = seed_db.courses.insert_one(
        {"code": "23MO01", "name": "Manual OE", "category": "OE", "source": "manual"}
    ).inserted_id

    seed_module.seed(prune_legacy=True)

    assert seed_db.courses.find_one({"_id": manual}) is not None


def test_seed_never_takes_over_a_manual_course_with_a_regulation_code(seed_db):
    manual = seed_db.courses.insert_one(
        {"code": "23ZO01", "name": "Added by hand", "category": "OE", "source": "manual"}
    ).inserted_id

    seed_module.seed()

    assert seed_db.courses.find_one({"_id": manual})["name"] == "Added by hand"
    assert seed_db.courses.find_one({"code": "23ZO01/23NO01"}) is not None


def test_seed_refuses_with_member2_unique_index(seed_db):
    seed_db.courses.create_index("course_code", unique=True)

    with pytest.raises(SystemExit, match="dropIndex\\('course_code_1'\\)"):
        seed_module.seed()

    assert seed_db.courses.count_documents({}) == 0
