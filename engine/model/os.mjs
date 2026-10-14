// Display form of a stored OS string (card pill, details panel); the stored text, the tooltip and EOL detection keep the original.
const NOISE = /^(?:Core|Final)$/i;
const WS = /s/;

function mapParens(s, fn) {
  let out = "", from = 0, open = s.indexOf("(");
  while (open >= 0) {
    let start = open;
    while (start > from && WS.test(s[start - 1])) start--;
    let close = open + 1;
    while (close < s.length && s[close] !== "(" && s[close] !== ")") close++;
    if (s[close] === ")") {
      out += s.slice(from, start) + fn(s.slice(open + 1, close));
      from = close + 1;
      open = s.indexOf("(", from);
    } else open = s.indexOf("(", open + 1);
  }
  return out + s.slice(from);
}

function dropLinuxWord(s) {
  let e = 0;
  while (e < s.length && !WS.test(s[e])) e++;
  if (!e) return s;
  while (s[e] === " ") {
    let f = e + 1;
    while (f < s.length && !WS.test(s[f])) f++;
    if (f === e + 1) return s;
    if (/^linux$/i.test(s.slice(e + 1, f)) && (f === s.length || (s[f] === " " && s[f + 1] >= "0" && s[f + 1] <= "9"))) return s.slice(0, e) + s.slice(f);
    e = f;
  }
  return s;
}

export function displayOs(os) {
  if (typeof os !== "string") return os;
  let s = os.trim()
    .replace(/\s*\(([^()]*)\)/g, (_, w) => (NOISE.test(w.trim()) ? "" : " " + w.trim()))
    .replace(/^Red Hat Enterprise Linux\b/i, "RHEL")
    .replace(/^Oracle Linux Server\b/i, "Oracle Linux")
    .replace(/\s*GNU\/Linux\b/i, "");
  if (!/^(?:Oracle|Amazon) Linux\b/i.test(s)) s = s.replace(/^(\S+(?: \S+)*?) Linux(?= \d|$)/i, "$1");
  s = s.replace(/^(Ubuntu \d+\.\d+)\.\d+/i, "$1").replace(/\s+/g, " ").trim();
  return s || os;
}

const FAMILIES = [
  ["rhel", /red\s*hat|\brhel\b/], ["centos", /centos/], ["rocky", /rocky/], ["alma", /alma/], ["oracle", /oracle/],
  ["suse", /suse|\bsles\b/], ["fedora", /fedora/], ["amazon", /amazon/], ["alpine", /alpine/],
  ["ubuntu", /ubuntu/], ["debian", /debian/], ["windows", /windows|microsoft/], ["macos", /mac\s*os|\bosx\b|os x|darwin/],
  ["linux", /linux|gnu|\barch\b|mint|kali|gentoo|slackware|raspbian|devuan|nixos/],
];

// Distro family id of a stored or displayed OS string (icon choice): "unknown" for empty or unrecognised text.
export function osFamily(os) {
  if (typeof os !== "string") return "unknown";
  const s = os.toLowerCase();
  for (const [id, re] of FAMILIES) if (re.test(s)) return id;
  return "unknown";
}

// End of standard support (extended for Windows Server 2016, Premier for Oracle Linux), "YYYY-MM": EOL once that month has passed.
const EOL = {
  ubuntu: { "14.04": "2019-04", "16.04": "2021-04", "18.04": "2023-05", "20.04": "2025-05", "22.04": "2027-04", "24.04": "2029-05" },
  debian: { 8: "2018-06", 9: "2020-07", 10: "2022-09", 11: "2024-08", 12: "2026-06", 13: "2028-08" },
  centos: { 7: "2024-06" },
  oracle: { 7: "2024-12", 8: "2029-07", 9: "2032-06" },
  windows: { 2012: "2023-10", "2012 R2": "2023-10", 2016: "2027-01" },
};

function eolOf(os) {
  let m = /^Ubuntu (\d+)(?:\.(\d+))?/i.exec(os);
  if (m) return EOL.ubuntu[`${m[1]}.${m[2] || "04"}`] || null;
  m = /^Debian(?: GNU\/Linux)? (\d+)/i.exec(os);
  if (m) return EOL.debian[m[1]] || null;
  m = /^CentOS(?: Linux)? (\d+)/i.exec(os);
  if (m) return EOL.centos[m[1]] || null;
  m = /^Oracle Linux(?: Server)? (\d+)/i.exec(os);
  if (m) return EOL.oracle[m[1]] || null;
  m = /^Windows Server (\d{4})( R2)?/i.exec(os);
  if (m) return EOL.windows[m[1] + (m[2] ? " R2" : "")] || null;
  return null;
}


export function osInfo(os, today = new Date()) {
  if (!os) return null;
  const eol = eolOf(os);
  return { v: os, d: displayOs(os), f: osFamily(os), eol: eol && today.toISOString().slice(0, 7) > eol ? eol : null };
}
