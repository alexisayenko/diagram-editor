InfraDiagram.define("ui/export-columns", ["ui/core"], function (core) {
  var D = core.D, ctx = core.ctx, esc = core.esc;

  function legendSvg(x0, y0) {
    var S = ctx.style, W = 190, P = 10, y = y0 + P + 10, h = "", inHead = false;
    h += '<text class="h" x="' + (x0 + P) + '" y="' + y + '">SERVER TYPES</text>';
    y += 8;
    D.types.forEach(function (t) {
      if (t.infra && !inHead) {
        inHead = true;
        y += 12;
        h += '<text class="h" x="' + (x0 + P) + '" y="' + y + '">OTHER INFRASTRUCTURE</text>';
        y += 8;
      }
      var sw = t.dash
        ? '<rect class="sd" data-ty="' + t.ty + '" x="' + (x0 + P + 1) + '" y="' + (y + 3) + '" width="10" height="10" rx="2"/>'
        : '<rect class="sf" data-ty="' + t.ty + '" x="' + (x0 + P) + '" y="' + (y + 2) + '" width="12" height="12" rx="' + (S === "swiss" ? 0 : 3) + '"/>';
      h += sw + '<text x="' + (x0 + P + 20) + '" y="' + (y + 12) + '">' + esc(t.label) + "</text>";
      y += 18;
    });
    y += 12;
    h += '<text class="h" x="' + (x0 + P) + '" y="' + y + '">CONNECTIONS</text>';
    y += 4;
    D.edgeKey.forEach(function (k) {
      h += '<g transform="translate(' + (x0 + P - 2) + " " + y + ')">' + k[0] + "</g>";
      h += '<text x="' + (x0 + P + 48) + '" y="' + (y + 16) + '">' + esc(k[1]) + "</text>";
      y += 24;
    });
    if (D.nets && ctx.net !== null) {
      var nt = D.nets[ctx.net];
      y += 12;
      h += '<text class="h" x="' + (x0 + P) + '" y="' + y + '">NETWORK FILTER</text>';
      y += 4;
      wrap((nt.cidr ? nt.cidr + " " : "") + nt.name, 28).forEach(function (l) { y += 16; h += '<text x="' + (x0 + P) + '" y="' + y + '">' + esc(l) + "</text>"; });
      y += 8;
    }
    var H = y - y0 + 6;
    return { h: '<g class="xl"><rect class="c" x="' + x0 + '" y="' + y0 + '" width="' + W + '" height="' + H + '" rx="' + (S === "swiss" ? 0 : 6) + '"/>' + h + "</g>", w: W, bottom: y0 + H };
  }

  function wrap(s, max) {
    var out = [], cur = "";
    s.split(/\s+/).forEach(function (w) {
      if (cur && (cur + " " + w).length > max) { out.push(cur); cur = w; }
      else cur = cur ? cur + " " + w : w;
    });
    if (cur) out.push(cur);
    return out;
  }
  function notesSvg(x0, y0) {
    var S = ctx.style, CWN = { sketch: 6.6, clean: 5.6, dark: 6.4, swiss: 5.7 }[S];
    var W = 250, P = 10, LH = 14, h = "", y = y0;
    var rx = S === "swiss" ? 0 : S === "dark" ? 4 : 2;
    D.notes.forEach(function (n) {
      var max = Math.floor((W - 2 * P) / CWN), ty = y + P + 11, t = "";
      wrap(n.title, Math.floor(max * 0.9)).forEach(function (l) { t += '<text class="h" x="' + (x0 + P) + '" y="' + ty + '">' + esc(l) + "</text>"; ty += LH + 1; });
      ty += 3;
      n.paras.forEach(function (p) {
        wrap(p, max).forEach(function (l) { t += '<text x="' + (x0 + P) + '" y="' + ty + '">' + esc(l) + "</text>"; ty += LH; });
        ty += 5;
      });
      var ch = ty - y + 8;
      h += '<rect class="c" x="' + x0 + '" y="' + y + '" width="' + W + '" height="' + ch + '" rx="' + rx + '"/>' + t;
      h += '<text class="m" x="' + (x0 + W - 8) + '" y="' + (y + ch - 6) + '" text-anchor="end">' + esc(n.date) + "</text>";
      y += ch + 14;
    });
    return { h: '<g class="xn">' + h + "</g>", w: W, bottom: y - 14 };
  }

  return { legendSvg: legendSvg, notesSvg: notesSvg };
});
