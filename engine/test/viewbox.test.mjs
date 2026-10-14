import test from "node:test";
import assert from "node:assert/strict";
import { computeViewBox } from "../render/viewbox.mjs";

test("computeViewBox returns a default box for an empty diagram", () => {
  const model = { clusters: new Map(), nodes: new Map(), edges: [] };
  const vb = computeViewBox(model, { clusters: {}, nodes: {} }, {});
  assert.equal(vb, "0 0 800 500");
});

test("computeViewBox pads the bounds of the content", () => {
  const model = { clusters: new Map([["r", { id: "r", title: "R" }]]), nodes: new Map(), edges: [] };
  const layout = { clusters: { r: { x: 100, y: 50, w: 200, h: 100, title: [200, 70] } }, nodes: {} };
  assert.equal(computeViewBox(model, layout, {}), "80 30 240 140");
});
