import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const app = readFileSync(new URL("../browser/app.js", import.meta.url), "utf8");

test("Save follows the dirty state: notes and layout enable it, clean or no server disables it", () => {
  const lines = app.split("\n").filter((l) => /^const (editor|notesApi|serverApi|drawApi|unsaved|dirty) = /.test(l)).join("\n");
  const start = app.indexOf("function controls()"), fn = app.slice(start, app.indexOf("\n}\n", start) + 2);
  assert.match(app, /setInterval\(\(\) => \{ if \(!busy\) controls\(\); \}/);
  const run = (state, mods) => {
    const el = () => ({ disabled: null });
    const ctx = { newButton: el(), openButton: el(), diagButton: el(), select: { ...el(), options: [1, 2] }, reloadButton: el(), saveButton: el(), exportButton: el(), importButton: el(), impPanel: { hidden: true }, frame: { contentWindow: { InfraDiagram: { modules: mods } } } };
    runInNewContext(`let busy = false, serverOk = true, ready = true, active = { work: new Map(), source: new Map(), notes: [], carryLayout: false };\n${state}\n${lines}\n${fn}\ncontrols()`, ctx);
    return ctx.saveButton.disabled;
  };
  const clean = { "canvas/edit-mode": { isDirty: () => false }, "ui/notes-edit": { isDirty: () => false, texts: () => [] } };
  const notes = { ...clean, "ui/notes-edit": { isDirty: () => true, texts: () => [] } };
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

test("drawing changes enable Save and the discard guards", () => {
  const lines = app.split("\n").filter((l) => /^const (editor|notesApi|serverApi|drawApi|unsaved|dirty) = /.test(l)).join("\n");
  const run = (draw) => {
    const mods = { "canvas/edit-mode": { isDirty: () => false }, "ui/notes-edit": { isDirty: () => false, texts: () => [] }, "canvas/draw": draw };
    const ctx = { frame: { contentWindow: { InfraDiagram: { modules: mods } } } };
    return runInNewContext(`let ready = true, active = { work: new Map(), source: new Map(), notes: [], carryLayout: false };\n${lines}\ndirty()`, ctx);
  };
  assert.equal(run({ isDirty: () => false }), false);
  assert.equal(run({ isDirty: () => true }), true);
});

test("Host script panel embeds tools/host-probe.sh byte-for-byte", () => {
  const html = readFileSync(new URL("../../diagram.html", import.meta.url), "utf8");
  const file = readFileSync(new URL("../../tools/host-probe.sh", import.meta.url), "utf8");
  const m = html.match(/^const HOST_SCRIPT = (.*);$/m);
  assert.ok(m, "HOST_SCRIPT line");
  assert.equal(runInNewContext(m[1]), file);
  assert.ok(!m[1].includes("<"));
  assert.match(html, /id="hostscript"/);
  assert.match(html, /id="hs" class="dlg" hidden/);
  assert.match(app, /e\.key === "Escape" && !hostPanel\.hidden/);
  assert.match(app, /e\.target === hostPanel/);
  assert.match(app, /execCommand\("copy"\)/);
});

test("Import servers is enabled with an open diagram and adds files as unsaved work", () => {
  const lines = app.split("\n").filter((l) => /^const (editor|notesApi|serverApi|drawApi|unsaved|dirty) = /.test(l)).join("\n");
  const start = app.indexOf("function controls()"), fn = app.slice(start, app.indexOf("\n}\n", start) + 2);
  const run = (ready, busy, panelHidden = true) => {
    const el = () => ({ disabled: null });
    const ctx = { newButton: el(), openButton: el(), diagButton: el(), saveButton: el(), exportButton: el(), importButton: el(), impPanel: { hidden: panelHidden }, frame: { contentWindow: { InfraDiagram: { modules: {} } } } };
    runInNewContext(`let busy = ${busy}, serverOk = true, ready = ${ready}, active = { work: new Map(), source: new Map(), notes: [], carryLayout: false };\n${lines}\n${fn}\ncontrols()`, ctx);
    return ctx.importButton.disabled;
  };
  assert.equal(run(true, false), false);
  assert.equal(run(false, false), true);
  assert.equal(run(true, true), true);
  const confirm = app.slice(app.indexOf("function impConfirm()"), app.indexOf("importButton.addEventListener"));
  assert.match(confirm, /rerenderMany\(files, places, ids, null\)/);
  assert.match(app, /unsaved = \(\) => !!active && \(JSON\.stringify\(\[\.\.\.active\.work\]\) !== JSON\.stringify\(\[\.\.\.active\.source\]\)/);
});
