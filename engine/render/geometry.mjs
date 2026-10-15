import { edgeKey, endKey } from "../model/edges.mjs";
import { processAnchors } from "../model/config.mjs";
import { displayOs, osInfo } from "../model/os.mjs";
import { keysKit } from "../lib/keys.mjs";
import { METRICS } from "./metrics.mjs";

// Longest server name drawn in a header; longer names are cut with an ellipsis (the full name stays in a tooltip).
export const TITLE_MAX = 34;
// Longest OS text drawn in the pill; the full text stays in the tooltip.
export const OS_MAX = 40;
export function shortOs(s) { s = displayOs(s); return s.length > OS_MAX ? s.slice(0, OS_MAX - 1) + "…" : s; }
export function shortTitle(t) { return t.length > TITLE_MAX ? t.slice(0, TITLE_MAX - 1) + "…" : t; }

// Header label of a server: the first DNS label when the name is a DNS name (has a dot, not an IPv4 / IPv6 literal), else the name as is.
export function hostLabel(name) {
  const n = String(name).trim();
  if (!n.includes(".") || n.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(n) || /^\[.*\]$/.test(n)) return name;
  return n.split(".")[0] || name;
}
// Labels for { id: name }: short host names, but the full name wherever two servers would share a label.
export function displayLabels(names) {
  const short = {}, count = {};
  for (const [id, n] of Object.entries(names)) { short[id] = hostLabel(n); count[short[id]] = (count[short[id]] || 0) + 1; }
  return Object.fromEntries(Object.keys(names).map((id) => [id, count[short[id]] > 1 ? names[id] : short[id]]));
}

// Static facts the kit needs besides the saved layout geometry; built once, shipped to the runtime as D.meta.
// Node nb / ni: body and IP line counts, os / ol / oe: 1, the text length and 1 when the OS is end-of-life, for a server with an OS pill row, hw: hardware strip text (own row when not empty) (auto-layout). Edge lv: "process" when an endpoint is a body line (topology processes), else "server".
export function geometryMeta(model, groups, processes) {
  const len = (a) => a.reduce((m, s) => Math.max(m, s.length), 0);
  const labels = displayLabels(Object.fromEntries([...model.nodes.values()].map((n) => [n.id, n.title])));
  const gOf = {}, pa = processAnchors(processes, model.nodes);
  for (const [g, d] of Object.entries(groups || {})) for (const k of d.edges) gOf[k] = g;
  return {
    clusters: Object.fromEntries([...model.clusters.values()].map((c) => [c.id, { tl: c.title.length }])),
    nodes: Object.fromEntries([...model.nodes.values()].map((n) => [n.id, { tl: shortTitle(labels[n.id]).length, os: n.os ? 1 : 0, ol: n.os ? shortOs(n.os).length : 0, oe: n.os && osInfo(n.os).eol ? 1 : 0, hw: n.hw || "", bl: len(n.body), il: len(n.ip), nb: n.body.length, nj: n.jn || 0, ni: n.ip.length, cl: n.cluster }])),
    edges: model.edges.map((e) => ({ k: edgeKey(e), from: endKey(model, e.from), to: endKey(model, e.to), ll: e.label.length, fw: e.fw, g: gOf[edgeKey(e)] || null, fl: pa[edgeKey(e)]?.fl ?? null, tl: pa[edgeKey(e)]?.tl ?? null, lv: pa[edgeKey(e)] ? "process" : "server" })),
  };
}

