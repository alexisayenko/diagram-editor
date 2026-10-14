import test from "node:test";
import assert from "node:assert/strict";
import { boot, demoFiles, flush } from "./cov-app.mjs";

const NOW = Date.UTC(2026, 0, 5, 10, 30);

test("with no local server the page says so and only Export-style actions stay possible", async () => {
  const h = await boot({ server: false });
  assert.match(h.status(), /^No local server: saved diagrams are unavailable/);
  assert.equal(h.statusError(), true);
  assert.equal(h.$("save").disabled, true);
  assert.equal(h.$("export").disabled, true);
  assert.equal(h.$("new").disabled, false);
  assert.equal(h.$("welcome").hidden, false);
});

test("an empty local server leaves the welcome page up and the controls usable", async () => {
  const h = await boot();
  assert.equal(h.$("welcome").hidden, false);
  assert.equal(h.status(), "");
  assert.equal(h.$("open").disabled, false);
  assert.equal(h.$("save").disabled, true);
});

test("the most recently saved diagram opens on start and the status line names it", async () => {
  const h = await boot({ files: { ...demoFiles("old-one"), ...demoFiles("new-one") }, mtimes: { "old-one": NOW - 5000, "new-one": NOW } });
  assert.equal(h.$("welcome").hidden, true);
  assert.equal(h.frame.hidden, false);
  assert.match(h.status(), /^new-one · Automatically arranged/);
  assert.equal(h.statusError(), false);
  assert.match(h.frame.srcdoc, /<svg/);
  assert.equal(h.$("export").disabled, false);
  assert.equal(h.$("save").disabled, true);
  assert.equal(h.$("import").disabled, false);
  assert.equal(h.frame.inert, false);
});

test("a stored layout is restored and the status says so", async () => {
  const files = { ...demoFiles("demo") };
  const first = await boot({ files });
  const layout = JSON.parse(JSON.stringify(first.D.layout));
  layout.nodes.db01.x += 40;
  const h = await boot({ files: { ...files, "demo/diagram.layout.json": JSON.stringify({ version: 1, diagramId: "demo", ...layout }) } });
  assert.match(h.status(), /^demo · Saved layout restored/);
  assert.equal(h.D.layout.nodes.db01.x, layout.nodes.db01.x);
});

test("an invalid stored layout is reported as an error", async () => {
  const h = await boot({ files: { ...demoFiles("demo"), "demo/diagram.layout.json": "{oops" } });
  assert.match(h.status(), /^demo\/diagram\.layout\.json: invalid JSON/);
  assert.equal(h.statusError(), true);
});

test("a diagram that fails to parse leaves the error on the status line", async () => {
  const h = await boot({ files: { "bad/topology.toml": "id = \n" } });
  assert.equal(h.statusError(), true);
  assert.ok(h.status().length > 0);
  assert.equal(h.$("welcome").hidden, false);
});

test("a spacing problem in the opened diagram is announced", async () => {
  const files = demoFiles("demo");
  const first = await boot({ files });
  const layout = JSON.parse(JSON.stringify(first.D.layout));
  layout.nodes.db02.x = layout.nodes.db01.x;
  layout.nodes.db02.y = layout.nodes.db01.y;
  const h = await boot({ files: { ...files, "demo/diagram.layout.json": JSON.stringify({ version: 1, ...layout }) } });
  assert.match(h.status(), /Open Edit layout to resolve highlighted spacing/);
});

test("if the diagram page cannot start, the status line says to reload it", async () => {
  const h = await boot({ files: demoFiles("demo"), autoLoad: false });
  await flush();
  h.loadFrame({});
  assert.equal(h.status(), "The diagram could not start. Reload it to retry.");
  assert.equal(h.statusError(), true);
  assert.equal(h.$("save").disabled, true);
  assert.equal(h.$("export").disabled, true);
});

test("a frame load before any diagram is open is ignored", async () => {
  const h = await boot({ autoLoad: false });
  h.frame.contentWindow = { InfraDiagram: { modules: {} } };
  h.frame.fire("load");
  assert.equal(h.status(), "");
});

