# Terminology

Agreed vocabulary for the diagrams and the engine. Left column is the term to use; "instead of" lists wording it replaces.

## Sources

The TOML authoring workflow uses a **TOML model** (a diagram folder: `topology.toml` with regions and connections, `servers/<id>.toml` per server, plus optional `server-types.toml`, `notes.toml`, `documents.toml`, `networks.toml`) and a **saved layout** (`diagram.layout.json`: geometry and drawings in the same folder). **Auto-layout** places objects with no saved geometry. **Save** writes changed files and the layout to `local/`.

| Term | Meaning | Instead of |
|---|---|---|
| Model | The TOML folder: servers, regions, connections, types. The structure, no geometry. | canonical view |
| View | `layout.html`: the model drawn with its own layout (`diagram.layout.json`) and styling. | beautiful diagram |
| Excalidraw scene | `<id>.excalidraw`: the view's geometry as an editable Excalidraw drawing (legend left, notes right). Generated; a starting point for hand edits, not a source. | Excalidraw export file |
| Skin | One look of the view: Sketch, Clean, Dark, Swiss. Same geometry, different styling. The UI label and `?style=` keep the word "style". | style, theme |

## Diagram elements (infrastructure)

What the diagram depicts; part of every export.

| Term | Meaning | Instead of |
|---|---|---|
| Server | One host, drawn as a box: header with hostname, body lines (services, jobs, deployments), IP lines. Key `nodes` in `diagram.layout.json`. | server panel, node, box |
| Server type | Canonical role such as Web, Application, Cache, Oracle Database; built in, or added in `server-types.toml`. Shown by colour. | badge, class |
| Region | Bordered area grouping servers, e.g. one per server type ("Oracle DB Servers") or a cluster ("App Servers"). May be empty. At most one region per server type (the region's type is the default type of its servers; moving a server into a region gives it that type). Key `clusters` in `diagram.layout.json`. | server type grouping, server type region, cluster |
| OS pill | Small pill in a server box with its OS (the `os` key), shown when "Display System Information" is on (default); amber outline plus "EOL" once the version is past end of standard support, faded dashed "OS ?" when unknown. | OS badge, OS label |
| Network | IP range (CIDR), defined in `networks.toml` or derived from server IPs (see Derived network). A server belongs to the most specific one containing an IP of it. | subnet, VLAN |
| Service CNAME | DNS alias clients use to reach a service on a server, distinct from the server's own host name (`name`, `dns`). Concept only, not implemented; see [service-cname.md](service-cname.md). | alias, vanity name |
| Other infrastructure | Real infrastructure that is not a server type, e.g. NAS. | |
| Connection | Arrow between servers or regions: a request (TCP, NFS) one side makes to the other; the arrow points from initiator to target. An endpoint is a server (box) or a process (body line: job, deployment, RMI service); server connection vs process connection. Routed automatically. Key `edges` in `diagram.layout.json`. | edge, request arrow |
| Process connection | Connection with at least one process endpoint (`from_service` / `to_service` in `topology.toml`); it leaves or enters the box at that body line, which is drawn bold. Otherwise a server connection. | |
| Connection group | Named set of connections drawn in one colour, with its own Legend switch, e.g. "Job 104 connections" (red). | highlighted path |
| Connection label | Protocol · purpose on a connection, e.g. `TCP · SQL*Net · Job 104`. Hidden by default ("Connection labels" switch). | request label, edge label |
| Firewall marker | Red zigzag on a connection that crosses a firewall, placed automatically at the free spot nearest the connection's midpoint, with a "firewall" label beside it. | |

## Interface elements (control interface)

Controls for working with the view; never part of the diagram itself.

| Term | Meaning | Instead of |
|---|---|---|
| Top area | Top row: skin switch and zoom (left), SVG / PNG / Edit layout (right). | toolbar, buttons row |
| Panel | Collapsible card floating over the diagram, beneath the top area: Legend and Networks (left), Notes and Related documents (right). | |
| Legend | Panel with the server type switches, "Show all", the connection key with the connection switches (server / process connections, connection groups) and "Connection labels", and "Display System Information". | |
| Networks panel | Panel under the Legend listing the networks (defined and derived) as a tree: CIDR, name, server count. | subnet list |
| Network filter | Clicking a network in the Networks panel: servers outside it (and unrelated regions and connections) dim. One network at a time; combines with the type switches; exports keep it. | subnet highlight |
| Network button | Small network glyph right after an IP pill (Sketch: IP text) or an IP in the details panel: sets the network filter to the deepest network containing that IP; again clears. Not exported. | subnet button, IP network link |
| Details panel | Card that opens when a server header, OS pill or region title is clicked: hostname (plus Confluence link), server type badge, OS row, details generated from the server file. Floats over the right column; bottom sheet on narrow screens. | server informational panel, info panel |
| Server type badge | Coloured pill with the server type name, shown in the details panel. | |
| Note | Dated sticky card in the Notes panel, from `notes.toml`; editable in the page. Included in exports. | sticky note |
| Edit mode | Drag-and-drop layout editing ("Edit layout" or `?debug`); connections re-route live, regions grow around dragged servers, spacing violations show a red outline; exports the result as `diagram.layout.json`. | debug mode |

## Storage and data (TOML workflow)

| Term | Meaning | Instead of |
|---|---|---|
| Diagram folder | A folder of small files holding one diagram: `topology.toml`, `servers/<id>.toml`, optional `notes.toml`, `documents.toml`, `networks.toml`, `server-types.toml`, plus `diagram.layout.json`. | project, workspace |
| Saved diagram | A diagram folder stored in `local/` behind the local server; listed by **Open saved diagram**. | |
| Diagram archive | One `.diag.zip` file holding a diagram folder; made by **Export**, opened by **Import diagram**. | backup, package |
| Local server | `node engine/serve.mjs`: serves the page and the JSON API over `local/` on the loopback address only. | backend |
| Service group | `[[service_groups]]` entry in `topology.toml`: a label and name patterns that split a server's `systemd_services` into sections in the details panel; the `card` flag also filters the server card. | service filter |
| Derived network | Network implied by a server IP with a prefix (`192.0.2.10/24` gives `192.0.2.0/24`); appended to `networks.toml` on Save, optionally named. | auto network |
| Host probe | `tools/host-probe.sh`: read-only script that prints one server file for a Linux host. Its host commands are listed in its `COMMANDS` block. | scanner, agent |
| Import servers | Toolbar action that adds probe output files as new servers. | |
| Hardware strip | One line on the card and in the details panel: `cpu`, `ram`, `swap`, `disk` (`4 cpu · 8G ram · 2G swap · 50G sd`). Shown with the OS pill by "Display System Information". | specs line |
| Drawing | Free-hand stroke made with Pencil, saved in `diagram.layout.json`; not part of the model. | annotation |
