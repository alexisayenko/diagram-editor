import { SERVER_ROW_FIELDS } from "./server-fields.mjs";

// Body lines of a server card: a jobs section (jn lines), then a services section (services, RMI services, systemd
// services); jobs, RMI and systemd are each capped at LIST_LINES with a "+N more" line, so probe-imported servers show content; the details panel lists everything.
const LIST_LINES = 4;
export function serviceLines(services, jobs = [], rmi = [], units = []) {
  return [...capLines(jobs), ...services, ...capLines(rmi), ...capLines(units)];
}
export const capLines = (a) => (a.length > LIST_LINES ? [...a.slice(0, LIST_LINES), `+${a.length - LIST_LINES} more`] : a);
// Probe-found crontab lines ("cron: ...") stay in the data and the editor but are not shown on the card.
export const cardJobs = (jobs) => jobs.filter((j) => !/^cron:/i.test(String(j).trim()));

// One-line hardware strip: set cells of cpu / ram / swap / disk ("sd") as "<value> <label>" joined by " ·", else the free-text hardware key; "" when none.
const HW_SEP = " · ";
// Size unit shown after every ram / swap / disk number; change it here ("G", "GiB", "GB") to switch the whole UI (card, details panel).
export const SIZE_UNIT = "G";
const oneDecimal = (n) => String(Math.round(n * 10) / 10);
// Display form of a stored value, the stored text is never rewritten: cpu "4 cores" / "4" -> "4"; sizes "8 GiB", "8GB", "8192 MiB", "50G" -> "8G"; unknown formats as stored.
export function normCpu(v) {
  const m = /^(\d+)\s*(?:v?cpus?|cores?)?$/i.exec(v);
  return m ? m[1] : v;
}
export function normSize(v) {
  const m = /^(\d+(?:\.\d+)?)\s*([kmgt])(?:i?b)?$/i.exec(v);
  if (!m) return v;
  const f = { k: 1 / 1048576, m: 1 / 1024, g: 1, t: 1024 }[m[2].toLowerCase()];
  return oneDecimal(Number(m[1]) * f) + SIZE_UNIT;
}
// The four hardware cells with data, in card order: [["cpu", "11"], ["ram", "8G"], ...] (shown on the card strip and in the details panel; value first, then label).
export function hardwareCells(s) {
  const norm = { cpu: normCpu, ram: normSize, swap: normSize, disk: normSize };
  return [["cpu", s.cpu], ["ram", s.ram], ["swap", s.swap], ["sd", s.disk]].filter(([, v]) => typeof v === "string" && v.trim()).map(([k, v]) => [k, norm[k === "sd" ? "disk" : k](v.trim())]);
}
export function hardwareStrip(s) {
  const cells = hardwareCells(s).map(([k, v]) => `${v} ${k}`);
  if (cells.length) return cells.join(HW_SEP);
  const h = typeof s.hardware === "string" ? s.hardware.trim() : "";
  return h.length > 48 ? h.slice(0, 47) + "…" : h;
}

// Glob with `*` (any run) and `?` (one character), case-insensitive, matched against the whole service name.
export function globRegExp(p) {
  return new RegExp("^" + p.trim().replaceAll(/[.+^${}()|[\]\\]/g, String.raw`\$&`).replaceAll("*", ".*").replaceAll("?", ".") + "$", "i");
}
// Splits systemd units by `[[service_groups]]` (first matching group wins, name compared without ".service"):
// [[label, units], ...] in group order; unmatched units are intentionally dropped; with no groups the single "systemd services" list; empty sections omitted.
// Card body units: with at least one `card = true` group, only the units of those groups (group order); otherwise all units.
export function cardUnits(units, groups) {
  if (!groups.some((g) => g.card)) return units;
  const flagged = new Set(groups.filter((g) => g.card).map((g) => g.label));
  return groupUnits(units, groups).filter(([h]) => flagged.has(h)).flatMap(([, a]) => a);
}
export function groupUnits(units, groups) {
  if (!groups.length) return units.length ? [["systemd services", units]] : [];
  const buckets = groups.map(() => []);
  for (const u of units) {
    const name = u.replace(/\.service$/i, ""), i = groups.findIndex((g) => g.patterns.some((re) => re.test(name)));
    if (i >= 0) buckets[i].push(u);
  }
  return groups.map((g, i) => [g.label, buckets[i]]).filter(([, a]) => a.length);
}

const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const normalised = (v, norm) => { const t = text(v); return t === null ? null : norm(t); };

// The structured facts of one server, built once from a validated servers/<id>.toml table:
// os (null for none or "TBD"), role, hardware parts normalised for display, the list fields, the free notes text,
// unitGroups (systemd units split by [[service_groups]]), rows (the Key / Value rows of the details table, stored text).
// Cards and the details markdown are rendered from this; nothing parses them back.
export function serverFields(s, { ips, dns, services, jobs, rmi, units }, groups) {
  const os = text(s.os)?.replaceAll("|", "/") ?? null;
  const cells = hardwareCells(s);
  return {
    os: /^TBD$/i.test(os ?? "") ? null : os,
    role: text(s.role),
    hardware: {
      cpu: normalised(s.cpu, normCpu), ram: normalised(s.ram, normSize), swap: normalised(s.swap, normSize), disk: normalised(s.disk, normSize),
      free: text(s.hardware), cells, strip: hardwareStrip(s),
    },
    ips, dns, services, jobs, rmi, systemd: units,
    unitGroups: groupUnits(units, groups),
    notes: s.details || "",
    rows: SERVER_ROW_FIELDS.filter((f) => s[f.key]).map((f) => [f.label, s[f.key]]),
  };
}

const markdownBlock = (head, items) => (items.length ? `## ${head}\n\n${items.map((i) => "- " + i).join("\n")}\n\n` : "");

function networkLabel(nets, ip) {
  const { name, cidr } = nets.of(ip) ?? {};
  return cidr ? name || cidr : "unassigned network";
}

// The details-panel markdown of a server section (generated text the legacy details.md also uses); `nets` adds the network after each IP.
export function serverSection(fields, nets = null) {
  const rows = fields.rows.map(([label, value]) => `| ${label} | ${value.replaceAll("|", "/")} |`);
  const ipItems = nets ? fields.ips.map((ip) => `${ip} — ${networkLabel(nets, ip)}`) : fields.ips;
  const grouped = fields.unitGroups.map(([h, a]) => markdownBlock(h, a)).join("");
  return (rows.length ? `| Key | Value |\n|---|---|\n${rows.join("\n")}\n\n` : "") + markdownBlock("IPs", ipItems) + markdownBlock("DNS", fields.dns) + markdownBlock("RMI services", fields.rmi) + grouped + fields.notes;
}
