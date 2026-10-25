import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateFacultyDetails,
  validateFormData,
  getDuplicateSelections,
  hasDuplicateSelections,
  isCourseSelectedElsewhere,
  isCourseDisabledForQuestion,
  getSelectedCoursesElsewhere,
  validateFacultyFormSubmission,
} from './facultyFormValidation.js';

describe('Faculty Details Validation', () => {
  it('accepts valid faculty name and ID', () => {
    const result = validateFacultyDetails({
      faculty_name: 'Dr. Alan Turing',
      faculty_id: 'FAC-101',
    });

    assert.equal(result.isValid, true);
    assert.deepEqual(result.errors, {});
    assert.equal(result.sanitized.faculty_name, 'Dr. Alan Turing');
    assert.equal(result.sanitized.faculty_id, 'FAC-101');
  });

  it('rejects missing faculty name', () => {
    const result = validateFacultyDetails({
      faculty_id: 'FAC-101',
    });

    assert.equal(result.isValid, false);
    assert.equal(result.errors.faculty_name, 'Faculty name is required.');
    assert.equal(result.errors.faculty_id, undefined);
  });

  it('rejects missing faculty ID', () => {
    const result = validateFacultyDetails({
      faculty_name: 'Dr. Alan Turing',
    });

    assert.equal(result.isValid, false);
    assert.equal(result.errors.faculty_id, 'Faculty ID is required.');
    assert.equal(result.errors.faculty_name, undefined);
  });

  it('rejects whitespace-only name', () => {
    const result = validateFacultyDetails({
      faculty_name: '   \t  \n ',
      faculty_id: 'FAC-101',
    });

    assert.equal(result.isValid, false);
    assert.equal(result.errors.faculty_name, 'Faculty name is required.');
  });

  it('rejects whitespace-only ID', () => {
    const result = validateFacultyDetails({
      faculty_name: 'Dr. Alan Turing',
      faculty_id: '    ',
    });

    assert.equal(result.isValid, false);
    assert.equal(result.errors.faculty_id, 'Faculty ID is required.');
  });

  it('trims surrounding whitespace while preserving internal formatting', () => {
    const result = validateFacultyDetails({
      faculty_name: '   Dr. Ada Lovelace   ',
      faculty_id: '   FAC / 2026 / 09   ',
    });

    assert.equal(result.isValid, true);
    assert.equal(result.sanitized.faculty_name, 'Dr. Ada Lovelace');
    assert.equal(result.sanitized.faculty_id, 'FAC / 2026 / 09');
  });

  it('handles null or undefined argument safely', () => {
    const result = validateFacultyDetails(null);
    assert.equal(result.isValid, false);
    assert.ok(result.errors.faculty_name);
    assert.ok(result.errors.faculty_id);
  });
});

