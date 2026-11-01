import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SUBMISSION_STATUS,
  initialSubmissionState,
  submissionReducer,
  mapHttpError,
  initializeSelections,
  selectCourse,
  clearSelection,
  getCourseAvailabilityForQuestion,
  createSubmissionPayload,
  FormValidationError,
  submitFacultyFormWorkflow,
} from './facultyFormLogic.js';
import { fetchPublicForm, submitFacultyResponse, ApiError } from './facultyFormApi.js';

const mockForm = {
  token: 'test-token-456',
  title: 'Computer Science Department Preferences',
  questions: [
    {
      id: 'q1',
      title: 'First Preference',
      order: 1,
      courses: [
        { id: 'c-py', name: 'Python Programming', code: 'CS101' },
        { id: 'c-jv', name: 'Java Programming', code: 'CS102' },
        { id: 'c-net', name: 'Networking', code: 'CS201' },
      ],
    },
    {
      id: 'q2',
      title: 'Second Preference',
      order: 2,
      courses: [
        { id: 'c-py', name: 'Python Programming', code: 'CS101' },
        { id: 'c-jv', name: 'Java Programming', code: 'CS102' },
        { id: 'c-ai', name: 'Artificial Intelligence', code: 'CS301' },
      ],
    },
    {
      id: 'q3',
      title: 'Third Preference',
      order: 3,
      courses: [
        { id: 'c-net', name: 'Networking', code: 'CS201' },
        { id: 'c-ai', name: 'Artificial Intelligence', code: 'CS301' },
        { id: 'c-ml', name: 'Machine Learning', code: 'CS302' },
      ],
    },
  ],
};

const mockFaculty = {
  faculty_name: 'Prof. Margaret Hamilton',
  faculty_id: 'FAC-NASA-01',
};

describe('Course Selection State Management', () => {
  it('initializes selection state with null for every question in the form', () => {
    const state = initializeSelections(mockForm);
    assert.deepEqual(state, {
      q1: null,
      q2: null,
      q3: null,
    });
  });

  it('selects a valid course for a question', () => {
    const initialState = initializeSelections(mockForm);
    const result = selectCourse(initialState, 'q1', 'c-py', mockForm);

    assert.equal(result.success, true);
    assert.equal(result.selections.q1, 'c-py');
    assert.equal(result.selections.q2, null);
    assert.equal(result.selections.q3, null);

    // Verify immutability: initialState must not be mutated
    assert.equal(initialState.q1, null);
  });

  it('changes a question selection and preserves unrelated question selections', () => {
    const state1 = {
      q1: 'c-py',
      q2: 'c-jv',
      q3: null,
    };

    // User changes q1 from c-py to c-net
    const result = selectCourse(state1, 'q1', 'c-net', mockForm);

    assert.equal(result.success, true);
    assert.equal(result.selections.q1, 'c-net');
    assert.equal(result.selections.q2, 'c-jv'); // preserved!
    assert.equal(result.selections.q3, null);
  });

  it('clears a question selection without affecting other selections', () => {
    const state = {
      q1: 'c-py',
      q2: 'c-jv',
      q3: 'c-ai',
    };

    const result = clearSelection(state, 'q2');
    assert.equal(result.success, true);
    assert.equal(result.selections.q1, 'c-py');
    assert.equal(result.selections.q2, null);
    assert.equal(result.selections.q3, 'c-ai');

    // Immutability check
    assert.equal(state.q2, 'c-jv');
  });

  it('rejects an unknown question identifier', () => {
    const state = initializeSelections(mockForm);
    const result = selectCourse(state, 'q_nonexistent', 'c-py', mockForm);

    assert.equal(result.success, false);
    assert.ok(result.error.includes('does not exist in the form definition'));
  });

  it('rejects a course not allowed for the question', () => {
    const state = initializeSelections(mockForm);
    // c-ml is not available for q1 (only q3)
    const result = selectCourse(state, 'q1', 'c-ml', mockForm);

    assert.equal(result.success, false);
    assert.ok(result.error.includes('is not permitted for question'));
    assert.equal(result.selections.q1, null);
  });
});

