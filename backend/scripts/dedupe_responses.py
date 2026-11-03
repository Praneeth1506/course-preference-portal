"""Remove duplicate responses saved before each faculty ID could answer once.

Older responses have no ``faculty_id_key``, so the same faculty member may
have several responses to one form. For each (form, faculty ID) this keeps the
first response, as the portal now does, gives it the key, and deletes the
later copies. The unique form/faculty index is created at the next backend
start once no duplicates remain.

Usage (from ``backend``; prints what would change unless --apply is given):

    python -m scripts.dedupe_responses
    python -m scripts.dedupe_responses --apply
"""

from __future__ import annotations

import argparse
from collections import defaultdict

from app.database import get_database
from app.utils import faculty_id_key


def plan(db) -> list[tuple[dict, list[dict]]]:
    """Return (first, later copies) for every form/faculty pair to update."""
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for response in db.responses.find():
        key = faculty_id_key(str(response.get("faculty_id") or ""))
        groups[(response.get("form_id"), key)].append(response)

    changes = []
    for (_form_id, key), responses in groups.items():
        # Unknown submission times sort last, then insertion order (_id).
        responses.sort(key=lambda r: (r.get("submitted_at") is None, r.get("submitted_at"), r["_id"]))
        first, later = responses[0], responses[1:]
        if later or first.get("faculty_id_key") != key:
            changes.append((first, later))
    return changes


def apply(db, changes: list[tuple[dict, list[dict]]]) -> None:
    for first, later in changes:
        db.responses.update_one(
            {"_id": first["_id"]},
            {"$set": {"faculty_id_key": faculty_id_key(str(first.get("faculty_id") or ""))}},
        )
        if later:
            db.responses.delete_many({"_id": {"$in": [r["_id"] for r in later]}})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--apply", action="store_true", help="write the changes")
    args = parser.parse_args()

    db = get_database()
    changes = plan(db)
    duplicates = sum(len(later) for _, later in changes)
    print(
        f"{len(changes)} response(s) to update; {duplicates} later duplicate(s) "
        "to delete."
    )
    for first, later in changes:
        if later:
            print(
                f"  form {first.get('form_id')} faculty {first.get('faculty_id')!r}: "
                f"keep {first['_id']}, delete {len(later)}"
            )
    if not args.apply:
        print("Dry run; rerun with --apply to write these changes.")
        return
    apply(db, changes)
    print("Done.")


if __name__ == "__main__":
    main()
