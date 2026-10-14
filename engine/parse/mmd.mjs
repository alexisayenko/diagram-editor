import { fail, unq } from "../lib/util.mjs";

const IP = /^(\d{1,3}(?:\.\d{1,3}){3}\/\d+)/;
const FW = /·\s*firewall$/;
const ENT = { quot: '"', amp: "&", lt: "<", gt: ">" };
// Mermaid entity codes (#quot;, #35;) become plain characters in the view and details.
const decode = (s) => s.replace(/#(\w+);/g, (m, c) => (/^\d+$/.test(c) ? String.fromCodePoint(+c) : ENT[c] ?? m));

export const edgeKey = (e) => `${e.from}>${e.to}`;

function nodeEntry(line, lineNo, cluster) {
  const m = /^(\w+)(\[\(|\[)"(.*)"(\)\]|\])$/.exec(line);
  if (!m) fail(`diagram.mmd:${lineNo}: unsupported syntax: ${line}`);
  const parts = m[3].split(/<br\s*\/?>/).map(decode);
  const title = parts.shift();
  const body = [];
  const ip = [];
  for (const p of parts) {
    const mm = IP.exec(p);
    if (mm) ip.push(mm[1]);
    else if (ip.length) fail(`diagram.mmd:${lineNo}: text line "${p}" after IP lines in node ${m[1]}`);
    else body.push(p);
  }
  return [m[1], { id: m[1], db: m[2] === "[(", title, body, ip, cluster }];
}

export function parseMmd(src) {
  const clusters = new Map();
  const nodes = new Map();
  const edges = [];
  const linkStyles = new Map();
  const classDefs = new Map();
  const classes = new Map();
  let current = null;
  src.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("%%") || line.startsWith("flowchart") || line.startsWith("direction")) return;
    let m = /^subgraph\s+(\w+)\["(.*)"\]$/.exec(line);
    if (m) {
      clusters.set(m[1], { id: m[1], title: decode(m[2]) });
      current = m[1];
      return;
    }
    if (line === "end") {
      current = null;
      return;
    }
    m = /^linkStyle\s+([\d,]+)\s+(\S.*)$/.exec(line);
    if (m) {
      for (const n of m[1].split(",")) linkStyles.set(+n, m[2]);
      return;
    }
    m = /^classDef\s+(\w+)\s+(\S.*)$/.exec(line);
    if (m) {
      classDefs.set(m[1], m[2]);
      return;
    }
    m = /^class\s+([\w,]+)\s+(\w+)$/.exec(line);
    if (m) {
      for (const id of m[1].split(",")) (classes.get(id) || classes.set(id, []).get(id)).push(m[2]);
      return;
    }
    if (line.startsWith("style ")) return;
    m = /^(\w+)\s+(-->|-\.->)(?:\|(.*?)\|)?\s*(\w+)$/.exec(line);
    if (m) {
      const label = m[3] ? decode(unq(m[3])) : "";
      const fw = FW.exec(label);
      edges.push({ from: m[1], to: m[4], label: fw ? label.slice(0, fw.index).trimEnd() : label, fw: !!fw, dashed: m[2] === "-.->" });
      return;
    }
    nodes.set(...nodeEntry(line, i + 1, current));
  });
  return { clusters, nodes, edges, linkStyles, classDefs, classes };
}

export const isDashed = (model, ei) => /stroke-dasharray/.test(model.linkStyles.get(ei) || "");
export const endKey = (model, id) => (model.nodes.has(id) ? "n:" : "c:") + id;
