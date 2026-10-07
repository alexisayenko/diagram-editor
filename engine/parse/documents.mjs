import { fail } from "../lib/util.mjs";

export function parseDocuments(src) {
  const docs = [];
  src.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line || /^# \S/.test(line)) return;
    const m = line.match(/^[-*]\s+\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)(?:\s+[—–-]\s+(\S.*))?$/);
    if (!m) fail(`documents.md:${i + 1}: expected "- [title](http(s)://url)" optionally followed by " — description", got: ${line}`);
    docs.push({ title: m[1].trim(), url: m[2], desc: m[3] ? m[3].trim() : "" });
  });
  if (!docs.length) fail("documents.md: no links");
  return docs;
}
