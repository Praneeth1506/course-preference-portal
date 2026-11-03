import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_QUESTIONS,
  buildFormPayload,
  clampQuestionCount,
  courseGroups,
  coursesForSemester,
  filterCourses,
  programmeLabel,
  programmesFromCourses,
  removeCourse,
  resizeQuestions,
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

test("toggleCourse selects and unselects, and a course can be in several questions", () => {
  let questions = [question(), question()];

  questions = toggleCourse(questions, 0, "c1");
  assert.deepEqual(questions[0].course_ids, ["c1"]);

  questions = toggleCourse(questions, 1, "c1");
  assert.deepEqual(questions[0].course_ids, ["c1"]);
  assert.deepEqual(questions[1].course_ids, ["c1"]);

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

test("validateBuilder catches unknown courses and semester mismatches", () => {
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
