import { edgeKey, endKey } from "../parse/mmd.mjs";
import { processAnchors } from "../parse/config.mjs";

// Static facts the kit needs besides layout.json geometry; built once, shipped to the runtime as D.meta.
// Node nb / ni: body and IP line counts (auto-layout). Edge lv: "process" when an endpoint is a body line (diagram.json processes), else "server".
export function geometryMeta(model, groups, processes) {
  const len = (a) => a.reduce((m, s) => Math.max(m, s.length), 0);
  const gOf = {}, pa = processAnchors(processes, model.nodes);
  for (const [g, d] of Object.entries(groups || {})) for (const k of d.edges) gOf[k] = g;
  return {
    clusters: Object.fromEntries([...model.clusters.values()].map((c) => [c.id, { tl: c.title.length }])),
    nodes: Object.fromEntries([...model.nodes.values()].map((n) => [n.id, { tl: n.title.length, bl: len(n.body), il: len(n.ip), nb: n.body.length, ni: n.ip.length, cl: n.cluster }])),
    edges: model.edges.map((e) => ({ k: edgeKey(e), from: endKey(model, e.from), to: endKey(model, e.to), ll: e.label.length, fw: e.fw, g: gOf[edgeKey(e)] || null, fl: pa[edgeKey(e)]?.fl ?? null, tl: pa[edgeKey(e)]?.tl ?? null, lv: pa[edgeKey(e)] ? "process" : "server" })),
  };
}

