InfraDiagram.define("ui/networks", ["ui/core", "ui/panels"], function (core, panels) {
  var D = core.D, ctx = core.ctx, $ = core.$;

  function initNetworks() {
    var wl = $("wl");
    if (!wl || !D.nets) return;
    wl.addEventListener("click", function (e) {
      var b = e.target.closest?.(".nw");
      if (b) setNet(ctx.net === +b.dataset.n ? null : +b.dataset.n);
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
    core.ents.forEach(function (el) { el.classList.toggle("nf", !!M && !M[el.dataset.ent]); });
    document.querySelectorAll("#wl .nw, .nwb, .nwd").forEach(function (b) {
      var on = +b.dataset.n === ctx.net;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.classList.toggle("on", on);
    });
  }
  // Network button: activates network i and reveals it in the Networks panel; clears when i is already active.
  function toggleNet(i) {
    if (!D.nets?.[i]) return;
    if (ctx.net === i) { setNet(null); return; }
    setNet(i);
    if ($("wh").getAttribute("aria-expanded") !== "true") panels.setPanel("wp", true, false);
    var b = document.querySelector('#wl .nw[data-n="' + i + '"]');
    if (b) b.scrollIntoView({ block: "nearest" });
  }

  // Inline name editor on a network entry (edit mode, via the context menu): Enter or blur commits, Esc cancels; empty removes the name.
  function editName(i) {
    var net = D.nets?.[i], b = document.querySelector('#wl .nw[data-n="' + i + '"]'), api = window.InfraDiagram.serverEditor;
    if (!net?.cidr || !b || !api?.renameNetwork || b.querySelector(".nwe")) return;
    var label = b.firstElementChild, saved = label.innerHTML, input = document.createElement("input"), done = false;
    while (label.lastChild?.nodeType === 3) label.lastChild.remove();
    input.type = "text"; input.className = "nwe"; input.maxLength = 80; input.value = net.name || "";
    input.setAttribute("aria-label", "Network name for " + net.cidr);
    function finish(commit) {
      if (done) return;
      done = true;
      var value = input.value.trim(), err = commit && value !== (net.name || "") ? api.renameNetwork(net.cidr, value) : null;
      label.innerHTML = saved;
      if (err) $("tm").textContent = err;
    }
    input.addEventListener("keydown", function (e) {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("click", function (e) { e.stopPropagation(); });
    input.addEventListener("blur", function () { finish(true); });
    label.appendChild(input);
    input.focus();
    input.select();
  }

  return { initNetworks: initNetworks, setNet: setNet, toggleNet: toggleNet, editName: editName };
});
