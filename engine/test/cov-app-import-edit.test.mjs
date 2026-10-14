import test from "node:test";
import assert from "node:assert/strict";
import { boot, demoFiles, file, binFile, flush } from "./cov-app.mjs";
import { packDiagram } from "../lib/diagrams.mjs";
import { MAX_ARCHIVE_BYTES } from "../lib/zip.mjs";
import { demo } from "./helpers.mjs";

const zipOf = async (files = demo(), layoutText = null) => packDiagram(files, layoutText);
const fieldsOf = (src) => ({ name: src.name, server_type: src.server_type, os: src.os ?? "", hardware: src.hardware ?? "", cpu: src.cpu ?? "", ram: src.ram ?? "", swap: src.swap ?? "", disk: src.disk ?? "", role: src.role ?? "",
  ips: src.ips ?? [], dns: src.dns ?? [], jobs: src.jobs ?? [], rmi_services: src.rmi_services ?? [], systemd_services: src.systemd_services ?? [], details: src.details ?? "" });
const chooseArchive = async (h, f) => { h.$("diagfile").files = [f]; await h.act(async () => { h.$("diagfile").fire("change"); }); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("Import diagram opens the file chooser, and choosing nothing does nothing", async () => {
  const h = await boot();
  let opened = 0;
  h.$("diagfile").addEventListener("click", () => { opened++; });
  await h.click("importdiag");
  assert.equal(opened, 1);
  h.$("diagfile").files = [];
  h.$("diagfile").fire("change");
  await flush();
  assert.equal(h.status(), "");
});

test("an imported archive opens as an unsaved diagram with its layout carried along", async () => {
  const h = await boot();
  const layout = JSON.stringify({ version: 1, diagramId: "demo", nodes: {}, clusters: {}, edges: {} });
  await chooseArchive(h, binFile("my-site.diag.zip", await zipOf(demo(), layout)));
  assert.equal(h.status(), "demo · Imported from my-site.diag.zip, not saved yet");
  assert.equal(h.statusError(), false);
  assert.equal(h.$("diagfile").value, "");
  assert.equal(h.D.id, "demo");
  await h.tick();
  assert.equal(h.$("save").disabled, false);
});

test("without a local server the import says Export downloads it", async () => {
  const h = await boot({ server: false });
  await chooseArchive(h, binFile("x.DIAG.ZIP", await zipOf()));
  assert.match(h.status(), /, not saved yet · No local server: Export downloads it$/);
});

test("archives that are the wrong kind, too large, corrupt or not a diagram are refused with a reason", async () => {
  const h = await boot();
  await chooseArchive(h, binFile("notes.zip", new Uint8Array([1, 2, 3])));
  assert.equal(h.status(), "Only .diag.zip files can be opened.");
  assert.equal(h.statusError(), true);
  await chooseArchive(h, { name: "big.diag.zip", size: MAX_ARCHIVE_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) });
  assert.equal(h.status(), "The archive is larger than 20 MB.");
  await chooseArchive(h, binFile("bad.diag.zip", new Uint8Array([1, 2, 3, 4])));
  assert.equal(h.statusError(), true);
  assert.notEqual(h.status(), "");
  const empty = await zipOf(new Map([["notes.toml", "x = 1\n"]]));
  await chooseArchive(h, binFile("empty.diag.zip", empty));
  assert.equal(h.status(), "The archive has no topology.toml, so it is not a diagram.");
  assert.equal(h.$("new").disabled, false);
  assert.equal(h.frame.hidden, true);
});

test("importing over unsaved work asks first, and a refusal leaves the open diagram alone", async () => {
  const h = await boot({ files: demoFiles("demo") });
  h.ctl.editDirty = true;
  h.confirmAnswer = false;
  const loads = h.ctl.loads;
  h.$("diagfile").files = [binFile("a.diag.zip", await zipOf())];
  h.$("diagfile").fire("change");
  await sleep(40);
  assert.deepEqual(h.confirms, ["Discard unsaved changes?"]);
  assert.equal(h.ctl.loads, loads);
});

