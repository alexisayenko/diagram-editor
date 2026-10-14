import { test } from "node:test";
import assert from "node:assert/strict";
import { contrast, keyPairs, luminance, readSkins } from "./contrast-helper.mjs";

const AA = 4.5, FLOOR = 3;
// Findings below AA (see docs/tech/refactoring-recommendations.md BP-15); the list must shrink, never grow.
const KNOWN_BELOW_AA = ["sketch: EOL text on card", "clean: EOL text on card", "swiss: muted text on card"];

test("contrast helper matches the WCAG reference values", () => {
  assert.equal(luminance("#000"), 0);
  assert.equal(luminance("#ffffff"), 1);
  assert.equal(contrast("#000000", "#ffffff").toFixed(2), "21.00");
  assert.equal(contrast("#fff", "#fff"), 1);
  assert.equal(contrast("#777777", "#ffffff").toFixed(2), "4.48");
  assert.equal(contrast("#fff", "#000"), contrast("#000", "#fff"));
});

test("the four skins (and the sketch dark variant) are read from the tokens", () => {
  assert.deepEqual(Object.keys(readSkins()).sort(), ["clean", "dark", "sketch", "sketch-dark", "swiss"]);
});

const rows = Object.entries(readSkins()).flatMap(([skin, t]) => keyPairs(t).map(([label, fg, bg]) => ({ id: `${skin}: ${label}`, fg, bg, ratio: contrast(fg, bg) })));

test("every key pair has a resolvable colour", () => {
  assert.equal(rows.length, 25);
  for (const r of rows) assert.ok(Number.isFinite(r.ratio), r.id);
});

test("no key pair drops below 3:1", () => {
  assert.deepEqual(rows.filter((r) => r.ratio < FLOOR).map((r) => r.id), []);
});

test("pairs below WCAG AA 4.5:1 are exactly the known findings", () => {
  assert.deepEqual(rows.filter((r) => r.ratio < AA).map((r) => r.id), KNOWN_BELOW_AA);
});
