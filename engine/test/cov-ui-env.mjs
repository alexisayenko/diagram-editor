import { keysKit } from "../lib/keys.mjs";
import { METRICS, metricsKit } from "../render/metrics.mjs";
import { readFileSync } from "node:fs";
import { osIconKit } from "../render/os-icons.mjs";
import { serverFieldsKit } from "../model/server-fields.mjs";
import { Script, createContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { datasetOf } from "./dataset-stub.mjs";

const VOID = new Set(["input", "br", "hr", "img", "meta", "link"]);
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const entity = (m, e) => {
  if (e[0] !== "#") return ENT[e] ?? m;
  const hex = e[1].toLowerCase() === "x";
  return String.fromCodePoint(hex ? Number.parseInt(e.slice(2), 16) : +e.slice(1));
};
const unesc = (s) => s.replaceAll(/&(#x?[0-9a-f]+|\w+);/gi, entity);
const escText = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const escAttr = (s) => escText(s).replaceAll('"', "&quot;");

function parseCompound(t, comb) {
  const c = { tag: null, id: null, cls: [], attrs: [], pseudo: [], comb };
  for (const m of t.matchAll(/([#.]?[\w-]+)|\[([\w-]+)(?:=("?)([^\]"]*)\3)?\]|:([\w-]+)/g)) {
    if (m[1]) { if (m[1][0] === "#") c.id = m[1].slice(1); else if (m[1][0] === ".") c.cls.push(m[1].slice(1)); else c.tag = m[1].toLowerCase(); }
    else if (m[2]) c.attrs.push([m[2], m[4]]);
    else if (m[5]) c.pseudo.push(m[5]);
  }
  return c;
}
function parseSelector(sel) {
  return sel.split(",").map((s) => s.trim()).filter(Boolean).map((part) => {
    const toks = part.match(/(?:\[[^\]]*\]|[^\s>[])+|>/g), comps = [];
    let comb = " ";
    for (const t of toks) {
      if (t === ">") { comb = ">"; continue; }
      comps.push(parseCompound(t, comb));
      comb = " ";
    }
    return comps;
  });
}
function matchCompound(el, c) {
  if (c.tag && el.tagName.toLowerCase() !== c.tag) return false;
  if (c.id && el.id !== c.id) return false;
  if (!c.cls.every((k) => el.classList.contains(k))) return false;
  if (!c.attrs.every(([n, v]) => el.attrs.has(n) && (v === undefined || el.attrs.get(n) === v))) return false;
  return c.pseudo.every((p) => {
    const sib = el.parentNode ? el.parentNode.children : [];
    if (p === "first-child") return sib[0] === el;
    if (p === "last-child") return sib.at(-1) === el;
    if (p === "focus-visible" || p === "focus") return el.ownerDocument?.activeElement === el && el.keyboardFocus !== false;
    return false;
  });
}
function matchAt(el, comps, i) {
  if (!matchCompound(el, comps[i])) return false;
  if (i === 0) return true;
  if (comps[i].comb === ">") return el.parentNode?.nodeType === 1 && matchAt(el.parentNode, comps, i - 1);
  for (let p = el.parentNode; p?.nodeType === 1; p = p.parentNode) if (matchAt(p, comps, i - 1)) return true;
  return false;
}

function detach(n) {
  const i = n.parentNode ? n.parentNode.childNodes.indexOf(n) : -1;
  if (i >= 0) n.parentNode.childNodes.splice(i, 1);
  n.parentNode = null;
}

export class TextNode {
  nodeType = 3;
  parentNode = null;
  constructor(t) { this.nodeValue = t; }
  [Symbol.for("nodejs.util.inspect.custom")]() { return "#text(" + this.nodeValue + ")"; }
  get textContent() { return this.nodeValue; }
  set textContent(v) { this.nodeValue = v; }
  get outerHTML() { return escText(this.nodeValue); }
  cloneNode() { return new TextNode(this.nodeValue); }
  remove() { detach(this); }
}

export class Element {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase();
    this.nodeType = 1;
    this.ownerDocument = doc;
    this.parentNode = null;
    this.childNodes = [];
    this.attrs = new Map();
    this.listeners = {};
    this.style = { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } };
    this.hidden = false;
    this.clicks = 0;
  }
  [Symbol.for("nodejs.util.inspect.custom")]() { return "<" + this.tagName.toLowerCase() + (this.id ? "#" + this.id : "") + ">"; }
  get id() { return this.attrs.get("id") || ""; }
  set id(v) { this.attrs.set("id", String(v)); }
  get className() { return this.attrs.get("class") || ""; }
  set className(v) { this.attrs.set("class", String(v)); }
  get classList() {
    const arr = () => this.className.split(/\s+/).filter(Boolean);
    const set = (a) => { if (a.length) this.attrs.set("class", a.join(" ")); else this.attrs.delete("class"); };
    const api = {
      add(...c) { const a = arr(); c.forEach((x) => { if (!a.includes(x)) a.push(x); }); set(a); },
      remove(...c) { set(arr().filter((x) => !c.includes(x))); },
      contains: (c) => arr().includes(c),
      toggle(c, f) {
        const on = f === undefined ? !arr().includes(c) : !!f;
        if (on) api.add(c);
        else api.remove(c);
        return on;
      },
    };
    return api;
  }
  get dataset() {
    return datasetOf(this.attrs);
  }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  hasAttribute(k) { return this.attrs.has(k); }
  _adopt(n) {
    n.remove();
    n.parentNode = this;
  }
  appendChild(n) {
    if (n.nodeType === 11) { [...n.childNodes].forEach((c) => this.appendChild(c)); return n; }
    this._adopt(n);
    this.childNodes.push(n);
    return n;
  }
  insertBefore(n, ref) {
    if (!ref) return this.appendChild(n);
    if (n.nodeType === 11) { [...n.childNodes].forEach((c) => this.insertBefore(c, ref)); return n; }
    this._adopt(n);
    this.childNodes.splice(this.childNodes.indexOf(ref), 0, n);
    return n;
  }
  removeChild(n) {
    const i = this.childNodes.indexOf(n);
    if (i >= 0) this.childNodes.splice(i, 1);
    n.parentNode = null;
    return n;
  }
  replaceChild(n, old) { this.insertBefore(n, old); old.remove(); return old; }
  replaceChildren(...nodes) { [...this.childNodes].forEach((c) => c.remove()); nodes.forEach((n) => this.appendChild(n)); }
  remove() { detach(this); }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes.at(-1) || null; }
  get firstElementChild() { return this.children[0] || null; }
  get nextSibling() { const s = this.parentNode?.childNodes; return s ? s[s.indexOf(this) + 1] || null : null; }
  get previousElementSibling() { const s = this.parentNode?.children; return s ? s[s.indexOf(this) - 1] || null : null; }
  get nextElementSibling() { const s = this.parentNode?.children; return s ? s[s.indexOf(this) + 1] || null : null; }
  contains(n) {
    for (; n; n = n.parentNode) {
      if (n === this) return true;
    }
    return false;
  }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(""); }
  set textContent(v) {
    [...this.childNodes].forEach((c) => c.remove());
    if (v !== "" && v !== null && v !== undefined) this.appendChild(new TextNode(String(v)));
  }
  get innerHTML() { return this.childNodes.map((c) => c.outerHTML).join(""); }
  set innerHTML(h) { [...this.childNodes].forEach((c) => c.remove()); parseInto(this, String(h), this.ownerDocument); }
  get outerHTML() {
    const a = [...this.attrs].map(([k, v]) => " " + k + '="' + escAttr(v) + '"').join("");
    const t = this.tagName.toLowerCase();
    return VOID.has(t) ? "<" + t + a + ">" : "<" + t + a + ">" + this.innerHTML + "</" + t + ">";
  }
  insertAdjacentHTML(pos, html) {
    const f = new Fragment(this.ownerDocument);
    parseInto(f, html, this.ownerDocument);
    if (pos === "beforeend") this.appendChild(f);
    else if (pos === "afterbegin") this.insertBefore(f, this.firstChild);
    else if (pos === "afterend") this.parentNode.insertBefore(f, this.nextSibling);
    else this.parentNode.insertBefore(f, this);
  }
  cloneNode(deep) {
    const c = new Element(this.tagName, this.ownerDocument);
    this.attrs.forEach((v, k) => c.attrs.set(k, v));
    if (deep) this.childNodes.forEach((n) => c.appendChild(n.cloneNode(true)));
    return c;
  }
  _all(out = []) { this.childNodes.forEach((n) => { if (n.nodeType === 1) { out.push(n); n._all(out); } }); return out; }
  querySelectorAll(sel) { const s = parseSelector(sel); return this._all().filter((e) => s.some((c) => matchAt(e, c, c.length - 1))); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  matches(sel) { return parseSelector(sel).some((c) => matchAt(this, c, c.length - 1)); }
  closest(sel) {
    if (this.matches(sel)) return this;
    return this.parentNode?.nodeType === 1 ? this.parentNode.closest(sel) : null;
  }
  addEventListener(t, f) {
    this.listeners[t] ||= [];
    this.listeners[t].push(f);
  }
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter((x) => x !== f); }
  dispatchEvent(ev) {
    ev.target ||= this;
    for (const n of ancestors(this)) {
      if (ev.cancelBubble) break;
      ev.currentTarget = n;
      (n.listeners?.[ev.type] || []).slice().forEach((f) => f.call(n, ev));
      if (ev.bubbles === false) break;
    }
    return !ev.defaultPrevented;
  }
  focus() {
    const doc = this.ownerDocument, prev = doc.activeElement;
    if (prev === this) return;
    if (prev) prev.dispatchEvent(makeEvent("focusout", { target: prev }));
    doc.activeElement = this;
    this.dispatchEvent(makeEvent("focusin", { target: this }));
  }
  blur() {
    const doc = this.ownerDocument;
    if (doc.activeElement !== this) return;
    doc.activeElement = null;
    this.dispatchEvent(makeEvent("focusout", { target: this }));
  }
  showModal() {
    if (this.tagName !== "DIALOG") throw new Error("showModal needs a dialog");
    if (this.open) throw new Error("InvalidStateError: already open");
    this.open = true;
    this.modal = true;
    this.previousFocus = this.ownerDocument.activeElement;
  }
  close(value) {
    if (!this.open) return;
    this.open = false;
    this.modal = false;
    this.returnValue = value ?? "";
    this.dispatchEvent(makeEvent("close", { bubbles: false }));
  }
  select() { this.selected = true; }
  scrollIntoView(o) { this.scrolled = o; }
  getBoundingClientRect() { return this.rect || { top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20 }; }
  get offsetWidth() { return this.ow || 0; }
  getComputedTextLength() { return this.tl || 0; }
  getScreenCTM() { return this.ctm || null; }
  click() {
    this.clicks++;
    if (this.tagName === "A") this.ownerDocument.downloads.push({ href: this.href, download: this.download });
    else this.dispatchEvent(makeEvent("click"));
  }
  getContext() { return { drawImage: (...a) => { this.ownerDocument.draws.push(a); } }; }
  toBlob(cb, type) { cb(this.ownerDocument.nullBlob ? null : new FakeBlob(["png"], { type })); }
}

class Fragment extends Element {
  constructor(doc) { super("#fragment", doc); this.nodeType = 11; }
}

export class FakeBlob {
  constructor(parts, opts = {}) { this.parts = parts; this.type = opts.type; }
}

class Document extends Element {
  constructor() {
    super("#document", null);
    this.nodeType = 9;
    this.ownerDocument = this;
    this.downloads = [];
    this.draws = [];
  }
  createElement(t) { return new Element(t, this); }
  createElementNS(ns, t) { return new Element(t, this); }
  createTextNode(t) { return new TextNode(String(t)); }
  createDocumentFragment() { return new Fragment(this); }
  getElementById(id) { return this._all().find((e) => e.id === id) || null; }
  createTreeWalker(root) {
    const list = [];
    (function walk(n) { n.childNodes.forEach((c) => { if (c.nodeType === 3) list.push(c); else walk(c); }); })(root);
    let i = 0;
    return { nextNode: () => list[i++] || null };
  }
  execCommand() { return true; }
}

function* ancestors(start) {
  for (let n = start; n; n = n.parentNode) yield n;
}

function parseInto(parent, html, doc) {
  const re = /<!--[\s\S]*?-->|<\/([\w-]+)\s*>|<([\w-]+)((?:\s+[\w:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  const stack = [parent];
  for (const m of html.matchAll(re)) {
    const top = stack.at(-1);
    if (m[5] !== undefined) top.appendChild(new TextNode(unesc(m[5])));
    else if (m[1]) {
      const i = stack.map((e) => e.tagName?.toLowerCase()).lastIndexOf(m[1].toLowerCase());
      if (i > 0) stack.length = i;
    } else if (m[2]) {
      const el = doc.createElement(m[2]);
      for (const a of (m[3] || "").matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) el.attrs.set(a[1], unesc(a[2] ?? a[3] ?? a[4] ?? ""));
      top.appendChild(el);
      if (!VOID.has(m[2].toLowerCase()) && !m[4]) stack.push(el);
    }
  }
}

export function makeEvent(type, props = {}) {
  return { type, bubbles: true, defaultPrevented: false, cancelBubble: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.cancelBubble = true; }, ...props };
}

export function makeDom(html) {
  const doc = new Document();
  const root = doc.createElement("html"), body = doc.createElement("body");
  doc.appendChild(root);
  root.appendChild(body);
  body.innerHTML = html;
  doc.documentElement = root;
  doc.body = body;
  return doc;
}

export function makeStorage({ throws = false, data = {} } = {}) {
  const m = new Map(Object.entries(data));
  const guard = () => { if (throws) throw new Error("storage blocked"); };
  return {
    map: m,
    getItem: (k) => { guard(); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { guard(); m.set(k, String(v)); },
    removeItem: (k) => { guard(); m.delete(k); },
  };
}

const UI = fileURLToPath(new URL("../runtime/ui/", import.meta.url));

// Loads real runtime/ui files into a fresh vm context with the DOM stub, with the file path as the script filename so coverage is measured.
export function loadUi(names, { D, html, storage, stubs = {}, globals = {}, confirm = () => true } = {}) {
  const doc = makeDom(html);
  if (D) doc.getElementById("layout-data").textContent = JSON.stringify(D);
  const timers = [], winListeners = {}, urls = [];
  const sandbox = {
    document: doc, localStorage: storage || makeStorage(), navigator: {}, innerWidth: 1200, innerHeight: 800,
    NodeFilter: { SHOW_TEXT: 4 }, Blob: FakeBlob, XMLSerializer: class { serializeToString(n) { return n.outerHTML; } },
    URL: Object.assign(function URL() {}, { createObjectURL: (b) => { urls.push(b); return "blob:test/" + urls.length; }, revokeObjectURL() {} }),
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].f = null; },
    addEventListener: (t, f) => { winListeners[t] ||= []; winListeners[t].push(f); },
    getSelection: () => null, confirm: (m) => { sandbox.confirmed.push(m); return confirm(m); }, confirmed: [],
    location: { search: "", href: "http://localhost/diagram.html" },
    ...globals,
  };
  sandbox.window = sandbox;
  const modules = {};
  const define = (name, deps, fn) => { modules[name] = fn(...deps.map(load)); };
  sandbox.InfraDiagram = { modules, define };
  function load(name) {
    if (name in stubs) return stubs[name];
    if (name in modules) return modules[name];
    if (name === "ui/keys") { modules[name] = keysKit(); return modules[name]; }
    if (name === "ui/metrics") { modules[name] = metricsKit(METRICS); return modules[name]; }
    if (name === "ui/os-icons") { modules[name] = osIconKit(); return modules[name]; }
    if (name === "ui/server-fields") { modules[name] = serverFieldsKit(); return modules[name]; }
    const file = UI + name.replace(/^ui\//, "") + ".js";
    new Script(readFileSync(file, "utf8"), { filename: file }).runInContext(vmCtx); // NOSONAR: test harness evaluates this repository's own sources to measure coverage
    return modules[name];
  }
  const vmCtx = createContext(sandbox);
  names.forEach(load);
  const $ = (id) => doc.getElementById(id);
  const fire = (target, type, props) => target.dispatchEvent(makeEvent(type, props));
  const flush = () => { const t = timers.splice(0); t.forEach((x) => x.f?.()); return t.length; };
  return { doc, sandbox, modules, $, fire, timers, flush, winListeners, urls, ID: sandbox.InfraDiagram };
}

const CHROME_HTML = `<div id="ta"></div><div id="rc"></div><div id="lc"></div><div id="tm"></div><div id="ch"></div>
<div id="np"><button id="nh" aria-expanded="true"></button><div id="nl"></div></div>
<div id="dp"><button id="dh" aria-expanded="true"></button><div id="dl"></div></div>
<div id="lp"><button id="lh" aria-expanded="true"></button><div id="lb"><div id="lg"></div><div class="lk"></div></div></div>
<div id="wp"><button id="wh" aria-expanded="true"></button><div id="wb"><div id="wl"></div><button id="wr">Reset</button></div></div>
<div id="ss"><button data-s="sketch"></button><button data-s="clean"></button><button data-s="dark"></button><button data-s="swiss"></button></div>
<button id="xs"></button><button id="xp"></button>
<div id="pn" hidden><button id="pc">Close</button></div>
<script id="layout-data"></script><style id="css-svg"></style>`;

// Fixture: two servers (a in region r1, b outside), one network, two edges; svg children indices match D.idx.
export function fixture(over = {}) {
  const t = (idx, cls, tx) => `<text class="${cls}" data-ent="n:${idx}" data-tk="${idx === "a" ? "web" : "db"}">${tx}</text>`;
  const svgHtml = `<svg viewBox="0 0 600 400" class="s-clean">
<defs></defs>
<g id="ca" data-ent="n:a" data-tk="web"></g>
${t("a", "nt", "Service A")}
<text class="ipt" data-ent="n:a" data-tk="web">192.0.2.10</text>
<g class="nwb" data-n="0" data-ent="n:a"></g>
<g id="oa" data-ent="n:a"><rect></rect><text class="ost" data-t="Ubuntu 24.04" x="16">Ubuntu 24.04</text></g>
<g id="cb" data-ent="n:b" data-tk="db"></g>
${t("b", "nt", "Service B")}
<text class="ipt" data-ent="n:b" data-tk="db">192.0.2.20</text>
<g id="cr" data-ent="c:r1"></g>
<text id="el1" data-ent="e:1" data-tk="lv:server g:x">link</text>
<rect id="lp1"></rect>
</svg>`;
  const D = {
    id: "d1", types: [{ k: "web", ty: "web", label: "Web" }, { k: "db", ty: "db", label: "Database", dash: true, infra: true }],
    edgeSwitches: [{ k: "lv:server", label: "Servers" }, { k: "g:x", g: "x", label: "Group X" }],
    edgeKey: [["<path/>", "Link"]],
    notes: [{ title: "First note", date: "2026-01-02", paras: ["Body one"], text: "First note\nDate: 2026-01-02\n\nBody one" }],
    ent: {
      "n:a": { title: "Service A", tag: "WEB", ty: "web", body: ["Line 1"], ip: ["192.0.2.10"], cl: "r1", os: { v: "Ubuntu 24.04", d: "Ubuntu 24.04 LTS", eol: "2029-04" }, hwc: [["cpu", "4"], ["ram", "8G"]], db: false },
      "n:b": { title: "Service B", tag: "DB", ty: "db", body: [], ip: ["192.0.2.20"], db: true },
      "c:r1": { title: "Region 1", tag: "REGION", ty: "region" },
    },
    sections: { "Service A": "Intro **bold** and `code`.\n\n- one\n- two\n\n| Confluence | [Page](https://wiki.example.test/a) |\n| K | V |", "Region 1": "Region text" },
    kids: { r1: ["a"] },
    edges: [{ k: "1", from: "n:a", to: "n:b" }, { k: "2", from: "n:b", to: "c:r1" }],
    nets: [{ cidr: "192.0.2.0/24", name: "Net One", m: ["n:a", "n:b"] }, { cidr: "198.51.100.0/24", name: "", m: ["n:b"] }],
    ipNet: { "192.0.2.10": 0 },
    idx: {
      nodes: { a: { c: 0, t: 1, i: [2], w: [3], o: 4 }, b: { c: 5, t: 6, i: [7], w: [-1] } },
      clusters: { r1: [0, 0, 8] },
      edges: { "1": { l: 9, lp: 10 }, "2": { l: -1 } },
    },
    layout: { nodes: { a: { x: 10, y: 20, w: 120, h: 80, ip: [[20, 90]], body: [[20, 50]], title: [20, 36] }, b: { x: 200, y: 20, w: 120, h: 60, ip: [[210, 70]], body: [], title: [210, 36] } } },
    meta: { nodes: { a: { hw: "4 cpu · 8G ram", os: 1, nj: 0 }, b: {} } },
    ...over,
  };
  const html = CHROME_HTML + svgHtml;
  return { D, html };
}

export function setService(core, name, fn) {
  core.revoke(name);
  if (fn) core.provide(name, fn);
}
