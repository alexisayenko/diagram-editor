InfraDiagram.define("canvas/zoom-pan", ["ui/core", "canvas/model"], function (core, model) {
  var svg = core.svg;

  var PAD = 20;
  function fit() {
    var b;
    try { b = svg.getBBox(); } catch (e) { return; }
    if (!(b.width > 0 && b.height > 0)) return;
    var x = Math.floor(b.x - PAD), y = Math.floor(b.y - PAD);
    var w = Math.ceil(b.x + b.width + PAD) - x, h = Math.ceil(b.y + b.height + PAD) - y;
    Z.base = [x, y, w, h];
    applyZoom();
  }

  var Z = { base: svg.getAttribute("viewBox").split(/\s+/).map(Number), z: 1, cx: 0, cy: 0, free: false, pan: null, panned: false };
  function clampAxis(c, view, lo, hi, k) {
    var keep = Math.min(100 / k, 0.15 * (hi - lo));
    return Math.min(hi - keep + view / 2, Math.max(lo + keep - view / 2, c));
  }
  function applyZoom() {
    var b = Z.base;
    var w = b[2] / Z.z, h = b[3] / Z.z, r = function (v) { return Math.round(v * 100) / 100; };
    if (!Z.free) { Z.cx = b[0] + b[2] / 2; Z.cy = b[1] + b[3] / 2; }
    else {
      var rc = svg.getBoundingClientRect();
      if (rc.width > 0 && rc.height > 0) {
        var k = Math.min(rc.width / w, rc.height / h);
        Z.cx = clampAxis(Z.cx, rc.width / k, b[0] + PAD, b[0] + b[2] - PAD, k);
        Z.cy = clampAxis(Z.cy, rc.height / k, b[1] + PAD, b[1] + b[3] - PAD, k);
      }
    }
    svg.setAttribute("data-fit", b.join(" "));
    svg.setAttribute("viewBox", [r(Z.cx - w / 2), r(Z.cy - h / 2), r(w), r(h)].join(" "));
    svg.classList.toggle("zoomed", Z.z > 1);
  }
  function zoomBy(f, at) {
    var z = Math.min(8, Math.max(0.25, Z.z * f));
    if (Math.abs(z - 1) < 1e-6) z = 1;
    if (at) {
      Z.free = true;
      Z.cx = at.x - (at.x - Z.cx) * Z.z / z;
      Z.cy = at.y - (at.y - Z.cy) * Z.z / z;
    }
    Z.z = z;
    applyZoom();
  }
  function zoomFit() { Z.z = 1; Z.free = false; applyZoom(); }
  svg.addEventListener("wheel", function (e) {
    if (e.target.closest && e.target.closest(".cp,#rc,#pn,#ta")) return;
    e.preventDefault();
    var dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
    zoomBy(Math.exp(-Math.max(-300, Math.min(300, dy)) * 0.002), model.point(e));
  }, { passive: false });
  svg.addEventListener("pointerdown", function (e) {
    if (model.state.on || e.button > 0 || (e.target.closest && e.target.closest("[data-ent]"))) return;
    var m = svg.getScreenCTM();
    Z.pan = { x: e.clientX, y: e.clientY, cx: Z.cx, cy: Z.cy, k: m ? m.a : 1, id: e.pointerId };
    Z.panned = false;
    svg.classList.add("panning");
    try { svg.setPointerCapture(e.pointerId); } catch (x) {}
  });
  svg.addEventListener("pointermove", function (e) {
    var p = Z.pan;
    if (!p || e.pointerId !== p.id) return;
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!Z.panned && Math.abs(dx) + Math.abs(dy) <= 3) return;
    Z.panned = Z.free = true;
    Z.cx = p.cx - dx / p.k;
    Z.cy = p.cy - dy / p.k;
    applyZoom();
  });
  function panEnd(e) {
    if (!Z.pan || e.pointerId !== Z.pan.id) return;
    Z.pan = null;
    svg.classList.remove("panning");
  }
  svg.addEventListener("pointerup", panEnd);
  svg.addEventListener("pointercancel", panEnd);
  addEventListener("click", function (e) {
    if (Z.panned) { Z.panned = false; e.stopPropagation(); }
  }, true);
  document.addEventListener("keydown", function (e) {
    var t = e.target, tag = t && t.tagName;
    if (e.ctrlKey || e.metaKey || e.altKey || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
    if (e.key === "+" || e.key === "=") zoomBy(1.25);
    else if (e.key === "-" || e.key === "_") zoomBy(1 / 1.25);
    else if (e.key === "0") zoomFit();
    else return;
    e.preventDefault();
  });
  core.$("zi").addEventListener("click", function () { zoomBy(1.25); });
  core.$("zo").addEventListener("click", function () { zoomBy(1 / 1.25); });
  core.$("zf").addEventListener("click", zoomFit);

  return { fit: fit };
});
