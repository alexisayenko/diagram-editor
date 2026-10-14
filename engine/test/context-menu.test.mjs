import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { mergeFolder, tomlModel } from "../parse/toml.mjs";
import { addServer, duplicateServer } from "../parse/toml-write.mjs";
import { demo, mini, withFile } from "./helpers.mjs";

test("addServer creates a uniquely named servers/<id>.toml in the region or with a fallback type", () => {
  const files = demo(), first = addServer(files, { region: "web" });
  assert.equal(first.path, `servers/${first.id}.toml`);
  const added = mergeFolder(withFile(files, first.path, first.text)).servers.find((s) => s.id === first.id);
  assert.equal(added.region, "web");
  const next = withFile(files, first.path, first.text), second = addServer(next, {});
  assert.notEqual(second.id, first.id);
  assert.equal(mergeFolder(withFile(next, second.path, second.text)).servers.find((s) => s.id === second.id).server_type, "web");
  tomlModel(withFile(next, second.path, second.text));
});

const regionAt = new Function("return " + readFileSync(new URL("../runtime/canvas/model.js", import.meta.url), "utf8").match(/function regionAt[\s\S]*?\n  }\n/)[0])();

function harness({ on = true, add = () => null, duplicate, regions, nets, rename } = {}) {
  const make = () => {
    const e = { children: [], attrs: {}, listeners: {}, style: {}, offsetWidth: 100, offsetHeight: 30, removed: false, focus() {}, setAttribute(k, v) { e.attrs[k] = v; },
      addEventListener(t, f) { (e.listeners[t] ||= []).push(f); }, appendChild(c) { e.children.push(c); return c; }, remove() { e.removed = true; }, contains: (t) => t === e || e.children.includes(t) };
    return e;
  };
  const svg = make(), tm = make(), doc = make(), win = make(), calls = [], prevented = [];
  doc.createElement = make; doc.body = make();
  win.innerWidth = 800; win.innerHeight = 600;
  win.addEventListener = (t, f) => { (win.listeners[t] ||= []).push(f); };
  const host = { serverEditor: { add: (...a) => { calls.push(a); return add(...a); }, ...(duplicate ? { duplicate: (id) => { calls.push(["dup", id]); return duplicate(id); } } : {}),
    ...(rename ? { renameNetwork: rename } : {}),
    ...(regions ? { regionTypes: () => regions, addRegion: (...a) => { calls.push(["region", ...a]); return null; } } : {}) } };
  const state = { on, st: { clusters: { big: { x: 0, y: 0, w: 500, h: 500 }, small: { x: 100, y: 100, w: 100, h: 100 } } } };
  let mod;
  const src = readFileSync(new URL("../runtime/canvas/context-menu.js", import.meta.url), "utf8");
  runInNewContext(src, { window: win, document: doc, InfraDiagram: { define: (n, d, f) => { mod = f({ svg, $: () => tm, D: { nets }, host }, { state, point: (e) => ({ x: e.clientX, y: e.clientY }), regionAt }, { editName: (i) => calls.push(["edit-name", i]) }); } } });
  const fire = (target, t, ev = {}) => (target.listeners[t] || []).forEach((f) => f({ target: svg, preventDefault() { prevented.push(t); }, stopPropagation() {}, ...ev }));
  return { svg, tm, doc, win, calls, prevented, state, mod, fire, menu: () => doc.body.children.find((c) => !c.removed) };
}

test("context menu: opens only in edit mode with a file-backed editor; item adds in the smallest region", () => {
  const off = harness({ on: false });
  off.fire(off.doc, "contextmenu", { clientX: 5, clientY: 5 });
  assert.deepEqual(off.prevented, []);
  assert.equal(off.menu(), undefined);
  const h = harness();
  h.fire(h.doc, "contextmenu", { clientX: 150, clientY: 150 });
  assert.deepEqual(h.prevented, ["contextmenu"]);
  const item = h.menu().children[0];
  assert.equal(item.textContent, "Add Server");
  item.listeners.click[0]();
  assert.deepEqual(h.calls[0], ["small", 150, 150]);
  assert.equal(h.menu(), undefined);
  h.fire(h.doc, "contextmenu", { clientX: 450, clientY: 450 });
  h.menu().children[0].listeners.click[0]();
  assert.deepEqual(h.calls[1], ["big", 450, 450]);
  h.fire(h.doc, "contextmenu", { clientX: 900, clientY: 900 });
  h.menu().children[0].listeners.click[0]();
  assert.deepEqual(h.calls[2], [null, 900, 900]);
});