describe('Course Option Availability & Duplicate Prevention for UI', () => {
  it('annotates courses with correct availability status', () => {
    const selections = {
      q1: 'c-py',
      q2: 'c-jv',
      q3: null,
    };

    // Check availability for q2:
    // q2 has options: c-py, c-jv, c-ai
    const q2 = mockForm.questions[1];
    const availability = getCourseAvailabilityForQuestion(q2, selections);

    const pyOption = availability.find((c) => c.id === 'c-py');
    const jvOption = availability.find((c) => c.id === 'c-jv');
    const aiOption = availability.find((c) => c.id === 'c-ai');

    // c-py is selected in q1 -> disabled in q2!
    assert.equal(pyOption.isDisabled, true);
    assert.equal(pyOption.isSelectedElsewhere, true);
    assert.equal(pyOption.isSelected, false);
    assert.ok(pyOption.disabledReason.includes('Already selected'));

    // c-jv is selected in q2 itself -> NOT disabled in q2!
    assert.equal(jvOption.isDisabled, false);
    assert.equal(jvOption.isSelectedElsewhere, false);
    assert.equal(jvOption.isSelected, true);

    // c-ai is not selected anywhere -> available and enabled
    assert.equal(aiOption.isDisabled, false);
    assert.equal(aiOption.isSelectedElsewhere, false);
    assert.equal(aiOption.isSelected, false);
  });

  it('releases a course when a selection is changed or cleared', () => {
    let selections = {
      q1: 'c-py',
      q2: null,
    };

    // Initially, c-py is disabled for q2
    let q2Availability = getCourseAvailabilityForQuestion(mockForm.questions[1], selections);
    assert.equal(q2Availability.find((c) => c.id === 'c-py').isDisabled, true);

    // Change q1 selection from c-py to c-net
    const updated = selectCourse(selections, 'q1', 'c-net', mockForm);
    selections = updated.selections;

    // Now c-py is released and should be enabled for q2!
    q2Availability = getCourseAvailabilityForQuestion(mockForm.questions[1], selections);
    assert.equal(q2Availability.find((c) => c.id === 'c-py').isDisabled, false);
    // And c-net is not an option for q2 anyway, but c-py is fully available
  });
});

describe('Submission Payload Construction', () => {
  it('creates a clean, correctly structured payload from valid state', () => {
    const selections = {
      q1: 'c-py',
      q2: 'c-jv',
      q3: 'c-net',
    };

    const payload = createSubmissionPayload({
      form: mockForm,
      facultyDetails: mockFaculty,
      selections,
    });

    assert.deepEqual(payload, {
      faculty_name: 'Prof. Margaret Hamilton',
      faculty_id: 'FAC-NASA-01',
      answers: [
        { question_id: 'q1', course_id: 'c-py' },
        { question_id: 'q2', course_id: 'c-jv' },
        { question_id: 'q3', course_id: 'c-net' },
      ],
    });

    // Ensure no UI-only state or unexpected keys are present
    assert.equal(Object.keys(payload).length, 3);
    assert.equal(payload.answers[0].course_name, undefined);
    assert.equal(payload.answers[0].is_disabled, undefined);
  });

  it('preserves the defined question order in the answers list', () => {
    // Selections passed with different key insertion order
    const disorderedSelections = {
      q3: 'c-net',
      q1: 'c-py',
      q2: 'c-jv',
    };

    const payload = createSubmissionPayload({
      form: mockForm,
      facultyDetails: mockFaculty,
      selections: disorderedSelections,
    });

    assert.equal(payload.answers[0].question_id, 'q1');
    assert.equal(payload.answers[1].question_id, 'q2');
    assert.equal(payload.answers[2].question_id, 'q3');
  });

  it('refuses to construct a payload from invalid form state (throws FormValidationError)', () => {
    const invalidSelections = {
      q1: 'c-py',
      q2: 'c-py', // duplicate!
      q3: 'c-net',
    };

    assert.throws(
      () => {
        createSubmissionPayload({
          form: mockForm,
          facultyDetails: mockFaculty,
          selections: invalidSelections,
        });
      },
      (err) => {
        assert.ok(err instanceof FormValidationError);
        assert.equal(err.validationResult.isValid, false);
        return true;
      }
    );
  });
});

