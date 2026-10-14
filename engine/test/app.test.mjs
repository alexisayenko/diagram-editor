import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { boot, demoFiles, file, flush } from "./cov-app.mjs";

const flushed = async (h) => { await h.tick(); return h; };

test("Save follows the dirty state: notes and layout enable it, clean or no server disables it", async () => {
  const h = await boot({ files: demoFiles("demo") });
  const saveOff = async () => { await h.tick(); return h.$("save").disabled; };
  assert.equal(await saveOff(), true);
  h.ctl.notesDirty = true;
  assert.equal(await saveOff(), false);
  h.ctl.notesDirty = false;
  h.ctl.editDirty = true;
  assert.equal(await saveOff(), false);
  h.ctl.editDirty = false;
  assert.equal(await saveOff(), true);
  const offline = await boot({ server: false });
  await offline.click("new");
  await offline.click("nwok");
  offline.ctl.notesDirty = true;
  assert.equal(await (async () => { await offline.tick(); return offline.$("save").disabled; })(), true);
});

test("Save is disabled while a save is running", async () => {
  const h = await boot({ files: demoFiles("demo") });
  let release;
  h.override = (path, options) => (options.method === "PUT" ? new Promise((resolve) => { release = resolve; }) : null);
  h.ctl.editDirty = true;
  await flushed(h);
  h.$("save").fire("click");
  await flush();
  assert.equal(h.$("save").disabled, true);
  assert.equal(h.frame.inert, true);
  release();
  await h.until(() => !h.frame.inert);
});

test("the discard prompt and the beforeunload guard both use the combined dirty state", async () => {
  const h = await boot({ files: demoFiles("demo"), confirmAnswer: false });
  const unload = () => { const e = { preventDefault() { this.prevented = true; } }; h.listeners.beforeunload.forEach((f) => f(e)); return !!e.prevented; };
  assert.equal(unload(), false);
  h.ctl.notesDirty = true;
  assert.equal(unload(), true);
  await h.click("new");
  h.$("nwname").value = "other";
  h.$("nwname").fire("input");
  await h.click("nwok");
  assert.deepEqual(h.confirms, ["Discard unsaved changes?"]);
  assert.equal(h.$("nw").open, true);
});

test("drawing changes enable Save and the discard guards", async () => {
  const h = await boot({ files: demoFiles("demo") });
  h.ctl.drawDirty = true;
  await h.tick();
  assert.equal(h.$("save").disabled, false);
  const e = { preventDefault() { this.prevented = true; } };
  h.listeners.beforeunload.forEach((f) => f(e));
  assert.equal(e.prevented, true);
});

test("Host script panel embeds tools/host-probe.sh byte-for-byte", () => {
  const html = readFileSync(new URL("../../diagram.html", import.meta.url), "utf8");
  const probe = readFileSync(new URL("../../tools/host-probe.sh", import.meta.url), "utf8");
  const m = html.match(/^const HOST_SCRIPT = (.*);$/m);
  assert.ok(m, "HOST_SCRIPT line");
  assert.equal(runInNewContext(m[1]), probe);
  assert.ok(!m[1].includes("<"));
  assert.match(html, /id="hostscript"/);
  assert.match(html, /<dialog id="hs" class="dlg" aria-labelledby="hst">/);
  assert.match(readFileSync(new URL("../browser/dialog-flows.mjs", import.meta.url), "utf8"), /execCommand\("copy"\)/);
});

test("Host script panel closes on Escape, Close and an outside click", async () => {
  const h = await boot();
  const escape = () => h.$("hs").pressEscape();
  await h.click("hostscript");
  escape();
  assert.equal(h.$("hs").open, false);
  await h.click("hostscript");
  h.$("hs").fire("mousedown", { target: h.$("hs") });
  assert.equal(h.$("hs").open, false);
  await h.click("hostscript");
  await h.click("hsclose");
  assert.equal(h.$("hs").open, false);
});

test("Import servers is enabled with an open diagram and adds files as unsaved work", async () => {
  const idle = await boot();
  assert.equal(idle.$("import").disabled, true);
  const h = await boot({ files: demoFiles("demo") });
  assert.equal(h.$("import").disabled, false);
  h.$("impfiles").files = [file("alpha.toml", 'id = "alpha"\nname = "alpha.example.test"\nserver_type = "web"\nips = ["198.51.100.25/24"]\n')];
  h.$("import").fire("click");
  h.$("impfiles").fire("change");
  await flush();
  assert.equal(h.$("import").disabled, true);
  await h.click("impok");
  await h.until(() => h.frame.srcdoc.includes("alpha"));
  assert.equal(h.$("import").disabled, false);
  assert.equal(h.$("save").disabled, false);
  assert.ok(h.files("demo")["demo/servers/alpha.toml"] === undefined, "nothing is written before Save");
});
