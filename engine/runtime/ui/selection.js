InfraDiagram.define("ui/selection", ["ui/core", "ui/details", "ui/panels"], function (core, details, panels) {
  var D = core.D, ctx = core.ctx;

  function related(key) {
    var B = {};
    B[key] = 1;
    var near = [key];
    D.edges.forEach(function (e) {
      if (e.from === key) { B[e.to] = 1; near.push(e.to); B["e:" + e.k] = 1; }
      else if (e.to === key) { B[e.from] = 1; near.push(e.from); B["e:" + e.k] = 1; }
    });
    near.forEach(function (k) {
      if (k.charAt(0) === "c") (D.kids[k.slice(2)] || []).forEach(function (n) { B["n:" + n] = 1; });
    });
    Object.keys(B).forEach(function (k) {
      if (k.charAt(0) === "n" && D.ent[k] && D.ent[k].cl) B["c:" + D.ent[k].cl] = 1;
    });
    return B;
  }

  function select(key) {
    if (core.hooks.beforeSelect && core.hooks.beforeSelect(key) === false) return;
    ctx.sel = key;
    var B = key ? related(key) : null;
    core.ents.forEach(function (el) {
      var k = el.getAttribute("data-ent");
      el.classList.toggle("dim", !!B && !B[k]);
      el.classList.toggle("sel", !!B && k === key);
    });
    var pn = core.$("pn");
    if (key) { details.renderPanel(key); pn.hidden = false; }
    else pn.hidden = true;
    panels.placeChrome();
  }

  return { related: related, select: select };
});
