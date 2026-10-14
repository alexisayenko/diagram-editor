# Performance

Measurements for [AR-06 and AR-13](refactoring-recommendations.md) and
decision D6 ("benchmark first"). Measurement only: no product code was
changed. Synthetic data only.

## Verdict

The numbers justify work, but not the work D6 had in mind. The page
shell plus scene swap is justified for the browser (the iframe reload
costs about 3 times the render), and the first thing to fix is routing,
which was not on the list: it is more than 95 % of the Node-side cost
and grows by about 5x per doubling of the servers. At 100 servers
everything is fine (0.3 s). At 200 it is 1.4 s, at 400 it is 7 s in Node
and 24 to 30 s in the browser per edit. The reviewers' 421 ms at 407
servers does not reproduce with 1.5 connections per server.

## Method

- `node tools/bench.mjs [--sizes 50,100,200,400] [--runs 5] [--out f.json]`
  (WSL, Node 22). It generates synthetic TOML folders in a temp dir
  (regions of about 12 servers, 1.5 connections per server of which a
  third stay inside a region, 3 /24 and 12 /26 networks, 5 notes, RFC
  5737 addresses), warms up once, then times 5 runs per size with
  `performance.now()` and reports the median and p95.
- Stages replicate `prepareDiagram` and `renderModel`: parse (one
  `tomlModel` pass), networks (IP scan plus derive), model (config and
  connection check), layout (restore, auto-layout, fit), route
  (`kit.route`), deriveNetworks, render (`renderSvg`), pipeline (the
  whole `renderModel`, which includes route).
- The edit path replicates what the page does after a server edit
  (`edits.mjs`, `applyServer`): `setServer` on the file, then
  `renderDiagram` with the previous layout and `refit = [id]`. The
  `srcdoc` of the frame is the generated page, so its size is the page
  size.
