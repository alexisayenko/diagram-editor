import { fail, unq } from "../lib/util.mjs";

const IP = /^(\d{1,3}(?:\.\d{1,3}){3}\/\d+)/;
const FW = /\s*·\s*firewall$/;
const ENT = { quot: '"', amp: "&", lt: "<", gt: ">" };
// Mermaid entity codes (#quot;, #35;) become plain characters in the view and details.
const decode = (s) => s.replace(/#(\w+);/g, (m, c) => (/^\d+$/.test(c) ? String.fromCharCode(+c) : ENT[c] ?? m));

export const edgeKey = (e) => `${e.from}>${e.to}`;

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
    let m;
    if ((m = line.match(/^subgraph\s+(\w+)\["(.*)"\]$/))) {
      clusters.set(m[1], { id: m[1], title: decode(m[2]) });
      current = m[1];
    } else if (line === "end") {
      current = null;
    } else if ((m = line.match(/^linkStyle\s+([\d,]+)\s+(.*)$/))) {
      for (const n of m[1].split(",")) linkStyles.set(+n, m[2]);
    } else if ((m = line.match(/^classDef\s+(\w+)\s+(.*)$/))) {
      classDefs.set(m[1], m[2]);
    } else if ((m = line.match(/^class\s+([\w,]+)\s+(\w+)$/))) {
      for (const id of m[1].split(",")) (classes.get(id) || classes.set(id, []).get(id)).push(m[2]);
    } else if (line.startsWith("style ")) {
      return;
    } else if ((m = line.match(/^(\w+)\s+(-->|-\.->)(?:\|(.*?)\|)?\s*(\w+)$/))) {
      const label = m[3] ? decode(unq(m[3])) : "";
      edges.push({ from: m[1], to: m[4], label: label.replace(FW, ""), fw: FW.test(label), dashed: m[2] === "-.->" });
    } else if ((m = line.match(/^(\w+)(\[\(|\[)"(.*)"(\)\]|\])$/))) {
      const parts = m[3].split(/<br\s*\/?>/).map(decode);
      const title = parts.shift();
      const body = [];
      const ip = [];
      for (const p of parts) {
        const mm = p.match(IP);
        if (mm) ip.push(mm[1]);
        else if (ip.length) fail(`diagram.mmd:${i + 1}: text line "${p}" after IP lines in node ${m[1]}`);
        else body.push(p);
      }
      nodes.set(m[1], { id: m[1], db: m[2] === "[(", title, body, ip, cluster: current });
    } else {
      fail(`diagram.mmd:${i + 1}: unsupported syntax: ${line}`);
    }
  });
  return { clusters, nodes, edges, linkStyles, classDefs, classes };
}

export const isDashed = (model, ei) => /stroke-dasharray/.test(model.linkStyles.get(ei) || "");
export const endKey = (model, id) => (model.nodes.has(id) ? "n:" : "c:") + id;
