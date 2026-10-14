import { fail } from "../lib/errors.mjs";
import { METRICS } from "./metrics.mjs";
import { geometryKit, displayLabels, shortTitle } from "./geometry.mjs";

const BAND = METRICS.band, BAND_GAP = METRICS.bandGap, BOX_HEAD = METRICS.head;
const MIN_GAP = METRICS.minGap, CLUSTER_PAD = METRICS.pad;
const kit = geometryKit();

function bandProblems(clusters, nodes, layout) {
  const problems = [];
  for (const n of nodes.values()) {
    const g = layout.nodes[n.id], c = n.cluster && layout.clusters[n.cluster];
    if (g.hidden || !c) continue;
    const limit = c.y + BAND + BAND_GAP;
    if (g.y - BOX_HEAD < limit) problems.push(`node "${n.id}": box top incl. ${BOX_HEAD}px header (${g.y - BOX_HEAD}) intrudes into cluster "${n.cluster}" header band; needs >= ${limit} (cluster y + ${BAND} + ${BAND_GAP})`);
  }
  for (const [id, c] of Object.entries(layout.clusters)) {
    if (c.title[1] < c.y + 12 || c.title[1] > c.y + BAND - 4) problems.push(`cluster "${id}": title y ${c.title[1]} is outside its header band (${c.y + 12}..${c.y + BAND - 4})`);
  }
  return problems;
}

const failWith = (problems) => {
  if (problems.length) fail("\n  " + problems.join("\n  "));
};

// Normalises geometry in place (text x, box widths, regions grown around their servers) and checks spacing.
export function validateGeometry(model, layout, meta) {
  const { clusters, nodes } = model;
  for (const n of nodes.values()) if (!layout.nodes[n.id].hidden) kit.fitBox(layout.nodes[n.id], meta.nodes[n.id]);
  for (const id of clusters.keys()) kit.fitRegion(layout, meta, id);

  const problems = bandProblems(clusters, nodes, layout);
  failWith(problems.length ? problems : checkSpacing(clusters, nodes, layout));
}

const r1 = (v) => Math.round(v * 10) / 10;
const gapOf = (a, b) => Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1);

// Drawn extent of a box: header above y, chrome widened to fit the title, bottom stretched to the last IP pill.
function checkSpacing(clusters, nodes, layout) {
  const problems = [];
  const boxes = [], labels = displayLabels(Object.fromEntries([...nodes.values()].map((n) => [n.id, n.title])));
  for (const n of nodes.values()) {
    const g = layout.nodes[n.id];
    if (!g.hidden) boxes.push({ id: n.id, cluster: n.cluster, ...kit.boxExtent(g, shortTitle(labels[n.id]).length) });
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
