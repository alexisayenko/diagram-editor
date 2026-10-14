import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./cov-dom.mjs";

const load = () => { const g = {}; g.window = g; run("runtime/define.js", g); return { window: g }; };

test("define registers a module under its name with the factory result", () => {
  const ctx = load();
  const I = ctx.window.InfraDiagram;
  I.define("a", [], () => ({ n: 1 }));
  assert.deepEqual({ ...I.modules.a }, { n: 1 });
});

test("define passes dependencies positionally, in order", () => {
  const I = load().window.InfraDiagram;
  I.define("a", [], () => "A");
  I.define("b", [], () => "B");
  I.define("c", ["b", "a"], (b, a) => b + a);
  assert.equal(I.modules.c, "BA");
});

test("define throws naming both modules when a dependency is not loaded yet", () => {
  const I = load().window.InfraDiagram;
  assert.throws(() => I.define("x", ["missing"], () => 1), /x needs missing, which is not loaded yet/);
  assert.equal(I.modules.x, undefined);
});

test("redefining a name replaces the module", () => {
  const I = load().window.InfraDiagram;
  I.define("a", [], () => 1);
  I.define("a", [], () => 2);
  assert.equal(I.modules.a, 2);
});
