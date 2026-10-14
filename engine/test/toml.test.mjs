import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseToml, tomlModel, mergeFolder, withRoot } from "../parse/toml.mjs";
import { prepareDiagram, renderDiagram } from "../browser/render.mjs";
import { validateGeometry } from "../parse/validate.mjs";
import { css, script } from "../page/assets.mjs";
import { runInNewContext } from "node:vm";
import { createFrameBridge } from "../browser/frame-bridge.mjs";
import { demo as loadDemo, mod, withFile, without, mini } from "./helpers.mjs";

const demo = loadDemo();
test("TOML comments, quoted hashes, literal strings, escapes and multiline arrays", () => {
  const t = parseToml(`title = "Hash # and \\u00b7" # comment\nid = 'literal\\path'\n[[servers]]\nid = 'app'\nservices = [\n 'one', # comment\n "two\\nlines",\n]\nproposed = true\n`);
  assert.equal(t.title, "Hash # and ·");
  assert.equal(t.id, "literal\\path");
  assert.deepEqual(t.servers[0].services, ["one", "two\nlines"]);
  assert.equal(t.servers[0].proposed, true);
});
test("bad TOML and schema errors are actionable", () => {
  for (const source of ['title = "one"\ntitle = "two"', 'title = "bad\\q"', 'title = 4', '[servers]', 'title = "unterminated']) assert.throws(() => parseToml(source), /line \d+: /);
  for (const [files, error] of [
    [withFile(demo, "topology.toml", 'wrong = "key"\n' + demo.get("topology.toml")), /topology.toml: unknown key wrong/],
    [withFile(demo, "topology.toml", 'notes = ["x"]\n' + demo.get("topology.toml")), /topology.toml: unknown key notes/],
    [withFile(demo, "servers/app01.toml", 'id = "web01"\nserver_type = "web"'), /must equal the file name/],
    [withFile(demo, "servers/web.toml", 'server_type = "web"'), /invalid or duplicate/],
    [withFile(demo, "extra.toml", 'x = "y"'), /unexpected file extra\.toml/],
    [without(demo, "topology.toml"), /topology.toml is missing/],
    [withFile(demo, "servers/web01.toml", 'id = "web01"\nid = "web01"'), /servers\/web01\.toml:2: duplicate key/],
    [mod(demo, "servers/web01.toml", 'region = "web"', 'region = "missing"'), /unknown region/],
    [mod(demo, "topology.toml", 'server_type = "web"', 'server_type = "unknown"'), /server_type/],
    [mod(demo, "servers/web01.toml", '203.0.113.10/24', '300.0.0.1/24'), /invalid IPv4/],
    [mod(demo, "topology.toml", 'from_service = "Job 104"', 'from_service = "missing"'), /exactly one service/],
    [mod(demo, "topology.toml", 'firewall = true', 'firewall = "true"'), /true or false/],
    [withFile(demo, "topology.toml", 'title="test"\nregions=["bad"]'), /tables/],
    [withFile(without(demo, "servers/web01.toml"), "servers/constructor.toml", 'server_type = "web"'), /invalid or duplicate/],
  ]) assert.throws(() => tomlModel(files, "test"), error);
});
test("fresh demo auto-layout is valid, deterministic and non-overlapping", () => {
  const a = prepareDiagram(demo, "demo"), b = prepareDiagram(demo, "demo");
  assert.deepEqual(a.layout, b.layout);
  assert.deepEqual(a.kit.problems(a.layout, a.meta), {});
  validateGeometry(a.model, a.layout, a.meta);
  assert.equal(a.model.nodes.size, 7);
  assert.equal(a.model.clusters.size, 4);
  assert.equal(a.meta.edges.find((e) => e.k === "app01>db01").fl, 3);
});
test("restore, update service count, add and remove objects without losing existing coordinates", () => {
  const first = prepareDiagram(demo, "demo");
  const changed = withFile(mod(demo, "servers/app01.toml", 'services = ["Tomcat: demo-api", "Job 104 batch import"]', 'services = ["Tomcat: demo-api", "Job 104 batch import", "New service"]'), "servers/new01.toml", 'id="new01"\nserver_type="application"\nservices=["Added"]\n');
  const saved = { version: 1, diagramId: first.config.id, ...first.layout };
  saved.nodes.removed = { x: 0 }; saved.edges["removed>app01"] = {};
  const second = prepareDiagram(changed, "demo", saved);
  assert.equal(second.layout.nodes.app01.x, first.layout.nodes.app01.x);
  assert.equal(second.layout.nodes.app01.y, first.layout.nodes.app01.y);
  assert.equal(second.layout.nodes.app01.body.length, 8);
  assert.ok(second.layout.nodes.new01);
  assert.ok(!second.layout.nodes.removed);
  assert.ok(!second.layout.edges["removed>app01"]);
  assert.deepEqual(second.kit.problems(second.layout, second.meta), {});
});
test("invalid saved geometry and mismatched model identity are rejected", () => {
  assert.match(prepareDiagram(demo, "demo", { diagramId: "another" }).warnings[0], /another/);
  assert.throws(() => prepareDiagram(demo, "demo", { version: 2 }), /version/);
  assert.throws(() => prepareDiagram(demo, "demo", { nodes: [] }), /object/);
  assert.throws(() => prepareDiagram(demo, "demo", { nodes: { app01: { x: "bad" } } }), /server geometry/);
  assert.throws(() => prepareDiagram(demo, "demo", { edges: { "web01>app01": { via: [[NaN, 0]] } } }), /waypoints/);
});
test("browser bundle uses the real renderer and embeds text safely", () => {
  const html = readFileSync(new URL("../../diagram.html", import.meta.url), "utf8");
  const start = html.indexOf("<script>") + 8, end = html.lastIndexOf("</script>");
  const prefix = html.slice(start, end).split("// A saved diagram is a folder")[0];
  const bundled = runInNewContext(prefix + '\nrequire("browser/render.mjs").renderDiagram(files, "demo", null, ASSETS)', { files: demo });
  assert.match(bundled.html, /InfraDiagram\.define/);
  assert.match(bundled.html, /web-01\.example\.test/);
  const malicious = mod(demo, "servers/stats01.toml", 'name = "stats-01.example.test"', 'name = "</script><script>alert(1)</script>"');
  const rendered = renderDiagram(malicious, "demo", null, { cssSvg: css("svg"), cssPage: css("page"), js: script() });
  assert.ok(!rendered.html.includes("<script>alert(1)</script>"));
});
test("browser app dirty check is safe before a diagram is ready", () => {
  const check = (loaded, mods) => {
    const handlers = [], frame = { addEventListener: (t, f) => handlers.push(f), contentWindow: { InfraDiagram: { modules: mods } }, contentDocument: { addEventListener() {} } };
    const bridge = createFrameBridge(frame, { host: {}, onLoad() {}, onChange() {} });
    bridge.show("<html>");
    if (loaded) handlers.forEach((f) => f());
    return bridge.isDirty();
  };
  assert.equal(check(false, { "canvas/edit-mode": { isDirty: () => true } }), false);
  assert.equal(check(true, {}), false);
  assert.equal(check(true, { "canvas/edit-mode": { isDirty: () => true } }), true);
});
test("browser app script and built diagram.html scripts are syntactically valid", () => {
  const html = readFileSync(new URL("../../diagram.html", import.meta.url), "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length > 0);
  for (const s of scripts) assert.doesNotThrow(() => new Function(s));
  assert.doesNotThrow(() => new Function(readFileSync(new URL("../browser/app.js", import.meta.url), "utf8")));
});
test("TOML server OS appears as exactly one row in the details panel", () => {
  const src = readFileSync(new URL("../runtime/ui/details.js", import.meta.url), "utf8");
  let mod;
  runInNewContext(src, { InfraDiagram: { define: (n, d, f) => { mod = f({ D: {}, esc: (x) => String(x), $: () => null }); } } });
  const server = (id, body) => ["servers/" + id + ".toml", `id="${id}"\nserver_type="web"\nname="${id}.test"\n${body}`];
  const { sections } = tomlModel(new Map([["topology.toml", 'title="t"'], server("a", 'os="Ubuntu 24.04"\ndetails="Note."\n'), server("b", 'os="Debian 12"\n'), server("c", 'details="Only note."\n')]), "t");
  const count = (html) => (html.match(/<t[dh]>OS<\/t[dh]>/g) || []).length;
  assert.equal(count(mod.md(sections["a.test"])), 1);
  assert.match(mod.md(sections["a.test"]), /<td>OS<\/td><td>Ubuntu 24\.04<\/td>/);
  assert.match(mod.md(sections["a.test"]), /<p>Note\.<\/p>/);
  assert.equal(count(mod.md(sections["b.test"])), 1);
  assert.equal(count(mod.md(sections["c.test"])), 0);
});
test("TOML notes: string, array, invalid types and rendered cards", () => {
  const notes = (text) => mini('title="t"\n', { "notes.toml": text });
  const one = tomlModel(notes('notes = "First note\\nBody text."'), "t").notes;
  assert.deepEqual(one.map((n) => [n.title, n.paras]), [["First note", ["Body text."]]]);
  const many = tomlModel(notes('notes = ["One\\nAlpha.", "Two\\nDate: 2026-01-02\\n\\nBeta."]'), "t").notes;
  assert.equal(many.length, 2);
  assert.equal(many[1].date, "2026-01-02");
  assert.deepEqual(tomlModel(mini(), "t").notes, []);
  for (const bad of ['notes = true', 'notes = [""]', 'notes = ["Title only"]']) assert.throws(() => tomlModel(notes(bad), "t"), /notes/);
  assert.throws(() => tomlModel(notes('title = "x"'), "t"), /notes\.toml: unknown key title/);
  const html = renderDiagram(notes('notes = ["Visible note\\nShown without clicking."]'), "t", null, { cssSvg: css("svg"), cssPage: css("page"), js: script() }).html;
  assert.match(html, /<article class="note"><h3>Visible note<\/h3><p>Shown without clicking\.<\/p>/);
  assert.match(html, /Notes \(1\)/);
});
test("folder merge: each file holds its own keys and servers are ordered by file name", () => {
  const root = mergeFolder(demo);
  assert.deepEqual(root.servers.map((s) => s.id), ["app01", "app02", "batch01", "db01", "db02", "stats01", "web01"]);
  assert.equal(root.server_types[0].id, "batch");
  assert.equal(root.notes.length, 2);
  assert.equal(root.documents.length, 2);
  assert.equal(root.title, "Demo infrastructure");
  assert.equal(mergeFolder(withFile(demo, "networks.toml", "# parsed elsewhere")).servers.length, 7);
});

test("a legacy folder with only diagram.toml loads as topology.toml; topology.toml wins when both exist", () => {
  const legacy = new Map(demo);
  legacy.set("diagram.toml", legacy.get("topology.toml"));
  legacy.delete("topology.toml");
  assert.deepEqual(mergeFolder(legacy), mergeFolder(demo));
  assert.deepEqual([...withRoot(legacy).keys()].filter((k) => k.endsWith("topology.toml") || k === "diagram.toml"), ["topology.toml"]);
  const both = new Map(demo);
  both.set("diagram.toml", 'wrong = "key"');
  assert.deepEqual(mergeFolder(both), mergeFolder(demo));
});
