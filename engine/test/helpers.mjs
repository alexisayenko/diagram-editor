// Shared fixtures: a diagram folder is a Map of folder-relative path -> TOML text.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const DEMO_DIR = fileURLToPath(new URL("../../examples/demo", import.meta.url));

export function readFolder(dir, rel = "", out = new Map()) {
  for (const name of readdirSync(join(dir, rel)).sort()) {
    const path = rel ? rel + "/" + name : name;
    if (statSync(join(dir, path)).isDirectory()) { if (path === "servers") readFolder(dir, path, out); }
    else if (name.endsWith(".toml")) out.set(path, readFileSync(join(dir, path), "utf8"));
  }
  return out;
}

export const demo = () => readFolder(DEMO_DIR);

// A copy of `files` with `path` rewritten; the old text must contain `from`.
export function mod(files, path, from, to) {
  const text = files.get(path);
  if (!text.includes(from)) throw new Error(`${path} does not contain ${from}`);
  return new Map(files).set(path, text.replace(from, () => to));
}

export const withFile = (files, path, text) => new Map(files).set(path, text);

export const without = (files, path) => { const m = new Map(files); m.delete(path); return m; };

// A small folder: topology.toml with `head`, one server a, and any extra files.
export const mini = (head = 'title = "t"\n', extra = {}, server = 'id = "a"\nserver_type = "web"\n') =>
  new Map(Object.entries({ "topology.toml": head, "servers/a.toml": server, ...extra }));