test("dropping a file on the page imports it; dragging non-files and dropping nothing are ignored", async () => {
  const h = await boot();
  const over = (types) => { const e = { dataTransfer: types && { types }, preventDefault() { this.prevented = true; } }; h.listeners.dragover.forEach((f) => f(e)); return e.prevented; };
  assert.equal(over(["Files"]), true);
  assert.equal(over(["text/plain"]), undefined);
  assert.equal(over(null), undefined);
  const drop = async (dt) => { const e = { dataTransfer: dt, preventDefault() { this.prevented = true; } }; await h.act(async () => h.listeners.drop.forEach((f) => f(e))); return e; };
  const none = { dataTransfer: { files: [] }, preventDefault() { this.prevented = true; } };
  h.listeners.drop.forEach((f) => f(none));
  assert.equal(none.prevented, undefined);
  h.listeners.drop.forEach((f) => f({ dataTransfer: undefined, preventDefault() { throw new Error("must not run"); } }));
  const e = await drop({ files: [binFile("dropped.diag.zip", await zipOf())] });
  assert.equal(e.prevented, true);
  assert.match(h.status(), /^demo · Imported from dropped\.diag\.zip/);
  const bad = await drop({ files: [binFile("dropped.txt", new Uint8Array(1))] });
  assert.equal(bad.prevented, true);
  assert.equal(h.status(), "Only .diag.zip files can be opened.");
});

test("a drop while a save is running is ignored", async () => {
  const h = await boot({ files: demoFiles("demo") });
  let release;
  h.override = (path, options) => (options.method === "PUT" ? new Promise((r) => { release = () => r(null); }) : null);
  h.ctl.editDirty = true;
  h.$("save").fire("click");
  await flush();
  assert.equal(h.$("new").disabled, true);
  assert.equal(h.frame.inert, true);
  const before = h.status();
  h.listeners.drop.forEach((f) => f({ dataTransfer: { files: [binFile("late.diag.zip", new Uint8Array(1))] }, preventDefault() {} }));
  await flush();
  assert.equal(h.status(), before);
  await h.tick();
  assert.equal(h.$("new").disabled, true);
  release();
  await flush();
  assert.equal(h.$("new").disabled, false);
  assert.equal(h.frame.inert, false);
});

test("saving an imported diagram over an existing one asks for confirmation; declining writes nothing", async () => {
  const h = await boot({ files: demoFiles("demo") });
  await chooseArchive(h, binFile("demo.diag.zip", await zipOf()));
  const before = h.read("demo/topology.toml");
  h.confirmAnswer = false;
  await h.tick();
  await h.click("save");
  assert.deepEqual(h.confirms, ["Replace the saved diagram demo?"]);
  assert.equal(h.requests.filter((r) => r[0] === "PUT").length, 0);
  assert.equal(h.read("demo/topology.toml"), before);
  assert.equal(h.$("new").disabled, false);
  h.confirmAnswer = true;
  await h.click("save");
  const put = JSON.parse(h.requests.filter((r) => r[0] === "PUT")[0][2]);
  assert.ok(put.files.length > 2);
  assert.ok(put.files.every((f) => f.overwrite === true && !("base" in f)));
  assert.ok(h.status().startsWith("Saved demo/diagram.layout.json and "));
  await h.tick();
  await h.click("save");
  assert.equal(h.confirms.length, 2);
});

test("saving an imported diagram under a new name needs no confirmation and creates the files", async () => {
  const h = await boot();
  const files = new Map(demo());
  files.set("topology.toml", files.get("topology.toml").replace(/^id = ".*"/m, 'id = "imported-copy"'));
  await chooseArchive(h, binFile("anything.diag.zip", await zipOf(files)));
  assert.match(h.status(), /^imported-copy · Imported from/);
  await h.tick();
  await h.click("save");
  assert.deepEqual(h.confirms, []);
  assert.ok(h.read("imported-copy/topology.toml"));
  assert.ok(h.read("imported-copy/networks.toml"));
});

