import { fail } from "../lib/util.mjs";

const ITEM = /^(\s*)[-*]\s+(?:`([^`]+)`\s+)?(\S.*)$/;

const ipNum = (s) => {
  const p = s.split(".");
  if (p.length !== 4 || p.some((o) => !/^\d{1,3}$/.test(o) || +o > 255)) return null;
  return p.reduce((a, o) => a * 256 + +o, 0);
};

function parseCidr(s, at) {
  const m = s.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  const addr = m && ipNum(m[1]);
  if (addr === null || !m || +m[2] > 32) fail(`${at}: invalid CIDR "${s}"; expected a.b.c.d/nn`);
  const size = 2 ** (32 - +m[2]);
  if (addr % size) fail(`${at}: "${s}" has host bits set; network address is ${numIp(addr - (addr % size))}/${m[2]}`);
  return { lo: addr, hi: addr + size - 1 };
}
const numIp = (n) => [24, 16, 8, 0].map((b) => Math.floor(n / 2 ** b) % 256).join(".");

export function parseNetworks(src) {
  const items = [];
  const stack = [];
  src.split("\n").forEach((raw, i) => {
    const at = `networks.md:${i + 1}`;
    if (!raw.trim() || /^# \S/.test(raw.trim())) return;
    const m = raw.replace(/\t/g, "  ").match(ITEM);
    if (!m) fail(`${at}: expected "- \`a.b.c.d/nn\` Name" or "- Group name" (nested by indentation), got: ${raw.trim()}`);
    const ind = m[1].length;
    while (stack.length && stack[stack.length - 1].ind >= ind) stack.pop();
    const parent = stack.length ? stack[stack.length - 1].i : -1;
    if (parent < 0 && ind > 0) fail(`${at}: top-level item must not be indented`);
    const it = { cidr: m[2] || "", name: m[3].trim(), depth: stack.length, parent, line: i + 1 };
    if (it.cidr) {
      Object.assign(it, parseCidr(it.cidr, at));
      const anc = stack.map((s) => items[s.i]).reverse().find((a) => a.cidr);
      if (anc && (it.lo < anc.lo || it.hi > anc.hi)) fail(`${at}: ${it.cidr} is not inside its parent ${anc.cidr} (${anc.name})`);
      const dup = items.find((x) => x.cidr === it.cidr);
      if (dup) fail(`${at}: ${it.cidr} already listed on line ${dup.line}`);
    }
    stack.push({ ind, i: items.length });
    items.push(it);
  });
  if (!items.length) fail("networks.md: no networks");
  items.forEach((it, k) => {
    if (!it.cidr && !items.some((c) => c.parent === k)) fail(`networks.md:${it.line}: grouping item "${it.name}" has no CIDR and no children`);
  });
  return items;
}

export function networkMembers(items, model, layout) {
  const ips = [];
  for (const n of model.nodes.values()) {
    if (layout.nodes[n.id]?.hidden) continue;
    for (const s of n.ip) ips.push([n, ipNum(s.split("/")[0])]);
  }
  const sets = items.map((it) => (it.cidr ? new Set(ips.filter(([, a]) => a >= it.lo && a <= it.hi).map(([n]) => n)) : null));
  const resolve = (k) => sets[k] || (sets[k] = new Set(items.flatMap((c, j) => (c.parent === k ? [...resolve(j)] : []))));
  return items.map((it, k) => {
    const nodes = [...resolve(k)];
    const cl = [...new Set(nodes.map((n) => n.cluster).filter(Boolean))];
    return { cidr: it.cidr, name: it.name, depth: it.depth, hosts: nodes.length, m: [...nodes.map((n) => "n:" + n.id), ...cl.map((c) => "c:" + c)] };
  });
}

// IP -> index of the deepest CIDR network containing it, for the network buttons; network addresses
// (a CIDR written in the text, or the base address of the matched network) are skipped.
export function ipNetworks(items, texts) {
  const out = {};
  for (const t of texts) {
    for (const [, ip, pre] of t.matchAll(/(?<![\d.])(\d{1,3}(?:\.\d{1,3}){3})(?![\d.])(?:\/(\d{1,2})(?!\d))?/g)) {
      const a = ipNum(ip);
      if (a === null || ip in out || (pre && +pre <= 32 && a % 2 ** (32 - +pre) === 0)) continue;
      let best = -1;
      items.forEach((it, k) => {
        if (it.cidr && a >= it.lo && a <= it.hi && (best < 0 || it.depth > items[best].depth)) best = k;
      });
      if (best >= 0 && a !== items[best].lo) out[ip] = best;
    }
  }
  return out;
}
