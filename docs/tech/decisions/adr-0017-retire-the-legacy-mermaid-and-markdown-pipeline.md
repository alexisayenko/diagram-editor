# ADR-0017: Retire the legacy Mermaid and Markdown pipeline

Status: Accepted · 2026-10-14

## Context

Two ingestion paths fed one render pipeline ([ADR-0016](adr-0016-one-render-pipeline-and-split-page-app.md)):
TOML folders (the page, `engine/browser/render.mjs`) and the legacy
Mermaid and Markdown folders (`diagram.mmd`, `diagram.json`,
`details.md`, `notes.md`, `documents.md`, `networks.md`, `layout.json`),
read only by `engine/build.mjs` and `engine/new.mjs`. The legacy path
carried its own parsers, a second networks implementation, a geometry
cross-check for hand-written layouts and `index.html`, a page that loads
`mermaid` and `marked` from a CDN. The owner decided D1 in
[ADR-0013](adr-0013-adopt-refactoring-roadmap.md): convert the examples,
then delete the legacy path.

## Decision

- `examples/demo` is a TOML folder only; its legacy files and
  `index.html` are deleted.
- `build.mjs` builds a TOML folder (plus `diagram.layout.json` when
  present) into `layout.html` and `<id>.excalidraw`. The Excalidraw
  export is kept; `index.html` and the CDN scripts are gone.
- `new.mjs` scaffolds the same empty TOML folder as New diagram
  (`parse/new-diagram.mjs`).
- Deleted: `parse/mmd`, `details`, `documents`, `networks`, `layout`,
  the re-export shims `parse/errors`, `config` and `notes`,
  `page/index-html.mjs`, the `networks.kind` switch and the `osOf`
  fallback in the pipeline. `validate.mjs` keeps only the geometry
  checks (spacing, header bands).
- A folder with legacy files and no `topology.toml` fails with a
  `FormatError`: "legacy Mermaid/Markdown diagrams are no longer
  supported: convert to TOML, see docs/tech/authoring.md". The manual
  conversion steps are in [authoring.md](../authoring.md).
- The IR keeps its Mermaid-shaped names (`nodes`, `classes`,
  `classDefs`, `linkStyles`): renaming them is a separate change.

## Consequences

- One ingestion path, one networks implementation, no CDN code, no
  second set of fixtures.
- Old legacy folders cannot be built until converted by hand; there is
  no automatic converter.
- Tests of legacy parsing are deleted; shared behaviour (config, notes,
  types, geometry checks, pipeline) is covered on TOML fixtures
  (`cov-model-shared`, `pipeline`, `cov-cli-build-new`).
- `examples/demo` has no saved layout, so its generated outputs use the
  automatic arrangement.

## Alternatives

- Keep the legacy path import-only: still two parsers to maintain.
- Write a one-off converter first: the only known legacy folders were
  the examples, converted by hand.
