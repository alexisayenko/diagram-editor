import test from "node:test";
import assert from "node:assert/strict";
import { makePage, loadModel, loadZoomPan } from "./cov-canvas.mjs";

function setup() {
  const page = makePage(), model = loadModel(page), zp = loadZoomPan(page, model);
  const vb = () => page.svg.attrs.viewBox.split(" ").map(Number);
  const key = (k, ev = {}) => page.doc.fire("keydown", { key: k, target: { tagName: "BODY" }, ...ev });
  const free = { closest: () => null };
  const wheel = (ev) => page.svg.fire("wheel", { target: free, clientX: 500, clientY: 400, deltaY: -100, deltaMode: 0, ...ev });
  const down = (ev = {}) => page.svg.fire("pointerdown", { target: free, button: 0, pointerId: 1, clientX: 100, clientY: 100, ...ev });
  const clickAll = () => { let stopped = 0; page.g.winListeners.click.forEach((f) => f({ stopPropagation() { stopped++; } })); return stopped; };
  return { page, model, zp, vb, key, wheel, down, clickAll, fitted: () => { zp.fit(); return vb(); } };
}

test("fit measures the drawing, pads it by 20 and keeps the view centred", () => {
  const { page, zp, vb } = setup();
  page.svg.bbox = { x: 10.5, y: 5.2, width: 300, height: 200 };
  zp.fit();
  assert.deepEqual(vb(), [-10, -15, 341, 241]);
  assert.equal(page.svg.attrs["data-fit"], "-10 -15 341 241");
});

test("fit does nothing for an unmeasurable or empty drawing", () => {
  const { page, zp, vb } = setup();
  page.svg.bbox = null;
  zp.fit();
  assert.deepEqual(vb(), [0, 0, 1000, 800]);
  page.svg.bbox = { x: 0, y: 0, width: 0, height: 50 };
  zp.fit();
  assert.deepEqual(vb(), [0, 0, 1000, 800]);
  assert.equal(page.svg.attrs["data-fit"], undefined);
});

test("zoom buttons scale the view around its centre, and zooming back lands exactly on 1", () => {
  const { page, vb } = setup();
  page.core.$("zi").click();
  assert.deepEqual(vb(), [100, 80, 800, 640]);
  assert.ok(page.svg.classes.has("zoomed"));
  page.core.$("zo").click();
  assert.deepEqual(vb(), [0, 0, 1000, 800]);
  assert.ok(!page.svg.classes.has("zoomed"));
  page.core.$("zo").click();
  assert.equal(vb()[2], 1250);
  page.core.$("zf").click();
  assert.deepEqual(vb(), [0, 0, 1000, 800]);
});

test("zoom is limited to 0.25x..8x", () => {
  const { page, vb } = setup();
  for (let i = 0; i < 30; i++) page.core.$("zi").click();
  assert.equal(vb()[2], 125);
  for (let i = 0; i < 60; i++) page.core.$("zo").click();
  assert.equal(vb()[2], 4000);
});

test("keyboard: + = - _ and 0 zoom in, out and back to fit; modifiers and form fields are left alone", () => {
  const { vb, key } = setup();
  assert.equal(key("+").defaultPrevented, true);
  assert.equal(vb()[2], 800);
  key("=");
  assert.equal(vb()[2], 640);
  key("-");
  key("_");
  assert.equal(vb()[2], 1000);
  key("+");
  key("0");
  assert.equal(vb()[2], 1000);
  for (const ev of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { target: { tagName: "INPUT" } }, { target: { tagName: "TEXTAREA" } }, { target: { tagName: "SELECT" } }, { target: { isContentEditable: true } }]) {
    const e = key("+", ev);
    assert.equal(e.defaultPrevented, false, JSON.stringify(ev));
  }
  assert.equal(vb()[2], 1000);
  assert.equal(key("x").defaultPrevented, false);
  assert.equal(key("+", { target: undefined }).defaultPrevented, true);
});

test("wheel zooms about the cursor and keeps the point under it fixed", () => {
  const { wheel, vb, fitted } = setup();
  const [fx, fy, fw, fh] = fitted();
  const e = wheel({ deltaY: -100, clientX: 200, clientY: 100 });
  assert.equal(e.defaultPrevented, true);
  const [x, y, w, h] = vb(), z = Math.exp(0.2);
  assert.ok(Math.abs(w - fw / z) < 0.02);
  assert.ok(Math.abs(h - fh / z) < 0.02);
  assert.ok(Math.abs((200 - x) / w - (200 - fx) / fw) < 0.001);
  assert.ok(Math.abs((100 - y) / h - (100 - fy) / fh) < 0.001);
});

