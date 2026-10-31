/**
 * Faculty Form Validation Module
 *
 * Implements pure validation rules for the Faculty Course Preference Form:
 * - Faculty detail validation (name and ID)
 * - Form definition integrity validation
 * - Duplicate course selection detection
 * - Complete response submission validation
 */

/**
 * Validates faculty details (name and ID).
 *
 * Rules:
 * - Both faculty_name and faculty_id are required.
 * - Rejects null, undefined, non-strings, or whitespace-only strings.
 * - Trims surrounding whitespace without altering internal spacing/casing.
 * - Returns field-specific validation errors.
 *
 * @param {Object} details
 * @param {string} [details.faculty_name] - Name of the faculty member
 * @param {string} [details.faculty_id] - Faculty identification number/code
 * @returns {{
 *   isValid: boolean,
 *   errors: { faculty_name?: string, faculty_id?: string },
 *   sanitized: { faculty_name: string, faculty_id: string }
 * }}
 */
export function validateFacultyDetails(details = {}) {
  const errors = {};

  const rawName = details?.faculty_name;
  const rawId = details?.faculty_id;

  const isNameString = typeof rawName === 'string';
  const trimmedName = isNameString ? rawName.trim() : '';

  if (!isNameString || trimmedName.length === 0) {
    errors.faculty_name = 'Faculty name is required.';
  }

  const isIdString = typeof rawId === 'string';
  const trimmedId = isIdString ? rawId.trim() : '';

  if (!isIdString || trimmedId.length === 0) {
    errors.faculty_id = 'Faculty ID is required.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitized: {
      faculty_name: trimmedName,
      faculty_id: trimmedId,
    },
  };
}

/**
 * Validates and normalizes raw form data received from the backend/API.
 *
 * Handles:
 * - Variable number of questions (1 to N)
 * - Empty question list detection
 * - Malformed or missing form structure
 * - Questions with no available courses (flags hasNoCourses)
 * - Duplicate question identifiers detection
 * - Duplicate course options within the same question detection
 *
 * @param {Object} rawForm
 * @returns {{
 *   isValid: boolean,
 *   errors: string[],
 *   warnings: string[],
 *   normalizedForm: Object|null
 * }}
 */
