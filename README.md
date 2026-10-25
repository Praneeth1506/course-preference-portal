# Course Preference Portal

A small full-stack MVP that lets an administrator build course-preference forms,
publish them through a secure public link, and review faculty responses. Faculty
open the public link without an account, enter their name and faculty ID, and
select one course per question.

The repository started with no application code, so this implementation also
provides the minimal supporting pieces required by the Member 5 workflow:
administrator authentication, a seeded course catalogue, and draft form
management. Everything is built on the required stack: React + Vite, FastAPI,
MongoDB, and JSON over HTTP.

## Features

- Administrator sign-in with a signed JWT bearer token.
- Draft form builder with ordered questions and per-question allowed courses.
- Publish action that validates the form and generates a 256-bit random public
  token, stored in `forms.public_token`.
- Public form page at `/forms/:token` that works without faculty authentication
  and never exposes draft forms or admin data.
- Server-side validation for faculty details and every answer, including
  missing/extra/duplicate questions, unassigned courses, nonexistent courses,
  and the same course selected across multiple questions.
- Response storage in the `responses` collection with a UTC submission time.
- Authenticated admin response view with faculty details, question text, course
  code/name, and localized submission time.
- Backend test suite plus a live HTTP smoke-test script.

## Stack and layout

| Area     | Technology                            |
| -------- | ------------------------------------- |
| Frontend | React 18, React Router 7, Vite 6      |
| Backend  | Python, FastAPI, Pydantic v2, PyMongo |
| Database | MongoDB                               |
| Auth     | JWT (HS256) bearer tokens             |

```text
backend/
  app/
    main.py              FastAPI app, CORS, router registration
    config.py            Environment configuration
    database.py          Shared PyMongo client and index creation
    security.py          Admin credential check and JWT dependency
    schemas.py           Pydantic request/response models
    utils.py             ObjectId/timestamp/JSON helpers
    seed.py              Sample courses + demo draft form
    routers/
      auth.py            POST /api/auth/login, GET /api/auth/me
      courses.py         GET /api/courses
      forms.py           Form CRUD, publish, admin response listing
      public.py          Public form retrieval and response submission
  tests/                 pytest + mongomock test suite
  scripts/e2e_smoke.py   Live end-to-end HTTP verification
frontend/
  src/
    App.jsx              Admin/public routes
    api.js               API client and error formatting
    AuthContext.jsx      Session handling
    pages/               Login, forms, builder, public form, responses
    components.jsx       Share panel, copy link, badges, loaders
```

## Prerequisites

- Python 3.10+ (tested with 3.14)
- Node.js 20+ and npm
- MongoDB 6+ (tested with 8.0) running locally, or a reachable MongoDB URI

Start MongoDB with your preferred method, for example:

```bash
# Homebrew (official MongoDB tap)
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community

# or Docker
docker run --rm -p 27017:27017 --name course-preference-mongo mongo:7
```

## Quick start

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m app.seed
uvicorn app.main:app --reload --port 8000
```

- API: <http://localhost:8000>
- Interactive docs: <http://localhost:8000/docs>
- Health check: <http://localhost:8000/api/health>

`app.seed` is safe to rerun. It upserts sample courses by course code and only
creates the demo draft form when the `forms` collection is empty. It never
deletes existing data.

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open <http://localhost:5173>.

The example configuration uses the local administrator credentials
`admin` / `admin123`. **Change `ADMIN_PASSWORD` and `JWT_SECRET` before
deploying or sharing the app.** Credentials are configured only in the backend
environment; they are not stored in or sent to the frontend.

### 3. Demonstrate the full flow

1. Sign in at <http://localhost:5173/login>.
2. Select **New form**, enter a title, and add one or more questions.
3. For each question, check the courses that faculty may choose.
4. Select **Publish form**.
5. The share panel displays the real public URL. Use **Copy link** or **Open
   form**; the link has the form `/forms/<random-token>`.
6. On the public page, enter a faculty name and faculty ID, then choose one
   course per question. A course chosen in one question is disabled in the
   others.
7. Submit. A confirmation and response reference are displayed.
8. Return to the admin dashboard and open **Responses** for the form (or use
   **View responses** in the share panel) to see the submission.

## Environment variables

### Backend (`backend/.env`)

| Variable                     | Default                                       | Purpose                                             |
| ---------------------------- | --------------------------------------------- | --------------------------------------------------- |
| `MONGO_URI`                  | `mongodb://127.0.0.1:27017`                   | MongoDB connection string                           |
| `MONGO_DB_NAME`              | `course_preference_portal`                    | Database name                                       |
| `FRONTEND_BASE_URL`          | `http://localhost:5173`                       | Base URL used to build shareable public links       |
| `CORS_ORIGINS`               | `http://localhost:5173`                       | Comma-separated allowed origins                     |
| `ADMIN_USERNAME`             | `admin`                                       | Administrator username                              |
| `ADMIN_PASSWORD`             | `admin123` in `.env.example`                  | Administrator password (local demo value)           |
| `ADMIN_PASSWORD_HASH`        | unset                                         | Optional bcrypt hash; takes precedence over password |
| `JWT_SECRET`                 | dev-only placeholder                          | Signing secret for admin tokens                     |
| `JWT_ALGORITHM`              | `HS256`                                       | JWT algorithm                                       |
| `ACCESS_TOKEN_EXPIRE_MINUTES`| `480`                                         | Admin session lifetime                              |
| `PUBLIC_TOKEN_BYTES`         | `32` (minimum enforced)                       | Random bytes in a public token (32 bytes = 256 bits) |
| `MONGO_TIMEOUT_MS`           | `3000`                                        | MongoDB server selection timeout                    |

