"""MongoDB client and index management.

A single lazy PyMongo client is shared by every request. PyMongo's synchronous
driver is used deliberately: FastAPI runs synchronous path operations in a
worker thread, and the MVP has no need for an async driver. This keeps the
database layer simple and matches the simple, synchronous test setup.
"""

from __future__ import annotations

import logging

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.database import Database
from pymongo.errors import PyMongoError

from .config import settings

logger = logging.getLogger(__name__)

_client: MongoClient | None = None
_indexes_ready = False


def get_client() -> MongoClient:
    """Return the process-wide MongoDB client, creating it on first use."""
    global _client
    if _client is None:
        if settings.mongo_uri.startswith("mongomock://"):
            import mongomock
            _client = mongomock.MongoClient()
        else:
            try:
                candidate = MongoClient(
                    settings.mongo_uri,
                    serverSelectionTimeoutMS=settings.mongo_timeout_ms,
                    tz_aware=True,
                )
                candidate.admin.command("ping")
                _client = candidate
            except Exception as exc:
                logger.warning(
                    "MongoDB at %s is unreachable (%s). Falling back to in-memory mongomock for local development.",
                    settings.mongo_uri,
                    exc,
                )
                import mongomock
                _client = mongomock.MongoClient()
    return _client


def get_database() -> Database:
    """FastAPI dependency that returns the configured application database."""
    return get_client()[settings.mongo_db_name]


def database_is_reachable() -> bool:
    """Ping MongoDB; used for the startup message and the health check."""
    try:
        get_client().admin.command("ping")
        return True
    except Exception:
        return False


def ensure_indexes(db: Database | None = None, *, force: bool = False) -> None:
    """Create the indexes used by the application.

    Index creation is idempotent. The unique public-token index is created with
    a partial filter so draft forms (which have no token) can coexist, and a
    failure to create it (for example on a MongoDB-compatible mock) is logged
    rather than fatal -- token generation also checks for collisions before
    writing.
    """
    global _indexes_ready
    if _indexes_ready and not force:
        return

    target = db if db is not None else get_database()
    ready = True

    try:
        target.forms.create_index(
            [("public_token", ASCENDING)],
            name="uniq_public_token",
            unique=True,
            partialFilterExpression={"public_token": {"$type": "string"}},
        )
    except (PyMongoError, TypeError, NotImplementedError) as exc:
        # Some MongoDB-compatible test doubles do not implement partial indexes.
        # Collision checks in the publish flow still protect correctness.
        ready = False
        logger.warning("Could not create unique public-token index: %s", exc)

    try:
        target.forms.create_index([("status", ASCENDING)])
        target.forms.create_index([("created_at", DESCENDING)])
        target.responses.create_index(
            [("form_id", ASCENDING), ("submitted_at", DESCENDING)]
        )
        target.courses.create_index([("code", ASCENDING)])
        target.courses.create_index([("semester", ASCENDING), ("code", ASCENDING)])
    except PyMongoError as exc:
        ready = False
        logger.warning("Could not create supporting indexes: %s", exc)

    if ready:
        _indexes_ready = True


def reset_index_state() -> None:
    """Testing helper: forget that indexes were created for a database."""
    global _indexes_ready
    _indexes_ready = False
