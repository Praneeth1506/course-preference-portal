import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  addQuestion,
  buildFormPayload,
  clampQuestionCount,
  clearQuestionCourses,
  courseGroups,
  coursesForSemester,
  filterCourses,
  programmeLabel,
  programmesFromCourses,
  removeCourse,
  removeQuestion,
  resizeQuestions,
  selectAllEligibleCourses,
  semestersFromCourses,
  setQuestionSemester,
  sharedCourses,
  toggleCourse,
  unanswerableQuestions,
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

test("sharedCourses lists the other questions offering each course", () => {
  const questions = [
    question({ course_ids: ["c1", "c2"] }),
    question({ course_ids: ["c1"] }),
    question({ course_ids: ["c1", "c5"] }),
  ];
  assert.deepEqual(sharedCourses(questions, 0), new Map([["c1", [1, 2]], ["c5", [2]]]));
  assert.deepEqual(sharedCourses(questions, 1), new Map([["c1", [0, 2]], ["c2", [0]], ["c5", [2]]]));
});

test("unanswerableQuestions finds questions that cannot get a distinct course", () => {
  const ok = [
    question({ course_ids: ["c1", "c2"] }),
    question({ course_ids: ["c1"] }),
  ];
  assert.deepEqual(unanswerableQuestions(ok), []);

  const stuck = [
    question({ course_ids: ["c1", "c2"] }),
    question({ course_ids: ["c1", "c2"] }),
    question({ course_ids: ["c2", "c1"] }),
  ];
  assert.deepEqual(unanswerableQuestions(stuck), [2]);

  assert.deepEqual(unanswerableQuestions([question(), question()]), []);
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

test("a semester question can still offer electives with no fixed semester", () => {
  const courses = [...COURSES, { course_id: "pe", course_code: "23Z013", semester: null, category: "PE" }];

  assert.deepEqual(
    coursesForSemester(courses, 3).map((course) => course.course_id),
    ["c1", "c2", "pe"],
  );
  const { questions, removedCount } = setQuestionSemester(
    [question({ course_ids: ["c1", "c5", "pe"] })],
    0,
    3,
    courses,
  );
  assert.equal(removedCount, 1);
  assert.deepEqual(questions[0].course_ids, ["c1", "pe"]);
  assert.deepEqual(
    validateBuilder({ title: "Prefs", questions, courses, coursesLoaded: true }),
    [],
  );
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

test("validateBuilder allows shared courses but needs a distinct course per question", () => {
  const shared = validateBuilder({
    title: "Prefs",
    questions: [question({ course_ids: ["c1", "c2"] }), question({ course_ids: ["c1", "c2"] })],
    courses: COURSES,
    coursesLoaded: true,
  });
  assert.deepEqual(shared, []);

  const tooFew = validateBuilder({
    title: "Prefs",
    questions: [question({ course_ids: ["c1"] }), question({ course_ids: ["c1"] })],
    courses: COURSES,
    coursesLoaded: true,
  });
  assert.equal(tooFew.length, 1);
  assert.match(tooFew[0], /^Question 2: faculty must pick a different course/);
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

const CATALOGUE = [
  { course_id: "c5", course_code: "23N501", course_name: "Machine Learning -2", semester: 5, category: "PC" },
  { course_id: "c3", course_code: "23N303", course_name: "Data Structures", semester: 3, category: "PC" },
  { course_id: "pe", course_code: "23N020", course_name: "Generative AI", semester: null, category: "PE" },
  { course_id: "oe", course_code: "23MO01", course_name: "Principles of Management", semester: 7, category: "OE", offered_by: "Management Sciences" },
  { course_id: "x", course_code: "XX1", course_name: "Legacy", semester: null },
];

test("courseGroups orders semesters, then electives, then other courses", () => {
  const groups = courseGroups(CATALOGUE);
  assert.deepEqual(
    groups.map((group) => [group.title, group.courses.map((c) => c.course_id)]),
    [
      ["Semester 3", ["c3"]],
      ["Semester 5", ["c5"]],
      ["Professional electives", ["pe"]],
      ["Open electives", ["oe"]],
      ["Other courses", ["x"]],
    ],
  );
  assert.deepEqual(courseGroups([]), []);
});

test("filterCourses narrows by type and searches code, name and department", () => {
  const ids = (list) => list.map((course) => course.course_id);
  assert.deepEqual(ids(filterCourses(CATALOGUE)), ["c5", "c3", "pe", "oe", "x"]);
  assert.deepEqual(ids(filterCourses(CATALOGUE, { type: "core" })), ["c5", "c3", "x"]);
  assert.deepEqual(ids(filterCourses(CATALOGUE, { type: "PE" })), ["pe"]);
  assert.deepEqual(ids(filterCourses(CATALOGUE, { type: "OE" })), ["oe"]);
  assert.deepEqual(ids(filterCourses(CATALOGUE, { search: " 23n5 " })), ["c5"]);
  assert.deepEqual(ids(filterCourses(CATALOGUE, { search: "management" })), ["oe"]);
  assert.deepEqual(ids(filterCourses(CATALOGUE, { type: "PE", search: "data" })), []);
});

test("programme filter keeps courses for that programme and hand-added electives", () => {
  const courses = [
    { course_id: "both", course_code: "23Z402/23N402", programmes: ["BE CSE", "BE CSE (AI&ML)"] },
    { course_id: "cse", course_code: "23Z501", programmes: ["BE CSE"] },
    { course_id: "aiml", course_code: "23N404", programmes: ["BE CSE (AI&ML)"] },
    { course_id: "manual", course_code: "23MO01", programmes: [] },
  ];
  const ids = (list) => list.map((course) => course.course_id);

  assert.deepEqual(ids(filterCourses(courses, { programme: "BE CSE" })), ["both", "cse", "manual"]);
  assert.deepEqual(ids(filterCourses(courses, { programme: "BE CSE (AI&ML)" })), [
    "both",
    "aiml",
    "manual",
  ]);
  assert.deepEqual(ids(filterCourses(courses, { search: "23n402" })), ["both"]);
  assert.deepEqual(programmesFromCourses(courses), ["BE CSE", "BE CSE (AI&ML)"]);
  assert.equal(programmeLabel("BE CSE (AI&ML)"), "AI&ML");
  assert.equal(programmeLabel("BE CSE"), "CSE");
});