test("context menu: error shown in the toolbar; closes on Escape, outside click, scroll, wheel, blur", () => {
  const h = harness({ add: () => "Fix the open edit first: bad" });
  h.fire(h.doc, "contextmenu", { clientX: 1, clientY: 1 });
  h.menu().children[0].listeners.click[0]();
  assert.equal(h.tm.textContent, "Fix the open edit first: bad");
  const open = () => h.fire(h.doc, "contextmenu", { clientX: 1, clientY: 1 });
  open(); h.fire(h.doc, "keydown", { key: "Escape" }); assert.equal(h.menu(), undefined);
  open(); h.fire(h.doc, "pointerdown", { target: {} }); assert.equal(h.menu(), undefined);
  open(); h.fire(h.doc, "pointerdown", { target: h.menu() }); assert.ok(h.menu());
  for (const [t, who] of [["scroll", h.win], ["wheel", h.win], ["blur", h.win]]) { open(); h.fire(who, t); assert.equal(h.menu(), undefined, t); }
});

const target = (extra = {}) => ({ tagName: "DIV", closest: () => null, ...extra });

test("context menu: also opens from panels and the toolbar, but not over text fields", () => {
  const h = harness();
  h.fire(h.doc, "contextmenu", { target: target(), clientX: 5, clientY: 5 });
  assert.deepEqual(h.prevented, ["contextmenu"]);
  assert.equal(h.menu().children[0].textContent, "Add Server");
  for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) h.fire(h.doc, "contextmenu", { target: target({ tagName }) });
  h.fire(h.doc, "contextmenu", { target: target({ isContentEditable: true }) });
  assert.deepEqual(h.prevented, ["contextmenu"]);
});

test("context menu: right-click on a server offers Duplicate server for that server", () => {
  const h = harness({ duplicate: () => "Fix the open edit first: bad" });
  const onServer = target({ closest: () => ({ getAttribute: () => "n:web01" }) });
  h.fire(h.doc, "contextmenu", { target: onServer, clientX: 150, clientY: 150 });
  const items = h.menu().children;
  assert.deepEqual(items.map((i) => i.textContent), ["Duplicate server"]);
  items[0].listeners.click[0]();
  assert.deepEqual(h.calls, [["dup", "web01"]]);
  assert.equal(h.tm.textContent, "Fix the open edit first: bad");
  const onRegion = target({ closest: () => ({ getAttribute: () => "c:web" }) });
  h.fire(h.doc, "contextmenu", { target: onRegion, clientX: 150, clientY: 150 });
  assert.equal(h.menu().children[0].textContent, "Add Server");
});

test("duplicateServer copies every key with a new unique id and name, same region", () => {
  const files = demo(), src = mergeFolder(files).servers.find((s) => s.ips?.length && s.region);
  const copy = duplicateServer(files, src.id);
  assert.equal(copy.path, `servers/${copy.id}.toml`);
  assert.equal(copy.id, src.id + "-copy");
  const next = withFile(files, copy.path, copy.text);
  const made = mergeFolder(next).servers.find((s) => s.id === copy.id);
  assert.equal(made.name, (src.name ?? src.id) + "-copy");
  assert.deepEqual({ ...made, id: 0, name: 0 }, { ...src, id: 0, name: 0 });
  assert.equal(duplicateServer(next, src.id).id, src.id + "-copy-2");
  assert.equal(duplicateServer(next, copy.id).id, copy.id + "-copy");
  tomlModel(next);
});

