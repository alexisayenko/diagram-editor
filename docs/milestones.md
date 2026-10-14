# Milestones

Dated project events — launches, releases, public posts, evidence
artifacts. Newest first.

Starts as this flat file. Extracts to `milestones/` (with
`history.md` index + dated deep-dive files + evidence) when
events accumulate enough to warrant their own pages — see
[`README.md#section-file-folder`](README.md#section-file-folder).

## Events

One bullet per event: ISO date, an em dash, what happened in a
sentence or two, and a link to the task or artifact that carries
the detail. Newest first; several events on one date are fine.

- 2026-10-14 — Tests, refactor and static analysis: 627 tests with 99.85%
  line coverage, large functions split, six bugs found by the tests
  fixed, SonarCloud clean-up
  ([ADR-0010](tech/decisions/adr-0010-test-strategy.md),
  [ADR-0011](tech/decisions/adr-0011-static-analysis-sonarcloud.md),
  [ADR-0012](tech/decisions/adr-0012-generated-outputs-committed.md)).
- 2026-10-14 — Networks derived from server IPs, optionally named, and
  appended to `networks.toml` on Save
  ([ADR-0006](tech/decisions/adr-0006-derived-networks.md)).
- 2026-10-13 — Host probe, **Import servers**, `.diag.zip` archives and
  the Open saved diagram / New diagram dialogs
  ([ADR-0005](tech/decisions/adr-0005-diag-zip-archive.md),
  [ADR-0008](tech/decisions/adr-0008-host-probe.md)).
- 2026-10-08 — Diagram split into a folder of small files
  ([ADR-0003](tech/decisions/adr-0003-diagram-folder-surgical-writeback.md)).
- 2026-10-07 — Engine added with the synthetic demo; server-side
  storage in `local/`, notes and server editing, drawing tools
  ([ADR-0004](tech/decisions/adr-0004-local-server-storage.md)).
- 2026-10-07 — Rule recorded: no real infrastructure data in the repo
  ([ADR-0001](tech/decisions/adr-0001-no-infra-data-in-repo.md)).