export function validateFormData(rawForm) {
  const errors = [];
  const warnings = [];

  if (!rawForm || typeof rawForm !== 'object' || Array.isArray(rawForm)) {
    return {
      isValid: false,
      errors: ['Form data must be a valid object.'],
      warnings: [],
      normalizedForm: null,
    };
  }

  // Extract form token or ID
  const token = rawForm.token || rawForm.form_id || rawForm.id || '';
  const title = typeof rawForm.title === 'string' ? rawForm.title.trim() : '';
  const description = typeof rawForm.description === 'string' ? rawForm.description.trim() : '';

  const questionsRaw = rawForm.questions;

  if (!Array.isArray(questionsRaw)) {
    return {
      isValid: false,
      errors: ['Form questions must be provided as an array.'],
      warnings: [],
      normalizedForm: null,
    };
  }

  if (questionsRaw.length === 0) {
    return {
      isValid: false,
      errors: ['The form does not contain any questions.'],
      warnings: [],
      normalizedForm: null,
    };
  }

  const seenQuestionIds = new Set();
  const normalizedQuestions = [];

  for (let index = 0; index < questionsRaw.length; index += 1) {
    const q = questionsRaw[index];
    const qIndexDisplay = index + 1;

    if (!q || typeof q !== 'object') {
      errors.push(`Question at index ${index} is malformed or invalid.`);
      continue;
    }

    const qId = q.id ?? q.question_id;
    if (qId === undefined || qId === null || String(qId).trim() === '') {
      errors.push(`Question at index ${index} is missing a valid identifier.`);
      continue;
    }

    const stableQId = String(qId).trim();

    if (seenQuestionIds.has(stableQId)) {
      errors.push(`Duplicate question identifier "${stableQId}" detected at index ${index}.`);
      continue;
    }
    seenQuestionIds.add(stableQId);

    const qTitle = typeof q.title === 'string'
      ? q.title.trim()
      : typeof q.text === 'string' && q.text.trim()
      ? q.text.trim()
      : typeof q.prompt === 'string'
      ? q.prompt.trim()
      : typeof q.label === 'string'
      ? q.label.trim()
      : `Preference ${qIndexDisplay}`;

    const rawCourses = q.courses || q.allowed_courses || q.options;

    if (!Array.isArray(rawCourses)) {
      errors.push(`Question "${stableQId}" must have an array of allowed course options.`);
      continue;
    }

    const seenCourseIds = new Set();
    const normalizedCourses = [];

    for (let cIdx = 0; cIdx < rawCourses.length; cIdx += 1) {
      const c = rawCourses[cIdx];
      if (!c || typeof c !== 'object') {
        warnings.push(`Course at index ${cIdx} in question "${stableQId}" is malformed.`);
        continue;
      }

      const cId = c.id ?? c.course_id;
      if (cId === undefined || cId === null || String(cId).trim() === '') {
        warnings.push(`Course at index ${cIdx} in question "${stableQId}" is missing an ID.`);
        continue;
      }

      const stableCId = String(cId).trim();

      if (seenCourseIds.has(stableCId)) {
        errors.push(`Duplicate course identifier "${stableCId}" in question "${stableQId}".`);
        continue;
      }
      seenCourseIds.add(stableCId);

      // The backend sends course_code / course_name (GET /api/public/forms/{token}).
      const rawCode = c.code ?? c.course_code;
      const cSemester =
        c.semester !== undefined && c.semester !== null && c.semester !== ''
          ? Number(c.semester)
          : null;

      const qSemester =
        q.semester !== undefined && q.semester !== null && q.semester !== ''
          ? Number(q.semester)
          : null;

      // Filter out courses that do not belong to the question's configured semester
      if (qSemester !== null && cSemester !== null && cSemester !== qSemester) {
        continue;
      }

      normalizedCourses.push({
        id: stableCId,
        code: rawCode ? String(rawCode).trim() : '',
        name: c.name || c.course_name || c.title || stableCId,
        department: c.department || '',
        semester: cSemester,
      });
    }

    const qSemester =
      q.semester !== undefined && q.semester !== null && q.semester !== ''
        ? Number(q.semester)
        : null;

    const hasNoCourses = normalizedCourses.length === 0;
    if (hasNoCourses) {
      warnings.push(`Question "${stableQId}" currently has no available course options.`);
    }

    normalizedQuestions.push({
      id: stableQId,
      title: qTitle,
      order: typeof q.order === 'number' ? q.order : index,
      semester: qSemester,
      courses: normalizedCourses,
      hasNoCourses,
    });
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    errors,
    warnings,
    normalizedForm: isValid
      ? {
          token: String(token).trim(),
          title,
          description,
          questions: normalizedQuestions,
        }
      : null,
  };
}

/**
 * Finds all duplicate course selections across different questions.
 *
 * @param {Record<string, string|null>} selections - Map of questionId -> courseId
 * @returns {Record<string, string[]>} Map of courseId -> array of questionIds where it is selected
 */
export function getDuplicateSelections(selections = {}) {
  const courseToQuestions = {};
  const duplicates = {};

  if (!selections || typeof selections !== 'object') {
    return duplicates;
  }

  for (const [questionId, courseId] of Object.entries(selections)) {
    if (!courseId || typeof courseId !== 'string') {
      continue;
    }

    const cleanCourseId = courseId.trim();
    if (!cleanCourseId) {
      continue;
    }

    if (!courseToQuestions[cleanCourseId]) {
      courseToQuestions[cleanCourseId] = [questionId];
    } else {
      courseToQuestions[cleanCourseId].push(questionId);
    }
  }

  for (const [courseId, questionIds] of Object.entries(courseToQuestions)) {
    if (questionIds.length > 1) {
      duplicates[courseId] = questionIds;
    }
  }

  return duplicates;
}

