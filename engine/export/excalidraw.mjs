import { createHash } from "node:crypto";
import { isDashed } from "../model/edges.mjs";
import { geometryKit } from "../render/geometry.mjs";
import { isKind, nodeKey, parseKey } from "../lib/keys.mjs";
import { METRICS } from "../render/metrics.mjs";

// Monochrome whiteboard look like the Sketch skin: red only for connection groups and firewalls, yellow notes.

// Fonts: 5 = Excalifont (hand-drawn, default), 1 = Virgil, 2 = Helvetica, 3 = Cascadia (monospace).
const SANS = 5;
const MONO = 5;
const CHAR_W = { 1: 0.6, 2: 0.56, 3: 0.6, 5: 0.6 };
const LINE_H = { 1: 1.25, 2: 1.15, 3: 1.2, 5: 1.25 };
const ASCENT = { 1: 0.9, 2: 0.85, 3: 0.9, 5: 0.9 };
const HEAD = METRICS.head;
const INK = "#1e1e1e";
const MUTED = "#6b7280";
const FW_RED = "#d62728";
const FW_PTS = [[-3.5, -11], [3.5, -6.6], [-3.5, -2.2], [3.5, 2.2], [-3.5, 6.6], [3.5, 11]];
const LABEL_DX = [0, -10, 10, -20, 20, -40, 40, -60, 60, -80, 80, -100, 100, -120, 120];
const LABEL_DY = [0, -14, 14, -24, 24, -34, 34];
const LEGEND_W = 200;
const LEGEND_PAD = 10;

const r1 = (v) => Math.round(v * 10) / 10;
const digest = (s) => createHash("sha1").update(s).digest(); // NOSONAR: not security relevant, only derives stable element ids and seeds
const wrap = (s, max) => {
  const out = [];
  let cur = "";
  for (const w of s.split(/\s+/)) {
    if (cur && (cur + " " + w).length > max) {
      out.push(cur);
      cur = w;
    } else cur = cur ? cur + " " + w : w;
  }
  if (cur) out.push(cur);
  return out;
};

