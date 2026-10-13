InfraDiagram.define("canvas/context-menu", ["ui/core", "canvas/model"], function (core, model) {
  var state = model.state;
  var menu = null;

  function bridge() { return window.InfraDiagram.serverEditor || null; }

  function regionAt(p) {
    var best = null, area = Infinity;
    Object.keys(state.st.clusters).forEach(function (id) {
      var c = state.st.clusters[id];
      if (p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h && c.w * c.h < area) { best = id; area = c.w * c.h; }
    });
    return best;
  }

  function close() {
    if (!menu) return;
    menu.remove();
    menu = null;
  }

  function addItem(label, run) {
    var item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.textContent = label;
    item.addEventListener("click", function () {
      close();
      var err = run();
      if (err) core.$("tm").textContent = err;
    });
    menu.appendChild(item);
    return item;
  }

  function serverAt(target) {
    var el = target && target.closest && target.closest("[data-ent]"), k = el && el.getAttribute("data-ent");
    return k && k.indexOf("n:") === 0 ? k.slice(2) : null;
  }

  function editable(t) {
    var tag = t && t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!(t && t.isContentEditable);
  }

  function open(e) {
    var p = model.point(e), api = bridge(), id = serverAt(e.target), region = regionAt(p);
    menu = document.createElement("div");
    menu.id = "cm";
    menu.setAttribute("role", "menu");
    var first = id && api.duplicate
      ? addItem("Duplicate server", function () { return api.duplicate(id); })
      : addItem("Add Server", function () { return api.add(region, Math.round(p.x), Math.round(p.y)); });
    document.body.appendChild(menu);
    menu.style.left = Math.max(0, Math.min(e.clientX, window.innerWidth - menu.offsetWidth)) + "px";
    menu.style.top = Math.max(0, Math.min(e.clientY, window.innerHeight - menu.offsetHeight)) + "px";
    first.focus();
  }

  document.addEventListener("contextmenu", function (e) {
    if (!state.on || !bridge() || !bridge().add || editable(e.target)) return;
    e.preventDefault();
    close();
    open(e);
  });
  document.addEventListener("pointerdown", function (e) { if (menu && !menu.contains(e.target)) close(); }, true);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && menu) { e.stopPropagation(); close(); } }, true);
  window.addEventListener("scroll", close, true);
  window.addEventListener("wheel", close, { passive: true });
  window.addEventListener("blur", close);

  return { close: close };
});
