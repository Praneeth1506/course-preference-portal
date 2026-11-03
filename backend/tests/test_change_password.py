"""Changing the administrator password from the app."""

from __future__ import annotations

import pytest
from pymongo.errors import ServerSelectionTimeoutError

from app.database import get_database
from app.main import app

URL = "/api/auth/password"
ENV_PASSWORD = "test-admin-password"


def login(client, password):
    return client.post("/api/auth/login", json={"username": "admin", "password": password})


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def change(client, headers, current, new):
    return client.post(
        URL, json={"current_password": current, "new_password": new}, headers=headers
    )


def test_admin_can_change_password(client, db, admin_headers):
    response = change(client, admin_headers, ENV_PASSWORD, "a new pass 123")

    assert response.status_code == 200, response.text
    assert client.get("/api/auth/me", headers=bearer(response.json()["access_token"])).status_code == 200
    assert login(client, "a new pass 123").status_code == 200
    # The environment password no longer works once a password is stored.
    assert login(client, ENV_PASSWORD).status_code == 401
    stored = db.admin_credentials.find_one({"_id": "admin"})
    assert stored["version"] == 1
    assert stored["password_hash"].startswith("$2")
    assert "a new pass 123" not in str(stored)


def test_changing_password_signs_out_other_sessions(client, admin_headers):
    other_session = admin_headers

    response = change(client, admin_headers, ENV_PASSWORD, "a new pass 123")

    assert response.status_code == 200
    stale = client.get("/api/auth/me", headers=other_session)
    assert stale.status_code == 401
    assert "password was changed" in stale.json()["detail"]
    assert client.get("/api/courses", headers=other_session).status_code == 401


def test_password_can_be_changed_again(client, admin_headers):
    first = change(client, admin_headers, ENV_PASSWORD, "second password")
    headers = bearer(first.json()["access_token"])

    second = change(client, headers, "second password", "third password")

    assert second.status_code == 200
    assert login(client, "second password").status_code == 401
    assert login(client, "third password").status_code == 200


def test_wrong_current_password_is_rejected_without_signing_out(client, db, admin_headers):
    response = change(client, admin_headers, "not the password", "a new pass 123")

    assert response.status_code == 400
    assert response.json()["detail"] == "The current password is incorrect."
    assert db.admin_credentials.count_documents({}) == 0
    assert client.get("/api/auth/me", headers=admin_headers).status_code == 200


@pytest.mark.parametrize(
    "new_password",
    ["short", "        ", "x" * 73, "é" * 37],  # the last two exceed bcrypt's 72 bytes
)
def test_weak_or_too_long_new_passwords_are_rejected(client, db, admin_headers, new_password):
    response = change(client, admin_headers, ENV_PASSWORD, new_password)

    assert response.status_code == 422
    assert db.admin_credentials.count_documents({}) == 0


def test_new_password_must_differ_from_current(client, admin_headers):
    response = change(client, admin_headers, ENV_PASSWORD, ENV_PASSWORD)

    assert response.status_code == 400
    assert "different" in response.json()["detail"]


def test_change_password_requires_admin(client):
    response = client.post(
        URL, json={"current_password": ENV_PASSWORD, "new_password": "a new pass 123"}
    )
    assert response.status_code == 401


class _Unreachable:
    def find_one(self, *args, **kwargs):
        raise ServerSelectionTimeoutError("down")


class _UnreachableDatabase:
    admin_credentials = _Unreachable()


def test_sign_in_fails_closed_when_the_database_is_down(client, admin_headers):
    app.dependency_overrides[get_database] = lambda: _UnreachableDatabase()

    assert login(client, ENV_PASSWORD).status_code == 503
    assert client.get("/api/auth/me", headers=admin_headers).status_code == 503


def test_reset_to_environment_password_keeps_old_tokens_invalid(client, db, admin_headers):
    changed = change(client, admin_headers, ENV_PASSWORD, "a new pass 123")
    new_session = bearer(changed.json()["access_token"])
    # What `python -m scripts.reset_admin_password --use-env` writes.
    db.admin_credentials.update_one(
        {"_id": "admin"}, {"$unset": {"password_hash": ""}, "$inc": {"version": 1}}
    )

    assert login(client, ENV_PASSWORD).status_code == 200
    assert login(client, "a new pass 123").status_code == 401
    assert client.get("/api/auth/me", headers=new_session).status_code == 401
    assert client.get("/api/auth/me", headers=admin_headers).status_code == 401
