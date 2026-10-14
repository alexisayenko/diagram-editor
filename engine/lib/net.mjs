// IP and CIDR parsing, containment and prefix helpers, shared by the networks model and the server field checks.
export const cmpBig = (a, b) => (a < b ? -1 : Number(a > b));

export function ipv4Number(text) {
  const p = String(text).split(".");
  if (p.length !== 4 || p.some((o) => !/^\d{1,3}$/.test(o) || +o > 255)) return null;
  return p.reduce((a, o) => a * 256 + +o, 0);
}

export const ipv4Text = (n) => [24, 16, 8, 0].map((b) => Math.floor(n / 2 ** b) % 256).join(".");

export function ipv4CidrProblem(ip) {
  const m = typeof ip === "string" && /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(ip);
  return !m || m[1].split(".").some((n) => +n > 255) || +m[2] > 32 ? `invalid IPv4 CIDR '${ip}'` : null;
}

export function parseIp(text) {
  if (typeof text !== "string") return null;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
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
  const fill = halves.length === 2 ? new Array(8 - head.length - tail.length).fill("0") : [];
  const all = [...head, ...fill, ...tail];
  if (all.length !== 8 || all.some((g) => !/^[0-9A-Fa-f]{1,4}$/.test(g))) return null;
  return { v: 6, n: all.reduce((a, g) => (a << 16n) + BigInt(Number.parseInt(g, 16)), 0n) };
}

export function parseCidr(text) {
  const m = typeof text === "string" && /^([^/]+)\/(\d{1,3})$/.exec(text);
  const ip = m && parseIp(m[1]);
  if (!ip) return { error: `invalid CIDR '${text}'; expected a.b.c.d/nn or an IPv6 address with /nn` };
  const bits = ip.v === 4 ? 32 : 128, len = +m[2];
  if (len > bits) return { error: `invalid CIDR '${text}'; the prefix is at most ${bits}` };
  const size = 1n << BigInt(bits - len);
  if (ip.n % size) return { error: `'${text}' has host bits set` };
  return { v: ip.v, len, lo: ip.n, hi: ip.n + size - 1n };
}

export const contains = (net, ip) => net.v === ip.v && ip.n >= net.lo && ip.n <= net.hi;

// Network implied by an IPv4 entry with a prefix (192.0.2.10/24 -> 192.0.2.0/24); null for /32, /0, no prefix, IPv6 or junk.
export function derivedCidr(text) {
  const m = typeof text === "string" && /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(text.trim());
  const ip = m && parseIp(m[1]), len = m && +m[2];
  if (!ip || len < 1 || len > 31) return null;
  const size = 1n << BigInt(32 - len), lo = ip.n - (ip.n % size), o = [24n, 16n, 8n, 0n].map((b) => (lo >> b) & 255n);
  return o.join(".") + "/" + len;
}

export function derivedCidrs(ips) {
  const set = new Set(ips.map(derivedCidr).filter(Boolean));
  return [...set].sort((a, b) => { const x = parseCidr(a), y = parseCidr(b); return cmpBig(x.lo, y.lo) || x.len - y.len; });
}
