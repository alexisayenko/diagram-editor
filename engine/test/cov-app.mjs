// Boots the real engine/browser/app.js against fake DOM elements, a real on-disk store behind a fake fetch, and a fake diagram frame.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createStore, handleApi } from "../lib/store.mjs";
import { renderDiagram } from "../browser/render.mjs";
import * as tomlWrite from "../parse/toml-write.mjs";
import * as networksAppend from "../parse/networks-append.mjs";
import * as networksName from "../parse/networks-name.mjs";
import * as toml from "../parse/toml.mjs";
import * as types from "../parse/types.mjs";
import * as newDiagram from "../parse/new-diagram.mjs";
import * as importServers from "../parse/import-servers.mjs";
import * as names from "../lib/names.mjs";
import * as diagrams from "../lib/diagrams.mjs";
import * as zip from "../lib/zip.mjs";
import { El, run, flush } from "./cov-dom.mjs";
import { dataOf } from "./cov-canvas.mjs";
import { demo } from "./helpers.mjs";

export { flush };

const MODS = {
  "parse/toml-write.mjs": tomlWrite, "parse/networks-append.mjs": networksAppend, "parse/networks-name.mjs": networksName, "parse/toml.mjs": toml,
  "parse/types.mjs": types, "parse/new-diagram.mjs": newDiagram, "parse/import-servers.mjs": importServers, "lib/names.mjs": names, "lib/diagrams.mjs": diagrams,
  "lib/zip.mjs": zip, "browser/render.mjs": { renderDiagram },
};
const IDS = ["new", "open", "importdiag", "diagfile", "save", "export", "import", "status", "view", "welcome", "op", "oplist", "opq", "opnote", "opclose", "nw", "nwname", "nwmsg", "nwlist", "nwok", "nwtaken", "nwcancel",
  "imp", "impfiles", "implist", "imptype", "impregion", "impinfo", "impok", "impcancel", "hs", "hstext", "hsnote", "hostscript", "hsd", "hsclose"];

export const demoFiles = (folder = "demo") => Object.fromEntries([...demo()].map(([p, t]) => [folder + "/" + p, t]));
export const file = (name, text, size) => ({ name, size: size ?? text.length, text, arrayBuffer: async () => new TextEncoder().encode(text).buffer });
export const binFile = (name, bytes) => ({ name, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });

