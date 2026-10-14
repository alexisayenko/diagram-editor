# Refactoring recommendations

Status: proposal · 2026-10-14 · baseline commit fdbd033. Nothing here is
decided; the owner decisions in section 5 gate the big items.

## 1. Purpose and how to read it

Five independent reviews of the engine (code design, architecture,
DRY/KISS, best practices and security, data model and formats) were
merged into one roadmap. The raw reviews are not in the repo, so every
finding below carries the evidence needed to check it. IDs keep their
review prefix: `CD` code design, `AR` architecture, `DK` DRY/KISS,
`BP` best practices, `DM` data model.

How to read: start with section 2 (themes), pick work from section 3
(waves), settle section 5 (decisions) before Wave 2, look up any ID in
section 6.

Baseline numbers (2026-10-14):

- 628 tests, all green on the reviewed commit; 99.8% lines and 96.8%
  branches covered ([ADR-0010](decisions/adr-0010-test-strategy.md)).
  `node engine/browser.mjs --check` and
  `node engine/build.mjs examples/demo --check` both pass.
- SonarCloud: about 172 open issues, many intentionally left
  ([ADR-0011](decisions/adr-0011-static-analysis-sonarcloud.md)). The
  DK review counted 113 through the API with a narrower filter; the
  mix is mostly S7721 (move function to outer scope) and S7761 (use
  `dataset`).
