// Entity and tag keys: "<prefix>:<id>" strings used in saved layouts, data attributes, the page data and the runtime.
// The serialized forms are fixed (engine/test/keys.test.mjs): n server, c region, e connection, g connection group, lv connection level.
// Written as a kit so the page gets the same functions as the runtime module "ui/keys" (see engine/page/kits.mjs).
export function keysKit() {
  var PREFIX = { server: "n", region: "c", edge: "e", group: "g", level: "lv" };
  var KIND = {};
  Object.keys(PREFIX).forEach(function (k) { KIND[PREFIX[k]] = k; });

  function nodeKey(kind, id) {
    if (!Object.hasOwn(PREFIX, kind)) throw new Error("Unknown key kind: " + kind);
    return PREFIX[kind] + ":" + id;
  }

  // { kind, id } of a key; kind is null for a string that is not a key of a known kind (id: the whole string).
  function parseKey(key) {
    var at = String(key).indexOf(":"), prefix = at < 0 ? "" : key.slice(0, at);
    if (!Object.hasOwn(KIND, prefix)) return { kind: null, id: key };
    return { kind: KIND[prefix], id: key.slice(at + 1) };
  }

  function isKind(key, kind) { return parseKey(key).kind === kind; }

  return { nodeKey: nodeKey, parseKey: parseKey, isKind: isKind };
}

const keys = keysKit();
export const nodeKey = keys.nodeKey;
export const parseKey = keys.parseKey;
export const isKind = keys.isKind;
