"""Live end-to-end smoke check against a running backend.

This is intentionally an integration script rather than a unit test: it talks
to the real HTTP API and the configured MongoDB instance.

Usage (backend running on http://127.0.0.1:8000):

    python -m scripts.e2e_smoke
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

import httpx

BASE_URL = os.getenv("E2E_BASE_URL", "http://127.0.0.1:8000")
ADMIN_USERNAME = os.getenv("E2E_ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("E2E_ADMIN_PASSWORD", "admin123")


def check(condition: bool, message: str) -> None:
    if not condition:
        print(f"FAIL: {message}")
        raise SystemExit(1)
    print(f"OK: {message}")


def main() -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    with httpx.Client(base_url=BASE_URL, timeout=20) as client:
        health = client.get("/api/health")
        check(health.status_code == 200, "health endpoint responds")

        login = client.post(
            "/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
        )
        check(login.status_code == 200, "administrator can sign in")
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        check(
            client.post("/api/forms/000000000000000000000000/publish").status_code
            == 401,
            "publishing requires administrator authentication",
        )

        courses_response = client.get("/api/courses", headers=headers)
        check(courses_response.status_code == 200, "course catalogue is readable")
        courses = courses_response.json()["courses"]
        check(len(courses) >= 4, "at least four seeded courses are available")

        title = f"E2E Faculty Preferences {stamp}"
        create = client.post(
            "/api/forms",
            headers=headers,
            json={
                "title": title,
                "description": "Automated end-to-end verification form.",
                "questions": [
                    {
                        "question_id": "q1",
                        "text": "Preferred course for Semester 3",
                        "course_ids": [courses[2]["course_id"], courses[3]["course_id"]],
                    },
                    {
                        "question_id": "q2",
                        "text": "Preferred course for Semester 4",
                        "course_ids": [courses[4]["course_id"], courses[5]["course_id"]],
                    },
                ],
            },
        )
        check(create.status_code == 201, "administrator can create a draft form")
        form = create.json()
        form_id = form["form_id"]

        publish = client.post(f"/api/forms/{form_id}/publish", headers=headers)
        check(publish.status_code == 200, "draft form publishes successfully")
        published = publish.json()
        check(
            published["status"] == "published" and published["public_token"],
            "publish response contains a public token",
        )
        check(
            published["public_token"] != form_id,
            "public token is not the MongoDB form ID",
        )
        check(
            published["public_url"].endswith(f"/forms/{published['public_token']}"),
            "public URL points at the frontend public form route",
        )

        republish = client.post(f"/api/forms/{form_id}/publish", headers=headers)
        check(
            republish.status_code == 200
            and republish.json()["public_token"] == published["public_token"],
            "repeated publish returns the same token",
        )

        edit = client.put(
            f"/api/forms/{form_id}",
            headers=headers,
            json={"title": "Should not change", "questions": []},
        )
        check(edit.status_code == 409, "published form cannot be edited")

        token = published["public_token"]
        public_form = client.get(f"/api/public/forms/{token}")
        check(public_form.status_code == 200, "public form loads without login")
        public_body = public_form.json()
        check(public_body["title"] == title, "public form returns the correct title")
        check(
            [q["question_id"] for q in public_body["questions"]] == ["q1", "q2"],
            "public questions are returned in order",
        )
        check(
            "public_token" not in public_body,
            "public form does not expose internal token metadata",
        )

        first_course = public_body["questions"][0]["courses"][0]["course_id"]
        second_course = public_body["questions"][1]["courses"][0]["course_id"]

        missing = client.post(
            f"/api/public/forms/{token}/responses",
            json={
                "faculty_name": "Invalid Faculty",
                "faculty_id": "BAD001",
                "answers": [{"question_id": "q1", "course_id": first_course}],
            },
        )
        check(missing.status_code == 422, "missing question answer is rejected")

        duplicate_course = client.post(
            f"/api/public/forms/{token}/responses",
            json={
                "faculty_name": "Invalid Faculty",
                "faculty_id": "BAD002",
                "answers": [
                    {"question_id": "q1", "course_id": first_course},
                    {"question_id": "q2", "course_id": first_course},
                ],
            },
        )
        check(
            duplicate_course.status_code == 422,
            "same course across questions is rejected",
        )

        before = client.get(f"/api/forms/{form_id}/responses", headers=headers)
        check(before.status_code == 200, "admin can list responses")
        check(before.json()["total"] == 0, "invalid submissions were not saved")

        submission = client.post(
            f"/api/public/forms/{token}/responses",
            json={
                "faculty_name": "  Demo Faculty  ",
                "faculty_id": "  FAC-E2E-001  ",
                "answers": [
                    {"question_id": "q1", "course_id": first_course},
                    {"question_id": "q2", "course_id": second_course},
                ],
            },
        )
        check(submission.status_code == 201, "valid faculty response is saved")
        response_id = submission.json()["response_id"]
        check(bool(response_id), "submission returns a response identifier")

        listing = client.get(f"/api/forms/{form_id}/responses", headers=headers)
        check(listing.status_code == 200, "admin can retrieve submitted responses")
        body = listing.json()
        check(body["total"] == 1, "exactly one valid response is stored")
        entry = body["responses"][0]
        check(entry["response_id"] == response_id, "response ID matches")
        check(
            entry["faculty_name"] == "Demo Faculty"
            and entry["faculty_id"] == "FAC-E2E-001",
            "faculty fields are trimmed and preserved",
        )
        check(
            [answer["question_id"] for answer in entry["answers"]] == ["q1", "q2"],
            "answer order follows the form",
        )
        check(
            entry["answers"][0]["course_code"]
            == public_body["questions"][0]["courses"][0]["course_code"],
            "admin response includes resolved course details",
        )
        check(
            entry["submitted_at"].endswith("Z"),
            "submission timestamp is serialized as UTC ISO-8601",
        )

        unknown = client.get("/api/public/forms/not-a-real-token")
        check(unknown.status_code == 404, "unknown public token returns 404")

        draft = client.post(
            "/api/forms",
            headers=headers,
            json={"title": "Unpublished draft"},
        )
        check(draft.status_code == 201, "a second draft can be created")
        draft_token_attempt = client.get(
            f"/api/public/forms/{draft.json()['form_id']}"
        )
        check(
            draft_token_attempt.status_code == 404,
            "draft form is not available through the public form endpoint",
        )

    print("\nLive end-to-end flow verified.")
    print(f"Published form: {published['public_url']}")
    print(f"Response ID: {response_id}")


if __name__ == "__main__":
    try:
        main()
    except httpx.HTTPError as exc:
        print(f"BLOCKED: could not reach the running backend at {BASE_URL}: {exc}")
        sys.exit(2)
