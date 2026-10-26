"""Shared test fixtures.

Tests run against mongomock, an in-memory MongoDB-compatible database, so they
never touch a developer's real data and do not require a running MongoDB
server. Environment variables are set before the application is imported so the
same settings are used by every test and expected URLs are deterministic.
"""

from __future__ import annotations

import os

os.environ.setdefault("MONGO_URI", "mongodb://127.0.0.1:27017")
os.environ.setdefault("MONGO_DB_NAME", "course_preference_portal_test")
os.environ.setdefault("FRONTEND_BASE_URL", "http://frontend.test:5173")
os.environ.setdefault("ADMIN_USERNAME", "admin")
os.environ.setdefault("ADMIN_PASSWORD", "test-admin-password")
os.environ.setdefault("JWT_SECRET", "test-only-jwt-secret-not-for-production")
# Keep a developer's backend/.env hash from overriding the test password above.
os.environ.setdefault("ADMIN_PASSWORD_HASH", "")

import mongomock  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import ensure_indexes, get_database, reset_index_state  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def db():
    reset_index_state()
    database = mongomock.MongoClient().get_database("course_preference_portal_test")
    ensure_indexes(database, force=True)
    yield database


@pytest.fixture
def client(db):
    app.dependency_overrides[get_database] = lambda: db
    # Intentionally not used as a context manager: lifespan startup/index setup
    # is irrelevant because the database dependency is already overridden and
    # the test fixture creates indexes explicitly.
    test_client = TestClient(app)
    try:
        yield test_client
    finally:
        test_client.close()
        app.dependency_overrides.clear()


@pytest.fixture
def admin_headers(client):
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "test-admin-password"},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
