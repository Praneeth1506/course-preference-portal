"""Reset the administrator password when it has been forgotten.

The password changed in the app is stored in MongoDB and replaces the one in
the environment. Run from ``backend`` with access to the database:

    python -m scripts.reset_admin_password            # prompts for a new password
    python -m scripts.reset_admin_password --use-env  # go back to ADMIN_PASSWORD(_HASH)

Either way every signed-in session is signed out.
"""

from __future__ import annotations

import argparse
import getpass

from pydantic import ValidationError

from app.config import settings
from app.database import get_database
from app.schemas import ChangePasswordRequest
from app.security import set_admin_password


def _prompt_new_password() -> str:
    while True:
        password = getpass.getpass("New administrator password: ")
        try:
            # Same rules as changing it in the app.
            ChangePasswordRequest(current_password="-", new_password=password)
        except ValidationError as exc:
            print(exc.errors()[0]["msg"].removeprefix("Value error, "))
            continue
        if getpass.getpass("Repeat it: ") == password:
            return password
        print("The passwords do not match.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--use-env",
        action="store_true",
        help="remove the stored password so ADMIN_PASSWORD(_HASH) applies again",
    )
    args = parser.parse_args()

    db = get_database()
    if args.use_env:
        db.admin_credentials.update_one(
            {"_id": settings.admin_username},
            # Keep the version and bump it, so old tokens stay invalid.
            {"$unset": {"password_hash": ""}, "$inc": {"version": 1}},
            upsert=True,
        )
        print("The password from the environment applies again.")
    else:
        set_admin_password(db, _prompt_new_password())
        print("Password changed.")
    print(f"Sign in as '{settings.admin_username}'. Existing sessions were signed out.")


if __name__ == "__main__":
    main()