describe('Submission Lifecycle & State Transitions', () => {
  it('initializes in idle state', () => {
    assert.equal(initialSubmissionState.status, SUBMISSION_STATUS.IDLE);
    assert.equal(initialSubmissionState.isValidating, false);
    assert.equal(initialSubmissionState.isSubmitting, false);
    assert.equal(initialSubmissionState.isSuccess, false);
    assert.equal(initialSubmissionState.isError, false);
  });

  it('handles state transitions: idle -> validating -> submitting -> success', () => {
    let state = initialSubmissionState;

    state = submissionReducer(state, { type: 'START_VALIDATING' });
    assert.equal(state.status, SUBMISSION_STATUS.VALIDATING);
    assert.equal(state.isValidating, true);

    state = submissionReducer(state, { type: 'START_SUBMITTING' });
    assert.equal(state.status, SUBMISSION_STATUS.SUBMITTING);
    assert.equal(state.isSubmitting, true);

    const mockResponse = { id: 'resp-123', message: 'Preferences saved' };
    state = submissionReducer(state, { type: 'SUBMISSION_SUCCESS', payload: mockResponse });
    assert.equal(state.status, SUBMISSION_STATUS.SUCCESS);
    assert.equal(state.isSuccess, true);
    assert.equal(state.isSubmitting, false);
    assert.deepEqual(state.responseData, mockResponse);
  });

  it('handles state transitions: validating -> validation_failed', () => {
    let state = initialSubmissionState;
    state = submissionReducer(state, { type: 'START_VALIDATING' });

    const errors = { faculty_name: 'Required' };
    state = submissionReducer(state, { type: 'VALIDATION_FAILED', payload: errors });

    assert.equal(state.status, SUBMISSION_STATUS.ERROR);
    assert.equal(state.isError, true);
    assert.equal(state.error.type, 'VALIDATION_ERROR');
    assert.deepEqual(state.validationErrors, errors);
  });

  it('handles reset action returning state to idle', () => {
    const errorState = {
      ...initialSubmissionState,
      status: SUBMISSION_STATUS.ERROR,
      isError: true,
      error: { message: 'Failed' },
    };

    const resetState = submissionReducer(errorState, { type: 'RESET' });
    assert.equal(resetState.status, SUBMISSION_STATUS.IDLE);
    assert.equal(resetState.isError, false);
  });
});

describe('HTTP Error Mapping', () => {
  it('maps HTTP 400 Bad Request', () => {
    const mapped = mapHttpError(400);
    assert.equal(mapped.status, 400);
    assert.equal(mapped.isRetryable, true);
    assert.ok(mapped.message.includes('Invalid submission format'));
  });

  it('maps HTTP 401 Unauthorized', () => {
    const mapped = mapHttpError(401);
    assert.equal(mapped.status, 401);
    assert.equal(mapped.isRetryable, false);
  });

  it('maps HTTP 403 Forbidden / Form Closed', () => {
    const mapped = mapHttpError(403);
    assert.equal(mapped.status, 403);
    assert.equal(mapped.isRetryable, false);
    assert.ok(mapped.message.includes('closed or no longer accepting'));
  });

  it('maps HTTP 404 Form Not Found / Expired', () => {
    const mapped = mapHttpError(404);
    assert.equal(mapped.status, 404);
    assert.equal(mapped.isRetryable, false);
    assert.ok(mapped.message.includes('not found or the public access link has expired'));
  });

  it('maps HTTP 409 Conflict / Duplicate Submission', () => {
    const mapped = mapHttpError(409);
    assert.equal(mapped.status, 409);
    assert.equal(mapped.isRetryable, false);
    assert.ok(mapped.message.includes('already been submitted for this Faculty ID'));
  });

  it('maps HTTP 422 Unprocessable Entity / Backend Validation Error', () => {
    const mapped = mapHttpError(422, { detail: 'Duplicate courses detected by backend' });
    assert.equal(mapped.status, 422);
    assert.equal(mapped.isRetryable, true);
    assert.equal(mapped.message, 'Duplicate courses detected by backend');
  });

  it('maps HTTP 429 Rate Limit Exceeded', () => {
    const mapped = mapHttpError(429);
    assert.equal(mapped.status, 429);
    assert.equal(mapped.isRetryable, true);
    assert.ok(mapped.message.includes('Too many submissions'));
  });

  it('maps HTTP 500 Server Error', () => {
    const mapped = mapHttpError(500);
    assert.equal(mapped.status, 500);
    assert.equal(mapped.isRetryable, true);
    assert.ok(mapped.message.includes('The server encountered an error'));
  });

  it('maps Network Failure (status 0)', () => {
    const mapped = mapHttpError(0);
    assert.equal(mapped.status, 0);
    assert.equal(mapped.isRetryable, true);
    assert.ok(mapped.message.includes('Network failure'));
  });
});

