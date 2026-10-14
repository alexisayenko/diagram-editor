import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore, handleApi, checkOrigin, HttpError, MAX_BYTES, MAX_FILES } from "../lib/store.mjs";
import { listDiagrams, filterDiagrams, FILTER_MIN, nameProblem, archiveDiagramName, whenText, packDiagram, unpackDiagram } from "../lib/diagrams.mjs";
import { sanitizeName } from "../lib/ids.mjs";
import { LAYOUT_FILE } from "../lib/files.mjs";
import { writeZip } from "../lib/zip.mjs";
import { validName, layoutNameFor, archiveName, stamp } from "../lib/names.mjs";

const fresh = () => { const root = mkdtempSync(join(tmpdir(), "covstore-")), dir = join(root, "local"); return { root, dir, store: createStore(dir) }; };
const H = { host: "localhost:8080", "content-type": "application/json" };
const api = (store, method, url, body, headers = H) => handleApi(store, { method, url, headers }, body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body));
const status = (fn) => { try { fn(); } catch (e) { return e instanceof HttpError ? e.status : e; } return null; };

test("list: missing directory is empty; sorted; depth and name filters; temp and foreign files skipped", () => {
  const { dir, store } = fresh();
  assert.deepEqual(store.list(), []);
  mkdirSync(join(dir, "demo", "servers", "deep"), { recursive: true });
  mkdirSync(join(dir, ".hidden"), { recursive: true });
  mkdirSync(join(dir, "bad dir"), { recursive: true });
  writeFileSync(join(dir, "demo", "topology.toml"), "a");
  writeFileSync(join(dir, "demo", "servers", "b.toml"), "bb");
  writeFileSync(join(dir, "demo", "servers", "a.toml"), "a");
  writeFileSync(join(dir, "demo", "servers", "deep", "no.toml"), "x");
  writeFileSync(join(dir, "demo", "notes.txt"), "x");
  writeFileSync(join(dir, "demo", ".tmp123.tmp"), "x");
  writeFileSync(join(dir, ".hidden", "a.toml"), "x");
  writeFileSync(join(dir, "bad dir", "a.toml"), "x");
  writeFileSync(join(dir, "top.json"), "{}");
  assert.deepEqual(store.list().map((f) => [f.name, f.size]), [["demo/servers/a.toml", 1], ["demo/servers/b.toml", 2], ["demo/topology.toml", 1], ["top.json", 2]]);
  assert.ok(store.list().every((f) => typeof f.mtime === "number"));
});

test("get: reads, 404 for a missing file, 400 for a bad name", () => {
  const { dir, store } = fresh();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "a.toml"), "x = 1\n");
  assert.deepEqual(store.get("a.toml"), { name: "a.toml", text: "x = 1\n" });
  assert.equal(status(() => store.get("b.toml")), 404);
  assert.equal(status(() => store.get("../a.toml")), 400);
  assert.equal(status(() => store.get(undefined)), 400);
});

test("get: reading a directory as a file is a 400 collision, not a 404", () => {
  const { dir, store } = fresh();
  mkdirSync(join(dir, "d.toml"), { recursive: true });
  const e = status(() => store.get("d.toml"));
  assert.equal(e, 400);
});

test("write: rejects non-arrays, empty, too many, bad entries, duplicates, missing text, oversize", () => {
  const { store } = fresh();
  const ok = { name: "a.toml", text: "x", overwrite: true };
  assert.equal(status(() => store.write(undefined)), 400);
  assert.equal(status(() => store.write("a")), 400);
  assert.equal(status(() => store.write([])), 400);
  assert.equal(status(() => store.write(Array.from({ length: MAX_FILES + 1 }, (_, i) => ({ ...ok, name: `f${i}.toml` })))), 400);
  assert.equal(status(() => store.write([null])), 400);
  assert.equal(status(() => store.write(["a.toml"])), 400);
  assert.equal(status(() => store.write([{ ...ok, name: "../x.toml" }])), 400);
  assert.equal(status(() => store.write([ok, ok])), 400);
  assert.equal(status(() => store.write([{ name: "a.toml", overwrite: true }])), 400);
  assert.equal(status(() => store.write([{ name: "a.toml", text: 5, overwrite: true }])), 400);
  assert.equal(status(() => store.write([{ ...ok, text: "x".repeat(MAX_BYTES + 1) }])), 413);
  assert.equal(status(() => store.write([{ name: "a.toml", text: "x" }])), 400);
  assert.equal(status(() => store.write([{ name: "a.toml", text: "x", base: 5 }])), 400);
  assert.deepEqual(store.list(), []);
});