test("the Host script dialog shows the probe script, copies it, and closes three ways", async () => {
  const h = await boot();
  await h.click("hostscript");
  assert.equal(h.$("hs").hidden, false);
  assert.equal(h.$("hstext").textContent, "#!/bin/sh\necho probe\n");
  assert.equal(h.$("hsd").open, false);
  assert.equal(h.cps[0].focused, 1);
  await h.click("hsclose");
  assert.equal(h.$("hs").hidden, true);
  assert.equal(h.$("hostscript").focused, 1);
  await h.click("hostscript");
  h.$("hs").fire("mousedown", { target: {} });
  assert.equal(h.$("hs").hidden, false);
  h.$("hs").fire("mousedown", { target: h.$("hs") });
  assert.equal(h.$("hs").hidden, true);
  await h.click("hostscript");
  h.docListeners.keydown.forEach((f) => f({ key: "Escape", preventDefault() {} }));
  assert.equal(h.$("hs").hidden, true);
});

test("Copy uses the clipboard, shows Copied and restores the label after a moment", async () => {
  const h = await boot();
  await h.click("hostscript");
  h.cps[0].fire("click");
  await flush();
  assert.deepEqual(h.copied, ["#!/bin/sh\necho probe\n"]);
  assert.equal(h.cps[0].textContent, "Copied");
  assert.equal(h.$("hsnote").textContent, "");
  h.cps[0].fire("click");
  await flush();
  h.timers.at(-1)[0]();
  assert.equal(h.cps[0].textContent, "Copy");
  assert.equal(h.timers.at(-1)[1], 1500);
});

test("when the clipboard is unavailable the copy falls back to a hidden text area, and reports failure honestly", async () => {
  const h = await boot();
  h.clipDenied = true;
  h.cps[1].fire("click");
  await flush();
  assert.equal(h.cps[1].textContent, "Copied");
  assert.equal(h.execCalls, 1);
  assert.equal(h.doc.body.children.length, 0);
  h.execOk = false;
  h.cps[1].fire("click");
  await flush();
  assert.equal(h.cps[1].textContent, "Copy failed");
  assert.equal(h.$("hsnote").textContent, "Copy failed: select the text and copy it manually");
  h.timers.at(-1)[0]();
  assert.equal(h.cps[1].textContent, "Copy");
  assert.equal(h.$("hsnote").textContent, "");
  h.execThrows = true;
  h.cps[1].fire("click");
  await flush();
  assert.equal(h.cps[1].textContent, "Copy failed");
});

const serverToml = (id, extra = "") => `id = "${id}"\nname = "${id}.example.test"\nserver_type = "web"\nips = ["198.51.100.${id.length + 20}/24"]\n${extra}`;
const openImport = async (h, files) => { h.$("impfiles").files = files; h.$("import").fire("click"); h.$("impfiles").fire("change"); await flush(); };

test("Import servers opens the chooser only when a diagram is ready", async () => {
  const idle = await boot();
  let clicked = 0;
  idle.$("impfiles").addEventListener("click", () => { clicked++; });
  idle.$("import").fire("click");
  assert.equal(clicked, 0);
  const h = await boot({ files: demoFiles("demo") });
  h.$("impfiles").addEventListener("click", () => { clicked++; });
  await h.click("import");
  assert.equal(clicked, 1);
});

