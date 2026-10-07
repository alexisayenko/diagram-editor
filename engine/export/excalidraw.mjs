import { createHash } from "node:crypto";
import { isDashed } from "../parse/mmd.mjs";
import { geometryKit } from "../render/geometry.mjs";

// "sketch": monochrome whiteboard like the Sketch skin (red only for connection groups and firewalls, yellow notes); "clean": coloured cards, type legend.
const STYLE = "sketch";
const SKETCH = STYLE === "sketch";

// Fonts: 5 = Excalifont (hand-drawn, default), 1 = Virgil, 2 = Helvetica, 3 = Cascadia (monospace).
const SANS = 5;
const MONO = 5;
const CHAR_W = { 1: 0.6, 2: 0.56, 3: 0.6, 5: 0.6 };
const LINE_H = { 1: 1.25, 2: 1.15, 3: 1.2, 5: 1.25 };
const ASCENT = { 1: 0.9, 2: 0.85, 3: 0.9, 5: 0.9 };
const HEAD = 20;
const INK = "#1e1e1e";
const MUTED = "#6b7280";
const AMBER = "#b26a00";
const FW_RED = "#d62728";
const FW_PTS = [[-3.5, -11], [3.5, -6.6], [-3.5, -2.2], [3.5, 2.2], [-3.5, 6.6], [3.5, 11]];

const r1 = (v) => Math.round(v * 10) / 10;
const digest = (s) => createHash("sha1").update(s).digest();
const mix = (hex, t) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return "#" + c.map((v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, "0")).join("");
};
const wrap = (s, max) => {
  const out = [];
  let cur = "";
  for (const w of s.split(/\s+/)) {
    if (cur && (cur + " " + w).length > max) (out.push(cur), (cur = w));
    else cur = cur ? cur + " " + w : w;
  }
  if (cur) out.push(cur);
  return out;
};

