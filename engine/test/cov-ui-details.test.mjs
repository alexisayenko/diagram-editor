import test from "node:test";
import assert from "node:assert/strict";
import { loadUi, fixture } from "./cov-ui-env.mjs";

function setup(over, opts = {}) {
  const f = fixture(over);
  const t = loadUi(["ui/details"], { ...f, ...opts });
  t.details = t.modules["ui/details"];
  t.core = t.modules["ui/core"];
  return t;
}

test("md: headings, paragraphs, lists and inline code/bold/link", () => {
  const { details } = setup();
  assert.equal(details.md("# T\n## U\n###### V"), "<h1>T</h1><h2>U</h2><h6>V</h6>");
  assert.equal(details.md("one\ntwo\n\nthree"), "<p>one two</p><p>three</p>");
  assert.equal(details.md("- a\n* b `c`\n\nafter"), "<ul><li>a</li><li>b <code>c</code></li></ul><p>after</p>");
  assert.equal(details.md("**b** [x](https://example.test/p?a=1)"), '<p><strong>b</strong> <a href="https://example.test/p?a=1" target="_blank" rel="noopener">x</a></p>');
});

test("md: HTML is escaped and non-http links stay plain text", () => {
  const { details } = setup();
  assert.equal(details.md("<script>x</script> & [a](javascript:alert(1))"), "<p>&lt;script&gt;x&lt;/script&gt; &amp; [a](javascript:alert(1))</p>");
});

test("md: tables with and without a separator row, ragged and empty input", () => {
  const { details } = setup();
  assert.equal(details.md("| A | B |\n|---|:-:|\n| 1 | 2 |"), "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>");
  assert.equal(details.md("| A | B |\n| 1 | 2 |"), "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>");
  assert.equal(details.md("| only |"), "<table><thead><tr><th>only</th></tr></thead><tbody></tbody></table>");
  assert.equal(details.md(""), "");
  assert.equal(details.md("\n \n"), "");
});

test("renderPanel: node section renders title, tag, markdown and the Confluence link", () => {
  const { details, $, sandbox } = setup();
  details.renderPanel("n:a");
  const pn = $("pn");
  assert.equal(pn.querySelector("h1").textContent, "Service A ↗");
  const link = pn.querySelector("#pl");
  assert.equal(link.getAttribute("href"), "https://wiki.example.test/a");
  assert.equal(link.getAttribute("aria-label"), "Open Confluence page");
  assert.equal(pn.querySelector(".tg").textContent, "WEB");
  assert.equal(pn.querySelector(".tg").dataset.ty, "web");
  assert.equal(pn.dataset.ty, "web");
  assert.equal(pn.querySelector("strong").textContent, "bold");
  assert.equal(pn.querySelector("code").textContent, "code");
  assert.equal(pn.querySelectorAll("li").length, 2);
  assert.ok(!pn.innerHTML.includes("Confluence |"), "the Confluence row is lifted out of the table");
  assert.ok(pn.querySelector("#pc"));
  assert.match(pn.innerHTML, /Part of Region 1/);
  assert.equal(sandbox.InfraDiagram.modules["ui/core"].hooks.panel, null);
});

test("renderPanel: unknown key leaves the panel untouched", () => {
  const { details, $ } = setup();
  const before = $("pn").innerHTML;
  details.renderPanel("n:zzz");
  assert.equal($("pn").innerHTML, before);
});

test("renderPanel: no section falls back to diagram data and the cluster section", () => {
  const f = fixture();
  delete f.D.sections["Service A"];
  const t = loadUi(["ui/details"], f);
  t.modules["ui/details"].renderPanel("n:a");
  const html = t.$("pn").innerHTML;
  assert.match(html, /No section for this entity in details\.md; showing diagram data\./);
  assert.match(html, /<li>Line 1<\/li><li>192\.0\.2\.10/);
  assert.match(html, /<hr><p class="pm">Part of Region 1<\/p><p>Region text<\/p>/);
});

test("renderPanel: no section and no data lines or cluster shows only the note", () => {
  const { details, $ } = setup();
  details.renderPanel("n:b");
  const html = $("pn").innerHTML;
  assert.match(html, /No section/);
  assert.ok(html.includes("<li>192.0.2.20</li>"));
  assert.ok(!html.includes("Part of"));
});

test("renderPanel: cluster entity has no hardware strip or OS row", () => {
  const { details, $ } = setup();
  details.renderPanel("c:r1");
  const pn = $("pn");
  assert.ok(pn.querySelector(".hws") === null);
  assert.ok(pn.querySelector(".po") === null);
  assert.match(pn.innerHTML, /Region text/);
});

