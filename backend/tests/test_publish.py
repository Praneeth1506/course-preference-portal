"""Authentication and publish-endpoint tests."""

from __future__ import annotations

import re

import pytest
from bson import ObjectId

from app.routers import forms as forms_router
from tests.utils import (
    create_form,
    form_payload,
    insert_course,
    insert_form,
    publish_form,
    question_doc,
)

URL_SAFE_TOKEN = re.compile(r"^[A-Za-z0-9_-]{43,}$")


def test_login_success_and_me(client):
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "test-admin-password"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] > 0

    me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["username"] == "admin"


def test_login_rejects_invalid_credentials(client):
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "wrong"},
    )
    assert response.status_code == 401
    assert "Invalid username or password" in response.json()["detail"]


def test_me_requires_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert (
        client.get(
            "/api/auth/me", headers={"Authorization": "Bearer not-a-jwt"}
        ).status_code
        == 401
    )


def test_publish_valid_draft(client, db, admin_headers):
    first = insert_course(db, "CS301", "Database Systems", 3)
    second = insert_course(db, "CS302", "Operating Systems", 3)
    third = insert_course(db, "CS401", "Machine Learning", 4)

    form = create_form(
        client,
        admin_headers,
        title="Faculty Preferences",
        questions=[
            question_doc("q1", [first, second]),
            question_doc("q2", [third]),
        ],
    )

    response = client.post(
        f"/api/forms/{form['form_id']}/publish", headers=admin_headers
    )
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["form_id"] == form["form_id"]
    assert body["status"] == "published"
    assert body["public_token"] != form["form_id"]
    assert URL_SAFE_TOKEN.match(body["public_token"])
    assert len(body["public_token"]) >= 43  # 32 random bytes, base64url encoded
    assert body["public_url"] == (
        f"http://frontend.test:5173/forms/{body['public_token']}"
    )
    assert body["published_at"].endswith("Z")

    stored = db.forms.find_one({"_id": ObjectId(form["form_id"])})
    assert stored["status"] == "published"
    assert stored["public_token"] == body["public_token"]
    assert stored["published_at"] is not None


def test_publish_requires_authentication(client, db):
    form = insert_form(db, title="Draft", questions=[])
    response = client.post(f"/api/forms/{form['_id']}/publish")
    assert response.status_code == 401
    assert "WWW-Authenticate" in response.headers
    stored = db.forms.find_one({"_id": form["_id"]})
    assert stored["status"] == "draft"
    assert "public_token" not in stored


def test_publish_rejects_malformed_form_id(client, admin_headers):
    response = client.post("/api/forms/not-an-object-id/publish", headers=admin_headers)
    assert response.status_code == 400
    assert "Invalid form ID" in response.json()["detail"]


def test_publish_unknown_form_returns_404(client, admin_headers):
    response = client.post(
        f"/api/forms/{ObjectId()}/publish", headers=admin_headers
    )
    assert response.status_code == 404


def test_publish_rejects_form_without_title(client, db, admin_headers):
    course = insert_course(db, "CS101")
    form = insert_form(
        db, title="   ", questions=[question_doc("q1", [course])]
    )
    response = client.post(
        f"/api/forms/{form['_id']}/publish", headers=admin_headers
    )
    assert response.status_code == 422
    assert "title" in response.json()["detail"].lower()
    assert db.forms.find_one({"_id": form["_id"]})["status"] == "draft"


def test_publish_rejects_form_without_questions(client, db, admin_headers):
    form = insert_form(db, title="Empty", questions=[])
    response = client.post(
        f"/api/forms/{form['_id']}/publish", headers=admin_headers
    )
    assert response.status_code == 422
    assert "question" in response.json()["detail"].lower()


def test_publish_rejects_question_without_courses(client, db, admin_headers):
    form = insert_form(
        db,
        title="No courses",
        questions=[question_doc("q1", [])],
    )
    response = client.post(
        f"/api/forms/{form['_id']}/publish", headers=admin_headers
    )
    assert response.status_code == 422
    assert "course" in response.json()["detail"].lower()


def test_publish_rejects_nonexistent_course(client, db, admin_headers):
    form = create_form(
        client,
        admin_headers,
        questions=[question_doc("q1", [ObjectId()])],
    )
    response = client.post(
        f"/api/forms/{form['form_id']}/publish", headers=admin_headers
    )
    assert response.status_code == 422
    assert "no longer exist" in response.json()["detail"]
    assert db.forms.find_one({"_id": ObjectId(form["form_id"])})["status"] == "draft"


def test_publish_allows_a_course_in_several_questions(client, db, admin_headers):
    shared = insert_course(db, "CS201", "Algorithms", 2)
    other = insert_course(db, "CS202", "Architecture", 2)
    form = create_form(
        client,
        admin_headers,
        questions=[question_doc("q1", [shared, other]), question_doc("q2", [shared])],
    )

    published = publish_form(client, admin_headers, form["form_id"])

    assert published["status"] == "published"


