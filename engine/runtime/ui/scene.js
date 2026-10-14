function netIdentity(net) { return net ? [net.cidr || "", net.name || ""] : null; }

function findNet(nets, id) {
  if (!id || !nets) return null;
  var byCidr = id[0] ? nets.findIndex(function (n) { return n.cidr === id[0]; }) : -1;
  var i = byCidr >= 0 ? byCidr : nets.findIndex(function (n) { return !n.cidr && n.name === id[1]; });
  return i >= 0 ? i : null;
}

var TEXTS = ["title", "cssSvg", "viewBox", "svg", "legendKey", "notes", "docs", "data"];

function malformed(scene) {
  if (!scene || typeof scene !== "object") return "no scene";
  var ok = TEXTS.every(function (k) { return typeof scene[k] === "string"; }) && typeof scene.noteCount === "number" && (scene.nets === null || typeof scene.nets === "string");
  return ok ? null : "the scene is incomplete";
}

InfraDiagram.define("ui/scene", ["ui/core", "ui/skins", "ui/legend", "ui/networks", "ui/selection", "ui/panels"], function ({ core, skins, legend, networks, selection, panels }) {
  var D = core.D, ctx = core.ctx, $ = core.$, hooks = core.services;
  var last = {};

  function changed(name, html) {
    var c = last[name] !== html;
    last[name] = html;
    return c;
  }

  function misfit(scene, data) {
    if (!ctx.ready) return "the page has not started yet";
    if (data.id !== D.id) return "the scene belongs to another diagram";
    if ((scene.nets === null) === !!$("wp")) return "the Networks panel appears or disappears";
    return null;
  }

  function panelsOf(scene) {
    var notes = changed("notes", scene.notes);
    if (notes) {
      $("nl").innerHTML = scene.notes;
      $("nh").textContent = "Notes (" + scene.noteCount + ")";
    }
    if (changed("docs", scene.docs)) $("dl").innerHTML = scene.docs;
    if (scene.nets !== null && changed("nets", scene.nets)) $("wl").innerHTML = scene.nets;
    return { notes: notes };
  }

  function apply(scene, data) {
    var sel = ctx.sel, net = ctx.net === null ? null : netIdentity(D.nets?.[ctx.net]);
    core.replaceScene(data, scene.svg);
    document.title = scene.title;
    $("css-svg").textContent = scene.cssSvg;
    var what = panelsOf(scene);
    legend.refreshLegend(scene.legendKey);
    ctx.net = findNet(D.nets, net);
    if (net !== null) networks.setNet(ctx.net);
    core.emit("scene", scene, what);
    ctx.sel = null;
    skins.setStyle(ctx.style, false, true);
    hooks.rerender();
    if (ctx.style !== "sketch") hooks.fit();
    selection.restore(sel);
    panels.placeChrome();
  }

  // Replaces the diagram, its data and the panels' contents in place; zoom, selection, edit mode, the drawing tool and unsaved edits stay.
  // Returns { ok: true }, or { ok: false, reason } when the scene does not fit this page (nothing changed) or the swap failed half way (the caller reloads the page).
  function replaceScene(scene) {
    try {
      var reason = malformed(scene);
      var data = reason ? null : JSON.parse(scene.data);
      reason = reason || misfit(scene, data);
      if (reason) return { ok: false, reason: reason };
      apply(scene, data);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: String(e?.message ?? e) };
    }
  }

  InfraDiagram.replaceScene = replaceScene;

  return { replaceScene: replaceScene };
});
