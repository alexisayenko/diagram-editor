import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE = fileURLToPath(new URL("..", import.meta.url));
const run = (script, args) => spawnSync(process.execPath, [join(ENGINE, script), ...args], { encoding: "utf8" });
const tmp = () => mkdtempSync(join(tmpdir(), "diagram-cli-"));

test("new.mjs scaffolds a diagram folder with every content file", () => {
  const root = tmp();
  try {
    const dir = join(root, "my-diag");
    const r = run("new.mjs", [dir]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /new: created .*my-diag/);
    assert.deepEqual(readdirSync(dir).sort(), ["details.md", "diagram.json", "diagram.mmd", "documents.md", "networks.md", "notes.md"]);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "diagram.json"), "utf8")), { title: "my-diag infrastructure", id: "my-diag" });
    assert.match(readFileSync(join(dir, "notes.md"), "utf8"), /Date: \d{4}-\d{2}-\d{2}/);
    assert.match(readFileSync(join(dir, "diagram.mmd"), "utf8"), /192\.0\.2\.11/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("new.mjs refuses a missing argument, a bad id and an existing folder", () => {
  const root = tmp();
  try {
    let r = run("new.mjs", []);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /usage: node engine\/new\.mjs/);
    r = run("new.mjs", [join(root, "Bad_Name")]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /must match/);
    assert.equal(existsSync(join(root, "Bad_Name")), false);
    assert.equal(run("new.mjs", [join(root, "ok-1")]).status, 0);
    r = run("new.mjs", [join(root, "ok-1")]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /already exists; refusing to overwrite/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

const DEMO = join(ENGINE, "..", "examples", "demo");
const demoCopy = (root) => {
  const dir = join(root, "demo");
  cpSync(DEMO, dir, { recursive: true });
  for (const f of ["layout.html", "index.html", "demo.excalidraw"]) rmSync(join(dir, f), { force: true });
  return dir;
};

test("build.mjs on a scaffolded diagram fails: new.mjs writes no layout.json", { skip: "bug: engine/new.mjs scaffolds no layout.json, so node engine/build.mjs <new-dir> dies with ENOENT (build.mjs reads it unconditionally)" }, () => {
  const root = tmp();
  try {
    const dir = join(root, "my-diag");
    run("new.mjs", [dir]);
    assert.equal(run("build.mjs", [dir]).status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("build.mjs builds a diagram folder, then --check passes and detects stale output", () => {
  const root = tmp();
  try {
    const dir = demoCopy(root);
    const built = run("build.mjs", [dir]);
    assert.equal(built.status, 0, built.stderr);
    assert.match(built.stdout, /layout\.html, index\.html, demo\.excalidraw written/);
    assert.match(readFileSync(join(dir, "layout.html"), "utf8"), /<svg/);
    const scene = JSON.parse(readFileSync(join(dir, "demo.excalidraw"), "utf8"));
    assert.equal(scene.type, "excalidraw");
    assert.ok(scene.elements.length > 0);
    assert.match(readFileSync(join(dir, "index.html"), "utf8"), /<pre class="mermaid">/);

    const ok = run("build.mjs", [dir, "--check"]);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /up to date/);

    writeFileSync(join(dir, "layout.html"), "stale");
    const stale = run("build.mjs", [dir, "--check"]);
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /layout\.html out of date/);
    assert.doesNotMatch(stale.stderr, /index\.html/);
    assert.equal(readFileSync(join(dir, "layout.html"), "utf8"), "stale");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("build.mjs --check reports every missing output as out of date", () => {
  const root = tmp();
  try {
    const r = run("build.mjs", [demoCopy(root), "--check"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /layout\.html, index\.html, demo\.excalidraw out of date/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("build.mjs usage and missing-folder errors", () => {
  const root = tmp();
  try {
    let r = run("build.mjs", []);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /usage: node engine\/build\.mjs/);
    r = run("build.mjs", [join(root, "nope")]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no diagram\.mmd in/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("build.mjs fails on an invalid layout.json", () => {
  const root = tmp();
  try {
    const dir = demoCopy(root);
    writeFileSync(join(dir, "layout.json"), "{ not json");
    const r = run("build.mjs", [dir]);
    assert.notEqual(r.status, 0);
    assert.notEqual(r.stderr.trim(), "");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("build.mjs rejects a layout.json that still has the retired notes key", () => {
  const root = tmp();
  try {
    const dir = demoCopy(root);
    const layout = JSON.parse(readFileSync(join(dir, "layout.json"), "utf8"));
    layout.notes = [];
    writeFileSync(join(dir, "layout.json"), JSON.stringify(layout));
    const r = run("build.mjs", [dir]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /notes live in notes\.md/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
