"""Excel export of form responses."""

from __future__ import annotations

from io import BytesIO

from openpyxl import load_workbook

from tests.utils import (
    create_form,
    form_payload,
    insert_course,
    publish_form,
    question_doc,
)

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _submit(client, token, name, faculty_id, answers):
    response = client.post(
        f"/api/public/forms/{token}/responses",
        json={
            "faculty_name": name,
            "faculty_id": faculty_id,
            "answers": [
                {"question_id": question_id, "course_id": str(course_id)}
                for question_id, course_id in answers
            ],
        },
    )
    assert response.status_code == 201, response.text


def _workbook(response):
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == XLSX
    return load_workbook(BytesIO(response.content))


def _rows(sheet):
    return [list(row) for row in sheet.iter_rows(values_only=True)]


def test_export_lists_each_response_and_a_course_summary(client, db, admin_headers):
    dbms = insert_course(db, "CS301", "Database Systems", semester=3)
    ml = insert_course(db, "CS401", "Machine Learning", semester=4)
    os_ = insert_course(db, "CS302", "Operating Systems", semester=3)
    form = create_form(
        client,
        admin_headers,
        title="Faculty Preferences 2026",
        questions=[
            question_doc("q1", [dbms, ml, os_], text="First choice"),
            question_doc("q2", [dbms, ml, os_], text="Second choice"),
        ],
    )
    token = publish_form(client, admin_headers, form["form_id"])["public_token"]
    _submit(client, token, "Dr. Asha", "F001", [("q1", dbms), ("q2", ml)])
    _submit(client, token, "Dr. Bala", "F002", [("q1", dbms), ("q2", os_)])

    response = client.get(
        f"/api/forms/{form['form_id']}/responses/export?tz=Asia/Kolkata",
        headers=admin_headers,
    )
    workbook = _workbook(response)
    assert "Faculty-Preferences-2026-responses.xlsx" in response.headers["content-disposition"]
    assert workbook.sheetnames == ["Responses", "Course summary"]

    rows = _rows(workbook["Responses"])
    assert rows[0] == [
        "S.No",
        "Faculty name",
        "Faculty ID",
        "Submitted at (IST)",
        "First choice - Code",
        "First choice - Course",
        "Second choice - Code",
        "Second choice - Course",
    ]
    # Oldest submission first.
    assert [row[:3] for row in rows[1:]] == [[1, "Dr. Asha", "F001"], [2, "Dr. Bala", "F002"]]
    assert rows[1][4:] == ["CS301", "Database Systems", "CS401", "Machine Learning"]
    assert rows[2][4:] == ["CS301", "Database Systems", "CS302", "Operating Systems"]

    summary = _rows(workbook["Course summary"])
    assert summary[0] == [
        "Course code", "Course name", "Semester", "First choice", "Second choice", "Total",
    ]
    assert summary[1:] == [
        ["CS301", "Database Systems", 3, 2, 0, 2],
        ["CS302", "Operating Systems", 3, 0, 1, 1],
        ["CS401", "Machine Learning", 4, 0, 1, 1],
    ]


def test_submission_time_uses_the_requested_time_zone(client, db, admin_headers):
    course = insert_course(db, "CS101")
    form = create_form(client, admin_headers, questions=[question_doc("q1", [course])])
    token = publish_form(client, admin_headers, form["form_id"])["public_token"]
    _submit(client, token, "Dr. A", "F1", [("q1", course)])
    stored = db.responses.find_one()["submitted_at"]

    def submitted(tz):
        url = f"/api/forms/{form['form_id']}/responses/export"
        if tz:
            url += f"?tz={tz}"
        sheet = _workbook(client.get(url, headers=admin_headers))["Responses"]
        return sheet["D1"].value, sheet["D2"].value

    header, utc_value = submitted(None)
    assert header == "Submitted at (UTC)"
    assert utc_value.replace(second=0, microsecond=0) == stored.replace(
        tzinfo=None, second=0, microsecond=0
    )
    header, ist_value = submitted("Asia/Kolkata")
    assert header == "Submitted at (IST)"
    assert (ist_value - utc_value).total_seconds() == 5.5 * 3600
    assert submitted("Not/AZone")[0] == "Submitted at (UTC)"


def test_typed_values_are_never_formulas(client, db, admin_headers):
    course = insert_course(db, "CS101")
    form = create_form(client, admin_headers, questions=[question_doc("q1", [course])])
    token = publish_form(client, admin_headers, form["form_id"])["public_token"]
    _submit(client, token, '=HYPERLINK("http://example.com","x")', "=1+1", [("q1", course)])

    sheet = _workbook(
        client.get(f"/api/forms/{form['form_id']}/responses/export", headers=admin_headers)
    )["Responses"]
    assert sheet["B2"].value == '=HYPERLINK("http://example.com","x")'
    assert sheet["B2"].data_type == "s"
    assert sheet["C2"].data_type == "s"


def test_removed_question_answers_are_kept_and_marked(client, db, admin_headers):
    first, second, third = (insert_course(db, code) for code in ("CS101", "CS102", "CS103"))
    form = create_form(
        client,
        admin_headers,
        questions=[
            question_doc("q1", [first], text="Core"),
            question_doc("q2", [second], text="Elective"),
        ],
    )
    token = publish_form(client, admin_headers, form["form_id"])["public_token"]
    _submit(client, token, "Dr. Early", "F1", [("q1", first), ("q2", second)])
    edited = client.put(
        f"/api/forms/{form['form_id']}",
        headers=admin_headers,
        json=form_payload(
            "Test Form",
            [question_doc("q1", [first], text="Core"), question_doc(None, [third], text="Lab")],
        ),
    )
    assert edited.status_code == 200, edited.text
    _submit(client, token, "Dr. Late", "F2", [("q1", first), ("q3", third)])

    rows = _rows(
        _workbook(
            client.get(f"/api/forms/{form['form_id']}/responses/export", headers=admin_headers)
        )["Responses"]
    )
    assert rows[0][4:] == [
        "Core - Code", "Core - Course", "Lab - Code", "Lab - Course",
        "Elective (removed) - Code", "Elective (removed) - Course",
    ]
    assert rows[1][1] == "Dr. Early"
    assert rows[1][4:] == ["CS101", "CS101 Course", None, None, "CS102", "CS102 Course"]
    assert rows[2][4:] == ["CS101", "CS101 Course", "CS103", "CS103 Course", None, None]


def test_export_with_no_responses_has_headers_only(client, db, admin_headers):
    course = insert_course(db, "CS101")
    form = create_form(client, admin_headers, questions=[question_doc("q1", [course])])

    workbook = _workbook(
        client.get(f"/api/forms/{form['form_id']}/responses/export", headers=admin_headers)
    )
    assert workbook["Responses"].max_row == 1
    assert workbook["Course summary"].max_row == 1


def test_export_requires_admin_and_an_existing_form(client, db, admin_headers):
    course = insert_course(db, "CS101")
    form = create_form(client, admin_headers, questions=[question_doc("q1", [course])])

    assert client.get(f"/api/forms/{form['form_id']}/responses/export").status_code == 401
    missing = client.get(
        "/api/forms/0123456789abcdef01234567/responses/export", headers=admin_headers
    )
    assert missing.status_code == 404
