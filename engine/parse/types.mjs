import { fail } from "../lib/util.mjs";

const BUILT_IN = {
  web: { label: "Web Server", color: "#C2185B", dark: "#F28FB0" },
  application: { label: "Application Server", color: "#1565C0", dark: "#7DB6F2" },
  interface: { label: "Internal Interface Server", color: "#00838F", dark: "#4DD0E1" },
  external: { label: "External Interface Server", color: "#7E57C2", dark: "#C39BE8" },
  cache: { label: "Cache Server", color: "#B8860B", dark: "#E6D36A" },
  oracle: { label: "Oracle Database Server", color: "#E65100", dark: "#F2B24C", db: true },
  mongo: { label: "Mongo Database Server", color: "#2E7D32", dark: "#6FD3A0", db: true },
  nas: { label: "NAS", color: "#546E7A", dark: "#B0BEC5", infra: true },
  statistics: { label: "Statistics Server", color: "#6D4C41", dark: "#D7B8A8", infra: true },
};
const MODS = new Set(["proposed"]);
export const RESERVED_TYPES = [...MODS];

// Built-in types plus the file's [[server_types]]: an entry adds a type or overrides fields of a built-in with the same id.
export function mergeTypes(custom = []) {
  const out = {};
  for (const [k, t] of Object.entries(BUILT_IN)) out[k] = { ...t };
  for (const c of custom) {
    const { id, ...fields } = c, prev = out[id] || {};
    out[id] = { ...prev, ...fields };
    if (!out[id].dark) out[id].dark = out[id].color;
  }
  for (const t of Object.values(out)) t.tag = (t.label || "").toUpperCase();
  return out;
}

export function resolveTypes({ clusters, nodes, classDefs, classes, types }, layout, proposedLabel) {
  const TYPES = mergeTypes(types);
  const typeColors = {};
  for (const [name, def] of classDefs) {
    if (MODS.has(name)) continue;
    if (!TYPES[name]) fail(`classDef "${name}" is neither a known server type (${Object.keys(TYPES).join(", ")}) nor a modifier (${[...MODS].join(", ")})`);
    const m = def.match(/stroke:(#[0-9A-Fa-f]{6})/);
    if (!m) fail(`classDef "${name}" has no stroke:#rrggbb colour`);
    typeColors[name] = m[1];
  }

  if (types) for (const k of Object.keys(TYPES)) typeColors[k] ||= TYPES[k].color;
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
