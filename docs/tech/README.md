# Tech

Stack, infrastructure, and architectural decisions. The "how it
runs" layer — what's used to build and operate the product.
Product / business / UX live in their own sections.

## Common slots

Don't pre-create — extract on first real entry. See
[Section, file, folder](../README.md#section-file-folder).
([`ci-cd.md`](ci-cd.md) is the one scaffolded file here.)

- **`stack.md`** — the v1 stack: framework, hosting, storage,
  payments, language, etc., with rationale per pick.
- **[`refactoring-recommendations.md`](refactoring-recommendations.md)** —
  reviewed findings merged into a wave roadmap (security, structure,
  formats), with owner decisions.
- **`architecture.md`** — system overview, data flow, key
  components.
- **`ci-cd.md`** (scaffolded) — CI/CD playbook: manual workflows, test layers,
  cost model, deploy and mobile release paths, secrets, setup
  checklist, starter workflow files.
- **[`decisions/`](decisions/README.md)** — ADRs, one `adr-NNNN-<slug>.md`
  per decision (index and template in its README). Substantive
  architectural decisions with date, alternatives considered,
  rationale. Don't delete superseded decisions — mark them
  superseded and add the new one.
  - Open each ADR with a status line: `Status: Proposed | Accepted
    | Superseded by ADR-NNNN · YYYY-MM-DD` and the commit (or task) it serves.
  - Record a later change as a dated **Amendment** section in the
    same file; don't rewrite the decision in place, so the trail
    stays readable.
  - The tech and UI/UX decision logs
    ([`../ui-ux/README.md`](../ui-ux/README.md)) are numbered
    separately.

## Deploy and CI

No deploy target and no CI workflows yet; the engine runs locally.
Tests: `node --test engine/test/*.test.mjs` (WSL, 762 tests; see
[ADR-0010](decisions/adr-0010-test-strategy.md)). Checks before a commit
(`package.json` scripts, `tools/hooks/pre-commit`):
[ci-cd.md](ci-cd.md#local-checks-and-the-pre-commit-hook). SonarCloud analyses
every push ([ADR-0011](decisions/adr-0011-static-analysis-sonarcloud.md)).
[`ci-cd.md`](ci-cd.md) is the scaffolded playbook and holds a proposed
minimal workflow; its `[TODO: ...]` placeholders apply only if a
workflow is added.

## Known gaps

- SonarCloud: a failing quality gate (3 bugs, 3 vulnerabilities, 158
  code smells, analysed at 2789813)
  ([ADR-0011](decisions/adr-0011-static-analysis-sonarcloud.md)).
- `package.json` sets `engines.node >= 22` only; no `.nvmrc`, no CI.
- The legacy Mermaid path and its CDN-loading `index.html` are still
  built (decision D1 in the
  [recommendations](refactoring-recommendations.md#5-decisions)).
- Service CNAME is a concept only
  ([`../product/concepts/service-cname.md`](../product/concepts/service-cname.md)).

## Open questions

- How to show a service CNAME on the diagram (card label or movable
  panel); see the concept.
