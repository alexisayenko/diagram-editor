import test from "node:test";
import assert from "node:assert/strict";
import { dataEl } from "./dataset-stub.mjs";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { keys } from "./runtime-kits.mjs";

const regionAt = new Function("return " + readFileSync(new URL("../runtime/canvas/model.js", import.meta.url), "utf8").match(/function regionAt[\s\S]*?\n}\n/)[0])();

function harness({ move, cl = "a" } = {}) {
  const el = () => ({ ...dataEl(), listeners: {}, hidden: false, checked: false, textContent: "", classList: { toggle() {} }, addEventListener(t, f) { (this.listeners[t] ||= []).push(f); } });
  const svg = el(), nodes = {}, calls = [], rendered = [];
  svg.setPointerCapture = () => {};
  const layout = () => ({ nodes: { s1: { x: 10, y: 10 } }, clusters: { a: { x: 0, y: 0, w: 100, h: 100 }, b: { x: 200, y: 0, w: 100, h: 100 } }, edges: {} });
  const state = { on: true, st: layout() }, base = layout(), clone = (o) => JSON.parse(JSON.stringify(o)), fits = [];
  const model = { state, base, clone, regionAt, point: (e) => ({ x: e.x, y: e.y }), render: (s) => rendered.push(s),
    apply: (from, key, dx) => { const s = clone(from); s.clusters.a.w += dx; s.nodes.s1.x += dx; return s; } };
  const win = { InfraDiagramFileBacked: true }, host = { serverEditor: move === null ? undefined : { move: (id, to) => { calls.push([id, to]); return move ? move(id, to) : null; } } };
  const $ = (id) => (nodes[id] ||= el());
  let mod;
  runInNewContext(readFileSync(new URL("../runtime/canvas/edit-mode.js", import.meta.url), "utf8"), {
    window: win, location: { search: "" }, requestAnimationFrame: (f) => f(), setTimeout() {},
    InfraDiagram: { define: (n, d, f) => { mod = f({ core: { svg, els: [], $, D: { meta: { nodes: { s1: { cl } } } }, host, on() {}, lsGet() {}, lsSet() {}, lsDel() {} }, init: { init() {}, editChanged() {} }, model, zoomPan: { fit: () => fits.push(1) }, keys }); } },
  });
  const target = (key) => ({ closest: () => dataEl({ e: key }) });
  const fire = (t, ev) => (svg.listeners[t] || []).forEach((f) => f({ button: 0, pointerId: 1, type: t, preventDefault() {}, ...ev }));
  return { fire, target, calls, state, rendered, fits, mod };
}

test("dropping a server on another region moves it there and restores the old region's size", () => {
  const h = harness();
  h.fire("pointerdown", { target: h.target("n:s1"), x: 20, y: 20 });
  h.fire("pointermove", { x: 250, y: 20 });
  assert.equal(h.state.st.clusters.a.w, 330);
  h.fire("pointerup", { x: 250, y: 20 });
  assert.deepEqual(h.calls, [["s1", "b"]]);
  assert.equal(h.state.st.clusters.a.w, 100);
  assert.equal(h.fits.length, 0);
});

test("dropping outside every region clears the region; staying inside or moving a region does nothing", () => {
  const out = harness();
  out.fire("pointerdown", { target: out.target("n:s1"), x: 20, y: 20 });
  out.fire("pointerup", { x: 150, y: 150 });
  assert.deepEqual(out.calls, [["s1", null]]);
  const same = harness();
  same.fire("pointerdown", { target: same.target("n:s1"), x: 20, y: 20 });
  same.fire("pointerup", { x: 60, y: 60 });
  assert.deepEqual(same.calls, []);
  assert.equal(same.fits.length, 1);
  const region = harness();
  region.fire("pointerdown", { target: region.target("c:a"), x: 20, y: 20 });
  region.fire("pointerup", { x: 250, y: 20 });
  assert.deepEqual(region.calls, []);
  const standalone = harness({ cl: null });
  standalone.fire("pointerdown", { target: standalone.target("n:s1"), x: 20, y: 20 });
  standalone.fire("pointerup", { x: 500, y: 500 });
  assert.deepEqual(standalone.calls, []);
});

test("a cancelled drag, a missing bridge and a refused move leave the server where the drag started", () => {
  const cancel = harness();
  cancel.fire("pointerdown", { target: cancel.target("n:s1"), x: 20, y: 20 });
  cancel.fire("pointercancel", { x: 250, y: 20 });
  assert.deepEqual(cancel.calls, []);
  const none = harness({ move: null });
  none.fire("pointerdown", { target: none.target("n:s1"), x: 20, y: 20 });
  none.fire("pointerup", { x: 250, y: 20 });
  assert.equal(none.fits.length, 1);
  const refused = harness({ move: () => "Fix the open edit first: x" });
  refused.fire("pointerdown", { target: refused.target("n:s1"), x: 20, y: 20 });
  refused.fire("pointermove", { x: 250, y: 20 });
  refused.fire("pointerup", { x: 250, y: 20 });
  assert.equal(refused.state.st.nodes.s1.x, 10);
  assert.equal(refused.state.st.clusters.a.w, 100);
  assert.equal(refused.fits.length, 1);
});
