import { useState } from "react";
import { Link } from "react-router-dom";

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("Clipboard copy failed");
}

export function StatusBadge({ status }) {
  const isPublished = status === "published";
  return (
    <span className={`badge ${isPublished ? "badge-published" : "badge-draft"}`}>
      {isPublished ? "Published" : "Draft"}
    </span>
  );
}

export function ErrorBanner({ error }) {
  if (!error) return null;
  return (
    <div className="alert alert-error" role="alert">
      {error}
    </div>
  );
}

export function Notice({ children }) {
  if (!children) return null;
  return (
    <div className="alert alert-success" role="status">
      {children}
    </div>
  );
}

export function Loading({ label = "Loading…" }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function FullPageLoading({ label = "Loading…" }) {
  return (
    <div className="full-page-loading">
      <Loading label={label} />
    </div>
  );
}

export function CopyLinkButton({ url, label = "Copy link" }) {
  const [state, setState] = useState("idle");

  const handleCopy = async () => {
    try {
      await copyText(url);
      setState("copied");
      window.setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("error");
    }
  };

  return (
    <span className="copy-wrap">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={handleCopy}
        disabled={!url}
      >
        {state === "copied" ? "Copied!" : label}
      </button>
      {state === "error" ? (
        <span className="copy-error" role="alert">
          Copy failed. Select and copy the link manually.
        </span>
      ) : null}
    </span>
  );
}

export function SharePanel({ url, formId }) {
  if (!url) return null;
  return (
    <section className="share-panel" aria-label="Public sharing link">
      <div className="share-panel-head">
        <div>
          <h3>Public link is ready</h3>
          <p className="muted">
            Share this link with faculty. They do not need an account.
          </p>
        </div>
        <StatusBadge status="published" />
      </div>
      <div className="share-row">
        <input
          className="input share-link"
          value={url}
          readOnly
          aria-label="Public form link"
          onFocus={(event) => event.target.select()}
        />
        <CopyLinkButton url={url} />
        <a
          className="btn btn-secondary"
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          Open form
        </a>
      </div>
      {formId ? (
        <Link className="text-link" to={`/admin/forms/${formId}/responses`}>
          View submitted responses →
        </Link>
      ) : null}
    </section>
  );
}
