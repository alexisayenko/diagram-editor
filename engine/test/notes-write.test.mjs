import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseToml, tomlModel, parseNoteText } from "../parse/toml.mjs";
import { setNotes, formatNotes } from "../parse/toml-write.mjs";
import { prepareDiagram } from "../browser/render.mjs";

const demo = readFileSync(new URL("../../examples/demo/demo.toml", import.meta.url), "utf8");
const body = '[[servers]]\nid = "a"\nserver_type = "web"\n';
const notesOf = (src) => parseToml(src).notes ?? [];

test("multi-line strings parse: first newline trimmed, line-ending backslash, quotes at the end", () => {
  const t = parseToml('a = """\nline one\nline two"""\nb = """x\\\n     y"""\nc = """q"""" \nd = \'\'\'raw \\ text\'\'\'\n');
  assert.equal(t.a, "line one\nline two");
  assert.equal(t.b, "xy");
  assert.equal(t.c, 'q"');
  assert.equal(t.d, "raw \\ text");
  assert.throws(() => parseToml('a = """open\n'), /unterminated/);
});

test("round trip: quotes, backslashes, unicode, tabs, control characters, empty body lines", () => {
  const texts = [
    'Quotes\nsay "hi" and """triple""" and end with quote"',
    "Back\\slash\nC:\\path\\to\\file and \\n literal and \\u0041",
    "Unicode · € \u{1F600}\nbody Привет",
    "Tabs\nDate: 2026-01-02\n\nbody\twith tab\n\n\nafter blank lines",
    "Ctrl\nbell \u0007 and nul-ish \u0001 and del \u007f",
  ];
  const out = setNotes('title = "t"\n' + body, texts);
  assert.deepEqual(notesOf(out), texts);
  assert.equal(tomlModel(out, "t.toml").notes.length, texts.length);
});

test("surgical: replacing notes leaves every other byte identical", () => {
  const src = '# header comment\r\nid = "x"   # keep\r\ntitle = "T"\r\nnotes = [\r\n  "Old one\\nbody",\r\n  "Old two\\nbody",\r\n] # trailing\r\n\r\n# regions\r\n' + body.replace(/\n/g, "\r\n") + "\r\n\r\n";
  const out = setNotes(src, ["New\nbody é"]);
  const start = src.indexOf("notes = ") + 8, end = src.indexOf("] # trailing") + 1;
  assert.equal(out.slice(0, start), src.slice(0, start));
  assert.equal(out.slice(out.length - (src.length - end)), src.slice(end));
  assert.ok(!/[^\r]\n/.test(out), "all line endings stay CRLF");
  assert.deepEqual(notesOf(out), ["New\nbody é"]);
});

test("surgical: demo file keeps its comments, order and whitespace", () => {
  const out = setNotes(demo, ["Fresh note\nWith body.", "Second\nDate: 2026-05-05\n\nMore."]);
  assert.deepEqual(notesOf(out), ["Fresh note\nWith body.", "Second\nDate: 2026-05-05\n\nMore."]);
  const noNotes = setNotes(out, []);
  assert.equal(noNotes, setNotes(setNotes(demo, []), []));
  assert.deepEqual(parseToml(setNotes(demo, [])).servers, parseToml(demo).servers);
});

test("add: key is appended after the last top-level key, before the first table", () => {
  const src = '# c\nid = "x"\ntitle = "T" # t\n\n[[servers]]\nid = "a"\nserver_type = "web"\n';
  const out = setNotes(src, ["N\nbody"]);
  assert.ok(out.startsWith('# c\nid = "x"\ntitle = "T" # t\nnotes = [\n'));
  assert.ok(out.endsWith('\n\n[[servers]]\nid = "a"\nserver_type = "web"\n'));
  assert.deepEqual(notesOf(out), ["N\nbody"]);
  const crlf = setNotes(src.replace(/\n/g, "\r\n"), ["N\nbody"]);
  assert.ok(!/[^\r]\n/.test(crlf));
  assert.deepEqual(notesOf(crlf), ["N\nbody"]);
});

