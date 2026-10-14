# ADR-0007: Service groups and the card flag

Status: Accepted · 2026-10-14
Commit: a3555e3, cca6872

## Context

A probed host can list dozens of `systemd_services`. Most are
noise; a few matter. Which ones depends on the real environment, so
the engine cannot hard-code product or service names
([ADR-0001](adr-0001-no-infra-data-in-repo.md)).

## Decision

- `topology.toml` takes optional `[[service_groups]]` tables:
  `label`, `patterns` (case-insensitive globs: `*`, `?`, matched on
  the unit name without `.service`), optional `id`, optional `card`.
- A unit goes to the first group with a matching pattern. The
  details panel shows one list per non-empty group in group order;
  units matching no group are hidden there (still in the data and
  in the editor).
- `card = true` on at least one group makes the server card list
  only the units of the flagged groups (up to 4, then "+N more").
  With no flagged group the card is unchanged. `rmi_services` are
  not affected.
- Groups are hand-edited; the page keeps them untouched on Save.
- The engine ships no groups. Real patterns live in the user's
  private diagram folder.

## Consequences

- Cards stay short on busy hosts; the panel stays organised.
- Hidden units can surprise: check the editor or the TOML file.
- No editor for groups yet.

## Alternatives

- Built-in list of known services: breaks ADR-0001.
- Show everything: unreadable cards.
- Per-server hiding: repeated on every server file.
