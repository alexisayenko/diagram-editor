// Surgical write-back of the top-level `notes` key: every other byte of the file is kept.
import { parseToml, tomlModel, ipProblem, dnsProblem } from "./toml.mjs";
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

export function setServer(src, id, fields) {
  checkServerFields(fields);
  const eol = eolOf(src), { flat, spans, at, root } = prepare(src);
  const idx = (root.servers || []).findIndex((s) => s.id === id);
  if (idx < 0) throw new Error(`Server '${id}' is not in the file`);
  const old = root.servers[idx], rec = spans.tables.filter((t) => t.name === "servers")[idx];
  const types = mergeTypes(root.server_types);
  if (fields.server_type !== undefined && !Object.hasOwn(types, fields.server_type)) throw new Error(`Unknown server type '${fields.server_type}'. Known: ${Object.keys(types).join(", ")}.`);
  const inherited = old.server_type ?? (root.regions || []).find((r) => r.id === old.region)?.server_type;
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
  const rest = (r) => canonical({ ...r, servers: (r.servers || []).filter((_, i) => i !== idx) });
  if (JSON.stringify(rest(after)) !== JSON.stringify(rest(root)) || JSON.stringify(canonical(after.servers[idx])) !== JSON.stringify(canonical(expect))) {
    throw new Error("Internal error: the rewritten TOML does not match the edit; nothing was written");
  }
  if (out !== src) tomlModel(out);
  return out;
}
