InfraDiagram.define("ui/init", ["ui/core", "ui/details", "ui/skins", "ui/networks", "ui/legend", "ui/panels", "ui/selection", "ui/copy", "ui/export-image"], function (core, details, skins, networks, legend, panels, selection, copy, exportImage) {
  const { D, svg, els, ctx, hooks, STYLES, $ } = core;

  function ipText(tg, id) {
    return els[D.idx.nodes[id].i[+tg.dataset.i]].textContent;
  }

  function onSvgClick(e) {
    if (hooks.isEdit()) return;
    const tg = e.target, nb = tg.closest?.(".nwb");
    if (nb) { networks.toggleNet(+nb.dataset.n); return; }
    const t = tg.closest?.("[data-ent]");
    const k = t?.dataset.ent;
    if (!k || (k.charAt(0) !== "n" && k.charAt(0) !== "c")) { selection.select(null); return; }
    const cl = tg.classList, id = k.slice(2);
    if (k.charAt(0) === "n" && (cl.contains("nb") || cl.contains("ni") || cl.contains("ip"))) {
      const txt = cl.contains("ip") ? ipText(tg, id) : tg.textContent;
      copy.copyText(txt, e.clientX, e.clientY);
      return;
    }
    if (cl.contains("nt") || cl.contains("ct") || t.classList.contains("osg")) { selection.select(k); return; }
    if (k.charAt(0) === "n" && t.classList.contains("ch")) {
      const m = svg.getScreenCTM(), y = m ? (e.clientY - m.f) / m.d : 0;
      if (y < hooks.getState().nodes[id].y) selection.select(k);
    }
  }

  function onPanelClick(e) {
    if (e.target.id === "pc") { selection.select(null); return; }
    const nb = e.target.closest?.(".nwd");
    if (nb) networks.toggleNet(+nb.dataset.n);
  }

  function onSvgKeydown(e) {
    const nb = e.target.closest?.(".nwb");
    if (!nb || hooks.isEdit() || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    networks.toggleNet(+nb.dataset.n);
  }

  function onEscape(e) {
    if (e.key !== "Escape") return;
    if (ctx.sel) selection.select(null);
    if (ctx.net !== null) networks.setNet(null);
  }

  function onFontsReady() {
    if (ctx.style === "sketch") return;
    skins.rebuildChrome();
    if (hooks.fit) hooks.fit();
  }

  // o: { getState, isEdit, fit } from the canvas.
  function init(o) {
    hooks.getState = o.getState;
    hooks.isEdit = o.isEdit;
    hooks.fit = o.fit;
    ctx.ready = true;
    legend.initLegend();
    networks.initNetworks();
    panels.initPanels();
    const q = /[?&]style=(\w+)/.exec(location.search)?.[1];
    const s = STYLES.includes(q) ? q : core.lsGet("style");
    skins.setStyle(STYLES.includes(s) ? s : "clean", false);
    document.querySelectorAll("#ss button").forEach(function (b) {
      b.addEventListener("click", function () { skins.setStyle(b.dataset.s, true); });
    });
    $("xs").addEventListener("click", exportImage.downloadSvg);
    $("xp").addEventListener("click", exportImage.downloadPng);
    $("pn").addEventListener("click", onPanelClick);
    svg.addEventListener("keydown", onSvgKeydown);
    svg.addEventListener("click", onSvgClick);
    document.addEventListener("keydown", onEscape);
    document.fonts?.ready?.then(onFontsReady).catch(() => null);
  }
  function editChanged(flag) { if (flag && ctx.ready) { selection.select(null); networks.setNet(null); } }

  // Console / automation API, e.g. InfraDiagram.setStyle("dark").
  const api = {
    setStyle: skins.setStyle, toggle: legend.toggle, showAll: legend.showAll, select: selection.select,
    exportSvg: exportImage.exportSvg, md: details.md, related: selection.related, ctx: ctx, setNet: networks.setNet
  };
  Object.keys(api).forEach(function (k) { InfraDiagram[k] = api[k]; });

  return { init: init, editChanged: editChanged };
});
