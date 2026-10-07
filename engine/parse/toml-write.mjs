// Surgical write-back of the top-level `notes` key: every other byte of the file is kept.
import { parseToml } from "./toml.mjs";

function eolOf(src) {
  const i = src.indexOf("\n");
  return i > 0 && src[i - 1] === "\r" ? "\r\n" : "\n";
}

function multiline(text, eol) {
  let out = "";
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += eol;
    else if (ch === "\t") out += ch;
    else if (c < 32 || c === 127) out += "\\u" + c.toString(16).padStart(4, "0");
    else if (c >= 0xd800 && c <= 0xdfff) throw new Error("Note text contains an unpaired surrogate");
    else out += ch;
  }
  return out.replace(/"{3,}|"+$/g, (q) => '\\"'.repeat(q.length));
}

export function formatNotes(texts, eol = "\n") {
  const items = texts.map((t) => `  """${eol}${multiline(t, eol)}"""`);
  return `[${eol}${items.join("," + eol)},${eol}]`;
}

function plain(root) {
  const copy = { ...root };
  delete copy.notes;
  return JSON.stringify(copy);
}

export function setNotes(src, texts) {
  if (!Array.isArray(texts) || texts.some((t) => typeof t !== "string" || !t.trim())) throw new Error("Notes must be non-empty strings");
  const eol = eolOf(src), norm = [], map = [];
  for (let i = 0; i < src.length; i++) {
    if (i === 0 && src[0] === "\uFEFF") continue;
    if (src[i] === "\r" && src[i + 1] === "\n") continue;
    norm.push(src[i]); map.push(i);
  }
  map.push(src.length);
  const flat = norm.join(""), spans = { keys: {} }, before = parseToml(flat, spans);
  const at = (i) => (norm[i] === "\n" && src[map[i] - 1] === "\r" ? map[i] - 1 : map[i]), key = spans.keys.notes;
  let out;
  if (key) {
    if (texts.length) out = src.slice(0, at(key.valueStart)) + formatNotes(texts, eol) + src.slice(at(key.valueEnd));
    else {
      const from = flat.lastIndexOf("\n", key.start - 1) + 1;
      let to = flat.indexOf("\n", key.valueEnd);
      to = to < 0 ? flat.length : to + 1;
      out = src.slice(0, at(from)) + src.slice(at(to));
    }
  } else if (!texts.length) return src;
  else {
    const block = `notes = ${formatNotes(texts, eol)}${eol}`;
    if (spans.lastLineEnd !== undefined) {
      const pos = at(spans.lastLineEnd);
      out = src.slice(0, pos) + (flat.endsWith("\n") || spans.lastLineEnd < flat.length ? "" : eol) + block + src.slice(pos);
    } else {
      const pos = spans.firstTable === undefined ? src.length : at(spans.firstTable);
      const lead = pos === src.length && src.length && !flat.endsWith("\n") ? eol : "";
      out = src.slice(0, pos) + lead + block + (spans.firstTable === undefined ? "" : eol) + src.slice(pos);
    }
  }
  const after = parseToml(out);
  const same = JSON.stringify(after.notes ?? []) === JSON.stringify(texts) && plain(after) === plain(before);
  if (!same) throw new Error("Internal error: the rewritten TOML does not match the notes; nothing was written");
  return out;
}
