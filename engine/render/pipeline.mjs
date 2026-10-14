// The one render pipeline: a parsed model plus its layout in, everything a page or an export needs out. No file or DOM access.
import { buildNetworks } from "../parse/shared-networks.mjs";
import { resolveTypes } from "../parse/types.mjs";
import { osInfo } from "../model/os.mjs";
import { validateGeometry } from "./validate.mjs";
import { renderSvg } from "./svg.mjs";
import { computeViewBox } from "./viewbox.mjs";
import { buildEdgeKey, groupAssets } from "./edge-key.mjs";
import { buildDataJson } from "../page/data.mjs";
import { renderLayoutHtml } from "../page/layout-html.mjs";

// `networks` is null or the networks.toml rows with the derived ones (shared-networks.mjs).
export function deriveNetworks(networks, model, layout) {
  return networks ? buildNetworks(networks, model, layout) : { nets: null, ipNet: {} };
}

export function renderModel({ config, model, layout, meta, kit, sections, notes, docs, drawings, networks = null, assets = null, validate = false }) {
  if (validate) validateGeometry(model, layout, meta);
  const routes = kit.route(layout, meta);
  const { nets, ipNet } = deriveNetworks(networks, model, layout);
  const { ent, typeList, typeCss } = resolveTypes(model, layout, config.proposedLabel);
  for (const n of model.nodes.values()) if (ent["n:" + n.id]) ent["n:" + n.id].os = osInfo(n.fields.os);
  const { body: svgBody, idx } = renderSvg({ model, layout, ent, nets, ipNet, routes, groups: config.groups, meta });
  const viewBox = computeViewBox(model, layout, routes);
  const groupKit = groupAssets(config.groups);
  const edgeKeys = buildEdgeKey(model, config.edgeLabels, config.groups);
  const dataJson = buildDataJson({ config, model, layout, meta, idx, ent, typeList, sections, notes, nets, ipNet, edgeKeyRows: edgeKeys.rows, drawings });
  const html = assets && renderLayoutHtml({
    title: config.title,
    cssSvg: assets.cssSvg + "\n" + typeCss.trim() + (groupKit.css ? "\n" + groupKit.css : ""),
    cssPage: assets.cssPage,
    viewBox, svgBody, drawings,
    markers: groupKit.markers,
    edgeKeyHtml: edgeKeys.html,
    notes, docs, nets, dataJson,
    js: assets.js,
  });
  return { html, routes, nets, ipNet, ent, typeList, typeCss, svgBody, idx, viewBox, groupKit, edgeKeys, dataJson };
}
