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

const EXTRA = '<text class="ct" data-ent="c:r1">Region 1</text><g class="osg" data-ent="n:a"></g><rect class="ch" data-ent="n:a"></rect><text class="nb" data-ent="n:a">badge-text</text><g id="rh"></g><g class="dwp hot"></g>';

function app(over, opts = {}, o = {}) {
  const f = fixture(over);
  const t = loadUi(["ui/init"], { ...f, ...opts });
  t.doc.querySelector("svg").insertAdjacentHTML("beforeend", EXTRA);
  t.init = t.modules["ui/init"];
  t.core = t.modules["ui/core"];
  t.editing = false;
  t.api = { getState: state, isEdit: () => t.editing, fit: () => { t.fits = (t.fits || 0) + 1; }, ...o };
  t.sel = () => t.core.ctx.sel;
  t.svgEl = (cls) => t.core.svg.querySelector("." + cls);
  t.click = (target, props = {}) => t.fire(target, "click", { clientX: 40, clientY: 10, ...props });
  return t;
}

test("init: wires up the app, applies the default style and exports the console API", () => {
  const t = app();
  t.init.init(t.api);
  assert.equal(t.core.ctx.ready, true);
  assert.equal(t.core.ctx.style, "clean");
  assert.equal(t.doc.documentElement.dataset.style, "clean");
  assert.ok(t.$("lg").querySelector(".sw"), "legend built");
  assert.equal(t.$("nh").getAttribute("aria-expanded"), "true");
  assert.equal(t.fits, 1);
  for (const k of ["setStyle", "toggle", "showAll", "select", "exportSvg", "md", "related", "setNet"]) assert.equal(typeof t.ID[k], "function", k);
  assert.equal(t.ID.ctx, t.core.ctx);
  assert.equal(t.ID.md("# x"), "<h1>x</h1>");
});

test("init: style comes from ?style=, else from storage, else clean; junk is ignored", () => {
  let t = app({}, { globals: { location: { search: "?a=1&style=dark", href: "http://localhost/d.html" } }, storage: makeStorage({ data: { "d1-style": "swiss" } }) });
  t.init.init(t.api);
  assert.equal(t.core.ctx.style, "dark");
  t = app({}, { storage: makeStorage({ data: { "d1-style": "swiss" } }) });
  t.init.init(t.api);
  assert.equal(t.core.ctx.style, "swiss");
  t = app({}, { globals: { location: { search: "?style=neon", href: "http://localhost/d.html" } }, storage: makeStorage({ data: { "d1-style": "nope" } }) });
  t.init.init(t.api);
  assert.equal(t.core.ctx.style, "clean");
});

test("init: skin buttons switch and persist the style, export buttons download files", () => {
  const t = app();
  t.init.init(t.api);
  t.fire(t.doc.querySelector('#ss button[data-s="dark"]'), "click");
  assert.equal(t.core.ctx.style, "dark");
  assert.equal(t.sandbox.localStorage.getItem("d1-style"), "dark");
  t.fire(t.$("xs"), "click");
  assert.deepEqual(t.doc.downloads.map((d) => d.download), ["d1-dark.svg"]);
});

test("init: fonts becoming ready rebuild the chrome and refit, except in Sketch", async () => {
  let t = app({}, { storage: makeStorage() });
  t.doc.fonts = { ready: Promise.resolve() };
  t.init.init(t.api);
  await new Promise((r) => setImmediate(r));
  assert.equal(t.fits, 2, "setStyle fit plus fonts fit");
  t = app({}, { storage: makeStorage({ data: { "d1-style": "sketch" } }) });
  t.doc.fonts = { ready: Promise.resolve() };
  t.init.init(t.api);
  await new Promise((r) => setImmediate(r));
  assert.equal(t.fits || 0, 0);
  t = app();
  t.doc.fonts = { ready: Promise.reject(new Error("no fonts")) };
  t.init.init(t.api);
  await new Promise((r) => setImmediate(r));
});

test("click on a server title or region title selects it", () => {
  const t = app();
  t.init.init(t.api);
  t.click(t.svgEl("nt"));
  assert.equal(t.sel(), "n:a");
  t.click(t.svgEl("ct"));
  assert.equal(t.sel(), "c:r1");
  t.click(t.core.svg.querySelectorAll(".nt")[1]);
  assert.equal(t.sel(), "n:b");
  assert.match(t.$("pn").innerHTML, /Service B/);
});

test("click on an OS group selects its server", () => {
  const t = app();
  t.init.init(t.api);
  t.click(t.svgEl("osg"));
  assert.equal(t.sel(), "n:a");
});

