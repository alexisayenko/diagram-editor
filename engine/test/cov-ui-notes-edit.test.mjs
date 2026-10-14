import test from "node:test";
import assert from "node:assert/strict";
import { loadUi, fixture } from "./cov-ui-env.mjs";

const CARD = '<article class="note"><h3>First note</h3><p>Body one</p><time>stale</time></article>';

const noteParser = (text) => {
  const lines = text.split("\n"), m = /^Date: (.*)$/.exec(lines[1] || "");
  if (lines[0] === "BAD") throw new Error("TOML: unsupported title");
  return { title: lines[0], date: m ? m[1] : "Note", paras: lines.slice(m ? 2 : 1).join("\n").split(/\n\n+/).map((s) => s.trim()).filter(Boolean) };
};

function notes({ enabled = true, over, confirm, parser = noteParser, selection = null } = {}) {
  const f = fixture(over);
  f.html = f.html.replace('<div id="nl"></div>', '<div id="nl">' + CARD + "</div>");
  const t = loadUi(["ui/notes-edit"], { ...f, confirm, globals: { ...(enabled ? { InfraDiagramFileBacked: true } : {}), getSelection: () => selection } });
  if (parser) t.ID.noteParser = parser;
  t.mod = t.modules["ui/notes-edit"];
  t.D = t.modules["ui/core"].D;
  t.host = t.$("nl");
  t.ta = () => t.host.querySelector("textarea");
  t.cards = () => t.host.querySelectorAll(".note");
  t.err = () => t.host.querySelector(".nerr");
  t.btn = (text) => t.host.querySelectorAll("button").find((b) => b.textContent === text);
  return t;
}

test("show: formats note dates, hides the 'Note' placeholder and shows only the time for today", () => {
  const { mod } = notes();
  const now = new Date(2026, 0, 2, 9, 5);
  assert.equal(mod.show("2026-01-02 14:30", now), "14:30");
  assert.equal(mod.show("2026-01-01 14:30", now), "2026-01-01");
  assert.equal(mod.show("2026-01-02T14:30", null), "2026-01-02");
  assert.equal(mod.show("2026-01-02", now), "2026-01-02");
  assert.equal(mod.show("sometime in May", now), "sometime in May");
  assert.equal(mod.show("Note", now), "");
  assert.equal(mod.show("", now), "");
  assert.equal(mod.show(undefined, now), "");
});

test("stamped: adds or refreshes the Date line only for new or changed notes", () => {
  const { mod } = notes();
  const now = new Date(2026, 4, 6, 7, 8);
  assert.equal(mod.stamped("T\nbody", "", true, now), "T\nDate: 2026-05-06 07:08\n\nbody");
  assert.equal(mod.stamped("T\nDate: 2020-01-01\n\nbody", "", true, now), "T\nDate: 2020-01-01\n\nbody");
  assert.equal(mod.stamped("T\nbody", "T\nbody", false, now), "T\nbody");
  assert.equal(mod.stamped("T\nbody more", "T\nbody", false, now), "T\nDate: 2026-05-06 07:08\n\nbody more");
  assert.equal(mod.stamped("T\nDate: 2020-01-01\n\nbody2", "T\nDate: 2020-01-01\n\nbody", false, now), "T\nDate: 2026-05-06 07:08\n\nbody2");
  assert.equal(mod.stamped("T\nDate: 2021-01-01\n\nbody", "T\nDate: 2020-01-01\n\nbody", false, now), "T\nDate: 2021-01-01\n\nbody", "manually edited date is kept");
  assert.equal(mod.stamped("  T\nx  ", "", true, new Date(2026, 11, 31, 23, 59)), "T\nDate: 2026-12-31 23:59\n\nx");
});

test("not file-backed: no editing UI, dirty and finish are inert, texts exposes the source notes", () => {
  const t = notes({ enabled: false });
  assert.ok(t.$("na") === null);
  assert.equal(t.mod.isDirty(), false);
  assert.equal(t.mod.finish(), null);
  assert.deepEqual([...t.mod.texts()], ["First note\nDate: 2026-01-02\n\nBody one"]);
  t.fire(t.cards()[0], "click");
  assert.ok(t.ta() === null);
});

test("file-backed: adds the Add note button, indexes the existing cards and syncs D.notes", () => {
  const t = notes();
  assert.ok(t.host.classList.contains("ed"));
  assert.equal(t.$("na").textContent, "Add note");
  assert.equal(t.host.firstChild, t.$("na"));
  assert.equal(t.cards()[0].dataset.i, "0");
  assert.equal(t.cards()[0].querySelector("time").textContent, "2026-01-02");
  assert.equal(t.D.notes[0].title, "First note");
  assert.equal(t.D.notes[0].date, "2026-01-02");
  assert.equal(t.D.notes[0].text, "First note\nDate: 2026-01-02\n\nBody one");
  assert.equal(t.mod.isDirty(), false);
});

