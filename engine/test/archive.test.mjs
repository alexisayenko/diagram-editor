import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeZip, readZip, crc32, entryProblem, isArchiveName } from "../lib/zip.mjs";
import { listDiagrams, filterDiagrams, nameProblem, sanitizeName, archiveDiagramName, packDiagram, unpackDiagram, FILTER_MIN } from "../lib/diagrams.mjs";
import { archiveName } from "../lib/names.mjs";
import { demo } from "./helpers.mjs";

const enc = new TextEncoder();
const entry = (name, text) => ({ name, data: enc.encode(text) });
const rejects = (p, re) => assert.rejects(p, re);

test("zip round trip: stored and deflated entries, unicode, empty file", async () => {
  const big = "line of text\n".repeat(500);
  const zip = await writeZip([entry("topology.toml", 'id = "x"\n'), entry("servers/a.toml", big), entry("notes.toml", "")]);
  const out = await readZip(zip);
  assert.deepEqual([...out.keys()], ["topology.toml", "servers/a.toml", "notes.toml"]);
  assert.equal(new TextDecoder().decode(out.get("servers/a.toml")), big);
  assert.equal(out.get("notes.toml").length, 0);
  assert.ok(zip.length < big.length, "large text is deflated");
  assert.equal(crc32(enc.encode("123456789")), 0xcbf43926);
});

test("zip-slip and unsafe names are rejected, nothing is opened", async () => {
  for (const bad of ["../x.toml", "a/../b.toml", "/etc/x.toml", "C:/x.toml", "a\\b.toml", "x\0.toml", "servers/../../x.toml", "deep/er/x.toml", "x.exe", "run.sh"]) {
    assert.ok(entryProblem(bad), bad);
    await rejects(readZip(await writeZip([entry("topology.toml", "a"), entry(bad, "b")])), /Rejected archive/);
  }
  await rejects(readZip(await writeZip([entry("a.toml", "1"), entry("a.toml", "2")])), /duplicate/);
});

test("directory entries, __MACOSX and dotfiles are skipped", async () => {
  const out = await readZip(await writeZip([entry("servers/", ""), entry("__MACOSX/._a.toml", "x"), entry(".DS_Store", "x"), entry("a.toml", "1")]));
  assert.deepEqual([...out.keys()], ["a.toml"]);
});

test("limits: entry count, per-file and total size, enforced on the real data", async () => {
  const many = await writeZip([entry("a.toml", "1"), entry("b.toml", "2"), entry("c.toml", "3")]);
  await rejects(readZip(many, { entries: 2 }), /more than 2 entries/);
  const text = "x".repeat(5000);
  const zip = await writeZip([entry("a.toml", text), entry("b.toml", text)]);
  await rejects(readZip(zip, { file: 4000 }), /larger than/);
  await rejects(readZip(zip, { total: 6000 }), /unpacks to more than/);
});

test("decompression bomb: a header that lies about the size is caught while inflating", async () => {
  const zip = await writeZip([entry("a.toml", "y".repeat(100000))]);
  const dv = new DataView(zip.buffer);
  const cd = zip.length - 22 - 46 - 6, local = 0;
  assert.equal(dv.getUint32(cd, true), 0x02014b50);
  dv.setUint32(cd + 24, 100, true);
  dv.setUint32(local + 22, 100, true);
  await rejects(readZip(zip), /could not be unpacked|damaged/);
});

test("unsupported archives: not a zip, encrypted, other compression method, truncated", async () => {
  await rejects(readZip(enc.encode("hello, I am not a zip file at all")), /Not a valid zip/);
  const zip = await writeZip([entry("a.toml", "1")]);
  const enc1 = zip.slice(); new DataView(enc1.buffer).setUint16(zip.length - 22 - 46 - 6 + 8, 1, true);
  await rejects(readZip(enc1), /Encrypted/);
  const m = zip.slice(); new DataView(m.buffer).setUint16(zip.length - 22 - 46 - 6 + 10, 12, true);
  await rejects(readZip(m), /compression method 12/);
  await rejects(readZip(zip.slice(0, zip.length - 10)), /Not a valid zip/);
});

