// Pure logic of the Import servers dialog: probe snippets become new servers/<id>.toml files.
import { parseToml, mergeFolder, tomlModel } from "./toml.mjs";
import { mergeTypes } from "./types.mjs";
import { setKeys } from "./toml-write.mjs";

const VALID_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;

export function sanitizeId(raw) {
  let id = String(raw).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!id) return "server";
  if (/^[0-9]/.test(id)) id = "s" + id;
  return id;
}

const clean = (message) => String(message).replace(/^TOML: /, "");

// entries: [{ name, text }]; opts: { server_type, region, skip: Set of file names left out }.
// Returns one row per entry in order and `files`, the new path -> text entries for the included, valid rows.
export function planImport(files, entries, { server_type, region, skip = new Set() } = {}) {
  const root = mergeFolder(files), types = Object.keys(mergeTypes(root.server_types));
  const regionObj = region ? (root.regions || []).find((r) => r.id === region) : null;
  if (region && !regionObj) throw new Error(`Unknown region '${region}'.`);
  if (!region && !types.includes(server_type)) throw new Error("Choose a server type.");
  const taken = new Set([...(root.regions || []), ...(root.servers || [])].map((e) => e.id));
  const names = new Set((root.servers || []).map((s) => s.name ?? s.id));
  const work = new Map(files), added = new Map(), rows = [];
  for (const entry of entries) {
    const row = { file: entry.name, ok: false, included: !skip.has(entry.name), error: null };
    rows.push(row);
    let doc;
    try { doc = parseToml(entry.text.replace(/^﻿/, "").replace(/\r\n/g, "\n")); }
    catch (e) { row.error = clean(e.message); continue; }
    const rawId = typeof doc.id === "string" && doc.id ? doc.id : entry.name.split(/[\/]/).pop().replace(/\.toml$/i, "");
    const baseId = VALID_ID.test(rawId) ? rawId : sanitizeId(rawId);
    row.id = baseId; row.name = row.origName = typeof doc.name === "string" ? doc.name : baseId; row.ips = Array.isArray(doc.ips) ? doc.ips.length : 0;
    if (!row.included) { row.ok = true; continue; }
    let newId = baseId, n = 1;
    while (taken.has(newId) || work.has(`servers/${newId}.toml`)) newId = `${baseId}-${++n}`;
    const own = typeof doc.name === "string" && doc.name, base = own ? doc.name : newId;
    let name = base, m = n > 1 ? n : 2;
    while (names.has(name)) name = `${base} (${m++})`;
    const pairs = [];
    if (doc.id !== newId) pairs.push(["id", newId]);
    if (name !== base || (own && name !== doc.name)) pairs.push(["name", name]);
    if (regionObj) {
      pairs.push(["region", region]);
      if (typeof doc.server_type === "string") pairs.push(["server_type", regionObj.server_type]);
    } else if (typeof doc.server_type !== "string") pairs.push(["server_type", server_type]);
    const path = `servers/${newId}.toml`;
    try {
      const text = setKeys(entry.text, pairs);
      tomlModel(new Map(work).set(path, text));
      work.set(path, text); added.set(path, text);
    } catch (e) { row.error = clean(e.message); continue; }
    taken.add(newId); names.add(name);
    Object.assign(row, { ok: true, id: newId, name, path, renamed: newId !== baseId || name !== base });
    row.text = added.get(path);
  }
  return { rows, files: added };
}

// Top-left cells of a grid, row by row, that do not touch any occupied { x, y, w, h } rectangle.
export function gridPlacements(count, occupied, { x = 40, y = 40, cols = 4, cw = 240, ch = 140, box = [220, 120] } = {}) {
  const out = [], taken = [...occupied];
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (let i = 0; out.length < count; i++) {
    const rect = { x: x + (i % cols) * cw, y: y + Math.floor(i / cols) * ch, w: box[0], h: box[1] };
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