test("a storage listing failure at start is shown as a plain error", async () => {
  const h = await boot({ boot: false });
  h.override = async (path) => (path === "/api/files" ? { ok: false, status: 500, json: async () => ({ error: "disk on fire" }) } : null);
  await h.start();
  assert.equal(h.status(), "disk on fire");
  assert.equal(h.statusError(), true);
  const h2 = await boot({ boot: false });
  h2.override = async () => ({ ok: false, status: 503, json: async () => { throw new Error("not json"); } });
  await h2.start();
  assert.equal(h2.status(), "Server error: HTTP 503");
});

test("a diagram folder that vanishes between listing and loading reports it", async () => {
  const h = await boot({ files: demoFiles("demo"), boot: false });
  let n = 0;
  h.override = async (path) => (path.startsWith("/api/file?name=demo%2Ftopology.toml") && ++n ? { ok: false, status: 404, json: async () => ({ error: "File not found" }) } : null);
  await h.start();
  assert.equal(h.status(), "demo is no longer stored.");
  assert.equal(h.statusError(), true);
});

test("the Open dialog lists saved diagrams newest first with server counts, and picking one loads it", async () => {
  const h = await boot({ files: { ...demoFiles("older"), ...demoFiles("newer") }, mtimes: { older: NOW - 60000, newer: NOW } });
  await h.click("open");
  assert.equal(h.$("op").hidden, false);
  const rows = h.$("oplist").children;
  assert.equal(rows.length, 2);
  const [first] = rows[0].children[0].children;
  assert.equal(first.textContent, "newer");
  assert.match(rows[0].children[0].children[1].textContent, /^7 servers · \d{4}-\d\d-\d\d \d\d:\d\d$/);
  assert.equal(h.$("oplist").children.length, 2);
  assert.equal(h.$("opnote").textContent, "");
  assert.equal(h.$("opq").hidden, true);
  assert.equal(rows[0].children[0].focused, 1);
  rows[1].children[0].fire("click");
  await flush();
  assert.equal(h.$("op").hidden, true);
  assert.match(h.status(), /^older · /);
  assert.equal(h.frame.inert, false);
});

test("the Open dialog with no saved diagrams, with no server, or when listing fails explains why", async () => {
  const empty = await boot();
  await empty.click("open");
  assert.equal(empty.$("opnote").textContent, "No saved diagrams yet. Use New diagram or Import diagram.");
  assert.equal(empty.$("opclose").focused, 1);
  const none = await boot({ server: false });
  await none.click("open");
  assert.match(none.$("opnote").textContent, /^No local server is running/);
  const failing = await boot({ files: demoFiles("demo"), boot: false });
  failing.override = null;
  await failing.start();
  failing.override = async (p) => (p === "/api/files" ? { ok: false, status: 500, json: async () => ({ error: "listing broke" }) } : null);
  await failing.click("open");
  assert.equal(failing.$("opnote").textContent, "listing broke");
});

test("with many saved diagrams a filter box appears and narrows the list; no match is announced", async () => {
  const files = {};
  for (let i = 1; i <= 10; i++) Object.assign(files, demoFiles("site-" + String(i).padStart(2, "0")));
  const h = await boot({ files });
  await h.click("open");
  assert.equal(h.$("opq").hidden, false);
  assert.equal(h.$("opq").focused, 1);
  assert.equal(h.$("oplist").children.length, 10);
  h.$("opq").value = " 07 ";
  h.$("opq").fire("input");
  assert.equal(h.$("oplist").children.length, 1);
  h.$("opq").value = "zzz";
  h.$("opq").fire("input");
  assert.equal(h.$("oplist").children.length, 0);
  assert.equal(h.$("opnote").textContent, "No diagram matches the filter.");
  h.$("opq").value = "";
  h.$("opq").fire("input");
  assert.equal(h.$("opnote").textContent, "");
});

test("the singular form is used for a diagram with one server", async () => {
  const files = { "one/topology.toml": 'id = "one"\ntitle = "One"\n', "one/servers/a.toml": 'id = "a"\nserver_type = "web"\n' };
  const h = await boot({ files });
  await h.click("open");
  assert.match(h.$("oplist").children[0].children[0].children[1].textContent, /^1 server · /);
});

