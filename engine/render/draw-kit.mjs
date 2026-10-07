// Pure helpers for free-hand strokes. drawKit.toString() is inlined as the "canvas/draw-kit" runtime module,
// so the function must stay self-contained (no imports, no outer references).
export function drawKit() {
  var COLOR = /^#[0-9a-fA-F]{6}$/, ID = /^[A-Za-z0-9_-]{1,40}$/, MIN_STEP = 0.8, MAX_POINTS = 5000;

  function round1(v) { return Math.round(v * 10) / 10; }
  function fmt(v) { return String(round1(v)); }

  // Rounds to 1 decimal and drops points closer than `step` to the last kept one; the last point always stays.
  function decimate(points, step) {
    var min = step === undefined ? MIN_STEP : step, out = [];
    for (var i = 0; i < points.length; i++) {
      var x = round1(points[i][0]), y = round1(points[i][1]), last = out[out.length - 1];
      if (last && Math.hypot(x - last[0], y - last[1]) < min) {
        if (i === points.length - 1 && out.length > 1) out[out.length - 1] = [x, y];
        continue;
      }
      out.push([x, y]);
    }
    return out;
  }

  // Quadratic curve through the midpoints of consecutive points; a lone point becomes a dot.
  function smoothPath(points) {
    var n = points.length;
    if (!n) return "";
    var p = points, d = "M" + fmt(p[0][0]) + " " + fmt(p[0][1]);
    if (n === 1) return d + "l0 0";
    if (n === 2) return d + "L" + fmt(p[1][0]) + " " + fmt(p[1][1]);
    for (var i = 1; i < n - 1; i++) {
      var mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
      if (i === 1) d += "L" + fmt((p[0][0] + p[1][0]) / 2) + " " + fmt((p[0][1] + p[1][1]) / 2);
      d += "Q" + fmt(p[i][0]) + " " + fmt(p[i][1]) + " " + fmt(mx) + " " + fmt(my);
    }
    return d + "L" + fmt(p[n - 1][0]) + " " + fmt(p[n - 1][1]);
  }

  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    var t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  function distToStroke(points, x, y) {
    if (!points.length) return Infinity;
    if (points.length === 1) return Math.hypot(x - points[0][0], y - points[0][1]);
    var best = Infinity;
    for (var i = 1; i < points.length; i++) best = Math.min(best, segDist(x, y, points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]));
    return best;
  }
  function hits(stroke, x, y, radius) { return distToStroke(stroke.points, x, y) <= (radius || 0) + stroke.width / 2; }
  // Topmost stroke under (x, y), or -1.
  function hitIndex(list, x, y, radius) {
    for (var i = list.length - 1; i >= 0; i--) if (hits(list[i], x, y, radius)) return i;
    return -1;
  }

  // Snapshot history: push after each change, undo / redo return the list to show.
  function history(initial) {
    var states = [initial], at = 0;
    return {
      current: function () { return states[at]; },
      push: function (list) { states = states.slice(0, at + 1); states.push(list); at++; return list; },
      undo: function () { if (at > 0) at--; return states[at]; },
      redo: function () { if (at < states.length - 1) at++; return states[at]; },
      canUndo: function () { return at > 0; },
      canRedo: function () { return at < states.length - 1; },
    };
  }

  function validate(list) {
    if (list === undefined || list === null) return [];
    if (!Array.isArray(list)) throw new Error("Layout 'drawings' must be an array");
    var seen = {};
    return list.map(function (s, i) {
      var at = "Invalid saved drawing " + (i + 1);
      if (!s || typeof s !== "object" || Array.isArray(s)) throw new Error(at);
      if (typeof s.id !== "string" || !ID.test(s.id) || seen[s.id]) throw new Error(at + ": bad or duplicate id");
      if (typeof s.color !== "string" || !COLOR.test(s.color)) throw new Error(at + ": color must be #rrggbb");
      if (typeof s.width !== "number" || !(s.width >= 0.5 && s.width <= 40)) throw new Error(at + ": bad width");
      if (!Array.isArray(s.points) || !s.points.length || s.points.length > MAX_POINTS || !s.points.every(function (p) { return Array.isArray(p) && p.length === 2 && isFinite(p[0]) && isFinite(p[1]) && typeof p[0] === "number" && typeof p[1] === "number"; })) throw new Error(at + ": bad points");
      seen[s.id] = true;
      return { id: s.id, color: s.color.toLowerCase(), width: s.width, points: s.points.map(function (p) { return [p[0], p[1]]; }) };
    });
  }

  function pathMarkup(s) {
    return '<path class="dwp" data-id="' + s.id + '" d="' + smoothPath(s.points) + '" fill="none" stroke="' + s.color + '" stroke-width="' + s.width + '" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  function markup(list) { return list.map(pathMarkup).join(""); }

  function newId(list) {
    var used = {}, n = list.length + 1;
    list.forEach(function (s) { used[s.id] = true; });
    while (used["d" + n]) n++;
    return "d" + n;
  }

  return { decimate: decimate, smoothPath: smoothPath, distToStroke: distToStroke, hits: hits, hitIndex: hitIndex, history: history, validate: validate, pathMarkup: pathMarkup, markup: markup, newId: newId };
}
