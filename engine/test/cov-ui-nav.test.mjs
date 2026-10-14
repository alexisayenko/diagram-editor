import test from "node:test";
import assert from "node:assert/strict";
import { loadUi, fixture, makeStorage, setService } from "./cov-ui-env.mjs";

const names = (list) => Array.from(list, (e) => e.dataset.ent);
const ents = (t, cls) => names(t.modules["ui/core"].ents.filter((e) => e.classList.contains(cls)));
const keys = (o) => Object.keys(o).sort();

test("selection.related: a node pulls in its neighbours, connecting edges and its region", () => {
  const t = loadUi(["ui/selection"], fixture());
  assert.deepEqual(keys(t.modules["ui/selection"].related("n:a")), ["c:r1", "e:1", "n:a", "n:b"]);
});

test("selection.related: a region pulls in neighbours of the region and its member servers", () => {
  const t = loadUi(["ui/selection"], fixture());
  assert.deepEqual(keys(t.modules["ui/selection"].related("c:r1")), ["c:r1", "e:2", "n:a", "n:b"]);
});

test("selection.select: dims unrelated entities, marks the selection and shows its panel", () => {
  const t = loadUi(["ui/selection"], fixture());
  const sel = t.modules["ui/selection"], core = t.modules["ui/core"];
  sel.select("n:a");
  assert.equal(core.ctx.sel, "n:a");
  assert.ok(t.$("pn").hidden === false);
  assert.match(t.$("pn").innerHTML, /Service A/);
  assert.ok(ents(t, "sel").every((k) => k === "n:a") && ents(t, "sel").length > 0);
  assert.ok(ents(t, "dim").every((k) => !["n:a", "n:b", "c:r1", "e:1"].includes(k)));
  assert.ok(!ents(t, "dim").includes("n:b"));
  sel.select(null);
  assert.equal(core.ctx.sel, null);
  assert.equal(ents(t, "dim").length + ents(t, "sel").length, 0);
  assert.ok(t.$("pn").hidden === true);
});

test("selection.select: beforeSelect returning false vetoes the change", () => {
  const t = loadUi(["ui/selection"], fixture());
  const core = t.modules["ui/core"];
  setService(core, "beforeSelect", () => false);
  t.modules["ui/selection"].select("n:a");
  assert.equal(core.ctx.sel, null);
  setService(core, "beforeSelect", () => true);
  t.modules["ui/selection"].select("n:a");
  assert.equal(core.ctx.sel, "n:a");
});

test("panels: initial state follows the viewport width and the saved choice", () => {
  let t = loadUi(["ui/panels"], { ...fixture(), globals: { innerWidth: 500 } });
  t.modules["ui/panels"].initPanels();
  assert.equal(t.$("nh").getAttribute("aria-expanded"), "false");
  assert.ok(t.$("nl").hidden === true);
  t = loadUi(["ui/panels"], fixture());
  t.modules["ui/panels"].initPanels();
  assert.equal(t.$("nh").getAttribute("aria-expanded"), "true");
  t = loadUi(["ui/panels"], { ...fixture(), storage: makeStorage({ data: { "d1-legend-collapsed": "1", "d1-networks-collapsed": "0" } }) });
  t.modules["ui/panels"].initPanels();
  assert.equal(t.$("lh").getAttribute("aria-expanded"), "false");
  assert.equal(t.$("wh").getAttribute("aria-expanded"), "true");
});

test("panels: clicking a header toggles and persists, resize repositions", () => {
  const t = loadUi(["ui/panels"], fixture());
  t.modules["ui/panels"].initPanels();
  t.fire(t.$("dh"), "click");
  assert.equal(t.$("dh").getAttribute("aria-expanded"), "false");
  assert.ok(t.$("dl").hidden === true);
  assert.equal(t.sandbox.localStorage.getItem("d1-docs-collapsed"), "1");
  t.fire(t.$("dh"), "click");
  assert.equal(t.sandbox.localStorage.getItem("d1-docs-collapsed"), "0");
  assert.equal(t.winListeners.resize.length, 1);
  t.$("ta").rect = { bottom: 40 };
  t.winListeners.resize[0]();
  assert.equal(t.$("lc").style.top, "48px");
  assert.equal(t.doc.documentElement.style["--ta-b"], "48px");
});

