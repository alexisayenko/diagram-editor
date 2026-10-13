import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newDiagram, DIAGRAM_ID } from "../parse/new-diagram.mjs";
import { prepareDiagram } from "../browser/render.mjs";
import { addServer } from "../parse/toml-write.mjs";
import { mergeFolder } from "../parse/toml.mjs";
import { validName } from "../lib/names.mjs";

const app = readFileSync(new URL("../browser/app.js", import.meta.url), "utf8");

test("a new diagram is the full folder format and opens empty", () => {
  const files = newDiagram("my-diagram");
  assert.deepEqual([...files.keys()].sort(), ["documents.toml", "networks.toml", "notes.toml", "server-types.toml", "topology.toml"]);
  assert.ok([...files.keys()].every((p) => validName("my-diagram/" + p)));
  const root = mergeFolder(files);
  assert.equal(root.id, "my-diagram");
  assert.equal(root.title, "My diagram");
  assert.deepEqual(root.server_types.map((t) => t.id), ["server", "database", "gateway"]);
  assert.doesNotThrow(() => prepareDiagram(files, "my-diagram"));
});

test("servers can be added to a new diagram, defaulting to the generic type", () => {
  const files = newDiagram("d");
  const first = addServer(files, { server_type: "server" });
  assert.equal(first.path, "servers/server1.toml");
  assert.match(first.text, /server_type = "server"/);
  assert.doesNotThrow(() => prepareDiagram(new Map(files).set(first.path, first.text), "d"));
});

test("diagram names follow the id rule", () => {
  for (const ok of ["a", "demo-1", "0x"]) assert.ok(DIAGRAM_ID.test(ok), ok);
  for (const bad of ["", "-a", "A", "a b", "a/b", "a_b", ".."]) assert.ok(!DIAGRAM_ID.test(bad), bad);
  assert.throws(() => newDiagram("Bad Name"), /lowercase/);
});

test("New diagram is guarded by the discard prompt and never overwrites a stored diagram", () => {
  const start = app.indexOf('newButton.addEventListener("click"'), body = app.slice(start, app.indexOf("\n});\n", start));
  assert.match(body, /if \(!discard\(\)\) return;/);
  assert.match(body, /stored\(folder \+ "\/topology\.toml"\) !== null/);
  assert.match(body, /active\.source = new Map\(\)/);
  assert.match(app, /add: addNewServer/);
});
