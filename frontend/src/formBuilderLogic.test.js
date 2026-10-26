import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_QUESTIONS,
  buildFormPayload,
  clampQuestionCount,
  courseAssignments,
  removeCourse,
  resizeQuestions,
  semestersFromCourses,
  setQuestionSemester,
  toggleCourse,
  validateBuilder,
} from "./formBuilderLogic.js";

const COURSES = [
  { course_id: "c1", course_code: "CS301", course_name: "OOP", semester: 3 },
  { course_id: "c2", course_code: "CS302", course_name: "COA", semester: 3 },
  { course_id: "c5", course_code: "CS501", course_name: "ML", semester: 5 },
];

let counter = 0;
function question(overrides = {}) {
  counter += 1;
  return {
    key: `k${counter}`,
    question_id: null,
    text: "",
    course_ids: [],
    semester: null,
    ...overrides,
  };
}

test("clampQuestionCount keeps the count in range", () => {
  assert.equal(clampQuestionCount("3"), 3);
  assert.equal(clampQuestionCount(0), 1);
  assert.equal(clampQuestionCount(""), 1);
  assert.equal(clampQuestionCount("abc"), 1);
  assert.equal(clampQuestionCount(999), MAX_QUESTIONS);
});

test("resizeQuestions adds and removes question sections", () => {
  const start = [question({ course_ids: ["c1"] })];

  const grown = resizeQuestions(start, 3, question);
  assert.equal(grown.length, 3);
  assert.equal(grown[0], start[0]);

  const shrunk = resizeQuestions(
    [grown[0], { ...grown[1], course_ids: ["c2"] }, grown[2]],
    1,
    question,
  );
  assert.equal(shrunk.length, 1);
  assert.deepEqual(courseAssignments(shrunk), new Map([["c1", 0]]));
});

test("toggleCourse selects, unselects, and blocks duplicates across questions", () => {
  let questions = [question(), question()];

  questions = toggleCourse(questions, 0, "c1");
  assert.deepEqual(questions[0].course_ids, ["c1"]);

  const blocked = toggleCourse(questions, 1, "c1");
  assert.equal(blocked, questions);
  assert.deepEqual(blocked[1].course_ids, []);

  questions = toggleCourse(questions, 0, "c1");
  assert.deepEqual(questions[0].course_ids, []);

  questions = toggleCourse(questions, 1, "c1");
  assert.deepEqual(questions[1].course_ids, ["c1"]);
});

test("removeCourse removes one selection", () => {
  const questions = removeCourse([question({ course_ids: ["c1", "c2"] })], 0, "c1");
  assert.deepEqual(questions[0].course_ids, ["c2"]);
});

test("setQuestionSemester drops courses from other semesters", () => {
  const start = [question({ course_ids: ["c1", "c5"] })];

  const { questions, removedCount } = setQuestionSemester(start, 0, 3, COURSES);
  assert.equal(removedCount, 1);
  assert.equal(questions[0].semester, 3);
  assert.deepEqual(questions[0].course_ids, ["c1"]);

  const cleared = setQuestionSemester(questions, 0, null, COURSES);
  assert.equal(cleared.removedCount, 0);
  assert.equal(cleared.questions[0].semester, null);
});

test("semestersFromCourses lists unique sorted semesters", () => {
  assert.deepEqual(
    semestersFromCourses([...COURSES, { course_id: "x", semester: null }]),
    [3, 5],
  );
});

test("validateBuilder reports missing title and empty questions", () => {
  const errors = validateBuilder({
    title: "  ",
    questions: [question({ course_ids: ["c1"] }), question()],
    courses: COURSES,
    coursesLoaded: true,
  });
  assert.deepEqual(errors, [
    "Enter a form title.",
    "Question 2: select at least one course.",
  ]);
});

test("validateBuilder catches duplicates, unknown courses, and semester mismatches", () => {
  const errors = validateBuilder({
    title: "Prefs",
    questions: [
      question({ course_ids: ["c1"] }),
      question({ course_ids: ["c1", "gone"] }),
      question({ course_ids: ["c5"], semester: 3 }),
    ],
    courses: COURSES,
    coursesLoaded: true,
  });
  assert.equal(errors.length, 3);
  assert.match(errors[0], /Question 2: a course is also used in Question 1/);
  assert.match(errors[1], /no longer in the catalogue/);
  assert.match(errors[2], /CS501 is not a Semester 3 course/);
});

test("validateBuilder passes a complete form", () => {
  const errors = validateBuilder({
    title: "Prefs",
    questions: [question({ course_ids: ["c1"], semester: 3 }), question({ course_ids: ["c5"] })],
    courses: COURSES,
    coursesLoaded: true,
  });
  assert.deepEqual(errors, []);
});

test("buildFormPayload matches the backend FormCreate schema", () => {
  const payload = buildFormPayload({
    title: "  Fall prefs ",
    description: " ",
    questions: [
      question({ question_id: "q-1", text: " Core course ", course_ids: ["c1"], semester: 3 }),
      question({ course_ids: ["c5"] }),
    ],
  });

  assert.deepEqual(payload, {
    title: "Fall prefs",
    description: null,
    questions: [
      { question_id: "q-1", text: "Core course", course_ids: ["c1"], semester: 3 },
      { question_id: undefined, text: "Preference 2", course_ids: ["c5"], semester: null },
    ],
  });
});
