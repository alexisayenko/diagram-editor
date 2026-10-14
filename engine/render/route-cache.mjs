// Connection routes with a reusable result: routing is a pure function of the box geometry, the connections and the saved
// waypoints / labels, so an edit that changes none of them (a role, a note, the details text) reuses the previous routes.
// The cache is a plain value ({ sig, routes }) that the caller keeps between renders; nothing here holds state.
// Everything is read in the order of `meta`, so the key order of the layout objects does not matter.
export function routeSignature(layout, meta, measured = null) {
  const nodes = Object.keys(meta.nodes).map((id) => [id, meta.nodes[id].tl, meta.nodes[id].cl, layout.nodes[id] ?? null]);
  const clusters = Object.keys(meta.clusters).map((id) => [id, meta.clusters[id].tl, layout.clusters[id] ?? null]);
  const edges = meta.edges.map((e) => [e, layout.edges?.[e.k]?.via ?? null, layout.edges?.[e.k]?.label ?? null]);
  return JSON.stringify([nodes, clusters, edges, measured]);
}

// previous: the cache an earlier call returned, or null. Returns { routes, cache, reused }.
export function routeAll(kit, layout, meta, previous = null, measured = null) {
  const sig = routeSignature(layout, meta, measured);
  if (previous?.sig === sig) return { routes: previous.routes, cache: previous, reused: true };
  const routes = measured ? kit.route(layout, meta, measured) : kit.route(layout, meta);
  return { routes, cache: { sig, routes }, reused: false };
}