test("write: size limit counts bytes, not characters", () => {
  const { store } = fresh();
  const text = "é".repeat(MAX_BYTES / 2 + 1);
  assert.equal(status(() => store.write([{ name: "a.toml", text, overwrite: true }])), 413);
  assert.deepEqual(store.write([{ name: "a.toml", text: "é".repeat(MAX_BYTES / 2), overwrite: true }]), { saved: ["a.toml"] });
});

test("write: compare-before-write, base null means new file, one conflict blocks the whole batch", () => {
  const { dir, store } = fresh();
  assert.deepEqual(store.write([{ name: "demo/a.toml", text: "1", base: null }]), { saved: ["demo/a.toml"] });
  assert.equal(readFileSync(join(dir, "demo", "a.toml"), "utf8"), "1");
  assert.deepEqual(store.write([{ name: "demo/a.toml", text: "2", base: "1" }]), { saved: ["demo/a.toml"] });
  assert.throws(() => store.write([{ name: "demo/b.toml", text: "n", base: null }, { name: "demo/a.toml", text: "3", base: "1" }, { name: "demo/c.toml", text: "n", base: "x" }]), (e) => e.status === 409 && e.extra.conflicts.join() === "demo/a.toml,demo/c.toml" && /Nothing was written/.test(e.message));
  assert.equal(readFileSync(join(dir, "demo", "a.toml"), "utf8"), "2");
  assert.equal(store.list().some((f) => f.name === "demo/b.toml"), false);
  assert.deepEqual(store.write([{ name: "demo/a.toml", text: "forced", overwrite: true }]), { saved: ["demo/a.toml"] });
});

test("write: leaves no temporary files behind", () => {
  const { dir, store } = fresh();
  store.write([{ name: "a.toml", text: "1", base: null }, { name: "d/b.toml", text: "2", base: null }]);
  assert.deepEqual(readdirSync(dir).sort(), ["a.toml", "d"]);
  assert.deepEqual(readdirSync(join(dir, "d")), ["b.toml"]);
});

test("checkOrigin: host, origin and fetch-site rules", () => {
  assert.doesNotThrow(() => checkOrigin({ host: "127.0.0.1:1" }));
  assert.doesNotThrow(() => checkOrigin({ host: "localhost:8080", origin: "http://localhost:8080", "sec-fetch-site": "same-origin" }));
  assert.doesNotThrow(() => checkOrigin({ host: "[::1]:9", "sec-fetch-site": "none" }));
  for (const host of [undefined, "", "example.test", "127.0.0.1", "127.0.0.1:x", "evil.example.test:80", "localhost.example.test:80", "127.0.0.1:80/x"]) {
    assert.equal(status(() => checkOrigin({ host })), 403, String(host));
  }
  assert.equal(status(() => checkOrigin({ host: "localhost:1", origin: "http://example.test" })), 403);
  assert.equal(status(() => checkOrigin({ host: "localhost:1", origin: "https://localhost:1" })), 403);
  assert.equal(status(() => checkOrigin({ host: "localhost:1", "sec-fetch-site": "cross-site" })), 403);
  assert.equal(status(() => checkOrigin({ host: "localhost:1", "sec-fetch-site": "same-site" })), 403);
});

test("handleApi: routing, status codes and error bodies", () => {
  const { store } = fresh();
  assert.deepEqual(api(store, "GET", "/api/files"), { status: 200, body: { files: [] } });
  assert.equal(api(store, "PUT", "/api/files", { files: [{ name: "a.toml", text: "1", base: null }] }).status, 200);
  assert.deepEqual(api(store, "GET", "/api/file?name=a.toml").body, { name: "a.toml", text: "1" });
  assert.equal(api(store, "GET", "/api/file?name=zzz.toml").status, 404);
  assert.equal(api(store, "GET", "/api/file").status, 400);
  assert.equal(api(store, "GET", "/api/nothing").status, 404);
  assert.equal(api(store, "POST", "/api/files", {}).status, 405);
  assert.equal(api(store, "DELETE", "/api/file").status, 405);
  assert.equal(api(store, "PUT", "/api/file", {}).status, 405);
  assert.equal(api(store, "GET", "/api/files", undefined, { host: "evil.test:80" }).status, 403);
});

