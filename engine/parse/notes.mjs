import { fail } from "./errors.mjs";

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
    const line = raw.trim(), at = `notes.md:${i + 1}: `;
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
  if (!notes.length) fail('notes.md: no "## <title>" sections');
  for (const n of notes) {
    if (n.date === null) fail(`notes.md:${n.line}: note "${n.title}" has no "Date: <stamp>" line`);
    if (!n.paras.length) fail(`notes.md:${n.line}: note "${n.title}" has no text`);
  }
  return notes;
}
