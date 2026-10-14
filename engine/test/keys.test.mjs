import test from "node:test";
import assert from "node:assert/strict";
import { nodeKey, parseKey, isKind, keysKit } from "../lib/keys.mjs";
import { renderDiagram } from "../browser/render.mjs";
import { demo } from "./helpers.mjs";

test("the serialized key forms are pinned: saved layouts, data attributes and the page data use them", () => {
  assert.equal(nodeKey("server", "app01"), "n:app01");
  assert.equal(nodeKey("region", "dmz"), "c:dmz");
  assert.equal(nodeKey("edge", "a>b"), "e:a>b");
  assert.equal(nodeKey("group", "g1"), "g:g1");
  assert.equal(nodeKey("level", "process"), "lv:process");
});

test("parseKey inverts nodeKey, keeps colons inside the id and never throws", () => {
  for (const kind of ["server", "region", "edge", "group", "level"]) assert.deepEqual(parseKey(nodeKey(kind, "x:y")), { kind, id: "x:y" });
  assert.deepEqual(parseKey("n:"), { kind: "server", id: "" });
  for (const odd of ["plain", "", "constructor:x", "toString:y", "N:upper", ":x"]) assert.deepEqual(parseKey(odd), { kind: null, id: odd });
  assert.deepEqual(parseKey(undefined), { kind: null, id: undefined });
  assert.throws(() => nodeKey("galaxy", "x"), /Unknown key kind: galaxy/);
  assert.throws(() => nodeKey("constructor", "x"), /Unknown key kind/);
});

test("isKind compares the kind of a key", () => {
  assert.ok(isKind("n:a", "server") && !isKind("n:a", "region") && !isKind("plain", "server"));
});

test("the kit and the module exports are the same functions", () => {
  const k = keysKit();
  assert.equal(k.nodeKey("edge", "q"), nodeKey("edge", "q"));
  assert.equal(k.parseKey("c:z").kind, "region");
});

test("the demo page data carries the pinned key strings in ent, connection ends and switches", () => {
  const html = renderDiagram(demo(), "demo", null, { cssSvg: "", cssPage: "", js: "" }, []).html;
  const data = JSON.parse(html.match(/id="layout-data">([\s\S]*?)<\/script>/)[1]);
  const keys = Object.keys(data.ent);
  assert.ok(keys.length > 0 && keys.every((k) => /^[nc]:/.test(k)));
  assert.ok(keys.some((k) => k.startsWith("n:")) && keys.some((k) => k.startsWith("c:")));
  assert.ok(data.meta.edges.every((e) => /^[nc]:/.test(e.from) && /^[nc]:/.test(e.to)));
  assert.match(html, /data-ent="n:[^"]+"/);
  assert.match(html, /data-ent="e:[^"]+"/);
  assert.ok(data.edgeSwitches.every((s) => /^(lv|g):/.test(s.k)));
  assert.match(html, /data-tk="[^"]*lv:(server|process)/);
});