test("handleApi: PUT validates content type, JSON and payload shape", () => {
  const { store } = fresh();
  const put = (body, headers = H) => api(store, "PUT", "/api/files", body, headers);
  assert.equal(put({ files: [] }, { host: H.host }).status, 415);
  assert.equal(put({ files: [] }, { host: H.host, "content-type": "text/plain" }).status, 415);
  assert.equal(put({ files: [{ name: "a.toml", text: "1", overwrite: true }] }, { host: H.host, "content-type": "application/json; charset=utf-8" }).status, 200);
  const bad = put("{not json");
  assert.deepEqual(bad, { status: 400, body: { error: "Invalid JSON" } });
  assert.equal(put("null").status, 400);
  assert.equal(put({}).status, 400);
  assert.equal(put({ files: "x" }).status, 400);
});

test("handleApi: conflicts carry the file list, unexpected errors become 500 with the message", () => {
  const { store } = fresh();
  api(store, "PUT", "/api/files", { files: [{ name: "a.toml", text: "1", base: null }] });
  const r = api(store, "PUT", "/api/files", { files: [{ name: "a.toml", text: "2", base: "old" }] });
  assert.equal(r.status, 409);
  assert.deepEqual(r.body.conflicts, ["a.toml"]);
  const boom = { list: () => { throw new Error("disk on fire"); }, get: () => { throw new TypeError("odd"); }, write: () => ({}) };
  assert.deepEqual(api(boom, "GET", "/api/files"), { status: 500, body: { error: "disk on fire" } });
  assert.deepEqual(api(boom, "GET", "/api/file?name=a.toml"), { status: 500, body: { error: "odd" } });
});

test("names: strict allowlist at the edges", () => {
  assert.ok(validName("a.json"));
  assert.ok(validName("a/b/c.toml"));
  assert.ok(!validName("a/b/c/d.toml"));
  assert.ok(!validName("-a.toml"));
  assert.ok(!validName("a.toml.bak"));
  assert.ok(!validName(".toml"));
  assert.ok(!validName("a/\u0000.toml"));
  assert.equal(layoutNameFor("x"), "x/diagram.layout.json");
  assert.equal(stamp(new Date(2026, 0, 2, 3, 4, 5)), "20260102-030405");
  assert.equal(archiveName("x", new Date(2026, 11, 31, 23, 59, 59)), "x-20261231-235959.diag.zip");
  assert.match(archiveName("x"), /^x-\d{8}-\d{6}\.diag\.zip$/);
});

test("listDiagrams: folders count only with a topology or a server file, newest first", () => {
  const rows = listDiagrams([
    { name: "top.toml", mtime: 9 },
    { name: "a/topology.toml", mtime: 10 }, { name: "a/servers/x.toml", mtime: 30 }, { name: "a/servers/y.toml", mtime: 5 }, { name: "a/servers/z.json", mtime: 99 },
    { name: "b/diagram.toml", mtime: 20 },
    { name: "c/notes.toml", mtime: 100 },
    { name: "d/servers/x.toml", mtime: 20 },
    { name: "e/sub/topology.toml", mtime: 100 },
  ]);
  assert.deepEqual(rows, [{ name: "a", servers: 2, mtime: 99 }, { name: "b", servers: 0, mtime: 20 }, { name: "d", servers: 1, mtime: 20 }]);
});

test("filterDiagrams: case-insensitive substring, blank query keeps everything", () => {
  const rows = [{ name: "alpha" }, { name: "beta" }];
  assert.equal(filterDiagrams(rows, "  "), rows);
  assert.equal(filterDiagrams(rows, undefined), rows);
  assert.deepEqual(filterDiagrams(rows, " ALP "), [{ name: "alpha" }]);
  assert.deepEqual(filterDiagrams(rows, "zz"), []);
  assert.equal(FILTER_MIN, 9);
});

