"""Helpers for constructing test data through the API or directly."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId


def insert_course(
    db,
    code: str,
    name: str | None = None,
    semester: int = 1,
) -> ObjectId:
    course_id = ObjectId()
    db.courses.insert_one(
        {
            "_id": course_id,
            "code": code,
            "name": name or f"{code} Course",
            "semester": semester,
            "created_at": datetime.now(timezone.utc),
        }
    )
    return course_id


def question_doc(
    question_id: str,
    course_ids: list[ObjectId],
    *,
    text: str | None = None,
    order: int | None = None,
    semester: int | None = None,
) -> dict[str, Any]:
    return {
        "question_id": question_id,
        "text": text or f"Question {question_id}",
        "order": order,
        "course_ids": course_ids,
        "semester": semester,
    }


def insert_form(
    db,
    *,
    title: str = "Test Form",
    questions: list[dict[str, Any]] | None = None,
    status: str = "draft",
    public_token: str | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    form = {
        "_id": ObjectId(),
        "title": title,
        "description": description,
        "status": status,
        "questions": questions if questions is not None else [],
        "created_at": now,
        "updated_at": now,
    }
    if public_token is not None:
        form["public_token"] = public_token
        form["published_at"] = now
    db.forms.insert_one(form)
    return form


def form_payload(
    title: str = "Test Form",
    questions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build an API-shaped form payload from ObjectId-bearing questions."""
    api_questions = []
    for question in questions or []:
        api_questions.append(
            {
                "question_id": question.get("question_id"),
                "text": question["text"],
                "course_ids": [str(cid) for cid in question["course_ids"]],
                "semester": question.get("semester"),
            }
        )
    return {"title": title, "questions": api_questions}


def create_form(client, headers, title="Test Form", questions=None) -> dict[str, Any]:
    response = client.post(
        "/api/forms",
        json=form_payload(title, questions),
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def publish_form(client, headers, form_id: str) -> dict[str, Any]:
    response = client.post(f"/api/forms/{form_id}/publish", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def make_published_form(
    client,
    headers,
    db,
    *,
    title: str = "Published Form",
    questions: list[dict[str, Any]] | None = None,
) -> tuple[dict[str, Any], str]:
    form = create_form(client, headers, title=title, questions=questions)
    published = publish_form(client, headers, form["form_id"])
    return form, published["public_token"]


def auth_headers(client, username="admin", password="test-admin-password") -> dict[str, str]:
    response = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}
