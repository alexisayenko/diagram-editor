import test from "node:test";
import assert from "node:assert/strict";
import { dataEl } from "./dataset-stub.mjs";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { geometryKit } from "../render/geometry.mjs";
import { css, script } from "../page/assets.mjs";
import { keys } from "./runtime-kits.mjs";

const kit = geometryKit();
const meta = { clusters: { a: { tl: 1 } }, nodes: { s1: { tl: 2, cl: "a" }, s2: { tl: 2, cl: "a" }, s3: { tl: 2, cl: null } } };
const server = (x, y) => ({ x, y, w: 80, h: 40, title: [x + 10, y + 14], body: [], ip: [] });
const layout = () => ({ nodes: { s1: server(100, 100), s2: server(200, 130), s3: server(0, 0) }, clusters: { a: { x: 50, y: 40, w: 400, h: 300, title: [250, 56] } }, edges: {} });
const rect = (s) => [s.clusters.a.x, s.clusters.a.y, s.clusters.a.w, s.clusters.a.h];

test("regionBounds is the padded box of the region's own visible servers, null when empty", () => {
  const s = layout(), b = kit.regionBounds(s, meta, "a");
  assert.deepEqual([b.x0, b.x1], [84, 296]);
  assert.ok(b.y0 < 100 - 20 && b.y1 > 170);
  s.nodes.s1.hidden = s.nodes.s2.hidden = true;
  assert.equal(kit.regionBounds(s, meta, "a"), null);
});

test("dragging a side or corner resizes the region and keeps the other sides", () => {
  const s = layout();
  kit.resizeRegion(s, meta, "a", "e", 100, 999);
  assert.deepEqual(rect(s), [50, 40, 500, 300]);
  kit.resizeRegion(s, meta, "a", "se", 10, 20);
  assert.deepEqual(rect(s), [50, 40, 510, 320]);
  kit.resizeRegion(s, meta, "a", "nw", -20, -10);
  assert.deepEqual(rect(s), [30, 30, 530, 330]);
  assert.deepEqual(s.nodes.s1, layout().nodes.s1);
});

test("a region cannot shrink past its servers", () => {
  const s = layout(), b = kit.regionBounds(s, meta, "a");
  kit.resizeRegion(s, meta, "a", "nw", 1000, 1000);
  assert.deepEqual([s.clusters.a.x, s.clusters.a.y], [b.x0, b.y0]);
  assert.equal(s.clusters.a.x + s.clusters.a.w, 450);
  kit.resizeRegion(s, meta, "a", "se", -1000, -1000);
  assert.deepEqual([s.clusters.a.x + s.clusters.a.w, s.clusters.a.y + s.clusters.a.h], [b.x1, b.y1]);
});

test("an empty region shrinks to the absolute minimum and no further", () => {
  const s = layout();
  s.nodes.s1.hidden = s.nodes.s2.hidden = true;
  kit.resizeRegion(s, meta, "a", "se", -1000, -1000);
  assert.deepEqual([s.clusters.a.w, s.clusters.a.h], [100, 60]);
  kit.resizeRegion(s, meta, "a", "nw", 1000, 1000);
  assert.deepEqual([s.clusters.a.x, s.clusters.a.w, s.clusters.a.h], [50, 100, 60]);
});

test("the title stays centred, or follows the left and top sides when it was moved", () => {
  const s = layout();
  kit.resizeRegion(s, meta, "a", "e", 100, 0);
  assert.equal(s.clusters.a.title[0], 300);
  const t = layout();
  t.clusters.a.title = [70, 56];
  kit.resizeRegion(t, meta, "a", "nw", -10, -10);
  assert.deepEqual(t.clusters.a.title, [60, 46]);
  kit.resizeRegion(t, meta, "a", "e", 50, 0);
  assert.deepEqual(t.clusters.a.title, [60, 46]);
});

