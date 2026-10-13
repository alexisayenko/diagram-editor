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
for (const entry of ["browser/render.mjs", "parse/toml.mjs", "parse/toml-write.mjs", "parse/new-diagram.mjs", "lib/names.mjs"]) bundle(entry);
const factories = [...modules].map(([id, src]) => `${JSON.stringify(id)}: function(require, exports) {\n${src}\n}`).join(",\n");
const assets = { cssSvg: css("svg"), cssPage: css("page"), js: "window.InfraDiagramFileBacked = true;\n" + script() };
const hostScript = readFileSync(resolve(engine, "../tools/remote-script-ip.sh"), "utf8");
const app = readFileSync(resolve(engine, "browser/app.js"), "utf8");
const js = `const factories = {${factories}};\nconst cache = Object.create(null);\nfunction require(id) { if (!cache[id]) { const exports = cache[id] = {}; factories[id](require, exports); } return cache[id]; }\nconst ASSETS = ${JSON.stringify(assets)};
const HOST_SCRIPT = ${JSON.stringify(hostScript).replace(/</g, "\\u003c")};\n${app}`;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Infrastructure diagrams</title>
<style>
*{box-sizing:border-box}body{margin:0;font:14px system-ui,sans-serif;color:#172b45;background:#f3f5f9;display:flex;flex-direction:column;height:100vh}header{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 16px;background:white;border-bottom:1px solid #cbd5e1}button,select{font:inherit;border:1px solid #a8b5c8;background:#fff;border-radius:5px;padding:7px 12px}button{cursor:pointer}button:disabled,select:disabled{opacity:.5;cursor:default}#save{background:#1565c0;color:#fff;border-color:#1565c0}#status{padding:8px 16px;min-height:36px;font-size:13px;overflow-wrap:anywhere}.error{color:#a31c1c}iframe{width:100%;flex:1;border:0;min-height:0}#welcome{max-width:620px;margin:64px auto;padding:28px;background:#fff;border:1px solid #d9e1eb;border-radius:10px;line-height:1.7}h1{font-size:24px;margin-top:0}code{background:#edf2f7;padding:2px 5px;border-radius:3px}#hs{position:fixed;inset:0;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;z-index:10}#hs>div{background:#fff;border-radius:8px;padding:16px;width:min(860px,94vw);max-height:90vh;display:flex;flex-direction:column;gap:10px}#hs h2{margin:0;font-size:18px}#hs p{margin:0;line-height:1.5}#hs pre{margin:0;overflow:auto;background:#0f172a;color:#e2e8f0;padding:10px;border-radius:5px;font:12px/1.45 ui-monospace,Menlo,Consolas,monospace;white-space:pre}#hs #hstext{flex:1;min-height:120px}#hs .row{display:flex;gap:8px;align-items:center;justify-content:flex-end}#hs .row span{margin-right:auto;color:#2e7d32}[hidden]{display:none!important}
</style></head><body>
<header><strong>Infrastructure diagrams</strong><button id="new">New diagram</button><button id="open">Open diagram folder</button><input id="picker" type="file" webkitdirectory hidden><button id="save" disabled>Save</button><button id="export" disabled>Export</button><button id="hostscript">Host script</button></header>
<div id="status" role="status" aria-live="polite">Open a diagram folder (topology.toml, servers/, ...).</div>
<main id="welcome"><h1>From servers to a diagram</h1><p>Start a <b>New diagram</b> or open a diagram folder; the most recently saved diagram on the local server opens automatically. The engine arranges your servers and connections automatically.</p><p>Use <b>Edit layout</b> to move servers and regions, then <b>Save</b>. Your arrangement is stored in the folder as <code>diagram.layout.json</code>; edited notes go back into <code>notes.toml</code> and edited servers into their <code>servers/&lt;id&gt;.toml</code>. <b>Export</b> downloads the layout and the changed files with a timestamp.</p><p>After changing services or adding servers in the folder, reload the page. Existing positions are restored and new objects are placed automatically.</p><p>Start with <code>examples/demo/</code>. See <code>AUTHORING.md</code> for the format. Storing and saving need <code>node engine/serve.mjs</code>; any modern browser works.</p></main>
<div id="hs" hidden><div role="dialog" aria-modal="true" aria-labelledby="hst"><h2 id="hst">Host script</h2><p>Read-only probe that prints a <code>servers/&lt;id&gt;.toml</code> snippet. Save it as <code>remote-script-ip.sh</code> and run:</p><pre id="hscmd">for ip in $hosts; do echo "##### $ip"; ssh -o StrictHostKeyChecking=accept-new $ip 'hostname &amp;&amp; bash -s' &lt; remote-script-ip.sh; echo; done</pre><pre id="hstext" tabindex="0"></pre><div class="row"><span id="hsnote" role="status"></span><button id="hscopy">Copy</button><button id="hsclose">Close</button></div></div></div>
<iframe id="view" title="Infrastructure diagram" hidden></iframe>
<script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>\n`;
const out = resolve(engine, "../diagram.html");
if (process.argv.includes("--check")) {
  if (readFileSync(out, "utf8") !== html) { console.error("diagram.html out of date; run node engine/browser.mjs"); process.exitCode = 1; }
  else console.log("diagram.html up to date");
} else { writeFileSync(out, html); console.log("diagram.html written"); }
