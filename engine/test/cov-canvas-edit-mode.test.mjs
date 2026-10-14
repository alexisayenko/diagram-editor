import test from "node:test";
import assert from "node:assert/strict";
import { makePage, loadModel, loadEdit } from "./cov-canvas.mjs";
import { plain } from "./cov-dom.mjs";

function setup({ fileBacked = false, search = "", store, bridge } = {}) {
  const page = makePage();
  page.g.InfraDiagramFileBacked = fileBacked;
  page.g.location.search = search;
  page.g.Blob = class { constructor(parts, opts) { this.parts = parts; this.opts = opts; } };
  page.g.JSON = JSON;
  if (store) for (const [k, v] of store) page.store.set(k, v);
  if (bridge) page.core.host.serverEditor = bridge;
  const model = loadModel(page), fits = [];
  const { mod, init } = loadEdit(page, model, { fit: () => fits.push(1) });
  const $ = page.core.$;
  const closestKey = (key) => ({ closest: (q) => (q === "[data-e]" ? { getAttribute: () => key } : null) });
  const closestHandle = (id, side) => ({ closest: (q) => (q === "[data-rc]" ? { getAttribute: (k) => (k === "data-rc" ? id : side) } : null) });
  const fire = (t, ev = {}) => page.svg.fire(t, { button: 0, pointerId: 1, clientX: 0, clientY: 0, ...ev });
  const frame = () => page.g.frames.splice(0).forEach((f) => f());
  const draftKey = () => [...page.store.keys()].find((k) => k.startsWith("layout-draft:"));
  const say = () => $("tm").textContent;
  return { page, model, mod, init, fits, $, closestKey, closestHandle, fire, frame, draftKey, say };
}

test("registers its controls and hands the page init the current state accessors", () => {
  const h = setup();
  assert.equal(typeof h.init.opts.getState, "function");
  assert.equal(h.init.opts.isEdit(), false);
  assert.equal(h.init.opts.getState(), h.model.base);
  h.model.state.on = true;
  assert.equal(h.init.opts.getState(), h.model.state.st);
  assert.equal(h.init.opts.isEdit(), true);
  assert.equal(typeof h.init.opts.fit, "function");
  assert.deepEqual(Object.keys(h.mod).sort(), ["commit", "currentLayout", "isDirty"]);
});

test("the Edit button turns edit mode on: flags, element marks, fresh draft state, render and fit", () => {
  const h = setup();
  h.$("te").click();
  assert.equal(h.model.state.on, true);
  assert.equal(h.$("ta").attrs["data-on"], "1");
  assert.equal(h.$("te").attrs["aria-pressed"], "true");
  assert.equal(h.$("tx").hidden, false);
  assert.ok(h.page.svg.classes.has("edit"));
  assert.equal(h.init.flag, true);
  assert.equal(h.page.els[0].attrs["data-e"], "c:web");
  assert.equal(h.page.els[h.page.D.idx.nodes.db01.r].attrs["data-e"], "n:db01");
  assert.deepEqual(h.model.state.st, h.model.base);
  assert.notEqual(h.model.state.st, h.model.base);
  assert.equal(h.page.skins.synced, h.model.state.st);
  assert.equal(h.fits.length, 1);
});

test("leaving edit mode clears the marks and renders the saved layout again", () => {
  const h = setup();
  h.$("te").click();
  h.$("te").click();
  assert.equal(h.model.state.on, false);
  assert.equal(h.$("ta").attrs["data-on"], "0");
  assert.equal(h.$("te").attrs["aria-pressed"], "false");
  assert.equal(h.$("tx").hidden, true);
  assert.ok(!h.page.svg.classes.has("edit"));
  assert.equal(h.page.els[0].attrs["data-e"], undefined);
  assert.equal(h.init.flag, false);
  assert.equal(h.page.skins.synced, h.model.base);
});

test("a debug query string opens the page already in edit mode", () => {
  assert.equal(setup({ search: "?debug" }).model.state.on, true);
  assert.equal(setup({ search: "?a=1&debug=1" }).model.state.on, true);
  assert.equal(setup({ search: "?nodebug" }).model.state.on, false);
});

