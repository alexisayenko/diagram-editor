// Browser stubs for loading runtime modules with the real source (filename set, so coverage is measured).
import { readFileSync } from "node:fs";
import { Script, createContext } from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENGINE = fileURLToPath(new URL("..", import.meta.url));

export class El {
  constructor(tag = "div", doc = null) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.attrs = {};
    this.listeners = {};
    this.children = [];
    this.options = [];
    this.text = "";
    this.parent = null;
    this.style = {};
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = "";
    this.innerHTML = "";
    this.isContentEditable = false;
    this.focused = 0;
    this.open = false;
    this.removed = false;
    this.classes = new Set();
    const set = this.classes;
    this.classList = {
      add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c),
      toggle: (c, f) => {
        const on = f === undefined ? !set.has(c) : !!f;
        if (on) set.add(c);
        else set.delete(c);
        return on;
      },
    };
    this.offsetWidth = 100;
    this.offsetHeight = 30;
    this.captured = [];
  }
  get textContent() { return this.text; }
  set textContent(v) { this.text = String(v); this.children = []; this.options = []; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === "id") this.id = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, f, o) {
    this.listeners[t] ||= [];
    this.listeners[t].push(f);
  }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  append(...cs) { cs.forEach((c) => this.appendChild(typeof c === "string" ? Object.assign(new El("#text"), { textContent: c }) : c)); }
  add(o) { this.options.push(o); }
  descendants() { return this.children.flatMap((c) => [c, ...(c.descendants ? c.descendants() : [])]); }
  remove() {
    this.removed = true;
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  contains(t) { return t === this || this.children.some((c) => c.contains?.(t)); }
  focus() { this.focused++; }
  select() { this.selected = true; }
  showModal() {
    if (this.tagName !== "DIALOG") throw new Error("showModal needs a dialog");
    if (this.open) throw new Error("InvalidStateError: already open");
    this.open = true;
    this.modal = true;
  }
  close(value) {
    if (!this.open) return;
    this.open = false;
    this.modal = false;
    this.returnValue = value ?? "";
    this.fire("close");
  }
  pressEscape() {
    if (this.open && !this.fire("cancel").defaultPrevented) this.close();
  }
  click() { this.fire("click"); }
  closest(sel) { return this.matches?.(sel) ?? null; }
  setPointerCapture(id) { this.captured.push(id); }
  fire(type, ev = {}) {
    const e = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, stopImmediatePropagation() { this.stopped = true; }, ...ev };
    for (const f of this.listeners[type] || []) { f(e); if (e.stopped) break; }
    return e;
  }
  async fireAsync(type, ev = {}) { const r = this.fire(type, ev); await flush(); return r; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

export const flush = async (n = 8) => {
  let p = Promise.resolve();
  for (let i = 0; i < n; i++) p = p.then(() => new Promise((r) => setImmediate(r)));
  await p;
};

export function run(rel, globals, base = ENGINE) {
  const file = base + rel;
  const ctx = createContext(globals);
  new Script(readFileSync(file, "utf8"), { filename: pathToFileURL(file).href }).runInContext(ctx); // NOSONAR: test harness evaluates this repository's own sources to measure coverage
  return ctx;
}

export function define(rel, globals, deps = []) {
  let mod;
  const InfraDiagram = globals.InfraDiagram ||= {};
  InfraDiagram.define = (n, d, f) => { mod = f(...deps); };
  run(rel, globals);
  return mod;
}

export const clone = (o) => structuredClone(o);

export const plain = (v) => structuredClone(v);
