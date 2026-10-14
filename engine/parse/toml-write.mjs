// Surgical write-back of notes.toml (the `notes` key) and servers/<id>.toml: every other byte of the file is kept.
import { parseToml, mergeFolder, tomlModel, ipProblem, dnsProblem } from "./toml.mjs";
import { mergeTypes } from "./types.mjs";
import { TOPOLOGY_FILE, serverPath } from "../lib/files.mjs";
import { SERVER_ROW_FIELDS, SERVER_LIST_FIELDS, SERVER_FORM_KEYS } from "../model/server-fields.mjs";
import { tomlBasic, tomlMultilineBody } from "./toml-escape.mjs";

function eolOf(src) {
  const i = src.indexOf("\n");
  return i > 0 && src[i - 1] === "\r" ? "\r\n" : "\n";
}

export function formatNotes(texts, eol = "\n") {
  const items = texts.map((t) => `  """${eol}${tomlMultilineBody(t, eol)}"""`);
  return `[${eol}${items.join("," + eol)},${eol}]`;
}

function plain(root) {
  const copy = { ...root };
  delete copy.notes;
  return JSON.stringify(copy);
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

const byPosition = (a, b) => b.from - a.from || b.to - a.to;
const applyEdits = (src, edits) => edits.toSorted(byPosition).reduce((out, e) => out.slice(0, e.from) + e.text + out.slice(e.to), src);
const REWRITE_MISMATCH = "Internal error: the rewritten TOML does not match the edit; nothing was written";

const lastKeyOf = (spans) => Object.keys(spans.keys).sort((a, b) => spans.keys[b].start - spans.keys[a].start)[0];
const keyLineEnd = ({ flat, spans }, k) => {
  const i = flat.indexOf("\n", spans.keys[k].valueEnd);
  return i < 0 ? flat.length : i + 1;
};
const removeLineEdit = (doc, k) => {
  const cur = doc.spans.keys[k];
  return { from: doc.at(doc.flat.lastIndexOf("\n", cur.start - 1) + 1), to: doc.at(keyLineEnd(doc, k)), text: "" };
};
const replaceValueEdit = (doc, cur, text) => ({ from: doc.at(cur.valueStart), to: doc.at(cur.valueEnd), text });

// New `key = value` lines go after the last key; `closeEof` ends the block with a line break when the file did not end with one.
function appendLinesEdit(doc, lines, eol, closeEof) {
  const { flat, spans, at } = doc, last = lastKeyOf(spans);
  const end = last ? keyLineEnd(doc, last) : flat.length, atEof = end >= flat.length && flat.length > 0 && !flat.endsWith("\n"), block = lines.join(eol);
  const tail = closeEof ? eol : "";
  return { from: at(end), to: at(end), text: atEof ? eol + block + tail : block + eol };
}

function replaceNotesKey(src, doc, key, texts, eol) {
  const { flat, at } = doc;
  if (texts.length) return src.slice(0, at(key.valueStart)) + formatNotes(texts, eol) + src.slice(at(key.valueEnd));
  const from = flat.lastIndexOf("\n", key.start - 1) + 1;
  let to = flat.indexOf("\n", key.valueEnd);
  to = to < 0 ? flat.length : to + 1;
  return src.slice(0, at(from)) + src.slice(at(to));
}

function insertNotesKey(src, doc, texts, eol) {
  const { flat, spans, at } = doc, block = `notes = ${formatNotes(texts, eol)}${eol}`;
  if (spans.lastLineEnd !== undefined) {
    const pos = at(spans.lastLineEnd);
    return src.slice(0, pos) + (flat.endsWith("\n") || spans.lastLineEnd < flat.length ? "" : eol) + block + src.slice(pos);
  }
  const noTables = spans.firstTable === undefined, pos = noTables ? src.length : at(spans.firstTable);
  const lead = pos === src.length && src.length && !flat.endsWith("\n") ? eol : "";
  return src.slice(0, pos) + lead + block + (noTables ? "" : eol) + src.slice(pos);
}

export function setNotes(src, texts) {
  if (!Array.isArray(texts) || texts.some((t) => typeof t !== "string" || !t.trim())) throw new Error("Notes must be non-empty strings");
  const eol = eolOf(src), doc = prepare(src), key = doc.spans.keys.notes;
  if (!key && !texts.length) return src;
  const out = key ? replaceNotesKey(src, doc, key, texts, eol) : insertNotesKey(src, doc, texts, eol);
  const after = parseToml(out);
  const same = JSON.stringify(after.notes ?? []) === JSON.stringify(texts) && plain(after) === plain(doc.root);
  if (!same) throw new Error("Internal error: the rewritten TOML does not match the notes; nothing was written");
  return out;
}

export const SERVER_STRINGS = SERVER_ROW_FIELDS.map((f) => f.key);
export const SERVER_LISTS = SERVER_LIST_FIELDS.map((f) => f.key);
const FIELD_ORDER = SERVER_FORM_KEYS;

function formatList(list, eol, multi) {
  if (!multi) return `[${list.map((s) => tomlBasic(s)).join(", ")}]`;
  const items = list.map((s) => `  ${tomlBasic(s)},${eol}`).join("");
  return `[${eol}${items}]`;
}

function formatDetails(text, eol) {
  return text.includes("\n") ? `"""${eol}${tomlMultilineBody(text, eol)}"""` : tomlBasic(text);
}

const singleLine = (v) => typeof v === "string" && !/[\r\n]/.test(v);

const LIST_CHECKS = {
  ip: (v) => { const problem = ipProblem(v); return problem && `${problem}. Use IPv4 with a prefix, e.g. 192.0.2.10/24.`; },
  dns: (v) => { const problem = dnsProblem(v); return problem && `${problem}.`; },
};

function checkNetworkFields(f) {
  for (const { key, check } of SERVER_LIST_FIELDS) {
    if (!check) continue;
    for (const entry of f[key]) {
      const problem = LIST_CHECKS[check](entry.trim());
      if (problem) throw new Error(`${key}: ${problem}`);
    }
  }
}

export function checkServerFields(fields) {
  const f = fields || {};
  if (typeof f.name !== "string" || !f.name.trim()) throw new Error("The name is empty.");
  if (!singleLine(f.name)) throw new Error("The name must be a single line.");
  for (const key of SERVER_STRINGS) if (!singleLine(f[key])) throw new Error(`${key} must be a single line.`);
  for (const key of SERVER_LISTS) {
    if (!Array.isArray(f[key]) || f[key].some((s) => !singleLine(s) || !s.trim())) throw new Error(`${key} must be single-line, non-empty entries.`);
  }
  checkNetworkFields(f);
  if (typeof f.details !== "string") throw new Error("details must be text.");
  if (f.server_type !== undefined && (typeof f.server_type !== "string" || !f.server_type)) throw new Error("server_type must be a type id.");
}

function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort((a, b) => (a < b ? -1 : Number(a > b))).map((k) => [k, canonical(v[k])]));
  return v;
}
const sameCanonical = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