test("panels: placeChrome limits heights and moves the notes column below a crowded legend", () => {
  const t = loadUi(["ui/panels"], { ...fixture(), globals: { innerWidth: 600, innerHeight: 500 } });
  t.$("ta").rect = { bottom: 32 };
  t.$("rc").ow = 400;
  t.$("lc").ow = 300;
  t.$("lc").rect = { bottom: 120 };
  t.modules["ui/panels"].placeChrome();
  assert.equal(t.$("lc").style.top, "40px");
  assert.equal(t.$("lc").style.maxHeight, "452px");
  assert.equal(t.$("rc").style.top, "128px");
  assert.equal(t.$("rc").style.maxHeight, "364px");
  t.$("rc").ow = 10;
  t.modules["ui/panels"].placeChrome();
  assert.equal(t.$("rc").style.top, "40px");
});

test("panels: placeChrome does nothing when the chrome containers are absent", () => {
  const t = loadUi(["ui/panels"], fixture());
  t.$("rc").remove();
  t.modules["ui/panels"].placeChrome();
  assert.equal(t.$("lc").style.top, undefined);
});

test("panels: ResizeObserver, when available, watches the toolbar and legend column", () => {
  const seen = [];
  const RO = class { constructor(f) { this.f = f; } observe(e) { seen.push(e.id); } };
  const t = loadUi(["ui/panels"], { ...fixture(), globals: { ResizeObserver: RO } });
  t.modules["ui/panels"].initPanels();
  assert.deepEqual(seen, ["ta", "lc"]);
});

test("networks.setNet filters entities outside the network and marks the pressed buttons", () => {
  const t = loadUi(["ui/networks"], fixture());
  const net = t.modules["ui/networks"], core = t.modules["ui/core"];
  t.$("wl").innerHTML = '<button class="nw" data-n="0"><span>x</span></button><button class="nw" data-n="1"><span>y</span></button>';
  net.setNet(1);
  assert.equal(core.ctx.net, 1);
  assert.ok(ents(t, "nf").includes("n:a"));
  assert.ok(!ents(t, "nf").includes("n:b"));
  const [b0, b1] = t.$("wl").querySelectorAll(".nw");
  assert.equal(b0.getAttribute("aria-pressed"), "false");
  assert.equal(b1.getAttribute("aria-pressed"), "true");
  assert.ok(b1.classList.contains("on"));
  net.setNet(0);
  assert.ok(ents(t, "nf").includes("c:r1"));
  assert.ok(!ents(t, "nf").includes("e:1"), "an edge between two members stays");
  net.setNet(null);
  assert.equal(ents(t, "nf").length, 0);
  net.setNet(undefined);
  assert.equal(core.ctx.net, null);
});

test("networks.setNet does nothing without network data", () => {
  const t = loadUi(["ui/networks"], fixture({ nets: undefined }));
  t.modules["ui/networks"].setNet(0);
  assert.equal(t.modules["ui/core"].ctx.net, null);
  t.modules["ui/networks"].initNetworks();
});

test("networks list: clicking an entry selects it, clicking it again or Reset clears", () => {
  const t = loadUi(["ui/networks"], fixture());
  t.$("wl").innerHTML = '<button class="nw" data-n="0"><span>x</span></button>';
  t.modules["ui/networks"].initNetworks();
  const b = t.$("wl").querySelector(".nw");
  t.fire(b, "click");
  assert.equal(t.modules["ui/core"].ctx.net, 0);
  t.fire(b, "click");
  assert.equal(t.modules["ui/core"].ctx.net, null);
  t.fire(b, "click");
  t.fire(t.$("wr"), "click");
  assert.equal(t.modules["ui/core"].ctx.net, null);
  t.fire(t.$("wl"), "click");
  assert.equal(t.modules["ui/core"].ctx.net, null);
});

