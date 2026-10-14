InfraDiagram.define("ui/core", ["ui/metrics"], function (metrics) {
  var STYLES = ["sketch", "clean", "dark", "swiss"];
  var CW = metrics.METRICS.charWidth;
  var BG = { clean: "#F3F5F9", dark: "#0A1020", swiss: "#FFFFFF" };
  var D = JSON.parse(document.getElementById("layout-data").textContent);
  var svg = document.querySelector("svg");
  var els = Array.from(svg.children).slice(1);
  var ents = Array.from(svg.querySelectorAll("[data-ent]"));
  var ctx = { style: "clean", hidden: {}, sel: null, net: null, sys: true, ready: false };

  // Services: functions one runtime module provides and others call, each name with exactly one provider.
  // getState, isEdit, fit: the canvas (init). view, viewNode, title, route, rerender: canvas/model.
  // beforeSelect (returns false to veto a selection), pending (unsaved form edits): ui/server-edit.
  var SERVICES = ["getState", "isEdit", "fit", "route", "title", "view", "viewNode", "rerender", "beforeSelect", "pending"];
  // Events: "panel" (key, panelElement) after ui/details filled the details panel; "render" after canvas/model drew a state.
  var EVENTS = ["panel", "render"];
  // Host: what the page gives the runtime, attached once with attachHost(host).
  // noteParser(text) -> { title, date, paras }; serverEditor: source, apply, add, duplicate, regionTypes, addRegion, move, renameNetwork.
  var HOST_FIELDS = ["noteParser", "serverEditor"];

  function createRegistry() {
    var provided = {}, subs = {}, services = {}, host = {}, attached = false;
    SERVICES.forEach(function (name) {
      provided[name] = null;
      Object.defineProperty(services, name, { enumerable: true, get: function () { return provided[name]; } });
    });
    HOST_FIELDS.forEach(function (name) { host[name] = null; });
    EVENTS.forEach(function (name) { subs[name] = []; });
    function provide(name, fn) {
      if (!SERVICES.includes(name)) throw new Error("InfraDiagram: unknown service " + name);
      if (typeof fn !== "function") throw new TypeError("InfraDiagram: service " + name + " must be a function");
      if (provided[name]) throw new Error("InfraDiagram: service " + name + " is already provided");
      provided[name] = fn;
    }
    function revoke(name) {
      if (!SERVICES.includes(name)) throw new Error("InfraDiagram: unknown service " + name);
      provided[name] = null;
    }
    function on(event, fn) {
      if (!subs[event]) throw new Error("InfraDiagram: unknown event " + event);
      if (typeof fn !== "function") throw new TypeError("InfraDiagram: handler for " + event + " must be a function");
      if (subs[event].includes(fn)) throw new Error("InfraDiagram: handler already subscribed to " + event);
      subs[event].push(fn);
      return function () {
        var i = subs[event].indexOf(fn);
        if (i >= 0) subs[event].splice(i, 1);
      };
    }
    function emit(event) {
      if (!subs[event]) throw new Error("InfraDiagram: unknown event " + event);
      var args = Array.prototype.slice.call(arguments, 1);
      subs[event].slice().forEach(function (fn) {
        try { fn.apply(null, args); } catch (e) { console.error("InfraDiagram: handler for " + event + " failed", e); }
      });
    }
    function attachHost(h) {
      if (attached) throw new Error("InfraDiagram: a host is already attached");
      if (!h || typeof h !== "object") throw new TypeError("InfraDiagram: attachHost needs a host object");
      if (h.noteParser != null && typeof h.noteParser !== "function") throw new TypeError("InfraDiagram: host.noteParser must be a function");
      HOST_FIELDS.forEach(function (name) { host[name] = h[name] ?? null; });
      attached = true;
    }
    function detachHost() {
      HOST_FIELDS.forEach(function (name) { host[name] = null; });
      attached = false;
    }
    return { services: services, provide: provide, revoke: revoke, on: on, emit: emit, host: host, attachHost: attachHost, detachHost: detachHost };
  }

  var registry = createRegistry();

  // Keys are "<diagram id>-<name>".
  function lsGet(name) {
    try {
      return localStorage.getItem(D.id + "-" + name);
    } catch (e) { return null; }
  }
  function lsSet(name, v) { try { localStorage.setItem(D.id + "-" + name, v); } catch (e) { return; } }
  function lsDel(name) { try { localStorage.removeItem(D.id + "-" + name); } catch (e) { return; } }
  function esc(s) { return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
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
      try { ok = document.execCommand("copy"); /* NOSONAR: legacy fallback when the clipboard API is unavailable */ } catch (e) { ok = false; }
      ta.remove();
      done(ok);
    }
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    else fallback();
  }
  function save(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  InfraDiagram.attachHost = registry.attachHost;

  return { STYLES: STYLES, CW: CW, BG: BG, D: D, svg: svg, els: els, ents: ents, ctx: ctx, services: registry.services, provide: registry.provide, revoke: registry.revoke, on: registry.on, emit: registry.emit, host: registry.host, attachHost: registry.attachHost, detachHost: registry.detachHost, createRegistry: createRegistry, SERVICES: SERVICES, EVENTS: EVENTS, lsGet: lsGet, lsSet: lsSet, lsDel: lsDel, esc: esc, $: $, clipboard: clipboard, save: save };
});