test("the import dialog lists server types and regions, plans each file and shows how many will be added", async () => {
  const h = await boot({ files: demoFiles("demo") });
  await openImport(h, [file("alpha.toml", serverToml("alpha")), file("beta.toml", serverToml("beta"))]);
  assert.equal(h.$("imp").hidden, false);
  assert.ok(h.$("imptype").options.length > 3);
  assert.ok(h.$("imptype").options.some((o) => o.value === "oracle" && o.text === "Oracle Database Server (oracle)"));
  assert.equal(h.$("imptype").value, "web");
  assert.deepEqual(h.$("impregion").options.map((o) => o.value).slice(0, 3), ["", "web", "app"]);
  assert.equal(h.$("impregion").options[0].text, "None (use the server type)");
  assert.equal(h.$("implist").children.length, 2);
  assert.equal(h.$("impinfo").textContent, "2 servers will be added");
  assert.equal(h.$("impok").disabled, false);
  assert.equal(h.$("imptype").disabled, false);
  assert.equal(h.$("impfiles").value, "");
  const row = h.$("implist").children[0].children[0];
  assert.equal(row.children[1].textContent, "alpha · alpha.example.test · 1 IP");
  await h.tick();
  assert.equal(h.$("import").disabled, true);
});

test("unticking a file removes it from the plan; with none left nothing can be confirmed", async () => {
  const h = await boot({ files: demoFiles("demo") });
  await openImport(h, [file("alpha.toml", serverToml("alpha")), file("beta.toml", serverToml("beta"))]);
  const box = (i) => h.$("implist").children[i].children[0].children[0];
  box(0).checked = false;
  box(0).fire("change");
  assert.equal(h.$("impinfo").textContent, "1 server will be added");
  assert.equal(box(0).checked, false);
  box(1).checked = false;
  box(1).fire("change");
  assert.equal(h.$("impinfo").textContent, "Nothing selected");
  assert.equal(h.$("impok").disabled, true);
  await h.click("impok");
  assert.equal(h.$("imp").hidden, false);
  assert.equal(h.ctl.loads, 1);
});

test("unreadable files are listed as errors and cannot be ticked; clashing ids are shown as renamed", async () => {
  const h = await boot({ files: demoFiles("demo") });
  await openImport(h, [file("broken.toml", "id = \n"), file("web01.toml", 'id = "web01"\nname = "Fresh name"\nserver_type = "web"\n'), file("plain.toml", 'server_type = "web"\n')]);
  const rows = h.$("implist").children.map((li) => li.children[0]);
  assert.match(rows[0].children[1].textContent, /^broken\.toml: /);
  assert.equal(rows[0].children[1].className, "bad");
  assert.equal(rows[0].children[0].disabled, true);
  assert.equal(rows[0].children[0].checked, false);
  assert.equal(rows[1].children[2].className, "tag");
  assert.equal(rows[1].children[2].textContent, "renamed to web01-2");
  assert.equal(rows[2].children[1].textContent, "plain · plain · 0 IPs");
  assert.equal(h.$("impinfo").textContent, "2 servers will be added");
  const dup = await boot({ files: demoFiles("demo") });
  await openImport(dup, [file("a.toml", 'id = "web01"\nserver_type = "web"\n')]);
  assert.match(dup.$("implist").children[0].children[0].children[2].textContent, /^renamed to web01-2 \(web01-2\)$/);
});

test("choosing a region disables the type choice, and changing either re-plans", async () => {
  const h = await boot({ files: demoFiles("demo") });
  await openImport(h, [file("alpha.toml", 'id = "alpha"\nserver_type = "oracle"\n')]);
  h.$("impregion").value = "web";
  h.$("impregion").fire("change");
  assert.equal(h.$("imptype").disabled, true);
  h.$("impregion").value = "";
  h.$("imptype").value = "oracle";
  h.$("imptype").fire("change");
  assert.equal(h.$("imptype").disabled, false);
  assert.equal(h.$("impinfo").textContent, "1 server will be added");
});

test("the type choice defaults to the generic server type when the diagram has one, else to the first type", async () => {
  const h = await boot();
  await h.click("new");
  await h.click("nwok");
  await openImport(h, [file("n.toml", 'id = "n"\n')]);
  assert.equal(h.$("imptype").value, "server");
});