test("click on a card body only selects when above the node's top edge", () => {
  const t = app();
  t.init.init(t.api);
  t.core.svg.ctm = { f: 0, d: 1 };
  t.click(t.svgEl("ch"), { clientY: 100 });
  assert.equal(t.sel(), null);
  t.click(t.svgEl("ch"), { clientY: 10 });
  assert.equal(t.sel(), "n:a");
  t.core.svg.ctm = null;
  t.fire(t.core.svg, "click", {});
  assert.equal(t.sel(), null);
  t.click(t.svgEl("ch"));
  assert.equal(t.sel(), "n:a", "without a matrix y falls back to 0");
});

test("click on a name badge or IP pill copies its text", () => {
  const t = app();
  t.init.init(t.api);
  t.click(t.svgEl("nb"), { clientX: 30, clientY: 50 });
  assert.equal(t.$("ch").textContent, "Copied");
  assert.equal(t.$("ch").style.left, "42px");
  assert.equal(t.sel(), null, "copying does not select");
  t.$("ch").textContent = "";
  const pill = t.core.els[0].querySelector(".ip");
  assert.ok(pill, "skin built an IP pill");
  t.click(pill);
  assert.equal(t.$("ch").textContent, "Copied");
});

test("click on empty canvas, an edge or a gap clears the selection", () => {
  const t = app();
  t.init.init(t.api);
  t.click(t.svgEl("nt"));
  t.click(t.$("el1"));
  assert.equal(t.sel(), null);
  t.click(t.svgEl("nt"));
  t.click(t.core.svg);
  assert.equal(t.sel(), null);
});

test("click on a network button on the canvas toggles the network filter", () => {
  const t = app();
  t.init.init(t.api);
  t.click(t.svgEl("nwb"));
  assert.equal(t.core.ctx.net, 0);
  t.click(t.svgEl("nwb"));
  assert.equal(t.core.ctx.net, null);
});

test("edit mode ignores canvas clicks and Enter/Space on network buttons", () => {
  const t = app();
  t.init.init(t.api);
  t.editing = true;
  t.click(t.svgEl("nt"));
  assert.equal(t.sel(), null);
  t.fire(t.svgEl("nwb"), "keydown", { key: "Enter" });
  assert.equal(t.core.ctx.net, null);
});

test("keyboard: Enter or Space on a network button toggles it, other keys and targets do not", () => {
  const t = app();
  t.init.init(t.api);
  const b = t.svgEl("nwb");
  assert.equal(t.fire(b, "keydown", { key: "Enter" }), false);
  assert.equal(t.core.ctx.net, 0);
  t.fire(b, "keydown", { key: " " });
  assert.equal(t.core.ctx.net, null);
  assert.equal(t.fire(b, "keydown", { key: "a" }), true);
  t.fire(t.svgEl("nt"), "keydown", { key: "Enter" });
  assert.equal(t.core.ctx.net, null);
});

test("Escape clears the selection and the network filter; other keys do nothing", () => {
  const t = app();
  t.init.init(t.api);
  t.click(t.svgEl("nt"));
  t.click(t.svgEl("nwb"));
  t.fire(t.doc, "keydown", { key: "x" });
  assert.equal(t.sel(), "n:a");
  assert.equal(t.core.ctx.net, 0);
  t.fire(t.doc, "keydown", { key: "Escape" });
  assert.equal(t.sel(), null);
  assert.equal(t.core.ctx.net, null);
  t.fire(t.doc, "keydown", { key: "Escape" });
});

test("details panel: Close clears the selection, a network button inside toggles the filter", () => {
  const t = app({ sections: { "Service A": "Host 192.0.2.10 here" } });
  t.init.init(t.api);
  t.click(t.svgEl("nt"));
  const nwd = t.$("pn").querySelector(".nwd");
  assert.ok(nwd);
  t.click(nwd);
  assert.equal(t.core.ctx.net, 0);
  t.click(t.$("pn").querySelector("h1"));
  assert.equal(t.sel(), "n:a");
  t.click(t.$("pc"));
  assert.equal(t.sel(), null);
  assert.ok(t.$("pn").hidden === true);
});

test("editChanged(true) resets selection and filter once ready; false or not ready does nothing", () => {
  const t = app();
  t.init.editChanged(true);
  t.init.init(t.api);
  t.click(t.svgEl("nt"));
  t.click(t.svgEl("nwb"));
  t.init.editChanged(false);
  assert.equal(t.sel(), "n:a");
  t.init.editChanged(true);
  assert.equal(t.sel(), null);
  assert.equal(t.core.ctx.net, null);
  const u = app();
  u.core.ctx.sel = "n:a";
  u.init.editChanged(true);
  assert.equal(u.core.ctx.sel, "n:a", "not ready");
});

