InfraDiagram.define("ui/init", ["ui/core", "ui/details", "ui/skins", "ui/networks", "ui/legend", "ui/panels", "ui/selection", "ui/copy", "ui/export-image"], function (core, details, skins, networks, legend, panels, selection, copy, exportImage) {
  var D = core.D, svg = core.svg, els = core.els, ctx = core.ctx, hooks = core.hooks, STYLES = core.STYLES, $ = core.$;

  // o: { getState, isEdit, fit } from the canvas.
  function init(o) {
    hooks.getState = o.getState;
    hooks.isEdit = o.isEdit;
    hooks.fit = o.fit;
    ctx.ready = true;
    legend.initLegend();
    networks.initNetworks();
    panels.initPanels();
    var q = (location.search.match(/[?&]style=(\w+)/) || [])[1];
    var s = STYLES.indexOf(q) >= 0 ? q : core.lsGet("style");
    skins.setStyle(STYLES.indexOf(s) >= 0 ? s : "clean", false);
    [].forEach.call(document.querySelectorAll("#ss button"), function (b) {
      b.addEventListener("click", function () { skins.setStyle(b.getAttribute("data-s"), true); });
    });
    $("xs").addEventListener("click", exportImage.downloadSvg);
    $("xp").addEventListener("click", exportImage.downloadPng);
    $("pn").addEventListener("click", function (e) {
      if (e.target.id === "pc") { selection.select(null); return; }
      var nb = e.target.closest && e.target.closest(".nwd");
      if (nb) networks.toggleNet(+nb.getAttribute("data-n"));
    });
    svg.addEventListener("keydown", function (e) {
      var nb = e.target.closest && e.target.closest(".nwb");
      if (!nb || hooks.isEdit() || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      networks.toggleNet(+nb.getAttribute("data-n"));
    });
    svg.addEventListener("click", function (e) {
      if (hooks.isEdit()) return;
      var tg = e.target, nb = tg.closest && tg.closest(".nwb");
      if (nb) { networks.toggleNet(+nb.getAttribute("data-n")); return; }
      var t = tg.closest && tg.closest("[data-ent]");
      var k = t && t.getAttribute("data-ent");
      if (!k || (k.charAt(0) !== "n" && k.charAt(0) !== "c")) { selection.select(null); return; }
      var cl = tg.classList, id = k.slice(2);
      if (k.charAt(0) === "n" && (cl.contains("nb") || cl.contains("ni") || cl.contains("ip"))) {
        var txt = cl.contains("ip") ? els[D.idx.nodes[id].i[+tg.getAttribute("data-i")]].textContent : tg.textContent;
        copy.copyText(txt, e.clientX, e.clientY);
        return;
      }
      if (cl.contains("nt") || cl.contains("ct") || t.classList.contains("osg")) { selection.select(k); return; }
      if (k.charAt(0) === "n" && t.classList.contains("ch")) {
        var m = svg.getScreenCTM(), y = m ? (e.clientY - m.f) / m.d : 0;
        if (y < hooks.getState().nodes[id].y) { selection.select(k); return; }
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (ctx.sel) selection.select(null);
      if (ctx.net !== null) networks.setNet(null);
    });
    try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (ctx.style !== "sketch") { skins.rebuildChrome(); if (hooks.fit) hooks.fit(); } }); } catch (e) {}
  }
  function editChanged(flag) { if (flag && ctx.ready) { selection.select(null); networks.setNet(null); } }

  // Console / automation API, e.g. InfraDiagram.setStyle("dark").
  var api = {
    setStyle: skins.setStyle, toggle: legend.toggle, showAll: legend.showAll, select: selection.select,
    exportSvg: exportImage.exportSvg, md: details.md, related: selection.related, ctx: ctx, setNet: networks.setNet
  };
  Object.keys(api).forEach(function (k) { InfraDiagram[k] = api[k]; });

  return { init: init, editChanged: editChanged };
});
