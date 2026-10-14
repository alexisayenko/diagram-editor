// Golden routes: the routes of generated diagrams must stay what the original (unindexed) router produced, to the last bit.
// Regenerate the fixture only for a deliberate, documented change of routing behaviour.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { generate } from "../../tools/bench.mjs";
import { prepareDiagram } from "../browser/render.mjs";
import { routeAll, routeSignature } from "../render/route-cache.mjs";
import { renderModel } from "../render/pipeline.mjs";

const golden = JSON.parse(readFileSync(new URL("./fixtures/routes-golden.json", import.meta.url), "utf8"));
const prepared = (n) => prepareDiagram(generate(n), "bench", null, []);

for (const n of [20, 100, 200]) {
  test(`routes of a generated ${n}-server diagram are unchanged`, () => {
    const { layout, meta, kit } = prepared(n);
    const routes = kit.route(layout, meta);
    assert.equal(Object.keys(routes).length, golden[n].routes);
    assert.equal(createHash("sha256").update(JSON.stringify(routes)).digest("hex"), golden[n].sha256);
    if (golden[n].full) assert.deepEqual(JSON.parse(JSON.stringify(routes)), golden[n].full);
  });
}

test("route cache: the same geometry reuses the routes, a changed box or waypoint routes again", () => {
  const { layout, meta, kit } = prepared(20);
  const first = routeAll(kit, layout, meta);
  assert.equal(first.reused, false);
  const second = routeAll(kit, structuredClone(layout), meta, first.cache);
  assert.equal(second.reused, true);
  assert.equal(second.routes, first.routes);
  const shifted = structuredClone(layout), id = Object.keys(shifted.nodes)[0];
  shifted.nodes[id].x += 40;
  assert.equal(routeAll(kit, shifted, meta, first.cache).reused, false);
  const key = meta.edges[0].k, waypoint = structuredClone(layout);
  waypoint.edges[key] = { ...waypoint.edges[key], via: [[5, 5]] };
  assert.equal(routeAll(kit, waypoint, meta, first.cache).reused, false);
  assert.equal(routeAll(kit, layout, meta, first.cache, { w: { [id]: 1 } }).reused, false);
  assert.ok(routeSignature(layout, meta, { w: {} }).includes('{"w":{}}'));
});

test("route cache: a render with the previous cache is byte-identical to a render without it", () => {
  const { config, model, sections, notes, docs, meta, layout, kit, drawings, networks } = prepared(30);
  const args = { config, model, layout, meta, kit, sections, notes, docs, drawings, networks, assets: { cssSvg: "", cssPage: "", js: "" } };
  const fresh = renderModel(args), again = renderModel({ ...args, routeCache: fresh.routeCache });
  assert.equal(again.html, fresh.html);
  assert.equal(again.routeCache, fresh.routeCache);
  assert.equal(again.routes, fresh.routes);
});