function serverWanted(fields, inherited) {
  const want = { name: fields.name.trim(), server_type: fields.server_type ?? inherited, details: fields.details.trim() ? fields.details.trimEnd() : "" };
  for (const k of SERVER_STRINGS) want[k] = fields[k].trim();
  for (const k of SERVER_LISTS) want[k] = fields[k].map((s) => s.trim());
  return want;
}

function serverWas(k, old, id, inherited) {
  if (k === "name") return old.name ?? id;
  if (k === "server_type") return inherited;
  if (SERVER_LISTS.includes(k)) return (old[k] ?? []).map((s) => s.trim());
  return k === "details" ? old[k] ?? "" : (old[k] ?? "").trim();
}

const emptyValue = (v) => v === "" || (Array.isArray(v) && !v.length);
const unchangedField = (k, before, v) => (k === "details" ? typeof before === "string" && before.trimEnd() === v : JSON.stringify(before) === JSON.stringify(v));

function serverFieldText(k, v, eol, multi) {
  if (SERVER_LISTS.includes(k)) return formatList(v, eol, multi);
  return k === "details" ? formatDetails(v, eol) : tomlBasic(v);
}

function checkServerContext(fields, id, old, ctx) {
  if (old.id !== undefined && old.id !== id) throw new Error(`Server '${id}' is not in the file`);
  const types = mergeTypes(ctx.server_types);
  if (fields.server_type !== undefined && !Object.hasOwn(types, fields.server_type)) throw new Error(`Unknown server type '${fields.server_type}'. Known: ${Object.keys(types).join(", ")}.`);
  const inherited = old.server_type ?? (ctx.regions || []).find((r) => r.id === old.region)?.server_type;
  if ((ctx.servers || []).some((o) => o.id !== id && (o.name ?? o.id) === fields.name.trim())) throw new Error(`duplicate server name '${fields.name.trim()}'`);
  return inherited;
}

