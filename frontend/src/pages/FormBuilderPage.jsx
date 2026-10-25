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

export default function FormBuilderPage() {
  const { formId } = useParams();
  const navigate = useNavigate();
  const isNew = !formId;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState(() => [newQuestion()]);
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState(null);
  const [published, setPublished] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState("");
  const [coursesError, setCoursesError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
        setQuestions(
          (data.questions || []).map((question) => ({
            key: makeKey(),
            question_id: question.question_id,
            text: question.text || "",
            course_ids: Array.isArray(question.course_ids)
              ? [...question.course_ids]
              : [],
            semester: question.semester ?? null,
          })),
        );
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

  const coursesBySemester = useMemo(() => {
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
  }, [courses]);

  const canSave =
    Boolean(title.trim()) && questions.every((question) => question.text.trim());

  const canPublish =
    canSave &&
    questions.length > 0 &&
    questions.every((question) => question.course_ids.length > 0);

  const buildPayload = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      throw new Error("Form title is required.");
    }

    const payloadQuestions = questions.map((question, index) => {
      const text = question.text.trim();
      if (!text) {
        throw new Error(`Question ${index + 1} needs text.`);
      }
      return {
        question_id: question.question_id || undefined,
        text,
        course_ids: question.course_ids,
        semester: question.semester ?? null,
      };
    });

    return {
      title: trimmedTitle,
      description: description.trim() || null,
      questions: payloadQuestions,
    };
  };

  const persist = async ({ redirectIfNew = true } = {}) => {
    const payload = buildPayload();
    const saved = formId
      ? await api.updateForm(formId, payload)
      : await api.createForm(payload);
    setForm(saved);
    if (!formId && redirectIfNew) {
      navigate(`/admin/forms/${saved.form_id}/edit`, { replace: true });
    }
    return saved;
  };

  const handleSave = async () => {
    setError("");
    setNotice("");
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
    setError("");
    setNotice("");
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

  const updateQuestion = (index, changes) => {
    setQuestions((current) =>
      current.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...changes } : question,
      ),
    );
  };

  const toggleCourse = (index, courseId) => {
    setQuestions((current) =>
      current.map((question, questionIndex) => {
        if (questionIndex !== index) return question;
        const selected = question.course_ids.includes(courseId);
        return {
          ...question,
          course_ids: selected
            ? question.course_ids.filter((id) => id !== courseId)
            : [...question.course_ids, courseId],
        };
      }),
    );
  };

  const moveQuestion = (index, direction) => {
    setQuestions((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
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
            Add questions, choose the courses faculty can pick, then publish.
          </p>
        </div>
        <StatusBadge status="draft" />
      </div>

      <ErrorBanner error={error} />
      <Notice>{notice}</Notice>
      <ErrorBanner error={coursesError} />

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
      </section>

      <div className="section-heading">
        <h2>Preference questions</h2>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setQuestions((current) => [...current, newQuestion()])}
        >
          + Add question
        </button>
      </div>

      {questions.length === 0 ? (
        <div className="empty-state card">
          <p className="muted">
            Add at least one question before publishing this form.
          </p>
        </div>
      ) : null}

      <div className="questions-editor">
        {questions.map((question, index) => (
          <article className="card question-card" key={question.key}>
            <div className="question-head">
              <span className="question-number">{index + 1}</span>
              <div className="question-head-main">
                <div className="field">
                  <label htmlFor={`question-${question.key}`}>
                    Question text
                  </label>
                  <input
                    id={`question-${question.key}`}
                    className="input"
                    value={question.text}
                    maxLength={500}
                    onChange={(event) =>
                      updateQuestion(index, { text: event.target.value })
                    }
                    placeholder="e.g. Preferred course for Semester 3 teaching"
                  />
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
                    setQuestions((current) =>
                      current.filter(
                        (_, questionIndex) => questionIndex !== index,
                      ),
                    )
                  }
                  aria-label="Remove question"
                  title="Remove question"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="field">
              <span className="field-label">
                Allowed courses{" "}
                <span className="muted">
                  ({question.course_ids.length} selected)
                </span>
              </span>
              {courses.length === 0 && !coursesError ? (
                <p className="muted small">Loading courses…</p>
              ) : null}
              {courses.length === 0 && coursesError ? (
                <p className="muted small">
                  Courses could not be loaded. Run the backend seed script and
                  refresh.
                </p>
              ) : null}
              <div className="course-picker">
                {coursesBySemester.map(([semester, semesterCourses]) => (
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
                        return (
                          <label
                            className={`checkbox-row ${checked ? "checked" : ""}`}
                            key={course.course_id}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                toggleCourse(index, course.course_id)
                              }
                            />
                            <span>
                              <strong>{course.course_code}</strong>{" "}
                              {course.course_name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="sticky-actions">
        <div className="sticky-actions-inner">
          <p className="muted small">
            {canPublish
              ? "Ready to publish."
              : "To publish, add a title and ensure every question has text and at least one course."}
          </p>
          <div className="actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleSave}
              disabled={!canSave || saving || publishing}
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handlePublish}
              disabled={!canPublish || saving || publishing}
            >
              {publishing ? "Publishing…" : "Publish form"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
