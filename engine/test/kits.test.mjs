import { test } from "node:test";
import assert from "node:assert/strict";
import { KITS } from "../page/kits.mjs";
import { freeVariables } from "./free-vars.mjs";
import { script } from "../page/assets.mjs";

test("the scanner finds free variables and ignores locals, parameters and properties", () => {
  const pure = () => {
    const k = { a: 1, b: (x, { y }) => x + y, "c": [1] };
    function f(n, m = 2) { return n * m + Math.max(k.a, 1); }
    const re = /a\/b/g, s = `t${k.a}`;
    for (const q of [1]) { void q; }
    try { f(1); } catch (e) { void e; }
    return { re, s, f };
  };
  assert.deepEqual(freeVariables(pure), []);
  const impure = () => { const a = esc("x"); return a + outer.size + typeof gone; };
  assert.deepEqual(freeVariables(impure), ["esc", "gone", "outer"]);
});

test("every kit is registered with its exports and references no free variables", () => {
  for (const [name, kit] of Object.entries(KITS)) {
    assert.equal(typeof kit.fn, "function", name);
    assert.ok(kit.names.length, name + " exports nothing");
    assert.deepEqual(freeVariables(kit.fn), [], `${name} reads outer variables; pass them in or move them inside the kit`);
    const result = kit.fn();
    for (const n of kit.names) assert.ok(n in result, `${name} does not return ${n}`);
  }
});

test("every kit shows up in the generated page script under its runtime name", () => {
  const js = script();
  for (const name of Object.keys(KITS)) assert.ok(js.includes(`InfraDiagram.define("${name}", [], function () {`), name);
});
