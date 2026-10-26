import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "./AuthContext";
import { FullPageLoading } from "./components";
import { FacultyPreferenceForm } from "./features/faculty-form/FacultyPreferenceForm.jsx";
import FormBuilderPage from "./pages/FormBuilderPage";
import FormsPage from "./pages/FormsPage";
import LoginPage from "./pages/LoginPage";
import NotFoundPage from "./pages/NotFoundPage";
import ResponsesPage from "./pages/ResponsesPage";

function RequireAuth({ children }) {
  const { isAuthenticated, checking } = useAuth();
  const location = useLocation();

  if (checking) {
    return <FullPageLoading label="Checking session…" />;
  }
  if (!isAuthenticated) {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname }} />
    );
  }
  return children;
}

function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="container header-inner">
          <Link className="brand" to="/admin/forms">
            <span className="brand-mark">CP</span>
            <span>Course Preference Portal</span>
          </Link>
          <nav className="header-nav" aria-label="Administrator navigation">
            <span className="signed-in">
              Signed in as <strong>{user?.username}</strong>
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={handleLogout}
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="container page">
        <Outlet />
      </main>
    </div>
  );
}

function FacultyPage() {
  return (
    <main>
      <FacultyPreferenceForm />
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Faculty-facing form (Member 4); reads the token from the URL itself. */}
      <Route path="/" element={<FacultyPage />} />
      <Route path="/forms/:token" element={<FacultyPage />} />

      <Route path="/login" element={<LoginPage />} />
      <Route path="/admin" element={<Navigate to="/admin/forms" replace />} />
      <Route
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route path="/admin/forms" element={<FormsPage />} />
        <Route path="/admin/forms/new" element={<FormBuilderPage />} />
        <Route path="/admin/forms/:formId/edit" element={<FormBuilderPage />} />
        <Route
          path="/admin/forms/:formId/responses"
          element={<ResponsesPage />}
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
