import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, cpSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { drawKit } from "../render/draw-kit.mjs";
import { renderDiagram } from "../browser/render.mjs";
import { css, script } from "../page/assets.mjs";

const kit = drawKit();
const demo = readFileSync(new URL("../../examples/demo/demo.toml", import.meta.url), "utf8");
const assets = { cssSvg: css("svg"), cssPage: css("page"), js: script() };
const stroke = (id, points, width = 2) => ({ id, color: "#3b82f6", width, points });
const dataOf = (html) => JSON.parse(html.match(/id="layout-data">([\s\S]*?)<\/script>/)[1]);

test("decimate rounds to one decimal, drops near-duplicates and keeps the last point", () => {
  assert.deepEqual(kit.decimate([[0.04, 0.06], [0.3, 0.2], [0.5, 0.1], [10.26, 5.55], [10.3, 5.5]]), [[0, 0.1], [10.3, 5.5]]);
  assert.deepEqual(kit.decimate([[1, 1], [1, 1]]), [[1, 1]]);
  assert.deepEqual(kit.decimate([[1.23, 2.27]]), [[1.2, 2.3]]);
});

test("smoothPath: dot, line and quadratic curve with 1-decimal coordinates", () => {
  assert.equal(kit.smoothPath([]), "");
  assert.equal(kit.smoothPath([[1, 2]]), "M1 2l0 0");
  assert.equal(kit.smoothPath([[0, 0], [10, 5]]), "M0 0L10 5");
  assert.equal(kit.smoothPath([[0, 0], [10, 0], [10, 10], [20, 10]]), "M0 0L5 0Q10 0 10 5Q10 10 15 10L20 10");
  assert.ok(!/\d\.\d\d/.test(kit.smoothPath([[0.123, 0.456], [3.333, 4.444], [7.777, 1.111]])));
});

test("eraser hit-testing is stroke-level, width-aware and picks the topmost stroke", () => {
  const a = stroke("a", [[0, 0], [100, 0]], 2), b = stroke("b", [[50, -50], [50, 50]], 2), dot = stroke("dot", [[200, 200]], 6);
  assert.equal(kit.distToStroke(a.points, 50, 7), 7);
  assert.equal(kit.distToStroke(a.points, -3, 4), 5);
  assert.ok(kit.hits(a, 50, 1, 0));
  assert.ok(!kit.hits(a, 50, 3, 0));
  assert.ok(kit.hits(a, 50, 6, 5));
  assert.equal(kit.hitIndex([a, b], 50, 0, 2), 1);
  assert.equal(kit.hitIndex([a, b], 10, 0, 2), 0);
  assert.equal(kit.hitIndex([a, b], 10, 30, 2), -1);
  assert.equal(kit.hitIndex([dot], 202, 200, 0), 0);
  assert.equal(kit.hitIndex([dot], 210, 200, 0), -1);
});

test("history: undo, redo, a new action drops the redo branch", () => {
  const h = kit.history([]);
  assert.ok(!h.canUndo() && !h.canRedo());
  h.push(["a"]); h.push(["a", "b"]);
  assert.deepEqual(h.undo(), ["a"]);
  assert.deepEqual(h.undo(), []);
  assert.deepEqual(h.undo(), []);
  assert.ok(h.canRedo());
  assert.deepEqual(h.redo(), ["a"]);
  h.push(["a", "c"]);
  assert.ok(!h.canRedo());
  assert.deepEqual(h.redo(), ["a", "c"]);
  assert.deepEqual(h.undo(), ["a"]);
});

test("validate: a missing key means no drawings, bad entries are rejected", () => {
  assert.deepEqual(kit.validate(undefined), []);
  assert.deepEqual(kit.validate([]), []);
  assert.equal(kit.validate([{ ...stroke("d1", [[1, 2]]), color: "#ABCDEF" }])[0].color, "#abcdef");
  const bad = [{}, "x", [null], [stroke("a b", [[0, 0]])], [{ ...stroke("a", [[0, 0]]), color: "red" }], [{ ...stroke("a", [[0, 0]]), width: 0 }],
    [stroke("a", [])], [stroke("a", [[0, "1"]])], [stroke("a", [[0, 0]]), stroke("a", [[1, 1]])]];
  for (const b of bad) assert.throws(() => kit.validate(b), /drawing/i);
  assert.equal(kit.newId([stroke("d1", [[0, 0]]), stroke("d2", [[0, 0]])]), "d3");
});

