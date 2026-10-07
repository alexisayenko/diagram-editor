# Spec: self-service diagrams with an infra-agnostic engine

## Goal

The owner writes a diagram's model (`diagram.mmd` + content files) himself, runs one command, and gets the view (`layout.html`), the Mermaid view (`index.html`) and the Excalidraw export. Real infrastructure data never reaches the repo or the LLM: the engine is developed and tested against synthetic demo data only.

## Hard constraints

- **Never read, list, grep or build real diagram data.** Real diagrams live outside this repo (or in git-ignored `/local/`). Do not open, list, search or pass that location to any tool or agent, and do not ask the owner to paste its contents.
- **Demo data only.** Every test, screenshot and bug reproduction uses a synthetic diagram inside this repo (see task 1). Use the RFC 5737 documentation ranges for IPs (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`) and invented host names (e.g. `app-01.example.test`). No real company, host, person or ticket names.
- **Bugs the owner reports** from real diagrams are reproduced in the demo diagram from his description, never from real files.
- **No new npm dependencies.** Output stays self-contained (single HTML file, no runtime fetches besides the existing CDN fonts/Mermaid).
- **Do not commit** unless the owner says so.

## Current state (read before starting)

- `README.md` – engine overview, module map, `define()` runtime-module rules, build/check commands.
- `TERMINOLOGY.md` – vocabulary (model, view, server, region, connection, process connection, connection group, panel, details panel, network filter, OS pill …). Use these terms in code, UI and docs.
- Build: `wsl.exe -e bash -ic 'cd /mnt/c/Alex/diagram-editor && node engine/build.mjs <dir> [--check]'`. `<dir>` may be any absolute path; outputs are written into `<dir>`.
- Today the build **fails** when a server or region in `diagram.mmd` has no geometry in `layout.json`. Connections, box sizes and region growth are already automatic.
- Repo history: The owner rewrites it to a single engine-only commit (old history archived outside the repo). Check `git log --oneline` shows one commit and that no file outside `engine/` and the root docs exists; if not, stop and ask.

## Tasks

### 1. Demo diagram `examples/demo/`

A synthetic but realistic diagram that exercises every engine feature: ≥5 regions of different server types (one empty), ~12 servers, one cluster of 3 database nodes, a NAS region, multi-IP servers, server and process connections, one connection group (red), two firewall markers, `notes.md`, `documents.md`, `networks.md` (nested tree with a CIDR-less group), OS rows incl. EOL ones, a Confluence-style link row (use `https://wiki.example.test/...`). Build + `--check` must pass. This is the fixture for all other tasks and for future engine work.

### 2. Auto-layout for missing geometry

- Servers and regions without an entry in `layout.json` get positions automatically; existing entries always win.
- Placement: regions packed in rows (reading order of `diagram.mmd`), servers in a grid inside their region, standalone servers in a final row; respect the existing spacing rules (20px box gap, 16px region padding, 30px title band + 10px gap) so the result passes validation.
- Same code at build time and in edit mode (runtime module via `define()`), so a brand-new `.mmd` opens and can be dragged into shape; "Copy/Download layout.json" then exports full geometry.
- `--check` stays deterministic (same input → same output).
- Test: delete `layout.json` from a copy of the demo → builds, no overlaps (screenshot with headless Edge as previous agents did).

### 3. Scaffold command

`node engine/new.mjs <path>` creates a new diagram folder with a minimal valid `diagram.mmd` (two regions, three servers, one connection), `diagram.json` (`id` from folder name), and empty-but-valid `details.md`, `notes.md`, `documents.md`, `networks.md`; no `layout.json` (auto-layout covers it). Refuses to overwrite an existing folder. Builds immediately.

### 4. `AUTHORING.md`

One page for the owner: the exact `.mmd` subset the engine accepts (regions/subgraphs and `#quot;` quoting, server label convention `title<br/>body…<br/>IP lines`, class/type statements and the list of types, connections incl. `· firewall`, dashed/proposed), `diagram.json` keys (incl. `groups`, `processes`), content-file formats, the workflow (scaffold → edit `.mmd` → build → arrange in edit mode → save `layout.json`), and the common build errors with fixes. Copy-paste examples use demo data only. Link from `README.md`.

### 5. Watch mode (optional, if cheap)

`node engine/build.mjs <dir> --watch` rebuilds on changes to the content files and prints errors without exiting.

### 6. Docs

Update `README.md` (module map for new files, commands) and `TERMINOLOGY.md` (e.g. "auto-layout", "scaffold") in the house terse style.

## Acceptance

- `examples/demo` builds and passes `--check`; also builds with `layout.json` removed.
- `node engine/new.mjs <tmp>/x && node engine/build.mjs <tmp>/x` works on a fresh folder.
- No real infra data anywhere in the repo, its history, screenshots or agent prompts.
- Report to the owner: commands to run on real diagrams themselves, and what to expect.