describe('Form Data Validation', () => {
  it('accepts a valid form with several questions', () => {
    const rawForm = {
      token: 'pub-tok-123',
      title: 'Spring 2026 Course Preferences',
      questions: [
        {
          id: 'q1',
          title: 'Preference 1',
          courses: [
            { id: 'c-py', name: 'Python Programming', code: 'CS101' },
            { id: 'c-jv', name: 'Java Programming', code: 'CS102' },
          ],
        },
        {
          id: 'q2',
          title: 'Preference 2',
          courses: [
            { id: 'c-py', name: 'Python Programming', code: 'CS101' },
            { id: 'c-net', name: 'Computer Networks', code: 'CS201' },
          ],
        },
      ],
    };

    const result = validateFormData(rawForm);
    assert.equal(result.isValid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.normalizedForm.questions.length, 2);
    assert.equal(result.normalizedForm.questions[0].courses.length, 2);
  });

  it('accepts a valid form with one question', () => {
    const rawForm = {
      token: 'pub-tok-single',
      title: 'Single Preference Form',
      questions: [
        {
          id: 'q1',
          title: 'Main Preference',
          courses: [{ id: 'c-ds', name: 'Data Structures', code: 'CS202' }],
        },
      ],
    };

    const result = validateFormData(rawForm);
    assert.equal(result.isValid, true);
    assert.equal(result.normalizedForm.questions.length, 1);
  });

  it('rejects an empty question list', () => {
    const rawForm = {
      token: 'pub-tok-empty',
      title: 'Empty Form',
      questions: [],
    };

    const result = validateFormData(rawForm);
    assert.equal(result.isValid, false);
    assert.ok(result.errors.some((e) => e.includes('does not contain any questions')));
  });

  it('rejects non-object or missing form data', () => {
    assert.equal(validateFormData(null).isValid, false);
    assert.equal(validateFormData(undefined).isValid, false);
    assert.equal(validateFormData('invalid-string').isValid, false);
    assert.equal(validateFormData([]).isValid, false);
  });

  it('rejects malformed questions missing an ID', () => {
    const rawForm = {
      token: 'pub-tok-malformed',
      questions: [
        {
          // missing id
          title: 'Malformed Question',
          courses: [{ id: 'c1', name: 'Course 1' }],
        },
      ],
    };

    const result = validateFormData(rawForm);
    assert.equal(result.isValid, false);
    assert.ok(result.errors.some((e) => e.includes('missing a valid identifier')));
  });

  it('rejects duplicate question IDs in the same form', () => {
    const rawForm = {
      token: 'pub-tok-dup-q',
      questions: [
        {
          id: 'q1',
          title: 'First Question',
          courses: [{ id: 'c1', name: 'Course 1' }],
        },
        {
          id: 'q1', // duplicate question id
          title: 'Second Question with duplicate ID',
          courses: [{ id: 'c2', name: 'Course 2' }],
        },
      ],
    };

    const result = validateFormData(rawForm);
    assert.equal(result.isValid, false);
    assert.ok(result.errors.some((e) => e.includes('Duplicate question identifier "q1"')));
  });

  it('flags questions with no available courses (empty courses array) without crashing', () => {
    const rawForm = {
      token: 'pub-tok-no-courses',
      questions: [
        {
          id: 'q1',
          title: 'Question without courses',
          courses: [],
        },
      ],
    };

    const result = validateFormData(rawForm);
    assert.equal(result.isValid, true);
    assert.equal(result.normalizedForm.questions[0].hasNoCourses, true);
    assert.ok(result.warnings.some((w) => w.includes('has no available course options')));
  });

  it('rejects duplicate course options within the same question', () => {
    const rawForm = {
      token: 'pub-tok-dup-course',
      questions: [
        {
          id: 'q1',
          title: 'Question 1',
          courses: [
            { id: 'c-py', name: 'Python A' },
            { id: 'c-py', name: 'Python B' }, // duplicate course ID in same question
          ],
        },
      ],
    };

    const result = validateFormData(rawForm);
    assert.equal(result.isValid, false);
    assert.ok(result.errors.some((e) => e.includes('Duplicate course identifier "c-py"')));
  });
});

describe('Duplicate Course Detection Rules', () => {
  it('accepts distinct courses selected for each question', () => {
    const selections = {
      q1: 'course-python',
      q2: 'course-java',
      q3: 'course-networks',
    };

    assert.equal(hasDuplicateSelections(selections), false);
    assert.deepEqual(getDuplicateSelections(selections), {});
  });

  it('detects duplicate course selections across questions', () => {
    const selections = {
      q1: 'course-python',
      q2: 'course-java',
      q3: 'course-python', // duplicate with q1
    };

    assert.equal(hasDuplicateSelections(selections), true);
    const duplicates = getDuplicateSelections(selections);
    assert.deepEqual(duplicates, {
      'course-python': ['q1', 'q3'],
    });
  });

  it('marks a course selected elsewhere as unavailable for other questions', () => {
    const selections = {
      q1: 'course-python',
      q2: 'course-java',
    };

    assert.equal(isCourseSelectedElsewhere(selections, 'course-python', 'q2'), true);
    assert.equal(isCourseDisabledForQuestion(selections, 'course-python', 'q2'), true);
  });

  it('keeps a question’s own current selection available for that same question', () => {
    const selections = {
      q1: 'course-python',
      q2: 'course-java',
    };

    // For q1, course-python is its own selection, so it must NOT be disabled for q1
    assert.equal(isCourseSelectedElsewhere(selections, 'course-python', 'q1'), false);
    assert.equal(isCourseDisabledForQuestion(selections, 'course-python', 'q1'), false);
  });

  it('returns all courses selected elsewhere excluding the active question', () => {
    const selections = {
      q1: 'c-py',
      q2: 'c-jv',
      q3: 'c-net',
    };

    const elsewhereForQ2 = getSelectedCoursesElsewhere(selections, 'q2');
    assert.equal(elsewhereForQ2.includes('c-py'), true);
    assert.equal(elsewhereForQ2.includes('c-net'), true);
    assert.equal(elsewhereForQ2.includes('c-jv'), false);
  });

  it('uses stable course IDs rather than course names for duplicate comparison', () => {
    // Two courses with the same display name but distinct IDs should NOT be considered duplicates
    const selections = {
      q1: 'course-sec-A', // display: "Database Systems"
      q2: 'course-sec-B', // display: "Database Systems"
    };

    assert.equal(hasDuplicateSelections(selections), false);
  });
});

