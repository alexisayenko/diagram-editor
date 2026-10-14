# Service CNAME

A DNS alias that clients use to reach a service, distinct from the
DNS name of the host that runs it.

Status: Concept: not implemented; display undecided.

Decided 2026-10-14
([ADR-0013](../../tech/decisions/adr-0013-adopt-refactoring-roadmap.md)):
the key is named `aliases`, not `cnames`, and is expanded into one
model list. It ships after `format_version` exists. The concept is
still not implemented.

## Problem and goal

Clients never type the host name. They use an alias such as
`app.example.test`; the host (`host-01.example.test`) is an
implementation detail.

- In a migration or failover the alias moves to another host. The
  diagram should show where it points now.
- Today the diagram shows only host names (`name`, `dns`) and IPs.
  To learn which server answers `app.example.test`, you leave the
  diagram.

Goal: show each service CNAME next to the server (or servers) it
points to, without cluttering the card and without breaking exports.

Non-goals: live DNS lookups, checking that the diagram matches DNS,
modelling zones, TTLs or other record types.

## Terms

- **Service CNAME**: an alias clients use for a service (see
  [terminology.md](terminology.md)).
- **Host name**: the server's own name (`name`, `dns`). Not a CNAME.
- **Target**: the server a CNAME points to now. May be several, or
  none.

Networks and CNAMEs are independent: a CNAME says nothing about IP
ranges. A network filter only dims a CNAME together with its server.

## Data model

All names below are synthetic.

### Option 1: `aliases` key on a server

```toml
# servers/host-01.toml
name = "host-01.example.test"
dns = ["host-01.example.test"]
aliases = ["app.example.test", "api.example.test"]
```

- Optional string list, same host-name validation as `dns`.
- Edited in the server editor (a list field like `dns`), shown in
  the details panel.
- Moving a CNAME to another host means editing two files.

Pros: tiny; fits the per-server form and the key-level Save.
Cons: no room for a label or note; one CNAME on two hosts is two
entries that can drift apart; a CNAME pointing nowhere cannot
exist; a name can be listed on two servers by mistake.

### Option 2: diagram-level `[[aliases]]` table

```toml
# aliases.toml (new optional file, like networks.toml)
[[aliases]]
name = "app.example.test"
targets = ["host-01", "host-02"]  # server ids, may be empty
label = "Service A"               # optional
description = "Entry of Service A"  # optional
proposed = true                   # optional
```

- One entry per name, so a name is unique by construction.
- `targets` may list several servers (round robin, active/passive
  pair) or none (alias exists, points nowhere yet).
- Validation: `name` is a host name and unique; each target is an
  existing server id (unknown id is an error, like an unknown
  `region`).
- A failover is one line in one file.
- Needs a new editor (rows, not a field in the server form), a
  place in `.diag.zip`, and Import handling.

### Recommendation

Start with Option 1, keep Option 2 open.

Reason: the first need is "show the aliases of this host". Option 1
needs no new file, editor or import change. Option 2 is the right
end state once one CNAME must point at several hosts or at nothing.
They are compatible: `aliases` on a server stays as shorthand for
"this name targets me", and the table adds the extras. Whatever
display is chosen must treat a CNAME as `name -> list of servers`,
even while the list always has one element.

## Relation to other data

- **`dns` key**: the host's own names. A name in both `dns` and
  `aliases` is a validation warning.
- **Import servers / host probe**: the probe runs on the host and
  cannot learn CNAMEs. They come from DNS zone data or by hand.
  Import must keep an existing `aliases` list when it merges a
  snippet.
- **Connections**: unchanged; they still join servers. A connection
  whose target is a CNAME is a later idea, out of scope.
- **Networks, service groups**: independent.

## Display options

### A. Label on top of the server card

```text
  app.example.test  api.example.test    <- strip above the card
 +-------------------------------------+
 | host-01                        [OS] |
 |  nginx                              |
 |  192.0.2.10/24                      |
 +-------------------------------------+
```

