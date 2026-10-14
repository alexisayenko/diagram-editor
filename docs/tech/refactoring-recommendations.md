# Refactoring recommendations

Status: Wave 0 and Wave 1 done, Wave 2 started (pipeline and `app.js`
split done) · 2026-10-14 · plan written at commit fdbd033, numbers
re-measured at 2789813. The owner decided all eleven items of section 5
on 2026-10-14 ([ADR-0013](decisions/adr-0013-adopt-refactoring-roadmap.md)).

## 1. Purpose and how to read it

Five independent reviews of the engine (code design, architecture,
DRY/KISS, best practices and security, data model and formats) were
merged into one roadmap. The raw reviews are not in the repo, so every
finding below carries the evidence needed to check it. IDs keep their
review prefix: `CD` code design, `AR` architecture, `DK` DRY/KISS,
`BP` best practices, `DM` data model.

How to read: start with section 2 (themes), pick work from section 3
(waves), read section 5 (decisions, settled), look up any ID in
section 6.

Numbers now (2026-10-14, commit 2789813, measured in WSL):

- 762 tests, 0 failed, 0 skipped. Coverage of all files: 99.78% lines,
  97.02% branches, 97.43% functions
  ([ADR-0010](decisions/adr-0010-test-strategy.md)).
  `node engine/browser.mjs --check` and
  `node engine/build.mjs examples/demo --check` both pass.
- SonarCloud (public measures, analysed revision 2789813, the current
  commit): 3 bugs, 3 vulnerabilities, 158 code smells, 0.0% duplication,
  quality gate failed
  ([ADR-0011](decisions/adr-0011-static-analysis-sonarcloud.md)). The
  new bugs and vulnerabilities have not been triaged yet.