describe('Central Form Submission Validation', () => {
  const validForm = {
    token: 'token-spring-2026',
    title: 'Preference Portal',
    questions: [
      {
        id: 'q1',
        title: 'First Choice',
        courses: [
          { id: 'c-py', name: 'Python' },
          { id: 'c-jv', name: 'Java' },
        ],
      },
      {
        id: 'q2',
        title: 'Second Choice',
        courses: [
          { id: 'c-py', name: 'Python' },
          { id: 'c-net', name: 'Networks' },
        ],
      },
    ],
  };

  const validFaculty = {
    faculty_name: 'Dr. Grace Hopper',
    faculty_id: 'FAC-007',
  };

  it('validates a completely valid submission with unique selections', () => {
    const selections = {
      q1: 'c-py',
      q2: 'c-net',
    };

    const result = validateFacultyFormSubmission({
      form: validForm,
      facultyDetails: validFaculty,
      selections,
    });

    assert.equal(result.isValid, true);
    assert.deepEqual(result.errors, {});
    assert.equal(result.sanitizedDetails.faculty_name, 'Dr. Grace Hopper');
  });

  it('fails validation when faculty details are missing', () => {
    const selections = { q1: 'c-py', q2: 'c-net' };

    const result = validateFacultyFormSubmission({
      form: validForm,
      facultyDetails: { faculty_name: '', faculty_id: '   ' },
      selections,
    });

    assert.equal(result.isValid, false);
    assert.ok(result.errors.faculty_name);
    assert.ok(result.errors.faculty_id);
  });

  it('fails validation when required questions are unanswered', () => {
    const selections = {
      q1: 'c-py',
      q2: null, // missing answer for q2
    };

    const result = validateFacultyFormSubmission({
      form: validForm,
      facultyDetails: validFaculty,
      selections,
    });

    assert.equal(result.isValid, false);
    assert.ok(result.errors.questions.q2);
  });

  it('fails validation when duplicate course selections are made', () => {
    const selections = {
      q1: 'c-py',
      q2: 'c-py', // duplicate!
    };

    const result = validateFacultyFormSubmission({
      form: validForm,
      facultyDetails: validFaculty,
      selections,
    });

    assert.equal(result.isValid, false);
    assert.ok(result.errors.questions.q1 || result.errors.questions.q2);
    assert.ok(result.errors.general.some((g) => g.includes('c-py')));
  });

  it('fails validation when a selected course is not permitted for that question', () => {
    const selections = {
      q1: 'c-net', // c-net is only allowed in q2, not in q1
      q2: 'c-py',
    };

    const result = validateFacultyFormSubmission({
      form: validForm,
      facultyDetails: validFaculty,
      selections,
    });

    assert.equal(result.isValid, false);
    assert.ok(result.errors.questions.q1.includes('not permitted'));
  });

  it('fails validation if selection map contains invalid or extraneous question IDs', () => {
    const selections = {
      q1: 'c-py',
      q2: 'c-net',
      q_unknown: 'c-py', // unknown question ID
    };

    const result = validateFacultyFormSubmission({
      form: validForm,
      facultyDetails: validFaculty,
      selections,
    });

    assert.equal(result.isValid, false);
    assert.ok(result.errors.general.some((g) => g.includes('unrecognized question identifier')));
  });

  it('does NOT block submission if a question has no available courses', () => {
    const formWithNoCourseQuestion = {
      token: 'tok-partial',
      title: 'Partial Form',
      questions: [
        {
          id: 'q1',
          title: 'Choice 1',
          courses: [{ id: 'c1', name: 'Course 1' }],
        },
        {
          id: 'q2',
          title: 'Choice 2 (No courses available)',
          courses: [], // empty courses
        },
      ],
    };

    const selections = {
      q1: 'c1',
      q2: null,
    };

    const result = validateFacultyFormSubmission({
      form: formWithNoCourseQuestion,
      facultyDetails: validFaculty,
      selections,
    });

    assert.equal(result.isValid, true);
    assert.deepEqual(result.unavailableQuestions, ['q2']);
  });
});
