# Self-service diagrams

The owner builds, edits and saves an infrastructure diagram in the
page with no engine edits and no real data in the repo.

## Purpose

The engine is generic. A diagram is content: a folder of small TOML
files plus a saved layout. The owner creates it, probes hosts,
arranges it and keeps it on his own machine. Real data never
reaches the repo ([ADR-0001](../../tech/decisions/adr-0001-no-infra-data-in-repo.md)).

## Behaviour

- `node engine/serve.mjs` serves the page on `http://127.0.0.1:8080`
  and stores diagrams in the git-ignored `local/` folder
  ([ADR-0004](../../tech/decisions/adr-0004-local-server-storage.md)).
- On load the most recently saved diagram opens; with none, a
  welcome panel shows.
- Toolbar: **New diagram**, **Open saved diagram**, **Import
  diagram**, **Import servers**, **Export**, **Save**,
  **Host script**.
- **New diagram**: dialog asks for a name (lowercase letters, digits,
  hyphens; checked as you type; stored names are listed and
  refused), opens an empty diagram in memory.
- **Open saved diagram**: lists the stored folders (server count,
  last modified, newest first, filter box).
- Objects are placed by auto-layout. **Edit layout** lets the owner
  drag servers, move and resize regions, add servers and regions
  from the right-click menu. **Save** writes only changed files plus
  `diagram.layout.json`; it is enabled only while there are unsaved
  changes. There is no autosave.
- Clicking empty space clears the selection, like Esc.
- Opening `diagram.html` from disk works in memory only: no Save,
  but **Export** and **Import diagram** still work.

Details by area:

- [server-edit.md](server-edit.md), [notes-edit.md](notes-edit.md),
  [networks-derive.md](networks-derive.md),
  [servers-import.md](servers-import.md),
  [diagram-archive.md](diagram-archive.md),
  [drawing-draw.md](drawing-draw.md).

## Data keys

The folder layout and every key are in
[authoring.md](../../tech/authoring.md#diagram-folder).

## Edge cases

- Unsaved edits: switching diagrams, reloading or closing asks first.
- A file changed on disk since it was loaded: Save answers 409 and
  writes nothing; use **Export**, then reload.
- A diagram folder has `topology.toml` or at least one
  `servers/*.toml` to count as a diagram.
- Legacy folder with only `diagram.toml` still loads.

## Out of scope

- Multi-user editing, accounts, cloud storage.
- Live monitoring: the diagram shows probed facts, not live state.
- Editing `service_groups`, connections or server ids in the page
  (hand edit the TOML).

## History

The first version of this spec was a task brief for a Mermaid-based
build. It is done and the legacy path is retired
([ADR-0017](../../tech/decisions/adr-0017-retire-the-legacy-mermaid-and-markdown-pipeline.md));
`engine/build.mjs` and `engine/new.mjs` now work on TOML folders.
