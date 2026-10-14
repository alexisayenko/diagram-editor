import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readText } from "../lib/util.mjs";
import { fail } from "../lib/errors.mjs";
import { KITS } from "./kits.mjs";

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), "..");

// CSS order is the cascade order.
const CSS = {
  svg: ["tokens", "base", "export", "edges", "chrome", "clean", "dark", "swiss", "os", "groups"].map((f) => `css/svg/${f}.css`),
  page: ["base", "toolbar", "draw", "interaction", "legend", "details", "panels"].map((f) => `css/page/${f}.css`),
};
// Runtime modules in load order; a module may only depend on modules listed before it.
// "ui/keys", "ui/metrics" and "canvas/geometry" are generated from lib/keys.mjs, render/metrics.mjs and render/geometry.mjs (see kits.mjs) so build and edit mode route connections identically.
const RUNTIME = [
  "ui/keys", "ui/metrics", "ui/core", "ui/os-icons", "ui/details", "ui/skins", "ui/panels", "ui/networks", "ui/legend", "ui/selection", "ui/clear-click",
  "ui/export-columns", "ui/copy", "ui/export-image", "ui/init", "ui/scene", "ui/notes-edit", "ui/server-fields", "ui/server-edit",
  "canvas/geometry", "canvas/draw-kit", "canvas/model", "canvas/zoom-pan", "canvas/draw", "canvas/edit-mode", "canvas/context-menu",
];

const load = (f) => readText(join(ENGINE, f));

export const css = (group) => CSS[group].map(load).join("").trim();

const COMMENT = /\/\/[^\n\r]*/g;
const paramName = (mod) => mod.split("/").pop().replace(/-(\w)/g, (_, c) => c.toUpperCase());

const indent = (fn) => fn.toString().split("\n").map((l, i) => (l && i ? "  " + l : l)).join("\n");
const argSource = (a) => ("kit" in a ? `(${indent(a.kit)})()` : JSON.stringify(a.json));

const kitSource = (name, { fn, args = [], names }) => {
  const exportList = names.map((n) => `${n}: kit.${n}`).join(", ");
  return `InfraDiagram.define("${name}", [], function () {\n  var kit = (${indent(fn)})(${args.map(argSource).join(", ")});\n\n  return { ${exportList} };\n});`;
};

// Every module runs in its own scope: its top-level helpers are private and InfraDiagram.define is the only export.
export const wrapModule = (src) => `(function () { ${src}\n})();`;

// Each module file is optional private helpers, then
// InfraDiagram.define("<name>", [deps], function ({ <params> }) { ... return { exports }; });
function parseModule(name, src, file) {
  const at = `${file}: `;
  if (/<\/script/i.test(src)) fail(at + 'contains "</script"');
  const start = src.search(/^InfraDiagram\.define\(/m);
  if (start < 0) fail(at + 'must contain InfraDiagram.define("<name>", [<deps>], function ({ <params> }) { at the start of a line');
  const preamble = src.slice(0, start), rest = src.slice(start);
  const head = rest.match(/^InfraDiagram\.define\("([^"]+)", \[([^\]]*)\], function \((?:\{ ([^}]*) \})?\) \{\n/);
  if (!head) fail(at + 'must define InfraDiagram.define("<name>", [<deps>], function ({ <params> }) {');
  if (head[1] !== name) fail(at + `defines "${head[1]}", expected "${name}"`);
  const tail = rest.match(/\n {2}return \{([^}]*)\};\n\}\);$/);
  if (!tail) fail(at + 'must end with "  return { ... };" and "});"');
  const deps = head[2].trim() ? head[2].split(",").map((d) => d.trim().replace(/^"(.*)"$/, "$1")) : [];
  const params = head[3]?.trim() ? head[3].split(",").map((p) => p.trim()) : [];
  if (params.length !== deps.length) fail(at + `${deps.length} dependencies but ${params.length} parameters`);
  deps.forEach((d, i) => {
    if (params[i] !== paramName(d)) fail(at + `parameter for "${d}" must be named ${paramName(d)}, got ${params[i]}`);
  });
  const exports = tail[1].trim() ? tail[1].split(",").map((p) => p.split(":")[0].trim()) : [];
  const body = (preamble + rest.slice(head[0].length, rest.length - tail[0].length)).replaceAll(COMMENT, "");
  return { name, file, src, deps, exports, body };
}

function checkDeclared(m, byName) {
  const at = `${m.file}: `;
  for (const d of m.deps) {
    if (!RUNTIME.includes(d)) fail(at + `depends on "${d}", which is not a runtime module (engine/page/assets.mjs RUNTIME)`);
    if (!byName.has(d)) fail(at + `depends on "${d}", which loads after it; move "${d}" before "${m.name}" in RUNTIME`);
    const p = paramName(d), used = new Set([...m.body.matchAll(new RegExp(String.raw`(?<![\w$.])${p}\.([A-Za-z_$][\w$]*)`, "g"))].map((x) => x[1]));
    if (!used.size) fail(at + `declares "${d}" but never uses it`);
    for (const u of used) {
      if (!byName.get(d).exports.includes(u)) fail(at + `uses ${p}.${u}, which "${d}" does not export`);
    }
  }
}

function checkUndeclared(m) {
  const at = `${m.file}: `;
  for (const other of RUNTIME) {
    const p = paramName(other);
    if (other === m.name || m.deps.includes(other)) continue;
    if (new RegExp(String.raw`(?<![\w$.])${p}\.[A-Za-z_$]`).test(m.body)) fail(at + `uses ${p}.* without declaring "${other}" as a dependency`);
  }
}

function checkModules(mods) {
  const byName = new Map();
  for (const m of mods) {
    checkDeclared(m, byName);
    checkUndeclared(m);
    byName.set(m.name, m);
  }
}

const moduleSource = (name) => (KITS[name] ? kitSource(name, KITS[name]) : load(`runtime/${name}.js`).trim());
const moduleFile = (name) => (KITS[name] ? KITS[name].file : `engine/runtime/${name}.js`);

// Every runtime module in load order as the page runs it, with the file it comes from.
export const runtimeModules = () => RUNTIME.map((name) => ({ name, file: moduleFile(name), source: wrapModule(moduleSource(name)) }));

// One <script> body: the define() loader, then every module in RUNTIME order.
export function script() {
  const mods = RUNTIME.map((name) => parseModule(name, moduleSource(name), moduleFile(name)));
  checkModules(mods);
  return [load("runtime/define.js").trim(), ...mods.map((m) => wrapModule(m.src))].join("\n\n");
}
