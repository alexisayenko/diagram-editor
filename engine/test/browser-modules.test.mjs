import test from "node:test";
import assert from "node:assert/strict";
import { createApi, FETCH_TIMEOUT_MS } from "../browser/api.mjs";
import { createSession, createSessionHolder, markNew, markImported, hasUnsaved, notesEdited, recordSaved } from "../browser/session.mjs";
import { createConfirmer } from "../browser/dialogs.mjs";
import { createFrameBridge } from "../browser/frame-bridge.mjs";
import { saveMessage, partialSaveMessage, plural } from "../browser/messages.mjs";
import { guarded, withNotes } from "../browser/edits.mjs";

const reply = (status, body, statusText = "") => ({ ok: status < 400, status, statusText, json: async () => { if (body instanceof Error) throw body; return body; } });

test("api: a good answer returns the body, and every call carries a timeout signal", async () => {
  const seen = [];
  const api = createApi(async (path, options) => { seen.push([path, options]); return reply(200, { files: [] }); });
  assert.deepEqual(await api.call("/api/files"), { files: [] });
  assert.ok(seen[0][1].signal instanceof AbortSignal);
  assert.equal(FETCH_TIMEOUT_MS, 15000);
});

test("api: no server and no answer in time are plain errors with their own messages", async () => {
  const down = createApi(async () => { throw new TypeError("fetch failed"); });
  await assert.rejects(down.call("/x"), { message: "The local server is not reachable. Run node engine/serve.mjs." });
  const slow = createApi(async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); });
  await assert.rejects(slow.call("/x"), { message: "The local server did not answer within 15 s." });
});

test("api: an HTTP error carries the server text, the status and the files already saved", async () => {
  const api = createApi(async () => reply(409, { error: "changed on disk", saved: ["a"] }));
  await assert.rejects(api.call("/x"), (e) => e.message === "changed on disk" && e.status === 409 && e.saved.length === 1 && e.saved[0] === "a");
  const bare = createApi(async () => reply(503, new Error("not json"), "Service Unavailable"));
  await assert.rejects(bare.call("/x"), (e) => e.message === "Server error: HTTP 503 Service Unavailable" && e.status === 503 && e.saved.length === 0);
  const noText = createApi(async () => reply(500, {}));
  await assert.rejects(noText.call("/x"), { message: "Server error: HTTP 500" });
});

test("api: stored files read as null when missing, other failures pass through, writes are JSON PUTs", async () => {
  const seen = [];
  const api = createApi(async (path, options = {}) => {
    seen.push([path, options]);
    if (path.includes("missing")) return reply(404, { error: "no such file" });
    if (path.includes("broken")) return reply(500, { error: "disk" });
    if (options.method === "PUT") return reply(200, { saved: ["a"] });
    return path === "/api/files" ? reply(200, { files: [{ name: "b/topology.toml", size: 1, mtime: 5 }, { name: "a/topology.toml", size: 1, mtime: 9 }] }) : reply(200, { text: "hello" });
  });
  assert.equal(await api.stored("a/x y.toml"), "hello");
  assert.equal(seen[0][0], "/api/file?name=a%2Fx%20y.toml");
  assert.equal(await api.stored("missing.toml"), null);
  await assert.rejects(api.stored("broken.toml"), { message: "disk" });
  assert.deepEqual(await api.putFiles([{ name: "n", text: "t" }]), { saved: ["a"] });
  const put = seen.at(-1)[1];
  assert.equal(put.method, "PUT");
  assert.equal(put.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(put.body), { files: [{ name: "n", text: "t" }] });
  assert.equal(await api.latestStored(), "a");
  const empty = createApi(async () => reply(200, { files: [] }));
  assert.equal(await empty.latestStored(), null);
});

const init = (extra = {}) => ({ folder: "demo", layoutName: "demo/diagram.layout.json", files: new Map([["topology.toml", "t"]]), layoutText: "{}", layout: null, layoutLocked: false, id: "demo", notes: ["n"], ...extra });

test("session: the factory fills every documented field with its starting value", () => {
  const s = createSession(init());
  assert.deepEqual(Object.keys(s).sort(), ["after", "carryLayout", "extra", "fresh", "folder", "hadDrawings", "id", "layoutLocked", "layoutName", "netNames", "notes", "reload", "source", "text", "work"].sort());
  assert.deepEqual([...s.source], [["topology.toml", "t"]]);
  assert.notEqual(s.source, s.work);
  assert.deepEqual([s.carryLayout, s.fresh, s.reload, s.after, s.hadDrawings], [false, false, null, null, false]);
  assert.deepEqual(s.extra, {});
  assert.equal(s.netNames.size, 0);
});

test("session: unknown layout keys are carried and a drawings key is remembered", () => {
  const s = createSession(init({ layout: { version: 1, diagramId: "demo", nodes: {}, clusters: {}, edges: {}, drawings: [], zoom: 2, note: "x" } }));
  assert.deepEqual(s.extra, { zoom: 2, note: "x" });
  assert.equal(s.hadDrawings, true);
});