/**
 * Returns true if any course is selected for more than one question.
 *
 * @param {Record<string, string|null>} selections
 * @returns {boolean}
 */
export function hasDuplicateSelections(selections = {}) {
  return Object.keys(getDuplicateSelections(selections)).length > 0;
}

/**
 * Checks whether a course is selected in any question OTHER than the given questionId.
 *
 * @param {Record<string, string|null>} selections
 * @param {string} courseId
 * @param {string} currentQuestionId
 * @returns {boolean}
 */
export function isCourseSelectedElsewhere(selections = {}, courseId, currentQuestionId) {
  if (!courseId || !selections || typeof selections !== 'object') {
    return false;
  }

  const cleanCourseId = String(courseId).trim();
  const cleanCurrentQId = currentQuestionId !== undefined && currentQuestionId !== null
    ? String(currentQuestionId).trim()
    : null;

  for (const [qId, selectedCourse] of Object.entries(selections)) {
    if (cleanCurrentQId && qId === cleanCurrentQId) {
      continue;
    }
    if (selectedCourse && String(selectedCourse).trim() === cleanCourseId) {
      return true;
    }
  }

  return false;
}

/**
 * Returns true if a course option should be disabled for a specific question.
 *
 * Rule:
 * - A question's currently selected course MUST remain selectable in that same question.
 * - A course selected in another question must be disabled.
 *
 * @param {Record<string, string|null>} selections
 * @param {string} courseId
 * @param {string} questionId
 * @returns {boolean}
 */
export function isCourseDisabledForQuestion(selections = {}, courseId, questionId) {
  return isCourseSelectedElsewhere(selections, courseId, questionId);
}

/**
 * Returns a list of course IDs selected across all questions EXCEPT the given question.
 *
 * @param {Record<string, string|null>} selections
 * @param {string} currentQuestionId
 * @returns {string[]}
 */
export function getSelectedCoursesElsewhere(selections = {}, currentQuestionId) {
  if (!selections || typeof selections !== 'object') {
    return [];
  }

  const cleanCurrentQId = currentQuestionId !== undefined && currentQuestionId !== null
    ? String(currentQuestionId).trim()
    : null;

  const selectedElsewhere = new Set();

  for (const [qId, courseId] of Object.entries(selections)) {
    if (cleanCurrentQId && qId === cleanCurrentQId) {
      continue;
    }
    if (courseId && typeof courseId === 'string' && courseId.trim()) {
      selectedElsewhere.add(courseId.trim());
    }
  }

  return Array.from(selectedElsewhere);
}

/**
 * Central validation function for the entire faculty course preference submission.
 *
 * Verifies:
 * 1. Faculty name is present and valid.
 * 2. Faculty ID is present and valid.
 * 3. A valid form definition is available.
 * 4. All required questions have been answered (excluding questions with no available courses).
 * 5. Each selected course belongs to that question's allowed courses list.
 * 6. No course is selected more than once across questions.
 * 7. All question identifiers in selections exist in the form.
 * 8. Each answer has the correct data structure.
 * 9. Selections do not contain unexpected or orphaned question IDs.
 *
 * @param {Object} params
 * @param {Object} params.form - Raw or normalized form definition
 * @param {Object} params.facultyDetails - { faculty_name, faculty_id }
 * @param {Record<string, string|null>} params.selections - Map of questionId -> courseId
 * @returns {{
 *   isValid: boolean,
 *   errors: {
 *     faculty_name?: string,
 *     faculty_id?: string,
 *     questions?: Record<string, string>,
 *     general?: string[]
 *   },
 *   unavailableQuestions: string[],
 *   sanitizedDetails: { faculty_name: string, faculty_id: string }
 * }}
 */
