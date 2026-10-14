import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE = fileURLToPath(new URL("..", import.meta.url));
const DEMO = join(ENGINE, "..", "examples", "demo");

function buildScene() {
  const root = mkdtempSync(join(tmpdir(), "diagram-exc-"));
  try {
    const dir = join(root, "demo");
    cpSync(DEMO, dir, { recursive: true });
    const r = spawnSync(process.execPath, [join(ENGINE, "build.mjs"), dir], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(readFileSync(join(dir, "demo.excalidraw"), "utf8"));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("scene envelope is an Excalidraw v2 document", () => {
  const s = buildScene();
  assert.equal(s.type, "excalidraw");
  assert.equal(s.version, 2);
  assert.equal(s.appState.viewBackgroundColor, "#ffffff");
  assert.deepEqual(s.files, {});
});

test("elements have unique ids, valid types and finite geometry", () => {
  const { elements } = buildScene();
  const ids = elements.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  const types = new Set(elements.map((e) => e.type));
  for (const t of types) assert.ok(["rectangle", "text", "arrow", "line", "freedraw"].includes(t), t);
  for (const e of elements) for (const k of ["x", "y", "width", "height"]) assert.ok(Number.isFinite(e[k]), `${e.id}.${k}`);
});

test("scene holds server titles, connection arrows, a legend and notes", () => {
  const { elements } = buildScene();
  const texts = elements.filter((e) => e.type === "text").map((e) => e.text);
  assert.ok(elements.filter((e) => e.type === "rectangle").length > 3);
  assert.ok(elements.some((e) => e.type === "arrow"));
  assert.ok(texts.some((t) => /CONNECTIONS/.test(t)));
  assert.ok(elements.some((e) => e.type === "rectangle" && e.backgroundColor === "#fff3bf"));
});

test("bound text lives inside its container and points back to it", () => {
  const { elements } = buildScene();
  const byId = new Map(elements.map((e) => [e.id, e]));
  const bound = elements.filter((e) => e.type === "text" && e.containerId);
  assert.ok(bound.length > 0);
  for (const t of bound) {
    const c = byId.get(t.containerId);
    assert.ok(c, t.id);
    assert.ok((c.boundElements || []).some((x) => x.id === t.id && x.type === "text"), t.id);
  }
});

test("output is deterministic across builds", () => {
  assert.deepEqual(buildScene(), buildScene());
});
