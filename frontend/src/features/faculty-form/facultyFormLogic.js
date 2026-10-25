/**
 * Faculty Form Core Business Logic
 *
 * Implements:
 * 1. Form data normalization and inspection
 * 2. Course selection state transitions (pure, immutable)
 * 3. Duplicate course prevention and option availability computation
 * 4. Submission payload construction
 * 5. Submission lifecycle state machine and HTTP error mapping
 * 6. End-to-end form submission workflow with in-flight duplicate submit prevention
 */

import {
  validateFormData,
  validateFacultyDetails,
  validateFacultyFormSubmission,
  getDuplicateSelections,
  hasDuplicateSelections,
  isCourseSelectedElsewhere,
  isCourseDisabledForQuestion,
  getSelectedCoursesElsewhere,
} from './facultyFormValidation.js';
import { submitFacultyResponse } from './facultyFormApi.js';

/**
 * Submission lifecycle statuses
 */
export const SUBMISSION_STATUS = Object.freeze({
  IDLE: 'idle',
  VALIDATING: 'validating',
  SUBMITTING: 'submitting',
  SUCCESS: 'success',
  ERROR: 'error',
});

/**
 * Initial submission state
 */
export const initialSubmissionState = Object.freeze({
  status: SUBMISSION_STATUS.IDLE,
  isValidating: false,
  isSubmitting: false,
  isSuccess: false,
  isError: false,
  error: null,
  validationErrors: null,
  responseData: null,
});

/**
 * Reducer for managing submission lifecycle states
 *
 * @param {Object} state
 * @param {Object} action
 * @returns {Object}
 */
export function submissionReducer(state = initialSubmissionState, action = {}) {
  switch (action.type) {
    case 'START_VALIDATING':
      return {
        ...state,
        status: SUBMISSION_STATUS.VALIDATING,
        isValidating: true,
        isSubmitting: false,
        isSuccess: false,
        isError: false,
        error: null,
        validationErrors: null,
      };

    case 'VALIDATION_FAILED':
      return {
        ...state,
        status: SUBMISSION_STATUS.ERROR,
        isValidating: false,
        isSubmitting: false,
        isSuccess: false,
        isError: true,
        error: {
          type: 'VALIDATION_ERROR',
          message: 'Please review and correct the errors before submitting.',
          isRetryable: true,
        },
        validationErrors: action.payload || null,
      };

    case 'START_SUBMITTING':
      return {
        ...state,
        status: SUBMISSION_STATUS.SUBMITTING,
        isValidating: false,
        isSubmitting: true,
        isSuccess: false,
        isError: false,
        error: null,
      };

    case 'SUBMISSION_SUCCESS':
      return {
        ...state,
        status: SUBMISSION_STATUS.SUCCESS,
        isValidating: false,
        isSubmitting: false,
        isSuccess: true,
        isError: false,
        error: null,
        validationErrors: null,
        responseData: action.payload || null,
      };

    case 'SUBMISSION_ERROR':
      return {
        ...state,
        status: SUBMISSION_STATUS.ERROR,
        isValidating: false,
        isSubmitting: false,
        isSuccess: false,
        isError: true,
        error: action.payload || {
          message: 'An unexpected error occurred.',
          isRetryable: true,
        },
      };

    case 'RESET':
      return { ...initialSubmissionState };

    default:
      return state;
  }
}

/**
 * Maps HTTP status codes and API errors to human-readable messages and retryability flags.
 *
 * @param {number} status - HTTP status code
 * @param {any} [errorData] - Raw error payload from API response
 * @returns {{
 *   status: number,
 *   message: string,
 *   isRetryable: boolean,
 *   details: any
 * }}
 */
