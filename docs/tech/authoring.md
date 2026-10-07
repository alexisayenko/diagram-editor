# Authoring a diagram

Run `node engine/serve.mjs` and open the printed address (any modern browser, including Firefox). The toolbar has three buttons: **Import TOML/JSON**, **Export** and **Save**. Import takes one or more files (a TOML and, optionally, its `<name>.layout.json`; they are paired by name). On page load the most recently modified stored diagram opens automatically; with none stored, the welcome panel shows. Uploaded files are stored in the git-ignored `local/` folder next to the server under their original names (letters, digits, dot, dash and underscore only; `.toml` or `.json`). If a stored file with the same name differs, you are asked before it is replaced. Opening `diagram.html` straight from disk works in memory only: files import, but Save is unavailable; **Export** still works. No infrastructure data leaves your machine. Web fonts use the existing Google Fonts URL.

The engine arranges the diagram automatically. Press **Edit layout**, drag servers or regions, then **Save** in the page toolbar. Save is enabled only while there are unsaved changes (layout or notes); there is no autosave. `my-diagram.toml` saves to `my-diagram.layout.json` in `local/`. Reopening restores that file. Browser storage is not used for TOML layout drafts.

**Export** downloads both files to your browser's download folder as `<name>-<yyyymmdd-hhmmss>.toml` and `<name>-<yyyymmdd-hhmmss>.layout.json` (the original name plus a timestamp), including unsaved note edits. The server is not involved.

Edit the TOML in your text editor (in `local/`), then reload the page (the most recently modified stored diagram opens; to open another TOML, import it). Stable object ids retain their positions; removed objects disappear; new ones are placed automatically. Service and IP text geometry is refreshed and regions grow as needed. Spacing conflicts are marked red in edit mode. Unsaved edits (layout or notes) must be saved or reset before leaving edit mode; switching diagrams, reloading or closing the tab asks before discarding them.

## Editing notes in the page

- **Add note** (top of the Notes panel) opens a new card as a multi-line editor. Clicking inside any note card turns it into the same editor. The text uses the note format below: first line = title, optional `Date: <stamp>` line, then the body.
- **Done**, clicking outside the card or Ctrl+Enter commits; **Esc** cancels; **Delete** removes the note after a confirmation. An empty title, a missing body or a bad `Date:` line shows a message and keeps the editor open.
- Edited notes count as unsaved changes. **Save** then writes both `<name>.layout.json` and, when notes changed, the TOML. Only the top-level `notes` value is replaced; if the file has no `notes` key, one is added after the last top-level key (before the first `[[table]]`); deleting every note removes the key. Every other byte of the TOML (comments, key order, whitespace, line endings, BOM, `[[documents]]`) is left untouched. Notes are written as an array of multi-line basic strings (`"""`) with quotes, backslashes and control characters escaped.
- Safety: the page sends the text it loaded as the expected base of each file; if either file on disk changed since, the server answers 409, nothing is written and the page says so (use **Export**, then reload the page). Writes go to a temporary file and are renamed into place. If the second file fails after the first was written, the message names what was saved and what was not.

## Editing servers in the page

