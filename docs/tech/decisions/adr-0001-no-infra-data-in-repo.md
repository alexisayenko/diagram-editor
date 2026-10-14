# ADR-0001: No real infrastructure data in the repo

Status: Accepted · 2026-10-07
Commit: 780cb7f

## Context

The editor draws real infrastructure: hosts, IPs, networks, jobs.
The repo is generic and agents work in it. Real data in the repo or
in an agent prompt is a leak that git history cannot undo.

## Decision

- The repo holds the engine and synthetic examples only: `example.test`
  hosts, RFC 5737 IPs (`192.0.2.0/24`, `198.51.100.0/24`,
  `203.0.113.0/24`), names such as "Service A" and "Region 1".
- Real diagrams live outside the checkout or in the git-ignored
  `/local/` folder (also `*.private.*`, `/tmp/`).
- Engine code and docs never name a company, product or real host.
  Behaviour that depends on real names is private configuration
  (see [ADR-0007](adr-0007-service-groups-card-flag.md)).
- Bugs from real diagrams are reproduced from a description in the
  demo diagram, never from the real files.
- The rule is stated in `CLAUDE.md`, `AGENTS.md` and `README.md`.

## Consequences

- Safe to publish and to hand to agents.
- Every test and screenshot needs a synthetic fixture
  (`examples/demo/`); reproducing a real bug takes extra effort.
- Nothing mechanical enforces the rule yet; review is by eye.

## Alternatives

- Private repo with real data: one wrong push or prompt leaks it.
- Scrub data before commit: easy to miss a value, hard to verify.
