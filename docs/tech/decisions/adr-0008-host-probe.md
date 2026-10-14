# ADR-0008: Read-only host probe with a COMMANDS block

Status: Accepted · 2026-10-13
Commit: be4408d, 0f01939, 7d72db3

## Context

Typing server facts by hand does not scale. The probe runs on
hosts the user does not fully own, so it must be easy to audit and
unable to change anything.

## Decision

- `tools/host-probe.sh` runs over `ssh HOST 'bash -s' < script`,
  once per host, and prints one `servers/<id>.toml` snippet.
- Read-only: list and show commands only. No sudo, no writes, no
  installs, no network calls, no environment variables or command
  arguments in the output. 5 s timeout per command. A missing tool
  or a denied read leaves the key empty.
- Every command the script runs is one tiny function in the
  `COMMANDS` block at the top; the rest only reshapes that text. A
  test fails if anything else touches the host.
- Output contract: `id`, `name`, `ips`, `os`, `cpu`, `ram`, `swap`,
  `disk`, `jobs`, `systemd_services`, `details`; valid TOML, usable
  as `servers/<id>.toml` as is.
- The page embeds the script in the **Host script** dialog (steps,
  Copy buttons) and loads results with **Import servers**.

## Consequences

- A reviewer reads one block to trust the script.
- Process names of other users' ports show as `?`.
- Linux only; other systems need another probe.

## Alternatives

- Agent or daemon on each host: install and trust burden.
- Sudo for fuller data: breaks the "safe to run anywhere" promise.
- Free-form shell snippets in docs: not testable.
