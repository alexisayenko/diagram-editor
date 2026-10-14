export const edgeKey = (e) => `${e.from}>${e.to}`;
export const isDashed = (model, ei) => /stroke-dasharray/.test(model.linkStyles.get(ei) || "");
export const endKey = (model, id) => (model.nodes.has(id) ? "n:" : "c:") + id;
