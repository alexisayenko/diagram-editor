# Concerns

Cross-cutting axes the project organizes work around — orthogonal
to sections (`brand/`, `business/`, `tech/`, etc.). Each concern
carries an ID (`C1`, `C2`, …) so it can be referenced
unambiguously in conversation and frontmatter.

A concern captures a real-world unit of work that touches multiple
sections. Two common shapes:

- **Persistent layers** — product capabilities that live on once
  shipped. Example: a *subscription layer* touches business
  (pricing, legal terms), ui-ux (paywall screens), features
  (unlock, restore), and tech (billing integration, entitlement
  storage). Stays in play across the lifetime of the product.
- **Bounded release goals** — coherent bodies of work that close
  on a release event. Example: *first release on App Store*
  touches tech (stack picks, build pipeline), product
  (concepts + features), ui-ux (polish), brand (icons, store
  listing), business (pricing, store metadata). Concern closes
  once shipped; subsequent app-store work goes under a new
  concern (`v2 launch`, etc.).

Both shapes are referenced the same way — task frontmatter
(`concern: C2 - Subscription layer`). Persistent concerns
accumulate tasks indefinitely; bounded concerns close once their
event ships.

Concerns cut across spec sections: a single concern draws on
multiple sections simultaneously. That's why they live at the
top of `docs/`, not inside any one section.

Per-concern roll-ups live alongside as `tasks/C1.md`,
`tasks/C2.md`, …, regenerated when underlying task frontmatter
changes — see [`tasks/README.md`](tasks/README.md).

When a new area of work appears that doesn't fit any existing
concern, add a new `Cn` here first, then start tagging tasks
against it.

---

## C1 — Self-service diagram editor

Persistent layer: building, editing, saving and exchanging a diagram
in the page, with no real data in the repo. Spans tech (engine,
format, local server), product (feature specs) and tools (host
probe).

- Lives in: `engine/`, `tools/`, `examples/`
- Source spec: [`product/features/self-service.md`](product/features/self-service.md)
- Quality: tests and coverage
  ([ADR-0010](tech/decisions/adr-0010-test-strategy.md)); SonarCloud
  ([ADR-0011](tech/decisions/adr-0011-static-analysis-sonarcloud.md)).
  Open: the SonarCloud quality gate (3 bugs, 3 vulnerabilities, 158
  code smells, analysed at 2789813); the new findings are not triaged.

## C2 — Service CNAME

Bounded: show the DNS alias clients use for a service. Concept only,
not implemented.

- Lives in: `docs/product/concepts/`
- Source spec: [`product/concepts/service-cname.md`](product/concepts/service-cname.md)

## C3 — Security hardening

Persistent layer: treat `.diag.zip` files and diagram text as untrusted.
Status: the planned hardening is done (2026-10-14); residual risks stay
open, so the concern stays open.

- Lives in: `engine/serve.mjs`, `engine/lib/`, `engine/browser/`,
  `engine/page/`, `tools/`
- Source: [BP-01 to BP-06, BP-12 and BP-23](tech/refactoring-recommendations.md#3-prioritised-roadmap),
  [ADR-0001](tech/decisions/adr-0001-no-infra-data-in-repo.md),
  [ADR-0004](tech/decisions/adr-0004-local-server-storage.md)
- Decisions: D3 and D4 in the recommendations (section 5).
- Fixed:
  - Diagram frame: CSP meta with `connect-src 'none'`, so an imported
    archive cannot call the local API (fd56c47).
  - Server: CSP, `Referrer-Policy`, `nosniff`, CORP and
    `frame-ancestors 'none'` on every response; Host, Origin and
    `Sec-Fetch-Site` checks on every request; early 413 by
    `Content-Length`; request and header timeouts (fd56c47).
  - Files: case-insensitive duplicates and Windows device names refused
    in the store and the zip reader (421b026); staged all-or-nothing
    saves with rollback (524d13f).
  - Host probe: `os-release` read with an allow-list instead of
    `eval`, control characters stripped (421b026).
  - Legacy `index.html` (`mermaid` and `marked` pinned with SRI in c8fba34): deleted with the legacy path
    ([ADR-0017](tech/decisions/adr-0017-retire-the-legacy-mermaid-and-markdown-pipeline.md)).
  - The no-infrastructure-data rule is checked by
    `tools/check-no-infra-data.mjs` and the pre-commit hook (524d13f).
  - Tests: `fuzz-security.test.mjs`, `store-staged.test.mjs`.
- Residual risks (open):
  - The frame is same-origin without a `sandbox` attribute; `sandbox`
    needs the `postMessage` host interface first (D4).
  - CSP allows inline script and style, which the single-file page
    needs, and Google Fonts.
  - The hook can be skipped with `--no-verify`; there is no CI.

## C4 — Format versioning

Persistent layer: a diagram folder, layout and archive written today
must open tomorrow, and a newer file must fail with a clear message.
Status: `format_version` and the layout version policy are done
(524d13f, [ADR-0014](tech/decisions/adr-0014-format-versioning-and-error-model.md));
the rest is open: naming and unit rules, archive manifest, aliases for C2
(Wave 3).

- Lives in: `engine/parse/`, `engine/browser/render.mjs`, `engine/lib/`
- Source: [DM-01, DM-02, DM-05, AR-10](tech/refactoring-recommendations.md#3-prioritised-roadmap),
  [authoring.md](tech/authoring.md#format-versioning)
- Decisions: D2 and D5 in the recommendations (section 5).
- Done: `format_version` string in `topology.toml` (absent = 1, a newer
  value is refused); a layout `version` is always written, a newer
  layout opens with an automatic arrangement and Save leaves it alone.
- Open: minimal layout under version 2 (DM-05), strict unit grammar
  (DM-10), aliases key (DM-19), archive allow-list (DM-18).
