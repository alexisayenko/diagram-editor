import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAllow, run, scanText } from "../../tools/check-no-infra-data.mjs";

const ip = (...o) => o.join(".");
const host = (...p) => p.join(".");
const rules = (text, opts) => scanText(text, "f.md", opts).map((h) => h.rule);

test("documentation ranges, loopback and masks pass", () => {
  const text = [ip(192, 0, 2, 5), ip(198, 51, 100, 7), ip(203, 0, 113, 9), ip(127, 0, 0, 1), ip(255, 255, 255, 0), ip(0, 0, 0, 0)].join("\n");
  assert.deepEqual(rules(text), []);
});

test("other addresses are flagged with their line", () => {
  const hits = scanText("ok\nip " + ip(10, 20, 30, 40) + " and " + ip(8, 8, 4, 4), "a.toml");
  assert.deepEqual(hits.map((h) => [h.line, h.rule]), [[2, "ipv4-outside-documentation-ranges"], [2, "ipv4-outside-documentation-ranges"]]);
  assert.equal(hits[0].file, "a.toml");
});

test("version-like numbers with five parts or out-of-range octets are not addresses", () => {
  assert.deepEqual(rules("v" + ip(1, 2, 3, 4, 5) + " " + ip(300, 1, 1, 1)), []);
});

test("the allow-list lets a private prefix through", () => {
  const allow = parseAllow("# note\nip " + ip(10, 1, 1, "") + "\n");
  assert.deepEqual(rules(ip(10, 1, 1, 9), { allow }), []);
  assert.deepEqual(rules(ip(10, 1, 2, 9), { allow }), ["ipv4-outside-documentation-ranges"]);
});

test("host names: example.test passes, real-looking names do not", () => {
  assert.deepEqual(rules("app-01." + host("example", "test") + " " + host("www", "example", "com")), []);
  assert.deepEqual(rules(host("db1", "acme", "com")), ["real-looking-hostname"]);
  assert.deepEqual(rules(host("db1", "acme", "internal")), ["real-looking-hostname"]);
  assert.deepEqual(rules(host("db1", "corp", "internal"), { allow: parseAllow("host " + ["corp", "internal"].join(".")) }), []);
});

test("property chains and file names are not host names", () => {
  assert.deepEqual(rules("ctx.net.x a.local report.info app.js"), []);
});

test("e-mail addresses: owner and example domains pass", () => {
  const owner = "me@" + host("mail", "test");
  assert.deepEqual(rules(owner + " a@" + host("example", "org"), { owner }), []);
  assert.deepEqual(rules("ops@" + host("acme", "com")), ["email-address"]);
  assert.deepEqual(rules("pkg@12.2.0"), []);
});

test("internal tool URLs are flagged", () => {
  const url = "https://" + host("wiki", "jira", "acme", "io") + "/x";
  assert.ok(rules(url).includes("internal-tool-url"));
  assert.ok(rules("https://" + host("code", "bitbucket", "acme", "io")).includes("internal-tool-url"));
});

test("deny-list words are matched ignoring case", () => {
  assert.deepEqual(rules("Project Zebra notes", { deny: ["zebra"] }), ["deny-list-word"]);
  assert.deepEqual(rules("nothing here", { deny: ["zebra"] }), []);
});

test("file allow-list skips a whole file by prefix", () => {
  const allow = parseAllow("file docs/legacy/");
  assert.deepEqual(scanText(ip(8, 8, 4, 4), "docs/legacy/a.md", { allow }), []);
  assert.equal(scanText(ip(8, 8, 4, 4), "docs/new/a.md", { allow }).length, 1);
});

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "infra-check-"));
  const git = (...a) => assert.equal(spawnSync("git", a, { cwd: dir }).status, 0, a.join(" "));
  git("init", "-q");
  git("config", "user.email", "me@" + host("mail", "test"));
  git("config", "user.name", "t");
  mkdirSync(join(dir, "tools"));
  return { dir, git };
}
const quiet = () => { const lines = []; return { lines, error: (m) => lines.push(m) }; };

test("staged mode checks the staged content, not the working copy", () => {
  const { dir, git } = repo();
  try {
    writeFileSync(join(dir, "a.md"), "host " + host("db1", "acme", "com") + "\n");
    git("add", "a.md");
    writeFileSync(join(dir, "a.md"), "clean\n");
    const out = quiet();
    assert.equal(run({ mode: "staged", root: dir, out }), 1);
    assert.match(out.lines[0], /^a\.md:1: real-looking-hostname: /);
    git("add", "a.md");
    assert.equal(run({ mode: "staged", root: dir, out: quiet() }), 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("all mode reads local/deny-words.txt when present", () => {
  const { dir, git } = repo();
  try {
    writeFileSync(join(dir, "a.md"), "the quokka project\n");
    git("add", "a.md");
    assert.equal(run({ mode: "all", root: dir, out: quiet() }), 0);
    mkdirSync(join(dir, "local"));
    writeFileSync(join(dir, "local/deny-words.txt"), "# private\nQuokka\n");
    const out = quiet();
    assert.equal(run({ mode: "all", root: dir, out }), 1);
    assert.match(out.lines[0], /deny-list-word/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the repository itself is clean", () => {
  assert.equal(run({ mode: "all", out: quiet() }), 0);
});
