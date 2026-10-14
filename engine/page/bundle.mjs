// A small bundler for the engine's browser modules: named imports/exports only, no cycles.
import { readFileSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The browser has no Node: modules written for both resolve to these node-free replacements.
const ALIASES = { "lib/util.mjs": "lib/text.mjs" };
const NODE_SHIMS = { "node:path": String.raw`exports.basename = s => s.split(/[\\/]/).pop();` };

const IMPORT = /^import\s*\{([^}]+)\}\s*from\s*"([^"]+)";?[ \t]*$/gm;
const REEXPORT = /^export\s*\{([^}]+)\}\s*from\s*"([^"]+)";?[ \t]*$/gm;
const EXPORT = /^export (async function|function|const|let|class) ([\w$]+)/gm;

export const readSource = (path) => readFileSync(path, "utf8").replaceAll("\r\n", "\n");

// Entry modules: every module the page script (browser/app.js) asks for by name, plus the renderer.
export function entryModules(app = readSource(resolve(ENGINE, "browser/app.js"))) {
  const ids = new Set(["browser/render.mjs"]);
  for (const m of app.matchAll(/\brequire\("([^"]+)"\)/g)) ids.add(m[1]);
  return [...ids];
}

export function bundleModules(entries, root = ENGINE) {
  const modules = new Map();
  const bundle = (id) => {
    if (modules.has(id)) return;
    if (NODE_SHIMS[id]) { modules.set(id, NODE_SHIMS[id]); return; }
    if (id.startsWith("node:")) throw new Error("Unsupported browser import: " + id);
    modules.set(id, "");
    let src = readSource(resolve(root, id));
    const exports = [];
    const link = (target) => {
      let dep = target.startsWith("node:") ? target : relative(root, resolve(root, dirname(id), target)).replaceAll("\\", "/");
      dep = ALIASES[dep] ?? dep;
      bundle(dep);
      return JSON.stringify(dep);
    };
    src = src.replace(IMPORT, (_, names, target) => `const {${names}} = require(${link(target)});`);
    src = src.replace(REEXPORT, (_, names, target) => `Object.assign(exports, (({${names}}) => ({${names}}))(require(${link(target)})));`);
    src = src.replace(EXPORT, (_, kind, name) => { exports.push(name); return `${kind} ${name}`; });
    if (/^import |^export /m.test(src)) throw new Error("Unsupported module syntax: " + id);
    modules.set(id, src + "\nObject.assign(exports, {" + exports.join(",") + "});");
  };
  entries.forEach(bundle);
  return modules;
}
