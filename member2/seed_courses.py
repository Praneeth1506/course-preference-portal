
import os
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient

# Load connection settings from member2/.env
load_dotenv(Path(__file__).with_name(".env"))

MONGODB_URL = os.getenv("MONGODB_URL")
DATABASE_NAME = os.getenv(
    "DATABASE_NAME",
    "course_preference_portal"
)

SAMPLE_COURSES = [
    {"course_code": "23N501", "course_name": "Machine Learning", "semester": 5},
    {"course_code": "23N502", "course_name": "Database Management Systems", "semester": 5},
    {"course_code": "23N503", "course_name": "Operating Systems", "semester": 5},
    {"course_code": "23N504", "course_name": "Computer Networks", "semester": 5},
    {"course_code": "23N401", "course_name": "Data Structures", "semester": 4},
    {"course_code": "23N402", "course_name": "Design and Analysis of Algorithms", "semester": 4},
    {"course_code": "23N301", "course_name": "Object Oriented Programming", "semester": 3},
    {"course_code": "23N302", "course_name": "Computer Organization", "semester": 3},
]


def seed_courses():
    if not MONGODB_URL:
        raise RuntimeError("MONGODB_URL is missing from member2/.env")

    client = MongoClient(
        MONGODB_URL,
        serverSelectionTimeoutMS=10000
    )

    try:
        client.admin.command("ping")
        db = client[DATABASE_NAME]
        courses = db["courses"]

        courses.create_index("course_code", unique=True)

        for course in SAMPLE_COURSES:
            courses.update_one(
                {"course_code": course["course_code"]},
                {"$set": course},
                upsert=True
            )

        print("Sample courses seeded successfully!")
        print("Total courses:", courses.count_documents({}))

    finally:
        client.close()


if __name__ == "__main__":
    seed_courses()
