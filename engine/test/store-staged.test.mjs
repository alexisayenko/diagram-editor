import { test } from "node:test";
import assert from "node:assert/strict";
import * as nodeFs from "node:fs";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../lib/store.mjs";

const fresh = (io) => {
  const dir = join(mkdtempSync(join(tmpdir(), "staged-")), "local");
  mkdirSync(join(dir, "d"), { recursive: true });
  return { dir, store: createStore(dir, io) };
};
const files = (dir) => readdirSync(join(dir, "d")).sort();
const failing = (name, on) => {
  const calls = { n: 0 };
  return { calls, io: { ...nodeFs, [name]: (...a) => { calls.n++; if (on(calls.n, ...a)) throw new Error("injected " + name); return nodeFs[name](...a); } } };
};
const entry = (name, text, base) => ({ name: "d/" + name, text, base });

test("a save writes every file and leaves no temp files", () => {
  const { dir, store } = fresh();
  assert.deepEqual(store.write([entry("a.toml", "1", null), entry("b.toml", "2", null)]), { saved: ["d/a.toml", "d/b.toml"] });
  assert.deepEqual(files(dir), ["a.toml", "b.toml"]);
});

test("temp files are flushed to disk before any rename", () => {
  const order = [];
  const io = { ...nodeFs, fsyncSync: (fd) => { order.push("fsync"); return nodeFs.fsyncSync(fd); }, renameSync: (a, b) => { order.push("rename"); return nodeFs.renameSync(a, b); } };
  const { store } = fresh(io);
  store.write([entry("a.toml", "1", null), entry("b.toml", "2", null)]);
  assert.deepEqual(order, ["fsync", "fsync", "rename", "rename"]);
});

test("rename failing on the 2nd file restores the 1st and keeps the old content", () => {
  const { io } = failing("renameSync", (n) => n === 2);
  const { dir, store } = fresh(io);
  writeFileSync(join(dir, "d/a.toml"), "old-a");
  writeFileSync(join(dir, "d/b.toml"), "old-b");
  let err;
  try { store.write([entry("a.toml", "new-a", "old-a"), entry("b.toml", "new-b", "old-b")]); } catch (e) { err = e; }
  assert.equal(err.status, 500);
  assert.match(err.message, /Saving d\/b\.toml failed: injected renameSync\. Nothing was saved\./);
  assert.deepEqual(err.extra.saved, []);
  assert.equal(readFileSync(join(dir, "d/a.toml"), "utf8"), "old-a");
  assert.equal(readFileSync(join(dir, "d/b.toml"), "utf8"), "old-b");
  assert.deepEqual(files(dir), ["a.toml", "b.toml"]);
});

test("a rollback removes a file that did not exist before", () => {
  const { io } = failing("renameSync", (n) => n === 2);
  const { dir, store } = fresh(io);
  assert.throws(() => store.write([entry("new.toml", "1", null), entry("other.toml", "2", null)]), { status: 500 });
  assert.deepEqual(files(dir), []);
});

test("a failure while staging writes nothing and removes the temp files", () => {
  const { io } = failing("fsyncSync", (n) => n === 2);
  const { dir, store } = fresh(io);
  writeFileSync(join(dir, "d/a.toml"), "old-a");
  let err;
  try { store.write([entry("a.toml", "new-a", "old-a"), entry("b.toml", "new-b", null)]); } catch (e) { err = e; }
  assert.equal(err.status, 500);
  assert.deepEqual(err.extra.saved, []);
  assert.deepEqual(files(dir), ["a.toml"]);
  assert.equal(readFileSync(join(dir, "d/a.toml"), "utf8"), "old-a");
});

test("when a restore also fails the response names the files left changed", () => {
  const { io } = failing("renameSync", (n) => n >= 2);
  const { dir, store } = fresh(io);
  writeFileSync(join(dir, "d/a.toml"), "old-a");
  let err;
  try { store.write([entry("a.toml", "new-a", "old-a"), entry("b.toml", "new-b", null)]); } catch (e) { err = e; }
  assert.equal(err.status, 500);
  assert.deepEqual(err.extra.saved, ["d/a.toml"]);
  assert.match(err.message, /Could not restore d\/a\.toml/);
  assert.equal(readdirSync(join(dir, "d")).filter((n) => n.endsWith(".tmp")).length, 0);
});

test("leftover temp files are swept on start and before each save, other files stay", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "sweep-")), "local");
  mkdirSync(join(dir, "d"), { recursive: true });
  const stale = [".0123456789ab.tmp", "d/.ba9876543210.tmp"];
  for (const n of stale) writeFileSync(join(dir, n), "x");
  writeFileSync(join(dir, "d/keep.tmp"), "x");
  writeFileSync(join(dir, "d/.hidden.toml"), "x");
  const store = createStore(dir);
  assert.deepEqual(readdirSync(dir).sort(), ["d"]);
  assert.deepEqual(files(dir), [".hidden.toml", "keep.tmp"]);
  writeFileSync(join(dir, "d/.aaaaaaaaaaaa.tmp"), "x");
  store.write([entry("a.toml", "1", null)]);
  assert.deepEqual(files(dir), [".hidden.toml", "a.toml", "keep.tmp"]);
});

test("the 409 base check still refuses a stale save and writes nothing", () => {
  const { dir, store } = fresh();
  writeFileSync(join(dir, "d/a.toml"), "disk");
  let err;
  try { store.write([entry("b.toml", "1", null), entry("a.toml", "2", "stale")]); } catch (e) { err = e; }
  assert.equal(err.status, 409);
  assert.deepEqual(err.extra.conflicts, ["d/a.toml"]);
  assert.deepEqual(files(dir), ["a.toml"]);
});
