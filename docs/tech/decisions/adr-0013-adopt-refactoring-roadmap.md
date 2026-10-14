# ADR-0013: Adopt the refactoring roadmap and its eleven decisions

Status: Accepted · 2026-10-14
Commit: not yet committed (docs only; Wave 0 not started)

## Context

Five reviews of the engine were merged into a four-wave roadmap
([refactoring-recommendations.md](../refactoring-recommendations.md)).
Eleven choices (D1 to D11) gated the big items. The owner accepted the
recommended option of each.

## Decision

1. D1 legacy Mermaid/markdown pipeline (AR-02, DK-01, BP-02): convert
   the examples with a one-off converter, then delete it.
2. D2 format version (DM-01): string `format_version = "1"`; absent
   means 1.
3. D3 CDN code (BP-02): pin with SRI now; drop it with the legacy path.
4. D4 iframe (BP-01, BP-03): CSP meta and server headers now;
   `sandbox` later, after the `postMessage` host interface.
5. D5 layout downgrade (DM-02, DM-05): a newer layout file opens
   read-only with a warning.
6. D6 update model (AR-06): benchmark first, refactor only if slow.
7. D7 tooling (BP-22, BP-23): `package.json` plus a pre-commit hook;
   no CI yet.
8. D8 generated outputs (AR-12): stay committed, marked `-diff`.
9. D9 ids (DM-11): new ids lowercase, read leniently, uniqueness
   case-insensitive.
10. D10 Service CNAME key (DM-19): named `aliases`, not `cnames`.
11. D11 tests (BP-18, BP-19): add SVG goldens and a smoke test, then
    merge the harnesses.

Work follows the waves; Wave 0 has not started.

## Consequences

- Deleted: the legacy Mermaid/markdown pipeline and its tests, after
  the examples are converted; the CDN-loading `index.html` goes with
  it.
- Versioned: `topology.toml` gets `format_version`; the layout file
  gets a required `version` on write, and version 2 only with the
  minimal layout.
- Deferred: `sandbox` for the iframe, CI, any update-model rewrite
  (until the benchmark says so), the harness merge (after Wave 2).
- Later ADRs (ADR-0014 and up) cover the pipeline, legacy fate,
  bundling, update model, format versioning, server API and CI.
- [ADR-0010](adr-0010-test-strategy.md) is amended when D11 lands.
  [ADR-0012](adr-0012-generated-outputs-committed.md) stays valid.

## Alternatives

- Delete the legacy pipeline now: strands old folders.
- Integer `format_version`: needs a TOML parser change.
- Both `sandbox` and CSP now: `sandbox` breaks the parent bridge.
- Save writes a `.bak` for newer layouts: more code, same safety.
- Refactor the update model now: no measured need.
- CI now: free-minutes quota; a pre-commit hook is enough.
- Build outputs in CI only: `serve.mjs` serves them from disk.
- Keep `cnames`: names a record type, not a neutral list.
- Keep `cov-*` suites and the 100% target: coverage-driven, overlapping.