- No CI yet; a local SonarCloud scan is deferred
  ([ci-cd.md](ci-cd.md#deferred-local-sonarcloud-scan)).
- Size: about 6.8k engine lines in 61 files, 9.1k test lines in 45
  files, of which 29 are `cov-*` coverage suites.

Verification: the top findings were re-checked against the code on this
date (file and line evidence below is confirmed unless marked
"reported"). Corrections made to the reviews:

- BP review said 669 tests; the real count is 628.
- BP-04: the 8 MB request cap is at `engine/serve.mjs:18`
  (`MAX_BYTES * 4`), not :15; the lookbehind of BP-17 is at
  `engine/runtime/ui/details.js:71`, not :70.
- CLAUDE.md says one bundle test fails and the demo `layout.html` is
  stale; both `--check` runs are green, so the claim is stale (AR-12,
  DK-16, BP-24, DM-20 agree).
- Timings in AR-06 (41 ms for 7 servers, 421 ms for 407) and the
  contrast ratios in BP-15 were measured or estimated by the reviewers
  and not re-measured here.
- A test run on the dirty working tree showed failures while the
  OS-badge work was in flight; the 628/628 baseline is the reviewers'
  clean run, not reproduced here.

## 2. Executive summary

Overall: a small, careful, zero-dependency engine with unusually good
tests. The weak spots are structural (two render pipelines, one
536-line page script), defensive (no CSP, unpinned CDN code in the
legacy output) and evolutionary (no format version). Seven themes:

1. **One render pipeline instead of two** (AR-01, CD-02, DK-01, AR-03,
   DK-09). `engine/build.mjs:34-80` and `engine/browser/render.mjs:60-109`
   run the same 12-step chain (parse, meta, auto layout, route, types,
   OS info, SVG, edge key, view box, data JSON, page). They already
   differ: only build validates geometry; the networks code exists
   twice (`parse/networks.mjs` and `parse/shared-networks.mjs`).
   Excalidraw and `index.html` work only on the legacy path.
2. **Retire or isolate the legacy Mermaid/markdown path** (AR-02, DK-01,
   DK-13, DK-16). About 900 source lines, 570 test lines and about
   9.4k lines of demo artefacts serve a superseded format
   ([ADR-0002](decisions/adr-0002-toml-subset-parser.md)), yet render
   code imports `edgeKey` from `parse/mmd.mjs` and round-trips the TOML
   config through `JSON.stringify` into `parseConfig`
   (`engine/browser/render.mjs`, about line 77).
3. **Split the `app.js` god-script** (CD-01, AR-07, DK-08, DM-15, CD-03,
   CD-05, DK-06). `engine/browser/app.js` is 536 lines with an untyped
   `active` bag, four copy-pasted dialogs, a 250 ms poll
   (`app.js:522`), six identical try/catch bridges and direct reaches
   into iframe modules (`frame.contentWindow.InfraDiagram.modules[...]`).
4. **Security hardening of the iframe, server and legacy output**
   (BP-01 to BP-06, BP-12). The diagram iframe is same-origin
   `srcdoc` with no `sandbox` and no CSP (`app.js:70,294`; the page is
   served with only `Cache-Control` and `nosniff`, `serve.mjs:11`).
   `index-html.mjs` loads `marked` with no version or SRI and puts
   `details.md` raw into a `<script>` block. No exploit was found:
   escaping is consistent today; this is defence in depth.
5. **Format versioning and layout policy** (DM-01, DM-02, DM-05, AR-10,
   DM-18, DM-19). `topology.toml` and the archive have no version, and
   unknown keys are hard errors, so a newer file looks corrupt to an
   older engine. The layout accepts a missing `version` and strips
   nested unknown fields on the next Save.
6. **Shared helpers instead of re-implemented rules** (DK-02 to DK-06,
   DK-10, DK-12, DM-11, DM-12, DM-20, AR-11). The server field list
   lives in 4 places, id and slug rules in 5, file-name constants in
   3 to 4, TOML escaping in 3 variants, char-width constants in 6.
7. **Bundler and tooling robustness** (AR-04, AR-05, CD-07, BP-22,
   BP-23, BP-24, AR-12, BP-18, BP-19). `engine/browser.mjs` is a regex
   bundler that handles only one-line named imports and forks
   `lib/util.mjs`; there is no `package.json`, hook, lint or CI; the
   "no infrastructure data" rule is policy only; five fake-DOM
   harnesses overlap.

Two cross-cutting themes follow from these: error handling (CD-05,
DM-07, DM-08: one typed `FormatError`, no regex-stripped `TOML: `
prefixes) and the structural model (DM-03, DM-04: stop encoding
presentation in the model and re-parsing it).

## 3. Prioritised roadmap

Rules for every item: one commit per step; run
`node --test engine/test/*.test.mjs`, `node engine/browser.mjs --check`
and `node engine/build.mjs examples/demo --check` through WSL; fix any
doc the change makes wrong in the same commit. Effort: S under half a
day, M a day or two, L several days. Generated outputs
([ADR-0012](decisions/adr-0012-generated-outputs-committed.md)) must
stay byte-identical unless the item says otherwise.

### Wave 0: quick wins and security (all S, mostly independent)

| IDs | What | Why | Effort / risk | Protected by | Needs |
| --- | --- | --- | --- | --- | --- |
| BP-01 | CSP meta into the iframe `srcdoc` (`default-src 'none'`, inline script and style, data/blob images, `connect-src 'none'`) | Imported `.diag.zip` is untrusted; same-origin frame can reach `PUT /api/files` | S-M / low | `cov-app-*`, new test: hostile text fields stay escaped | D4 |
| BP-03, BP-04 | Response headers (CSP, `Referrer-Policy`, `frame-ancestors 'none'`, CORP); run `checkOrigin` on every request; reject oversize early by `Content-Length`; set request timeouts | Clickjacking, uniform guard, free hardening | S / low | `store.test`, `cov-cli-serve-browser`; add Host and Origin edge cases | none |
| BP-02 | `index-html.mjs`: pin `mermaid` and `marked` with SRI, escape `</script` in embedded markdown, allow only http(s) links | Unpinned CDN code and raw HTML; moot after D1 | S-M / low | `cov-parse-legacy`, `build --check` | D3 |
| BP-05 | Host probe: replace `eval "$text"` (`tools/host-probe.sh:93`) with a key allow-list parser; strip control chars in `esc()` (:54) | Probe advertises "read-only" | S / low | `host-probe.test` | none |
| BP-06 | Git-ignore or delete the untracked `.tmp-old/` | `git add -A` foot-gun (not in `.gitignore`) | S / none | `git status` | none |
| BP-12 | Case-insensitive duplicate names (store, zip); refuse Windows reserved names (`con.toml`); `validName` accepts them today | Silent overwrite on Windows/macOS | S / low | `store.test`, `cov-lib-zip` | none |
| BP-10, BP-11 | `AbortSignal.timeout` on API fetch; `unhandledrejection` handler; show the HTTP status instead of "server is not reachable" | Stuck server leaves buttons disabled | S / low | `cov-app-*` | none |
| BP-17 | Document minimum browser versions (lookbehind at `details.js:71` needs Safari 16.4) | Undocumented hard parse error | S / none | none | none |
| DK-17, DK-13 | Drop 19 test-less `export`s, dead `LAYOUT` (`app.js:22`), the `legacyId` chain, `jobLines` alias | Dead code | S / none | full suite | none |
| AR-12, DK-16, BP-24, DM-20 | Fix stale claims (CLAUDE.md "one test fails", "627 tests", demo `layout.html` stale, `AUTHORING.md` name); `.gitattributes` `-diff` for generated files | Doc rot, review noise | S / none | `--check` runs | none |
| DM-06 | Layout `diagramId` mismatch becomes a warning (`render.mjs:22`) | Folder rename or import under another name breaks opening | S / low | `cov-app-render` | none |

### Wave 1: foundations (enable the later waves)

| IDs | What | Why | Effort / risk | Protected by | Needs |
| --- | --- | --- | --- | --- | --- |
| DM-01, AR-10 | `format_version` in `topology.toml` (absent = 1), clear "needs a newer engine" error, written by new-diagram; archive carries it through `topology.toml` | Unblocks every later schema change and the aliases feature | S / low | `toml.test`, `archive` tests | D2 |
| DM-02 | Layout: `version` required on write; newer file opens with auto layout and locks Save (or writes `.bak`) | Downgrade loses data today | S / low | `cov-app-render` | D5 |
| CD-05, DM-07, DM-08 | One `FormatError {file, line, path, message}`; libraries throw, only CLIs exit; add file names to messages; delete the `util.mjs` stub's `fail` fork | 9 regex strip sites, `fail` exits in Node but throws in the page | M / low | `cov-parse-toml-errors`, `server-write`, `store.test` | none |
| DK-02, DK-04, DK-05, DM-11, DM-12 | Small shared modules: `tomlEscape`, `slug`/`ids.mjs`, `lib/files.mjs` (file-name constants), `net.mjs` (IP/CIDR) | Same rule in 3 to 5 places | S each / low | toml-write, import-servers, archive, networks tests | none |
| DK-03, DM-20, AR-11 (start) | One `SERVER_FIELDS` table feeding parser, writer, form, docs and a drift test | Field list in 4 places; docs omit `cpu`, `ram` | S-M / low | `server-write`, `cov-ui-server-edit` | none |
| DK-06 | `guarded()` wrapper for the six bridge functions in `app.js` | Removes the repeated `editBlocked` + try/catch | S / low | `cov-app-import-edit` | CD-05 |
| AR-04, CD-07, AR-05 | Honest bundler: node-free `lib/text.mjs`, graph-derived entry list, multi-line imports, shell markup to files, kit registry plus a purity test | Silent breakage on style changes; `esc` differs build vs browser | M / medium | `browser.mjs --check`, new bundler test | none |
| BP-22, BP-23, BP-15 | Minimal `package.json` (`test`, `check`, `cover`, `serve`, `engines`), pre-commit hook, `tools/check-no-infra-data.mjs`, contrast test | No entry point, rule not enforced | S-M / low | the checks themselves | D7 |
| BP-08 | Staged multi-file save (write and fsync all temps, then rename; rollback on failure; sweep leftovers) | `store.mjs:87-97` leaves TOML and layout inconsistent on a mid-way error | M / low-medium | `store.test` with injected fs failure | none |
| BP-21 | Server security tests (Host and Origin variants, body cap +1), zip bomb and mutation fuzz, `parseToml` round-trip | Pins the hardening before refactors | M / none | new tests | none |

### Wave 2: structural refactors (after D1 and D6)

| IDs | What | Why | Effort / risk | Protected by | Needs |
| --- | --- | --- | --- | --- | --- |
| AR-01, CD-02, DK-01 (pipeline), AR-03, DK-09 | `renderModel(...)` in one pipeline module; `build.mjs` and `render.mjs` become loaders; one networks implementation | Every feature otherwise built twice | L / medium | `build --check`, `diagram.html --check`, `cov-app-render` | Wave 1 bundler, D1 |
| AR-02, DK-01 (legacy) | Move `edgeKey`, config normalise, OS, notes text into a model layer; then convert-and-delete or keep import-only | Legacy modules are load-bearing utilities | M then L / low then medium | `cov-parse-legacy`, `cov-cli-build-new` | D1 |
| AR-08 | Layered folders (`source`, `edit`, `model`, `layout`, `render`, `page`, `app`, `server`) enforced by an import-direction test | `parse/validate.mjs` imports the render kit | M / low | new `layering.test.mjs` | AR-02 |
| CD-01, AR-07, DK-08, DM-15 | Split `app.js`: `api`, `session`, `dialogs`, `frame-bridge`, wiring; host interface instead of module lookups; event instead of the 250 ms poll | God-script, invisible state shape | L / medium | `cov-app-*` (5 files) | AR-04 |
| CD-03 | `core.host` and `core.on/emit` instead of 11 overwritable hooks and the `window.InfraDiagram.*` globals | Second writer silently overwrites the first | M / medium | `cov-ui-*`, `context-menu.test` | none |
| DM-03, DM-04 | Structural server model; card and details markdown become render functions; one documented IR vocabulary | OS is parsed back out of generated markdown | M / medium | card, details, exports tests | AR-01 |
| CD-04, CD-06, DK-10 | `kit.boxFor`, one `METRICS`, `keys.mjs` (`nodeKey`, `parseKey`), readable meta field names, in one regeneration window | Metrics in 3 places; `"n:"` built 30 times, parsed 26 | M-L / medium | `region*.test`, `--check` diffs | none |
| AR-06, AR-13 | Measure first (300 servers, 600 connections), then page shell plus scene swap, then incremental routing | Every edit reloads about 300 KB and loses zoom and selection | M-L / medium | new perf test | D6 |
| BP-14 | Native `<dialog>`, keyboard on server and region nodes, arrow-key nudge | No focus trap; selection looks mouse-only (reported) | M / medium | fake DOM gains `dialog` | CD-01 |

### Wave 3: nice to have (opportunistic)

| IDs | What | Effort | Needs |
| --- | --- | --- | --- |
| DM-05, DM-09, DM-10, DM-17 | Minimal layout under version 2; naming rules and aliases; strict unit grammar; warnings channel | M each | DM-01, DM-02 |
| DM-19, AR-11 | `aliases` key expanded into one IR list for the Service CNAME concept; field and skin registries | S to L | DM-01, D10 |
| DM-13, AR-09, DM-18 | API `code` fields, idempotent replay, delete and rename, archive allow-list and reproducible order | M | Wave 1 |
| DM-14, DK-12 | Probe golden test, probe-managed keys, one `parseOs` | M | none |
| DK-07, CD-08, CD-09, CD-10, DK-15, DM-16, DM-21 | DOM helper and signature clean-ups, `toml.mjs` split | S-M each | none |
| BP-18, BP-19, BP-20, BP-13, BP-07, BP-09, BP-16, AR-14, DK-11, DK-14 | Test-harness merge, SVG goldens, headless smoke, perf budget, zip nits, Sonar tuning (exclude `engine/test/**`) | S-L | D11 |

## 4. Per-principle view

Grades are the reviewers' (code design, architecture) with my spot
checks; "after" is the expected grade once the listed items land.

| Principle | Now | After | Evidence | Items |
| --- | --- | --- | --- | --- |
| SRP | B- | A- | Parse, render and page modules are focused; `app.js`, `core.js`, `toml.mjs` are not | CD-01, CD-10, AR-07 |
| Open/closed | C+ | B+ | A new server field edits 5 files; a new runtime module edits `RUNTIME`, `GENERATED` and the entry list | DK-03, AR-11, AR-04 |
| Liskov | A- | A- | Almost no inheritance | none |
| Interface segregation | C | B | `core` exports 15 members, mutable `ctx` and `hooks` | CD-03, DM-15 |
| Dependency inversion | C | B | Runtime reads a global; `app.js` reaches into iframe modules; `build.mjs` is a script | CD-03, AR-01, DM-15 |
| DRY | B | A- | Low text duplication (0 six-line clones) but the same rule re-implemented in many places | DK-02 to DK-06, DK-10, DM-11 |
| KISS | B- | B+ | Two pipelines, JSON round trip, `Function.toString()` kits | AR-01, AR-05, DM-03 |
| YAGNI | B- | A- | Legacy surface, `legacyId`, 41 needless exports | DK-01, DK-13, DK-17 |
| Separation of concerns | C+ | B+ | Parser builds markdown and card text; `validate` imports the render kit | DM-03, AR-08 |
| Law of Demeter | C | B | `frame.contentWindow.InfraDiagram.modules["canvas/model"].state.on` | DM-15, CD-03 |
| Fail fast | B+ | A- | Strict key checks; but unit strings fall back silently and 13 `catch (_)` swallow errors | DM-10, DM-17, BP-10 |
| Least astonishment | C+ | B+ | `fail` exits or throws by context; `name` means three things; `sd` label for `disk` | DM-08, DM-09, CD-06 |
| Error handling | C+ | B+ | Three styles, `TOML: ` prefix stripped by regex in 9 places | CD-05, DM-07, DM-08 |
| Security | B | A- | Good loopback and zip checks; no CSP, unpinned CDN | BP-01 to BP-05 |
| Accessibility | C+ | B | No focus trap; muted text about 3.5:1 in Swiss (estimated) | BP-14, BP-15, BP-16 |
| Testability | B+ | A- | 628 tests, but five fake-DOM harnesses and coverage-driven names | BP-18, BP-19, CD-01 |
| Tooling and DX | C | B+ | No `package.json`, hook, lint, CI or version | BP-22, BP-23 |

## 5. Decisions needed from the owner

1. **Legacy Mermaid/markdown pipeline** (AR-02, DK-01, BP-02). Options:
   a) delete now; b) keep import-only with a one-off converter to the
   TOML folder, then delete; c) keep both. Recommend b: it ends the
   double maintenance and the only CDN dependency without stranding
   old folders. Blocks Wave 2.