def test_publish_rejects_questions_without_enough_distinct_courses(
    client, db, admin_headers
):
    first = insert_course(db, "CS201", "Algorithms", 2)
    second = insert_course(db, "CS202", "Architecture", 2)
    form = create_form(
        client,
        admin_headers,
        questions=[
            question_doc("q1", [first, second]),
            question_doc("q2", [second, first]),
            question_doc("q3", [first]),
        ],
    )

    response = client.post(
        f"/api/forms/{form['form_id']}/publish", headers=admin_headers
    )

    assert response.status_code == 422
    assert "Question q3 cannot be answered" in response.json()["detail"]
    assert db.forms.find_one({"_id": ObjectId(form["form_id"])})["status"] == "draft"


def test_publish_rejects_malformed_course_id(client, db, admin_headers):
    form = insert_form(
        db,
        title="Bad course",
        questions=[question_doc("q1", ["not-an-object-id"])],
    )
    response = client.post(
        f"/api/forms/{form['_id']}/publish", headers=admin_headers
    )
    assert response.status_code == 422
    assert "invalid course id" in response.json()["detail"].lower()


def test_publish_respects_question_semester_restriction(client, db, admin_headers):
    semester_three = insert_course(db, "CS301", semester=3)
    semester_two = insert_course(db, "CS201", semester=2)
    form = create_form(
        client,
        admin_headers,
        questions=[
            question_doc("q1", [semester_two, semester_three], semester=3)
        ],
    )
    response = client.post(
        f"/api/forms/{form['form_id']}/publish", headers=admin_headers
    )
    assert response.status_code == 422
    assert "semester" in response.json()["detail"].lower()


def test_electives_with_no_fixed_semester_suit_a_semester_question(
    client, db, admin_headers
):
    core = insert_course(db, "23Z401", semester=4)
    elective = insert_course(db, "23Z013/23N013", "Blockchain Technology", semester=None)
    form = create_form(
        client,
        admin_headers,
        questions=[question_doc("q1", [core, elective], semester=4)],
    )
    published = publish_form(client, admin_headers, form["form_id"])

    response = client.post(
        f"/api/public/forms/{published['public_token']}/responses",
        json={
            "faculty_name": "Demo Faculty",
            "faculty_id": "FAC001",
            "answers": [{"question_id": "q1", "course_id": str(elective)}],
        },
    )

    assert response.status_code == 201, response.text


def test_repeated_publish_is_idempotent(client, db, admin_headers):
    course = insert_course(db, "CS101")
    form = create_form(
        client,
        admin_headers,
        questions=[question_doc("q1", [course])],
    )
    first = publish_form(client, admin_headers, form["form_id"])
    second = publish_form(client, admin_headers, form["form_id"])

    assert second["public_token"] == first["public_token"]
    assert second["public_url"] == first["public_url"]
    assert db.forms.count_documents({"public_token": first["public_token"]}) == 1


