InfraDiagram.define("ui/init", ["ui/core", "ui/details", "ui/skins", "ui/networks", "ui/legend", "ui/panels", "ui/selection", "ui/copy", "ui/export-image"], function (core, details, skins, networks, legend, panels, selection, copy, exportImage) {
  const { D, svg, els, ctx, STYLES, $ } = core, hooks = core.services;

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

  function focusKey(el) {
    const k = el?.getAttribute?.("tabindex") === "0" ? el.dataset?.ent : null;
    return k && (k.charAt(0) === "n" || k.charAt(0) === "c") ? k : null;
  }

  function onSvgKeydown(e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    const key = focusKey(e.target);
    if (key) { e.preventDefault(); selection.select(key); return; }
    const nb = e.target.closest?.(".nwb");
    if (!nb || hooks.isEdit()) return;
    e.preventDefault();
    networks.toggleNet(+nb.dataset.n);
  }

  function makeFocusable() {
    function mark(el, kind) {
      el.setAttribute("tabindex", "0");
      el.setAttribute("role", "button");
      el.setAttribute("aria-pressed", "false");
      el.setAttribute("aria-label", kind + " " + el.textContent);
    }
    Object.keys(D.idx.nodes).forEach(function (id) { mark(els[D.idx.nodes[id].t], "Server"); });
    Object.keys(D.idx.clusters).forEach(function (id) { mark(els[D.idx.clusters[id][1]], "Region"); });
  }

  function labelControls() {
    function name(id, attrs) {
      const el = $(id);
      if (el) Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    }
    name("ta", { role: "toolbar", "aria-label": "Diagram tools" });
    name("tx", { role: "group", "aria-label": "Layout editing" });
    name("tm", { role: "status", "aria-live": "polite" });
    name("dpo", { role: "group", "aria-label": "Pen options" });
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", "Diagram. Tab to a server or region, Enter selects it, Escape clears the selection.");
  }

  let ring = null, ringKey = null;
  function ringBox(key) {
    const s = hooks.getState?.();
    if (!s) return null;
    const id = key.slice(2);
    if (key.charAt(0) === "c") return s.clusters[id] || null;
    const g = s.nodes[id];
    return g && hooks.viewNode ? hooks.viewNode(id, g) : g || null;
  }
  function placeRing() {
    const g = ringKey && ringBox(ringKey);
    if (!g) { dropRing(); return; }
    if (!ring) {
      ring = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      ring.setAttribute("id", "fr");
      ring.setAttribute("rx", "8");
      ring.setAttribute("pointer-events", "none");
      svg.appendChild(ring);
    }
    ring.setAttribute("x", g.x - 4);
    ring.setAttribute("y", g.y - 4);
    ring.setAttribute("width", g.w + 8);
    ring.setAttribute("height", g.h + 8);
  }
  function dropRing() {
    ring?.remove();
    ring = null;
  }
  function keyboardFocused(el) {
    try { return el.matches(":focus-visible"); } catch (error_) { return true; }
  }
  function onFocusIn(e) {
    const key = focusKey(e.target);
    ringKey = key && keyboardFocused(e.target) ? key : null;
    if (ringKey) placeRing(); else dropRing();
  }
  function onFocusOut() {
    ringKey = null;
    dropRing();
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
    core.provide("getState", o.getState);
    core.provide("isEdit", o.isEdit);
    core.provide("fit", o.fit);
    ctx.ready = true;
    makeFocusable();
    labelControls();
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
    svg.addEventListener("focusin", onFocusIn);
    svg.addEventListener("focusout", onFocusOut);
    core.on("render", function () { if (ringKey) placeRing(); });
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
