import test from "node:test";
import assert from "node:assert/strict";
import { planImport, gridPlacements, summary } from "../parse/import-servers.mjs";
import { sanitizeId } from "../lib/ids.mjs";
import { newDiagram } from "../parse/new-diagram.mjs";
import { addRegion } from "../parse/toml-write.mjs";
import { mergeFolder } from "../parse/toml.mjs";
import { prepareDiagram } from "../browser/render.mjs";

const probe = (id, name, extra = "") => `id = "${id}"\nname = "${name}"\nips = ["192.0.2.11/24", "192.0.2.12/24"]\nos = "Ubuntu 24.04"\n${extra}`;

test("sanitizeId follows the probe rules", () => {
  assert.equal(sanitizeId("Web_01.Example.Test"), "web-01-example-test");
  assert.equal(sanitizeId("10-host"), "s10-host");
  assert.equal(sanitizeId("---"), "server");
});

test("probe snippets become servers with only server_type added", () => {
  const files = newDiagram("d");
  const text = probe("app-01", "app-01.example.test");
  const { rows, files: added } = planImport(files, [{ name: "a.toml", text }], { server_type: "server" });
  assert.equal(rows[0].ok, true);
  assert.equal(added.get("servers/app-01.toml"), text + 'server_type = "server"\n');
  assert.doesNotThrow(() => prepareDiagram(new Map(files).set("servers/app-01.toml", added.get("servers/app-01.toml")), "d"));
  assert.equal(rows[0].ips, 2);
});

test("collisions get an id suffix and a parenthesised name number", () => {
  const existing = new Map(newDiagram("d")).set("servers/web.toml", probe("web", "web.example.test", 'server_type = "server"\n'));
  const { rows, files: added } = planImport(existing, [
    { name: "1.toml", text: probe("web", "web.example.test") },
    { name: "2.toml", text: probe("web", "web.example.test") },
    { name: "3.toml", text: probe("db", "db.example.test") },
  ], { server_type: "server" });
  assert.deepEqual(rows.map((r) => r.id), ["web-2", "web-3", "db"]);
  assert.deepEqual(rows.map((r) => r.name), ["web.example.test (2)", "web.example.test (3)", "db.example.test"]);
  assert.deepEqual(rows.map((r) => !!r.renamed), [true, true, false]);
  assert.deepEqual([...added.keys()], ["servers/web-2.toml", "servers/web-3.toml", "servers/db.toml"]);
  assert.match(added.get("servers/web-2.toml"), /^id = "web-2"\nname = "web\.example\.test \(2\)"/);
});

test("an invalid id is sanitized and a missing id falls back to the file name", () => {
  const { rows } = planImport(newDiagram("d"), [
    { name: "x.toml", text: probe("9 Host.Example", "n") },
    { name: "box-7.toml", text: 'name = "no id"\nips = []\n' },
  ], { server_type: "server" });
  assert.deepEqual(rows.map((r) => r.id), ["s9-host-example", "box-7"]);
});

test("parse and validation errors skip a file and are reported", () => {
  const { rows, files } = planImport(newDiagram("d"), [
    { name: "bad.toml", text: "id = \n" },
    { name: "ip.toml", text: probe("ok", "n").replace("192.0.2.11/24", "nope") },
    { name: "good.toml", text: probe("good", "g") },
  ], { server_type: "server" });
  assert.ok(rows[0].error && !rows[0].ok && rows[1].error);
  assert.deepEqual([...files.keys()], ["servers/good.toml"]);
  assert.equal(summary(rows), "1 imported, 0 renamed, 2 skipped (parse errors)");
});

test("unchecked files are not imported and do not take ids", () => {
  const { rows, files } = planImport(newDiagram("d"), [
    { name: "a.toml", text: probe("same", "n1") },
    { name: "b.toml", text: probe("same", "n2") },
  ], { server_type: "server", skip: new Set(["a.toml"]) });
  assert.equal(rows[0].included, false);
  assert.deepEqual([...files.keys()], ["servers/same.toml"]);
});

test("a region replaces server_type; the type is required without one", () => {
  const files = newDiagram("d"), r = addRegion(files, { server_type: "database" });
  const withRegion = new Map(files).set(r.path, r.text);
  const id = mergeFolder(withRegion).regions[0].id;
  const { files: added } = planImport(withRegion, [{ name: "a.toml", text: probe("a", "a", 'server_type = "server"\n') }], { region: id, server_type: "ignored" });
  const text = added.get("servers/a.toml");
  assert.match(text, /region = "database"/);
  assert.match(text, /server_type = "database"/);
  assert.throws(() => planImport(files, [], { server_type: "nope" }), /Choose a server type/);
  assert.throws(() => planImport(files, [], { region: "zz" }), /Unknown region/);
});

test("grid placement skips occupied cells", () => {
  const p = gridPlacements(3, [{ x: 40, y: 40, w: 200, h: 100 }], { cols: 2 });
  assert.deepEqual(p, [[280, 40], [40, 180], [280, 180]]);
});
