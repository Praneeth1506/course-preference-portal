"""Public form retrieval tests (unauthenticated)."""

from __future__ import annotations


from tests.utils import insert_course, insert_form, question_doc


def test_get_published_form_by_token(client, db, admin_headers):
    first = insert_course(db, "CS301", "Database Systems", 3)
    second = insert_course(db, "CS302", "Operating Systems", 3)
    third = insert_course(db, "CS401", "Machine Learning", 4)
    insert_course(db, "CS999", "Hidden Course", 4)  # never referenced

    from tests.utils import create_form, publish_form

    form = create_form(
        client,
        admin_headers,
        title="Faculty Preferences",
        questions=[
            question_doc("q1", [first, second], text="Semester 3"),
            question_doc("q2", [third], text="Semester 4"),
        ],
    )
    published = publish_form(client, admin_headers, form["form_id"])

    response = client.get(f"/api/public/forms/{published['public_token']}")
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["form_id"] == form["form_id"]
    assert body["title"] == "Faculty Preferences"
    assert [q["question_id"] for q in body["questions"]] == ["q1", "q2"]
    assert [q["order"] for q in body["questions"]] == [1, 2]

    q1, q2 = body["questions"]
    assert q1["text"] == "Semester 3"
    assert [c["course_code"] for c in q1["courses"]] == ["CS301", "CS302"]
    assert [c["course_name"] for c in q1["courses"]] == [
        "Database Systems",
        "Operating Systems",
    ]
    assert [c["semester"] for c in q1["courses"]] == [3, 3]
    assert all("course_id" in c for c in q1["courses"])
    assert [c["course_code"] for c in q2["courses"]] == ["CS401"]

    # Internal/administrative data must not be exposed.
    assert "public_token" not in body
    assert "status" not in body
    assert "created_at" not in body
    assert "course_ids" not in q1
    serialized = response.text
    assert "password" not in serialized.lower()
    assert "mongo" not in serialized.lower()


def test_draft_form_cannot_be_retrieved_by_token(client, db):
    course = insert_course(db, "CS101")
    insert_form(
        db,
        title="Secret draft",
        questions=[question_doc("q1", [course])],
        status="draft",
        public_token="draft-token-" + "a" * 30,
    )
    response = client.get("/api/public/forms/draft-token-" + "a" * 30)
    assert response.status_code == 404
    assert "not published" in response.json()["detail"].lower()


def test_unknown_token_returns_404(client):
    response = client.get("/api/public/forms/this-token-does-not-exist")
    assert response.status_code == 404


def test_questions_are_returned_in_configured_order(client, db):
    first = insert_course(db, "CS101")
    second = insert_course(db, "CS102")
    token = "ordered-form-token-" + "b" * 25
    # Store questions out of array order; the explicit order field wins.
    insert_form(
        db,
        title="Ordered",
        questions=[
            question_doc("later", [second], order=2),
            question_doc("earlier", [first], order=1),
        ],
        status="published",
        public_token=token,
    )

    response = client.get(f"/api/public/forms/{token}")
    assert response.status_code == 200
    assert [q["question_id"] for q in response.json()["questions"]] == [
        "earlier",
        "later",
    ]


def test_deleted_course_is_safely_omitted(client, db):
    kept = insert_course(db, "CS101", "Kept Course", 1)
    deleted = insert_course(db, "CS102", "Deleted Course", 1)
    token = "deleted-course-token-" + "c" * 20
    insert_form(
        db,
        title="Partially deleted",
        questions=[question_doc("q1", [kept, deleted])],
        status="published",
        public_token=token,
    )
    db.courses.delete_one({"_id": deleted})

    response = client.get(f"/api/public/forms/{token}")
    assert response.status_code == 200
    courses = response.json()["questions"][0]["courses"]
    assert [c["course_code"] for c in courses] == ["CS101"]


def test_public_form_does_not_require_authentication(client, db):
    # Explicitly send no Authorization header.
    course = insert_course(db, "CS101")
    token = "public-no-auth-token-" + "d" * 20
    insert_form(
        db,
        questions=[question_doc("q1", [course])],
        status="published",
        public_token=token,
    )
    response = client.get(
        f"/api/public/forms/{token}", headers={"Authorization": ""}
    )
    assert response.status_code == 200


def test_course_details_use_the_existing_catalogue_schema(client, db):
    course = insert_course(db, "CS301", "Database Systems", 3)
    token = "course-schema-token-" + "e" * 22
    insert_form(
        db,
        questions=[question_doc("q1", [course])],
        status="published",
        public_token=token,
    )
    payload = client.get(f"/api/public/forms/{token}").json()["questions"][0][
        "courses"
    ][0]
    assert payload == {
        "course_id": str(course),
        "course_code": "CS301",
        "course_name": "Database Systems",
        "semester": 3,
    }
