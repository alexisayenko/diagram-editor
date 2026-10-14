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