test("networks.toggleNet activates, reveals the collapsed Networks panel and scrolls to the entry", () => {
  const t = loadUi(["ui/networks"], fixture());
  t.$("wl").innerHTML = '<button class="nw" data-n="0"><span>x</span></button>';
  t.$("wh").setAttribute("aria-expanded", "false");
  const net = t.modules["ui/networks"];
  net.toggleNet(0);
  assert.equal(t.modules["ui/core"].ctx.net, 0);
  assert.equal(t.$("wh").getAttribute("aria-expanded"), "true");
  assert.deepEqual({ ...t.$("wl").querySelector(".nw").scrolled }, { block: "nearest" });
  net.toggleNet(0);
  assert.equal(t.modules["ui/core"].ctx.net, null);
  net.toggleNet(7);
  assert.equal(t.modules["ui/core"].ctx.net, null);
  net.toggleNet(1);
  assert.equal(t.modules["ui/core"].ctx.net, 1);
});

function nameEditor(over) {
  const t = loadUi(["ui/networks"], fixture(over));
  const renames = [];
  t.modules["ui/core"].host.serverEditor = { renameNetwork: (cidr, v) => { renames.push([cidr, v]); return t.err || null; } };
  t.$("wl").innerHTML = '<button class="nw" data-n="0"><span class="l">192.0.2.0/24 <b>Net One</b> tail</span></button><button class="nw" data-n="1"><span class="l">198.51.100.0/24</span></button>';
  t.renames = renames;
  t.input = () => t.$("wl").querySelector(".nwe");
  return t;
}

test("editName: Enter commits a changed name and restores the label", () => {
  const t = nameEditor();
  t.modules["ui/networks"].editName(0);
  const i = t.input();
  assert.equal(i.value, "Net One");
  assert.equal(i.getAttribute("aria-label"), "Network name for 192.0.2.0/24");
  assert.equal(i.maxLength, 80);
  assert.ok(t.doc.activeElement === i);
  i.value = "  Renamed ";

  assert.equal(t.fire(i, "keydown", { key: "Enter" }), false, "default prevented");
  assert.deepEqual(t.renames, [["192.0.2.0/24", "Renamed"]]);
  assert.ok(t.input() === null);
  assert.match(t.$("wl").querySelector(".l").innerHTML, /<b>Net One<\/b> tail/);
});

test("editName: Escape cancels, an unchanged name is not written, blur commits, finishing twice is ignored", () => {
  const t = nameEditor();
  t.modules["ui/networks"].editName(0);
  t.input().value = "Changed";
  t.fire(t.input(), "keydown", { key: "Escape" });
  assert.deepEqual(t.renames, []);
  t.modules["ui/networks"].editName(0);
  t.fire(t.input(), "keydown", { key: "Enter" });
  assert.deepEqual(t.renames, [], "same name");
  t.modules["ui/networks"].editName(0);
  const i = t.input();
  i.value = "Blurred";
  t.fire(i, "blur");
  t.fire(i, "keydown", { key: "Enter" });
  assert.deepEqual(t.renames, [["192.0.2.0/24", "Blurred"]]);
});

test("editName: other keys and clicks stay inside the editor, a second call keeps the open editor", () => {
  const t = nameEditor();
  t.modules["ui/networks"].editName(0);
  const i = t.input(), parentClicks = [];
  t.$("wl").addEventListener("click", () => parentClicks.push(1));
  t.$("wl").addEventListener("keydown", () => parentClicks.push(2));
  t.fire(i, "keydown", { key: "a" });
  t.fire(i, "click");
  assert.deepEqual(parentClicks, []);
  t.modules["ui/networks"].editName(0);
  assert.equal(t.$("wl").querySelectorAll(".nwe").length, 1);
});

test("editName: an empty value removes the name, a failing rename shows the error in the toast", () => {
  const t = nameEditor();
  t.err = "Name too long";
  t.modules["ui/networks"].editName(0);
  t.input().value = "";
  t.fire(t.input(), "keydown", { key: "Enter" });
  assert.deepEqual(t.renames, [["192.0.2.0/24", ""]]);
  assert.equal(t.$("tm").textContent, "Name too long");
});

