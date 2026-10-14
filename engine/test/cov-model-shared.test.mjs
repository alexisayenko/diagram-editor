import test from "node:test";
import assert from "node:assert/strict";
import { fail, FormatError } from "../lib/errors.mjs";
import { parseNotes } from "../model/notes.mjs";
import { parseConfig, checkConnections, processAnchors } from "../model/config.mjs";
import { mergeTypes, resolveTypes, RESERVED_TYPES } from "../parse/types.mjs";
import { validateGeometry } from "../render/validate.mjs";

function trap(fn) {
  try {
    return { ok: true, value: fn(), logged: [] };
  } catch (e) {
    if (!(e instanceof FormatError)) throw e;
    return { ok: false, code: 1, logged: [e.message] };
  }
}
const failure = (fn) => {
  const r = trap(fn);
  assert.equal(r.ok, false, "expected a failure");
  assert.equal(r.code, 1);
  return r.logged.join("\n");
};
const pass = (fn) => {
  const r = trap(fn);
  assert.equal(r.ok, true, r.logged.join("\n"));
  return r.value;
};

test("fail throws a FormatError and never exits", () => {
  assert.equal(failure(() => fail("boom")), "boom");
});


test("parseNotes: sections, dates, paragraphs", () => {
  const notes = pass(() => parseNotes("# Title\n\n## First\n\nDate: 2026-01-01\n\nOne\ntwo\n\nThree\n## Second\nDate:  x y \ntext\n"));
  assert.deepEqual(notes.map((n) => [n.title, n.date, n.paras, n.line]), [
    ["First", "2026-01-01", ["One two", "Three"], 3],
    ["Second", "x y", ["text"], 11],
  ]);
});

