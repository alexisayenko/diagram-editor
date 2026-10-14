import test from "node:test";
import assert from "node:assert/strict";
import { makePage, loadModel, loadMenu, El } from "./cov-canvas.mjs";

function setup({ on = true, bridge, nets } = {}) {
  const page = makePage();
  const calls = [];
  page.g.InfraDiagram.serverEditor = bridge === null ? undefined : {
    add: (...a) => { calls.push(["add", ...a]); return null; },
    duplicate: (id) => { calls.push(["dup", id]); return null; },
    regionTypes: () => [{ id: "batch", label: "Batch Server" }, { id: "mongo", label: "Mongo" }],
    addRegion: (...a) => { calls.push(["region", ...a]); return null; },
    renameNetwork: () => null,
    ...bridge,
  };
  if (nets) page.D.nets = nets;
  const model = loadModel(page);
  model.state.on = on;
  const edited = [];
  const menu = loadMenu(page, model, { editName: (i) => edited.push(i) });
  const show = (target, x = 5, y = 5) => page.doc.fire("contextmenu", { target, clientX: x, clientY: y });
  const current = () => page.doc.body.children.find((c) => !c.removed);
  const onServer = (id) => ({ closest: (q) => (q === "[data-ent]" ? { getAttribute: () => "n:" + id } : null) });
  const onNet = (n) => ({ closest: (q) => (q === "#wl .nw" ? { getAttribute: () => String(n) } : null) });
  const empty = { closest: () => null };
  return { page, model, menu, calls, edited, show, current, onServer, onNet, empty };
}

const inRegion = (h, id) => { const c = h.model.state.st.clusters[id]; return [c.x + 5, c.y + 5]; };
const outside = (h) => { const cs = Object.values(h.model.state.st.clusters); return [Math.min(...cs.map((c) => c.x)) - 100, -500]; };

test("right-clicking a server offers Duplicate server and passes the id", () => {
  const h = setup();
  h.show(h.onServer("db01"));
  const items = h.current().children;
  assert.deepEqual(items.map((i) => i.textContent), ["Duplicate server"]);
  assert.equal(items[0].attrs.role, "menuitem");
  items[0].click();
  assert.deepEqual(h.calls, [["dup", "db01"]]);
  assert.equal(h.current(), undefined);
});

test("right-clicking inside a region offers Add Server there, with rounded coordinates, and no Add Region", () => {
  const h = setup();
  const [x, y] = inRegion(h, "web");
  h.show(h.empty, x + 0.4, y + 0.4);
  assert.deepEqual(h.current().children.map((i) => i.textContent), ["Add Server"]);
  h.current().children[0].click();
  assert.deepEqual(h.calls, [["add", "web", Math.round(x + 0.4), Math.round(y + 0.4)]]);
});

test("right-clicking outside every region offers Add Server (no region) and a type picker for Add Region", () => {
  const h = setup();
  const [x, y] = outside(h);
  h.show(h.empty, x, y);
  const items = h.current().children;
  assert.deepEqual(items.map((i) => i.textContent), ["Add Server", "Add Region"]);
  items[0].click();
  assert.deepEqual(h.calls[0], ["add", null, x, y]);
  h.show(h.empty, x, y);
  h.current().children[1].click();
  const picker = h.current();
  assert.deepEqual(picker.children.map((i) => i.textContent), ["Batch Server", "Mongo"]);
  picker.children[1].click();
  assert.deepEqual(h.calls[1], ["region", "mongo", x, y]);
  assert.equal(h.current(), undefined);
});

test("with every server type already used, Add Region is shown disabled", () => {
  const h = setup({ bridge: { regionTypes: () => [] } });
  const [x, y] = outside(h);
  h.show(h.empty, x, y);
  const item = h.current().children[1];
  assert.equal(item.textContent, "Add Region (every server type has one)");
  assert.equal(item.disabled, true);
});

test("without addRegion or regionTypes the menu has only Add Server; without Duplicate a server click adds instead", () => {
  const a = setup({ bridge: { addRegion: undefined } });
  const [x, y] = outside(a);
  a.show(a.empty, x, y);
  assert.deepEqual(a.current().children.map((i) => i.textContent), ["Add Server"]);
  const b = setup({ bridge: { duplicate: undefined } });
  b.show(b.onServer("db01"), 1, 1);
  assert.deepEqual(b.current().children.map((i) => i.textContent), ["Add Server"]);
});

