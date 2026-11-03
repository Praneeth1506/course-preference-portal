/**
 * Pure helpers for the admin form builder (FormBuilderPage).
 *
 * A builder question is { key, question_id, text, course_ids, semester }.
 * Courses come from GET /api/courses: { course_id, course_code, course_name,
 * semester, category, credits, elective_group, offered_by, source, programmes }.
 * A course with no programmes (an open elective added by hand) suits any programme.
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

/** Add one new preference question up to MAX_QUESTIONS. */
export function addQuestion(questions, createQuestion) {
  if (questions.length >= MAX_QUESTIONS) return questions;
  return [...questions, createQuestion()];
}

/** Remove a preference question by index, down to MIN_QUESTIONS. */
export function removeQuestion(questions, index) {
  if (questions.length <= MIN_QUESTIONS) return questions;
  return questions.filter((_, qIdx) => qIdx !== index);
}

/**
 * Select or unselect a course. A course may be offered in several questions;
 * faculty can still pick it for only one of them.
 */
export function toggleCourse(questions, index, courseId) {
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

/** Map of course_id -> indexes of the other questions that also offer it. */
export function sharedCourses(questions, index) {
  const shared = new Map();
  questions.forEach((question, questionIndex) => {
    if (questionIndex === index) return;
    for (const courseId of question.course_ids) {
      shared.set(courseId, [...(shared.get(courseId) || []), questionIndex]);
    }
  });
  return shared;
}

/**
 * Indexes of questions that cannot all get a different course, or [] when
 * faculty can answer every question with a distinct course (bipartite matching).
 */
export function unanswerableQuestions(questions) {
  const matchedBy = new Map();

  const assign = (index, visited) => {
    for (const courseId of questions[index].course_ids) {
      if (visited.has(courseId)) continue;
      visited.add(courseId);
      const holder = matchedBy.get(courseId);
      if (holder === undefined || assign(holder, visited)) {
        matchedBy.set(courseId, index);
        return true;
      }
    }
    return false;
  };

  const stuck = [];
  questions.forEach((question, index) => {
    if (question.course_ids.length > 0 && !assign(index, new Set())) {
      stuck.push(index);
    }
  });
  return stuck;
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

/** Whether a course has no fixed semester (most electives). */
function anySemester(course) {
  return course.semester === null || course.semester === undefined;
}

/** Courses a question restricted to `semester` may offer: that semester's courses plus electives with no fixed semester. */
export function coursesForSemester(courses, semester) {
  if (semester === null || semester === undefined || semester === "") return courses;
  return courses.filter((course) => anySemester(course) || course.semester === semester);
}

/**
 * Add every course in `courses` that suits this question's semester to its
 * selection. The builder passes the courses currently shown by its filters.
 */
export function selectAllEligibleCourses(questions, index, courses) {
  return questions.map((question, questionIndex) => {
    if (questionIndex !== index) return question;
    const eligible = coursesForSemester(courses, question.semester).map((c) => c.course_id);
    const added = eligible.filter((id) => !question.course_ids.includes(id));
    return { ...question, course_ids: [...question.course_ids, ...added] };
  });
}

/**
 * Give the question at `toIndex` the semester and courses of the question at
 * `fromIndex`. The copy is independent: later changes to one leave the other alone.
 */
export function copyQuestionCourses(questions, fromIndex, toIndex) {
  const source = questions[fromIndex];
  if (!source || !questions[toIndex] || fromIndex === toIndex) return questions;
  return questions.map((question, questionIndex) =>
    questionIndex === toIndex
      ? { ...question, semester: source.semester ?? null, course_ids: [...source.course_ids] }
      : question,
  );
}

/** Make every question after the first offer the first question's semester and courses. */
export function copyFirstQuestionToAll(questions) {
  return questions.reduce(
    (next, _question, index) => (index === 0 ? next : copyQuestionCourses(next, 0, index)),
    questions,
  );
}

/** Whether two questions offer the same semester and the same courses (in any order). */
export function sameCourses(first, second) {
  if ((first.semester ?? null) !== (second.semester ?? null)) return false;
  if (first.course_ids.length !== second.course_ids.length) return false;
  const ids = new Set(first.course_ids);
  return second.course_ids.every((id) => ids.has(id));
}

/** Clear all course selections for a question. */
export function clearQuestionCourses(questions, index) {
  return questions.map((question, questionIndex) =>
    questionIndex === index ? { ...question, course_ids: [] } : question,
  );
}

export const COURSE_TYPES = [
  { value: "all", label: "All courses" },
  { value: "core", label: "Semester courses" },
  { value: "PE", label: "Professional electives" },
  { value: "OE", label: "Open electives" },
];

function isElective(course) {
  return course.category === "PE" || course.category === "OE";
}

/** Narrow the picker by course type and a code/name search; selections are unaffected. */
/** Programmes named in the catalogue, e.g. ["BE CSE", "BE CSE (AI&ML)"]. */
export function programmesFromCourses(courses) {
  const names = new Set(courses.flatMap((course) => course.programmes || []));
  return [...names].sort();
}

/** Short programme name: "BE CSE (AI&ML)" -> "AI&ML", "BE CSE" -> "CSE". */
export function programmeLabel(programme) {
  const inBrackets = programme.match(/\(([^)]+)\)\s*$/);
  return inBrackets ? inBrackets[1] : programme.replace(/^BE\s+/, "");
}

export function filterCourses(
  courses,
  { type = "all", programme = "all", search = "" } = {},
) {
  const needle = search.trim().toLowerCase();
  return courses.filter((course) => {
    if (type === "core" && isElective(course)) return false;
    if ((type === "PE" || type === "OE") && course.category !== type) return false;
    const programmes = course.programmes || [];
    if (programme !== "all" && programmes.length > 0 && !programmes.includes(programme)) {
      return false;
    }
    if (!needle) return true;
    return [course.course_code, course.course_name, course.offered_by]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(needle));
  });
}

