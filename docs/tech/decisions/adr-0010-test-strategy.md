# ADR-0010: Test strategy: `node:test`, no dependencies, measured coverage

Status: Accepted · 2026-10-14
Commit: 21c15da (continued in b3cddaf, 318cb92, 4996b5c)

## Context

The engine has no `package.json` and no dependencies
([ADR-0002](adr-0002-toml-subset-parser.md)). Much of the code runs in
the browser (`engine/runtime/`, `engine/browser/app.js`). Tests that
only import Node modules never execute it, so coverage was blind
there and bugs hid in the page code.

## Decision

- Tests use the built-in `node:test` and `node:assert`. No test
  framework, no DOM library, no install step.
- Node-side modules are imported directly. Browser-side modules are
  run in a `node:vm` context against small fake DOM objects. The
  loader passes the real file as the script `filename` (a file URL
  in `cov-dom.mjs`, the path in `cov-ui-env.mjs`), so Node's coverage
  attributes the lines to the real source file.
- File names: `<topic>.test.mjs` for the first tests;
  `cov-<area>-<topic>.test.mjs` for tests added to raise coverage
  (areas: `parse`, `lib`, `canvas`, `ui`, `app`, `cli`, `export`).
  Files without `.test` are shared helpers, not run on their own:
  - `helpers.mjs`: demo folder and TOML fixtures.
  - `cov-dom.mjs`: fake elements and the `define` loader.
  - `cov-canvas.mjs`: a fake canvas page around the demo data.
  - `cov-app.mjs`: boots `app.js` with a fake `fetch` over a real
    temporary store.
  - `cov-ui-env.mjs`: a small HTML parser and selector engine for the
    `ui/*` modules.
- Coverage command (run through WSL):
  `node --test --experimental-test-coverage engine/test/*.test.mjs`.
- Targets: every engine file at 100% of lines, and branches above
  90% where a test can reach them.
- Reached on 2026-10-14 (635 tests, 0 failed, 0 skipped): all files
  99.73% lines, 96.80% branches, 97.71% functions. The report also
  lists the test files themselves.

| Area | Lines | Branches |
| --- | --- | --- |
| `lib/`, `page/`, `new.mjs` | 100% | 100% (`page/assets.mjs` 77.8%) |
| `parse/` | 99.4-100% | 92.5-100% |
| `render/`, `export/` | 97.8-100% | 88.4-100% |
| `browser/` (`app.js`, `render.mjs`) | 100% | 96.5-100% |
| `runtime/` | 100% | 94.9-100% |
| `build.mjs`, `browser.mjs` | 100% | 80% |
| `serve.mjs` | 89.2% | 94.7% |

- Rule for bugs: a bug found by a test gets a **skipped test first**
  (`test("...", { skip: "known bug: <one line>" }, ...)`), then a fix
  that removes the `skip`. The suite stays green and the bug stays
  visible. Today the only `skip` is `os-format.test.mjs`, which
  skips when `bash` is missing.
- Bugs the coverage work found, fixed in 4996b5c: the hardware strip
  separator, the Markdown renderer hanging on a `#hashtag` line, a
  crash on a second edit before the reload, a store 500 on a name that
  is a file or folder, the unchecked zip central-directory size, and
  a scaffold that could not be built.

## Consequences

- Fast (seconds), runs anywhere Node runs, no supply chain.
- The fake DOM is not a browser: layout, real events and CSS are not
  tested. Check those by hand in Edge or Chrome.
- The fakes must follow the code; a new DOM call may need a new stub.
- 100% of lines does not prove correct behaviour; assertions matter.

## Alternatives

- Jest or Vitest with jsdom: faster to write, but adds a
  dependency tree to a zero-dependency repo.
- Playwright end-to-end tests: real browser, but heavy and slow;
  not ruled out for a later UI layer.
- Testing only Node code: leaves most of the page logic untested.
