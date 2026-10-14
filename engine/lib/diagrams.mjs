// Pure logic of the diagram pickers: the saved-diagram list, name rules and archive naming.
import { DIAGRAM_ID } from "../parse/new-diagram.mjs";
import { ARCHIVE_EXT, isArchiveName, readZip, writeZip } from "./zip.mjs";

// files: GET /api/files rows { name, size, mtime }. A folder is a diagram when it has topology.toml or a servers/*.toml file.
export function listDiagrams(files) {
  const by = new Map();
  for (const f of files) {
    const parts = f.name.split("/");
    if (parts.length < 2) continue;
    const row = by.get(parts[0]) || { name: parts[0], servers: 0, mtime: 0, diagram: false };
    row.mtime = Math.max(row.mtime, f.mtime);
    if (parts.length === 2 && (parts[1] === "topology.toml" || parts[1] === "diagram.toml")) row.diagram = true;
    if (parts.length === 3 && parts[1] === "servers" && parts[2].endsWith(".toml")) { row.servers++; row.diagram = true; }
    by.set(parts[0], row);
  }
  return [...by.values()].filter((r) => r.diagram).map(({ name, servers, mtime }) => ({ name, servers, mtime })).sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name));
}

export const FILTER_MIN = 9;
export function filterDiagrams(rows, query) {
  const q = String(query || "").trim().toLowerCase();
  return q ? rows.filter((r) => r.name.includes(q)) : rows;
}

// Why `name` cannot name a new diagram, or null. existing: names already stored.
export function nameProblem(name, existing = []) {
  if (!name) return "Enter a name.";
  if (!DIAGRAM_ID.test(name)) return "Use lowercase letters, digits and hyphens, starting with a letter or digit.";
  if (name.length > 60) return "Use at most 60 characters.";
  if (existing.includes(name)) return name + " already exists in local/. Open it, or choose another name.";
  return null;
}

function trimDashes(s) {
  let from = 0, to = s.length;
  while (from < to && s[from] === "-") from++;
  while (to > from && s[to - 1] === "-") to--;
  return s.slice(from, to);
}

export function sanitizeName(raw) {
  const dashed = String(raw).toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
  return trimDashes(trimDashes(dashed).slice(0, 60)) || "diagram";
}

// Diagram name for an imported archive: the topology id when present, else the archive file name without .diag.zip.
export function archiveDiagramName(topologyText, fileName) {
  const id = /^id[ \t]*=[ \t]*"([^"\n]+)"/m.exec(topologyText || "");
  const stem = String(fileName).slice(0, Math.max(0, String(fileName).length - ARCHIVE_EXT.length));
  return sanitizeName(id ? id[1] : stem);
}

export function whenText(ms) {
  const d = new Date(ms), p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

export const LAYOUT_FILE = "diagram.layout.json";

// Archive bytes of a diagram: every working file plus its layout, paths relative to the diagram root.
export async function packDiagram(files, layoutText, date = new Date()) {
  const enc = new TextEncoder(), entries = [...files].map(([name, text]) => ({ name, data: enc.encode(text) }));
  if (layoutText !== null && layoutText !== undefined) entries.push({ name: LAYOUT_FILE, data: enc.encode(layoutText) });
  return writeZip(entries, date);
}

// An untrusted archive as an in-memory diagram: { name, files: Map path -> text, layoutText }. Throws a readable reason.
export async function unpackDiagram(bytes, fileName) {
  if (!isArchiveName(fileName)) throw new Error("Only .diag.zip files can be opened.");
  const entries = await readZip(bytes), dec = new TextDecoder("utf-8", { fatal: true }), files = new Map();
  for (const [name, data] of entries) {
    try { files.set(name, dec.decode(data).replace(/^﻿/, "")); } catch (_) { throw new Error("'" + name + "' is not valid UTF-8 text."); }
  }
  const layoutText = files.get(LAYOUT_FILE) ?? null;
  files.delete(LAYOUT_FILE);
  if (!files.has("topology.toml") && !files.has("diagram.toml")) throw new Error("The archive has no topology.toml, so it is not a diagram.");
  return { name: archiveDiagramName(files.get("topology.toml") ?? files.get("diagram.toml"), fileName), files, layoutText };
}