2. **Format version key** (DM-01). Options: a) integer
   `format_version = 1` (needs integer support in the TOML subset,
   [ADR-0002](decisions/adr-0002-toml-subset-parser.md)); b) string
   `format_version = "1"`; c) none. Recommend b: strict, no parser
   change. Absent means 1.
3. **CDN code in `index.html`** (BP-02). Options: a) pin versions with
   SRI; b) drop `marked` and reuse the engine's `md()`; c) leave it
   until D1 removes the file. Recommend a as a Wave 0 stopgap, then c.
4. **CSP and sandbox for the diagram iframe** (BP-01, BP-03). Options:
   a) CSP meta plus server headers; b) `sandbox` attribute; c) both.
   Note `sandbox` without `allow-same-origin` breaks the parent bridge
   (`contentWindow` access). Recommend a now, and b only after the host
   interface (DM-15) moves to `postMessage`.
5. **Layout version and downgrade policy** (DM-02, DM-05). Options:
   a) newer file opens read-only with a warning; b) Save writes a
   `.bak` first; c) preserve nested unknown fields. Recommend a, plus
   version 2 only when the minimal layout lands.
6. **Update model: keep full `srcdoc` re-render or shell plus scene**
   (AR-06). Options: a) keep; b) refactor now; c) benchmark first,
   refactor only if 150 servers feels slow. Recommend c: reviewer
   numbers show about 200 ms at 157 servers without connections.
