// Surgical write-back of notes.toml (the `notes` key) and servers/<id>.toml: every other byte of the file is kept.
import { parseToml, mergeFolder, tomlModel, ipProblem, dnsProblem } from "./toml.mjs";
import { mergeTypes } from "./types.mjs";

function eolOf(src) {
  const i = src.indexOf("\n");
  return i > 0 && src[i - 1] === "\r" ? "\r\n" : "\n";
}

function multiline(text, eol) {
  let out = "";
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += eol;
    else if (ch === "\t") out += ch;
    else if (c < 32 || c === 127) out += "\\u" + c.toString(16).padStart(4, "0");
    else if (c >= 0xd800 && c <= 0xdfff) throw new Error("Note text contains an unpaired surrogate");
    else out += ch;
  }
  return out.replace(/"{3,}|"+$/g, (q) => '\\"'.repeat(q.length));
}

export function formatNotes(texts, eol = "\n") {
  const items = texts.map((t) => `  """${eol}${multiline(t, eol)}"""`);
  return `[${eol}${items.join("," + eol)},${eol}]`;
}

function plain(root) {
  const copy = { ...root };
  delete copy.notes;
  return JSON.stringify(copy);
}

export function setNotes(src, texts) {
  if (!Array.isArray(texts) || texts.some((t) => typeof t !== "string" || !t.trim())) throw new Error("Notes must be non-empty strings");
  const eol = eolOf(src), norm = [], map = [];
  for (let i = 0; i < src.length; i++) {
    if (i === 0 && src[0] === "\uFEFF") continue;
    if (src[i] === "\r" && src[i + 1] === "\n") continue;
    norm.push(src[i]); map.push(i);
  }
  map.push(src.length);
  const flat = norm.join(""), spans = { keys: {} }, before = parseToml(flat, spans);
  const at = (i) => (norm[i] === "\n" && src[map[i] - 1] === "\r" ? map[i] - 1 : map[i]), key = spans.keys.notes;
  let out;
  if (key) {
    if (texts.length) out = src.slice(0, at(key.valueStart)) + formatNotes(texts, eol) + src.slice(at(key.valueEnd));
    else {
      const from = flat.lastIndexOf("\n", key.start - 1) + 1;
      let to = flat.indexOf("\n", key.valueEnd);
      to = to < 0 ? flat.length : to + 1;
      out = src.slice(0, at(from)) + src.slice(at(to));
    }
  } else if (!texts.length) return src;
  else {
    const block = `notes = ${formatNotes(texts, eol)}${eol}`;
    if (spans.lastLineEnd !== undefined) {
      const pos = at(spans.lastLineEnd);
      out = src.slice(0, pos) + (flat.endsWith("\n") || spans.lastLineEnd < flat.length ? "" : eol) + block + src.slice(pos);
    } else {
      const pos = spans.firstTable === undefined ? src.length : at(spans.firstTable);
      const lead = pos === src.length && src.length && !flat.endsWith("\n") ? eol : "";
      out = src.slice(0, pos) + lead + block + (spans.firstTable === undefined ? "" : eol) + src.slice(pos);
    }
  }
  const after = parseToml(out);
  const same = JSON.stringify(after.notes ?? []) === JSON.stringify(texts) && plain(after) === plain(before);
  if (!same) throw new Error("Internal error: the rewritten TOML does not match the notes; nothing was written");
  return out;
}

function prepare(src) {
  const norm = [], map = [];
  for (let i = 0; i < src.length; i++) {
    if (i === 0 && src[0] === "﻿") continue;
    if (src[i] === "\r" && src[i + 1] === "\n") continue;
    norm.push(src[i]); map.push(i);
  }
  map.push(src.length);
  const flat = norm.join(""), spans = { keys: {} };
  const at = (i) => (norm[i] === "\n" && src[map[i] - 1] === "\r" ? map[i] - 1 : map[i]);
  return { flat, spans, at, root: parseToml(flat, spans) };
}

export const SERVER_STRINGS = ["os", "hardware", "role"];
export const SERVER_LISTS = ["ips", "dns", "jobs", "rmi_services", "systemd_services"];
const FIELD_ORDER = ["name", "server_type", ...SERVER_STRINGS, ...SERVER_LISTS, "details"];

function basic(text) {
  let out = "";
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "\n") out += "\\n";
    else if (ch === "\t") out += "\\t";
    else if (c < 32 || c === 127) out += "\\u" + c.toString(16).padStart(4, "0");
    else if (c >= 0xd800 && c <= 0xdfff) throw new Error("Text contains an unpaired surrogate");
    else out += ch;
  }
  return `"${out}"`;
}

