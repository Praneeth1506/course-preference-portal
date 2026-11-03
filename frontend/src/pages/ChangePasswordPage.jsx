import { useState } from "react";
import { useAuth } from "../AuthContext";
import { ErrorBanner, Notice } from "../components";

// Same limits as the backend (ChangePasswordRequest in backend/app/schemas.py).
const MIN_LENGTH = 8;
const MAX_BYTES = 72;

const EMPTY = { current: "", next: "", confirm: "" };

function passwordProblems({ current, next, confirm }) {
  const problems = [];
  if (!current) problems.push("Enter your current password.");
  if (next.length < MIN_LENGTH) {
    problems.push(`The new password must be at least ${MIN_LENGTH} characters.`);
  } else if (!next.trim()) {
    problems.push("The new password cannot be only spaces.");
  } else if (new TextEncoder().encode(next).length > MAX_BYTES) {
    problems.push(`The new password must be at most ${MAX_BYTES} bytes.`);
  }
  if (next && current && next === current) {
    problems.push("The new password must be different from the current one.");
  }
  if (confirm !== next) problems.push("The new passwords do not match.");
  return problems;
}

export default function ChangePasswordPage() {
  const { changePassword, user } = useAuth();
  const [values, setValues] = useState(EMPTY);
  const [problems, setProblems] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setError("");
    setNotice("");
    const found = passwordProblems(values);
    setProblems(found);
    if (found.length > 0) return;

    setSaving(true);
    try {
      await changePassword(values.current, values.next);
      setValues(EMPTY);
      setNotice(
        "Password changed. Use the new password next time you sign in; any other signed-in sessions were signed out.",
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Change password</h1>
          <p className="muted">
            Choose a new administrator password of at least {MIN_LENGTH} characters.
          </p>
        </div>
      </div>

      <ErrorBanner error={error} />
      <Notice>{notice}</Notice>

      <form className="card elective-form password-form" onSubmit={handleSubmit} noValidate>
        {problems.length > 0 ? (
          <div className="alert alert-error" role="alert">
            <ul className="issue-list">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {/* Lets password managers save the new password for this account. */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={user?.username || ""}
          readOnly
          hidden
        />
        <div className="field">
          <label htmlFor="current-password">Current password</label>
          <input
            id="current-password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={values.current}
            onChange={(event) => update("current", event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            className="input"
            type="password"
            autoComplete="new-password"
            value={values.next}
            onChange={(event) => update("next", event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="confirm-password">Repeat new password</label>
          <input
            id="confirm-password"
            className="input"
            type="password"
            autoComplete="new-password"
            value={values.confirm}
            onChange={(event) => update("confirm", event.target.value)}
          />
        </div>
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Change password"}
          </button>
        </div>
      </form>
    </div>
  );
}
