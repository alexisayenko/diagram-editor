import { fail } from "../lib/util.mjs";
import { edgeKey } from "./mmd.mjs";
import { geometryKit } from "../render/geometry.mjs";

const BAND = 30, BAND_GAP = 10, BOX_HEAD = 20;
const MIN_GAP = 20, CLUSTER_PAD = 16;
const EDGE_KEYS = ["via", "label", "firewall"];
const kit = geometryKit();

const isPt = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === "number" && isFinite(v));

// Checks ids and keys, then normalises geometry in place (text x, box widths, regions grown around their servers) and checks spacing.
export function validateGeometry({ clusters, nodes, edges }, layout, meta) {
  const problems = [];
  const diff = (what, mmdIds, jsonIds) => {
    for (const id of mmdIds) if (!jsonIds.includes(id)) problems.push(`${what} "${id}" is in diagram.mmd but has no geometry in layout.json`);
    for (const id of jsonIds) if (!mmdIds.includes(id)) problems.push(`${what} "${id}" is in layout.json but not in diagram.mmd`);
  };
  diff("cluster", [...clusters.keys()], Object.keys(layout.clusters));
  diff("node", [...nodes.keys()], Object.keys(layout.nodes));
  diff("edge", edges.map(edgeKey), Object.keys(layout.edges));
  for (const n of nodes.values()) {
    const g = layout.nodes[n.id];
    if (!g || g.hidden) continue;
    if (g.body.length !== n.body.length) problems.push(`node "${n.id}": ${n.body.length} body lines in mmd, ${g.body.length} positions in layout.json`);
    if (g.ip.length !== n.ip.length) problems.push(`node "${n.id}": ${n.ip.length} IP lines in mmd, ${g.ip.length} positions in layout.json`);
  }
  for (const [k, g] of Object.entries(layout.edges)) {
    if ("path" in g) problems.push(`edge "${k}": "path" is no longer used; connections are routed automatically (steer one with "via": [[x, y], ...])`);
    const bad = Object.keys(g).filter((x) => x !== "path" && !EDGE_KEYS.includes(x));
    if (bad.length) problems.push(`edge "${k}": unknown key ${bad.join(", ")} (allowed: ${EDGE_KEYS.join(", ")})`);
    if (g.via !== undefined && !(Array.isArray(g.via) && g.via.every(isPt))) problems.push(`edge "${k}": "via" must be a list of [x, y] waypoints`);
    if (g.label !== undefined && !isPt(g.label)) problems.push(`edge "${k}": "label" must be [x, y] (omit it for automatic placement)`);
  }
  for (const e of edges) {
    const g = layout.edges[edgeKey(e)];
    if (!g) continue;
    if (g.firewall !== undefined && g.firewall !== true) problems.push(`edge "${edgeKey(e)}": "firewall" must be true (the marker is placed automatically), got ${JSON.stringify(g.firewall)}`);
    else if (e.fw && !g.firewall) problems.push(`edge "${edgeKey(e)}": label ends with "· firewall" but layout.json has no "firewall": true`);
    else if (!e.fw && g.firewall) problems.push(`edge "${edgeKey(e)}": layout.json has "firewall": true but the diagram.mmd label does not end with "· firewall"`);
  }
  if (problems.length) fail("\n  " + problems.join("\n  "));

  for (const n of nodes.values()) if (!layout.nodes[n.id].hidden) kit.fitBox(layout.nodes[n.id], meta.nodes[n.id]);
  for (const id of clusters.keys()) kit.fitRegion(layout, meta, id);

  for (const n of nodes.values()) {
    const g = layout.nodes[n.id], c = n.cluster && layout.clusters[n.cluster];
    if (g.hidden || !c) continue;
    const limit = c.y + BAND + BAND_GAP;
    if (g.y - BOX_HEAD < limit) problems.push(`node "${n.id}": box top incl. ${BOX_HEAD}px header (${g.y - BOX_HEAD}) intrudes into cluster "${n.cluster}" header band; needs >= ${limit} (cluster y + ${BAND} + ${BAND_GAP})`);
  }
  for (const [id, c] of Object.entries(layout.clusters)) {
    if (c.title[1] < c.y + 12 || c.title[1] > c.y + BAND - 4) problems.push(`cluster "${id}": title y ${c.title[1]} is outside its header band (${c.y + 12}..${c.y + BAND - 4})`);
  }
  if (!problems.length) problems.push(...checkSpacing(clusters, nodes, layout));
  if (problems.length) fail("\n  " + problems.join("\n  "));
}

const r1 = (v) => Math.round(v * 10) / 10;
const gapOf = (a, b) => Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1);

// Drawn extent of a box: header above y, chrome widened to fit the title, bottom stretched to the last IP pill.
function checkSpacing(clusters, nodes, layout) {
  const problems = [];
  const boxes = [];
  for (const n of nodes.values()) {
    const g = layout.nodes[n.id];
    if (!g.hidden) boxes.push({ id: n.id, cluster: n.cluster, ...kit.boxExtent(g, n.title.length) });
  }
  const cl = [...clusters.keys()].map((id) => {
    const c = layout.clusters[id];
    return { id, x0: c.x, y0: c.y, x1: c.x + c.w, y1: c.y + c.h };
  });
  const HEAD = `incl. ${BOX_HEAD}px header and title width`;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j], gap = gapOf(a, b);
    if (gap < MIN_GAP) problems.push(`nodes "${a.id}" and "${b.id}": ${gap < 0 ? "overlap" : "gap"} ${r1(gap)}px between drawn boxes (${HEAD}); needs >= ${MIN_GAP}`);
  }
  for (const b of boxes) {
    const c = cl.find((k) => k.id === b.cluster);
    if (!c) continue;
    for (const [side, gap] of [["left", b.x0 - c.x0], ["right", c.x1 - b.x1], ["bottom", c.y1 - b.y1]]) {
      if (gap < CLUSTER_PAD) problems.push(`node "${b.id}": ${r1(gap)}px to the ${side} border of cluster "${c.id}" (${HEAD}); needs >= ${CLUSTER_PAD}`);
    }
  }
  for (let i = 0; i < cl.length; i++) for (let j = i + 1; j < cl.length; j++) {
    const gap = gapOf(cl[i], cl[j]);
    if (gap < MIN_GAP) problems.push(`clusters "${cl[i].id}" and "${cl[j].id}": ${gap < 0 ? "overlap" : "gap"} ${r1(gap)}px; needs >= ${MIN_GAP}`);
  }
  for (const c of cl) for (const b of boxes) {
    if (b.cluster === c.id) continue;
    const gap = gapOf(c, b);
    if (gap < MIN_GAP) problems.push(`cluster "${c.id}" and node "${b.id}": ${gap < 0 ? "overlap" : "gap"} ${r1(gap)}px (${HEAD}); needs >= ${MIN_GAP}`);
  }
  return problems;
}