function formatList(list, eol, multi) {
  if (!multi) return `[${list.map(basic).join(", ")}]`;
  return `[${eol}${list.map((s) => `  ${basic(s)},${eol}`).join("")}]`;
}

function formatDetails(text, eol) {
  return text.includes("\n") ? `"""${eol}${multiline(text, eol)}"""` : basic(text);
}

export function checkServerFields(fields) {
  const f = fields || {}, one = (v) => typeof v === "string" && !/[\r\n]/.test(v);
  if (typeof f.name !== "string" || !f.name.trim()) throw new Error("The name is empty.");
  if (!one(f.name)) throw new Error("The name must be a single line.");
  for (const key of SERVER_STRINGS) if (!one(f[key])) throw new Error(`${key} must be a single line.`);
  for (const key of SERVER_LISTS) {
    if (!Array.isArray(f[key]) || f[key].some((s) => !one(s) || !s.trim())) throw new Error(`${key} must be single-line, non-empty entries.`);
  }
  for (const ip of f.ips) { const problem = ipProblem(ip.trim()); if (problem) throw new Error(`ips: ${problem}. Use IPv4 with a prefix, e.g. 192.0.2.10/24.`); }
  for (const name of f.dns) { const problem = dnsProblem(name.trim()); if (problem) throw new Error(`dns: ${problem}.`); }
  if (typeof f.details !== "string") throw new Error("details must be text.");
  if (f.server_type !== undefined && (typeof f.server_type !== "string" || !f.server_type)) throw new Error("server_type must be a type id.");
}

function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]));
  return v;
}

// `src` is the text of servers/<id>.toml; `ctx` is the merged diagram (server_types, regions, servers) for type and name checks.
export function setServer(src, id, fields, ctx = {}) {
  checkServerFields(fields);
  const eol = eolOf(src), { flat, spans, at, root: old } = prepare(src), rec = spans;
  if (old.id !== undefined && old.id !== id) throw new Error(`Server '${id}' is not in the file`);
  const types = mergeTypes(ctx.server_types);
  if (fields.server_type !== undefined && !Object.hasOwn(types, fields.server_type)) throw new Error(`Unknown server type '${fields.server_type}'. Known: ${Object.keys(types).join(", ")}.`);
  const inherited = old.server_type ?? (ctx.regions || []).find((r) => r.id === old.region)?.server_type;
  if ((ctx.servers || []).some((o) => o.id !== id && (o.name ?? o.id) === fields.name.trim())) throw new Error(`duplicate server name '${fields.name.trim()}'`);
  const want = { name: fields.name.trim(), server_type: fields.server_type ?? inherited, details: fields.details.trim() ? fields.details.replace(/\s+$/, "") : "" };
  for (const k of SERVER_STRINGS) want[k] = fields[k].trim();
  for (const k of SERVER_LISTS) want[k] = fields[k].map((s) => s.trim());
  const was = (k) => k === "name" ? old.name ?? id : k === "server_type" ? inherited : SERVER_LISTS.includes(k) ? (old[k] ?? []).map((s) => s.trim()) : (k === "details" ? old[k] ?? "" : (old[k] ?? "").trim());
  const emptyValue = (v) => v === "" || (Array.isArray(v) && !v.length);
  const lineEnd = (k) => { const i = flat.indexOf("\n", rec.keys[k].valueEnd); return i < 0 ? flat.length : i + 1; };
  const expect = { ...old }, edits = [], lines = [];
  for (const k of FIELD_ORDER) {
    const v = want[k], cur = rec.keys[k], before = was(k);
    const unchanged = k === "details" ? typeof before === "string" && before.replace(/\s+$/, "") === v : JSON.stringify(before) === JSON.stringify(v);
    if (unchanged) continue;
    if (cur && emptyValue(v)) {
      edits.push({ from: at(flat.lastIndexOf("\n", cur.start - 1) + 1), to: at(lineEnd(k)), text: "" });
      delete expect[k];
      continue;
    }
    const multi = cur && flat.slice(cur.valueStart, cur.valueEnd).includes("\n");
    const text = SERVER_LISTS.includes(k) ? formatList(v, eol, multi) : k === "details" ? formatDetails(v, eol) : basic(v);
    expect[k] = v;
    if (cur) edits.push({ from: at(cur.valueStart), to: at(cur.valueEnd), text });
    else lines.push(`${k} = ${text}`);
  }
  if (lines.length) {
    const last = Object.keys(rec.keys).sort((a, b) => rec.keys[b].start - rec.keys[a].start)[0];
    const end = lineEnd(last), atEof = end >= flat.length && !flat.endsWith("\n"), block = lines.join(eol);
    edits.push({ from: at(end), to: at(end), text: atEof ? eol + block : block + eol });
  }
  let out = src;
  for (const e of edits.sort((a, b) => b.from - a.from || b.to - a.to)) out = out.slice(0, e.from) + e.text + out.slice(e.to);
  const after = parseToml(out);
  if (JSON.stringify(canonical(after)) !== JSON.stringify(canonical(expect))) {
    throw new Error("Internal error: the rewritten TOML does not match the edit; nothing was written");
  }
  return out;
}

