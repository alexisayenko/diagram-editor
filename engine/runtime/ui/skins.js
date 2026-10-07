InfraDiagram.define("ui/skins", ["ui/core", "ui/details"], function (core, details) {
  var D = core.D, svg = core.svg, els = core.els, ctx = core.ctx, CW = core.CW, STYLES = core.STYLES, hooks = core.hooks;
  var pillW = {}, boxW = {}, btn = {};

  function measure(el, n, cw) {
    var w = 0;
    try { w = el.getComputedTextLength(); } catch (e) {}
    return w > 0 ? w : n * cw;
  }
  function icon(kind) {
    if (kind === "db") return '<ellipse cx="8" cy="3.5" rx="6" ry="2.5"/><path d="M2 3.5V12.5C2 15 14 15 14 12.5V3.5M2 8C2 10.5 14 10.5 14 8"/>';
    return '<rect x="1" y="1" width="14" height="6" rx="1.5"/><rect x="1" y="9" width="14" height="6" rx="1.5"/><path d="M4 4h.01M4 12h.01"/>';
  }

  function nodeChrome(id) {
    var S = ctx.style, g = D.layout.nodes[id], e = D.ent["n:" + id], ix = D.idx.nodes[id];
    var tl = g.title[0] - g.x;
    var tw = measure(els[ix.t], e.title.length, CW[S]);
    var bottom = g.h;
    var ipw = g.ip.map(function (p, k) {
      bottom = Math.max(bottom, p[1] - g.y + 7);
      return measure(els[ix.i[k]], 14, CW[S]);
    });
    var W = Math.max(g.w, tl + tw + 28), HH = 20;
    boxW[id] = W;
    var h = "";
    if (S === "clean") {
      h = '<rect class="cd" x="0" y="-' + HH + '" width="' + W + '" height="' + (bottom + HH) + '" rx="10"/><path class="hd" d="M0 0V-10Q0 -20 10 -20H' + (W - 10) + "Q" + W + " -20 " + W + ' -10V0Z"/>';
    } else if (S === "dark") {
      h = '<rect class="cd" x="0" y="-' + HH + '" width="' + W + '" height="' + (bottom + HH) + '" rx="5"/><rect class="hd" x="0" y="-' + HH + '" width="' + W + '" height="' + HH + '"/><rect class="ab" x="0" y="-' + HH + '" width="3" height="' + HH + '"/>';
    } else {
      h = '<rect class="cd" x="0" y="-' + HH + '" width="' + W + '" height="' + (bottom + HH) + '"/><rect class="ab" x="0" y="-' + HH + '" width="' + W + '" height="3"/><path class="sep" d="M0 0H' + W + '"/>';
    }
    h += '<g class="ic" transform="translate(' + (W - 17) + ' -16) scale(.75)">' + icon(e.db ? "db" : "server") + "</g>";
    g.ip.forEach(function (p, k) {
      var w = Math.round(ipw[k] + 10);
      h += '<rect class="ip" data-i="' + k + '" x="' + (p[0] - g.x - 5) + '" y="' + (p[1] - g.y - 11) + '" width="' + w + '" height="15" rx="' + (S === "clean" ? 8 : S === "dark" ? 3 : 0) + '"/>';
    });
    return h;
  }

  function rebuildChrome() {
    boxW = {};
    btn = {};
    Object.keys(D.idx.nodes).forEach(function (id) {
      var ix = D.idx.nodes[id];
      els[ix.c].innerHTML = ctx.style === "sketch" ? "" : nodeChrome(id);
      if (!ix.w.some(function (w) { return w >= 0; })) return;
      btn[id] = { W: boxW[id] || D.layout.nodes[id].w, tw: ix.i.map(function (i) { return measure(els[i], 14, CW[ctx.style]); }) };
    });
    Object.keys(D.idx.clusters).forEach(function (id) {
      els[D.idx.clusters[id][2]].innerHTML = "";
    });
    Object.keys(D.idx.nodes).forEach(function (id) {
      var o = D.idx.nodes[id].o;
      if (o === undefined) return;
      var t = els[o].querySelector("text"), r = els[o].querySelector("rect");
      r.setAttribute("width", Math.round(measure(t, t.textContent.length, ctx.style === "sketch" ? 5.6 : 5.2) + 8));
      r.setAttribute("rx", ctx.style === "clean" ? 6 : ctx.style === "dark" ? 3 : ctx.style === "sketch" ? 2 : 0);
    });
    pillW = {};
    Object.keys(D.idx.edges).forEach(function (k) {
      var e = D.idx.edges[k];
      if (e.l < 0) return;
      var s = ctx.style, t = els[e.l];
      pillW[k] = Math.round(measure(t, t.textContent.length, CW[s] * (s === "swiss" ? 1.05 : 1)) + 14);
    });
    if (hooks.route) hooks.route();
    sync(hooks.getState());
  }

  // OS pill: 12px high, left-aligned with the IP pills, 3px above the first one; hidden if it would touch a body line.
  function placeOs(id, g) {
    var o = D.idx.nodes[id].o;
    if (o === undefined) return;
    var ys = function (a) { return a.map(function (p) { return p[1]; }); };
    var top = g.ip.length ? Math.min.apply(null, ys(g.ip)) - g.y - 11 : g.h - 3;
    var floor = g.body.length ? Math.max.apply(null, ys(g.body)) - g.y + 4 : 2;
    var lx = g.ip.length ? g.ip[0][0] : g.body.length ? g.body[0][0] : g.title[0];
    var y = top - 3 - 12, fits = y >= floor + 1;
    els[o].setAttribute("transform", "translate(" + (lx - 5) + " " + (g.y + y) + ")");
    els[o].setAttribute("visibility", fits ? "visible" : "hidden");
  }

  // Network button: 14x13, 2px right of the IP pill (Sketch: 4px right of the IP text), 1px inside the box.
  // Too narrow a box pulls it left over the pill's padding ("tight"); if it would cover the IP text it is hidden.
  function placeNetButtons(id, g) {
    var b = btn[id];
    if (!b) return;
    D.idx.nodes[id].w.forEach(function (wi, k) {
      if (wi < 0) return;
      var p = g.ip[k], end = p[0] + b.tw[k], lim = Math.floor(g.x + b.W - 15);
      var want = Math.round(end + (ctx.style === "sketch" ? 4 : 7)), x = Math.min(want, lim);
      els[wi].setAttribute("transform", "translate(" + x + " " + (p[1] - 10) + ")");
      els[wi].classList.toggle("tight", want > lim);
      els[wi].setAttribute("visibility", end - x <= 1 ? "visible" : "hidden");
    });
  }

  function sync(s) {
    if (!ctx.ready || !s) return;
    Object.keys(D.idx.nodes).forEach(function (id) {
      var g = s.nodes[id];
      els[D.idx.nodes[id].c].setAttribute("transform", "translate(" + g.x + " " + g.y + ")");
      placeOs(id, g);
      placeNetButtons(id, g);
    });
    Object.keys(D.idx.clusters).forEach(function (id) {
      var g = s.clusters[id];
      els[D.idx.clusters[id][2]].setAttribute("transform", "translate(" + g.x + " " + g.y + ")");
    });
    Object.keys(D.idx.edges).forEach(function (k) {
      var e = D.idx.edges[k];
      if (e.l < 0) return;
      var p = els[e.lp], r = ctx.routes && ctx.routes[k], l = r && r.label;
      if (!l) return;
      p.setAttribute("x", l[0] - 7);
      p.setAttribute("y", l[1] - 12);
      p.setAttribute("width", pillW[k] || 60);
      p.setAttribute("height", 17);
    });
  }

  function setStyle(s, persist) {
    if (STYLES.indexOf(s) < 0) s = "clean";
    ctx.style = s;
    document.documentElement.setAttribute("data-style", s);
    STYLES.forEach(function (x) { svg.classList.remove("s-" + x); });
    svg.classList.add("s-" + s);
    [].forEach.call(document.querySelectorAll(".lks"), function (k) {
      STYLES.forEach(function (x) { k.classList.remove("s-" + x); });
      k.classList.add("s-" + s);
    });
    [].forEach.call(document.querySelectorAll("#ss button"), function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-s") === s ? "true" : "false");
    });
    rebuildChrome();
    if (hooks.fit && s !== "sketch") hooks.fit();
    if (persist) {
      core.lsSet("style", s);
      try {
        if (/[?&]style=/.test(location.search)) {
          var u = new URL(location.href);
          u.searchParams.set("style", s);
          history.replaceState(null, "", u.toString());
        }
      } catch (e) {}
    }
    if (ctx.sel) details.renderPanel(ctx.sel);
  }

  // Measured box widths (none in Sketch) and label pill widths, for connection routing.
  function widths() { return boxW; }
  function labelWidths() { return pillW; }

  return { rebuildChrome: rebuildChrome, sync: sync, setStyle: setStyle, widths: widths, labelWidths: labelWidths };
});
