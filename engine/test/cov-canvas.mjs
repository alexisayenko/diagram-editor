// A fake canvas page around the real demo layout data, plus loaders for the real canvas modules.
import { renderDiagram } from "../browser/render.mjs";
import { geometryKit } from "../render/geometry.mjs";
import { drawKit } from "../render/draw-kit.mjs";
import { demo } from "./helpers.mjs";
import { El, define, clone } from "./cov-dom.mjs";

export const dataOf = (html) => JSON.parse(html.match(/id="layout-data">([\s\S]*?)<\/script>/)[1]);
export const demoData = (saved = null) => dataOf(renderDiagram(demo(), "demo", saved, { cssSvg: "", cssPage: "", js: "" }, []).html);
export const geometry = geometryKit();
export const kit = drawKit();

export function makeDocument() {
  const doc = new El("document");
  const byId = {};
  doc.byId = byId;
  doc.body = new El("body", doc);
  doc.createElement = (t) => new El(t, doc);
  doc.createElementNS = (ns, t) => new El(t, doc);
  doc.getElementById = (id) => (byId[id] ||= Object.assign(new El("div", doc), { id }));
  doc.querySelectorAll = () => [];
  return doc;
}

export function makeSvg() {
  const svg = new El("svg");
  svg.setAttribute("viewBox", "0 0 1000 800");
  svg.textContent = "svg text";
  svg.ctm = { a: 1, e: 0, f: 0 };
  svg.bbox = { x: 0, y: 0, width: 1000, height: 800 };
  svg.rect = { width: 1000, height: 800 };
  svg.getBBox = () => { if (!svg.bbox) throw new Error("not rendered"); return svg.bbox; };
  svg.getBoundingClientRect = () => svg.rect;
  svg.getScreenCTM = () => {
    const c = svg.ctm;
    return c && { a: c.a, inverse: () => ({ apply: (p) => ({ x: (p.x - c.e) / c.a, y: (p.y - c.f) / c.a }) }) };
  };
  svg.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform(m) { return m.apply(this); } });
  return svg;
}

export function makePage({ saved = null, sys = true } = {}) {
  const D = demoData(saved);
  const svg = makeSvg(), doc = makeDocument(), els = [];
  let max = 0;
  JSON.stringify(D.idx, (k, v) => { if (typeof v === "number") max = Math.max(max, v); return v; });
  for (let i = 0; i <= max; i++) els.push(new El("g", doc));
  for (const e of Object.values(D.idx.edges)) if (e.fw !== undefined) {
    const fg = els[e.fw], text = new El("text", doc), paths = [new El("path", doc), new El("path", doc)];
    fg.querySelector = (q) => (q === "text" ? text : null);
    fg.querySelectorAll = () => paths;
    fg.text = text; fg.paths = paths;
  }
  const ctx = { style: "clean", hidden: {}, sel: null, net: null, sys, ready: false };
  const hooks = { getState: null, isEdit: null, fit: null, route: null, title: null, panel: null, beforeSelect: null, pending: null, view: null, viewNode: null, rerender: null };
  const store = new Map();
  const core = { D, svg, els, ctx, hooks, $: (id) => doc.getElementById(id), lsGet: (k) => (store.has(k) ? store.get(k) : null), lsSet: (k, v) => store.set(k, v), lsDel: (k) => store.delete(k), store,
    clipboard: (t, done) => { core.copied = t; done(core.clipOk !== false); }, save: (b, n) => { core.saved = [b, n]; } };
  const skins = { widths: () => ({}), labelWidths: () => ({}), sync: (s) => { skins.synced = s; } };
  const g = { document: doc, location: { search: "" }, requestAnimationFrame: (f) => { g.frames.push(f); return g.frames.length; }, setTimeout: (f, ms) => { g.timers.push([f, ms]); return g.timers.length; }, frames: [], timers: [], innerHeight: 600, innerWidth: 800, structuredClone, Date, clearTimeout, console };
  g.window = g; g.winListeners = {};
  g.addEventListener = (t, f) => (g.winListeners[t] ||= []).push(f);
  g.InfraDiagram = {};
  return { D, svg, doc, els, core, skins, ctx, hooks, g, store };
}

export function loadModel(page) {
  return define("runtime/canvas/model.js", page.g, [page.core, page.skins, geometry]);
}
export function loadZoomPan(page, model) {
  return define("runtime/canvas/zoom-pan.js", page.g, [page.core, model]);
}
export function loadDraw(page, model) {
  return define("runtime/canvas/draw.js", page.g, [page.core, kit, model]);
}
export function loadEdit(page, model, zoomPan, init = { init(o) { init.opts = o; }, editChanged(f) { init.flag = f; } }) {
  const mod = define("runtime/canvas/edit-mode.js", page.g, [page.core, init, model, zoomPan]);
  return { mod, init };
}
export function loadMenu(page, model, networks = { editName: () => {} }) {
  return define("runtime/canvas/context-menu.js", page.g, [page.core, model, networks]);
}
export { clone, El };
