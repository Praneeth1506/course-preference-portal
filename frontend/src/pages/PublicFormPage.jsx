import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { ErrorBanner, Loading } from "../components";

export default function PublicFormPage() {
  const { token } = useParams();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [facultyName, setFacultyName] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [selections, setSelections] = useState({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    api
      .getPublicForm(token)
      .then((data) => {
        if (active) setForm(data);
      })
      .catch((requestError) => {
        if (active) {
          setLoadError(
            requestError.status === 404
              ? "This link is invalid or the form has not been published."
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
  }, [token]);

  const selectedByCourse = useMemo(() => {
    const map = new Map();
    for (const [questionId, courseId] of Object.entries(selections)) {
      map.set(courseId, questionId);
    }
    return map;
  }, [selections]);

  const questions = form?.questions || [];
  const allQuestionsAnswered =
    questions.length > 0 &&
    questions.every(
      (question) =>
        question.courses.length > 0 &&
        Boolean(selections[question.question_id]),
    );

  const canSubmit =
    Boolean(facultyName.trim()) &&
    Boolean(facultyId.trim()) &&
    allQuestionsAnswered &&
    !submitting;

  const selectCourse = (questionId, courseId) => {
    if (selectedByCourse.get(courseId) && selectedByCourse.get(courseId) !== questionId) {
      return;
    }
    setSelections((current) => ({ ...current, [questionId]: courseId }));
    setError("");
  };

  const validate = () => {
    if (!facultyName.trim()) return "Enter your name.";
    if (!facultyId.trim()) return "Enter your faculty ID.";

    for (const question of questions) {
      if (question.courses.length === 0) {
        return "This form is not accepting responses because a question has no available courses.";
      }
      if (!selections[question.question_id]) {
        return `Select a course for question ${question.order ?? ""} (“${question.text}”).`;
      }
    }

    const courseIds = Object.values(selections);
    if (new Set(courseIds).size !== courseIds.length) {
      return "The same course cannot be selected for more than one question.";
    }
    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const result = await api.submitResponse(token, {
        faculty_name: facultyName.trim(),
        faculty_id: facultyId.trim(),
        answers: questions.map((question) => ({
          question_id: question.question_id,
          course_id: selections[question.question_id],
        })),
      });
      setSubmitted(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSubmitted(null);
    setFacultyName("");
    setFacultyId("");
    setSelections({});
    setError("");
  };

  if (loading) {
    return (
      <div className="public-page">
        <div className="public-card card">
          <Loading label="Loading form…" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="public-page">
        <div className="public-card card empty-state">
          <span className="brand-mark">CP</span>
          <h1>Form unavailable</h1>
          <p className="muted">{loadError}</p>
          <p className="muted small">
            Please check the link with the administrator who shared it.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="public-page">
        <div className="public-card card empty-state">
          <span className="success-icon" aria-hidden="true">
            ✓
          </span>
          <h1>Preferences submitted</h1>
          <p className="muted">{submitted.message}</p>
          <p className="muted small">
            Reference: <code>{submitted.response_id}</code>
          </p>
          <p className="muted small">
            You may close this page. Contact the administrator if you need to
            correct your selection.
          </p>
          <button type="button" className="btn btn-secondary" onClick={resetForm}>
            Submit another response
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="public-page">
      <header className="public-header">
        <span className="brand-mark">CP</span>
        <div>
          <strong>Course Preference Portal</strong>
          <p className="muted small">Faculty course preference form</p>
        </div>
      </header>

      <form className="public-card card" onSubmit={handleSubmit}>
        <div className="public-form-heading">
          <h1>{form.title}</h1>
          {form.description ? <p className="muted">{form.description}</p> : null}
          <p className="muted small">
            Select one course for each question. The same course cannot be
            chosen twice.
          </p>
        </div>

        <ErrorBanner error={error} />

        <section className="faculty-details" aria-label="Your details">
          <div className="field">
            <label htmlFor="faculty-name">Faculty name</label>
            <input
              id="faculty-name"
              className="input"
              value={facultyName}
              maxLength={200}
              onChange={(event) => setFacultyName(event.target.value)}
              placeholder="Your full name"
              autoComplete="name"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="faculty-id">Faculty ID</label>
            <input
              id="faculty-id"
              className="input"
              value={facultyId}
              maxLength={100}
              onChange={(event) => setFacultyId(event.target.value)}
              placeholder="e.g. FAC001"
              required
            />
          </div>
        </section>

        <div className="public-questions">
          {questions.map((question, index) => (
            <fieldset className="question-block" key={question.question_id}>
              <legend>
                <span className="question-number">{index + 1}</span>
                <span>{question.text}</span>
              </legend>

              {question.courses.length === 0 ? (
                <p className="alert alert-error">
                  No courses are currently available for this question.
                </p>
              ) : (
                <div className="radio-list">
                  {question.courses.map((course) => {
                    const selectedIn = selectedByCourse.get(course.course_id);
                    const usedElsewhere =
                      selectedIn && selectedIn !== question.question_id;
                    const checked =
                      selections[question.question_id] === course.course_id;
                    return (
                      <label
                        key={course.course_id}
                        className={`radio-row ${checked ? "checked" : ""} ${
                          usedElsewhere ? "disabled" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name={`question-${question.question_id}`}
                          value={course.course_id}
                          checked={checked}
                          disabled={Boolean(usedElsewhere) || submitting}
                          onChange={() =>
                            selectCourse(question.question_id, course.course_id)
                          }
                        />
                        <span className="radio-main">
                          <strong>{course.course_code}</strong>
                          <span>{course.course_name}</span>
                        </span>
                        {course.semester ? (
                          <span className="pill">Sem {course.semester}</span>
                        ) : null}
                        {usedElsewhere ? (
                          <span className="muted small">
                            Selected in another question
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>
          ))}
        </div>

        {!allQuestionsAnswered && !error ? (
          <p className="muted small">
            Complete your details and select one course per question to submit.
          </p>
        ) : null}

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={!canSubmit}
        >
          {submitting ? "Submitting…" : "Submit preferences"}
        </button>
      </form>
    </div>
  );
}
