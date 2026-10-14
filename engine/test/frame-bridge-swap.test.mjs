// The frame bridge swaps the scene in a ready frame, and loads the whole page when it cannot.
import test from "node:test";
import assert from "node:assert/strict";
import { createFrameBridge } from "../browser/frame-bridge.mjs";

function setup(replaceScene) {
  const handlers = [], frame = {
    addEventListener: (type, f) => { if (type === "load") handlers.push(f); },
    contentDocument: { addEventListener() {} },
    contentWindow: null,
    set srcdoc(html) { frame.html = html; frame.loads = (frame.loads || 0) + 1; },
  };
  const loads = [];
  const bridge = createFrameBridge(frame, { host: {}, onLoad: (ready, swapped) => loads.push([ready, swapped]), onChange() {} });
  const load = (extra = {}) => {
    frame.contentWindow = { InfraDiagram: { modules: { "canvas/edit-mode": {} }, attachHost() {}, replaceScene, ...extra } };
    handlers.forEach((f) => f());
  };
  return { frame, bridge, loads, load };
}
const result = (shell = "s1", html = "<p>new") => ({ html, scene: { shell } });

test("a scene of the same shell is swapped into the ready frame: no new document, onLoad(true, true)", async () => {
  const seen = [], s = setup((scene) => { seen.push(scene); return { ok: true }; });
  const first = s.bridge.show("<p>old", "s1");
  s.load();
  await first;
  assert.deepEqual(s.loads, [[true, false]]);
  const next = result();
  assert.equal(await s.bridge.replace(next), "swapped");
  assert.deepEqual(seen, [next.scene]);
  assert.equal(s.frame.loads, 1);
  assert.equal(s.frame.html, "<p>old");
  assert.deepEqual(s.loads, [[true, false], [true, true]]);
  assert.equal(s.bridge.isReady(), true);
});

test("a scene of another shell reloads the frame and the new shell is the one swaps are checked against", async () => {
  const s = setup(() => ({ ok: true }));
  const first = s.bridge.show("<p>old", "s1");
  s.load();
  await first;
  const reloaded = s.bridge.replace(result("s2", "<p>other"));
  assert.equal(s.frame.html, "<p>other");
  assert.equal(s.bridge.isReady(), false);
  s.load();
  assert.equal(await reloaded, "reloaded");
  assert.equal(await s.bridge.replace(result("s2")), "swapped");
  assert.equal(await Promise.race([s.bridge.replace(result("s1", "<p>back")), Promise.resolve("pending")]), "pending");
  assert.equal(s.frame.html, "<p>back");
});

test("a runtime that refuses the scene, throws, or has no swap gets a reload", async () => {
  for (const replaceScene of [() => ({ ok: false, reason: "no" }), () => { throw new Error("boom"); }, () => null, undefined]) {
    const s = setup(replaceScene);
    const first = s.bridge.show("<p>old", "s1");
    s.load();
    await first;
    const reloaded = s.bridge.replace(result("s1", "<p>fresh"));
    assert.equal(s.frame.html, "<p>fresh");
    assert.deepEqual(s.loads, [[true, false]]);
    s.load();
    assert.equal(await reloaded, "reloaded");
    assert.deepEqual(s.loads, [[true, false], [true, false]]);
  }
});

test("a frame that is not ready, or a result without a scene, is reloaded without asking the runtime", async () => {
  const seen = [], s = setup(() => { seen.push(1); return { ok: true }; });
  const p = s.bridge.replace(result("s1", "<p>a"));
  assert.equal(s.frame.html, "<p>a");
  s.load();
  assert.equal(await p, "reloaded");
  const q = s.bridge.replace({ html: "<p>b" });
  assert.equal(s.frame.html, "<p>b");
  s.load();
  assert.equal(await q, "reloaded");
  assert.deepEqual(seen, []);
});
