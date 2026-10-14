import test from "node:test";
import assert from "node:assert/strict";
import { boot, demoFiles, flush } from "./cov-app.mjs";
import { unpackDiagram } from "../lib/diagrams.mjs";

const site = (ip = "203.0.113.7/24", extra = {}) => ({
  "site/topology.toml": 'id = "site"\ntitle = "Site"\n',
  "site/servers/a.toml": `id = "a"\nserver_type = "web"\nips = ["${ip}"]\n`,
  ...extra,
});
const conflict = (names = []) => ({ ok: false, status: 409, json: async () => ({ error: `${names.join(", ")} changed on disk since it was loaded. Nothing was written.`, conflicts: names }) });
const fail = (status, error, saved) => ({ ok: false, status, json: async () => ({ error, ...(saved ? { saved } : {}) }) });
const isPut = (path, options, needle) => options.method === "PUT" && path === "/api/files" && options.body.includes(needle);

test("Save follows every source of unsaved work, the server being reachable and the busy state", async () => {
  const h = await boot({ files: demoFiles("demo") });
  const saveOff = async () => { await h.tick(); return h.$("save").disabled; };
  assert.equal(await saveOff(), true);
  for (const key of ["editDirty", "notesDirty", "serverDirty", "drawDirty"]) {
    h.ctl[key] = true;
    assert.equal(await saveOff(), false, key);
    h.ctl[key] = false;
  }
  assert.equal(await saveOff(), true);
  h.ctl.notesTexts = ["changed note"];
  assert.equal(await saveOff(), false);
  h.ctl.notesTexts = null;
  assert.equal(h.intervals.length, 0);
});

test("with no reachable server Save stays disabled however much is changed", async () => {
  const h = await boot({ server: false });
  await h.click("new");
  await h.click("nwok");
  h.ctl.editDirty = true;
  await h.tick();
  assert.equal(h.$("save").disabled, true);
  assert.equal(h.$("export").disabled, false);
});

test("closing the page with unsaved work is blocked; with nothing unsaved it is not", async () => {
  const h = await boot({ files: demoFiles("demo") });
  const e = { preventDefault() { this.prevented = true; } };
  h.listeners.beforeunload.forEach((f) => f(e));
  assert.equal(e.prevented, undefined);
  h.ctl.drawDirty = true;
  const e2 = { preventDefault() { this.prevented = true; } };
  h.listeners.beforeunload.forEach((f) => f(e2));
  assert.equal(e2.prevented, true);
  assert.equal(e2.returnValue, "");
});

test("Save writes the layout file, marks everything saved and reports it", async () => {
  const h = await boot({ files: demoFiles("demo") });
  h.ctl.editDirty = true;
  await h.tick();
  await h.click("save");
  const written = JSON.parse(h.read("demo/diagram.layout.json"));
  assert.equal(written.version, 1);
  assert.equal(written.diagramId, "demo");
  assert.deepEqual(Object.keys(written).sort(), ["clusters", "diagramId", "edges", "nodes", "version"]);
  assert.equal(h.status(), "Saved demo/diagram.layout.json in local/");
  assert.equal(h.statusError(), false);
  assert.equal(h.ctl.commits.length, 1);
  assert.equal(h.ctl.drawMarked, 1);
  assert.equal(h.$("save").disabled, true);
  assert.equal(h.frame.inert, false);
  const put = h.requests.filter((r) => r[0] === "PUT")[0];
  assert.equal(JSON.parse(put[2]).files[0].base, null);
  h.ctl.editDirty = true;
  await h.click("save");
  const put2 = h.requests.filter((r) => r[0] === "PUT").at(-1);
  assert.equal(JSON.parse(put2[2]).files[0].base, h.read("demo/diagram.layout.json"));
});

test("drawings are saved with the layout, and a layout that once had drawings keeps an empty list", async () => {
  const h = await boot({ files: demoFiles("demo") });
  const s = { id: "s1", color: "#3b82f6", width: 2, points: [[1, 1], [20, 20]] };
  h.ctl.drawings = [s];
  h.ctl.drawDirty = true;
  await h.click("save");
  assert.deepEqual(JSON.parse(h.read("demo/diagram.layout.json")).drawings, [s]);
  h.ctl.drawings = [];
  h.ctl.drawDirty = true;
  await h.click("save");
  assert.deepEqual(JSON.parse(h.read("demo/diagram.layout.json")).drawings, []);
});