- Click a server's header (or its **Edit** button, or the server-type badge) to open its details panel, then click the name to edit. The panel becomes a form: name (inline title), the server-type badge (click it to pick another type from the built-in and `[[server_types]]` types), OS, Hardware, Role, and list fields (IPs, DNS, Jobs, RMI services, systemd services) as editable rows with **Add ...** and a remove button per row. A **Notes** field appears when the server has `details`. `id` and region are not editable here; legacy `services` stay in the file untouched.
- **Done** or Enter commits (Ctrl+Enter in Notes); **Esc** or **Cancel** discards. The name must be non-empty and unique, IPs must be IPv4 with a prefix (the parser's rule), DNS entries must be host names, entries are single-line; problems show inline and the form stays open. While the form has changes, other selections are refused with a message.
- Committing re-renders the diagram: the server keeps its saved position and its box is resized to its text (name width, IP line count); the edit is held in memory as an unsaved change (Save enables; leaving the page asks).
- **Save** rewrites only the changed keys of that `[[servers]]` table (found by `id`): a changed value is replaced in place (comments, key order and untouched keys stay); a key whose value became empty is removed with its line; a new key is appended after the table's last key. Multi-line `details` is written as a `"""` string, lists keep their single-line or multi-line style, and CRLF and BOM are preserved. The result is re-parsed and checked against the edit before anything is written; the 409 base check applies as for notes.

## Drawing on the diagram

- The toolbar has **Select**, **Pencil**, **Eraser**, **Undo** and **Redo**. **Pencil** draws free-hand strokes (mouse, pen or touch); its popover offers five colours (default blue, readable on light and dark skins) and three widths (2, 4, 8 px). **Eraser** removes the whole stroke under the pointer, by click or drag. **Select** or **Esc** returns to the normal mode. While Pencil or Eraser is active, servers and regions do not drag, clicks do not select, and canvas panning is off (the wheel still zooms).
- **Ctrl+Z** undoes and **Ctrl+Y** (or Ctrl+Shift+Z) redoes the last drawing action: a stroke, or one erase gesture. The history lasts until the page reloads.
- Strokes live in the diagram's coordinate space, so they pan and zoom with it, and are smoothed (quadratic curve) on display. Points are rounded to 1 decimal and near-duplicates dropped.
- Drawings are saved in `<name>.layout.json` as a `drawings` array, not in the TOML: `{ "id": "d1", "color": "#3b82f6", "width": 2, "points": [[x, y], ...] }` (`color` is `#rrggbb`, `width` 0.5-40, ids are unique). A missing `drawings` key means none, so older layouts load unchanged; unknown top-level layout keys are kept on Save. An invalid entry makes the layout fail to load with `Invalid saved drawing N`.
- Drawing changes count as unsaved (Save enables; the discard prompt and the reload / close guard apply), and **Save** and **Export** include them. Edits to the TOML never touch them. **SVG** / **PNG** export includes the strokes; for `engine/build.mjs` folders a `drawings` array in `layout.json` appears in `layout.html` and as `freedraw` elements in the `.excalidraw` scene (the TOML page has no Excalidraw export).

## TOML format

```toml
id = "my-diagram"
title = "Example infrastructure"

[[regions]]
id = "app"
title = "Application Servers"
server_type = "application"

[[servers]]
id = "app01"
name = "app-01.example.test"
region = "app"
services = ["Tomcat: demo-api", "Job 104 import"]
ips = ["192.0.2.11/24"]
os = "Ubuntu 24.04"

[[servers]]
id = "db01"
name = "db-01.example.test"
server_type = "oracle"
services = ["Oracle 19c"]
ips = ["192.0.2.21/24"]

[[connections]]
from = "app01"
to = "db01"
label = "TCP · SQL*Net"
from_service = "Job 104"
firewall = true
```

- Notes: optional top-level `notes`, a string or an array of strings, one note card each in the page's Notes panel (visible without selecting a server). The first line is the card title; an optional `Date: <stamp>` line may follow (default `Note`); the rest is the body. A note needs a title and body text.
- Documents: optional `[[documents]]` tables feed the Related documents panel: `title` and `url` (http or https) required, `description` optional. Order is kept.
- Diagram: `title` required; `id` defaults to the TOML filename without its extension. Diagram ids use lowercase letters, digits and hyphens. Keep the id stable.
- Regions: `id`, `title`, `server_type`; optional `proposed = true`. Empty regions are allowed.
- Servers: `id`; optional `name` (defaults to id), `region`, `server_type` (inherits the region's type), `services` (string array, shown in the box), `ips` (IPv4 CIDR strings), `os`, `hardware`, `role` (strings), `dns` (host names), `jobs`, `rmi_services`, `systemd_services` (string arrays), `details` (free-text Markdown string, shown as "Notes" in the editor), `proposed` (boolean). A standalone server requires `server_type`. The details panel shows OS / Hardware / Role as a table, then IPs, DNS, Jobs, RMI services and systemd services as lists, then `details`.
- Types: built in are `web`, `application`, `interface`, `external`, `cache`, `oracle`, `mongo`, `nas`, `statistics`. Optional `[[server_types]]` tables add types or override a built-in by `id`: `id` (lowercase letters, digits, hyphens; not `proposed`), `label`, `color` (`#rrggbb`, the light-skin colour), optional `dark` (`#rrggbb`, defaults to `color`), `infra` (legend placement after the proposed entry) and `db` (database-style box). A new type needs `label` and `color`; an override may give only the fields it changes. Regions and servers may use any merged type; an unknown `server_type` is an error listing the known ids.
- Object ids start with a letter and contain letters, digits, underscores or hyphens. They are unique across servers and regions.
- Connections: `from`, `to` (server or region ids); optional `label`, `firewall`, `proposed`, `from_service`, `to_service`. A service endpoint must match exactly one service by prefix. One connection per directed endpoint pair; self-connections are unsupported.

This dependency-free parser supports an explicit **TOML subset**: top-level keys, `[[regions]]`, `[[servers]]`, `[[connections]]`, basic or literal strings (single-line, or multi-line `"""` / `'''`), booleans, string arrays (including multiline arrays and trailing commas), and comments. Use `\n` inside double-quoted `details` strings for paragraphs. Other TOML constructs, including nested tables, inline tables, numbers and dates, are rejected. Unknown keys and duplicate ids are errors. The full synthetic example is `examples/demo/demo.toml`.

## Shared networks

Optional `local/networks.toml` (git-ignored, beside the diagrams, shared by every diagram; a synthetic sample is `examples/networks.toml`) lists network segments as `[[networks]]` tables: `cidr` (IPv4 or IPv6 CIDR with the network address, e.g. `192.0.2.0/24`, `2001:db8::/32`), `name`, optional `description`. It is read-only in the page and edited by hand. The page loads it automatically with the diagram; a missing file is fine (no Networks panel). An invalid or duplicate `cidr` shows a message naming the entry (`networks[2] (192.0.2.0/24): ...`) and the diagram opens without networks.

The relation is derived: each server IP (a host prefix such as `/24` is ignored) belongs to the most specific (longest-prefix) network containing it, and a server is listed under every network one of its IPs falls in (multi-homed servers appear in each). IPs in no network are "unassigned network". The Networks panel lists the networks (nested by containment) with their server counts plus an "Unassigned network" row when needed; clicking a row filters the diagram; a server's details panel shows its network name after each IP. **Import TOML/JSON** accepts the file too (detected by the name `networks.toml`, or `[[networks]]` without `[[servers]]` / `[[regions]]`), validates it and stores it as `local/networks.toml` (same name rules and 2 MB cap). **Export** does not include it.

## Layout files

Save writes the geometry file: schema version, diagram id, region/server positions and sizes, text positions, connection overrides and, when there are any, `drawings`. The TOML is rewritten only when notes or servers changed, and only those values (see above). Copy both files to another computer to move a diagram.

Malformed TOML or invalid saved geometry leaves the current diagram open. A failed save keeps edits in memory. Use **Export** or **Download** (edit mode) as a manual backup.

## Local server API

`node engine/serve.mjs` (port 8080, or `PORT`) binds 127.0.0.1 only and serves the engine page plus a small JSON API over `local/`. Every response is `Cache-Control: no-store`; requests with a foreign `Host`, `Origin` or `Sec-Fetch-Site` are refused (403).

- `GET /api/files` lists `{ files: [{ name, size, mtime }] }`.
- `GET /api/file?name=<name>` returns `{ name, text }` (404 if missing).
- `PUT /api/files` (`application/json`) takes `{ files: [{ name, text, base }] }`, 1 to 8 files. `base` is the text the page loaded (`null` = the file must not exist); if any file on disk differs the answer is 409 with `conflicts` and nothing is written. `overwrite: true` replaces `base` (used for uploads). Each file is written to a temp file and renamed; a failure returns 500 with the names already `saved`.
- Names must match `^[A-Za-z0-9][A-Za-z0-9._-]*[.](toml|json)$` (no `..`, no separators, at most 100 characters); each file is at most 2 MB.

## Engine development

Run `node engine/browser.mjs` after changing the engine; it regenerates the standalone `diagram.html`. Use `node engine/browser.mjs --check` to check drift and `node --test engine/test/*.test.mjs` for the TOML and browser workflow tests.

The existing Mermaid-folder build (`node engine/build.mjs examples/demo`) remains available. It requires its existing `layout.json`; the TOML page is the new authoring workflow.
