const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api"
).replace(/\/+$/, "");

const TOKEN_KEY = "cpp_admin_token";

export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function messageFromPayload(payload, status) {
  if (payload) {
    const { detail } = payload;
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
    if (Array.isArray(detail)) {
      const messages = detail
        .map((entry) => {
          if (typeof entry === "string") return entry;
          if (!entry || typeof entry !== "object") return null;
          const location = Array.isArray(entry.loc)
            ? entry.loc
                .filter((part) => !["body", "query", "path"].includes(part))
                .join(".")
            : "";
          const text = entry.msg || entry.message || "Invalid value";
          return location ? `${location}: ${text}` : text;
        })
        .filter(Boolean);
      if (messages.length > 0) return messages.join("; ");
    }
    if (typeof payload.message === "string") return payload.message;
  }

  if (status === 400) return "The request was invalid.";
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You are not allowed to perform this action.";
  if (status === 404) return "The requested item was not found.";
  if (status === 409) return "That action conflicts with the current state.";
  if (status === 422) return "Some submitted values are invalid.";
  if (status >= 500) return "The server encountered an error. Please try again.";
  return `Request failed (HTTP ${status}).`;
}

async function request(path, options = {}) {
  const {
    method = "GET",
    body,
    auth = true,
    signal,
  } = options;

  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const token = getStoredToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError(
      "Unable to reach the server. Please check that the backend is running.",
      0,
    );
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { detail: text };
    }
  }

  if (!response.ok) {
    if (response.status === 401 && auth) {
      clearStoredToken();
      window.dispatchEvent(new Event("cpp:unauthorized"));
    }
    throw new ApiError(
      messageFromPayload(payload, response.status),
      response.status,
      payload,
    );
  }

  return payload;
}

export const api = {
  login: (username, password) =>
    request("/auth/login", {
      method: "POST",
      body: { username, password },
      auth: false,
    }),
  me: () => request("/auth/me"),
  listCourses: () => request("/courses"),
  listForms: () => request("/forms"),
  createForm: (payload) =>
    request("/forms", { method: "POST", body: payload }),
  getForm: (formId) => request(`/forms/${encodeURIComponent(formId)}`),
  updateForm: (formId, payload) =>
    request(`/forms/${encodeURIComponent(formId)}`, {
      method: "PUT",
      body: payload,
    }),
  publishForm: (formId) =>
    request(`/forms/${encodeURIComponent(formId)}/publish`, {
      method: "POST",
    }),
  listResponses: (formId) =>
    request(`/forms/${encodeURIComponent(formId)}/responses`),
  getPublicForm: (token) =>
    request(`/public/forms/${encodeURIComponent(token)}`, { auth: false }),
  submitResponse: (token, payload) =>
    request(`/public/forms/${encodeURIComponent(token)}/responses`, {
      method: "POST",
      body: payload,
      auth: false,
    }),
};

export { API_BASE_URL };