// Box extents, box / region auto-sizing, connection routing, label and firewall placement, spacing checks.
// Self-contained on purpose: assets.mjs inlines this function's source as the "canvas/geometry" runtime module,
// so the build and edit mode compute identical geometry.
export function geometryKit() {
  var HEAD = 20, TITLE_CW = 6.6, BODY_CW = 6.6, IP_CW = 7, TEXT_X = 10;
  var BAND = 30, BAND_GAP = 10, MIN_GAP = 20, PAD = 16;
  var M = 10, BEND = 50, REGION = 1.5, HUG = 2, TIGHT = 0.3, RAD = 22;
  var DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
  var cache = { n: 0 };

  function r1(v) { return Math.round(v * 10) / 10; }
  function num(a, b) { return a - b; }

  function boxExtent(g, tl, w) {
    var bottom = g.y + g.h;
    for (var i = 0; i < g.ip.length; i++) bottom = Math.max(bottom, g.ip[i][1] + 7);
    return { x0: g.x, y0: g.y - HEAD, x1: g.x + (w || Math.max(g.w, g.title[0] - g.x + tl * TITLE_CW + 28)), y1: bottom };
  }

  // Body and IP lines sit at the box's text padding; the box is wide enough for its title, body lines and IP pills plus network buttons.
  function fitBox(g, t) {
    g.body.forEach(function (p) { p[0] = g.x + TEXT_X; });
    g.ip.forEach(function (p) { p[0] = g.x + TEXT_X; });
    var need = Math.max(g.title[0] - g.x + t.tl * TITLE_CW + 28, TEXT_X * 2 + t.bl * BODY_CW, t.il ? TEXT_X + t.il * IP_CW + 26 : 0);
    g.w = Math.max(g.w, Math.ceil(need));
  }

  // Region grown (never shrunk below base) to hold its servers with padding and the header band.
  function fitRegion(s, meta, cid, baseRect, w) {
    var c = s.clusters[cid], b = baseRect || c, x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
    Object.keys(meta.nodes).forEach(function (id) {
      var g = s.nodes[id];
      if (meta.nodes[id].cl !== cid || !g || g.hidden) return;
      var e = boxExtent(g, meta.nodes[id].tl, w && w[id]);
      x0 = Math.min(x0, e.x0 - PAD); x1 = Math.max(x1, e.x1 + PAD); y1 = Math.max(y1, e.y1 + PAD);
      y0 = Math.min(y0, e.y0 - BAND - BAND_GAP);
    });
    var t = baseRect ? baseRect.title : c.title, centred = Math.abs(t[0] - (b.x + b.w / 2)) <= 2;
    c.title = [centred ? r1((x0 + x1) / 2) : t[0] + (x0 - b.x), t[1] + (y0 - b.y)];
    c.x = x0; c.y = y0; c.w = x1 - x0; c.h = y1 - y0;
  }

  function shapes(s, meta, w) {
    var ent = {}, nodes = [], titles = [], clusters = [];
    Object.keys(meta.clusters).forEach(function (id, i) {
      var c = s.clusters[id], hw = meta.clusters[id].tl * 3.9 + 4;
      var r = { k: "c:" + id, i: i, x0: c.x, y0: c.y, x1: c.x + c.w, y1: c.y + c.h };
      ent[r.k] = r; clusters.push(r);
      titles.push({ x0: c.title[0] - hw, y0: c.title[1] - 13, x1: c.title[0] + hw, y1: c.title[1] + 4 });
    });
    Object.keys(meta.nodes).forEach(function (id) {
      var g = s.nodes[id];
      if (!g || g.hidden) return;
      var r = boxExtent(g, meta.nodes[id].tl, w && w[id]);
      r.k = "n:" + id;
      r.cl = meta.nodes[id].cl ? ent["c:" + meta.nodes[id].cl].i : -1;
      ent[r.k] = r; nodes.push(r);
    });
    var bands = [];
    clusters.forEach(function (c) {
      bands.push({ x0: c.x0, y0: c.y0 - 3, x1: c.x1, y1: c.y0 + 3 }, { x0: c.x0, y0: c.y1 - 3, x1: c.x1, y1: c.y1 + 3 });
      bands.push({ x0: c.x0 - 3, y0: c.y0, x1: c.x0 + 3, y1: c.y1 }, { x0: c.x1 - 3, y0: c.y0, x1: c.x1 + 3, y1: c.y1 });
    });
    return { ent: ent, nodes: nodes, titles: titles, clusters: clusters, bands: bands };
  }

  function uniq(a) {
    a.sort(num);
    var out = [];
    a.forEach(function (v) { if (!out.length || v - out[out.length - 1] > 0.5) out.push(v); });
    var mid = [];
    out.forEach(function (v, i) {
      mid.push(v);
      if (i + 1 < out.length && out[i + 1] - v > 30) mid.push((v + out[i + 1]) / 2);
    });
    return mid;
  }
  function inside(x, y, r, m) { return x > r.x0 - m + 0.01 && x < r.x1 + m - 0.01 && y > r.y0 - m + 0.01 && y < r.y1 + m - 0.01; }

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
    var obst = S.nodes.map(function (r) { return [r, M]; }).concat(S.titles.map(function (r) { return [r, 4]; }));
    function hit(x, y) { for (var k = 0; k < obst.length; k++) if (inside(x, y, obst[k][0], obst[k][1])) return 1; return 0; }
    // Bit 2: a segment within 5px of the narrowest allowed clearance (narrow channel).
    function tight(x, y) { for (var k = 0; k < S.nodes.length; k++) if (inside(x, y, S.nodes[k], M + 5)) return 2; return 0; }
    function region(x, y) { for (var k = 0; k < S.clusters.length; k++) if (inside(x, y, S.clusters[k], 0)) return k; return -1; }
    function hug(x, y, horiz) {
      for (var k = 0; k < S.clusters.length; k++) {
        var c = S.clusters[k];
        if (horiz ? x > c.x0 && x < c.x1 && (Math.abs(y - c.y0) < 9 || Math.abs(y - c.y1) < 9) : y > c.y0 && y < c.y1 && (Math.abs(x - c.x0) < 9 || Math.abs(x - c.x1) < 9)) return 1;
      }
      return 0;
    }
    for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) {
      var p = i * ny + j;
      blk[p] = hit(xs[i], ys[j]);
      if (i + 1 < nx) { var mx = (xs[i] + xs[i + 1]) / 2; hb[p] = hit(mx, ys[j]); hc[p] = region(mx, ys[j]); hh[p] = hug(mx, ys[j], true) | tight(mx, ys[j]); }
      if (j + 1 < ny) { var my = (ys[j] + ys[j + 1]) / 2; vb[p] = hit(xs[i], my); vc[p] = region(xs[i], my); vh[p] = hug(xs[i], my, false) | tight(xs[i], my); }
    }
    return { xs: xs, ys: ys, nx: nx, ny: ny, blk: blk, hb: hb, vb: vb, hc: hc, vc: vc, hh: hh, vh: vh };
  }
  function at(G, x, y) {
    var i = G.xs.findIndex(function (v) { return Math.abs(v - x) < 0.6; }), j = G.ys.findIndex(function (v) { return Math.abs(v - y) < 0.6; });
    return i < 0 || j < 0 ? -1 : i * G.ny + j;
  }

  // A* over (grid point, heading); cost = length (x region / hug penalties) + bends. starts / goals: {p, d, c}.
  function search(G, starts, goals, home) {
    var n = G.nx * G.ny * 4;
    if (cache.n < n) { cache.n = n; cache.dist = new Float64Array(n); cache.prev = new Int32Array(n); }
    var dist = cache.dist, prev = cache.prev;
    dist.fill(Infinity, 0, n); prev.fill(-1, 0, n);
    var goalAt = {}, hx = [], heap = [];
    goals.forEach(function (g) { (goalAt[g.p] = goalAt[g.p] || []).push(g); hx.push([G.xs[Math.floor(g.p / G.ny)], G.ys[g.p % G.ny]]); });
    function h(p) {
      var x = G.xs[Math.floor(p / G.ny)], y = G.ys[p % G.ny], m = Infinity;
      for (var k = 0; k < hx.length; k++) m = Math.min(m, Math.abs(x - hx[k][0]) + Math.abs(y - hx[k][1]));
      return m;
    }
    function push(f, st) {
      heap.push([f, st]);
      for (var i = heap.length - 1; i > 0;) { var q = (i - 1) >> 1; if (heap[q][0] <= heap[i][0]) break; var t = heap[q]; heap[q] = heap[i]; heap[i] = t; i = q; }
    }
    function pop() {
      var top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (var i = 0; ;) {
          var l = 2 * i + 1, r = l + 1, m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          var t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m;
        }
      }
      return top;
    }
    starts.forEach(function (s) {
      var st = s.p * 4 + s.d;
      if (s.c < dist[st]) { dist[st] = s.c; prev[st] = -1; push(s.c + h(s.p), st); }
    });
    var best = Infinity, bestSt = -1, bestGoal = null;
    while (heap.length) {
      var e = pop(), st = e[1], d0 = dist[st];
      if (e[0] >= best) break;
      if (e[0] > d0 + h(Math.floor(st / 4)) + 1e-6) continue;
      var p = Math.floor(st / 4), d = st % 4;
      (goalAt[p] || []).forEach(function (g) {
        var extra = g.d < 0 || g.d === d ? 0 : g.d === (d + 2) % 4 ? Infinity : BEND;
        if (d0 + extra + g.c < best) { best = d0 + extra + g.c; bestSt = st; bestGoal = g; }
      });
      var i = Math.floor(p / G.ny), j = p % G.ny;
      for (var d2 = 0; d2 < 4; d2++) {
        if (d2 === (d + 2) % 4) continue;
        var i2 = i + DX[d2], j2 = j + DY[d2];
        if (i2 < 0 || j2 < 0 || i2 >= G.nx || j2 >= G.ny) continue;
        var p2 = i2 * G.ny + j2;
        if (G.blk[p2]) continue;
        var horiz = d2 % 2 === 0, si = horiz ? (d2 === 0 ? p : p2) : (d2 === 1 ? p : p2);
        if ((horiz ? G.hb : G.vb)[si]) continue;
        var cl = (horiz ? G.hc : G.vc)[si];
        var len = horiz ? Math.abs(G.xs[i2] - G.xs[i]) : Math.abs(G.ys[j2] - G.ys[j]);
        var cost = len * (1 + (cl >= 0 && home.indexOf(cl) < 0 ? REGION : 0) + ((horiz ? G.hh : G.vh)[si] & 1 ? HUG : 0) + ((horiz ? G.hh : G.vh)[si] & 2 ? TIGHT : 0)) + (d2 === d ? 0 : BEND);
        var st2 = p2 * 4 + d2, nd = d0 + cost;
        if (nd < dist[st2]) { dist[st2] = nd; prev[st2] = st; push(nd + h(p2), st2); }
      }
    }
    if (bestSt < 0) return null;
    var pts = [];
    for (var s2 = bestSt; s2 >= 0; s2 = prev[s2]) { var pp = Math.floor(s2 / 4); pts.unshift([G.xs[Math.floor(pp / G.ny)], G.ys[pp % G.ny]]); }
    var first = starts.find(function (s) { return s.p * 4 + (s.d) === firstState(bestSt); });
    return { pts: pts, start: first, goal: bestGoal, cost: best };
    function firstState(s3) { while (prev[s3] >= 0) s3 = prev[s3]; return s3; }
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
    for (var k = 0; k + 1 < n; k++) seg.push(Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]));
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
  function cost(boxes, list) {
    var s = 0;
    boxes.forEach(function (b) { list.forEach(function (o) { s += overlap(b, o); }); });
    return s;
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
      if (best && best.clear) return;
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
      if (best && best.clear) return;
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
      var li = end ? e.tl : e.fl, id = (end ? e.to : e.from).slice(2);
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
      ((ov[e.k] || {}).via || []).forEach(function (v) { extra.push(v); });
    });
    var G = grid(S, extra), first = {};
    E.forEach(function (e) {
      var A = S.ent[e.from], B = S.ent[e.to];
      if (!A || !B) return;
      var via = (ov[e.k] || {}).via || [], h = home(e);
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
        var o2 = x[2], want = mid !== null ? mid : x[1] % 2 === 0 ? (o2.y0 + o2.y1) / 2 : (o2.x0 + o2.x1) / 2;
        (bySide[x[0] + "|" + x[1]] = bySide[x[0] + "|" + x[1]] || []).push({ k: e.k, end: x[3], r: S.ent[x[0]], sd: x[1], want: want });
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
    var hard = S.nodes.concat(S.titles), placed = [];
    E.forEach(function (e) {
      var rt = res[e.k];
      if (!rt) return;
      var sh = shape(rt.pts);
      rt.d = sh.d; rt.sh = sh;
      rt.fw = null;
      if (e.fw) {
        var f = placeFirewall(sh, hard.concat(placed), S.bands);
        if (f) { placed = placed.concat(f.boxes); rt.fw = { at: f.at, a: f.a, label: f.label, anchor: f.anchor }; }
      }
    });
    E.forEach(function (e) {
      var rt = res[e.k];
      if (!rt) return;
      rt.label = null;
      if (e.ll) {
        var fix = (ov[e.k] || {}).label;
        if (fix) rt.label = fix.slice();
        else {
          var lw = (o.lw && o.lw[e.k]) || e.ll * 6 + 14, l = placeLabel(rt.sh, lw, hard.concat(placed), S.bands);
          if (l) { placed.push(l.box); rt.label = l.label; }
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
    for (var i = 0; i < nodes.length; i++) for (var j = i + 1; j < nodes.length; j++) if (gap(nodes[i], nodes[j]) < MIN_GAP) bad[nodes[i].k] = bad[nodes[j].k] = 1;
    nodes.forEach(function (b) {
      if (b.cl < 0) return;
      var c = S.clusters[b.cl];
      if (b.x0 - c.x0 < PAD || c.x1 - b.x1 < PAD || c.y1 - b.y1 < PAD || b.y0 < c.y0 + BAND + BAND_GAP) bad[b.k] = 1;
    });
    var cl = S.clusters;
    for (i = 0; i < cl.length; i++) for (j = i + 1; j < cl.length; j++) if (gap(cl[i], cl[j]) < MIN_GAP) bad[cl[i].k] = bad[cl[j].k] = 1;
    cl.forEach(function (c) { nodes.forEach(function (b) { if (b.cl !== c.i && gap(c, b) < MIN_GAP) bad[c.k] = bad[b.k] = 1; }); });
    return bad;
  }

  return { boxExtent: boxExtent, fitBox: fitBox, fitRegion: fitRegion, route: route, problems: problems };
}
