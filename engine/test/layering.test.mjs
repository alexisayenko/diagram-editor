// Import-direction rules for engine/: a module may only import from the layers listed for its own folder.
// Order (low to high): lib, model, parse, render and export, page, browser, then the entry scripts in engine/.
// The runtime is a separate world: it ships to the page as text and never imports an engine module.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const LAYERS = {
  lib: ["lib"],
  model: ["lib", "model"],
  parse: ["lib", "model", "parse"],
  render: ["lib", "model", "parse", "render"],
  export: ["lib", "model", "render", "export"],
  page: ["lib", "model", "parse", "render", "page"],
  browser: ["lib", "model", "parse", "render", "export", "page", "browser"],
  entry: ["lib", "model", "parse", "render", "export", "page", "browser"],
  css: [],
  runtime: [],
};

// "importer -> imported": each exception to LAYERS with the reason it stays.
export const ALLOWED = {
  "render/pipeline.mjs -> page/data.mjs": "the one pipeline assembles the page data; moves to page/ when build.mjs and browser/render.mjs import it from there",
  "render/pipeline.mjs -> page/layout-html.mjs": "the one pipeline assembles the layout page; moves to page/ with the line above",
};

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  if (statSync(p).isDirectory()) return f === "test" || f === "node_modules" ? [] : walk(p);
  return /\.(mjs|js)$/.test(f) ? [p] : [];
});

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\(\s*)["']([^"']+)["']/g;
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

export const layerOf = (rel) => {
  const [top, ...rest] = rel.split("/");
  return rest.length ? top : "entry";
};

export function importsOf(file) {
  const rel = relative(ENGINE, file).split(sep).join("/");
  const out = [];
  for (const [, spec] of code(readFileSync(file, "utf8").replaceAll("\r\n", "\n")).matchAll(SPECIFIER)) {
    if (spec.startsWith("node:")) continue;
    let target = null;
    if (spec.startsWith(".")) target = relative(ENGINE, resolve(ENGINE, dirname(rel), spec)).split(sep).join("/");
    else if (/\.mjs$/.test(spec)) target = spec;
    if (target !== null) out.push({ rel, target });
  }
  return out;
}

const all = walk(ENGINE).flatMap(importsOf);

test("every engine folder has a layer rule", () => {
  const folders = readdirSync(ENGINE).filter((f) => statSync(join(ENGINE, f)).isDirectory() && f !== "test");
  for (const f of folders) assert.ok(LAYERS[f], `engine/${f}/ has no entry in LAYERS`);
});

test("imports only point down the layers", () => {
  const bad = [];
  for (const { rel, target } of all) {
    const from = layerOf(rel), to = layerOf(target);
    if (LAYERS[from]?.includes(to) || ALLOWED[`${rel} -> ${target}`]) continue;
    bad.push(`${rel} (${from}) imports ${target} (${to})`);
  }
  assert.deepEqual(bad, []);
});

test("the runtime imports no engine module", () => {
  const rt = all.filter(({ rel }) => layerOf(rel) === "runtime");
  assert.deepEqual(rt, []);
});

test("every allow-list entry is still needed and has a reason", () => {
  const seen = new Set(all.map(({ rel, target }) => `${rel} -> ${target}`));
  for (const [edge, why] of Object.entries(ALLOWED)) {
    assert.ok(why.length > 10, `${edge} needs a reason`);
    assert.ok(seen.has(edge), `${edge} is no longer imported: remove it from ALLOWED`);
    const [from, to] = edge.split(" -> ").map(layerOf);
    assert.ok(!LAYERS[from].includes(to), `${edge} is allowed by LAYERS already: remove it from ALLOWED`);
  }
});

test("the scanner reads the import forms in use", () => {
  const found = importsOf(fileURLToPath(new URL("../render/pipeline.mjs", import.meta.url))).map((i) => i.target);
  assert.ok(found.includes("page/data.mjs") && found.includes("parse/types.mjs"));
});
