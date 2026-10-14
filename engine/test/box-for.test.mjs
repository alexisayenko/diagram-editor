// kit.boxFor is the one definition of a server card box; the saved layout, the auto layout and the drawn SVG must agree with it.
import test from "node:test";
import assert from "node:assert/strict";
import { renderDiagram } from "../browser/render.mjs";
import { geometryKit } from "../render/geometry.mjs";
import { METRICS, metricsKit } from "../render/metrics.mjs";
import { KITS } from "../page/kits.mjs";
import { script } from "../page/assets.mjs";

const kit = geometryKit();
const SHAPES = {
  bare: { name: "bare.example.test" },
  many: { name: "many.example.test", services: Array.from({ length: 11 }, (_, i) => `Service ${i} with a fairly long description`) },
  eol: { name: "old.example.test", os: "Ubuntu 14.04 LTS Trusty" },
  long: { name: "a-very-long-server-name-that-is-cut-in-the-header-of-the-card.example.test" },
  hardware: { name: "hw.example.test", cpu: "8", ram: "32 GiB", swap: "4 GiB", disk: "500 GiB", os: "Debian 12 Bookworm" },
  ips3: { name: "net.example.test", ips: ["192.0.2.10/24", "198.51.100.20/24", "203.0.113.30/24"], services: ["Service A"] },
};

const toml = (id, o) => {
  const list = (k, v) => (v ? `${k} = [${v.map((x) => JSON.stringify(x)).join(", ")}]\n` : "");
  const text = (k, v) => (v ? `${k} = ${JSON.stringify(v)}\n` : "");
  return `id = "${id}"\nname = "${o.name}"\nregion = "r1"\n` + list("services", o.services) + list("ips", o.ips ?? ["192.0.2.5/24"]) + text("os", o.os) + text("cpu", o.cpu) + text("ram", o.ram) + text("swap", o.swap) + text("disk", o.disk);
};
const files = new Map([
  ["topology.toml", 'id = "box"\ntitle = "Box"\n\n[[regions]]\nid = "r1"\ntitle = "Region 1"\nserver_type = "web"\n'],
  ...Object.entries(SHAPES).map(([id, o]) => [`servers/${id}.toml`, toml(id, o)]),
]);
const html = renderDiagram(files, "box", null, { cssSvg: "", cssPage: "", js: "" }, []).html;
const data = JSON.parse(html.match(/id="layout-data">([\s\S]*?)<\/script>/)[1]);
const attr = (tag, name) => Number(new RegExp(String.raw`\s${name}="([^"]+)"`).exec(tag)[1]);
const tagsOf = (cls, id) => [...html.matchAll(new RegExp(`<(?:rect|text)[^>]*class="${cls}[^"]*"[^>]*data-ent="n:${id}"[^>]*>`, "g"))].map((m) => m[0]);

for (const id of Object.keys(SHAPES)) {
  test(`boxFor equals the saved geometry and the drawn card: ${id}`, () => {
    const g = data.layout.nodes[id], m = data.meta.nodes[id], box = kit.boxFor(m, g.x, g.y);
    assert.equal(g.w, box.w);
    assert.equal(g.h, box.h);
    assert.deepEqual(g.body, box.body);
    assert.deepEqual(g.ip, box.ip);
    const [rect] = tagsOf("b", id);
    assert.deepEqual([attr(rect, "x"), attr(rect, "y"), attr(rect, "width"), attr(rect, "height")], [box.x, box.y, box.w, box.h]);
    const body = tagsOf("nb", id), ips = tagsOf("ni", id);
    assert.equal(body.length, m.nb);
    assert.equal(ips.length, m.ni);
    body.forEach((t, i) => assert.deepEqual([attr(t, "x"), attr(t, "y")], box.body[i]));
    ips.forEach((t, i) => assert.deepEqual([attr(t, "x"), attr(t, "y")], box.ip[i]));
  });
}

test("the shapes cover the cases that change the box: rows, EOL pill, hardware strip, cut title and three IPs", () => {
  const meta = data.meta.nodes;
  assert.equal(meta.many.nb, 11);
  assert.equal(meta.eol.oe, 1);
  assert.ok(meta.hardware.hw.includes("cpu"));
  assert.equal(meta.ips3.ni, 3);
  assert.ok(meta.long.tl < SHAPES.long.name.length);
  assert.ok(data.layout.nodes.many.h > data.layout.nodes.bare.h);
});

test("boxFor on a bare meta: width from the longest text, height from the rows", () => {
  const t = { tl: 10, bl: 0, il: 0, os: 0, ol: 0, oe: 0, hw: "", nb: 0, ni: 0 };
  assert.deepEqual(kit.boxFor(t, 5, 7), { x: 5, y: 7, w: Math.ceil(METRICS.textX + 10 * METRICS.titleCw + METRICS.titleExtra), h: METRICS.boxPad, title: [5 + METRICS.textX, 7 - METRICS.sketchTitleDy], body: [], ip: [] });
  assert.equal(kit.rows({ ...t, nb: 2, hw: "x", os: 1 }), 4);
  const full = kit.boxFor({ ...t, nb: 2, ni: 1, hw: "x", os: 1, ol: 9, oe: 1 }, 0, 0);
  assert.equal(full.h, METRICS.boxPad + METRICS.line * 4 + METRICS.ipLine);
  assert.deepEqual(full.ip, [[METRICS.textX, METRICS.ipTop + METRICS.line * 4]]);
});

test("the page gets the same METRICS table as Node", () => {
  assert.deepEqual(KITS["ui/metrics"].args[0].json, METRICS);
  assert.deepEqual(metricsKit(METRICS).METRICS, METRICS);
  assert.ok(Object.isFrozen(METRICS));
  const js = script();
  assert.ok(js.includes('InfraDiagram.define("ui/metrics"') && js.includes(JSON.stringify(METRICS)));
});
