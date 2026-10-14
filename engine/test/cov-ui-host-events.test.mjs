import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./registry-helper.mjs";

test("attachHost hands the runtime the documented host fields once", () => {
  const { core, InfraDiagram } = loadCore();
  assert.deepEqual({ ...core.host }, { noteParser: null, serverEditor: null });
  const host = { noteParser: () => 1, serverEditor: { add() {} } };
  InfraDiagram.attachHost(host);
  assert.equal(core.host.noteParser, host.noteParser);
  assert.equal(core.host.serverEditor, host.serverEditor);
});

test("a second attachHost is an error and keeps the first host", () => {
  const { core } = loadCore();
  const first = { noteParser: () => 1, serverEditor: {} };
  core.attachHost(first);
  assert.throws(() => core.attachHost({ noteParser: () => 2, serverEditor: {} }), /already attached/);
  assert.equal(core.host.noteParser, first.noteParser);
  core.detachHost();
  assert.equal(core.host.serverEditor, null);
  core.attachHost({ noteParser: () => 3 });
  assert.equal(core.host.serverEditor, null, "missing fields stay null");
});

test("attachHost rejects a missing host and a noteParser that is not a function", () => {
  const { core } = loadCore();
  assert.throws(() => core.attachHost(null), { name: "TypeError" });
  assert.throws(() => core.attachHost("host"), { name: "TypeError" });
  assert.throws(() => core.attachHost({ noteParser: "x" }), { name: "TypeError" });
  core.attachHost({});
  assert.equal(core.host.noteParser, null);
});

test("a service has one provider: the second writer throws, the first stays", () => {
  const { core } = loadCore();
  const first = () => 1;
  assert.equal(core.services.getState, null);
  core.provide("getState", first);
  assert.throws(() => core.provide("getState", () => 2), /already provided/);
  assert.equal(core.services.getState, first);
  core.revoke("getState");
  assert.equal(core.services.getState, null);
  core.provide("getState", () => 3);
  assert.equal(core.services.getState(), 3);
});

test("services are declared: unknown names and non-functions are errors, assignment is not possible", () => {
  const { core } = loadCore();
  assert.throws(() => core.provide("nope", () => 1), /unknown service/);
  assert.throws(() => core.revoke("nope"), /unknown service/);
  assert.throws(() => core.provide("fit", 5), { name: "TypeError" });
  assert.throws(() => { core.services.fit = () => 1; }, { name: "TypeError" });
  assert.deepEqual([...Object.keys(core.services)], [...core.SERVICES]);
});

test("events reach subscribers in subscription order with the emitted arguments", () => {
  const { core } = loadCore();
  const seen = [];
  core.on("panel", (key, pn) => seen.push(["first", key, pn]));
  core.on("panel", (key) => seen.push(["second", key]));
  core.emit("panel", "n:a", "PN");
  assert.deepEqual(seen, [["first", "n:a", "PN"], ["second", "n:a"]]);
  core.emit("render");
  assert.equal(seen.length, 2, "other events do not reach panel handlers");
});

test("a throwing subscriber is reported and does not stop the others or the emitter", () => {
  const errors = [], { core } = loadCore({ errors });
  const seen = [];
  core.on("panel", () => seen.push("a"));
  core.on("panel", () => { throw new Error("boom"); });
  core.on("panel", () => seen.push("c"));
  assert.doesNotThrow(() => core.emit("panel", "n:a"));
  assert.deepEqual(seen, ["a", "c"]);
  assert.equal(errors.length, 1);
  assert.match(errors[0][0], /handler for panel failed/);
  assert.equal(errors[0][1].message, "boom");
});

test("subscribing: unknown events, non-functions and the same handler twice are errors; the returned function unsubscribes", () => {
  const { core } = loadCore();
  const fn = () => { throw new Error("must not run"); };
  assert.throws(() => core.on("nope", fn), /unknown event/);
  assert.throws(() => core.emit("nope"), /unknown event/);
  assert.throws(() => core.on("panel", "x"), { name: "TypeError" });
  const off = core.on("panel", fn);
  assert.throws(() => core.on("panel", fn), /already subscribed/);
  off();
  off();
  core.emit("panel", "n:a");
  core.on("panel", fn);
});

test("a handler that unsubscribes while an event is delivered does not skip the next one", () => {
  const { core } = loadCore();
  const seen = [];
  const off = core.on("render", () => { seen.push(1); off(); });
  core.on("render", () => seen.push(2));
  core.emit("render");
  core.emit("render");
  assert.deepEqual(seen, [1, 2, 2]);
});

test("the event names are listed in one place and exported", () => {
  const { core } = loadCore();
  assert.deepEqual([...core.EVENTS], ["panel", "render", "scene"]);
  assert.equal(typeof core.createRegistry, "function");
  const other = core.createRegistry();
  other.provide("fit", () => 1);
  assert.equal(core.services.fit, null, "registries are independent");
});
