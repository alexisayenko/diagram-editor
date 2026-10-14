import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { metrics } from "./runtime-kits.mjs";

const FILE = fileURLToPath(new URL("../runtime/ui/core.js", import.meta.url)), SRC = readFileSync(FILE, "utf8");

export function loadCore({ errors = [] } = {}) {
  let core;
  const svg = { children: [{}], querySelectorAll: () => [] };
  const doc = { getElementById: () => ({ textContent: '{"id":"t"}' }), querySelector: () => svg };
  const InfraDiagram = { define: (n, d, f) => { core = f(metrics); } };
  runInNewContext(SRC, { document: doc, InfraDiagram, localStorage: {}, console: { error: (...a) => errors.push(a) } }, { filename: FILE });
  return { core, InfraDiagram };
}

export const createRegistry = () => loadCore().core.createRegistry();
