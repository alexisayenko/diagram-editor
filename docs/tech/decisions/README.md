# Decisions

Architecture decision records (ADRs): one file per decision that
shaped the engine. Convention: [`../README.md`](../README.md).

## Rules

- File name `adr-NNNN-<slug>.md`, numbers never reused.
- Never rewrite an accepted decision. Record a change as a dated
  **Amendment** section, or add a new ADR and mark the old one
  `Superseded by ADR-NNNN`.
- Keep it to about 25-50 lines. Synthetic examples only.
- The date is the day the decision landed in git; the commit is the
  evidence.

## Template

```markdown
# ADR-NNNN: Title

Status: Proposed | Accepted | Superseded by ADR-NNNN · YYYY-MM-DD
Commit: <short hash of the change that made it>

## Context

What forced the decision.

## Decision

What we do, in plain words.

## Consequences

What gets easier, what gets harder, what to watch.

## Alternatives

What we did not pick and why.
```

## Index

| ADR | Decision | Date |
| --- | --- | --- |
| [0001](adr-0001-no-infra-data-in-repo.md) | No real infrastructure data in the repo | 2026-10-07 |
| [0002](adr-0002-toml-subset-parser.md) | TOML subset with a dependency-free parser | 2026-10-07 |
| [0003](adr-0003-diagram-folder-surgical-writeback.md) | Diagram as a folder of small files, surgical write-back | 2026-10-08 |
| [0004](adr-0004-local-server-storage.md) | Server-side storage in `local/` via a loopback-only API | 2026-10-07 |
| [0005](adr-0005-diag-zip-archive.md) | `.diag.zip` as the exchange format | 2026-10-13 |
| [0006](adr-0006-derived-networks.md) | Networks derived from IPs, optional `networks.toml` | 2026-10-14 |
| [0007](adr-0007-service-groups-card-flag.md) | Service groups and the card flag | 2026-10-14 |
| [0008](adr-0008-host-probe.md) | Read-only host probe with a COMMANDS block | 2026-10-13 |
| [0009](adr-0009-drawings-in-layout-json.md) | Drawings stored in the layout JSON | 2026-10-07 |
| [0010](adr-0010-test-strategy.md) | Tests with `node:test`, no dependencies, measured coverage | 2026-10-14 |
| [0011](adr-0011-static-analysis-sonarcloud.md) | Static analysis with SonarCloud | 2026-10-14 |
| [0012](adr-0012-generated-outputs-committed.md) | Generated outputs are committed and checked | 2026-10-07 |
| [0013](adr-0013-adopt-refactoring-roadmap.md) | Adopt the refactoring roadmap and its eleven decisions | 2026-10-14 |
| [0014](adr-0014-format-versioning-and-error-model.md) | Format versioning and error model | 2026-10-14 |
| [0015](adr-0015-shared-helpers-and-server-field-table.md) | Shared helpers and the single server field table | 2026-10-14 |
| [0016](adr-0016-one-render-pipeline-and-split-page-app.md) | One render pipeline and the split page app | 2026-10-14 |