test("the Open dialog closes with its button, Escape or a click on the backdrop, and focus returns to the button", async () => {
  const h = await boot({ files: demoFiles("demo") });
  const escape = () => h.doc.listeners ? h.docListeners.keydown.forEach((f) => f({ key: "Escape", preventDefault() { h.prevented = true; } })) : null;
  await h.click("open");
  await h.click("opclose");
  assert.equal(h.$("op").hidden, true);
  assert.ok(h.$("open").focused >= 1);
  await h.click("open");
  h.prevented = false;
  escape();
  assert.equal(h.$("op").hidden, true);
  assert.equal(h.prevented, true);
  await h.click("open");
  h.$("op").fire("mousedown", { target: {} });
  assert.equal(h.$("op").hidden, false);
  h.$("op").fire("mousedown", { target: h.$("op") });
  assert.equal(h.$("op").hidden, true);
  h.docListeners.keydown.forEach((f) => f({ key: "Escape", preventDefault() {} }));
  h.docListeners.keydown.forEach((f) => f({ key: "a", preventDefault() {} }));
});

test("picking a diagram while there are unsaved changes asks first; declining keeps the open one", async () => {
  const h = await boot({ files: { ...demoFiles("a-one"), ...demoFiles("b-two") }, mtimes: { "a-one": NOW, "b-two": NOW - 1000 } });
  h.ctl.editDirty = true;
  await h.click("open");
  h.confirmAnswer = false;
  const load = h.ctl.loads;
  h.$("oplist").children[1].children[0].fire("click");
  await flush();
  assert.deepEqual(h.confirms, ["Discard unsaved changes?"]);
  assert.equal(h.ctl.loads, load);
  assert.equal(h.$("op").hidden, false);
  h.confirmAnswer = true;
  h.$("oplist").children[1].children[0].fire("click");
  await flush();
  assert.match(h.status(), /^b-two · /);
});

test("a diagram that fails to load from the Open dialog shows the error and re-enables the toolbar", async () => {
  const h = await boot({ files: { ...demoFiles("good"), "bad/topology.toml": "id = \n" }, mtimes: { good: NOW, bad: NOW - 1000 } });
  await h.click("open");
  const bad = h.$("oplist").children.find((li) => li.children[0].children[0].textContent === "bad");
  bad.children[0].fire("click");
  await flush();
  assert.equal(h.statusError(), true);
  assert.equal(h.$("new").disabled, false);
  assert.equal(h.$("open").disabled, false);
});

test("New diagram: the dialog suggests a name, lists taken names and validates as you type", async () => {
  const h = await boot({ files: demoFiles("taken-one") });
  await h.click("new");
  assert.equal(h.$("nw").hidden, false);
  assert.equal(h.$("nwname").value, "new-diagram");
  assert.equal(h.$("nwname").focused, 1);
  assert.equal(h.$("nwname").selected, true);
  assert.equal(h.$("nwtaken").hidden, false);
  assert.deepEqual(h.$("nwlist").children.map((li) => li.textContent), ["taken-one"]);
  assert.equal(h.$("nwok").disabled, false);
  assert.equal(h.$("nwmsg").textContent, "");
  const check = (v) => { h.$("nwname").value = v; h.$("nwname").fire("input"); return [h.$("nwmsg").textContent, h.$("nwok").disabled]; };
  assert.deepEqual(check(""), ["", true]);
  assert.deepEqual(check("   "), ["", true]);
  assert.deepEqual(check("Bad Name"), ["Use lowercase letters, digits and hyphens, starting with a letter or digit.", true]);
  assert.deepEqual(check("a".repeat(61)), ["Use at most 60 characters.", true]);
  assert.deepEqual(check("taken-one"), ["taken-one already exists in local/. Open it, or choose another name.", true]);
  assert.deepEqual(check(" fine-name "), ["", false]);
});

test("New diagram without a server has no taken list, and creating one tells that Export downloads it", async () => {
  const h = await boot({ server: false });
  await h.click("new");
  assert.equal(h.$("nwtaken").hidden, true);
  assert.equal(h.$("nwok").disabled, false);
  await h.click("nwok");
  assert.equal(h.$("nw").hidden, true);
  assert.equal(h.status(), "new-diagram · New diagram, not saved yet · No local server: Export downloads it");
  assert.equal(h.$("welcome").hidden, true);
  assert.equal(h.frame.hidden, false);
  assert.equal(h.$("save").disabled, true);
  assert.equal(h.$("export").disabled, false);
});

