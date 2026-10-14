# Diagram archive

The owner exports a diagram to one `.diag.zip` file and imports one
back.

## Purpose

Move a diagram between machines, back it up, and use the page
without the local server
([ADR-0005](../../tech/decisions/adr-0005-diag-zip-archive.md)).

## Behaviour

- **Export** downloads the whole in-memory diagram, unsaved edits
  included, as `<id>-<yyyymmdd-hhmmss>.diag.zip`. The server is not
  involved.
- **Import diagram** (or dropping a file on the page) opens a
  `.diag.zip` as an unsaved diagram, like **New diagram**. A
  current diagram with unsaved edits asks first.
- The diagram name is the `id` in `topology.toml` (else the file
  name), reduced to lowercase letters, digits and hyphens.
- **Save** of an import writes `local/<name>/`.

## Data keys

The zip holds the diagram folder with no wrapper: `topology.toml`,
`server-types.toml`, `notes.toml`, `documents.toml`,
`networks.toml`, `servers/<id>.toml`, `diagram.layout.json`. See
[authoring.md](../../tech/authoring.md#diagram-archive).

## Edge cases

- The archive is untrusted. The whole file is refused for `..`,
  absolute paths, drive letters, backslashes, NUL, duplicate names,
  files outside the layout, encryption, zip64 or multi-disk.
- Limits: 500 entries, 2 MB per file, 20 MB unpacked, 20 MB archive,
  enforced while inflating; size and CRC-32 are verified.
- Directory entries, `__MACOSX/` and dotfiles are skipped.
- A name that does not end in `.diag.zip` shows "Only .diag.zip
  files can be opened."
- Saving over an existing folder asks "Replace the saved diagram
  <name>?"; files the archive lacks stay in the folder.

## Out of scope

- Other archive formats, encrypted archives.
- Merging two diagrams.
