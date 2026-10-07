import { edgeKey } from "../parse/mmd.mjs";

const PAD = 20;
const CW = 7;

export function computeViewBox({ clusters, nodes, edges }, layout, routes) {
  const bb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const grow = (x0, y0, x1, y1) => {
    bb.x0 = Math.min(bb.x0, x0);
    bb.y0 = Math.min(bb.y0, y0);
    bb.x1 = Math.max(bb.x1, x1);
    bb.y1 = Math.max(bb.y1, y1);
  };
  const txt = (x, y, s, anchor, fs = 11) => {
    const tw = (s.length * CW * fs) / 11;
    const x0 = anchor === "middle" ? x - tw / 2 : anchor === "end" ? x - tw : x;
    grow(x0, y - 12, x0 + tw, y + 4);
  };
  for (const c of clusters.values()) {
    const g = layout.clusters[c.id];
    grow(g.x, g.y, g.x + g.w, g.y + g.h);
    txt(g.title[0], g.title[1], c.title, "middle");
  }
  for (const n of nodes.values()) {
    const g = layout.nodes[n.id];
    if (g.hidden) continue;
    grow(g.x, g.y, g.x + g.w, g.y + g.h);
    txt(g.title[0], g.title[1], n.title);
    n.body.forEach((s, i) => txt(g.body[i][0], g.body[i][1], s));
    n.ip.forEach((s, i) => txt(g.ip[i][0], g.ip[i][1], s));
  }
  edges.forEach((e) => {
    const r = routes[edgeKey(e)];
    if (!r) return;
    for (const p of r.pts) grow(p[0], p[1], p[0], p[1]);
    if (e.label && r.label) txt(r.label[0], r.label[1], e.label);
    if (r.fw) {
      grow(r.fw.at[0] - 12, r.fw.at[1] - 12, r.fw.at[0] + 12, r.fw.at[1] + 12);
      txt(r.fw.label[0], r.fw.label[1], "firewall", r.fw.anchor);
    }
  });
  const vx = Math.floor(bb.x0 - PAD), vy = Math.floor(bb.y0 - PAD);
  const vw = Math.ceil(bb.x1 + PAD) - vx, vh = Math.ceil(bb.y1 + PAD) - vy;
  return `${vx} ${vy} ${vw} ${vh}`;
}
