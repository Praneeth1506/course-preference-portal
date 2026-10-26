import assert from 'node:assert/strict';
import { test } from 'node:test';

import { errorDetailMessage } from './facultyFormApi.js';
import { mapHttpError } from './facultyFormLogic.js';
import { validateFormData } from './facultyFormValidation.js';

// Shape returned by GET /api/public/forms/{token} (backend/app/routers/public.py).
const PUBLIC_FORM = {
  form_id: '6aded3898983f5dc619f3400',
  title: 'Fall Preferences',
  description: null,
  questions: [
    {
      question_id: 'q1',
      text: 'Core course',
      order: 1,
      semester: 3,
      courses: [
        { course_id: '6aded3898983f5dc619f3446', course_code: 'CS301', course_name: 'Database Systems', semester: 3 },
      ],
    },
  ],
};

test('validateFormData reads backend question text and course code/name', () => {
  const { isValid, normalizedForm } = validateFormData(PUBLIC_FORM);

  assert.equal(isValid, true);
  assert.equal(normalizedForm.questions[0].title, 'Core course');
  assert.deepEqual(
    { code: normalizedForm.questions[0].courses[0].code, name: normalizedForm.questions[0].courses[0].name },
    { code: 'CS301', name: 'Database Systems' },
  );
});

test('errorDetailMessage flattens FastAPI validation errors', () => {
  const data = {
    detail: [
      { type: 'string_too_long', loc: ['body', 'faculty_id'], msg: 'String should have at most 100 characters' },
    ],
  };

  assert.equal(errorDetailMessage(data), 'faculty_id: String should have at most 100 characters');
  assert.equal(errorDetailMessage({ detail: 'Form not found or not published.' }), 'Form not found or not published.');
  assert.equal(errorDetailMessage(null), null);
});

test('mapHttpError always returns a string message for list-style details', () => {
  const mapped = mapHttpError(422, {
    detail: [{ loc: ['body', 'faculty_name'], msg: 'Field required' }],
  });

  assert.equal(typeof mapped.message, 'string');
  assert.equal(mapped.message, 'faculty_name: Field required');
});
