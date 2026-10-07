import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseToml, tomlModel } from "../parse/toml.mjs";
import { prepareDiagram, renderDiagram } from "../browser/render.mjs";
import { validateGeometry } from "../parse/validate.mjs";
import { css, script } from "../page/assets.mjs";
import { runInNewContext } from "node:vm";

const demo = readFileSync(new URL("../../examples/demo/demo.toml", import.meta.url), "utf8");
test("TOML comments, quoted hashes, literal strings, escapes and multiline arrays", () => {
  const t = parseToml(`title = "Hash # and \\u00b7" # comment\nid = 'literal\\path'\n[[servers]]\nid = 'app'\nservices = [\n 'one', # comment\n "two\\nlines",\n]\nproposed = true\n`);
  assert.equal(t.title, "Hash # and ·");
  assert.equal(t.id, "literal\\path");
  assert.deepEqual(t.servers[0].services, ["one", "two\nlines"]);
  assert.equal(t.servers[0].proposed, true);
});
test("bad TOML and schema errors are actionable", () => {
  for (const source of ['title = "one"\ntitle = "two"', 'title = "bad\\q"', 'title = 4', '[servers]', 'title = "unterminated']) assert.throws(() => parseToml(source), /TOML:\d+:/);
  for (const [source, error] of [
    [demo + '\nwrong = "key"', /unknown key/],
    [demo.replace('id = "app01"', 'id = "web01"'), /duplicate id/],
    [demo.replace('region = "web"', 'region = "missing"'), /unknown region/],
    [demo.replace('server_type = "web"', 'server_type = "unknown"'), /server_type/],
    [demo.replace('203.0.113.10/24', '300.0.0.1/24'), /invalid IPv4/],
    [demo.replace('from_service = "Job 104"', 'from_service = "missing"'), /exactly one service/],
    [demo.replace('firewall = true', 'firewall = "true"'), /true or false/],
    ['title="test"\nservers=["bad"]', /tables/],
    [demo.replace('id = "web01"', 'id = "constructor"'), /invalid or duplicate/],
  ]) assert.throws(() => tomlModel(source, "test.toml"), error);
});
test("fresh demo auto-layout is valid, deterministic and non-overlapping", () => {
  const a = prepareDiagram(demo, "demo.toml"), b = prepareDiagram(demo, "demo.toml");
  assert.deepEqual(a.layout, b.layout);
  assert.deepEqual(a.kit.problems(a.layout, a.meta), {});
  validateGeometry(a.model, a.layout, a.meta);
  assert.equal(a.model.nodes.size, 7);
  assert.equal(a.model.clusters.size, 4);
  assert.equal(a.meta.edges.find((e) => e.k === "app01>db01").fl, 1);
});
test("restore, update service count, add and remove objects without losing existing coordinates", () => {
  const first = prepareDiagram(demo, "demo.toml");
  const changed = demo.replace('services = ["Tomcat: demo-api", "Job 104 batch import"]', 'services = ["Tomcat: demo-api", "Job 104 batch import", "New service"]') + '\n[[servers]]\nid="new01"\nserver_type="application"\nservices=["Added"]\n';
  const saved = { version: 1, diagramId: first.config.id, ...first.layout };
  saved.nodes.removed = { x: 0 }; saved.edges["removed>app01"] = {};
  const second = prepareDiagram(changed, "demo.toml", saved);
  assert.equal(second.layout.nodes.app01.x, first.layout.nodes.app01.x);
  assert.equal(second.layout.nodes.app01.y, first.layout.nodes.app01.y);
  assert.equal(second.layout.nodes.app01.body.length, 3);
  assert.ok(second.layout.nodes.new01);
  assert.ok(!second.layout.nodes.removed);
  assert.ok(!second.layout.edges["removed>app01"]);
  assert.deepEqual(second.kit.problems(second.layout, second.meta), {});
});
test("invalid saved geometry and mismatched model identity are rejected", () => {
  assert.throws(() => prepareDiagram(demo, "demo.toml", { diagramId: "another" }), /another diagram/);
  assert.throws(() => prepareDiagram(demo, "demo.toml", { version: 2 }), /version/);
  assert.throws(() => prepareDiagram(demo, "demo.toml", { nodes: [] }), /object/);
  assert.throws(() => prepareDiagram(demo, "demo.toml", { nodes: { app01: { x: "bad" } } }), /server geometry/);
  assert.throws(() => prepareDiagram(demo, "demo.toml", { edges: { "web01>app01": { via: [[NaN, 0]] } } }), /waypoints/);
});
test("browser bundle uses the real renderer and embeds text safely", () => {
  const html = readFileSync(new URL("../../diagram.html", import.meta.url), "utf8");
  const start = html.indexOf("<script>") + 8, end = html.lastIndexOf("</script>");
  const prefix = html.slice(start, end).split("// Files live in local/")[0];
  const bundled = runInNewContext(prefix + '\nrequire("browser/render.mjs").renderDiagram(source, "demo.toml", null, ASSETS)', { source: demo });
  assert.match(bundled.html, /InfraDiagram\.define/);
  assert.match(bundled.html, /web-01\.example\.test/);
  const malicious = demo.replace('name = "stats-01.example.test"', 'name = "</script><script>alert(1)</script>"');
  const rendered = renderDiagram(malicious, "demo.toml", null, { cssSvg: css("svg"), cssPage: css("page"), js: script() });
  assert.ok(!rendered.html.includes("<script>alert(1)</script>"));
});
test("browser app dirty check is safe before a diagram is ready", () => {
  const app = readFileSync(new URL("../browser/app.js", import.meta.url), "utf8");
  const src = app.split("\n").filter((l) => /^const (editor|notesApi|serverApi|drawApi|unsaved|dirty) = /.test(l)).join("\n");
  const check = (ready, mods) => runInNewContext("let active = null;\n" + src + "\ndirty()", { ready, frame: { contentWindow: { InfraDiagram: { modules: mods } } } });
  assert.equal(check(false, {}), false);
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
  const { sections } = tomlModel('title="t"\n[[servers]]\nid="a"\nserver_type="web"\nname="a.test"\nos="Ubuntu 24.04"\ndetails="Note."\n[[servers]]\nid="b"\nserver_type="web"\nname="b.test"\nos="Debian 12"\n[[servers]]\nid="c"\nserver_type="web"\nname="c.test"\ndetails="Only note."\n', "t.toml");
  const count = (html) => (html.match(/<t[dh]>OS<\/t[dh]>/g) || []).length;
  assert.equal(count(mod.md(sections["a.test"])), 1);
  assert.match(mod.md(sections["a.test"]), /<td>OS<\/td><td>Ubuntu 24\.04<\/td>/);
  assert.match(mod.md(sections["a.test"]), /<p>Note\.<\/p>/);
  assert.equal(count(mod.md(sections["b.test"])), 1);
  assert.equal(count(mod.md(sections["c.test"])), 0);
});
test("TOML notes: string, array, invalid types and rendered cards", () => {
  const base = 'title="t"\n[[servers]]\nid="a"\nserver_type="web"\n';
  const one = tomlModel('notes = "First note\\nBody text."\n' + base, "t.toml").notes;
  assert.deepEqual(one.map((n) => [n.title, n.paras]), [["First note", ["Body text."]]]);
  const many = tomlModel('notes = ["One\\nAlpha.", "Two\\nDate: 2026-01-02\\n\\nBeta."]\n' + base, "t.toml").notes;
  assert.equal(many.length, 2);
  assert.equal(many[1].date, "2026-01-02");
  assert.deepEqual(tomlModel(base, "t.toml").notes, []);
  for (const bad of ['notes = true', 'notes = [""]', 'notes = ["Title only"]']) assert.throws(() => tomlModel(bad + "\n" + base, "t.toml"), /TOML: notes/);
  const html = renderDiagram('notes = ["Visible note\\nShown without clicking."]\n' + base, "t.toml", null, { cssSvg: css("svg"), cssPage: css("page"), js: script() }).html;
  assert.match(html, /<article class="note"><h3>Visible note<\/h3><p>Shown without clicking\.<\/p>/);
  assert.match(html, /Notes \(1\)/);
});