export function validateFacultyFormSubmission({ form, facultyDetails, selections } = {}) {
  const resultErrors = {
    questions: {},
    general: [],
  };
  const unavailableQuestions = [];

  // 1. Validate Form Structure
  const formValidation = validateFormData(form);
  if (!formValidation.isValid || !formValidation.normalizedForm) {
    resultErrors.general.push('Invalid form structure: ' + formValidation.errors.join('; '));
    const facultyVal = validateFacultyDetails(facultyDetails);
    return {
      isValid: false,
      errors: {
        ...facultyVal.errors,
        questions: {},
        general: resultErrors.general,
      },
      unavailableQuestions: [],
      sanitizedDetails: facultyVal.sanitized,
    };
  }

  const activeForm = formValidation.normalizedForm;

  // 2. Validate Faculty Details
  const facultyValidation = validateFacultyDetails(facultyDetails);
  if (!facultyValidation.isValid) {
    if (facultyValidation.errors.faculty_name) {
      resultErrors.faculty_name = facultyValidation.errors.faculty_name;
    }
    if (facultyValidation.errors.faculty_id) {
      resultErrors.faculty_id = facultyValidation.errors.faculty_id;
    }
  }

  // 3. Validate Selections Data Structure
  if (!selections || typeof selections !== 'object' || Array.isArray(selections)) {
    resultErrors.general.push('Course selections must be a valid object map.');
    return {
      isValid: false,
      errors: {
        ...resultErrors,
        ...facultyValidation.errors,
      },
      unavailableQuestions: [],
      sanitizedDetails: facultyValidation.sanitized,
    };
  }

  const validQuestionMap = new Map();
  for (const q of activeForm.questions) {
    validQuestionMap.set(q.id, q);
  }

  // 4. Check for unexpected or extraneous question IDs in selections
  for (const selQId of Object.keys(selections)) {
    if (!validQuestionMap.has(selQId)) {
      resultErrors.general.push(`Selection contains unrecognized question identifier "${selQId}".`);
    }
  }

  // 5. Check each question in the form
  for (const q of activeForm.questions) {
    if (q.hasNoCourses) {
      unavailableQuestions.push(q.id);
      // If a question has no courses, do not require faculty to select a course
      continue;
    }

    const selectedCourseId = selections[q.id];

    if (!selectedCourseId || typeof selectedCourseId !== 'string' || !selectedCourseId.trim()) {
      resultErrors.questions[q.id] = `Please select a course preference for "${q.title}".`;
      continue;
    }

    const cleanCourseId = selectedCourseId.trim();

    // Verify course is allowed for this specific question
    const isAllowed = q.courses.some((c) => c.id === cleanCourseId);
    if (!isAllowed) {
      resultErrors.questions[q.id] = `Selected course "${cleanCourseId}" is not permitted for question "${q.title}".`;
    }
  }

  // 6. Check for duplicate course selections
  const duplicates = getDuplicateSelections(selections);
  for (const [courseId, qIds] of Object.entries(duplicates)) {
    for (const qId of qIds) {
      // If there wasn't already an error on this question
      if (!resultErrors.questions[qId]) {
        resultErrors.questions[qId] = `Course "${courseId}" cannot be selected for multiple questions.`;
      }
    }
    resultErrors.general.push(`Course ID "${courseId}" is selected more than once.`);
  }

  // Clean empty question errors object
  if (Object.keys(resultErrors.questions).length === 0) {
    delete resultErrors.questions;
  }
  if (resultErrors.general.length === 0) {
    delete resultErrors.general;
  }

  const hasErrors =
    Boolean(resultErrors.faculty_name) ||
    Boolean(resultErrors.faculty_id) ||
    Boolean(resultErrors.questions) ||
    Boolean(resultErrors.general);

  return {
    isValid: !hasErrors,
    errors: resultErrors,
    unavailableQuestions,
    sanitizedDetails: facultyValidation.sanitized,
  };
}