test("parseNotes: error messages carry the line number", () => {
  assert.match(failure(() => parseNotes("stray\n## A\n")), /line 1: text before the first/);
  assert.match(failure(() => parseNotes("## \nDate: x\ntext\n")), /line 1: empty note title/);
  assert.match(failure(() => parseNotes("## A\nnot a date\n")), /line 2: note "A": first line must be "Date: <stamp>"/);
  assert.match(failure(() => parseNotes("## A\nDate: x\n# bad\n")), /line 3: unexpected heading/);
  assert.match(failure(() => parseNotes("# only a title\n")), /no "## <title>" sections/);
  assert.match(failure(() => parseNotes("## A\n\n")), /line 1: note "A" has no "Date/);
  assert.match(failure(() => parseNotes("## A\nDate: x\n")), /line 1: note "A" has no text/);
});

const cfg = (o, dir = "/x/my-diagram") => pass(() => parseConfig(JSON.stringify(o), dir));
const cfgErr = (o, dir = "/x/my-diagram") => failure(() => parseConfig(typeof o === "string" ? o : JSON.stringify(o), dir));

test("parseConfig: defaults", () => {
  const c = cfg({ title: "T" });
  assert.equal(c.id, "my-diagram");
  assert.equal(c.proposedLabel, "Proposed");
  assert.deepEqual(c.edgeLabels, { request: "connection", dashed: "proposed move", firewall: "firewall on the path" });
  assert.deepEqual(c.groups, {});
  assert.deepEqual(c.processes, {});
});

test("parseConfig: overrides", () => {
  const c = cfg({ title: "T", id: "abc", proposedLabel: "Next", edgeLabels: { request: "call" }, groups: { g1: { label: "G", color: "#AABBCC", edges: ["a>b"] }, g2: { label: "H", color: "#112233", darkColor: "#445566", edges: ["b>c"] } }, processes: { "a>b": { from: "x" }, "b>c": { to: "y" } } });
  assert.equal(c.id, "abc");
  assert.equal(c.proposedLabel, "Next");
  assert.equal(c.edgeLabels.request, "call");
  assert.equal(c.edgeLabels.dashed, "proposed move");
  assert.deepEqual(c.groups.g1, { label: "G", color: "#AABBCC", darkColor: "#AABBCC", edges: ["a>b"] });
  assert.equal(c.groups.g2.darkColor, "#445566");
  assert.deepEqual(c.processes, { "a>b": { from: "x", to: null }, "b>c": { from: null, to: "y" } });
});

test("parseConfig: top-level errors", () => {
  assert.match(cfgErr("{nope"), /^diagram\.json: /);
  assert.match(cfgErr("[]"), /must be an object/);
  assert.match(cfgErr("null"), /must be an object/);
  assert.match(cfgErr({ title: "T", extra: 1, more: 2 }), /unknown key "extra", "more" \(allowed: title, id/);
  assert.match(cfgErr({}), /"title" must be a non-empty string/);
  assert.match(cfgErr({ title: "  " }), /"title" must be a non-empty string/);
  assert.match(cfgErr({ title: "T", id: "Bad Id" }), /id "Bad Id" must match/);
  assert.match(cfgErr({ title: "T" }, "/x/Bad_Folder"), /id "Bad_Folder" must match/);
  assert.match(cfgErr({ title: "T", legacyId: "x" }), /unknown key "legacyId"/);
  assert.match(cfgErr({ title: "T", edgeLabels: [] }), /"edgeLabels" must be an object/);
  assert.match(cfgErr({ title: "T", edgeLabels: { nope: "x" } }), /unknown edgeLabels key nope \(allowed: request, dashed, firewall\)/);
  assert.match(cfgErr({ title: "T", proposedLabel: "" }), /"proposedLabel" must be a non-empty string/);
});

test("parseConfig: group errors", () => {
  const g = (v) => cfgErr({ title: "T", groups: v });
  assert.match(g([]), /"groups" must be an object/);
  assert.match(g({ Bad: { label: "x", color: "#000000", edges: ["a>b"] } }), /group id "Bad" must match/);
  assert.match(g({ a: [] }), /"groups\.a" must be an object/);
  assert.match(g({ a: { label: "x", color: "#000000", edges: ["a>b"], zz: 1 } }), /unknown key "zz" in groups\.a/);
  assert.match(g({ a: { label: "x", edges: ["a>b"] } }), /groups\.a\.color must be #rrggbb/);
  assert.match(g({ a: { label: "x", color: "red", edges: ["a>b"] } }), /groups\.a\.color must be #rrggbb/);
  assert.match(g({ a: { label: "x", color: "#000000", darkColor: "#00", edges: ["a>b"] } }), /groups\.a\.darkColor must be #rrggbb/);
  assert.match(g({ a: { label: "x", color: "#000000", edges: [] } }), /groups\.a\.edges must be a non-empty list/);
  assert.match(g({ a: { label: "x", color: "#000000", edges: [1] } }), /groups\.a\.edges must be a non-empty list/);
  assert.match(g({ a: { color: "#000000", edges: ["a>b"] } }), /"groups\.a\.label" must be a non-empty string/);
});

test("parseConfig: process errors", () => {
  const p = (v) => cfgErr({ title: "T", processes: v });
  assert.match(p([]), /"processes" must be an object/);
  assert.match(p({ "a>b": {} }), /processes\.a>b needs "from" and\/or "to".*\{\}/);
  assert.match(p({ "a>b": { via: "x" } }), /processes\.a>b needs "from" and\/or "to"/);
  assert.match(p({ "a>b": { from: "" } }), /"processes\.a>b\.from" must be a non-empty string/);
  assert.match(p({ "a>b": 3 }), /"processes\.a>b" must be an object/);
});

test("checkConnections and processAnchors", () => {
  const nodes = new Map([["a", { body: ["Role: web", "Job: x"] }], ["b", { body: ["db"], jn: 1 }]]);
  pass(() => checkConnections({ groups: { g: { edges: ["a>b"] } }, processes: { "a>b": { from: "Role", to: null } } }, ["a>b", "b>a"], nodes));
  assert.match(failure(() => checkConnections({ groups: { g: { edges: ["x>y"] } }, processes: {} }, ["a>b"], nodes)), /groups\.g: connection "x>y" is not a connection of the diagram/);
  assert.match(failure(() => checkConnections({ groups: { g: { edges: ["a>b"] }, h: { edges: ["a>b"] } }, processes: {} }, ["a>b"], nodes)), /in groups "g" and "h"/);
  assert.match(failure(() => checkConnections({ groups: {}, processes: { "x>y": { from: "q", to: null } } }, ["a>b"], nodes)), /processes: connection "x>y" is not a connection of the diagram/);
  assert.match(failure(() => checkConnections({ groups: {}, processes: { "a>r": { from: null, to: "q" } } }, ["a>r"], nodes)), /processes\.a>r\.to: "r" is a region/);
  assert.match(failure(() => checkConnections({ groups: {}, processes: { "a>b": { from: "Nope", to: null } } }, ["a>b"], nodes)), /processes\.a>b\.from: no body line of "a" starts with "Nope"/);
  assert.match(failure(() => checkConnections({ groups: {}, processes: { "a>b": { from: null, to: "Role" } } }, ["a>b"], nodes)), /no body line of "b" starts with "Role"/);

  const withSvc = new Map([["a", { body: ["x", "Job: j", "Job: k"], svc: 1, jn: 0 }], ["b", { body: ["h", "Role", "svc"], jn: 1, svc: 1 }]]);
  assert.deepEqual(processAnchors({ "a>b": { from: "x", to: "Role" } }, withSvc), { "a>b": { fl: 0, tl: 1 } });
  assert.deepEqual(processAnchors({ "a>b": { from: "Job", to: null } }, withSvc), { "a>b": { fl: -1, tl: null } });
  assert.deepEqual(processAnchors(undefined, nodes), {});
});


test("mergeTypes: built-ins, overrides, new types", () => {
  const t = mergeTypes();
  assert.equal(t.web.tag, "WEB SERVER");
  assert.equal(t.oracle.db, true);
  const m = mergeTypes([{ id: "web", color: "#000000" }, { id: "queue", label: "Queue", color: "#123456" }, { id: "x" }]);
  assert.equal(m.web.color, "#000000");
  assert.equal(m.web.dark, "#F28FB0");
  assert.equal(m.web.label, "Web Server");
  assert.deepEqual(m.queue, { label: "Queue", color: "#123456", dark: "#123456", tag: "QUEUE" });
  assert.equal(m.x.tag, "");
  assert.equal(mergeTypes().web.color, "#C2185B");
  assert.deepEqual(RESERVED_TYPES, ["proposed"]);
});


const ir = ({ clusters = [], nodes = [], defs = {}, classes = {} }) => ({
  clusters: new Map(clusters.map((id) => [id, { id, title: id.toUpperCase() }])),
  nodes: new Map(nodes.map(([id, o = {}]) => [id, { id, title: id.toUpperCase(), body: [], ip: [], cluster: null, db: false, ...o }])),
  classDefs: new Map(Object.entries(defs)),
  classes: new Map(Object.entries(classes)),
});
const typed = (model, types, hidden = {}) =>
  resolveTypes({ ...model, types }, { nodes: Object.fromEntries([...model.nodes.keys()].map((k) => [k, { hidden: !!hidden[k] }])) }, "Next");
const TYPED = () => ir({
  clusters: ["r"],
  nodes: [["a", { cluster: "r", ip: ["10.0.0.1/24"] }], ["b", { cluster: "r", db: true }], ["c"]],
  defs: { web: "stroke:#112233", oracle: "stroke:#445566", proposed: "stroke:#000000" },
  classes: { r: ["web"], a: ["web"], b: ["oracle"], c: ["web", "proposed"] },
});

test("resolveTypes: entities, legend list and css", () => {
  const r = typed(TYPED());
  assert.equal(r.ent["c:r"].tag, "WEB SERVER");
  assert.equal(r.ent["n:a"].ty, "web");
  assert.equal(r.ent["n:b"].db, true);
  assert.equal(r.ent["n:c"].prop, true);
  assert.equal(r.ent["n:c"].tk, "proposed");
  assert.equal(r.ent["n:c"].tag, "WEB SERVER · PROPOSED");
  assert.deepEqual(r.typeList.map((t) => t.k), ["web", "oracle", "proposed"]);
  assert.equal(r.typeList[2].label, "Next");
  assert.equal(r.typeList[2].dash, true);
  assert.deepEqual(r.typeColors, { web: "#112233", oracle: "#445566" });
  assert.match(r.typeCss, /\[data-ty="web"\]\{--tc:var\(--t-web\)\}/);
  assert.match(r.typeCss, /:root\{--t-web:#112233;--t-oracle:#445566\}/);
  assert.match(r.typeCss, /\[data-style="dark"\]\{--t-web:#F28FB0;--t-oracle:#F2B24C\}/);
});

test("resolveTypes: custom types fill missing colours, infra types go last, hidden nodes skipped", () => {
  const r = typed(ir({ nodes: [["a"], ["n"]], defs: { web: "stroke:#112233" }, classes: { a: ["web"], n: ["nas"] } }), [{ id: "nas", color: "#101010" }]);
  assert.equal(r.typeColors.nas, "#101010");
  assert.equal(r.typeColors.cache, "#B8860B");
  assert.deepEqual(r.typeList.map((t) => [t.k, !!t.infra]), [["web", false], ["nas", true]]);
  const h = typed(ir({ nodes: [["a"], ["b"]], defs: { web: "stroke:#112233" }, classes: { a: ["web"] } }), undefined, { b: true });
  assert.deepEqual(Object.keys(h.ent), ["n:a"]);
});

test("resolveTypes: problems are reported together", () => {
  assert.match(failure(() => typed(ir({ nodes: [["a"]], defs: { weird: "stroke:#112233" }, classes: { a: ["weird"] } }))), /classDef "weird" is neither a known server type/);
  assert.match(failure(() => typed(ir({ nodes: [["a"]], defs: { web: "fill:#fff" }, classes: { a: ["web"] } }))), /classDef "web" has no stroke:#rrggbb colour/);
  const msg = failure(() => typed(ir({ nodes: [["a"], ["b"], ["c"]], defs: { web: "stroke:#112233" }, classes: { a: ["web"], b: ["weird"], c: ["web", "cache"] } })));
  assert.match(msg, /n:b: unknown class weird/);
  assert.match(msg, /n:b: needs exactly one server type class \(.*\), has none/);
  assert.match(msg, /n:c: needs exactly one server type class .*has web,cache/);
  assert.match(failure(() => typed(ir({ nodes: [["a"]], defs: { web: "stroke:#112233" }, classes: { a: ["cache"] } }))), /n:a: server type "cache" has no colour/);
});

const VMODEL = () => ir({ clusters: ["r"], nodes: [["a", { cluster: "r", ip: ["192.0.2.1/24"] }], ["b", { cluster: "r" }]] });
const good = () => ({
  layout: {
    clusters: { r: { x: 0, y: 0, w: 600, h: 300, title: [20, 20] } },
    nodes: { a: { x: 40, y: 100, w: 150, h: 60, body: [], ip: [[0, 150]] }, b: { x: 300, y: 100, w: 150, h: 60, body: [], ip: [] } },
    edges: { "a>b": {} },
  },
  model: VMODEL(),
});
const nm = { tl: 8, bl: 0, il: 0 };
const meta = () => ({ nodes: { a: { ...nm }, b: { ...nm } } });
const geomErr = (mut) => {
  const { layout, model } = good();
  mut?.(layout, model);
  return failure(() => validateGeometry(model, layout, meta()));
};

test("validateGeometry: header band, title and spacing checks", () => {
  assert.match(geomErr((l) => { l.nodes.a.y = 20; }), /node "a": box top incl\. 20px header .* intrudes into cluster "r" header band; needs >= 40/);
  assert.match(geomErr((l) => { l.clusters.r.title = [20, 5]; }), /cluster "r": title y 5 is outside its header band \(12\.\.26\)/);
  assert.match(geomErr((l) => { l.clusters.r.title = [20, 29]; }), /title y 29 is outside/);
  assert.match(geomErr((l) => { l.nodes.b.x = l.nodes.a.x + 10; }), /nodes "a" and "b": overlap -?[\d.]+px between drawn boxes/);
  assert.match(geomErr((l) => { l.nodes.b.x = 195; }), /nodes "a" and "b": gap [\d.]+px/);
  assert.match(geomErr((l) => { l.nodes.a.x = 2; }), /node "a": .*px to the left border of cluster "r"/);
});

test("validateGeometry: a clean layout passes, hidden servers are skipped and cluster/node separation is enforced", () => {
  const { layout, model } = good();
  pass(() => validateGeometry(model, layout, meta()));
  layout.nodes.b.hidden = true;
  layout.nodes.b.x = layout.nodes.a.x;
  pass(() => validateGeometry(model, layout, meta()));

  const two = ir({ clusters: ["r", "s"], nodes: [["a", { cluster: "r" }], ["b", { cluster: "s" }], ["c"]] });
  const l = {
    clusters: { r: { x: 0, y: 0, w: 300, h: 300, title: [20, 20] }, s: { x: 290, y: 0, w: 300, h: 300, title: [20, 20] } },
    nodes: { a: { x: 40, y: 100, w: 150, h: 60, body: [], ip: [] }, b: { x: 340, y: 100, w: 150, h: 60, body: [], ip: [] }, c: { x: 100, y: 120, w: 100, h: 60, body: [], ip: [] } },
    edges: {},
  };
  const msg = failure(() => validateGeometry(two, l, { nodes: { a: { ...nm }, b: { ...nm }, c: { ...nm } } }));
  assert.match(msg, /clusters "r" and "s": overlap/);
  assert.match(msg, /cluster "r" and node "c"|cluster "s" and node "c"/);
});
