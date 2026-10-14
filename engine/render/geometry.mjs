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

  function r1(v) { return Math.round(v * 10) / 10; }
  function num(a, b) { return a - b; }

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
  function rows(t) { return t.nb + (t.hw ? 1 : 0) + (t.os ? 1 : 0); }
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
  function firstAbove(a, v) {
    var lo = 0, hi = a.length;
    while (lo < hi) {
      var m = (lo + hi) >> 1;
      if (a[m] > v) hi = m; else lo = m + 1;
    }
    return lo;
  }
  function firstAtLeast(a, v) {
    var lo = 0, hi = a.length;
    while (lo < hi) {
      var m = (lo + hi) >> 1;
      if (a[m] >= v) hi = m; else lo = m + 1;
    }
    return lo;
  }
  function mids(a) {
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
    if (cache.hn === cache.hf.length) {
      var nf = new Float64Array(cache.hn * 2), ns = new Int32Array(cache.hn * 2);
      nf.set(cache.hf); ns.set(cache.hs);
      cache.hf = nf; cache.hs = ns;
    }
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
  function heapPop() {
    var hf = cache.hf, hs = cache.hs, hn = --cache.hn;
    if (!hn) return;
    hf[0] = hf[hn]; hs[0] = hs[hn];
    for (var a = 0; ;) {
      var l = 2 * a + 1, r = l + 1, mm = a, t;
      if (l < hn && hf[l] < hf[mm]) mm = l;
      if (r < hn && hf[r] < hf[mm]) mm = r;
      if (mm === a) break;
      t = hf[mm]; hf[mm] = hf[a]; hf[a] = t;
      t = hs[mm]; hs[mm] = hs[a]; hs[a] = t;
      a = mm;
    }
  }
  function markGoal(Q, g) {
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
  function settle(Q, st, d0) {
    var gl = Q.goalAt.get(st >> 2), d = st & 3;
    if (!gl) return;
    for (const g of gl) {
      const total = d0 + turnCost(g.d, d) + g.c;
      if (total < Q.best.cost) Q.best = { cost: total, st: st, goal: g };
    }
  }
  function relax(Q, st, st2, nd, p2) {
    var sd = cache.sd;
    if (sd[2 * st2 + 1] < Q.gmin || nd < sd[2 * st2]) {
      sd[2 * st2] = nd;
      sd[2 * st2 + 1] = Q.gmin + st + 1;
      heapPush(nd + heur(Q, p2), st2);
    }
  }
  function stepTo(Q, st, d0, i2, j2, d2) {
    var G = Q.G, p = st >> 2;
    if (i2 < 0 || j2 < 0 || i2 >= G.nx || j2 >= G.ny) return;
    var p2 = i2 * G.ny + j2;
    if (G.blk[p2]) return;
    var horiz = d2 % 2 === 0, forward = horiz ? d2 === 0 : d2 === 1, si = forward ? p : p2;
    if ((horiz ? G.hb : G.vb)[si]) return;
    var cl = (horiz ? G.hc : G.vc)[si], dear = cl >= 0 && cl !== Q.h0 && cl !== Q.h1 ? 1 : 0;
    var nd = d0 + ((horiz ? G.hcost : G.vcost)[dear][si] + (d2 === (st & 3) ? 0 : BEND));
    relax(Q, st, (p2 << 2) + d2, nd, p2);
  }
  function expand(Q, st, d0) {
    var p = st >> 2, d = st & 3, i = Math.trunc(p / Q.G.ny), j = p - i * Q.G.ny;
    for (var d2 = 0; d2 < 4; d2++) {
      if (d2 !== ((d + 2) & 3)) stepTo(Q, st, d0, i + DX[d2], j + DY[d2], d2);
    }
  }
  function search(G, starts, goals, home) {
    searchBuffers(G.nx * G.ny * 4);
    var Q = {
      G: G, gen: cache.gen, gmin: cache.gen * cache.scale, h0: home.length > 0 ? home[0] : -2, h1: home.length > 1 ? home[1] : -2,
      goalAt: new Map(), hx: [], best: { cost: Infinity, st: -1, goal: null },
    };
    cache.hn = 0;
    goals.forEach(function (g) { markGoal(Q, g); });
    starts.forEach(function (s) { seed(Q, s); });
    while (cache.hn) {
      var f = cache.hf[0], st = cache.hs[0];
      heapPop();
      var d0 = cache.sd[2 * st];
      if (f >= Q.best.cost) break;
      if (f > d0 + heur(Q, st >> 2) + 1e-6) continue;
      settle(Q, st, d0);
      expand(Q, st, d0);
    }
    return Q.best.st < 0 ? null : traceBack(G, starts, Q.best);
  }

  // Port on side sd (0 right, 1 bottom, 2 left, 3 top; = outward heading) at position v along the side.
  function port(r, sd, v) {
    if (sd === 0) return { pt: [r.x1, v], stub: [r.x1 + M, v] };
    if (sd === 2) return { pt: [r.x0, v], stub: [r.x0 - M, v] };
    if (sd === 1) return { pt: [v, r.y1], stub: [v, r.y1 + M] };
    return { pt: [v, r.y0], stub: [v, r.y0 - M] };
  }
  function centre(r, sd) { return Math.round(sd % 2 === 0 ? (r.y0 + r.y1) / 2 : (r.x0 + r.x1) / 2); }
  function span(r, sd) { return sd % 2 === 0 ? [r.y0, r.y1] : [r.x0, r.x1]; }
  function facing(r, sd, o) {
    var cx = (o.x0 + o.x1) / 2 - (r.x0 + r.x1) / 2, cy = (o.y0 + o.y1) / 2 - (r.y0 + r.y1) / 2;
    return DX[sd] * cx + DY[sd] * cy > 0;
  }

  function simplify(pts) {
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

  function overlap(a, b) { return Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)); }
  // Boxes in a uniform bucket grid, numbered in insertion order; cost() sums the overlaps with a probe box in that order (touching and far boxes add exactly 0, so they are skipped).
  var BUCKET = 64;
  function boxIndex() { return { map: new Map(), boxes: [], seen: [], tick: 0 }; }
  function bucketKey(cx, cy) { return cx * 4194304 + cy; }
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
  function stations(sh, margin, ends) {
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

  function placeFirewall(sh, hard, soft) {
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
        var hit = cost([mk, o.box], hard) * 100 + cost([mk, o.box], soft) * 10, sc = hit + s.off * 0.01;
        if (!best || sc < best.score) best = { score: sc, clear: hit === 0, at: [r1(s.x), r1(s.y)], a: s.h ? 0 : 90, label: [r1(o.label[0]), r1(o.label[1])], anchor: o.anchor, boxes: [mk, o.box] };
      });
    });
    return best;
  }

  function placeLabel(sh, lw, hard, soft) {
    var best = null;
    stations(sh, 4, 22).forEach(function (s) {
      if (best?.clear) return;
      var b = { x0: s.x - lw / 2, y0: s.y - 8.5, x1: s.x + lw / 2, y1: s.y + 8.5 };
      var hit = cost([b], hard) * 100 + cost([b], soft) * 5 + (s.h ? 0 : 400), sc = hit + s.off * 0.01;
      if (!best || sc < best.score) best = { score: sc, clear: hit === 0, label: [r1(b.x0 + 7), r1(s.y + 3.5)], box: b };
    });
    return best;
  }

  // Routes every connection. o: { w: measured box widths, lw: measured label pill widths } (both optional).
  function route(s, meta, o) {
    o = o || {};
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
    function cands(r, other, v) {
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
    function run(G, A, B, from, to, h) {
      var st = from.map(function (c) { return { p: at(G, c.p.stub[0], c.p.stub[1]), d: c.sd, c: c.c, cand: c }; }).filter(function (c) { return c.p >= 0 && !G.blk[c.p]; });
      var gl = to.map(function (c) { return { p: at(G, c.p.stub[0], c.p.stub[1]), d: c.sd < 0 ? -1 : (c.sd + 2) % 4, c: c.c, cand: c }; }).filter(function (c) { return c.p >= 0 && !G.blk[c.p]; });
      if (!st.length || !gl.length) return null;
      return search(G, st, gl, h);
    }

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
    var G = grid(S, extra), first = {};
    E.forEach(function (e) {
      var A = S.ent[e.from], B = S.ent[e.to];
      if (!A || !B) return;
      var via = ov[e.k]?.via || [], h = home(e);
      if (!via.length) {
        var r = run(G, A, B, endCands(e, 0, A, B), endCands(e, 1, B, A), h);
        if (r) first[e.k] = { sa: r.start.cand.sd, sb: (r.goal.d + 2) % 4, pts: [r.start.cand.p.pt].concat(r.pts, [r.goal.cand.p.pt]) };
        return;
      }
      var pts = [], cur = endCands(e, 0, A, B), ok = true, sa = -1, sb = -1;
      via.concat([null]).forEach(function (v, i) {
        if (!ok) return;
        var tgt = v ? [{ sd: -1, p: { pt: v, stub: v }, c: 0 }] : endCands(e, 1, B, A);
        var rr = run(G, A, B, cur, tgt, h);
        if (!rr) { ok = false; return; }
        if (i === 0) { sa = rr.start.cand.sd; pts.push(rr.start.cand.p.pt); }
        pts = pts.concat(rr.pts);
        if (!v) { sb = (rr.goal.d + 2) % 4; pts.push(rr.goal.cand.p.pt); }
        else cur = [0, 1, 2, 3].map(function (d) { return { sd: d, p: { pt: v, stub: v }, c: 0 }; });
      });
      if (ok) first[e.k] = { sa: sa, sb: sb, pts: pts, via: true };
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
    var G2 = grid(S, extra2);
    E.forEach(function (e) {
      var f = first[e.k], A = S.ent[e.from], B = S.ent[e.to], pts = null;
      if (!f) {
        if (A && B) pts = [[(A.x0 + A.x1) / 2, (A.y0 + A.y1) / 2], [(B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2]];
      } else if (f.via) pts = f.pts;
      else {
        var a = ports[e.k + "|0"], b = ports[e.k + "|1"];
        var r = run(G2, A, B, [{ sd: a.sd, p: port(A, a.sd, a.v), c: 0 }], [{ sd: b.sd, p: port(B, b.sd, b.v), c: 0 }], home(e));
        pts = r ? [r.start.cand.p.pt].concat(r.pts, [r.goal.cand.p.pt]) : f.pts;
      }
      if (pts) res[e.k] = { pts: simplify(pts) };
    });

    // Firewall markers, then connection labels, each clear of servers, region titles and borders where possible.
    var hard = boxIndex(), soft = boxIndex();
    S.nodes.concat(S.titles).forEach(function (b) { addBox(hard, b); });
    S.bands.forEach(function (b) { addBox(soft, b); });
    E.forEach(function (e) {
      var rt = res[e.k];
      if (!rt) return;
      var sh = shape(rt.pts);
      rt.d = sh.d; rt.sh = sh;
      rt.fw = null;
      if (e.fw) {
        var f = placeFirewall(sh, hard, soft);
        if (f) { f.boxes.forEach(function (b) { addBox(hard, b); }); rt.fw = { at: f.at, a: f.a, label: f.label, anchor: f.anchor }; }
      }
    });
    E.forEach(function (e) {
      var rt = res[e.k];
      if (!rt) return;
      rt.label = null;
      if (e.ll) {
        var fix = ov[e.k]?.label;
        if (fix) rt.label = fix.slice();
        else {
          var lw = o.lw?.[e.k] || e.ll * 6 + 14, l = placeLabel(rt.sh, lw, hard, soft);
          if (l) { addBox(hard, l.box); rt.label = l.label; }
        }
      }
      delete rt.sh;
    });
    return res;
  }

  // Keys ("n:id" / "c:id") of servers and regions breaking the spacing rules (validate.mjs states them for the build).
  function problems(s, meta, w) {
    var S = shapes(s, meta, w), bad = {};
    function gap(a, b) { return Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1); }
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

  return { headerTitle: headerTitle, boxExtent: boxExtent, boxFor: boxFor, rows: rows, fitBox: fitBox, fitRegion: fitRegion, regionBounds: regionBounds, resizeRegion: resizeRegion, route: route, problems: problems };
}

export const geometryKit = () => geometryKitOf(METRICS, keysKit());
