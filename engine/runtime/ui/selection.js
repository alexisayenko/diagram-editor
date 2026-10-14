InfraDiagram.define("ui/selection", ["ui/core", "ui/details", "ui/panels", "ui/keys"], function (core, details, panels, keys) {
  var D = core.D, ctx = core.ctx;

  function related(key) {
    var B = {};
    B[key] = 1;
    var near = [key];
    D.edges.forEach(function (e) {
      if (e.from === key) { B[e.to] = 1; near.push(e.to); B[keys.nodeKey("edge", e.k)] = 1; }
      else if (e.to === key) { B[e.from] = 1; near.push(e.from); B[keys.nodeKey("edge", e.k)] = 1; }
    });
    near.forEach(function (k) {
      var pk = keys.parseKey(k);
      if (pk.kind === "region") (D.kids[pk.id] || []).forEach(function (n) { B[keys.nodeKey("server", n)] = 1; });
    });
    Object.keys(B).forEach(function (k) {
      if (keys.isKind(k, "server") && D.ent[k]?.cl) B[keys.nodeKey("region", D.ent[k].cl)] = 1;
    });
    return B;
  }

  function select(key) {
    if (core.services.beforeSelect?.(key) === false) return;
    ctx.sel = key;
    var B = key ? related(key) : null;
    core.ents.forEach(function (el) {
      var k = el.dataset.ent;
      el.classList.toggle("dim", !!B && !B[k]);
      el.classList.toggle("sel", !!B && k === key);
      if (el.getAttribute("tabindex") === "0") el.setAttribute("aria-pressed", String(!!B && k === key));
    });
    var pn = core.$("pn");
    if (key) { details.renderPanel(key); pn.hidden = false; }
    else pn.hidden = true;
    panels.placeChrome();
  }

  return { related: related, select: select };
});