test("confirming an import adds the servers on a free grid, reloads the diagram and reports a summary", async () => {
  const h = await boot({ files: demoFiles("demo") });
  await openImport(h, [file("alpha.toml", serverToml("alpha")), file("beta.toml", serverToml("beta")), file("broken.toml", "id = \n")]);
  await h.click("impok");
  assert.equal(h.$("imp").hidden, true);
  assert.equal(h.status(), "2 imported, 0 renamed, 1 skipped (parse errors)");
  assert.ok(h.D.layout.nodes.alpha && h.D.layout.nodes.beta);
  assert.notDeepEqual([h.D.layout.nodes.alpha.x, h.D.layout.nodes.alpha.y], [h.D.layout.nodes.beta.x, h.D.layout.nodes.beta.y]);
  await h.tick();
  assert.equal(h.$("save").disabled, false);
  await h.click("save");
  assert.ok(h.read("demo/servers/alpha.toml"));
  assert.ok(h.read("demo/servers/beta.toml"));
});

test("importing into a region places the servers inside it, and without a server notes that Export downloads them", async () => {
  const h = await boot({ files: demoFiles("demo"), server: true });
  await openImport(h, [file("alpha.toml", serverToml("alpha"))]);
  h.$("impregion").value = "cache";
  h.$("impregion").fire("change");
  await h.click("impok");
  const c = h.D.layout.clusters.cache, n = h.D.layout.nodes.alpha;
  assert.ok(n.x >= c.x && n.x < c.x + c.w, "inside the region horizontally");
  assert.equal(n.y >= c.y, true);
  const off = await boot({ server: false });
  await off.click("new");
  await off.click("nwok");
  await openImport(off, [file("alpha.toml", serverToml("alpha"))]);
  await off.click("impok");
  assert.equal(off.status(), "1 imported, 0 renamed, 0 skipped (parse errors) · No local server: Export downloads them");
});

test("an import waits for an unfinished server or note edit and shows why", async () => {
  const h = await boot({ files: demoFiles("demo") });
  await openImport(h, [file("alpha.toml", serverToml("alpha"))]);
  h.ctl.notesOpen = "title is empty";
  await h.click("impok");
  assert.equal(h.$("impinfo").textContent, "Fix the open edit first: title is empty");
  assert.equal(h.$("imp").hidden, false);
  h.ctl.notesOpen = null;
  h.ctl.serverOpen = "bad ip";
  await h.click("impok");
  assert.equal(h.$("impinfo").textContent, "Fix the open edit first: bad ip");
  h.ctl.serverOpen = null;
  await h.click("impok");
  assert.equal(h.$("imp").hidden, true);
});

test("a failure while applying an import keeps the dialog open with the message", async () => {
  const h = await boot({ files: demoFiles("demo") });
  await openImport(h, [file("alpha.toml", serverToml("alpha"))]);
  h.failRender();
  await h.click("impok");
  assert.equal(h.$("imp").hidden, false);
  assert.ok(h.$("impinfo").textContent.length > 0);
});

test("the import dialog closes with Cancel, Escape or a backdrop click and re-enables the toolbar button", async () => {
  const h = await boot({ files: demoFiles("demo") });
  await openImport(h, [file("alpha.toml", serverToml("alpha"))]);
  await h.click("impcancel");
  assert.equal(h.$("imp").hidden, true);
  assert.ok(h.$("import").focused >= 1);
  await h.tick();
  assert.equal(h.$("import").disabled, false);
  await openImport(h, [file("alpha.toml", serverToml("alpha"))]);
  h.docListeners.keydown.forEach((f) => f({ key: "Escape", preventDefault() {} }));
  assert.equal(h.$("imp").hidden, true);
  await openImport(h, [file("alpha.toml", serverToml("alpha"))]);
  h.$("imp").fire("mousedown", { target: {} });
  assert.equal(h.$("imp").hidden, false);
  h.$("imp").fire("mousedown", { target: h.$("imp") });
  assert.equal(h.$("imp").hidden, true);
});