test("an error returned by an action is shown in the status line", () => {
  const h = setup({ bridge: { add: () => "Fix the open edit first: x" } });
  h.show(h.empty);
  h.current().children[0].click();
  assert.equal(h.page.core.$("tm").textContent, "Fix the open edit first: x");
});

test("the menu opens only in edit mode and with a server editor that can add; form fields keep their own menu", () => {
  const off = setup({ on: false });
  assert.equal(off.show(off.empty).defaultPrevented, false);
  assert.equal(off.current(), undefined);
  const nobridge = setup({ bridge: null });
  assert.equal(nobridge.show(nobridge.empty).defaultPrevented, false);
  const noadd = setup({ bridge: { add: undefined } });
  assert.equal(noadd.show(noadd.empty).defaultPrevented, false);
  const h = setup();
  for (const t of [{ tagName: "INPUT" }, { tagName: "TEXTAREA" }, { tagName: "SELECT" }, { isContentEditable: true }]) {
    assert.equal(h.show(t).defaultPrevented, false);
  }
  assert.equal(h.current(), undefined);
  assert.equal(h.show(undefined).defaultPrevented, true);
});

test("opening a menu closes the previous one and puts focus on the first item", () => {
  const h = setup();
  h.show(h.empty);
  const first = h.current();
  h.show(h.empty);
  assert.ok(first.removed);
  assert.notEqual(h.current(), first);
  assert.equal(h.current().id, "cm");
  assert.equal(h.current().attrs.role, "menu");
  assert.equal(h.current().children[0].focused, 1);
});

test("the menu stays inside the window", () => {
  const h = setup();
  h.show(h.empty, 790, 595);
  assert.equal(h.current().style.left, "700px");
  assert.equal(h.current().style.top, "570px");
  h.show(h.empty, -20, -20);
  assert.equal(h.current().style.left, "0px");
  assert.equal(h.current().style.top, "0px");
});

test("clicking away, Escape, scrolling, wheel and blur close the menu; clicking inside does not", () => {
  const h = setup();
  const open = () => { h.show(h.empty); return h.current(); };
  const m = open();
  h.page.doc.fire("pointerdown", { target: m.children[0] });
  assert.equal(h.current(), m);
  h.page.doc.fire("pointerdown", { target: {} });
  assert.equal(h.current(), undefined);
  h.page.doc.fire("pointerdown", { target: {} });
  open();
  const esc = h.page.doc.fire("keydown", { key: "Escape" });
  assert.equal(h.current(), undefined);
  assert.equal(esc.defaultPrevented, false);
  h.page.doc.fire("keydown", { key: "Escape" });
  open();
  h.page.doc.fire("keydown", { key: "a" });
  assert.ok(h.current());
  for (const t of ["scroll", "wheel", "blur"]) {
    open();
    h.page.g.winListeners[t].forEach((f) => f({}));
    assert.equal(h.current(), undefined, t);
  }
  open();
  h.menu.close();
  assert.equal(h.current(), undefined);
  h.menu.close();
});

test("right-clicking a network pill with a CIDR offers Add name or Edit name and opens the name editor", () => {
  const h = setup({ nets: [{ cidr: "192.0.2.0/24" }, { cidr: "198.51.100.0/24", name: "Back" }, { name: "no cidr" }] });
  h.show(h.onNet(0));
  assert.deepEqual(h.current().children.map((i) => i.textContent), ["Add name"]);
  h.current().children[0].click();
  assert.deepEqual(h.edited, [0]);
  h.show(h.onNet(1));
  assert.deepEqual(h.current().children.map((i) => i.textContent), ["Edit name"]);
  h.show(h.onNet(2));
  assert.equal(h.current().children[0].textContent, "Add Server");
  h.show(h.onNet(9));
  assert.equal(h.current().children[0].textContent, "Add Server");
});

test("a network pill falls back to the normal menu when the editor cannot rename networks", () => {
  const h = setup({ nets: [{ cidr: "192.0.2.0/24" }], bridge: { renameNetwork: undefined } });
  h.show(h.onNet(0));
  assert.notEqual(h.current().children[0].textContent, "Add name");
});