test("editName: editing an unnamed network starts from an empty value; missing bridge or entry is a no-op", () => {
  const t = nameEditor();
  t.modules["ui/networks"].editName(1);
  assert.equal(t.input().value, "");
  t.fire(t.input(), "keydown", { key: "Escape" });
  t.modules["ui/networks"].editName(9);
  assert.ok(t.input() === null);
  t.modules["ui/core"].host.serverEditor = null;
  t.modules["ui/networks"].editName(0);
  assert.ok(t.input() === null);
  const u = nameEditor({ nets: [{ name: "x", m: [] }] });
  u.modules["ui/networks"].editName(0);
  assert.ok(u.input() === null, "network without a cidr cannot be renamed");
});

function legend(over = {}, opts = {}) {
  const calls = [];
  const t = loadUi(["ui/legend"], { ...fixture(over), stubs: { "ui/skins": { rebuildChrome: () => calls.push("rebuild") } }, ...opts });
  t.rebuilds = calls;
  t.legend = t.modules["ui/legend"];
  t.core = t.modules["ui/core"];
  return t;
}
const off = (t) => names(t.core.ents.filter((e) => e.classList.contains("off"))).sort();

test("legend: builds the type switches, the 'Other infrastructure' group and the reset button", () => {
  const t = legend();
  t.legend.initLegend();
  const lg = t.$("lg");
  assert.deepEqual(Array.from(lg.querySelectorAll(".sw"), (b) => b.dataset.k), ["web", "db"]);
  assert.match(lg.innerHTML, /<b>Server types<\/b>/);
  assert.match(lg.innerHTML, /<b>Other infrastructure<\/b>/);
  assert.match(lg.innerHTML, /<i class="dash"><\/i>/);
  assert.ok(lg.querySelector(".reset"));
  assert.deepEqual(Array.from(t.doc.querySelectorAll("#lp .lk .es"), (b) => b.dataset.k), ["lv:server", "g:x"]);
  assert.equal(t.doc.querySelector('.es[data-k="g:x"]').dataset.g, "x");
});

test("legend: without infrastructure types there is no second group", () => {
  const t = legend({ types: [{ k: "web", ty: "web", label: "Web" }] });
  t.legend.initLegend();
  assert.ok(!t.$("lg").innerHTML.includes("Other infrastructure"));
});

test("legend: toggling a type hides its entities and persists the hidden set", () => {
  const t = legend();
  t.legend.initLegend();
  t.fire(t.$("lg").querySelector('.sw[data-k="db"]'), "click");
  assert.deepEqual(off(t), ["n:b", "n:b", "n:b"]);
  assert.equal(t.$("lg").querySelector('.sw[data-k="db"]').getAttribute("aria-checked"), "false");
  assert.equal(t.sandbox.localStorage.getItem("d1-types"), '["db"]');
  t.fire(t.$("lg").querySelector('.sw[data-k="db"]'), "click");
  assert.deepEqual(off(t), []);
  assert.equal(t.sandbox.localStorage.getItem("d1-types"), "[]");
});

test("legend: a connection switch hides edges that carry it; an edge needs all its switches on", () => {
  const t = legend();
  t.legend.initLegend();
  t.fire(t.doc.querySelector('.es[data-k="lv:server"]'), "click");
  assert.deepEqual(off(t), ["e:1"]);
  t.legend.toggle("lv:server", true);
  assert.deepEqual(off(t), []);
  t.legend.toggle("g:x", false);
  assert.deepEqual(off(t), ["e:1"]);
  t.legend.toggle("g:x");
  assert.deepEqual(off(t), []);
});

test("legend: Show all re-enables everything and clears the network filter", () => {
  const t = legend();
  t.legend.initLegend();
  t.legend.toggle("web", false);
  t.modules["ui/networks"].setNet(0);
  t.fire(t.$("lg").querySelector(".reset"), "click");
  assert.deepEqual(off(t), []);
  assert.equal(t.core.ctx.net, null);
  t.fire(t.$("lg"), "click");
  t.legend.showAll();
});

