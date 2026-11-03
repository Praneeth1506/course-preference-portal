import assert from "node:assert/strict";
import { test } from "node:test";
import { responsesFileName } from "./utils.js";

test("responsesFileName keeps letters and digits and joins the rest with dashes", () => {
  assert.equal(
    responsesFileName("Faculty Preferences 2026"),
    "Faculty-Preferences-2026-responses.xlsx",
  );
  assert.equal(responsesFileName("  CSE / AI&ML: Odd sem!  "), "CSE-AI-ML-Odd-sem-responses.xlsx");
});

test("responsesFileName falls back when the title has nothing usable", () => {
  assert.equal(responsesFileName(""), "form-responses.xlsx");
  assert.equal(responsesFileName(undefined), "form-responses.xlsx");
  assert.equal(responsesFileName("தமிழ்"), "form-responses.xlsx");
});
