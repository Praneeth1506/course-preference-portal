"""Tests for Semester-Based Course Filtering and Dynamic Preference Questions.

Covers:
1. Valid courses from configured semester are accepted.
2. Courses from wrong semester are rejected (HTTP 422).
3. All Semesters (semester=None) accepts courses from any valid catalogue semester.
4. Duplicate course selections are rejected across questions.
5. Invalid course IDs are rejected.
6. Invalid question IDs are rejected.
7. Unpublished / draft forms cannot receive submissions (HTTP 404).
8. Dynamic question counts (e.g. 4 questions or 1 question) are supported end-to-end.
"""

from __future__ import annotations

import pytest
from bson import ObjectId

from tests.utils import create_form, insert_course, insert_form, publish_form, question_doc


@pytest.fixture
def catalogue(db):
    ds = insert_course(db, "CS201", "Data Structures", 3)
    dbms = insert_course(db, "CS202", "Database Management Systems", 3)
    os_course = insert_course(db, "CS301", "Operating Systems", 4)
    cn = insert_course(db, "CS302", "Computer Networks", 4)
    ai = insert_course(db, "CS401", "Artificial Intelligence", 5)
    ml = insert_course(db, "CS402", "Machine Learning", 5)
    return {
        "ds": ds,
        "dbms": dbms,
        "os": os_course,
        "cn": cn,
        "ai": ai,
        "ml": ml,
    }


def test_valid_courses_from_configured_semester_are_accepted(
    client, db, admin_headers, catalogue
):
    # Form with Q1: Semester 3, Q2: Semester 4
    form = create_form(
        client,
        admin_headers,
        title="Semester Filtered Form",
        questions=[
            question_doc(
                "q1",
                [catalogue["ds"], catalogue["dbms"]],
                text="Preference 1",
                semester=3,
            ),
            question_doc(
                "q2",
                [catalogue["os"], catalogue["cn"]],
                text="Preference 2",
                semester=4,
            ),
        ],
    )
    published = publish_form(client, admin_headers, form["form_id"])
    token = published["public_token"]

    payload = {
        "faculty_name": "Dr. Alan Turing",
        "faculty_id": "FAC101",
        "answers": [
            {"question_id": "q1", "course_id": str(catalogue["ds"])},
            {"question_id": "q2", "course_id": str(catalogue["os"])},
        ],
    }
    response = client.post(f"/api/public/forms/{token}/responses", json=payload)
    assert response.status_code == 201
    assert response.json()["message"] == "Course preferences submitted successfully"


def test_courses_from_wrong_semester_are_rejected(
    client, db, admin_headers, catalogue
):
    # Form has Q1 restricted to semester 3
    form = create_form(
        client,
        admin_headers,
        title="Semester Restricted Form",
        questions=[
            question_doc(
                "q1",
                [catalogue["ds"], catalogue["dbms"]],
                text="Preference 1",
                semester=3,
            ),
        ],
    )
    published = publish_form(client, admin_headers, form["form_id"])
    token = published["public_token"]

    # Manually constructed payload submitting an OS course (Semester 4) to Q1 (Semester 3)
    payload = {
        "faculty_name": "Dr. Alan Turing",
        "faculty_id": "FAC101",
        "answers": [
            {"question_id": "q1", "course_id": str(catalogue["os"])},
        ],
    }
    response = client.post(f"/api/public/forms/{token}/responses", json=payload)
    assert response.status_code == 422
    assert "not available for question q1" in response.json()["detail"]


def test_all_semesters_accepts_courses_from_any_catalogue_semester(
    client, db, admin_headers, catalogue
):
    # Form has Q1 with All Semesters (semester=None)
    all_courses = [
        catalogue["ds"],
        catalogue["dbms"],
        catalogue["os"],
        catalogue["cn"],
        catalogue["ai"],
        catalogue["ml"],
    ]
    form = create_form(
        client,
        admin_headers,
        title="All Semesters Form",
        questions=[
            question_doc(
                "q1",
                all_courses,
                text="Preference 1 (All Semesters)",
                semester=None,
            ),
        ],
    )
    published = publish_form(client, admin_headers, form["form_id"])
    token = published["public_token"]

    # Faculty submits AI course (Semester 5) to the All Semesters question
    payload = {
        "faculty_name": "Dr. Ada Lovelace",
        "faculty_id": "FAC102",
        "answers": [
            {"question_id": "q1", "course_id": str(catalogue["ai"])},
        ],
    }
    response = client.post(f"/api/public/forms/{token}/responses", json=payload)
    assert response.status_code == 201


