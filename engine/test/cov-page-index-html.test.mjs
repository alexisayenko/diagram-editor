import test from "node:test";
import assert from "node:assert/strict";
import { renderIndexHtml } from "../page/index-html.mjs";

const render = (details) =>
  renderIndexHtml({ title: "T", mmd: "graph TD\nA-->B", details, notes: [], edgeKinds: [["request", "Request"]] });

test("index.html pins mermaid and marked with SRI and crossorigin", () => {
  const html = render("# Hi");
  assert.match(html, /mermaid@\d+\.\d+\.\d+\/dist\/mermaid\.esm\.min\.mjs/);
  assert.match(html, /marked@\d+\.\d+\.\d+\/lib\/marked\.esm\.js/);
  assert.equal(html.match(/integrity="sha384-[A-Za-z0-9+/]+=*"/g).length, 2);
  assert.equal(html.match(/"sha384-[A-Za-z0-9+/]+=*"/g).length, 4);
  assert.match(html, /<script type="module" crossorigin="anonymous">/);
  assert.doesNotMatch(html, /mermaid@11|npm\/marked\/lib/);
});

test("index.html escapes </script in embedded markdown", () => {
  const html = render("text </script><script>alert(1)</script> end");
  assert.equal(html.match(/<\/script/g).length, 3);
  assert.match(html, /text &lt;\/script>/);
});

test("index.html restricts rendered markdown links to http(s) and escapes raw html", () => {
  const html = render("x");
  assert.ok(html.includes("^https?:") && html.includes("t.href = \"#\""));
  assert.ok(html.includes('t.type === "html"'));
});
