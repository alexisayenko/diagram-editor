// Runs the real runtime modules (each from its own file, so coverage is attributed) against the mini DOM, on the body of a real rendered page.
import { Script, createContext } from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runtimeModules } from "../page/assets.mjs";
import { renderDiagram } from "../browser/render.mjs";
import { makeDom, makeStorage, FakeBlob, makeEvent } from "./cov-ui-env.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DEFINE = fileURLToPath(new URL("../runtime/define.js", import.meta.url));

export const ASSETS = { cssSvg: ".svg{}", cssPage: ".page{}", js: "" };

export const render = (files, saved = null, refit = [], routeCache = null, folder = "demo") => renderDiagram(files, folder, saved, ASSETS, refit, routeCache);

const bodyOf = (html) => html.slice(html.indexOf("<body>") + 6, html.indexOf('<script type="application/json"'));

// A page for `result` (a renderDiagram result): the document with the scene, the runtime started, ready for clicks.
export function bootPage(result, { storage = makeStorage(), fileBacked = true, search = "", host = null, bbox = { x: 0, y: 0, width: 1000, height: 800 } } = {}) {
  const doc = makeDom(bodyOf(result.html));
  const data = doc.createElement("script"), style = doc.createElement("style");
  data.id = "layout-data";
  data.textContent = result.scene.data;
  style.id = "css-svg";
  style.textContent = result.scene.cssSvg;
  doc.body.appendChild(data);
  doc.body.appendChild(style);
  doc.title = result.scene.title;
  const svg = doc.querySelector("svg"), timers = [], winListeners = {}, errors = [];
  svg.getBBox = () => bbox;
  svg.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform: (m) => m });
  svg.getBoundingClientRect = () => ({ top: 0, left: 0, right: 1000, bottom: 800, width: 1000, height: 800 });
  const sandbox = {
    document: doc, localStorage: storage, navigator: {}, innerWidth: 1200, innerHeight: 800, structuredClone, Date, console: { ...console, error: (...a) => errors.push(a) },
    NodeFilter: { SHOW_TEXT: 4 }, Blob: FakeBlob, XMLSerializer: class { serializeToString(n) { return n.outerHTML; } },
    URL: Object.assign(function URL() {}, { createObjectURL: () => "blob:test", revokeObjectURL() {} }),
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout() {},
    addEventListener: (t, f) => { (winListeners[t] ||= []).push(f); }, getSelection: () => null,
    confirm: () => true, location: { search, href: "http://localhost/diagram.html" }, requestAnimationFrame: (f) => { timers.push({ f, ms: 0 }); return timers.length; },
  };
  sandbox.window = sandbox;
  if (fileBacked) sandbox.InfraDiagramFileBacked = true;
  const vm = createContext(sandbox);
  new Script(readFileSync(DEFINE, "utf8"), { filename: pathToFileURL(DEFINE).href }).runInContext(vm); // NOSONAR: test harness evaluates this repository's own source to measure coverage
  const I = sandbox.InfraDiagram;
  for (const m of runtimeModules()) new Script(m.source, { filename: pathToFileURL(ROOT + m.file).href }).runInContext(vm); // NOSONAR: test harness evaluates this repository's own sources to measure coverage
  if (host) I.attachHost(host);
  const $ = (id) => doc.getElementById(id), core = I.modules["ui/core"];
  const click = (el) => el.dispatchEvent(makeEvent("click", { target: el }));
  return { doc, I, core, $, svg, sandbox, storage, timers, errors, winListeners, click, M: I.modules, result };
}

// What a full page and a swapped page must share: the scene's parts of the document and the data.
// loose: the order of attributes and classes is not compared (a state entered after the load, like edit mode, sets them in another order than a swap does).
const sorted = (html) => html.replaceAll(/<([\w-]+)((?:\s+[\w:-]+="[^"]*")+)/g, (m, tag, attrs) => "<" + tag + [...attrs.matchAll(/\s+([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => " " + k + '="' + (k === "class" ? v.split(" ").sort().join(" ") : v) + '"').sort().join(""));
export function sceneView(p, { loose = false } = {}) {
  const html = (id) => p.$(id)?.innerHTML ?? null, flat = loose ? sorted : (h) => h;
  return {
    svg: flat(p.svg.outerHTML), data: JSON.stringify(p.core.D), css: p.$("css-svg").textContent, title: p.doc.title,
    legend: html("lb"), nets: html("wl"), notes: html("nl"), notesButton: p.$("nh").textContent, docs: html("dl"), details: p.$("pn").outerHTML,
  };
}

export const swap = (p, result) => p.I.replaceScene(result.scene);

// Where two scene views first differ, short enough to read in a failure: [part, index, a-excerpt, b-excerpt], or [].
export function sceneDiff(a, b) {
  return Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => {
    let i = 0;
    const n = Math.min(String(a[k]).length, String(b[k]).length);
    while (i < n && a[k][i] === b[k][i]) i++;
    return [k, i, String(a[k]).slice(Math.max(0, i - 30), i + 60), String(b[k]).slice(Math.max(0, i - 30), i + 60)];
  });
}
