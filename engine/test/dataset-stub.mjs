const attrName = (k) => "data-" + k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());

export function datasetOf(attrs) {
  const map = attrs instanceof Map;
  const has = (n) => (map ? attrs.has(n) : Object.hasOwn(attrs, n));
  const read = (n) => (map ? attrs.get(n) : attrs[n]);
  const write = (n, v) => { if (map) attrs.set(n, v); else attrs[n] = v; };
  const drop = (n) => { if (map) attrs.delete(n); else delete attrs[n]; };
  const names = () => [...(map ? attrs.keys() : Object.keys(attrs))].filter((n) => n.startsWith("data-"));
  const camel = (n) => n.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return new Proxy({}, {
    get: (_, k) => (typeof k === "string" && has(attrName(k)) ? read(attrName(k)) : undefined),
    set: (_, k, v) => { write(attrName(k), String(v)); return true; },
    deleteProperty: (_, k) => { drop(attrName(k)); return true; },
    has: (_, k) => typeof k === "string" && has(attrName(k)),
    ownKeys: () => names().map(camel),
    getOwnPropertyDescriptor: (_, k) => (typeof k === "string" && has(attrName(k)) ? { value: read(attrName(k)), enumerable: true, configurable: true, writable: true } : undefined),
  });
}

export function dataEl(data = {}) {
  const attrs = {};
  const el = {
    attrs,
    dataset: datasetOf(attrs),
    getAttribute: (k) => (Object.hasOwn(attrs, k) ? attrs[k] : null),
    setAttribute: (k, v) => { attrs[k] = String(v); },
    removeAttribute: (k) => { delete attrs[k]; },
    hasAttribute: (k) => Object.hasOwn(attrs, k),
  };
  Object.entries(data).forEach(([k, v]) => { if (v !== undefined) el.dataset[k] = v; });
  return el;
}
