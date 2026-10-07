# Authoring a diagram

Open `diagram.html` in desktop Edge or Chrome. Press **Open folder**, grant folder access, and select a TOML file. If folder access is unavailable from a file URL, run `node engine/serve.mjs` and open the printed localhost address. No infrastructure data is sent to the server; it serves only the engine page. Web fonts use the existing Google Fonts URL.

The engine arranges the diagram automatically. Press **Edit layout**, drag servers or regions, then **Save layout** in the page toolbar. `my-diagram.toml` saves to `my-diagram.layout.json` in the same folder. Reopening restores that file. Browser storage is not used for TOML layout drafts.

Edit the TOML in your text editor, then press **Reload TOML**. Stable object ids retain their positions; removed objects disappear; new ones are placed automatically. Service and IP text geometry is refreshed and regions grow as needed. Spacing conflicts are marked red in edit mode. Unsaved edits must be saved or reset before leaving edit mode; switching diagrams or reloading asks before discarding edits.

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

- Diagram: `title` required; `id` defaults to the TOML filename without its extension. Diagram ids use lowercase letters, digits and hyphens. Keep the id stable.
- Regions: `id`, `title`, `server_type`; optional `proposed = true`. Empty regions are allowed.
- Servers: `id`; optional `name` (defaults to id), `region`, `server_type` (inherits the region's type), `services` and `ips` (string arrays), `os`, `details` (Markdown string), `proposed` (boolean). A standalone server requires `server_type`.
- Types: `web`, `application`, `interface`, `external`, `cache`, `oracle`, `mongo`, `nas`, `statistics`.
- Object ids start with a letter and contain letters, digits, underscores or hyphens. They are unique across servers and regions.
- Connections: `from`, `to` (server or region ids); optional `label`, `firewall`, `proposed`, `from_service`, `to_service`. A service endpoint must match exactly one service by prefix. One connection per directed endpoint pair; self-connections are unsupported.

This dependency-free parser supports an explicit **TOML subset**: top-level keys, `[[regions]]`, `[[servers]]`, `[[connections]]`, single-line basic or literal strings, booleans, string arrays (including multiline arrays and trailing commas), and comments. Use `\n` inside double-quoted `details` strings for paragraphs. Other TOML constructs, including nested tables, inline tables, numbers, dates and triple-quoted strings, are rejected. Unknown keys and duplicate ids are errors. The full synthetic example is `examples/demo/demo.toml`.

## Layout files

Save writes geometry only: schema version, diagram id, region/server positions and sizes, text positions, and connection overrides. It never rewrites the TOML. The saved file can be copied with the TOML to another computer. The page detects external changes to the layout file and stops a save rather than overwriting those changes; use **Download** in edit mode to retain your draft, then reload.

Canceling folder permission, malformed TOML, or invalid saved geometry leaves the current diagram open. A failed save keeps edits in memory. Saving succeeds only after the file stream closes. Use **Download** as a manual backup when direct saving is unavailable. Folder permission may need to be granted again after closing the page.

## Engine development

Run `node engine/browser.mjs` after changing the engine; it regenerates the standalone `diagram.html`. Use `node engine/browser.mjs --check` to check drift and `node --test engine/test/*.test.mjs` for the TOML and browser workflow tests.

The existing Mermaid-folder build (`node engine/build.mjs examples/demo`) remains available. It requires its existing `layout.json`; the TOML page is the new authoring workflow.
