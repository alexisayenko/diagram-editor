import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./lib/cli.mjs";
import { fail } from "./lib/errors.mjs";
import { SERVER_DIR_NAME, TOPOLOGY_FILE, LEGACY_TOPOLOGY_FILE, LAYOUT_FILE } from "./lib/files.mjs";
import { decideLayoutLoad } from "./parse/layout-version.mjs";
import { prepareDiagram } from "./browser/render.mjs";
import { renderModel } from "./render/pipeline.mjs";
import { css, script } from "./page/assets.mjs";
import { renderExcalidraw } from "./export/excalidraw.mjs";

const LEGACY_FILES = ["diagram.mmd", "diagram.json", "details.md", "notes.md", "documents.md", "networks.md", "layout.json"];

function readFolder(dir) {
  const files = new Map();
  const add = (rel) => files.set(rel, readFileSync(join(dir, rel), "utf8"));
  for (const name of readdirSync(dir)) if (name.endsWith(".toml")) add(name);
  const servers = join(dir, SERVER_DIR_NAME);
  if (existsSync(servers)) for (const name of readdirSync(servers)) if (name.endsWith(".toml")) add(`${SERVER_DIR_NAME}/${name}`);
  return files;
}

function readSaved(dir) {
  const file = join(dir, LAYOUT_FILE);
  if (!existsSync(file)) return null;
  try {
    return decideLayoutLoad(JSON.parse(readFileSync(file, "utf8"))).use;
  } catch (e) {
    return fail(`${LAYOUT_FILE}: ${e.message}`);
  }
}

runCli("build", () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) fail("usage: node engine/build.mjs <diagram-dir> [--check]");
  const dir = [resolve(target), resolve(ROOT, target)].find((d) => existsSync(d));
  if (!dir) fail(`no diagram folder "${target}"`);
  const files = readFolder(dir);
  if (!files.has(TOPOLOGY_FILE) && !files.has(LEGACY_TOPOLOGY_FILE)) {
    if (LEGACY_FILES.some((f) => existsSync(join(dir, f)))) fail("legacy Mermaid/Markdown diagrams are no longer supported: convert to TOML, see docs/tech/authoring.md");
    fail(`no ${TOPOLOGY_FILE} in "${target}"`);
  }
  const d = prepareDiagram(files, basename(dir), readSaved(dir));
  const { config, model, notes, layout, meta, drawings } = d;
  const out = renderModel({ ...d, assets: { cssSvg: css("svg"), cssPage: css("page"), js: script() }, validate: true });
  const outputs = {
    "layout.html": out.html,
    [config.id + ".excalidraw"]: renderExcalidraw({ config, model, layout, meta, routes: out.routes, ent: out.ent, notes, edgeLabels: config.edgeLabels, viewBox: out.viewBox, drawings }),
  };
  const names = Object.keys(outputs).join(", ");
  if (check) {
    const stale = Object.entries(outputs).filter(([f, c]) => {
      try {
        return readFileSync(join(dir, f), "utf8") !== c;
      } catch {
        return true;
      }
    });
    if (stale.length) fail(stale.map(([f]) => f).join(", ") + ` out of date; run node engine/build.mjs ${target}`);
    console.log(names + " up to date");
  } else {
    for (const [f, c] of Object.entries(outputs)) writeFileSync(join(dir, f), c);
    console.log(names + " written");
  }
});