test("add: files with no top-level keys, no tables, no trailing newline, a BOM", () => {
  assert.deepEqual(notesOf(setNotes(body, ["N\nb"])), ["N\nb"]);
  assert.ok(setNotes(body, ["N\nb"]).startsWith("notes = ["));
  assert.deepEqual(notesOf(setNotes('title = "t"', ["N\nb"])), ["N\nb"]);
  assert.equal(setNotes('title = "t"', ["N\nb"]).indexOf('title = "t"\nnotes'), 0);
  const bom = "﻿" + 'title = "t"\n' + body;
  const out = setNotes(bom, ["N\nb"]);
  assert.ok(out.startsWith("﻿title"));
  assert.deepEqual(notesOf(out), ["N\nb"]);
});

test("remove: the whole notes line goes, nothing else", () => {
  const src = 'title = "t"\nnotes = ["A\\nb", "C\\nd"] # why\nid = "x"\n\n' + body;
  assert.equal(setNotes(src, []), 'title = "t"\nid = "x"\n\n' + body);
  assert.equal(setNotes('title = "t"\n' + body, []), 'title = "t"\n' + body);
  const multi = 'title = "t"\nnotes = [\n  "A\\nb",\n]\n\n' + body;
  assert.equal(setNotes(multi, []), 'title = "t"\n\n' + body);
});

test("replace a single-string notes key and keep comments after it", () => {
  const src = 'title = "t"\nnotes = "Only\\nbody"   # note\n\n' + body;
  const out = setNotes(src, ["Only\nbody", "Added\nbody"]);
  assert.deepEqual(notesOf(out), ["Only\nbody", "Added\nbody"]);
  assert.ok(out.endsWith("]   # note\n\n" + body));
  assert.equal(setNotes(out, ["Only\nbody"]).includes("Added"), false);
});

test("formatNotes output is a valid array of multi-line basic strings", () => {
  const text = formatNotes(["A\nb", "C\nd"]);
  assert.equal(text, '[\n  """\nA\nb""",\n  """\nC\nd""",\n]');
});

test("errors: empty or non-string notes, broken TOML, unpaired surrogate", () => {
  assert.throws(() => setNotes('title = "t"\n', [""]), /non-empty/);
  assert.throws(() => setNotes('title = "t"\n', [1]), /non-empty/);
  assert.throws(() => setNotes('title = "t"\n', "x"), /non-empty/);
  assert.throws(() => setNotes('title = "unterminated\n', ["A\nb"]), /TOML:/);
  assert.throws(() => setNotes('title = "t"\n', ["A\nb \ud800"]), /surrogate/);
});

