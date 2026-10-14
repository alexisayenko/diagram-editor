import test from "node:test";
import assert from "node:assert/strict";
import { loadUi, fixture } from "./cov-ui-env.mjs";

const state = () => ({
  nodes: {
    a: { x: 10, y: 20, w: 120, h: 80, ip: [[20, 90]], body: [[20, 50]], title: [20, 36] },
    b: { x: 200, y: 20, w: 120, h: 60, ip: [[210, 70]], body: [], title: [210, 36] },
  },
  clusters: { r1: { x: 5, y: 6, w: 400, h: 300 } },
});

function app({ edit = false, getState = state } = {}) {
  const f = fixture();
  const html = (f.html + '<span id="tx"></span><span id="tm"></span><div id="dpo"></div>').replace('<rect id="lp1"></rect>', '<rect id="lp1"></rect><text id="rt" class="ct" data-ent="c:r1">Region 1</text>');
  const D = { ...f.D, idx: { ...f.D.idx, clusters: { r1: [0, 11, 8] } } };
  const t = loadUi(["ui/init"], { D, html });
  t.init = t.modules["ui/init"];
  t.core = t.modules["ui/core"];
  t.init.init({ getState, isEdit: () => edit, fit() {} });
  t.server = t.core.els[1];
  t.region = t.core.els[11];
  t.key = (target, key, props = {}) => t.fire(target, "keydown", { key, ...props });
  t.ring = () => t.core.svg.querySelector("#fr");
  return t;
}

test("servers and regions are keyboard focusable buttons with a name; nothing else is", () => {
  const t = app();
  for (const [el, label] of [[t.server, "Server Service A"], [t.core.els[6], "Server Service B"], [t.region, "Region Region 1"]]) {
    assert.equal(el.getAttribute("tabindex"), "0");
    assert.equal(el.getAttribute("role"), "button");
    assert.equal(el.getAttribute("aria-pressed"), "false");
    assert.equal(el.getAttribute("aria-label"), label);
  }
  assert.equal(t.core.svg.querySelectorAll("[tabindex]").length, 3);
});

test("Enter and Space on a focused server or region select it and set aria-pressed; Escape clears", () => {
  const t = app();
  t.key(t.server, "Enter");
  assert.equal(t.core.ctx.sel, "n:a");
  assert.equal(t.server.getAttribute("aria-pressed"), "true");
  assert.equal(t.core.els[6].getAttribute("aria-pressed"), "false");
  assert.ok(t.$("pn").querySelector("h1"), "the details panel opens");
  t.key(t.doc, "Escape");
  assert.equal(t.core.ctx.sel, null);
  assert.equal(t.server.getAttribute("aria-pressed"), "false");
  t.key(t.region, " ");
  assert.equal(t.core.ctx.sel, "c:r1");
  assert.equal(t.region.getAttribute("aria-pressed"), "true");
});

test("keyboard selection prevents the default action and ignores other keys", () => {
  const t = app();
  const ev = { prevented: false };
  t.key(t.server, "a");
  t.key(t.server, "ArrowRight");
  assert.equal(t.core.ctx.sel, null);
  t.fire(t.server, "keydown", { key: "Enter", preventDefault() { ev.prevented = true; } });
  assert.equal(ev.prevented, true);
  assert.equal(t.core.ctx.sel, "n:a");
});

test("keyboard selection also works in edit mode, where clicks do not select", () => {
  const t = app({ edit: true });
  t.fire(t.server, "click", { clientX: 1, clientY: 1 });
  assert.equal(t.core.ctx.sel, null);
  t.key(t.server, "Enter");
  assert.equal(t.core.ctx.sel, "n:a");
});

test("the network buttons keep their Enter and Space handling outside edit mode", () => {
  const t = app();
  const nb = t.core.svg.querySelector(".nwb");
  t.key(nb, "Enter");
  assert.equal(t.core.ctx.net, 0);
  const edit = app({ edit: true }), enb = edit.core.svg.querySelector(".nwb");
  edit.key(enb, "Enter");
  assert.equal(edit.core.ctx.net, null);
});

test("keyboard focus draws a focus ring around the server or region; leaving removes it", () => {
  const t = app();
  t.server.focus();
  let ring = t.ring();
  assert.ok(ring, "ring on keyboard focus");
  assert.deepEqual(["x", "y", "width", "height"].map((k) => ring.getAttribute(k)), ["6", "16", "128", "88"]);
  assert.equal(ring.getAttribute("pointer-events"), "none");
  t.region.focus();
  ring = t.ring();
  assert.deepEqual(["x", "y", "width", "height"].map((k) => ring.getAttribute(k)), ["1", "2", "408", "308"]);
  assert.equal(t.core.svg.querySelectorAll("#fr").length, 1, "one ring at a time");
  t.region.blur();
  assert.equal(t.ring(), null);
});

test("pointer focus shows no ring, and focus on a non-entity element shows none either", () => {
  const t = app();
  t.server.keyboardFocus = false;
  t.server.focus();
  assert.equal(t.ring(), null);
  t.$("te")?.focus();
  const other = t.core.svg.querySelector(".nwb");
  other.focus();
  assert.equal(t.ring(), null);
});

test("the ring follows the node when the canvas renders and uses the view of the node", () => {
  let s = state();
  const t = app({ getState: () => s });
  t.core.provide("viewNode", (id, g) => ({ ...g, h: g.h - 20 }));
  t.server.focus();
  assert.equal(t.ring().getAttribute("height"), "68");
  s = { ...s, nodes: { ...s.nodes, a: { ...s.nodes.a, x: 100 } } };
  t.core.emit("render");
  assert.equal(t.ring().getAttribute("x"), "96");
  t.server.blur();
  t.core.emit("render");
  assert.equal(t.ring(), null);
});

test("a ring for something that no longer exists is dropped", () => {
  let s = state();
  const t = app({ getState: () => s });
  t.server.focus();
  s = { nodes: {}, clusters: {} };
  t.core.emit("render");
  assert.equal(t.ring(), null);
});

test("toolbar-like controls inside the frame get roles and names", () => {
  const t = app();
  assert.equal(t.$("ta").getAttribute("role"), "toolbar");
  assert.equal(t.$("ta").getAttribute("aria-label"), "Diagram tools");
  assert.equal(t.$("tx").getAttribute("role"), "group");
  assert.equal(t.$("tx").getAttribute("aria-label"), "Layout editing");
  assert.equal(t.$("tm").getAttribute("role"), "status");
  assert.equal(t.$("tm").getAttribute("aria-live"), "polite");
  assert.equal(t.$("dpo").getAttribute("aria-label"), "Pen options");
  assert.equal(t.core.svg.getAttribute("role"), "group");
  assert.match(t.core.svg.getAttribute("aria-label"), /^Diagram\./);
});

test("the fake dialog follows the native contract: showModal opens, close closes and fires close", () => {
  const t = app();
  const d = t.doc.createElement("dialog"), seen = [];
  d.addEventListener("close", () => seen.push("close"));
  t.doc.body.appendChild(d);
  t.$("ta").focus();
  d.showModal();
  assert.equal(d.open, true);
  assert.equal(d.modal, true);
  assert.equal(d.previousFocus, t.$("ta"));
  assert.throws(() => d.showModal(), /already open/);
  assert.throws(() => t.doc.createElement("div").showModal(), /needs a dialog/);
  d.close("ok");
  assert.deepEqual([d.open, d.returnValue, seen], [false, "ok", ["close"]]);
  d.close();
  assert.deepEqual(seen, ["close"], "closing twice fires once");
});
