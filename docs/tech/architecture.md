# Architecture and engine reference

## TOML workflow

Run `node engine/serve.mjs`, open its address → the most recently saved stored diagram opens, or **Import TOML/JSON** (TOML and optionally its `<name>.layout.json`) → automatic arrangement → **Edit layout** and/or edit notes → **Save**. Files live in the git-ignored `local/` folder behind the server; geometry is saved as `<name>.layout.json`, edited notes are written back into the TOML; **Export** downloads both with a timestamp. No folder-picker API is used, so it works in Firefox too. Start with `examples/demo/demo.toml`. Format and workflow: [AUTHORING.md](authoring.md).

Regenerate the standalone page: `node engine/browser.mjs` (`--check` checks drift). The server (`node engine/serve.mjs`, `http://127.0.0.1:8080`) binds loopback only and serves the engine page plus the JSON API described in [AUTHORING.md](authoring.md#local-server-api); `diagram.html` opened from disk works in memory only (no Save). Tests: `node --test engine/test/*.test.mjs`.

New modules: `parse/toml.mjs` (authoring subset and model validation), `browser/render.mjs` (shared rendering pipeline and saved-layout reconciliation), `parse/toml-write.mjs` (pure surgical write-back of the top-level `notes` key: `setNotes(src, texts)`, `formatNotes`; round-trip checked against `parseToml` before returning), `lib/names.mjs` (file-name allowlist, layout name, timestamped export names; shared by page and server), `lib/store.mjs` (the `local/` store: list, read, all-or-nothing compare-before-write with temp file + rename, request guards; `handleApi` is network-free and unit-tested), `runtime/ui/notes-edit.js` (Notes panel editor: Add note, click-to-edit, Done / Esc / Ctrl+Enter, Delete; reports dirty state), `browser/app.js` (open, stored list, save, export, dirty-driven Save button), `browser.mjs` (standalone bundle), `serve.mjs` (localhost server, `createApp` exported for tests). `parse/toml.mjs` also parses `[[documents]]` (title, url, description) into the Related documents panel and multi-line strings. `render/auto-layout.mjs` is used by the TOML pipeline.

One shared engine (`engine/`) renders each diagram folder (e.g. `examples/demo/`) into a self-contained `layout.html` (no runtime fetches except web fonts), a Mermaid `index.html` and an Excalidraw scene `<id>.excalidraw`; all are generated, and no diagram needs engine edits. Diagram folders hold content only; see [examples/demo/](../../examples/demo/) for every format. Vocabulary: [TERMINOLOGY.md](../product/concepts/terminology.md).

## Build

- Build: `wsl.exe -e bash -ic 'cd /mnt/c/Alex/diagram-editor && node engine/build.mjs examples/demo'`.
- Drift check: append `--check`; regenerates in memory and exits non-zero if `layout.html`, `index.html` or `<id>.excalidraw` on disk differ.
- Excalidraw: every build writes `<dir>/<id>.excalidraw` (e.g. `examples/demo/demo.excalidraw`); open it at excalidraw.com via "Open" (or drag the file onto the canvas), or in the VS Code Excalidraw extension.
- The diagram path resolves against the current directory, then the repo root. Any parse or validation error fails the build with `build: <file>:<line>: ...`.

## Add a diagram

1. Create `<name>/` with `diagram.json` (at least `title`), `diagram.mmd`, `layout.json`, `details.md`, `notes.md`, `documents.md`, optionally `networks.md`.
2. Run `node engine/build.mjs <name>`; fill `layout.json` until it stops listing ids without geometry, then fine-tune in edit mode.

## Module map

Build (Node, ESM):

- `engine/build.mjs` - CLI: resolves the diagram folder, runs the pipeline, writes or `--check`s outputs.
- `engine/lib/util.mjs` - `fail`, `esc`, `unq`, CRLF-normalising readers.
- `engine/parse/config.mjs` - `diagram.json` validation and defaults (`id` = folder name, `proposedLabel`, `edgeLabels`, `groups`, `processes`); `checkConnections` checks group and process connection ids and body-line prefixes; `processAnchors` resolves process endpoints to body-line indexes.
- `engine/parse/mmd.mjs` - `diagram.mmd` → clusters, nodes, edges, linkStyles, classDefs, classes (Mermaid entity codes such as `#quot;` decoded); `edgeKey` / `endKey` / `isDashed`.
- `engine/parse/layout.mjs` - `layout.json` load + forbidden-key checks.
- `engine/parse/notes.mjs` - `notes.md` parser + validation.
- `engine/parse/documents.mjs` - `documents.md` parser + validation.
- `engine/parse/networks.mjs` - `networks.md` tree parser + validation; `networkMembers` maps servers and regions to networks by IP lines; `ipNetworks` maps each IP in IP lines and `details.md` to its deepest network (for network buttons).
- `engine/parse/details.mjs` - `details.md` → sections by H2; `osOf` reads a section's `| OS |` row.
- `engine/parse/os-eol.mjs` - end-of-support table (Ubuntu, Debian, CentOS, Oracle Linux, Windows Server); `osInfo` flags an OS as EOL against the build date.
- `engine/parse/validate.mjs` - mmd ↔ layout cross-checks (missing ids, line counts, connection keys, firewalls), then normalises geometry in place (body / IP lines at the text padding, box widths, regions grown around their servers) and checks header bands and spacing.
- `engine/parse/types.mjs` - server-type table (labels, dark colours), entity typing, legend type list, type colours and CSS vars.
- `engine/render/svg.mjs` - SVG body elements + the element index (`idx`) the runtime addresses by position; network buttons (`idx.nodes[id].w`, -1 where an IP has no network); connections from the routes, group (`data-g`) and level (`lv:server` / `lv:process` in `data-tk`) markup; process endpoint lines (`.pl`).
- `engine/render/geometry.mjs` - `geometryMeta` (static per-diagram facts, shipped as `D.meta`) and `geometryKit`: drawn box extents, `fitBox` / `fitRegion` auto-sizing, connection routing, connection label and firewall marker placement, spacing `problems`; inlined as the `canvas/geometry` runtime module so build and edit mode compute identical geometry.
- `engine/render/firewall.mjs` - firewall glyph (`fwGlyph`).
- `engine/render/edge-key.mjs` - connection legend rows (HTML panel, export data incl. one row per connection group, `index.html` legend), labels from `edgeLabels`; `groupAssets`: per-group arrowhead markers and `--gc` colour CSS.
- `engine/render/viewbox.mjs` - content bounds (incl. routed connections) → initial `viewBox`.
- `engine/page/layout-html.mjs` - `layout.html` shell: top area (`#ta`), SVG, Legend / Networks / Notes / Related documents / details panel markup.
- `engine/page/data.mjs` - the `layout-data` JSON blob for the runtime (incl. `meta` and the Legend's connection switches `edgeSwitches`).
- `engine/page/index-html.mjs` - `index.html` template: Mermaid block from `diagram.mmd`, side notes from `notes.md`, edge legend, details from `details.md`.
- `engine/export/excalidraw.mjs` - Excalidraw scene from the computed geometry: regions (bound title), servers (one group each: box, title, body / IP / OS text), connections as arrows bound to their boxes, labels as free text on a white pill at the view's label spot (moved or wrapped onto two lines when it would touch a firewall, server or other label), firewall zigzags, a legend block left and notes as sticky rectangles right; ids and seeds are hashes of entity keys, so re-exports diff cleanly. `STYLE`: `"sketch"` (default) is the monochrome whiteboard look of the Sketch skin (no fills, dashed regions, title above the box, red only for connection groups and firewalls, pale yellow notes, legend with line styles only); `"clean"` gives coloured cards with header strips, EOL OS in amber and a server-type legend. Font: `SANS` / `MONO` (default 5 Excalifont, hand-drawn; 2 Helvetica, 3 Cascadia for a clean look).
- `engine/page/assets.mjs` - CSS manifest (order = cascade) and the runtime module manifest, checker and inlining.

Runtime (browser, inlined as one `<script>`): `engine/runtime/define.js` creates `window.InfraDiagram` with `define(name, deps, factory)`; every other file is exactly one `InfraDiagram.define("<folder>/<file>", [deps], function (<params>) { ... return { exports }; });`, and its exports land in `InfraDiagram.modules[name]`. Rules the build enforces (`build: engine/runtime/...: ...`): the name matches the path; each dependency is a module listed earlier in `RUNTIME` (assets.mjs); its parameter is the camel-cased file name (`ui/export-columns` → `exportColumns`); every `param.x` used is exported by that module; no unused or undeclared module references; no `</script`. Each file stays valid standalone (`node --check`).

- `engine/runtime/ui/core.js` - shared state (`ctx` incl. the current `routes`, `D`, `svg`, `els`, `ents`, canvas `hooks` incl. `route`), localStorage keys `<id>-<name>` (migrating `<legacyId>-<name>` on first read), clipboard / download helpers.
- `engine/runtime/ui/skins.js` - skin switch and per-skin server chrome (header, icon, IP pills, label pills, OS pill size and placement, network button placement); `sync` after geometry moves; `widths` / `labelWidths` (measured) for routing; re-routes via `hooks.route` when the chrome is rebuilt.
- `engine/runtime/ui/legend.js` - type switches, "Show all", connection switches (levels and groups), "Connection labels" and "Display OS version" switches.
- `engine/runtime/ui/selection.js` - related-entity graph, dim / select, opens the details panel.
- `engine/runtime/ui/networks.js` - network filter: Networks panel clicks, dims servers outside the active network; `toggleNet` for network buttons (reveals the network in the panel).
- `engine/runtime/ui/panels.js` - collapsible panels; places the left and right columns below the top area and publishes its bottom as `--ta-b`.
- `engine/runtime/ui/export-columns.js` - static legend and notes columns for exports.
- `engine/runtime/ui/copy.js` - click-to-copy + "Copied" hint.
- `engine/runtime/ui/details.js` - mini Markdown renderer + details panel (OS row, EOL badge, Confluence link, network buttons after IPs).
- `engine/runtime/ui/export-image.js` - SVG / PNG export (CSS inlined, fitted view, background, network buttons stripped), file names `<id>-<skin>.svg|png`.
- `engine/runtime/ui/init.js` - `init` (event wiring: skin buttons, export buttons, details close, SVG clicks, network buttons, Esc), `editChanged`, console API on `window.InfraDiagram` (`setStyle`, `toggle`, `showAll`, `select`, `setNet`, `exportSvg`, `md`, `related`, `ctx`).
- `engine/runtime/canvas/geometry` - generated from `render/geometry.mjs` (`geometryKit`).
- `engine/runtime/canvas/model.js` - layout state (`state.st` draft, `state.on` edit mode), geometry moves (children follow, a dragged server grows its region), apply to the DOM (connections re-routed, spacing violations marked `.bad`), screen → SVG `point`.
- `engine/runtime/canvas/zoom-pan.js` - fit, zoom buttons / keys / wheel, pan.
- `engine/runtime/canvas/edit-mode.js` - edit mode: drag + snap (one render per animation frame), drafts, `layout.json` copy / download / reset; boots the page via `ui/init`.

CSS (`css/svg/*` is also embedded in exports):

- `engine/css/svg/tokens.css` - per-skin colour / font tokens (the `/*DARK<*/.../*>DARK*/` block is parsed by `export-image.js`).
- `engine/css/svg/base.css` - base servers, regions, connections.
- `engine/css/svg/export.css` - notes and legend columns in exports.
- `engine/css/svg/edges.css` - connection labels, firewall markers, arrowheads, dim / off states.
- `engine/css/svg/chrome.css` - rules shared by the chrome skins (Clean, Dark, Swiss) vs Sketch.
- `engine/css/svg/clean.css`, `dark.css`, `swiss.css` - one skin each.
- `engine/css/svg/os.css` - OS pills (hidden unless the SVG has `showos`), EOL and unknown states.
- `engine/css/svg/groups.css` - connection group colours (`--gc`: stroke, arrowhead, label pill, process lines) and bold process endpoint lines; per-group colours are appended by the build.
- `engine/css/page/base.css` - page and SVG viewport.
- `engine/css/page/toolbar.css` - top area (opaque buttons), skin switch, zoom group.
- `engine/css/page/interaction.css` - edit mode (red `.bad` outline), select / copy cursors, text selectability, copy hint, network buttons (per skin).
- `engine/css/page/legend.css` - legend switches.
- `engine/css/page/details.css` - details panel (floating card over the right column; bottom sheet below 760px).
- `engine/css/page/panels.css` - panels, left and right columns, networks tree, notes cards, documents list.

## Page behaviour

- **Top area**: skin switch and zoom (left), "SVG" / "PNG" / "Edit layout" (right); buttons are opaque in every skin.
- **Skins**: Sketch | Clean | Dark | Swiss (default Clean; `?style=sketch|dark|swiss`, remembered in localStorage). One SVG, same geometry: the skin is a class on the `<svg>` plus per-skin CSS and the runtime chrome renderer; Sketch has no chrome.
- **Panels**: Legend and Networks in a left column, Notes and Related documents in a right column, all floating over the diagram just below the top area; each collapses via its header (default open, collapsed below 700px; state in localStorage). The right column drops below the left one when the window is too narrow; a column scrolls when taller than the window.
- **Legend**: type switches dim a server type and its connections to 10%; connection switches ("Server connections", "Process connections" when the diagram has processes, one per connection group, e.g. "Job 104 connections" with its colour swatch) dim connections the same way, and a connection shows only while every switch it belongs to is on; "Show all" resets; "Connection labels" (default off) shows connection labels; "Display OS version" (default off) shows OS pills, left-aligned 3px above the first IP pill and hidden where they would touch a body line. EOL is checked at build time, so `--check` can flip when a version crosses its date. All switches are remembered in localStorage.
- **Network filter** (only with `networks.md`): the Networks panel lists the tree with CIDR, name and host count (0 hosts muted); clicking a network dims servers outside it, regions with no member and connections not between two members; one at a time; click it again, Esc, or "Show all" clears; combines with the type switches.
- **Network buttons** (only with `networks.md`): a 14x13 network glyph 2px right of each IP pill (Sketch: of the IP text) whose IP lies in a defined network, and after such IPs in the details panel; it activates the deepest network containing the IP (opens the Networks panel, scrolls to it), and clicking it again clears; no button for IPs outside every network or network addresses. In a box too narrow it slides left over the pill's padding and is hidden if it would cover the IP text. Never exported, hidden in edit mode.
- **Clicks** (not in edit mode): a server header / title, OS pill or region title dims everything unrelated and opens its `details.md` section in the details panel (over the right column, or a bottom sheet below 760px; the diagram never resizes); the details panel always shows the OS row, with an EOL badge when applicable; a body or IP line copies its text; Esc or an empty click clears.
- **Zoom**: "−" / "+" / "Fit", keys `+` / `-` / `0`, mouse wheel at the cursor (no modifier needed; over a panel the wheel scrolls the panel); range 0.25x-8x. Drag empty canvas to pan at any zoom (not in edit mode; a drag never selects or copies). Pan and zoom keep the smaller of ~100px or 15% of the diagram on screen per axis. Zoom narrows the live `viewBox`; the fitted one is kept in `data-fit` and used by exports.
- **Connections**: routed automatically from the current geometry, at build time and live in edit mode: a sparse orthogonal grid over server and region borders, A* minimising length plus bends plus penalties for crossing foreign regions, hugging region borders and narrow channels (servers are hard obstacles); ports sit on the border side facing the route, spread up to 20px apart when they share a side, and line up so facing servers get a straight line; a process endpoint leaves or enters its server's left or right side at its body line; corners are rounded. The firewall marker and connection labels take the free spot nearest the path's midpoint (clear of servers, region titles and borders, other markers). `via` waypoints and a fixed `label` in `layout.json` override.
- **Edit mode**: `?debug` or "Edit layout"; drag servers and regions (children follow, connections re-route live; "Snap 5px", Shift disables); a dragged server grows its region to keep padding and header band; servers and regions breaking the spacing rules get a red outline; "Copy layout.json" / "Download" export geometry to paste over `layout.json`; "Reset" drops the draft; drafts persist in localStorage while edit mode is on, keyed by a hash of layout + diagram text.
- **Export**: "SVG" / "PNG" (2x) export the current skin and visible state at the fitted view, with a legend column left (plus the active network filter, if any) and all notes right; dimmed stays dimmed; related documents are not exported; web fonts are not embedded.
- **Per-diagram names**: localStorage keys and export file names use the diagram `id` as prefix; the `proposed` legend entry, the connection legend labels and connection groups come from `diagram.json`.

## Local data

Real diagram data never enters this repo. Keep it outside the checkout, or under `/local/` (git-ignored, along with `*.private.*`). The engine accepts any absolute folder path (`node engine/build.mjs <dir>`). Everything committed under `examples/` is fictional (RFC 5737 IPs, `example.test` hosts, generic service names).
