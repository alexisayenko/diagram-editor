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
  src = src.replace(/^export (async function|function|const|let|class) ([\w$]+)/gm, (_, kind, name) => { exports.push(name); return `${kind} ${name}`; });
  if (/^import |^export /m.test(src)) throw new Error("Unsupported module syntax: " + id);
  modules.set(id, src + "\nObject.assign(exports, {" + exports.join(",") + "});");
}
for (const entry of ["browser/render.mjs", "parse/toml.mjs", "parse/toml-write.mjs", "parse/networks-append.mjs", "parse/networks-name.mjs","parse/new-diagram.mjs", "parse/import-servers.mjs", "lib/names.mjs", "lib/diagrams.mjs", "lib/zip.mjs"]) bundle(entry);
const factories = [...modules].map(([id, src]) => `${JSON.stringify(id)}: function(require, exports) {\n${src}\n}`).join(",\n");
const assets = { cssSvg: css("svg"), cssPage: css("page"), js: "window.InfraDiagramFileBacked = true;\n" + script() };
const hostScript = readFileSync(resolve(engine, "../tools/host-probe.sh"), "utf8");
const app = readFileSync(resolve(engine, "browser/app.js"), "utf8");
const js = `const factories = {${factories}};\nconst cache = Object.create(null);\nfunction require(id) { if (!cache[id]) { const exports = cache[id] = {}; factories[id](require, exports); } return cache[id]; }\nconst ASSETS = ${JSON.stringify(assets)};
const HOST_SCRIPT = ${JSON.stringify(hostScript).replace(/</g, "\\u003c")};\n${app}`;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Infrastructure diagrams</title>
<style>
*{box-sizing:border-box}body{margin:0;font:14px system-ui,sans-serif;color:#172b45;background:#f3f5f9;display:flex;flex-direction:column;height:100vh}header{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 16px;background:white;border-bottom:1px solid #cbd5e1}button,select{font:inherit;border:1px solid #a8b5c8;background:#fff;border-radius:5px;padding:7px 12px}button{cursor:pointer}button:disabled,select:disabled{opacity:.5;cursor:default}#save{background:#1565c0;color:#fff;border-color:#1565c0}#status{padding:8px 16px;min-height:36px;font-size:13px;overflow-wrap:anywhere}.error{color:#a31c1c}iframe{width:100%;flex:1;border:0;min-height:0}#welcome{max-width:620px;margin:64px auto;padding:28px;background:#fff;border:1px solid #d9e1eb;border-radius:10px;line-height:1.7}h1{font-size:24px;margin-top:0}code{background:#edf2f7;padding:2px 5px;border-radius:3px}.dlg{position:fixed;inset:0;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;z-index:10}.dlg{--hs-bg:#fff;--hs-fg:#172b45;--hs-code:#eef2f8;--hs-line:#cbd5e1;--hs-ok:#2e7d32}@media (prefers-color-scheme:dark){.dlg{--hs-bg:#1b2433;--hs-fg:#e2e8f0;--hs-code:#0f172a;--hs-line:#3b4a63;--hs-ok:#6ee7a0}}.dlg>div{background:var(--hs-bg);color:var(--hs-fg);border-radius:8px;padding:16px;width:min(860px,94vw);max-width:100%;max-height:90vh;display:flex;flex-direction:column;gap:10px}.dlg h2{margin:0;font-size:18px}.dlg h3{margin:0 0 4px;font-size:15px}.dlg p{margin:0 0 6px;line-height:1.5}.dlg .body{overflow:auto;min-height:0;display:flex;flex-direction:column;gap:10px}.dlg ol{margin:0;padding-left:22px;display:flex;flex-direction:column;gap:12px}.dlg li{min-width:0}.dlg pre{margin:0;overflow:auto;max-width:100%;background:var(--hs-code);color:var(--hs-fg);border:1px solid var(--hs-line);padding:10px;border-radius:5px;font:12px/1.45 ui-monospace,Menlo,Consolas,monospace;white-space:pre}.dlg .code,.dlg .bar{display:flex;gap:8px;align-items:flex-start}.dlg .code pre,.dlg .bar details{flex:1;min-width:0}.dlg summary{cursor:pointer;padding:5px 0}.dlg #hstext{max-height:40vh;margin-top:4px}.dlg .cp{flex:none}.dlg .row{display:flex;gap:8px;align-items:center;justify-content:flex-end}.dlg .row span{margin-right:auto;color:var(--hs-ok)}.dlg .opts{display:flex;gap:12px;flex-wrap:wrap}.dlg .opts label{display:flex;flex-direction:column;gap:3px;min-width:200px}.dlg ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}.dlg li label{display:flex;gap:8px;align-items:baseline}.dlg .tag{color:var(--hs-ok);font-size:12px}.dlg .bad{color:#c62828}.dlg #impinfo{color:var(--hs-fg)}.dlg input[type=text],.dlg input[type=search]{font:inherit;padding:7px 10px;border:1px solid var(--hs-line);border-radius:5px;background:var(--hs-bg);color:var(--hs-fg)}.dlg button.item{display:flex;width:100%;justify-content:space-between;gap:12px;text-align:left;background:var(--hs-bg);color:var(--hs-fg);border-color:var(--hs-line)}.dlg button.item span{opacity:.7}.dlg .msg{color:#c62828;min-height:1.4em;margin:0}.dlg ul.taken li{opacity:.55}.dlg .note{opacity:.8}[hidden]{display:none!important}
</style></head><body>
<header><strong>Infrastructure diagrams</strong><button id="new">New diagram</button><button id="open">Open saved diagram</button><button id="importdiag">Import diagram</button><input id="diagfile" type="file" accept=".diag.zip" hidden><button id="import" disabled>Import servers</button><input id="impfiles" type="file" accept=".toml" multiple hidden><button id="export" disabled>Export</button><button id="save" disabled>Save</button><button id="hostscript">Host script</button></header>
<div id="status" role="status" aria-live="polite">Open a saved diagram, start a New diagram, or Import a .diag.zip file.</div>
<main id="welcome"><h1>From servers to a diagram</h1><p>Start a <b>New diagram</b>, use <b>Open saved diagram</b> to pick one stored on the local server, or <b>Import diagram</b> to open a <code>.diag.zip</code> file; the most recently saved diagram opens automatically. The engine arranges your servers and connections automatically.</p><p>Use <b>Edit layout</b> to move servers and regions, then <b>Save</b>. Your arrangement is stored in the folder as <code>diagram.layout.json</code>; edited notes go back into <code>notes.toml</code> and edited servers into their <code>servers/&lt;id&gt;.toml</code>. <b>Export</b> downloads the whole diagram as one <code>&lt;id&gt;-&lt;timestamp&gt;.diag.zip</code> file.</p><p>After changing services or adding servers in the folder, reload the page. Existing positions are restored and new objects are placed automatically.</p><p>Start with <code>examples/demo/</code>. See <code>AUTHORING.md</code> for the format. Storing and saving need <code>node engine/serve.mjs</code>; any modern browser works (Export and Import diagram work without it).</p></main>
<div id="hs" class="dlg" hidden><div role="dialog" aria-modal="true" aria-labelledby="hst"><h2 id="hst">Host script</h2><div class="body"><p>Collect facts from Linux servers over SSH and get a <code>servers/&lt;id&gt;.toml</code> snippet for each. The probe is read-only and needs no sudo. Run the steps on a machine that can SSH to the servers.</p><ol>
<li><h3>Save the script</h3><p>Save it as <code>host-probe.sh</code> in the folder you will work in; the loop in step 3 reads it from there.</p><div class="bar"><details id="hsd"><summary>Show script</summary><pre id="hstext" tabindex="0"></pre></details><button type="button" class="cp" data-copy="#hstext">Copy</button></div></li>
<li><h3>List the hosts</h3><p>Create <code>hosts.txt</code> next to it: one host (IP address or DNS name) per line. Lines starting with <code>#</code> are comments; blank lines are skipped.</p><div class="code"><pre id="hshosts" tabindex="0"># web servers
192.0.2.10
198.51.100.20
app-01.example.test</pre><button type="button" class="cp" data-copy="#hshosts">Copy</button></div></li>
<li><h3>Run the probe on every host</h3><p>Paste this into a terminal in that folder. It never waits for a password (hosts need key-based login), gives up on an unreachable host after 10 seconds, and saves each result to <code>out/&lt;host&gt;.toml</code> as well as showing it.</p><div class="code"><pre id="hscmd" tabindex="0">mkdir -p out
while read -r host _ || [ -n "$host" ]; do
  case "$host" in ''|'#'*) continue ;; esac
  echo "##### $host"
  ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=10 \\
    "$host" 'bash -s' &lt; host-probe.sh | tee "out/$host.toml"
  echo
