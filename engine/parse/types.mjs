import { fail } from "../lib/util.mjs";

const TYPES = {
  web: { label: "Web Server", dark: "#F28FB0" },
  application: { label: "Application Server", dark: "#7DB6F2" },
  interface: { label: "Internal Interface Server", dark: "#4DD0E1" },
  external: { label: "External Interface Server", dark: "#C39BE8" },
  cache: { label: "Cache Server", dark: "#E6D36A" },
  oracle: { label: "Oracle Database Server", dark: "#F2B24C" },
  mongo: { label: "Mongo Database Server", dark: "#6FD3A0" },
  nas: { label: "NAS", dark: "#B0BEC5", infra: true },
  statistics: { label: "Statistics Server", dark: "#D7B8A8", infra: true },
};
for (const t of Object.values(TYPES)) t.tag = t.label.toUpperCase();
const MODS = new Set(["proposed"]);

export function resolveTypes({ clusters, nodes, classDefs, classes }, layout, proposedLabel) {
  const typeColors = {};
  for (const [name, def] of classDefs) {
    if (MODS.has(name)) continue;
    if (!TYPES[name]) fail(`classDef "${name}" is neither a known server type (${Object.keys(TYPES).join(", ")}) nor a modifier (${[...MODS].join(", ")})`);
    const m = def.match(/stroke:(#[0-9A-Fa-f]{6})/);
    if (!m) fail(`classDef "${name}" has no stroke:#rrggbb colour`);
    typeColors[name] = m[1];
  }

  const ent = {};
  const typeProblems = [];
  const addEnt = (key, id, base) => {
    const cls = classes.get(id) || [];
    const tys = cls.filter((c) => TYPES[c]);
    const mods = cls.filter((c) => MODS.has(c));
    const unknown = cls.filter((c) => !TYPES[c] && !MODS.has(c));
    if (unknown.length) typeProblems.push(`${key}: unknown class ${unknown.join(", ")}`);
    if (tys.length !== 1) typeProblems.push(`${key}: needs exactly one server type class (${Object.keys(TYPES).join("/")}), has ${tys.length ? tys.join(",") : "none"}`);
    const ty = tys[0];
    if (ty && !typeColors[ty]) typeProblems.push(`${key}: server type "${ty}" has no classDef in diagram.mmd`);
    const prop = mods.includes("proposed");
    ent[key] = { ...base, ty, prop, tk: prop ? "proposed" : ty, tag: ty ? TYPES[ty].tag + (prop ? " · PROPOSED" : "") : "" };
  };
  for (const c of clusters.values()) addEnt("c:" + c.id, c.id, { title: c.title, cl: null, db: false });
  for (const n of nodes.values()) if (!layout.nodes[n.id].hidden) addEnt("n:" + n.id, n.id, { title: n.title, cl: n.cluster, db: n.db, body: n.body, ip: n.ip });
  if (typeProblems.length) fail("\n  " + typeProblems.join("\n  "));

  const used = new Set(Object.values(ent).map((e) => e.tk));
  const firstProposed = Object.values(ent).find((e) => e.prop);
  const typeList = [
    ...Object.keys(TYPES).filter((k) => used.has(k) && !TYPES[k].infra).map((k) => ({ k, label: TYPES[k].label, ty: k })),
    ...(firstProposed ? [{ k: "proposed", label: proposedLabel, ty: firstProposed.ty, dash: true }] : []),
    ...Object.keys(TYPES).filter((k) => used.has(k) && TYPES[k].infra).map((k) => ({ k, label: TYPES[k].label, ty: k, infra: true })),
  ];
  const colored = Object.keys(TYPES).filter((k) => typeColors[k]);
  const typeCss =
    colored.map((k) => `[data-ty="${k}"]{--tc:var(--t-${k})}`).join("\n") +
    "\n:root{" + colored.map((k) => `--t-${k}:${typeColors[k]}`).join(";") + "}\n" +
    ':root[data-style="dark"]{' + colored.map((k) => `--t-${k}:${TYPES[k].dark}`).join(";") + "}\n";
  return { ent, typeList, typeCss, typeColors };
}