test("unknown keys of a stored layout survive a save", async () => {
  const files = demoFiles("demo");
  const first = await boot({ files });
  const stored = JSON.stringify({ version: 1, diagramId: "demo", ...first.D.layout, keepMe: { a: 1 } });
  const h = await boot({ files: { ...files, "demo/diagram.layout.json": stored } });
  h.ctl.editDirty = true;
  await h.click("save");
  assert.deepEqual(JSON.parse(h.read("demo/diagram.layout.json")).keepMe, { a: 1 });
});

test("a layout from a newer engine opens with an automatic arrangement, a warning, and is never overwritten by Save", async () => {
  const files = demoFiles("demo"), newer = JSON.stringify({ version: 2, diagramId: "demo", nodes: { db01: { future: true } } });
  const h = await boot({ files: { ...files, "demo/diagram.layout.json": newer } });
  assert.match(h.status(), /^demo · Automatically arranged.* Warning: The saved layout is version 2, newer than this engine supports \(1\)/);
  assert.equal(h.statusError(), false);
  h.ctl.editDirty = true;
  await h.click("save");
  assert.equal(h.read("demo/diagram.layout.json"), newer);
  assert.match(h.status(), /Nothing saved · demo\/diagram\.layout\.json not written: it was made by a newer engine/);
});

test("edited notes are written to notes.toml and the count of files is reported", async () => {
  const h = await boot({ files: demoFiles("demo") });
  h.ctl.notesTexts = ["First edited note\n\nBody text."];
  h.ctl.notesDirty = true;
  await h.click("save");
  assert.match(h.read("demo/notes.toml"), /First edited note/);
  assert.equal(h.status(), "Saved demo/diagram.layout.json and 1 file(s) in local/demo/");
  assert.deepEqual(h.ctl.notesMarked, [["First edited note\n\nBody text."]]);
  assert.equal(h.ctl.commits.length, 1);
});

test("a conflicting file on disk stops the save, reports it and leaves everything unsaved", async () => {
  const h = await boot({ files: demoFiles("demo") });
  h.put("demo/diagram.layout.json", "{}");
  h.ctl.editDirty = true;
  await h.click("save");
  assert.equal(h.status(), "Save failed: demo/diagram.layout.json changed on disk since it was loaded. Nothing was written.");
  assert.equal(h.statusError(), true);
  assert.equal(h.read("demo/diagram.layout.json"), "{}");
  assert.equal(h.ctl.commits.length, 0);
  assert.equal(h.frame.inert, false);
  assert.equal(h.$("new").disabled, false);
});

test("a partly failed save marks what reached the disk and lists what did not", async () => {
  const h = await boot({ files: demoFiles("demo") });
  h.override = async (path, options) => (isPut(path, options, "notes.toml") ? fail(500, "Writing demo/notes.toml failed: disk full", ["demo/diagram.layout.json"]) : null);
  h.ctl.notesTexts = ["A note\n\nBody."];
  h.ctl.notesDirty = true;
  await h.click("save");
  assert.equal(h.status(), "Saved demo/diagram.layout.json. Writing demo/notes.toml failed: disk full Not saved: demo/notes.toml.");
  assert.equal(h.statusError(), true);
  assert.equal(h.ctl.commits.length, 1);
  assert.deepEqual(h.ctl.notesMarked, []);
});

test("a partial failure that also saved a changed file records that file as saved", async () => {
  const h = await boot({ files: demoFiles("demo") });
  h.override = async (path, options) => (isPut(path, options, "notes.toml") ? fail(500, "late failure", ["demo/diagram.layout.json", "demo/notes.toml"]) : null);
  h.ctl.notesTexts = ["Another note\n\nBody."];
  h.ctl.notesDirty = true;
  await h.click("save");
  assert.match(h.status(), /^Saved demo\/diagram\.layout\.json, demo\/notes\.toml\. late failure Not saved: \.$/);
  assert.equal(h.ctl.notesMarked.length, 1);
});