const CSS = "a{fill:red}@media (prefers-color-scheme: dark){/*DARK<*/b{fill:blue}/*>DARK*/}c{x:1}</style";

function exporter(over, opts = {}) {
  const t = loadUi(["ui/export-image"], { ...fixture(over), ...opts });
  t.doc.getElementById("css-svg").textContent = CSS;
  t.ei = t.modules["ui/export-image"];
  t.core = t.modules["ui/core"];
  t.core.svg.insertAdjacentHTML("beforeend", EXTRA.replace('<g class="dwp hot">', '<g class="dwp hot">'));
  return t;
}

test("exportSvg: standalone file with resolved CSS, background, legend and notes columns", () => {
  const t = exporter();
  t.core.els[0].setAttribute("data-e", "1");
  t.core.svg.classList.add("edit", "zoomed", "panning", "draw-pencil", "draw-eraser");
  t.core.svg.setAttribute("style", "transform:x");
  const r = t.ei.exportSvg();
  assert.ok(r.text.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg'));
  assert.equal(r.w, 600 + 250 + 30 + 200);
  assert.ok(r.h >= 400);
  assert.match(r.text, /viewBox="-200 0 1080 \d+"/);
  assert.match(r.text, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(r.text, /data-style="clean"/);
  assert.ok(r.text.includes("<style>a{fill:red}c{x:1}<\\/style</style>"), "light CSS only, closing tag escaped");
  assert.ok(!r.text.includes("fill:blue"));
  assert.match(r.text, /<rect x="-200" y="0" width="1080" height="\d+" fill="#F3F5F9"\/?>/);
  assert.ok(!r.text.includes('class="nwb"'));
  assert.ok(!r.text.includes('id="rh"'));
  assert.ok(!r.text.includes("hot"));
  assert.ok(!r.text.includes("data-e="));
  assert.ok(!r.text.includes("zoomed"));
  assert.ok(!r.text.includes("draw-pencil"));
  assert.ok(!r.text.includes("transform:x"));
  assert.match(r.text, /<g class="xn">/);
  assert.match(r.text, /<g class="xl">/);
  assert.ok(t.core.svg.classList.contains("zoomed"), "the live svg is untouched");
});

test("exportSvg: without notes only the legend column is added; a fit viewBox is honoured", () => {
  const t = exporter({ notes: [] });
  t.core.svg.setAttribute("data-fit", "10 20 300 200");
  const r = t.ei.exportSvg();
  assert.equal(r.w, 300 + 200);
  assert.ok(!r.text.includes('class="xn"'));
  assert.match(r.text, /viewBox="-190 20 500 \d+"/);
  assert.ok(!r.text.includes("data-fit"));
});

test("exportSvg: dark style adds the grid; sketch picks the background from the colour scheme", () => {
  let t = exporter();
  t.core.ctx.style = "dark";
  let r = t.ei.exportSvg();
  assert.match(r.text, /<pattern id="grid"/);
  assert.match(r.text, /fill="#0A1020"/);
  assert.match(r.text, /fill="url\(#grid\)"/);
  t = exporter();
  t.core.ctx.style = "sketch";
  assert.match(t.ei.exportSvg().text, /fill="#ffffff"/);
  t = exporter({}, { globals: { matchMedia: () => ({ matches: true }) } });
  t.core.ctx.style = "sketch";
  r = t.ei.exportSvg();
  assert.match(r.text, /fill="#16181c"/);
  assert.ok(r.text.includes("b{fill:blue}"), "dark CSS block is inlined");
  t = exporter();
  t.core.ctx.style = "swiss";
  assert.match(t.ei.exportSvg().text, /fill="#FFFFFF"/);
});

test("exportSvg: a matchMedia that throws counts as light, CSS without a dark block passes through", () => {
  const t = exporter({}, { globals: { matchMedia: () => { throw new Error("no"); } } });
  t.doc.getElementById("css-svg").textContent = "plain{}";
  assert.ok(t.ei.exportSvg().text.includes("<style>plain{}</style>"));
});

test("downloadSvg saves an SVG blob named after the diagram and style", () => {
  const t = exporter();
  t.ei.downloadSvg();
  assert.deepEqual(t.doc.downloads.map((d) => d.download), ["d1-clean.svg"]);
  assert.equal(t.urls[0].type, "image/svg+xml");
  assert.ok(t.urls[0].parts[0].startsWith("<?xml"));
});

test("downloadPng rasterises the SVG at up to 2x and saves the blob", () => {
  const t = exporter({}, { globals: { Image: class { set src(v) { this.loadedSrc = v; t.img = this; this.onload(); } } } });
  t.ei.downloadPng();
  const x = t.ei.exportSvg(), sc = Math.min(2, 8000 / Math.max(x.w, x.h));
  assert.ok(t.img.loadedSrc.startsWith("data:image/svg+xml;charset=utf-8,%3C%3Fxml"));
  assert.equal(t.doc.draws.length, 1);
  assert.deepEqual(t.doc.draws[0].slice(3), [Math.round(x.w * sc), Math.round(x.h * sc)]);
  assert.deepEqual(t.doc.downloads.map((d) => d.download), ["d1-clean.png"]);
});

test("downloadPng saves nothing when the canvas cannot produce a blob", () => {
  const t = exporter({}, { globals: { Image: class { set src(v) { this.onload(); } } } });
  t.doc.nullBlob = true;
  t.ei.downloadPng();
  assert.equal(t.doc.downloads.length, 0);
});

test("export columns: legend lists types, the infrastructure group, connection key and the active network", () => {
  const t = loadUi(["ui/export-columns"], fixture());
  const cols = t.modules["ui/export-columns"], ctx = t.modules["ui/core"].ctx;
  let r = cols.legendSvg(0, 0);
  assert.equal(r.w, 190);
  assert.match(r.h, /SERVER TYPES/);
  assert.match(r.h, /OTHER INFRASTRUCTURE/);
  assert.match(r.h, /<rect class="sf" data-ty="web"/);
  assert.match(r.h, /<rect class="sd" data-ty="db"/);
  assert.match(r.h, /CONNECTIONS/);
  assert.match(r.h, /<g transform="translate\(8 \d+\)"><path\/><\/g>|<g transform="translate\(8 \d+\)"><path\/>/);
  assert.match(r.h, /<text x="58" y="\d+">Link<\/text>/);
  assert.ok(!r.h.includes("NETWORK FILTER"));
  assert.match(r.h, /rx="6"/);
  ctx.net = 0;
  const r2 = cols.legendSvg(0, 0);
  assert.match(r2.h, /NETWORK FILTER/);
  assert.match(r2.h, /192\.0\.2\.0\/24 Net One/);
  assert.ok(r2.bottom > r.bottom);
  ctx.net = 1;
  assert.match(cols.legendSvg(0, 0).h, />198\.51\.100\.0\/24 </);
});

test("export columns: Swiss legend has square corners and the filter name wraps", () => {
  const t = loadUi(["ui/export-columns"], fixture({ nets: [{ cidr: "", name: "A very long network name that must wrap across lines", m: [] }], types: [{ k: "web", ty: "web", label: "Web" }] }));
  const ctx = t.modules["ui/core"].ctx;
  ctx.style = "swiss";
  ctx.net = 0;
  const h = t.modules["ui/export-columns"].legendSvg(0, 0).h;
  assert.match(h, /<rect class="c"[^>]*rx="0"/);
  assert.match(h, /<rect class="sf"[^>]*rx="0"/);
  assert.ok(!h.includes("OTHER INFRASTRUCTURE"));
  assert.ok((h.match(/<text x="10"/g) || []).length >= 2, "wrapped lines");
});

test("export columns: notes are wrapped into cards, escaped, and stacked", () => {
  const notes = [
    { title: "A rather long note title that needs to wrap around", date: "2026-03-04", paras: ["First paragraph with <b>markup</b> & enough words to wrap onto a second line of the card", "Second"] },
    { title: "Short", date: "2026-03-05", paras: [] },
  ];
  const t = loadUi(["ui/export-columns"], fixture({ notes }));
  const cols = t.modules["ui/export-columns"], ctx = t.modules["ui/core"].ctx;
  const r = cols.notesSvg(100, 10);
  assert.equal(r.w, 250);
  assert.equal((r.h.match(/<rect class="c"/g) || []).length, 2);
  assert.ok((r.h.match(/<text class="h"/g) || []).length >= 3, "title wrapped");
  assert.match(r.h, /&lt;b&gt;markup&lt;\/b&gt; &amp;/);
  assert.match(r.h, /<text class="m"[^>]*text-anchor="end">2026-03-04<\/text>/);
  assert.match(r.h, /rx="2"/);
  assert.ok(r.bottom > 10);
  for (const [style, rx] of [["swiss", "0"], ["dark", "4"], ["sketch", "2"]]) {
    ctx.style = style;
    assert.match(cols.notesSvg(0, 0).h, new RegExp('<rect class="c"[^>]*rx="' + rx + '"'));
  }
});
