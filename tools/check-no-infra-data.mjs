#!/usr/bin/env node
// Flags text that looks like real infrastructure data (hosts, IPs, e-mails, internal tool URLs).
// Usage: node tools/check-no-infra-data.mjs [--staged | --all]   (default: --staged)
// Exit code 1 when anything is found. Read-only. Allow-list: tools/infra-data-allow.txt.
// Optional private deny-list: local/deny-words.txt (git-ignored, one word per line).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const DOC_RANGES = ["192.0.2.", "198.51.100.", "203.0.113."];
const SAFE_DOMAINS = ["example.com", "example.org", "example.net", "example.test", "test", "invalid", "localhost", "example"];
const TLDS = "com|net|org|io|dev|cloud|eu|ru|de|uk|local|internal|corp|lan|intranet|home";
const COMMON_TLDS = new Set(["com", "org", "io", "dev", "cloud"]);
const INTERNAL_TLDS = new Set(["local", "internal", "corp", "lan", "intranet", "home"]);

const IPV4 = /(?<![\w.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\w]|\.\d)/g;
const HOST = new RegExp(String.raw`(?<![\w@.-])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:${TLDS}))(?![\w-])`, "gi");
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
const TOOL = /[\w.-]*(?:jira|confluence|bitbucket)[\w.-]*\.[a-z]{2,}/gi;

export function parseAllow(text) {
  const allow = { ip: [], host: [], email: [], file: [] };
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [kind, ...rest] = line.split(/\s+/);
    if (allow[kind] && rest.length) allow[kind].push(rest.join(" ").toLowerCase());
  }
  return allow;
}

const domainAllowed = (host, extra) => [...SAFE_DOMAINS, ...extra].some((d) => host === d || host.endsWith("." + d));

function isPublicLooking(a, b, c, d) {
  const o = [a, b, c, d].map(Number);
  if (o.some((n) => n > 255)) return false;
  if (o[0] === 0 || o[0] === 127 || o[0] >= 224) return false;
  if (o.every((n) => n === 255 || n === 0)) return false;
  if (o[0] === 255) return false;
  return true;
}

export function scanText(text, file, { allow = parseAllow(""), owner = "", deny = [] } = {}) {
  if (allow.file.some((p) => file === p || file.startsWith(p))) return [];
  const hits = [], lines = text.split("\n");
  const add = (i, rule, match) => hits.push({ file, line: i + 1, rule, match });
  lines.forEach((line, i) => {
    for (const m of line.matchAll(IPV4)) {
      const ip = m[0], low = ip.toLowerCase();
      if (!isPublicLooking(m[1], m[2], m[3], m[4])) continue;
      if (DOC_RANGES.some((r) => ip.startsWith(r))) continue;
      if (allow.ip.some((p) => low.startsWith(p))) continue;
      add(i, "ipv4-outside-documentation-ranges", ip);
    }
    for (const m of line.matchAll(EMAIL)) {
      const mail = m[0].toLowerCase(), domain = m[1].toLowerCase();
      if (/^\d/.test(domain)) continue;
      if (mail === owner.toLowerCase() || domainAllowed(domain, []) || domain.endsWith("users.noreply.github.com")) continue;
      if (mail.startsWith("noreply@") || allow.email.includes(mail)) continue;
      add(i, "email-address", m[0]);
    }
    const scrubbed = line.replace(EMAIL, " ");
    for (const m of scrubbed.matchAll(HOST)) {
      const host = m[1].toLowerCase(), parts = host.split("."), tld = parts.pop();
      if (parts.length === 1 && (parts[0].length < 3 || !(COMMON_TLDS.has(tld) || INTERNAL_TLDS.has(tld)))) continue;
      if (domainAllowed(host, allow.host) && !INTERNAL_TLDS.has(tld)) continue;
      if (INTERNAL_TLDS.has(tld) && allow.host.some((d) => host === d || host.endsWith("." + d))) continue;
      add(i, "real-looking-hostname", m[1]);
    }
    for (const m of scrubbed.matchAll(TOOL)) {
      const host = m[0].toLowerCase();
      if (allow.host.some((d) => host === d || host.endsWith("." + d))) continue;
      add(i, "internal-tool-url", m[0]);
    }
    const lower = line.toLowerCase();
    for (const w of deny) if (lower.includes(w)) add(i, "deny-list-word", "(deny-list entry)");
  });
  return hits;
}

const git = (args, cwd) => {
  const r = spawnSync("git", args, { cwd, encoding: "buffer", maxBuffer: 256 * 1024 * 1024 }); // NOSONAR: dev tool run from the developer's own shell; git resolved from their PATH
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
};
const names = (buf) => buf.toString("utf8").split("\0").filter(Boolean);

export function collect(mode, root = ROOT) {
  if (mode === "all") return names(git(["ls-files", "-z"], root)).map((f) => ({ file: f, get: () => readFileSync(join(root, f)) }));
  return names(git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], root)).map((f) => ({ file: f, get: () => git(["show", ":" + f], root) }));
}

const isText = (buf) => !buf.subarray(0, 8000).includes(0);

export function run({ mode = "staged", root = ROOT, out = console } = {}) {
  const allowFile = join(root, "tools/infra-data-allow.txt"), denyFile = join(root, "local/deny-words.txt");
  const allow = parseAllow(existsSync(allowFile) ? readFileSync(allowFile, "utf8") : "");
  const deny = existsSync(denyFile) ? readFileSync(denyFile, "utf8").split("\n").map((l) => l.replace(/#.*/, "").trim().toLowerCase()).filter(Boolean) : [];
  let owner = "";
  try { owner = git(["config", "user.email"], root).toString("utf8").trim(); } catch (_) { /* no configured e-mail */ }
  const hits = [];
  for (const { file, get } of collect(mode, root)) {
    const buf = get();
    if (isText(buf)) hits.push(...scanText(buf.toString("utf8"), file, { allow, owner, deny }));
  }
  for (const h of hits) out.error(`${h.file}:${h.line}: ${h.rule}: ${h.match}`);
  if (hits.length) out.error(`${hits.length} possible infrastructure value(s). Use synthetic data (see CLAUDE.md), or list a documentation-only value in tools/infra-data-allow.txt.`);
  return hits.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = run({ mode: process.argv.includes("--all") ? "all" : "staged" });
}
