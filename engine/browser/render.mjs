import { tomlModel } from "../parse/toml.mjs";
import { parseConfig, checkConnections } from "../parse/config.mjs";
import { resolveTypes } from "../parse/types.mjs";
import { osOf } from "../parse/details.mjs";
import { osInfo } from "../parse/os-eol.mjs";
import { edgeKey } from "../parse/mmd.mjs";
import { geometryKit, geometryMeta } from "../render/geometry.mjs";
import { autoLayoutKit } from "../render/auto-layout.mjs";
import { renderSvgBody } from "../render/svg.mjs";
import { computeViewBox } from "../render/viewbox.mjs";
import { buildEdgeKey, groupAssets } from "../render/edge-key.mjs";
import { buildDataJson } from "../page/data.mjs";
import { renderLayoutHtml } from "../page/layout-html.mjs";

// Restore positions by stable object id; prune removed objects and refresh text geometry.
export function prepareDiagram(source, filename, saved = null) {
  const { config: raw, model, sections, notes } = tomlModel(source, filename);
  const config = parseConfig(JSON.stringify(raw), raw.id);
  checkConnections(config, model.edges.map(edgeKey), model.nodes);
  const meta = geometryMeta(model, config.groups, config.processes), kit = geometryKit();
  const layout = { clusters: {}, nodes: {}, edges: {} };
  const point = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  if (saved !== null && (!saved || typeof saved !== "object" || Array.isArray(saved))) throw new Error("Layout must be a JSON object");
  if (saved?.diagramId && saved.diagramId !== config.id) throw new Error("Saved layout belongs to another diagram id");
  if (saved?.version !== undefined && saved.version !== 1) throw new Error("Unsupported saved layout version");
  for (const kind of ["nodes", "clusters", "edges"]) {
    if (saved?.[kind] !== undefined && (!saved[kind] || typeof saved[kind] !== "object" || Array.isArray(saved[kind]))) throw new Error(`Layout '${kind}' must be an object`);
  }
  for (const [id] of model.clusters) {
    const c = saved?.clusters?.[id];
    if (!c) continue;
    if (![c.x, c.y, c.w, c.h].every(Number.isFinite) || c.w <= 0 || c.h <= 0 || !point(c.title)) throw new Error(`Invalid saved region geometry: ${id}`);
    layout.clusters[id] = JSON.parse(JSON.stringify(c));
  }
  for (const [id, n] of model.nodes) {
    const g = saved?.nodes?.[id];
    if (!g) continue;
    if (![g.x, g.y, g.w, g.h].every(Number.isFinite) || g.w <= 0 || g.h <= 0 || !point(g.title)) throw new Error(`Invalid saved server geometry: ${id}`);
    // Text positions depend on the current services, preserving the server's position.
    layout.nodes[id] = { x: g.x, y: g.y, w: g.w, h: Math.max(g.h, 20 + 16 * n.body.length + 18 * n.ip.length), title: g.title.slice(),
      body: n.body.map((_, i) => [g.x + 10, g.y + 18 + 16 * i]), ip: n.ip.map((_, i) => [g.x + 10, g.y + 22 + 16 * n.body.length + 18 * i]) };
  }
  for (const e of model.edges) {
    const k = edgeKey(e), old = saved?.edges?.[k];
    if (old && (typeof old !== "object" || Array.isArray(old))) throw new Error(`Invalid saved connection: ${k}`);
    const g = {};
    if (old?.via !== undefined) {
      if (!Array.isArray(old.via) || !old.via.every(point)) throw new Error(`Invalid connection waypoints: ${k}`);
      g.via = old.via.map((p) => p.slice());
    }
    if (old?.label !== undefined) { if (!point(old.label)) throw new Error(`Invalid connection label position: ${k}`); g.label = old.label.slice(); }
    if (e.fw) g.firewall = true;
    layout.edges[k] = g;
  }
  autoLayoutKit(kit).fill(layout, meta);
  for (const id of model.nodes.keys()) kit.fitBox(layout.nodes[id], meta.nodes[id]);
  for (const id of model.clusters.keys()) kit.fitRegion(layout, meta, id);
  return { config, model, sections, notes, meta, layout, kit };
}

export function renderDiagram(source, filename, saved, assets) {
  const { config, model, sections, notes, meta, layout, kit } = prepareDiagram(source, filename, saved);
  const routes = kit.route(layout, meta);
  const { ent, typeList, typeCss } = resolveTypes(model, layout, config.proposedLabel);
  for (const n of model.nodes.values()) ent["n:" + n.id].os = osInfo(osOf(sections[n.title]));
  const { body: svgBody, idx } = renderSvgBody(model, layout, ent, null, {}, routes, config.groups, meta);
  const edgeKeys = buildEdgeKey(model, config.edgeLabels, config.groups), groupKit = groupAssets(config.groups);
  const viewBox = computeViewBox(model, layout, routes);
  const dataJson = buildDataJson({ config, model, layout, meta, idx, ent, typeList, sections, notes, nets: null, ipNet: {}, edgeKeyRows: edgeKeys.rows });
  const html = renderLayoutHtml({ title: config.title, cssSvg: assets.cssSvg + "\n" + typeCss + groupKit.css, cssPage: assets.cssPage,
    viewBox, svgBody, markers: groupKit.markers, edgeKeyHtml: edgeKeys.html, notes, docs: [], nets: null, dataJson, js: assets.js });
  return { html, layout, id: config.id, problems: Object.keys(kit.problems(layout, meta)).length };
}
