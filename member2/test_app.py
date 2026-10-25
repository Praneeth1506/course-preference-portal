
from fastapi import FastAPI

from member2.course_routes import router

app = FastAPI(
    title="Course Preference Portal - Course API",
    description="Member 2: Course data and semester filtering",
    version="1.0.0"
)

app.include_router(router)


@app.get("/")
def home():
    return {
        "message": "Course API is running!",
        "docs": "/docs"
    }