export function mapHttpError(status, errorData = null) {
  let message = 'An unexpected error occurred during submission.';
  let isRetryable = true;

  const serverMsg =
    (errorData && typeof errorData === 'object' && (errorData.detail || errorData.message || errorData.error)) ||
    (typeof errorData === 'string' && !errorData.startsWith('Submission failed with HTTP') ? errorData : null);

  switch (status) {
    case 400:
      message = serverMsg || 'Invalid submission format or missing required fields.';
      isRetryable = true;
      break;
    case 401:
      message = serverMsg || 'Unauthorized access. The submission could not be authenticated.';
      isRetryable = false;
      break;
    case 403:
      message = serverMsg || 'This course preference form is closed or no longer accepting responses.';
      isRetryable = false;
      break;
    case 404:
      message = serverMsg || 'Form not found or the public access link has expired.';
      isRetryable = false;
      break;
    case 409:
      message = serverMsg || 'Course preferences have already been submitted for this Faculty ID.';
      isRetryable = false;
      break;
    case 422:
      message = serverMsg || 'Submission rejected by server: course validation failed.';
      isRetryable = true;
      break;
    case 429:
      message = serverMsg || 'Too many submissions. Please wait a moment and try again.';
      isRetryable = true;
      break;
    case 500:
      message = serverMsg || 'The server encountered an error while saving your response. Please try again.';
      isRetryable = true;
      break;
    case 502:
    case 504:
      message = serverMsg || 'Backend server is not reachable at http://127.0.0.1:8000. Please ensure the backend is running.';
      isRetryable = true;
      break;
    case 0:
      message = serverMsg || 'Network failure: unable to connect to the server. Please check your connection.';
      isRetryable = true;
      break;
    default:
      if (serverMsg) {
        message = serverMsg;
      } else if (status >= 500) {
        message = `Server error (${status}). Please try again later.`;
        isRetryable = true;
      } else if (status >= 400) {
        message = `Client request error (${status}).`;
        isRetryable = true;
      }
      break;
  }

  return {
    status: typeof status === 'number' ? status : 0,
    message,
    isRetryable,
    details: errorData,
  };
}

/**
 * Initializes a clean course selection state map for all questions in the form.
 *
 * @param {Object} formDefinition - Raw or normalized form definition
 * @returns {Record<string, string|null>} Map of questionId -> null
 */
export function initializeSelections(formDefinition) {
  const selections = {};
  if (!formDefinition || typeof formDefinition !== 'object') {
    return selections;
  }

  const questions = Array.isArray(formDefinition.questions) ? formDefinition.questions : [];
  for (const q of questions) {
    const qId = q.id ?? q.question_id;
    if (qId !== undefined && qId !== null) {
      selections[String(qId).trim()] = null;
    }
  }

  return selections;
}

/**
 * Updates a course selection for a specific question.
 *
 * Rules:
 * - Immutable: Does not mutate currentSelections.
 * - Validates that questionId exists in formDefinition.
 * - Validates that courseId is an allowed course for that question.
 * - Preserves selections for all unrelated questions.
 *
 * @param {Record<string, string|null>} currentSelections
 * @param {string} questionId
 * @param {string} courseId
 * @param {Object} formDefinition
 * @returns {{
 *   success: boolean,
 *   selections: Record<string, string|null>,
 *   error?: string
 * }}
 */
export function selectCourse(currentSelections = {}, questionId, courseId, formDefinition) {
  if (!questionId || typeof questionId !== 'string') {
    return {
      success: false,
      selections: { ...currentSelections },
      error: 'Invalid or missing question identifier.',
    };
  }

  const cleanQId = questionId.trim();
  const cleanCId = typeof courseId === 'string' ? courseId.trim() : '';

  if (!cleanCId) {
    return {
      success: false,
      selections: { ...currentSelections },
      error: 'Invalid or missing course identifier.',
    };
  }

  // Validate against form definition if provided
  if (formDefinition && typeof formDefinition === 'object') {
    const questions = Array.isArray(formDefinition.questions) ? formDefinition.questions : [];
    const question = questions.find((q) => {
      const qId = q.id ?? q.question_id;
      return qId !== undefined && String(qId).trim() === cleanQId;
    });

    if (!question) {
      return {
        success: false,
        selections: { ...currentSelections },
        error: `Question "${cleanQId}" does not exist in the form definition.`,
      };
    }

    const courses = question.courses || question.allowed_courses || question.options || [];
    const isAllowed = courses.some((c) => {
      const cId = c.id ?? c.course_id;
      return cId !== undefined && String(cId).trim() === cleanCId;
    });

    if (!isAllowed) {
      return {
        success: false,
        selections: { ...currentSelections },
        error: `Course "${cleanCId}" is not permitted for question "${cleanQId}".`,
      };
    }
  }

  return {
    success: true,
    selections: {
      ...currentSelections,
      [cleanQId]: cleanCId,
    },
  };
}

