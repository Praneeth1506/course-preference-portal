"""Authenticated administrator response-listing tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from bson import ObjectId

from tests.utils import create_form, insert_course, insert_form, publish_form, question_doc


def submit(client, token, faculty_name, faculty_id, answers):
    response = client.post(
        f"/api/public/forms/{token}/responses",
        json={
            "faculty_name": faculty_name,
            "faculty_id": faculty_id,
            "answers": answers,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_responses_require_authentication(client, db):
    form = insert_form(db, status="published", public_token="auth-required-token-" + "a" * 20)
    assert client.get(f"/api/forms/{form['_id']}/responses").status_code == 401
    assert (
        client.get(
            f"/api/forms/{form['_id']}/responses",
            headers={"Authorization": "Bearer nope"},
        ).status_code
        == 401
    )


def test_responses_unknown_form_returns_404(client, admin_headers):
    response = client.get(f"/api/forms/{ObjectId()}/responses", headers=admin_headers)
    assert response.status_code == 404


def test_responses_malformed_form_id_returns_400(client, admin_headers):
    response = client.get("/api/forms/not-valid/responses", headers=admin_headers)
    assert response.status_code == 400


def test_empty_response_list(client, db, admin_headers):
    course = insert_course(db, "CS101")
    form = create_form(
        client, admin_headers, questions=[question_doc("q1", [course])]
    )
    response = client.get(
        f"/api/forms/{form['form_id']}/responses", headers=admin_headers
    )
    assert response.status_code == 200
    assert response.json() == {
        "form_id": form["form_id"],
        "form_title": "Test Form",
        "responses": [],
        "total": 0,
    }


def test_authenticated_admin_sees_submitted_response_with_course_details(
    client, db, admin_headers
):
    first = insert_course(db, "CS301", "Database Systems", 3)
    second = insert_course(db, "CS401", "Machine Learning", 4)
    form = create_form(
        client,
        admin_headers,
        title="Faculty Preferences",
        questions=[
            question_doc("q1", [first], text="Teaching preference A"),
            question_doc("q2", [second], text="Teaching preference B"),
        ],
    )
    published = publish_form(client, admin_headers, form["form_id"])
    submitted = submit(
        client,
        published["public_token"],
        "Demo Faculty",
        "FAC001",
        [
            {"question_id": "q1", "course_id": str(first)},
            {"question_id": "q2", "course_id": str(second)},
        ],
    )

    response = client.get(
        f"/api/forms/{form['form_id']}/responses", headers=admin_headers
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    assert body["form_title"] == "Faculty Preferences"

    entry = body["responses"][0]
    assert entry["response_id"] == submitted["response_id"]
    assert entry["faculty_name"] == "Demo Faculty"
    assert entry["faculty_id"] == "FAC001"
    assert entry["submitted_at"].endswith("Z")
    datetime.fromisoformat(entry["submitted_at"].replace("Z", "+00:00"))

    assert entry["answers"] == [
        {
            "question_id": "q1",
            "question_text": "Teaching preference A",
            "course_id": str(first),
            "course_code": "CS301",
            "course_name": "Database Systems",
            "semester": 3,
        },
        {
            "question_id": "q2",
            "question_text": "Teaching preference B",
            "course_id": str(second),
            "course_code": "CS401",
            "course_name": "Machine Learning",
            "semester": 4,
        },
    ]


def test_responses_are_scoped_to_requested_form(client, db, admin_headers):
    first_course = insert_course(db, "CS101")
    second_course = insert_course(db, "CS102")
    first_form = create_form(
        client, admin_headers, title="First", questions=[question_doc("q1", [first_course])]
    )
    second_form = create_form(
        client, admin_headers, title="Second", questions=[question_doc("q1", [second_course])]
    )
    first_token = publish_form(client, admin_headers, first_form["form_id"])["public_token"]
    second_token = publish_form(client, admin_headers, second_form["form_id"])["public_token"]

    submit(
        client,
        first_token,
        "Faculty One",
        "FAC001",
        [{"question_id": "q1", "course_id": str(first_course)}],
    )
    submit(
        client,
        second_token,
        "Faculty Two",
        "FAC002",
        [{"question_id": "q1", "course_id": str(second_course)}],
    )

    first_body = client.get(
        f"/api/forms/{first_form['form_id']}/responses", headers=admin_headers
    ).json()
    second_body = client.get(
        f"/api/forms/{second_form['form_id']}/responses", headers=admin_headers
    ).json()

    assert first_body["total"] == 1
    assert [r["faculty_name"] for r in first_body["responses"]] == ["Faculty One"]
    assert second_body["total"] == 1
    assert [r["faculty_name"] for r in second_body["responses"]] == ["Faculty Two"]


def test_responses_are_newest_first(client, db, admin_headers):
    course = insert_course(db, "CS101")
    form = insert_form(
        db,
        title="Ordered responses",
        questions=[question_doc("q1", [course])],
        status="published",
        public_token="ordered-responses-token-" + "a" * 20,
    )
    now = datetime.now(timezone.utc)
    for index, name in enumerate(["Oldest", "Middle", "Newest"]):
        db.responses.insert_one(
            {
                "_id": ObjectId(),
                "form_id": form["_id"],
                "faculty_name": name,
                "faculty_id": f"FAC{index}",
                "answers": [{"question_id": "q1", "course_id": course}],
                "submitted_at": now + timedelta(minutes=index),
            }
        )

    response = client.get(
        f"/api/forms/{form['_id']}/responses", headers=admin_headers
    )
    assert response.status_code == 200
    assert [r["faculty_name"] for r in response.json()["responses"]] == [
        "Newest",
        "Middle",
        "Oldest",
    ]


def test_deleted_course_is_handled_safely_in_admin_view(
    client, db, admin_headers
):
    kept = insert_course(db, "CS101", "Kept")
    deleted = insert_course(db, "CS102", "Deleted")
    form = create_form(
        client,
        admin_headers,
        questions=[question_doc("q1", [kept, deleted])],
    )
    token = publish_form(client, admin_headers, form["form_id"])["public_token"]
    submit(
        client,
        token,
        "Demo Faculty",
        "FAC001",
        [{"question_id": "q1", "course_id": str(deleted)}],
    )
    db.courses.delete_one({"_id": deleted})

    body = client.get(
        f"/api/forms/{form['form_id']}/responses", headers=admin_headers
    ).json()
    answer = body["responses"][0]["answers"][0]
    assert answer["course_id"] == str(deleted)
    assert answer["course_code"] is None
    assert answer["course_name"] is None


def test_answers_are_ordered_by_question_order(client, db, admin_headers):
    course_a = insert_course(db, "CS101")
    course_b = insert_course(db, "CS102")
    form = insert_form(
        db,
        title="Answer ordering",
        questions=[
            question_doc("q1", [course_a], order=1),
            question_doc("q2", [course_b], order=2),
        ],
        status="published",
        public_token="answer-order-token-" + "a" * 20,
    )
    db.responses.insert_one(
        {
            "_id": ObjectId(),
            "form_id": form["_id"],
            "faculty_name": "Demo",
            "faculty_id": "FAC001",
            # Stored out of order to prove the API orders answers.
            "answers": [
                {"question_id": "q2", "course_id": course_b},
                {"question_id": "q1", "course_id": course_a},
            ],
            "submitted_at": datetime.now(timezone.utc),
        }
    )

    body = client.get(
        f"/api/forms/{form['_id']}/responses", headers=admin_headers
    ).json()
    assert [a["question_id"] for a in body["responses"][0]["answers"]] == [
        "q1",
        "q2",
    ]


def test_response_list_does_not_expose_unrelated_data(client, db, admin_headers):
    course = insert_course(db, "CS101")
    form = create_form(
        client, admin_headers, questions=[question_doc("q1", [course])]
    )
    token = publish_form(client, admin_headers, form["form_id"])["public_token"]
    submit(
        client,
        token,
        "Demo",
        "FAC001",
        [{"question_id": "q1", "course_id": str(course)}],
    )
    text = client.get(
        f"/api/forms/{form['form_id']}/responses", headers=admin_headers
    ).text
    assert "password" not in text.lower()
    assert "jwt" not in text.lower()
    assert "mongo_uri" not in text.lower()
