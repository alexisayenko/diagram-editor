// Lists identifiers a function's source reads without declaring them (free variables).
// A scanner, not a parser: it strips strings, comments, regex literals and property names, then
// subtracts every declared name (const/let/var/function/class names, parameters, catch variables).
const BUILTINS = new Set(("Math Object Array Number String Set Map WeakMap JSON Infinity NaN undefined parseFloat parseInt isFinite isNaN Boolean Error TypeError RangeError RegExp Symbol BigInt Date Promise Int8Array Uint8Array Int16Array Uint16Array Int32Array Uint32Array Float32Array Float64Array arguments this null true false")
  .split(" "));
const KEYWORDS = new Set(("async await break case catch class const continue default delete do else export extends finally for function if in instanceof let new of return static super switch throw try typeof var void while with yield get set from")
  .split(" "));

function strip(src) {
  let out = "", i = 0, prev = "";
  const regexAllowed = () => !prev || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || /(?:return|typeof|case|in|of)$/.test(out.trimEnd());
  const template = () => {
    i++;
    out += " ";
    while (i < src.length && src[i] !== "`") {
      if (src[i] === "\\") i += 2;
      else if (src[i] === "$" && src[i + 1] === "{") {
        i += 2;
        let depth = 1, start = i;
        while (i < src.length && depth) { if (src[i] === "{") depth++; else if (src[i] === "}") depth--; i++; }
        out += " " + strip(src.slice(start, i - 1)) + " ";
      } else i++;
    }
    i++;
  };
  while (i < src.length) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2) + 2; continue; }
    if (c === '"' || c === "'") {
      i++;
      while (i < src.length && src[i] !== c) i += src[i] === "\\" ? 2 : 1;
      i++; out += " 0 "; prev = "0"; continue;
    }
    if (c === "`") { template(); out += " 0 "; prev = "0"; continue; }
    if (c === "/" && regexAllowed()) {
      i++;
      let cls = false;
      while (i < src.length && (src[i] !== "/" || cls)) { if (src[i] === "\\") i++; else if (src[i] === "[") cls = true; else if (src[i] === "]") cls = false; i++; }
      i++;
      while (/[a-z]/.test(src[i] ?? "")) i++;
      out += " 0 "; prev = "0"; continue;
    }
    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

const ID = /[A-Za-z_$][\w$]*/g;

export function freeVariables(fn) {
  const code = strip(fn.toString());
  const declared = new Set();
  const addAll = (text) => { for (const m of text.matchAll(ID)) declared.add(m[0]); };
  // Matches a balanced (...) or [...] / {...} group starting at index `at`.
  const group = (at) => {
    const open = code[at], close = { "(": ")", "[": "]", "{": "}" }[open];
    let depth = 0;
    for (let j = at; j < code.length; j++) {
      if (code[j] === open) depth++;
      else if (code[j] === close && !--depth) return code.slice(at + 1, j);
    }
    return "";
  };
  for (const m of code.matchAll(/\b(?:function\*?|class)\s*([A-Za-z_$][\w$]*)?\s*(\()?/g)) {
    if (m[1]) declared.add(m[1]);
    const paren = code.indexOf("(", m.index + 5);
    if (m[0].startsWith("function") && paren >= 0) addAll(group(paren));
  }
  for (const m of code.matchAll(/\b(?:const|let|var)\s+/g)) {
    let j = m.index + m[0].length;
    for (;;) {
      if ("[{".includes(code[j])) { const g = group(j); addAll(g); j += g.length + 2; } else {
        const id = /^[A-Za-z_$][\w$]*/.exec(code.slice(j));
        if (!id) break;
        declared.add(id[0]); j += id[0].length;
      }
      let depth = 0, k = j;
      for (; k < code.length; k++) {
        const ch = code[k];
        if ("([{".includes(ch)) depth++;
        else if (")]}".includes(ch)) { if (!depth) break; depth--; } else if (!depth && (ch === ";" || ch === "\n" && !/[=,+\-*/&|?:(]\s*$/.test(code.slice(m.index, k).trimEnd().slice(-1)) && /^\s*[A-Za-z_$}]/.test(code.slice(k + 1)) && !/^\s*(?:\?|:|\.|\|\||&&|\+|-|\*|\/|,)/.test(code.slice(k + 1)))) break;
        else if (!depth && ch === ",") { j = k + 1; while (/\s/.test(code[j])) j++; break; }
      }
      if (k >= code.length || code[k] !== "," ) break;
    }
  }
  for (const m of code.matchAll(/\bcatch\s*\(([^)]*)\)/g)) addAll(m[1]);
  for (const m of code.matchAll(/\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*=>/g)) addAll(m[1]);
  for (const m of code.matchAll(/(?<![\w$.)\]])([A-Za-z_$][\w$]*)\s*=>/g)) declared.add(m[1]);
  for (const m of code.matchAll(/\bfor\s*\(\s*(?:const|let|var)\s+([^;)]*?)\s+(?:of|in)\b/g)) addAll(m[1]);
  const free = new Set();
  for (const m of code.matchAll(ID)) {
    const name = m[0], before = code.slice(0, m.index).trimEnd(), after = code.slice(m.index + name.length);
    if (KEYWORDS.has(name) || BUILTINS.has(name) || declared.has(name)) continue;
    if (before.endsWith(".") && !before.endsWith("...")) continue;
    if (/^\s*:/.test(after) && /[{,]$/.test(before) && !/\?\s*[\w$.()\]]*$/.test(before)) continue;
    if (/^\s*\(/.test(after) && /[{,]\s*$/.test(before) === false && /^\s*\([^)]*\)\s*\{/.test(after)) continue;
    free.add(name);
  }
  return [...free].sort();
}
