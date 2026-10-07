export function buildDataJson({ config, model, layout, meta, idx, ent, typeList, sections, notes, nets, ipNet, edgeKeyRows, drawings = [] }) {
  const kids = {};
  for (const n of model.nodes.values()) if (n.cluster) (kids[n.cluster] ||= []).push(n.id);
  const ends = meta.edges.map(({ k, from, to }) => ({ k, from, to }));
  const levels = meta.edges.some((e) => e.lv === "process") ? [{ k: "lv:server", label: "Server connections" }, { k: "lv:process", label: "Process connections" }] : [];
  const edgeSwitches = [...levels, ...Object.entries(config.groups).map(([g, d]) => ({ k: "g:" + g, g, label: d.label }))];
  const data = { id: config.id, legacyId: config.legacyId, layout, meta, idx, kids, edges: ends, edgeSwitches, ent, types: typeList, sections, notes: notes.map(({ title, date, paras, text }) => ({ title, date, paras, text })), edgeKey: edgeKeyRows, drawings };
  if (nets) Object.assign(data, { nets: nets.map(({ cidr, name, m }) => ({ cidr, name, m })), ipNet });
  return JSON.stringify(data).replace(/</g, String.fromCharCode(92) + "u003c");
}
