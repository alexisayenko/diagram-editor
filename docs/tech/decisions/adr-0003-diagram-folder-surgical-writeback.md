# ADR-0003: Diagram as a folder of small files, surgical write-back

Status: Accepted · 2026-10-08
Commit: eaadfdf

## Context

One big `diagram.toml` made every edit rewrite the whole file, hid
which part changed, and made merges and reviews noisy.

## Decision

- A diagram is a folder; each file holds one kind of content:
  `topology.toml` (id, title, regions, connections, service groups),
  `servers/<id>.toml` (one server, the file name is the id),
  `server-types.toml`, `notes.toml`, `documents.toml`,
  `networks.toml`, and `diagram.layout.json` for geometry.
- A file may hold only its own keys; the loader (`mergeFolder`)
  rejects the rest, naming the file.
- Saving writes back only the file that owns a change, and inside
  it only the changed keys (`parse/toml-write.mjs`): comments, key
  order, whitespace, line endings and BOM stay. A new key goes after
  the last key; an emptied key is removed.
- Every result is re-parsed and compared with the edit before it is
  returned.
- Legacy `diagram.toml` still loads as `topology.toml`.

## Consequences

- Small diffs, easy hand edits, one server per file.
- The writer needs the parser's positions and a round-trip check;
  each new editable key needs writer code and tests.
- Adding or removing a server means adding or removing its file.

## Alternatives

- Single TOML file rewritten from the model: loses comments and
  formatting, huge diffs.
- Single file with an in-place patcher: still one hot file for every
  edit.

## Amendment 2026-10-14

- `topology.toml` may start with `format_version` (a string, absent
  means `"1"`); the loader checks it before any other file
  ([ADR-0014](adr-0014-format-versioning-and-error-model.md), 524d13f).
- Load errors are one `FormatError` that names the file and line, for
  example `servers/web01.toml:3: ...`. The writers' round-trip check
  throws the same type.
- The allowed keys of `servers/<id>.toml` come from one table,
  `SERVER_FIELDS`
  ([ADR-0015](adr-0015-shared-helpers-and-server-field-table.md)).
