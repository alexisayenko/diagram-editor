import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lines = readFileSync(new URL("../../tools/host-probe.sh", import.meta.url), "utf8").split("\n");
const start = lines.findIndex((l) => l.startsWith("# COMMANDS:"));
const first = lines.findIndex((l, i) => i > start && l.startsWith("cmd_"));
let end = first;
while (end < lines.length && (lines[end].startsWith("cmd_") || /^(\s|\}|#|$)/.test(lines[end]) && lines.slice(end).some((l) => l.startsWith("cmd_")))) end++;
const outside = lines.filter((_, i) => i < start || i >= end).map((l) => l.replace(/(^|\s)#.*$/, "")).filter((l) => l.trim());
const DENY = ["hostname", "uname", "uptime", "nproc", "df", "ip", "crontab", "systemctl", "ss", "netstat", "docker", "podman", "sudo", "cat"];

test("the COMMANDS block exists, has the banner and a cmd_ function per host fact", () => {
  assert.ok(start >= 0 && start < 40, "banner near the top");
  assert.match(lines[start], /No sudo, no writes, no network calls/);
  const names = lines.slice(start, end).join("\n").match(/^cmd_\w+/gm);
  for (const n of ["cmd_hostname_short", "cmd_hostname_fqdn", "cmd_os_release", "cmd_debian_version", "cmd_kernel", "cmd_arch", "cmd_uptime", "cmd_cpu_count", "cmd_mem_info", "cmd_disk_root", "cmd_ip_addresses", "cmd_user_crontab", "cmd_system_crontabs", "cmd_timers", "cmd_services", "cmd_listening_ports", "cmd_listening_ports_netstat", "cmd_containers"]) assert.ok(names.includes(n), n);
});

test("host commands appear only inside the COMMANDS block", () => {
  const cmdPos = (w) => new RegExp("(^|[|;&(]|\\$\\()\\s*" + w + "\\s");
  for (const l of outside) {
    for (const w of DENY) assert.ok(!cmdPos(w).test(l + " "), `'${w}' outside COMMANDS: ${l}`);
    assert.ok(!/\/(etc|proc)\//.test(l), `host path outside COMMANDS: ${l}`);
  }
});

test("every cmd_ function is only called from helpers, never defined twice", () => {
  const defs = lines.filter((l) => /^cmd_\w+\(\)/.test(l)).map((l) => l.match(/^cmd_\w+/)[0]);
  assert.equal(new Set(defs).size, defs.length);
  assert.ok(!lines.some((l) => /\bsudo\b/.test(l.replace(/#.*$/, "").replace(/"[^"]*"/g, ""))));
});