export async function boot({ files = {}, server = true, mtimes = {}, boot: doBoot = true, autoLoad = true, confirmAnswer = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "diag-app-"));
  const put = (name, text, mtime) => { const p = join(dir, ...name.split("/")); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); if (mtime) utimesSync(p, mtime / 1000, mtime / 1000); };
  for (const [name, text] of Object.entries(files)) put(name, text, mtimes[name.split("/")[0]]);
  const store = createStore(dir);
  const h = { dir, store, put, requests: [], confirms: [], confirmAnswer, downloads: [], copied: [], timers: [], intervals: [], listeners: {}, docListeners: {}, serverUp: server, override: null,
    ctl: { editDirty: false, drawDirty: false, notesDirty: false, serverDirty: false, notesOpen: null, serverOpen: null, notesTexts: null, drawings: [], layout: null, modelOn: false, commits: [], notesMarked: [], drawMarked: 0, selected: [], editClicked: 0, loads: 0 },
    read: (name) => { try { return readFileSync(join(dir, ...name.split("/")), "utf8"); } catch (e) { return null; } } };
  const doc = new El("document");
  doc.body = new El("body", doc);
  const els = {};
  for (const id of IDS) els[id] = Object.assign(new El(id === "view" ? "iframe" : "div", doc), { id });
  els.hs.querySelectorAll = (q) => (q === ".cp" ? h.cps : []);
  h.cps = [Object.assign(new El("button", doc), { id: "cp1" }), Object.assign(new El("button", doc), { id: "cp2" })];
  h.cps[0].dataset.copy = "#hstext"; h.cps[1].dataset.copy = "#hsnote"; h.cps.forEach((b) => { b.textContent = "Copy"; });
  els.hsd.open = true;
  els.implist.querySelectorAll = (q) => (q === "input:not(:checked)" ? els.implist.descendants().filter((e) => e.tagName === "INPUT" && !e.checked) : []);
  els.oplist.querySelector = (q) => (q === "button" ? els.oplist.descendants().find((e) => e.tagName === "BUTTON") ?? null : null);
  els.opq.hidden = true;
  els.nw.hidden = true; els.op.hidden = true; els.imp.hidden = true; els.hs.hidden = true; els.view.hidden = true;
  doc.querySelector = (sel) => {
    if (sel === "#hs .cp") return h.cps[0];
    return sel.startsWith("#") ? (els[sel.slice(1)] ?? null) : null;
  };
  doc.getElementById = (id) => els[id] ?? null;
  doc.addEventListener = (t, f) => {
    h.docListeners[t] ||= [];
    return h.docListeners[t].push(f);
  };
  doc.createElement = (t) => {
    const e = new El(t, doc);
    if (t === "a") e.click = () => { h.downloads.push({ name: e.download, href: e.href, blob: e.blob }); };
    return e;
  };
  doc.execCommand = (c) => {
    h.execCalls = (h.execCalls || 0) + 1;
    if (h.execThrows) throw new Error("denied");
    return h.execOk ?? true;
  };

  const frame = els.view;
  frame.inert = false;
  let srcdoc = "";
  const iframeDoc = { getElementById: (id) => ({ click: () => { h.ctl.editClicked++; } }) };
  frame.contentDocument = iframeDoc;
  const mkModules = (D) => ({
    "canvas/edit-mode": { isDirty: () => h.ctl.editDirty, currentLayout: () => structuredClone(h.ctl.layout ?? D.layout), commit: (l) => { h.ctl.commits.push(l); h.ctl.editDirty = false; } },
    "canvas/model": { state: { get on() { return h.ctl.modelOn; } } },
    "ui/notes-edit": { isDirty: () => h.ctl.notesDirty, texts: () => h.ctl.notesTexts ?? D.notes.map((n) => n.text), finish: () => h.ctl.notesOpen, markSaved: (t) => h.ctl.notesMarked.push(t) },
    "ui/server-edit": { isDirty: () => h.ctl.serverDirty, finish: () => h.ctl.serverOpen },
    "canvas/draw": { isDirty: () => h.ctl.drawDirty, list: () => h.ctl.drawings, markSaved: () => { h.ctl.drawMarked++; } },
  });
  Object.defineProperty(frame, "srcdoc", {
    get: () => srcdoc,
    set: (html) => {
      srcdoc = html;
      h.ctl.loads++;
      if (!autoLoad) return;
      setImmediate(() => h.loadFrame());
    },
  });
  h.loadFrame = (modules) => {
    const D = dataOf(srcdoc);
    h.D = D;
    frame.contentWindow = { InfraDiagram: { modules: modules ?? mkModules(D), select: (k) => h.ctl.selected.push(k) } };
    frame.fire("load");
  };
  h.frame = frame;
  h.els = els;
  h.doc = doc;
  const win = {};
  win.window = win;
  win.addEventListener = (t, f) => {
    h.listeners[t] ||= [];
    return h.listeners[t].push(f);
  };
  win.confirm = (m) => { h.confirms.push(m); return h.confirmAnswer; };
  const apiFetch = async (path, options = {}) => {
    h.requests.push([options.method || "GET", path, options.body]);
    if (!h.serverUp) throw new TypeError("fetch failed");
    if (h.override) { const r = await h.override(path, options); if (r) return r; }
    const r = handleApi(store, { method: options.method || "GET", url: path, headers: { host: "127.0.0.1:8080", "content-type": options.headers?.["Content-Type"] } }, options.body);
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
  Object.assign(win, {
    document: doc, fetch: apiFetch, navigator: { clipboard: { writeText: async (t) => {
      if (h.clipDenied) throw new Error("denied");
      h.copied.push(t);
    } } },
    TextDecoder, TextEncoder, Uint8Array, Map, Set, Blob: class { constructor(parts, o) { this.parts = parts; this.type = o?.type; } },
    URL: { createObjectURL: (b) => { h.lastBlob = b; return "blob:" + h.downloads.length; }, revokeObjectURL: (u) => { h.revoked = u; } },
    setTimeout: (f, ms) => { h.timers.push([f, ms]); return h.timers.length; }, clearTimeout: () => {}, setInterval: (f, ms) => { h.intervals.push([f, ms]); return 1; },
    require: (id) => {
      if (!MODS[id]) throw new Error("no module " + id);
      return MODS[id];
    },
    ASSETS: { cssSvg: "", cssPage: "", js: "" }, HOST_SCRIPT: "#!/bin/sh\necho probe\n", Option: class { constructor(text, value) { this.text = text; this.value = value; } }, structuredClone,
  });
  h.win = win;
  h.$ = (id) => els[id];
  h.status = () => els.status.textContent;
  h.statusError = () => els.status.classes.has("error");
  h.click = async (id) => { els[id].fire("click"); await flush(); };
  h.settle = () => flush();
  h.until = async (cond, ms = 4000) => {
    const t = Date.now();
    const wait = async () => {
      if (cond()) return;
      if (Date.now() - t > ms) throw new Error("timed out");
      await new Promise((r) => setTimeout(r, 3));
      await wait();
    };
    await wait();
    await flush();
  };
  h.act = async (fn) => { els.status.textContent = "…pending"; await fn(); await h.until(() => els.status.textContent !== "…pending"); };
  h.clickAct = (id) => h.act(() => els[id].fire("click"));
  h.start = async () => { run("browser/app.js", win); await flush(); };
  h.files = (folder) => Object.fromEntries(store.list().filter((f) => f.name.startsWith(folder + "/")).map((f) => [f.name, h.read(f.name)]));
  h.serverEditor = () => frame.contentWindow.InfraDiagram.serverEditor;
  h.tick = async () => { h.intervals.forEach(([f]) => f()); await flush(); };
  if (doBoot) await h.start();
  return h;
}
