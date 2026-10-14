# ADR-0004: Server-side storage in `local/` via a loopback-only API

Status: Accepted · 2026-10-07
Commit: fe7f783

## Context

The page must open and save diagram folders. The File System Access
API (folder picker) works only in Chromium browsers, and the first
folder-picker version needed fixes (1f6ac9e).

## Decision

- `node engine/serve.mjs` serves the page and a small JSON API over
  the git-ignored `local/` folder, one sub-folder per diagram:
  `GET /api/files`, `GET /api/file`, `PUT /api/files`.
- It binds to `127.0.0.1` only and refuses a foreign `Host`,
  `Origin` or `Sec-Fetch-Site` (403). Responses are `no-store`.
- File names pass an allowlist (letters, digits, `.`, `-`, `_`;
  `.toml` or `.json`; no `..`); 2 MB per file, 256 files per call.
- `PUT` checks everything first: each file carries `base`, the text
  the page loaded (`null` = must not exist). Any difference answers
  409 and nothing is written. Writes go to a temp file and are
  renamed into place.
- Without the server (`diagram.html` from disk) the page works in
  memory; **Export** is the way out.

## Consequences

- Works in every modern browser, including Firefox.
- A local process must run; the page cannot save on its own.
- The 409 check protects hand edits made in an editor meanwhile.

## Alternatives

- File System Access API: Chromium only, permission prompts on
  every session.
- Download-only: no round trip, user shuffles files by hand.
- Browser storage: invisible to the user's editor and git.

## Amendment 2026-10-13

The folder picker, brought back on 2026-10-08 (63aab11), was removed
again in 57d6ecb: **Open saved diagram**, **New diagram** and
**Import diagram** replace it.

## Amendment 2026-10-14

A name that collides with an existing file or folder (for example
`a/b.toml` when `a` is a file) is answered with 400 and a clear
message. It was an unhandled 500 before 4996b5c.
