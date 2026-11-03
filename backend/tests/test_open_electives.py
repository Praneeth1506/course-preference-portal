"""Manually entered open electives and the catalogue category filter."""

from __future__ import annotations

from bson import ObjectId

from tests.utils import create_form, insert_course, publish_form, question_doc

URL = "/api/courses/open-electives"


def elective_payload(**overrides):
    payload = {
        "course_code": "23mo01",
        "course_name": "  Principles of Management ",
        "offered_by": "Department of Management Sciences",
        "semester": 7,
        "credits": 3,
    }
    payload.update(overrides)
    return payload


def create_elective(client, headers, **overrides):
    response = client.post(URL, json=elective_payload(**overrides), headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_admin_can_add_open_elective(client, db, admin_headers):
    body = create_elective(client, admin_headers)

    assert body == {
        "course_id": body["course_id"],
        "course_code": "23MO01",
        "course_name": "Principles of Management",
        "semester": 7,
        "category": "OE",
        "credits": 3,
        "elective_group": "Open Elective",
        "offered_by": "Department of Management Sciences",
        "source": "manual",
        "programmes": [],
    }
    stored = db.courses.find_one({"_id": ObjectId(body["course_id"])})
    assert (stored["code"], stored["name"]) == ("23MO01", "Principles of Management")


def test_open_electives_are_listed_with_other_courses(client, db, admin_headers):
    insert_course(db, "23N501", "Machine Learning -2", 5)
    create_elective(client, admin_headers, semester=None)

    courses = client.get("/api/courses", headers=admin_headers).json()["courses"]
    assert {c["course_code"] for c in courses} == {"23N501", "23MO01"}

    only_oe = client.get("/api/courses?category=oe", headers=admin_headers).json()
    assert [c["course_code"] for c in only_oe["courses"]] == ["23MO01"]


def test_unknown_category_filter_is_rejected(client, admin_headers):
    response = client.get("/api/courses?category=XYZ", headers=admin_headers)
    assert response.status_code == 422


def test_open_elective_can_be_used_in_a_published_form(client, db, admin_headers):
    elective = create_elective(client, admin_headers)
    form = create_form(
        client,
        admin_headers,
        questions=[question_doc("q1", [ObjectId(elective["course_id"])])],
    )
    published = publish_form(client, admin_headers, form["form_id"])

    response = client.post(
        f"/api/public/forms/{published['public_token']}/responses",
        json={
            "faculty_name": "Demo Faculty",
            "faculty_id": "FAC001",
            "answers": [{"question_id": "q1", "course_id": elective["course_id"]}],
        },
    )
    assert response.status_code == 201, response.text


def test_duplicate_course_code_is_rejected(client, db, admin_headers):
    insert_course(db, "23NO01", "Bioinformatics", None)

    response = client.post(
        URL, json=elective_payload(course_code="23no01"), headers=admin_headers
    )

    assert response.status_code == 409
    assert db.courses.count_documents({}) == 1


def test_code_of_a_course_both_programmes_teach_is_taken(client, db, admin_headers):
    db.courses.insert_one(
        {"code": "23ZO01/23NO01", "codes": ["23ZO01", "23NO01"], "name": "Bioinformatics"}
    )

    response = client.post(
        URL, json=elective_payload(course_code="23no01"), headers=admin_headers
    )

    assert response.status_code == 409
    assert db.courses.count_documents({}) == 1


def test_invalid_open_elective_fields_are_rejected(client, db, admin_headers):
    for payload in [
        elective_payload(course_code=""),
        elective_payload(course_code="23 MO 01"),
        elective_payload(course_name="   "),
        elective_payload(semester=0),
        elective_payload(credits=-1),
    ]:
        response = client.post(URL, json=payload, headers=admin_headers)
        assert response.status_code == 422, payload
    assert db.courses.count_documents({}) == 0


def test_open_elective_endpoints_require_admin(client, db):
    course_id = str(ObjectId())
    assert client.post(URL, json=elective_payload()).status_code == 401
    assert client.put(f"{URL}/{course_id}", json=elective_payload()).status_code == 401
    assert client.delete(f"{URL}/{course_id}").status_code == 401


def test_admin_can_edit_open_elective(client, db, admin_headers):
    elective = create_elective(client, admin_headers)

    response = client.put(
        f"{URL}/{elective['course_id']}",
        json=elective_payload(course_name="Management Principles", offered_by=""),
        headers=admin_headers,
    )

    assert response.status_code == 200, response.text
    assert response.json()["course_name"] == "Management Principles"
    assert response.json()["offered_by"] is None


def test_regulation_courses_cannot_be_edited_or_deleted(client, db, admin_headers):
    course_id = db.courses.insert_one(
        {"code": "23NO01", "name": "Bioinformatics", "category": "OE", "source": "regulation"}
    ).inserted_id

    put = client.put(f"{URL}/{course_id}", json=elective_payload(), headers=admin_headers)
    delete = client.delete(f"{URL}/{course_id}", headers=admin_headers)

    assert put.status_code == 409
    assert delete.status_code == 409
    assert db.courses.find_one({"_id": course_id})["name"] == "Bioinformatics"


def test_semester_is_locked_while_a_published_form_uses_the_elective(
    client, db, admin_headers
):
    elective = create_elective(client, admin_headers)
    form = create_form(
        client,
        admin_headers,
        title="Odd semester",
        questions=[question_doc("q1", [ObjectId(elective["course_id"])], semester=7)],
    )
    publish_form(client, admin_headers, form["form_id"])

    response = client.put(
        f"{URL}/{elective['course_id']}",
        json=elective_payload(semester=8),
        headers=admin_headers,
    )

    assert response.status_code == 409
    assert "Odd semester" in response.json()["detail"]


def test_admin_can_delete_unused_open_elective(client, db, admin_headers):
    elective = create_elective(client, admin_headers)

    response = client.delete(f"{URL}/{elective['course_id']}", headers=admin_headers)

    assert response.status_code == 204
    assert db.courses.count_documents({}) == 0


def test_open_elective_used_by_a_form_cannot_be_deleted(client, db, admin_headers):
    elective = create_elective(client, admin_headers)
    create_form(
        client,
        admin_headers,
        title="Draft with elective",
        questions=[question_doc("q1", [ObjectId(elective["course_id"])])],
    )

    response = client.delete(f"{URL}/{elective['course_id']}", headers=admin_headers)

    assert response.status_code == 409
    assert "Draft with elective" in response.json()["detail"]
    assert db.courses.count_documents({}) == 1


def test_unknown_or_malformed_elective_id(client, admin_headers):
    assert client.delete(f"{URL}/{ObjectId()}", headers=admin_headers).status_code == 404
    assert client.delete(f"{URL}/not-an-id", headers=admin_headers).status_code == 400
