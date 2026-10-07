// The diagram authoring subset of TOML: scalar keys and top-level arrays of tables.
// Kept dependency-free and shared by Node tests and the standalone browser page.
import { parseNotes } from "./notes.mjs";
export function parseToml(src) {
  src = src.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  let p = 0, table;
  const root = Object.create(null);
  table = root;
  const error = (message) => { throw new Error(`TOML:${src.slice(0, p).split("\n").length}: ${message}`); };
  function space(lines = true) {
    while (p < src.length) {
      if (src[p] === "#") { while (p < src.length && src[p] !== "\n") p++; }
      else if ((lines ? /\s/ : /[ \t]/).test(src[p])) p++;
      else break;
      if (!lines && src[p] === "\n") break;
    }
  }
  function string() {
    const quote = src[p++];
    let out = "";
    while (p < src.length) {
      const c = src[p++];
      if (c === quote) return out;
      if (c === "\n" || c.charCodeAt(0) < 32) error("strings must be on one line; use \\n in a double-quoted string");
      if (c !== "\\" || quote === "'") { out += c; continue; }
      const e = src[p++], escapes = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "\\": "\\" };
      if (Object.hasOwn(escapes, e)) out += escapes[e];
      else if (e === "u" || e === "U") {
        const n = e === "u" ? 4 : 8, h = src.slice(p, p + n), v = parseInt(h, 16);
        if (h.length !== n || !/^[0-9a-f]+$/i.test(h) || v > 0x10ffff || (v >= 0xd800 && v <= 0xdfff)) error("invalid Unicode escape");
        out += String.fromCodePoint(v); p += n;
      } else error("unsupported string escape");
    }
    error("unterminated string");
  }
  function value() {
    space();
    if (src[p] === '"' || src[p] === "'") return string();
    if (src[p] === "[") {
      p++; const values = []; space();
      while (src[p] !== "]") {
        if (p >= src.length) error("unterminated array");
        values.push(value()); space();
        if (src[p] === "]") break;
        if (src[p++] !== ",") error("expected ',' in array");
        space();
      }
      p++; return values;
    }
    const m = src.slice(p).match(/^(true|false)(?=[\s,#\]]|$)/);
    if (m) { p += m[0].length; return m[0] === "true"; }
    error("expected a quoted string, boolean, or array (see AUTHORING.md)");
  }
  while (p < src.length) {
    space(); if (p >= src.length) break;
    if (src[p] === "[") {
      const m = src.slice(p).match(/^\[\[([a-z][a-z0-9_]*)\]\]/);
      if (!m) error("expected [[regions]], [[servers]], or [[connections]]");
      p += m[0].length;
      if (Object.hasOwn(root, m[1]) && !Array.isArray(root[m[1]])) error("table name already used as a key");
      table = Object.create(null); (root[m[1]] ||= []).push(table);
    } else {
      const m = src.slice(p).match(/^([a-z][a-z0-9_]*)[ \t]*=/);
      if (!m) error("expected key = value");
      p += m[0].length;
      if (Object.hasOwn(table, m[1])) error(`duplicate key '${m[1]}'`);
      table[m[1]] = value();
    }
    space(false);
    if (p < src.length && src[p] !== "\n") error("unexpected text after value");
    p++;
  }
  return root;
}

const COLORS = { web: "#C2185B", application: "#1565C0", interface: "#00838F", external: "#7E57C2", cache: "#B8860B", oracle: "#E65100", mongo: "#2E7D32", nas: "#546E7A", statistics: "#6D4C41" };
export function tomlModel(src, filename = "diagram.toml") {
  const t = parseToml(src), fail = (m) => { throw new Error("TOML: " + m); };
  function keys(o, allowed, at) {
    const unknown = Object.keys(o).filter((k) => !allowed.includes(k));
    if (unknown.length) fail(`${at}: unknown key ${unknown.join(", ")}`);
  }
  function str(v, at) { if (typeof v !== "string" || !v.trim()) fail(`${at} must be a non-empty string`); return v; }
  function list(v, at) { if (v === undefined) return []; if (!Array.isArray(v) || v.some((s) => typeof s !== "string" || !s.trim())) fail(`${at} must be an array of non-empty strings`); return v; }
  function bool(v, at) { if (v !== undefined && typeof v !== "boolean") fail(`${at} must be true or false`); return v || false; }
  function type(v, at) { if (!Object.hasOwn(COLORS, v)) fail(`${at}: server_type must be one of ${Object.keys(COLORS).join(", ")}`); return v; }
  keys(t, ["id", "title", "notes", "regions", "servers", "connections"], "diagram");
  for (const key of ["regions", "servers", "connections"]) {
    if (t[key] !== undefined && (!Array.isArray(t[key]) || t[key].some((v) => !v || typeof v !== "object" || Array.isArray(v)))) fail(`${key} must use [[${key}]] tables`);
  }
  const id = t.id ?? filename.replace(/\.toml$/i, "");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) fail("id must contain lowercase letters, digits and hyphens");
  const config = { id, title: str(t.title, "title"), groups: {}, processes: {} };
  const noteList = t.notes === undefined ? [] : typeof t.notes === "string" ? [t.notes] : t.notes;
  if (!Array.isArray(noteList) || noteList.some((n) => typeof n !== "string" || !n.trim())) fail("notes must be a non-empty string or an array of non-empty strings");
  const notes = noteList.map((n, i) => {
    const [head, ...rest] = n.trim().split("\n"), dated = /^\s*Date:/.test(rest[0] || "");
    if (dated && !/^\s*Date:\s*\S/.test(rest[0])) fail(`notes[${i + 1}]: empty Date`);
    const body = rest.slice(dated ? 1 : 0).join("\n");
    if (!body.trim()) fail(`notes[${i + 1}]: needs a title line and body text`);
    if (/^\s*#/m.test(body)) fail(`notes[${i + 1}]: body lines cannot start with #`);
    return parseNotes(`## ${head}\n${dated ? "" : "Date: Note\n\n"}${rest.join("\n")}`)[0];
  });
  const model = { clusters: new Map(), nodes: new Map(), edges: [], linkStyles: new Map(), classDefs: new Map(), classes: new Map() };
  const sections = Object.create(null), used = new Set();
  function entity(o, at) {
    const eid = str(o.id, at + ".id");
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(eid) || ["constructor", "prototype"].includes(eid) || used.has(eid)) fail(`${at}: invalid or duplicate id '${eid}'`);
    used.add(eid); return eid;
  }
  function classes(eid, ty, proposed) {
    model.classes.set(eid, proposed ? [ty, "proposed"] : [ty]);
    model.classDefs.set(ty, "stroke:" + COLORS[ty]);
  }
  for (const r of t.regions || []) {
    keys(r, ["id", "title", "server_type", "proposed"], "region");
    const eid = entity(r, "region"), ty = type(r.server_type, eid);
    model.clusters.set(eid, { id: eid, title: str(r.title, eid + ".title") });
    classes(eid, ty, bool(r.proposed, eid + ".proposed"));
  }
  const names = new Set();
  for (const s of t.servers || []) {
    keys(s, ["id", "name", "server_type", "region", "services", "ips", "os", "details", "proposed"], "server");
    const eid = entity(s, "server"), cluster = s.region ?? null;
    if (cluster !== null && !model.clusters.has(cluster)) fail(`${eid}: unknown region '${cluster}'`);
    const ty = type(s.server_type ?? (cluster && (t.regions || []).find((r) => r.id === cluster).server_type), eid);
    const ips = list(s.ips, eid + ".ips");
    for (const ip of ips) {
      const m = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
      if (!m || m[1].split(".").some((n) => +n > 255) || +m[2] > 32) fail(`${eid}: invalid IPv4 CIDR '${ip}'`);
    }
    const title = str(s.name ?? eid, eid + ".name");
    if (names.has(title)) fail(`${eid}: duplicate server name '${title}'`);
    names.add(title);
    model.nodes.set(eid, { id: eid, title, cluster, db: ty === "oracle" || ty === "mongo", body: list(s.services, eid + ".services"), ip: ips });
    classes(eid, ty, bool(s.proposed, eid + ".proposed"));
    if (s.os !== undefined) str(s.os, eid + ".os");
    if (s.details !== undefined && typeof s.details !== "string") fail(`${eid}.details must be a string`);
    sections[title] = (s.os ? `| Key | Value |\n|---|---|\n| OS | ${s.os} |\n\n` : "") + (s.details || "");
  }
  if (!model.nodes.size && !model.clusters.size) fail("define at least one server or region");
  const edgeIds = new Set();
  for (const e of t.connections || []) {
    keys(e, ["from", "to", "label", "firewall", "proposed", "from_service", "to_service"], "connection");
    const from = str(e.from, "connection.from"), to = str(e.to, "connection.to"), k = from + ">" + to;
    if (!used.has(from) || !used.has(to)) fail(`${k}: unknown connection endpoint`);
    if (from === to || edgeIds.has(k)) fail(`${k}: self-connections and duplicate endpoint pairs are unsupported`);
    edgeIds.add(k);
    if (e.label !== undefined && typeof e.label !== "string") fail(`${k}.label must be a string`);
    const dashed = bool(e.proposed, k + ".proposed");
    model.edges.push({ from, to, label: e.label || "", fw: bool(e.firewall, k + ".firewall"), dashed });
    if (dashed) model.linkStyles.set(model.edges.length - 1, "stroke-dasharray:6 4");
    if (e.from_service !== undefined || e.to_service !== undefined) {
      const process = { from: e.from_service ?? null, to: e.to_service ?? null };
      for (const [end, prefix] of [[from, process.from], [to, process.to]]) {
        if (prefix === null) continue;
        str(prefix, k + ".service");
        const matches = model.nodes.get(end)?.body.filter((line) => line.startsWith(prefix)) || [];
        if (matches.length !== 1) fail(`${k}: service '${prefix}' must match exactly one service on '${end}'`);
      }
      config.processes[k] = Object.fromEntries(Object.entries(process).filter(([, v]) => v !== null));
    }
  }
  return { config, model, sections, notes };
}