Generate a bcrypt hash if desired:

```bash
python -c "import bcrypt; print(bcrypt.hashpw(b'your-password', bcrypt.gensalt()).decode())"
```

### Frontend (`frontend/.env`)

| Variable            | Default                     | Purpose                    |
| ------------------- | --------------------------- | -------------------------- |
| `VITE_API_BASE_URL` | `http://localhost:8000/api` | Base URL of the FastAPI API |

Local development origins on any port for `localhost` / `127.0.0.1` are allowed
by the backend CORS regex in addition to `CORS_ORIGINS`.

## API contract

| Method | Path                              | Auth        | Purpose                          |
| ------ | --------------------------------- | ----------- | -------------------------------- |
| POST   | `/api/auth/login`                 | Public      | Obtain an admin bearer token     |
| GET    | `/api/auth/me`                    | Admin       | Verify the current session       |
| GET    | `/api/courses`                    | Admin       | List the seeded course catalogue |
| POST   | `/api/forms`                      | Admin       | Create a draft form              |
| GET    | `/api/forms`                      | Admin       | List forms with response counts  |
| GET    | `/api/forms/{id}`                 | Admin       | Load a form for editing          |
| PUT    | `/api/forms/{id}`                 | Admin       | Update a draft (409 if published)|
| POST   | `/api/forms/{id}/publish`         | Admin       | Publish and return public link   |
| GET    | `/api/forms/{id}/responses`       | Admin       | List responses, newest first     |
| GET    | `/api/public/forms/{token}`       | Public      | Retrieve a published form        |
| POST   | `/api/public/forms/{token}/responses` | Public  | Validate and save a response     |

Admin routes use `Authorization: Bearer <token>`. ObjectIds in paths must be
valid 24-character hex strings; malformed IDs return HTTP 400.

### Publish

`POST /api/forms/{id}/publish` validates the title, question IDs/text, allowed
course references, course existence, and any per-question semester restriction.
It then stores a cryptographically random token and returns:

```json
{
  "form_id": "6710...",
  "status": "published",
  "public_token": "wkvG0jsyQ_hhJex08dNT-zJQ45F_7qqSD39nubWmNUc",
  "public_url": "http://localhost:5173/forms/wkvG0jsyQ_hhJex08dNT-zJQ45F_7qqSD39nubWmNUc",
  "published_at": "2026-10-25T13:05:00.123456Z"
}
```

Tokens are generated with `secrets.token_urlsafe(32)` (256 bits). The MongoDB
document ID is never used as a token. Re-publishing an already published form
returns the same token so existing links keep working. Published forms cannot
be edited. A partial unique index protects `public_token`, and the publish flow
also checks for collisions and retries safely.

### Public form retrieval

`GET /api/public/forms/{token}` returns only published forms and only the data
needed by faculty:

```json
{
  "form_id": "6710...",
  "title": "Faculty Course Preferences",
  "description": "Select one course per question.",
  "questions": [
    {
      "question_id": "q1",
      "text": "Preferred course for Semester 3",
      "order": 1,
      "semester": null,
      "courses": [
        {
          "course_id": "6711...",
          "course_code": "CS301",
          "course_name": "Database Systems",
          "semester": 3
        }
      ]
    }
  ]
}
```

Unknown tokens, draft forms, and unpublished forms all return HTTP 404 with the
same message. Courses deleted after publication are omitted safely.

### Response submission

`POST /api/public/forms/{token}/responses` requires no faculty authentication.

```json
{
  "faculty_name": "Demo Faculty",
  "faculty_id": "FAC001",
  "answers": [
    { "question_id": "q1", "course_id": "6711..." },
    { "question_id": "q2", "course_id": "6712..." }
  ]
}
```

The backend trims faculty fields, rejects blank/overlong values, and requires
exactly one answer per question with no duplicate/unknown question IDs. Each
course must belong to that question's allowed list, still exist, satisfy any
semester restriction, and be used at most once across the response. IDs are
canonicalized before comparison, so uppercase or whitespace-padded variants
cannot bypass validation. Invalid requests return HTTP 422 and are never
inserted.