test("duplicateServer keeps comments and adds a missing name; unknown id fails", () => {
  const files = mini("title = \"t\"\n", {}, "# note\nid = \"a\"\nserver_type = \"web\" # kind\nips = [\"192.0.2.1/24\"]\n");
  const copy = duplicateServer(files, "a");
  assert.equal(copy.text, "# note\nid = \"a-copy\"\nserver_type = \"web\" # kind\nips = [\"192.0.2.1/24\"]\nname = \"a-copy\"\n");
  assert.throws(() => duplicateServer(files, "nope"), /no file/);
});

test("context menu: Add Region on empty canvas lists the free types and adds at the click", () => {
  const h = harness({ regions: [{ id: "batch", label: "Batch Server" }, { id: "mongo", label: "Mongo Database Server" }] });
  h.fire(h.doc, "contextmenu", { clientX: 900, clientY: 700 });
  assert.deepEqual(h.menu().children.map((c) => c.textContent), ["Add Server", "Add Region"]);
  h.menu().children[1].listeners.click[0]();
  assert.deepEqual(h.menu().children.map((c) => c.textContent), ["Batch Server", "Mongo Database Server"]);
  assert.deepEqual(h.calls, []);
  h.menu().children[1].listeners.click[0]();
  assert.deepEqual(h.calls, [["region", "mongo", 900, 700]]);
  assert.equal(h.menu(), undefined);
});

test("context menu: Add Region is disabled with a message when every type has a region, and absent over regions and servers", () => {
  const none = harness({ regions: [] });
  none.fire(none.doc, "contextmenu", { clientX: 900, clientY: 900 });
  const item = none.menu().children[1];
  assert.equal(item.disabled, true);
  assert.match(item.textContent, /every server type has one/);
  const some = harness({ regions: [{ id: "batch", label: "Batch Server" }], duplicate: () => null });
  some.fire(some.doc, "contextmenu", { clientX: 150, clientY: 150 });
  assert.deepEqual(some.menu().children.map((c) => c.textContent), ["Add Server"]);
  const server = { tagName: "g", closest: () => ({ getAttribute: () => "n:app01" }) };
  some.fire(some.doc, "contextmenu", { target: server, clientX: 900, clientY: 900 });
  assert.deepEqual(some.menu().children.map((c) => c.textContent), ["Duplicate server"]);
  const plain = harness();
  plain.fire(plain.doc, "contextmenu", { clientX: 900, clientY: 900 });
  assert.deepEqual(plain.menu().children.map((c) => c.textContent), ["Add Server"]);
});

const netTarget = (i) => target({ closest: (sel) => (sel === "#wl .nw" ? { getAttribute: () => String(i) } : null) });
const nets = [{ cidr: "192.0.2.0/24", name: "" }, { cidr: "198.51.100.0/24", name: "Net B" }, { cidr: "", name: "Unassigned network" }];

test("context menu: a network entry offers Add name or Edit name and starts the inline editor", () => {
  const h = harness({ nets, rename: () => null });
  h.fire(h.doc, "contextmenu", { target: netTarget(0), clientX: 5, clientY: 5 });
  assert.deepEqual(h.prevented, ["contextmenu"]);
  assert.deepEqual(h.menu().children.map((c) => c.textContent), ["Add name"]);
  h.menu().children[0].listeners.click[0]();
  assert.deepEqual(h.calls, [["edit-name", 0]]);
  h.fire(h.doc, "contextmenu", { target: netTarget(1), clientX: 5, clientY: 5 });
  assert.deepEqual(h.menu().children.map((c) => c.textContent), ["Edit name"]);
  h.fire(h.doc, "contextmenu", { target: netTarget(2), clientX: 5, clientY: 5 });
  assert.deepEqual(h.menu().children.map((c) => c.textContent), ["Add Server"]);
});

test("context menu: network entries get no menu outside edit mode or without the bridge's renameNetwork", () => {
  const off = harness({ on: false, nets, rename: () => null });
  off.fire(off.doc, "contextmenu", { target: netTarget(0) });
  assert.deepEqual(off.prevented, []);
  const bare = harness({ nets });
  bare.fire(bare.doc, "contextmenu", { target: netTarget(0) });
  assert.equal(bare.menu().children[0].textContent, "Add Server");
});
