// The one render pipeline: a parsed model plus its layout in, everything a page or an export needs out. No file or DOM access.
// routeCache: the routeCache of an earlier result; routes are reused when nothing they depend on changed (route-cache.mjs).
import { buildNetworks } from "../parse/shared-networks.mjs";
import { resolveTypes } from "../parse/types.mjs";
import { osInfo } from "../model/os.mjs";
import { nodeKey } from "../lib/keys.mjs";
import { validateGeometry } from "./validate.mjs";
import { renderSvg } from "./svg.mjs";
import { computeViewBox } from "./viewbox.mjs";
import { routeAll } from "./route-cache.mjs";
import { buildEdgeKey, groupAssets } from "./edge-key.mjs";
import { buildDataJson } from "../page/data.mjs";
import { renderLayoutHtml, renderScene } from "../page/layout-html.mjs";

// `networks` is null or the networks.toml rows with the derived ones (shared-networks.mjs).
export function deriveNetworks(networks, model, layout) {
  return networks ? buildNetworks(networks, model, layout) : { nets: null, ipNet: {} };
}

export function renderModel({ config, model, layout, meta, kit, sections, notes, docs, drawings, networks = null, assets = null, validate = false, routeCache = null }) {
  if (validate) validateGeometry(model, layout, meta);
  const { routes, cache } = routeAll(kit, layout, meta, routeCache);
  const { nets, ipNet } = deriveNetworks(networks, model, layout);
  const { ent, typeList, typeCss } = resolveTypes(model, layout, config.proposedLabel);
  for (const n of model.nodes.values()) if (ent[nodeKey("server", n.id)]) ent[nodeKey("server", n.id)].os = osInfo(n.fields.os);
  const { body: svgBody, idx } = renderSvg({ model, layout, ent, nets, ipNet, routes, groups: config.groups, meta });
  const viewBox = computeViewBox(model, layout, routes);
  const groupKit = groupAssets(config.groups);
  const edgeKeys = buildEdgeKey(model, config.edgeLabels, config.groups);
  const dataJson = buildDataJson({ config, model, layout, meta, idx, ent, typeList, sections, notes, nets, ipNet, edgeKeyRows: edgeKeys.rows, drawings });
  const scene = assets && renderScene({
    id: config.id,
    title: config.title,
    cssSvg: assets.cssSvg + "\n" + typeCss.trim() + (groupKit.css ? "\n" + groupKit.css : ""),
    viewBox, svgBody, drawings,
    markers: groupKit.markers,
    edgeKeyHtml: edgeKeys.html,
    notes, docs, nets, dataJson,
  });
  const html = scene && renderLayoutHtml({ scene, cssPage: assets.cssPage, js: assets.js });
  return { html, scene, routes, routeCache: cache, nets, ipNet, ent, typeList, typeCss, svgBody, idx, viewBox, groupKit, edgeKeys, dataJson };
}
