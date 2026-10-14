import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FormatError, fail } from "../parse/errors.mjs";
import { mergeFolder, parseToml, tomlModel, FORMAT_VERSION } from "../parse/toml.mjs";
import { newDiagram } from "../parse/new-diagram.mjs";
import { packDiagram, unpackDiagram } from "../lib/diagrams.mjs";
import { decideLayoutLoad, LAYOUT_VERSION } from "../parse/layout-version.mjs";
import { parseNetworksFile } from "../parse/shared-networks.mjs";
import { demo, mod, withFile } from "./helpers.mjs";

const withVersion = (value) => mod(demo(), "topology.toml", 'id = "demo"', `format_version = ${value}\nid = "demo"`);

test("an absent format_version and \"1\" are accepted, the demo declares none", () => {
  assert.equal(FORMAT_VERSION, "1");
  assert.equal(demo().get("topology.toml").includes("format_version"), false);
  assert.doesNotThrow(() => tomlModel(demo(), "demo"));
  assert.doesNotThrow(() => tomlModel(withVersion('"1"'), "demo"));
});

test("a newer format_version is refused with a clear message naming the file", () => {
  assert.throws(() => tomlModel(withVersion('"2"'), "demo"), (e) => e instanceof FormatError && e.file === "topology.toml" && e.message === "topology.toml: This diagram needs a newer engine (format_version 2, this engine supports 1)");
  assert.throws(() => mergeFolder(withVersion('"12"')), /format_version 12, this engine supports 1/);
});

test("the version is checked before anything a newer format may have changed", () => {
  const files = withFile(withVersion('"2"'), "notes.toml", "future_key = 1\n");
  assert.throws(() => mergeFolder(files), /needs a newer engine/);
});

test("format_version must be the string \"1\"", () => {
  for (const bad of ['"1.0"', '"0"', '"01"', '"v2"', '""', "true"]) assert.throws(() => mergeFolder(withVersion(bad)), /topology\.toml: format_version must be the string "1"/, bad);
});

test("a bare number is a parse error", () => {
  assert.throws(() => mergeFolder(withVersion("1")), /topology.toml:[0-9]+: /);
});

test("format_version is only valid in topology.toml", () => {
  assert.throws(() => mergeFolder(withFile(demo(), "notes.toml", 'format_version = "1"\n')), /notes\.toml: unknown key format_version/);
});

test("New diagram writes format_version first and the result opens", () => {
  const files = newDiagram("fresh-one");
  assert.ok(files.get("topology.toml").startsWith('format_version = "1"\nid = "fresh-one"\n'));
  assert.equal(tomlModel(files, "fresh-one").config.id, "fresh-one");
});

test("the archive carries format_version through topology.toml and adds no file", async () => {
  const files = newDiagram("fresh-one"), zip = await packDiagram(files, null);
  const opened = await unpackDiagram(zip, "fresh-one-1.diag.zip");
  assert.equal(opened.files.get("topology.toml"), files.get("topology.toml"));
  assert.deepEqual([...opened.files.keys()].sort(), [...files.keys()].sort());
  const newer = new Map(files).set("topology.toml", files.get("topology.toml").replace('"1"', '"3"'));
  const reopened = await unpackDiagram(await packDiagram(newer, null), "fresh-one-1.diag.zip");
  assert.throws(() => tomlModel(reopened.files, "fresh-one"), /format_version 3/);
});

test("FormatError composes file, line and path in front of the message", () => {
  const e = new FormatError("bad thing", { file: "servers/web01.toml", line: 3 });
  assert.equal(e.message, "servers/web01.toml:3: bad thing");
  assert.deepEqual([e.name, e.detail, e.file, e.line, e.path], ["FormatError", "bad thing", "servers/web01.toml", 3, null]);
  assert.equal(new FormatError("x", { line: 2 }).message, "line 2: x");
  assert.equal(new FormatError("x", { path: "notes[1]" }).message, "notes[1]: x");
  assert.equal(new FormatError("x").message, "x");
  assert.throws(() => fail("boom"), FormatError);
});

test("parser and folder errors are FormatErrors that start with the file name", () => {
  assert.throws(() => parseToml('title = "unterminated'), (e) => e instanceof FormatError && /^line \d+: /.test(e.message));
  const bad = withFile(demo(), "servers/web01.toml", 'id = "web01"\nid = "web01"');
  assert.throws(() => mergeFolder(bad), (e) => e instanceof FormatError && e.file === "servers/web01.toml" && e.line === 2 && e.message.startsWith("servers/web01.toml:2: "));
  assert.throws(() => mergeFolder(withFile(demo(), "extra.toml", "x = 1")), (e) => e instanceof FormatError && e.message.startsWith("unexpected file extra.toml"));
  assert.throws(() => parseNetworksFile("x = ["), (e) => e instanceof FormatError && e.message.startsWith("networks.toml:1: "));
  assert.throws(() => parseNetworksFile('[[networks]]\ncidr = "nope"\n'), (e) => e instanceof FormatError && e.message.startsWith("networks.toml: "));
});

test("decideLayoutLoad: newer versions fall back to auto layout and lock Save", () => {
  assert.equal(LAYOUT_VERSION, 1);
  const layout = { version: 1, nodes: {} };
  assert.deepEqual(decideLayoutLoad(layout, 1), { use: layout, warning: null, lockSave: false });
  assert.deepEqual(decideLayoutLoad({ nodes: {} }, 1), { use: { nodes: {} }, warning: null, lockSave: false });
  assert.deepEqual(decideLayoutLoad(null, 1), { use: null, warning: null, lockSave: false });
  assert.deepEqual(decideLayoutLoad({ version: 0 }, 1).lockSave, false);
  const newer = decideLayoutLoad({ version: 2, nodes: {} }, 1);
  assert.equal(newer.use, null);
  assert.equal(newer.lockSave, true);
  assert.match(newer.warning, /version 2, newer than this engine supports \(1\)/);
});

test("CLI entry points print a FormatError and exit non-zero without a stack", () => {
  const build = fileURLToPath(new URL("../build.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [build, "no-such-folder-here"], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^build: no diagram\.mmd in "no-such-folder-here"\n$/);
});
