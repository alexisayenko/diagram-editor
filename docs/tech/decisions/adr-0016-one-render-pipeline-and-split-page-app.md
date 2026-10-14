# ADR-0016: One render pipeline and the split page app

Status: Accepted · 2026-10-14
Commit: 2789813

## Context

`engine/build.mjs` and `engine/browser/render.mjs` ran the same twelve
steps (geometry check, routes, networks, types, OS, SVG, edge key, view
box, data JSON, page) and had begun to differ. `engine/browser/app.js`
was a 522-line script with one untyped state bag, four copied dialogs,
a 250 ms poll and direct reaches into the iframe's modules.

## Decision

- `render/pipeline.mjs` exports `renderModel({ config, model, layout,
  meta, kit, sections, notes, docs, drawings, networks, assets,
  validate })` and returns `{ html, routes, nets, ipNet, ent, typeList,
  svgBody, idx, viewBox, groupKit, edgeKeys, dataJson }`. It is pure: no
  file or DOM access. `networks` is `null`, `{ kind: "shared", items }`
  (`networks.toml`) or `{ kind: "tree", items, texts }` (legacy
  `networks.md`); `validate` runs the legacy geometry check.
- `build.mjs` (legacy folders) and `browser/render.mjs` (TOML folders)
  are thin loaders: read and parse, then call `renderModel`.
- `browser/app.js` is wiring only. The rest is in `engine/browser/`:
  `api`, `session`, `frame-bridge`, `dialogs`, `dialog-flows`, `edits`,
  `save`, `messages`. Each takes the DOM and `fetch` as parameters, so
  Node tests run it (`engine/test/browser-modules.test.mjs`).
- Host interface: the frame bridge installs one host object
  (`noteParser`, `serverEditor`) per load, and is the only reader of the
  frame (`editor()`, `notes()`, `draw()`, `isDirty()`, ...). The page no
  longer indexes `frame.contentWindow.InfraDiagram.modules[...]`.
- The toolbar follows frame activity events (`onChange`, once per
  burst) instead of the 250 ms poll.
- One dialog builder replaces the four copies.

## Consequences

- A feature is built once, not in two pipelines; `build --check` and
  `diagram.html --check` protect the output.
- `app.js` went from 522 to 167 lines; module state is explicit.
- Deferred: the legacy `networks.md` tree stays a separate parser until
  the legacy pipeline is removed; the runtime still uses
  `window.InfraDiagram` globals (CD-03), and `sandbox` for the frame
  waits for a `postMessage` host interface
  ([ADR-0013](adr-0013-adopt-refactoring-roadmap.md)).

## Alternatives

- Keep two pipelines and copy fixes: they had already diverged.
- A class-based app: plain factories are easier to fake in tests.
- A framework for the page: breaks the zero-dependency rule
  ([ADR-0002](adr-0002-toml-subset-parser.md)).
