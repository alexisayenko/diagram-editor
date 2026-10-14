import test from "node:test";
import assert from "node:assert/strict";
import { validName, segmentProblem } from "../lib/names.mjs";
import { createStore, HttpError } from "../lib/store.mjs";
import { writeZip, readZip, entryProblem } from "../lib/zip.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const enc = new TextEncoder();
const entry = (name, text = "x") => ({ name, data: enc.encode(text) });

test("validName refuses Windows device names with any extension, in any segment, any case", () => {
  for (const n of ["d/con.toml", "d/CON.toml", "d/nul.json", "d/aux.toml", "d/prn.toml", "d/com1.toml", "d/LPT9.json", "d/con.backup.toml", "d/servers/con.toml", "con/a.toml", "d/servers/Com5.toml"]) assert.equal(validName(n), false, n);
  for (const n of ["d/console.toml", "d/com10.toml", "d/com0.toml", "d/lpt.toml", "d/nullable.toml", "d/servers/a.toml"]) assert.equal(validName(n), true, n);
});

test("validName refuses segments ending in a dot or space", () => {
  assert.equal(validName("d./a.toml"), false);
  assert.match(segmentProblem("x."), /dot or space/);
  assert.match(segmentProblem("NUL.txt"), /reserved/);
  assert.equal(segmentProblem("ok"), null);
});

test("store rejects reserved names and case-only duplicates with 400 and writes nothing", () => {
  const store = createStore(mkdtempSync(join(tmpdir(), "names-")));
  const put = (files) => { try { store.write(files); return null; } catch (e) { assert.ok(e instanceof HttpError); return e; } };
  assert.equal(put([{ name: "d/con.toml", text: "a", base: null }]).status, 400);
  const dup = put([{ name: "d/A.toml", text: "a", base: null }, { name: "d/a.toml", text: "b", base: null }]);
  assert.equal(dup.status, 400);
  assert.match(dup.message, /Duplicate file name/);
  assert.deepEqual(store.list(), []);
  assert.deepEqual(store.write([{ name: "d/a.toml", text: "a", base: null }]).saved, ["d/a.toml"]);
});

test("zip reader rejects case-only duplicates and reserved names with a clear message", async () => {
  await assert.rejects(readZip(await writeZip([entry("a.toml"), entry("A.toml")])), /duplicate entry 'A\.toml'.*case/);
  await assert.rejects(readZip(await writeZip([entry("servers/b.toml"), entry("servers/B.toml")])), /duplicate/);
  await assert.rejects(readZip(await writeZip([entry("con.toml")])), /reserved device name/);
  await assert.rejects(readZip(await writeZip([entry("servers/NUL.json")])), /reserved device name/);
  assert.match(entryProblem("lpt1.toml"), /reserved/);
  assert.equal(entryProblem("servers/a.toml"), null);
  assert.equal((await readZip(await writeZip([entry("a.toml"), entry("servers/b.toml")]))).size, 2);
});
