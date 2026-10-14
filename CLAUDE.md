# CLAUDE.md

Fast-path context for Claude Code. Full human-oriented docs:
[docs/](docs/). `AGENTS.md` mirrors this file; both are kept in step.

## Never commit infrastructure data (hard rule)

> This repo is a generic, agnostic diagram editor. Never commit data about specific infrastructure: real hostnames, domains, IPs/CIDRs, VLAN/subnet IDs, cluster/account/tenant names, org- or product-specific service names, internal paths, emails, tokens, or real topology.

- User diagram data lives outside the repo (or in git-ignored `/local/`, `*.private.*`).
- `examples/` and docs use fictional data only: `example.test` hosts, RFC 5737 IPs (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`), "Service A", "Region 1".
- Bug repros are built from a description in the demo diagram, never from real files.

## Key principle

> [TODO: one-line principle that governs every product decision]

[TODO: one paragraph elaborating how this principle applies — what
decisions are weighed against it, what gets cut when it doesn't
reinforce the principle.]

## Product

Diagram editor for infrastructure diagrams: a shared engine renders a folder of TOML files (or Mermaid + JSON) describing servers, regions and connections into a self-contained interactive HTML page, SVG/PNG exports and an Excalidraw scene. Authors run `node engine/serve.mjs`, open it in any modern browser, create, open or import a diagram (stored in the git-ignored `local/` folder, or exchanged as a `.diag.zip`), edit servers and notes, import hosts probed by `tools/host-probe.sh`, and arrange the layout in edit mode. Diagram folders hold content only; no diagram needs engine edits. [TODO: users, monetization.]

## Tech stack

Plain Node.js ESM (`engine/`, no package manifest or dependencies) for parsing, layout and rendering; browser runtime in `engine/runtime/` (vanilla JS modules inlined into one script) and CSS in `engine/css/`. Run Node through WSL: `node engine/build.mjs <dir> [--check]` builds a diagram folder, `node engine/browser.mjs [--check]` regenerates the standalone `diagram.html`, `node engine/serve.mjs` serves it on localhost, `node --test engine/test/*.test.mjs` runs tests. No deploy target yet. Status: all 627 tests pass (99.85% line coverage), `diagram.html` and the `examples/demo` outputs are up to date (`--check` passes).

## Testing

Run Node through WSL; there is no install step.

```sh
node --test engine/test/*.test.mjs                                  # all tests
node --test --experimental-test-coverage engine/test/*.test.mjs     # with coverage
node engine/browser.mjs --check                                     # diagram.html is current
node engine/build.mjs examples/demo --check                         # demo outputs are current
```

- Files: `<topic>.test.mjs` and `cov-<area>-<topic>.test.mjs`;
  `helpers.mjs` and `cov-*.mjs` (no `.test`) are shared helpers.
- Browser-side code is tested in a `node:vm` context with fake DOM
  objects, so Node coverage counts the real files.
- Rule: a bug found gets a skipped test first, then a fix that
  un-skips it.
- Details: [ADR-0010](docs/tech/decisions/adr-0010-test-strategy.md).

## Working in a shared checkout

[TODO: delete if only one session ever works in this checkout.]
Several sessions may work in this one checkout at once:

- Run `git status` first; files already modified or untracked belong
  to other work — never edit, stage or commit them.
- Stage explicit paths only (`git add <file>`), never `git add -A`
  or `git add .`.
- Never `git stash pop` / `apply` blindly — an old, unrelated stash
  may sit in the list.

## Docs change with code

A change that makes a doc wrong fixes that doc in the same commit.
Task-file updates ship with the work they describe
([docs/tasks/README.md](docs/tasks/README.md)).

## Repo

[TODO: `[owner/repo](https://github.com/owner/repo)` (private/public).
Auth notes if any (HTTPS, fine-grained PAT, etc.).]

## Where to look for more

- [README.md](README.md) — repo entry point + structure
- [docs/README.md](docs/README.md) — docs subtree map
- [docs/tech/ci-cd.md](docs/tech/ci-cd.md) — CI/CD playbook
- [docs/tech/architecture.md](docs/tech/architecture.md) — engine module map, build, page behaviour
- [docs/tech/authoring.md](docs/tech/authoring.md) — TOML authoring format and workflow
- [docs/tech/decisions/](docs/tech/decisions/README.md) — ADRs: why the engine is built this way
- [ADR-0010](docs/tech/decisions/adr-0010-test-strategy.md) — test strategy and coverage
- [ADR-0011](docs/tech/decisions/adr-0011-static-analysis-sonarcloud.md) — SonarCloud
- [ADR-0012](docs/tech/decisions/adr-0012-generated-outputs-committed.md) — generated outputs are committed and checked
- [docs/product/concepts/terminology.md](docs/product/concepts/terminology.md) — agreed vocabulary
- [docs/product/features/](docs/product/features/README.md) — feature specs (start with self-service)
- [examples/demo/](examples/demo/) — sample diagram in every format