test("Save needs the open server edit and note edit to be finished first", async () => {
  const h = await boot({ files: demoFiles("demo") });
  h.ctl.editDirty = true;
  h.ctl.serverOpen = "name is required";
  await h.click("save");
  assert.equal(h.status(), "Save failed: Fix the server first: name is required");
  h.ctl.serverOpen = null;
  h.ctl.notesOpen = "title is empty";
  await h.click("save");
  assert.equal(h.status(), "Save failed: Fix the note first: title is empty");
  assert.equal(h.requests.filter((r) => r[0] === "PUT").length, 0);
});

test("Save does nothing before a diagram is ready", async () => {
  const h = await boot({ files: demoFiles("demo"), autoLoad: false });
  await flush();
  h.$("save").fire("click");
  await flush();
  assert.equal(h.requests.filter((r) => r[0] === "PUT").length, 0);
  h.$("export").fire("click");
  await flush();
  assert.equal(h.downloads.length, 0);
});

test("Save adds the networks that the servers' IPs imply to networks.toml", async () => {
  const h = await boot({ files: site() });
  h.ctl.editDirty = true;
  await h.click("save");
  assert.match(h.read("site/networks.toml"), /\[\[networks\]\]\ncidr = "203\.0\.113\.0\/24"/);
  assert.equal(h.status(), "Saved site/diagram.layout.json in local/ · 1 new networks added to networks.toml");
  assert.equal(h.statusError(), false);
  h.ctl.editDirty = true;
  await h.click("save");
  assert.equal(h.status(), "Saved site/diagram.layout.json in local/");
});

test("an up-to-date networks.toml is not touched", async () => {
  const h = await boot({ files: demoFiles("demo") });
  const before = h.read("demo/networks.toml");
  h.ctl.editDirty = true;
  await h.click("save");
  assert.equal(h.read("demo/networks.toml"), before);
  assert.equal(h.requests.filter((r) => r[0] === "PUT").length, 1);
});

test("a network name set in the editor is written to networks.toml on Save", async () => {
  const h = await boot({ files: demoFiles("demo") });
  assert.equal(h.serverEditor().renameNetwork("203.0.113.0/24", "Edge net"), null);
  await flush();
  h.ctl.editDirty = true;
  await h.click("save");
  assert.match(h.read("demo/networks.toml"), /name = "Edge net"/);
  assert.equal(h.status(), "Saved demo/diagram.layout.json in local/ · 1 network name saved to networks.toml");
  h.serverEditor().renameNetwork("192.0.2.0/24", "Core");
  await flush();
  h.serverEditor().renameNetwork("203.0.113.0/24", "Edge two");
  await flush();
  await h.click("save");
  assert.match(h.status(), /· 2 network names saved to networks.toml$/);
});

