import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveNetworks, renderModel } from "../render/pipeline.mjs";
import { prepareDiagram } from "../browser/render.mjs";
import { parseConfig } from "../parse/config.mjs";
import { parseMmd } from "../parse/mmd.mjs";
import { parseLayout } from "../parse/layout.mjs";
import { parseDetails } from "../parse/details.mjs";
import { parseNetworks } from "../parse/networks.mjs";
import { geometryKit, geometryMeta } from "../render/geometry.mjs";
import { autoLayoutKit } from "../render/auto-layout.mjs";
import { parseNetworksFile } from "../parse/shared-networks.mjs";
import { DEMO_DIR, demo, mini, without } from "./helpers.mjs";

const assets = { cssSvg: "SVGCSS", cssPage: "PAGECSS", js: "JS" };
const read = (f) => readFileSync(join(DEMO_DIR, f), "utf8");

function legacy(withNets = true) {
  const config = parseConfig(read("diagram.json"), DEMO_DIR), model = parseMmd(read("diagram.mmd")), details = read("details.md");
  const layout = parseLayout(read("layout.json")), drawings = layout.drawings || [];
  delete layout.drawings;
  const meta = geometryMeta(model, config.groups, config.processes), kit = geometryKit();
  const items = parseNetworks(read("networks.md"));
  return { config, model, layout, meta, kit, sections: parseDetails(details), notes: [], docs: [], drawings, details, items: withNets ? items : null };
}

test("renderModel in legacy folder mode returns the page, routes and tree networks", () => {
  const { items, details, ...rest } = legacy();
  const out = renderModel({ ...rest, validate: true, networks: { kind: "tree", items, texts: [details] }, assets });
  assert.match(out.html, /<svg/);
  assert.ok(out.html.includes("SVGCSS\n") && out.html.includes("PAGECSS") && out.html.includes("JS"));
  assert.equal(out.nets.length, items.length);
  assert.equal(out.nets[0].name, items[0].name);
  assert.ok(Object.keys(out.ipNet).length > 0);
  assert.ok(Object.keys(out.routes).length > 0);
  assert.ok(out.viewBox && out.typeList.length && out.edgeKeys.rows && out.dataJson && out.svgBody && out.idx);
  assert.ok(Object.values(out.ent).some((e) => e.os));
});

test("without assets no html is produced and without networks the panel data is empty", () => {
  const { items, details, ...rest } = legacy(false);
  const out = renderModel(rest);
  assert.equal(out.html, null);
  assert.equal(out.nets, null);
  assert.deepEqual(out.ipNet, {});
});

test("validate rejects geometry the unvalidated path accepts", () => {
  const { items, details, ...rest } = legacy(false);
  const [a, b] = [...rest.model.nodes.keys()];
  Object.assign(rest.layout.nodes[b], { x: rest.layout.nodes[a].x, y: rest.layout.nodes[a].y });
  assert.doesNotThrow(() => renderModel({ ...rest }));
  assert.throws(() => renderModel({ ...rest, validate: true }));
});

function toml(files, networks) {
  const p = prepareDiagram(files, "demo");
  return renderModel({ ...p, networks: networks === undefined ? p.networks && { kind: "shared", items: p.networks } : networks, assets });
}

test("renderModel in TOML mode derives and defines networks", () => {
  const out = toml(demo());
  assert.ok(out.nets.length > 0);
  assert.ok(out.nets.every((n) => typeof n.hosts === "number"));
  assert.ok(Object.keys(out.ipNet).length > 0);
});

test("TOML mode: defined networks plus derived ones, and an unassigned row", () => {
  const files = mini('title = "t"\n', { "networks.toml": '[[networks]]\ncidr = "203.0.113.0/24"\nname = "Defined"\n' },
    'id = "a"\nserver_type = "web"\nips = ["192.0.2.5/24", "203.0.113.9/24", "10.9.9.9/32"]\n');
  const p = prepareDiagram(files, "m");
  assert.deepEqual(p.networks.map((n) => [n.cidr, !!n.derived]), [["203.0.113.0/24", false], ["192.0.2.0/24", true]]);
  const out = renderModel({ ...p, networks: { kind: "shared", items: p.networks }, assets });
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
  assert.deepEqual(p.warnings, ['Saved layout was made for diagram "other"; using it for "t"'].map((w) => w.replace('"t"', `"${p.config.id}"`)));
});

test("deriveNetworks covers each kind and hidden servers", () => {
  assert.deepEqual(deriveNetworks(null, { nodes: new Map() }, { nodes: {} }), { nets: null, ipNet: {} });
  const model = { nodes: new Map([["a", { id: "a", ip: ["192.0.2.5"], cluster: null }], ["b", { id: "b", ip: ["192.0.2.6"], cluster: null }]]) };
  const layout = { nodes: { a: {}, b: { hidden: true } } };
  const shared = deriveNetworks({ kind: "shared", items: parseNetworksFile('[[networks]]\ncidr = "192.0.2.0/24"\nname = "N"\n') }, model, layout);
  assert.deepEqual(shared.nets.map((n) => [n.name, n.hosts]), [["N", 1]]);
  const tree = deriveNetworks({ kind: "tree", items: parseNetworks("- `192.0.2.0/24` N\n"), texts: ["host 192.0.2.77"] }, model, layout);
  assert.deepEqual(tree.nets.map((n) => [n.name, n.hosts]), [["N", 1]]);
  assert.deepEqual(tree.ipNet, { "192.0.2.5": 0, "192.0.2.6": 0, "192.0.2.77": 0 });
  assert.deepEqual(deriveNetworks({ kind: "tree", items: parseNetworks("- `192.0.2.0/24` N\n") }, model, layout).nets[0].hosts, 1);
});

test("autoLayout then pipeline works for a folder without layout.json", () => {
  const { items, details, ...rest } = legacy(false);
  rest.layout = { nodes: {}, clusters: {}, edges: {} };
  autoLayoutKit(rest.kit).fill(rest.layout, rest.meta);
  assert.match(renderModel({ ...rest, validate: true, assets }).html, /<svg/);
});
