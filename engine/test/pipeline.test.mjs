import test from "node:test";
import assert from "node:assert/strict";
import { deriveNetworks, renderModel } from "../render/pipeline.mjs";
import { prepareDiagram } from "../browser/render.mjs";
import { parseNetworksFile } from "../parse/shared-networks.mjs";
import { demo, mini, without } from "./helpers.mjs";

const assets = { cssSvg: "SVGCSS", cssPage: "PAGECSS", js: "JS" };
const pipe = (files, extra = {}) => renderModel({ ...prepareDiagram(files, "demo"), assets, ...extra });

test("renderModel returns the page, routes and the networks of a TOML diagram", () => {
  const out = pipe(demo(), { validate: true });
  assert.match(out.html, /<svg/);
  assert.ok(out.html.includes("SVGCSS\n") && out.html.includes("PAGECSS") && out.html.includes("JS"));
  assert.ok(out.nets.length > 0 && out.nets.every((n) => typeof n.hosts === "number"));
  assert.ok(Object.keys(out.ipNet).length > 0);
  assert.ok(Object.keys(out.routes).length > 0);
  assert.ok(out.viewBox && out.typeList.length && out.edgeKeys.rows && out.dataJson && out.svgBody && out.idx);
  assert.ok(Object.values(out.ent).some((e) => e.os));
});

test("without assets no html is produced and without networks the panel data is empty", () => {
  const out = renderModel({ ...prepareDiagram(mini(), "m"), networks: null });
  assert.equal(out.html, null);
  assert.equal(out.nets, null);
  assert.deepEqual(out.ipNet, {});
});

test("validate rejects geometry the unvalidated path accepts", () => {
  const p = prepareDiagram(demo(), "demo");
  const [a, b] = [...p.model.nodes.keys()];
  Object.assign(p.layout.nodes[b], { x: p.layout.nodes[a].x, y: p.layout.nodes[a].y });
  assert.doesNotThrow(() => renderModel({ ...p }));
  assert.throws(() => renderModel({ ...p, validate: true }));
});

test("defined networks plus derived ones, and an unassigned row", () => {
  const files = mini('title = "t"\n', { "networks.toml": '[[networks]]\ncidr = "203.0.113.0/24"\nname = "Defined"\n' },
    'id = "a"\nserver_type = "web"\nips = ["192.0.2.5/24", "203.0.113.9/24", "10.9.9.9/32"]\n');
  const p = prepareDiagram(files, "m");
  assert.deepEqual(p.networks.map((n) => [n.cidr, !!n.derived]), [["203.0.113.0/24", false], ["192.0.2.0/24", true]]);
  const out = renderModel({ ...p, assets });
  assert.deepEqual(out.nets.map((n) => [n.cidr, n.name, n.hosts]), [["192.0.2.0/24", "", 1], ["203.0.113.0/24", "Defined", 1], ["", "Unassigned network", 1]]);
});

test("an empty diagram renders without networks, servers or warnings", () => {
  const p = prepareDiagram(without(mini(), "servers/a.toml"), "empty");
  const out = renderModel({ ...p, assets });
  assert.deepEqual(p.warnings, []);
  assert.equal(p.networks, null);
  assert.equal(out.nets, null);
  assert.deepEqual(out.ipNet, {});
  assert.deepEqual(out.ent, {});
  assert.match(out.html, /<svg/);
});

test("a saved layout for another diagram is a warning, not a failure", () => {
  const p = prepareDiagram(mini(), "m", { diagramId: "other" });
  assert.deepEqual(p.warnings, [`Saved layout was made for diagram "other"; using it for "${p.config.id}"`]);
});

test("deriveNetworks handles no networks and hidden servers", () => {
  assert.deepEqual(deriveNetworks(null, { nodes: new Map() }, { nodes: {} }), { nets: null, ipNet: {} });
  const model = { nodes: new Map([["a", { id: "a", ip: ["192.0.2.5"], cluster: null }], ["b", { id: "b", ip: ["192.0.2.6"], cluster: null }]]) };
  const layout = { nodes: { a: {}, b: { hidden: true } } };
  const shared = deriveNetworks(parseNetworksFile('[[networks]]\ncidr = "192.0.2.0/24"\nname = "N"\n'), model, layout);
  assert.deepEqual(shared.nets.map((n) => [n.name, n.hosts]), [["N", 1]]);
});