test("pointer drag moves a server on the grid and the move is shown once per frame", () => {
  const h = setup();
  h.$("te").click();
  h.$("ts").checked = true;
  const start = h.model.base.nodes.db01;
  h.fire("pointerdown", { target: h.closestKey("n:db01"), clientX: 100, clientY: 100 });
  assert.deepEqual(h.page.svg.captured, [1]);
  h.fire("pointermove", { clientX: 113, clientY: 94 });
  h.fire("pointermove", { clientX: 113, clientY: 94 });
  assert.equal(h.page.g.frames.length, 1);
  const s = h.model.state.st.nodes.db01;
  assert.equal((s.x) % 5, 0);
  assert.equal((s.y) % 5, 0);
  assert.ok(Math.abs(s.x - (start.x + 13)) <= 2.5 && Math.abs(s.y - (start.y - 6)) <= 2.5);
  h.frame();
  assert.equal(h.page.els[h.page.D.idx.nodes.db01.r].attrs.x, String(s.x));
  h.fire("pointerup", { clientX: 113, clientY: 94 });
  assert.equal(h.fits.length, 2);
  assert.equal(h.mod.isDirty(), true);
});

test("without Snap, or with Shift held, the drag follows the pointer exactly", () => {
  const h = setup();
  h.$("te").click();
  const x0 = h.model.base.nodes.db01.x;
  h.fire("pointerdown", { target: h.closestKey("n:db01"), clientX: 0, clientY: 0 });
  h.fire("pointermove", { clientX: 13, clientY: 7 });
  assert.equal(h.model.state.st.nodes.db01.x, x0 + 13);
  h.$("ts").checked = true;
  h.fire("pointermove", { clientX: 13, clientY: 7, shiftKey: true });
  assert.equal(h.model.state.st.nodes.db01.x, x0 + 13);
  h.fire("pointerup", {});
});

test("dragging a region moves its servers with it", () => {
  const h = setup();
  h.$("te").click();
  const b = h.model.base;
  h.fire("pointerdown", { target: h.closestKey("c:db"), clientX: 0, clientY: 0 });
  h.fire("pointermove", { clientX: 25, clientY: 10 });
  const s = h.model.state.st;
  assert.equal(s.clusters.db.x, b.clusters.db.x + 25);
  assert.equal(s.nodes.db01.y, b.nodes.db01.y + 10);
  h.fire("pointerup", {});
});

test("dragging a region handle resizes it, snapping the moving edges to the grid", () => {
  const h = setup();
  h.$("te").click();
  h.$("ts").checked = true;
  const b = h.model.base.clusters.web;
  h.fire("pointerdown", { target: h.closestHandle("web", "se"), clientX: 0, clientY: 0 });
  h.fire("pointermove", { clientX: 33, clientY: 27 });
  const s = h.model.state.st.clusters.web;
  assert.equal((s.x + s.w) % 5, 0);
  assert.equal((s.y + s.h) % 5, 0);
  assert.equal(s.x, b.x);
  h.fire("pointerup", {});
  h.fire("pointerdown", { target: h.closestHandle("web", "nw"), clientX: 0, clientY: 0 });
  h.fire("pointermove", { clientX: -13, clientY: -12 });
  const n = h.model.state.st.clusters.web;
  assert.equal(n.x % 5, 0);
  assert.equal(n.y % 5, 0);
  h.fire("pointerup", {});
  h.fire("pointerdown", { target: h.closestHandle("web", "se"), clientX: 0, clientY: 0 });
  h.fire("pointermove", { clientX: 3, clientY: 3, shiftKey: true });
  assert.equal(h.model.state.st.clusters.web.w, n.w + 3);
  h.fire("pointerup", {});
});