- No CI yet; a local SonarCloud scan is deferred
  ([ci-cd.md](ci-cd.md#deferred-local-sonarcloud-scan)). A pre-commit
  hook and `package.json` scripts exist
  ([ci-cd.md](ci-cd.md#local-checks-and-the-pre-commit-hook)).
- Size: about 7.3k lines of `.mjs` and `.js` in 82 engine files (7.7k
  lines in 101 files with CSS and HTML), 10.8k test lines in 70 files
  (63 test files, 7 helpers; 27 are `cov-*.test.mjs` coverage suites).

At review (commit fdbd033): 628 tests, 99.8% lines, 96.8% branches;
SonarCloud about 172 open issues (the DK review counted 113 through the
API with a narrower filter; mostly S7721 and S7761); about 6.8k engine
lines in 61 files and 9.1k test lines in 45 files.

Verification at review time: the top findings were re-checked against
the code on that date (file and line evidence below is confirmed unless
marked "reported"). Corrections made to the reviews:

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
legacy output) and evolutionary (no format version). This section
describes the state at review; section 6 has the status of each finding.
Seven themes:

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
| BP-02 | `index-html.mjs`: pin `mermaid` and `marked` with SRI, escape `</script` in embedded markdown, allow only http(s) links | Unpinned CDN code and raw HTML; moot after D1: the file and the CDN scripts are deleted in [ADR-0017](decisions/adr-0017-retire-the-legacy-mermaid-and-markdown-pipeline.md) | S-M / low | `cov-parse-legacy`, `build --check` | D3 |
| BP-05 | Host probe: replace `eval "$text"` (`tools/host-probe.sh:93`) with a key allow-list parser; strip control chars in `esc()` (:54) | Probe advertises "read-only" | S / low | `host-probe.test` | none |
| BP-06 | Git-ignore or delete the untracked `.tmp-old/` | `git add -A` foot-gun (not in `.gitignore`) | S / none | `git status` | none |
| BP-12 | Case-insensitive duplicate names (store, zip); refuse Windows reserved names (`con.toml`); `validName` accepts them today | Silent overwrite on Windows/macOS | S / low | `store.test`, `cov-lib-zip` | none |
| BP-10, BP-11 | `AbortSignal.timeout` on API fetch; `unhandledrejection` handler; show the HTTP status instead of "server is not reachable" | Stuck server leaves buttons disabled | S / low | `cov-app-*` | none |
| BP-17 | Document minimum browser versions (lookbehind at `details.js:71` needs Safari 16.4) | Undocumented hard parse error | S / none | none | none |
| DK-17, DK-13 | Drop 19 test-less `export`s, dead `LAYOUT` (`app.js:22`), the `legacyId` chain, `jobLines` alias | Dead code | S / none | full suite | none |
| AR-12, DK-16, BP-24, DM-20 | Fix stale claims (CLAUDE.md "one test fails", "627 tests", demo `layout.html` stale, `AUTHORING.md` name); `.gitattributes` `-diff` for generated files | Doc rot, review noise | S / none | `--check` runs | none |
| DM-06 | Layout `diagramId` mismatch becomes a warning (`render.mjs:22`) | Folder rename or import under another name breaks opening | S / low | `cov-app-render` | none |

Status: **done** (2026-10-14). Evidence per item:

| IDs | Commit | Result |
| --- | --- | --- |
| BP-05, BP-12 | 421b026 | Probe reads `/etc/os-release` with an allow-list instead of `eval` and strips control characters; names that differ only in case are duplicates; Windows device names and trailing dot or space are refused (`lib/names.mjs`, store and zip) |
| BP-01, BP-03, BP-04, BP-10, BP-11, DM-06, BP-17 | fd56c47 | CSP meta in the frame; response headers, Host and Origin check on every request, early 413, request timeouts; API fetch timeout, `unhandledrejection` handler, HTTP status in errors; layout `diagramId` mismatch is a warning; browser versions in [authoring.md](authoring.md#browser-support) |
| BP-02, DK-13, DK-17 | c8fba34 | `mermaid` and `marked` pinned with SRI, embedded markdown escaped, http(s) links only; dead exports, `LAYOUT` and the `legacyId` chain removed; empty diagram gets a default view box |
| BP-06, AR-12, DK-16, BP-24, DM-20 | b1bbb42 and the doc passes after it | `/.tmp*/` git-ignored; generated files marked `-diff`; stale claims in CLAUDE.md, AGENTS.md and the docs fixed |

Not changed: the page shell text still names `AUTHORING.md` (the file is
`docs/tech/authoring.md`); it lives in `engine/page/shell.html`, so fixing it
regenerates `diagram.html`.

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

Status: **done** (2026-10-14), all in 524d13f
([ADR-0014](decisions/adr-0014-format-versioning-and-error-model.md),
[ADR-0015](decisions/adr-0015-shared-helpers-and-server-field-table.md)).

| IDs | Result | Deferred |
| --- | --- | --- |
| DM-01, AR-10 | `format_version` string in `topology.toml`, absent = 1, newer value gives "needs a newer engine"; New diagram writes it; the archive carries it through that file | none |
| DM-02 | Layout `version` always written; a newer layout opens with auto layout and Save does not write it (D5, option a) | none |
| CD-05, DM-07, DM-08 | One `FormatError {file, line, path, message}` in `parse/errors.mjs`; libraries throw, `runCli` (`lib/cli.mjs`) prints and sets the exit code | `browser.mjs` and `serve.mjs` do not catch `FormatError` yet; `tomlModel` errors for server files still lack file names |
| DK-02, DK-04, DK-05, DM-11, DM-12 | `parse/toml-escape.mjs`, `lib/ids.mjs`, `lib/files.mjs`, `lib/net.mjs` | file-name literals in `serve.mjs` and `store.mjs`; `DIAGRAM_ID` copies in `new.mjs` and `parse/config.mjs` |
| DK-03, DM-20, AR-11 (start) | `render/server-fields.mjs` (`SERVER_FIELDS`) feeds parser, writer, form and details table; `server-fields.test.mjs` fails on docs drift | generating the docs table from `SERVER_FIELDS` |
| DK-06 | `guarded()` in `browser/edits.mjs` | none |
| AR-04, CD-07, AR-05 | `page/bundle.mjs` derives the entry list and follows multi-line imports; `lib/text.mjs` is Node-free; shell markup in `page/shell.html` and `shell.css`; `page/kits.mjs` registry plus `kits.test.mjs` purity scan | the `lib/util.mjs` to `lib/text.mjs` alias can go once every browser module imports `text.mjs` |
| BP-22, BP-23, BP-15 | `package.json` scripts, `tools/hooks/pre-commit`, `tools/check-no-infra-data.mjs`, `contrast.test.mjs` | pairs below 4.5:1 (below): EOL orange on the card in Sketch and Clean (3.19), muted text in Swiss (3.45); none below 3:1 |
| BP-08 | Staged multi-file save with rollback and leftover sweep in `lib/store.mjs` | none |
| BP-21 | `fuzz-security.test.mjs` (Host, Origin and `Sec-Fetch-Site` variants, body cap and one byte more, zip bomb, archive and TOML mutation fuzz, round trips) and `store-staged.test.mjs` (injected fs failures) | none |

### Wave 2: structural refactors (after D1 and D6)

| IDs | What | Why | Effort / risk | Protected by | Needs | Status |
| --- | --- | --- | --- | --- | --- | --- |
| AR-01, CD-02, DK-01 (pipeline), AR-03, DK-09 | `renderModel(...)` in one pipeline module; `build.mjs` and `render.mjs` become loaders; one networks implementation | Every feature otherwise built twice | L / medium | `build --check`, `diagram.html --check`, `cov-app-render` | Wave 1 bundler, D1 | Done in 2789813 ([ADR-0016](decisions/adr-0016-one-render-pipeline-and-split-page-app.md)): `render/pipeline.mjs` (`renderModel`); `build.mjs` and `browser/render.mjs` are loaders. Done with D1 ([ADR-0017](decisions/adr-0017-retire-the-legacy-mermaid-and-markdown-pipeline.md)): the `networks.md` tree parser and the `networks.kind` switch are deleted, one networks implementation (`parse/shared-networks.mjs`) remains; CIDR parsing is shared (`lib/net.mjs`). |
| AR-02, DK-01 (legacy) | Move `edgeKey`, config normalise, OS, notes text into a model layer; then convert-and-delete or keep import-only | Legacy modules are load-bearing utilities | M then L / low then medium | `cov-parse-legacy`, `cov-cli-build-new` | D1 | AR-02 done: `engine/model/` (`edges`, `config`, `notes`, `os`, `server`, `server-fields`) holds the shared utilities; the legacy parsers (`mmd`, `details`, `networks`) depend only on it; DK-01 (convert-and-delete) done in [ADR-0017](decisions/adr-0017-retire-the-legacy-mermaid-and-markdown-pipeline.md): the legacy parsers (`mmd`, `details`, `documents`, `networks`, `layout`), the re-export shims (`parse/errors`, `config`, `notes`) and `page/index-html.mjs` are deleted; `build.mjs` and `new.mjs` work on TOML folders. |
| AR-08 | Layered folders (`source`, `edit`, `model`, `layout`, `render`, `page`, `app`, `server`) enforced by an import-direction test | `parse/validate.mjs` imports the render kit | M / low | new `layering.test.mjs` | AR-02 | Done: `layering.test.mjs` with an import-direction table; `parse/validate.mjs` moved to `render/`, `lib/errors.mjs` is the leaf. One allow-listed pair: `render/pipeline.mjs` imports `page/data.mjs` and `page/layout-html.mjs`. The folders `source`, `edit`, `layout`, `app`, `server` are not split out. |
| CD-01, AR-07, DK-08, DM-15 | Split `app.js`: `api`, `session`, `dialogs`, `frame-bridge`, wiring; host interface instead of module lookups; event instead of the 250 ms poll | God-script, invisible state shape | L / medium | `cov-app-*` (5 files) | AR-04 | Done in 2789813: `app.js` is wiring (167 lines, was 522); `api`, `session`, `frame-bridge`, `dialogs`, `dialog-flows`, `edits`, `save`, `messages` in `engine/browser/`. The runtime gets an explicit host object from the bridge; the toolbar state follows frame activity events instead of a poll. `engine/test/browser-modules.test.mjs` covers the new modules. |
| CD-03 | `core.host` and `core.on/emit` instead of 11 overwritable hooks and the `window.InfraDiagram.*` globals | Second writer silently overwrites the first | M / medium | `cov-ui-*`, `context-menu.test` | none | Done: `ui/core.js` declares ten services (`provide`, one provider each, a second writer throws), the events (`on` / `emit`, error-isolated) and the host (`attachHost`, once); the `window.InfraDiagram.serverEditor` / `noteParser` globals are gone. Tests: `cov-ui-host-events.test.mjs`. |
| DM-03, DM-04 | Structural server model; card and details markdown become render functions; one documented IR vocabulary | OS is parsed back out of generated markdown | M / medium | card, details, exports tests | AR-01 | Done for the runtime: `node.fields` (os, hardware parts, lists, notes) and `serverSection` renders the details markdown from it, without the OS row (the details panel renders that from the structured `e.os`); the IR table is in [architecture.md](architecture.md#ir-vocabulary). Open: the card strings (`body`, `hw`) are still built in the parser; the Mermaid-shaped names (`nodes`, `body`, `cluster`) are documented, not renamed. |
| CD-04, CD-06, DK-10 | `kit.boxFor`, one `METRICS`, `keys.mjs` (`nodeKey`, `parseKey`), readable meta field names, in one regeneration window | Metrics in 3 places; `"n:"` built 30 times, parsed 26 | M-L / medium | `region*.test`, `--check` diffs | none | |
| AR-06, AR-13 | Measure first (300 servers, 600 connections), then page shell plus scene swap, then incremental routing | Every edit reloads about 300 KB and loses zoom and selection | M-L / medium | new perf test | D6 | Measured ([performance.md](performance.md)): 400 servers and 600 connections cost 7 s in Node (routing is over 85 %, about O(n^2.3)) and about 30 s per edit in the browser (iframe reload about 20 s, zoom and selection lost); `tools/bench.mjs` and `perf.test.mjs` added. Order: route speed-ups and caching first, then scene swap. |
| BP-14 | Native `<dialog>`, keyboard on server and region nodes, arrow-key nudge | No focus trap; selection looks mouse-only (reported) | M / medium | fake DOM gains `dialog` | CD-01 | Runtime side done: servers and regions are Tab stops (`role=button`, `aria-label`, `aria-pressed`), Enter / Space select, arrow keys nudge in edit mode (Shift x10), focus ring in all skins, ARIA on the toolbar, layout group, status and pen options; tests `cov-ui-a11y`, `cov-canvas-edit-mode`. The fake DOM gained `dialog`, focus events and `:focus-visible`. Done: the page dialogs in `browser/dialogs.mjs` and the shell markup are native `<dialog>` elements opened with `showModal()` (focus trap, Escape and focus return native; test `dialogs.test.mjs`). |

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

## 5. Decisions

Status: **Decided** · 2026-10-14. The owner accepted the recommended
option of all eleven items. They are recorded in
[ADR-0013](decisions/adr-0013-adopt-refactoring-roadmap.md). Items are
still referred to as D1 to D11.

1. **Legacy Mermaid/markdown pipeline** (AR-02, DK-01, BP-02).
   Decided: b) keep import-only with a one-off converter to the TOML
   folder, then delete. Ends the double maintenance and the only CDN
   dependency without stranding old folders. Blocks Wave 2.
   Executed in [ADR-0017](decisions/adr-0017-retire-the-legacy-mermaid-and-markdown-pipeline.md): the examples are TOML, the legacy path is deleted.
2. **Format version key** (DM-01). Decided: b) string
   `format_version = "1"`: strict, no parser change. Absent means 1.
3. **CDN code in `index.html`** (BP-02). Decided: a) pin versions with
   SRI now as a Wave 0 stopgap; c) drop it with the legacy path (D1). Done in ADR-0017.
4. **CSP and sandbox for the diagram iframe** (BP-01, BP-03). Decided:
   a) CSP meta plus server headers now; b) `sandbox` only after the
   host interface (DM-15) moves to `postMessage`, because `sandbox`
   without `allow-same-origin` breaks the parent bridge.
