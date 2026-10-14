# Server editing

The owner adds, edits, duplicates and moves servers in the page,
and each change lands in that server's own TOML file.

## Purpose

Keep facts about a host correct without leaving the diagram.
Surgical write-back keeps hand-made comments and formatting
([ADR-0003](../../tech/decisions/adr-0003-diagram-folder-surgical-writeback.md)).

## Behaviour

- Click a server header, its **Edit** button or its type badge to
  open the details panel, then click the name to edit. The panel
  becomes a form: name, type badge picker, OS, hardware, role, and
  rows for IPs, DNS, jobs, RMI services and systemd services, plus
  Notes (the `details` text).
- **Done** or Enter commits (Ctrl+Enter in Notes); **Esc** or
  **Cancel** discards. While the form has changes, selecting
  something else is refused.
- Commit re-renders the server and counts as an unsaved change.
- **Save** rewrites only the changed keys of `servers/<id>.toml`.
- Edit mode, right-click:
  - **Add Server** on the canvas or a region: creates a new file,
    placed at the click, in that region if any.
  - **Duplicate server** on a server: copies the file as
    `<id>-copy`, placed 30 units away.
  - **Add Region** on empty canvas: offers the server types that
    have no region yet.
- Drag a server and drop it in another region: its `region` (and
  inherited type) change. Drop it outside every region: `region` is
  removed and the type is kept explicitly.
- Drag a region border to resize; it never shrinks past its servers.
- Card: header shows the short host name (first DNS label);
  jobs, then services, in two sections; OS pill and hardware strip
  follow **Display System Information**. OS names are shortened for
  display only. Service groups can filter the card
  ([ADR-0007](../../tech/decisions/adr-0007-service-groups-card-flag.md)).

## Data keys

`name`, `server_type`, `region`, `os`, `hardware`, `role`, `ips`,
`dns`, `jobs`, `rmi_services`, `systemd_services`, `details`,
`cpu`, `ram`, `swap`, `disk`, `proposed`. Reference:
[authoring.md](../../tech/authoring.md#diagram-folder).

## Edge cases

- Name must be non-empty and unique; IPs must be IPv4 with a prefix;
  DNS entries must be host names; list entries are single-line.
  Problems show inline and the form stays open.
- `id` and region are not editable in the form; legacy `services`
  stay untouched.
- Unknown size formats (`8 GiB`, `4 cores`) are shown normalised
  but stored as written.
- A region holds one server type, and a diagram has at most one
  region per type.
- If the file changed on disk, Save answers 409 and writes nothing.

## Known limits

- The Notes (`details`) text shows a small Markdown subset: headings,
  paragraphs, lists, tables, `code`, **bold** and http(s) links. No
  nested lists, italics or images. A line like `#tag` (no space after
  `#`) is plain text.
- Right after **Save** the page reloads the diagram; an edit started
  before that ends is refused with "Try again once the diagram has
  reloaded."
- A new server or region name that collides with an existing file or
  folder in `local/` is refused by the server (400) and Save reports
  it.

## Out of scope

- Renaming ids, deleting servers in the page (delete the file).
- Editing connections, service groups, server types.