test("only .diag.zip names are accepted", async () => {
  assert.ok(isArchiveName("a.diag.zip") && isArchiveName("A.DIAG.ZIP"));
  for (const n of ["a.zip", "a.txt", "a.diag.zip.txt", "diag.zip"]) assert.ok(!isArchiveName(n), n);
  const zip = await packDiagram(new Map([["topology.toml", 'id = "x"\n']]), null);
  await rejects(unpackDiagram(zip, "a.zip"), /Only \.diag\.zip files can be opened/);
});

test("names: sanitising, archive diagram name, live name validation", () => {
  assert.equal(sanitizeName("My Diagram_01!"), "my-diagram-01");
  assert.equal(sanitizeName("***"), "diagram");
  assert.equal(archiveDiagramName('title = "t"\nid = "Net_A"\n', "x.diag.zip"), "net-a");
  assert.equal(archiveDiagramName("title = 't'", "Site Plan.v2.diag.zip"), "site-plan-v2");
  assert.equal(nameProblem("ok-1", ["other"]), null);
  assert.match(nameProblem("Bad", []), /lowercase/);
  assert.match(nameProblem("taken", ["taken"]), /already exists/);
  assert.match(nameProblem("", []), /Enter a name/);
  assert.equal(archiveName("demo", new Date(2026, 9, 7, 14, 30, 12)), "demo-20261007-143012.diag.zip");
});

test("export contains every file including unsaved edits, relative paths, layout; import restores them", async () => {
  const files = new Map(demo());
  files.set("notes.toml", files.get("notes.toml") + "\n# unsaved edit\n");
  const layout = '{"version":1}\n';
  const out = await readZip(await packDiagram(files, layout));
  assert.deepEqual([...out.keys()].sort(), [...files.keys(), "diagram.layout.json"].sort());
  for (const k of out.keys()) assert.ok(!k.startsWith("demo/") && !k.startsWith("/"));
  const opened = await unpackDiagram(await packDiagram(files, layout), "demo-1.diag.zip");
  assert.equal(opened.layoutText, layout);
  assert.equal(opened.files.get("notes.toml"), files.get("notes.toml"));
  assert.equal(opened.name, "demo");
  assert.deepEqual([...opened.files.keys()].sort(), [...files.keys()].sort());
});

test("an archive without topology.toml is not a diagram", async () => {
  await rejects(unpackDiagram(await packDiagram(new Map([["notes.toml", "x"]]), null), "a.diag.zip"), /no topology\.toml/);
});

test("saved diagram list: detection, server count, newest first, filter", () => {
  const f = (name, mtime) => ({ name, size: 1, mtime });
  const rows = listDiagrams([
    f("old/topology.toml", 10), f("old/servers/a.toml", 11), f("old/servers/b.toml", 12),
    f("new/topology.toml", 50), f("only-servers/servers/a.toml", 30),
    f("junk/diagram.layout.json", 99), f("loose.toml", 100), f("layoutonly/notes.toml", 200),
  ]);
  assert.deepEqual(rows.map((r) => r.name), ["new", "only-servers", "old"]);
  assert.equal(rows.find((r) => r.name === "old").servers, 2);
  assert.equal(rows.find((r) => r.name === "old").mtime, 12);
  assert.deepEqual(filterDiagrams(rows, " OL ").map((r) => r.name), ["old"]);
  assert.equal(filterDiagrams(rows, "").length, 3);
  assert.equal(FILTER_MIN, 9);
});

test("page: toolbar, dialogs, no folder picker, archive-only input", () => {
  const html = readFileSync(new URL("../../diagram.html", import.meta.url), "utf8");
  assert.ok(html.includes('id="open">Open saved diagram<') && html.includes('id="importdiag">Import diagram<'));
  assert.ok(html.includes('id="diagfile" type="file" accept=".diag.zip"'));
  assert.ok(!html.includes("webkitdirectory") && !html.includes("Open diagram folder"));
  assert.ok(html.includes('id="op" class="dlg"') && html.includes('id="nw" class="dlg"'));
  assert.ok(html.includes("No saved diagrams yet") && html.includes("Only .diag.zip files can be opened"));
});
