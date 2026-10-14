# ADR-0018: One metrics table and node keys

Status: Accepted · 2026-10-14

## Context

The same card sizes (header 20, text padding 10, line pitches 16 and 18,
character widths 6.6, 7 and 5.6, region padding) were written out in
`geometry`, `auto-layout`, `validate`, `excalidraw`, `browser/render` and
the runtime skins and canvas model, and the box of a server was computed
three times. Entity keys (`"n:" + id`, `"c:" + id`) were built about 30
times and parsed about 26 times with `slice(2)` and `charAt(0)`
([refactoring-recommendations](../refactoring-recommendations.md): CD-04,
CD-06, DK-10).

## Decision

- `render/metrics.mjs` is the only place with these numbers (`METRICS`).
  Node imports it; the page gets it as the runtime module `ui/metrics`;
  `geometryKit` receives it as an argument.
- `kit.boxFor(meta, x, y)` is the one box definition used by `fitBox`,
  auto layout, saved-layout reconcile and edit mode.
- `lib/keys.mjs` (`nodeKey(kind, id)`, `parseKey(key)`) builds and parses
  every key; the runtime gets it as `ui/keys`. The serialized forms
  (`n:`, `c:`, `e:`, `g:`, `lv:`) do not change and are pinned by a test.
- Kits take arguments (`args` in `page/kits.mjs`) instead of reading
  module constants.
- The model names `classDefs`, `classes`, `linkStyles` become
  `typeStyles`, `nodeTypes`, `edgeStyles` (internal, never saved). The
  cryptic `meta` fields (`tl`, `nb`, ...) stay: they are in the page data
  of every generated page.

## Consequences

- Generated pages change only in the inlined runtime script; the SVG,
  the page data, `demo.excalidraw` and saved layouts are byte-identical.
- A new size is one line in `METRICS`; `box-for.test.mjs` fails if the
  layout, the auto layout and the drawn card disagree.
- Renaming `meta` fields needs a data version and is a separate change.

## Alternatives

- Keep per-module constants and add a drift test: still N copies.
- Put `keys` in `model/`: it has no model dependency and `lib/` is the
  layer every other layer may import.
