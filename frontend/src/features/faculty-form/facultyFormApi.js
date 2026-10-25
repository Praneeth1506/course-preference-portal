/**
 * Faculty Form API Client
 *
 * Handles HTTP requests for:
 * - Fetching public form definitions by token: GET /api/public/forms/{token}
 * - Submitting faculty course preference responses: POST /api/public/forms/{token}/responses
 *
 * Uses configured base URL without hardcoded localhost inside business logic.
 */

/**
 * Resolves the API base URL from Vite environment or falls back to an empty string (relative path).
 *
 * @returns {string}
 */
export function getApiBaseUrl() {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) {
    return String(import.meta.env.VITE_API_BASE_URL).replace(/\/+$/, '');
  }
  return '';
}

/**
 * Custom error class for API failures containing HTTP status and server error payload.
 */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {any} [data]
   */
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Fetches a public course preference form definition using a public token.
 *
 * Endpoint: GET /api/public/forms/{token}
 *
 * @param {string} token - The public access token for the form
 * @param {Object} [options]
 * @param {Function} [options.fetchFn=fetch] - Injected fetch function for testability
 * @param {string} [options.baseUrl] - Injected base URL override
 * @param {AbortSignal} [options.signal] - Optional abort signal
 * @returns {Promise<Object>} Form definition data
 */
export async function fetchPublicForm(token, options = {}) {
  const { fetchFn = fetch, baseUrl = getApiBaseUrl(), signal } = options;

  if (!token || typeof token !== 'string' || !token.trim()) {
    throw new ApiError('A valid public form token is required.', 400);
  }

  const cleanToken = encodeURIComponent(token.trim());
  const url = `${baseUrl}/api/public/forms/${cleanToken}`;

  let response;
  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal,
    });
  } catch (err) {
    throw new ApiError(
      `Network failure while fetching form: ${err.message || 'Unable to connect to server'}`,
      0,
      { originalError: err }
    );
  }

  let data = null;
  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    try {
      data = await response.text();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const errorMsg =
      (data && typeof data === 'object' && (data.detail || data.message || data.error)) ||
      `Server responded with HTTP ${response.status}`;
    throw new ApiError(String(errorMsg), response.status, data);
  }

  return data;
}

/**
 * Submits a faculty member's course preferences for a specific public form.
 *
 * Endpoint: POST /api/public/forms/{token}/responses
 *
 * @param {string} token - Public form token
 * @param {Object} payload - Validated submission payload { faculty_name, faculty_id, answers }
 * @param {Object} [options]
 * @param {Function} [options.fetchFn=fetch] - Injected fetch function for testability
 * @param {string} [options.baseUrl] - Injected base URL override
 * @param {AbortSignal} [options.signal] - Optional abort signal
 * @returns {Promise<Object>} Response from the backend
 */
export async function submitFacultyResponse(token, payload, options = {}) {
  const { fetchFn = fetch, baseUrl = getApiBaseUrl(), signal } = options;

  if (!token || typeof token !== 'string' || !token.trim()) {
    throw new ApiError('A valid public form token is required for submission.', 400);
  }

  if (!payload || typeof payload !== 'object') {
    throw new ApiError('Submission payload is required.', 400);
  }

  const cleanToken = encodeURIComponent(token.trim());
  const url = `${baseUrl}/api/public/forms/${cleanToken}/responses`;

  let response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    throw new ApiError(
      `Network failure during form submission: ${err.message || 'Unable to connect to server'}`,
      0,
      { originalError: err }
    );
  }

  let data = null;
  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    try {
      data = await response.text();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const errorMsg =
      (data && typeof data === 'object' && (data.detail || data.message || data.error)) ||
      `Submission failed with HTTP ${response.status}`;
    throw new ApiError(String(errorMsg), response.status, data);
  }

  return data;
}