// `src` is the text of servers/<id>.toml; `ctx` is the merged diagram (server_types, regions, servers) for type and name checks.
export function setServer(src, id, fields, ctx = {}) {
  checkServerFields(fields);
  const eol = eolOf(src), doc = prepare(src), { flat, spans: rec, root: old } = doc;
  const inherited = checkServerContext(fields, id, old, ctx), want = serverWanted(fields, inherited);
  const expect = { ...old }, edits = [], lines = [];
  for (const k of FIELD_ORDER) {
    const v = want[k], cur = rec.keys[k];
    if (unchangedField(k, serverWas(k, old, id, inherited), v)) continue;
    if (cur && emptyValue(v)) {
      edits.push(removeLineEdit(doc, k));
      delete expect[k];
      continue;
    }
    expect[k] = v;
    const text = serverFieldText(k, v, eol, cur && flat.slice(cur.valueStart, cur.valueEnd).includes("\n"));
    if (cur) edits.push(replaceValueEdit(doc, cur, text));
    else lines.push(`${k} = ${text}`);
  }
  if (lines.length) edits.push(appendLinesEdit(doc, lines, eol, false));
  const out = applyEdits(src, edits);
  if (!sameCanonical(parseToml(out), expect)) throw new Error("Internal error: the rewritten TOML does not match the edit; nothing was written");
  return out;
}

// `files` is the folder (path -> text); returns the new file's path, text and id. Unlisted `server_type` falls back to the region's type or the first known one.
export function addServer(files, { region, server_type } = {}) {
  const root = mergeFolder(files), types = Object.keys(mergeTypes(root.server_types));
  const taken = new Set([...(root.regions || []), ...(root.servers || [])].map((e) => e.id));
  const names = new Set((root.servers || []).map((s) => s.name ?? s.id));
  let n = (root.servers || []).length + 1;
  while (taken.has("server" + n) || names.has("server-" + n) || files.has(serverPath("server" + n))) n++;
  const id = "server" + n, lines = [`id = ${tomlBasic(id)}`, `name = ${tomlBasic("server-" + n)}`];
  if (region) lines.push(`region = ${tomlBasic(region)}`);
  else lines.push(`server_type = ${tomlBasic(server_type ?? types[0])}`);
  const text = lines.join("\n") + "\n", path = serverPath(id);
  tomlModel(new Map(files).set(path, text));
  return { path, text, id };
}

// Sets top-level string keys: existing values are replaced in place, missing keys are appended after the last key.
export function setKeys(src, pairs) {
  const eol = eolOf(src), doc = prepare(src), edits = [], lines = [];
  for (const [k, v] of pairs) {
    const cur = doc.spans.keys[k];
    if (cur) edits.push(replaceValueEdit(doc, cur, tomlBasic(v)));
    else lines.push(`${k} = ${tomlBasic(v)}`);
  }
  if (lines.length) edits.push(appendLinesEdit(doc, lines, eol, true));
  const text = applyEdits(src, edits), after = parseToml(text);
  for (const [k, v] of pairs) if (after[k] !== v) throw new Error(REWRITE_MISMATCH);
  return text;
}

function copyIdentity(root, fileMap, id, old) {
  const taken = new Set([...(root.regions || []), ...(root.servers || [])].map((e) => e.id));
  const names = new Set((root.servers || []).map((s) => s.name ?? s.id));
  const baseName = old.name ?? id;
  let n = 1, suffix = "-copy";
  while (taken.has(id + suffix) || names.has(baseName + suffix) || fileMap.has(serverPath(id + suffix))) suffix = `-copy-${++n}`;
  return { newId: id + suffix, name: baseName + suffix };
}

export function duplicateServer(files, id) {
  const srcPath = serverPath(id), src = files.get(srcPath);
  if (src === undefined) throw new Error(`Server '${id}' has no file ${srcPath}.`);
  const root = mergeFolder(files), old = (root.servers || []).find((s) => s.id === id);
  if (!old) throw new Error(`Server '${id}' not found.`);
  const { newId, name } = copyIdentity(root, files, id, old);
  const text = setKeys(src, [["id", newId], ["name", name]]), after = parseToml(text);
  if (!sameCanonical({ ...after, id: 0, name: 0 }, { ...parseToml(prepare(src).flat), id: 0, name: 0 }) || after.id !== newId || after.name !== name) {
    throw new Error("Internal error: the duplicated TOML does not match the original; nothing was written");
  }
  const path = serverPath(newId);
  tomlModel(new Map(files).set(path, text));
  return { path, text, id: newId };
}

// Server types that have no region yet: a diagram has at most one region per server type.
export function freeRegionTypes(files) {
  const root = mergeFolder(files), used = new Set((root.regions || []).map((r) => r.server_type));
  return Object.entries(mergeTypes(root.server_types)).filter(([tid]) => !used.has(tid)).map(([tid, t]) => ({ id: tid, label: t.label }));
}