describe('End-to-End Form Submission Workflow', () => {
  const validSelections = {
    q1: 'c-py',
    q2: 'c-jv',
    q3: 'c-net',
  };

  it('successfully submits and dispatches proper lifecycle actions on HTTP 200/201', async () => {
    const actions = [];
    const mockDispatch = (action) => actions.push(action);

    const mockApiFn = async (token, payload) => {
      assert.equal(token, 'test-token-456');
      assert.equal(payload.faculty_id, 'FAC-NASA-01');
      return { submission_id: 'sub-999', status: 'saved' };
    };

    const result = await submitFacultyFormWorkflow({
      token: 'test-token-456',
      form: mockForm,
      facultyDetails: mockFaculty,
      selections: validSelections,
      submitApiFn: mockApiFn,
      dispatch: mockDispatch,
    });

    assert.equal(result.success, true);
    assert.equal(result.data.submission_id, 'sub-999');

    // Verify dispatched sequence: START_VALIDATING -> START_SUBMITTING -> SUBMISSION_SUCCESS
    assert.equal(actions[0].type, 'START_VALIDATING');
    assert.equal(actions[1].type, 'START_SUBMITTING');
    assert.equal(actions[2].type, 'SUBMISSION_SUCCESS');
  });

  it('prevents API calls and dispatches VALIDATION_FAILED when client validation fails', async () => {
    let apiCalled = false;
    const actions = [];

    const result = await submitFacultyFormWorkflow({
      token: 'test-token-456',
      form: mockForm,
      facultyDetails: { faculty_name: '', faculty_id: '' }, // invalid details
      selections: validSelections,
      submitApiFn: async () => {
        apiCalled = true;
      },
      dispatch: (action) => actions.push(action),
    });

    assert.equal(result.success, false);
    assert.equal(apiCalled, false); // API was NOT called!
    assert.equal(actions[0].type, 'START_VALIDATING');
    assert.equal(actions[1].type, 'VALIDATION_FAILED');
  });

  it('handles backend validation failure (422) without clearing user data', async () => {
    const actions = [];
    const mockApiFn = async () => {
      throw new ApiError('Duplicate course rejected by backend validator', 422, {
        detail: 'Course c-py appears twice',
      });
    };

    const result = await submitFacultyFormWorkflow({
      token: 'test-token-456',
      form: mockForm,
      facultyDetails: mockFaculty,
      selections: validSelections,
      submitApiFn: mockApiFn,
      dispatch: (action) => actions.push(action),
    });

    assert.equal(result.success, false);
    assert.equal(result.error.status, 422);
    assert.equal(result.error.isRetryable, true);

    const errorAction = actions.find((a) => a.type === 'SUBMISSION_ERROR');
    assert.ok(errorAction);
    assert.equal(errorAction.payload.status, 422);
  });

  it('handles invalid or expired public token (404)', async () => {
    const actions = [];
    const mockApiFn = async () => {
      throw new ApiError('Form not found', 404);
    };

    const result = await submitFacultyFormWorkflow({
      token: 'expired-token',
      form: mockForm,
      facultyDetails: mockFaculty,
      selections: validSelections,
      submitApiFn: mockApiFn,
      dispatch: (action) => actions.push(action),
    });

    assert.equal(result.success, false);
    assert.equal(result.error.status, 404);
    assert.equal(result.error.isRetryable, false);
  });

  it('handles network failure (fetch rejected) and marks as retryable', async () => {
    const actions = [];
    const mockApiFn = async () => {
      throw new ApiError('Network connection lost', 0);
    };

    const result = await submitFacultyFormWorkflow({
      token: 'test-token-456',
      form: mockForm,
      facultyDetails: mockFaculty,
      selections: validSelections,
      submitApiFn: mockApiFn,
      dispatch: (action) => actions.push(action),
    });

    assert.equal(result.success, false);
    assert.equal(result.error.status, 0);
    assert.equal(result.error.isRetryable, true);
  });

  it('handles server internal error (500) and allows retry', async () => {
    let attempts = 0;
    const mockApiFn = async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new ApiError('Database transaction deadlock', 500);
      }
      return { submission_id: 'sub-recovered', status: 'saved' };
    };

    // First attempt fails with 500
    const failResult = await submitFacultyFormWorkflow({
      token: 'test-token-456',
      form: mockForm,
      facultyDetails: mockFaculty,
      selections: validSelections,
      submitApiFn: mockApiFn,
    });
    assert.equal(failResult.success, false);
    assert.equal(failResult.error.status, 500);

    // Second attempt (retry) succeeds with existing selections
    const retryResult = await submitFacultyFormWorkflow({
      token: 'test-token-456',
      form: mockForm,
      facultyDetails: mockFaculty,
      selections: validSelections,
      submitApiFn: mockApiFn,
    });
    assert.equal(retryResult.success, true);
    assert.equal(retryResult.data.submission_id, 'sub-recovered');
  });

  it('prevents duplicate concurrent submissions when a submission is already in progress', async () => {
    let apiCalled = false;
    const inFlightState = {
      ...initialSubmissionState,
      status: SUBMISSION_STATUS.SUBMITTING,
      isSubmitting: true,
    };

    const result = await submitFacultyFormWorkflow({
      token: 'test-token-456',
      form: mockForm,
      facultyDetails: mockFaculty,
      selections: validSelections,
      currentState: inFlightState,
      submitApiFn: async () => {
        apiCalled = true;
      },
    });

    assert.equal(result.success, false);
    assert.equal(apiCalled, false);
    assert.ok(result.error.message.includes('already in progress'));
  });
});

