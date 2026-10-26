/**
 * Pure helpers for the admin form builder (FormBuilderPage).
 *
 * A builder question is { key, question_id, text, course_ids, semester }.
 * Courses come from GET /api/courses: { course_id, course_code, course_name, semester }.
 * Every helper returns new arrays/objects; nothing is mutated.
 */

export const MIN_QUESTIONS = 1;
export const MAX_QUESTIONS = 20;

export function clampQuestionCount(value) {
  const count = Math.trunc(Number(value));
  if (!Number.isFinite(count)) return MIN_QUESTIONS;
  return Math.min(MAX_QUESTIONS, Math.max(MIN_QUESTIONS, count));
}

/** Grow or shrink the question list; removed questions take their selections with them. */
export function resizeQuestions(questions, count, createQuestion) {
  const target = clampQuestionCount(count);
  if (target <= questions.length) return questions.slice(0, target);
  const added = Array.from({ length: target - questions.length }, () =>
    createQuestion(),
  );
  return [...questions, ...added];
}

/** Map of course_id -> index of the first question that uses it. */
export function courseAssignments(questions) {
  const assigned = new Map();
  questions.forEach((question, index) => {
    for (const courseId of question.course_ids) {
      if (!assigned.has(courseId)) assigned.set(courseId, index);
    }
  });
  return assigned;
}

/** Select or unselect a course; a course already used by another question is left alone. */
export function toggleCourse(questions, index, courseId) {
  const owner = courseAssignments(questions).get(courseId);
  if (owner !== undefined && owner !== index) return questions;

  return questions.map((question, questionIndex) => {
    if (questionIndex !== index) return question;
    const selected = question.course_ids.includes(courseId);
    return {
      ...question,
      course_ids: selected
        ? question.course_ids.filter((id) => id !== courseId)
        : [...question.course_ids, courseId],
    };
  });
}

export function removeCourse(questions, index, courseId) {
  return questions.map((question, questionIndex) =>
    questionIndex === index
      ? {
          ...question,
          course_ids: question.course_ids.filter((id) => id !== courseId),
        }
      : question,
  );
}

export function coursesForSemester(courses, semester) {
  if (semester === null || semester === undefined) return courses;
  return courses.filter((course) => course.semester === semester);
}

export function semestersFromCourses(courses) {
  const semesters = new Set();
  for (const course of courses) {
    if (Number.isInteger(course.semester)) semesters.add(course.semester);
  }
  return [...semesters].sort((first, second) => first - second);
}

/**
 * Restrict a question to one semester (null = all semesters). Selected courses
 * from other semesters are dropped so they cannot be submitted by accident.
 */
export function setQuestionSemester(questions, index, semester, courses) {
  const allowed = new Set(
    coursesForSemester(courses, semester).map((course) => course.course_id),
  );
  let removedCount = 0;

  const next = questions.map((question, questionIndex) => {
    if (questionIndex !== index) return question;
    const kept = question.course_ids.filter((id) => allowed.has(id));
    removedCount = question.course_ids.length - kept.length;
    return { ...question, semester, course_ids: kept };
  });

  return { questions: next, removedCount };
}

export function defaultQuestionText(index) {
  return `Preference ${index + 1}`;
}

/**
 * Returns a list of human-readable problems; an empty list means the form can be saved.
 * Course checks against the catalogue only run once courses have loaded.
 */
export function validateBuilder({ title, questions, courses, coursesLoaded }) {
  const errors = [];
  if (!title.trim()) errors.push("Enter a form title.");
  if (questions.length < MIN_QUESTIONS) errors.push("Add at least one question.");

  const courseById = new Map(courses.map((course) => [course.course_id, course]));
  const seen = new Map();

  questions.forEach((question, index) => {
    const label = `Question ${index + 1}`;
    if (question.course_ids.length === 0) {
      errors.push(`${label}: select at least one course.`);
    }

    for (const courseId of question.course_ids) {
      if (seen.has(courseId)) {
        errors.push(
          `${label}: a course is also used in Question ${seen.get(courseId) + 1}. Each course can appear in only one question.`,
        );
      } else {
        seen.set(courseId, index);
      }

      if (!coursesLoaded) continue;
      const course = courseById.get(courseId);
      if (!course) {
        errors.push(`${label}: remove a course that is no longer in the catalogue.`);
      } else if (
        question.semester !== null &&
        question.semester !== undefined &&
        course.semester !== question.semester
      ) {
        errors.push(
          `${label}: ${course.course_code} is not a Semester ${question.semester} course.`,
        );
      }
    }
  });

  return errors;
}

/** Request body for POST /api/forms and PUT /api/forms/{id} (backend FormCreate schema). */
export function buildFormPayload({ title, description, questions }) {
  return {
    title: title.trim(),
    description: description.trim() || null,
    questions: questions.map((question, index) => ({
      question_id: question.question_id || undefined,
      text: question.text.trim() || defaultQuestionText(index),
      course_ids: [...question.course_ids],
      semester: question.semester ?? null,
    })),
  };
}