test("note text validation reports an empty title, empty body and bad dates", () => {
  assert.throws(() => parseNoteText("\nTitle\nbody", "Note", true), /title/);
  assert.throws(() => parseNoteText("Title only", "Note"), /body text/);
  assert.throws(() => parseNoteText("Title\nDate:\nbody", "Note"), /empty Date/);
  assert.throws(() => parseNoteText("Title\nbody\n# heading", "Note"), /cannot start with #/);
  const n = parseNoteText("Title\nDate: 2026-01-01\n\nOne\nTwo\n\nThree");
  assert.deepEqual([n.title, n.date, n.paras], ["Title", "2026-01-01", ["One Two", "Three"]]);
  assert.equal(n.text, "Title\nDate: 2026-01-01\n\nOne\nTwo\n\nThree");
});

test("documents: parsed, validated, rendered; a documents-only file opens", () => {
  const src = 'title = "t"\n[[documents]]\ntitle = "Doc one"\nurl = "https://wiki.example.test/a"\ndescription = "About"\n[[documents]]\ntitle = "Doc two"\nurl = "http://wiki.example.test/b"\n';
  const { docs } = tomlModel(src, "t.toml");
  assert.deepEqual(docs, [{ title: "Doc one", url: "https://wiki.example.test/a", desc: "About" }, { title: "Doc two", url: "http://wiki.example.test/b", desc: "" }]);
  assert.doesNotThrow(() => prepareDiagram(src, "t.toml"));
  for (const bad of ['url = "javascript:alert(1)"', 'url = "https://x y"', 'url = "ftp://e.test/x"', 'url = "https://e.test/"\nextra = "x"']) {
    assert.throws(() => tomlModel('title = "t"\n[[documents]]\ntitle = "D"\n' + bad + "\n", "t.toml"), /documents\[1\]|must be/);
  }
  assert.throws(() => tomlModel('title = "t"\n', "t.toml"), /define at least one/);
});

test("saving notes preserves documents and servers byte for byte", () => {
  assert.match(demo, /\[\[documents\]\]/);
  const out = setNotes(demo, ["Another\nnote body."]);
  assert.equal(setNotes(out, []), setNotes(demo, []));
  assert.deepEqual(parseToml(out).documents, parseToml(demo).documents);
});

const notesEdit = (() => {
  let mod;
  const src = readFileSync(new URL("../runtime/ui/notes-edit.js", import.meta.url), "utf8");
  new Function("InfraDiagram", "window", "document", src)({ define: (n, d, f) => { mod = f({ D: { notes: [] }, $: () => null }, {}); } }, {}, {});
  return mod;
})();
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi);

test("note stamp display: time today, date otherwise, nothing when missing", () => {
  const now = at(2026, 10, 7, 16, 0);
  assert.equal(notesEdit.show("2026-10-07 14:30", now), "14:30");
  assert.equal(notesEdit.show("2026-10-06 14:30", now), "2026-10-06");
  assert.equal(notesEdit.show("2026-10-07", now), "2026-10-07");
  assert.equal(notesEdit.show("2026-10-07 14:30", null), "2026-10-07");
  assert.equal(notesEdit.show("Note", now), "");
  assert.equal(notesEdit.show("", now), "");
  assert.equal(notesEdit.show("Q3 review", now), "Q3 review");
});

test("note stamp is set on create and real change only, and survives save and reload", () => {
  const now = at(2026, 3, 9, 8, 5);
  const created = notesEdit.stamped("Title\nBody line", "", true, now);
  assert.equal(created, "Title\nDate: 2026-03-09 08:05\n\nBody line");
  assert.equal(notesEdit.stamped(created, created, false, at(2026, 3, 10, 9, 9)), created);
  assert.equal(notesEdit.stamped(created + " more", created, false, at(2026, 3, 10, 9, 9)), "Title\nDate: 2026-03-10 09:09\n\nBody line more");
  assert.equal(notesEdit.stamped("T\nDate: 2020-01-01\n\nb", "T\nb", true, now), "T\nDate: 2020-01-01\n\nb");
  assert.equal(notesEdit.stamped("T\nDate: 2021-01-01\n\nb", "T\nDate: 2020-01-01\n\nb", false, now), "T\nDate: 2021-01-01\n\nb");
  const older = "Legacy\nbody";
  assert.equal(notesEdit.stamped(older, older, false, now), older);
  const out = setNotes('title = "t"\n' + body, [created]);
  assert.equal(tomlModel(out, "t.toml").notes[0].date, "2026-03-09 08:05");
  assert.equal(notesEdit.show(tomlModel(out, "t.toml").notes[0].date, now), "08:05");
  assert.equal(notesEdit.show(tomlModel(out, "t.toml").notes[0].date, at(2026, 3, 10, 1, 0)), "2026-03-09");
  assert.equal(tomlModel('title = "t"\nnotes = ["Old\\nbody"]\n' + body, "t.toml").notes[0].date, "Note");
});
