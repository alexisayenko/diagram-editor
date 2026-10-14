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
  Open: 2 SonarCloud bugs (S9383, promises not awaited in
  `engine/browser/app.js`) and the quality gate.

## C2 — Service CNAME

Bounded: show the DNS alias clients use for a service. Concept only,
not implemented.

- Lives in: `docs/product/concepts/`
- Source spec: [`product/concepts/service-cname.md`](product/concepts/service-cname.md)
