// Auto-layout: geometry for servers, regions and connections missing from layout.json; existing entries always win.
// Fresh regions are packed in rows (diagram.mmd order), their servers in a grid; standalone servers go in a final row.
// Missing servers of a placed region go below or right of its servers, whichever clashes less; new regions and
// standalone servers go below the existing content. Deterministic: same layout + meta, same result.
// Self-contained on purpose: assets.mjs inlines this function's source as the "canvas/auto-layout" runtime module,
// so the build and edit mode fill in identical geometry. geometry: the geometryKit() object.
export function autoLayoutKit(geometry) {
  var HEAD = 20, PAD = 16, TOP = 40, GAP = 20, RGAP = 60, ORIGIN = 20, MAXW = 1200, COLS = 3, EMPTY_W = 220, EMPTY_H = 120;

  function r1(v) { return Math.round(v * 10) / 10; }
  function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
  function dup(o) { return JSON.parse(JSON.stringify(o)); }

  // Box size from text lengths and line counts (same width rule as geometryKit.fitBox).
  function size(t) {
    return { w: Math.ceil(Math.max(t.tl * 6.6 + 38, 20 + t.bl * 6.6, t.il ? 36 + t.il * 7 : 0)), h: 20 + 16 * t.nb + 18 * t.ni };
  }
  // Server whose drawn box (incl. header) has its top-left corner at x, y.
  function box(t, x, y) {
    var z = size(t), by = y + HEAD;
    return {
      x: x, y: by, w: z.w, h: z.h, title: [x + 10, by - 6],
      body: range(t.nb).map(function (i) { return [x + 10, by + 18 + 16 * i]; }),
      ip: range(t.ni).map(function (i) { return [x + 10, by + 22 + 16 * t.nb + 18 * i]; }),
    };
  }

  function gridSize(meta, ids) {
    var cols = Math.min(ids.length, COLS), rows = Math.ceil(ids.length / cols), cw = 0, ch = 0;
    ids.forEach(function (id) { var z = size(meta.nodes[id]); cw = Math.max(cw, z.w); ch = Math.max(ch, z.h + HEAD); });
    return { cols: cols, cw: cw, ch: ch, w: cols * cw + (cols - 1) * GAP, h: rows * ch + (rows - 1) * GAP };
  }
  function grid(s, meta, ids, x, y) {
    var g = gridSize(meta, ids);
    ids.forEach(function (id, i) { s.nodes[id] = box(meta.nodes[id], x + (i % g.cols) * (g.cw + GAP), y + Math.floor(i / g.cols) * (g.ch + GAP)); });
  }
  function regionSize(meta, cid, ids) {
    var g = ids.length ? gridSize(meta, ids) : null;
    return { w: Math.max(g ? g.w + 2 * PAD : EMPTY_W, Math.ceil(meta.clusters[cid].tl * 7.8 + 2 * PAD)), h: g ? TOP + g.h + PAD : EMPTY_H };
  }

  function ext(s, meta, id) { return geometry.boxExtent(s.nodes[id], meta.nodes[id].tl); }
  function rect(c) { return { x0: c.x, y0: c.y, x1: c.x + c.w, y1: c.y + c.h }; }
  function union(a) {
    return a.reduce(function (u, r) { return u ? { x0: Math.min(u.x0, r.x0), y0: Math.min(u.y0, r.y0), x1: Math.max(u.x1, r.x1), y1: Math.max(u.y1, r.y1) } : r; }, null);
  }
  function placed(s, meta) {
    var nodes = Object.keys(meta.nodes).filter(function (id) { return s.nodes[id] && !s.nodes[id].hidden; });
    var clusters = Object.keys(meta.clusters).filter(function (id) { return s.clusters[id]; });
    return { nodes: nodes, clusters: clusters };
  }
  function bounds(s, meta) {
    var p = placed(s, meta);
    return union(p.clusters.map(function (id) { return rect(s.clusters[id]); }).concat(p.nodes.map(function (id) { return ext(s, meta, id); })));
  }
  function gap(a, b) { return Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1); }

  // Spacing clashes of region cid (and its servers ids) with every other placed region and server.
  function clashes(s, meta, cid, ids) {
    var p = placed(s, meta), own = [rect(s.clusters[cid])].concat(ids.map(function (id) { return ext(s, meta, id); })), n = 0;
    var others = p.clusters.filter(function (id) { return id !== cid; }).map(function (id) { return rect(s.clusters[id]); })
      .concat(p.nodes.filter(function (id) { return meta.nodes[id].cl !== cid; }).map(function (id) { return ext(s, meta, id); }));
    own.forEach(function (a) { others.forEach(function (b) { if (gap(a, b) < GAP) n++; }); });
    return n;
  }

  function fill(s, meta) {
    s.clusters = s.clusters || {}; s.nodes = s.nodes || {}; s.edges = s.edges || {};
    meta.edges.forEach(function (e) { if (!s.edges[e.k]) s.edges[e.k] = e.fw ? { firewall: true } : {}; });
    var cids = Object.keys(meta.clusters), nids = Object.keys(meta.nodes);
    var missing = nids.filter(function (id) { return !s.nodes[id]; });
    if (!missing.length && cids.every(function (id) { return s.clusters[id]; })) return s;
    function kids(cid) { return missing.filter(function (id) { return meta.nodes[id].cl === cid; }); }

    // A missing region around already placed servers starts as their bounding box.
    cids.forEach(function (cid) {
      if (s.clusters[cid]) return;
      var have = placed(s, meta).nodes.filter(function (id) { return meta.nodes[id].cl === cid; });
      if (!have.length) return;
      var u = union(have.map(function (id) { return ext(s, meta, id); }));
      s.clusters[cid] = { x: u.x0 - PAD, y: u.y0 - TOP, w: u.x1 - u.x0 + 2 * PAD, h: u.y1 - u.y0 + TOP + PAD, title: [r1((u.x0 + u.x1) / 2), u.y0 - TOP + 20] };
    });

    // Missing servers of a placed region: a grid below its servers or right of them, whichever clashes less (ties: below).
    cids.forEach(function (cid) {
      var c = s.clusters[cid], ids = kids(cid);
      if (!c || !ids.length) return;
      var have = placed(s, meta).nodes.filter(function (id) { return meta.nodes[id].cl === cid; });
      var u = union(have.map(function (id) { return ext(s, meta, id); }));
      var spots = u ? [[c.x + PAD, u.y1 + GAP], [u.x1 + GAP, c.y + TOP]] : [[c.x + PAD, c.y + TOP]], best = null;
      spots.forEach(function (p) {
        var t = dup(s);
        grid(t, meta, ids, p[0], p[1]);
        geometry.fitRegion(t, meta, cid);
        var n = clashes(t, meta, cid, ids);
        if (!best || n < best.n) best = { n: n, t: t };
      });
      ids.forEach(function (id) { s.nodes[id] = best.t.nodes[id]; });
      s.clusters[cid] = best.t.clusters[cid];
    });

    // New regions in rows below the existing content, then standalone servers in a final row.
    var b = bounds(s, meta), x0 = b ? b.x0 : ORIGIN, y = b ? b.y1 + RGAP : ORIGIN, x = x0, rowH = 0;
    function slot(w, h) {
      if (x > x0 && x + w > x0 + MAXW) { y += rowH + RGAP; x = x0; rowH = 0; }
      var at = [x, y];
      x += w + RGAP; rowH = Math.max(rowH, h);
      return at;
    }
    cids.forEach(function (cid) {
      if (s.clusters[cid]) return;
      var ids = kids(cid), z = regionSize(meta, cid, ids), at = slot(z.w, z.h);
      if (ids.length) grid(s, meta, ids, at[0] + PAD, at[1] + TOP);
      s.clusters[cid] = { x: at[0], y: at[1], w: z.w, h: z.h, title: [r1(at[0] + z.w / 2), at[1] + 20] };
    });
    if (rowH) { y += rowH + RGAP; x = x0; rowH = 0; }
    missing.filter(function (id) { return !meta.nodes[id].cl; }).forEach(function (id) {
      var z = size(meta.nodes[id]), at = slot(z.w, z.h + HEAD);
      s.nodes[id] = box(meta.nodes[id], at[0], at[1]);
    });
    return s;
  }

  return { fill: fill };
}
