# ADR-0020: Incremental routing

Status: Accepted · 2026-10-15

## Context

After the router speed-up (ADR-0013 step 1) and the scene swap
([ADR-0019](adr-0019-page-shell-and-scene-swap.md)) an edit that changes
a box still routed every connection again, on the host (`renderDiagram`)
and in the frame (`canvas/model`, about 1.1 s at 400 servers), and so did
every drag step in edit mode ([performance.md](../performance.md), AR-13
step 3). The saved layouts and the golden fixtures pin the routes to the
output of the old router, so the new work had to give exactly the routes
a full re-route gives.

## Decision

- `geometryKit().routeWith(layout, meta, measured, prev)` returns
  `{ routes, state }`; `route` is `routeWith` without a previous state.
  `state` is a plain value (`{ v: 1, G, G2, edges, order, hardR, softR,
  stats }`) that the caller keeps and passes to the next call: the
  pipeline in `routeCache.state` (`render/route-cache.mjs`), the frame in
  `canvas/model`. A state of another version or none means a full run.
- Every search records its **window**: the box of grid points it touched
  (popped states, one point around them, and the start and goal lookups).
  The next run builds the new grid anyway, diffs it with the old one (line
  maps, and a summed-area table of the points whose flags changed) and
  reuses a result when the window holds the same lines in the same order
  with no line between them and the same flags, and the search inputs (end
  rectangles, home regions, waypoints, port points) are equal. The windows
  are carried over in the index space of the new grid.
- Two passes, both reused this way: pass 1 (free sides, grid `G`) and pass 2
  (fixed ports, grid `G2`). The ports are always recomputed (no search).
- Firewall markers and labels are reused when the route is unchanged and no
  rectangle that changed touches the area their candidates were scored in:
  the changed rectangles are the servers, region titles and region borders
  that differ between the two runs (old and new rectangle), the markers and
  labels of removed edges, and, in placement order, every marker or label
  that came out different from before (its old and its new box). If the
  unchanged boxes changed their order, or the edges did, all are placed
  again.
- When in doubt the result is computed again; nothing here compares by
  similarity.

## Why a window and not a rectangle

The routes are not independent of far away boxes: the grid lines span the
whole plane (every box border, port and stub adds a line), a new line
inside the area a search explores adds states, and the router breaks ties
by the layout of the open-set heap, so one extra push anywhere in the
search can change which of several equal-cost paths is chosen. A rule
"re-route the connections whose route or bounding box meets the changed
box" therefore gives routes that differ from a full re-route in rare
cases. The window rule is exact for the router as it is. Its price is that
a box edit invalidates every connection whose window spans one of the
changed grid lines, about 30 % of the connections for a height change and
more for a move or a new server (measured in
[performance.md](../performance.md)); a text edit that keeps the box
reuses everything.

## Consequences

- The search (`search` in `render/geometry.mjs`) is one function without
  per-step calls; the heap operations, costs and tie-breaking are the same
  (golden routes unchanged, the router is 1.25 to 1.3 times faster).
- `route-incremental.test.mjs` proves equality: seeded random edit
  sequences (move, resize, region move and resize, rename, services, add
  and delete server, add, remove and swap connections, region change,
  waypoints, fixed labels, measured widths) on generated diagrams of 20, 60
  and 150 servers, each step routed from the state of the previous step and
  compared with a full route, and compared with a hash of every search
  (`trace`) so that a reused search is the search a new run would do.
  Dropping the rectangle check, the flag check, the line-split check, the
  home regions from the key or the order check makes it fail.
- The state keeps two grids' flags and the per-edge records: a few MB at
  400 servers.

## Alternatives

- Invalidate by the rectangle of the changed boxes against the route
  bounding boxes: faster, not exact (above).
- Resume a search from a snapshot: the same window test would be needed
  and a snapshot of a search is megabytes.