5. **Layout version and downgrade policy** (DM-02, DM-05). Decided:
   a) a newer file opens read-only with a warning; version 2 only when
   the minimal layout lands.
6. **Update model** (AR-06). Decided: c) benchmark first; refactor
   only if 150 servers feels slow (reviewers measured about 200 ms at
   157 servers without connections).
7. **Tooling without CI** (BP-22, BP-23). Decided: a) `package.json`
   scripts and a `tools/hooks/pre-commit`; no CI yet (free-minutes
   quota).
8. **Committed generated outputs** (ADR-0012, AR-12). Decided: a) keep
   them committed and mark them `-diff` in `.gitattributes`:
   `serve.mjs` serves `diagram.html` straight from disk.
9. **Id case policy** (DM-11). Decided: a) lowercase only for new ids,
   read leniently, with a case-insensitive uniqueness check (Windows
   and macOS collide).
10. **Alias key for Service CNAME** (DM-19). Decided: b) neutral
    `aliases`, expanded into one model list; shipped after D2. The
    [concept](../product/concepts/service-cname.md) uses this key.
11. **Test strategy shift** (BP-18, BP-19). Decided: b) add SVG goldens
    and a headless smoke test, then merge the harnesses and rename by
    area, after Wave 2; amend ADR-0010 when done.

