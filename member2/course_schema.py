
from pydantic import BaseModel, Field, ConfigDict


class CourseCreate(BaseModel):
    course_code: str = Field(min_length=1)
    course_name: str = Field(min_length=1)
    semester: int = Field(ge=1, le=8)


class CourseResponse(CourseCreate):
    id: str

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "sample_course_id",
                "course_code": "23N501",
                "course_name": "Machine Learning",
                "semester": 5
            }
        }
    )