test("legend: saved switches are restored, and a corrupt saved value is ignored", () => {
  let t = legend({}, { storage: makeStorage({ data: { "d1-types": '["web","bogus"]' } }) });
  t.legend.initLegend();
  assert.deepEqual(off(t), ["n:a", "n:a", "n:a"]);
  assert.equal(t.$("lg").querySelector('.sw[data-k="web"]').getAttribute("aria-checked"), "false");
  t = legend({}, { storage: makeStorage({ data: { "d1-types": "{not json" } }) });
  t.legend.initLegend();
  assert.deepEqual(off(t), []);
});

test("legend: Connection labels switch toggles, persists and rebuilds the chrome", () => {
  const t = legend();
  t.legend.initLegend();
  assert.ok(t.core.svg.classList.contains("nolabels"));
  assert.equal(t.$("lbl").getAttribute("aria-checked"), "false");
  t.fire(t.$("lbl"), "click");
  assert.ok(!t.core.svg.classList.contains("nolabels"));
  assert.equal(t.$("lbl").getAttribute("aria-checked"), "true");
  assert.equal(t.sandbox.localStorage.getItem("d1-labels"), "1");
  assert.deepEqual(t.rebuilds, ["rebuild"]);
  t.fire(t.$("lbl"), "click");
  assert.equal(t.sandbox.localStorage.getItem("d1-labels"), "0");
});

test("legend: saved labels=1 starts with labels on and no rebuild", () => {
  const t = legend({}, { storage: makeStorage({ data: { "d1-labels": "1" } }) });
  t.legend.initLegend();
  assert.ok(!t.core.svg.classList.contains("nolabels"));
  assert.deepEqual(t.rebuilds, []);
});

test("legend: Display System Information is on by default, toggles, persists and re-renders when ready", () => {
  const t = legend();
  t.legend.initLegend();
  assert.ok(t.core.svg.classList.contains("showsys"));
  assert.equal(t.$("osv").getAttribute("aria-checked"), "true");
  assert.match(t.$("osv").innerHTML, /Display System Information/);
  assert.deepEqual(t.rebuilds, [], "not ready yet: no rebuild at init");
  let rerenders = 0;
  setService(t.core, "rerender", () => { rerenders++; });
  t.core.ctx.ready = true;
  t.fire(t.$("osv"), "click");
  assert.equal(t.core.ctx.sys, false);
  assert.ok(!t.core.svg.classList.contains("showsys"));
  assert.equal(t.sandbox.localStorage.getItem("d1-os"), "0");
  assert.deepEqual(t.rebuilds, ["rebuild"]);
  assert.equal(rerenders, 1);
  setService(t.core, "rerender", null);
  t.fire(t.$("osv"), "click");
  assert.equal(t.core.ctx.sys, true);
  assert.equal(t.sandbox.localStorage.getItem("d1-os"), "1");
});

test("legend: saved os=0 starts with system information off", () => {
  const t = legend({}, { storage: makeStorage({ data: { "d1-os": "0" } }) });
  t.legend.initLegend();
  assert.equal(t.core.ctx.sys, false);
  assert.equal(t.$("osv").getAttribute("aria-checked"), "false");
});

test("copy: shows 'Copied' near the pointer and hides it again after the timeout", () => {
  const t = loadUi(["ui/copy"], fixture());
  t.modules["ui/copy"].copyText("hello", 100, 200);
  const h = t.$("ch");
  assert.equal(h.textContent, "Copied");
  assert.equal(h.style.left, "112px");
  assert.equal(h.style.top, "172px");
  assert.ok(h.classList.contains("on"));
  t.modules["ui/copy"].copyText("again", 5000, 2);
  assert.equal(h.style.left, "1120px");
  assert.equal(h.style.top, "4px");
  assert.equal(t.flush(), 2);
  assert.ok(!h.classList.contains("on"));
});

test("copy: reports a failed copy", () => {
  const t = loadUi(["ui/copy"], fixture());
  t.doc.execCommand = () => false;
  t.modules["ui/copy"].copyText("x", 0, 0);
  assert.equal(t.$("ch").textContent, "Copy failed");
});

