import { basename } from "node:path";
import { fail } from "../lib/util.mjs";

const ID = /^[a-z0-9][a-z0-9-]*$/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const EDGE_LABELS = { request: "connection", dashed: "proposed move", firewall: "firewall on the path" };
const KEYS = ["title", "id", "legacyId", "proposedLabel", "edgeLabels", "groups", "processes"];
const GROUP_KEYS = ["label", "color", "darkColor", "edges"];

const str = (v, key) => {
  if (typeof v !== "string" || !v.trim()) fail(`diagram.json: "${key}" must be a non-empty string`);
  return v;
};
const obj = (v, key) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) fail(`diagram.json: "${key}" must be an object`);
  return v;
};

// Connection groups: { id: { label, color, darkColor?, edges: ["from>to", ...] } }; ids are checked against diagram.mmd by checkConnections.
function parseGroups(g) {
  const out = {};
  for (const [id, d] of Object.entries(obj(g, "groups"))) {
    const at = `groups.${id}`;
    if (!ID.test(id)) fail(`diagram.json: group id "${id}" must match ${ID}`);
    obj(d, at);
    const bad = Object.keys(d).filter((k) => !GROUP_KEYS.includes(k));
    if (bad.length) fail(`diagram.json: unknown key ${bad.map((k) => `"${k}"`).join(", ")} in ${at} (allowed: ${GROUP_KEYS.join(", ")})`);
    if (!COLOR.test(d.color ?? "")) fail(`diagram.json: ${at}.color must be #rrggbb`);
    if (d.darkColor !== undefined && !COLOR.test(d.darkColor)) fail(`diagram.json: ${at}.darkColor must be #rrggbb`);
    if (!Array.isArray(d.edges) || !d.edges.length || d.edges.some((e) => typeof e !== "string")) fail(`diagram.json: ${at}.edges must be a non-empty list of "from>to" connection ids`);
    out[id] = { label: str(d.label, at + ".label"), color: d.color, darkColor: d.darkColor ?? d.color, edges: d.edges };
  }
  return out;
}

// Process endpoints: { "from>to": { from?: "body line prefix", to?: "body line prefix" } }.
function parseProcesses(p) {
  const out = {};
  for (const [k, d] of Object.entries(obj(p, "processes"))) {
    const at = `processes.${k}`;
    obj(d, at);
    const bad = Object.keys(d).filter((x) => x !== "from" && x !== "to");
    if (bad.length || !Object.keys(d).length) fail(`diagram.json: ${at} needs "from" and/or "to" (a body line prefix), got ${JSON.stringify(d)}`);
    out[k] = { from: d.from === undefined ? null : str(d.from, at + ".from"), to: d.to === undefined ? null : str(d.to, at + ".to") };
  }
  return out;
}

const lineOf = (node, prefix) => node.body.findIndex((l) => l.startsWith(prefix));

export function checkConnections({ groups, processes }, edgeIds, nodes) {
  const seen = {};
  for (const [id, g] of Object.entries(groups)) for (const k of g.edges) {
    if (!edgeIds.includes(k)) fail(`diagram.json: groups.${id}: connection "${k}" is not in diagram.mmd (ids are "from>to")`);
    if (seen[k]) fail(`diagram.json: connection "${k}" is in groups "${seen[k]}" and "${id}"; a connection belongs to one group at most`);
    seen[k] = id;
  }
  for (const [k, d] of Object.entries(processes)) {
    if (!edgeIds.includes(k)) fail(`diagram.json: processes: connection "${k}" is not in diagram.mmd (ids are "from>to")`);
    k.split(">").forEach((n, i) => {
      const prefix = i ? d.to : d.from, at = `diagram.json: processes.${k}.${i ? "to" : "from"}: `;
      if (prefix === null) return;
      if (!nodes.has(n)) fail(at + `"${n}" is a region; a process endpoint must be a server's body line`);
      if (lineOf(nodes.get(n), prefix) < 0) fail(at + `no body line of "${n}" starts with "${prefix}"`);
    });
  }
}

// Body line index per process endpoint: { "from>to": { fl, tl } } (null = server endpoint).
export function processAnchors(processes, nodes) {
  const out = {};
  for (const [k, d] of Object.entries(processes || {})) {
    const [a, b] = k.split(">");
    out[k] = { fl: d.from == null ? null : lineOf(nodes.get(a), d.from), tl: d.to == null ? null : lineOf(nodes.get(b), d.to) };
  }
  return out;
}

export function parseConfig(src, dir) {
  let c;
  try {
    c = JSON.parse(src);
  } catch (e) {
    fail("diagram.json: " + e.message);
  }
  if (!c || typeof c !== "object" || Array.isArray(c)) fail("diagram.json: must be an object");
  const unknown = Object.keys(c).filter((k) => !KEYS.includes(k));
  if (unknown.length) fail(`diagram.json: unknown key ${unknown.map((k) => `"${k}"`).join(", ")} (allowed: ${KEYS.join(", ")})`);
  const id = c.id === undefined ? basename(dir) : str(c.id, "id");
  if (!ID.test(id)) fail(`diagram.json: id "${id}" must match ${ID} (it defaults to the folder name)`);
  if (c.legacyId !== undefined && !ID.test(str(c.legacyId, "legacyId"))) fail(`diagram.json: legacyId "${c.legacyId}" must match ${ID}`);
  const el = c.edgeLabels ?? {};
  if (typeof el !== "object" || Array.isArray(el)) fail('diagram.json: "edgeLabels" must be an object');
  const badEl = Object.keys(el).filter((k) => !(k in EDGE_LABELS));
  if (badEl.length) fail(`diagram.json: unknown edgeLabels key ${badEl.join(", ")} (allowed: ${Object.keys(EDGE_LABELS).join(", ")})`);
  return {
    title: str(c.title, "title"),
    id,
    legacyId: c.legacyId ?? null,
    proposedLabel: c.proposedLabel === undefined ? "Proposed" : str(c.proposedLabel, "proposedLabel"),
    edgeLabels: Object.fromEntries(Object.entries(EDGE_LABELS).map(([k, d]) => [k, el[k] === undefined ? d : str(el[k], "edgeLabels." + k)])),
    groups: c.groups === undefined ? {} : parseGroups(c.groups),
    processes: c.processes === undefined ? {} : parseProcesses(c.processes),
  };
}