7. **Tooling without CI** (BP-22, BP-23). Options: a) `package.json`
   scripts, a `tools/hooks/pre-commit` and a manual workflow later;
   b) add a CI workflow now; c) nothing. Recommend a, given the GitHub
   Actions free-minutes quota.
8. **Committed generated outputs** (ADR-0012, AR-12). Options: a) keep,
   mark `-diff` in `.gitattributes`; b) generate in CI only. Recommend
   a: `serve.mjs` serves `diagram.html` straight from disk.
9. **Id case policy** (DM-11). Options: a) lowercase only for new ids,
   read leniently; b) forbid uppercase; c) leave. Recommend a, with a
   case-insensitive uniqueness check (Windows and macOS collide).
10. **Alias key for Service CNAME** (DM-19). Options: a) `cnames` as in
    the concept; b) neutral `aliases`, expanded into one model list.
    Recommend b, shipped after D2.
11. **Test strategy shift** (BP-18, BP-19). Options: a) keep `cov-*`
    and the 100% target; b) add SVG goldens and a headless smoke, merge
    the harnesses, rename by area. Recommend b after Wave 2; amend
    ADR-0010.

Wave 2 needs ADRs for: one pipeline and model, legacy fate, bundling,
update model, format versioning, server API, CI (ADR-0013 and up).

