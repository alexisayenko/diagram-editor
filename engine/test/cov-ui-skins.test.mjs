import test from "node:test";
import assert from "node:assert/strict";
import { loadUi, fixture, makeStorage } from "./cov-ui-env.mjs";

const state = () => ({
  nodes: {
    a: { x: 10, y: 20, w: 120, h: 80, ip: [[20, 90]], body: [[20, 50]], title: [20, 36] },
    b: { x: 200, y: 20, w: 120, h: 60, ip: [[210, 70]], body: [], title: [210, 36] },
  },
  clusters: { r1: { x: 5, y: 6 } },
});

function skins(over, opts = {}) {
  const t = loadUi(["ui/skins"], { ...fixture(over), ...opts });
  t.skins = t.modules["ui/skins"];
  t.core = t.modules["ui/core"];
  t.els = t.core.els;
  t.core.ctx.ready = true;
  t.core.hooks.getState = state;
  return t;
}
const chrome = (t, i = 0) => t.els[i].innerHTML;

test("clean skin: rounded frame, icon, hardware text, dividers and rounded IP pills", () => {
  const t = skins();
  t.skins.setStyle("clean");
  const h = chrome(t);
  assert.match(h, /<rect class="cd" x="0" y="-20" width="120" height="100" rx="10"><\/rect>/);
  assert.match(h, /<path class="hd" d="M0 0V-10Q0 -20 10 -20H110Q120 -20 120 -10V0Z">/);
  assert.match(h, /<g class="ic" transform="translate\(97\.2 -16\.8\) scale\(\.85\)"><rect/);
  assert.match(h, /<text class="hw" x="10" y="34">4 cpu · 8G ram<\/text>/);
  assert.match(h, /d="M8 24H112"/);
  assert.match(h, /d="M8 40H112"/);
  assert.match(h, /d="M8 57\.5H112"/);
  assert.match(h, /<rect class="ip" data-i="0" x="5" y="59" width="94" height="15" rx="8">/);
});

test("dark skin: accent bar and 3px pills; swiss skin: flat frame, separator and square pills", () => {
  const t = skins();
  t.skins.setStyle("dark");
  assert.match(chrome(t), /<rect class="ab" x="0" y="-20" width="3" height="20">/);
  assert.match(chrome(t), /rx="5"/);
  assert.match(chrome(t), /class="ip"[^>]*rx="3"/);
  assert.ok(t.els[1].getAttribute("x") === null);
  t.skins.setStyle("swiss");
  assert.match(chrome(t), /<rect class="ab" x="0" y="-20" width="120" height="3">/);
  assert.match(chrome(t), /<path class="sep" d="M0 0H120">/);
  assert.match(chrome(t), /class="ip"[^>]*rx="0"/);
});

test("sketch skin draws only the hardware text and reports no measured box widths", () => {
  const t = skins();
  t.skins.setStyle("sketch");
  assert.equal(chrome(t), '<text class="hw" x="10" y="34">4 cpu · 8G ram</text>');
  assert.equal(Object.keys(t.skins.widths()).length, 0);
});

test("database servers get the cylinder icon", () => {
  const t = skins();
  t.skins.setStyle("clean");
  assert.match(chrome(t, 5), /<ellipse/);
  assert.match(chrome(t, 0), /<rect x="1" y="1"/);
});

test("measured text widths widen the box and are reported by widths()", () => {
  const t = skins();
  t.els[1].tl = 200;
  t.skins.setStyle("clean");
  assert.equal(t.skins.widths().a, 238);
  assert.match(chrome(t), /width="238"/);
  assert.equal(t.skins.widths().b, 120);
});

test("Display System Information off hides hardware text and the system dividers", () => {
  const t = skins();
  t.core.ctx.sys = false;
  t.skins.setStyle("clean");
  const h = chrome(t);
  assert.ok(!h.includes('class="hw"'));
  assert.ok(!h.includes('d="M8 40H112"'));
  assert.ok(!h.includes('d="M8 57.5H112"'));
  assert.match(h, /d="M8 24H112"/, "body/IP divider remains");
});

test("job divider appears when the body is longer than the job count", () => {
  const f = fixture();
  f.D.meta.nodes.a = { hw: "", os: 0, nj: 1 };
  f.D.layout.nodes.a.body = [[20, 50], [20, 66]];
  const t = loadUi(["ui/skins"], f);
  t.modules["ui/core"].ctx.ready = true;
  t.modules["ui/core"].hooks.getState = state;
  t.modules["ui/skins"].setStyle("clean");
  assert.match(t.modules["ui/core"].els[0].innerHTML, /d="M8 24H112"/);
  assert.match(t.modules["ui/core"].els[0].innerHTML, /d="M8 40H112"/);
});

