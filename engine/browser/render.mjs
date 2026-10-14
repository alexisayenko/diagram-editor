import { tomlModel } from "../parse/toml.mjs";
import { NETWORKS_FILE } from "../lib/files.mjs";
import { assignNetwork, parseNetworksFile, withDerived } from "../parse/shared-networks.mjs";
import { parseConfig, checkConnections } from "../model/config.mjs";
import { edgeKey } from "../model/edges.mjs";
import { geometryKit, geometryMeta } from "../render/geometry.mjs";
import { drawKit } from "../render/draw-kit.mjs";
import { autoLayoutKit } from "../render/auto-layout.mjs";
import { renderModel } from "../render/pipeline.mjs";
import { LAYOUT_VERSION } from "../parse/layout-version.mjs";

const point = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const plainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

function checkSaved(saved) {
  if (saved !== null && !plainObject(saved)) throw new Error("Layout must be a JSON object");
  if (saved?.version !== undefined && saved.version !== LAYOUT_VERSION) throw new Error("Unsupported saved layout version");
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

function restoreNodes(model, saved, layout, refit, meta, kit) {
  for (const id of model.nodes.keys()) {
    const g = saved?.nodes?.[id];
    if (!g) continue;
    if (![g.x, g.y, g.w, g.h].every(Number.isFinite) || g.w <= 0 || g.h <= 0 || !point(g.title)) throw new Error(`Invalid saved server geometry: ${id}`);
    // Text positions depend on the current services, preserving the server's position.
    const fresh = kit.boxFor(meta.nodes[id], g.x, g.y);
    layout.nodes[id] = { x: g.x, y: g.y, w: refit.includes(id) ? 0 : g.w, h: refit.includes(id) ? fresh.h : Math.max(g.h, fresh.h), title: g.title.slice(), body: fresh.body, ip: fresh.ip };
  }
}

function savedEdgeGeometry(old, k) {
  const g = {};
  if (old?.via !== undefined) {
    if (!Array.isArray(old.via) || !old.via.every(point)) throw new Error(`Invalid connection waypoints: ${k}`);
    g.via = old.via.map((p) => p.slice());
  }
  if (old?.label !== undefined) {
    if (!point(old.label)) throw new Error(`Invalid connection label position: ${k}`);
    g.label = old.label.slice();
  }
  return g;
}

function restoreEdges(model, saved, layout) {
  for (const e of model.edges) {
    const k = edgeKey(e), old = saved?.edges?.[k];
    if (old && !plainObject(old)) throw new Error(`Invalid saved connection: ${k}`);
    const g = savedEdgeGeometry(old, k);
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
  checkSaved(saved);
  const warnings = saved?.diagramId && saved.diagramId !== config.id ? [`Saved layout was made for diagram "${saved.diagramId}"; using it for "${config.id}"`] : [];
  restoreClusters(model, saved, layout);
  restoreNodes(model, saved, layout, refit, meta, kit);
  restoreEdges(model, saved, layout);
  autoLayoutKit(kit).fill(layout, meta);
  for (const id of model.nodes.keys()) kit.fitBox(layout.nodes[id], meta.nodes[id]);
  for (const id of model.clusters.keys()) kit.fitRegion(layout, meta, id);
  const drawings = drawKit().validate(saved?.drawings);
  return { config, model, sections, notes, docs, meta, layout, kit, drawings, networks, warnings };
}

export function renderDiagram(files, folder, saved, assets, refit = [], routeCache = null) {
  const { config, model, sections, notes, docs, meta, layout, kit, drawings, networks, warnings } = prepareDiagram(files, folder, saved, refit);
  const { html, routeCache: nextRouteCache } = renderModel({ config, model, layout, meta, kit, sections, notes, docs, drawings, assets, networks, routeCache });
  return { html, routeCache: nextRouteCache, layout, id: config.id, notes: notes.map((n) => n.text), problems: Object.keys(kit.problems(layout, meta)).length, warnings };
}
