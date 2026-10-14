// Surgical name edit of one [[networks]] entry in a diagram folder's networks.toml: only that entry's `name` line is replaced, inserted
// or removed; every other byte (comments, formatting, line endings) is kept. A CIDR with no entry gets a new table (cidr + name) at the end.
import { parseCidr } from "./shared-networks.mjs";

export const MAX_NAME = 80;

const sameCidr = (a, b) => {
  if (a === b) return true;
  const x = parseCidr(a), y = parseCidr(b);
  return !x.error && !y.error && x.v === y.v && x.len === y.len && x.lo === y.lo;
};

const quote = (s) => JSON.stringify(s);

export function normalizeName(name) {
  const n = String(name ?? "").trim();
  if (/[\r\n]/.test(n)) throw new Error("The network name must be a single line.");
  if (n.length > MAX_NAME) throw new Error(`The network name is at most ${MAX_NAME} characters.`);
  return n;
}

const body = (l) => l.replace(/\r?\n$/, "");
const indentOf = (l) => body(l).match(/^\s*/)[0];
const eolOf = (l) => {
  if (l.endsWith("\r\n")) return "\r\n";
  return l.endsWith("\n") ? "\n" : "";
};
const NETWORKS_HEAD = /^\s*\[\[\s*networks\s*\]\]\s*(#.*)?$/;
const CIDR_LINE = /^\s*cidr\s*=\s*(?:"([^"]*)"|'([^']*)')/;

const entryEnd = (lines, from) => {
  let j = from + 1;
  while (j < lines.length && !/^\s*\[/.test(lines[j])) j++;
  return j;
};

const hasCidr = (lines, from, to, cidr) => {
  for (let k = from; k < to; k++) {
    const m = CIDR_LINE.exec(body(lines[k]));
    if (m && sameCidr((m[1] ?? m[2]).trim(), cidr)) return true;
  }
  return false;
};

function findEntry(lines, cidr) {
  for (let i = 0; i < lines.length; i++) {
    if (!NETWORKS_HEAD.test(body(lines[i]))) continue;
    const end = entryEnd(lines, i);
    if (hasCidr(lines, i + 1, end, cidr)) return { at: i, end };
  }
  return null;
}

function appendEntry(text, nl, cidr, n) {
  const head = text.trim() ? (text.endsWith("\n") ? text : text + nl) + nl : text;
  return head + "[[networks]]" + nl + 'cidr = "' + cidr + '"' + nl + "name = " + quote(n) + nl;
}

function editEntry(lines, { at, end }, n, nl) {
  let nameAt = -1, cidrLine = -1;
  for (let k = at + 1; k < end; k++) {
    if (/^\s*name\s*=/.test(body(lines[k]))) nameAt = k;
    if (/^\s*cidr\s*=/.test(body(lines[k]))) cidrLine = k;
  }
  if (nameAt >= 0) {
    if (!n) lines.splice(nameAt, 1);
    else lines[nameAt] = indentOf(lines[nameAt]) + "name = " + quote(n) + eolOf(lines[nameAt]);
  } else if (n) {
    const l = lines[cidrLine], eol = eolOf(l);
    if (!eol) lines[cidrLine] = l + nl;
    lines.splice(cidrLine + 1, 0, indentOf(l) + "name = " + quote(n) + eol);
  }
  return lines.join("");
}

// Returns the new file text (null when nothing changes and the file is absent). An empty name removes the name but keeps the entry.
export function setNetworkName(existing, cidr, name) {
  const n = normalizeName(name), c = parseCidr(cidr);
  if (c.error) throw new Error(c.error);
  const text = existing ?? "";
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/(?<=\n)/);
  const entry = findEntry(lines, cidr);
  if (entry) return editEntry(lines, entry, n, nl);
  return n ? appendEntry(text, nl, cidr, n) : existing;
}
