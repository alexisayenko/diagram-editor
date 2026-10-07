import { esc } from "../lib/util.mjs";
import { edgeKey, endKey, isDashed } from "../parse/mmd.mjs";
import { fwGlyph } from "./firewall.mjs";

const NET_ICON = "M5.5 2.5h3v2.5h-3zM2 8.5h3v2.5h-3zM9 8.5h3v2.5h-3zM7 5v1.75M3.5 8.5v-1.75h7v1.75";

// routes: geometry.mjs route() result; groups: diagram.json connection groups.
export function renderSvgBody(model, layout, ent, nets, ipNet, routes, groups, meta) {
  const { clusters, nodes, edges } = model;
  const gOf = {};
  for (const [g, d] of Object.entries(groups)) for (const k of d.edges) gOf[k] = g;
  const hl = {};
  // Process endpoint lines ("node:line" → group id or ""): bold, in the group colour when grouped.
  const lvOf = {};
  for (const m of meta.edges) {
    lvOf[m.k] = m.lv;
    if (m.fl !== null) hl[m.from.slice(2) + ":" + m.fl] = m.g || "";
    if (m.tl !== null) hl[m.to.slice(2) + ":" + m.tl] = m.g || "";
  }
  const out = [];
  let cnt = 0;
  const add = (s) => (out.push(s), cnt++);
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

  for (const n of nodes.values()) {
    const g = layout.nodes[n.id];
    if (g.hidden) continue;
    const k = "n:" + n.id;
    const e = { c: add(`<g class="ch"${A(k)}></g>`) };
    e.t = add(t(g.title[0], g.title[1], n.title, ` class="nt"${A(k)}`));
    e.r = add(`<rect class="b"${A(k)} x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="14"/>`);
    e.b = n.body.map((s, i) => {
      const h = hl[n.id + ":" + i];
      return add(t(g.body[i][0], g.body[i][1], s, ` class="nb${h === undefined ? "" : " pl"}"${A(k)}${h ? ` data-g="${h}"` : ""}`));
    });
    e.i = n.ip.map((s, i) => add(t(g.ip[i][0], g.ip[i][1], s, ` class="ni"${A(k)}`)));
    e.w = n.ip.map((s, i) => {
      const j = nets ? ipNet[s.split("/")[0]] : undefined;
      if (j === undefined) return -1;
      const lbl = esc(`Show network ${nets[j].cidr} ${nets[j].name}`).replace(/"/g, "&quot;");
      const at = `${g.ip[i][0] + s.length * 6 + 7} ${g.ip[i][1] - 10}`;
      return add(`<g class="nwb"${A(k)} data-n="${j}" data-i="${i}" role="button" tabindex="0" aria-pressed="false" aria-label="${lbl}" transform="translate(${at})"><title>${lbl}</title><rect class="nwr" width="14" height="13"/><path class="nwi" d="${NET_ICON}"/></g>`);
    });
    const os = ent[k].os;
    const ol = os ? esc(os.v) + (os.eol ? ' <tspan class="ose">EOL</tspan>' : "") : "OS ?";
    e.o = add(`<g class="osg${os ? (os.eol ? " eol" : "") : " unk"}"${A(k)}><rect class="osp" height="12"/><text class="ost" x="4" y="9">${ol}</text></g>`);
    idx.nodes[n.id] = e;
    out.push("");
  }

  edges.forEach((e, ei) => {
    const k = edgeKey(e), rt = routes[k], grp = gOf[k];
    const dashed = isDashed(model, ei);
    const tk = [...new Set([ent[endKey(model, e.from)].tk, ent[endKey(model, e.to)].tk]), "lv:" + lvOf[k], ...(grp ? ["g:" + grp] : [])].join(" ");
    const ea = ` data-ent="e:${k}" data-tk="${tk}"`, ga = grp ? ` data-g="${grp}"` : "";
    const marker = grp ? `ag-${grp}` : dashed ? "ak" : "ar";
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
  });

  return { body: out.join("\n"), idx };
}
