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

  return { base: base, state: state, clone: clone, apply: apply, each: each, render: render, point: point };
});
