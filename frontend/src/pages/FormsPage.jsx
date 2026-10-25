import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import {
  CopyLinkButton,
  ErrorBanner,
  Loading,
  StatusBadge,
} from "../components";
import { formatDateTime, publicUrlForForm } from "../utils";

export default function FormsPage() {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadForms = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.listForms();
      setForms(data.forms || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadForms();
  }, [loadForms]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Forms</h1>
          <p className="muted">
            Build a preference form, publish a public link, and review
            submissions.
          </p>
        </div>
        <Link className="btn btn-primary" to="/admin/forms/new">
          + New form
        </Link>
      </div>

      <ErrorBanner error={error} />

      {loading ? (
        <Loading label="Loading forms…" />
      ) : forms.length === 0 ? (
        <div className="empty-state card">
          <h2>No forms yet</h2>
          <p className="muted">
            Create your first course preference form to get started.
          </p>
          <Link className="btn btn-primary" to="/admin/forms/new">
            Create a form
          </Link>
        </div>
      ) : (
        <div className="forms-list">
          {forms.map((form) => {
            const isPublished = form.status === "published";
            const url = publicUrlForForm(form);
            return (
              <article className="card form-card" key={form.form_id}>
                <div className="form-card-head">
                  <div className="form-card-title">
                    <div className="row row-wrap">
                      <h2>{form.title}</h2>
                      <StatusBadge status={form.status} />
                    </div>
                    {form.description ? (
                      <p className="muted">{form.description}</p>
                    ) : null}
                    <div className="meta">
                      <span>
                        {form.question_count}{" "}
                        {form.question_count === 1 ? "question" : "questions"}
                      </span>
                      <span>
                        {form.response_count}{" "}
                        {form.response_count === 1 ? "response" : "responses"}
                      </span>
                      <span>Created {formatDateTime(form.created_at)}</span>
                    </div>
                  </div>

                  <div className="actions">
                    {isPublished ? (
                      <>
                        {url ? <CopyLinkButton url={url} /> : null}
                        {url ? (
                          <a
                            className="btn btn-secondary"
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open form
                          </a>
                        ) : null}
                        <Link
                          className="btn btn-secondary"
                          to={`/admin/forms/${form.form_id}/responses`}
                        >
                          Responses
                        </Link>
                      </>
                    ) : (
                      <>
                        <Link
                          className="btn btn-primary"
                          to={`/admin/forms/${form.form_id}/edit`}
                        >
                          Edit form
                        </Link>
                        <Link
                          className="btn btn-secondary"
                          to={`/admin/forms/${form.form_id}/responses`}
                        >
                          Responses
                        </Link>
                      </>
                    )}
                  </div>
                </div>

                {isPublished && url ? (
                  <div className="form-card-link">
                    <code>{url}</code>
                    <span className="muted small">
                      Published {formatDateTime(form.published_at)}
                    </span>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