test("layout round-trip: old layouts load, drawings survive page and TOML re-renders", () => {
  const first = renderDiagram(demo, "demo.toml", null, assets);
  assert.match(first.html, /<g id="dw"><\/g>/);
  const saved = { version: 1, diagramId: first.id, ...first.layout, extra: { keep: 1 } };
  assert.doesNotThrow(() => renderDiagram(demo, "demo.toml", saved, assets));
  const drawings = [stroke("d1", [[10.5, 20], [30, 40.2], [50, 45]]), { ...stroke("d2", [[5, 5]], 4), color: "#ef4444" }];
  const withDraw = renderDiagram(demo, "demo.toml", { ...saved, drawings }, assets);
  assert.equal((withDraw.html.match(/<path class="dwp" data-id="d/g) || []).length, 2);
  assert.match(withDraw.html, /data-id="d1" d="M10\.5 20L/);
  assert.deepEqual(dataOf(withDraw.html).drawings, drawings);
  const edited = demo.replace('id = "db01"', 'id = "db99"').replace(/from = "app01"\nto = "db01"/, 'from = "app01"\nto = "db99"');
  const after = renderDiagram(edited, "demo.toml", { ...saved, ...withDraw.layout, drawings }, assets);
  assert.deepEqual(dataOf(after.html).drawings, drawings);
  assert.throws(() => renderDiagram(demo, "demo.toml", { ...saved, drawings: [{ id: "x" }] }, assets), /Invalid saved drawing/);
});

test("Save and Export write drawings and keep unknown layout keys", () => {
  const app = readFileSync(new URL("../browser/app.js", import.meta.url), "utf8");
  assert.match(app, /\.\.\.active\.extra, \.\.\.layout, \.\.\.\(drawings\.length \|\| active\.hadDrawings \? \{ drawings \} : \{\}\)/);
  assert.match(app, /drawApi\(\)\?\.isDirty\(\)/);
  assert.match(app, /drawApi\(\)\.markSaved\(\)/);
  assert.match(app, /drawings: drawApi\(\)\.list\(\)/);
  assert.equal((app.match(/layoutText: JSON\.stringify/g) || []).length, 1);
  assert.match(app, /download\(names\.layout, p\.layoutText\)/);
  assert.match(app, /text: p\.layoutText/);
});

test("exports carry the strokes: SVG/PNG clone the live SVG, build writes them into layout.html and Excalidraw", () => {
  const exp = readFileSync(new URL("../runtime/ui/export-image.js", import.meta.url), "utf8");
  assert.match(exp, /svg\.cloneNode\(true\)/);
  assert.doesNotMatch(exp, /#dw|remove\(\);\s*\}\);\s*\[\]\.forEach\.call\(c\.querySelectorAll\("\.dwp"\)/);
  const dir = join(mkdtempSync(join(tmpdir(), "draw-")), "draw-test");
  cpSync(new URL("../../examples/demo", import.meta.url), dir, { recursive: true });
  const layout = JSON.parse(readFileSync(join(dir, "layout.json"), "utf8"));
  layout.drawings = [stroke("d1", [[100, 100], [140, 120.5], [180, 100]], 4)];
  writeFileSync(join(dir, "layout.json"), JSON.stringify(layout));
  execFileSync(process.execPath, [fileURLToPath(new URL("../build.mjs", import.meta.url)), dir], { stdio: "pipe" });
  const html = readFileSync(join(dir, "layout.html"), "utf8");
  assert.match(html, /<path class="dwp" data-id="d1" d="M100 100L120 110\.3Q140 120\.5/);
  const free = JSON.parse(readFileSync(join(dir, "draw-test.excalidraw"), "utf8")).elements.filter((e) => e.type === "freedraw");
  assert.equal(free.length, 1);
  assert.deepEqual([free[0].x, free[0].y, free[0].strokeColor, free[0].strokeWidth], [100, 100, "#3b82f6", 4]);
  assert.deepEqual(free[0].points, [[0, 0], [40, 20.5], [80, 0]]);
});