test("session: the holder starts empty and keeps the session it was given", () => {
  const holder = createSessionHolder();
  assert.equal(holder.has(), false);
  assert.equal(holder.current(), null);
  const s = holder.start(createSession(init()));
  assert.equal(holder.has(), true);
  assert.equal(holder.current(), s);
});

test("session: new and imported diagrams start with nothing saved", () => {
  const fresh = createSession(init());
  markNew(fresh);
  assert.equal(fresh.source.size, 0);
  assert.equal(fresh.fresh, false);
  const imported = createSession(init());
  markImported(imported);
  assert.deepEqual([imported.source.size, imported.text, imported.carryLayout, imported.fresh], [0, null, true, true]);
});

test("session: unsaved work is a changed file, a carried layout or edited notes", () => {
  assert.equal(hasUnsaved(null, ["x"]), false);
  const s = createSession(init());
  assert.equal(hasUnsaved(s, null), false);
  assert.equal(hasUnsaved(s, ["n"]), false);
  assert.equal(hasUnsaved(s, ["changed"]), true);
  assert.equal(notesEdited(s, ["n"]), false);
  s.carryLayout = true;
  assert.equal(hasUnsaved(s, null), true);
  s.carryLayout = false;
  s.work.set("topology.toml", "edited");
  assert.equal(hasUnsaved(s, null), true);
  recordSaved(s, "topology.toml", "edited");
  assert.equal(hasUnsaved(s, null), false);
  assert.equal(s.source.get("topology.toml"), "edited");
});

test("dialogs: the confirm prompts use one wording each", () => {
  const asked = [];
  const confirmer = createConfirmer((t) => { asked.push(t); return t.startsWith("Replace"); });
  assert.equal(confirmer.discard(() => false), true);
  assert.deepEqual(asked, []);
  assert.equal(confirmer.discard(() => true), false);
  assert.equal(confirmer.replace("demo"), true);
  assert.deepEqual(asked, ["Discard unsaved changes?", "Replace the saved diagram demo?"]);
});

function fakeFrame() {
  const handlers = [], docListeners = [];
  const frame = {
    addEventListener: (type, f) => { if (type === "load") handlers.push(f); },
    contentDocument: { addEventListener: (type, f, capture) => docListeners.push({ type, f, capture }), getElementById: (id) => ({ click: () => { frame.clicked = id; } }) },
    contentWindow: null,
    set srcdoc(html) { frame.html = html; },
    load(modules, extra = {}) { frame.contentWindow = { InfraDiagram: { modules, select: (k) => { frame.selected = k; }, attachHost: (h) => { frame.attached = [...(frame.attached || []), h]; }, ...extra } }; handlers.forEach((f) => f()); },
  };
  return { frame, docListeners };
}
const runtime = (over = {}) => ({
  "canvas/edit-mode": { isDirty: () => false }, "canvas/model": { state: { on: true } }, "ui/notes-edit": { isDirty: () => false, texts: () => ["t"] },
  "ui/server-edit": { isDirty: () => false }, "canvas/draw": { isDirty: () => false }, ...over,
});

test("frame bridge: a load nobody asked for is ignored; the first show makes loads count", () => {
  const { frame } = fakeFrame();
  const loads = [];
  const bridge = createFrameBridge(frame, { host: {}, onLoad: (r) => loads.push(r), onChange() {} });
  frame.load(runtime());
  assert.deepEqual(loads, []);
  assert.equal(bridge.isReady(), false);
  bridge.show("<p>");
  assert.equal(frame.html, "<p>");
  frame.load(runtime());
  assert.deepEqual(loads, [true]);
  assert.equal(bridge.isReady(), true);
});

test("frame bridge: the ready callback fires on load, the host interface is installed and show() resolves", async () => {
  const { frame, docListeners } = fakeFrame();
  const host = { noteParser: () => 1, serverEditor: { add() {} } };
  const order = [];
  const bridge = createFrameBridge(frame, { host, onLoad: (ready) => order.push(["load", ready]), onChange() {} });
  const loaded = bridge.show("<p>").then(() => order.push(["resolved"]));
  assert.equal(bridge.isReady(), false);
  frame.load(runtime());
  await loaded;
  assert.deepEqual(order, [["load", true], ["resolved"]]);
  assert.deepEqual(frame.attached, [host]);
  assert.deepEqual(docListeners.map((l) => l.type), ["pointerup", "keyup", "input", "change", "click"]);
  assert.ok(docListeners.every((l) => l.capture === true));
});

test("frame bridge: a frame without the runtime reports not ready and gets no host", async () => {
  const { frame, docListeners } = fakeFrame();
  const loads = [];
  const bridge = createFrameBridge(frame, { host: { noteParser() {}, serverEditor: {} }, onLoad: (r) => loads.push(r), onChange() {} });
  const loaded = bridge.show("<p>");
  frame.load({});
  await loaded;
  assert.deepEqual(loads, [false]);
  assert.equal(bridge.isReady(), false);
  assert.equal(bridge.editor(), null);
  assert.equal(bridge.isDirty(), false);
  assert.equal(bridge.noteTexts(), null);
  assert.equal(frame.attached, undefined);
  assert.equal(docListeners.length, 0);
});

