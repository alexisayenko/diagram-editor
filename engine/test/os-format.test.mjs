import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { osInfo } from "../parse/os-eol.mjs";
import { shortOs, OS_MAX } from "../render/geometry.mjs";

const probe = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../tools/host-probe.sh"), "utf8");
const fn = probe.replace(/^main <\/dev\/null\s*$/m, "");
const bash = spawnSync("bash", ["-c", "true"]).error ? null : "bash";

function osName(osRelease, debianVersion) {
  const dir = mkdtempSync(join(tmpdir(), "osname-"));
  writeFileSync(join(dir, "os-release"), osRelease);
  if (debianVersion !== undefined) writeFileSync(join(dir, "debian_version"), debianVersion);
  const r = spawnSync("bash", ["-c", `${fn}\nos_name`], { env: { ...process.env, OS_RELEASE: join(dir, "os-release"), DEBIAN_VERSION: join(dir, "debian_version") }, encoding: "utf8" });
  return r.stdout;
}

test("probe builds the os value: distro, version, codename", { skip: !bash }, () => {
  assert.equal(osName('ID=debian\nVERSION_ID="11"\nVERSION_CODENAME=bullseye\nPRETTY_NAME="Debian GNU/Linux 11 (bullseye)"\n', "11.11\n"), "Debian 11.11 bullseye");
  assert.equal(osName('ID=debian\nVERSION_ID="12"\nVERSION_CODENAME=bookworm\n', "12.3\n"), "Debian 12.3 bookworm");
  assert.equal(osName('ID=debian\nVERSION_ID="12"\nVERSION_CODENAME=bookworm\n', "bookworm/sid\n"), "Debian bookworm");
  assert.equal(osName('ID=debian\nVERSION_CODENAME=trixie\n'), "Debian trixie");
  assert.equal(osName('ID=ubuntu\nVERSION_ID="16.04"\nVERSION="16.04.7 LTS (Xenial Xerus)"\nVERSION_CODENAME=xenial\n'), "Ubuntu 16.04 LTS Xenial");
  assert.equal(osName('ID=ubuntu\nVERSION_ID="22.04"\nPRETTY_NAME="Ubuntu 22.04.4 LTS"\nVERSION_CODENAME=jammy\n'), "Ubuntu 22.04 LTS Jammy");
  assert.equal(osName('ID=ubuntu\nVERSION_ID="23.10"\nVERSION="23.10 (Mantic Minotaur)"\nVERSION_CODENAME=mantic\n'), "Ubuntu 23.10 Mantic");
  assert.equal(osName('ID=rocky\nNAME="Rocky Linux"\nVERSION_ID="9.4"\nPRETTY_NAME="Rocky Linux 9.4 (Blue Onyx)"\n'), "Rocky Linux 9.4");
  assert.equal(osName('ID=alpine\nNAME="Alpine Linux"\nVERSION_ID=3.19.1\n'), "Alpine Linux 3.19.1");
  assert.equal(osName('ID=foo\nPRETTY_NAME="Foo OS rolling"\n'), "Foo OS rolling");
});

test("EOL status resolves for the new and the old os formats", () => {
  const today = new Date("2026-10-14");
  const eol = (s) => osInfo(s, today).eol;
  for (const s of ["Ubuntu 16.04 LTS Xenial", "Ubuntu 16.04.7 LTS", "Ubuntu 16.04", "Debian 11.11 bullseye", "Debian GNU/Linux 11 (bullseye)", "Debian 11", "Debian 12.3 bookworm", "CentOS Linux 7 (Core)", "Oracle Linux Server 7.9"]) assert.ok(eol(s), s);
  for (const s of ["Ubuntu 22.04 LTS Jammy", "Ubuntu 24.04 LTS Noble", "Debian 13.1 trixie", "Debian bookworm"]) assert.equal(eol(s), null, s);
});

test("pill text is shown in full up to a sane maximum, then cut with an ellipsis", () => {
  assert.equal(shortOs("Ubuntu 16.04 LTS Xenial"), "Ubuntu 16.04 LTS Xenial");
  const long = "Some Distribution Long Name 1.2.3 codename-with-a-very-long-suffix";
  assert.equal(shortOs(long).length, OS_MAX);
  assert.ok(shortOs(long).endsWith("…"));
});

