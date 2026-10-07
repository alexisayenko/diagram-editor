InfraDiagram.define("ui/export-image", ["ui/core", "ui/export-columns"], function (core, exportColumns) {
  var D = core.D, svg = core.svg, ctx = core.ctx;

  function resolveCss() {
    var css = core.$("css-svg").textContent;
    var dark = false;
    try { dark = matchMedia("(prefers-color-scheme: dark)").matches; } catch (e) {}
    var m = css.match(/@media \(prefers-color-scheme: dark\)\{\/\*DARK<\*\/([\s\S]*?)\/\*>DARK\*\/\}/);
    if (m) css = css.replace(m[0], dark ? m[1] : "");
    return { css: css, dark: dark };
  }

  function exportSvg() {
    var c = svg.cloneNode(true);
    var r = resolveCss();
    [].forEach.call(c.querySelectorAll("[data-e]"), function (n) { n.removeAttribute("data-e"); });
    [].forEach.call(c.querySelectorAll(".nwb"), function (n) { n.remove(); });
    c.classList.remove("edit", "zoomed", "panning", "draw-pencil", "draw-eraser");
    [].forEach.call(c.querySelectorAll(".dwp.hot"), function (n) { n.classList.remove("hot"); });
    c.removeAttribute("style");
    if (c.getAttribute("data-fit")) c.setAttribute("viewBox", c.getAttribute("data-fit"));
    c.removeAttribute("data-fit");
    c.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    c.setAttribute("data-style", ctx.style);
    var vb = c.getAttribute("viewBox").split(/\s+/).map(Number);
    if (D.notes && D.notes.length) {
      var ns = exportColumns.notesSvg(vb[0] + vb[2] + 10, vb[1] + 20);
      c.insertAdjacentHTML("beforeend", ns.h);
      vb[2] += ns.w + 30;
      vb[3] = Math.max(vb[3], ns.bottom + 20 - vb[1]);
    }
    var lgx = exportColumns.legendSvg(vb[0] - 200, vb[1] + 20);
    c.insertAdjacentHTML("beforeend", lgx.h);
    vb[0] -= lgx.w + 10;
    vb[2] += lgx.w + 10;
    vb[3] = Math.max(vb[3], lgx.bottom + 20 - vb[1]);
    c.setAttribute("viewBox", vb.join(" "));
    c.setAttribute("width", vb[2]);
    c.setAttribute("height", vb[3]);
    var bg = ctx.style === "sketch" ? (r.dark ? "#16181c" : "#ffffff") : core.BG[ctx.style];
    var pre = '<style>' + r.css.replace(/<\/style/g, "<\\/style") + "</style>";
    if (ctx.style === "dark") pre += '<defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#14213A" stroke-width="1"/></pattern></defs>';
    pre += '<rect x="' + vb[0] + '" y="' + vb[1] + '" width="' + vb[2] + '" height="' + vb[3] + '" fill="' + bg + '"/>';
    if (ctx.style === "dark") pre += '<rect x="' + vb[0] + '" y="' + vb[1] + '" width="' + vb[2] + '" height="' + vb[3] + '" fill="url(#grid)"/>';
    var ser = new XMLSerializer().serializeToString(c);
    var gt = ser.indexOf(">", ser.indexOf("<svg")) + 1;
    var out = ser.slice(0, gt) + pre + ser.slice(gt);
    return { text: '<?xml version="1.0" encoding="UTF-8"?>\n' + out, w: vb[2], h: vb[3] };
  }

  function fileName(ext) { return D.id + "-" + ctx.style + "." + ext; }
  function downloadSvg() {
    core.save(new Blob([exportSvg().text], { type: "image/svg+xml" }), fileName("svg"));
  }
  function downloadPng() {
    var x = exportSvg(), sc = Math.min(2, 8000 / Math.max(x.w, x.h));
    var img = new Image();
    img.onload = function () {
      var cv = document.createElement("canvas");
      cv.width = Math.round(x.w * sc);
      cv.height = Math.round(x.h * sc);
      var cx = cv.getContext("2d");
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob(function (b) { if (b) core.save(b, fileName("png")); }, "image/png");
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(x.text);
  }

  return { exportSvg: exportSvg, downloadSvg: downloadSvg, downloadPng: downloadPng };
});