// Box extents, box / region auto-sizing, connection routing, label and firewall placement, spacing checks.
// Self-contained on purpose: assets.mjs inlines this function's source as the "canvas/geometry" runtime module,
// so the build and edit mode compute identical geometry. sizes: the METRICS table, keyset: the keysKit() object (both passed in, see page/kits.mjs).
export function geometryKitOf(sizes, keyset) {
  var HEAD = sizes.head, TITLE_CW = sizes.titleCw, BODY_CW = sizes.bodyCw, IP_CW = sizes.ipCw, OS_CW = sizes.osCw, HW_CW = sizes.hwCw, TEXT_X = sizes.textX;
  var BAND = sizes.band, BAND_GAP = sizes.bandGap, MIN_GAP = sizes.minGap, PAD = sizes.pad, MIN_W = sizes.minW, MIN_H = sizes.minH;
  var M = 10, BEND = 50, REGION = 1.5, HUG = 2, TIGHT = 0.3, RAD = 22;
  var DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
  var cache = { n: 0 };

  function r1(v) { return Math.round(v * 10) / 10; } // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
  function num(a, b) { return a - b; } // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it

  // Start of a server header text: TEXT_X from the left, vertically centred in the header bar (CSS dominant-baseline: central); Sketch keeps the saved spot above the box.
  function headerTitle(g, style) {
    return style === "sketch" ? [g.title[0], g.title[1]] : [r1(g.x + TEXT_X), r1(g.y - HEAD / 2)];
  }

  function boxExtent(g, tl, w) {
    var bottom = g.y + g.h;
    for (const p of g.ip) bottom = Math.max(bottom, p[1] + 7);
    return { x0: g.x, y0: g.y - HEAD, x1: g.x + (w || Math.max(g.w, TEXT_X + tl * TITLE_CW + sizes.titleExtra)), y1: bottom };
  }

  // Text rows above the IP pills: body lines, hardware strip, OS pill.
  function rows(t) { return t.nb + (t.hw ? 1 : 0) + (t.os ? 1 : 0); } // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
  function needW(t) {
    var osExtra = t.oe ? sizes.eolExtra : sizes.noEolExtra;
    var os = t.os ? TEXT_X + (t.ol + osExtra) * OS_CW + sizes.osExtra : 0;
    return Math.ceil(Math.max(TEXT_X + t.tl * TITLE_CW + sizes.titleExtra, TEXT_X * 2 + t.bl * BODY_CW, t.il ? TEXT_X + t.il * IP_CW + sizes.ipExtra : 0, os, t.hw ? TEXT_X * 2 + t.hw.length * HW_CW : 0));
  }
  function needH(t) { return sizes.boxPad + sizes.line * rows(t) + sizes.ipLine * t.ni; }

  // The box of a server from its meta (text lengths and line counts): size and the text positions, for a box whose top-left corner (below the header) is x, y.
  // The one definition shared by auto layout, saved-layout reconcile, fitBox and the card renderer.
  function boxFor(t, x, y) {
    var r = rows(t), body = [], ip = [], i;
    for (i = 0; i < t.nb; i++) body.push([x + TEXT_X, y + sizes.bodyTop + sizes.line * i]);
    for (i = 0; i < t.ni; i++) ip.push([x + TEXT_X, y + sizes.ipTop + sizes.line * r + sizes.ipLine * i]);
    return { x: x, y: y, w: needW(t), h: needH(t), title: [x + TEXT_X, y - sizes.sketchTitleDy], body: body, ip: ip };
  }

  // Body and IP lines sit at the box's text padding; the box is wide enough for its title, body lines and IP pills plus network buttons.
  function fitBox(g, t) {
    g.body.forEach(function (p) { p[0] = g.x + TEXT_X; });
    g.ip.forEach(function (p) { p[0] = g.x + TEXT_X; });
    g.w = Math.max(g.w, needW(t));
  }

  // Smallest rectangle that holds a region's visible servers with padding and the header band, or null when it has none.
  function regionBounds(s, meta, cid, w) {
    var r = null;
    Object.keys(meta.nodes).forEach(function (id) {
      var g = s.nodes[id];
      if (meta.nodes[id].cl !== cid || !g || g.hidden) return;
      var e = boxExtent(g, meta.nodes[id].tl, w?.[id]);
      r = r || { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      r.x0 = Math.min(r.x0, e.x0 - PAD); r.x1 = Math.max(r.x1, e.x1 + PAD); r.y1 = Math.max(r.y1, e.y1 + PAD);
      r.y0 = Math.min(r.y0, e.y0 - BAND - BAND_GAP);
    });
    return r;
  }

  // Region grown (never shrunk below base) to hold its servers with padding and the header band.
  function fitRegion(s, meta, cid, baseRect, w) {
    var c = s.clusters[cid], b = baseRect || c, x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
    var r = regionBounds(s, meta, cid, w);
    if (r) { x0 = Math.min(x0, r.x0); x1 = Math.max(x1, r.x1); y1 = Math.max(y1, r.y1); y0 = Math.min(y0, r.y0); }
    var t = baseRect ? baseRect.title : c.title, centred = Math.abs(t[0] - (b.x + b.w / 2)) <= 2;
    c.title = [centred ? r1((x0 + x1) / 2) : t[0] + (x0 - b.x), t[1] + (y0 - b.y)];
    c.x = x0; c.y = y0; c.w = x1 - x0; c.h = y1 - y0;
  }

  // Moves the sides named in side ("n", "se", ...) of a region by dx / dy, never past its servers or the absolute minimum; the title follows the left / top side or stays centred.
  function resizeRegion(s, meta, cid, side, dx, dy, w) {
    var c = s.clusters[cid], b = regionBounds(s, meta, cid, w), t = c.title, centred = Math.abs(t[0] - (c.x + c.w / 2)) <= 2;
    var x0 = c.x, y0 = c.y, x1 = c.x + c.w, y1 = c.y + c.h;
    if (side.includes("w")) x0 = Math.min(x0 + dx, b ? b.x0 : Infinity, x1 - MIN_W);
    if (side.includes("e")) x1 = Math.max(x1 + dx, b ? b.x1 : -Infinity, x0 + MIN_W);
    if (side.includes("n")) y0 = Math.min(y0 + dy, b ? b.y0 : Infinity, y1 - MIN_H);
    if (side.includes("s")) y1 = Math.max(y1 + dy, b ? b.y1 : -Infinity, y0 + MIN_H);
    c.title = [centred ? r1((x0 + x1) / 2) : t[0] + (x0 - c.x), t[1] + (y0 - c.y)];
    c.x = x0; c.y = y0; c.w = x1 - x0; c.h = y1 - y0;
  }

  function shapes(s, meta, w) {
    var ent = {}, nodes = [], titles = [], clusters = [];
    Object.keys(meta.clusters).forEach(function (id, i) {
      var c = s.clusters[id], hw = meta.clusters[id].tl * sizes.regionTitleHalfCw + sizes.regionTitleHalfPad;
      var r = { k: keyset.nodeKey("region", id), i: i, x0: c.x, y0: c.y, x1: c.x + c.w, y1: c.y + c.h };
      ent[r.k] = r; clusters.push(r);
      titles.push({ x0: c.title[0] - hw, y0: c.title[1] - 13, x1: c.title[0] + hw, y1: c.title[1] + 4 });
    });
    Object.keys(meta.nodes).forEach(function (id) {
      var g = s.nodes[id];
      if (!g || g.hidden) return;
      var r = boxExtent(g, meta.nodes[id].tl, w?.[id]);
      r.k = keyset.nodeKey("server", id);
      r.cl = meta.nodes[id].cl ? ent[keyset.nodeKey("region", meta.nodes[id].cl)].i : -1;
      ent[r.k] = r; nodes.push(r);
    });
    var bands = [];
    clusters.forEach(function (c) {
      bands.push(
        { x0: c.x0, y0: c.y0 - 3, x1: c.x1, y1: c.y0 + 3 }, { x0: c.x0, y0: c.y1 - 3, x1: c.x1, y1: c.y1 + 3 },
        { x0: c.x0 - 3, y0: c.y0, x1: c.x0 + 3, y1: c.y1 }, { x0: c.x1 - 3, y0: c.y0, x1: c.x1 + 3, y1: c.y1 }
      );
    });
    return { ent: ent, nodes: nodes, titles: titles, clusters: clusters, bands: bands };
  }

  function uniq(a) {
    a.sort(num);
    var out = [];
    a.forEach(function (v) { if (!out.length || v - out.at(-1) > 0.5) out.push(v); });
    var mid = [];
    out.forEach(function (v, i) {
      mid.push(v);
      if (i + 1 < out.length && out[i + 1] - v > 30) mid.push((v + out[i + 1]) / 2);
    });
    return mid;
  }
  function firstAbove(a, v) { // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
    var lo = 0, hi = a.length;
    while (lo < hi) {
      var m = (lo + hi) >> 1;
      if (a[m] > v) hi = m; else lo = m + 1;
    }
    return lo;
  }
  function firstAtLeast(a, v) { // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
    var lo = 0, hi = a.length;
    while (lo < hi) {
      var m = (lo + hi) >> 1;
      if (a[m] >= v) hi = m; else lo = m + 1;
    }
    return lo;
  }
  function mids(a) { // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
    var out = [];
    for (var k = 0; k + 1 < a.length; k++) out.push((a[k] + a[k + 1]) / 2);
    return out;
  }
  // Writes val (OR-ed in when or is set) into arr, a nx x ny table (row stride ny), at every point (X[i], Y[j]) strictly inside rectangle r grown by m.
  function paint(arr, ax, r, m, val, or) {
    var ny = ax.ny, X = ax.X, Y = ax.Y, i0 = firstAbove(X, r.x0 - m + 0.01), i1 = firstAtLeast(X, r.x1 + m - 0.01), j0 = firstAbove(Y, r.y0 - m + 0.01), j1 = firstAtLeast(Y, r.y1 + m - 0.01);
    for (var i = i0; i < i1; i++) {
      for (var j = j0; j < j1; j++) {
        if (or) arr[i * ny + j] |= val; else arr[i * ny + j] = val;
      }
    }
  }
  // ORs 1 into arr where a segment midpoint lies within 9px of a region's border line (along the border, strictly between its ends).
  function paintHug(arr, ny, A, B, c, horiz) {
    var lo = horiz ? c.x0 : c.y0, hi = horiz ? c.x1 : c.y1, sides = horiz ? [c.y0, c.y1] : [c.x0, c.x1];
    var s0 = firstAbove(A, lo), s1 = firstAtLeast(A, hi);
    sides.forEach(function (a) {
      for (var k = firstAbove(B, a - 10); k < B.length && B[k] < a + 10; k++) {
        if (Math.abs(B[k] - a) >= 9) continue;
        for (var q = s0; q < s1; q++) {
          if (horiz) arr[q * ny + k] |= 1; else arr[k * ny + q] |= 1;
        }
      }
    });
  }

  function segCost(out, flags, len, p) {
    var a = 1, b = 1 + REGION;
    if (flags[p] & 1) { a += HUG; b += HUG; }
    if (flags[p] & 2) { a += TIGHT; b += TIGHT; }
    out[0][p] = len * a; out[1][p] = len * b;
  }
  function fillCosts(hcost, vcost, hh, vh, xs, ys) {
    var nx = xs.length, ny = ys.length;
    for (var i = 0; i < nx; i++) {
      for (var j = 0; j < ny; j++) {
        if (i + 1 < nx) segCost(hcost, hh, Math.abs(xs[i + 1] - xs[i]), i * ny + j);
        if (j + 1 < ny) segCost(vcost, vh, Math.abs(ys[j + 1] - ys[j]), i * ny + j);
      }
    }
  }

  // Sparse orthogonal grid over obstacle borders (servers +M, titles +4, regions +-M), extra points and channel midpoints.
  function grid(S, extra) {
    var xs = [], ys = [], lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    function add(r, m) {
      xs.push(r.x0 - m, r.x1 + m); ys.push(r.y0 - m, r.y1 + m);
      lo = [Math.min(lo[0], r.x0 - m), Math.min(lo[1], r.y0 - m)]; hi = [Math.max(hi[0], r.x1 + m), Math.max(hi[1], r.y1 + m)];
    }
    S.nodes.forEach(function (r) { add(r, M); });
    S.titles.forEach(function (r) { add(r, 4); });
    S.clusters.forEach(function (r) { add(r, M); add(r, -M); });
    extra.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); });
    xs.push(lo[0] - 30, hi[0] + 30); ys.push(lo[1] - 30, hi[1] + 30);
    xs = uniq(xs); ys = uniq(ys);
    var nx = xs.length, ny = ys.length, P = nx * ny;
    var blk = new Uint8Array(P), hb = new Uint8Array(P), vb = new Uint8Array(P), hc = new Int16Array(P), vc = new Int16Array(P), hh = new Uint8Array(P), vh = new Uint8Array(P);
    var mx = mids(xs), my = mids(ys), i, j;
    var axP = { ny: ny, X: xs, Y: ys }, axH = { ny: ny, X: mx, Y: ys }, axV = { ny: ny, X: xs, Y: my };
    for (i = 0; i + 1 < nx; i++) for (j = 0; j < ny; j++) hc[i * ny + j] = -1;
    for (i = 0; i < nx; i++) for (j = 0; j + 1 < ny; j++) vc[i * ny + j] = -1;
    function obstacle(r, m) {
      paint(blk, axP, r, m, 1); paint(hb, axH, r, m, 1); paint(vb, axV, r, m, 1);
    }
    S.nodes.forEach(function (r) { obstacle(r, M); });
    S.titles.forEach(function (r) { obstacle(r, 4); });
    // A point's region is the first (lowest index) one that holds it: paint from the last region to the first.
    for (var k = S.clusters.length - 1; k >= 0; k--) { paint(hc, axH, S.clusters[k], 0, k); paint(vc, axV, S.clusters[k], 0, k); }
    // Bit 1: a segment hugging a region border. Bit 2: a segment within 5px of the narrowest allowed clearance (narrow channel).
    S.clusters.forEach(function (c) { paintHug(hh, ny, mx, ys, c, true); paintHug(vh, ny, my, xs, c, false); });
    S.nodes.forEach(function (r) { paint(hh, axH, r, M + 5, 2, true); paint(vh, axV, r, M + 5, 2, true); });
    // Cost of the segment starting at table point p with every penalty but the region one (cheap), and with it (dear): length x multiplier, summed in the order the search used to.
    var hcost = [new Float64Array(P), new Float64Array(P)], vcost = [new Float64Array(P), new Float64Array(P)];
    fillCosts(hcost, vcost, hh, vh, xs, ys);
    return { xs: xs, ys: ys, nx: nx, ny: ny, blk: blk, hb: hb, vb: vb, hc: hc, vc: vc, hh: hh, vh: vh, hcost: hcost, vcost: vcost };
  }
  function nearIdx(a, v) {
    for (var k = firstAbove(a, v - 0.7); k < a.length && a[k] < v + 0.7; k++) if (Math.abs(a[k] - v) < 0.6) return k;
    return -1;
  }
  function at(G, x, y) {
    var i = nearIdx(G.xs, x), j = nearIdx(G.ys, y);
    return i < 0 || j < 0 ? -1 : i * G.ny + j;
  }

  // Extra cost of reaching a goal with heading gd (-1: any) when arriving with heading d.
  function turnCost(gd, d) {
    if (gd < 0 || gd === d) return 0;
    return gd === (d + 2) % 4 ? Infinity : BEND;
  }
  // The state a state was reached from (-1: a start). Per state the search keeps two numbers side by side: the best cost and
  // a code gen * SCALE + previous state + 1, so the entry belongs to the current search exactly when code >= gen * SCALE.
  function firstState(st) {
    var sd = cache.sd, gmin = cache.gen * cache.scale;
    while (sd[2 * st + 1] > gmin) st = sd[2 * st + 1] - gmin - 1;
    return st;
  }

  // Search tables shared by every search; an entry written by an earlier search reads as unvisited (see firstState), so nothing is cleared between searches.
  function searchBuffers(n) {
    if (cache.n < n) {
      cache.n = n;
      cache.scale = 2 ** Math.ceil(Math.log2(n + 2));
      cache.sd = new Float64Array(2 * n);
      cache.hp = new Float64Array(2 * n);
      cache.gen = 0;
      cache.hf = new Float64Array(1024);
      cache.hs = new Int32Array(1024);
      cache.gm = new Int32Array(n >> 2);
    }
    cache.gen++;
  }
  function traceBack(G, starts, best) {
    var sd = cache.sd, gmin = cache.gen * cache.scale, pts = [];
    for (var s2 = best.st; s2 >= 0; s2 = sd[2 * s2 + 1] - gmin - 1) {
      var pp = Math.floor(s2 / 4);
      pts.push([G.xs[Math.floor(pp / G.ny)], G.ys[pp % G.ny]]);
    }
    pts.reverse();
    var origin = firstState(best.st);
    var first = starts.find(function (s) { return s.p * 4 + s.d === origin; });
    return { pts: pts, start: first, goal: best.goal, cost: best.cost };
  }

  // A* over (grid point, heading); cost = length (x region / hug penalties) + bends. starts / goals: {p, d, c}.
  // Ties pop in the order of a binary min-heap on the estimate alone, so the route chosen is a pure function of the grid and the ends.
  function heur(Q, p) {
    var hp = cache.hp, hx = Q.hx, G = Q.G;
    if (hp[2 * p + 1] === Q.gen) return hp[2 * p];
    var x = G.xs[Math.floor(p / G.ny)], y = G.ys[p % G.ny], m = Infinity;
    for (const g of hx) m = Math.min(m, Math.abs(x - g[0]) + Math.abs(y - g[1]));
    hp[2 * p] = m;
    hp[2 * p + 1] = Q.gen;
    return m;
  }
  function heapPush(f, st) {
    var hf = cache.hf, hs = cache.hs, i = cache.hn++, q, t;
    hf[i] = f; hs[i] = st;
    while (i > 0) {
      q = (i - 1) >> 1;
      if (hf[q] <= hf[i]) break;
      t = hf[q]; hf[q] = hf[i]; hf[i] = t;
      t = hs[q]; hs[q] = hs[i]; hs[i] = t;
      i = q;
    }
  }
  function markGoal(Q, g) { // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
    if (!Q.goalAt.has(g.p)) Q.goalAt.set(g.p, []);
    Q.goalAt.get(g.p).push(g);
    Q.hx.push([Q.G.xs[Math.floor(g.p / Q.G.ny)], Q.G.ys[g.p % Q.G.ny]]);
  }
  function seed(Q, s) {
    var sd = cache.sd, st = s.p * 4 + s.d;
    if (sd[2 * st + 1] < Q.gmin || s.c < sd[2 * st]) {
      sd[2 * st] = s.c;
      sd[2 * st + 1] = Q.gmin;
      heapPush(s.c + heur(Q, s.p), st);
    }
  }
  function search(G, starts, goals, home, acc) {
    var nx = G.nx, ny = G.ny;
    searchBuffers(nx * ny * 4);
    var gen = cache.gen, gmin = gen * cache.scale, sd = cache.sd, hp = cache.hp, gm = cache.gm, xs = G.xs, ys = G.ys;
    var blk = G.blk, hb = G.hb, vb = G.vb, hc = G.hc, vc = G.vc, hc0 = G.hcost[0], hc1 = G.hcost[1], vc0 = G.vcost[0], vc1 = G.vcost[1];
    var Q = {
      G: G, gen: gen, gmin: gmin, goalAt: new Map(), hx: [], best: { cost: Infinity, st: -1, goal: null },
    };
    var h0 = home.length > 0 ? home[0] : -2, h1 = home.length > 1 ? home[1] : -2, best = Q.best, trace = acc[5];
    cache.hn = 0;
    goals.forEach(function (g) { markGoal(Q, g); gm[g.p] = gen; });
    starts.forEach(function (s) { seed(Q, s); });
    var gx = Q.hx.map(function (g) { return g[0]; }), gy = Q.hx.map(function (g) { return g[1]; }), ng = gx.length;
    var hf = cache.hf, hs = cache.hs, hn = cache.hn, a, l, r, c, q, ii, k;
    while (hn > 0) {
      var f = hf[0], st = hs[0], lf, ls;
      hn--;
      if (hn > 0) {
        lf = hf[hn]; ls = hs[hn]; a = 0;
        for (;;) {
          l = 2 * a + 1;
          if (l >= hn) break;
          r = l + 1;
          c = r < hn && hf[r] < hf[l] ? r : l;
          if (!(hf[c] < lf)) break;
          hf[a] = hf[c]; hs[a] = hs[c]; a = c;
        }
        hf[a] = lf; hs[a] = ls;
      }
      var d0 = sd[2 * st];
      if (f >= best.cost) break;
      var p = st >> 2, i = Math.trunc(p / ny), j = p - i * ny;
      if (f > d0 + hp[2 * p] + 1e-6) continue;
      if (i < acc[0]) acc[0] = i;
      if (i > acc[1]) acc[1] = i;
      if (j < acc[2]) acc[2] = j;
      if (j > acc[3]) acc[3] = j;
      var d = st & 3;
      if (trace) acc[4] = (Math.imul(acc[4], 1000003) + (Math.round(xs[i] * 8) * 31 + Math.round(ys[j] * 8)) * 4 + d) | 0;
      if (gm[p] === gen) {
        for (const g of Q.goalAt.get(p)) {
          const total = d0 + turnCost(g.d, d) + g.c;
          if (total < best.cost) best = { cost: total, st: st, goal: g };
        }
      }
      var back = (d + 2) & 3;
      for (var d2 = 0; d2 < 4; d2++) {
        if (d2 === back) continue;
        var i2 = i + DX[d2], j2 = j + DY[d2];
        if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= ny) continue;
        var p2 = i2 * ny + j2;
        if (blk[p2]) continue;
        var horiz = (d2 & 1) === 0, si = (horiz ? d2 === 0 : d2 === 1) ? p : p2, cl, step;
        if (horiz) {
          if (hb[si]) continue;
          cl = hc[si];
          step = cl >= 0 && cl !== h0 && cl !== h1 ? hc1[si] : hc0[si];
        } else {
          if (vb[si]) continue;
          cl = vc[si];
          step = cl >= 0 && cl !== h0 && cl !== h1 ? vc1[si] : vc0[si];
        }
        var nd = d0 + (step + (d2 === d ? 0 : BEND)), st2 = (p2 << 2) + d2, k2 = 2 * st2;
        if (sd[k2 + 1] < gmin || nd < sd[k2]) {
          sd[k2] = nd;
          sd[k2 + 1] = gmin + st + 1;
          var hv2;
          if (hp[2 * p2 + 1] === gen) hv2 = hp[2 * p2];
          else {
            hv2 = Infinity;
            for (k = 0; k < ng; k++) hv2 = Math.min(hv2, Math.abs(xs[i2] - gx[k]) + Math.abs(ys[j2] - gy[k]));
            hp[2 * p2] = hv2; hp[2 * p2 + 1] = gen;
          }
          if (hn === hf.length) {
            var nf = new Float64Array(hn * 2), ns = new Int32Array(hn * 2);
            nf.set(hf); ns.set(hs);
            hf = cache.hf = nf; hs = cache.hs = ns;
          }
          var fv = nd + hv2;
          ii = hn++;
          while (ii > 0) {
            q = (ii - 1) >> 1;
            if (hf[q] <= fv) break;
            hf[ii] = hf[q]; hs[ii] = hs[q]; ii = q;
          }
          hf[ii] = fv; hs[ii] = st2;
        }
      }
    }
    return best.st < 0 ? null : traceBack(G, starts, best);
  }

  // Port on side sd (0 right, 1 bottom, 2 left, 3 top; = outward heading) at position v along the side.
  function port(r, sd, v) {
    if (sd === 0) return { pt: [r.x1, v], stub: [r.x1 + M, v] };
    if (sd === 2) return { pt: [r.x0, v], stub: [r.x0 - M, v] };
    if (sd === 1) return { pt: [v, r.y1], stub: [v, r.y1 + M] };
    return { pt: [v, r.y0], stub: [v, r.y0 - M] };
  }
  function centre(r, sd) { return Math.round(sd % 2 === 0 ? (r.y0 + r.y1) / 2 : (r.x0 + r.x1) / 2); } // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
  function span(r, sd) { return sd % 2 === 0 ? [r.y0, r.y1] : [r.x0, r.x1]; } // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
  function facing(r, sd, o) {
    var cx = (o.x0 + o.x1) / 2 - (r.x0 + r.x1) / 2, cy = (o.y0 + o.y1) / 2 - (r.y0 + r.y1) / 2;
    return DX[sd] * cx + DY[sd] * cy > 0;
  }

  function simplify(pts) { // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
    var out = [];
    pts.forEach(function (p) {
      var n = out.length;
      if (n && Math.abs(out[n - 1][0] - p[0]) < 0.01 && Math.abs(out[n - 1][1] - p[1]) < 0.01) return;
      if (n >= 2) {
        var a = out[n - 2], b = out[n - 1];
        if ((Math.abs(a[0] - b[0]) < 0.01 && Math.abs(b[0] - p[0]) < 0.01) || (Math.abs(a[1] - b[1]) < 0.01 && Math.abs(b[1] - p[1]) < 0.01)) { out[n - 1] = p; return; }
      }
      out.push(p);
    });
    return out;
  }

  // Rounded orthogonal path: corner radius up to RAD, keeping 6px straight at the start and 12px before the arrowhead.
  function shape(pts) {
    var n = pts.length, seg = [], rad = [0];
    var k;
    for (k = 0; k + 1 < n; k++) seg.push(Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]));
    for (k = 1; k + 1 < n; k++) {
      var a = k - 1 === 0 ? seg[k - 1] - 6 : seg[k - 1] / 2, b = k + 1 === n - 1 ? seg[k] - 12 : seg[k] / 2;
      rad.push(Math.max(0, Math.min(RAD, a, b)));
    }
    rad.push(0);
    var d = "M" + r1(pts[0][0]) + " " + r1(pts[0][1]), pieces = [], arc = 0;
    for (k = 0; k + 1 < n; k++) {
      var ux = (pts[k + 1][0] - pts[k][0]) / (seg[k] || 1), uy = (pts[k + 1][1] - pts[k][1]) / (seg[k] || 1);
      var s0 = [pts[k][0] + ux * rad[k], pts[k][1] + uy * rad[k]], s1 = [pts[k + 1][0] - ux * rad[k + 1], pts[k + 1][1] - uy * rad[k + 1]];
      var sl = Math.max(0, seg[k] - rad[k] - rad[k + 1]);
      pieces.push({ a: s0, u: [ux, uy], len: sl, arc: arc });
      arc += sl;
      d += "L" + r1(s1[0]) + " " + r1(s1[1]);
      if (k + 2 < n) {
        var r = rad[k + 1], c = pts[k + 1], vx = (pts[k + 2][0] - c[0]) / (seg[k + 1] || 1), vy = (pts[k + 2][1] - c[1]) / (seg[k + 1] || 1);
        var e1 = [c[0] + vx * r, c[1] + vy * r];
        d += "C" + r1(s1[0] + ux * r * 0.55) + " " + r1(s1[1] + uy * r * 0.55) + " " + r1(e1[0] - vx * r * 0.55) + " " + r1(e1[1] - vy * r * 0.55) + " " + r1(e1[0]) + " " + r1(e1[1]);
        arc += r * 1.571;
      }
    }
    return { d: d, pieces: pieces, len: arc };
  }

  function overlap(a, b) { return Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)); } // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
  // Boxes in a uniform bucket grid, numbered in insertion order; cost() sums the overlaps with a probe box in that order (touching and far boxes add exactly 0, so they are skipped).
  var BUCKET = 64;
  function boxIndex() { return { map: new Map(), boxes: [], seen: [], tick: 0 }; } // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
  function bucketKey(cx, cy) { return cx * 4194304 + cy; } // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
  function bucketsOf(b, fn) {
    var x1 = Math.floor(b.x0 / BUCKET), x2 = Math.floor(b.x1 / BUCKET), y1 = Math.floor(b.y0 / BUCKET), y2 = Math.floor(b.y1 / BUCKET);
    for (var cx = x1; cx <= x2; cx++) for (var cy = y1; cy <= y2; cy++) fn(bucketKey(cx, cy));
  }
  function addBox(ix, b) {
    var id = ix.boxes.length;
    ix.boxes.push(b);
    ix.seen.push(0);
    bucketsOf(b, function (key) {
      var list = ix.map.get(key);
      if (list) list.push(id); else ix.map.set(key, [id]);
    });
  }
  function cost(boxes, ix) {
    var total = 0;
    boxes.forEach(function (b) {
      var ids = [], tick = ++ix.tick;
      bucketsOf(b, function (key) {
        var list = ix.map.get(key);
        if (list) list.forEach(function (id) { if (ix.seen[id] !== tick) { ix.seen[id] = tick; ids.push(id); } });
      });
      ids.sort(num);
      ids.forEach(function (id) { total += overlap(b, ix.boxes[id]); });
    });
    return total;
  }
  // Candidate points along straight pieces, nearest the path's arc midpoint first.
  function stations(sh, margin, ends) { // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
    var out = [];
    sh.pieces.forEach(function (pc) {
      for (var t = margin; t <= pc.len - margin; t += 4) {
        var a = pc.arc + t;
        if (a < ends || a > sh.len - ends) continue;
        out.push({ x: pc.a[0] + pc.u[0] * t, y: pc.a[1] + pc.u[1] * t, h: Math.abs(pc.u[0]) > 0.5, off: Math.abs(a - sh.len / 2) });
      }
    });
    return out.sort(function (a, b) { return a.off - b.off; });
  }

  function placeFirewall(sh, hard, soft, bb) {
    var best = null;
    var st = stations(sh, 6, 26);
    if (!st.length) st = stations(sh, 2, 6);
    if (!st.length) st = stations(sh, 0, 0);
    st.forEach(function (s) {
      if (best?.clear) return;
      var mk = s.h ? { x0: s.x - 6, y0: s.y - 12, x1: s.x + 6, y1: s.y + 12 } : { x0: s.x - 12, y0: s.y - 6, x1: s.x + 12, y1: s.y + 6 };
      var opts = s.h
        ? [{ label: [s.x, s.y + 21], anchor: "middle", box: { x0: s.x - 26, y0: s.y + 12, x1: s.x + 26, y1: s.y + 24 } }, { label: [s.x, s.y - 15], anchor: "middle", box: { x0: s.x - 26, y0: s.y - 25, x1: s.x + 26, y1: s.y - 13 } }]
        : [{ label: [s.x + 15, s.y + 3], anchor: "start", box: { x0: s.x + 14, y0: s.y - 7, x1: s.x + 66, y1: s.y + 5 } }, { label: [s.x - 15, s.y + 3], anchor: "end", box: { x0: s.x - 66, y0: s.y - 7, x1: s.x - 14, y1: s.y + 5 } }];
      opts.forEach(function (o) {
        growBox(bb, mk); growBox(bb, o.box);
        var hit = cost([mk, o.box], hard) * 100 + cost([mk, o.box], soft) * 10, sc = hit + s.off * 0.01;
        if (bb.t) bb.h = (Math.imul(bb.h, 1000003) + Math.round(sc * 1000)) | 0;
        if (!best || sc < best.score) best = { score: sc, clear: hit === 0, at: [r1(s.x), r1(s.y)], a: s.h ? 0 : 90, label: [r1(o.label[0]), r1(o.label[1])], anchor: o.anchor, boxes: [mk, o.box] };
      });
    });
    return best;
  }

  function placeLabel(sh, lw, hard, soft, bb) {
    var best = null;
    stations(sh, 4, 22).forEach(function (s) {
      if (best?.clear) return;
      var b = { x0: s.x - lw / 2, y0: s.y - 8.5, x1: s.x + lw / 2, y1: s.y + 8.5 };
      growBox(bb, b);
      var hit = cost([b], hard) * 100 + cost([b], soft) * 5 + (s.h ? 0 : 400), sc = hit + s.off * 0.01;
      if (bb.t) bb.h = (Math.imul(bb.h, 1000003) + Math.round(sc * 1000)) | 0;
      if (!best || sc < best.score) best = { score: sc, clear: hit === 0, label: [r1(b.x0 + 7), r1(s.y + 3.5)], box: b };
    });
    return best;
  }

  // Incremental routing (docs/tech/performance.md, ADR-0020). A route is a pure function of its search window: the grid lines and the
  // per-point flags inside the box of points the search touched, the start and goal ports, and the home regions. Every search records
  // that box (index space of the grid it ran on); a later run reuses the result when the new grid holds the very same lines and flags in
  // that box. Labels and firewall markers are reused when their route is unchanged and no box that changed (old or new rectangle) touches
  // the area their candidates were scored in. Anything uncertain is computed again, so the output equals a full re-route.
  function newAcc(trace) { return [Infinity, -Infinity, Infinity, -Infinity, 0, trace]; } // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
  function accIdx(acc, i0, i1, j0, j1) { // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
    if (i0 < acc[0]) acc[0] = i0;
    if (i1 > acc[1]) acc[1] = i1;
    if (j0 < acc[2]) acc[2] = j0;
    if (j1 > acc[3]) acc[3] = j1;
  }
  // The grid lines a point lookup (at) depends on.
  function accPoint(acc, G, x, y) {
    accIdx(acc, Math.max(0, firstAbove(G.xs, x - 0.7) - 1), Math.min(G.nx - 1, firstAtLeast(G.xs, x + 0.7)), Math.max(0, firstAbove(G.ys, y - 0.7) - 1), Math.min(G.ny - 1, firstAtLeast(G.ys, y + 0.7)));
  }
  function finishAcc(acc, G) {
    if (acc[0] > acc[1] || acc[2] > acc[3]) return [0, G.nx - 1, 0, G.ny - 1];
    return [Math.max(0, acc[0] - 1), Math.min(G.nx - 1, acc[1] + 1), Math.max(0, acc[2] - 1), Math.min(G.ny - 1, acc[3] + 1)];
  }
  function slim(G) { // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
    return { xs: G.xs, ys: G.ys, nx: G.nx, ny: G.ny, blk: G.blk, hb: G.hb, vb: G.vb, hc: G.hc, vc: G.vc, hh: G.hh, vh: G.vh };
  }
  function axisMap(oa, na) { // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
    var m = new Int32Array(oa.length), j = 0;
    for (var i = 0; i < oa.length; i++) {
      while (j < na.length && na[j] < oa[i]) j++;
      m[i] = j < na.length && na[j] === oa[i] ? j : -1;
    }
    return m;
  }
  // Prefix counts over an axis map: lost[i] = old lines below i that are gone, split[i] = old lines below i whose predecessor is no longer the next line.
  function axisCounts(m) { // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
    var lost = new Int32Array(m.length + 1), split = new Int32Array(m.length + 1);
    for (var i = 0; i < m.length; i++) {
      lost[i + 1] = lost[i] + (m[i] < 0 ? 1 : 0);
      split[i + 1] = split[i] + (i > 0 && m[i] >= 0 && m[i - 1] >= 0 && m[i] !== m[i - 1] + 1 ? 1 : 0);
    }
    return { lost: lost, split: split };
  }
  // How the grid of the previous run maps onto the new one: line maps, and a summed-area table of the points whose flags changed.
  function gridDiff(Go, Gn) {
    var xm = axisMap(Go.xs, Gn.xs), ym = axisMap(Go.ys, Gn.ys), nxo = Go.nx, nyo = Go.ny, nyn = Gn.ny, d = null, i, j;
    var ax = axisCounts(xm), ay = axisCounts(ym);
    for (i = 0; i < nxo; i++) {
      var ni = xm[i];
      if (ni < 0) continue;
      for (j = 0; j < nyo; j++) {
        var nj = ym[j];
        if (nj < 0) continue;
        var a = i * nyo + j, b = ni * nyn + nj;
        if (Go.blk[a] !== Gn.blk[b] || Go.hb[a] !== Gn.hb[b] || Go.vb[a] !== Gn.vb[b] || Go.hc[a] !== Gn.hc[b] || Go.vc[a] !== Gn.vc[b] || Go.hh[a] !== Gn.hh[b] || Go.vh[a] !== Gn.vh[b]) {
          d = d || new Uint8Array(nxo * nyo);
          d[a] = 1;
        }
      }
    }
    var sat = null, w = nyo + 1;
    if (d) {
      sat = new Int32Array((nxo + 1) * w);
      for (i = 0; i < nxo; i++) for (j = 0; j < nyo; j++) sat[(i + 1) * w + j + 1] = d[i * nyo + j] + sat[i * w + j + 1] + sat[(i + 1) * w + j] - sat[i * w + j];
    }
    return { xm: xm, ym: ym, nxo: nxo, nyo: nyo, nxn: Gn.nx, nyn: nyn, ax: ax, ay: ay, sat: sat, w: w };
  }
  // Whether the box fp = [i0, i1, j0, j1] (old index space) is the same grid region in the new grid.
  function gridSame(gd, fp) {
    var a = fp[0], b = fp[1], c = fp[2], e = fp[3];
    if (gd.ax.lost[b + 1] - gd.ax.lost[a] || gd.ax.split[b + 1] - gd.ax.split[a + 1] || gd.ay.lost[e + 1] - gd.ay.lost[c] || gd.ay.split[e + 1] - gd.ay.split[c + 1]) return false;
    if ((a === 0 && gd.xm[0] !== 0) || (b === gd.nxo - 1 && gd.xm[b] !== gd.nxn - 1) || (c === 0 && gd.ym[0] !== 0) || (e === gd.nyo - 1 && gd.ym[e] !== gd.nyn - 1)) return false;
    if (!gd.sat) return true;
    var w = gd.w, s = gd.sat;
    return s[(b + 1) * w + e + 1] - s[a * w + e + 1] - s[(b + 1) * w + c] + s[a * w + c] === 0;
  }
  function gridMap(gd, fp) { return [gd.xm[fp[0]], gd.xm[fp[1]], gd.ym[fp[2]], gd.ym[fp[3]]]; } // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
  function rk(r) { return r.x0 + "," + r.y0 + "," + r.x1 + "," + r.y1; } // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
  // Pushes the rectangles of oldL / newL that have no equal partner onto out; false when the partnered ones changed their relative order.
  function rectDiff(oldL, newL, out) { // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
    var cnt = new Map(), used = new Map(), keepOld = [], keepNew = [];
    oldL.forEach(function (r) { var k = rk(r); cnt.set(k, (cnt.get(k) || 0) + 1); });
    newL.forEach(function (r) {
      var k = rk(r), n = cnt.get(k) || 0;
      if (n > 0) { cnt.set(k, n - 1); used.set(k, (used.get(k) || 0) + 1); keepNew.push(k); } else out.push(r);
    });
    oldL.forEach(function (r) {
      var k = rk(r), n = used.get(k) || 0;
      if (n > 0) { used.set(k, n - 1); keepOld.push(k); } else out.push(r);
    });
    return keepOld.length === keepNew.length && keepOld.every(function (k, i) { return k === keepNew[i]; });
  }
  function fpClear(fp, list) { // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
    if (!fp) return true;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.x0 <= fp.x1 && r.x1 >= fp.x0 && r.y0 <= fp.y1 && r.y1 >= fp.y0) return false;
    }
    return true;
  }
  function newBox(trace) { return { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, h: 0, t: trace }; } // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
  function growBox(bb, b) { // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
    bb.x0 = Math.min(bb.x0, b.x0); bb.y0 = Math.min(bb.y0, b.y0); bb.x1 = Math.max(bb.x1, b.x1); bb.y1 = Math.max(bb.y1, b.y1);
  }
  function boxesEq(a, b) { // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    return a.every(function (r, i) { return rk(r) === rk(b[i]); });
  }
  function ptsEq(a, b) { // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    return a.every(function (p, i) { return p[0] === b[i][0] && p[1] === b[i][1]; });
  }

  // Routes every connection. o: { w: measured box widths, lw: measured label pill widths } (both optional).
  function route(s, meta, o) { return routeWith(s, meta, o, null).routes; }

  // Same routes, plus the state to hand to the next call as prev (the state of the previous call): only what the edit can have changed is computed again.
  function routeWith(s, meta, o, prev) {
    o = o || {};
    if (!prev || prev.v !== 1) prev = null;
    var pe = prev ? prev.edges : null, ent = {}, stats = { pass1: 0, pass2: 0, fw: 0, labels: 0 };
    var S = shapes(s, meta, o.w), E = meta.edges, ov = s.edges || {};
    var res = {};
    function home(e) {
      var h = [];
      [e.from, e.to].forEach(function (k) {
        var r = S.ent[k];
        if (!r) return;
        if (k.charAt(0) === "n" && r.cl >= 0) h.push(r.cl);
      });
      return h;
    }
    function cands(r, other, v) { // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
      return [0, 1, 2, 3].map(function (sd) {
        var p = port(r, sd, v === undefined ? centre(r, sd) : v);
        return { sd: sd, p: p, c: facing(r, sd, other) ? 0 : BEND / 2 };
      });
    }
    // A process endpoint (body line) is a port on its server's left or right side at that line's height; end 0 = from, 1 = to.
    function lineY(e, end) {
      var li = end ? e.tl : e.fl, id = keyset.parseKey(end ? e.to : e.from).id;
      return li === null || li === undefined || !s.nodes[id] ? null : Math.round(s.nodes[id].body[li][1] - 4);
    }
    function endCands(e, end, r, other) {
      var y = lineY(e, end);
      return y === null ? cands(r, other) : cands(r, other, y).filter(function (c) { return c.sd % 2 === 0; });
    }
    function run(G, from, to, h, acc) {
      from.concat(to).forEach(function (c) { accPoint(acc, G, c.p.stub[0], c.p.stub[1]); });
      var st = from.map(function (c) { return { p: at(G, c.p.stub[0], c.p.stub[1]), d: c.sd, c: c.c, cand: c }; }).filter(function (c) { return c.p >= 0 && !G.blk[c.p]; });
      var gl = to.map(function (c) { return { p: at(G, c.p.stub[0], c.p.stub[1]), d: c.sd < 0 ? -1 : (c.sd + 2) % 4, c: c.c, cand: c }; }).filter(function (c) { return c.p >= 0 && !G.blk[c.p]; });
      if (!st.length || !gl.length) return null;
      return search(G, st, gl, h, acc);
    }
    function rect(r) { return [r.x0, r.y0, r.x1, r.y1]; } // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it

    // Pass 1: free sides, centred ports (process endpoints: left / right at their line).
    var extra = [];
    E.forEach(function (e) {
      [S.ent[e.from], S.ent[e.to]].forEach(function (r, end) {
        if (!r) return;
        [0, 1, 2, 3].forEach(function (sd) { var p = port(r, sd, centre(r, sd)); extra.push(p.pt, p.stub); });
        if (lineY(e, end) !== null) [0, 2].forEach(function (sd) { var p = port(r, sd, lineY(e, end)); extra.push(p.pt, p.stub); });
      });
      (ov[e.k]?.via || []).forEach(function (v) { extra.push(v); });
    });
    var G = grid(S, extra), gd1 = prev ? gridDiff(prev.G, G) : null, first = {};
    E.forEach(function (e) {
      var A = S.ent[e.from], B = S.ent[e.to];
      if (!A || !B) return;
      var via = ov[e.k]?.via || [], h = home(e), k1 = JSON.stringify([rect(A), rect(B), h, lineY(e, 0), lineY(e, 1), via]), c = pe?.[e.k], rec = { k1: k1 };
      ent[e.k] = rec;
      if (c && c.k1 === k1 && gridSame(gd1, c.fp1)) {
        rec.f1 = c.f1; rec.fp1 = gridMap(gd1, c.fp1); rec.h1 = c.h1;
        if (c.f1) first[e.k] = c.f1;
        return;
      }
      var acc = newAcc(o.trace);
      stats.pass1++;
      if (!via.length) {
        var r = run(G, endCands(e, 0, A, B), endCands(e, 1, B, A), h, acc);
        if (r) first[e.k] = { sa: r.start.cand.sd, sb: (r.goal.d + 2) % 4, pts: [r.start.cand.p.pt].concat(r.pts, [r.goal.cand.p.pt]) };
      } else {
        var pts = [], cur = endCands(e, 0, A, B), ok = true, sa = -1, sb = -1;
        via.concat([null]).forEach(function (v, i) {
          if (!ok) return;
          var tgt = v ? [{ sd: -1, p: { pt: v, stub: v }, c: 0 }] : endCands(e, 1, B, A);
          var rr = run(G, cur, tgt, h, acc);
          if (!rr) { ok = false; return; }
          if (i === 0) { sa = rr.start.cand.sd; pts.push(rr.start.cand.p.pt); }
          pts = pts.concat(rr.pts);
          if (!v) { sb = (rr.goal.d + 2) % 4; pts.push(rr.goal.cand.p.pt); }
          else cur = [0, 1, 2, 3].map(function (d) { return { sd: d, p: { pt: v, stub: v }, c: 0 }; });
        });
        if (ok) first[e.k] = { sa: sa, sb: sb, pts: pts, via: true };
      }
      rec.f1 = first[e.k]; rec.fp1 = finishAcc(acc, G); rec.h1 = acc[4];
    });

    // Pass 2: a port wants the other end's position (a facing pair with overlapping sides: the overlap's middle, so it runs straight;
    // a process endpoint: its line); ports sharing a side keep up to 20px apart; then re-route with the ports fixed.
    var bySide = {}, ports = {};
    E.forEach(function (e) {
      var f = first[e.k];
      if (!f || f.via) return;
      var A = S.ent[e.from], B = S.ent[e.to], sa = span(A, f.sa), sb = span(B, f.sb), mid = null, ly = [lineY(e, 0), lineY(e, 1)];
      if ((f.sa + 2) % 4 === f.sb && facing(A, f.sa, B)) {
        var lo = Math.max(sa[0], sb[0]) + 8, hi = Math.min(sa[1], sb[1]) - 8;
        if (hi >= lo) mid = (lo + hi) / 2;
        if (ly[0] !== null) mid = ly[0];
        else if (ly[1] !== null) mid = ly[1];
      }
      [[e.from, f.sa, B, 0, A], [e.to, f.sb, A, 1, B]].forEach(function (x) {
        if (ly[x[3]] !== null) { ports[e.k + "|" + x[3]] = { v: ly[x[3]], r: x[4], sd: x[1] }; return; }
        var o2 = x[2], sk = x[0] + "|" + x[1], want = mid;
        if (want === null) want = x[1] % 2 === 0 ? (o2.y0 + o2.y1) / 2 : (o2.x0 + o2.x1) / 2;
        bySide[sk] = bySide[sk] || [];
        bySide[sk].push({ k: e.k, end: x[3], r: S.ent[x[0]], sd: x[1], want: want });
      });
    });
    Object.keys(bySide).forEach(function (key) {
      var l = bySide[key].sort(function (a, b) { return a.want - b.want; }), sp = span(l[0].r, l[0].sd);
      var lo = sp[0] + 8, hi = sp[1] - 8, step = Math.min(20, (hi - lo) / Math.max(1, l.length - 1)), v = [], i;
      for (i = 0; i < l.length; i++) v[i] = Math.max(Math.min(Math.max(l[i].want, lo), hi), i ? v[i - 1] + step : lo);
      for (i = l.length - 1; i >= 0; i--) v[i] = Math.min(v[i], i < l.length - 1 ? v[i + 1] - step : hi);
      l.forEach(function (it, j) { ports[it.k + "|" + it.end] = { v: Math.round(v[j]), r: it.r, sd: it.sd }; });
    });
    var extra2 = extra.slice();
    Object.keys(ports).forEach(function (k) { var q = ports[k], p = port(q.r, q.sd, q.v); extra2.push(p.pt, p.stub); });
    var G2 = grid(S, extra2), gd2 = prev ? gridDiff(prev.G2, G2) : null;
    E.forEach(function (e) {
      var f = first[e.k], A = S.ent[e.from], B = S.ent[e.to], pts = null, rec = ent[e.k], sp = null;
      if (!f) {
        if (A && B) pts = [[(A.x0 + A.x1) / 2, (A.y0 + A.y1) / 2], [(B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2]];
      } else if (f.via) pts = f.pts;
      else {
        var a = ports[e.k + "|0"], b = ports[e.k + "|1"], pa = port(A, a.sd, a.v), pb = port(B, b.sd, b.v), h = home(e), c = pe?.[e.k];
        var k2 = JSON.stringify([pa, a.sd, pb, b.sd, h]);
        if (c && c.k2 === k2 && c.fp2 && (!c.fb || ptsEq(c.f1pts, f.pts)) && gridSame(gd2, c.fp2)) {
          pts = c.pts2; sp = c.sp; rec.fb = c.fb; rec.fp2 = gridMap(gd2, c.fp2); rec.h2 = c.h2;
        } else {
          stats.pass2++;
          var acc = newAcc(o.trace), r = run(G2, [{ sd: a.sd, p: pa, c: 0 }], [{ sd: b.sd, p: pb, c: 0 }], h, acc);
          pts = r ? [r.start.cand.p.pt].concat(r.pts, [r.goal.cand.p.pt]) : f.pts;
          rec.fb = !r; rec.fp2 = finishAcc(acc, G2); rec.h2 = acc[4];
        }
        rec.k2 = k2; rec.pts2 = pts; rec.f1pts = f.pts;
      }
      if (pts) {
        rec.sp = sp || simplify(pts);
        res[e.k] = { pts: rec.sp };
      }
    });

    // Firewall markers, then connection labels, each clear of servers, region titles and borders where possible.
    var hardR = S.nodes.concat(S.titles), softR = S.bands, hard = boxIndex(), soft = boxIndex();
    hardR.forEach(function (b) { addBox(hard, b); });
    softR.forEach(function (b) { addBox(soft, b); });
    var order = Object.keys(res), chg = [], reuse = false, gone = [], fwc = [], lbc = [];
    if (prev) {
      reuse = rectDiff(prev.hardR, hardR, chg) && rectDiff(prev.softR, softR, chg);
      var live = new Set(order), had = new Set(prev.order);
      reuse = reuse && prev.order.filter(function (k) { return live.has(k); }).join("\n") === order.filter(function (k) { return had.has(k); }).join("\n");
      if (reuse) {
        prev.order.forEach(function (k) {
          if (live.has(k)) return;
          var c = pe[k];
          if (c.fwr?.boxes) c.fwr.boxes.forEach(function (b) { fwc.push(b); });
          if (c.lbl?.box) lbc.push(c.lbl.box);
        });
      }
    }
    var CF = chg.concat(fwc);
    E.forEach(function (e) {
      var rt = res[e.k];
      if (!rt) return;
      var rec = ent[e.k], c = reuse ? pe[e.k] : null, same = !!c && ptsEq(c.sp, rt.pts), sh = null, ob = c?.fwr?.boxes || null;
      if (same) rt.d = c.d;
      else { sh = shape(rt.pts); rt.d = sh.d; }
      rec.d = rt.d;
      rt.fw = null;
      rec.fwr = null;
      if (e.fw) {
        var fr;
        if (same && c.fwr && fpClear(c.fwr.fp, CF)) fr = c.fwr;
        else {
          stats.fw++;
          var bb = newBox(o.trace), f = placeFirewall(sh || (sh = shape(rt.pts)), hard, soft, bb);
          fr = { h: bb.h, fp: bb.x0 === Infinity ? null : bb, val: f ? { at: f.at, a: f.a, label: f.label, anchor: f.anchor } : null, boxes: f ? f.boxes : null };
        }
        if (fr.boxes) { fr.boxes.forEach(function (b) { addBox(hard, b); }); rt.fw = fr.val; }
        rec.fwr = fr;
      }
      if (reuse && !boxesEq(ob, rec.fwr?.boxes || null)) {
        [ob, rec.fwr?.boxes].forEach(function (l) { if (l) l.forEach(function (b) { CF.push(b); fwc.push(b); }); });
      }
    });
    var CL = chg.concat(fwc, lbc);
    E.forEach(function (e) {
      var rt = res[e.k];
      if (!rt) return;
      var rec = ent[e.k], c = reuse ? pe[e.k] : null, ol = c?.lbl || null;
      rt.label = null;
      rec.lbl = null;
      if (e.ll) {
        var fix = ov[e.k]?.label;
        if (fix) rt.label = fix.slice();
        else {
          var lw = o.lw?.[e.k] || e.ll * 6 + 14, lr;
          if (ol && ol.lw === lw && ptsEq(c.sp, rt.pts) && fpClear(ol.fp, CL)) lr = ol;
          else {
            stats.labels++;
            var bb = newBox(o.trace), l = placeLabel(shape(rt.pts), lw, hard, soft, bb);
            lr = { lw: lw, h: bb.h, fp: bb.x0 === Infinity ? null : bb, label: l ? l.label : null, box: l ? l.box : null };
          }
          if (lr.box) { addBox(hard, lr.box); rt.label = lr.label; }
          rec.lbl = lr;
        }
      }
      var ob = ol?.box || null, nb = rec.lbl?.box || null;
      if (reuse && !boxesEq(ob && [ob], nb && [nb])) [ob, nb].forEach(function (b) { if (b) CL.push(b); });
    });
    var state = { v: 1, G: slim(G), G2: slim(G2), edges: ent, order: order, hardR: hardR, softR: softR, stats: stats };
    return { routes: res, state: state };
  }

  // Keys ("n:id" / "c:id") of servers and regions breaking the spacing rules (validate.mjs states them for the build).
  function problems(s, meta, w) {
    var S = shapes(s, meta, w), bad = {};
    function gap(a, b) { return Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1); } // NOSONAR: the kit body is inlined through Function.toString, so its helpers must stay inside it
    var nodes = S.nodes;
    function flagPairs(list) {
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          if (gap(list[i], list[j]) < MIN_GAP) {
            bad[list[i].k] = 1;
            bad[list[j].k] = 1;
          }
        }
      }
    }
    flagPairs(nodes);
    nodes.forEach(function (b) {
      if (b.cl < 0) return;
      var c = S.clusters[b.cl];
      if (b.x0 - c.x0 < PAD || c.x1 - b.x1 < PAD || c.y1 - b.y1 < PAD || b.y0 < c.y0 + BAND + BAND_GAP) bad[b.k] = 1;
    });
    var cl = S.clusters;
    flagPairs(cl);
    cl.forEach(function (c) { nodes.forEach(function (b) { if (b.cl !== c.i && gap(c, b) < MIN_GAP) bad[c.k] = bad[b.k] = 1; }); });
    return bad;
  }

  return { headerTitle: headerTitle, boxExtent: boxExtent, boxFor: boxFor, rows: rows, fitBox: fitBox, fitRegion: fitRegion, regionBounds: regionBounds, resizeRegion: resizeRegion, route: route, routeWith: routeWith, problems: problems };
}

export const geometryKit = () => geometryKitOf(METRICS, keysKit());
