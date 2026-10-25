"""Validation and storage tests for public response submission."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from bson import ObjectId

from tests.utils import create_form, insert_course, insert_form, publish_form, question_doc


@pytest.fixture
def setup(client, db, admin_headers):
    first = insert_course(db, "CS101", "Programming", 1)
    second = insert_course(db, "CS102", "Data Structures", 1)
    third = insert_course(db, "CS301", "Databases", 3)
    fourth = insert_course(db, "CS302", "Operating Systems", 3)

    form = create_form(
        client,
        admin_headers,
        title="Faculty Preferences",
        questions=[
            question_doc("q1", [first, second]),
            question_doc("q2", [third, fourth]),
        ],
    )
    published = publish_form(client, admin_headers, form["form_id"])
    return SimpleNamespace(
        token=published["public_token"],
        form_id=form["form_id"],
        first=first,
        second=second,
        third=third,
        fourth=fourth,
    )


def valid_payload(setup, **overrides):
    payload = {
        "faculty_name": "Demo Faculty",
        "faculty_id": "FAC001",
        "answers": [
            {"question_id": "q1", "course_id": str(setup.first)},
            {"question_id": "q2", "course_id": str(setup.third)},
        ],
    }
    payload.update(overrides)
    return payload


def assert_not_inserted(db):
    assert db.responses.count_documents({}) == 0


def test_valid_response_is_saved(client, db, setup):
    response = client.post(
        f"/api/public/forms/{setup.token}/responses", json=valid_payload(setup)
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["message"] == "Course preferences submitted successfully"
    assert ObjectId.is_valid(body["response_id"])
    assert body["submitted_at"].endswith("Z")

    stored = db.responses.find_one({"_id": ObjectId(body["response_id"])})
    assert stored["form_id"] == ObjectId(setup.form_id)
    assert stored["faculty_name"] == "Demo Faculty"
    assert stored["faculty_id"] == "FAC001"
    assert stored["submitted_at"] is not None
    assert [answer["question_id"] for answer in stored["answers"]] == ["q1", "q2"]
    assert stored["answers"][0]["course_id"] == setup.first
    assert stored["answers"][1]["course_id"] == setup.third


def test_faculty_fields_are_trimmed(client, db, setup):
    payload = valid_payload(setup)
    payload["faculty_name"] = "   Demo Faculty   "
    payload["faculty_id"] = "  FAC001\t"
    response = client.post(
        f"/api/public/forms/{setup.token}/responses", json=payload
    )
    assert response.status_code == 201
    stored = db.responses.find_one({})
    assert stored["faculty_name"] == "Demo Faculty"
    assert stored["faculty_id"] == "FAC001"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("faculty_name", ""),
        ("faculty_name", "   "),
        ("faculty_id", ""),
        ("faculty_id", " \n\t "),
    ],
)
def test_blank_faculty_fields_are_rejected(client, db, setup, field, value):
    payload = valid_payload(setup, **{field: value})
    response = client.post(
        f"/api/public/forms/{setup.token}/responses", json=payload
    )
    assert response.status_code == 422
    assert_not_inserted(db)


def test_missing_faculty_name_is_rejected(client, db, setup):
    payload = valid_payload(setup)
    payload.pop("faculty_name")
    response = client.post(
        f"/api/public/forms/{setup.token}/responses", json=payload
    )
    assert response.status_code == 422
    assert any(
        "faculty_name" in error.get("loc", []) for error in response.json()["detail"]
    )
    assert_not_inserted(db)


def test_missing_faculty_id_is_rejected(client, db, setup):
    payload = valid_payload(setup)
    payload.pop("faculty_id")
    response = client.post(
        f"/api/public/forms/{setup.token}/responses", json=payload
    )
    assert response.status_code == 422
    assert_not_inserted(db)


def test_overlong_faculty_fields_are_rejected(client, db, setup):
    payload = valid_payload(setup, faculty_name="x" * 201)
    response = client.post(
        f"/api/public/forms/{setup.token}/responses", json=payload
    )
    assert response.status_code == 422
    assert_not_inserted(db)


def test_missing_question_answer_is_rejected(client, db, setup):
    payload = valid_payload(setup)
    payload["answers"] = payload["answers"][:1]
    response = client.post(
        f"/api/public/forms/{setup.token}/responses", json=payload
    )
    assert response.status_code == 422
    assert "Missing answer" in response.json()["detail"]
    assert_not_inserted(db)


def test_unexpected_question_id_is_rejected(client, db, setup):
    payload = valid_payload(setup)
    payload["answers"].append(
        {"question_id": "q99", "course_id": str(setup.first)}
    )
    response = client.post(
        f"/api/public/forms/{setup.token}/responses", json=payload
    )
    assert response.status_code == 422
    assert "Unexpected question" in response.json()["detail"]
    assert_not_inserted(db)


def test_duplicate_question_answer_is_rejected(client, db, setup):
    payload = valid_payload(setup)
    payload["answers"].append(
        {"question_id": "q1", "course_id": str(setup.second)}
    )
    response = client.post(
        f"/api/public/forms/{setup.token}/responses", json=payload
    )
    assert response.status_code == 422
    assert "Duplicate answer" in response.json()["detail"]
    assert_not_inserted(db)


def test_course_outside_question_options_is_rejected(client, db, setup):
    payload = valid_payload(setup)
    # CS301 belongs to q2, not q1.
    payload["answers"][0]["course_id"] = str(setup.third)
    response = client.post(
        f"/api/public/forms/{setup.token}/responses", json=payload
    )
    assert response.status_code == 422
    assert "not available for question q1" in response.json()["detail"]
    assert_not_inserted(db)


def test_same_course_across_questions_is_rejected(client, db, admin_headers):
    shared = insert_course(db, "CS201", "Algorithms", 2)
    other = insert_course(db, "CS202", "Architecture", 2)
    third = insert_course(db, "CS203", "Compilers", 2)
    form = create_form(
        client,
        admin_headers,
        questions=[
            question_doc("q1", [shared, other]),
            question_doc("q2", [shared, third]),
        ],
    )
    published = publish_form(client, admin_headers, form["form_id"])
    payload = {
        "faculty_name": "Demo Faculty",
        "faculty_id": "FAC001",
        "answers": [
            {"question_id": "q1", "course_id": str(shared)},
            {"question_id": "q2", "course_id": str(shared)},
        ],
    }
    response = client.post(
        f"/api/public/forms/{published['public_token']}/responses", json=payload
    )
    assert response.status_code == 422
    assert "same course" in response.json()["detail"].lower()
    assert_not_inserted(db)


def test_same_course_with_different_text_representation_is_rejected(
    client, db, admin_headers
):
    shared = insert_course(db, "CS201", "Algorithms", 2)
    other = insert_course(db, "CS202", "Architecture", 2)
    third = insert_course(db, "CS203", "Compilers", 2)
    form = create_form(
        client,
        admin_headers,
        questions=[
            question_doc("q1", [shared, other]),
            question_doc("q2", [shared, third]),
        ],
    )
    published = publish_form(client, admin_headers, form["form_id"])
    # Uppercase hex and surrounding whitespace must normalize to the same
    # course as the lowercase ID used for q1.
    payload = {
        "faculty_name": "Demo Faculty",
        "faculty_id": "FAC001",
        "answers": [
            {"question_id": "q1", "course_id": str(shared)},
            {"question_id": "q2", "course_id": f"  {str(shared).upper()}  "},
        ],
    }
    response = client.post(
        f"/api/public/forms/{published['public_token']}/responses", json=payload
    )
    assert response.status_code == 422
    assert "same course" in response.json()["detail"].lower()
    assert_not_inserted(db)


def test_nonexistent_course_is_rejected(client, db, setup):
    payload = valid_payload(setup)
    payload["answers"][0]["course_id"] = str(ObjectId())
    response = client.post(
        f"/api/public/forms/{setup.token}/responses", json=payload
    )
    assert response.status_code == 422
    assert_not_inserted(db)


def test_malformed_course_id_is_rejected(client, db, setup):
    payload = valid_payload(setup)
    payload["answers"][0]["course_id"] = "not-a-course-id"
    response = client.post(
        f"/api/public/forms/{setup.token}/responses", json=payload
    )
    assert response.status_code == 422
    assert_not_inserted(db)


def test_course_deleted_after_publication_is_rejected(client, db, setup):
    db.courses.delete_one({"_id": setup.first})
    response = client.post(
        f"/api/public/forms/{setup.token}/responses", json=valid_payload(setup)
    )
    assert response.status_code == 422
    assert "no longer available" in response.json()["detail"]
    assert_not_inserted(db)


def test_draft_token_submission_is_rejected(client, db):
    course = insert_course(db, "CS101")
    insert_form(
        db,
        title="Draft",
        questions=[question_doc("q1", [course])],
        status="draft",
        public_token="draft-submit-token-" + "a" * 20,
    )
    payload = {
        "faculty_name": "Demo",
        "faculty_id": "FAC001",
        "answers": [{"question_id": "q1", "course_id": str(course)}],
    }
    response = client.post(
        "/api/public/forms/draft-submit-token-" + "a" * 20 + "/responses",
        json=payload,
    )
    assert response.status_code == 404
    assert_not_inserted(db)


def test_unknown_token_submission_is_rejected(client, db):
    payload = {
        "faculty_name": "Demo",
        "faculty_id": "FAC001",
        "answers": [{"question_id": "q1", "course_id": str(ObjectId())}],
    }
    response = client.post(
        "/api/public/forms/unknown-token/responses", json=payload
    )
    assert response.status_code == 404
    assert_not_inserted(db)


def test_empty_answers_list_is_rejected(client, db, setup):
    payload = valid_payload(setup, answers=[])
    response = client.post(
        f"/api/public/forms/{setup.token}/responses", json=payload
    )
    assert response.status_code == 422
    assert_not_inserted(db)


def test_form_id_from_client_cannot_override_token(client, db, setup, admin_headers):
    course = insert_course(db, "CS999")
    other_form = create_form(
        client,
        admin_headers,
        title="Other form",
        questions=[question_doc("q1", [course])],
    )
    payload = valid_payload(setup, form_id=other_form["form_id"])
    response = client.post(
        f"/api/public/forms/{setup.token}/responses", json=payload
    )
    assert response.status_code == 201
    stored = db.responses.find_one({})
    assert stored["form_id"] == ObjectId(setup.form_id)
    assert stored["form_id"] != ObjectId(other_form["form_id"])


def test_duplicate_submissions_are_allowed(client, db, setup):
    first = client.post(
        f"/api/public/forms/{setup.token}/responses", json=valid_payload(setup)
    )
    second = client.post(
        f"/api/public/forms/{setup.token}/responses",
        json=valid_payload(setup, faculty_id="FAC002"),
    )
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["response_id"] != second.json()["response_id"]
    assert db.responses.count_documents({}) == 2


def test_invalid_submissions_are_never_inserted(client, db, setup):
    bad_payloads = [
        valid_payload(setup, faculty_name=""),
        valid_payload(setup, faculty_id=""),
        valid_payload(setup, answers=[{"question_id": "q1", "course_id": str(setup.first)}]),
        valid_payload(
            setup,
            answers=[
                {"question_id": "q1", "course_id": str(setup.third)},
                {"question_id": "q2", "course_id": str(setup.third)},
            ],
        ),
    ]
    for payload in bad_payloads:
        response = client.post(
            f"/api/public/forms/{setup.token}/responses", json=payload
        )
        assert response.status_code == 422
    assert_not_inserted(db)
