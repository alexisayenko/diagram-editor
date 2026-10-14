InfraDiagram.define("ui/skins", ["ui/core", "ui/details"], function (core, details) {
  var D = core.D, svg = core.svg, els = core.els, ctx = core.ctx, CW = core.CW, STYLES = core.STYLES, hooks = core.services;
  var pillW = {}, boxW = {}, btn = {}, TEXT_X = 10;

  function measure(el, n, cw) {
    var w = 0;
    try { w = el.getComputedTextLength(); } catch (e) {}
    return w > 0 ? w : n * cw;
  }
  function icon(kind) {
    if (kind === "db") return '<ellipse cx="8" cy="3.5" rx="6" ry="2.5"/><path d="M2 3.5V12.5C2 15 14 15 14 12.5V3.5M2 8C2 10.5 14 10.5 14 8"/>';
    return '<rect x="1" y="1" width="14" height="6" rx="1.5"/><rect x="1" y="9" width="14" height="6" rx="1.5"/><path d="M4 4h.01M4 12h.01"/>';
  }

  // Card meta with the system information (OS pill, hardware strip) removed while it is switched off.
  function sysMeta(m) { return ctx.sys ? m : { ...m, hw: "", os: 0 }; }
  function frameHtml(S, W, bottom, HH) {
    if (S === "clean") {
      return '<rect class="cd" x="0" y="-' + HH + '" width="' + W + '" height="' + (bottom + HH) + '" rx="10"/><path class="hd" d="M0 0V-10Q0 -20 10 -20H' + (W - 10) + "Q" + W + " -20 " + W + ' -10V0Z"/>';
    }
    if (S === "dark") {
      return '<rect class="cd" x="0" y="-' + HH + '" width="' + W + '" height="' + (bottom + HH) + '" rx="5"/><rect class="hd" x="0" y="-' + HH + '" width="' + W + '" height="' + HH + '"/><rect class="ab" x="0" y="-' + HH + '" width="3" height="' + HH + '"/>';
    }
    return '<rect class="cd" x="0" y="-' + HH + '" width="' + W + '" height="' + (bottom + HH) + '"/><rect class="ab" x="0" y="-' + HH + '" width="' + W + '" height="3"/><path class="sep" d="M0 0H' + W + '"/>';
  }
  function dividerHtml(y, W) { return '<path class="dv" d="M8 ' + y + "H" + (W - 8) + '"/>'; }
  function nodeDividers(m, g, nb, hwY, W) {
    var h = "", below = !!(m.hw || m.os || g.ip.length);
    if (m.nj && nb > m.nj) h += dividerHtml(8 + 16 * m.nj, W);
    if (nb && below) h += dividerHtml(8 + 16 * nb, W);
    if (m.hw && (m.os || g.ip.length)) h += dividerHtml(hwY + 6, W);
    if (m.os && g.ip.length) h += dividerHtml(g.ip[0][1] - g.y - 12.5, W);
    return h;
  }
  function ipPills(g, ipw, S) {
    return g.ip.map(function (p, k) {
      return '<rect class="ip" data-i="' + k + '" x="' + (p[0] - g.x - 5) + '" y="' + (p[1] - g.y - 11) + '" width="' + Math.round(ipw[k] + 10) + '" height="15" rx="' + ({ clean: 8, dark: 3 }[S] ?? 0) + '"/>';
    }).join("");
  }
  function nodeChrome(id) {
    var S = ctx.style, g = hooks.viewNode ? hooks.viewNode(id, D.layout.nodes[id]) : D.layout.nodes[id], e = D.ent["n:" + id], ix = D.idx.nodes[id];
    var tl = TEXT_X;
    var tw = measure(els[ix.t], els[ix.t].firstChild.textContent.length, CW[S]);
    var bottom = g.h;
    var ipw = g.ip.map(function (p, k) {
      bottom = Math.max(bottom, p[1] - g.y + 7);
      return measure(els[ix.i[k]], 14, CW[S]);
    });
    var W = Math.max(g.w, tl + tw + 28), HH = 20, m = sysMeta(D.meta.nodes[id] || {}), nb = g.body.length, hwY = 18 + 16 * nb;
    boxW[id] = W;
    var hwX = g.body.length ? g.body[0][0] - g.x : 10;
    var hw = m.hw ? '<text class="hw" x="' + hwX + '" y="' + hwY + '">' + core.esc(m.hw) + "</text>" : "";
    if (S === "sketch") { delete boxW[id]; return hw; }
    var h = frameHtml(S, W, bottom, HH);
    h += '<g class="ic" transform="translate(' + (W - 22.8) + ' -16.8) scale(.85)">' + icon(e.db ? "db" : "server") + "</g>";
    h += hw;
    h += nodeDividers(m, g, nb, hwY, W) + ipPills(g, ipw, S);
    return h;
  }

  // OS pill: icon, text, then the "EOL" marker after the pill; the text is cut with an ellipsis when pill and marker would not fit the box.
  function sizeOs(g, boxWidth) {
    var t = g.querySelector(".ost"), r = g.querySelector("rect"), e = g.querySelector(".ose"), full = t.getAttribute("data-t") || t.textContent;
    var cw = ctx.style === "sketch" ? 5.6 : 5.2, ew = e ? measure(e, 3, cw) + 4 : 0, room = boxWidth - 10 - 20 - ew;
    t.textContent = full;
    var tw = measure(t, full.length, cw);
    if (tw > room && room > 0) {
      t.textContent = full.slice(0, Math.max(2, Math.floor(full.length * room / tw) - 1)) + "…";
      tw = measure(t, t.textContent.length, cw);
    }
    var w = Math.round(tw + 20);
    r.setAttribute("width", w);
    r.setAttribute("rx", { clean: 6, dark: 3, sketch: 2 }[ctx.style] ?? 0);
    if (e) e.setAttribute("x", w + 4);
  }

  function rebuildChrome() {
    boxW = {};
    btn = {};
    Object.keys(D.idx.nodes).forEach(function (id) {
      var ix = D.idx.nodes[id];
      els[ix.c].innerHTML = nodeChrome(id);
      if (!ix.w.some(function (w) { return w >= 0; })) return;
      btn[id] = { W: boxW[id] || D.layout.nodes[id].w, tw: ix.i.map(function (i) { return measure(els[i], 14, CW[ctx.style]); }) };
    });
    Object.keys(D.idx.clusters).forEach(function (id) {
      els[D.idx.clusters[id][2]].innerHTML = "";
    });
    Object.keys(D.idx.nodes).forEach(function (id) {
      var o = D.idx.nodes[id].o;
      if (o === undefined) return;
      sizeOs(els[o], D.layout.nodes[id].w);
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
    var lx = g.title[0];
    if (g.ip.length) lx = g.ip[0][0];
    else if (g.body.length) lx = g.body[0][0];
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
    if (hooks.view) s = hooks.view(s);
    Object.keys(D.idx.nodes).forEach(function (id) {
      var g = s.nodes[id];
      els[D.idx.nodes[id].c].setAttribute("transform", "translate(" + g.x + " " + g.y + ")");
      if (hooks.title) { var ht = hooks.title(g, ctx.style), tx = els[D.idx.nodes[id].t]; tx.setAttribute("x", ht[0]); tx.setAttribute("y", ht[1]); }
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
      var p = els[e.lp], r = ctx.routes?.[k], l = r?.label;
      if (!l) return;
      p.setAttribute("x", l[0] - 7);
      p.setAttribute("y", l[1] - 12);
      p.setAttribute("width", pillW[k] || 60);
      p.setAttribute("height", 17);
    });
  }

  function setStyle(s, persist) {
    if (!STYLES.includes(s)) s = "clean";
    ctx.style = s;
    document.documentElement.dataset.style = s;
    STYLES.forEach(function (x) { svg.classList.remove("s-" + x); });
    svg.classList.add("s-" + s);
    document.querySelectorAll(".lks").forEach(function (k) {
      STYLES.forEach(function (x) { k.classList.remove("s-" + x); });
      k.classList.add("s-" + s);
    });
    document.querySelectorAll("#ss button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.s === s ? "true" : "false");
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
