"""Excel export of a form's responses.

The workbook has two sheets:

* ``Responses``: one row per faculty member, with the course code and name
  chosen for each question.
* ``Course summary``: how many faculty chose each course, per question.

Questions removed from a published form after some faculty answered them come
after the current questions, marked "(removed)".
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from io import BytesIO
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from openpyxl import Workbook
from openpyxl.cell import Cell
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

XLSX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)

HEADER_FONT = Font(bold=True, color="FFFFFF")
HEADER_FILL = PatternFill("solid", fgColor="1F4E79")
MAX_COLUMN_WIDTH = 50


def _time_zone(name: str | None) -> tuple[Any, str]:
    """The zone and its header label, e.g. "IST" for Asia/Kolkata."""
    if name:
        try:
            zone = ZoneInfo(name)
        except (ZoneInfoNotFoundError, ValueError):
            return timezone.utc, "UTC"
        # Browsers may report an old alias such as Asia/Calcutta; the
        # abbreviation reads better when there is one (some zones only have "+04").
        abbreviation = datetime.now(zone).tzname() or ""
        return zone, abbreviation if abbreviation.isalpha() else name
    return timezone.utc, "UTC"


def _local_time(value: str | None, zone: Any) -> datetime | None:
    """ISO UTC string to a naive local datetime (Excel has no time zones)."""
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.astimezone(zone).replace(tzinfo=None)


def _text(cell: Cell, value: Any) -> None:
    # Faculty type their own names and IDs. Store text as text so a value
    # such as "=HYPERLINK(...)" is shown as typed, never run as a formula.
    cell.value = value
    if isinstance(value, str):
        cell.data_type = "s"


def _columns(listing: dict[str, Any]) -> list[dict[str, Any]]:
    """Current questions in form order, then removed ones that were answered."""
    columns = [
        {"question_id": question["question_id"], "label": question["text"]}
        for question in listing.get("questions") or []
    ]
    known = {column["question_id"] for column in columns}
    for response in listing["responses"]:
        for answer in response["answers"]:
            question_id = answer["question_id"]
            if question_id not in known:
                known.add(question_id)
                label = answer.get("question_text") or question_id
                columns.append({"question_id": question_id, "label": f"{label} (removed)"})
    return columns


def _write_header(sheet: Worksheet, headers: list[str]) -> None:
    sheet.append(headers)
    for cell in sheet[1]:
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(vertical="center", wrap_text=True)


def _finish(sheet: Worksheet, freeze: str) -> None:
    sheet.freeze_panes = freeze
    if sheet.max_row > 1:
        sheet.auto_filter.ref = sheet.dimensions
    for index, column in enumerate(sheet.iter_cols(), start=1):
        longest = max(
            (len(str(cell.value)) for cell in column if cell.value is not None),
            default=8,
        )
        sheet.column_dimensions[get_column_letter(index)].width = min(
            max(longest + 2, 10), MAX_COLUMN_WIDTH
        )


def _responses_sheet(
    sheet: Worksheet,
    listing: dict[str, Any],
    columns: list[dict[str, Any]],
    zone: Any,
    zone_name: str,
) -> None:
    headers = ["S.No", "Faculty name", "Faculty ID", f"Submitted at ({zone_name})"]
    for column in columns:
        headers += [f"{column['label']} - Code", f"{column['label']} - Course"]
    _write_header(sheet, headers)

    # Oldest first reads naturally in a spreadsheet; the page shows newest first.
    for number, response in enumerate(reversed(listing["responses"]), start=1):
        by_question = {answer["question_id"]: answer for answer in response["answers"]}
        values: list[Any] = [
            number,
            response["faculty_name"],
            response["faculty_id"],
            _local_time(response["submitted_at"], zone),
        ]
        for column in columns:
            answer = by_question.get(column["question_id"])
            if answer is None:
                values += [None, None]
            elif answer.get("course_code"):
                values += [answer["course_code"], answer.get("course_name")]
            else:
                values += [None, "Course no longer available"]

        row = sheet.max_row + 1
        for offset, value in enumerate(values, start=1):
            _text(sheet.cell(row=row, column=offset), value)
        sheet.cell(row=row, column=4).number_format = "yyyy-mm-dd hh:mm"

    _finish(sheet, "E2")


def _summary_sheet(
    sheet: Worksheet, listing: dict[str, Any], columns: list[dict[str, Any]]
) -> None:
    _write_header(
        sheet,
        ["Course code", "Course name", "Semester"]
        + [column["label"] for column in columns]
        + ["Total"],
    )

    courses: dict[str, dict[str, Any]] = {}
    for response in listing["responses"]:
        for answer in response["answers"]:
            if not answer.get("course_code"):
                continue
            entry = courses.setdefault(
                answer["course_id"],
                {
                    "code": answer["course_code"],
                    "name": answer.get("course_name"),
                    "semester": answer.get("semester"),
                    "counts": {},
                },
            )
            counts = entry["counts"]
            counts[answer["question_id"]] = counts.get(answer["question_id"], 0) + 1

    ranked = sorted(
        courses.values(),
        key=lambda entry: (-sum(entry["counts"].values()), entry["code"]),
    )
    for entry in ranked:
        values = [entry["code"], entry["name"], entry["semester"]]
        values += [entry["counts"].get(column["question_id"], 0) for column in columns]
        values.append(sum(entry["counts"].values()))
        row = sheet.max_row + 1
        for offset, value in enumerate(values, start=1):
            _text(sheet.cell(row=row, column=offset), value)

    _finish(sheet, "C2")


def responses_workbook(listing: dict[str, Any], time_zone: str | None = None) -> bytes:
    """Build the .xlsx file for a response listing from the forms router."""
    zone, zone_name = _time_zone(time_zone)
    columns = _columns(listing)

    workbook = Workbook()
    responses = workbook.active
    responses.title = "Responses"
    _responses_sheet(responses, listing, columns, zone, zone_name)
    _summary_sheet(workbook.create_sheet("Course summary"), listing, columns)

    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def export_filename(title: str) -> str:
    """A safe download name such as ``Faculty-Preferences-responses.xlsx``."""
    slug = re.sub(r"[^A-Za-z0-9]+", "-", title or "").strip("-")[:80]
    return f"{slug or 'form'}-responses.xlsx"
