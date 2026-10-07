InfraDiagram.define("ui/legend", ["ui/core", "ui/skins", "ui/networks"], function (core, skins, networks) {
  var D = core.D, svg = core.svg, ctx = core.ctx, esc = core.esc, $ = core.$;

  function applyToggles() {
    core.ents.forEach(function (el) {
      var tk = el.getAttribute("data-tk");
      if (tk === null) return;
      var off = tk.split(" ").some(function (k) { return ctx.hidden[k]; });
      el.classList.toggle("off", off);
    });
    [].forEach.call(document.querySelectorAll("#lb .sw[data-k]"), function (b) {
      b.setAttribute("aria-checked", ctx.hidden[b.getAttribute("data-k")] ? "false" : "true");
    });
  }
  function loadToggles() {
    try { JSON.parse(core.lsGet("types") || "[]").forEach(function (k) { ctx.hidden[k] = true; }); } catch (e) {}
  }
  function saveToggles() { core.lsSet("types", JSON.stringify(Object.keys(ctx.hidden).filter(function (k) { return ctx.hidden[k]; }))); }
  function toggle(k, force) {
    ctx.hidden[k] = force === undefined ? !ctx.hidden[k] : !force;
    saveToggles();
    applyToggles();
  }
  function showAll() { ctx.hidden = {}; saveToggles(); applyToggles(); networks.setNet(null); }

  function buildLegend() {
    var lg = $("lg");
    function sw(t) {
      return '<button type="button" class="sw" role="switch" aria-checked="true" data-k="' + t.k + '" data-ty="' + t.ty + '"><span class="trk"></span><i class="' + (t.dash ? "dash" : "") + '"></i><span class="t">' + esc(t.label) + '</span></button>';
    }
    var ap = D.types.filter(function (t) { return !t.infra; }), inf = D.types.filter(function (t) { return t.infra; });
    lg.innerHTML = "<b>Server types</b>" + ap.map(sw).join("") + (inf.length ? "<b>Other infrastructure</b>" + inf.map(sw).join("") : "") + '<button type="button" class="reset">Show all</button>';
    lg.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".sw");
      if (b) { toggle(b.getAttribute("data-k")); return; }
      if (e.target.closest && e.target.closest(".reset")) showAll();
    });
    var lk = document.querySelector("#lp .lk");
    // Connection switches (levels "lv:server" / "lv:process", groups "g:<id>"): a connection shows only while all its switches are on.
    lk.insertAdjacentHTML("beforeend", (D.edgeSwitches || []).map(function (g) {
      return '<button type="button" class="sw es" role="switch" aria-checked="true" data-k="' + g.k + '"' + (g.g ? ' data-g="' + g.g + '"' : "") + '><span class="trk"></span><i class="ln"></i><span class="t">' + esc(g.label) + "</span></button>";
    }).join(""));
    lk.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".sw.es");
      if (b) toggle(b.getAttribute("data-k"));
    });
    lk.insertAdjacentHTML("beforeend", '<button type="button" id="lbl" class="sw" role="switch" aria-checked="false"><span class="trk"></span><span class="t">Connection labels</span></button>');
    $("lbl").addEventListener("click", function () { setLabels(!ctx.labels, true); });
    lk.insertAdjacentHTML("afterend", '<div class="lo"><b>Servers</b><button type="button" id="osv" class="sw" role="switch" aria-checked="false"><span class="trk"></span><span class="t">Display OS version</span></button></div>');
    $("osv").addEventListener("click", function () { setOs(!ctx.os, true); });
  }
  function setOs(on, persist) {
    ctx.os = on;
    svg.classList.toggle("showos", on);
    $("osv").setAttribute("aria-checked", on ? "true" : "false");
    if (persist) { core.lsSet("os", on ? "1" : "0"); skins.rebuildChrome(); }
  }
  function setLabels(on, persist) {
    ctx.labels = on;
    svg.classList.toggle("nolabels", !on);
    $("lbl").setAttribute("aria-checked", on ? "true" : "false");
    if (persist) { core.lsSet("labels", on ? "1" : "0"); skins.rebuildChrome(); }
  }

  // Builds the legend and restores the saved switches.
  function initLegend() {
    loadToggles();
    buildLegend();
    setLabels(core.lsGet("labels") === "1", false);
    setOs(core.lsGet("os") === "1", false);
    applyToggles();
  }

  return { initLegend: initLegend, toggle: toggle, showAll: showAll };
});
