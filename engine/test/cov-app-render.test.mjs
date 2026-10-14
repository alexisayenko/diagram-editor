import test from "node:test";
import assert from "node:assert/strict";
import { prepareDiagram, renderDiagram } from "../browser/render.mjs";
import { demo, mod, withFile } from "./helpers.mjs";

const assets = { cssSvg: "", cssPage: "", js: "" };
const base = () => prepareDiagram(demo(), "demo").layout;
const saved = (patch = {}) => ({ version: 1, diagramId: "demo", ...structuredClone(base()), ...patch });
const dataOf = (html) => JSON.parse(html.match(/id="layout-data">([\s\S]*?)<\/script>/)[1]);
const rejects = (s, re) => assert.throws(() => prepareDiagram(demo(), "demo", s), re);

test("a saved layout must be an object of the same diagram, version 1, with object sections", () => {
  rejects([], /Layout must be a JSON object/);
  rejects("text", /Layout must be a JSON object/);
  rejects(saved({ version: 2 }), /Unsupported saved layout version/);
  for (const k of ["nodes", "clusters", "edges"]) rejects(saved({ [k]: [] }), new RegExp(`Layout '${k}' must be an object`));
  assert.doesNotThrow(() => prepareDiagram(demo(), "demo", null));
  assert.doesNotThrow(() => prepareDiagram(demo(), "demo", { nodes: {} }));
});

test("saved regions and servers with broken geometry are rejected by name", () => {
  const s = saved(), bad = (n) => { const c = structuredClone(s); n(c); return c; };
  rejects(bad((c) => { c.clusters.web.w = 0; }), /Invalid saved region geometry: web/);
  rejects(bad((c) => { c.clusters.web.x = "1"; }), /Invalid saved region geometry: web/);
  rejects(bad((c) => { c.clusters.web.title = [1]; }), /Invalid saved region geometry: web/);
  rejects(bad((c) => { c.nodes.db01.h = -5; }), /Invalid saved server geometry: db01/);
  rejects(bad((c) => { c.nodes.db01.title = null; }), /Invalid saved server geometry: db01/);
});

test("saved connections keep valid waypoints and label positions, and reject malformed ones", () => {
  const s = saved(), key = Object.keys(s.edges)[0];
  const withEdge = (v) => ({ ...s, edges: { ...s.edges, [key]: v } });
  const ok = prepareDiagram(demo(), "demo", withEdge({ via: [[10, 20], [30, 40]], label: [5, 6] }));
  assert.deepEqual(ok.layout.edges[key].via, [[10, 20], [30, 40]]);
  assert.deepEqual(ok.layout.edges[key].label, [5, 6]);
  rejects(withEdge("nope"), /Invalid saved connection/);
  rejects(withEdge({ via: "x" }), /Invalid connection waypoints/);
  rejects(withEdge({ via: [[1, "a"]] }), /Invalid connection waypoints/);
  rejects(withEdge({ label: [1] }), /Invalid connection label position/);
});

test("saved positions are kept and a refit server is re-measured instead of keeping its old width", () => {
  const s = saved();
  s.nodes.db01.x = 777;
  s.nodes.db01.w = 999;
  const kept = prepareDiagram(demo(), "demo", s).layout.nodes.db01, refit = prepareDiagram(demo(), "demo", s, ["db01"]).layout.nodes.db01;
  assert.equal(kept.x, 777);
  assert.equal(refit.x, 777);
  assert.ok(refit.w < 999);
  assert.ok(kept.w >= 999 || kept.w > refit.w);
});

test("a saved server shorter than its content grows to fit it", () => {
  const s = saved();
  s.nodes.app01.h = 10;
  assert.ok(prepareDiagram(demo(), "demo", s).layout.nodes.app01.h > 10);
});

test("objects missing from the saved layout are placed automatically, and removed ones are dropped", () => {
  const s = saved();
  delete s.nodes.db02;
  s.nodes.ghost = { x: 1, y: 1, w: 10, h: 10, title: [1, 1] };
  const r = prepareDiagram(demo(), "demo", s);
  assert.ok(r.layout.nodes.db02);
  assert.equal(r.layout.nodes.ghost, undefined);
});

test("drawings in the saved layout are validated and carried to the page data", () => {
  const stroke = { id: "s1", color: "#3b82f6", width: 2, points: [[1, 1], [9, 9]] };
  const html = renderDiagram(demo(), "demo", saved({ drawings: [stroke] }), assets).html;
  assert.equal(dataOf(html).drawings.length, 1);
  assert.equal(dataOf(renderDiagram(demo(), "demo", null, assets).html).drawings.length, 0);
});

test("renderDiagram reports the id, notes and how many spacing problems the layout has", () => {
  const clean = renderDiagram(demo(), "demo", null, assets);
  assert.equal(clean.id, "demo");
  assert.equal(clean.problems, 0);
  assert.ok(clean.notes.length >= 1 && typeof clean.notes[0] === "string");
  const s = saved();
  s.nodes.db02.x = s.nodes.db01.x;
  s.nodes.db02.y = s.nodes.db01.y;
  assert.ok(renderDiagram(demo(), "demo", s, assets).problems > 0);
});

test("a connection naming an unknown server stops the render with a clear message", () => {
  const files = mod(demo(), "topology.toml", 'from = "web01"', 'from = "ghost"');
  assert.throws(() => renderDiagram(files, "demo", null, assets), /ghost>app01: unknown connection endpoint/);
});

test("an extra networks.toml changes the networks shown in the page data", () => {
  const files = withFile(demo(), "networks.toml", '[[networks]]\ncidr = "198.51.100.0/24"\nname = "Extra"\n');
  const nets = dataOf(renderDiagram(files, "demo", null, assets).html).nets;
  assert.ok(JSON.stringify(nets).includes("Extra"));
});

test("a layout of another diagram id is a warning, not an error", () => {
  const r = prepareDiagram(demo(), "demo", saved({ diagramId: "other" }));
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /"other".*"demo"/);
  assert.deepEqual(prepareDiagram(demo(), "demo", saved()).warnings, []);
});

test("the diagram page carries a CSP meta that blocks connections and external scripts, and hostile text stays escaped", () => {
  const files = demo();
  files.set("topology.toml", files.get("topology.toml") + "\n");
  const { html } = renderDiagram(files, "demo", null, assets, []);
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
  assert.ok(csp, "CSP meta present");
  assert.ok(html.indexOf("Content-Security-Policy") < html.indexOf("<style"));
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /img-src data: blob:/);
  assert.doesNotMatch(csp, /script-src[^;]*https?:/);
  assert.equal([...html.matchAll(/<script(?![^>]*type="application\/json")[^>]*\bsrc=/g)].length, 0);
});