describe('API Client Functions', () => {
  it('fetchPublicForm issues GET with correct headers and parses JSON', async () => {
    const mockFetch = async (url, options) => {
      assert.equal(url, 'https://api.example.com/api/public/forms/token-abc');
      assert.equal(options.method, 'GET');
      assert.equal(options.headers.Accept, 'application/json');
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ title: 'Test Form' }),
      };
    };

    const data = await fetchPublicForm('token-abc', {
      fetchFn: mockFetch,
      baseUrl: 'https://api.example.com',
    });

    assert.equal(data.title, 'Test Form');
  });

  it('submitFacultyResponse issues POST with JSON body', async () => {
    const mockFetch = async (url, options) => {
      assert.equal(url, 'https://api.example.com/api/public/forms/token-abc/responses');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['Content-Type'], 'application/json');
      const body = JSON.parse(options.body);
      assert.equal(body.faculty_name, 'Test Faculty');
      return {
        ok: true,
        status: 201,
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true }),
      };
    };

    const res = await submitFacultyResponse('token-abc', { faculty_name: 'Test Faculty' }, {
      fetchFn: mockFetch,
      baseUrl: 'https://api.example.com',
    });

    assert.equal(res.success, true);
  });
});

describe('Semester Availability and Dynamic Questions in Faculty Form Logic', () => {
  const dynamicForm = {
    token: 'tok-dyn-multi',
    title: 'Dynamic Multi-Semester Form',
    questions: [
      {
        id: 'q1',
        title: 'Preference 1 (Semester 3)',
        order: 1,
        semester: 3,
        courses: [
          { id: 'c-ds', code: 'CS201', name: 'Data Structures', semester: 3 },
          { id: 'c-dbms', code: 'CS202', name: 'DBMS', semester: 3 },
        ],
      },
      {
        id: 'q2',
        title: 'Preference 2 (Semester 3)',
        order: 2,
        semester: 3,
        courses: [
          { id: 'c-ds', code: 'CS201', name: 'Data Structures', semester: 3 },
          { id: 'c-dbms', code: 'CS202', name: 'DBMS', semester: 3 },
        ],
      },
      {
        id: 'q3',
        title: 'Preference 3 (Semester 4)',
        order: 3,
        semester: 4,
        courses: [
          { id: 'c-os', code: 'CS301', name: 'Operating Systems', semester: 4 },
          { id: 'c-cn', code: 'CS302', name: 'Computer Networks', semester: 4 },
        ],
      },
      {
        id: 'q4',
        title: 'Preference 4 (All Semesters)',
        order: 4,
        semester: null,
        courses: [
          { id: 'c-ds', code: 'CS201', name: 'Data Structures', semester: 3 },
          { id: 'c-dbms', code: 'CS202', name: 'DBMS', semester: 3 },
          { id: 'c-os', code: 'CS301', name: 'Operating Systems', semester: 4 },
          { id: 'c-cn', code: 'CS302', name: 'Computer Networks', semester: 4 },
          { id: 'c-ai', code: 'CS401', name: 'AI', semester: 5 },
        ],
      },
    ],
  };

  it('correctly disables selected course in other questions regardless of semester setting', () => {
    // Initial: no selections
    const initialSelections = { q1: null, q2: null, q3: null, q4: null };

    // Select Data Structures (c-ds) in Q1
    const { selections } = selectCourse(initialSelections, 'q1', 'c-ds', dynamicForm);

    // In Q1, c-ds is selected and NOT disabled
    const q1Avail = getCourseAvailabilityForQuestion(dynamicForm.questions[0], selections);
    const q1Ds = q1Avail.find((c) => c.id === 'c-ds');
    assert.equal(q1Ds.isSelected, true);
    assert.equal(q1Ds.isDisabled, false);

    // In Q2 (same semester 3), c-ds is disabled with clear reason
    const q2Avail = getCourseAvailabilityForQuestion(dynamicForm.questions[1], selections);
    const q2Ds = q2Avail.find((c) => c.id === 'c-ds');
    assert.equal(q2Ds.isSelected, false);
    assert.equal(q2Ds.isDisabled, true);
    assert.equal(q2Ds.disabledReason, 'Already selected for another preference');

    // In Q4 (All Semesters), c-ds is ALSO disabled with clear reason
    const q4Avail = getCourseAvailabilityForQuestion(dynamicForm.questions[3], selections);
    const q4Ds = q4Avail.find((c) => c.id === 'c-ds');
    assert.equal(q4Ds.isSelected, false);
    assert.equal(q4Ds.isDisabled, true);
    assert.equal(q4Ds.disabledReason, 'Already selected for another preference');

    // Other eligible courses in Q2 and Q4 remain enabled
    const q2Dbms = q2Avail.find((c) => c.id === 'c-dbms');
    assert.equal(q2Dbms.isDisabled, false);
    const q4Ai = q4Avail.find((c) => c.id === 'c-ai');
    assert.equal(q4Ai.isDisabled, false);

    // Clearing Q1 immediately re-enables c-ds in Q2 and Q4
    const cleared = clearSelection(selections, 'q1');
    const q2AvailAfterClear = getCourseAvailabilityForQuestion(dynamicForm.questions[1], cleared.selections);
    const q4AvailAfterClear = getCourseAvailabilityForQuestion(dynamicForm.questions[3], cleared.selections);
    assert.equal(q2AvailAfterClear.find((c) => c.id === 'c-ds').isDisabled, false);
    assert.equal(q4AvailAfterClear.find((c) => c.id === 'c-ds').isDisabled, false);
  });
});

