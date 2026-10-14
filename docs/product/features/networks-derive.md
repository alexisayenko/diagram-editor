# Network derivation and naming

The page shows the networks a diagram uses, derived from server
IPs, and lets the owner give them names.

## Purpose

See which servers share a network without typing every CIDR
([ADR-0006](../../tech/decisions/adr-0006-derived-networks.md)).

## Behaviour

- Each IPv4 `ips` entry with a prefix `/1` to `/31` implies a
  network (`192.0.2.10/24` gives `192.0.2.0/24`). Defined networks
  from `networks.toml` are added; a defined name wins for the same
  CIDR.
- The Networks panel lists networks nested by containment, with
  name (or the CIDR), CIDR and server count, plus an "Unassigned
  network" row when needed.
- Click a row to filter: servers outside it, unrelated regions and
  connections dim. One at a time; click again, Esc or **Show all**
  clears. The filter stays in exports.
- Each IP pill has a network button that selects the deepest
  network containing the IP; the details panel shows the network
  name after each IP.
- Edit mode: right-click a network (or Shift+F10 on a focused row),
  **Add name** or **Edit name**. Enter or leaving the field
  commits, Esc cancels, at most 80 characters. An empty value
  removes the name but keeps the entry.
- **Save**:
  - writes only that entry's `name` line, or appends a table with
    `cidr` and `name` for a derived network;
  - appends a `[[networks]]` table with `cidr` for each derived
    CIDR missing from the file and says "N new networks added to
    networks.toml".

## Data keys

`networks.toml`: `[[networks]]` with `cidr` (required), `name`,
`description`. Reference:
[authoring.md](../../tech/authoring.md#networks).

## Edge cases

- `/32`, IPv6 and entries without a prefix imply nothing.
- An IP belongs to the longest-prefix network; a defined narrower
  network wins over another server's derived one.
- A server with IPs in two networks is listed in both.
- Invalid or duplicate `cidr` in the file: the diagram fails to open
  with a message naming the entry.
- The auto-append retries once on a conflict, then reports without
  failing Save. Without the local server nothing is written.

## Known limits

- A network name is one line of at most 80 characters; longer or
  multi-line names are refused.

## Out of scope

- VLAN ids, sites, gateways, DHCP ranges.
- Removing a network entry in the page.
