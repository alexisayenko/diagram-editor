# Host probe and Import servers

The owner collects facts from Linux hosts with a read-only script
and loads them into the diagram as servers.

## Purpose

Fill server files from real hosts without typing, and without
giving the tool any write access to those hosts
([ADR-0008](../../tech/decisions/adr-0008-host-probe.md)).

## Behaviour

- **Host script** opens a four-step dialog: save the script as
  `host-probe.sh`, create `hosts.txt`, run the ssh loop, import the
  results. The script sits in a collapsed **Show script** section;
  every command block has a **Copy** button ("Copied" for 1.5 s).
  Esc, Close or a click outside closes it. It works in view and edit
  mode and without the local server.
- The script prints one `servers/<id>.toml` snippet per host
  (`out/<host>.toml`). Read-only, no sudo; every command is listed
  in its `COMMANDS` block.
- **Import servers** (enabled while a diagram is open): choose one
  or more `.toml` files. Each is parsed like a server file; a bad one
  is listed with its error and skipped.
- A dialog lists the accepted files (id, name, IP count), all
  ticked, and asks for a default **server type** (required) and an
  optional **region**. With a region the servers inherit its type.
- **Import** adds the files in memory, places them in a tidy grid
  (top-left of the canvas or inside the region), enables Save and
  reports "N imported, M renamed, K skipped (parse errors)".

## Data keys

Probe output: `id`, `name`, `ips`, `os`, `cpu`, `ram`, `swap`,
`disk`, `jobs`, `systemd_services`, `details`. See
[authoring.md](../../tech/authoring.md#collecting-server-facts).

## Edge cases

- Id already taken (or twice in the import): suffix `-2`, `-3`;
  duplicate name gets ` (2)`; the row says "renamed to <id>".
- An id that breaks the id rules is sanitized (lowercase, other
  characters to `-`, `s` before a leading digit).
- Without sudo, process names of other users' ports show as `?`.
- Save writes the new files (they must not exist); without the local
  server **Export** carries them.
- Real host names and IPs in the output stay out of this repo.

## Out of scope

- Windows or macOS hosts, container-only hosts.
- Running the probe from the page; the owner runs it in a shell.
- Updating an existing server from a new probe (import adds only).
