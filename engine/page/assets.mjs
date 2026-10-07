import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fail, readText } from "../lib/util.mjs";
import { geometryKit } from "../render/geometry.mjs";
import { drawKit } from "../render/draw-kit.mjs";

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), "..");

// CSS order is the cascade order.
const CSS = {
  svg: ["tokens", "base", "export", "edges", "chrome", "clean", "dark", "swiss", "os", "groups"].map((f) => `css/svg/${f}.css`),
  page: ["base", "toolbar", "draw", "interaction", "legend", "details", "panels"].map((f) => `css/page/${f}.css`),
};
// Runtime modules in load order; a module may only depend on modules listed before it.
// "canvas/geometry" is generated from render/geometry.mjs (geometryKit) so build and edit mode route connections identically.
const RUNTIME = [
  "ui/core", "ui/details", "ui/skins", "ui/panels", "ui/networks", "ui/legend", "ui/selection",
  "ui/export-columns", "ui/copy", "ui/export-image", "ui/init", "ui/notes-edit", "ui/server-edit",
  "canvas/geometry", "canvas/draw-kit", "canvas/model", "canvas/zoom-pan", "canvas/draw", "canvas/edit-mode",
];

const load = (f) => readText(join(ENGINE, f));

export const css = (group) => CSS[group].map(load).join("").trim();

const paramName = (mod) => mod.split("/").pop().replace(/-(\w)/g, (_, c) => c.toUpperCase());

const kitSource = (name, fn, names) =>
  `InfraDiagram.define("${name}", [], function () {\n  var kit = (` +
  fn.toString().split("\n").map((l, i) => (l && i ? "  " + l : l)).join("\n") +
  `)();\n\n  return { ${names.map((n) => `${n}: kit.${n}`).join(", ")} };\n});`;
const GENERATED = {
  "canvas/geometry": { fn: geometryKit, file: "engine/render/geometry.mjs (geometryKit)", names: ["boxExtent", "fitBox", "fitRegion", "route", "problems"] },
  "canvas/draw-kit": { fn: drawKit, file: "engine/render/draw-kit.mjs (drawKit)", names: ["decimate", "smoothPath", "distToStroke", "hits", "hitIndex", "history", "validate", "pathMarkup", "markup", "newId"] },
};

// Each module file is exactly: InfraDiagram.define("<name>", [deps], function (<params>) { ... return { exports }; });
function parseModule(name, src, file) {
  const at = `${file}: `;
  if (/<\/script/i.test(src)) fail(at + 'contains "</script"');
  const head = src.match(/^InfraDiagram\.define\("([^"]+)", \[([^\]]*)\], function \(([^)]*)\) \{\n/);
  if (!head) fail(at + 'must start with InfraDiagram.define("<name>", [<deps>], function (<params>) {');
  if (head[1] !== name) fail(at + `defines "${head[1]}", expected "${name}"`);
  const tail = src.match(/\n {2}return \{([^}]*)\};\n\}\);$/);
  if (!tail) fail(at + 'must end with "  return { ... };" and "});"');
  const deps = head[2].trim() ? head[2].split(",").map((d) => d.trim().replace(/^"(.*)"$/, "$1")) : [];
  const params = head[3].trim() ? head[3].split(",").map((p) => p.trim()) : [];
  if (params.length !== deps.length) fail(at + `${deps.length} dependencies but ${params.length} parameters`);
  deps.forEach((d, i) => {
    if (params[i] !== paramName(d)) fail(at + `parameter for "${d}" must be named ${paramName(d)}, got ${params[i]}`);
  });
  const exports = tail[1].trim() ? tail[1].split(",").map((p) => p.split(":")[0].trim()) : [];
  const body = src.slice(head[0].length, src.length - tail[0].length).replace(/\/\/.*$/gm, "");
  return { name, file, src, deps, exports, body };
}

function checkModules(mods) {
  const byName = new Map();
  for (const m of mods) {
    const at = `${m.file}: `;
    for (const d of m.deps) {
      if (!RUNTIME.includes(d)) fail(at + `depends on "${d}", which is not a runtime module (engine/page/assets.mjs RUNTIME)`);
      if (!byName.has(d)) fail(at + `depends on "${d}", which loads after it; move "${d}" before "${m.name}" in RUNTIME`);
      const p = paramName(d), used = new Set([...m.body.matchAll(new RegExp(`(?<![\\w$.])${p}\\.([A-Za-z_$][\\w$]*)`, "g"))].map((x) => x[1]));
      if (!used.size) fail(at + `declares "${d}" but never uses it`);
      for (const u of used) if (!byName.get(d).exports.includes(u)) fail(at + `uses ${p}.${u}, which "${d}" does not export`);
    }
    for (const other of RUNTIME) {
      const p = paramName(other);
      if (other === m.name || m.deps.includes(other)) continue;
      if (new RegExp(`(?<![\\w$.])${p}\\.[A-Za-z_$]`).test(m.body)) fail(at + `uses ${p}.* without declaring "${other}" as a dependency`);
    }
    byName.set(m.name, m);
  }
}

// One <script> body: the define() loader, then every module in RUNTIME order.
export function script() {
  const src = (name) => (GENERATED[name] ? kitSource(name, GENERATED[name].fn, GENERATED[name].names) : load(`runtime/${name}.js`).trim());
  const file = (name) => (GENERATED[name] ? GENERATED[name].file : `engine/runtime/${name}.js`);
  const mods = RUNTIME.map((name) => parseModule(name, src(name), file(name)));
  checkModules(mods);
  return [load("runtime/define.js").trim(), ...mods.map((m) => m.src)].join("\n\n");
}
