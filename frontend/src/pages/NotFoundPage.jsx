import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="auth-page">
      <div className="card auth-card empty-state">
        <span className="brand-mark">CP</span>
        <h1>Page not found</h1>
        <p className="muted">
          The page you requested does not exist. Check the public link or return
          to the administrator dashboard.
        </p>
        <Link className="btn btn-primary" to="/admin/forms">
          Go to forms
        </Link>
      </div>
    </div>
  );
}