- Size: one more strip row; auto-layout already measures cards.
- Many names: strip wraps or truncates ("app.example.test +3");
  the details panel has the full list.
- One name on several hosts: text repeated per card, link implicit.
  Weak.
- Readability: good for one or two aliases; reads as the card's
  "front door".
- Edit mode: nothing new to drag; edit in the server form.
- Layout file: nothing new.
- Exports: part of the card, so SVG, PNG and Excalidraw get it as
  text with no new code path.

### B. Movable panel with an arrow to the server

```text
 +------------------+
 | app.example.test |-----+
 +------------------+     |
                          v
              +---------------------------+
              | host-01              [OS] |
              |  nginx                    |
              +---------------------------+
```

- Size: card unchanged.
- Many names: one panel lists several, or one panel per name.
- One name on several hosts: one panel, one arrow per target. The
  only option that shows "one name, two hosts" clearly, and it can
  show "points nowhere" (a panel without an arrow).
- Readability: more ink; arrows add crossings in dense areas.
- Edit mode: dragged like a note or server; add and remove from the
  right-click menu.
- Layout file: new positions in `diagram.layout.json` (an `aliases`
  section keyed by name); with no saved position the panel is
  auto-placed next to its target.
- Exports: panel and arrows must be drawn in SVG and PNG and emitted
  as Excalidraw shapes plus arrows.
- Reuse: connection routing, arrowheads and live re-route while
  dragging exist; a panel is a box with one endpoint.
- Wants Option 2 data (or Option 1 grouped by name at load time).

### C. Chip row in the card, or a count badge

```text
 +-------------------------------------+
 | host-01                        [OS] |
 | (app.example.test) (api.exam..)     |   <- chips
 |  nginx                              |
 +-------------------------------------+

 +-------------------------------------+
 | host-01                   [2 names] |   <- badge
 +-------------------------------------+
```

- Chips: like A but inside the card; same size cost, tidier, same
  weakness for shared names.
- Badge: no size cost, but hides information. Hover does not exist
  in PNG or Excalidraw, so exports would need a fallback (print the
  names), which brings back A.

### Cross-cutting

- **Display System Information toggle**: CNAMEs are not system
  information, so A and C ignore it. Option: tie them to it for a
  calmer card; B would follow the same choice.
- **Legend**: a "CNAMEs" switch (default on) suits every option;
  exports keep its state.
- **Network filter**: CNAME elements dim with their server.

### Comparison

| | A label | B panel + arrow | C chips / badge |
|---|---|---|---|
| Card size | +1 row | unchanged | +1 row / none |
| Many names | wraps, truncates | one panel lists them | wraps / count |
| One name, many hosts | repeated text | clear (arrows) | repeated text |
| Points nowhere | no | yes | no |
| New layout data | none | positions | none |
| Export work | none | SVG, PNG, Excalidraw | none (chips) |
| Effort | small | large | small |

## Recommendation

Display A (label on top of the card) with data Option 1 (`aliases`
key).

Minimal slice, in order:

1. Parse and validate `aliases` on a server: host-name check, no
   name on two servers, warning if also in `dns`.
2. Show the list in the details panel next to DNS.
3. Draw the label strip above the card; include it in card size for
   auto-layout and exports.
4. Add an `aliases` list field to the server editor and Save (same
   key-level rewrite as `dns`).
5. Add a synthetic example to `examples/demo`.

Defer B until a CNAME must point at several hosts or nowhere; then
add `aliases.toml` (Option 2) and the movable panel with arrows.

## Open questions

1. Typical aliases per host: one or two, or often more than four?
2. Does one CNAME often point at several hosts (round robin,
   failover pair)? If yes, B moves up.
3. Must a CNAME that points nowhere be drawn?
4. Hide CNAMEs when "Display System Information" is off?
5. Does the label need more than the name (service label,
   "proposed")?
6. Should a connection ever target a CNAME instead of a server?
7. Where do CNAMEs come from in practice: typed by hand, or pasted
   from DNS zone data (needs an import)?
