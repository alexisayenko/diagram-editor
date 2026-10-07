// Shared networks.toml: [[networks]] tables (cidr, name, optional description) reused by every diagram.
// The server-to-network relation is derived from IPs, never declared.
import { parseToml } from "./toml.mjs";

export function parseIp(text) {
  if (typeof text !== "string") return null;
  const m = text.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const o = m.slice(1).map(Number);
    return o.some((x) => x > 255) ? null : { v: 4, n: BigInt(((o[0] * 256 + o[1]) * 256 + o[2]) * 256 + o[3]) };
  }
  if (!text.includes(":") || !/^[0-9A-Fa-f:]+$/.test(text)) return null;
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const groups = (t) => (t === "" ? [] : t.split(":"));
  const head = groups(halves[0]), tail = halves.length === 2 ? groups(halves[1]) : [];
  if (halves.length === 1 ? head.length !== 8 : head.length + tail.length > 7) return null;
  const fill = halves.length === 2 ? Array(8 - head.length - tail.length).fill("0") : [];
  const all = [...head, ...fill, ...tail];
  if (all.length !== 8 || all.some((g) => !/^[0-9A-Fa-f]{1,4}$/.test(g))) return null;
  return { v: 6, n: all.reduce((a, g) => (a << 16n) + BigInt(parseInt(g, 16)), 0n) };
}

export function parseCidr(text) {
  const m = typeof text === "string" && text.match(/^([^/]+)\/(\d{1,3})$/);
  const ip = m && parseIp(m[1]);
  if (!ip) return { error: `invalid CIDR '${text}'; expected a.b.c.d/nn or an IPv6 address with /nn` };
  const bits = ip.v === 4 ? 32 : 128, len = +m[2];
  if (len > bits) return { error: `invalid CIDR '${text}'; the prefix is at most ${bits}` };
  const size = 1n << BigInt(bits - len);
  if (ip.n % size) return { error: `'${text}' has host bits set` };
  return { v: ip.v, len, lo: ip.n, hi: ip.n + size - 1n };
}

export function parseNetworksFile(src) {
  const root = parseToml(src);
  const fail = (m) => { throw new Error("networks.toml: " + m); };
  const extra = Object.keys(root).filter((k) => k !== "networks");
  if (extra.length) fail(`unknown key ${extra.join(", ")}; only [[networks]] tables are allowed`);
  const list = root.networks || [];
  if (!list.length) fail("no [[networks]] entries");
  const items = [];
  list.forEach((d, i) => {
    const at = `networks[${i + 1}]`, unknown = Object.keys(d).filter((k) => !["cidr", "name", "description"].includes(k));
    if (unknown.length) fail(`${at}: unknown key ${unknown.join(", ")}`);
    if (typeof d.cidr !== "string" || !d.cidr.trim()) fail(`${at}: cidr must be a non-empty string`);
    const cidr = d.cidr.trim(), parsed = parseCidr(cidr);
    if (parsed.error) fail(`${at} (${cidr}): ${parsed.error}`);
    if (typeof d.name !== "string" || !d.name.trim()) fail(`${at} (${cidr}): name must be a non-empty string`);
    if (d.description !== undefined && typeof d.description !== "string") fail(`${at} (${cidr}): description must be a string`);
    const dup = items.findIndex((x) => x.cidr === cidr);
    if (dup >= 0) fail(`${at} (${cidr}): duplicate cidr, already networks[${dup + 1}] (${items[dup].name})`);
    items.push({ cidr, name: d.name.trim(), description: (d.description || "").trim(), ...parsed });
  });
  return items;
}

export function isNetworksFile(name, text) {
  if (name === "networks.toml") return true;
  return /^\s*\[\[networks\]\]/m.test(text) && !/^\s*\[\[(servers|regions)\]\]/m.test(text);
}

// Index of the most specific (longest prefix) network containing the address part of `text`, or -1.
export function assignNetwork(items, text) {
  const ip = parseIp(String(text).split("/")[0]);
  let best = -1;
  if (!ip) return best;
  items.forEach((it, i) => {
    if (it.v === ip.v && ip.n >= it.lo && ip.n <= it.hi && (best < 0 || it.len > items[best].len)) best = i;
  });
  return best;
}

// Panel rows (parents before children, depth = containing networks), IP -> row index, and an "unassigned" row.
export function buildNetworks(items, model, layout) {
  const order = items.map((_, i) => i).sort((a, b) => {
    const x = items[a], y = items[b];
    return x.v - y.v || (x.lo < y.lo ? -1 : x.lo > y.lo ? 1 : 0) || x.len - y.len;
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
    return { cidr: it, name: "", depth, hosts: nodes.length, m: [...nodes.map((n) => "n:" + n.id), ...cl.map((c) => "c:" + c)] };
  };
  const nets = order.map((orig, k) => {
    const it = items[orig], depth = items.filter((o) => o !== it && o.v === it.v && o.lo <= it.lo && o.hi >= it.hi && o.len < it.len).length;
    return { ...entry(it.cidr, depth, members[k]), name: it.name };
  });
  if (unassigned.size) nets.push({ ...entry("", 0, unassigned), name: "Unassigned network" });
  return { nets, ipNet };
}
