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

Diagram editor for infrastructure diagrams: a shared engine renders a TOML (or Mermaid + JSON) description of servers, regions and connections into a self-contained interactive HTML page, SVG/PNG exports and an Excalidraw scene. Authors open `diagram.html` in desktop Edge or Chrome, pick a folder, and arrange the layout in edit mode. Diagram folders hold content only; no diagram needs engine edits. [TODO: users, monetization.]

## Tech stack

Plain Node.js ESM (`engine/`, no package manifest or dependencies) for parsing, layout and rendering; browser runtime in `engine/runtime/` (vanilla JS modules inlined into one script) and CSS in `engine/css/`. Run Node through WSL: `node engine/build.mjs <dir> [--check]` builds a diagram folder, `node engine/browser.mjs [--check]` regenerates the standalone `diagram.html`, `node engine/serve.mjs` serves it on localhost, `node --test engine/test/*.test.mjs` runs tests. No deploy target yet. Status: ported from infra-diagram-engine; `layout.html` of `examples/demo` is out of date and one browser-bundle test fails (both also in the source).

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
- [docs/product/concepts/terminology.md](docs/product/concepts/terminology.md) — agreed vocabulary
- [docs/product/features/self-service.md](docs/product/features/self-service.md) — self-service spec
- [examples/demo/](examples/demo/) — sample diagram in every format
