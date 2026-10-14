import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { runCli } from "./lib/cli.mjs";
import { fail } from "./lib/errors.mjs";
import { DIAGRAM_ID } from "./lib/ids.mjs";
import { newDiagram } from "./parse/new-diagram.mjs";

runCli("new", () => {
  const target = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!target) fail("usage: node engine/new.mjs <diagram-dir>");
  const dir = resolve(target);
  const id = basename(dir);
  if (!DIAGRAM_ID.test(id)) fail(`folder name "${id}" must match ${DIAGRAM_ID} (it becomes the diagram id)`);
  if (existsSync(dir)) fail(`"${dir}" already exists; refusing to overwrite`);
  const files = newDiagram(id);
  mkdirSync(dir, { recursive: true });
  for (const [f, text] of files) writeFileSync(resolve(dir, f), text);
  console.log(`new: created ${dir} (${[...files.keys()].join(", ")})`);
});
