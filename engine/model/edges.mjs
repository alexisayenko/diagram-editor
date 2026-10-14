import { nodeKey } from "../lib/keys.mjs";
export const edgeKey = (e) => `${e.from}>${e.to}`;
export const isDashed = (model, ei) => /stroke-dasharray/.test(model.edgeStyles.get(ei) || "");
export const endKey = (model, id) => nodeKey(model.nodes.has(id) ? "server" : "region", id);