A successful submission returns HTTP 201:

```json
{
  "message": "Course preferences submitted successfully",
  "response_id": "6713...",
  "submitted_at": "2026-10-25T13:10:00.123456Z"
}
```

The stored document contains `_id`, an ObjectId `form_id`, `faculty_name`,
`faculty_id`, `answers` (each with `question_id` and ObjectId `course_id`), and
a timezone-aware UTC `submitted_at`.

**Duplicate submissions:** the MVP does not enforce one response per faculty ID.
Multiple valid submissions are accepted; faculty ID is identification only, not
authentication. This behavior can be changed later without altering the public
API shape.

### Admin response listing

`GET /api/forms/{id}/responses` returns responses for that form only, newest
first, with a bulk course lookup rather than one query per answer:

```json
{
  "form_id": "6710...",
  "form_title": "Faculty Course Preferences",
  "responses": [
    {
      "response_id": "6713...",
      "faculty_name": "Demo Faculty",
      "faculty_id": "FAC001",
      "answers": [
        {
          "question_id": "q1",
          "question_text": "Preferred course for Semester 3",
          "course_id": "6711...",
          "course_code": "CS301",
          "course_name": "Database Systems",
          "semester": 3
        }
      ],
      "submitted_at": "2026-10-25T13:10:00.123456Z"
    }
  ],
  "total": 1
}
```

An empty form returns `"responses": []` and `"total": 0`.

### Common status codes

| Status | Meaning                                                              |
| ------ | -------------------------------------------------------------------- |
| 400    | Malformed MongoDB ObjectId in a path                                 |
| 401    | Missing/expired/invalid admin token                                  |
| 404    | Form, public token, or published form not found                     |
| 409    | Attempt to edit a published form                                     |
| 422    | Invalid form schema, publish state, or submitted response            |
| 500    | Unexpected/database error (safe external message, details logged)    |

## Data model

```text
courses:   { _id: ObjectId, code, name, semester, created_at }
forms:     {
             _id: ObjectId,
             title, description, status: "draft" | "published",
             public_token?: string,
             questions: [{
               question_id, text, order,
               course_ids: [ObjectId], semester: number | null
             }],
             created_at, updated_at, published_at?
           }
responses: {
             _id: ObjectId,
             form_id: ObjectId,
             faculty_name, faculty_id,
             answers: [{ question_id, course_id: ObjectId }],
             submitted_at
           }
```

Indexes created at startup: a partial unique index on
`forms.public_token`, supporting form indexes, a `courses` code index, and a
`responses` compound index on `(form_id, submitted_at)`.

## Running tests and checks

### Backend tests (in-memory, no MongoDB required)

```bash
cd backend
python3 -m pytest
```

The suite uses `mongomock`, dependency overrides, and isolated in-memory
databases. It never touches a real database.

Static checks:

```bash
cd backend
ruff check app tests scripts
python3 -m compileall -q app tests scripts
```

### Live end-to-end HTTP smoke test

With MongoDB running, the backend running, and courses seeded:

```bash
cd backend
python -m scripts.e2e_smoke
```

The script signs in, creates a form, publishes it, checks idempotent publishing,
retrieves the public form, verifies invalid submissions are rejected and not
saved, submits a valid response, and confirms the admin listing and course
details. It prints `OK:` for each verified step.

### Frontend build

```bash
cd frontend
npm run build
```

Browser-level verification was performed separately with Playwright against
Google Chrome: invalid-login feedback, admin login, form creation, question and
course selection, publishing, clipboard copy, public form rendering, duplicate
course prevention, successful submission, admin response rendering, and invalid
token handling. That temporary browser script is not part of the repository;
the committed live smoke test covers the same API workflow.

## Known limitations and notes

- Authentication is a single environment-configured administrator, which is
  appropriate for this MVP. There is no user-management screen, password reset,
  MFA, or login rate limiting.
- Courses are seeded and read-only. A course-management screen is out of scope.
- Published forms are immutable. Editing would invalidate existing submissions.
- Duplicate faculty submissions are intentionally allowed (see above).
- The public token is stored as-is in MongoDB because it is a capability URL;
  the unique index and high entropy make guessing impractical.
- If a course is deleted after publication, it is hidden from the public form
  and rejected on submission; existing admin responses display it as no longer
  available rather than failing the request.
- The frontend is a single-page app. If served by a static host other than Vite
  preview, configure a rewrite/fallback from unknown paths to `index.html` so
  `/forms/:token` and `/admin/*` deep links work.
- No Excel export, analytics, charts, or advanced filtering are implemented.
- If MongoDB is unavailable, API routes return safe HTTP 500 responses and the
  health endpoint still responds; backend tests can still run via mongomock.
