import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import {
  CopyLinkButton,
  ErrorBanner,
  Loading,
  StatusBadge,
} from "../components";
import { formatDateTime, publicUrlForForm } from "../utils";

export default function ResponsesPage() {
  const { formId } = useParams();
  const [form, setForm] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [formData, responsesData] = await Promise.all([
        api.getForm(formId),
        api.listResponses(formId),
      ]);
      setForm(formData);
      setData(responsesData);
    } catch (requestError) {
      setError(
        requestError.status === 404
          ? "Form not found."
          : requestError.message,
      );
    } finally {
      setLoading(false);
    }
  }, [formId]);

  useEffect(() => {
    load();
  }, [load]);

  const publicUrl = publicUrlForForm(form);

  return (
    <div>
      <div className="page-header">
        <div>
          <Link className="text-link" to="/admin/forms">
            ← All forms
          </Link>
          <div className="row row-wrap">
            <h1 className="page-title">
              {form?.title || "Form responses"}
            </h1>
            {form ? <StatusBadge status={form.status} /> : null}
          </div>
          <p className="muted">
            {data
              ? `${data.total} ${data.total === 1 ? "response" : "responses"}`
              : "Review submitted faculty preferences."}
          </p>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={load}
            disabled={loading}
          >
            Refresh
          </button>
          {form?.status === "published" ? (
            <Link
              className="btn btn-secondary"
              to={`/admin/forms/${formId}/edit`}
            >
              View form
            </Link>
          ) : null}
          {publicUrl ? <CopyLinkButton url={publicUrl} /> : null}
          {publicUrl ? (
            <a
              className="btn btn-secondary"
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open form
            </a>
          ) : null}
        </div>
      </div>

      <ErrorBanner error={error} />

      {loading ? (
        <Loading label="Loading responses…" />
      ) : error ? null : !data || data.responses.length === 0 ? (
        <div className="empty-state card">
          <h2>No responses yet</h2>
          <p className="muted">
            {form?.status === "published"
              ? "Responses will appear here as faculty submit the public form."
              : "Publish this form and share the public link to start collecting responses."}
          </p>
          {form?.status === "draft" ? (
            <Link className="btn btn-primary" to={`/admin/forms/${formId}/edit`}>
              Open draft form
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="responses-list">
          {data.responses.map((response) => (
            <article className="card response-card" key={response.response_id}>
              <div className="response-head">
                <div>
                  <h2>{response.faculty_name}</h2>
                  <p className="muted">
                    Faculty ID: <strong>{response.faculty_id}</strong>
                  </p>
                </div>
                <div className="response-meta">
                  <span>{formatDateTime(response.submitted_at)}</span>
                  <code className="small">{response.response_id}</code>
                </div>
              </div>

              <div className="answers">
                {response.answers.map((answer) => (
                  <div
                    className="answer-row"
                    key={`${response.response_id}-${answer.question_id}`}
                  >
                    <div className="answer-question">
                      {answer.question_text || answer.question_id}
                    </div>
                    <div className="answer-course">
                      {answer.course_code ? (
                        <>
                          <strong>{answer.course_code}</strong>{" "}
                          {answer.course_name}
                          {answer.semester ? (
                            <span className="pill">Sem {answer.semester}</span>
                          ) : null}
                        </>
                      ) : (
                        <span className="muted">
                          Selected course is no longer available
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