test("pointer events are ignored outside edit mode, for other buttons, off draggable things and for other pointers", () => {
  const h = setup();
  h.fire("pointerdown", { target: h.closestKey("n:db01") });
  h.fire("pointermove", { clientX: 50, clientY: 50 });
  assert.equal(h.page.g.frames.length, 0);
  h.$("te").click();
  const e = h.fire("pointerdown", { target: h.closestKey("n:db01"), button: 2 });
  assert.equal(e.defaultPrevented, false);
  const none = h.fire("pointerdown", { target: { closest: () => null } });
  assert.equal(none.defaultPrevented, false);
  const bare = h.fire("pointerdown", { target: {} });
  assert.equal(bare.defaultPrevented, false);
  h.fire("pointerdown", { target: h.closestKey("n:db01"), clientX: 0, clientY: 0 });
  h.fire("pointermove", { pointerId: 7, clientX: 50, clientY: 50 });
  assert.equal(h.page.g.frames.length, 0);
  h.fire("pointerup", { pointerId: 7 });
  assert.equal(h.fits.length, 1);
  h.fire("pointerup", {});
  assert.equal(h.fits.length, 2);
  h.fire("pointerup", {});
  assert.equal(h.fits.length, 2);
});

test("a failing pointer capture does not break the drag", () => {
  const h = setup();
  h.page.svg.setPointerCapture = () => { throw new Error("x"); };
  h.$("te").click();
  h.fire("pointerdown", { target: h.closestKey("n:db01"), clientX: 0, clientY: 0 });
  h.fire("pointermove", { clientX: 10, clientY: 0 });
  assert.equal(h.model.state.st.nodes.db01.x, h.model.base.nodes.db01.x + 10);
  h.fire("pointerup", {});
});

test("a drag stores a draft in the browser, and a later page load in the same browser resumes it", () => {
  const h = setup();
  h.$("te").click();
  assert.equal(h.draftKey(), undefined);
  h.fire("pointerdown", { target: h.closestKey("n:db01"), clientX: 0, clientY: 0 });
  h.fire("pointermove", { clientX: 40, clientY: 0 });
  h.fire("pointerup", {});
  const key = h.draftKey();
  assert.match(key, /^layout-draft:/);
  const again = setup({ store: new Map([[key, h.page.store.get(key)]]) });
  again.$("te").click();
  assert.equal(again.model.state.st.nodes.db01.x, h.model.state.st.nodes.db01.x);
  assert.equal(again.mod.isDirty(), true);
});

test("an unusable stored draft is ignored", () => {
  const h = setup();
  h.$("te").click();
  h.fire("pointerdown", { target: h.closestKey("n:db01"), clientX: 0, clientY: 0 });
  h.fire("pointerup", {});
  const key = h.draftKey();
  for (const junk of ["not json", "{}", JSON.stringify({ nodes: {}, clusters: {} }), "null"]) {
    const again = setup({ store: new Map([[key, junk]]) });
    again.$("te").click();
    assert.equal(again.mod.isDirty(), false, junk);
  }
});

test("a file-backed page keeps no draft and does not let a dirty layout be left", () => {
  const h = setup({ fileBacked: true });
  h.$("te").click();
  h.fire("pointerdown", { target: h.closestKey("n:db01"), clientX: 0, clientY: 0 });
  h.fire("pointermove", { clientX: 40, clientY: 0 });
  h.fire("pointerup", {});
  assert.equal(h.draftKey(), undefined);
  h.$("te").click();
  assert.equal(h.model.state.on, true);
  assert.equal(h.say(), "Save or Reset your layout before leaving edit mode");
  h.page.g.timers.at(-1)[0]();
  assert.equal(h.say(), "");
  h.$("tr").click();
  assert.equal(h.say(), "Reset");
  h.$("te").click();
  assert.equal(h.model.state.on, false);
});

test("a file-backed page reuses a stored draft only when not file-backed", () => {
  const seed = setup();
  seed.$("te").click();
  seed.fire("pointerdown", { target: seed.closestKey("n:db01"), clientX: 0, clientY: 0 });
  seed.fire("pointermove", { clientX: 40, clientY: 0 });
  seed.fire("pointerup", {});
  const key = seed.draftKey();
  const fb = setup({ fileBacked: true, store: new Map([[key, seed.page.store.get(key)]]) });
  fb.$("te").click();
  assert.equal(fb.mod.isDirty(), false);
});

