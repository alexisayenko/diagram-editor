import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const app = readFileSync(new URL("../browser/app.js", import.meta.url), "utf8");

test("Save follows the dirty state: notes and layout enable it, clean or no server disables it", () => {
  const lines = app.split("\n").filter((l) => /^const (editor|notesApi|dirty) = /.test(l)).join("\n");
  const start = app.indexOf("function controls()"), fn = app.slice(start, app.indexOf("\n}\n", start) + 2);
  assert.match(app, /setInterval\(\(\) => \{ if \(!busy\) controls\(\); \}/);
  const run = (state, mods) => {
    const el = () => ({ disabled: null });
    const ctx = { openButton: el(), select: { ...el(), options: [1, 2] }, reloadButton: el(), saveButton: el(), exportButton: el(), frame: { contentWindow: { InfraDiagram: { modules: mods } } } };
    runInNewContext(`let busy = false, serverOk = true, ready = true, active = {};\n${state}\n${lines}\n${fn}\ncontrols()`, ctx);
    return ctx.saveButton.disabled;
  };
  const clean = { "canvas/edit-mode": { isDirty: () => false }, "ui/notes-edit": { isDirty: () => false } };
  const notes = { ...clean, "ui/notes-edit": { isDirty: () => true } };
  assert.equal(run("", clean), true);
  assert.equal(run("", notes), false);
  assert.equal(run("", { ...clean, "canvas/edit-mode": { isDirty: () => true } }), false);
  assert.equal(run("serverOk = false;", notes), true);
  assert.equal(run("busy = true;", notes), true);
});

test("discard prompt and beforeunload guard both use the combined dirty state", () => {
  assert.match(app, /const dirty = \(\) => editor\(\)\?\.isDirty\(\) \|\| notesApi\(\)\?\.isDirty\(\)/);
  assert.match(app, /function discard\(\) \{ return !dirty\(\)/);
  assert.match(app, /beforeunload", \(e\) => \{ if \(dirty\(\)\)/);
});