test("a networks.toml changed by someone else during the save is re-read once and merged", async () => {
  const h = await boot({ files: site() });
  let first = true;
  h.override = async (path, options) => {
    if (isPut(path, options, "networks.toml") && first) { first = false; h.put("site/networks.toml", "# edited elsewhere\n"); return conflict(["site/networks.toml"]); }
    return null;
  };
  h.ctl.editDirty = true;
  await h.click("save");
  const text = h.read("site/networks.toml");
  assert.match(text, /^# edited elsewhere\n\n\[\[networks\]\]\ncidr = "203\.0\.113\.0\/24"/);
  assert.match(h.status(), /1 new networks added/);
});

test("a second conflict on networks.toml, or another error, is reported without failing the save", async () => {
  const twice = await boot({ files: site() });
  twice.override = async (path, options) => (isPut(path, options, "networks.toml") ? conflict(["site/networks.toml"]) : null);
  twice.ctl.editDirty = true;
  await twice.click("save");
  assert.equal(twice.status(), "Saved site/diagram.layout.json in local/ · networks.toml not updated: site/networks.toml changed on disk since it was loaded. Nothing was written.");
  assert.equal(twice.statusError(), true);
  assert.equal(twice.read("site/networks.toml"), null);
  const other = await boot({ files: site() });
  other.override = async (path, options) => (isPut(path, options, "networks.toml") ? fail(500, "nope") : null);
  other.ctl.editDirty = true;
  await other.click("save");
  assert.match(other.status(), /networks\.toml not updated: nope$/);
});

test("a failure reading networks.toml is reported as a note on the save", async () => {
  const h = await boot({ files: site() });
  h.override = async (path) => (path === "/api/file?name=site%2Fnetworks.toml" ? fail(500, "read broke") : null);
  h.ctl.editDirty = true;
  await h.click("save");
  assert.equal(h.status(), "Saved site/diagram.layout.json in local/ · networks.toml not updated: read broke");
  assert.equal(h.statusError(), true);
});

test("Export downloads every file and the layout as one .diag.zip", async () => {
  const h = await boot({ files: demoFiles("demo") });
  h.ctl.drawings = [{ id: "s1", color: "#3b82f6", width: 2, points: [[1, 1]] }];
  await h.clickAct("export");
  assert.equal(h.downloads.length, 1);
  const { name } = h.downloads[0];
  assert.match(name, /^demo-\d{8}-\d{6}\.diag\.zip$/);
  assert.equal(h.lastBlob.type, "application/zip");
  const bytes = new Uint8Array(await h.lastBlob.parts[0]);
  const opened = await unpackDiagram(bytes, name);
  assert.equal(opened.name, "demo");
  assert.ok(opened.files.has("topology.toml"));
  assert.ok(opened.files.has("servers/web01.toml"));
  assert.deepEqual(JSON.parse(opened.layoutText).drawings.length, 1);
  assert.equal(h.status(), `Exported ${name} (${opened.files.size + 1} files) to your downloads`);
  h.timers.at(-1)[0]();
  assert.equal(h.revoked, "blob:0");
  assert.equal(h.timers.at(-1)[1], 2000);
});

test("Export includes edited notes, and stops on an unfinished note or server edit", async () => {
  const h = await boot({ files: demoFiles("demo") });
  h.ctl.notesTexts = ["Exported note\n\nText."];
  await h.clickAct("export");
  const opened = await unpackDiagram(new Uint8Array(await h.lastBlob.parts[0]), h.downloads[0].name);
  assert.match(opened.files.get("notes.toml"), /Exported note/);
  h.ctl.notesOpen = "empty title";
  await h.clickAct("export");
  assert.equal(h.status(), "Export failed: Fix the note first: empty title");
  assert.equal(h.statusError(), true);
  h.ctl.notesOpen = null;
  h.ctl.serverOpen = "bad ip";
  await h.clickAct("export");
  assert.equal(h.status(), "Export failed: Fix the server first: bad ip");
  assert.equal(h.downloads.length, 1);
});

test("Export works without a local server", async () => {
  const h = await boot({ server: false });
  await h.click("new");
  h.$("nwname").value = "offline-one";
  h.$("nwname").fire("input");
  await h.click("nwok");
  await h.clickAct("export");
  assert.match(h.downloads[0].name, /^offline-one-/);
  assert.match(h.status(), /^Exported offline-one-.*\.diag\.zip \(\d+ files\) to your downloads$/);
});

test("a first Save of a new diagram creates every file, and the next Save writes only what changed", async () => {
  const h = await boot();
  await h.click("new");
  h.$("nwname").value = "created-here";
  h.$("nwname").fire("input");
  await h.click("nwok");
  await h.tick();
  await h.click("save");
  const files = h.files("created-here");
  assert.ok(files["created-here/topology.toml"]);
  assert.ok(files["created-here/diagram.layout.json"]);
  assert.match(h.status(), /^Saved created-here\/diagram\.layout\.json and \d+ file\(s\) in local\/created-here\/$/);
  h.ctl.editDirty = true;
  await h.click("save");
  assert.equal(h.status(), "Saved created-here/diagram.layout.json in local/");
});

test("saving a new diagram over a name that was taken meanwhile reports the conflict", async () => {
  const h = await boot();
  await h.click("new");
  await h.click("nwok");
  h.put("new-diagram/topology.toml", 'id = "new-diagram"\n');
  await h.tick();
  await h.click("save");
  assert.match(h.status(), /^Save failed: .*changed on disk since it was loaded/);
});
