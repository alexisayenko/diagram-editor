import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SERVER_FIELDS, SERVER_KEYS, SERVER_ROW_FIELDS, SERVER_LIST_FIELDS, SERVER_FORM_KEYS } from "../model/server-fields.mjs";
import { SERVER_STRINGS, SERVER_LISTS } from "../parse/toml-write.mjs";
import { tomlModel } from "../parse/toml.mjs";
import { KITS } from "../page/kits.mjs";
import { mini } from "./helpers.mjs";

const docs = readFileSync(new URL("../../docs/tech/authoring.md", import.meta.url), "utf8");
const edits = readFileSync(new URL("../browser/edits.mjs", import.meta.url), "utf8");

test("the table is well formed", () => {
  assert.equal(new Set(SERVER_KEYS).size, SERVER_KEYS.length);
  for (const f of SERVER_FIELDS) {
    assert.ok(["single", "list", "text", "flag"].includes(f.type), f.key);
    assert.ok(f.label, f.key);
    if (f.form && f.type === "list") assert.ok(f.add && f.placeholder, f.key);
    if (f.row) assert.equal(f.type, "single", f.key);
  }
  assert.ok(KITS["ui/server-fields"].names.includes("FIELDS"));
});

test("the writer's field lists come from the table", () => {
  assert.deepEqual(SERVER_STRINGS, SERVER_ROW_FIELDS.map((f) => f.key));
  assert.deepEqual(SERVER_LISTS, SERVER_LIST_FIELDS.map((f) => f.key));
  assert.deepEqual(SERVER_FORM_KEYS, ["name", "server_type", ...SERVER_STRINGS, ...SERVER_LISTS, "details"]);
});

test("the parser accepts every key of the table and rejects others", () => {
  const sample = { single: '"x"', list: '["x"]', text: '"x"', flag: "true" };
  const lines = SERVER_FIELDS.filter((f) => !["id", "region", "ips", "dns"].includes(f.key)).map((f) => (f.key === "server_type" ? 'server_type = "web"' : `${f.key} = ${sample[f.type]}`));
  const head = 'title = "t"\n';
  assert.doesNotThrow(() => tomlModel(mini(head, {}, lines.join("\n") + "\n")));
  assert.throws(() => tomlModel(mini(head, {}, 'server_type = "web"\nbogus = "x"\n')), /unknown key bogus/);
});

test("docs/tech/authoring.md names every server key", () => {
  const line = docs.split("\n").find((l) => l.startsWith("- Servers: `servers/<id>.toml`"));
  assert.ok(line, "the Servers bullet moved");
  const named = new Set([...line.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]));
  for (const key of SERVER_KEYS) assert.ok(named.has(key), `authoring.md does not mention the server key '${key}'`);
});

test("the bridge functions share one guarded wrapper", () => {
  assert.equal([...edits.matchAll(/= guarded\(/g)].length, 6);
  assert.equal([...edits.matchAll(/^\s*const editBlocked|^\s*const noteBlocked/gm)].length, 2);
});