test("wheel: line and page deltas are scaled, huge deltas are capped, and toolbars keep their own scrolling", () => {
  const a = setup(), b = setup(), c = setup(), d = setup();
  a.wheel({ deltaY: -10, deltaMode: 1 });
  b.wheel({ deltaY: -160, deltaMode: 0 });
  assert.equal(a.vb()[2], b.vb()[2]);
  c.wheel({ deltaY: -1e6 });
  d.wheel({ deltaY: -300 });
  assert.equal(c.vb()[2], d.vb()[2]);
  const page = setup();
  page.wheel({ deltaY: -1, deltaMode: 2 });
  assert.ok(page.vb()[2] < 1000);
  const guarded = setup(), e = guarded.wheel({ target: { closest: (q) => (q === ".cp,#rc,#pn,#ta" ? {} : null) } });
  assert.equal(e.defaultPrevented, false);
  assert.equal(guarded.vb()[2], 1000);
  const plain = setup(), e2 = plain.wheel({ target: {} });
  assert.equal(e2.defaultPrevented, true);
});

test("dragging pans the view only after moving more than 3px, and a click after a pan is swallowed once", () => {
  const { page, down, vb, clickAll, fitted } = setup();
  const [fx, fy, fw, fh] = fitted();
  down();
  assert.ok(page.svg.classes.has("panning"));
  assert.deepEqual(page.svg.captured, [1]);
  page.svg.fire("pointermove", { pointerId: 1, clientX: 102, clientY: 101 });
  assert.deepEqual(vb(), [fx, fy, fw, fh]);
  assert.equal(clickAll(), 0);
  page.svg.fire("pointermove", { pointerId: 1, clientX: 140, clientY: 130 });
  assert.deepEqual(vb(), [fx - 40, fy - 30, fw, fh]);
  page.svg.fire("pointermove", { pointerId: 2, clientX: 300, clientY: 300 });
  assert.deepEqual(vb(), [fx - 40, fy - 30, fw, fh]);
  page.svg.fire("pointerup", { pointerId: 2 });
  assert.ok(page.svg.classes.has("panning"));
  page.svg.fire("pointerup", { pointerId: 1 });
  assert.ok(!page.svg.classes.has("panning"));
  assert.equal(clickAll(), 1);
  assert.equal(clickAll(), 0);
  page.svg.fire("pointermove", { pointerId: 1, clientX: 500, clientY: 500 });
  assert.deepEqual(vb(), [fx - 40, fy - 30, fw, fh]);
});

test("pan distance follows the screen scale; pointercancel ends the pan; a missing matrix counts as 1", () => {
  const { page, down, vb, fitted } = setup();
  fitted();
  page.svg.ctm = { a: 2, e: 0, f: 0 };
  down();
  page.svg.fire("pointermove", { pointerId: 1, clientX: 140, clientY: 100 });
  assert.equal(vb()[0], -40);
  page.svg.fire("pointercancel", { pointerId: 1 });
  assert.ok(!page.svg.classes.has("panning"));
  page.svg.ctm = null;
  down();
  page.svg.fire("pointermove", { pointerId: 1, clientX: 110, clientY: 100 });
  assert.equal(vb()[0], -50);
});

test("panning is not started in edit mode, with other buttons, or on a server", () => {
  const { page, model, down } = setup();
  model.state.on = true;
  down();
  assert.ok(!page.svg.classes.has("panning"));
  model.state.on = false;
  down({ button: 2 });
  assert.ok(!page.svg.classes.has("panning"));
  down({ target: { closest: (q) => (q === "[data-ent]" ? {} : null) } });
  assert.ok(!page.svg.classes.has("panning"));
  down({ target: {} });
  assert.ok(page.svg.classes.has("panning"));
});

test("a failing pointer capture does not stop the pan", () => {
  const { page, down } = setup();
  page.svg.setPointerCapture = () => { throw new Error("no capture"); };
  down();
  assert.ok(page.svg.classes.has("panning"));
});

test("a zoomed view cannot be panned out of the drawing", () => {
  const { page, down, vb, fitted } = setup();
  fitted();
  page.core.$("zi").click();
  down();
  page.svg.fire("pointermove", { pointerId: 1, clientX: 100 + 1e6, clientY: 100 });
  const after = vb();
  assert.ok(after[0] > -2000 && after[0] < 0);
  down({ clientX: 0 });
  page.svg.fire("pointermove", { pointerId: 1, clientX: -1e6, clientY: 100 });
  assert.ok(vb()[0] < 1000 && vb()[0] > 0);
});

test("with an unmeasurable canvas the free view is not clamped", () => {
  const { page, down, vb, fitted } = setup();
  fitted();
  page.svg.rect = { width: 0, height: 0 };
  down();
  page.svg.fire("pointermove", { pointerId: 1, clientX: 100 + 5000, clientY: 100 });
  assert.equal(vb()[0], -5020);
});