test("clear-click: clicking empty canvas clears the selection and network filter; interactive targets do not", () => {
  const t = loadUi(["ui/clear-click"], fixture());
  const core = t.modules["ui/core"], sel = t.modules["ui/selection"], net = t.modules["ui/networks"];
  const click = (target, from = target, o = {}) => {
    t.fire(from, "pointerdown", { clientX: 10, clientY: 10, button: 0 });
    t.fire(target, "click", { clientX: 11, clientY: 11, button: 0, ...o });
  };
  sel.select("n:a");
  net.setNet(0);
  click(t.$("ca"));
  assert.equal(core.ctx.sel, "n:a", "entity is not empty space");
  click(t.$("xs"));
  assert.equal(core.ctx.net, 0, "a button is not empty space");
  click(core.svg);
  assert.equal(core.ctx.sel, null);
  assert.equal(core.ctx.net, null);
});

test("clear-click: body, html, bare panel containers and .cp areas are empty; text nodes and null are not", () => {
  const t = loadUi(["ui/clear-click"], fixture());
  const cc = t.modules["ui/clear-click"];
  assert.ok(cc.isEmptyTarget(t.doc.body));
  assert.ok(cc.isEmptyTarget(t.doc.documentElement));
  assert.ok(cc.isEmptyTarget(t.$("pn")));
  assert.ok(cc.isEmptyTarget(t.$("nl")));
  t.$("rc").className = "cp";
  assert.ok(cc.isEmptyTarget(t.$("rc")));
  assert.ok(!cc.isEmptyTarget(t.$("ta")), "#ta is blocked");
  assert.ok(!cc.isEmptyTarget(t.$("lg")));
  assert.ok(!cc.isEmptyTarget(t.$("pc")), "a button inside the panel");
  assert.ok(!cc.isEmptyTarget(null));
  assert.ok(!cc.isEmptyTarget(t.$("pn").firstChild.firstChild));
});

test("clear-click: moved pointers, drawing, other buttons and a pending edit keep the selection", () => {
  const t = loadUi(["ui/clear-click"], fixture());
  const core = t.modules["ui/core"], sel = t.modules["ui/selection"];
  const run = (down, up) => {
    sel.select("n:a");
    t.fire(core.svg, "pointerdown", down);
    t.fire(core.svg, "click", up);
    return core.ctx.sel;
  };
  assert.equal(run({ clientX: 0, clientY: 0, button: 0 }, { clientX: 10, clientY: 0, button: 0 }), "n:a");
  assert.equal(run({ clientX: 0, clientY: 0, button: 2 }, { clientX: 0, clientY: 0, button: 0 }), "n:a");
  core.svg.classList.add("draw-pencil");
  assert.equal(run({ clientX: 0, clientY: 0, button: 0 }, { clientX: 0, clientY: 0, button: 0 }), "n:a");
  core.svg.classList.remove("draw-pencil");
  core.svg.classList.add("draw-eraser");
  assert.equal(run({ clientX: 0, clientY: 0, button: 0 }, { clientX: 0, clientY: 0, button: 0 }), "n:a");
  core.svg.classList.remove("draw-eraser");
  setService(core, "pending", () => true);
  assert.equal(run({ clientX: 0, clientY: 0, button: 0 }, { clientX: 0, clientY: 0, button: 0 }), "n:a");
  setService(core, "pending", null);
  assert.equal(run({ clientX: 0, clientY: 0, button: 0 }, { clientX: 1, clientY: 1, button: 0 }), null);
  t.fire(core.svg, "click", { clientX: 0, clientY: 0, button: 0 });
});

test("clear-click: clearSelection reports false while an edit is pending and does nothing when nothing is selected", () => {
  const t = loadUi(["ui/clear-click"], fixture());
  const cc = t.modules["ui/clear-click"], core = t.modules["ui/core"];
  assert.equal(cc.clearSelection(() => true), false);
  assert.equal(cc.clearSelection(), true);
  assert.equal(core.ctx.sel, null);
});