test("frame bridge: activity in the frame reports one change per burst, with no polling", () => {
  const { frame, docListeners } = fakeFrame();
  const deferred = [];
  let changes = 0;
  const bridge = createFrameBridge(frame, { host: {}, onLoad() {}, onChange: () => { changes++; }, defer: (f) => deferred.push(f) });
  bridge.show("x");
  frame.load(runtime());
  docListeners.forEach((l) => l.f({}));
  docListeners[0].f({});
  assert.equal(deferred.length, 1);
  assert.equal(changes, 0);
  deferred.shift()();
  assert.equal(changes, 1);
  docListeners[1].f({});
  assert.equal(deferred.length, 1);
});

test("frame bridge: the default defer is a zero timeout", async () => {
  const { frame, docListeners } = fakeFrame();
  let changes = 0;
  const bridge = createFrameBridge(frame, { host: {}, onLoad() {}, onChange: () => { changes++; } });
  bridge.show("x");
  frame.load(runtime());
  docListeners[0].f({});
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(changes, 1);
});

test("frame bridge: dirty state, notes, selection and edit mode read through the runtime", () => {
  const { frame } = fakeFrame();
  const state = { edit: false, notes: false, server: false, draw: false };
  const bridge = createFrameBridge(frame, { host: {}, onLoad() {}, onChange() {} });
  bridge.show("x");
  frame.load(runtime({
    "canvas/edit-mode": { isDirty: () => state.edit }, "ui/notes-edit": { isDirty: () => state.notes, texts: () => ["a", "b"] },
    "ui/server-edit": { isDirty: () => state.server }, "canvas/draw": { isDirty: () => state.draw },
  }));
  assert.equal(bridge.isDirty(), false);
  for (const key of ["edit", "notes", "server", "draw"]) {
    state[key] = true;
    assert.equal(bridge.isDirty(), true, key);
    state[key] = false;
  }
  assert.deepEqual(bridge.noteTexts(), ["a", "b"]);
  assert.equal(bridge.editing(), true);
  bridge.select("n:x");
  assert.equal(frame.selected, "n:x");
  bridge.clickEdit();
  assert.equal(frame.clicked, "te");
  assert.ok(bridge.editor() && bridge.notes() && bridge.server() && bridge.draw());
});

test("messages: the save line names what was written, what was refused and what failed", () => {
  const s = createSession(init());
  const none = { count: 0, renamed: 0 };
  assert.equal(saveMessage(s, [], none), "Saved demo/diagram.layout.json in local/");
  assert.equal(saveMessage(s, ["a", "b"], { count: 1, renamed: 2, error: "boom" }), "Saved demo/diagram.layout.json and 2 file(s) in local/demo/ · 1 new networks added to networks.toml · 2 network names saved to networks.toml · networks.toml not updated: boom");
  assert.match(saveMessage(s, [], { count: 0, renamed: 1 }), /1 network name saved/);
  s.layoutLocked = true;
  assert.equal(saveMessage(s, [], none), "Nothing saved · demo/diagram.layout.json not written: it was made by a newer engine");
  assert.equal(saveMessage(s, ["a"], none), "Saved 1 file(s) in local/demo/ · demo/diagram.layout.json not written: it was made by a newer engine");
  assert.deepEqual([plural(1), plural(0), plural(2)], ["", "s", "s"]);
});

test("messages: a partial save lists what is written and what is left", () => {
  const s = createSession(init());
  const text = partialSaveMessage(s, ["topology.toml", "notes.toml"], { message: "Disk full.", saved: ["demo/diagram.layout.json", "demo/topology.toml"] });
  assert.equal(text, "Saved demo/diagram.layout.json, demo/topology.toml. Disk full. Not saved: demo/notes.toml.");
});

test("edits: a guarded bridge returns the blocking text or the error text, and null on success", () => {
  let blocked = "wait", ran = 0;
  const hook = guarded(() => blocked, (x) => { ran++; if (x === "boom") throw new Error("failed " + x); });
  assert.equal(hook("a"), "wait");
  assert.equal(ran, 0);
  blocked = null;
  assert.equal(hook("a"), null);
  assert.equal(hook("boom"), "failed boom");
  assert.equal(ran, 2);
});

test("edits: notes are written only when there is something to write or a file to update", () => {
  const files = new Map([["topology.toml", "t"]]);
  assert.equal(withNotes(files, []).has("notes.toml"), false);
  const kept = withNotes(new Map([["notes.toml", ""]]), []);
  assert.equal(kept.has("notes.toml"), true);
  assert.match(withNotes(files, ["first note"]).get("notes.toml"), /first note/);
});