test("clicking a note opens an editor with its text; the textarea is sized and focused", () => {
  const t = notes();
  t.fire(t.cards()[0], "click");
  assert.equal(t.ta().value, "First note\nDate: 2026-01-02\n\nBody one");
  assert.equal(t.ta().rows, 6);
  assert.ok(t.doc.activeElement === t.ta());
  assert.ok(t.ta().scrolled);
  assert.ok(t.host.querySelector(".note.editing"));
  assert.match(t.host.querySelector(".nhint").textContent, /Ctrl\+Enter saves, Esc cancels/);
  t.fire(t.host.querySelector(".editing"), "click");
  assert.equal(t.host.querySelectorAll("textarea").length, 1, "clicking inside the editor does not restart it");
});

test("clicking outside any note does nothing; a text selection inside a note suppresses editing", () => {
  const t = notes();
  t.fire(t.host, "click");
  assert.ok(t.ta() === null);
  const u = notes({ selection: { isCollapsed: false, anchorNode: null } });
  u.fire(u.cards()[0], "click");
  assert.ok(u.ta() !== null, "selection outside the note does not block");
  const v = notes();
  const sel = { isCollapsed: false, anchorNode: v.cards()[0].querySelector("p") };
  v.sandbox.getSelection = () => sel;
  v.fire(v.cards()[0], "click");
  assert.ok(v.ta() === null);
  sel.isCollapsed = true;
  v.fire(v.cards()[0], "click");
  assert.ok(v.ta() !== null);
});

test("Done on an unchanged note closes the editor without touching the text or the dirty state", () => {
  const t = notes();
  t.fire(t.cards()[0], "click");
  t.fire(t.btn("Done"), "click");
  assert.ok(t.ta() === null);
  assert.equal(t.mod.isDirty(), false);
  assert.deepEqual([...t.mod.texts()], ["First note\nDate: 2026-01-02\n\nBody one"]);
});

test("editing a note stamps a fresh Date, updates the card and D.notes, and marks the page dirty", () => {
  const t = notes();
  t.fire(t.cards()[0], "click");
  t.ta().value = "Renamed\nDate: 2026-01-02\n\nNew body";
  assert.equal(t.mod.isDirty(), true, "pending editor text counts as dirty");
  t.fire(t.ta(), "keydown", { key: "Enter", ctrlKey: true });
  assert.ok(t.ta() === null);
  const text = t.mod.texts()[0];
  assert.match(text, /^Renamed\nDate: \d{4}-\d{2}-\d{2} \d{2}:\d{2}\n\nNew body$/);
  assert.equal(t.cards()[0].querySelector("h3").textContent, "Renamed");
  assert.equal(t.D.notes[0].text, text);
  assert.equal(t.mod.isDirty(), true);
  t.mod.markSaved(t.mod.texts());
  assert.equal(t.mod.isDirty(), false);
});

test("Done button commits; the error box is hidden again as soon as the text changes", () => {
  const t = notes();
  t.fire(t.cards()[0], "click");
  t.ta().value = "";
  t.fire(t.btn("Done"), "click");
  assert.equal(t.err().textContent, "The title is empty. Type the title on the first line, then the note text.");
  assert.ok(t.err().hidden === false);
  t.fire(t.ta(), "input");
  assert.ok(t.err().hidden === true);
});

test("parser errors lose their TOML prefix; a missing parser reports that the editor is not ready", () => {
  let t = notes();
  t.fire(t.cards()[0], "click");
  t.ta().value = "BAD";
  t.fire(t.btn("Done"), "click");
  assert.equal(t.err().textContent, "unsupported title");
  t = notes({ parser: null });
  t.fire(t.cards()[0], "click");
  t.ta().value = "Changed";
  t.fire(t.btn("Done"), "click");
  assert.equal(t.err().textContent, "The note editor is not ready. Reload the diagram.");
});

test("Escape discards the changes; blur commits them", () => {
  const t = notes();
  t.fire(t.cards()[0], "click");
  t.ta().value = "Discard me";
  const ok = t.fire(t.ta(), "keydown", { key: "Escape" });
  assert.equal(ok, false);
  assert.ok(t.ta() === null);
  assert.match(t.mod.texts()[0], /^First note/);
  t.fire(t.cards()[0], "click");
  t.ta().value = "Blur saves\nbody";
  t.fire(t.ta(), "blur");
  assert.ok(t.ta() === null);
  assert.match(t.mod.texts()[0], /^Blur saves/);
  t.fire(t.cards()[0], "click");
  t.fire(t.ta(), "keydown", { key: "a" });
});