def test_published_form_can_be_edited_and_keeps_its_link(client, db, admin_headers):
    first, second, third = (insert_course(db, code) for code in ("CS101", "CS102", "CS103"))
    form = create_form(
        client,
        admin_headers,
        questions=[question_doc("q1", [first, second])],
    )
    published = publish_form(client, admin_headers, form["form_id"])

    response = client.put(
        f"/api/forms/{form['form_id']}",
        headers=admin_headers,
        json=form_payload(
            "Changed",
            [
                question_doc("q1", [first, third]),
                question_doc(None, [second, third], text="Second choice"),
            ],
        ),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "published"
    assert body["public_token"] == published["public_token"]
    assert [q["question_id"] for q in body["questions"]] == ["q1", "q2"]
    assert body["questions"][0]["course_ids"] == [str(first), str(third)]

    public = client.get(f"/api/public/forms/{published['public_token']}")
    assert public.status_code == 200
    assert public.json()["title"] == "Changed"
    assert len(public.json()["questions"]) == 2


@pytest.mark.parametrize(
    "questions, message",
    [
        ([], "at least one question"),
        ([question_doc("q1", [])], "at least one course"),
    ],
)
def test_published_form_edit_must_stay_publishable(
    client, db, admin_headers, questions, message
):
    course = insert_course(db, "CS101")
    form = create_form(
        client,
        admin_headers,
        questions=[question_doc("q1", [course])],
    )
    publish_form(client, admin_headers, form["form_id"])

    response = client.put(
        f"/api/forms/{form['form_id']}",
        headers=admin_headers,
        json=form_payload("Changed", questions),
    )
    assert response.status_code == 422
    assert message in response.json()["detail"]
    stored = db.forms.find_one({"_id": ObjectId(form["form_id"])})
    assert stored["title"] == "Test Form"
    assert len(stored["questions"]) == 1


def test_published_form_edit_needs_a_distinct_course_per_question(
    client, db, admin_headers
):
    course = insert_course(db, "CS101")
    form = create_form(
        client,
        admin_headers,
        questions=[question_doc("q1", [course])],
    )
    publish_form(client, admin_headers, form["form_id"])

    response = client.put(
        f"/api/forms/{form['form_id']}",
        headers=admin_headers,
        json=form_payload(
            "Test Form",
            [question_doc("q1", [course]), question_doc(None, [course])],
        ),
    )
    assert response.status_code == 422
    assert "different course" in response.json()["detail"]


def test_new_question_never_reuses_a_removed_answered_question_id(
    client, db, admin_headers
):
    first, second, third = (insert_course(db, code) for code in ("CS101", "CS102", "CS103"))
    form = create_form(
        client,
        admin_headers,
        questions=[question_doc("q1", [first]), question_doc("q2", [second])],
    )
    token = publish_form(client, admin_headers, form["form_id"])["public_token"]
    submitted = client.post(
        f"/api/public/forms/{token}/responses",
        json={
            "faculty_name": "Dr. A",
            "faculty_id": "F1",
            "answers": [
                {"question_id": "q1", "course_id": str(first)},
                {"question_id": "q2", "course_id": str(second)},
            ],
        },
    )
    assert submitted.status_code == 201, submitted.text

    # Drop q2 and add a new question: it must not become q2 again.
    response = client.put(
        f"/api/forms/{form['form_id']}",
        headers=admin_headers,
        json=form_payload(
            "Test Form",
            [question_doc("q1", [first]), question_doc(None, [third])],
        ),
    )
    assert response.status_code == 200, response.text
    assert [q["question_id"] for q in response.json()["questions"]] == ["q1", "q3"]

    listing = client.get(
        f"/api/forms/{form['form_id']}/responses", headers=admin_headers
    ).json()
    answers = {a["question_id"]: a for a in listing["responses"][0]["answers"]}
    assert answers["q1"]["question_removed"] is False
    assert answers["q2"]["question_removed"] is True
    assert answers["q2"]["question_text"] == "Question q2"
    assert answers["q2"]["course_code"] == "CS102"


def test_submitting_an_outdated_form_asks_faculty_to_reload(client, db, admin_headers):
    first, second = insert_course(db, "CS101"), insert_course(db, "CS102")
    form = create_form(
        client,
        admin_headers,
        questions=[question_doc("q1", [first])],
    )
    token = publish_form(client, admin_headers, form["form_id"])["public_token"]
    client.put(
        f"/api/forms/{form['form_id']}",
        headers=admin_headers,
        json=form_payload(
            "Test Form",
            [question_doc("q1", [first]), question_doc(None, [second])],
        ),
    )

    response = client.post(
        f"/api/public/forms/{token}/responses",
        json={
            "faculty_name": "Dr. A",
            "faculty_id": "F1",
            "answers": [{"question_id": "q1", "course_id": str(first)}],
        },
    )
    assert response.status_code == 422
    assert "reload the page" in response.json()["detail"]


def test_public_tokens_are_unique_and_collision_safe(
    client, db, admin_headers, monkeypatch
):
    course = insert_course(db, "CS101")
    first_form = create_form(
        client, admin_headers, questions=[question_doc("q1", [course])]
    )
    first = publish_form(client, admin_headers, first_form["form_id"])

    second_form = create_form(
        client, admin_headers, questions=[question_doc("q1", [course])]
    )
    # First generated token collides with the existing published form; the
    # publish flow must detect that and try again.
    unique_token = "unique-token-" + "x" * 30
    tokens = iter([first["public_token"], unique_token])
    monkeypatch.setattr(forms_router, "_generate_public_token", lambda: next(tokens))

    response = client.post(
        f"/api/forms/{second_form['form_id']}/publish", headers=admin_headers
    )
    assert response.status_code == 200, response.text
    assert response.json()["public_token"] == unique_token
    assert db.forms.count_documents({"public_token": first["public_token"]}) == 1


def test_repeated_publish_of_published_form_without_questions(
    client, db, admin_headers
):
    # Published data is returned as-is rather than re-validated, so existing
    # share links never break because a course was later removed.
    form = insert_form(
        db,
        title="Already published",
        questions=[],
        status="published",
        public_token="existing-token-" + "a" * 30,
    )
    response = client.post(
        f"/api/forms/{form['_id']}/publish", headers=admin_headers
    )
    assert response.status_code == 200
    assert response.json()["public_token"] == "existing-token-" + "a" * 30