test("an unreadable chosen file reports Import failed; choosing no files, or choosing before ready, does nothing", async () => {
  const h = await boot({ files: demoFiles("demo") });
  h.$("impfiles").files = [{ name: "x.toml", size: 1, arrayBuffer: async () => { throw new Error("read error"); } }];
  h.$("impfiles").fire("change");
  await flush();
  assert.equal(h.status(), "Import failed: read error");
  h.$("impfiles").files = [];
  h.$("impfiles").fire("change");
  await flush();
  assert.equal(h.$("imp").hidden, true);
  const idle = await boot();
  idle.$("impfiles").files = [file("a.toml", "id = \"a\"\n")];
  idle.$("impfiles").fire("change");
  await flush();
  assert.equal(idle.$("imp").hidden, true);
});

test("the server editor bridge reads a server with its type choices, and refuses unknown ones", async () => {
  const h = await boot({ files: demoFiles("demo") });
  const ed = h.serverEditor(), src = ed.source("db01");
  assert.equal(src.id, "db01");
  assert.equal(src.name, "db-01.example.test");
  assert.equal(src.server_type, "oracle");
  assert.ok(src.types.some((t) => t.id === "oracle" && typeof t.label === "string"));
  assert.equal(ed.source("ghost"), null);
  assert.equal(typeof ed.regionTypes, "function");
  assert.ok(ed.regionTypes().some((t) => t.id === "batch"));
  assert.equal(h.frame.contentWindow.InfraDiagram.noteParser("A title\nDate: 2026-01-02\n\nText").title, "A title");
});

test("editing a server rewrites its file, reloads the diagram and keeps the edit pending for Save", async () => {
  const h = await boot({ files: demoFiles("demo") });
  const ed = h.serverEditor(), fields = fieldsOf(ed.source("db01"));
  assert.equal(ed.apply("db01", fields), null);
  assert.equal(h.ctl.loads, 1);
  assert.equal(ed.apply("db01", { ...fields, role: "Primary" }), null);
  await flush();
  assert.equal(h.ctl.loads, 2);
  assert.deepEqual(h.ctl.selected, ["n:db01"]);
  await h.tick();
  assert.equal(h.$("save").disabled, false);
  await h.click("save");
  assert.match(h.read("demo/servers/db01.toml"), /role = "Primary"/);
  assert.equal(h.status(), "Saved demo/diagram.layout.json and 1 file(s) in local/demo/");
  await h.tick();
  assert.equal(h.$("save").disabled, true);
});

test("an invalid server edit returns the validation message without the TOML prefix, and nothing reloads", async () => {
  const h = await boot({ files: demoFiles("demo") });
  const ed = h.serverEditor(), fields = fieldsOf(ed.source("db01"));
  assert.equal(ed.apply("db01", { ...fields, name: "" }), "The name is empty.");
  assert.equal(ed.apply("ghost", fields), "Server 'ghost' has no file servers/ghost.toml.");
  assert.equal(ed.apply("db01", { ...fields, ips: ["not an ip"] }).startsWith("ips: "), true);
  h.ctl.notesOpen = "empty";
  assert.equal(ed.apply("db01", fields), "Fix the note first: empty");
  assert.equal(h.ctl.loads, 1);
});

test("adding a server places it where asked, selects it after the reload and returns to edit mode", async () => {
  const h = await boot({ files: demoFiles("demo") });
  h.ctl.modelOn = true;
  assert.equal(h.serverEditor().add("web", 400, 300), null);
  await flush();
  const id = Object.keys(h.D.layout.nodes).find((k) => !["app01", "app02", "batch01", "db01", "db02", "stats01", "web01"].includes(k));
  assert.ok(id);
  assert.equal(h.D.meta.nodes[id].cl, "web");
  assert.deepEqual(h.ctl.selected, ["n:" + id]);
  assert.equal(h.ctl.editClicked, 1);
  assert.equal(h.D.layout.nodes[id].x, 400);
  assert.equal(h.D.layout.nodes[id].y, 300);
});