test("node without hardware, OS, IPs or body only has the frame", () => {
  const f = fixture();
  f.D.meta.nodes.b = {};
  f.D.layout.nodes.b = { x: 0, y: 0, w: 100, h: 40, ip: [], body: [], title: [0, 0] };
  const t = loadUi(["ui/skins"], f);
  t.modules["ui/core"].ctx.ready = true;
  t.modules["ui/core"].hooks.getState = () => ({ nodes: { a: state().nodes.a, b: { x: 0, y: 0, w: 100, h: 40, ip: [], body: [], title: [0, 0] } }, clusters: { r1: { x: 0, y: 0 } } });
  t.modules["ui/skins"].setStyle("clean");
  assert.ok(!t.modules["ui/core"].els[5].innerHTML.includes('class="dv"'));
});

test("rebuildChrome clears cluster chrome, sizes the OS pill and measures label pills per skin", () => {
  const t = skins();
  t.els[8].innerHTML = "<g/>";
  t.skins.setStyle("clean");
  assert.equal(chrome(t, 8), "");
  const rect = t.els[4].querySelector("rect");
  assert.equal(rect.getAttribute("width"), "70");
  assert.equal(rect.getAttribute("rx"), "6");
  assert.equal(t.skins.labelWidths()["1"], 38);
  assert.ok(!("2" in t.skins.labelWidths()));
  t.skins.setStyle("swiss");
  assert.equal(t.skins.labelWidths()["1"], 42);
  assert.equal(rect.getAttribute("rx"), "0");
  t.skins.setStyle("dark");
  assert.equal(rect.getAttribute("rx"), "3");
  t.skins.setStyle("sketch");
  assert.equal(rect.getAttribute("rx"), "2");
  assert.equal(rect.getAttribute("width"), "75");
});

test("rebuildChrome calls the routing hook and honours viewNode", () => {
  const t = skins();
  const seen = [];
  t.core.hooks.route = () => seen.push("route");
  t.core.hooks.viewNode = (id, g) => { seen.push(id); return { ...g, h: 200 }; };
  t.skins.setStyle("clean");
  assert.deepEqual(seen.filter((x) => x === "route"), ["route"]);
  assert.deepEqual(seen.filter((x) => x !== "route").sort(), ["a", "b"]);
  assert.match(chrome(t), /height="220"/);
});

test("sync positions nodes, clusters, titles, the OS pill and the network button", () => {
  const t = skins();
  t.skins.setStyle("clean");
  assert.equal(t.els[0].getAttribute("transform"), "translate(10 20)");
  assert.equal(t.els[5].getAttribute("transform"), "translate(200 20)");
  assert.equal(t.els[8].getAttribute("transform"), "translate(5 6)");
  assert.equal(t.els[4].getAttribute("transform"), "translate(15 64)");
  assert.equal(t.els[4].getAttribute("visibility"), "visible");
  assert.equal(t.els[3].getAttribute("transform"), "translate(111 80)");
  assert.equal(t.els[3].getAttribute("visibility"), "visible");
  assert.ok(!t.els[3].classList.contains("tight"));
  t.core.hooks.title = (g, style) => [g.x + 1, style.length];
  t.skins.sync(state());
  assert.equal(t.els[1].getAttribute("x"), "11");
  assert.equal(t.els[1].getAttribute("y"), "5");
});

test("sync: the OS pill hides when it would touch a body line", () => {
  const t = skins();
  t.skins.setStyle("clean");
  const s = state();
  s.nodes.a.body = [[20, 80]];
  t.skins.sync(s);
  assert.equal(t.els[4].getAttribute("visibility"), "hidden");
});

test("sync: OS pill placement without IPs uses the box bottom and the body or title origin", () => {
  const f = fixture();
  f.D.idx.nodes.a.w = [-1];
  const t = skins(undefined, { D: f.D });
  t.skins.setStyle("clean");
  const s = state();
  s.nodes.a.ip = [];
  t.skins.sync(s);
  assert.equal(t.els[4].getAttribute("transform"), "translate(15 " + (20 + (80 - 3 - 3 - 12)) + ")");
  s.nodes.a.body = [];
  s.nodes.a.title = [30, 30];
  t.skins.sync(s);
  assert.equal(t.els[4].getAttribute("transform"), "translate(25 " + (20 + (80 - 3 - 3 - 12)) + ")");
});

