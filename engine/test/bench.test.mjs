// tools/bench.mjs on a small diagram: every stage is reported, every edit is incremental and byte-identical to a full render, the CLI prints and writes its report.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bench, EDITS, generate } from "../../tools/bench.mjs";

test("bench reports the stages and the four edits, each identical to a full render", () => {
  const lines = [], result = bench([20], 1, (n, row) => lines.push([n, row]));
  const row = result[20];
  assert.equal(lines.length, 1);
  for (const k of ["parse", "route", "pipeline", "edit", "editCached", "edits"]) assert.ok(row[k], k);
  assert.deepEqual(Object.keys(row.edits), Object.keys(EDITS));
  for (const [name, e] of Object.entries(row.edits)) assert.ok(e.same, `${name} edit differs from a full render`);
  assert.ok(row.edits.name.searches <= row.edits.name.searchesFull);
  assert.ok(row.edits.add.searches > 0 && row.edits.remove.searches > 0);
  assert.equal(row.connections, 30);
});

test("the edits change what they say they change", () => {
  const files = generate(20);
  const box = EDITS.box(files), add = EDITS.add(files), remove = EDITS.remove(files);
  assert.ok(box.files.get("servers/srv010.toml").includes("203.0.113.250/24"));
  assert.ok(add.files.has("servers/srv9001.toml") && add.files.get("topology.toml").includes('to = "srv9001"'));
  assert.ok(!remove.files.has("servers/srv010.toml") && !remove.files.get("topology.toml").includes('"srv010"'));
  assert.deepEqual([box.refit, add.refit, remove.refit], [["srv010"], [], []]);
});

test("the command line prints the tables and writes the json report", () => {
  const dir = mkdtempSync(join(tmpdir(), "bench-cli-")), out = join(dir, "r.json");
  try {
    const run = spawnSync(process.execPath, [fileURLToPath(new URL("../../tools/bench.mjs", import.meta.url)), "--sizes", "20", "--runs", "1", "--out", out], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /edits, ms/);
    assert.match(run.stdout, /servers\s+parse/);
    assert.equal(JSON.parse(readFileSync(out, "utf8")).result[20].connections, 30);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
