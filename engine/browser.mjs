// Produce one offline-capable page by bundling the existing rendering modules.
// This deliberately small bundler accepts only the engine's named imports/exports.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { css, script } from "./page/assets.mjs";

const engine = dirname(fileURLToPath(import.meta.url));
const modules = new Map();
function bundle(id) {
  if (modules.has(id)) return;
  if (id === "lib/util.mjs") {
    modules.set(id, `exports.fail = m => { throw new Error(m); }; exports.esc = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); exports.unq = s => s.trim().replace(/^"(.*)"$/, "$1");`);
    return;
  }
  if (id === "node:path") { modules.set(id, `exports.basename = s => s.split(/[\\\\/]/).pop();`); return; }
  if (id.startsWith("node:")) throw new Error("Unsupported browser import: " + id);
  modules.set(id, "");
  let src = readFileSync(resolve(engine, id), "utf8").replace(/\r\n/g, "\n");
  src = src.replace(/^import \{([^}]+)\} from "([^"]+)";$/gm, (_, names, target) => {
    const dependency = target.startsWith("node:") ? target : relative(engine, resolve(engine, dirname(id), target)).replace(/\\/g, "/");
    bundle(dependency);
    return `const {${names}} = require(${JSON.stringify(dependency)});`;
  });
  const exports = [];
  src = src.replace(/^export (function|const|let|class) ([\w$]+)/gm, (_, kind, name) => { exports.push(name); return `${kind} ${name}`; });
  if (/^import |^export /m.test(src)) throw new Error("Unsupported module syntax: " + id);
  modules.set(id, src + "\nObject.assign(exports, {" + exports.join(",") + "});");
}
bundle("browser/render.mjs");
const factories = [...modules].map(([id, src]) => `${JSON.stringify(id)}: function(require, exports) {\n${src}\n}`).join(",\n");
const assets = { cssSvg: css("svg"), cssPage: css("page"), js: "window.InfraDiagramFileBacked = true;\n" + script() };
const app = readFileSync(resolve(engine, "browser/app.js"), "utf8");
const js = `const factories = {${factories}};\nconst cache = Object.create(null);\nfunction require(id) { if (!cache[id]) { const exports = cache[id] = {}; factories[id](require, exports); } return cache[id]; }\nconst ASSETS = ${JSON.stringify(assets)};\n${app}`;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Infrastructure diagrams</title>
<style>
*{box-sizing:border-box}body{margin:0;font:14px system-ui,sans-serif;color:#172b45;background:#f3f5f9;display:flex;flex-direction:column;height:100vh}header{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 16px;background:white;border-bottom:1px solid #cbd5e1}button,select{font:inherit;border:1px solid #a8b5c8;background:#fff;border-radius:5px;padding:7px 12px}button{cursor:pointer}button:disabled,select:disabled{opacity:.5;cursor:default}#save{background:#1565c0;color:#fff;border-color:#1565c0}#status{padding:8px 16px;min-height:36px;font-size:13px;overflow-wrap:anywhere}.error{color:#a31c1c}iframe{width:100%;flex:1;border:0;min-height:0}#welcome{max-width:620px;margin:64px auto;padding:28px;background:#fff;border:1px solid #d9e1eb;border-radius:10px;line-height:1.7}h1{font-size:24px;margin-top:0}code{background:#edf2f7;padding:2px 5px;border-radius:3px}[hidden]{display:none!important}
</style></head><body>
<header><strong>Infrastructure diagrams</strong><button id="open">Open folder</button><select id="diagram" aria-label="Diagram TOML file" disabled><option>Choose a folder first</option></select><button id="reload" disabled>Reload TOML</button><button id="save" disabled>Save layout</button></header>
<div id="status" role="status" aria-live="polite">Choose the folder containing your TOML diagram.</div>
<main id="welcome"><h1>From servers to a diagram</h1><p>Open a folder and select its TOML file. The engine arranges your servers and connections automatically.</p><p>Use <b>Edit layout</b> to move servers and regions, then <b>Save layout</b>. Your arrangement is stored beside the TOML as <code>&lt;name&gt;.layout.json</code>.</p><p>After changing services or adding servers, press <b>Reload TOML</b>. Existing positions are restored and new objects are placed automatically.</p><p>Start with <code>examples/demo/demo.toml</code>. See <code>AUTHORING.md</code> for the format. Folder access requires desktop Edge or Chrome.</p></main>
<iframe id="view" title="Infrastructure diagram" hidden></iframe>
<script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>\n`;
const out = resolve(engine, "../diagram.html");
if (process.argv.includes("--check")) {
  if (readFileSync(out, "utf8") !== html) { console.error("diagram.html out of date; run node engine/browser.mjs"); process.exitCode = 1; }
  else console.log("diagram.html up to date");
} else { writeFileSync(out, html); console.log("diagram.html written"); }
