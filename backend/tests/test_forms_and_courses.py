"""Administrator form CRUD and course catalogue tests."""

from __future__ import annotations

from bson import ObjectId

from tests.utils import (
    create_form,
    insert_course,
    publish_form,
    question_doc,
)


def test_form_endpoints_require_authentication(client, db):
    assert client.get("/api/forms").status_code == 401
    assert client.post("/api/forms", json={"title": "x"}).status_code == 401
    assert client.get("/api/courses").status_code == 401


def test_course_catalogue_is_sorted_and_serialized(client, db, admin_headers):
    insert_course(db, "CS301", "Databases", 3)
    insert_course(db, "CS101", "Programming", 1)
    insert_course(db, "CS201", "Data Structures", 2)

    response = client.get("/api/courses", headers=admin_headers)
    assert response.status_code == 200
    courses = response.json()["courses"]
    assert [c["course_code"] for c in courses] == ["CS101", "CS201", "CS301"]
    assert set(courses[0]) == {
        "course_id",
        "course_code",
        "course_name",
        "semester",
    }


def test_create_draft_generates_question_ids_and_orders(client, db, admin_headers):
    first = insert_course(db, "CS101")
    second = insert_course(db, "CS102")
    response = client.post(
        "/api/forms",
        headers=admin_headers,
        json={
            "title": "  Draft title  ",
            "description": "  Notes  ",
            "questions": [
                {"text": "First", "course_ids": [str(first)]},
                {"text": "Second", "course_ids": [str(second)]},
            ],
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["title"] == "Draft title"
    assert body["description"] == "Notes"
    assert body["status"] == "draft"
    assert [q["question_id"] for q in body["questions"]] == ["q1", "q2"]
    assert [q["order"] for q in body["questions"]] == [1, 2]
    assert body["questions"][0]["courses"][0]["course_code"] == "CS101"

    stored = db.forms.find_one({"_id": ObjectId(body["form_id"])})
    assert stored["questions"][0]["course_ids"] == [first]
    assert "public_token" not in stored


def test_create_form_rejects_duplicate_question_ids(client, db, admin_headers):
    course = insert_course(db, "CS101")
    response = client.post(
        "/api/forms",
        headers=admin_headers,
        json={
            "title": "Duplicate IDs",
            "questions": [
                {"question_id": "q1", "text": "A", "course_ids": [str(course)]},
                {"question_id": "q1", "text": "B", "course_ids": [str(course)]},
            ],
        },
    )
    assert response.status_code == 422


def test_create_form_rejects_malformed_course_id(client, db, admin_headers):
    response = client.post(
        "/api/forms",
        headers=admin_headers,
        json={
            "title": "Bad ID",
            "questions": [{"text": "A", "course_ids": ["nope"]}],
        },
    )
    assert response.status_code == 422


def test_update_draft_replaces_questions(client, db, admin_headers):
    first = insert_course(db, "CS101")
    second = insert_course(db, "CS102")
    form = create_form(
        client, admin_headers, questions=[question_doc("q1", [first])]
    )

    response = client.put(
        f"/api/forms/{form['form_id']}",
        headers=admin_headers,
        json={
            "title": "Updated",
            "questions": [
                {"question_id": "q1", "text": "Updated text", "course_ids": [str(second)]}
            ],
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["title"] == "Updated"
    assert body["questions"][0]["text"] == "Updated text"
    assert body["questions"][0]["course_ids"] == [str(second)]


def test_get_form_returns_404_for_unknown_id(client, admin_headers):
    assert (
        client.get(f"/api/forms/{ObjectId()}", headers=admin_headers).status_code
        == 404
    )
    assert (
        client.get("/api/forms/bad-id", headers=admin_headers).status_code == 400
    )


def test_list_forms_includes_response_counts(client, db, admin_headers):
    course = insert_course(db, "CS101")
    form = create_form(
        client, admin_headers, questions=[question_doc("q1", [course])]
    )
    token = publish_form(client, admin_headers, form["form_id"])["public_token"]
    for index in range(2):
        response = client.post(
            f"/api/public/forms/{token}/responses",
            json={
                "faculty_name": f"Faculty {index}",
                "faculty_id": f"FAC{index}",
                "answers": [{"question_id": "q1", "course_id": str(course)}],
            },
        )
        assert response.status_code == 201

    body = client.get("/api/forms", headers=admin_headers).json()
    summary = next(f for f in body["forms"] if f["form_id"] == form["form_id"])
    assert summary["response_count"] == 2
    assert summary["question_count"] == 1
    assert summary["status"] == "published"
    assert summary["public_url"] == (
        f"http://frontend.test:5173/forms/{token}"
    )


def test_list_forms_handles_empty_state(client, admin_headers):
    body = client.get("/api/forms", headers=admin_headers).json()
    assert body == {"forms": []}


def test_draft_forms_do_not_expose_public_url(client, admin_headers):
    form = create_form(client, admin_headers)
    assert form["status"] == "draft"
    assert form["public_token"] is None
    assert "public_url" not in form


def test_seeded_draft_with_no_questions_can_be_saved(client, admin_headers):
    response = client.post(
        "/api/forms", headers=admin_headers, json={"title": "Empty draft"}
    )
    assert response.status_code == 201
    assert response.json()["questions"] == []
