InfraDiagram.define("canvas/draw", ["ui/core", "canvas/draw-kit", "canvas/model"], function (core, drawKit, model) {
  var svg = core.svg, $ = core.$, D = core.D;
  var COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a855f7"], WIDTHS = [2, 4, 8];
  var STEP = 0.8, MAX_POINTS = 5000, ERASER_PX = 6;
  var layer = document.getElementById("dw");
  var tool = "select", pen = { color: COLORS[0], width: WIDTHS[0] };
  var hist = drawKit.history(drawKit.validate(D.drawings));
  var saved = JSON.stringify(hist.current());
  var cur = null, erasing = null, hot = null, frame = 0;

  try {
    var p = JSON.parse(core.lsGet("pen"));
    if (p && COLORS.indexOf(p.color) >= 0 && WIDTHS.indexOf(p.width) >= 0) pen = p;
  } catch (e) {}

  function list() { return hist.current(); }
  function currentTool() { return tool; }
  function isDirty() { return JSON.stringify(list()) !== saved; }
  function markSaved() { saved = JSON.stringify(list()); }

  function show(l) {
    layer.innerHTML = drawKit.markup(l);
    hot = null;
    sync();
  }
  function sync() {
    $("dtu").disabled = !hist.canUndo();
    $("dtr").disabled = !hist.canRedo();
  }
  function commit(l) { hist.push(l); show(l); }

  function setTool(t) {
    if (cur || erasing) return;
    tool = t;
    svg.classList.toggle("draw-pencil", t === "pencil");
    svg.classList.toggle("draw-eraser", t === "eraser");
    [].forEach.call(document.querySelectorAll("#dtl [data-t]"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-t") === t)); });
    $("dpo").hidden = t !== "pencil";
    clearHot();
  }
  function setPen(c, w) {
    pen = { color: c, width: w };
    core.lsSet("pen", JSON.stringify(pen));
    paintPen();
  }
  function paintPen() {
    [].forEach.call(document.querySelectorAll("#dpo [data-c]"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-c") === pen.color)); });
    [].forEach.call(document.querySelectorAll("#dpo [data-w]"), function (b) { b.setAttribute("aria-pressed", String(+b.getAttribute("data-w") === pen.width)); });
  }

  function undo() { if (hist.canUndo()) show(hist.undo()); }
  function redo() { if (hist.canRedo()) show(hist.redo()); }

  function scale() { var m = svg.getScreenCTM(); return m && m.a ? m.a : 1; }
  function clearHot() { if (hot) { hot.classList.remove("hot"); hot = null; } }
  function paths() { return [].slice.call(layer.children); }

  function eraseAt(e) {
    var pt = model.point(e), l = erasing.work, i = drawKit.hitIndex(l, pt.x, pt.y, ERASER_PX / scale());
    if (i < 0) return;
    erasing.work = l.slice(0, i).concat(l.slice(i + 1));
    erasing.changed = true;
    show(erasing.work);
  }
  function hover(e) {
    var pt = model.point(e), l = list(), i = drawKit.hitIndex(l, pt.x, pt.y, ERASER_PX / scale());
    var el = i < 0 ? null : paths()[i];
    if (el === hot) return;
    clearHot();
    if (el) { hot = el; el.classList.add("hot"); }
  }

  function paintCur() {
    frame = 0;
    if (cur) cur.el.setAttribute("d", drawKit.smoothPath(cur.pts));
  }

  function down(e) {
    if (tool === "select" || !e.isPrimary || e.button > 0) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var pt = model.point(e);
    try { svg.setPointerCapture(e.pointerId); } catch (x) {}
    if (tool === "eraser") {
      clearHot();
      erasing = { id: e.pointerId, work: list(), changed: false };
      eraseAt(e);
      return;
    }
    var el = document.createElementNS("http://www.w3.org/2000/svg", "path");
    el.setAttribute("class", "dwp");
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", pen.color);
    el.setAttribute("stroke-width", pen.width);
    el.setAttribute("stroke-linecap", "round");
    el.setAttribute("stroke-linejoin", "round");
    layer.appendChild(el);
    cur = { id: e.pointerId, el: el, pts: [[pt.x, pt.y]] };
    paintCur();
  }
  function move(e) {
    if (tool === "eraser" && !erasing && e.pointerType === "mouse") { hover(e); return; }
    if (erasing && e.pointerId === erasing.id) {
      e.stopImmediatePropagation();
      (e.getCoalescedEvents ? e.getCoalescedEvents() : [e]).forEach(function (ce) { eraseAt(ce.clientX === undefined ? e : ce); });
      return;
    }
    if (!cur || e.pointerId !== cur.id) return;
    e.stopImmediatePropagation();
    var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if (!evs.length) evs = [e];
    evs.forEach(function (ce) {
      var pt = model.point(ce), last = cur.pts[cur.pts.length - 1];
      if (cur.pts.length < MAX_POINTS && Math.hypot(pt.x - last[0], pt.y - last[1]) >= STEP) cur.pts.push([pt.x, pt.y]);
    });
    if (!frame) frame = requestAnimationFrame(paintCur);
  }
  function up(e) {
    if (erasing && e.pointerId === erasing.id) {
      var done = erasing;
      erasing = null;
      if (done.changed) commit(done.work);
      return;
    }
    if (!cur || e.pointerId !== cur.id) return;
    var c = cur;
    cur = null;
    c.el.remove();
    if (e.type === "pointercancel") return;
    var l = list();
    commit(l.concat([{ id: drawKit.newId(l), color: pen.color, width: pen.width, points: drawKit.decimate(c.pts) }]));
  }
  function swallowClick(e) {
    if (tool !== "select") { e.stopImmediatePropagation(); e.preventDefault(); }
  }

  svg.addEventListener("pointerdown", down, true);
  svg.addEventListener("pointermove", move, true);
  svg.addEventListener("pointerup", up, true);
  svg.addEventListener("pointercancel", up, true);
  svg.addEventListener("click", swallowClick, true);
  svg.addEventListener("dblclick", swallowClick, true);

  document.addEventListener("keydown", function (e) {
    var t = e.target, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
    var k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (k === "z" || k === "y")) {
      if (cur || erasing) return;
      var redoing = k === "y" || e.shiftKey;
      if (redoing ? !hist.canRedo() : !hist.canUndo()) return;
      e.preventDefault();
      if (redoing) redo(); else undo();
    } else if (e.key === "Escape" && tool !== "select") setTool("select");
  });

  $("dtl").addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button");
    if (!b) return;
    if (b.id === "dtu") undo();
    else if (b.id === "dtr") redo();
    else if (b.getAttribute("data-t")) setTool(b.getAttribute("data-t"));
  });
  $("dpo").addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button");
    if (!b) return;
    if (b.getAttribute("data-c")) setPen(b.getAttribute("data-c"), pen.width);
    else if (b.getAttribute("data-w")) setPen(pen.color, +b.getAttribute("data-w"));
  });

  paintPen();
  sync();

  return { list: list, isDirty: isDirty, markSaved: markSaved, undo: undo, redo: redo, setTool: setTool, tool: currentTool };
});
