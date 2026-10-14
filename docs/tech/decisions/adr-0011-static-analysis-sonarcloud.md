# ADR-0011: Static analysis with SonarCloud

Status: Accepted · 2026-10-14
Commit: 4ed04a7

## Context

Tests do not find code smells, risky patterns or dead code. A
public project can use SonarCloud for free. Juniors read this repo,
so small, plain functions matter.

## Decision

- The public SonarCloud project `alexisayenko_diagram-editor` uses
  **automatic analysis**: it runs on every push, with no CI step and
  no token.
- `.sonarcloud.properties` excludes generated files from analysis
  (`diagram.html`, `examples/**/*.html`, `examples/**/*.excalidraw`)
  and `local/`, `tmp/`, `.tmp-old/`. Tests and examples are excluded
  from duplication checks (`sonar.cpd.exclusions`).
- Fix what the tool reports in hand-written code: long functions
  split into named helpers (4ed04a7, 4996b5c), nested ternaries,
  dead code, redundant escapes.
- Intentionally left, with a reason:
  - **S7721** (move a function to an outer scope): runtime modules
    are concatenated into one script, so a hoisted name would be
    shared between modules.
  - **S7761** (use `dataset`): the fake DOM in the tests stubs
    attributes, not `dataset`.
  - **S1874** on `document.execCommand("copy")`: kept as the
    fallback where the Clipboard API is missing (page opened from
    disk).
  - **S1523** on `new vm.Script` in the two test loaders: the code
    run is the repo's own source; `.sonarcloud.properties` ignores this rule for `engine/test/cov-*.mjs` only.
- Status at the last analysis (4996b5c, 2026-10-14): 2 bugs
  (S9383, promises not awaited in `engine/browser/app.js`), 2
  vulnerabilities (the S1523 test loaders), 168 code smells, 0
  hotspots, 0.0% duplication; the quality gate is not passed. The
  two bugs are open work ([concerns](../../concerns.md)).

## Consequences

- Free review of every push; the history is public.
- Exclusions apply from the next analysis.
- Some rules clash with how the runtime is built, so the "left" list
  must stay short and justified.

## Alternatives

- CI-based analysis: needs a token and a workflow
  ([ci-cd.md](../ci-cd.md)); automatic analysis is enough for now.
- ESLint: a dependency and a config; may come later.
- No analysis: smells would pile up unseen.

## Re-check

The public API needs no login:

```sh
curl -s "https://sonarcloud.io/api/measures/component?component=alexisayenko_diagram-editor&metricKeys=bugs,vulnerabilities,code_smells,duplicated_lines_density"
curl -s "https://sonarcloud.io/api/issues/search?componentKeys=alexisayenko_diagram-editor&resolved=false&facets=rules&ps=1"
curl -s "https://sonarcloud.io/api/project_analyses/search?project=alexisayenko_diagram-editor&ps=1"
```

The last call shows the analysed commit (`revision`).