function freeRegionId(root, server_type) {
  const taken = new Set([...(root.regions || []), ...(root.servers || [])].map((e) => e.id));
  let id = server_type, n = 1;
  while (taken.has(id)) id = n++ === 1 ? `${server_type}-region` : `${server_type}-region-${n - 1}`;
  return id;
}

function insertRegionBlock(src, doc, block, eol) {
  const { flat, spans, at } = doc, tables = spans.tables || [], last = tables.map((t) => t.name).lastIndexOf("regions");
  if (last >= 0) {
    const stop = last + 1 < tables.length ? tables[last + 1].start : flat.length, end = flat.slice(0, stop).trimEnd().length;
    return src.slice(0, at(end)) + eol + eol + block + (stop === flat.length && !flat.endsWith("\n") ? eol : "") + src.slice(at(end));
  }
  if (tables.length) return src.slice(0, at(tables[0].start)) + block + eol + eol + src.slice(at(tables[0].start));
  return src + (!src.length || flat.endsWith("\n") ? "" : eol) + (src.trim() ? eol : "") + block + eol;
}

// Appends a `[[regions]]` table to topology.toml after the last existing one; id and title come from the server type.
export function addRegion(files, { server_type } = {}) {
  const src = files.get(TOPOLOGY_FILE);
  if (src === undefined) throw new Error(TOPOLOGY_FILE + " is missing");
  const root = mergeFolder(files), types = mergeTypes(root.server_types);
  if (typeof server_type !== "string" || !Object.hasOwn(types, server_type)) throw new Error(`Unknown server type '${server_type}'. Known: ${Object.keys(types).join(", ")}.`);
  const dup = (root.regions || []).find((r) => r.server_type === server_type);
  if (dup) throw new Error(`Server type '${server_type}' already has the region '${dup.id}'; a diagram has at most one region per server type.`);
  const id = freeRegionId(root, server_type), eol = eolOf(src), doc = prepare(src);
  const block = [`[[regions]]`, `id = ${tomlBasic(id)}`, `title = ${tomlBasic(types[server_type].label)}`, `server_type = ${tomlBasic(server_type)}`].join(eol);
  const out = insertRegionBlock(src, doc, block, eol);
  const after = mergeFolder(new Map(files).set(TOPOLOGY_FILE, out)), added = (after.regions || []).at(-1);
  if ((after.regions || []).length !== (root.regions || []).length + 1 || added.id !== id || added.server_type !== server_type) throw new Error(REWRITE_MISMATCH);
  tomlModel(new Map(files).set(TOPOLOGY_FILE, out));
  return { path: TOPOLOGY_FILE, text: out, id };
}

function setTopKeys(src, changes) {
  const eol = eolOf(src), doc = prepare(src), { spans, root: old } = doc, expect = { ...old }, edits = [], lines = [];
  for (const [k, v] of Object.entries(changes)) {
    const cur = spans.keys[k];
    if (v === null) {
      if (cur) edits.push(removeLineEdit(doc, k));
      delete expect[k];
    } else if (old[k] !== v) {
      expect[k] = v;
      if (cur) edits.push(replaceValueEdit(doc, cur, tomlBasic(v)));
      else lines.push(`${k} = ${tomlBasic(v)}`);
    }
  }
  if (lines.length) edits.push(appendLinesEdit(doc, lines, eol, true));
  const out = applyEdits(src, edits);
  if (!sameCanonical(parseToml(out), expect)) throw new Error(REWRITE_MISMATCH);
  return out;
}

// Puts server `id` into `region` (an id) or out of every region (null). Entering adopts the region's server_type when the file sets its own;
// leaving writes the type it had, so the server keeps it.
export function moveServer(files, id, region) {
  const path = serverPath(id), src = files.get(path);
  if (src === undefined) throw new Error(`Server '${id}' has no file ${path}.`);
  const root = mergeFolder(files), old = (root.servers || []).find((s) => s.id === id), regions = root.regions || [];
  if (!old) throw new Error(`Server '${id}' not found.`);
  const target = region === null ? null : regions.find((r) => r.id === region);
  if (region !== null && !target) throw new Error(`Unknown region '${region}'.`);
  if ((old.region ?? null) === region) return { path, text: src, id };
  const changes = { region };
  if (!target) changes.server_type = old.server_type ?? regions.find((r) => r.id === old.region)?.server_type;
  else if (old.server_type !== undefined) changes.server_type = target.server_type;
  const text = setTopKeys(src, changes);
  tomlModel(new Map(files).set(path, text));
  return { path, text, id };
}
