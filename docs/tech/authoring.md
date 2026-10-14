# Authoring a diagram

Run `node engine/serve.mjs` and open the printed address (any modern browser, including Firefox). The toolbar has these buttons: **New diagram**, **Open saved diagram**, **Import diagram**, **Import servers**, **Export**, **Save** and **Host script**. **New diagram** opens a dialog with a name field (lowercase letters, digits and hyphens, which becomes the folder name and diagram id; checked as you type, a name already stored in `local/` is refused with an inline message) and the greyed list of stored diagrams, then opens an empty diagram in memory with the generic `server`, `database` and `gateway` types; add servers with the right-click **Add Server** menu in edit mode, then **Save** writes the whole folder to `local/<name>/` (without the local server, **Export** downloads the diagram as one `.diag.zip`). Regions are added with the right-click **Add Region** menu in edit mode (or by editing `topology.toml`). If the current diagram has unsaved edits, you are asked before it is replaced. A diagram is a folder (see [Diagram folder](#diagram-folder)). **Open saved diagram** lists the diagram folders stored in the git-ignored `local/` folder behind the server (a folder counts when it has `topology.toml` or a `servers/*.toml` file), newest first, with server count and last-modified time; click a row to open it, use the filter box when there are many. Without the local server the dialog only points to **Import diagram**. **Import diagram** opens a single `.diag.zip` file from disk (see [Diagram archive](#diagram-archive)) as an unsaved in-memory diagram, like **New diagram**; dropping a `.diag.zip` on the page does the same. On page load the most recently modified stored diagram opens automatically; with none stored, the welcome panel shows. Stored files use letters, digits, dot, dash and underscore only; `.toml` or `.json`; `servers/` is the only sub-folder. Opening `diagram.html` straight from disk works in memory only: Save is unavailable; **Export** and **Import diagram** still work. No infrastructure data leaves your machine. Web fonts use the existing Google Fonts URL.

The engine arranges the diagram automatically. Press **Edit layout**, drag servers or regions, then **Save** in the page toolbar. Save is enabled only while there are unsaved changes (layout or notes); there is no autosave. The folder `my-diagram/` saves its geometry to `my-diagram/diagram.layout.json` in `local/`. Reopening restores that file. Browser storage is not used for layout drafts.

**Export** downloads the whole diagram as one `<id>-<yyyymmdd-hhmmss>.diag.zip` file, including unsaved edits (see [Diagram archive](#diagram-archive)). The server is not involved.

Edit the TOML files in your text editor (in `local/<folder>/`), then reload the page (the most recently modified stored diagram folder opens; to open another, use **Open saved diagram**). Stable object ids retain their positions; removed objects disappear; new ones are placed automatically. Service and IP text geometry is refreshed and regions grow as needed. Spacing conflicts are marked red in edit mode. Unsaved edits (layout or notes) must be saved or reset before leaving edit mode; switching diagrams, reloading or closing the tab asks before discarding them.

## Editing notes in the page

- **Add note** (top of the Notes panel) opens a new card as a multi-line editor. Clicking inside any note card turns it into the same editor. The text uses the note format below: first line = title, optional `Date: <stamp>` line, then the body.
- **Done**, clicking outside the card or Ctrl+Enter commits; **Esc** cancels; **Delete** removes the note after a confirmation. An empty title, a missing body or a bad `Date:` line shows a message and keeps the editor open.
- Edited notes count as unsaved changes. **Save** then writes `diagram.layout.json` and, when notes changed, `notes.toml` (created if missing). Only the `notes` value is replaced; if the file has no `notes` key, one is added after the last top-level key; deleting every note removes the key. Every other byte of the file (comments, key order, whitespace, line endings, BOM) is left untouched. Notes are written as an array of multi-line basic strings (`"""`) with quotes, backslashes and control characters escaped.
- Safety: the page sends the text it loaded as the expected base of each file; if any file on disk changed since, the server answers 409, nothing is written and the page says so (use **Export**, then reload the page). Writes go to a temporary file and are renamed into place. If a later file fails after an earlier one was written, the message names what was saved and what was not.

## Editing servers in the page

- Click a server's header (or its **Edit** button, or the server-type badge) to open its details panel, then click the name to edit. The panel becomes a form: name (inline title), the server-type badge (click it to pick another type from the built-in and `server-types.toml` types), OS, Hardware, Role, and list fields (IPs, DNS, Jobs, RMI services, systemd services) as editable rows with **Add ...** and a remove button per row. A **Notes** field appears when the server has `details`. `id` and region are not editable here; legacy `services` stay in the file untouched.
- **Details panel hardware strip**: a server with any of `cpu`, `ram`, `swap`, `disk` gets one line in the same form as the card, value then label separated by a middle dot (`4 cpu · 8G ram · 2G swap · 50G sd`, wrapping on a narrow panel). Stored values may be in other forms (`8 GiB`, `8192 MiB`, `4 cores`); they are shown as `<number>G` / the bare core count (`normCpu`, `normSize` and the `SIZE_UNIT` constant in `parse/toml.mjs`, one place to switch the unit to GiB or GB) without rewriting the file, and unknown formats are shown as stored. `cpu` is the number of cores, `ram` / `swap` / `disk` a size such as `8G` right after the Role/OS/Hardware table; free-text `hardware` stays in the table only. **OS pill**: shows `os` as stored, cut with an ellipsis beyond 40 characters (full text in the tooltip); EOL is recognised for the formats above and the old `PRETTY_NAME` ones.
- **Card header**: a server card shows the short host name (first DNS label of `name`; IP literals and names without a dot unchanged; the full name when two servers would show the same label) and keeps the full `name` as a tooltip and in the details panel / editor.
- **Done** or Enter commits (Ctrl+Enter in Notes); **Esc** or **Cancel** discards. The name must be non-empty and unique, IPs must be IPv4 with a prefix (the parser's rule), DNS entries must be host names, entries are single-line; problems show inline and the form stays open. While the form has changes, other selections are refused with a message.
- Committing re-renders the diagram: the server keeps its saved position and its box is resized to its text (name width, IP line count); the edit is held in memory as an unsaved change (Save enables; leaving the page asks).
- **Save** rewrites only the changed keys of that server's own file `servers/<id>.toml`: a changed value is replaced in place (comments, key order and untouched keys stay); a key whose value became empty is removed with its line; a new key is appended after the file's last key. No other file is touched. Multi-line `details` is written as a `"""` string, lists keep their single-line or multi-line style, and CRLF and BOM are preserved. The result is re-parsed and checked against the edit before anything is written; the 409 base check applies as for notes.
- **Add a server**: in edit mode right-click the canvas, a region, or anywhere else on the page except text fields; the native menu is replaced by a one-item menu **Add Server** (closes on outside click, Esc, scroll, wheel, blur or after choosing). It creates `servers/server<N>.toml` (`id`, `name = "server-<N>"`, and `region` of the smallest region under the cursor, or else `server_type`: `server` when the diagram defines that type, otherwise the first known type), places the server at the click, selects it and enables Save; Save writes the new file (no base check, it must not exist). If a note or server edit is open and invalid, nothing is added and the error shows in the toolbar message area.
- **Add a region**: in edit mode right-click empty canvas (outside every region); the menu also offers **Add Region**, which lists the server types (built-in plus `server-types.toml`) that have no region yet. Choosing one appends a `[[regions]]` table to `topology.toml` with `id` = the type id (`<type>-region`, then `-region-2`, ... when a server or region already has that id), `title` = the type's label and `server_type` = the type, places an empty 220 x 120 region with its top-left corner at the click, selects it and enables Save. Save writes the region to `topology.toml` and its position and size to `diagram.layout.json` (`clusters`), so it comes back unchanged after reload. A diagram has at most one region per server type, so the number of regions is bounded by the number of types: types that already have a region are not offered, **Add Region** is disabled ("every server type has one") when none is left, and the writer refuses a duplicate too. A hand-edited `topology.toml` that already holds two regions of one type still loads.
- **Resize a region**: in edit mode drag a region's border, corners included (nothing is drawn; the cursor turns into the matching resize cursor on the outline). Only the dragged sides move; servers stay where they are, and a region cannot shrink past its servers (with padding and header band) or below 100 x 60. The title stays centred, or follows the left / top side if you moved it. **Snap 5px** applies to the dragged edge, Shift disables it. The size is saved with the rest of the layout (`clusters` in `diagram.layout.json`, also for a region just added to an unsaved new diagram) and enables Save. Regions only grow automatically (a dragged or dropped server enlarges its region when needed) and never shrink by themselves: a manually enlarged region keeps its size when servers leave, and shrinking is done by dragging a handle.
- **Move a server between regions**: in edit mode drag a server and drop it with the pointer inside another region. The server file `servers/<id>.toml` gets `region = "<that region>"`, and when the file has its own `server_type` it is set to the region's type (otherwise the server inherits it). Dropping the pointer outside every region (judged against the regions as they were when the drag began, since a region otherwise grows to follow its server) removes `region` and writes the type the server had as an explicit `server_type`, making it a standalone server. Dropping inside the server's own region only moves it. The region it left returns to its pre-drag size; the region it joined grows around the server. Open-edit errors are handled as for **Add Server** and put the server back where the drag started.
- **Import servers**: the toolbar button (enabled while a diagram is open or newly created) loads host-probe output. Choose one or more `.toml` files (the `out/<host>.toml` snippets); each is parsed and validated like a `servers/<id>.toml` file, and a file that fails is listed by name with its error and skipped. A dialog lists the accepted files (id, name, IP count) with checkboxes, all ticked, and asks for a default **server type** (required) and an optional **region**; with a region the servers get `region = ...`, inherit its type and the type select is disabled, as in **Add Server**. An id already in the diagram (or earlier in the same import) gets a numeric suffix (`web01-2`, `web01-3`, ...) and, when the name would duplicate, the name gets a number in parentheses (`web01.example.test (2)`); such rows show "renamed to <id>". An id that breaks the object id rules is sanitized as the probe does (lowercase, other characters to `-`, trimmed, `s` prefixed before a leading digit). **Import** adds the servers as new `servers/<id>.toml` files in memory, keeping the original text and adding only the `server_type` / `region` lines (plus `id` / `name` when renamed), places them in a tidy grid at the top-left of the canvas or inside the chosen region without overlapping existing servers, enables Save and reports "N imported, M renamed, K skipped (parse errors)" in the toolbar message area. Save writes the new files (no base check, they must not exist); without the local server **Export** downloads them.
- **Duplicate a server**: in edit mode right-click a server; the menu offers **Duplicate server**. It copies the whole file `servers/<id>.toml` (every key, comments and formatting) to `servers/<id>-copy.toml` (then `-copy-2`, ...) with `id` and `name` set to `<id>-copy` and `<name>-copy` (next free suffix), keeps the region, places the copy 30 units right and below the original, selects it and enables Save. Open-edit errors are handled as for **Add Server**.

## Drawing on the diagram

- **Clearing the selection**: a click on an empty place (canvas background, bare panel areas, the page background) clears the selected server, region, connection or network and its highlight, like **Esc**. Buttons, inputs, links, dialogs, the context menu, servers, regions, connections, panel entries and resize handles do not count; a press that moves 4 px or more (pan, node drag, region resize) does not clear; with Pencil or Eraser active clicks only draw; an open server form with unsaved changes keeps the selection.
- **Display System Information** (legend, default on) shows or hides the OS pill and the hardware strip on server cards together; off shrinks the cards. The details panel always shows both.
- The toolbar has **Select**, **Pencil**, **Eraser**, **Undo** and **Redo**. **Pencil** draws free-hand strokes (mouse, pen or touch); its popover offers five colours (default blue, readable on light and dark skins) and three widths (2, 4, 8 px). **Eraser** removes the whole stroke under the pointer, by click or drag. **Select** or **Esc** returns to the normal mode. While Pencil or Eraser is active, servers and regions do not drag, clicks do not select, and canvas panning is off (the wheel still zooms).
- **Ctrl+Z** undoes and **Ctrl+Y** (or Ctrl+Shift+Z) redoes the last drawing action: a stroke, or one erase gesture. The history lasts until the page reloads.
- Strokes live in the diagram's coordinate space, so they pan and zoom with it, and are smoothed (quadratic curve) on display. Points are rounded to 1 decimal and near-duplicates dropped.
- Drawings are saved in `diagram.layout.json` as a `drawings` array, not in the TOML: `{ "id": "d1", "color": "#3b82f6", "width": 2, "points": [[x, y], ...] }` (`color` is `#rrggbb`, `width` 0.5-40, ids are unique). A missing `drawings` key means none, so older layouts load unchanged; unknown top-level layout keys are kept on Save. An invalid entry makes the layout fail to load with `Invalid saved drawing N`.
- Drawing changes count as unsaved (Save enables; the discard prompt and the reload / close guard apply), and **Save** and **Export** include them. Edits to the TOML files never touch them. **SVG** / **PNG** export includes the strokes; for `engine/build.mjs` folders a `drawings` array in `layout.json` appears in `layout.html` and as `freedraw` elements in the `.excalidraw` scene (the TOML page has no Excalidraw export).

## Diagram archive

A `.diag.zip` is a plain zip of the diagram folder with paths relative to the diagram root and no wrapper folder: `topology.toml`, `server-types.toml`, `notes.toml`, `documents.toml`, `networks.toml`, `servers/<id>.toml` and `diagram.layout.json`. **Export** writes what is in memory (unsaved edits included). **Import diagram** accepts only files whose name ends in `.diag.zip` (case-insensitive) that are valid zips; anything else is refused with "Only .diag.zip files can be opened.". The reader (`engine/lib/zip.mjs`, no dependencies, native `CompressionStream` / `DecompressionStream`) supports stored and deflate entries only and treats the file as untrusted: names with `..`, absolute paths, drive letters, backslashes or NUL, duplicates and files outside the folder layout (only `.toml` / `.json`, `servers/` as sub-folder) reject the whole archive; directory entries, `__MACOSX/` and dotfiles are skipped; encryption, zip64 and multi-disk archives are refused; limits are 500 entries, 2 MB per file, 20 MB unpacked and 20 MB archive, enforced while inflating (not from header sizes), and every entry's size and CRC-32 are verified. The diagram name is the `id` in `topology.toml` (else the file name), reduced to lowercase letters, digits and hyphens. **Save** of an imported diagram writes `local/<name>/`; if that folder already exists you are asked "Replace the saved diagram <name>?" first (files the archive lacks stay in the folder), later saves use the usual 409 base check.

## Diagram folder

A diagram is a folder; its name is the diagram's default id. Each file holds one kind of content, and a file may only hold its own keys (anything else is an error naming the file):

```text
my-diagram/
  topology.toml       id, title, [[regions]], [[connections]]   (required)
  server-types.toml   [[server_types]]
  notes.toml          notes = [ ... ]
  documents.toml      [[documents]]
  networks.toml       [[networks]]
  servers/<id>.toml   one server; the file name is the server id
  diagram.layout.json saved geometry (written by Save)
```

Only `topology.toml` is required; any other file may be absent. Other `.toml` files are rejected (`unexpected file ...`). The loader merges the files into the same model the single-file format used to produce. Servers are ordered by file name.

Legacy: a folder that has only the old `diagram.toml` still loads (it is read as `topology.toml`); opening it in the page and saving writes `topology.toml` and no `diagram.toml` copy. If both exist, `topology.toml` wins and `diagram.toml` is ignored.

`topology.toml`:

```toml
id = "my-diagram"
title = "Example infrastructure"

[[regions]]
id = "app"
title = "Application Servers"
server_type = "application"

[[connections]]
from = "app01"
to = "db01"
label = "TCP · SQL*Net"
from_service = "Job 104"
firewall = true
```

`servers/app01.toml` (the keys of one server, at the top level of its file):

```toml
id = "app01"
name = "app-01.example.test"
region = "app"
services = ["Tomcat: demo-api", "Job 104 import"]
ips = ["192.0.2.11/24"]
os = "Ubuntu 24.04"
```

`servers/db01.toml`:

```toml
id = "db01"
name = "db-01.example.test"
server_type = "oracle"
services = ["Oracle 19c"]
ips = ["192.0.2.21/24"]
```

- Notes: optional `notes.toml` with one top-level key `notes`, a string or an array of strings, one note card each in the page's Notes panel (visible without selecting a server). The first line is the card title; an optional `Date: <stamp>` line may follow (default `Note`); the rest is the body. A note needs a title and body text. Editing notes in the page rewrites this file.
- Documents: optional `documents.toml` with `[[documents]]` tables feeds the Related documents panel: `title` and `url` (http or https) required, `description` optional. Order is kept.
- Diagram: `title` required; `id` defaults to the folder name. Diagram ids use lowercase letters, digits and hyphens. Keep the id stable.
- Regions: `id`, `title`, `server_type`; optional `proposed = true`. Empty regions are allowed.
- Service groups: optional `[[service_groups]]` tables in `topology.toml` (hand-edited; the page has no editor for them and keeps them untouched when it rewrites the file). Keys: `label` (required, non-empty string; the heading in the details panel), `patterns` (required non-empty array of globs: `*` any run, `?` one character, case-insensitive, matched against the whole unit name without the `.service` suffix), optional `id`, optional `card` (boolean, default false; when at least one group has `card = true`, the server card body lists, from `systemd_services`, only the units of the flagged groups in group order, capped at 4 and "+N more", and hides the rest; with no flagged group the card is unchanged). Groups are ordered and a unit goes to the first group with a matching pattern. The details panel splits `systemd_services` into one list per non-empty group in group order. Units matching no group are intentionally hidden in the details panel (no "Other services" section); they stay in the data and can be seen in the server editor form (edit mode) or in the server's TOML file; with no groups it shows the single "systemd services" list. The `card` flag does not change the details panel, and `rmi_services` are not affected. Example: `[[service_groups]]` with `label = "Middleware"` and `patterns = ["wildfly*"]`.
- Servers: `servers/<id>.toml`. The `id` key is optional in the file; when present it must equal the file name (otherwise an error). Optional `name` (defaults to id), `region`, `server_type` (inherits the region's type), `services` (string array, shown in the box under the jobs section; the box shows `jobs` first, except entries starting with `cron:` (probe-found crontab lines stay in the file and the editor but are not drawn on the card; first 4 shown and "+N more" counts only the shown ones), a divider, then `services`, `rmi_services` and `systemd_services` (each of the last two capped at 4 and "+N more"); an empty section is omitted), `ips` (IPv4 CIDR strings), `os`, `hardware`, `role` (strings), `dns` (host names), `jobs`, `rmi_services`, `systemd_services` (string arrays), `details` (free-text Markdown string, shown as "Notes" in the editor), `proposed` (boolean). A standalone server requires `server_type`. The OS pill, the details OS cell and the Excalidraw label show a shortened form of `os` for common PRETTY_NAME strings (`Debian GNU/Linux 11 (bullseye)` shows as `Debian 11 bullseye`; the stored text, the tooltip and EOL detection are unchanged). The details panel (which omits the Jobs section; jobs other than `cron:` entries stay on the card, and all jobs stay editable in the form) shows OS / Hardware / Role as a table, then IPs, DNS, RMI services and systemd services as lists, then `details`. To add or remove a server, add or delete its file (and its connections); the page edits fields only.
- Types: built in are `web`, `application`, `interface`, `external`, `cache`, `oracle`, `mongo`, `nas`, `statistics`. Optional `[[server_types]]` tables in `server-types.toml` add types or override a built-in by `id`: `id` (lowercase letters, digits, hyphens; not `proposed`), `label`, `color` (`#rrggbb`, the light-skin colour), optional `dark` (`#rrggbb`, defaults to `color`), `infra` (legend placement after the proposed entry) and `db` (database-style box). A new type needs `label` and `color`; an override may give only the fields it changes. Regions and servers may use any merged type; an unknown `server_type` is an error listing the known ids.
- Object ids start with a letter and contain letters, digits, underscores or hyphens. They are unique across servers and regions.
- Connections: `from`, `to` (server or region ids); optional `label`, `firewall`, `proposed`, `from_service`, `to_service`. A service endpoint must match exactly one service by prefix. One connection per directed endpoint pair; self-connections are unsupported.

This dependency-free parser supports an explicit **TOML subset**: top-level keys, `[[name]]` array-of-tables headers, basic or literal strings (single-line, or multi-line `"""` / `'''`), booleans, string arrays (including multiline arrays and trailing commas), and comments. Use `\n` inside double-quoted `details` strings for paragraphs. Other TOML constructs, including nested tables, inline tables, numbers and dates, are rejected. Unknown keys and duplicate ids are errors; parse errors name the file and line (`TOML: servers/web01.toml:3: ...`). The full synthetic example is the folder `examples/demo/`.

## Collecting server facts

`tools/host-probe.sh` is a read-only Linux probe (bash, `ip`, `ss`, `systemctl`, `crontab -l`, docker/podman if present; no writes, no installs, 5 s timeouts; no environment variables or command arguments are printed). It never uses sudo and runs as the plain user (process names of other users' ports show as `?`); every command it runs is listed once in its `COMMANDS` block ([ADR-0008](decisions/adr-0008-host-probe.md)). Feed it over stdin, once per host in `hosts.txt` (one IP or DNS name per line, `#` lines are comments):

```sh
mkdir -p out
while read -r host _ || [ -n "$host" ]; do
  case "$host" in ''|'#'*) continue ;; esac
  echo "##### $host"
  ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=10 \n    "$host" 'bash -s' < tools/host-probe.sh | tee "out/$host.toml"
  echo
done < hosts.txt
```

It prints one `servers/<id>.toml` snippet: `id` and `name` from the hostname, `ips` (global IPv4 CIDRs, loopback/docker/veth skipped), `os` (distro, version and codename built from `/etc/os-release`: `Debian 11.11 bullseye`, `Ubuntu 16.04 LTS Xenial`, `Rocky Linux 9.4`; the card and details panel show it as stored), `cpu` (number of cores, e.g. "4"), `ram` and `swap` (whole GiB printed as e.g. "8G", swap omitted when 0), `disk` (root filesystem size from `df -h /`), `jobs` (`cron: <schedule> <command name>` and `timer: <unit>`), `systemd_services` (running units minus stock OS ones) and `details` (kernel, uptime, containers, and a `Listening` list of `proto/port process`). Load the `out/*.toml` files with the toolbar's **Import servers** button (see above), or add `region`, `role`, `server_type` and the `services` you want shown by hand and save each as `servers/<id>.toml`. The page header's **Host script** button opens a four-step dialog (save the script as `host-probe.sh`, create `hosts.txt`, run the loop, import the results with **Import servers**). Each command block has its own **Copy** button ("Copied" for 1.5 s); the script itself sits in a collapsed **Show script** section (embedded at build time, so it matches the file); Esc, Close or a click outside closes it. It works in view and edit mode and without the local server. Review the output before committing anything: real hostnames and IPs stay out of this repo.

```toml
id = "app-01"
name = "app-01.example.test"
ips = ["192.0.2.11/24"]
os = "Ubuntu 24.04.1 LTS"
cpu = "4"
ram = "8G"
swap = "2G"
disk = "50G"
jobs = ["cron: 0 2 * * * import.sh", "timer: demo-report.timer"]
systemd_services = ["tomcat-demo"]
details = "Kernel: Linux 6.8.0 x86_64\nCPU: 4 x Example CPU\nMemory: 8G\nUptime: up 3 weeks\nListening (proto/port process):\n- tcp/22 sshd\n- tcp/8080 java"
```

## Networks

Optional `networks.toml` in the diagram folder (a synthetic sample is `examples/demo/networks.toml`) lists network segments as `[[networks]]` tables: `cidr` (IPv4 or IPv6 CIDR with the network address, e.g. `192.0.2.0/24`, `2001:db8::/32`), optional `name` (an entry with only `cidr` is valid; an unnamed network is labelled by its CIDR), optional `description`. Edit it by hand; the page only appends to it and sets names on Save (below). The page loads it with the diagram; a missing or empty file is fine. An invalid or duplicate `cidr` makes the diagram fail to open with a message naming the entry (`networks.toml: networks[2] (192.0.2.0/24): ...`).

The relation is derived: each server IP (a host prefix such as `/24` is ignored) belongs to the most specific (longest-prefix) network containing it, and a server is listed under every network one of its IPs falls in (multi-homed servers appear in each). IPs in no network are "unassigned network". The Networks panel lists the networks (nested by containment) with their server counts plus an "Unassigned network" row when needed; clicking a row filters the diagram; a server's details panel shows its network name after each IP. 

**Derived networks.** Besides the defined networks, each IPv4 `ips` entry with a prefix of /1 to /31 implies the network with the host bits masked (`192.0.2.10/24` gives `192.0.2.0/24`); /32, IPv6 and entries without a prefix imply nothing. Derived networks appear in the Networks panel and in each server's details like defined ones, labelled by the CIDR; a defined network with the same CIDR keeps its name. An IP belongs to the longest-prefix network among the defined ones and the network of its own prefix, so a defined narrower network wins and another server's derived network never takes it. With no `networks.toml` the derived networks alone make the panel.

**Naming a network.** In edit mode, right-click a network in the Networks panel (or press Shift+F10 / the Menu key on a focused entry) and choose **Add name** (unnamed network) or **Edit name**; the entry's label turns into a text field (Enter or leaving the field commits, Esc cancels, at most 80 characters). An empty value removes the name but keeps the entry with its `cidr`. It works for defined networks and for derived ones that are not in the file yet. The change is unsaved work (it enables **Save** and is covered by the discard prompt); **Save** then changes only that entry's `name` line in `networks.toml`, or appends a `[[networks]]` table with `cidr` and `name` for a derived network, creates the file if absent and writes with the same base check and one retry as the append below. A network named in the same Save is not appended a second time.

**Auto-append on Save.** With the local server, **Save** (including after **Import servers**) appends a `[[networks]]` table with just `cidr` for every derived CIDR missing from the diagram folder's `networks.toml`, in address order after the existing content (existing entries, comments, formatting and line endings are never touched; the file is created if absent) and shows "N new networks added to networks.toml" in the toolbar. The write uses the same base check as other files; on a conflict it re-reads and retries once, then reports a message without failing the Save. Without the local server nothing is written. **Export** includes `networks.toml` as stored.

## Layout files

Save writes the geometry file `diagram.layout.json`: schema version, diagram id, region/server positions and sizes, text positions, connection overrides and, when there are any, `drawings`. TOML files are rewritten only when notes (`notes.toml`) or a server (`servers/<id>.toml`) changed, and only those values (see above). Copy the whole folder to another computer to move a diagram.

Malformed TOML or invalid saved geometry leaves the current diagram open. A failed save keeps edits in memory. Use **Export** or **Download** (edit mode) as a manual backup.

## Local server API

`node engine/serve.mjs` (port 8080, or `PORT`) binds 127.0.0.1 only and serves the engine page plus a small JSON API over `local/`. Every response is `Cache-Control: no-store`; requests with a foreign `Host`, `Origin` or `Sec-Fetch-Site` are refused (403).

- `GET /api/files` lists `{ files: [{ name, size, mtime }] }`, recursively; names are relative paths such as `my-diagram/servers/app01.toml`.
- `GET /api/file?name=<name>` returns `{ name, text }` (404 if missing).
- `PUT /api/files` (`application/json`) takes `{ files: [{ name, text, base }] }`, 1 to 256 files. `base` is the text the page loaded (`null` = the file must not exist); if any file on disk differs the answer is 409 with `conflicts` and nothing is written. `overwrite: true` replaces `base` (used when opening a folder). Each file is written to a temp file beside its target and renamed; missing folders are created; a failure returns 500 with the names already `saved`.
- Names must match `^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*){0,2}[.](toml|json)$` (no `..`, at most three path segments, at most 150 characters); each file is at most 2 MB.

## Engine development

Run `node engine/browser.mjs` after changing the engine; it regenerates the standalone `diagram.html`. Use `node engine/browser.mjs --check` to check drift and `node --test engine/test/*.test.mjs` for the TOML and browser workflow tests.

The existing Mermaid-folder build (`node engine/build.mjs examples/demo`) remains available and reads only `diagram.mmd`, `diagram.json`, `details.md`, `layout.json` and its Markdown companions, never the TOML files; the TOML page is the new authoring workflow. A folder without `layout.json` (such as one made by `engine/new.mjs`) is arranged automatically at build time; add `layout.json` to pin positions.
