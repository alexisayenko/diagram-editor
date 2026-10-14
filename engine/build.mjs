import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reader } from "./lib/util.mjs";
import { runCli } from "./lib/cli.mjs";
import { fail } from "./parse/errors.mjs";
import { parseLayout } from "./parse/layout.mjs";
import { parseNotes } from "./parse/notes.mjs";
import { parseDocuments } from "./parse/documents.mjs";
import { edgeKey, parseMmd } from "./parse/mmd.mjs";
import { parseNetworks } from "./parse/networks.mjs";
import { geometryKit, geometryMeta } from "./render/geometry.mjs";
import { parseDetails } from "./parse/details.mjs";
import { renderModel } from "./render/pipeline.mjs";
import { css, script } from "./page/assets.mjs";
import { renderIndexHtml } from "./page/index-html.mjs";
import { checkConnections, parseConfig } from "./parse/config.mjs";
import { autoLayoutKit } from "./render/auto-layout.mjs";
import { drawKit } from "./render/draw-kit.mjs";
import { renderExcalidraw } from "./export/excalidraw.mjs";

runCli("build", () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) fail("usage: node engine/build.mjs <diagram-dir> [--check]");
  const dir = [resolve(target), resolve(ROOT, target)].find((d) => existsSync(join(d, "diagram.mmd")));
  if (!dir) fail(`no diagram.mmd in "${target}"`);
  const read = reader(dir);

  const config = parseConfig(read("diagram.json"), dir);
  const mmd = read("diagram.mmd");
  const details = read("details.md");
  const hasLayout = existsSync(join(dir, "layout.json"));
  const layout = parseLayout(hasLayout ? read("layout.json") : "{}");
  const drawings = drawKit().validate(layout.drawings);
  delete layout.drawings;
  const notes = parseNotes(read("notes.md"));
  const docs = parseDocuments(read("documents.md"));
  const model = parseMmd(mmd);
  checkConnections(config, model.edges.map(edgeKey), model.nodes);
  const meta = geometryMeta(model, config.groups, config.processes);
  const kit = geometryKit();
  if (!hasLayout) autoLayoutKit(kit).fill(layout, meta);
  const netItems = existsSync(join(dir, "networks.md")) ? parseNetworks(read("networks.md")) : null;
  const out = renderModel({
    config, model, layout, meta, kit, sections: parseDetails(details), notes, docs, drawings, validate: true,
    networks: netItems && { kind: "tree", items: netItems, texts: [details] },
    assets: { cssSvg: css("svg"), cssPage: css("page"), js: script() },
  });
  const { routes, ent, viewBox, edgeKeys } = out;

  const outputs = {
    "layout.html": out.html,
    "index.html": renderIndexHtml({ title: config.title, mmd, details, notes, edgeKinds: edgeKeys.kinds }),
    [config.id + ".excalidraw"]: renderExcalidraw({ config, model, layout, meta, routes, ent, notes, edgeLabels: config.edgeLabels, viewBox, drawings }),
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