const relativePoints = (pts) => {
  const [x0, y0] = pts[0];
  const rel = pts.map(([x, y]) => [r1(x - x0), r1(y - y0)]);
  const xs = rel.map((p) => p[0]), ys = rel.map((p) => p[1]);
  return { x0, y0, rel, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

// Element factories sharing one list and one duplicate-key guard.
function createBuilder() {
  const els = [];
  const used = new Set();
  const idOf = (key) => {
    const id = digest(key).toString("base64url").slice(0, 20);
    if (used.has(id)) throw new Error(`excalidraw: duplicate element key ${key}`);
    used.add(id);
    return id;
  };

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
    return el;
  };
  const bind = (container, child) => {
    container.boundElements ||= [];
    container.boundElements.push({ id: child.id, type: child.type });
  };

  const rect = (key, x, y, w, h, o) => base(key, "rectangle", x, y, w, h, o);
  // top: y of the text box; baseline: SVG-style baseline (converted with the font's ascent).
  const text = (key, s, o) => {
    const fs = o.fs || 12, ff = o.ff || SANS, lines = s.split("\n");
    const w = Math.max(...lines.map((l) => l.length)) * fs * CHAR_W[ff], h = lines.length * fs * LINE_H[ff];
    const top = o.top ?? o.baseline - fs * ASCENT[ff];
    let x = o.x;
    if (o.align === "center") x = o.x - w / 2;
    else if (o.align === "right") x = o.x - w;
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
    const p = relativePoints(pts);
    const el = base(key, type, p.x0, p.y0, p.w, p.h, o);
    Object.assign(el, {
      points: p.rel,
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: type === "arrow" ? "arrow" : null,
      elbowed: false,
    });
    return el;
  };
  return { els, base, bind, rect, text, linear };
}

function addClusters(cx) {
  const { b, model, layout, shapeOf } = cx;
  for (const c of model.clusters.values()) {
    const g = layout.clusters[c.id];
    const r = b.rect(nodeKey("region", c.id), g.x, g.y, g.w, g.h, { dashed: true, round: true });
    b.text(nodeKey("region", c.id) + ":title", c.title, { container: r, x: g.x + g.w / 2, top: g.y + 5, align: "center", fs: 14 });
    shapeOf[nodeKey("region", c.id)] = r;
  }
}

function addServerCard(cx, n, k) {
  const { b, layout, ent } = cx;
  const g = layout.nodes[n.id], e = ent[k], grp = [gid(k)];
  const card = b.rect(k, g.x, g.y, g.w, g.h, { sw: 1.5, dashed: e.prop, round: true, groups: grp });
  b.text(k + ":title", n.title, { x: g.title[0], baseline: g.title[1], fs: 14, groups: grp });
  return { card, grp };
}

function addServerOs(cx, k, g, b0, grp) {
  const os = cx.ent[k].os, eol = os?.eol ? " (EOL)" : "";
  const label = os ? (os.d || os.v) + eol : "OS ?";
  const lastBody = g.body.length ? g.body[g.body.length - 1][1] : g.y;
  const osBase = g.y + g.h - 4;
  const fits = osBase - 9 > lastBody + 2;
  cx.b.text(k + ":os", label, {
    x: fits ? g.x + 10 : b0.x1 - 6,
    baseline: fits ? osBase : b0.y0 + HEAD + 12,
    align: fits ? "left" : "right",
    fs: 10,
    color: MUTED,
    groups: grp,
  });
}

function addServers(cx) {
  const { b, config, model, layout, meta, kit, shapeOf } = cx;
  const procLine = {};
  for (const m of meta.edges) {
    if (m.fl !== null) procLine[parseKey(m.from).id + ":" + m.fl] = m.g;
    if (m.tl !== null) procLine[parseKey(m.to).id + ":" + m.tl] = m.g;
  }
  for (const n of model.nodes.values()) {
    const g = layout.nodes[n.id];
    if (g.hidden) continue;
    const k = nodeKey("server", n.id);
    const b0 = kit.boxExtent(g, meta.nodes[n.id].tl);
    const { card, grp } = addServerCard(cx, n, k);
    n.body.forEach((s, i) => {
      const pg = procLine[n.id + ":" + i];
      const color = pg ? config.groups[pg].color : INK;
      b.text(`${k}:body:${i}`, s, { x: g.body[i][0], baseline: g.body[i][1], color, groups: grp });
    });
    n.ip.forEach((s, i) => b.text(`${k}:ip:${i}`, s, { x: g.ip[i][0], baseline: g.ip[i][1], ff: MONO, color: INK, groups: grp }));
    addServerOs(cx, k, g, b0, grp);
    shapeOf[k] = card;
  }
}

const gid = (key) => digest("group:" + key).toString("base64url").slice(0, 20);

// Spots already taken (servers, region titles, firewall markers, placed labels) that a connection label must avoid.
function initialBusy(cx) {
  const { model, layout, meta, kit } = cx;
  const busy = [...model.nodes.values()].filter((n) => !layout.nodes[n.id].hidden).map((n) => kit.boxExtent(layout.nodes[n.id], meta.nodes[n.id].tl));
  for (const c of model.clusters.values()) {
    const [tx, ty] = layout.clusters[c.id].title, hw = c.title.length * METRICS.regionTitleHalfCw + METRICS.regionTitleHalfPad;
    busy.push({ x0: tx - hw, y0: ty - 13, x1: tx + hw, y1: ty + 4 });
  }
  return busy;
}

function bindArrow(cx, a, m) {
  for (const [side, end] of [["startBinding", m.from], ["endBinding", m.to]]) {
    const target = cx.shapeOf[end];
    if (!target) continue;
    a[side] = { elementId: target.id, focus: 0, gap: 4 };
    cx.b.bind(target, a);
  }
}

function addFirewall(cx, m, fw, busy, fwDraw) {
  const { b } = cx;
  const [fx, fy] = fw.at, [lx, ly] = fw.label, rot = fw.a === 90 ? ([x, y]) => [-y, x] : (p) => p;
  fwDraw.push(() => b.linear(nodeKey("edge", m.k) + ":fw", "line", FW_PTS.map((p) => rot(p)).map(([x, y]) => [fx + x, fy + y]), { stroke: FW_RED, sw: 2 }));
  const align = { start: "left", middle: "center", end: "right" }[fw.anchor];
  b.text(nodeKey("edge", m.k) + ":fwtext", "firewall", { x: lx, baseline: ly, align, fs: 10, color: FW_RED });
  const tx0 = { start: lx, middle: lx - 26, end: lx - 52 }[fw.anchor];
  busy.push(
    fw.a === 90 ? { x0: fx - 12, y0: fy - 6, x1: fx + 12, y1: fy + 6 } : { x0: fx - 6, y0: fy - 12, x1: fx + 6, y1: fy + 12 },
    { x0: tx0, y0: ly - 10, x1: tx0 + 52, y1: ly + 2 }
  );
}

function addConnections(cx, routes) {
  const { b, config, model, meta } = cx;
  const labels = [], fwDraw = [], busy = initialBusy(cx);
  meta.edges.forEach((m, ei) => {
    const rt = routes[m.k];
    if (!rt || rt.pts.length < 2) return;
    const color = m.g ? config.groups[m.g].color : INK;
    const a = b.linear(nodeKey("edge", m.k), "arrow", rt.pts, { stroke: color, sw: m.g ? 2 : 1, dashed: isDashed(model, ei) });
    bindArrow(cx, a, m);
    if (rt.fw) addFirewall(cx, m, rt.fw, busy, fwDraw);
    const lbl = model.edges[ei].label;
    if (lbl && rt.label) labels.push({ k: m.k, lbl, at: rt.label, color });
  });
  return { labels, fwDraw, busy };
}

const labelBox = (s, dx, dy, cxm, y) => {
  const ls = s.split("\n"), w = Math.max(...ls.map((l) => l.length)) * 10 * CHAR_W[SANS] + 14;
  return { s, dx, dy, cost: Math.abs(dx) + 2 * Math.abs(dy) + (ls.length - 1) * 30, x0: cxm + dx - w / 2, y0: y + dy - 12, x1: cxm + dx + w / 2, y1: y + dy + 5 + (ls.length - 1) * 12.5 };
};

// Labels as free text on a white pill at the view's spot (an arrow-bound label would snap to the arrow's midpoint);
// one touching a firewall marker, server or another label takes the nearest clear spot, wrapped onto two lines if that helps.
function placeLabels(cx, labels, busy) {
  const { b } = cx;
  const hit = (r) => busy.some((o) => Math.min(r.x1, o.x1) > Math.max(r.x0, o.x0) && Math.min(r.y1, o.y1) > Math.max(r.y0, o.y0));
  for (const { k, lbl, at, color } of labels) {
    const cxm = at[0] - 7 + (lbl.length * 10 * CHAR_W[SANS] + 14) / 2, parts = lbl.split(" · "), cut = Math.ceil(parts.length / 2);
    const forms = [lbl].concat(parts.length > 1 ? [parts.slice(0, cut).join(" · ") + "\n" + parts.slice(cut).join(" · ")] : []);
    const tries = forms.flatMap((s) => LABEL_DY.flatMap((dy) => LABEL_DX.map((dx) => labelBox(s, dx, dy, cxm, at[1])))).sort((p, q) => p.cost - q.cost);
    const pick = tries.find((t) => !hit(t)) || tries[0];
    busy.push(pick);
    b.rect(nodeKey("edge", k) + ":pill", pick.x0, pick.y0, pick.x1 - pick.x0, pick.y1 - pick.y0, { stroke: "transparent", bg: "#ffffff", round: true });
    b.text(nodeKey("edge", k) + ":label", pick.s, { x: cxm + pick.dx, baseline: at[1] + pick.dy, align: "center", fs: 10, color, original: lbl });
  }
}

function legendHead(cx, L, key, s) {
  cx.b.text("legend:" + key, s, { x: L.x, top: L.y, fs: 11, color: MUTED, groups: L.groups });
  L.y += 18;
}

function legendConnections(cx, L) {
  const { b, config, model } = cx;
  const rows = [["request", INK, false, cx.edgeLabels.request]];
  if (model.edges.some((e, ei) => isDashed(model, ei))) rows.push(["dashed", INK, true, cx.edgeLabels.dashed]);
  for (const [g, d] of Object.entries(config.groups)) rows.push([nodeKey("group", g), d.color, false, d.label]);
  for (const [k, col, dashed, label] of rows) {
    b.linear("legend:a:" + k, "arrow", [[L.x, L.y + 7], [L.x + 34, L.y + 7]], { stroke: col, dashed, sw: isKind(k, "group") ? 2 : 1, groups: L.groups });
    b.text("legend:l:" + k, label, { x: L.x + 44, top: L.y, fs: 11, groups: L.groups });
    L.y += 20;
  }
  if (model.edges.some((e) => e.fw)) {
    b.linear("legend:fwline", "line", [[L.x, L.y + 7], [L.x + 34, L.y + 7]], { groups: L.groups });
    b.linear("legend:fw", "line", FW_PTS.map(([px, py]) => [L.x + 17 + px * 0.6, L.y + 7 + py * 0.6]), { stroke: FW_RED, sw: 2, groups: L.groups });
    b.text("legend:l:fw", cx.edgeLabels.firewall, { x: L.x + 44, top: L.y, fs: 11, groups: L.groups });
    L.y += 20;
  }
}

function addLegend(cx, vx, vy) {
  const { b } = cx;
  const groups = [gid("legend")];
  const legend = b.rect("legend", vx - 20 - LEGEND_W, vy, LEGEND_W, 10, { round: true, groups });
  const L = { x: vx - 20 - LEGEND_W + LEGEND_PAD, y: vy + LEGEND_PAD, groups };
  legendHead(cx, L, "conn", "CONNECTIONS");
  legendConnections(cx, L);
  legend.height = r1(L.y - vy + 4);
}

function addNotes(cx, notes, nx, vy) {
  const { b } = cx;
  const NW = 260, fs = 12, max = Math.floor((NW - 10) / (fs * CHAR_W[SANS]));
  let ny = vy;
  notes.forEach((n, i) => {
    const lines = [...wrap(n.title, max), "", ...n.paras.flatMap((p, j) => [...(j ? [""] : []), ...wrap(p, max)]), "", n.date];
    const h = lines.length * fs * LINE_H[SANS] + 10;
    const sticky = b.rect("note:" + i, nx, ny, NW, h, { stroke: "transparent", bg: "#fff3bf" });
    const original = [n.title, "", n.paras.join("\n\n"), "", n.date].join("\n");
    b.text("note:" + i + ":text", lines.join("\n"), { container: sticky, x: nx + 5, top: ny + 5, fs, original });
    ny += h + 14;
  });
}

function addDrawings(cx, drawings) {
  for (const s of drawings) {
    const p = relativePoints(s.points);
    const el = cx.b.base("draw:" + s.id, "freedraw", p.x0, p.y0, p.w, p.h, { stroke: s.color, sw: s.width });
    Object.assign(el, { points: p.rel, pressures: [], simulatePressure: true, lastCommittedPoint: null });
  }
}

// Excalidraw scene for a diagram: same geometry as the view (fitted boxes, routed connections, label and firewall spots).
export function renderExcalidraw({ config, model, layout, meta, routes, ent, notes, edgeLabels, viewBox, drawings = [] }) {
  const b = createBuilder();
  const cx = { b, kit: geometryKit(), config, model, layout, meta, ent, edgeLabels, shapeOf: {} };

  addClusters(cx);
  addServers(cx);
  const { labels, fwDraw, busy } = addConnections(cx, routes);
  placeLabels(cx, labels, busy);
  fwDraw.forEach((f) => f());

  const [vx, vy, vw] = viewBox.split(" ").map(Number);
  addLegend(cx, vx, vy);
  addNotes(cx, notes, vx + vw + 20, vy);
  addDrawings(cx, drawings);

  return JSON.stringify({ type: "excalidraw", version: 2, source: "diagram-editor", elements: b.els, appState: { viewBackgroundColor: "#ffffff", gridSize: null }, files: {} }, null, 2) + "\n";
}