test("nameProblem: ordered checks", () => {
  assert.equal(nameProblem(""), "Enter a name.");
  assert.match(nameProblem("Bad Name"), /lowercase letters, digits and hyphens/);
  assert.match(nameProblem("-bad"), /starting with a letter or digit/);
  assert.match(nameProblem("a".repeat(61)), /at most 60 characters/);
  assert.equal(nameProblem("a".repeat(60)), null);
  assert.match(nameProblem("demo", ["demo"]), /^demo already exists in local\//);
  assert.equal(nameProblem("demo", ["other"]), null);
  assert.equal(nameProblem("demo"), null);
});

test("sanitizeName and archiveDiagramName", () => {
  assert.equal(sanitizeName("My Diagram (v2)!"), "my-diagram-v2");
  assert.equal(sanitizeName("---"), "diagram");
  assert.equal(sanitizeName(""), "diagram");
  assert.equal(sanitizeName(null), "null");
  assert.equal(sanitizeName("ÄÖ"), "diagram");
  assert.equal(sanitizeName("x".repeat(59) + "-" + "y".repeat(5)), "x".repeat(59));
  assert.equal(archiveDiagramName('id = "Net One"\n', "ignored.diag.zip"), "net-one");
  assert.equal(archiveDiagramName('title = "t"\n  id = "x"\n', "My File.diag.zip"), "my-file");
  assert.equal(archiveDiagramName('\nid="tight"\n', "f.diag.zip"), "tight");
  assert.equal(archiveDiagramName(undefined, "Plain.diag.zip"), "plain");
  assert.equal(archiveDiagramName("", ".diag.zip"), "diagram");
});

test("whenText: zero-padded local time", () => {
  assert.equal(whenText(new Date(2026, 0, 2, 3, 4).getTime()), "2026-01-02 03:04");
  assert.equal(whenText(new Date(2026, 11, 31, 23, 59).getTime()), "2026-12-31 23:59");
});

test("packDiagram / unpackDiagram round trip, with and without layout", async () => {
  const files = new Map([["topology.toml", 'id = "My Net"\n'], ["servers/a.toml", 'id = "a"\n']]);
  const zip = await packDiagram(files, '{"x":1}', new Date(2026, 0, 1));
  const back = await unpackDiagram(zip, "whatever.DIAG.ZIP");
  assert.equal(back.name, "my-net");
  assert.equal(back.layoutText, '{"x":1}');
  assert.deepEqual([...back.files.keys()].sort(), ["servers/a.toml", "topology.toml"]);
  assert.equal(back.files.has(LAYOUT_FILE), false);
  for (const none of [null, undefined]) assert.equal((await unpackDiagram(await packDiagram(files, none), "x.diag.zip")).layoutText, null);
});

test("unpackDiagram: wrong extension, missing topology, BOM stripped, invalid UTF-8, legacy diagram.toml", async () => {
  const enc = new TextEncoder();
  const zipOf = (entries) => writeZip(entries.map(([name, data]) => ({ name, data: typeof data === "string" ? enc.encode(data) : data })));
  await assert.rejects(unpackDiagram(await zipOf([["topology.toml", "a"]]), "x.zip"), /Only \.diag\.zip files can be opened/);
  await assert.rejects(unpackDiagram(await zipOf([["a.toml", "a"]]), "x.diag.zip"), /no topology\.toml/);
  await assert.rejects(unpackDiagram(await zipOf([["topology.toml", new Uint8Array([0xff, 0xfe])]]), "x.diag.zip"), /'topology\.toml' is not valid UTF-8 text/);
  const bom = await unpackDiagram(await zipOf([["topology.toml", "﻿id = \"bom\"\n"]]), "x.diag.zip");
  assert.equal(bom.files.get("topology.toml"), 'id = "bom"\n');
  assert.equal(bom.name, "bom");
  const legacy = await unpackDiagram(await zipOf([["diagram.toml", 'id = "old"\n']]), "x.diag.zip");
  assert.equal(legacy.name, "old");
  await assert.rejects(unpackDiagram(new Uint8Array(5), "x.diag.zip"), /Not a valid zip file/);
});

test("store: symlinked and unusual entries never escape the list filter", () => {
  const { root, dir, store } = fresh();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(root, "outside.toml"), "secret");
  let linked = true;
  try { symlinkSync(join(root, "outside.toml"), join(dir, "link.toml")); } catch (_) { linked = false; }
  const names = store.list().map((f) => f.name);
  if (linked) assert.ok(names.includes("link.toml"));
  assert.equal(names.includes("../outside.toml"), false);
  rmSync(root, { recursive: true, force: true });
});

test("write: a name whose parent path is an existing file, or that is a folder, is a 400 validation error", () => {
  const { dir, store } = fresh();
  mkdirSync(join(dir, "demo"), { recursive: true });
  writeFileSync(join(dir, "demo", "a.toml"), "x = 1\n");
  mkdirSync(join(dir, "demo", "d.toml"));
  for (const entry of [{ name: "demo/a.toml/b.toml", base: null }, { name: "demo/a.toml/b.toml", overwrite: true }, { name: "demo/d.toml", overwrite: true }]) {
    assert.equal(status(() => store.write([{ text: "y", ...entry }])), 400);
  }
  const r = api(store, "PUT", "/api/files", { files: [{ name: "demo/a.toml/b.toml", text: "y", base: null }] });
  assert.equal(r.status, 400);
  assert.match(JSON.stringify(r.body ?? r), /collides/);
});