test("adding outside any region creates a standalone server", async () => {
  const h = await boot({ files: demoFiles("demo") });
  assert.equal(h.serverEditor().add(null, 10, 10), null);
  await flush();
  const added = Object.keys(h.D.layout.nodes).find((k) => k.startsWith("server"));
  assert.ok(added);
  assert.equal(h.D.meta.nodes[added].cl, null);
});

test("add, duplicate, move, region and rename refuse while an edit is open", async () => {
  const h = await boot({ files: demoFiles("demo") });
  const ed = h.serverEditor();
  const calls = { add: () => ed.add("web", 1, 1), duplicate: () => ed.duplicate("db01"), move: () => ed.move("db01", "web"), addRegion: () => ed.addRegion("batch", 1, 1), renameNetwork: () => ed.renameNetwork("192.0.2.0/24", "x") };
  h.ctl.notesOpen = "n";
  for (const [k, f] of Object.entries(calls)) assert.equal(f(), "Fix the open edit first: n", k);
  h.ctl.notesOpen = null;
  h.ctl.serverOpen = "s";
  for (const [k, f] of Object.entries(calls)) assert.equal(f(), "Fix the open edit first: s", k);
  assert.equal(h.ctl.loads, 1);
});

test("a second edit before the diagram has reloaded is refused with a retry hint", async () => {
  const h = await boot({ files: demoFiles("demo") });
  const ed = h.serverEditor();
  assert.equal(ed.add("web", 1, 1), null);
  assert.equal(ed.add("web", 1, 1), "Try again once the diagram has reloaded.");
});

test("Save and Export do nothing while the diagram is reloading, and work again once it has", async () => {
  const h = await boot({ files: demoFiles("demo") });
  assert.equal(h.serverEditor().add("web", 5, 5), null);
  h.$("save").fire("click");
  h.$("export").fire("click");
  await h.until(() => h.ctl.loads === 2 && h.requests.length >= 0);
  assert.equal(h.requests.filter((r) => r[0] === "PUT").length, 0);
  assert.equal(h.downloads.length, 0);
  await h.tick();
  await h.click("save");
  assert.ok(Object.keys(h.files("demo")).some((k) => /servers\/server\d+\.toml$/.test(k)));
});

test("duplicating a server copies its file and offsets the copy by 30px from the original", async () => {
  const h = await boot({ files: demoFiles("demo") });
  const from = h.D.layout.nodes.web01;
  assert.equal(h.serverEditor().duplicate("web01"), null);
  await flush();
  const copy = Object.keys(h.D.layout.nodes).find((k) => k.startsWith("web01") && k !== "web01");
  assert.ok(copy);
  assert.equal(h.D.layout.nodes[copy].x, Math.round(from.x) + 30);
  assert.equal(h.D.layout.nodes[copy].y, Math.round(from.y) + 30);
  assert.deepEqual(h.ctl.selected, ["n:" + copy]);
  assert.equal(h.serverEditor().duplicate("ghost"), "Server 'ghost' has no file servers/ghost.toml.");
});

test("a duplicated server with no known position is left for the auto layout", async () => {
  const h = await boot({ files: demoFiles("demo") });
  h.ctl.layout = { nodes: {}, clusters: {}, edges: {} };
  assert.equal(h.serverEditor().duplicate("web01"), null);
  await flush();
  assert.ok(Object.keys(h.D.layout.nodes).some((k) => k !== "web01" && k.startsWith("web01")));
});