## 6. Findings index

| ID | Title | Wave |
| --- | --- | --- |
| AR-01 | Two ingestion pipelines duplicate orchestration | 2 |
| AR-02 | Legacy format has no exit decision; shared helpers live in it | 2 |
| AR-03 | Duplicated network model | 2 |
| AR-04 | Hand-rolled regex bundler is load-bearing | 1 |
| AR-05 | Dual module systems and `Function.toString()` kits | 1 |
| AR-06 | Every edit re-renders the whole page into `srcdoc` | 2 |
| AR-07 | `app.js` is a 536-line non-module script | 2 |
| AR-08 | Layering inversions in `parse/` | 2 |
| AR-09 | Storage API thin on integrity; no delete or rename | 3 |
| AR-10 | No format versioning or archive marker | 1 |
| AR-11 | Extensibility by editing source tables | 3 |
| AR-12 | Committed outputs, stale docs, no CI | 0 |
| AR-13 | Runtime script duplicated into every page and export | 2 |
| AR-14 | Mini DI through `ctx` and hooks | 3 |
| BP-01 | Same-origin iframe without CSP or sandbox | 0 |
| BP-02 | `index.html` loads unpinned CDN code and raw markdown | 0 |
| BP-03 | Missing response headers | 0 |
| BP-04 | Host check only on `/api`; body cap enforced late | 0 |
| BP-05 | Host probe `eval` and unescaped control characters | 0 |
| BP-06 | `.tmp-old/` untracked and not ignored | 0 |
| BP-07 | Zip reader nits (local vs central name, bomb test) | 3 |
| BP-08 | Multi-file save not transactional | 1 |
| BP-09 | Two-tab conflicts are safe but silent | 3 |
| BP-10 | 250 ms poll and swallowed errors | 0 |
| BP-11 | Fetch has no timeout | 0 |
| BP-12 | Case-insensitive and Windows reserved names | 0 |
| BP-13 | No performance budget test | 3 |
| BP-14 | Keyboard and focus gaps | 2 |
| BP-15 | Colour contrast and reduced motion | 1 |
| BP-16 | Tooltip-only information | 3 |
| BP-17 | Browser compatibility undocumented | 0 |
| BP-18 | Five duplicated fake-DOM harnesses | 3 |
| BP-19 | Coverage-driven tests miss real-browser behaviour | 3 |
| BP-20 | Flakiness risks (timers, temp dirs) | 3 |
| BP-21 | Missing fuzz and server security tests | 1 |
| BP-22 | No `package.json`, lint, hooks, CI, version | 1 |
| BP-23 | Infra-data rule not enforced mechanically | 1 |
| BP-24 | Generated outputs can drift unchecked | 0 |
| CD-01 | `app.js` god-script with ad-hoc session | 2 |
| CD-02 | Two build pipelines diverge | 2 |
| CD-03 | Hidden runtime dependencies and shared mutable state | 2 |
| CD-04 | Kits duplicate constants and formulas | 2 |
| CD-05 | Inconsistent error-handling contract | 1 |
| CD-06 | Stringly-typed keys, cryptic meta fields | 2 |
| CD-07 | Bundler forks `util`; shell markup in a template | 1 |
| CD-08 | Duplicated DOM helpers; `var` in runtime | 3 |
| CD-09 | Long positional parameter lists | 3 |
| CD-10 | `toml.mjs` mixes validators, parser, model | 2 |
| DK-01 | Legacy path still carried (about 900 lines) | 2 |
| DK-02 | TOML escaping implemented three ways | 1 |
| DK-03 | Server field list in 4 places | 1 |
| DK-04 | Slug and id sanitising in 5 places | 1 |
| DK-05 | File-name constants declared 3 to 4 times | 1 |
| DK-06 | `TOML: ` strip and try/catch wrapper repeated | 1 |
| DK-07 | DOM helper, clipboard, download duplicates | 3 |
| DK-08 | Four dialogs with duplicated plumbing | 2 |
| DK-09 | Two CIDR parsers | 2 |
| DK-10 | Char-width and rounding constants duplicated | 2 |
| DK-11 | Two TOML edit helper styles | 3 |
| DK-12 | OS-name logic spread over four files | 3 |
| DK-13 | Speculative config (`legacyId`, `proposedLabel`, constants) | 0 |
| DK-14 | Remaining Sonar smells by rule | 3 |
| DK-15 | Complexity hot spots and flag parameters | 3 |
| DK-16 | Comment and doc rot | 0 |
| DK-17 | 41 needless `export`s | 0 |
| DM-01 | No format version for folder or archive | 1 |
| DM-02 | Layout version policy loses data | 1 |
| DM-03 | Parse layer builds and re-parses presentation | 2 |
| DM-04 | Mermaid-shaped model, split vocabulary | 2 |
| DM-05 | Layout persists derived data | 3 |
| DM-06 | `diagramId` check breaks rename and copy | 0 |
| DM-07 | Error quality and location | 1 |
| DM-08 | `fail` exits or throws; mixed conventions | 1 |
| DM-09 | Key naming inconsistencies | 3 |
| DM-10 | Units as free strings, silent fallback | 3 |
| DM-11 | Id grammars duplicated and inconsistent | 1 |
| DM-12 | Three IP/CIDR parsers | 1 |
| DM-13 | API replay not idempotent, errors not machine-readable | 3 |
| DM-14 | No executable probe contract | 3 |
| DM-15 | Coupling through globals and the iframe | 2 |
| DM-16 | Inconsistent module API style | 3 |
| DM-17 | No warnings channel; illegal states representable | 3 |
| DM-18 | Archive contract gaps | 3 |
| DM-19 | Service CNAME fit and naming | 3 |
| DM-20 | Doc, code and test drift | 0 and 1 |
| DM-21 | Smaller items (duplicate row-height constants, notes round trip) | 3 |