test("confluence: bare URL cell is accepted, a non-URL cell stays in the table, only the first link is lifted", () => {
  const f = fixture();
  f.D.sections["Service A"] = "| Confluence | <https://wiki.example.test/bare> |\n| Confluence | [Two](https://wiki.example.test/two) |";
  const t = loadUi(["ui/details"], f);
  t.modules["ui/details"].renderPanel("n:a");
  assert.equal(t.$("pl").getAttribute("href"), "https://wiki.example.test/bare");
  assert.match(t.$("pn").innerHTML, /Two/);
  f.D.sections["Service A"] = "| Confluence | not a link |";
  const t2 = loadUi(["ui/details"], f);
  t2.modules["ui/details"].renderPanel("n:a");
  assert.ok(t2.$("pl") === null);
  assert.match(t2.$("pn").innerHTML, /not a link/);
});

test("hardware strip goes after the first table, else after the type tag", () => {
  const { details, $ } = setup();
  details.renderPanel("n:a");
  const strip = $("pn").querySelector(".hws");
  assert.equal(strip.previousElementSibling?.tagName, "TABLE");
  const f = fixture();
  f.D.sections["Service A"] = "plain text";
  const t = loadUi(["ui/details"], f);
  t.modules["ui/details"].renderPanel("n:a");
  const s2 = t.$("pn").querySelector(".hws");
  assert.equal(s2.previousElementSibling.className, "po", "inserted after the tag, then the OS table lands between");
});

test("hardware strip lists every cell as 'value label'", () => {
  const { details, $ } = setup();
  details.renderPanel("n:a");
  const text = $("pn").querySelector(".hws").textContent;
  assert.ok(text.startsWith("4 cpu"));
  assert.ok(text.endsWith("8G ram"));
});

test("hardware strip separator is a middle dot", () => {
  const { details, $ } = setup();
  details.renderPanel("n:a");
  assert.equal($("pn").querySelector(".hws").textContent, "4 cpu · 8G ram");
});

test("no hardware strip without cells", () => {
  const f = fixture();
  f.D.ent["n:a"].hwc = [];
  const t = loadUi(["ui/details"], f);
  t.modules["ui/details"].renderPanel("n:a");
  assert.ok(t.$("pn").querySelector(".hws") === null);
});

test("OS row: appended after the tag with the display name, version as tooltip and an EOL badge", () => {
  const { details, $ } = setup();
  details.renderPanel("n:a");
  const cell = $("pn").querySelector(".po td:last-child");
  assert.ok(cell.textContent.startsWith("Ubuntu 24.04 LTS"));
  assert.equal(cell.title, "Ubuntu 24.04");
  const b = cell.querySelector(".eolb");
  assert.equal(b.textContent, "EOL");
  assert.equal(b.getAttribute("title"), "End of standard support: 2029-04");
});

test("OS row: display name equal to version gets no tooltip; missing OS says TBD; no EOL means no badge", () => {
  const f = fixture();
  f.D.ent["n:a"].os = { v: "Debian 12", d: "Debian 12" };
  let t = loadUi(["ui/details"], f);
  t.modules["ui/details"].renderPanel("n:a");
  let cell = t.$("pn").querySelector(".po td:last-child");
  assert.equal(cell.textContent, "Debian 12");
  assert.equal(cell.title, undefined);
  assert.ok(cell.querySelector(".eolb") === null);
  f.D.ent["n:a"].os = { v: "Plain" };
  t = loadUi(["ui/details"], f);
  t.modules["ui/details"].renderPanel("n:a");
  assert.equal(t.$("pn").querySelector(".po td:last-child").textContent, "Plain");
  delete f.D.ent["n:a"].os;
  t = loadUi(["ui/details"], f);
  t.modules["ui/details"].renderPanel("n:a");
  assert.equal(t.$("pn").querySelector(".po td:last-child").textContent, "TBD");
});

test("OS row: an existing OS table row is reused instead of adding a second one", () => {
  const f = fixture();
  f.D.sections["Service A"] = "| H | H |\n|---|---|\n| OS | Old |";
  const t = loadUi(["ui/details"], f);
  t.modules["ui/details"].renderPanel("n:a");
  assert.ok(t.$("pn").querySelector(".po") === null);
  const td = t.$("pn").querySelectorAll("td").find((c) => c.textContent.startsWith("Ubuntu"));
  assert.ok(td);
  assert.equal(td.title, "Ubuntu 24.04");
});

test("network buttons follow IPs known to D.ipNet, with pressed state, and skip links", () => {
  const f = fixture();
  f.D.sections["Service A"] = "Reach 192.0.2.10/24 or 192.0.2.99 or 2192.0.2.10 [link](https://example.test/192.0.2.10)";
  let t = loadUi(["ui/details"], f);
  t.modules["ui/details"].renderPanel("n:a");
  let btns = t.$("pn").querySelectorAll(".nwd");
  assert.equal(btns.length, 1);
  assert.equal(btns[0].dataset.n, "0");
  assert.equal(btns[0].getAttribute("aria-pressed"), "false");
  assert.equal(btns[0].getAttribute("aria-label"), "Show network 192.0.2.0/24 Net One");
  assert.equal(btns[0].type, "button");
  assert.ok(btns[0].innerHTML.includes("<path"));
  t.modules["ui/core"].ctx.net = 0;
  t.modules["ui/details"].renderPanel("n:a");
  btns = t.$("pn").querySelectorAll(".nwd");
  assert.equal(btns[0].getAttribute("aria-pressed"), "true");
  assert.ok(btns[0].classList.contains("on"));
});

