# ADR-0006: Networks derived from IPs, optional `networks.toml`

Status: Accepted · 2026-10-14
Commit: cca6872

## Context

Networks started as a shared file (2026-10-07, f0d9c5a), then became
one `networks.toml` per diagram folder (2026-10-08, eaadfdf). Typing
every CIDR by hand is slow when each server already lists its IPs
with a prefix, and a name is often unknown.

## Decision

- Each IPv4 `ips` entry with a prefix `/1` to `/31` implies its
  network (host bits masked). `/32`, IPv6 and entries without a
  prefix imply nothing.
- `networks.toml` is optional. Its `[[networks]]` entries give
  `cidr` (required), `name` and `description` (optional). An
  unnamed network is labelled by its CIDR.
- An IP belongs to the longest-prefix network among the defined ones
  and the network of its own prefix; a defined narrower network wins.
- **Save** appends a `[[networks]]` table with only `cidr` for each
  derived CIDR missing from the file (existing text untouched),
  with the base check and one retry.
- Edit mode lets the user add or edit a name from the Networks
  panel; Save changes only that `name` line.

## Consequences

- A diagram with no `networks.toml` still gets a Networks panel.
- Save may add entries the user did not type; the toolbar says how
  many.
- Networks are IP ranges only; no VLAN or site metadata.

## Alternatives

- Hand-written networks only: complete but tedious, drifts from IPs.
- Fully implicit, never stored: names would have nowhere to live.
