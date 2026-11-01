import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  addQuestion,
  buildFormPayload,
  clampQuestionCount,
  clearQuestionCourses,
  coursesForSemester,
  removeCourse,
  removeQuestion,
  resizeQuestions,
  selectAllEligibleCourses,
  semestersFromCourses,
  setQuestionSemester,
  toggleCourse,
  validateBuilder,
} from "./formBuilderLogic.js";

const COURSES = [
  { course_id: "c1", course_code: "CS301", course_name: "OOP", semester: 3 },
  { course_id: "c2", course_code: "CS302", course_name: "COA", semester: 3 },
  { course_id: "c3", course_code: "CS401", course_name: "OS", semester: 4 },
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
  assert.deepEqual(shrunk[0].course_ids, ["c1"]);
});

test("addQuestion dynamically appends a new question up to MAX_QUESTIONS", () => {
  const start = [question({ text: "Pref 1" })];
  const added = addQuestion(start, () => question({ text: "Pref 2" }));
  assert.equal(added.length, 2);
  assert.equal(added[1].text, "Pref 2");

  const atMax = Array.from({ length: MAX_QUESTIONS }, () => question());
  const refused = addQuestion(atMax, question);
  assert.equal(refused.length, MAX_QUESTIONS);
});

test("removeQuestion removes by index down to MIN_QUESTIONS without corrupting others", () => {
  const q1 = question({ text: "Pref 1", semester: 3, course_ids: ["c1"] });
  const q2 = question({ text: "Pref 2", semester: 4, course_ids: ["c3"] });
  const q3 = question({ text: "Pref 3", semester: null, course_ids: ["c5"] });

  const start = [q1, q2, q3];
  const removedMiddle = removeQuestion(start, 1);
  assert.equal(removedMiddle.length, 2);
  assert.equal(removedMiddle[0], q1);
  assert.equal(removedMiddle[1], q3);
  assert.equal(removedMiddle[1].semester, null);
  assert.deepEqual(removedMiddle[1].course_ids, ["c5"]);

  const single = [q1];
  assert.equal(removeQuestion(single, 0).length, MIN_QUESTIONS);
});

test("toggleCourse permits offering the same course across multiple preference questions", () => {
  let questions = [question({ semester: 3 }), question({ semester: 3 })];

  // Select c1 for question 0
  questions = toggleCourse(questions, 0, "c1");
  assert.deepEqual(questions[0].course_ids, ["c1"]);

  // Selecting c1 for question 1 is allowed (both questions offer c1 as an eligible choice)
  questions = toggleCourse(questions, 1, "c1");
  assert.deepEqual(questions[1].course_ids, ["c1"]);

  // Unselecting c1 in question 0 does not affect question 1
  questions = toggleCourse(questions, 0, "c1");
  assert.deepEqual(questions[0].course_ids, []);
  assert.deepEqual(questions[1].course_ids, ["c1"]);
});

test("removeCourse removes one selection", () => {
  const questions = removeCourse([question({ course_ids: ["c1", "c2"] })], 0, "c1");
  assert.deepEqual(questions[0].course_ids, ["c2"]);
});

test("coursesForSemester filters correctly and returns all courses for null/empty", () => {
  assert.deepEqual(
    coursesForSemester(COURSES, 3).map((c) => c.course_id),
    ["c1", "c2"],
  );
  assert.deepEqual(
    coursesForSemester(COURSES, 4).map((c) => c.course_id),
    ["c3"],
  );
  assert.deepEqual(
    coursesForSemester(COURSES, null).map((c) => c.course_id),
    ["c1", "c2", "c3", "c5"],
  );
  assert.deepEqual(
    coursesForSemester(COURSES, "").map((c) => c.course_id),
    ["c1", "c2", "c3", "c5"],
  );
});

test("selectAllEligibleCourses and clearQuestionCourses batch update question courses", () => {
  const start = [
    question({ semester: 3, course_ids: [] }),
    question({ semester: null, course_ids: [] }),
  ];

  const selectedQ0 = selectAllEligibleCourses(start, 0, COURSES);
  assert.deepEqual(selectedQ0[0].course_ids, ["c1", "c2"]);

  const selectedQ1 = selectAllEligibleCourses(start, 1, COURSES);
  assert.deepEqual(selectedQ1[1].course_ids, ["c1", "c2", "c3", "c5"]);

  const cleared = clearQuestionCourses(selectedQ0, 0);
  assert.deepEqual(cleared[0].course_ids, []);
});

test("setQuestionSemester drops courses from other semesters and safely clears selections", () => {
  const start = [question({ course_ids: ["c1", "c5"] })];

  // Changing to Semester 3 keeps c1 (Sem 3) and drops c5 (Sem 5)
  const { questions, removedCount } = setQuestionSemester(start, 0, 3, COURSES);
  assert.equal(removedCount, 1);
  assert.equal(questions[0].semester, 3);
  assert.deepEqual(questions[0].course_ids, ["c1"]);

  // Changing to All Semesters keeps all currently selected courses
  const cleared = setQuestionSemester(questions, 0, null, COURSES);
  assert.equal(cleared.removedCount, 0);
  assert.equal(cleared.questions[0].semester, null);
  assert.deepEqual(cleared.questions[0].course_ids, ["c1"]);

  // Changing to Semester 4 where no current courses match removes all and returns count
  const toSem4 = setQuestionSemester(cleared.questions, 0, 4, COURSES);
  assert.equal(toSem4.removedCount, 1);
  assert.equal(toSem4.questions[0].semester, 4);
  assert.deepEqual(toSem4.questions[0].course_ids, []);
});

test("semestersFromCourses lists unique sorted semesters", () => {
  assert.deepEqual(
    semestersFromCourses([...COURSES, { course_id: "x", semester: null }]),
    [3, 4, 5],
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

test("validateBuilder allows same course in multiple questions, catches unknown courses and semester mismatches", () => {
  const errors = validateBuilder({
    title: "Prefs",
    questions: [
      question({ course_ids: ["c1"] }),
      // c1 is shared with question 1, but 'gone' does not exist in catalogue
      question({ course_ids: ["c1", "gone"] }),
      // c5 is semester 5, which mismatches question semester 3
      question({ course_ids: ["c5"], semester: 3 }),
    ],
    courses: COURSES,
    coursesLoaded: true,
  });
  assert.equal(errors.length, 2);
  assert.match(errors[0], /no longer in the catalogue/);
  assert.match(errors[1], /CS501 is not a Semester 3 course/);
});

test("validateBuilder passes a complete form with multi-question course assignments and All Semesters", () => {
  const errors = validateBuilder({
    title: "Prefs",
    questions: [
      question({ course_ids: ["c1", "c2"], semester: 3 }),
      question({ course_ids: ["c1", "c2"], semester: 3 }),
      question({ course_ids: ["c1", "c2", "c3", "c5"], semester: null }),
    ],
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