## 7. What is good and must be kept

- Zero dependencies, ESM, deterministic generated outputs with
  `--check` ([ADR-0012](decisions/adr-0012-generated-outputs-committed.md)).
- The loopback server: bind to 127.0.0.1, Host, Origin and
  `Sec-Fetch-Site` checks, JSON-only writes, strict name allow-list,
  temp file plus rename, compare-before-write conflicts (409).
- The hardened zip reader: path rules, entry and size caps enforced
  while inflating, CRC check, Zip64 and encryption refused.
- Surgical TOML write-back with round-trip verification
  ([ADR-0003](decisions/adr-0003-diagram-folder-surgical-writeback.md)),
  strict per-file key allow-lists, unknown layout keys preserved.
- The shared `geometryKit`: build time and edit mode route and fit
  identically. Keep the idea; enforce it (AR-05).
- The `InfraDiagram.define` contract checks in `assets.mjs` (declared
  dependencies, order, exports): strong guard for a hand-made module
  system.
- Injectable factories (`createStore`, `createApp`, `handleApi`) and
  tests on port 0.
- Escaped embedded JSON (`<`), http(s)-only links with
  `rel="noopener"`, read-only bounded host probe.
- 628 fast tests at high coverage, the bug-first skipped-test rule, and
  the ADR trail.
