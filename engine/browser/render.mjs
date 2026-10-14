import { NETWORKS_FILE, tomlModel } from "../parse/toml.mjs";
import { assignNetwork, buildNetworks, parseNetworksFile, withDerived } from "../parse/shared-networks.mjs";
import { parseConfig, checkConnections } from "../parse/config.mjs";
import { resolveTypes } from "../parse/types.mjs";
import { osOf } from "../parse/details.mjs";
import { osInfo } from "../parse/os-eol.mjs";
import { edgeKey } from "../parse/mmd.mjs";
import { geometryKit, geometryMeta } from "../render/geometry.mjs";
import { drawKit } from "../render/draw-kit.mjs";
import { autoLayoutKit } from "../render/auto-layout.mjs";
import { renderSvg } from "../render/svg.mjs";
import { computeViewBox } from "../render/viewbox.mjs";
import { buildEdgeKey, groupAssets } from "../render/edge-key.mjs";
import { buildDataJson } from "../page/data.mjs";
import { renderLayoutHtml } from "../page/layout-html.mjs";

const point = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const plainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

function checkSaved(saved, config) {
  if (saved !== null && !plainObject(saved)) throw new Error("Layout must be a JSON object");
  if (saved?.diagramId && saved.diagramId !== config.id) throw new Error("Saved layout belongs to another diagram id");
  if (saved?.version !== undefined && saved.version !== 1) throw new Error("Unsupported saved layout version");
  for (const kind of ["nodes", "clusters", "edges"]) {
    if (saved?.[kind] !== undefined && !plainObject(saved[kind])) throw new Error(`Layout '${kind}' must be an object`);
  }
}

function restoreClusters(model, saved, layout) {
  for (const [id] of model.clusters) {
    const c = saved?.clusters?.[id];
    if (!c) continue;
    if (![c.x, c.y, c.w, c.h].every(Number.isFinite) || c.w <= 0 || c.h <= 0 || !point(c.title)) throw new Error(`Invalid saved region geometry: ${id}`);
    layout.clusters[id] = structuredClone(c);
  }
}

function restoreNodes(model, saved, layout, refit) {
  for (const [id, n] of model.nodes) {
    const g = saved?.nodes?.[id];
    if (!g) continue;
    if (![g.x, g.y, g.w, g.h].every(Number.isFinite) || g.w <= 0 || g.h <= 0 || !point(g.title)) throw new Error(`Invalid saved server geometry: ${id}`);
    // Text positions depend on the current services, preserving the server's position.
    const rows = n.body.length + (n.hw ? 1 : 0) + (n.os ? 1 : 0), need = 20 + 16 * rows + 18 * n.ip.length;
    layout.nodes[id] = { x: g.x, y: g.y, w: refit.includes(id) ? 0 : g.w, h: refit.includes(id) ? need : Math.max(g.h, need), title: g.title.slice(),
      body: n.body.map((_, i) => [g.x + 10, g.y + 18 + 16 * i]), ip: n.ip.map((_, i) => [g.x + 10, g.y + 22 + 16 * rows + 18 * i]) };
  }
}

function restoreEdges(model, saved, layout) {
  for (const e of model.edges) {
    const k = edgeKey(e), old = saved?.edges?.[k];
    if (old && !plainObject(old)) throw new Error(`Invalid saved connection: ${k}`);
    const g = {};
    if (old?.via !== undefined) {
      if (!Array.isArray(old.via) || !old.via.every(point)) throw new Error(`Invalid connection waypoints: ${k}`);
      g.via = old.via.map((p) => p.slice());
    }
    if (old?.label !== undefined) {
      if (!point(old.label)) throw new Error(`Invalid connection label position: ${k}`);
      g.label = old.label.slice();
    }
    if (e.fw) g.firewall = true;
    layout.edges[k] = g;
  }
}

// Restore positions by stable object id; prune removed objects and refresh text geometry.
// `files` maps folder-relative paths (topology.toml, servers/<id>.toml, ...) to their text.
export function prepareDiagram(files, folder, saved = null, refit = []) {
  const defined = files.has(NETWORKS_FILE) ? parseNetworksFile(files.get(NETWORKS_FILE)) : [];
  const ips = [...tomlModel(files, folder).model.nodes.values()].flatMap((n) => n.ip);
  const all = withDerived(defined, ips), networks = all.length ? all : null;
  const nets = networks && { of: (ip) => networks[assignNetwork(networks, ip)] ?? null };
  const { config: raw, model, sections, notes, docs } = tomlModel(files, folder, nets);
  const config = parseConfig(JSON.stringify(raw), raw.id);
  checkConnections(config, model.edges.map(edgeKey), model.nodes);
  const meta = geometryMeta(model, config.groups, config.processes), kit = geometryKit();
  const layout = { clusters: {}, nodes: {}, edges: {} };
  checkSaved(saved, config);
  restoreClusters(model, saved, layout);
  restoreNodes(model, saved, layout, refit);
  restoreEdges(model, saved, layout);
  autoLayoutKit(kit).fill(layout, meta);
  for (const id of model.nodes.keys()) kit.fitBox(layout.nodes[id], meta.nodes[id]);
  for (const id of model.clusters.keys()) kit.fitRegion(layout, meta, id);
  const drawings = drawKit().validate(saved?.drawings);
  return { config, model, sections, notes, docs, meta, layout, kit, drawings, networks };
}

export function renderDiagram(files, folder, saved, assets, refit = []) {
  const { config, model, sections, notes, docs, meta, layout, kit, drawings, networks } = prepareDiagram(files, folder, saved, refit);
  const { nets, ipNet } = networks ? buildNetworks(networks, model, layout) : { nets: null, ipNet: {} };
  const routes = kit.route(layout, meta);
  const { ent, typeList, typeCss } = resolveTypes(model, layout, config.proposedLabel);
  for (const n of model.nodes.values()) ent["n:" + n.id].os = osInfo(osOf(sections[n.title]));
  const { body: svgBody, idx } = renderSvg({ model, layout, ent, nets, ipNet, routes, groups: config.groups, meta });
  const edgeKeys = buildEdgeKey(model, config.edgeLabels, config.groups), groupKit = groupAssets(config.groups);
  const viewBox = computeViewBox(model, layout, routes);
  const dataJson = buildDataJson({ config, model, layout, meta, idx, ent, typeList, sections, notes, nets, ipNet, edgeKeyRows: edgeKeys.rows, drawings });
  const html = renderLayoutHtml({ title: config.title, cssSvg: assets.cssSvg + "\n" + typeCss + groupKit.css, cssPage: assets.cssPage,
    viewBox, svgBody, drawings, markers: groupKit.markers, edgeKeyHtml: edgeKeys.html, notes, docs, nets, dataJson, js: assets.js });
  return { html, layout, id: config.id, notes: notes.map((n) => n.text), problems: Object.keys(kit.problems(layout, meta)).length };
}
