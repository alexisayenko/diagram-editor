// An edit of the open diagram swaps the scene inside the loaded frame; the page reloads only when the runtime cannot.
import test from "node:test";
import assert from "node:assert/strict";
import { boot, demoFiles, flush } from "./cov-app.mjs";

const fieldsOf = (src) => ({ name: src.name, server_type: src.server_type, os: src.os ?? "", hardware: src.hardware ?? "", cpu: src.cpu ?? "", ram: src.ram ?? "", swap: src.swap ?? "", disk: src.disk ?? "", role: src.role ?? "",
  ips: src.ips ?? [], dns: src.dns ?? [], jobs: src.jobs ?? [], rmi_services: src.rmi_services ?? [], systemd_services: src.systemd_services ?? [], details: src.details ?? "" });

test("a server edit swaps the scene: the frame is not reloaded, edit mode is not toggled, the edited server is selected", async () => {
  const h = await boot({ files: demoFiles("demo") });
  const ed = h.serverEditor(), fields = fieldsOf(ed.source("db01"));
  assert.equal(h.ctl.loads, 1);
  h.swapResult = { ok: true };
  h.ctl.modelOn = true;
  assert.equal(ed.apply("db01", { ...fields, role: "Primary" }), null);
  await flush();
  assert.equal(h.ctl.loads, 1);
  assert.equal(h.scenes.length, 1);
  assert.match(h.scenes[0].data, /Primary/);
  assert.equal(h.ctl.editClicked, 0);
  assert.deepEqual(h.ctl.selected, ["n:db01"]);
  await h.tick();
  assert.equal(h.$("save").disabled, false);
  await h.click("save");
  assert.match(h.read("demo/servers/db01.toml"), /role = "Primary"/);
});

test("the same edit reloads the frame, and returns to edit mode, when the runtime refuses the scene", async () => {
  const h = await boot({ files: demoFiles("demo") });
  const ed = h.serverEditor(), fields = fieldsOf(ed.source("db01"));
  h.swapResult = { ok: false, reason: "no" };
  h.ctl.modelOn = true;
  assert.equal(ed.apply("db01", { ...fields, role: "Primary" }), null);
  await flush();
  assert.equal(h.scenes.length, 1);
  assert.equal(h.ctl.loads, 2);
  assert.equal(h.ctl.editClicked, 1);
  assert.deepEqual(h.ctl.selected, ["n:db01"]);
});

test("opening a diagram always loads a document; only edits swap", async () => {
  const h = await boot({ files: demoFiles("demo") });
  h.swapResult = { ok: true };
  assert.equal(h.ctl.loads, 1);
  assert.equal(h.scenes.length, 0);
  const ed = h.serverEditor();
  assert.equal(ed.add("web", 400, 300), null);
  await flush();
  assert.equal(h.ctl.loads, 1);
  assert.equal(h.scenes.length, 1);
  assert.equal(ed.renameNetwork("192.0.2.0/24", "Renamed LAN"), null);
  await flush();
  assert.equal(h.ctl.loads, 1);
  assert.equal(h.scenes.length, 2);
  assert.match(h.scenes[1].nets, /Renamed LAN/);
});
