import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundleModules, entryModules } from "../page/bundle.mjs";

function tree(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), "bundle-"));
  try {
    for (const [name, text] of Object.entries(files)) { mkdirSync(join(dir, name, ".."), { recursive: true }); writeFileSync(join(dir, name), text); }
    return fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("entry modules come from the require() calls of the page script", () => {
  const ids = entryModules('const { a } = require("parse/x.mjs");\nrequire("browser/render.mjs").go(require("lib/y.mjs"));');
  assert.deepEqual(ids, ["browser/render.mjs", "parse/x.mjs", "lib/y.mjs"]);
});

test("the real page script entry list covers the renderer and the parsers", () => {
  const ids = entryModules();
  for (const id of ["browser/render.mjs", "parse/toml.mjs", "lib/zip.mjs"]) assert.ok(ids.includes(id), id);
});

test("single-line and multi-line imports are both rewritten, dependencies first", () => {
  tree({
    "a.mjs": 'import { one } from "./b.mjs";\nimport {\n  two,\n  three,\n} from "./sub/c.mjs";\nexport const a = one + two + three;\n',
    "b.mjs": "export const one = 1;\n",
    "sub/c.mjs": 'import { one } from "../b.mjs";\nexport function two() { return one; }\nexport const three = 3;\n',
  }, (root) => {
    const m = bundleModules(["a.mjs"], root);
    assert.deepEqual([...m.keys()], ["a.mjs", "b.mjs", "sub/c.mjs"]);
    assert.match(m.get("a.mjs"), /const \{[\s\S]*two,[\s\S]*three,[\s\S]*\} = require\("sub\/c\.mjs"\);/);
    assert.match(m.get("sub/c.mjs"), /require\("b\.mjs"\)/);
    assert.match(m.get("b.mjs"), /Object\.assign\(exports, \{one\}\);$/);
  });
});

test("unsupported syntax and Node-only imports are refused", () => {
  tree({ "a.mjs": 'import { readFileSync } from "node:fs";\n' }, (root) => assert.throws(() => bundleModules(["a.mjs"], root), /Unsupported browser import: node:fs/));
  tree({ "a.mjs": 'import x from "./b.mjs";\n', "b.mjs": "export default 1;\n" }, (root) => assert.throws(() => bundleModules(["a.mjs"], root), /Unsupported module syntax/));
  tree({ "a.mjs": "export { z };\nconst z = 1;\n" }, (root) => assert.throws(() => bundleModules(["a.mjs"], root), /Unsupported module syntax/));
});

test("the page bundle never pulls in Node-only modules", () => {
  const m = bundleModules(entryModules());
  assert.ok(!m.has("lib/util.mjs"));
  assert.ok(m.has("lib/text.mjs"));
  for (const [id, src] of m) assert.ok(!/from "node:|require\("node:(?!path)/.test(src), id);
});

test("a re-export line links the module and exports its names", () => {
  tree({
    "a.mjs": 'export { one, two } from "./b.mjs";\nexport const a = 1;\n',
    "b.mjs": "export const one = 1;\nexport const two = 2;\n",
  }, (root) => {
    const m = bundleModules(["a.mjs"], root);
    assert.ok(m.get("a.mjs").includes('Object.assign(exports, (({ one, two }) => ({ one, two }))(require("b.mjs")));'));
    assert.ok(m.get("a.mjs").endsWith("Object.assign(exports, {a});"));
  });
});
