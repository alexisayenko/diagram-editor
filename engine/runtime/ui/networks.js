InfraDiagram.define("ui/networks", ["ui/core", "ui/panels"], function (core, panels) {
  var D = core.D, ctx = core.ctx, $ = core.$;

  function initNetworks() {
    var wl = $("wl");
    if (!wl || !D.nets) return;
    wl.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".nw");
      if (b) setNet(ctx.net === +b.getAttribute("data-n") ? null : +b.getAttribute("data-n"));
    });
    $("wr").addEventListener("click", function () { setNet(null); });
  }
  function setNet(i) {
    if (!D.nets) return;
    ctx.net = i === null || i === undefined ? null : i;
    var M = null;
    if (ctx.net !== null) {
      M = {};
      D.nets[ctx.net].m.forEach(function (k) { M[k] = 1; });
      D.edges.forEach(function (e) { if (M[e.from] && M[e.to]) M["e:" + e.k] = 1; });
    }
    core.ents.forEach(function (el) { el.classList.toggle("nf", !!M && !M[el.getAttribute("data-ent")]); });
    [].forEach.call(document.querySelectorAll("#wl .nw, .nwb, .nwd"), function (b) {
      var on = +b.getAttribute("data-n") === ctx.net;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.classList.toggle("on", on);
    });
  }
  // Network button: activates network i and reveals it in the Networks panel; clears when i is already active.
  function toggleNet(i) {
    if (!D.nets || !D.nets[i]) return;
    if (ctx.net === i) { setNet(null); return; }
    setNet(i);
    if ($("wh").getAttribute("aria-expanded") !== "true") panels.setPanel("wp", true, false);
    var b = document.querySelector('#wl .nw[data-n="' + i + '"]');
    if (b) b.scrollIntoView({ block: "nearest" });
  }

  return { initNetworks: initNetworks, setNet: setNet, toggleNet: toggleNet };
});
