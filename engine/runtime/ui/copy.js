InfraDiagram.define("ui/copy", ["ui/core"], function (core) {
  var hintT;

  function hint(msg, x, y) {
    var h = core.$("ch");
    h.textContent = msg;
    h.style.left = Math.min(x + 12, innerWidth - 80) + "px";
    h.style.top = Math.max(y - 28, 4) + "px";
    h.classList.add("on");
    clearTimeout(hintT);
    hintT = setTimeout(function () { h.classList.remove("on"); }, 1200);
  }
  function copyText(s, x, y) {
    core.clipboard(s, function (ok) { hint(ok ? "Copied" : "Copy failed", x, y); });
  }

  return { copyText: copyText };
});
