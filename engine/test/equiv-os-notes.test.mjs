import { test } from "node:test";
import assert from "node:assert/strict";
import { displayOs } from "../model/os.mjs";
import { hasHashLine } from "../model/notes.mjs";

const NOISE = /^(?:Core|Final)$/i;
function oldDisplayOs(os) {
  if (typeof os !== "string") return os;
  let s = os.trim()
    .replace(/\s*\(([^()]*)\)/g, (_, w) => (NOISE.test(w.trim()) ? "" : " " + w.trim()))
    .replace(/^Red Hat Enterprise Linux\b/i, "RHEL")
    .replace(/^Oracle Linux Server\b/i, "Oracle Linux")
    .replace(/\s*GNU\/Linux\b/i, "");
  if (!/^(?:Oracle|Amazon) Linux\b/i.test(s)) s = s.replace(/^(\S+(?: \S+)*?) Linux(?= \d|$)/i, "$1");
  s = s.replace(/^(Ubuntu \d+\.\d+)\.\d+/i, "$1").replace(/\s+/g, " ").trim();
  return s || os;
}
const oldHash = (body) => /^[^\S\n]*#/m.test(body);

function rng(seed) {
  let x = seed >>> 0;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function randomString(r, alphabet, max) {
  const n = Math.floor(r() * max);
  let s = "";
  for (let i = 0; i < n; i++) s += alphabet[Math.floor(r() * alphabet.length)];
  return s;
}
const fast = (fn) => {
  const t = Date.now();
  fn();
  assert.ok(Date.now() - t < 500, "finishes quickly");
};

const REALISTIC = [
  "Ubuntu 22.04.3 LTS", "Debian GNU/Linux 12 (bookworm)", "Red Hat Enterprise Linux 8.9 (Ootpa)", "Oracle Linux Server 8.8",
  "Amazon Linux 2023", "CentOS Linux 7 (Core)", "Rocky Linux 9.2 (Blue Onyx)", "Windows Server 2019 Standard", "Windows Server 2016 (Final)",
  "SUSE Linux Enterprise Server 15 SP4", "Alpine Linux v3.18", "Fedora Linux 38 (Server Edition)", "  Ubuntu   20.04  ", "Arch Linux", "Linux", "Linux 5",
  "Foo Linux", "Foo Linux 2", "Foo Linux Linux 3", "Foo  Linux 2", "Foo\tLinux 2", "A Linux x Linux 1", "(Core)", "x (a) (b) y", "x ( a ) (  )", "x (unclosed", "x (a (b) c)", "a ) (b)", "", "  ", "Linux Linux",
];

test("displayOs matches the original regex pipeline on realistic inputs", () => {
  for (const s of REALISTIC) assert.equal(displayOs(s), oldDisplayOs(s), JSON.stringify(s));
  for (const v of [null, undefined, 5, {}]) assert.equal(displayOs(v), oldDisplayOs(v));
});

test("displayOs matches on 200k random strings", () => {
  const r = rng(7), alphabet = ["Linux", "linux", " ", " ", "  ", "\t", "\n", " ", "(", ")", "Core", "Final", "GNU/", "1", "22.04", "Ubuntu", "Red Hat Enterprise", "x", "é", " ", "'", "\""];
  for (let i = 0; i < 200000; i++) {
    const s = randomString(r, alphabet, 12);
    assert.equal(displayOs(s), oldDisplayOs(s), JSON.stringify(s));
  }
});

test("displayOs stays fast on pathological inputs", () => {
  for (const s of [" ".repeat(50000), " ".repeat(50000) + "(", "( ".repeat(25000), "a ".repeat(25000) + "Linuxx", "a ".repeat(25000), "(".repeat(50000), "\t".repeat(50000) + "x"])
    fast(() => displayOs(s));
});

test("hasHashLine matches the original multiline regex", () => {
  const cases = ["# a", "a\n# b", "a\n  # b", "a # b", "", "\n\n", "a\r#", "a  #", " \t#", "x\n  #", "a\n\tb\n#", "\r\r #", "#", "a#\n b"];
  for (const s of cases) assert.equal(hasHashLine(s), oldHash(s), JSON.stringify(s));
  const r = rng(11), alphabet = ["#", " ", " ", "\n", "\r", "\t", " ", " ", " ", "a", "b c", "é", "'", "\""];
  for (let i = 0; i < 200000; i++) {
    const s = randomString(r, alphabet, 14);
    assert.equal(hasHashLine(s), oldHash(s), JSON.stringify(s));
  }
});

test("hasHashLine stays fast on pathological inputs", () => {
  for (const s of [" ".repeat(50000), "\r".repeat(50000), " ".repeat(50000) + "a", "\n ".repeat(25000), "\r ".repeat(25000) + "x"])
    fast(() => hasHashLine(s));
});
