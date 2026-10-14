// A diagram folder's networks.toml: [[networks]] tables (cidr, optional name, optional description).
// The server-to-network relation is derived from IPs, never declared; networks implied by server IPs with a prefix are derived too.
import { parseToml } from "./toml.mjs";
import { cmpBig, parseIp, parseCidr, contains, derivedCidr, derivedCidrs } from "../lib/net.mjs";
import { FormatError } from "../lib/errors.mjs";
import { nodeKey } from "../lib/keys.mjs";

export function parseNetworksFile(src) {
  let root;
  try { root = parseToml(src); }
  catch (e) { throw e instanceof FormatError ? new FormatError(e.detail, { file: "networks.toml", line: e.line }) : e; }
  const fail = (m) => { throw new FormatError(m, { file: "networks.toml" }); };
  const extra = Object.keys(root).filter((k) => k !== "networks");
  if (extra.length) fail(`unknown key ${extra.join(", ")}; only [[networks]] tables are allowed`);
  const list = root.networks || [];
  const items = [];
  list.forEach((d, i) => {
    const at = `networks[${i + 1}]`, unknown = Object.keys(d).filter((k) => !["cidr", "name", "description"].includes(k));
    if (unknown.length) fail(`${at}: unknown key ${unknown.join(", ")}`);
    if (typeof d.cidr !== "string" || !d.cidr.trim()) fail(`${at}: cidr must be a non-empty string`);
    const cidr = d.cidr.trim(), parsed = parseCidr(cidr);
    if (parsed.error) fail(`${at} (${cidr}): ${parsed.error}`);
    if (d.name !== undefined && (typeof d.name !== "string" || !d.name.trim())) fail(`${at} (${cidr}): name must be a non-empty string`);
    if (d.description !== undefined && typeof d.description !== "string") fail(`${at} (${cidr}): description must be a string`);
    const dup = items.findIndex((x) => x.cidr === cidr);
    if (dup >= 0) fail(`${at} (${cidr}): duplicate cidr, already networks[${dup + 1}]`);
    items.push({ cidr, name: (d.name || "").trim(), description: (d.description || "").trim(), ...parsed });
  });
  return items;
}

// Defined networks plus derived ones that are not defined (name "", derived: true), defined first.
export function withDerived(defined, ips) {
  const have = new Set(defined.map((d) => d.cidr));
  const extra = derivedCidrs(ips).filter((c) => !have.has(c)).map((cidr) => ({ cidr, name: "", description: "", derived: true, ...parseCidr(cidr) }));
  return [...defined, ...extra];
}

// Index of the most specific (longest prefix) network containing the address part of `text`, or -1.
// An entry with a prefix competes only against defined networks and its own prefix network; other servers' derived networks never outrank it.
export function assignNetwork(items, text) {
  const ip = parseIp(String(text).split("/")[0]), own = derivedCidr(text);
  let best = -1;
  if (!ip) return best;
  items.forEach((it, i) => {
    if (!contains(it, ip)) return;
    if (own && it.derived && it.cidr !== own) return;
    if (best < 0 || it.len > items[best].len) best = i;
  });
  return best;
}

// Panel rows (parents before children, depth = containing networks), IP -> row index, and an "unassigned" row.
export function buildNetworks(items, model, layout) {
  const order = items.map((_, i) => i).sort((a, b) => {
    const x = items[a], y = items[b];
    return x.v - y.v || cmpBig(x.lo, y.lo) || x.len - y.len;
  });
  const row = new Map(order.map((orig, k) => [orig, k]));
  const members = order.map(() => new Set()), unassigned = new Set(), ipNet = {};
  for (const n of model.nodes.values()) {
    if (layout.nodes[n.id]?.hidden) continue;
    for (const ip of n.ip) {
      const j = assignNetwork(items, ip);
      if (j < 0) { unassigned.add(n); continue; }
      members[row.get(j)].add(n);
      ipNet[ip.split("/")[0]] = row.get(j);
    }
  }
  const entry = (it, depth, set) => {
    const nodes = [...set], cl = [...new Set(nodes.map((n) => n.cluster).filter(Boolean))];
    return { cidr: it, name: "", depth, hosts: nodes.length, m: [...nodes.map((n) => nodeKey("server", n.id)), ...cl.map((c) => nodeKey("region", c))] };
  };
  const nets = order.map((orig, k) => {
    const it = items[orig], depth = items.filter((o) => o !== it && o.v === it.v && o.lo <= it.lo && o.hi >= it.hi && o.len < it.len).length;
    return { ...entry(it.cidr, depth, members[k]), name: it.name };
  });
  if (unassigned.size) nets.push({ ...entry("", 0, unassigned), name: "Unassigned network" });
  return { nets, ipNet };
}