// `files` is the folder (path -> text); returns the new file's path, text and id. Unlisted `server_type` falls back to the region's type or the first known one.
export function addServer(files, { region, server_type } = {}) {
  const root = mergeFolder(files), types = Object.keys(mergeTypes(root.server_types));
  const taken = new Set([...(root.regions || []), ...(root.servers || [])].map((e) => e.id));
  const names = new Set((root.servers || []).map((s) => s.name ?? s.id));
  let n = (root.servers || []).length + 1;
  while (taken.has("server" + n) || names.has("server-" + n) || files.has(`servers/server${n}.toml`)) n++;
  const id = "server" + n, lines = [`id = ${basic(id)}`, `name = ${basic("server-" + n)}`];
  if (region) lines.push(`region = ${basic(region)}`);
  else lines.push(`server_type = ${basic(server_type ?? types[0])}`);
  const text = lines.join("\n") + "\n", path = `servers/${id}.toml`;
  tomlModel(new Map(files).set(path, text));
  return { path, text, id };
}

export function duplicateServer(files, id) {
  const srcPath = `servers/${id}.toml`, src = files.get(srcPath);
  if (src === undefined) throw new Error(`Server '${id}' has no file ${srcPath}.`);
  const root = mergeFolder(files), old = (root.servers || []).find((s) => s.id === id);
  if (!old) throw new Error(`Server '${id}' not found.`);
  const taken = new Set([...(root.regions || []), ...(root.servers || [])].map((e) => e.id));
  const names = new Set((root.servers || []).map((s) => s.name ?? s.id));
  const baseName = old.name ?? id;
  let n = 1, suffix = "-copy";
  while (taken.has(id + suffix) || names.has(baseName + suffix) || files.has(`servers/${id}${suffix}.toml`)) suffix = `-copy-${++n}`;
  const newId = id + suffix, name = baseName + suffix, eol = eolOf(src);
  const { flat, spans, at } = prepare(src), edits = [], lines = [];
  for (const [k, v] of [["id", newId], ["name", name]]) {
    const cur = spans.keys[k];
    if (cur) edits.push({ from: at(cur.valueStart), to: at(cur.valueEnd), text: basic(v) });
    else lines.push(`${k} = ${basic(v)}`);
  }
  if (lines.length) {
    const last = Object.keys(spans.keys).sort((a, b) => spans.keys[b].start - spans.keys[a].start)[0];
    const end = last ? flat.indexOf("\n", spans.keys[last].valueEnd) : -1, pos = end < 0 ? src.length : at(end + 1);
    const lead = end < 0 && src.length && !flat.endsWith("\n") ? eol : "";
    edits.push({ from: pos, to: pos, text: lead + lines.join(eol) + eol });
  }
  let text = src;
  for (const e of edits.sort((a, b) => b.from - a.from || b.to - a.to)) text = text.slice(0, e.from) + e.text + text.slice(e.to);
  const after = parseToml(text);
  if (JSON.stringify(canonical({ ...after, id: 0, name: 0 })) !== JSON.stringify(canonical({ ...parseToml(prepare(src).flat), id: 0, name: 0 })) || after.id !== newId || after.name !== name) {
    throw new Error("Internal error: the duplicated TOML does not match the original; nothing was written");
  }
  const path = `servers/${newId}.toml`;
  tomlModel(new Map(files).set(path, text));
  return { path, text, id: newId };
}

// Server types that have no region yet: a diagram has at most one region per server type.
export function freeRegionTypes(files) {
  const root = mergeFolder(files), used = new Set((root.regions || []).map((r) => r.server_type));
  return Object.entries(mergeTypes(root.server_types)).filter(([tid]) => !used.has(tid)).map(([tid, t]) => ({ id: tid, label: t.label }));
}

