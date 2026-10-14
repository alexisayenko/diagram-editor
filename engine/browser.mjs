// Produce one offline-capable page by bundling the existing rendering modules.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { css, script } from "./page/assets.mjs";
import { ENGINE, bundleModules, entryModules, readSource } from "./page/bundle.mjs";

const engine = ENGINE;
const modules = bundleModules(entryModules());
const factories = [...modules].map(([id, src]) => `${JSON.stringify(id)}: function(require, exports) {\n${src}\n}`).join(",\n");
const assets = { cssSvg: css("svg"), cssPage: css("page"), js: "window.InfraDiagramFileBacked = true;\n" + script() };
const ESCAPED_LT = String.fromCodePoint(92) + "u003c", ESCAPED_SCRIPT_END = String.raw`<\/script`;
const hostScript = readFileSync(resolve(engine, "../tools/host-probe.sh"), "utf8");
const app = readFileSync(resolve(engine, "browser/app.js"), "utf8");
const js = `const factories = {${factories}};\nconst cache = Object.create(null);\nfunction require(id) { if (!cache[id]) { const exports = cache[id] = {}; factories[id](require, exports); } return cache[id]; }\nconst ASSETS = ${JSON.stringify(assets)};
const HOST_SCRIPT = ${JSON.stringify(hostScript).replaceAll("<", ESCAPED_LT)};\n${app}`;
const shell = readSource(resolve(engine, "page/shell.html")), shellCss = readSource(resolve(engine, "page/shell.css")).trimEnd();
const html = shell.replace("@@CSS@@", () => shellCss).replace("@@SCRIPT@@", () => js.replaceAll(/<\/script/gi, ESCAPED_SCRIPT_END));
const out = resolve(engine, "../diagram.html");
if (process.argv.includes("--check")) {
  if (readFileSync(out, "utf8") !== html) { console.error("diagram.html out of date; run node engine/browser.mjs"); process.exitCode = 1; }
  else console.log("diagram.html up to date");
} else { writeFileSync(out, html); console.log("diagram.html written"); }
