import { esc } from "../lib/util.mjs";
import { edgeKey, endKey, isDashed } from "../model/edges.mjs";
import { fwGlyph } from "./firewall.mjs";
import { shortTitle, shortOs, displayLabels } from "./geometry.mjs";
import { osFamily } from "../model/os.mjs";
import { osIcons } from "./os-icons.mjs";

const NET_ICON = "M5.5 2.5h3v2.5h-3zM2 8.5h3v2.5h-3zM9 8.5h3v2.5h-3zM7 5v1.75M3.5 8.5v-1.75h7v1.75";

const groupOf = (groups) => {
  const gOf = {};
  for (const [g, d] of Object.entries(groups)) for (const k of d.edges) gOf[k] = g;
  return gOf;
};

// Process endpoint lines ("node:line" -> group id or ""): bold, in the group colour when grouped; lvOf: edge key -> level.
const processLines = (meta) => {
  const hl = {}, lvOf = {};
  for (const m of meta.edges) {
    lvOf[m.k] = m.lv;
    if (m.fl !== null) hl[m.from.slice(2) + ":" + m.fl] = m.g || "";
    if (m.tl !== null) hl[m.to.slice(2) + ":" + m.tl] = m.g || "";
  }
  return { hl, lvOf };
};

const titleMarkup = (title, full) => esc(title) + (title === full ? "" : `<title>${esc(full)}</title>`);

const osMarkup = (os, attrs) => {
  const text = os ? shortOs(os.v) : "OS ?", fam = os ? os.f || osFamily(os.v) : "unknown";
  const tip = os ? os.v + (os.eol ? " - End of life (support ended " + os.eol + ")" : "") : "OS unknown";
  let cls = " unk";
  if (os) cls = os.eol ? " eol" : "";
  const eol = os?.eol ? '<text class="ose" y="9">EOL</text>' : "";
  return `<g class="osg${cls}"${attrs}><rect class="osp" height="12"/><g class="osi" data-f="${fam}" transform="translate(2.5 .5) scale(.786)">${osIcons.glyph(fam)}</g><text class="ost" x="16" y="9" data-t="${esc(text)}">${esc(text)}</text>${eol}<title>${esc(tip)}</title></g>`;
};

const netButton = (attrs, net, j, i, at) => {
  const lbl = esc(`Show network ${net.cidr} ${net.name}`.trim()).replaceAll('"', "&quot;");
  return `<g class="nwb"${attrs} data-n="${j}" data-i="${i}" role="button" tabindex="0" aria-pressed="false" aria-label="${lbl}" transform="translate(${at})"><title>${lbl}</title><rect class="nwr" width="14" height="13"/><path class="nwi" d="${NET_ICON}"/></g>`;
};

const edgeMarker = (grp, dashed) => {
  if (grp) return `ag-${grp}`;
  return dashed ? "ak" : "ar";
};

const renderNode = (cx, n) => {
  const { layout, ent, nets, ipNet, hl, labels, add, out, idx, A, t } = cx;
  const g = layout.nodes[n.id];
  if (g.hidden) return;
  const k = "n:" + n.id;
  const e = { c: add(`<g class="ch"${A(k)}></g>`) };
  e.t = add(`<text class="nt"${A(k)} x="${g.x + 10}" y="${g.y - 10}">${titleMarkup(shortTitle(labels[n.id]), n.title)}</text>`);
  e.r = add(`<rect class="b"${A(k)} x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="14"/>`);
  e.b = n.body.map((s, i) => {
    const h = hl[n.id + ":" + i];
    const dg = h ? ` data-g="${h}"` : "";
    return add(t(g.body[i][0], g.body[i][1], s, ` class="nb${h === undefined ? "" : " pl"}"${A(k)}${dg}`));
  });
  e.i = n.ip.map((s, i) => add(t(g.ip[i][0], g.ip[i][1], s, ` class="ni"${A(k)}`)));
  e.w = n.ip.map((s, i) => {
    const j = nets ? ipNet[s.split("/")[0]] : undefined;
    if (j === undefined) return -1;
    const at = `${g.ip[i][0] + s.length * 6 + 7} ${g.ip[i][1] - 10}`;
    return add(netButton(A(k), nets[j], j, i, at));
  });
  e.o = add(osMarkup(ent[k].os, A(k)));
  idx.nodes[n.id] = e;
  out.push("");
};

const renderEdge = (cx, e, ei) => {
  const { model, ent, routes, gOf, lvOf, add, idx, t } = cx;
  const k = edgeKey(e), rt = routes[k], grp = gOf[k];
  const dashed = isDashed(model, ei);
  const tk = [...new Set([ent[endKey(model, e.from)].tk, ent[endKey(model, e.to)].tk]), "lv:" + lvOf[k], ...(grp ? ["g:" + grp] : [])].join(" ");
  const ea = ` data-ent="e:${k}" data-tk="${tk}"`, ga = grp ? ` data-g="${grp}"` : "";
  const marker = edgeMarker(grp, dashed);
  const p = add(`<path class="${dashed ? "k" : "r"}"${ea}${ga} d="${rt.d}" marker-end="url(#${marker})"/>`);
  let lp = -1, l = -1;
  if (e.label) {
    const lb = rt.label || rt.pts[0];
    lp = add(`<rect class="lp ${dashed ? "lpm" : "lpr"}"${ea}${ga} x="${lb[0] - 7}" y="${lb[1] - 12}" width="${e.label.length * 6 + 14}" height="17"/>`);
    l = add(t(lb[0], lb[1], e.label, ` class="${dashed ? "mvl" : "tcp"}"${ea}${ga}`));
  }
  const ie = { p, l, lp };
  if (rt.fw) {
    const f = rt.fw;
    ie.fw = add(`<g class="fw"${ea}>${fwGlyph(f.at, f.a)}<text class="fwt" x="${f.label[0]}" y="${f.label[1]}" text-anchor="${f.anchor}">firewall</text></g>`);
  }
  idx.edges[k] = ie;
};

// routes: geometry.mjs route() result; groups: topology connection groups.
export function renderSvg({ model, layout, ent, nets, ipNet, routes, groups, meta }) {
  const { clusters, nodes, edges } = model;
  const gOf = groupOf(groups);
  const { hl, lvOf } = processLines(meta);
  const labels = displayLabels(Object.fromEntries([...nodes.values()].map((n) => [n.id, n.title])));
  const out = [];
  let cnt = 0;
  const add = (s) => {
    out.push(s);
    return cnt++;
  };
  const idx = { clusters: {}, nodes: {}, edges: {} };
  const A = (k) => ` data-ent="${k}" data-ty="${ent[k].ty}" data-tk="${ent[k].tk}"`;
  const t = (x, y, s, attrs = "") => `<text${attrs} x="${x}" y="${y}">${esc(s)}</text>`;

  for (const c of clusters.values()) {
    const g = layout.clusters[c.id], k = "c:" + c.id;
    const r = add(`<rect class="d${ent[k].prop ? " prop" : ""}"${A(k)} x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="14"/>`);
    const tt = add(`<text class="ct"${A(k)} x="${g.title[0]}" y="${g.title[1]}" text-anchor="middle">${esc(c.title)}</text>`);
    const ch = add(`<g class="ch cch"${A(k)}></g>`);
    idx.clusters[c.id] = [r, tt, ch];
    out.push("");
  }

  const cx = { model, layout, ent, nets, ipNet, routes, gOf, lvOf, hl, labels, add, out, idx, A, t };
  for (const n of nodes.values()) renderNode(cx, n);
  edges.forEach((e, ei) => renderEdge(cx, e, ei));

  return { body: out.join("\n"), idx };
}
