# ADR-0015: Shared helpers and the single server field table

Status: Accepted · 2026-10-14
Commit: 524d13f

## Context

The same rule lived in several places: the server key list in four,
id and slug rules in five, file-name constants in three or four, TOML
escaping in three variants and IP/CIDR parsing in three. Docs and code
drifted (the docs omitted `cpu` and `ram`).

## Decision

One module per rule, imported everywhere (page, server, CLI):

- `lib/files.mjs`: file-name constants of a diagram folder and archive,
  `serverPath(id)`.
- `lib/ids.mjs`: `DIAGRAM_ID`, `SERVER_ID`, `slugify`, `sanitizeId`,
  `sanitizeName`.
- `lib/net.mjs`: IPv4 and IPv6 parse, CIDR parse and containment.
- `parse/toml-escape.mjs`: `tomlBasic`, `tomlMultilineBody`, the one
  TOML string escaper.
- `lib/text.mjs`: Node-free `esc` and `unq`; `lib/util.mjs` re-exports
  them and the bundler maps it to `text.mjs` in the page.
- `model/server-fields.mjs`: `SERVER_FIELDS`, the one table of
  `servers/<id>.toml` keys (type, label, form, table and card flags,
  list entry checks). It feeds the parser's allowed keys, the writer's
  order and checks, the details table and, as the `ui/server-fields`
  kit, the editor form.
- Drift test: `server-fields.test.mjs` fails when a key is missing from
  [authoring.md](../authoring.md).

## Consequences

- A new server field is one table row plus its docs line.
- Each module has its own small test (`files`, `ids`, `net`,
  `toml-escape`).
- Not done yet: file-name literals in `serve.mjs` and `store.mjs`,
  `DIAGRAM_ID` copies in `new.mjs` and `model/config.mjs`; the docs
  table is checked, not generated.
- `lib/names.mjs` stays the one file-name allow-list (case-insensitive
  duplicates, Windows device names).

## Alternatives

- Leave the copies and rely on tests: the drift had already happened.
- Generate the docs from `SERVER_FIELDS`: more tooling; a drift test is
  enough for now.
- A class hierarchy for fields: a table is simpler to read and to
  inline into the page.
