InfraDiagram.define("ui/clear-click", ["ui/core", "ui/selection", "ui/networks"], function ({ core, selection, networks }) {
  var ctx = core.ctx, hooks = core.services, svg = core.svg;
  var BLOCK = "a,button,input,textarea,select,label,summary,[role=dialog],[role=menu],[role=menuitem],[contenteditable],.dlg,[data-ent],[data-e],[data-rc],.nwb,.nwd,.nw,#ta";
  var CONTAINERS = { rc: 1, wb: 1, wl: 1, pn: 1, nl: 1, dl: 1 };
  var MOVE = 4;

  // Is a pointer target an empty place: page background, empty canvas, or the bare container of a panel.
  function isEmptyTarget(t) {
    if (t?.nodeType !== 1) return false;
    var tag = t.tagName;
    if (tag === "HTML" || tag === "BODY") return true;
    if (t.closest?.(BLOCK)) return false;
    if (t === svg || (svg.contains?.(t))) return true;
    return !!CONTAINERS[t.id] || (t.classList?.contains("cp"));
  }

  // A click clears when it began and ended on empty places without moving 4px or more, with the primary button.
  function isEmptyClick(down, up, drawing) {
    if (drawing || !down || !up || !down.empty || !up.empty) return false;
    if (down.button > 0 || up.button > 0) return false;
    return Math.hypot(up.x - down.x, up.y - down.y) < MOVE;
  }

  // Clears the selection and network filter like Esc; an open server form with pending edits is left alone.
  function clearSelection(pending) {
    if (pending?.()) return false;
    if (ctx.sel) selection.select(null);
    if (ctx.net !== null) networks.setNet(null);
    return true;
  }

  function drawing() { return svg.classList.contains("draw-pencil") || svg.classList.contains("draw-eraser"); }

  var down = null;
  document.addEventListener("pointerdown", function (e) {
    down = { x: e.clientX, y: e.clientY, button: e.button, empty: isEmptyTarget(e.target) };
  }, true);
  document.addEventListener("click", function (e) {
    var d = down;
    down = null;
    if (!ctx.sel && ctx.net === null) return;
    if (isEmptyClick(d, { x: e.clientX, y: e.clientY, button: e.button, empty: isEmptyTarget(e.target) }, drawing())) clearSelection(hooks.pending);
  });

  return { isEmptyTarget: isEmptyTarget, isEmptyClick: isEmptyClick, clearSelection: clearSelection };
});
