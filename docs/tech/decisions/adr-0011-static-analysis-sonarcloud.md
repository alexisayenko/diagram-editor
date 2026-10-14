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
  dead code, redundant escapes, `data-*` access through `dataset`
  (the test fakes share `engine/test/dataset-stub.mjs`).
- Intentionally left, with a reason:
  - **S7721** (move a function to an outer scope) in the kit
    functions of `render/geometry.mjs`, `render/auto-layout.mjs` and
    `render/draw-kit.mjs`: a kit is inlined through
    `Function.toString()`, so its helpers must stay inside it (each line
    carries a NOSONAR with that reason). The runtime modules are fixed:
    the bundler gives every module its own scope (`wrapModule`), their
    helpers sit at the top of the file, and **S107** on the `define`
    factories is gone because they take one dependency object.
  - **S1874** on `document.execCommand("copy")`: kept as the
    fallback where the Clipboard API is missing (page opened from
    disk).
  - **S1523** on `new vm.Script` in the two test loaders: the code
    run is the repo's own source. `.sonarcloud.properties` ignores this rule for `engine/test/cov-*.mjs`, but automatic analysis does not apply
    `multicriteria` ignores, so the two lines also carry a
    `// NOSONAR: test harness evaluates this repository's own sources to measure coverage` comment. The same inline comment marks the
    `spawnSync("git")` call in `tools/check-no-infra-data.mjs` (**S4036**: git is resolved from the developer's own PATH).
  - **Automatic analysis limits**: it reads `sonar.exclusions` and `sonar.cpd.exclusions` but not rule-level ignores, so use an inline NOSONAR with a reason.
- Status at the last analysed push (2026-10-14): 0 bugs, 2
  vulnerabilities (the S1523 test loaders), 119 code smells, 0.0%
  duplication; the quality gate is not passed. The numbers reflect
  the last analysed push, not necessarily the current commit.

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

## Amendment 2026-10-14

Public measures at the analysed revision 2789813 (the current commit):
3 bugs, 3 vulnerabilities, 158 code smells, 0.0% duplication; the quality
gate is not passed. The new bugs and vulnerabilities (the status above
had 0 and 2) have not been triaged. Refactoring follows
[the recommendations](../refactoring-recommendations.md); a local scan
with coverage stays deferred ([ci-cd.md](../ci-cd.md#deferred-local-sonarcloud-scan)).