test("an enlarged region keeps its size when a server auto-grow starts from it, and does not shrink", () => {
  const s = layout();
  kit.resizeRegion(s, meta, "a", "se", 200, 100);
  const big = { ...s.clusters.a, title: s.clusters.a.title.slice() };
  s.nodes.s1.x += 20;
  kit.fitRegion(s, meta, "a", big);
  assert.deepEqual(rect(s), [50, 40, 600, 400]);
  s.nodes.s1.x = 900;
  kit.fitRegion(s, meta, "a", big);
  assert.ok(s.clusters.a.x + s.clusters.a.w >= 900 + 80);
});

test("the page ships the resize kit and styles", () => {
  assert.match(script(), /resizeRegion: kit\.resizeRegion/);
  assert.match(css("page"), /\.rh-nw,svg\.edit \.rh-se\{cursor:nwse-resize\}/);
});

function harness() {
  const el = () => ({ ...dataEl(), listeners: {}, hidden: false, checked: false, textContent: "", classList: { toggle() {} }, addEventListener(t, f) { (this.listeners[t] ||= []).push(f); } });
  const svg = el(), nodes = {}, calls = [], rendered = [], apis = [];
  svg.setPointerCapture = () => {};
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const state = { on: true, st: layout() }, base = layout(), fits = [];
  const model = { state, base, clone, point: (e) => ({ x: e.x, y: e.y }), render: (s) => rendered.push(s), regionAt: () => null,
    resize: (from, id, side, dx, dy) => { apis.push([id, side, dx, dy]); const s = clone(from); s.clusters[id].w += dx; return s; },
    apply: () => { throw new Error("moved"); } };
  const $ = (id) => (nodes[id] ||= el());
  runInNewContext(readFileSync(new URL("../runtime/canvas/edit-mode.js", import.meta.url), "utf8"), {
    window: { InfraDiagramFileBacked: true, InfraDiagram: {} }, location: { search: "" }, requestAnimationFrame: (f) => f(), setTimeout() {},
    InfraDiagram: { define: (n, d, f) => f({ svg, els: [], $, D: { meta: { nodes: {} } }, host: {}, lsGet() {}, lsSet() {}, lsDel() {} }, { init() {}, editChanged() {} }, model, { fit: () => fits.push(1) }, keys) },
  });
  const handle = (id, side) => ({ closest: (q) => (q === "[data-rc]" ? dataEl({ rc: id, rs: side }) : null) });
  const fire = (t, ev) => (svg.listeners[t] || []).forEach((f) => f({ button: 0, pointerId: 1, type: t, preventDefault() {}, ...ev }));
  return { fire, handle, state, apis, rendered, fits, $ };
}

test("dragging a handle resizes the region, never moves it or a server, and refits on release", () => {
  const h = harness();
  h.fire("pointerdown", { target: h.handle("a", "e"), x: 450, y: 100 });
  h.fire("pointermove", { x: 490, y: 130 });
  assert.deepEqual(h.apis, [["a", "e", 40, 30]]);
  assert.equal(h.state.st.clusters.a.w, 440);
  assert.equal(h.state.st.clusters.a.x, 50);
  h.fire("pointerup", { x: 490, y: 130 });
  assert.equal(h.fits.length, 1);
  h.fire("pointermove", { x: 600, y: 130 });
  assert.equal(h.apis.length, 1);
});

test("with Snap on, the dragged edge lands on the grid; Shift disables it", () => {
  const h = harness();
  h.$("ts").checked = true;
  h.fire("pointerdown", { target: h.handle("a", "se"), x: 450, y: 340 });
  h.fire("pointermove", { x: 452, y: 342 });
  assert.deepEqual(h.apis.at(-1), ["a", "se", 0, 0]);
  h.fire("pointermove", { x: 458, y: 347 });
  assert.deepEqual(h.apis.at(-1), ["a", "se", 10, 5]);
  h.fire("pointermove", { x: 458, y: 347, shiftKey: true });
  assert.deepEqual(h.apis.at(-1), ["a", "se", 8, 7]);
});
