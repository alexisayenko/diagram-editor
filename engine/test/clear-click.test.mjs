import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { geometryKit } from "../render/geometry.mjs";
import { METRICS } from "../render/metrics.mjs";

function load({ sel = null, net = null, pending } = {}) {
  const calls = [], listeners = {}, classes = new Set();
  const svg = { classList: { contains: (c) => classes.has(c) }, contains: (t) => t.inSvg };
  const ctx = { sel, net };
  const hooks = { pending };
  const doc = { addEventListener: (t, f) => { (listeners[t] ||= []).push(f); } };
  let mod;
  const src = readFileSync(new URL("../runtime/ui/clear-click.js", import.meta.url), "utf8");
  runInNewContext(src, { document: doc, InfraDiagram: { define: (n, d, f) => {
    mod = f({ ctx, services: hooks, svg }, { select: (k) => { calls.push(["select", k]); ctx.sel = k; } }, { setNet: (i) => { calls.push(["net", i]); ctx.net = i; } });
  } }, Math });
  const el = (o = {}) => ({ nodeType: 1, tagName: "DIV", id: "", inSvg: false, classList: { contains: () => false }, closest: () => null, ...o });
  return { mod, calls, ctx, listeners, classes, el };
}
const pt = (x, y, empty = true, button = 0) => ({ x, y, empty, button });

test("isEmptyTarget: page, canvas and bare panel containers are empty; interactive things are not", () => {
  const { mod, el } = load();
  assert.ok(mod.isEmptyTarget(el({ tagName: "BODY" })));
  assert.ok(mod.isEmptyTarget(el({ inSvg: true })));
  assert.ok(mod.isEmptyTarget(el({ id: "wl" })));
  assert.ok(mod.isEmptyTarget(el({ id: "pn" })));
  assert.ok(mod.isEmptyTarget(el({ classList: { contains: (c) => c === "cp" } })));
  assert.ok(!mod.isEmptyTarget(el({ inSvg: true, closest: () => ({}) })));
  assert.ok(!mod.isEmptyTarget(el({ id: "wl", closest: () => ({}) })));
  assert.ok(!mod.isEmptyTarget(el()), "plain panel text is not a container");
  assert.ok(!mod.isEmptyTarget(null));
});

test("isEmptyClick needs primary button, empty ends and under 4px movement", () => {
  const { mod } = load();
  assert.ok(mod.isEmptyClick(pt(10, 10), pt(12, 11), false));
  assert.ok(!mod.isEmptyClick(pt(10, 10), pt(10, 14), false), "4px drag/pan");
  assert.ok(!mod.isEmptyClick(pt(10, 10, false), pt(10, 10), false), "started on a node");
  assert.ok(!mod.isEmptyClick(pt(10, 10), pt(10, 10, false), false));
  assert.ok(!mod.isEmptyClick(pt(10, 10, true, 2), pt(10, 10), false), "right button");
  assert.ok(!mod.isEmptyClick(pt(10, 10), pt(10, 10), true), "drawing tool");
  assert.ok(!mod.isEmptyClick(null, pt(0, 0), false));
});

for (const [kind, key] of [["server", "n:a"], ["region", "c:r"], ["connection", "e:1"]]) {
  test(`clearSelection clears a selected ${kind}`, () => {
    const { mod, calls, ctx } = load({ sel: key });
    assert.ok(mod.clearSelection());
    assert.deepEqual(calls, [["select", null]]);
    assert.equal(ctx.sel, null);
  });
}

test("clearSelection clears a network filter, both together, and nothing when none", () => {
  let t = load({ net: 2 });
  t.mod.clearSelection();
  assert.deepEqual(t.calls, [["net", null]]);
  t = load({ sel: "n:a", net: 0 });
  t.mod.clearSelection();
  assert.deepEqual(t.calls, [["select", null], ["net", null]]);
  t = load();
  t.mod.clearSelection();
  assert.deepEqual(t.calls, []);
});

test("clearSelection skips while an editor has a pending edit", () => {
  const { mod, calls } = load({ sel: "n:a" });
  assert.equal(mod.clearSelection(() => true), false);
  assert.deepEqual(calls, []);
});

test("document listeners: click clears, a moved pointer or a node press does not, drawing does not", () => {
  const run = (downEv, upEv, setup) => {
    const t = load({ sel: "n:a", net: 1 });
    t.hooks = null;
    if (setup) setup(t);
    t.listeners.pointerdown[0]({ clientX: downEv.x, clientY: downEv.y, button: 0, target: downEv.target || t.el({ inSvg: true }) });
    t.listeners.click[0]({ clientX: upEv.x, clientY: upEv.y, button: 0, target: upEv.target || t.el({ inSvg: true }) });
    return t.calls;
  };
  assert.deepEqual(run({ x: 5, y: 5 }, { x: 6, y: 5 }), [["select", null], ["net", null]]);
  assert.deepEqual(run({ x: 5, y: 5 }, { x: 40, y: 5 }), [], "pan");
  const node = { closest: () => ({}), inSvg: true };
  assert.deepEqual(run({ x: 5, y: 5, target: loadNode(node) }, { x: 5, y: 5 }), [], "node drag ends on the canvas");
  assert.deepEqual(run({ x: 5, y: 5 }, { x: 5, y: 5 }, (t) => t.classes.add("draw-pencil")), []);
});

function loadNode(o) { return { nodeType: 1, tagName: "g", id: "", classList: { contains: () => false }, ...o }; }

const modelSrc = readFileSync(new URL("../runtime/canvas/model.js", import.meta.url), "utf8");
const legendSrc = readFileSync(new URL("../runtime/ui/legend.js", import.meta.url), "utf8");
const viewNode = (sys, meta) => new Function("D", "ctx", "geometry", "M", "return " + modelSrc.match(/function viewNode[\s\S]*?\n  }\n/)[0])({ meta: { nodes: { a: meta } } }, { sys }, geometryKit(), METRICS);
const card = () => ({ x: 0, y: 0, w: 100, h: 20 + 16 * 3 + 18, body: [[10, 18]], ip: [[10, 70]] });

test("system information off: OS and hardware rows leave the card, saved geometry is untouched", () => {
  const g = card(), meta = { nb: 1, ni: 1, hw: "4 cpu", os: 1 };
  const off = viewNode(false, meta)("a", g);
  assert.equal(off.h, g.h - 32);
  assert.deepEqual(off.ip, [[10, 38]]);
  assert.deepEqual(g, card());
  assert.equal(viewNode(true, meta)("a", g), g);
  assert.equal(viewNode(false, { nb: 1, ni: 1, hw: "", os: 0 })("a", g), g);
  assert.equal(viewNode(false, { nb: 1, ni: 1, hw: "", os: 1 })("a", g).h, g.h - 16);
});

test("the legend switch is Display System Information and keeps the stored 'os' key", () => {
  assert.match(legendSrc, /Display System Information/);
  assert.doesNotMatch(legendSrc, /Display OS version/);
  assert.match(legendSrc, /lsGet\("os"\) !== "0"/);
});
