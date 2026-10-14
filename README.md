# diagram-editor

Infrastructure diagram editor: an engine (`engine/`) that renders TOML / Mermaid diagram folders into interactive HTML, SVG/PNG and Excalidraw. Run `node engine/serve.mjs` and open its address to start (any modern browser); see [docs/tech/authoring.md](docs/tech/authoring.md) and [docs/tech/architecture.md](docs/tech/architecture.md). Code lives in `engine/`, sample content in `examples/`.

## Never commit infrastructure data (hard rule)

> This repo is a generic, agnostic diagram editor. It must never contain data about specific network infrastructure or anything sensitive: real hostnames, domains, IPs/CIDRs, VLAN/subnet IDs, cluster/account/tenant names, org- or product-specific service names, internal paths, emails, tokens, or real topology.

- Examples and docs use fictional data only: `example.test` hosts, RFC 5737 IPs, "Service A", "Region 1".
- Real diagram data lives outside the repo, or in the git-ignored `/local/` directory (also `*.private.*`).

---

## Quick start

Needs Node.js (run it through WSL on Windows). No install step, no
dependencies.

```sh
node engine/serve.mjs                       # serve the page on http://127.0.0.1:8080
node --test engine/test/*.test.mjs          # run the tests
node engine/browser.mjs [--check]           # regenerate diagram.html (check for drift)
node engine/build.mjs examples/demo [--check]   # Mermaid build of the demo folder
node engine/new.mjs <dir>                   # scaffold a Mermaid-format diagram folder
```

Open the printed address, then **New diagram**, **Open saved diagram**
or **Import diagram**. Diagrams are saved in the git-ignored `local/`
folder. Format and workflow: [docs/tech/authoring.md](docs/tech/authoring.md);
engine map: [docs/tech/architecture.md](docs/tech/architecture.md);
why it is built this way: [docs/tech/decisions/](docs/tech/decisions/README.md).

## Structure

```text
diagram-editor/
├── docs/            # strategy, specs, ADRs, tech reference
├── engine/          # parsers, layout, renderers, browser runtime, server, tests
├── examples/demo/   # synthetic sample diagram in every format
├── local/           # YOUR diagrams (git-ignored, never committed)
├── tools/           # host-probe.sh: read-only Linux host probe
├── AGENTS.md        # mirror of CLAUDE.md for other agents (kept in step)
├── CLAUDE.md        # agent guidance (kept in step with AGENTS.md)
├── diagram.html     # generated standalone page (node engine/browser.mjs)
├── LICENSE
└── README.md        # this file
```

`tmp/` is also git-ignored scratch space.

## Conventions

### Naming

| Convention | Example | Why |
| --- | --- | --- |
| `kebab-case.md` for documents | `branding.md`, `task-0001.md` | Reads as prose; case-safe across OSes |
| Lowercase folders | `docs/`, `engine/`, `archive/` | Matches URL paths; case-safe |
| `UPPERCASE.md` only for conventionally recognized files | `README.md`, `CLAUDE.md`, `AGENTS.md`, `LICENSE`, `CHANGELOG.md` | Don't invent new uppercase files |

Code folders use their natural name (`engine/`, `tools/`).

### Archive

Single root `archive/` folder for obsolete code and docs. A
`docs/` subfolder inside holds obsolete documentation.

```text
archive/
├── docs/                       # obsolete project-level docs
│   └── <old-doc>.md
└── <old-folder>/               # obsolete code (e.g. v1 prototype)
```

A folder belongs in `archive/` when it **no longer ships**.
Before archiving code, extract any worthwhile lessons or
decisions into `archive/docs/` — code in archive rots; docs
survive.

`archive/` doesn't exist by default. Create on first retirement.

## Documentation

See [`docs/README.md`](docs/README.md) for:

- Why this folder is called `docs/` and not `specs/`
- Product overview
- Guiding principle: strategy at root vs per-folder
- Top-level glossary + the four-level chain (concept → feature →
  screen → journey)
- Concerns (`C1, C2, …`) — cross-cutting work axes that span
  sections; catalogued in [`docs/concerns.md`](docs/concerns.md)
- Entry-doc convention (`<section>/README.md` pattern)
- The `docs/` subtree map and what lives where
- The `Section, file, folder` rule (start small, extract on growth)
- Docs change with code (same commit)
- Per-folder `<folder>/docs/` policy
- CI/CD playbook in [`docs/tech/ci-cd.md`](docs/tech/ci-cd.md)
- Multi-product split (rare)

## Design rationale

Why this template is shaped the way it is. It's *more
structured* than industry default for solo-founder projects, but
every choice is a defensible divergence rather than an
anti-pattern.

**Aligned with established best practices:** README.md as folder
entry doc (GitHub auto-renders), kebab-case.md filenames
(case-safe), conventional commits, YAML frontmatter on docs
(Jekyll / Hugo / MkDocs convention), ADRs (Michael Nygard's
spec), glossary-driven vocabulary discipline (Eric Evans' DDD
ubiquitous language), separating product specs from
implementation (clean architecture), atomic commits referencing
tasks.

**Defensible divergences from common defaults:** tasks as
markdown files (instead of Jira / Linear / GitHub Issues —
portable, greppable, git-tracked, AI-readable; cost: harder to
query at scale); the verb / noun split between concepts and
features (this is DDD, rigorously applied); heavy doc
scaffolding upfront (closer to the "docs as first-class
artifact" school — Stripe, Diataxis — than to agile's "defer
docs" tradition).

**Original framings:** `concept = noun`, `feature = verb`,
`screen = place` as a strict three-way taxonomy (DDD-flavored
but specific); concerns axis (`C1, C2, …` — industry
equivalents are epics, OKRs, work-streams); each top-level code
folder named for what it is rather than fitting under a
unifying noun.

Bottom line: nothing here is anti-pattern. Heavyweight for
throwaway experiments; benefit is that a project stays
organized as it grows without needing a mid-life restructure.
