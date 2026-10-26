import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import {
  ErrorBanner,
  Loading,
  Notice,
  SharePanel,
  StatusBadge,
} from "../components";
import {
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  buildFormPayload,
  clampQuestionCount,
  courseAssignments,
  coursesForSemester,
  defaultQuestionText,
  removeCourse,
  resizeQuestions,
  semestersFromCourses,
  setQuestionSemester,
  toggleCourse,
  validateBuilder,
} from "../formBuilderLogic";
import { publicUrlForForm } from "../utils";

function makeKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random()}`;
}

function newQuestion() {
  return {
    key: makeKey(),
    question_id: null,
    text: "",
    course_ids: [],
    semester: null,
  };
}

function groupBySemester(courses) {
  const groups = new Map();
  for (const course of courses) {
    const key = course.semester ?? "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(course);
  }
  return [...groups.entries()].sort((first, second) => {
    if (first[0] === "unknown") return 1;
    if (second[0] === "unknown") return -1;
    return first[0] - second[0];
  });
}

export default function FormBuilderPage() {
  const { formId } = useParams();
  const navigate = useNavigate();
  const isNew = !formId;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState(() => [newQuestion()]);
  const [countInput, setCountInput] = useState("1");
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [published, setPublished] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState("");
  const [coursesError, setCoursesError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [questionNotices, setQuestionNotices] = useState({});
  const [showIssues, setShowIssues] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .listCourses()
      .then((data) => {
        if (active) setCourses(data.courses || []);
      })
      .catch((requestError) => {
        if (active) setCoursesError(requestError.message);
      })
      .finally(() => {
        if (active) setCoursesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!formId) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    setLoadError("");
    api
      .getForm(formId)
      .then((data) => {
        if (!active) return;
        setForm(data);
        setTitle(data.title || "");
        setDescription(data.description || "");
        const loaded = (data.questions || []).map((question) => ({
          key: makeKey(),
          question_id: question.question_id,
          text: question.text || "",
          course_ids: Array.isArray(question.course_ids)
            ? [...question.course_ids]
            : [],
          semester: question.semester ?? null,
        }));
        setQuestions(loaded.length > 0 ? loaded : [newQuestion()]);
        setCountInput(String(Math.max(loaded.length, MIN_QUESTIONS)));
        if (data.status === "published") {
          setPublished({
            form_id: data.form_id,
            status: "published",
            public_token: data.public_token,
            public_url: data.public_url,
          });
        }
      })
      .catch((requestError) => {
        if (active) {
          setLoadError(
            requestError.status === 404
              ? "Form not found."
              : requestError.message,
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [formId]);

  const semesters = useMemo(() => semestersFromCourses(courses), [courses]);
  const courseById = useMemo(
    () => new Map(courses.map((course) => [course.course_id, course])),
    [courses],
  );
  const assignments = useMemo(() => courseAssignments(questions), [questions]);

  const issues = validateBuilder({
    title,
    questions,
    courses,
    coursesLoaded: !coursesLoading && !coursesError,
  });
  const busy = saving || publishing;

  // Always works from the latest questions, so the count box, add/remove and
  // move buttons can never disagree about how many questions exist.
  const replaceQuestions = (next) => {
    setQuestions(next);
    setCountInput(String(next.length));
  };

  const handleCountChange = (value) => {
    setCountInput(value);
    if (value === "") return;
    const target = clampQuestionCount(value);
    const removed = questions
      .slice(target)
      .reduce((total, question) => total + question.course_ids.length, 0);
    setQuestions(resizeQuestions(questions, target, newQuestion));
    setNotice(
      removed > 0
        ? `Removed ${questions.length - target} question(s) and their ${removed} course selection(s).`
        : "",
    );
  };

  const handleCountBlur = () => {
    setCountInput(String(questions.length));
  };

  const updateQuestion = (index, changes) => {
    setQuestions((current) =>
      current.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...changes } : question,
      ),
    );
  };

  const handleSemesterChange = (index, value) => {
    const semester = value === "" ? null : Number(value);
    const result = setQuestionSemester(questions, index, semester, courses);
    setQuestions(result.questions);
    const key = questions[index].key;
    setQuestionNotices((current) => ({
      ...current,
      [key]:
        result.removedCount > 0
          ? `Removed ${result.removedCount} selected course(s) that are not in Semester ${semester}.`
          : "",
    }));
  };

  const moveQuestion = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    replaceQuestions(next);
  };

  const persist = async ({ redirectIfNew = true } = {}) => {
    const payload = buildFormPayload({ title, description, questions });
    const saved = formId
      ? await api.updateForm(formId, payload)
      : await api.createForm(payload);
    setForm(saved);
    if (!formId && redirectIfNew) {
      navigate(`/admin/forms/${saved.form_id}/edit`, { replace: true });
    }
    return saved;
  };

  // Returns false (and shows the issue list) when the form is not ready to send.
  const checkReady = () => {
    setError("");
    setNotice("");
    setQuestionNotices({});
    if (issues.length > 0) {
      setShowIssues(true);
      return false;
    }
    setShowIssues(false);
    return true;
  };

  const handleSave = async () => {
    if (busy || !checkReady()) return;
    setSaving(true);
    try {
      await persist();
      setNotice("Draft saved.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (busy || !checkReady()) return;
    setPublishing(true);
    try {
      const saved = await persist({ redirectIfNew: false });
      const result = await api.publishForm(saved.form_id);
      setPublished(result);
      setForm({ ...saved, ...result, status: "published" });
      setNotice("Form published. The public link is ready to share.");
      if (isNew) {
        navigate(`/admin/forms/${saved.form_id}/edit`, { replace: true });
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return <Loading label="Loading form…" />;
  }

  if (loadError) {
    return (
      <div>
        <ErrorBanner error={loadError} />
        <Link className="btn btn-secondary" to="/admin/forms">
          ← Back to forms
        </Link>
      </div>
    );
  }

  const isPublished = Boolean(published) || form?.status === "published";

  if (isPublished) {
    const publicUrl = published?.public_url || publicUrlForForm(form);
    const displayQuestions = form?.questions || [];
    const activeFormId = formId || published?.form_id;

    return (
      <div>
        <div className="page-header">
          <div>
            <Link className="text-link" to="/admin/forms">
              ← All forms
            </Link>
            <div className="row row-wrap">
              <h1 className="page-title">{form?.title || title}</h1>
              <StatusBadge status="published" />
            </div>
            <p className="muted">
              {form?.description ||
                description ||
                "This form is published and cannot be edited."}
            </p>
          </div>
          <div className="actions">
            <Link
              className="btn btn-primary"
              to={`/admin/forms/${activeFormId}/responses`}
            >
              View responses
            </Link>
          </div>
        </div>

        <Notice>{notice}</Notice>
        <ErrorBanner error={error} />
        <SharePanel url={publicUrl} formId={activeFormId} />

        <section className="published-questions">
          <h2>Questions</h2>
          {displayQuestions.length === 0 ? (
            <p className="muted">This form has no questions.</p>
          ) : (
            displayQuestions.map((question, index) => (
              <article className="card question-card" key={question.question_id}>
                <div className="question-head">
                  <span className="question-number">{index + 1}</span>
                  <div>
                    <h3>{question.text}</h3>
                    <p className="muted small">
                      Question ID: <code>{question.question_id}</code>
                    </p>
                  </div>
                </div>
                <div className="course-chips">
                  {(question.courses || []).map((course) => (
                    <span className="chip" key={course.course_id}>
                      {course.course_code} · {course.course_name}
                      {course.semester ? ` (Sem ${course.semester})` : ""}
                    </span>
                  ))}
                  {(question.courses || []).length === 0 ? (
                    <span className="muted small">
                      No available courses for this question.
                    </span>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    );
  }


  const actionBar = (
    <div className="sticky-actions">
      <div className="sticky-actions-inner">
        <p className="muted small">
          {issues.length === 0
            ? "Ready to save or publish."
            : `${issues.length} item(s) need attention before saving.`}
        </p>
        <div className="actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setPreviewing((current) => !current)}
            disabled={busy}
          >
            {previewing ? "Back to editing" : "Preview"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSave}
            disabled={busy}
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handlePublish}
            disabled={busy}
          >
            {publishing ? "Publishing…" : "Publish form"}
          </button>
        </div>
      </div>
    </div>
  );

  const issueList =
    showIssues && issues.length > 0 ? (
      <div className="alert alert-error" role="alert">
        <strong>Fix these before saving:</strong>
        <ul className="issue-list">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      </div>
    ) : null;

  const courseLabel = (courseId) => {
    const course = courseById.get(courseId);
    return course
      ? `${course.course_code} · ${course.course_name}`
      : "Unknown course";
  };

  if (previewing) {
    return (
      <div>
        <div className="page-header">
          <div>
            <p className="muted small">Preview — not saved yet</p>
            <h1 className="page-title">{title.trim() || "Untitled form"}</h1>
            {description.trim() ? (
              <p className="muted">{description.trim()}</p>
            ) : null}
          </div>
          <StatusBadge status="draft" />
        </div>

        <ErrorBanner error={error} />
        <Notice>{notice}</Notice>
        {issueList}

        <section className="published-questions">
          {questions.map((question, index) => (
            <article className="card question-card" key={question.key}>
              <div className="question-head">
                <span className="question-number">{index + 1}</span>
                <div>
                  <h3>{question.text.trim() || defaultQuestionText(index)}</h3>
                  <p className="muted small">
                    {question.semester
                      ? `Semester ${question.semester} courses`
                      : "Courses from any semester"}
                  </p>
                </div>
              </div>
              <div className="course-chips">
                {question.course_ids.map((courseId) => (
                  <span className="chip" key={courseId}>
                    {courseLabel(courseId)}
                  </span>
                ))}
                {question.course_ids.length === 0 ? (
                  <span className="muted small">No courses selected.</span>
                ) : null}
              </div>
            </article>
          ))}
        </section>

        {actionBar}
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <Link className="text-link" to="/admin/forms">
            ← All forms
          </Link>
          <h1 className="page-title">
            {isNew ? "New form" : "Edit draft form"}
          </h1>
          <p className="muted">
            Set the number of questions, choose the courses faculty can pick
            for each, preview, then save or publish.
          </p>
        </div>
        <StatusBadge status="draft" />
      </div>

      <ErrorBanner error={error} />
      <Notice>{notice}</Notice>
      {issueList}
      <ErrorBanner
        error={coursesError && `Courses could not be loaded: ${coursesError}`}
      />

      <section className="card form-details">
        <div className="field">
          <label htmlFor="form-title">Form title</label>
          <input
            id="form-title"
            className="input"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Faculty Course Preferences - Fall 2026"
          />
        </div>
        <div className="field">
          <label htmlFor="form-description">
            Description <span className="muted">(optional)</span>
          </label>
          <textarea
            id="form-description"
            className="input textarea"
            value={description}
            maxLength={2000}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Explain what faculty should select."
            rows={3}
          />
        </div>
        <div className="field question-count-field">
          <label htmlFor="question-count">Number of preference questions</label>
          <input
            id="question-count"
            className="input question-count-input"
            type="number"
            min={MIN_QUESTIONS}
            max={MAX_QUESTIONS}
            value={countInput}
            onChange={(event) => handleCountChange(event.target.value)}
            onBlur={handleCountBlur}
          />
          <p className="muted small">
            Between {MIN_QUESTIONS} and {MAX_QUESTIONS}. Lowering the number
            removes the last questions and their course selections.
          </p>
        </div>
      </section>

      <div className="section-heading">
        <h2>Preference questions</h2>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => replaceQuestions([...questions, newQuestion()])}
          disabled={questions.length >= MAX_QUESTIONS}
        >
          + Add question
        </button>
      </div>

      <div className="questions-editor">
        {questions.map((question, index) => {
          const available = coursesForSemester(courses, question.semester);
          return (
            <article className="card question-card" key={question.key}>
              <div className="question-head">
                <span className="question-number">{index + 1}</span>
                <div className="question-head-main">
                  <div className="field">
                    <label htmlFor={`question-${question.key}`}>
                      Question text <span className="muted">(optional)</span>
                    </label>
                    <input
                      id={`question-${question.key}`}
                      className="input"
                      value={question.text}
                      maxLength={500}
                      onChange={(event) =>
                        updateQuestion(index, { text: event.target.value })
                      }
                      placeholder={defaultQuestionText(index)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`semester-${question.key}`}>
                      Semester
                    </label>
                    <select
                      id={`semester-${question.key}`}
                      className="input semester-select"
                      value={question.semester ?? ""}
                      onChange={(event) =>
                        handleSemesterChange(index, event.target.value)
                      }
                      disabled={coursesLoading || Boolean(coursesError)}
                    >
                      <option value="">All semesters</option>
                      {semesters.map((semester) => (
                        <option key={semester} value={semester}>
                          Semester {semester}
                        </option>
                      ))}
                      {question.semester !== null &&
                      !semesters.includes(question.semester) ? (
                        <option value={question.semester}>
                          Semester {question.semester}
                        </option>
                      ) : null}
                    </select>
                  </div>
                </div>
                <div className="question-controls">
                  <button
                    type="button"
                    className="btn btn-icon"
                    onClick={() => moveQuestion(index, -1)}
                    disabled={index === 0}
                    aria-label="Move question up"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon"
                    onClick={() => moveQuestion(index, 1)}
                    disabled={index === questions.length - 1}
                    aria-label="Move question down"
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon btn-danger-quiet"
                    onClick={() =>
                      replaceQuestions(
                        questions.filter(
                          (_, questionIndex) => questionIndex !== index,
                        ),
                      )
                    }
                    disabled={questions.length <= MIN_QUESTIONS}
                    aria-label="Remove question"
                    title="Remove question"
                  >
                    ×
                  </button>
                </div>
              </div>

              <Notice>{questionNotices[question.key]}</Notice>

              <div className="field">
                <span className="field-label">
                  Selected courses{" "}
                  <span className="muted">
                    ({question.course_ids.length})
                  </span>
                </span>
                <div className="course-chips">
                  {question.course_ids.map((courseId) => (
                    <span className="chip chip-removable" key={courseId}>
                      {courseLabel(courseId)}
                      <button
                        type="button"
                        className="chip-remove"
                        onClick={() =>
                          setQuestions(removeCourse(questions, index, courseId))
                        }
                        aria-label={`Remove ${courseLabel(courseId)}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {question.course_ids.length === 0 ? (
                    <span className="muted small">
                      None yet. Pick at least one course below.
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="field">
                <span className="field-label">Available courses</span>
                {coursesLoading ? <Loading label="Loading courses…" /> : null}
                {!coursesLoading && coursesError ? (
                  <p className="muted small">
                    Courses are unavailable. Check that the backend is running,
                    then refresh the page.
                  </p>
                ) : null}
                {!coursesLoading && !coursesError && courses.length === 0 ? (
                  <p className="muted small">
                    The course catalogue is empty. Seed it with{" "}
                    <code>python -m app.seed</code> in the backend.
                  </p>
                ) : null}
                {!coursesLoading &&
                courses.length > 0 &&
                available.length === 0 ? (
                  <p className="muted small">
                    No courses are available for Semester {question.semester}.
                    Choose another semester.
                  </p>
                ) : null}
                <div className="course-picker">
                  {groupBySemester(available).map(
                    ([semester, semesterCourses]) => (
                      <div className="course-group" key={semester}>
                        <p className="course-group-title">
                          {semester === "unknown"
                            ? "Other courses"
                            : `Semester ${semester}`}
                        </p>
                        <div className="course-options">
                          {semesterCourses.map((course) => {
                            const checked = question.course_ids.includes(
                              course.course_id,
                            );
                            const owner = assignments.get(course.course_id);
                            const takenElsewhere =
                              owner !== undefined && owner !== index;
                            return (
                              <label
                                className={`checkbox-row ${checked ? "checked" : ""} ${takenElsewhere ? "taken" : ""}`}
                                key={course.course_id}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={takenElsewhere}
                                  onChange={() =>
                                    setQuestions(
                                      toggleCourse(
                                        questions,
                                        index,
                                        course.course_id,
                                      ),
                                    )
                                  }
                                />
                                <span>
                                  <strong>{course.course_code}</strong>{" "}
                                  {course.course_name}
                                  {takenElsewhere ? (
                                    <span className="muted small">
                                      {" "}
                                      — used in Question {owner + 1}
                                    </span>
                                  ) : null}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {actionBar}
    </div>
  );
}