test("a status message disappears after 2.5 seconds unless a newer one replaced it", () => {
  const h = setup();
  h.$("te").click();
  h.$("tr").click();
  const [first, ms] = h.page.g.timers.at(-1);
  assert.equal(ms, 2500);
  h.$("tm").textContent = "something else";
  first();
  assert.equal(h.say(), "something else");
  h.$("tm").textContent = "Reset";
  first();
  assert.equal(h.say(), "");
});

test("Reset drops the draft and the unsaved moves, then refits", () => {
  const h = setup();
  h.$("te").click();
  h.fire("pointerdown", { target: h.closestKey("n:db01"), clientX: 0, clientY: 0 });
  h.fire("pointermove", { clientX: 40, clientY: 0 });
  h.fire("pointerup", {});
  assert.ok(h.draftKey());
  const fits = h.fits.length;
  h.$("tr").click();
  assert.equal(h.draftKey(), undefined);
  assert.deepEqual(h.model.state.st, h.model.base);
  assert.equal(h.mod.isDirty(), false);
  assert.equal(h.fits.length, fits + 1);
});

test("currentLayout returns a copy of the draft in edit mode and of the saved layout otherwise; isDirty compares them", () => {
  const h = setup();
  assert.equal(h.mod.isDirty(), false);
  assert.deepEqual(h.mod.currentLayout(), h.model.base);
  assert.notEqual(h.mod.currentLayout(), h.model.base);
  h.$("te").click();
  h.model.state.st = h.model.apply(h.model.state.st, "n:db01", 10, 0);
  assert.equal(h.mod.isDirty(), true);
  assert.equal(h.mod.currentLayout().nodes.db01.x, h.model.base.nodes.db01.x + 10);
  h.model.state.on = false;
  assert.equal(h.mod.isDirty(), false);
});

test("commit adopts the saved layout as the new baseline and clears the draft", () => {
  const h = setup();
  h.$("te").click();
  h.fire("pointerdown", { target: h.closestKey("n:db01"), clientX: 0, clientY: 0 });
  h.fire("pointermove", { clientX: 40, clientY: 0 });
  h.fire("pointerup", {});
  const saved = h.mod.currentLayout();
  h.mod.commit(saved);
  assert.equal(h.model.base.nodes.db01.x, saved.nodes.db01.x);
  assert.equal(h.draftKey(), undefined);
  assert.equal(h.mod.isDirty(), false);
  assert.equal(h.say(), "Saved");
  assert.equal(h.page.skins.synced, h.model.base);
});

test("Copy puts the layout JSON on the clipboard and reports success or failure", () => {
  const h = setup();
  h.$("te").click();
  h.$("tc").click();
  assert.equal(h.page.core.copied, JSON.stringify(h.model.state.st, null, 2) + "\n");
  assert.equal(h.say(), "Copied");
  h.page.core.clipOk = false;
  h.$("tc").click();
  assert.equal(h.say(), "Copy failed, use Download");
});

test("Download saves the layout as layout.json", () => {
  const h = setup();
  h.$("te").click();
  h.$("td").click();
  const [blob, name] = h.page.core.saved;
  assert.equal(name, "layout.json");
  assert.equal(blob.opts.type, "application/json");
  assert.deepEqual(plain(JSON.parse(blob.parts[0])), plain(h.model.state.st));
});

test("dropping a server into another region asks the server editor to move it, and keeps the draft on a refusal", () => {
  const calls = [];
  const h = setup({ bridge: { move: (id, to) => { calls.push([id, to]); return null; } } });
  h.$("te").click();
  const web = h.model.base.clusters.web;
  h.fire("pointerdown", { target: h.closestKey("n:db01"), clientX: 0, clientY: 0 });
  h.fire("pointerup", { clientX: web.x + 5, clientY: web.y + 5 });
  assert.deepEqual(calls, [["db01", "web"]]);
  assert.equal(h.fits.length, 1);
  const refuse = setup({ bridge: { move: () => "no way" } });
  refuse.$("te").click();
  const w = refuse.model.base.clusters.web;
  refuse.fire("pointerdown", { target: refuse.closestKey("n:db01"), clientX: 0, clientY: 0 });
  refuse.fire("pointermove", { clientX: 30, clientY: 0 });
  refuse.fire("pointerup", { clientX: w.x + 5, clientY: w.y + 5 });
  assert.equal(refuse.say(), "no way");
  assert.equal(refuse.model.state.st.nodes.db01.x, refuse.model.base.nodes.db01.x);
});

