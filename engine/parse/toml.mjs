// The diagram authoring subset of TOML: scalar keys and top-level arrays of tables.
// Kept dependency-free and shared by Node tests and the standalone browser page.
import { parseNotes } from "./notes.mjs";
import { mergeTypes, RESERVED_TYPES } from "./types.mjs";
export function ipProblem(ip) {
  const m = typeof ip === "string" && ip.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  return !m || m[1].split(".").some((n) => +n > 255) || +m[2] > 32 ? `invalid IPv4 CIDR '${ip}'` : null;
}
export function dnsProblem(name) {
  const ok = typeof name === "string" && name.length <= 253 && /^[A-Za-z0-9_]([A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?(\.[A-Za-z0-9_]([A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?)*\.?$/.test(name);
  return ok ? null : `invalid host name '${name}'`;
}
export function parseToml(src, spans = null) {
  src = src.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  let p = 0, table, current = null;
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
    const quote = src[p++], multi = src.startsWith(quote + quote, p);
    let out = "";
    if (multi) { p += 2; if (src[p] === "\n") p++; }
    while (p < src.length) {
      const c = src[p++];
      if (c === quote) {
        if (!multi) return out;
        let run = 1;
        while (src[p - 1 + run] === quote) run++;
        if (run > 5) error("too many quotes in a multi-line string");
        p += run - 1;
        if (run >= 3) return out + quote.repeat(run - 3);
        out += quote.repeat(run);
        continue;
      }
      if (c === "\n" ? !multi : c.charCodeAt(0) < 32 && !(multi && c === "\t")) error("strings must be on one line; use \\n or a multi-line string");
      if (c !== "\\" || quote === "'") { out += c; continue; }
      if (multi && /[ \t\n]/.test(src[p])) {
        let q = p;
        while (src[q] === " " || src[q] === "\t") q++;
        if (src[q] !== "\n") error("unsupported string escape");
        while (/[ \t\n]/.test(src[q] || "")) q++;
        p = q; continue;
      }
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
    let keyLine = false;
    if (src[p] === "[") {
      const m = src.slice(p).match(/^\[\[([a-z][a-z0-9_]*)\]\]/);
      if (!m) error("expected [[regions]], [[servers]], [[connections]], or [[documents]]");
      if (spans && spans.firstTable === undefined) spans.firstTable = p;
      p += m[0].length;
      if (Object.hasOwn(root, m[1]) && !Array.isArray(root[m[1]])) error("table name already used as a key");
      table = Object.create(null); (root[m[1]] ||= []).push(table);
      if (spans) (spans.tables ||= []).push(current = { name: m[1], start: p - m[0].length, keys: {}, table });
    } else {
      const m = src.slice(p).match(/^([a-z][a-z0-9_]*)[ \t]*=/), start = p;
      if (!m) error("expected key = value");
      p += m[0].length;
      if (Object.hasOwn(table, m[1])) error(`duplicate key '${m[1]}'`);
      space(false);
      const valueStart = p;
      table[m[1]] = value();
      if (spans && table === root) { spans.keys[m[1]] = { start, valueStart, valueEnd: p }; keyLine = true; }
      else if (spans) current.keys[m[1]] = { start, valueStart, valueEnd: p };
    }
    space(false);
    if (p < src.length && src[p] !== "\n") error("unexpected text after value");
    p++;
    if (keyLine) spans.lastLineEnd = Math.min(p, src.length);
  }
  return root;
}

// One note card from its TOML string: first line title, optional "Date:" line, rest body.
export function parseNoteText(text, at = "note", strict = false) {
  const fail = (m) => { throw new Error(`TOML: ${at}: ${m}`); };
  if (strict && text.trim() && !text.split("\n")[0].trim()) fail("the first line is the title and cannot be empty");
  const [head, ...rest] = text.trim().split("\n"), dated = /^\s*Date:/.test(rest[0] || "");
  if (!head) fail("needs a title line and body text");
  if (dated && !/^\s*Date:\s*\S/.test(rest[0])) fail("empty Date");
  const body = rest.slice(dated ? 1 : 0).join("\n");
  if (!body.trim()) fail("needs a title line and body text");
  if (/^\s*#/m.test(body)) fail("body lines cannot start with #");
  return { ...parseNotes(`## ${head}\n${dated ? "" : "Date: Note\n\n"}${rest.join("\n")}`)[0], text: text.trim() };
}

export function tomlModel(src, filename = "diagram.toml", nets = null) {
  const t = parseToml(src), fail = (m) => { throw new Error("TOML: " + m); };
  function keys(o, allowed, at) {
    const unknown = Object.keys(o).filter((k) => !allowed.includes(k));
    if (unknown.length) fail(`${at}: unknown key ${unknown.join(", ")}`);
  }
  function str(v, at) { if (typeof v !== "string" || !v.trim()) fail(`${at} must be a non-empty string`); return v; }
  function list(v, at) { if (v === undefined) return []; if (!Array.isArray(v) || v.some((s) => typeof s !== "string" || !s.trim())) fail(`${at} must be an array of non-empty strings`); return v; }
  function bool(v, at) { if (v !== undefined && typeof v !== "boolean") fail(`${at} must be true or false`); return v || false; }
  keys(t, ["id", "title", "notes", "server_types", "regions", "servers", "connections", "documents"], "diagram");
  for (const key of ["server_types", "regions", "servers", "connections", "documents"]) {
    if (t[key] !== undefined && (!Array.isArray(t[key]) || t[key].some((v) => !v || typeof v !== "object" || Array.isArray(v)))) fail(`${key} must use [[${key}]] tables`);
  }
  const id = t.id ?? filename.replace(/\.toml$/i, "");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) fail("id must contain lowercase letters, digits and hyphens");
  const config = { id, title: str(t.title, "title"), groups: {}, processes: {} };
  const noteList = t.notes === undefined ? [] : typeof t.notes === "string" ? [t.notes] : t.notes;
  if (!Array.isArray(noteList) || noteList.some((n) => typeof n !== "string" || !n.trim())) fail("notes must be a non-empty string or an array of non-empty strings");
  const notes = noteList.map((n, i) => parseNoteText(n, `notes[${i + 1}]`));
  const docs = (t.documents || []).map((d, i) => {
    const at = "documents[" + (i + 1) + "]";
    keys(d, ["title", "url", "description"], at);
    const url = str(d.url, at + ".url");
    if (!/^https?:[/][/][^\s]+$/.test(url)) fail(at + ".url must be an http or https URL");
    if (d.description !== undefined && typeof d.description !== "string") fail(at + ".description must be a string");
    return { title: str(d.title, at + ".title").trim(), url, desc: (d.description || "").trim() };
  });
  const custom = [], customIds = new Set();
  (t.server_types || []).forEach((d, i) => {
    const at = "server_types[" + (i + 1) + "]";
    keys(d, ["id", "label", "color", "dark", "infra", "db"], at);
    const tid = str(d.id, at + ".id");
    if (!/^[a-z][a-z0-9-]*$/.test(tid) || RESERVED_TYPES.includes(tid)) fail(`${at}: invalid id '${tid}' (lowercase letters, digits and hyphens; not 'proposed')`);
    if (customIds.has(tid)) fail(`${at}: duplicate server type '${tid}'`);
    customIds.add(tid);
    const entry = { id: tid };
    if (d.label !== undefined) entry.label = str(d.label, at + ".label").trim();
    for (const k of ["color", "dark"]) if (d[k] !== undefined) {
      if (typeof d[k] !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(d[k])) fail(`${at}.${k} must be a #rrggbb colour`);
      entry[k] = d[k];
    }
    for (const k of ["infra", "db"]) if (d[k] !== undefined) entry[k] = bool(d[k], at + "." + k);
    custom.push(entry);
  });
  const TYPES = mergeTypes(custom);
  for (const c of custom) if (!TYPES[c.id].label || !TYPES[c.id].color) fail(`server_types '${c.id}': a new type needs label and color`);
  function type(v, at) { if (typeof v !== "string" || !Object.hasOwn(TYPES, v)) fail(`${at}: server_type must be one of ${Object.keys(TYPES).join(", ")}`); return v; }
  const model = { types: custom, clusters: new Map(), nodes: new Map(), edges: [], linkStyles: new Map(), classDefs: new Map(), classes: new Map() };
  const sections = Object.create(null), used = new Set();
  function entity(o, at) {
    const eid = str(o.id, at + ".id");
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(eid) || ["constructor", "prototype"].includes(eid) || used.has(eid)) fail(`${at}: invalid or duplicate id '${eid}'`);
    used.add(eid); return eid;
  }
  function classes(eid, ty, proposed) {
    model.classes.set(eid, proposed ? [ty, "proposed"] : [ty]);
    model.classDefs.set(ty, "stroke:" + TYPES[ty].color);
  }
  for (const r of t.regions || []) {
    keys(r, ["id", "title", "server_type", "proposed"], "region");
    const eid = entity(r, "region"), ty = type(r.server_type, eid);
    model.clusters.set(eid, { id: eid, title: str(r.title, eid + ".title") });
    classes(eid, ty, bool(r.proposed, eid + ".proposed"));
  }
  const names = new Set();
  for (const s of t.servers || []) {
    keys(s, ["id", "name", "server_type", "region", "services", "ips", "os", "details", "proposed", "hardware", "role", "dns", "jobs", "rmi_services", "systemd_services"], "server");
    const eid = entity(s, "server"), cluster = s.region ?? null;
    if (cluster !== null && !model.clusters.has(cluster)) fail(`${eid}: unknown region '${cluster}'`);
    const ty = type(s.server_type ?? (cluster && (t.regions || []).find((r) => r.id === cluster).server_type), eid);
    const ips = list(s.ips, eid + ".ips");
    for (const ip of ips) {
      const problem = ipProblem(ip);
      if (problem) fail(`${eid}: ${problem}`);
    }
    const title = str(s.name ?? eid, eid + ".name");
    if (names.has(title)) fail(`${eid}: duplicate server name '${title}'`);
    names.add(title);
    model.nodes.set(eid, { id: eid, title, cluster, db: !!TYPES[ty].db, body: list(s.services, eid + ".services"), ip: ips });
    classes(eid, ty, bool(s.proposed, eid + ".proposed"));
    for (const k of ["os", "hardware", "role"]) if (s[k] !== undefined) str(s[k], eid + "." + k);
    if (s.details !== undefined && typeof s.details !== "string") fail(`${eid}.details must be a string`);
    const dns = list(s.dns, eid + ".dns"), jobs = list(s.jobs, eid + ".jobs"), rmi = list(s.rmi_services, eid + ".rmi_services"), units = list(s.systemd_services, eid + ".systemd_services");
    for (const name of dns) { const problem = dnsProblem(name); if (problem) fail(`${eid}: ${problem}`); }
    const rows = [["OS", s.os], ["Hardware", s.hardware], ["Role", s.role]].filter(([, v]) => v).map(([k, v]) => `| ${k} | ${v.replace(/\|/g, "/")} |`);
    const block = (head, items) => items.length ? `## ${head}\n\n${items.map((i) => "- " + i).join("\n")}\n\n` : "";
    sections[title] = (rows.length ? `| Key | Value |\n|---|---|\n${rows.join("\n")}\n\n` : "") + block("IPs", nets ? ips.map((ip) => `${ip} — ${nets.of(ip)?.name ?? "unassigned network"}`) : ips) + block("DNS", dns) + block("Jobs", jobs) + block("RMI services", rmi) + block("systemd services", units) + (s.details || "");
  }
  if (!model.nodes.size && !model.clusters.size && !docs.length && !notes.length) fail("define at least one server, region, document or note");
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
  return { config, model, sections, notes, docs };
}
