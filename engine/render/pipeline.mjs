// The one render pipeline: a parsed model plus its layout in, everything a page or an export needs out. No file or DOM access.
import { buildNetworks } from "../parse/shared-networks.mjs";
import { ipNetworks, networkMembers } from "../parse/networks.mjs";
import { resolveTypes } from "../parse/types.mjs";
import { osOf } from "../parse/details.mjs";
import { osInfo } from "../model/os.mjs";
import { validateGeometry } from "./validate.mjs";
import { renderSvg } from "./svg.mjs";
import { computeViewBox } from "./viewbox.mjs";
import { buildEdgeKey, groupAssets } from "./edge-key.mjs";
import { buildDataJson } from "../page/data.mjs";
import { renderLayoutHtml } from "../page/layout-html.mjs";

// `networks` is null, { kind: "shared", items } (networks.toml rows) or { kind: "tree", items, texts } (legacy networks.md tree;
// `texts` are extra text blocks scanned for IPs).
export function deriveNetworks(networks, model, layout) {
  if (!networks) return { nets: null, ipNet: {} };
  if (networks.kind === "shared") return buildNetworks(networks.items, model, layout);
  const ips = [...model.nodes.values()].flatMap((n) => n.ip);
  return { nets: networkMembers(networks.items, model, layout), ipNet: ipNetworks(networks.items, [...ips, ...(networks.texts || [])]) };
}

export function renderModel({ config, model, layout, meta, kit, sections, notes, docs, drawings, networks = null, assets = null, validate = false }) {
  if (validate) validateGeometry(model, layout, meta);
  const routes = kit.route(layout, meta);
  const { nets, ipNet } = deriveNetworks(networks, model, layout);
  const { ent, typeList, typeCss } = resolveTypes(model, layout, config.proposedLabel);
  for (const n of model.nodes.values()) if (ent["n:" + n.id]) ent["n:" + n.id].os = osInfo(n.fields ? n.fields.os : osOf(sections[n.title]));
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
