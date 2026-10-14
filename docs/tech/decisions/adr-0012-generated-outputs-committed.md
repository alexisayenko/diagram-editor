# ADR-0012: Generated outputs are committed and checked

Status: Accepted · 2026-10-07
Commit: 64ff47a (the outputs); 21c15da (the stale-build tests)

## Context

`diagram.html` (the standalone page) and the demo outputs
(`examples/demo/layout.html`, `index.html`, `demo.excalidraw`) are
built from engine sources. People open them straight from the repo
with no build step, and diffs show what an engine change did. The
risk is a stale output: source changed, output not regenerated.

## Decision

- Generated outputs are committed next to the code that makes them.
- Two commands regenerate them; with `--check` they only compare:
  - `node engine/browser.mjs [--check]`: `diagram.html`.
  - `node engine/build.mjs examples/demo [--check]`: the demo
    outputs.
- `--check` builds in memory, writes nothing and exits 1 on a
  difference, naming the file (`layout.html out of date`).
- Tests keep this honest: `cov-cli-build-new.test.mjs` builds a copy
  of the demo, checks it, makes `layout.html` stale and expects exit
  1; `cov-cli-serve-browser.test.mjs` runs `browser.mjs --check`.
- An engine change is committed together with the regenerated
  outputs.
- Generated files are excluded from static analysis
  ([ADR-0011](adr-0011-static-analysis-sonarcloud.md)).

## Consequences

- The page works with no install; diffs are reviewable.
- Large generated diffs in commits: review the source, not the
  output.
- Output can change without a source change: the end-of-support
  check uses the build date, so `--check` can flip when an OS version
  passes its date.

## Alternatives

- Build in CI and publish: needs CI ([ci-cd.md](../ci-cd.md)); the
  repo has none yet.
- Git-ignore the outputs: every reader must build first.