// Excalidraw scene for a diagram: same geometry as the view (fitted boxes, routed connections, label and firewall spots).
export function renderExcalidraw({ config, model, layout, meta, routes, ent, typeList, typeColors, notes, edgeLabels, viewBox, drawings = [] }) {
  const kit = geometryKit();
  const els = [];
  const byId = {};
  const used = new Set();
  const idOf = (key) => {
    const id = digest(key).toString("base64url").slice(0, 20);
    if (used.has(id)) throw new Error(`excalidraw: duplicate element key ${key}`);
    used.add(id);
    return id;
  };
  const gid = (key) => digest("group:" + key).toString("base64url").slice(0, 20);

  const base = (key, type, x, y, w, h, o = {}) => {
    const d = digest(key);
    const el = {
      id: idOf(key),
      type,
      x: r1(x),
      y: r1(y),
      width: r1(w),
      height: r1(h),
      angle: 0,
      strokeColor: o.stroke || INK,
      backgroundColor: o.bg || "transparent",
      fillStyle: "solid",
      strokeWidth: o.sw || 1,
      strokeStyle: o.dashed ? "dashed" : "solid",
      roughness: 1,
      opacity: 100,
      groupIds: o.groups || [],
      frameId: null,
      roundness: o.round ? { type: 3 } : null,
      seed: d.readUInt32BE(0) & 0x7fffffff,
      version: 1,
      versionNonce: d.readUInt32BE(4) & 0x7fffffff,
      isDeleted: false,
      boundElements: null,
      updated: 1,
      link: null,
      locked: false,
    };
    els.push(el);
    byId[el.id] = el;
    return el;
  };
  const bind = (container, child) => (container.boundElements ||= []).push({ id: child.id, type: child.type });

  const rect = (key, x, y, w, h, o) => base(key, "rectangle", x, y, w, h, o);
  // top: y of the text box; baseline: SVG-style baseline (converted with the font's ascent).
  const text = (key, s, o) => {
    const fs = o.fs || 12, ff = o.ff || SANS, lines = s.split("\n");
    const w = Math.max(...lines.map((l) => l.length)) * fs * CHAR_W[ff], h = lines.length * fs * LINE_H[ff];
    const top = o.top ?? o.baseline - fs * ASCENT[ff];
    const x = o.align === "center" ? o.x - w / 2 : o.align === "right" ? o.x - w : o.x;
    const el = base(key, "text", x, top, w, h, { stroke: o.color || INK, groups: o.groups });
    Object.assign(el, {
      text: s,
      fontSize: fs,
      fontFamily: ff,
      textAlign: o.align || "left",
      verticalAlign: o.valign || "top",
      containerId: o.container ? o.container.id : null,
      originalText: o.original || s,
      lineHeight: LINE_H[ff],
      autoResize: true,
    });
    if (o.container) bind(o.container, el);
    return el;
  };
  const linear = (key, type, pts, o) => {
    const [x0, y0] = pts[0];
    const rel = pts.map(([x, y]) => [r1(x - x0), r1(y - y0)]);
    const xs = rel.map((p) => p[0]), ys = rel.map((p) => p[1]);
    const el = base(key, type, x0, y0, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), o);
    Object.assign(el, {
      points: rel,
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: type === "arrow" ? "arrow" : null,
      elbowed: false,
    });
    return el;
  };

  const colorOf = (ty) => typeColors[ty] || MUTED;
  const shapeOf = {};

  for (const c of model.clusters.values()) {
    const g = layout.clusters[c.id], e = ent["c:" + c.id], col = colorOf(e.ty);
    const r = SKETCH
      ? rect("c:" + c.id, g.x, g.y, g.w, g.h, { dashed: true, round: true })
      : rect("c:" + c.id, g.x, g.y, g.w, g.h, { stroke: col, bg: mix(col, 0.93), dashed: e.prop, round: true });
    text("c:" + c.id + ":title", c.title, { container: r, x: g.x + g.w / 2, top: g.y + 5, align: "center", fs: 14 });
    shapeOf["c:" + c.id] = r;
  }

  const procLine = {};
  for (const m of meta.edges) {
    if (m.fl !== null) procLine[m.from.slice(2) + ":" + m.fl] = m.g;
    if (m.tl !== null) procLine[m.to.slice(2) + ":" + m.tl] = m.g;
  }
  for (const n of model.nodes.values()) {
    const g = layout.nodes[n.id];
    if (g.hidden) continue;
    const k = "n:" + n.id, e = ent[k], col = colorOf(e.ty), grp = [gid(k)];
    const b = kit.boxExtent(g, meta.nodes[n.id].tl);
    let card;
    if (SKETCH) {
      card = rect(k, g.x, g.y, g.w, g.h, { sw: 1.5, dashed: e.prop, round: true, groups: grp });
      text(k + ":title", n.title, { x: g.title[0], baseline: g.title[1], fs: 14, groups: grp });
    } else {
      card = rect(k, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, { stroke: col, bg: "#ffffff", sw: 2, dashed: e.prop, groups: grp });
      const head = rect(k + ":head", b.x0, b.y0, b.x1 - b.x0, HEAD, { stroke: col, bg: col, sw: 2, dashed: e.prop, groups: grp });
      text(k + ":title", n.title, { container: head, x: b.x0 + 5, top: b.y0 + (HEAD - 13 * LINE_H[SANS]) / 2, valign: "middle", fs: 13, color: "#ffffff", groups: grp });
    }
    n.body.forEach((s, i) => {
      const pg = procLine[n.id + ":" + i];
      const color = pg === undefined ? INK : pg ? config.groups[pg].color : INK;
      text(`${k}:body:${i}`, s, { x: g.body[i][0], baseline: g.body[i][1], color, groups: grp });
    });
    n.ip.forEach((s, i) => text(`${k}:ip:${i}`, s, { x: g.ip[i][0], baseline: g.ip[i][1], ff: MONO, color: SKETCH ? INK : "#334155", groups: grp }));
    const os = e.os, label = os ? os.v + (os.eol ? " (EOL)" : "") : "OS ?";
    const lastBody = g.body.length ? g.body[g.body.length - 1][1] : g.y;
    const firstIp = g.ip.length ? g.ip[0][1] : b.y1;
    const osBase = SKETCH ? g.y + g.h - 4 : firstIp - 15;
    const fits = osBase - 9 > lastBody + 2;
    text(k + ":os", label, {
      x: fits ? g.x + 10 : b.x1 - 6,
      baseline: fits ? osBase : b.y0 + HEAD + 12,
      align: fits ? "left" : "right",
      fs: 10,
      color: SKETCH ? MUTED : os ? (os.eol ? AMBER : MUTED) : "#9ca3af",
      groups: grp,
    });
    shapeOf[k] = card;
  }

  const labels = [], fwDraw = [];
  const busy = [...model.nodes.values()].filter((n) => !layout.nodes[n.id].hidden).map((n) => kit.boxExtent(layout.nodes[n.id], meta.nodes[n.id].tl));
  for (const c of model.clusters.values()) {
    const [tx, ty] = layout.clusters[c.id].title, hw = c.title.length * 3.9 + 4;
    busy.push({ x0: tx - hw, y0: ty - 13, x1: tx + hw, y1: ty + 4 });
  }
  meta.edges.forEach((m, ei) => {
    const rt = routes[m.k];
    if (!rt || rt.pts.length < 2) return;
    const color = m.g ? config.groups[m.g].color : INK;
    const a = linear("e:" + m.k, "arrow", rt.pts, { stroke: color, sw: m.g ? 2 : 1, dashed: isDashed(model, ei) });
    for (const [side, end] of [["startBinding", m.from], ["endBinding", m.to]]) {
      const target = shapeOf[end];
      if (!target) continue;
      a[side] = { elementId: target.id, focus: 0, gap: 4 };
      bind(target, a);
    }
    if (rt.fw) {
      const [fx, fy] = rt.fw.at, [lx, ly] = rt.fw.label, rot = rt.fw.a === 90 ? ([x, y]) => [-y, x] : (p) => p;
      fwDraw.push(() => linear("e:" + m.k + ":fw", "line", FW_PTS.map((p) => rot(p)).map(([x, y]) => [fx + x, fy + y]), { stroke: FW_RED, sw: 2 }));
      const align = { start: "left", middle: "center", end: "right" }[rt.fw.anchor];
      text("e:" + m.k + ":fwtext", "firewall", { x: lx, baseline: ly, align, fs: 10, color: FW_RED });
      const tx0 = { start: lx, middle: lx - 26, end: lx - 52 }[rt.fw.anchor];
      busy.push(rt.fw.a === 90 ? { x0: fx - 12, y0: fy - 6, x1: fx + 12, y1: fy + 6 } : { x0: fx - 6, y0: fy - 12, x1: fx + 6, y1: fy + 12 });
      busy.push({ x0: tx0, y0: ly - 10, x1: tx0 + 52, y1: ly + 2 });
    }
    const lbl = model.edges[ei].label;
    if (lbl && rt.label) labels.push({ k: m.k, lbl, at: rt.label, color });
  });

  // Labels as free text on a white pill at the view's spot (an arrow-bound label would snap to the arrow's midpoint);
  // one touching a firewall marker, server or another label takes the nearest clear spot, wrapped onto two lines if that helps.
  const hit = (b) => busy.some((o) => Math.min(b.x1, o.x1) > Math.max(b.x0, o.x0) && Math.min(b.y1, o.y1) > Math.max(b.y0, o.y0));
  const DX = [0, -10, 10, -20, 20, -40, 40, -60, 60, -80, 80, -100, 100, -120, 120];
  const DY = [0, -14, 14, -24, 24, -34, 34];
  for (const { k, lbl, at, color } of labels) {
    const cx = at[0] - 7 + (lbl.length * 10 * CHAR_W[SANS] + 14) / 2, parts = lbl.split(" · "), cut = Math.ceil(parts.length / 2);
    const forms = [lbl].concat(parts.length > 1 ? [parts.slice(0, cut).join(" · ") + "\n" + parts.slice(cut).join(" · ")] : []);
    const box = (s, dx, dy) => {
      const ls = s.split("\n"), w = Math.max(...ls.map((l) => l.length)) * 10 * CHAR_W[SANS] + 14;
      return { s, dx, dy, cost: Math.abs(dx) + 2 * Math.abs(dy) + (ls.length - 1) * 30, x0: cx + dx - w / 2, y0: at[1] + dy - 12, x1: cx + dx + w / 2, y1: at[1] + dy + 5 + (ls.length - 1) * 12.5 };
    };
    const tries = forms.flatMap((s) => DY.flatMap((dy) => DX.map((dx) => box(s, dx, dy)))).sort((p, q) => p.cost - q.cost);
    const b = tries.find((t) => !hit(t)) || tries[0];
    busy.push(b);
    rect("e:" + k + ":pill", b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, { stroke: "transparent", bg: "#ffffff", round: true });
    text("e:" + k + ":label", b.s, { x: cx + b.dx, baseline: at[1] + b.dy, align: "center", fs: 10, color, original: lbl });
  }
  fwDraw.forEach((f) => f());

  const [vx, vy, vw] = viewBox.split(" ").map(Number);

  const LW = 200, P = 10, lg = [gid("legend")];
  const legend = rect("legend", vx - 20 - LW, vy, LW, 10, SKETCH ? { round: true, groups: lg } : { stroke: "#cbd5e1", bg: "#ffffff", round: true, groups: lg });
  let y = vy + P;
  const head = (key, s) => {
    text("legend:" + key, s, { x: vx - 20 - LW + P, top: y, fs: 11, color: MUTED, groups: lg });
    y += 18;
  };
  if (!SKETCH) head("types", "SERVER TYPES");
  let infra = false;
  for (const t of SKETCH ? [] : typeList) {
    if (t.infra && !infra) {
      infra = true;
      y += 6;
      head("infra", "OTHER INFRASTRUCTURE");
    }
    const col = colorOf(t.ty), lx = vx - 20 - LW + P;
    rect("legend:sw:" + t.k, lx, y + 1, 12, 12, t.dash ? { stroke: col, dashed: true, groups: lg } : { stroke: col, bg: col, groups: lg });
    text("legend:t:" + t.k, t.label, { x: lx + 20, top: y, fs: 12, groups: lg });
    y += 20;
  }
  if (!SKETCH) y += 6;
  head("conn", "CONNECTIONS");
  const rows = [["request", INK, false, edgeLabels.request]];
  if (model.edges.some((e, ei) => isDashed(model, ei))) rows.push(["dashed", INK, true, edgeLabels.dashed]);
  for (const [g, d] of Object.entries(config.groups)) rows.push(["g:" + g, d.color, false, d.label]);
  for (const [k, col, dashed, label] of rows) {
    const lx = vx - 20 - LW + P;
    linear("legend:a:" + k, "arrow", [[lx, y + 7], [lx + 34, y + 7]], { stroke: col, dashed, sw: k.startsWith("g:") ? 2 : 1, groups: lg });
    text("legend:l:" + k, label, { x: lx + 44, top: y, fs: 11, groups: lg });
    y += 20;
  }
  if (model.edges.some((e) => e.fw)) {
    const lx = vx - 20 - LW + P;
    linear("legend:fwline", "line", [[lx, y + 7], [lx + 34, y + 7]], { groups: lg });
    linear("legend:fw", "line", FW_PTS.map(([px, py]) => [lx + 17 + px * 0.6, y + 7 + py * 0.6]), { stroke: FW_RED, sw: 2, groups: lg });
    text("legend:l:fw", edgeLabels.firewall, { x: lx + 44, top: y, fs: 11, groups: lg });
    y += 20;
  }
  legend.height = r1(y - vy + 4);

  const NW = 260, nx = vx + vw + 20, fs = 12, max = Math.floor((NW - 10) / (fs * CHAR_W[SANS]));
  let ny = vy;
  notes.forEach((n, i) => {
    const lines = [...wrap(n.title, max), "", ...n.paras.flatMap((p, j) => [...(j ? [""] : []), ...wrap(p, max)]), "", n.date];
    const h = lines.length * fs * LINE_H[SANS] + 10;
    const sticky = rect("note:" + i, nx, ny, NW, h, SKETCH ? { stroke: "transparent", bg: "#fff3bf" } : { stroke: "#e0b400", bg: "#fff3a6", round: true });
    const original = [n.title, "", n.paras.join("\n\n"), "", n.date].join("\n");
    text("note:" + i + ":text", lines.join("\n"), { container: sticky, x: nx + 5, top: ny + 5, fs, original });
    ny += h + 14;
  });

  drawings.forEach((s) => {
    const [x0, y0] = s.points[0], rel = s.points.map(([x, y]) => [r1(x - x0), r1(y - y0)]);
    const xs = rel.map((p) => p[0]), ys = rel.map((p) => p[1]);
    const el = base("draw:" + s.id, "freedraw", x0, y0, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), { stroke: s.color, sw: s.width });
    Object.assign(el, { points: rel, pressures: [], simulatePressure: true, lastCommittedPoint: null });
  });

  return JSON.stringify({ type: "excalidraw", version: 2, source: "diagram-editor", elements: els, appState: { viewBackgroundColor: "#ffffff", gridSize: null }, files: {} }, null, 2) + "\n";
}
