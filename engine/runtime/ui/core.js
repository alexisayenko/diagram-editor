InfraDiagram.define("ui/core", [], function () {
  var STYLES = ["sketch", "clean", "dark", "swiss"];
  var CW = { sketch: 7, clean: 6, dark: 6.6, swiss: 6.6 };
  var BG = { clean: "#F3F5F9", dark: "#0A1020", swiss: "#FFFFFF" };
  var D = JSON.parse(document.getElementById("layout-data").textContent);
  var svg = document.querySelector("svg");
  var els = [].slice.call(svg.children, 1);
  var ents = [].slice.call(svg.querySelectorAll("[data-ent]"));
  var ctx = { style: "clean", hidden: {}, sel: null, net: null, ready: false };
  var hooks = { getState: null, isEdit: null, fit: null, route: null };

  // Keys are "<diagram id>-<name>"; a value still under "<legacyId>-<name>" is copied over on first read.
  function lsGet(name) {
    try {
      var v = localStorage.getItem(D.id + "-" + name);
      if (v === null && D.legacyId) {
        v = localStorage.getItem(D.legacyId + "-" + name);
        if (v !== null) localStorage.setItem(D.id + "-" + name, v);
      }
      return v;
    } catch (e) { return null; }
  }
  function lsSet(name, v) { try { localStorage.setItem(D.id + "-" + name, v); } catch (e) {} }
  function lsDel(name) { try { localStorage.removeItem(D.id + "-" + name); } catch (e) {} }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function $(id) { return document.getElementById(id); }

  function clipboard(text, done) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      done(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    else fallback();
  }
  function save(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  return { STYLES: STYLES, CW: CW, BG: BG, D: D, svg: svg, els: els, ents: ents, ctx: ctx, hooks: hooks, lsGet: lsGet, lsSet: lsSet, lsDel: lsDel, esc: esc, $: $, clipboard: clipboard, save: save };
});