ADRs written so far: [0014](decisions/adr-0014-format-versioning-and-error-model.md)
(format versioning and errors),
[0015](decisions/adr-0015-shared-helpers-and-server-field-table.md)
(shared helpers) and
[0016](decisions/adr-0016-one-render-pipeline-and-split-page-app.md)
(pipeline and page app) and
[0017](decisions/adr-0017-retire-the-legacy-mermaid-and-markdown-pipeline.md)
(legacy pipeline retired). Still to write when they land: update model, server API, CI (ADR-0018 and up; ADR-0013 is the roadmap
decision).

## 6. Findings index

| ID | Title | Wave | Status |
| --- | --- | --- | --- |
| AR-01 | Two ingestion pipelines duplicate orchestration | 2 | done |
| AR-02 | Legacy format has no exit decision; shared helpers live in it | 2 | done: helpers in `engine/model/`, legacy path deleted (ADR-0017) |
| AR-03 | Duplicated network model | 2 | done: one networks implementation (ADR-0017) |
| AR-04 | Hand-rolled regex bundler is load-bearing | 1 | done |
| AR-05 | Dual module systems and `Function.toString()` kits | 1 | done |
| AR-06 | Every edit re-renders the whole page into `srcdoc` | 2 | measured: [performance.md](performance.md); fix open |
| AR-07 | `app.js` is a 536-line non-module script | 2 | done |
| AR-08 | Layering inversions in `parse/` | 2 | done: `layering.test.mjs` |
| AR-09 | Storage API thin on integrity; no delete or rename | 3 | open |
| AR-10 | No format versioning or archive marker | 1 | done |
| AR-11 | Extensibility by editing source tables | 3 | started: `SERVER_FIELDS` |
| AR-12 | Committed outputs, stale docs, no CI | 0 | done |
| AR-13 | Runtime script duplicated into every page and export | 2 | measured: about 170 KB of 1.5 MB per page at 400 servers ([performance.md](performance.md)); fix open |
| AR-14 | Mini DI through `ctx` and hooks | 3 | open |
| BP-01 | Same-origin iframe without CSP or sandbox | 0 | done |
| BP-02 | `index.html` loads unpinned CDN code and raw markdown | 0 | moot: the file is deleted (ADR-0017) |
| BP-03 | Missing response headers | 0 | done |
| BP-04 | Host check only on `/api`; body cap enforced late | 0 | done |
| BP-05 | Host probe `eval` and unescaped control characters | 0 | done |
| BP-06 | `.tmp-old/` untracked and not ignored | 0 | done |
| BP-07 | Zip reader nits (local vs central name, bomb test) | 3 | open |
| BP-08 | Multi-file save not transactional | 1 | done |
| BP-09 | Two-tab conflicts are safe but silent | 3 | open |
| BP-10 | 250 ms poll and swallowed errors | 0 | done |
| BP-11 | Fetch has no timeout | 0 | done |
| BP-12 | Case-insensitive and Windows reserved names | 0 | done |
| BP-13 | No performance budget test | 3 | open |
| BP-14 | Keyboard and focus gaps | 2 | done |
| BP-15 | Colour contrast and reduced motion | 1 | partial: 3 pairs below 4.5:1 |
| BP-16 | Tooltip-only information | 3 | open |
| BP-17 | Browser compatibility undocumented | 0 | done |
| BP-18 | Five duplicated fake-DOM harnesses | 3 | open |
| BP-19 | Coverage-driven tests miss real-browser behaviour | 3 | open |
| BP-20 | Flakiness risks (timers, temp dirs) | 3 | open |
| BP-21 | Missing fuzz and server security tests | 1 | done |
| BP-22 | No `package.json`, lint, hooks, CI, version | 1 | done |
| BP-23 | Infra-data rule not enforced mechanically | 1 | done |
| BP-24 | Generated outputs can drift unchecked | 0 | done |
| CD-01 | `app.js` god-script with ad-hoc session | 2 | done |
| CD-02 | Two build pipelines diverge | 2 | done |
| CD-03 | Hidden runtime dependencies and shared mutable state | 2 | done |
| CD-04 | Kits duplicate constants and formulas | 2 | open |
| CD-05 | Inconsistent error-handling contract | 1 | partial: `browser.mjs`, `serve.mjs` do not catch `FormatError` |
| CD-06 | Stringly-typed keys, cryptic meta fields | 2 | open |
| CD-07 | Bundler forks `util`; shell markup in a template | 1 | done |
| CD-08 | Duplicated DOM helpers; `var` in runtime | 3 | open |
| CD-09 | Long positional parameter lists | 3 | open |
| CD-10 | `toml.mjs` mixes validators, parser, model | 2 | open |
| DK-01 | Legacy path still carried (about 900 lines) | 2 | done (ADR-0017) |
| DK-02 | TOML escaping implemented three ways | 1 | done |
| DK-03 | Server field list in 4 places | 1 | done |
| DK-04 | Slug and id sanitising in 5 places | 1 | done |
| DK-05 | File-name constants declared 3 to 4 times | 1 | partial: `serve.mjs`, `store.mjs` literals |
| DK-06 | `TOML: ` strip and try/catch wrapper repeated | 1 | done |
| DK-07 | DOM helper, clipboard, download duplicates | 3 | open |
| DK-08 | Four dialogs with duplicated plumbing | 2 | done |
| DK-09 | Two CIDR parsers | 2 | done |
| DK-10 | Char-width and rounding constants duplicated | 2 | open |
| DK-11 | Two TOML edit helper styles | 3 | open |
| DK-12 | OS-name logic spread over four files | 3 | open |
| DK-13 | Speculative config (`legacyId`, `proposedLabel`, constants) | 0 | done |
| DK-14 | Remaining Sonar smells by rule | 3 | open |
| DK-15 | Complexity hot spots and flag parameters | 3 | open |
| DK-16 | Comment and doc rot | 0 | done |
| DK-17 | 41 needless `export`s | 0 | done |
| DM-01 | No format version for folder or archive | 1 | done |
| DM-02 | Layout version policy loses data | 1 | done |
| DM-03 | Parse layer builds and re-parses presentation | 2 | done for the runtime: `node.fields`, `serverSection`, OS row from `e.os` |
| DM-04 | Mermaid-shaped model, split vocabulary | 2 | partial: IR vocabulary documented |
| DM-05 | Layout persists derived data | 3 | open |
| DM-06 | `diagramId` check breaks rename and copy | 0 | done |
| DM-07 | Error quality and location | 1 | partial: server errors lack file names |
| DM-08 | `fail` exits or throws; mixed conventions | 1 | done |
| DM-09 | Key naming inconsistencies | 3 | open |
| DM-10 | Units as free strings, silent fallback | 3 | open |
| DM-11 | Id grammars duplicated and inconsistent | 1 | partial: `DIAGRAM_ID` in `new.mjs`, `config.mjs` |
| DM-12 | Three IP/CIDR parsers | 1 | done |
| DM-13 | API replay not idempotent, errors not machine-readable | 3 | open |
| DM-14 | No executable probe contract | 3 | open |
| DM-15 | Coupling through globals and the iframe | 2 | partial: host object done, globals stay |
| DM-16 | Inconsistent module API style | 3 | open |
| DM-17 | No warnings channel; illegal states representable | 3 | open |
| DM-18 | Archive contract gaps | 3 | open |
| DM-19 | Service CNAME fit and naming | 3 | open |
| DM-20 | Doc, code and test drift | 0 and 1 | done |
| DM-21 | Smaller items (duplicate row-height constants, notes round trip) | 3 | open |

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
- 762 fast tests at high coverage, the bug-first skipped-test rule, and
  the ADR trail.