/**
 * Clears a course selection for a specific question.
 *
 * Rules:
 * - Immutable: Does not mutate currentSelections.
 * - Preserves unrelated question selections.
 *
 * @param {Record<string, string|null>} currentSelections
 * @param {string} questionId
 * @returns {{
 *   success: boolean,
 *   selections: Record<string, string|null>
 * }}
 */
export function clearSelection(currentSelections = {}, questionId) {
  if (!questionId || typeof questionId !== 'string') {
    return {
      success: false,
      selections: { ...currentSelections },
    };
  }

  const cleanQId = questionId.trim();
  return {
    success: true,
    selections: {
      ...currentSelections,
      [cleanQId]: null,
    },
  };
}

/**
 * Computes course option availability for rendering a question.
 *
 * Annotates each allowed course with:
 * - isSelected: whether it is currently selected for THIS question
 * - isSelectedElsewhere: whether it is selected in another question
 * - isDisabled: whether it should be disabled (true if selected elsewhere)
 * - disabledReason: tooltip / assistive message explaining why it is disabled
 *
 * @param {Object} question - Question definition containing allowed courses
 * @param {Record<string, string|null>} selections - Active selections map
 * @returns {Array<Object>}
 */
export function getCourseAvailabilityForQuestion(question, selections = {}) {
  if (!question || typeof question !== 'object') {
    return [];
  }

  const qId = question.id ?? question.question_id;
  const stableQId = qId !== undefined ? String(qId).trim() : '';

  const courses = question.courses || question.allowed_courses || question.options || [];
  if (!Array.isArray(courses)) {
    return [];
  }

  return courses.map((course) => {
    const cId = course.id ?? course.course_id;
    const stableCId = cId !== undefined ? String(cId).trim() : '';

    const isSelectedInThisQuestion = Boolean(
      stableQId && selections[stableQId] && String(selections[stableQId]).trim() === stableCId
    );
    const selectedElsewhere = isCourseSelectedElsewhere(selections, stableCId, stableQId);

    return {
      id: stableCId,
      code: course.code ? String(course.code).trim() : '',
      name: course.name || course.title || stableCId,
      department: course.department || '',
      isSelected: isSelectedInThisQuestion,
      isSelectedElsewhere: selectedElsewhere,
      isDisabled: selectedElsewhere,
      disabledReason: selectedElsewhere ? 'Already selected for another preference' : null,
    };
  });
}

/**
 * Custom Error for validation failures during payload creation
 */
export class FormValidationError extends Error {
  constructor(validationResult) {
    super('Form validation failed: submission payload cannot be created.');
    this.name = 'FormValidationError';
    this.validationResult = validationResult;
  }
}

/**
 * Pure function that converts valid form state into the backend request format.
 *
 * Expected backend payload schema:
 * {
 *   "faculty_name": "Example Faculty",
 *   "faculty_id": "FAC001",
 *   "answers": [
 *     { "question_id": "q1", "course_id": "c1" },
 *     { "question_id": "q2", "course_id": "c2" }
 *   ]
 * }
 *
 * Requirements:
 * - Validates form state before building payload.
 * - Does not construct valid-looking payload from invalid state.
 * - Preserves question ordering.
 * - Strips UI-only metadata.
 * - Does not include undefined or empty course IDs.
 *
 * @param {Object} params
 * @param {Object} params.form - Form definition
 * @param {Object} params.facultyDetails - { faculty_name, faculty_id }
 * @param {Record<string, string|null>} params.selections - Map of questionId -> courseId
 * @returns {{
 *   faculty_name: string,
 *   faculty_id: string,
 *   answers: Array<{ question_id: string, course_id: string }>
 * }}
 */
