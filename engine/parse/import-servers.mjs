// Pure logic of the Import servers dialog: probe snippets become new servers/<id>.toml files.
import { parseToml, mergeFolder, tomlModel } from "./toml.mjs";
import { mergeTypes } from "./types.mjs";
import { setKeys } from "./toml-write.mjs";
import { SERVER_ID, sanitizeId } from "../lib/ids.mjs";
import { serverPath } from "../lib/files.mjs";

const clean = (message) => String(message).replace(/^TOML: /, "");

const entryDoc = (text) => parseToml(text.replace(/^﻿/, "").replaceAll("\r\n", "\n"));
const hasText = (v) => typeof v === "string" && v !== "";

function baseIdOf(doc, entryName) {
  const rawId = hasText(doc.id) ? doc.id : entryName.split("/").pop().replace(/\.toml$/i, "");
  return SERVER_ID.test(rawId) ? rawId : sanitizeId(rawId);
}

function uniqueId(baseId, isTaken) {
  let id = baseId, n = 1;
  while (isTaken(id)) id = baseId + "-" + ++n;
  return { id, n };
}

function uniqueName(base, taken, n) {
  let name = base, m = n > 1 ? n : 2;
  while (taken.has(name)) name = base + " (" + m++ + ")";
  return name;
}

function importPairs(doc, newId, name, base, own, { regionObj, region, server_type }) {
  const pairs = [];
  if (doc.id !== newId) pairs.push(["id", newId]);
  if (name !== base || (own && name !== doc.name)) pairs.push(["name", name]);
  if (regionObj) {
    pairs.push(["region", region]);
    if (typeof doc.server_type === "string") pairs.push(["server_type", regionObj.server_type]);
  } else if (typeof doc.server_type !== "string") pairs.push(["server_type", server_type]);
  return pairs;
}

// entries: [{ name, text }]; opts: { server_type, region, skip: Set of file names left out }.
// Returns one row per entry in order and `files`, the new path -> text entries for the included, valid rows.
export function planImport(files, entries, { server_type, region, skip = new Set() } = {}) {
  const root = mergeFolder(files), types = Object.keys(mergeTypes(root.server_types));
  const regionObj = region ? (root.regions || []).find((r) => r.id === region) : null;
  if (region && !regionObj) throw new Error("Unknown region '" + region + "'.");
  if (!region && !types.includes(server_type)) throw new Error("Choose a server type.");
  const taken = new Set([...(root.regions || []), ...(root.servers || [])].map((e) => e.id));
  const names = new Set((root.servers || []).map((s) => s.name ?? s.id));
  const work = new Map(files), added = new Map();
  const target = { regionObj, region, server_type };

  const plan = (entry, doc, baseId, row) => {
    const { id: newId, n } = uniqueId(baseId, (id) => taken.has(id) || work.has(serverPath(id)));
    const own = hasText(doc.name), base = own ? doc.name : newId, name = uniqueName(base, names, n);
    const path = serverPath(newId);
    try {
      const text = setKeys(entry.text, importPairs(doc, newId, name, base, own, target));
      tomlModel(new Map(work).set(path, text));
      work.set(path, text);
      added.set(path, text);
    } catch (e) {
      row.error = clean(e.message);
      return;
    }
    taken.add(newId);
    names.add(name);
    Object.assign(row, { ok: true, id: newId, name, path, renamed: newId !== baseId || name !== base, text: added.get(path) });
  };

  const rows = entries.map((entry) => {
    const row = { file: entry.name, ok: false, included: !skip.has(entry.name), error: null };
    let doc;
    try { doc = entryDoc(entry.text); }
    catch (e) { row.error = clean(e.message); return row; }
    const baseId = baseIdOf(doc, entry.name);
    row.id = baseId; row.name = row.origName = typeof doc.name === "string" ? doc.name : baseId; row.ips = Array.isArray(doc.ips) ? doc.ips.length : 0;
    if (row.included) plan(entry, doc, baseId, row);
    else row.ok = true;
    return row;
  });
  return { rows, files: added };
}

// Top-left cells of a grid, row by row, that do not touch any occupied { x, y, w, h } rectangle.
export function gridPlacements(count, occupied, { x = 40, y = 40, cols = 4, cw = 240, ch = 140, box = [220, 120] } = {}) {
  const out = [], taken = [...occupied];
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  let i = 0;
  while (out.length < count) {
    const idx = i++;
    const rect = { x: x + (idx % cols) * cw, y: y + Math.floor(idx / cols) * ch, w: box[0], h: box[1] };
    if (taken.some((o) => hit(rect, { x: o.x, y: o.y, w: o.w || 1, h: o.h || 1 }))) continue;
    out.push([rect.x, rect.y]);
  }
  return out;
}

export function summary(rows) {
  const done = rows.filter((r) => r.ok && r.included && r.path);
  const renamed = done.filter((r) => r.renamed).length, skipped = rows.filter((r) => r.error).length;
  return `${done.length} imported, ${renamed} renamed, ${skipped} skipped (parse errors)`;
}