test("network buttons are skipped without nets/ipNet data", () => {
  const f = fixture({ nets: undefined });
  const t = loadUi(["ui/details"], f);
  t.modules["ui/details"].renderPanel("n:a");
  assert.equal(t.$("pn").querySelectorAll(".nwd").length, 0);
});

test("hooks.panel is called with the key and the panel element", () => {
  const { details, core, $ } = setup();
  const calls = [];
  core.hooks.panel = (k, pn) => calls.push([k, pn]);
  details.renderPanel("n:a");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "n:a");
  assert.equal(calls[0][1], $("pn"));
});

test("core helpers: esc, storage", () => {
  const t = loadUi(["ui/details"], { ...fixture() });
  const core = t.modules["ui/core"];
  assert.equal(core.esc("<a&b>"), "&lt;a&amp;b&gt;");
  core.lsSet("x", "1");
  assert.equal(core.lsGet("x"), "1");
  core.lsDel("x");
  assert.equal(core.lsGet("x"), null);
});

test("core storage swallows errors when storage is blocked", async () => {
  const { makeStorage } = await import("./cov-ui-env.mjs");
  const t = loadUi(["ui/core"], { ...fixture(), storage: makeStorage({ throws: true }) });
  const core = t.modules["ui/core"];
  assert.equal(core.lsGet("a"), null);
  core.lsSet("a", "1");
  core.lsDel("a");
});

test("core clipboard: uses the async API, falls back to execCommand when it rejects or is missing", async () => {
  const f = fixture();
  const results = [];
  let t = loadUi(["ui/core"], { ...f, globals: { navigator: { clipboard: { writeText: () => Promise.resolve() } } } });
  t.modules["ui/core"].clipboard("hello", (ok) => results.push(["async", ok]));
  await Promise.resolve();
  await Promise.resolve();
  t = loadUi(["ui/core"], { ...f, globals: { navigator: { clipboard: { writeText: () => Promise.reject(new Error("no")) } } } });
  t.modules["ui/core"].clipboard("hello", (ok) => results.push(["reject", ok]));
  await new Promise((r) => setImmediate(r));
  t = loadUi(["ui/core"], f);
  t.modules["ui/core"].clipboard("hello", (ok) => results.push(["none", ok]));
  t = loadUi(["ui/core"], f);
  t.doc.execCommand = () => { throw new Error("blocked"); };
  t.modules["ui/core"].clipboard("hello", (ok) => results.push(["throws", ok]));
  assert.deepEqual(results, [["async", true], ["reject", true], ["none", true], ["throws", false]]);
  assert.equal(t.doc.body.querySelector("textarea"), null, "fallback textarea is removed");
});

test("core save: creates a download link for the blob and revokes the URL later", () => {
  const t = loadUi(["ui/core"], fixture());
  t.modules["ui/core"].save({ blob: 1 }, "x.svg");
  assert.deepEqual(t.doc.downloads.map((d) => d.download), ["x.svg"]);
  assert.deepEqual(t.doc.downloads.map((d) => d.href), ["blob:test/1"]);
  assert.equal(t.flush(), 1);
});

test("md: a line starting with '#' but no space (e.g. a hashtag) renders as a paragraph", () => {
  const { details } = setup();
  assert.equal(details.md("#nospace"), "<p>#nospace</p>");
});

test("md: lines starting with '#' without a space stay plain paragraph lines", () => {
  const { details } = setup();
  assert.equal(details.md("#"), "<p>#</p>");
  assert.equal(details.md("####### seven"), "<p>####### seven</p>");
  assert.equal(details.md("text\n#tag\n# Head"), "<p>text #tag</p><h1>Head</h1>");
});

test("md: always terminates on random markdown-like lines", () => {
  const { details } = setup();
  const parts = ["#", "##", "-", "*", "1.", "7", "`", "|", " ", "a", "**", "[x](https://e.test)", "---", ":"];
  let seed = 12345;
  const rnd = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  for (let k = 0; k < 3000; k++) {
    const lines = [];
    for (let n = rnd(6) + 1; n > 0; n--) {
      let l = "";
      for (let c = rnd(5); c >= 0; c--) l += parts[rnd(parts.length)];
      lines.push(l);
    }
    assert.equal(typeof details.md(lines.join("\n")), "string");
  }
});
