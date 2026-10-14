# ADR-0019: Page shell and scene swap

Status: Accepted · 2026-10-14

## Context

Every edit (a server form, add, duplicate, move, region, note, network
name) rendered the whole page and assigned it to the iframe's `srcdoc`:
the document, CSS and the 170 KB runtime were parsed and run again, zoom
and pan were lost and only the edited server stayed selected
([performance.md](../performance.md), AR-06 and AR-13). At 400 servers the
reload was most of the edit.

## Decision

- A page is a **shell** (document, toolbar, CSS, runtime script, controls)
  around a **scene** (the svg inner markup with defs and the drawings
  layer, the layout data JSON, the legend's connection key, the Networks
  list, the notes and documents lists, the style sheet of the types, the
  title). `renderScene` in `page/layout-html.mjs` builds the scene;
  `renderLayoutHtml({ scene, cssPage, js })` wraps it, so a full page and
  a scene cannot drift. The pipeline returns both (`html`, `scene`).
- The runtime has a new module `ui/scene` and the page-facing entry
  `InfraDiagram.replaceScene(scene)`. It replaces `D`, the svg children,
  `els` and `ents` in place (identity kept, so no module re-binds), then
  emits the new event `scene`, rebuilds the chrome, renders (the `render`
  event fires) and restores the selection. It returns `{ ok }` and
  refuses, before touching anything, a scene of another diagram, one
  where the Networks panel would appear or vanish, or an incomplete one.
- Kept: zoom and pan, the selection (when its key still exists, else
  cleared; an open server form with pending edits keeps its panel), edit
  mode, the drawing tool and strokes, legend and info switches, the
  network filter (followed by cidr, else name), panel scroll, the dirty
  state (the new scene is the saved base, as after a reload).
- The frame bridge keeps the shell key of the loaded page (`scene.shell`:
  diagram id and whether networks exist). `replace(result)` calls
  `replaceScene` on the frame's window (same-origin `srcdoc`: the strings
  are passed by reference, no `postMessage`) when the key matches, and
  loads `srcdoc` as before when it does not, when the runtime refuses or
  throws, or when the frame is not ready. Open, new and import always load.
- The CSP of the frame is unchanged.

## Consequences

- An edit costs the render plus the client routing, not a document load:
  at 400 servers about 1.7 s against 5.6 s, at 100 servers 0.2 s against
  0.6 s (numbers: [performance.md](../performance.md)).
- A new per-scene state in a runtime module must subscribe to `scene` or
  be derived from `D` at call time; `scene-swap.test.mjs` compares a
  swapped page with a loaded one for every kind of edit.
- `ui/scene` is in the runtime manifest, so every page and export carries
  it (about 2 KB).

## Alternatives

- `postMessage` of the scene: needed only for a sandboxed frame without
  `allow-same-origin`; it would copy 1.4 MB per edit. Revisit with the
  sandbox work ([ADR-0013](adr-0013-adopt-refactoring-roadmap.md)).
- Diffing the svg and patching changed elements: the render is not the
  cost, and a patch would need its own proof of equality.
