// Display form of a stored OS string (card pill, details panel); the stored text, the tooltip and EOL detection keep the original.
const NOISE = /^(?:Core|Final)$/i;

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
