InfraDiagram.define("canvas/model", ["ui/core", "ui/skins", "canvas/geometry"], function (core, skins, geometry) {
  var D = core.D, svg = core.svg, els = core.els, ctx = core.ctx;
  var base = D.layout;
  // Shared canvas state: st is the draft layout, on is edit mode.
  var state = { st: clone(base), on: false };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function setXY(el, p) { el.setAttribute("x", p[0]); el.setAttribute("y", p[1]); }
  function setRect(el, g) { el.setAttribute("x", g.x); el.setAttribute("y", g.y); el.setAttribute("width", g.w); el.setAttribute("height", g.h); }
  function shift(p, dx, dy) { p[0] += dx; p[1] += dy; }

  function move(s, key, dx, dy) {
    var t = key.charAt(0), id = key.slice(2), g;
    if (t === "c") {
      g = s.clusters[id];
      g.x += dx; g.y += dy; shift(g.title, dx, dy);
    } else if (t === "n") {
      g = s.nodes[id];
      if (g.hidden) return;
      g.x += dx; g.y += dy;
      [g.title].concat(g.body, g.ip).forEach(function (p) { shift(p, dx, dy); });
    }
  }

  // A dragged server grows its region (from the drag-start size) so padding and header band hold.
  function apply(from, key, dx, dy) {
    var s = clone(from), id = key.slice(2), m = D.meta.nodes[id];
    move(s, key, dx, dy);
    if (key.charAt(0) === "c") (D.kids[id] || []).forEach(function (n) { move(s, "n:" + n, dx, dy); });
    else if (m && m.cl) geometry.fitRegion(s, D.meta, m.cl, from.clusters[m.cl], skins.widths());
    return s;
  }

  // Resizing a region moves its sides only; servers stay put and bound how far it can shrink.
  function resize(from, id, side, dx, dy) {
    var s = clone(from);
    geometry.resizeRegion(s, D.meta, id, side, dx, dy, skins.widths());
    return s;
  }

  var SIDES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"], HS = 8, RR = 14, handles = null;

  // Edit-mode resize handles: invisible hit bands along each region's outline (edge strips, stroked arcs on the rounded corners); only the cursor shows them.
  function syncHandles(s) {
    var NS = "http://www.w3.org/2000/svg";
    if (!handles) {
      handles = {};
      var layer = document.createElementNS(NS, "g");
      layer.setAttribute("id", "rh");
      Object.keys(D.idx.clusters).forEach(function (id) {
        handles[id] = SIDES.map(function (side) {
          var r = document.createElementNS(NS, side.length === 2 ? "path" : "rect");
          r.setAttribute("class", "rh rh-" + side);
          r.setAttribute("data-rc", id); r.setAttribute("data-rs", side);
          layer.appendChild(r);
          return r;
        });
      });
      svg.appendChild(layer);
    }
    Object.keys(handles).forEach(function (id) {
      var g = s.clusters[id], h = HS / 2, q = RR, r = g.x + g.w, b = g.y + g.h;
      var arcs = {
        nw: "M" + g.x + " " + (g.y + q) + "A" + q + " " + q + " 0 0 1 " + (g.x + q) + " " + g.y,
        ne: "M" + (r - q) + " " + g.y + "A" + q + " " + q + " 0 0 1 " + r + " " + (g.y + q),
        se: "M" + r + " " + (b - q) + "A" + q + " " + q + " 0 0 1 " + (r - q) + " " + b,
        sw: "M" + (g.x + q) + " " + b + "A" + q + " " + q + " 0 0 1 " + g.x + " " + (b - q) };
      var rects = { n: [g.x + q, g.y - h, g.w - 2 * q, HS], s: [g.x + q, b - h, g.w - 2 * q, HS],
        w: [g.x - h, g.y + q, HS, g.h - 2 * q], e: [r - h, g.y + q, HS, g.h - 2 * q] };
      handles[id].forEach(function (el, i) {
        var side = SIDES[i];
        if (arcs[side]) { el.setAttribute("d", arcs[side]); return; }
        var v = rects[side];
        el.setAttribute("x", v[0]); el.setAttribute("y", v[1]); el.setAttribute("width", Math.max(v[2], 0)); el.setAttribute("height", Math.max(v[3], 0));
      });
    });
  }

  function each(fn) {
    Object.keys(D.idx.clusters).forEach(function (id) {
      var e = D.idx.clusters[id];
      fn("c:" + id, [e[0], e[1], e[2]]);
    });
    Object.keys(D.idx.nodes).forEach(function (id) {
      var e = D.idx.nodes[id];
      fn("n:" + id, [e.c, e.t, e.r].concat(e.b, e.i, e.o === undefined ? [] : [e.o]));
    });
  }

  // Connections re-routed from the current geometry (measured box and label widths); kept in ctx.routes for skins.sync.
  function routeEdges(s) {
    var rt = geometry.route(s, D.meta, { w: skins.widths(), lw: skins.labelWidths() });
    ctx.routes = rt;
    Object.keys(D.idx.edges).forEach(function (k) {
      var e = D.idx.edges[k], r = rt[k];
      if (!r) return;
      els[e.p].setAttribute("d", r.d);
      if (e.l >= 0 && r.label) setXY(els[e.l], r.label);
      if (e.fw !== undefined && r.fw) {
        var fg = els[e.fw], ft = fg.querySelector("text"), tr = "translate(" + r.fw.at.join(" ") + ") rotate(" + r.fw.a + ")";
        [].forEach.call(fg.querySelectorAll("path"), function (p) { p.setAttribute("transform", tr); });
        setXY(ft, r.fw.label);
        ft.setAttribute("text-anchor", r.fw.anchor);
      }
    });
  }

  // Edit mode: red outline on servers and regions that break the spacing rules.
  function markBad(s) {
    var bad = state.on ? geometry.problems(s, D.meta, skins.widths()) : {};
    Object.keys(D.idx.nodes).forEach(function (id) {
      var e = D.idx.nodes[id], on = !!bad["n:" + id];
      els[e.r].classList.toggle("bad", on);
      els[e.c].classList.toggle("bad", on);
    });
    Object.keys(D.idx.clusters).forEach(function (id) { els[D.idx.clusters[id][0]].classList.toggle("bad", !!bad["c:" + id]); });
  }

  function render(s) {
    Object.keys(D.idx.clusters).forEach(function (id) {
      var e = D.idx.clusters[id], g = s.clusters[id];
      setRect(els[e[0]], g); setXY(els[e[1]], g.title);
    });
    Object.keys(D.idx.nodes).forEach(function (id) {
      var e = D.idx.nodes[id], g = s.nodes[id];
      setXY(els[e.t], g.title); setRect(els[e.r], g);
      e.b.forEach(function (i, k) { setXY(els[i], g.body[k]); });
      e.i.forEach(function (i, k) { setXY(els[i], g.ip[k]); });
    });
    routeEdges(s);
    markBad(s);
    syncHandles(s);
    skins.sync(s);
  }

  core.hooks.route = function () {
    var s = core.hooks.getState && core.hooks.getState();
    if (s) { routeEdges(s); markBad(s); }
  };

  function point(e) {
    var p = svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    var m = svg.getScreenCTM();
    return m ? p.matrixTransform(m.inverse()) : p;
  }

  function regionAt(s, p) {
    var best = null, area = Infinity;
    Object.keys(s.clusters).forEach(function (id) {
      var c = s.clusters[id];
      if (p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h && c.w * c.h < area) { best = id; area = c.w * c.h; }
    });
    return best;
  }

  return { base: base, state: state, clone: clone, apply: apply, resize: resize, each: each, render: render, point: point, regionAt: regionAt };
});
