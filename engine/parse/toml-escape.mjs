// The one TOML string escaper: basic strings ("...") and the body of multi-line basic strings (""" ... """).
function control(ch, label) {
  const c = ch.codePointAt(0);
  if (c < 32 || c === 127) return String.raw`\u` + c.toString(16).padStart(4, "0");
  if (c >= 0xd800 && c <= 0xdfff) throw new Error(label + " contains an unpaired surrogate");
  return ch;
}

export function tomlBasic(text, label = "Text") {
  let out = "";
  for (const ch of text) {
    if (ch === "\\") out += String.raw`\\`;
    else if (ch === '"') out += String.raw`\"`;
    else if (ch === "\n") out += String.raw`\n`;
    else if (ch === "\t") out += String.raw`\t`;
    else out += control(ch, label);
  }
  return `"${out}"`;
}

export function tomlMultilineBody(text, eol, label = "Note text") {
  let out = "";
  for (const ch of text) {
    if (ch === "\\") out += String.raw`\\`;
    else if (ch === "\n") out += eol;
    else if (ch === "\t") out += ch;
    else out += control(ch, label);
  }
  return out.replace(/"+/g, (q, at) => (q.length >= 3 || at + q.length === out.length ? String.raw`\"`.repeat(q.length) : q));
}
