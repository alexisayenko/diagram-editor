import test from "node:test";
import assert from "node:assert/strict";
import { DIAGRAM_ID, SERVER_ID, slugify, trimDashes, sanitizeId, sanitizeName } from "../lib/ids.mjs";

test("slugify lowercases and collapses runs of other characters", () => {
  assert.equal(slugify("Web_01.Example.Test"), "web-01-example-test");
  assert.equal(slugify("  A  b  "), "-a-b-");
  assert.equal(slugify(null), "null");
});

test("trimDashes strips only leading and trailing dashes", () => {
  assert.equal(trimDashes("--a-b--"), "a-b");
  assert.equal(trimDashes("---"), "");
  assert.equal(trimDashes("ab"), "ab");
});

test("sanitizeId and sanitizeName keep their caller rules", () => {
  assert.equal(sanitizeId("10-host"), "s10-host");
  assert.equal(sanitizeId("***"), "server");
  assert.equal(sanitizeName("***"), "diagram");
  assert.equal(sanitizeName("x".repeat(59) + "-" + "y".repeat(5)), "x".repeat(59));
});

test("id grammars", () => {
  assert.ok(DIAGRAM_ID.test("demo-1") && !DIAGRAM_ID.test("Demo") && !DIAGRAM_ID.test("-a"));
  assert.ok(SERVER_ID.test("Web_1") && !SERVER_ID.test("1web") && !SERVER_ID.test("a b"));
});