// Appends a `[[regions]]` table to topology.toml after the last existing one; id and title come from the server type.
export function addRegion(files, { server_type } = {}) {
  const src = files.get("topology.toml");
  if (src === undefined) throw new Error("topology.toml is missing");
  const root = mergeFolder(files), types = mergeTypes(root.server_types);
  if (typeof server_type !== "string" || !Object.hasOwn(types, server_type)) throw new Error(`Unknown server type '${server_type}'. Known: ${Object.keys(types).join(", ")}.`);
  const dup = (root.regions || []).find((r) => r.server_type === server_type);
  if (dup) throw new Error(`Server type '${server_type}' already has the region '${dup.id}'; a diagram has at most one region per server type.`);
  const taken = new Set([...(root.regions || []), ...(root.servers || [])].map((e) => e.id));
  let id = server_type, n = 1;
  while (taken.has(id)) id = n++ === 1 ? `${server_type}-region` : `${server_type}-region-${n - 1}`;
  const eol = eolOf(src), { flat, spans, at } = prepare(src), block = [`[[regions]]`, `id = ${basic(id)}`, `title = ${basic(types[server_type].label)}`, `server_type = ${basic(server_type)}`].join(eol);
  const tables = spans.tables || [], last = tables.map((t) => t.name).lastIndexOf("regions");
  let out;
  if (last >= 0) {
    const stop = last + 1 < tables.length ? tables[last + 1].start : flat.length, end = flat.slice(0, stop).replace(/\s+$/, "").length;
    out = src.slice(0, at(end)) + eol + eol + block + (stop === flat.length && !flat.endsWith("\n") ? eol : "") + src.slice(at(end));
  } else if (tables.length) out = src.slice(0, at(tables[0].start)) + block + eol + eol + src.slice(at(tables[0].start));
  else out = src + (!src.length || flat.endsWith("\n") ? "" : eol) + (src.trim() ? eol : "") + block + eol;
  const after = mergeFolder(new Map(files).set("topology.toml", out)), added = (after.regions || []).at(-1);
  if ((after.regions || []).length !== (root.regions || []).length + 1 || added.id !== id || added.server_type !== server_type) {
    throw new Error("Internal error: the rewritten TOML does not match the edit; nothing was written");
  }
  tomlModel(new Map(files).set("topology.toml", out));
  return { path: "topology.toml", text: out, id };
}

function setTopKeys(src, changes) {
  const eol = eolOf(src), { flat, spans, at, root: old } = prepare(src), expect = { ...old }, edits = [], lines = [];
  const lineEnd = (k) => { const i = flat.indexOf("\n", spans.keys[k].valueEnd); return i < 0 ? flat.length : i + 1; };
  for (const [k, v] of Object.entries(changes)) {
    const cur = spans.keys[k];
    if (v === null) {
      if (cur) edits.push({ from: at(flat.lastIndexOf("\n", cur.start - 1) + 1), to: at(lineEnd(k)), text: "" });
      delete expect[k];
    } else if (old[k] !== v) {
      expect[k] = v;
      if (cur) edits.push({ from: at(cur.valueStart), to: at(cur.valueEnd), text: basic(v) });
      else lines.push(`${k} = ${basic(v)}`);
    }
  }
  if (lines.length) {
    const last = Object.keys(spans.keys).sort((a, b) => spans.keys[b].start - spans.keys[a].start)[0];
    const end = last ? lineEnd(last) : flat.length, atEof = end >= flat.length && flat.length > 0 && !flat.endsWith("\n"), block = lines.join(eol);
    edits.push({ from: at(end), to: at(end), text: atEof ? eol + block + eol : block + eol });
  }
  let out = src;
  for (const e of edits.sort((a, b) => b.from - a.from || b.to - a.to)) out = out.slice(0, e.from) + e.text + out.slice(e.to);
  if (JSON.stringify(canonical(parseToml(out))) !== JSON.stringify(canonical(expect))) throw new Error("Internal error: the rewritten TOML does not match the edit; nothing was written");
  return out;
}

// Puts server `id` into `region` (an id) or out of every region (null). Entering adopts the region's server_type when the file sets its own;
// leaving writes the type it had, so the server keeps it.
export function moveServer(files, id, region) {
  const path = `servers/${id}.toml`, src = files.get(path);
  if (src === undefined) throw new Error(`Server '${id}' has no file ${path}.`);
  const root = mergeFolder(files), old = (root.servers || []).find((s) => s.id === id), regions = root.regions || [];
  if (!old) throw new Error(`Server '${id}' not found.`);
  const target = region === null ? null : regions.find((r) => r.id === region);
  if (region !== null && !target) throw new Error(`Unknown region '${region}'.`);
  if ((old.region ?? null) === region) return { path, text: src, id };
  const changes = { region };
  if (target) { if (old.server_type !== undefined) changes.server_type = target.server_type; }
  else changes.server_type = old.server_type ?? regions.find((r) => r.id === old.region)?.server_type;
  const text = setTopKeys(src, changes);
  tomlModel(new Map(files).set(path, text));
  return { path, text, id };
}
