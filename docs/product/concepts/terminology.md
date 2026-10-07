# Terminology

Agreed vocabulary for the diagrams and the engine. Left column is the term to use; "instead of" lists wording it replaces.

## Sources

The TOML authoring workflow uses a **TOML model** (`<name>.toml`: servers, server types, services, regions, connections) and a **saved layout** (`<name>.layout.json`: geometry beside the model). **Auto-layout** places objects with no saved geometry. **Save layout** writes the current arrangement to that sibling file. The Mermaid model and per-folder `layout.json` below describe the existing CLI workflow.

| Term | Meaning | Instead of |
|---|---|---|
| Model | `diagram.mmd`: servers, regions, connections, types. The structure, no geometry. | Mermaid file, canonical view |
| View | `layout.html`: the model drawn with its own layout (`layout.json`) and styling. | beautiful diagram |
| Excalidraw scene | `<id>.excalidraw`: the view's geometry as an editable Excalidraw drawing (legend left, notes right). Generated; a starting point for hand edits, not a source. | Excalidraw export file |
| Skin | One look of the view: Sketch, Clean, Dark, Swiss. Same geometry, different styling. The UI label and `?style=` keep the word "style". | style, theme |

## Diagram elements (infrastructure)

What the diagram depicts; part of every export.

| Term | Meaning | Instead of |
|---|---|---|
| Server | One host, drawn as a box: header with hostname, body lines (services, jobs, deployments), IP lines. A node in `diagram.mmd`, key `nodes` in `layout.json`. | server panel, node, box |
| Server type | Canonical role: Web, External Interface, Internal Interface, Application, Cache, Oracle Database, Mongo Database Server. Shown by colour. | badge, class |
| Region | Bordered area grouping servers, e.g. one per server type ("Oracle DB Servers") or a cluster ("App Servers"). May be empty. A `subgraph` in `diagram.mmd`, key `clusters` in `layout.json`. | server type grouping, server type region, cluster |
| OS pill | Small pill in a server box with its OS version from `details.md`, shown when "Display OS version" is on; amber outline plus "EOL" once the version is past end of standard support, faded dashed "OS ?" when unknown. | OS badge, OS label |
| Network | IP range (CIDR) from `networks.md`, or a CIDR-less group of them. A server belongs to it when one of its IP lines falls inside; a region when one of its servers does. | subnet, VLAN |
| Other infrastructure | Real infrastructure that is not a server type, e.g. NAS. | |
| Connection | Arrow between servers or regions: a request (TCP, NFS) one side makes to the other; the arrow points from initiator to target. An endpoint is a server (box) or a process (body line: job, deployment, RMI service); server connection vs process connection. Routed automatically. An edge in `diagram.mmd`, key `edges` in `layout.json`. | edge, request arrow |
| Process connection | Connection with at least one process endpoint (`processes` in `diagram.json`); it leaves or enters the box at that body line, which is drawn bold. Otherwise a server connection. | |
| Connection group | Named set of connections drawn in one colour, with its own Legend switch, e.g. "Job 104 connections" (red). `groups` in `diagram.json`. | highlighted path |
| Connection label | Protocol · purpose on a connection, e.g. `TCP · SQL*Net · Job 104`. Hidden by default ("Connection labels" switch). | request label, edge label |
| Firewall marker | Red zigzag on a connection that crosses a firewall, placed automatically at the free spot nearest the connection's midpoint, with a "firewall" label beside it. | |

## Interface elements (control interface)

Controls for working with the view; never part of the diagram itself.

| Term | Meaning | Instead of |
|---|---|---|
| Top area | Top row: skin switch and zoom (left), SVG / PNG / Edit layout (right). | toolbar, buttons row |
| Panel | Collapsible card floating over the diagram, beneath the top area: Legend and Networks (left), Notes and Related documents (right). | |
| Legend | Panel with the server type switches, "Show all", the connection key with the connection switches (server / process connections, connection groups) and "Connection labels", and "Display OS version". | |
| Networks panel | Panel under the Legend listing the networks from `networks.md` as a tree: CIDR, name, host count. | subnet list |
| Network filter | Clicking a network in the Networks panel: servers outside it (and unrelated regions and connections) dim. One network at a time; combines with the type switches; exports keep it. | subnet highlight |
| Network button | Small network glyph right after an IP pill (Sketch: IP text) or an IP in the details panel: sets the network filter to the deepest network containing that IP; again clears. Not exported. | subnet button, IP network link |
| Details panel | Card that opens when a server header, OS pill or region title is clicked: hostname (plus Confluence link), server type badge, OS row, details from `details.md`. Floats over the right column; bottom sheet on narrow screens. | server informational panel, info panel |
| Server type badge | Coloured pill with the server type name, shown in the details panel. | |
| Note | Dated sticky card in the Notes panel, from `notes.md`. Included in exports. | sticky note |
| Edit mode | Drag-and-drop layout editing ("Edit layout" or `?debug`); connections re-route live, regions grow around dragged servers, spacing violations show a red outline; exports the result as `layout.json`. | debug mode |