def test_duplicate_course_selection_across_dynamic_questions_is_rejected(
    client, db, admin_headers, catalogue
):
    # Form with:
    # Q1: Semester 3 (DS, DBMS)
    # Q2: Semester 3 (DS, DBMS)
    # Q3: All Semesters (all courses)
    all_courses = list(catalogue.values())
    form = create_form(
        client,
        admin_headers,
        title="Dynamic Questions Duplicate Prevention",
        questions=[
            question_doc("q1", [catalogue["ds"], catalogue["dbms"]], semester=3),
            question_doc("q2", [catalogue["ds"], catalogue["dbms"]], semester=3),
            question_doc("q3", all_courses, semester=None),
        ],
    )
    published = publish_form(client, admin_headers, form["form_id"])
    token = published["public_token"]

    # Submitting the same course (Data Structures) for both Q1 and Q2
    payload = {
        "faculty_name": "Prof. Donald Knuth",
        "faculty_id": "FAC103",
        "answers": [
            {"question_id": "q1", "course_id": str(catalogue["ds"])},
            {"question_id": "q2", "course_id": str(catalogue["ds"])},
            {"question_id": "q3", "course_id": str(catalogue["ai"])},
        ],
    }
    response = client.post(f"/api/public/forms/{token}/responses", json=payload)
    assert response.status_code == 422
    assert "same course" in response.json()["detail"].lower()


def test_invalid_course_id_is_rejected(client, db, admin_headers, catalogue):
    form = create_form(
        client,
        admin_headers,
        questions=[question_doc("q1", [catalogue["ds"]], semester=3)],
    )
    published = publish_form(client, admin_headers, form["form_id"])
    token = published["public_token"]

    payload = {
        "faculty_name": "Prof. Test",
        "faculty_id": "FAC999",
        "answers": [
            {"question_id": "q1", "course_id": str(ObjectId())},
        ],
    }
    response = client.post(f"/api/public/forms/{token}/responses", json=payload)
    assert response.status_code == 422


def test_invalid_question_id_is_rejected(client, db, admin_headers, catalogue):
    form = create_form(
        client,
        admin_headers,
        questions=[question_doc("q1", [catalogue["ds"]], semester=3)],
    )
    published = publish_form(client, admin_headers, form["form_id"])
    token = published["public_token"]

    payload = {
        "faculty_name": "Prof. Test",
        "faculty_id": "FAC999",
        "answers": [
            {"question_id": "nonexistent_q", "course_id": str(catalogue["ds"])},
        ],
    }
    response = client.post(f"/api/public/forms/{token}/responses", json=payload)
    assert response.status_code == 422
    assert "unexpected" in response.json()["detail"].lower()


def test_unpublished_forms_cannot_receive_submissions(client, db, catalogue):
    token = "unpublished-draft-token"
    insert_form(
        db,
        title="Draft Form",
        questions=[question_doc("q1", [catalogue["ds"]], semester=3)],
        status="draft",
        public_token=token,
    )

    payload = {
        "faculty_name": "Prof. Test",
        "faculty_id": "FAC999",
        "answers": [
            {"question_id": "q1", "course_id": str(catalogue["ds"])},
        ],
    }
    response = client.post(f"/api/public/forms/{token}/responses", json=payload)
    assert response.status_code == 404


def test_dynamic_question_counts_handled_correctly(
    client, db, admin_headers, catalogue
):
    # Form with 4 dynamic preference questions
    all_courses = list(catalogue.values())
    form = create_form(
        client,
        admin_headers,
        title="4 Preference Questions",
        questions=[
            question_doc("q1", [catalogue["ds"], catalogue["dbms"]], text="Pref 1", semester=3),
            question_doc("q2", [catalogue["ds"], catalogue["dbms"]], text="Pref 2", semester=3),
            question_doc("q3", [catalogue["os"], catalogue["cn"]], text="Pref 3", semester=4),
            question_doc("q4", all_courses, text="Pref 4", semester=None),
        ],
    )
    published = publish_form(client, admin_headers, form["form_id"])
    token = published["public_token"]

    # Public form retrieval shows 4 questions with their semester labels
    public_res = client.get(f"/api/public/forms/{token}")
    assert public_res.status_code == 200
    public_data = public_res.json()
    assert len(public_data["questions"]) == 4
    assert public_data["questions"][0]["semester"] == 3
    assert public_data["questions"][1]["semester"] == 3
    assert public_data["questions"][2]["semester"] == 4
    assert public_data["questions"][3]["semester"] is None

    # Valid submission for all 4 dynamic questions with distinct courses
    payload = {
        "faculty_name": "Dr. Grace Hopper",
        "faculty_id": "FAC104",
        "answers": [
            {"question_id": "q1", "course_id": str(catalogue["ds"])},
            {"question_id": "q2", "course_id": str(catalogue["dbms"])},
            {"question_id": "q3", "course_id": str(catalogue["os"])},
            {"question_id": "q4", "course_id": str(catalogue["ai"])},
        ],
    }
    sub_res = client.post(f"/api/public/forms/{token}/responses", json=payload)
    assert sub_res.status_code == 201

    # Admin responses retrieval reflects the 4 answers in proper order
    resp_res = client.get(f"/api/forms/{form['form_id']}/responses", headers=admin_headers)
    assert resp_res.status_code == 200
    responses_list = resp_res.json()["responses"]
    assert len(responses_list) == 1
    stored_answers = responses_list[0]["answers"]
    assert len(stored_answers) == 4
    assert [a["question_id"] for a in stored_answers] == ["q1", "q2", "q3", "q4"]
    assert [a["course_code"] for a in stored_answers] == ["CS201", "CS202", "CS301", "CS401"]
