# ADR-0002: TOML subset with a dependency-free parser

Status: Accepted · 2026-10-07
Commit: 64ff47a

## Context

Diagrams are authored by hand and edited by the page. The format
must be easy to read, allow comments, and be parsed in Node and in
the browser with no install step. The engine has no `package.json`.

## Decision

- Diagram files are TOML, parsed by `engine/parse/toml.mjs`, a
  small hand-written parser for an explicit subset: top-level keys,
  `[[name]]` array-of-tables, basic and literal strings (also
  multi-line), booleans, string arrays, comments.
- Everything else (nested tables, inline tables, numbers, dates) is
  rejected with an error naming the file and line.
- Unknown keys and duplicate ids are errors, so typos surface early.
- The parser records key and value positions (`spans`) so the
  writer can edit text in place
  ([ADR-0003](adr-0003-diagram-folder-surgical-writeback.md)).

## Consequences

- No dependency, one code path for build, page and tests.
- We own the parser: every new TOML construct is our work, and a
  valid TOML file may be refused.
- The subset is small enough to document in `authoring.md`.

## Alternatives

- YAML: indentation errors, implicit typing (`no` becomes false),
  large parser.
- JSON: no comments, noisy to hand-edit.
- XML: verbose to write and read.
- A TOML library: adds a dependency and a build step, and gives no
  source positions for surgical edits.
