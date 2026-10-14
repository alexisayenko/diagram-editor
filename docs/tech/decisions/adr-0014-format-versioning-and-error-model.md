# ADR-0014: Format versioning and error model

Status: Accepted · 2026-10-14
Commit: 524d13f

## Context

A diagram folder had no version, and an unknown key is a hard error, so
a file written by a newer engine looked corrupt to an older one. The
layout file accepted a missing `version` and dropped fields it did not
know on the next Save. Errors came in three styles: `fail` exited in
Node but threw in the page, and nine places stripped a `TOML: ` prefix
with a regex.

## Decision

- `topology.toml` may carry `format_version`, a **string** (`"1"`).
  Absent means `"1"`. A string needs no parser change
  ([ADR-0002](adr-0002-toml-subset-parser.md) has no numbers).
- The check is `checkFormatVersion` in `parse/toml.mjs`, called first by
  `mergeFolder`. A larger number gives "needs a newer engine"; any other
  value is invalid. New diagram writes the key. The `.diag.zip` carries
  it through `topology.toml`; the archive has no marker file.
- Policy: additive keys do not bump the version. Only a breaking change
  does, and the engine refuses a newer version.
- The layout file keeps its own integer `version` (`LAYOUT_VERSION`,
  currently 1), always written by Save. `decideLayoutLoad` in
  `parse/layout-version.mjs`: a newer layout opens with an automatic
  arrangement and a warning, and Save does not write the layout file
  (other files still save). Older or absent versions open as before.
- One error type, `FormatError {file, line, path, message}`
  (`lib/errors.mjs`). Libraries only throw it. CLI entry points wrap
  their body in `runCli` (`lib/cli.mjs`), which prints
  `<tool>: <message>` and sets a non-zero exit code. The message starts
  with the file name when known (`servers/web01.toml:3: ...`).

## Consequences

- Every later schema change has a version to hang on.
- A newer layout is never overwritten; the cost is one locked Save
  until the engine is upgraded.
- Not done yet: `browser.mjs` and `serve.mjs` do not catch
  `FormatError`; server-file errors from `tomlModel` lack file names.
- Tests: `format-version.test.mjs`, `cov-parse-toml-errors.test.mjs`.

## Alternatives

- Integer `format_version`: needs a TOML parser change.
- A version file or archive manifest: a second source of truth.
- Layout `.bak` for a newer file: more code, same safety.
- Keep `fail` exiting in Node: the page and the CLI cannot share a
  library.
