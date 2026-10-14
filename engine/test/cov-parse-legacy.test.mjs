import test from "node:test";
import assert from "node:assert/strict";
import { fail } from "../lib/util.mjs";
import { parseLayout } from "../parse/layout.mjs";
import { parseNotes } from "../parse/notes.mjs";
import { parseDocuments } from "../parse/documents.mjs";
import { parseConfig, checkConnections, processAnchors } from "../parse/config.mjs";
import { parseMmd, isDashed, endKey, edgeKey } from "../parse/mmd.mjs";
import { parseNetworks, networkMembers, ipNetworks } from "../parse/networks.mjs";
import { mergeTypes, resolveTypes, RESERVED_TYPES } from "../parse/types.mjs";
import { validateGeometry } from "../parse/validate.mjs";

class Exit extends Error {}

function trap(fn) {
  const origExit = process.exit, origErr = console.error, logged = [];
  process.exit = (code) => { throw Object.assign(new Exit("exit"), { code }); };
  console.error = (m) => logged.push(m);
  try {
    return { ok: true, value: fn(), logged };
  } catch (e) {
    if (!(e instanceof Exit)) throw e;
    return { ok: false, code: e.code, logged };
  } finally {
    process.exit = origExit;
    console.error = origErr;
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

test("fail prefixes the message and exits with code 1", () => {
  assert.equal(failure(() => fail("boom")), "build: boom");
});

test("parseLayout rejects retired keys and passes the rest", () => {
  assert.match(failure(() => parseLayout('{"notes":[]}')), /notes live in notes\.md/);
  assert.match(failure(() => parseLayout('{"legend":{}}')), /legend is a page panel/);
  assert.deepEqual(pass(() => parseLayout('{"nodes":{}}')), { nodes: {} });
});

test("parseNotes: sections, dates, paragraphs", () => {
  const notes = pass(() => parseNotes("# Title\n\n## First\n\nDate: 2026-01-01\n\nOne\ntwo\n\nThree\n## Second\nDate:  x y \ntext\n"));
  assert.deepEqual(notes.map((n) => [n.title, n.date, n.paras, n.line]), [
    ["First", "2026-01-01", ["One two", "Three"], 3],
    ["Second", "x y", ["text"], 11],
  ]);
});

test("parseNotes: error messages carry the line number", () => {
  assert.match(failure(() => parseNotes("stray\n## A\n")), /notes\.md:1: text before the first/);
  assert.match(failure(() => parseNotes("## \nDate: x\ntext\n")), /notes\.md:1: empty note title/);
  assert.match(failure(() => parseNotes("## A\nnot a date\n")), /notes\.md:2: note "A": first line must be "Date: <stamp>"/);
  assert.match(failure(() => parseNotes("## A\nDate: x\n# bad\n")), /notes\.md:3: unexpected heading/);
  assert.match(failure(() => parseNotes("# only a title\n")), /no "## <title>" sections/);
  assert.match(failure(() => parseNotes("## A\n\n")), /notes\.md:1: note "A" has no "Date/);
  assert.match(failure(() => parseNotes("## A\nDate: x\n")), /notes\.md:1: note "A" has no text/);
});

test("parseDocuments: links with and without descriptions", () => {
  const docs = pass(() => parseDocuments("# Docs\n\n- [A](https://a.example.test/x)\n* [B ](http://b.example.test) — About B\n- [C](https://c.example.test) - dash\n"));
  assert.deepEqual(docs, [
    { title: "A", url: "https://a.example.test/x", desc: "" },
    { title: "B", url: "http://b.example.test", desc: "About B" },
    { title: "C", url: "https://c.example.test", desc: "dash" },
  ]);
});

test("parseDocuments: bad lines and empty files fail", () => {
  assert.match(failure(() => parseDocuments("- [A](ftp://a.example.test)\n")), /documents\.md:1: expected "- \[title\]/);
  assert.match(failure(() => parseDocuments("plain text\n")), /documents\.md:1/);
  assert.match(failure(() => parseDocuments("# Docs\n\n")), /documents\.md: no links/);
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
  assert.match(cfgErr("{nope"), /^build: diagram\.json: /);
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
  assert.match(failure(() => checkConnections({ groups: { g: { edges: ["x>y"] } }, processes: {} }, ["a>b"], nodes)), /groups\.g: connection "x>y" is not in diagram\.mmd/);
  assert.match(failure(() => checkConnections({ groups: { g: { edges: ["a>b"] }, h: { edges: ["a>b"] } }, processes: {} }, ["a>b"], nodes)), /in groups "g" and "h"/);
  assert.match(failure(() => checkConnections({ groups: {}, processes: { "x>y": { from: "q", to: null } } }, ["a>b"], nodes)), /processes: connection "x>y" is not in diagram\.mmd/);
  assert.match(failure(() => checkConnections({ groups: {}, processes: { "a>r": { from: null, to: "q" } } }, ["a>r"], nodes)), /processes\.a>r\.to: "r" is a region/);
  assert.match(failure(() => checkConnections({ groups: {}, processes: { "a>b": { from: "Nope", to: null } } }, ["a>b"], nodes)), /processes\.a>b\.from: no body line of "a" starts with "Nope"/);
  assert.match(failure(() => checkConnections({ groups: {}, processes: { "a>b": { from: null, to: "Role" } } }, ["a>b"], nodes)), /no body line of "b" starts with "Role"/);

  const withSvc = new Map([["a", { body: ["x", "Job: j", "Job: k"], svc: 1, jn: 0 }], ["b", { body: ["h", "Role", "svc"], jn: 1, svc: 1 }]]);
  assert.deepEqual(processAnchors({ "a>b": { from: "x", to: "Role" } }, withSvc), { "a>b": { fl: 0, tl: 1 } });
  assert.deepEqual(processAnchors({ "a>b": { from: "Job", to: null } }, withSvc), { "a>b": { fl: -1, tl: null } });
  assert.deepEqual(processAnchors(undefined, nodes), {});
});

const MMD = [
  "flowchart LR",
  "%% a comment",
  'subgraph r1["Region #quot;1#quot; #35;"]',
  '  a["Server A<br/>role one<br>10.0.0.1/24<br />192.0.2.5/24"]',
  '  db1[("DB &1")]',
  "end",
  'b["Server B"]',
  'a -->|"call · firewall"| b',
  "a -.->|plain| db1",
  "b --> a",
  "linkStyle 0,1 stroke-dasharray: 3",
  "classDef web stroke:#112233",
  "class a,b web",
  "style a fill:#fff",
].join("\n");

test("parseMmd: clusters, nodes, edges, styles", () => {
  const m = parseMmd(MMD);
  assert.deepEqual([...m.clusters.values()], [{ id: "r1", title: 'Region "1" #' }]);
  const a = m.nodes.get("a");
  assert.deepEqual([a.title, a.body, a.ip, a.cluster, a.db], ["Server A", ["role one"], ["10.0.0.1/24", "192.0.2.5/24"], "r1", false]);
  assert.equal(m.nodes.get("db1").db, true);
  assert.equal(m.nodes.get("b").cluster, null);
  assert.deepEqual(m.edges, [
    { from: "a", to: "b", label: "call", fw: true, dashed: false },
    { from: "a", to: "db1", label: "plain", fw: false, dashed: true },
    { from: "b", to: "a", label: "", fw: false, dashed: false },
  ]);
  assert.equal(m.classDefs.get("web"), "stroke:#112233");
  assert.deepEqual(m.classes.get("a"), ["web"]);
  assert.equal(isDashed(m, 0), true);
  assert.equal(isDashed(m, 2), false);
  assert.equal(endKey(m, "a"), "n:a");
  assert.equal(endKey(m, "r1"), "c:r1");
  assert.equal(edgeKey(m.edges[0]), "a>b");
});

test("parseMmd: unknown entity codes stay, unsupported syntax and trailing text fail", () => {
  assert.equal(parseMmd('a["x #zzz; y"]').nodes.get("a").title, "x #zzz; y");
  assert.match(failure(() => parseMmd("flowchart LR\nwhat is this")), /diagram\.mmd:2: unsupported syntax: what is this/);
  assert.match(failure(() => parseMmd('a["T<br/>10.0.0.1/24<br/>late"]')), /diagram\.mmd:1: text line "late" after IP lines in node a/);
});

const NETS = "# Networks\n\n- `10.0.0.0/16` Corp\n  - `10.0.1.0/24` Servers\n  - Group\n    - `10.0.2.0/24` DMZ\n- `192.0.2.0/24` Lab\n";
test("parseNetworks: nesting, ranges, groups", () => {
  const items = pass(() => parseNetworks(NETS));
  assert.deepEqual(items.map((i) => [i.cidr, i.name, i.depth, i.parent]), [
    ["10.0.0.0/16", "Corp", 0, -1], ["10.0.1.0/24", "Servers", 1, 0], ["", "Group", 1, 0], ["10.0.2.0/24", "DMZ", 2, 2], ["192.0.2.0/24", "Lab", 0, -1],
  ]);
  assert.deepEqual([items[1].lo, items[1].hi], [167772416, 167772671]);
  assert.equal(pass(() => parseNetworks("- `192.0.2.0/24` A\n\t- `192.0.2.0/25` B\n"))[1].depth, 1);
});

test("parseNetworks: errors", () => {
  assert.match(failure(() => parseNetworks("hello")), /networks\.md:1: expected "- `a\.b\.c\.d\/nn` Name"/);
  assert.match(failure(() => parseNetworks("  - `10.0.0.0/8` X\n")), /networks\.md:1: top-level item must not be indented/);
  assert.match(failure(() => parseNetworks("- `10.0.0.0/33` X\n")), /invalid CIDR "10\.0\.0\.0\/33"/);
  assert.match(failure(() => parseNetworks("- `10.0.0.300/24` X\n")), /invalid CIDR/);
  assert.match(failure(() => parseNetworks("- `10.0.0.5/24` X\n")), /host bits set; network address is 10\.0\.0\.0\/24/);
  assert.match(failure(() => parseNetworks("- `10.0.0.0/24` X\n  - `10.0.1.0/24` Y\n")), /10\.0\.1\.0\/24 is not inside its parent 10\.0\.0\.0\/24 \(X\)/);
  assert.match(failure(() => parseNetworks("- `10.0.0.0/24` X\n- `10.0.0.0/24` Y\n")), /networks\.md:2: 10\.0\.0\.0\/24 already listed on line 1/);
  assert.match(failure(() => parseNetworks("- Empty group\n")), /grouping item "Empty group" has no CIDR and no children/);
  assert.match(failure(() => parseNetworks("# t\n")), /networks\.md: no networks/);
});

test("networkMembers and ipNetworks", () => {
  const items = parseNetworks(NETS);
  const model = parseMmd('subgraph r["R"]\n  a["A<br/>10.0.1.5/24"]\n  b["B<br/>10.0.2.7/24<br/>192.0.2.9/24"]\nend\nc["C<br/>10.0.9.9/16"]\nh["H<br/>10.0.1.6/24"]');
  const layout = { nodes: { a: {}, b: {}, c: {}, h: { hidden: true } } };
  const members = networkMembers(items, model, layout);
  assert.deepEqual(members.map((m) => [m.name, m.hosts]), [["Corp", 3], ["Servers", 1], ["Group", 1], ["DMZ", 1], ["Lab", 1]]);
  assert.deepEqual(members[1].m, ["n:a", "c:r"]);
  assert.deepEqual(members[4].m, ["n:b", "c:r"]);

  const out = ipNetworks(items, ["10.0.1.5 and 10.0.1.5 again 10.0.2.9/24", "10.0.1.0 net 10.0.1.0/24 999.1.1.1 1.2.3.4.5", "198.51.100.1 192.0.2.0 192.0.2.8"]);
  assert.equal(out["10.0.1.5"], 1);
  assert.equal(out["10.0.2.9"], 3);
  assert.equal(out["10.0.1.0"], undefined);
  assert.equal(out["999.1.1.1"], undefined);
  assert.equal(out["198.51.100.1"], undefined);
  assert.equal(out["192.0.2.0"], undefined);
  assert.equal(out["192.0.2.8"], 4);
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

const typed = (mmd, types, hidden = {}) => {
  const model = parseMmd(mmd);
  return resolveTypes({ ...model, types }, { nodes: Object.fromEntries([...model.nodes.keys()].map((k) => [k, { hidden: !!hidden[k] }])) }, "Next");
};
const TMMD = 'subgraph r["R"]\n  a["A<br/>10.0.0.1/24"]\n  b[("B")]\nend\nc["C"]\nclassDef web stroke:#112233\nclassDef oracle stroke:#445566\nclassDef proposed stroke:#000000\nclass r,a web\nclass b oracle\nclass c web\nclass c proposed';

test("resolveTypes: entities, legend list and css", () => {
  const r = typed(TMMD);
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
  const r = typed('a["A"]\nn["N"]\nclassDef web stroke:#112233\nclass a web\nclass n nas', [{ id: "nas", color: "#101010" }]);
  assert.equal(r.typeColors.nas, "#101010");
  assert.equal(r.typeColors.cache, "#B8860B");
  assert.deepEqual(r.typeList.map((t) => [t.k, !!t.infra]), [["web", false], ["nas", true]]);
  const h = typed('a["A"]\nb["B"]\nclassDef web stroke:#112233\nclass a web', undefined, { b: true });
  assert.deepEqual(Object.keys(h.ent), ["n:a"]);
});

test("resolveTypes: problems are reported together", () => {
  assert.match(failure(() => typed('a["A"]\nclassDef weird stroke:#112233\nclass a weird')), /classDef "weird" is neither a known server type/);
  assert.match(failure(() => typed('a["A"]\nclassDef web fill:#fff\nclass a web')), /classDef "web" has no stroke:#rrggbb colour/);
  const msg = failure(() => typed('a["A"]\nb["B"]\nc["C"]\nclassDef web stroke:#112233\nclass a web\nclass b weird\nclass c web\nclass c cache'));
  assert.match(msg, /n:b: unknown class weird/);
  assert.match(msg, /n:b: needs exactly one server type class \(.*\), has none/);
  assert.match(msg, /n:c: needs exactly one server type class .*has web,cache/);
  assert.match(failure(() => typed('a["A"]\nclassDef web stroke:#112233\nclass a cache')), /n:a: server type "cache" has no classDef in diagram\.mmd/);
});

const VMMD = 'subgraph r["R"]\n  a["A<br/>192.0.2.1/24"]\n  b["B"]\nend\na --> b';
const good = () => ({
  layout: {
    clusters: { r: { x: 0, y: 0, w: 600, h: 300, title: [20, 20] } },
    nodes: { a: { x: 40, y: 100, w: 150, h: 60, body: [], ip: [[0, 150]] }, b: { x: 300, y: 100, w: 150, h: 60, body: [], ip: [] } },
    edges: { "a>b": {} },
  },
  model: parseMmd(VMMD),
});
const nm = { tl: 8, bl: 0, il: 0 };
const meta = () => ({ nodes: { a: { ...nm }, b: { ...nm } } });
const geomErr = (mut) => {
  const { layout, model } = good();
  mut?.(layout, model);
  return failure(() => validateGeometry(model, layout, meta()));
};

test("validateGeometry: id mismatches between mmd and layout", () => {
  const msg = geomErr((l) => { delete l.clusters.r; l.clusters.q = {}; delete l.nodes.b; l.nodes.zz = {}; l.edges["x>y"] = {}; delete l.edges["a>b"]; });
  assert.match(msg, /cluster "r" is in diagram\.mmd but has no geometry in layout\.json/);
  assert.match(msg, /cluster "q" is in layout\.json but not in diagram\.mmd/);
  assert.match(msg, /node "b" is in diagram\.mmd but has no geometry/);
  assert.match(msg, /node "zz" is in layout\.json but not in diagram\.mmd/);
  assert.match(msg, /edge "a>b" is in diagram\.mmd but has no geometry/);
  assert.match(msg, /edge "x>y" is in layout\.json but not in diagram\.mmd/);
});

test("validateGeometry: body and ip line counts", () => {
  const msg = geomErr((l, m) => { m.nodes.get("a").body.push("line"); l.nodes.a.ip = []; });
  assert.match(msg, /node "a": 1 body lines in mmd, 0 positions in layout\.json/);
  assert.match(msg, /node "a": 1 IP lines in mmd, 0 positions/);
  const hidden = geomErr((l) => { l.nodes.a.hidden = true; l.nodes.a.ip = [[0, 1], [0, 2]]; l.edges["a>b"] = { path: [] }; });
  assert.doesNotMatch(hidden, /node "a": .* IP lines/);
});

test("validateGeometry: edge keys and firewall markers", () => {
  const edge = (v) => geomErr((l) => { l.edges["a>b"] = v; });
  assert.match(edge({ path: [] }), /"path" is no longer used/);
  assert.match(edge({ color: 1 }), /unknown key color \(allowed: via, label, firewall\)/);
  assert.match(edge({ via: [[1]] }), /"via" must be a list of \[x, y\] waypoints/);
  assert.match(edge({ via: "x" }), /"via" must be a list/);
  assert.match(edge({ via: [[1, null]] }), /"via" must be a list/);
  assert.match(edge({ label: [1] }), /"label" must be \[x, y\]/);
  assert.match(edge({ firewall: "yes" }), /"firewall" must be true .* got "yes"/);
  assert.match(geomErr((l, m) => { m.edges[0].fw = true; }), /label ends with "· firewall" but layout\.json has no "firewall": true/);
  assert.match(edge({ firewall: true }), /has "firewall": true but the diagram\.mmd label does not end/);
});

test("validateGeometry: header band, title and spacing checks", () => {
  assert.match(geomErr((l) => { l.nodes.a.y = 20; }), /node "a": box top incl\. 20px header .* intrudes into cluster "r" header band; needs >= 40/);
  assert.match(geomErr((l) => { l.clusters.r.title = [20, 5]; }), /cluster "r": title y 5 is outside its header band \(12\.\.26\)/);
  assert.match(geomErr((l) => { l.clusters.r.title = [20, 29]; }), /title y 29 is outside/);
  assert.match(geomErr((l) => { l.nodes.b.x = l.nodes.a.x + 10; }), /nodes "a" and "b": overlap -?[\d.]+px between drawn boxes/);
  assert.match(geomErr((l) => { l.nodes.b.x = 195; }), /nodes "a" and "b": gap [\d.]+px/);
  assert.match(geomErr((l) => { l.nodes.a.x = 2; }), /node "a": .*px to the left border of cluster "r"/);
});

test("validateGeometry: a clean layout passes and cluster/node separation is enforced", () => {
  const { layout, model } = good();
  pass(() => validateGeometry(model, layout, meta()));

  const two = parseMmd('subgraph r["R"]\n  a["A"]\nend\nsubgraph s["S"]\n  b["B"]\nend\nc["C"]');
  const l = {
    clusters: { r: { x: 0, y: 0, w: 300, h: 300, title: [20, 20] }, s: { x: 290, y: 0, w: 300, h: 300, title: [20, 20] } },
    nodes: { a: { x: 40, y: 100, w: 150, h: 60, body: [], ip: [] }, b: { x: 340, y: 100, w: 150, h: 60, body: [], ip: [] }, c: { x: 100, y: 120, w: 100, h: 60, body: [], ip: [] } },
    edges: {},
  };
  const msg = failure(() => validateGeometry(two, l, { nodes: { a: { ...nm }, b: { ...nm }, c: { ...nm } } }));
  assert.match(msg, /clusters "r" and "s": overlap/);
  assert.match(msg, /cluster "r" and node "c"|cluster "s" and node "c"/);
});