- Browser side: `diagram.html` on `localhost:8090`, a 400-server
  `.diag.zip` written with `lib/diagrams.mjs` (`packDiagram`, the
  repo's archive writer), opened through the page's own `importArchive`
  with a `File` built in JS, timings with `performance.now()` in the
  page, the edit through `edits.serverEditor.apply` (the host bridge).
  Nothing was saved.
- `engine/test/perf.test.mjs` holds loose guards on the same generator.

## Results (Node, this machine, ms, median of 5)

| Servers | Connections | parse | networks | layout | route | render (svg) | pipeline | edit (median / p95) | page | data JSON |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 50 | 75 | 1.9 | 2.0 | 0.3 | 70 | 1.6 | 65 | 80 / 109 | 330 KB | 59 KB |
| 100 | 150 | 2.7 | 2.6 | 0.8 | 272 | 3.9 | 277 | 318 / 361 | 503 KB | 116 KB |
| 200 | 300 | 5.3 | 6.6 | 1.7 | 1396 | 4.9 | 1438 | 1266 / 1353 | 841 KB | 231 KB |
| 400 | 600 | 11.4 | 12.4 | 4.3 | 6234 | 10.1 | 7173 | 7305 / 9184 | 1.53 MB | 462 KB |

Model validation and `deriveNetworks` stay under 2 ms. The edit costs
the pipeline plus under 8 ms of `setServer`. The page grows linearly
(about 3.2 KB per server on top of about 170 KB of fixed runtime and
CSS).

Scaling: 4x the servers cost 26x the time (100 to 400), so routing is
close to O(n^2.3): 50 to 100 is 3.9x, 100 to 200 is 5.1x, 200 to 400
is 4.5x.

## Results (browser, 400 servers, 600 connections)

| Measure | Value |
| --- | --- |
| Synchronous render (`renderDiagram`) in the page | 6.0 to 6.2 s |
| Open archive to frame ready | 24.1 s (render 6.2 s, iframe load and init about 18 s) |
| One server edit, call to frame ready | 29.6 s (render 6.9 s, iframe reload about 22.7 s) |
| `srcdoc` size | 1.57 MB (1,566,883 characters) |
| Elements in the frame | 13,148 |
| Zoom and pan after a rebuild | lost (viewBox back to the full view) |
| Selection after a rebuild | only the edited server is re-selected; another selected server is lost |
| Edit mode after a rebuild | kept (`session.after.edit`) |

The page is blocked for the whole edit: about 7 s of main-thread render,
then the frame is dead for about 20 s while it parses 1.5 MB and builds
13 k elements.

## Profile at 400 servers

`node --cpu-prof tools/bench.mjs --sizes 400 --runs 1`, self time of one
warm-up, one measured pass and one edit (about 30 s total; the 3 % in
`writeFileUtf8` is the benchmark writing its folder).

| # | Self time | Share | Function (`engine/render/geometry.mjs`) |
| ---: | ---: | ---: | --- |
| 1 | 8.1 s | 27.3 % | `search` (A* over grid point and heading) |
| 2 | 6.3 s | 21.0 % | `placeLabel` callback, line 418 (label candidates against all obstacles) |
| 3 | 2.2 s | 7.5 % | `grid` (builds the routing grid) |
| 4 | 1.8 s | 5.9 % | `hit` (point against obstacles, linear scan) |
| 5 | 1.6 s | 5.4 % | `expand` |
| 6 | 1.6 s | 5.2 % | `overlap` |
| 7 | 1.2 s | 4.2 % | `placeLabel` |
| 8 | 1.0 s | 3.4 % | garbage collector |
| 9 | 0.9 s | 3.0 % | `step` |
| 10 | 0.8 s | 2.6 % | `searchBuffers` |

Routing and label placement account for more than 85 % of all self
time; parsing, SVG building and page assembly are in the noise.

## The three biggest costs

1. Connection routing and label placement (`kit.route`): 6.2 s of the
   7.2 s pipeline at 400 servers, roughly O(n^2.3). Every edit
   re-routes every connection from scratch.
2. The iframe reload: about 18 to 23 s in the browser for a 1.5 MB
   `srcdoc`, 13 k elements and the full runtime init; it is also what
   discards zoom, pan and selection.
3. Rebuilding everything per edit: one server edit regenerates and
   re-sends the whole page (1.57 MB, about 170 KB of it identical
   runtime and CSS) although only one card and its connections change.

## Recommendation ladder

Order by gain per effort. Gains are for a 400-server edit.

| Step | Expected gain | Effort | Notes |
| --- | --- | --- | --- |
| 1. Cheap routing wins: spatial index for `hit`, `overlap` and label candidates (grid buckets instead of linear scans), reuse the grid and typed arrays across connections | 2x to 4x on `route` (7 s to about 2 s) | S-M | No behaviour change; the geometry tests and `--check` outputs protect it. |
| 2. Cache routes by connection: key = both endpoint boxes plus the obstacles in their corridor; a text-only edit (name, role, services) changes no box and reuses every route | edit 7 s to under 0.5 s for text edits | M | Safe only with a correct key; keep a full re-route for moves, adds and deletes. |
| 3. Incremental routing: on a move or add, re-route only the connections touching the changed boxes and those whose path crosses their old or new area | edit 7 s to 0.3 to 1 s for moves | L | Needs stable ordering so results do not depend on the edit history (otherwise saved layouts drift). |
| 4. Page shell plus scene swap: keep the iframe and its runtime, send only the new scene (svg body, data JSON, panels) and swap it in; keep zoom, pan and selection in the shell | removes the 18 to 23 s reload and the lost view state | L | This is the real fix for AR-06 and AR-13 (the 170 KB runtime stops being re-sent). The runtime needs a `replaceScene` entry and an idempotent init. |
| 5. Debounce: coalesce edits (about 300 ms) and render once; show "updating" while a render is pending | removes repeated full renders during typing in the form; no gain for one edit | S | Do it with step 4 or earlier; it is also correct today. |

What not to do:

- Do not start with the scene swap alone: the 6 to 7 s synchronous
  render still blocks the page, so the edit would still take about 7 s.
- Do not move the render to a Worker first: it hides the 7 s without
  removing it, and the engine modules would need a second bundle.
- Do not cache the whole page HTML by file text: every edit changes a
  file, so the hit rate is zero.
- Do not add a virtual DOM, a framework or a dependency for this; the
  cost is geometry, not DOM diffing.
- Do not lower the routing grid resolution or drop label avoidance to
  gain speed: it changes every saved diagram's look.
- Do not rewrite the router (A* is fine): the cost is the per-edge
  linear obstacle scans and the lack of reuse.

## Do the numbers justify the big change (D6)?

Partly. D6 said to refactor "only if 150 servers feels slow" (reviewers
measured about 200 ms at 157 servers). At 150 servers the measured
pipeline is 0.3 to 0.9 s, which is noticeable but not slow; at 200 it is
1.4 s and at 400 it is 7 s in Node and about 30 s in the browser. So:

- Scene swap (AR-06, AR-13) is justified when diagrams of 200 or more
  servers are a real target. The iframe reload dominates there (about
  20 s per edit) and it also loses zoom and selection at any size.
- It is not justified as the first step. Do the routing steps 1 and 2
  first: they are smaller, they speed up every path (build, export,
  first open, every edit) and the scene swap alone cannot go below the
  render time.
- Under about 100 servers (0.3 s per edit) nothing here is urgent.

Guards: `engine/test/perf.test.mjs` fails on a gross regression only
(200 servers over 20 s or 1.5 MB, a 400/100 ratio over 80x). The target
after steps 1 to 3 is a ratio under 6x; tighten the guard when it is
reached.

## Limits of these numbers

- One machine, one run of the benchmark; use the relative numbers.
- The synthetic graph mixes in-region and cross-region connections;
  real diagrams may route cheaper or dearer.
- The iframe split (render 6 s, load about 18 s) is a difference of two
  timings, not a browser profile; the runtime init was not profiled.
- Fonts load from the network in the frame; the browser run had them
  available or blocked by the CSP and was not isolated from that.
