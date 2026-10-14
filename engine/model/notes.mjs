import { fail, FormatError } from "../lib/errors.mjs";

function dateOf(note, line, at) {
  const m = /^Date:\s*(\S.*)$/.exec(line);
  if (!m) fail(at + `note "${note.title}": first line must be "Date: <stamp>", got: ${line}`);
  return m[1].trim();
}

export function parseNotes(src) {
  const notes = [];
  let cur = null, para = [];
  const flush = () => {
    if (para.length) cur.paras.push(para.join(" "));
    para = [];
  };
  src.split("\n").forEach((raw, i) => {
    const line = raw.trim(), at = `line ${i + 1}: `;
    const heading = /^## (.*)$/.exec(raw);
    if (heading) {
      if (cur) flush();
      if (!heading[1].trim()) fail(at + "empty note title");
      cur = { title: heading[1].trim(), date: null, paras: [], line: i + 1 };
      notes.push(cur);
    } else if (!cur) {
      if (line && !/^# \S/.test(line)) fail(at + `text before the first "## <title>": ${line}`);
    } else if (cur.date === null) {
      if (line) cur.date = dateOf(cur, line, at);
    } else if (!line) flush();
    else if (line.startsWith("#")) fail(at + `unexpected heading "${line}" (notes use "## <title>")`);
    else para.push(line);
  });
  if (cur) flush();
  if (!notes.length) fail('no "## <title>" sections');
  for (const n of notes) {
    if (n.date === null) fail(`line ${n.line}: note "${n.title}" has no "Date: <stamp>" line`);
    if (!n.paras.length) fail(`line ${n.line}: note "${n.title}" has no text`);
  }
  return notes;
}
export function hasHashLine(body) {
  let lineStart = true;
  for (const c of body) {
    if (c === "#") {
      if (lineStart) return true;
      lineStart = false;
    } else if (c === "\n" || c === "\r" || c === " " || c === " ") lineStart = true;
    else if (!/\s/.test(c)) lineStart = false;
  }
  return false;
}

// One note card from its TOML string: first line title, optional "Date:" line, rest body.
export function parseNoteText(text, at = "note", strict = false) {
  const fail = (m) => { throw new FormatError(m, { path: at }); };
  if (strict && text.trim() && !text.split("\n")[0].trim()) fail("the first line is the title and cannot be empty");
  const [head, ...rest] = text.trim().split("\n"), dated = /^\s*Date:/.test(rest[0] || "");
  if (!head) fail("needs a title line and body text");
  if (dated && !/^\s*Date:\s*\S/.test(rest[0])) fail("empty Date");
  const body = rest.slice(dated ? 1 : 0).join("\n");
  if (!body.trim()) fail("needs a title line and body text");
  if (/^[^\S\n]*#/m.test(body)) fail("body lines cannot start with #");
  return { ...parseNotes(`## ${head}\n${dated ? "" : "Date: Note\n\n"}${rest.join("\n")}`)[0], text: text.trim() };
}

