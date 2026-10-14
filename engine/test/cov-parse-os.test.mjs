import test from "node:test";
import assert from "node:assert/strict";
import { displayOs } from "../model/os.mjs";
import { osInfo } from "../model/os.mjs";

test("displayOs: non-strings pass through, blank falls back to the original", () => {
  assert.equal(displayOs(undefined), undefined);
  assert.equal(displayOs(null), null);
  assert.equal(displayOs(5), 5);
  assert.equal(displayOs(""), "");
  assert.equal(displayOs("   "), "   ");
  assert.equal(displayOs("(Core)"), "(Core)");
});

test("displayOs: noise parentheses are dropped, other parentheses become plain words", () => {
  assert.equal(displayOs("CentOS Linux 7 (Core)"), "CentOS 7");
  assert.equal(displayOs("Windows 7 (Final)"), "Windows 7");
  assert.equal(displayOs("Windows Server 2016 (core)"), "Windows Server 2016");
  assert.equal(displayOs("Debian GNU/Linux 11 (bullseye)"), "Debian 11 bullseye");
  assert.equal(displayOs("Rocky Linux 9.4 (Blue Onyx)"), "Rocky 9.4 Blue Onyx");
  assert.equal(displayOs("  Foo   OS  "), "Foo OS");
});

test("displayOs: vendor names are shortened, Oracle and Amazon Linux keep their suffix", () => {
  assert.equal(displayOs("Red Hat Enterprise Linux 8.9"), "RHEL 8.9");
  assert.equal(displayOs("red hat enterprise linux release"), "RHEL release");
  assert.equal(displayOs("Oracle Linux Server 7.9"), "Oracle Linux 7.9");
  assert.equal(displayOs("Amazon Linux 2"), "Amazon Linux 2");
  assert.equal(displayOs("Oracle Linux"), "Oracle Linux");
  assert.equal(displayOs("Alpine Linux 3.19"), "Alpine 3.19");
  assert.equal(displayOs("Alpine Linux"), "Alpine");
  assert.equal(displayOs("Linux Mint 21"), "Linux Mint 21");
  assert.equal(displayOs("Linux"), "Linux");
});

test("displayOs: Ubuntu patch level is cut", () => {
  assert.equal(displayOs("Ubuntu 22.04.4 LTS"), "Ubuntu 22.04 LTS");
  assert.equal(displayOs("Ubuntu 16.04.7"), "Ubuntu 16.04");
  assert.equal(displayOs("Ubuntu 22.04 LTS Jammy"), "Ubuntu 22.04 LTS Jammy");
});

const today = new Date("2026-10-14T12:00:00Z");
const eol = (os, d = today) => osInfo(os, d).eol;

test("osInfo: empty input has no info", () => {
  assert.equal(osInfo(""), null);
  assert.equal(osInfo(null), null);
  assert.equal(osInfo(undefined), null);
});

test("osInfo: keeps the stored value, adds the display form", () => {
  assert.deepEqual(osInfo("CentOS Linux 7 (Core)", today), { v: "CentOS Linux 7 (Core)", d: "CentOS 7", f: "centos", eol: "2024-06" });
  assert.deepEqual(osInfo("Ubuntu 24.04 LTS", today), { v: "Ubuntu 24.04 LTS", d: "Ubuntu 24.04 LTS", f: "ubuntu", eol: null });
});

test("osInfo: EOL is strictly after the end month", () => {
  assert.equal(eol("Ubuntu 20.04", new Date("2025-05-31")), null);
  assert.equal(eol("Ubuntu 20.04", new Date("2025-06-01")), "2025-05");
  assert.equal(eol("Debian 12", new Date("2026-06-30")), null);
  assert.equal(eol("Debian 12", new Date("2026-07-01")), "2026-06");
});

test("osInfo: every family resolves", () => {
  assert.equal(eol("Ubuntu 18"), "2023-05");
  assert.equal(eol("Ubuntu 18.04.6 LTS"), "2023-05");
  assert.equal(eol("Ubuntu 99.04"), null);
  assert.equal(eol("Debian GNU/Linux 10 (buster)"), "2022-09");
  assert.equal(eol("Debian 99"), null);
  assert.equal(eol("CentOS 7"), "2024-06");
  assert.equal(eol("CentOS Linux 8"), null);
  assert.equal(eol("Oracle Linux Server 7.9"), "2024-12");
  assert.equal(eol("Oracle Linux 8"), null);
  assert.equal(eol("Windows Server 2012"), "2023-10");
  assert.equal(eol("Windows Server 2012 R2 Standard"), "2023-10");
  assert.equal(eol("Windows Server 2016"), null);
  assert.equal(eol("Windows Server 2016", new Date("2027-02-01")), "2027-01");
  assert.equal(eol("Windows Server 2022"), null);
  assert.equal(eol("Windows 10"), null);
  assert.equal(eol("Alpine 3.19"), null);
  assert.equal(eol("Mystery OS"), null);
});

test("osInfo: matching is case-insensitive and anchored at the start", () => {
  assert.equal(eol("ubuntu 16.04"), "2021-04");
  assert.equal(eol("centos linux 7"), "2024-06");
  assert.equal(eol("My Ubuntu 16.04"), null);
});
