import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { ErrorBanner, Loading, Notice } from "../components";

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
const CODE_PATTERN = /^[A-Za-z0-9_-]+$/;

const EMPTY_DRAFT = {
  course_code: "",
  course_name: "",
  offered_by: "",
  semester: "",
  credits: "3",
};

function draftFromCourse(course) {
  return {
    course_code: course.course_code,
    course_name: course.course_name,
    offered_by: course.offered_by || "",
    semester: course.semester ? String(course.semester) : "",
    credits: course.credits === null || course.credits === undefined ? "" : String(course.credits),
  };
}

function draftProblems(draft) {
  const problems = [];
  if (!draft.course_code.trim()) problems.push("Enter a course code.");
  else if (!CODE_PATTERN.test(draft.course_code.trim())) {
    problems.push("Course codes may use letters, digits, - and _ only.");
  }
  if (!draft.course_name.trim()) problems.push("Enter a course name.");
  return problems;
}

/** Request body for POST/PUT /api/courses/open-electives (backend OpenElectiveInput). */
function payloadFromDraft(draft) {
  return {
    course_code: draft.course_code.trim(),
    course_name: draft.course_name.trim(),
    offered_by: draft.offered_by.trim() || null,
    semester: draft.semester === "" ? null : Number(draft.semester),
    credits: draft.credits === "" ? null : Number(draft.credits),
  };
}

export default function OpenElectivesPage() {
  const [electives, setElectives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState(null);
  const [problems, setProblems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.listCourses({ category: "OE" });
      setElectives(data.courses || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setProblems([]);
  };

  const updateDraft = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setError("");
    setNotice("");
    const found = draftProblems(draft);
    setProblems(found);
    if (found.length > 0) return;

    setSaving(true);
    try {
      const payload = payloadFromDraft(draft);
      const saved = editingId
        ? await api.updateOpenElective(editingId, payload)
        : await api.createOpenElective(payload);
      setNotice(
        `${saved.course_code} ${editingId ? "updated" : "added"}. It is now available when adding questions.`,
      );
      resetForm();
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (course) => {
    setDraft(draftFromCourse(course));
    setEditingId(course.course_id);
    setProblems([]);
    setNotice("");
    setError("");
  };

  const handleDelete = async (course) => {
    if (deletingId) return;
    if (!window.confirm(`Delete ${course.course_code} ${course.course_name}?`)) {
      return;
    }
    setDeletingId(course.course_id);
    setError("");
    setNotice("");
    try {
      await api.deleteOpenElective(course.course_id);
      if (editingId === course.course_id) resetForm();
      setNotice(`${course.course_code} deleted.`);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeletingId(null);
    }
  };

  const manual = electives.filter((course) => course.source === "manual");
  const fromRegulation = electives.filter((course) => course.source !== "manual");

  const renderRow = (course) => {
    const editable = course.source === "manual";
    return (
      <li className="elective-row" key={course.course_id}>
        <div>
          <strong>{course.course_code}</strong> {course.course_name}
          <div className="muted small">
            {[
              course.offered_by,
              course.semester ? `Semester ${course.semester}` : "Any semester",
              course.credits !== null && course.credits !== undefined
                ? `${course.credits} credits`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        {editable ? (
          <div className="actions">
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => handleEdit(course)}
              disabled={saving}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-small btn-danger-quiet"
              onClick={() => handleDelete(course)}
              disabled={deletingId === course.course_id}
            >
              {deletingId === course.course_id ? "Deleting…" : "Delete"}
            </button>
          </div>
        ) : (
          <span className="pill">2023 Regulation</span>
        )}
      </li>
    );
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Open electives</h1>
          <p className="muted">
            Add open electives offered by other departments. They appear with
            the other courses when you build a form.
          </p>
        </div>
      </div>

      <ErrorBanner error={error} />
      <Notice>{notice}</Notice>

      <form className="card elective-form" onSubmit={handleSubmit} noValidate>
        <h2>{editingId ? "Edit open elective" : "Add an open elective"}</h2>
        {problems.length > 0 ? (
          <div className="alert alert-error" role="alert">
            <ul className="issue-list">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="elective-grid">
          <div className="field">
            <label htmlFor="oe-code">Course code</label>
            <input
              id="oe-code"
              className="input"
              value={draft.course_code}
              maxLength={20}
              onChange={(event) => updateDraft("course_code", event.target.value)}
              placeholder="e.g. 23MO01"
            />
          </div>
          <div className="field">
            <label htmlFor="oe-name">Course name</label>
            <input
              id="oe-name"
              className="input"
              value={draft.course_name}
              maxLength={200}
              onChange={(event) => updateDraft("course_name", event.target.value)}
              placeholder="e.g. Principles of Management"
            />
          </div>
          <div className="field">
            <label htmlFor="oe-dept">
              Offered by <span className="muted">(optional)</span>
            </label>
            <input
              id="oe-dept"
              className="input"
              value={draft.offered_by}
              maxLength={200}
              onChange={(event) => updateDraft("offered_by", event.target.value)}
              placeholder="e.g. Department of Mechanical Engineering"
            />
          </div>
          <div className="field">
            <label htmlFor="oe-semester">Semester</label>
            <select
              id="oe-semester"
              className="input"
              value={draft.semester}
              onChange={(event) => updateDraft("semester", event.target.value)}
            >
              <option value="">Any semester</option>
              {SEMESTERS.map((semester) => (
                <option key={semester} value={semester}>
                  Semester {semester}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="oe-credits">Credits</label>
            <input
              id="oe-credits"
              className="input"
              type="number"
              min={0}
              max={20}
              value={draft.credits}
              onChange={(event) => updateDraft("credits", event.target.value)}
            />
          </div>
        </div>
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : editingId ? "Save changes" : "Add open elective"}
          </button>
          {editingId ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={resetForm}
              disabled={saving}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      {loading ? (
        <Loading label="Loading open electives…" />
      ) : (
        <>
          <section className="card elective-list">
            <h2>Added manually ({manual.length})</h2>
            {manual.length === 0 ? (
              <p className="muted small">No open electives added yet.</p>
            ) : (
              <ul>{manual.map(renderRow)}</ul>
            )}
          </section>
          <section className="card elective-list">
            <h2>From the 2023 Regulation ({fromRegulation.length})</h2>
            {fromRegulation.length === 0 ? (
              <p className="muted small">
                None loaded. Run <code>python -m app.seed</code> in the
                backend.
              </p>
            ) : (
              <ul>{fromRegulation.map(renderRow)}</ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
