InfraDiagram.define("ui/panels", ["ui/core"], function (core) {
  var $ = core.$;
  var PANELS = { np: ["nh", "nl", "notes-collapsed"], dp: ["dh", "dl", "docs-collapsed"], lp: ["lh", "lb", "legend-collapsed"], wp: ["wh", "wb", "networks-collapsed"] };

  function isOpen(p) { return $(PANELS[p][0]).getAttribute("aria-expanded") === "true"; }
  function setPanel(p, open, persist) {
    var c = PANELS[p];
    $(c[0]).setAttribute("aria-expanded", open ? "true" : "false");
    $(c[1]).hidden = !open;
    if (persist) core.lsSet(c[2], open ? "0" : "1");
    placeChrome();
  }
  function placeChrome() {
    var np = $("rc"), lc = $("lc"), W = innerWidth, bottom = innerHeight - 8;
    if (!np || !lc) return;
    var top = Math.round($("ta").getBoundingClientRect().bottom + 8);
    document.documentElement.style.setProperty("--ta-b", top + "px");
    lc.style.top = top + "px";
    lc.style.maxHeight = Math.max(80, bottom - top) + "px";
    var nTop = top;
    if (W - 12 - np.offsetWidth < 8 + lc.offsetWidth + 8) nTop = Math.round(lc.getBoundingClientRect().bottom + 8);
    np.style.top = nTop + "px";
    np.style.maxHeight = Math.max(80, bottom - nTop) + "px";
  }
  function initPanels() {
    Object.keys(PANELS).forEach(function (p) {
      if (!$(p)) return;
      var saved = core.lsGet(PANELS[p][2]);
      setPanel(p, saved === null ? innerWidth >= 700 : saved !== "1", false);
      $(PANELS[p][0]).addEventListener("click", function () { setPanel(p, !isOpen(p), true); });
    });
    addEventListener("resize", placeChrome);
    try {
      var ro = new ResizeObserver(placeChrome);
      ro.observe($("ta"));
      ro.observe($("lc"));
    } catch (e) {}
  }

  return { placeChrome: placeChrome, initPanels: initPanels, setPanel: setPanel };
});