done &lt; hosts.txt</pre><button type="button" class="cp" data-copy="#hscmd">Copy</button></div></li>
<li><h3>Import into the diagram</h3><p>Open or create a diagram here, click <b>Import servers</b> in the toolbar and choose the <code>out/*.toml</code> files. Pick a server type or a region, review the list and confirm; the servers are added as new <code>servers/&lt;id&gt;.toml</code> files and <b>Save</b> writes them.</p></li>
</ol></div><div class="row"><span id="hsnote" role="status"></span><button id="hsclose">Close</button></div></div></div>
<div id="imp" class="dlg" hidden><div role="dialog" aria-modal="true" aria-labelledby="impt"><h2 id="impt">Import servers</h2><div class="body"><div class="opts"><label>Server type<select id="imptype"></select></label><label>Region (optional)<select id="impregion"></select></label></div><ul id="implist"></ul></div><div class="row"><span id="impinfo" role="status"></span><button id="impcancel">Cancel</button><button id="impok">Import</button></div></div></div>
<div id="op" class="dlg" hidden><div role="dialog" aria-modal="true" aria-labelledby="opt"><h2 id="opt">Open saved diagram</h2><div class="body"><input id="opq" type="search" placeholder="Filter diagrams" aria-label="Filter diagrams" hidden><ul id="oplist"></ul><p id="opnote" class="note"></p></div><div class="row"><span></span><button id="opclose">Close</button></div></div></div>
<div id="nw" class="dlg" hidden><div role="dialog" aria-modal="true" aria-labelledby="nwt"><h2 id="nwt">New diagram</h2><div class="body"><label>Diagram name (lowercase letters, digits and hyphens)<input id="nwname" type="text" spellcheck="false" autocomplete="off"></label><p id="nwmsg" class="msg" role="alert"></p><div id="nwtaken"><p class="note">Existing diagrams:</p><ul id="nwlist" class="taken"></ul></div></div><div class="row"><span></span><button id="nwcancel">Cancel</button><button id="nwok">Create</button></div></div></div>
<iframe id="view" title="Infrastructure diagram" hidden></iframe>
<script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>\n`;
const out = resolve(engine, "../diagram.html");
if (process.argv.includes("--check")) {
  if (readFileSync(out, "utf8") !== html) { console.error("diagram.html out of date; run node engine/browser.mjs"); process.exitCode = 1; }
  else console.log("diagram.html up to date");
} else { writeFileSync(out, html); console.log("diagram.html written"); }