export function createSubmissionPayload({ form, facultyDetails, selections } = {}) {
  const validation = validateFacultyFormSubmission({ form, facultyDetails, selections });

  if (!validation.isValid) {
    throw new FormValidationError(validation);
  }

  const normalizedForm = validateFormData(form).normalizedForm;

  const answers = [];
  for (const q of normalizedForm.questions) {
    if (q.hasNoCourses) {
      continue;
    }
    const selectedCourseId = selections[q.id];
    if (selectedCourseId && typeof selectedCourseId === 'string' && selectedCourseId.trim()) {
      answers.push({
        question_id: q.id,
        course_id: selectedCourseId.trim(),
      });
    }
  }

  return {
    faculty_name: validation.sanitizedDetails.faculty_name,
    faculty_id: validation.sanitizedDetails.faculty_id,
    answers,
  };
}

/**
 * High-level form submission workflow handler.
 *
 * Features:
 * - In-flight submission locking (prevents duplicate submission requests).
 * - Distinguishes client validation errors from server/network errors.
 * - Retains form state and user answers upon failure so user can retry.
 * - Maps HTTP status codes into user-friendly messages.
 *
 * @param {Object} params
 * @param {string} params.token - Public form token
 * @param {Object} params.form - Form definition
 * @param {Object} params.facultyDetails - { faculty_name, faculty_id }
 * @param {Record<string, string|null>} params.selections - Map of questionId -> courseId
 * @param {Function} [params.submitApiFn=submitFacultyResponse] - API submission function
 * @param {Function} [params.dispatch] - Optional state dispatcher (compatible with submissionReducer)
 * @param {Object} [params.currentState] - Current submission state (to check isSubmitting)
 * @returns {Promise<{
 *   success: boolean,
 *   data?: any,
 *   error?: any,
 *   validationErrors?: any
 * }>}
 */
export async function submitFacultyFormWorkflow({
  token,
  form,
  facultyDetails,
  selections,
  submitApiFn = submitFacultyResponse,
  dispatch = () => {},
  currentState = null,
} = {}) {
  // Prevent duplicate submissions if already submitting
  if (currentState && currentState.isSubmitting) {
    return {
      success: false,
      error: {
        message: 'A submission is already in progress. Please wait.',
        isRetryable: false,
      },
    };
  }

  // 1. Validation Step
  dispatch({ type: 'START_VALIDATING' });

  const validation = validateFacultyFormSubmission({ form, facultyDetails, selections });
  if (!validation.isValid) {
    dispatch({ type: 'VALIDATION_FAILED', payload: validation.errors });
    return {
      success: false,
      validationErrors: validation.errors,
      error: {
        type: 'VALIDATION_ERROR',
        message: 'Please resolve form errors before submitting.',
        isRetryable: true,
      },
    };
  }

  // 2. Build Payload
  let payload;
  try {
    payload = createSubmissionPayload({ form, facultyDetails, selections });
  } catch (err) {
    const errInfo = {
      type: 'PAYLOAD_ERROR',
      message: err.message || 'Failed to construct submission payload.',
      isRetryable: false,
    };
    dispatch({ type: 'SUBMISSION_ERROR', payload: errInfo });
    return { success: false, error: errInfo };
  }

  // 3. Submitting Step
  dispatch({ type: 'START_SUBMITTING' });

  try {
    const responseData = await submitApiFn(token, payload);
    dispatch({ type: 'SUBMISSION_SUCCESS', payload: responseData });
    return {
      success: true,
      data: responseData,
    };
  } catch (err) {
    const httpStatus = typeof err.status === 'number' ? err.status : 0;
    const mappedError = mapHttpError(httpStatus, err.data || err.message);

    dispatch({
      type: 'SUBMISSION_ERROR',
      payload: mappedError,
    });

    return {
      success: false,
      error: mappedError,
    };
  }
}

// Re-export validation and API utilities for unified consumer access
export {
  validateFormData,
  validateFacultyDetails,
  validateFacultyFormSubmission,
  getDuplicateSelections,
  hasDuplicateSelections,
  isCourseSelectedElsewhere,
  isCourseDisabledForQuestion,
  getSelectedCoursesElsewhere,
};