test("adding a region creates it at the clicked spot with a default size and selects it", async () => {
  const h = await boot({ files: demoFiles("demo") });
  const ed = h.serverEditor();
  assert.equal(ed.addRegion("batch", 900, 700), null);
  await flush();
  assert.deepEqual([h.D.layout.clusters.batch.x, h.D.layout.clusters.batch.y], [900, 700]);
  assert.ok(h.D.layout.clusters.batch.w >= 220 && h.D.layout.clusters.batch.h >= 120);
  assert.deepEqual(h.ctl.selected, ["c:batch"]);
  assert.match(ed.addRegion("web", 1, 1), /already has the region 'web'/);
  assert.equal(ed.regionTypes().some((t) => t.id === "batch"), false);
});

test("moving a server to another region rewrites its file; the same region changes nothing", async () => {
  const h = await boot({ files: demoFiles("demo") });
  const ed = h.serverEditor();
  assert.equal(ed.move("app02", "app"), null);
  await flush();
  assert.equal(h.ctl.loads, 1);
  assert.equal(ed.move("app02", "cache"), null);
  await flush();
  assert.equal(h.ctl.loads, 2);
  assert.equal(h.D.meta.nodes.app02.cl, "cache");
  assert.equal(ed.move("app02", null), null);
  await flush();
  assert.equal(h.D.meta.nodes.app02.cl, null);
  assert.equal(ed.move("app02", "nowhere"), "Unknown region 'nowhere'.");
  assert.equal(ed.move("ghost", null), "Server 'ghost' has no file servers/ghost.toml.");
});

test("renaming a network validates the name and the CIDR, and an unchanged name reloads nothing", async () => {
  const h = await boot({ files: demoFiles("demo") });
  const ed = h.serverEditor();
  assert.equal(ed.renameNetwork("192.0.2.0/24", "Demo LAN"), null);
  assert.equal(h.ctl.loads, 1);
  assert.equal(ed.renameNetwork("192.0.2.0/24", "two\nlines"), "The network name must be a single line.");
  assert.equal(ed.renameNetwork("192.0.2.0/24", "x".repeat(81)), "The network name is at most 80 characters.");
  assert.match(ed.renameNetwork("bogus", "x"), /./);
  assert.equal(ed.renameNetwork("198.51.100.0/24", "Brand new"), null);
  await flush();
  assert.equal(h.ctl.loads, 2);
});

test("edited notes travel with a server change, and a diagram without notes.toml stays without one when there are none", async () => {
  const h = await boot({ files: demoFiles("demo") });
  h.ctl.notesTexts = ["Reworded note\n\nBody."];
  assert.equal(h.serverEditor().add("web", 5, 5), null);
  await flush();
  assert.equal(h.D.notes.some((n) => n.title === "Reworded note"), true);
  const bare = await boot({ files: { "bare/topology.toml": 'id = "bare"\ntitle = "Bare"\n', "bare/servers/a.toml": 'id = "a"\nserver_type = "web"\n' } });
  bare.ctl.notesTexts = [];
  assert.equal(bare.serverEditor().add(null, 5, 5), null);
  await flush();
  await bare.click("save");
  assert.equal(bare.read("bare/notes.toml"), null);
});

test("a pending layout change stays pending across a server change so Save still offers it", async () => {
  const h = await boot({ files: demoFiles("demo") });
  h.ctl.editDirty = true;
  assert.equal(h.serverEditor().add("web", 5, 5), null);
  await flush();
  h.ctl.editDirty = false;
  await h.tick();
  assert.equal(h.$("save").disabled, false);
  await h.click("save");
  assert.ok(h.read("demo/diagram.layout.json"));
  await h.tick();
  assert.equal(h.$("save").disabled, true);
});

test("an unreadable dropped or chosen file reports the failure in the message area instead of rejecting", async () => {
  const h = await boot();
  const broken = { get name() { throw new Error("file vanished"); } };
  await h.act(async () => h.listeners.drop.forEach((f) => f({ dataTransfer: { files: [broken] }, preventDefault() {} })));
  assert.equal(h.status(), "file vanished");
});
