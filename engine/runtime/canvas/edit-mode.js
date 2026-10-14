InfraDiagram.define("canvas/edit-mode", ["ui/core", "ui/init", "canvas/model", "canvas/zoom-pan"], function (core, init, model, zoomPan) {
  var svg = core.svg, els = core.els, $ = core.$, state = model.state, base = model.base, fit = zoomPan.fit;
  var GRID = 5;
  var drag = null, frame = 0;
  var KEY = "layout-draft:" + hash(JSON.stringify(base) + svg.textContent.replace(/\s+/g, " "));

  function hash(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  function loadDraft() {
    if (window.InfraDiagramFileBacked) return null;
    try {
      var d = JSON.parse(core.lsGet(KEY));
      if (d?.nodes && d.clusters && d.edges) return d;
    } catch (e) { /* no usable draft */ }
    return null;
  }
  function saveDraft() { if (!window.InfraDiagramFileBacked) core.lsSet(KEY, JSON.stringify(state.st)); }

  function toJson(s) {
    return JSON.stringify(s, null, 2) + "\n";
  }

  function currentLayout() { return model.clone(state.on ? state.st : base); }
  function isDirty() { return state.on && JSON.stringify(state.st) !== JSON.stringify(base); }
  function commit(saved) {
    Object.keys(base).forEach(function (k) { delete base[k]; });
    Object.assign(base, model.clone(saved));
    core.lsDel(KEY);
    state.st = model.clone(base);
    model.render(base);
    say("Saved");
  }

  function say(msg) {
    var m = $("tm");
    m.textContent = msg;
    setTimeout(function () { if (m.textContent === msg) m.textContent = ""; }, 2500);
  }

  function copy() {
    core.clipboard(toJson(state.st), function (ok) { say(ok ? "Copied" : "Copy failed, use Download"); });
  }
  function download() {
    core.save(new Blob([toJson(state.st)], { type: "application/json" }), "diagram.layout.json");
  }
  function reset() {
    state.st = model.clone(base);
    core.lsDel(KEY);
    model.render(state.st);
    fit();
    say("Reset");
  }

  function mark(flag) {
    model.each(function (key, idxs) {
      idxs.forEach(function (i) {
        if (flag) els[i].setAttribute("data-e", key); else els[i].removeAttribute("data-e");
      });
    });
  }

  function setMode(flag) {
    if (!flag && window.InfraDiagramFileBacked && isDirty()) {
      say("Save or Reset your layout before leaving edit mode");
      return;
    }
    state.on = flag;
    $("ta").setAttribute("data-on", flag ? "1" : "0");
    $("te").setAttribute("aria-pressed", flag ? "true" : "false");
    $("tx").hidden = !flag;
    svg.classList.toggle("edit", flag);
    mark(flag);
    init.editChanged(flag);
    if (flag) state.st = loadDraft() || model.clone(base);
    model.render(flag ? state.st : base);
    fit();
  }

  function snapDelta(start, d) { return Math.round((start + d) / GRID) * GRID - start; }

  function origin(s, key) {
    var t = key.charAt(0), id = key.slice(2);
    return (t === "c" ? s.clusters : s.nodes)[id];
  }

  svg.addEventListener("pointerdown", function (e) {
    if (!state.on || e.button > 0) return;
    var t = e.target.closest?.("[data-e]"), h = !t && e.target.closest?.("[data-rc]");
    if (!t && !h) return;
    e.preventDefault();
    var p = model.point(e);
    drag = { key: h ? "c:" + h.getAttribute("data-rc") : t.getAttribute("data-e"), side: h ? h.getAttribute("data-rs") : null, x: p.x, y: p.y, from: model.clone(state.st), id: e.pointerId };
    try { svg.setPointerCapture(e.pointerId); } catch (error_) { /* capture is optional */ }
  });

  function snapSide(r, side, dx, dy) {
    if (side.includes("w")) dx = snapDelta(r.x, dx);
    if (side.includes("e")) dx = snapDelta(r.x + r.w, dx);
    if (side.includes("n")) dy = snapDelta(r.y, dy);
    if (side.includes("s")) dy = snapDelta(r.y + r.h, dy);
    return [dx, dy];
  }

  function dragState(e, dx, dy) {
    var snap = $("ts").checked && !e.shiftKey, regionId = drag.key.slice(2);
    if (drag.side) {
      if (snap) [dx, dy] = snapSide(drag.from.clusters[regionId], drag.side, dx, dy);
      return model.resize(drag.from, regionId, drag.side, dx, dy);
    }
    if (snap) {
      var o = origin(drag.from, drag.key);
      dx = snapDelta(o.x, dx);
      dy = snapDelta(o.y, dy);
    }
    return model.apply(drag.from, drag.key, dx, dy);
  }

  svg.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var p = model.point(e);
    state.st = dragState(e, Math.round(p.x - drag.x), Math.round(p.y - drag.y));
    // Routing runs once per frame, not per pointer event.
    if (!frame) frame = requestAnimationFrame(function () { frame = 0; model.render(state.st); });
  });

  var ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  // Edit mode: arrow keys move the focused, selected server or region by the snap step (1px with snap off); Shift is ten times that.
  svg.addEventListener("keydown", function (e) {
    var dir = ARROWS[e.key], t = e.target, key = t?.getAttribute?.("tabindex") === "0" ? t.dataset?.ent : null;
    if (!state.on || !dir || !key || key !== core.ctx.sel || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    var step = ($("ts").checked ? GRID : 1) * (e.shiftKey ? 10 : 1), o = origin(state.st, key), snap = $("ts").checked;
    var dx = dir[0] * step, dy = dir[1] * step;
    if (snap) { dx = dir[0] ? snapDelta(o.x, dx) : 0; dy = dir[1] ? snapDelta(o.y, dy) : 0; }
    state.st = model.apply(state.st, key, dx, dy);
    model.render(state.st);
    saveDraft();
    fit();
  });

  function drop(d, e) {
    var api = core.host.serverEditor, id = d.key.slice(2), meta = core.D.meta.nodes[id];
    if (d.key.charAt(0) !== "n" || !api?.move || !meta) return false;
    var from = meta.cl || null, to = model.regionAt(d.from, model.point(e));
    if (to === from) return false;
    if (from) state.st.clusters[from] = model.clone(d.from.clusters[from]);
    var err = api.move(id, to);
    if (!err) return true;
    state.st = model.clone(d.from);
    model.render(state.st);
    say(err);
    return false;
  }

  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag, moved = e.type === "pointerup" && drop(d, e);
    drag = null;
    saveDraft();
    if (!moved) fit();
  }
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);

  $("te").addEventListener("click", function () { setMode(!state.on); });
  $("tc").addEventListener("click", copy);
  $("td").addEventListener("click", download);
  $("tr").addEventListener("click", reset);

  if (/[?&]debug(=|&|$)/.test(location.search)) setMode(true);
  init.init({ getState: function () { return state.on ? state.st : base; }, isEdit: function () { return state.on; }, fit: fit });

  return { currentLayout: currentLayout, isDirty: isDirty, commit: commit };
});
