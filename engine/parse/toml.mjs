// The diagram authoring subset of TOML: scalar keys and top-level arrays of tables, plus the diagram folder merge.
// Kept dependency-free and shared by Node tests and the standalone browser page.
import { parseNotes } from "./notes.mjs";
import { mergeTypes, RESERVED_TYPES } from "./types.mjs";
import { FormatError } from "./errors.mjs";
import { ipv4CidrProblem } from "../lib/net.mjs";
import { TOPOLOGY_FILE, LEGACY_TOPOLOGY_FILE, SERVER_TYPES_FILE, NOTES_FILE, DOCUMENTS_FILE, NETWORKS_FILE, SERVER_DIR } from "../lib/files.mjs";
import { SERVER_KEYS, SERVER_ROW_FIELDS } from "../render/server-fields.mjs";

export const ipProblem = ipv4CidrProblem;
export function dnsProblem(name) {
  const ok = typeof name === "string" && name.length <= 253 && /^\w([\w-]{0,61}\w)?(\.\w([\w-]{0,61}\w)?)*\.?$/.test(name);
  return ok ? null : `invalid host name '${name}'`;
}
const ESCAPES = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "\\": "\\" };
const KEY = /^([a-z][a-z0-9_]*)[ \t]*=/;

export function parseToml(src, spans = null) {
  src = src.replace(/^﻿/, "").replaceAll("\r\n", "\n");
  let p = 0, table = Object.create(null), current = null;
  const root = table;
  const error = (message) => { throw new FormatError(message, { line: src.slice(0, p).split("\n").length }); };
  function space(lines = true) {
    while (p < src.length) {
      if (src[p] === "#") { while (p < src.length && src[p] !== "\n") p++; }
      else if ((lines ? /\s/ : /[ \t]/).test(src[p])) p++;
      else break;
      if (!lines && src[p] === "\n") break;
    }
  }
  function quoteRun(quote) {
    let run = 1;
    while (src[p - 1 + run] === quote) run++;
    if (run > 5) error("too many quotes in a multi-line string");
    p += run - 1;
    return run;
  }
  function skipLineContinuation() {
    let q = p;
    while (src[q] === " " || src[q] === "\t") q++;
    if (src[q] !== "\n") error("unsupported string escape");
    while (/[ \t\n]/.test(src[q] || "")) q++;
    p = q;
  }
  function unicodeEscape(e) {
    const n = e === "u" ? 4 : 8, h = src.slice(p, p + n), v = Number.parseInt(h, 16);
    if (h.length !== n || !/^[0-9a-f]+$/i.test(h) || v > 0x10ffff || (v >= 0xd800 && v <= 0xdfff)) error("invalid Unicode escape");
    p += n;
    return String.fromCodePoint(v);
  }
  function escape() {
    const e = src[p++];
    if (Object.hasOwn(ESCAPES, e)) return ESCAPES[e];
    if (e === "u" || e === "U") return unicodeEscape(e);
    return error("unsupported string escape");
  }
  const badChar = (c, multi) => (c === "\n" ? !multi : c.codePointAt(0) < 32 && !(multi && c === "\t"));
  function string() {
    const quote = src[p++], multi = src.startsWith(quote + quote, p);
    let out = "";
    if (multi) { p += 2; if (src[p] === "\n") p++; }
    while (p < src.length) {
      const c = src[p++];
      if (c === quote) {
        if (!multi) return out;
        const run = quoteRun(quote);
        if (run >= 3) return out + quote.repeat(run - 3);
        out += quote.repeat(run);
        continue;
      }
      if (badChar(c, multi)) error(String.raw`strings must be on one line; use \n or a multi-line string`);
      if (c !== "\\" || quote === "'") out += c;
      else if (multi && /[ \t\n]/.test(src[p])) skipLineContinuation();
      else out += escape();
    }
    return error("unterminated string");
  }
  function array() {
    p++;
    const values = [];
    space();
    while (src[p] !== "]") {
      if (p >= src.length) error("unterminated array");
      values.push(value());
      space();
      if (src[p] === "]") break;
      if (src[p++] !== ",") error("expected ',' in array");
      space();
    }
    p++;
    return values;
  }
  function value() {
    space();
    if (src[p] === '"' || src[p] === "'") return string();
    if (src[p] === "[") return array();
    const m = src.slice(p).match(/^(true|false)(?=[\s,#\]]|$)/);
    if (m) { p += m[0].length; return m[0] === "true"; }
    return error("expected a quoted string, boolean, or array (see AUTHORING.md)");
  }
  function tableHeader() {
    const m = src.slice(p).match(/^\[\[([a-z][a-z0-9_]*)\]\]/);
    if (!m) error("expected a [[name]] table header");
    if (spans && spans.firstTable === undefined) spans.firstTable = p;
    p += m[0].length;
    if (Object.hasOwn(root, m[1]) && !Array.isArray(root[m[1]])) error("table name already used as a key");
    table = Object.create(null);
    root[m[1]] ||= [];
    root[m[1]].push(table);
    if (!spans) return;
    current = { name: m[1], start: p - m[0].length, keys: {}, table };
    spans.tables ||= [];
    spans.tables.push(current);
  }
  function keyValue() {
    const m = src.slice(p).match(KEY), start = p;
    if (!m) error("expected key = value");
    p += m[0].length;
    if (Object.hasOwn(table, m[1])) error(`duplicate key '${m[1]}'`);
    space(false);
    const valueStart = p;
    table[m[1]] = value();
    if (!spans) return false;
    const atRoot = table === root;
    (atRoot ? spans.keys : current.keys)[m[1]] = { start, valueStart, valueEnd: p };
    return atRoot;
  }
  while (p < src.length) {
    space();
    if (p >= src.length) break;
    let keyLine = false;
    if (src[p] === "[") tableHeader();
    else keyLine = keyValue();
    space(false);
    if (p < src.length && src[p] !== "\n") error("unexpected text after value");
    p++;
    if (keyLine) spans.lastLineEnd = Math.min(p, src.length);
  }
  return root;
}

// One note card from its TOML string: first line title, optional "Date:" line, rest body.
export function parseNoteText(text, at = "note", strict = false) {
  const fail = (m) => { throw new FormatError(m, { path: at }); };
  if (strict && text.trim() && !text.split("\n")[0].trim()) fail("the first line is the title and cannot be empty");
  const [head, ...rest] = text.trim().split("\n"), dated = /^\s*Date:/.test(rest[0] || "");
  if (!head) fail("needs a title line and body text");
  if (dated && !/^\s*Date:\s*\S/.test(rest[0])) fail("empty Date");
  const body = rest.slice(dated ? 1 : 0).join("\n");
  if (!body.trim()) fail("needs a title line and body text");
  if (/^[^\S\n]*#/m.test(body)) fail("body lines cannot start with #");
  return { ...parseNotes(`## ${head}\n${dated ? "" : "Date: Note\n\n"}${rest.join("\n")}`)[0], text: text.trim() };
}

// A diagram folder: file name (relative to the folder) -> the keys that file may hold.
const FOLDER_FILES = {
  [TOPOLOGY_FILE]: ["format_version", "id", "title", "regions", "service_groups", "connections"],
  [SERVER_TYPES_FILE]: ["server_types"],
  [NOTES_FILE]: ["notes"],
  [DOCUMENTS_FILE]: ["documents"],
};
export function withRoot(files) {
  if (!files.has(LEGACY_TOPOLOGY_FILE)) return files;
  const out = new Map(files), legacy = out.get(LEGACY_TOPOLOGY_FILE);
  out.delete(LEGACY_TOPOLOGY_FILE);
  if (!out.has(TOPOLOGY_FILE)) out.set(TOPOLOGY_FILE, legacy);
  return out;
}

export const FORMAT_VERSION = "1";

function parseFile(name, text) {
  try { return parseToml(text); }
  catch (e) { throw e instanceof FormatError ? new FormatError(e.detail, { file: name, line: e.line }) : e; }
}

export function checkFormatVersion(v, file = TOPOLOGY_FILE) {
  if (v === undefined || v === FORMAT_VERSION) return;
  if (typeof v === "string" && /^[1-9][0-9]{0,8}$/.test(v) && +v > +FORMAT_VERSION) throw new FormatError(`This diagram needs a newer engine (format_version ${v}, this engine supports ${FORMAT_VERSION})`, { file });
  throw new FormatError(`format_version must be the string "${FORMAT_VERSION}" (got ${typeof v === "string" ? JSON.stringify(v) : "a non-string value"})`, { file });
}

// Merge the folder's files into one root object shaped like the former single-file document.
export function mergeFolder(input) {
  const files = withRoot(input);
  const fail = (m, file = null) => { throw new FormatError(m, { file }); };
  if (!files.has(TOPOLOGY_FILE)) fail(TOPOLOGY_FILE + " is missing");
  checkFormatVersion(parseFile(TOPOLOGY_FILE, files.get(TOPOLOGY_FILE)).format_version);
  const root = Object.create(null), servers = [];
  for (const name of [...files.keys()].sort((a, b) => (a < b ? -1 : Number(a > b)))) {
    const text = files.get(name), server = name.startsWith(SERVER_DIR) && name.slice(SERVER_DIR.length).match(/^([^/]+)\.toml$/);
    if (name === NETWORKS_FILE) continue;
    if (server) {
      const part = parseFile(name, text), stem = server[1];
      if (part.id !== undefined && part.id !== stem) fail(`id '${part.id}' must equal the file name '${stem}'`, name);
      servers.push({ ...part, id: stem });
    } else if (Object.hasOwn(FOLDER_FILES, name)) {
      const part = parseFile(name, text), unknown = Object.keys(part).filter((k) => !FOLDER_FILES[name].includes(k));
      if (unknown.length) fail(`unknown key ${unknown.join(", ")}; it may hold only ${FOLDER_FILES[name].join(", ")}`, name);
      Object.assign(root, part);
    } else if (name.endsWith(".toml")) fail(`unexpected file ${name}; use topology.toml, server-types.toml, notes.toml, documents.toml, networks.toml and servers/<id>.toml`);
  }
  if (servers.length) root.servers = servers;
  return root;
}

const failToml = (m) => { throw new FormatError(m); };

function checkKeys(o, allowed, at) {
  const unknown = Object.keys(o).filter((k) => !allowed.includes(k));
  if (unknown.length) failToml(`${at}: unknown key ${unknown.join(", ")}`);
}
function str(v, at) {
  if (typeof v !== "string" || !v.trim()) failToml(`${at} must be a non-empty string`);
  return v;
}
function list(v, at) {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.some((s) => typeof s !== "string" || !s.trim())) failToml(`${at} must be an array of non-empty strings`);
  return v;
}
function bool(v, at) {
  if (v !== undefined && typeof v !== "boolean") failToml(`${at} must be true or false`);
  return v || false;
}

const TABLE_KEYS = ["server_types", "regions", "service_groups", "servers", "connections", "documents"];
const SERVER_TEXT_KEYS = SERVER_ROW_FIELDS.map((f) => f.key);
const SERVER_ROWS = SERVER_ROW_FIELDS.map((f) => [f.label, f.key]);

function checkTables(t) {
  checkKeys(t, ["format_version", "id", "title", "notes", ...TABLE_KEYS], "diagram");
  for (const key of TABLE_KEYS) {
    if (t[key] !== undefined && (!Array.isArray(t[key]) || t[key].some((v) => !v || typeof v !== "object" || Array.isArray(v)))) failToml(`${key} must use [[${key}]] tables`);
  }
}

function parseGroups(t) {
  return (t.service_groups || []).map((g, i) => {
    const at = "service_groups[" + (i + 1) + "]";
    checkKeys(g, ["id", "label", "patterns", "card"], at);
    bool(g.card, at + ".card");
    if (g.id !== undefined) str(g.id, at + ".id");
    str(g.label, at + ".label");
    if (!Array.isArray(g.patterns) || !g.patterns.length || g.patterns.some((p) => typeof p !== "string" || !p.trim())) failToml(at + ".patterns must be a non-empty array of non-empty strings");
    return { label: g.label.trim(), patterns: g.patterns.map(globRegExp), card: g.card === true };
  });
}

function parseNoteList(raw) {
  let noteList = raw;
  if (noteList === undefined) noteList = [];
  else if (typeof noteList === "string") noteList = [noteList];
  if (!Array.isArray(noteList) || noteList.some((n) => typeof n !== "string" || !n.trim())) failToml("notes must be a non-empty string or an array of non-empty strings");
  return noteList.map((n, i) => parseNoteText(n, `notes[${i + 1}]`));
}

function parseDocs(t) {
  return (t.documents || []).map((d, i) => {
    const at = "documents[" + (i + 1) + "]";
    checkKeys(d, ["title", "url", "description"], at);
    const url = str(d.url, at + ".url");
    if (!/^https?:\/\/\S+$/.test(url)) failToml(at + ".url must be an http or https URL");
    if (d.description !== undefined && typeof d.description !== "string") failToml(at + ".description must be a string");
    return { title: str(d.title, at + ".title").trim(), url, desc: (d.description || "").trim() };
  });
}

function customType(d, at, customIds) {
  checkKeys(d, ["id", "label", "color", "dark", "infra", "db"], at);
  const tid = str(d.id, at + ".id");
  if (!/^[a-z][a-z0-9-]*$/.test(tid) || RESERVED_TYPES.includes(tid)) failToml(`${at}: invalid id '${tid}' (lowercase letters, digits and hyphens; not 'proposed')`);
  if (customIds.has(tid)) failToml(`${at}: duplicate server type '${tid}'`);
  customIds.add(tid);
  const entry = { id: tid };
  if (d.label !== undefined) entry.label = str(d.label, at + ".label").trim();
  for (const k of ["color", "dark"]) {
    if (d[k] === undefined) continue;
    if (typeof d[k] !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(d[k])) failToml(`${at}.${k} must be a #rrggbb colour`);
    entry[k] = d[k];
  }
  for (const k of ["infra", "db"]) if (d[k] !== undefined) entry[k] = bool(d[k], at + "." + k);
  return entry;
}

function parseCustomTypes(t) {
  const customIds = new Set();
  const custom = (t.server_types || []).map((d, i) => customType(d, "server_types[" + (i + 1) + "]", customIds));
  const TYPES = mergeTypes(custom);
  for (const c of custom) if (!TYPES[c.id].label || !TYPES[c.id].color) failToml(`server_types '${c.id}': a new type needs label and color`);
  return { custom, TYPES };
}

const markdownBlock = (head, items) => (items.length ? `## ${head}\n\n${items.map((i) => "- " + i).join("\n")}\n\n` : "");

function networkLabel(nets, ip) {
  const { name, cidr } = nets.of(ip) ?? {};
  return cidr ? name || cidr : "unassigned network";
}

function serverSection(s, { ips, dns, rmi, units }, groups, nets) {
  const rows = SERVER_ROWS.filter(([, key]) => s[key]).map(([label, key]) => `| ${label} | ${s[key].replaceAll("|", "/")} |`);
  const ipItems = nets ? ips.map((ip) => `${ip} — ${networkLabel(nets, ip)}`) : ips;
  const grouped = groupUnits(units, groups).map(([h, a]) => markdownBlock(h, a)).join("");
  return (rows.length ? `| Key | Value |\n|---|---|\n${rows.join("\n")}\n\n` : "") + markdownBlock("IPs", ipItems) + markdownBlock("DNS", dns) + markdownBlock("RMI services", rmi) + grouped + (s.details || "");
}

function addRegions(ctx) {
  const { t, model } = ctx;
  for (const r of t.regions || []) {
    checkKeys(r, ["id", "title", "server_type", "proposed"], "region");
    const eid = ctx.entity(r, "region"), ty = ctx.type(r.server_type, eid);
    model.clusters.set(eid, { id: eid, title: str(r.title, eid + ".title") });
    ctx.classes(eid, ty, bool(r.proposed, eid + ".proposed"));
  }
}

function checkIps(eid, ips) {
  for (const ip of ips) {
    const problem = ipProblem(ip);
    if (problem) failToml(`${eid}: ${problem}`);
  }
}

function serverNode(ctx, s, eid, cluster, ty, ips, title) {
  const services = list(s.services, eid + ".services"), jobs = cardJobs(list(s.jobs, eid + ".jobs")), rmi = list(s.rmi_services, eid + ".rmi_services");
  const body = serviceLines(services, jobs, rmi, cardUnits(list(s.systemd_services, eid + ".systemd_services"), ctx.groups));
  const os = typeof s.os === "string" && s.os && !/^TBD$/i.test(s.os) ? s.os : null;
  return { id: eid, title, cluster, db: !!ctx.TYPES[ty].db, body, jn: capLines(jobs).length, svc: services.length, hw: hardwareStrip(s), hwc: hardwareCells(s), ip: ips, os };
}

function addServers(ctx) {
  const { t, model, groups, nets, sections } = ctx;
  const names = new Set();
  for (const s of t.servers || []) {
    checkKeys(s, SERVER_KEYS, "server");
    const eid = ctx.entity(s, "server"), cluster = s.region ?? null;
    if (cluster !== null && !model.clusters.has(cluster)) failToml(`${eid}: unknown region '${cluster}'`);
    const ty = ctx.type(s.server_type ?? (cluster && (t.regions || []).find((r) => r.id === cluster).server_type), eid);
    const ips = list(s.ips, eid + ".ips");
    checkIps(eid, ips);
    const title = str(s.name ?? eid, eid + ".name");
    if (names.has(title)) failToml(`${eid}: duplicate server name '${title}'`);
    names.add(title);
    model.nodes.set(eid, serverNode(ctx, s, eid, cluster, ty, ips, title));
    ctx.classes(eid, ty, bool(s.proposed, eid + ".proposed"));
    for (const k of SERVER_TEXT_KEYS) if (s[k] !== undefined) str(s[k], eid + "." + k);
    if (s.details !== undefined && typeof s.details !== "string") failToml(`${eid}.details must be a string`);
    const dns = list(s.dns, eid + ".dns"), rmi = list(s.rmi_services, eid + ".rmi_services"), units = list(s.systemd_services, eid + ".systemd_services");
    for (const name of dns) {
      const problem = dnsProblem(name);
      if (problem) failToml(`${eid}: ${problem}`);
    }
    sections[title] = serverSection(s, { ips, dns, rmi, units }, groups, nets);
  }
}

function checkServiceEnds(model, k, from, to, e) {
  const process = { from: e.from_service ?? null, to: e.to_service ?? null };
  for (const [end, prefix] of [[from, process.from], [to, process.to]]) {
    if (prefix === null) continue;
    str(prefix, k + ".service");
    const node = model.nodes.get(end);
    const matches = node?.body.slice(node.jn, node.jn + node.svc).filter((line) => line.startsWith(prefix)) || [];
    if (matches.length !== 1) failToml(`${k}: service '${prefix}' must match exactly one service on '${end}'`);
  }
  return Object.fromEntries(Object.entries(process).filter(([, v]) => v !== null));
}

function addConnections(ctx) {
  const { t, model, config, used } = ctx;
  const edgeIds = new Set();
  for (const e of t.connections || []) {
    checkKeys(e, ["from", "to", "label", "firewall", "proposed", "from_service", "to_service"], "connection");
    const from = str(e.from, "connection.from"), to = str(e.to, "connection.to"), k = from + ">" + to;
    if (!used.has(from) || !used.has(to)) failToml(`${k}: unknown connection endpoint`);
    if (from === to || edgeIds.has(k)) failToml(`${k}: self-connections and duplicate endpoint pairs are unsupported`);
    edgeIds.add(k);
    if (e.label !== undefined && typeof e.label !== "string") failToml(`${k}.label must be a string`);
    const dashed = bool(e.proposed, k + ".proposed");
    model.edges.push({ from, to, label: e.label || "", fw: bool(e.firewall, k + ".firewall"), dashed });
    if (dashed) model.linkStyles.set(model.edges.length - 1, "stroke-dasharray:6 4");
    if (e.from_service !== undefined || e.to_service !== undefined) config.processes[k] = checkServiceEnds(model, k, from, to, e);
  }
}

export function tomlModel(files, folder = "diagram", nets = null) {
  const t = mergeFolder(files);
  checkTables(t);
  const groups = parseGroups(t);
  const id = t.id ?? folder;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) failToml("id must contain lowercase letters, digits and hyphens");
  const config = { id, title: str(t.title, "title"), groups: {}, processes: {} };
  const notes = parseNoteList(t.notes), docs = parseDocs(t);
  const { custom, TYPES } = parseCustomTypes(t);
  const model = { types: custom, clusters: new Map(), nodes: new Map(), edges: [], linkStyles: new Map(), classDefs: new Map(), classes: new Map() };
  const sections = Object.create(null), used = new Set();
  const ctx = {
    t, model, config, groups, nets, sections, used, TYPES,
    type(v, at) {
      if (typeof v !== "string" || !Object.hasOwn(TYPES, v)) failToml(`${at}: server_type must be one of ${Object.keys(TYPES).join(", ")}`);
      return v;
    },
    entity(o, at) {
      const eid = str(o.id, at + ".id");
      if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(eid) || ["constructor", "prototype"].includes(eid) || used.has(eid)) failToml(`${at}: invalid or duplicate id '${eid}'`);
      used.add(eid);
      return eid;
    },
    classes(eid, ty, proposed) {
      model.classes.set(eid, proposed ? [ty, "proposed"] : [ty]);
      model.classDefs.set(ty, "stroke:" + TYPES[ty].color);
    },
  };
  addRegions(ctx);
  addServers(ctx);
  addConnections(ctx);
  return { config, model, sections, notes, docs };
}

// Body lines of a server card: a jobs section (jn lines), then a services section (services, RMI services, systemd
// services); jobs, RMI and systemd are each capped at LIST_LINES with a "+N more" line, so probe-imported servers show content; the details panel lists everything.
const LIST_LINES = 4;
export function serviceLines(services, jobs = [], rmi = [], units = []) {
  return [...capLines(jobs), ...services, ...capLines(rmi), ...capLines(units)];
}
const capLines = (a) => (a.length > LIST_LINES ? [...a.slice(0, LIST_LINES), `+${a.length - LIST_LINES} more`] : a);
// Probe-found crontab lines ("cron: ...") stay in the data and the editor but are not shown on the card.
const cardJobs = (jobs) => jobs.filter((j) => !/^cron:/i.test(String(j).trim()));

// One-line hardware strip: set cells of cpu / ram / swap / disk ("sd") as "<value> <label>" joined by " ·", else the free-text hardware key; "" when none.
const HW_SEP = " · ";
// Size unit shown after every ram / swap / disk number; change it here ("G", "GiB", "GB") to switch the whole UI (card, details panel).
export const SIZE_UNIT = "G";
const oneDecimal = (n) => String(Math.round(n * 10) / 10);
// Display form of a stored value, the stored text is never rewritten: cpu "4 cores" / "4" -> "4"; sizes "8 GiB", "8GB", "8192 MiB", "50G" -> "8G"; unknown formats as stored.
export function normCpu(v) {
  const m = /^(\d+)\s*(?:v?cpus?|cores?)?$/i.exec(v);
  return m ? m[1] : v;
}
export function normSize(v) {
  const m = /^(\d+(?:\.\d+)?)\s*([kmgt])(?:i?b)?$/i.exec(v);
  if (!m) return v;
  const f = { k: 1 / 1048576, m: 1 / 1024, g: 1, t: 1024 }[m[2].toLowerCase()];
  return oneDecimal(Number(m[1]) * f) + SIZE_UNIT;
}
// The four hardware cells with data, in card order: [["cpu", "11"], ["ram", "8G"], ...] (shown on the card strip and in the details panel; value first, then label).
export function hardwareCells(s) {
  const norm = { cpu: normCpu, ram: normSize, swap: normSize, disk: normSize };
  return [["cpu", s.cpu], ["ram", s.ram], ["swap", s.swap], ["sd", s.disk]].filter(([, v]) => typeof v === "string" && v.trim()).map(([k, v]) => [k, norm[k === "sd" ? "disk" : k](v.trim())]);
}
export function hardwareStrip(s) {
  const cells = hardwareCells(s).map(([k, v]) => `${v} ${k}`);
  if (cells.length) return cells.join(HW_SEP);
  const h = typeof s.hardware === "string" ? s.hardware.trim() : "";
  return h.length > 48 ? h.slice(0, 47) + "…" : h;
}

// Glob with `*` (any run) and `?` (one character), case-insensitive, matched against the whole service name.
export function globRegExp(p) {
  return new RegExp("^" + p.trim().replaceAll(/[.+^${}()|[\]\\]/g, String.raw`\$&`).replaceAll("*", ".*").replaceAll("?", ".") + "$", "i");
}
// Splits systemd units by `[[service_groups]]` (first matching group wins, name compared without ".service"):
// [[label, units], ...] in group order; unmatched units are intentionally dropped; with no groups the single "systemd services" list; empty sections omitted.
// Card body units: with at least one `card = true` group, only the units of those groups (group order); otherwise all units.
function cardUnits(units, groups) {
  if (!groups.some((g) => g.card)) return units;
  const flagged = new Set(groups.filter((g) => g.card).map((g) => g.label));
  return groupUnits(units, groups).filter(([h]) => flagged.has(h)).flatMap(([, a]) => a);
}
export function groupUnits(units, groups) {
  if (!groups.length) return units.length ? [["systemd services", units]] : [];
  const buckets = groups.map(() => []);
  for (const u of units) {
    const name = u.replace(/\.service$/i, ""), i = groups.findIndex((g) => g.patterns.some((re) => re.test(name)));
    if (i >= 0) buckets[i].push(u);
  }
  return groups.map((g, i) => [g.label, buckets[i]]).filter(([, a]) => a.length);
}