test("display normaliser shortens PRETTY_NAME forms and leaves short values alone", async () => {
  const { displayOs } = await import("../parse/os-display.mjs");
  const cases = [
    ["Debian GNU/Linux 11 (bullseye)", "Debian 11 bullseye"],
    ["Ubuntu 16.04.7 LTS", "Ubuntu 16.04 LTS"],
    ["CentOS Linux 7 (Core)", "CentOS 7"],
    ["Red Hat Enterprise Linux 8.6 (Ootpa)", "RHEL 8.6 Ootpa"],
    ["Rocky Linux 9.3 (Blue Onyx)", "Rocky 9.3 Blue Onyx"],
    ["AlmaLinux 9.2 (Turquoise Kodkod)", "AlmaLinux 9.2 Turquoise Kodkod"],
    ["Oracle Linux Server 8.8", "Oracle Linux 8.8"],
    ["Red Hat Enterprise Linux Server 7.9 (Maipo)", "RHEL Server 7.9 Maipo"],
    ["Debian 11.11 bullseye", "Debian 11.11 bullseye"],
    ["Ubuntu 16.04 LTS Xenial", "Ubuntu 16.04 LTS Xenial"],
    ["Windows Server 2016", "Windows Server 2016"],
  ];
  for (const [from, to] of cases) { assert.equal(displayOs(from), to, from); assert.equal(displayOs(to), to, "idempotent " + to); }
});

test("osInfo keeps the stored text and EOL detection on the original; the pill uses the shortened text", () => {
  const info = osInfo("Debian GNU/Linux 11 (bullseye)", new Date("2026-01-01"));
  assert.equal(info.v, "Debian GNU/Linux 11 (bullseye)");
  assert.equal(info.d, "Debian 11 bullseye");
  assert.equal(info.eol, "2024-08");
  assert.equal(shortOs("Red Hat Enterprise Linux 8.6 (Ootpa)"), "RHEL 8.6 Ootpa");
});

function probeOut(osRelease, hostname) {
  const dir = mkdtempSync(join(tmpdir(), "hostile-"));
  writeFileSync(join(dir, "os-release"), osRelease.replaceAll("@MARK@", join(dir, "pwned")));
  const script = `${fn}\nhostname() { printf '%s' "$HOST_NAME"; }\nmain </dev/null`;
  const r = spawnSync("bash", ["-c", script], { env: { ...process.env, OS_RELEASE: join(dir, "os-release"), DEBIAN_VERSION: join(dir, "none"), HOST_NAME: hostname }, encoding: "utf8" });
  return { out: r.stdout, marker: join(dir, "pwned") };
}

test("hostile os-release and hostname values: nothing runs and the snippet stays valid TOML", { skip: !bash }, async () => {
  const { existsSync } = await import("node:fs");
  const { parseToml } = await import("../parse/toml.mjs");
  const cases = [
    ['ID=foo\nNAME="Evil $(touch @MARK@)"\nVERSION_ID="1`touch @MARK@`"\nPRETTY_NAME="x"\n', "host$(touch /nonexistent/mark)"],
    ['ID=foo\nPRETTY_NAME="back\\slash \\"quote\\" \$HOME"\nVERSION_CODENAME=$(touch @MARK@)\n', 'h"q\b'],
    ["ID=foo\nPRETTY_NAME='single \"dq\" \ end'\n", "multi\nline\nhost"],
    ["ID=foo\nPRETTY_NAME=\"ctl\u0001\u0007\u001b[31m\ttab\rcr\u007f\"\n", "ctl\u0001host\ttab"],
    [`ID=foo\nPRETTY_NAME="${"A".repeat(5000)}"\n`, "h".repeat(5000)],
    ["ID=foo\nPRETTY_NAME=ok; touch @MARK@\nFOO=$(touch @MARK@)\n$(touch @MARK@)\n", "plain"],
  ];
  for (const [rel, host] of cases) {
    const { out, marker } = probeOut(rel, host);
    assert.ok(!existsSync(marker), "command executed");
    assert.ok(out.length > 0);
    assert.equal(typeof parseToml(out).id, "string");
    assert.ok(!/[\x00-\x08\x0b-\x1f\x7f]/.test(out.replace(/\n/g, "")), "control characters in output");
  }
});

test("os-release values stay literal text and unlisted keys are ignored", { skip: !bash }, () => {
  assert.equal(osName('ID=foo\nPRETTY_NAME="a $HOME `id` $(id)"\n'), "a $HOME `id` $(id)");
  assert.equal(osName(String.raw`ID=foo
PRETTY_NAME="say \"hi\" \\ \$x"
`), String.raw`say "hi" \ $x`);
  assert.equal(osName("ID=foo\nPRETTY_NAME='it is'\nPATH=/nowhere\n"), "it is");
  assert.equal(osName('ID=foo\nPRETTY_NAME="CRLF"\r\n'), "CRLF");
});
