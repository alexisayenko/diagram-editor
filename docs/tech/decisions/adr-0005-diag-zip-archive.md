# ADR-0005: `.diag.zip` as the exchange format

Status: Accepted · 2026-10-13
Commit: 57d6ecb

## Context

A diagram is many files. Moving it between machines, or using the
page without the local server, needs one file. The archive comes
from outside, so it is untrusted input.

## Decision

- **Export** downloads the in-memory diagram, unsaved edits
  included, as `<id>-<yyyymmdd-hhmmss>.diag.zip`; **Import diagram**
  opens one (or a dropped file) as an unsaved diagram.
- The zip holds the folder layout with no wrapper folder.
- `engine/lib/zip.mjs` reads and writes zips with no dependency:
  stored and deflate entries, the platform `CompressionStream`.
- The reader rejects the whole archive for: `..`, absolute paths,
  drive letters, backslashes, NUL, duplicate names, files outside
  the folder layout, encryption, zip64, multi-disk.
- Limits: 500 entries, 2 MB per file, 20 MB unpacked, 20 MB
  archive, enforced while inflating, not from header sizes; each
  entry's size and CRC-32 are checked.
- Saving an import over an existing folder asks for confirmation.

## Consequences

- One portable file, same code in the page and in Node tests.
- Only `.diag.zip` is accepted; other zip layouts need repacking.
- Limits may need raising for very large diagrams.

## Alternatives

- Folder copy: not possible from a browser without the picker.
- Single JSON bundle: unreadable for hand edits, no per-file diffs.
- A zip library: dependency; its defaults are not strict.
