// The page is a shell plus a scene: the scene the pipeline hands out is exactly what a full page embeds, and an edit rendered through the route cache gives the scene of a fresh render.
import test from "node:test";
import assert from "node:assert/strict";
import { demo, mod, mini, without, withFile } from "./helpers.mjs";
import { render } from "./cov-page.mjs";
import { dataOf } from "./cov-canvas.mjs";
import { renderLayoutHtml, renderScene } from "../page/layout-html.mjs";

const edits = {
  "a server name": (f) => mod(f, "servers/web01.toml", 'name = "web-01.example.test"', 'name = "web-01b.example.test"'),
  "a server's services": (f) => mod(f, "servers/app01.toml", "services = [", 'services = ["Extra service", '),
  "a region title": (f) => mod(f, "topology.toml", 'title = "Web Servers"', 'title = "Web Tier"'),
  "a note": (f) => mod(f, "notes.toml", "Cache tier proposed", "Cache tier planned"),
  "a network name": (f) => mod(f, "networks.toml", 'name = "Demo LAN"', 'name = "Demo LAN 2"'),
  "a new server": (f) => withFile(f, "servers/web02.toml", f.get("servers/web01.toml").replace('id = "web01"', 'id = "web02"').replace("web-01", "web-02")),
  "a removed server and its connection": (f) => without(mod(f, "topology.toml", '[[connections]]\nfrom = "stats01"\nto = "app"\nlabel = "TCP · metrics"\n', ""), "servers/stats01.toml"),
};

test("renderScene hands out every part of the page that depends on the model", () => {
  const r = render(demo()), s = r.scene;
  for (const k of ["shell", "title", "cssSvg", "viewBox", "svg", "legendKey", "nets", "notes", "docs", "data"]) assert.equal(typeof s[k], "string", k);
  assert.equal(s.noteCount, 2);
  assert.equal(s.title, "Demo infrastructure");
  assert.equal(s.data, r.html.match(/id="layout-data">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(dataOf(r.html).id, "demo");
  assert.match(s.svg, /^\n<defs>\n<marker id="ar"/);
  assert.match(s.svg, /<g id="dw"><\/g>\n$/);
  assert.match(s.legendKey, /^<b>Connections<\/b>/);
});

test("a full page is the shell around the scene: each part sits where the runtime swaps it", () => {
  const r = render(demo()), s = r.scene, h = r.html;
  assert.ok(h.includes(`<title>${s.title}</title>`));
  assert.ok(h.includes(`<style id="css-svg">${s.cssSvg}</style>`));
  assert.ok(h.includes(`viewBox="${s.viewBox}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${s.svg}</svg>`));
  assert.ok(h.includes(`<div class="lk">${s.legendKey}</div>`));
  assert.ok(h.includes(`<div id="wl" role="group" aria-label="Network filter">${s.nets}</div>`));
  assert.ok(h.includes(`<button id="nh" class="cph" type="button" aria-expanded="true" aria-controls="nl">Notes (${s.noteCount})</button><div id="nl" class="cpb">${s.notes}</div>`));
  assert.ok(h.includes(`<ul id="dl" class="cpb">${s.docs}</ul>`));
  assert.ok(h.includes(`<script type="application/json" id="layout-data">${s.data}</script>`));
  assert.equal(h, renderLayoutHtml({ scene: s, cssPage: ".page{}", js: "" }));
});

test("a diagram without networks has no Networks panel and a null networks part", () => {
  const r = render(mini());
  assert.equal(r.scene.nets, null);
  assert.ok(!r.html.includes('id="wp"'));
});

test("renderScene alone builds the scene from the pieces; markers and drawings land in the svg", () => {
  const s = renderScene({ id: "x", title: "T", cssSvg: "c", viewBox: "0 0 1 1", svgBody: "<g/>", drawings: [], markers: "<marker id=\"m\"/>", edgeKeyHtml: "<i/>", notes: [], docs: [], nets: null, dataJson: "{}" });
  assert.match(s.svg, /<marker id="m"\/>\n<\/defs>\n\n<g\/>\n<g id="dw"><\/g>\n$/);
  assert.equal(s.cssSvg, "\nc\n");
  assert.equal(s.notes, "\n\n");
  assert.equal(s.noteCount, 0);
});

test("the shell key names the diagram and whether it has networks; edits keep it", () => {
  const r = render(demo());
  assert.equal(r.scene.shell, JSON.stringify(["demo", true]));
  assert.notEqual(render(mini()).scene.shell, r.scene.shell);
  assert.equal(render(mod(demo(), "topology.toml", 'id = "demo"', 'id = "other"')).scene.shell, JSON.stringify(["other", true]));
  for (const edit of Object.values(edits)) assert.equal(render(edit(demo()), r.layout).scene.shell, r.scene.shell);
});

for (const [name, edit] of Object.entries(edits)) {
  test(`a scene rendered through the route cache after ${name} is byte-identical to a fresh render`, () => {
    const first = render(demo()), changed = edit(demo());
    const cached = render(changed, first.layout, ["web01"], first.routeCache), fresh = render(changed, first.layout, ["web01"]);
    assert.deepEqual(cached.scene, fresh.scene);
    assert.equal(cached.html, fresh.html);
  });
}