test("sync: a network button that would collide with the pill is pulled left ('tight') and hidden when it covers the IP", () => {
  const t = skins();
  t.els[2].tl = 100;
  t.skins.setStyle("clean");
  assert.equal(t.els[3].getAttribute("transform"), "translate(115 80)");
  assert.ok(t.els[3].classList.contains("tight"));
  assert.equal(t.els[3].getAttribute("visibility"), "hidden");
});

test("sync: Sketch places the network button 4px after the IP text", () => {
  const t = skins();
  t.skins.setStyle("sketch");
  assert.match(t.els[3].getAttribute("transform"), /^translate\(\d+ 80\)$/);
  assert.equal(t.els[3].getAttribute("transform"), "translate(" + Math.min(Math.round(20 + 14 * 7 + 4), Math.floor(10 + 120 - 15)) + " 80)");
});

test("sync: routed labels move their pill; unrouted ones and not-ready state are skipped", () => {
  const t = skins();
  t.skins.setStyle("clean");
  assert.ok(t.els[10].getAttribute("x") === null);
  t.core.ctx.routes = { "1": { label: [100, 50] } };
  t.skins.sync(state());
  assert.equal(t.els[10].getAttribute("x"), "93");
  assert.equal(t.els[10].getAttribute("y"), "38");
  assert.equal(t.els[10].getAttribute("width"), "38");
  assert.equal(t.els[10].getAttribute("height"), "17");
  t.core.ctx.ready = false;
  t.els[0].setAttribute("transform", "x");
  t.skins.sync(state());
  assert.equal(t.els[0].getAttribute("transform"), "x");
  t.core.ctx.ready = true;
  t.skins.sync(null);
  assert.equal(t.els[0].getAttribute("transform"), "x");
});

test("sync: label pill falls back to width 60 before measurement and hooks.view remaps the state", () => {
  const t = skins();
  t.core.ctx.routes = { "1": { label: [10, 20] } };
  t.skins.sync(state());
  assert.equal(t.els[10].getAttribute("width"), "60");
  const s = state();
  t.core.hooks.view = (x) => ({ ...x, nodes: { ...x.nodes, a: { ...x.nodes.a, x: 77 } } });
  t.skins.sync(s);
  assert.equal(t.els[0].getAttribute("transform"), "translate(77 20)");
});

test("setStyle: unknown styles fall back to clean; classes, link legends and pressed buttons follow", () => {
  const t = skins();
  t.doc.body.insertAdjacentHTML("beforeend", '<div class="lks s-dark"></div>');
  let fits = 0;
  t.core.hooks.fit = () => { fits++; };
  t.skins.setStyle("nonsense");
  assert.equal(t.core.ctx.style, "clean");
  assert.equal(t.doc.documentElement.dataset.style, "clean");
  assert.ok(t.core.svg.classList.contains("s-clean"));
  assert.ok(!t.core.svg.classList.contains("s-sketch"));
  assert.equal(t.doc.querySelector(".lks").className, "lks s-clean");
  assert.deepEqual(Array.from(t.doc.querySelectorAll("#ss button"), (b) => b.getAttribute("aria-pressed")), ["false", "true", "false", "false"]);
  assert.equal(fits, 1);
  t.skins.setStyle("sketch");
  assert.equal(fits, 1, "Sketch does not refit");
});

test("setStyle persists the choice and keeps ?style= in the URL in step", () => {
  const replaced = [];
  const t = skins({}, { globals: { URL, history: { replaceState: (...a) => replaced.push(a) }, location: { search: "?style=clean&x=1", href: "http://localhost/diagram.html?style=clean&x=1" } } });
  t.skins.setStyle("dark", true);
  assert.equal(t.sandbox.localStorage.getItem("d1-style"), "dark");
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0][2], "http://localhost/diagram.html?style=dark&x=1");
});

test("setStyle persist without ?style= leaves the URL alone, and a failing history API is swallowed", () => {
  const replaced = [];
  let t = skins({}, { globals: { URL, history: { replaceState: (...a) => replaced.push(a) } } });
  t.skins.setStyle("swiss", true);
  assert.equal(replaced.length, 0);
  t = skins({}, { globals: { URL, history: { replaceState: () => { throw new Error("denied"); } }, location: { search: "?style=x", href: "http://localhost/d.html?style=x" } } });
  t.skins.setStyle("swiss", true);
  assert.equal(t.core.ctx.style, "swiss");
});

test("setStyle re-renders the open details panel", () => {
  const t = skins({}, { storage: makeStorage() });
  t.core.ctx.sel = "n:a";
  t.skins.setStyle("dark");
  assert.match(t.$("pn").innerHTML, /Service A/);
});