/**
 * Picker sections: one per semester, then professional and open electives
 * (which the regulation does not tie to one semester), then anything else.
 */
export function courseGroups(courses) {
  const semesters = new Map();
  const professional = [];
  const open = [];
  const other = [];
  for (const course of courses) {
    if (course.category === "PE") professional.push(course);
    else if (course.category === "OE") open.push(course);
    else if (Number.isInteger(course.semester)) {
      if (!semesters.has(course.semester)) semesters.set(course.semester, []);
      semesters.get(course.semester).push(course);
    } else other.push(course);
  }
  return [
    ...[...semesters.entries()]
      .sort((first, second) => first[0] - second[0])
      .map(([semester, items]) => ({
        key: `sem-${semester}`,
        title: `Semester ${semester}`,
        courses: items,
      })),
    { key: "PE", title: "Professional electives", courses: professional },
    { key: "OE", title: "Open electives", courses: open },
    { key: "other", title: "Other courses", courses: other },
  ].filter((group) => group.courses.length > 0);
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
  const normalizedSemester =
    semester === null || semester === undefined || semester === ""
      ? null
      : Number(semester);

  const allowed = new Set(
    coursesForSemester(courses, normalizedSemester).map((course) => course.course_id),
  );
  let removedCount = 0;

  const next = questions.map((question, questionIndex) => {
    if (questionIndex !== index) return question;
    const kept = question.course_ids.filter((id) => allowed.has(id));
    removedCount = question.course_ids.length - kept.length;
    return { ...question, semester: normalizedSemester, course_ids: kept };
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

  questions.forEach((question, index) => {
    const label = `Question ${index + 1}`;
    if (question.course_ids.length === 0) {
      errors.push(`${label}: select at least one course.`);
    }

    if (!coursesLoaded) return;

    for (const courseId of question.course_ids) {
      const course = courseById.get(courseId);
      if (!course) {
        errors.push(`${label}: remove a course that is no longer in the catalogue.`);
      } else if (
        question.semester !== null &&
        question.semester !== undefined &&
        !anySemester(course) &&
        course.semester !== question.semester
      ) {
        errors.push(
          `${label}: ${course.course_code} is not a Semester ${question.semester} course.`,
        );
      }
    }
  });

  for (const index of unanswerableQuestions(questions)) {
    errors.push(
      `Question ${index + 1}: faculty must pick a different course for each question, but its courses are all needed by other questions. Add more courses.`,
    );
  }

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