test("Add note opens an empty editor at the end; saving appends a stamped note and updates the counter", () => {
  const t = notes();
  t.fire(t.$("na"), "click");
  assert.equal(t.cards().length, 2);
  assert.equal(t.ta().value, "");
  assert.equal(t.ta().rows, 6);
  t.ta().value = "Second\nHello";
  t.fire(t.ta(), "keydown", { key: "Enter", metaKey: true });
  assert.equal(t.mod.texts().length, 2);
  assert.match(t.mod.texts()[1], /^Second\nDate: .*\n\nHello$/);
  assert.equal(t.$("nh").textContent, "Notes (2)");
  assert.equal(t.D.notes.length, 2);
  assert.equal(t.D.notes[1].title, "Second");
});

test("Add note keeps focus on a failing editor instead of opening a second one", () => {
  const t = notes();
  t.fire(t.$("na"), "click");
  t.ta().value = "BAD";
  t.fire(t.$("na"), "click");
  assert.equal(t.host.querySelectorAll("textarea").length, 1);
  assert.equal(t.err().textContent, "unsupported title");
});

test("Delete asks for confirmation: declining keeps the editor, accepting removes the note", () => {
  let t = notes({ confirm: () => false });
  t.fire(t.cards()[0], "click");
  t.fire(t.btn("Delete"), "click");
  assert.deepEqual(t.sandbox.confirmed, ["Delete this note?"]);
  assert.ok(t.ta() !== null);
  assert.ok(t.doc.activeElement === t.ta());
  assert.equal(t.mod.texts().length, 1);
  t = notes();
  t.fire(t.cards()[0], "click");
  t.fire(t.btn("Delete"), "click");
  assert.equal(t.mod.texts().length, 0);
  assert.equal(t.$("nh").textContent, "Notes (0)");
  assert.equal(t.mod.isDirty(), true);
  assert.equal(t.D.notes.length, 0);
});

test("deleting a brand-new note just discards it", () => {
  const t = notes();
  t.fire(t.$("na"), "click");
  t.fire(t.btn("Delete"), "click");
  assert.equal(t.mod.texts().length, 1);
  assert.ok(t.ta() === null);
  assert.equal(t.mod.isDirty(), false);
});

test("starting to edit another note commits the open one first, and refuses while it is invalid", () => {
  const f = fixture({ notes: [{ title: "N0", date: "Note", paras: ["a"], text: "N0\na" }, { title: "N1", date: "Note", paras: ["b"], text: "N1\nb" }] });
  const t = loadUi(["ui/notes-edit"], { ...f, html: f.html.replace('<div id="nl"></div>', '<div id="nl"><article class="note"><h3>N0</h3><time></time></article><article class="note"><h3>N1</h3><time></time></article></div>'), globals: { InfraDiagramFileBacked: true, getSelection: () => null } });
  t.ID.noteParser = noteParser;
  const cards = () => t.$("nl").querySelectorAll(".note");
  t.fire(cards()[0], "click");
  t.$("nl").querySelector("textarea").value = "BAD";
  t.fire(cards()[1], "click");
  assert.equal(t.$("nl").querySelectorAll("textarea").length, 1);
  t.$("nl").querySelector("textarea").value = "N0 changed\nx";
  t.fire(cards()[1], "click");
  assert.equal(t.$("nl").querySelector("textarea").value, "N1\nb");
  assert.match(t.modules["ui/notes-edit"].texts()[0], /^N0 changed/);
});

test("finish: no editor means no error; an invalid editor returns its message, a valid one is committed", () => {
  const t = notes();
  assert.equal(t.mod.finish(), null);
  t.fire(t.cards()[0], "click");
  t.ta().value = "BAD";
  assert.equal(t.mod.finish(), "unsupported title");
  t.ta().value = "Fine\ntext";
  assert.equal(t.mod.finish(), null);
  assert.ok(t.ta() === null);
  assert.match(t.mod.texts()[0], /^Fine/);
});

test("texts returns a copy and markSaved copies its input", () => {
  const t = notes();
  const a = t.mod.texts();
  a.push("x");
  assert.equal(t.mod.texts().length, 1);
  const saved = ["First note\nDate: 2026-01-02\n\nBody one", "extra"];
  t.mod.markSaved(saved);
  saved.pop();
  assert.equal(t.mod.isDirty(), true, "baseline kept its own copy");
});

test("cards render title, paragraphs and the date label via show()", () => {
  const t = notes();
  t.fire(t.$("na"), "click");
  t.ta().value = "Next\nline1\n\nline2";
  t.fire(t.$("na"), "click");
  const c = t.cards()[1];
  assert.equal(c.querySelector("h3").textContent, "Next");
  assert.deepEqual(c.querySelectorAll("p").map((p) => p.textContent), ["line1", "line2"]);
  assert.match(c.querySelector("time").textContent, /^\d{2}:\d{2}$/, "a note stamped just now shows only the time");
});