test("New diagram on a server: creating via the button or Enter opens an empty, not-yet-saved diagram", async () => {
  const h = await boot();
  await h.click("new");
  h.$("nwname").value = "fresh-start";
  h.$("nwname").fire("input");
  const enter = h.$("nwname").fire("keydown", { key: "Enter" });
  await flush();
  assert.equal(enter.defaultPrevented, true);
  assert.equal(h.status(), "fresh-start · New diagram, not saved yet");
  assert.equal(h.$("nw").hidden, true);
  assert.equal(h.D.id, "fresh-start");
  await h.tick();
  assert.equal(h.$("save").disabled, false);
});

test("New diagram: other keys, an invalid name and a declined discard do nothing", async () => {
  const h = await boot({ files: demoFiles("demo") });
  await h.click("new");
  assert.equal(h.$("nwname").fire("keydown", { key: "a" }).defaultPrevented, false);
  h.$("nwname").value = "Bad";
  h.$("nwname").fire("input");
  h.$("nwname").fire("keydown", { key: "Enter" });
  assert.equal(h.$("nw").hidden, false);
  h.$("nwname").value = "good";
  h.$("nwname").fire("input");
  h.ctl.editDirty = true;
  h.confirmAnswer = false;
  const loads = h.ctl.loads;
  await h.click("nwok");
  assert.equal(h.$("nw").hidden, false);
  assert.equal(h.ctl.loads, loads);
  assert.deepEqual(h.confirms, ["Discard unsaved changes?"]);
});

test("the New dialog closes with Cancel, Escape and a backdrop click, returning focus to its button", async () => {
  const h = await boot();
  await h.click("new");
  await h.click("nwcancel");
  assert.equal(h.$("nw").hidden, true);
  assert.ok(h.$("new").focused >= 1);
  await h.click("new");
  h.docListeners.keydown.forEach((f) => f({ key: "Escape", preventDefault() {} }));
  assert.equal(h.$("nw").hidden, true);
  await h.click("new");
  h.$("nw").fire("mousedown", { target: {} });
  assert.equal(h.$("nw").hidden, false);
  h.$("nw").fire("mousedown", { target: h.$("nw") });
  assert.equal(h.$("nw").hidden, true);
});

test("a render failure while creating a diagram shows the error instead of opening it", async () => {
  const h = await boot();
  await h.click("new");
  h.$("nwname").value = "ok-name";
  h.$("nwname").fire("input");
  const original = h.frame.srcdoc;
  h.win.ASSETS = null;
  await h.click("nwok");
  assert.equal(h.statusError(), true);
  assert.equal(h.frame.srcdoc, original);
});

test("a stored layout made for another diagram id opens with a warning", async () => {
  const files = demoFiles("demo");
  const first = await boot({ files });
  const layout = JSON.parse(JSON.stringify(first.D.layout));
  const h = await boot({ files: { ...files, "demo/diagram.layout.json": JSON.stringify({ version: 1, diagramId: "renamed", ...layout }) } });
  assert.match(h.status(), /Warning: Saved layout was made for diagram "renamed"/);
  assert.equal(h.statusError(), false);
  assert.equal(h.$("welcome").hidden, true);
});

test("API fetches carry a timeout signal and a stalled server is reported as such", async () => {
  const h = await boot({ boot: false });
  const seen = [];
  h.override = async (path, options) => { seen.push(options.signal); const e = new Error("timed out"); e.name = "TimeoutError"; throw e; };
  await h.start();
  assert.ok(seen[0] instanceof AbortSignal);
  assert.match(h.status(), /did not answer within 15 s/);
  assert.equal(h.statusError(), true);
});

test("an unhandled promise rejection is reported in the toolbar message area", async () => {
  const h = await boot();
  h.listeners.unhandledrejection[0]({ reason: new Error("boom") });
  assert.equal(h.status(), "Unexpected error: boom");
  assert.equal(h.statusError(), true);
});