const focused = (key) => ({ getAttribute: (k) => (k === "tabindex" ? "0" : null), dataset: { ent: key } });
function nudger(over) {
  const h = setup(over);
  h.$("te").click();
  h.page.ctx.sel = "n:db01";
  h.press = (key, ev = {}) => h.fire("keydown", { key, target: focused("n:db01"), prevented: 0, preventDefault() { h.prevented = (h.prevented || 0) + 1; }, ...ev });
  return h;
}

test("arrow keys nudge the selected, focused server by the snap step and Shift by ten times that", () => {
  const h = nudger();
  h.$("ts").checked = true;
  const n0 = h.model.base.nodes.db01, x0 = Math.round(n0.x / 5) * 5;
  h.model.state.st.nodes.db01.x = x0;
  h.press("ArrowRight");
  assert.equal(h.model.state.st.nodes.db01.x, x0 + 5);
  h.press("ArrowLeft");
  h.press("ArrowLeft");
  assert.equal(h.model.state.st.nodes.db01.x, x0 - 5);
  h.model.state.st.nodes.db01.y = Math.round(n0.y / 5) * 5;
  const y0 = h.model.state.st.nodes.db01.y;
  h.press("ArrowDown", { shiftKey: true });
  assert.equal(h.model.state.st.nodes.db01.y, y0 + 50);
  assert.ok(h.prevented >= 4);
  assert.equal(h.mod.isDirty(), true);
  assert.ok(h.draftKey(), "the nudge is kept as a draft");
  assert.ok(h.fits.length >= 2);
});

test("a nudge snaps an off-grid server onto the grid and moves 1px with Snap off", () => {
  const h = nudger();
  h.$("ts").checked = true;
  h.model.state.st.nodes.db01.x = 12;
  h.press("ArrowRight");
  assert.equal(h.model.state.st.nodes.db01.x, 15);
  h.$("ts").checked = false;
  h.press("ArrowRight");
  assert.equal(h.model.state.st.nodes.db01.x, 16);
  h.press("ArrowUp", { shiftKey: true });
  assert.equal(h.model.state.st.nodes.db01.y, h.model.base.nodes.db01.y - 10);
});

test("a nudge on a region moves its servers with it", () => {
  const h = nudger();
  h.$("ts").checked = false;
  h.page.ctx.sel = "c:web";
  const c0 = h.model.state.st.clusters.web.x, kids = h.page.D.kids.web, before = kids.map((n) => h.model.state.st.nodes[n].x);
  assert.ok(kids.length > 0);
  h.fire("keydown", { key: "ArrowRight", target: focused("c:web"), preventDefault() {} });
  assert.equal(h.model.state.st.clusters.web.x, c0 + 1);
  kids.forEach((n, i) => assert.equal(h.model.state.st.nodes[n].x, before[i] + 1, n));
});

test("nudging needs edit mode, a selected focused node, an arrow key and no Ctrl, Alt or Meta", () => {
  const h = nudger();
  h.$("ts").checked = false;
  const x0 = h.model.state.st.nodes.db01.x;
  h.press("a");
  h.press("ArrowRight", { ctrlKey: true });
  h.press("ArrowRight", { altKey: true });
  h.press("ArrowRight", { metaKey: true });
  h.fire("keydown", { key: "ArrowRight", target: focused("c:web"), preventDefault() {} });
  h.fire("keydown", { key: "ArrowRight", target: { getAttribute: () => null, dataset: { ent: "n:db01" } }, preventDefault() {} });
  h.fire("keydown", { key: "ArrowRight", target: {}, preventDefault() {} });
  h.page.ctx.sel = null;
  h.press("ArrowRight");
  h.page.ctx.sel = "n:db01";
  h.model.state.on = false;
  h.press("ArrowRight");
  assert.equal(h.model.state.st.nodes.db01.x, x0);
  assert.equal(h.mod.isDirty(), false);
});
