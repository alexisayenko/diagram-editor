// Scene swap in the real runtime modules on the mini DOM: a swapped page equals a freshly loaded one, and the user's state survives the swap.
import test from "node:test";
import assert from "node:assert/strict";
import { demo, mod, mini, without, withFile } from "./helpers.mjs";
import { bootPage, render, sceneView, sceneDiff, swap } from "./cov-page.mjs";
import { makeEvent } from "./cov-ui-env.mjs";
import { keys } from "./runtime-kits.mjs";

const WEB01 = keys.nodeKey("server", "web01"), DB01 = keys.nodeKey("server", "db01"), STATS01 = keys.nodeKey("server", "stats01");
const rename = (f) => mod(f, "servers/web01.toml", 'name = "web-01.example.test"', 'name = "web-01b.example.test"');
const dropStats = (f) => without(mod(f, "topology.toml", '[[connections]]\nfrom = "stats01"\nto = "app"\nlabel = "TCP · metrics"\n', ""), "servers/stats01.toml");
const edits = {
  "a server name": rename,
  "a note": (f) => mod(f, "notes.toml", "Cache tier proposed", "Cache tier planned"),
  "a related document": (f) => mod(f, "documents.toml", "Demo environment overview", "Demo overview"),
  "a network name": (f) => mod(f, "networks.toml", 'name = "Demo LAN"', 'name = "Demo LAN 2"'),
  "a region title": (f) => mod(f, "topology.toml", 'title = "Web Servers"', 'title = "Web Tier"'),
  "a new server": (f) => withFile(f, "servers/web02.toml", f.get("servers/web01.toml").replace('id = "web01"', 'id = "web02"').replace("web-01", "web-02")),
  "a removed server": dropStats,
};
const pointer = (p, type, props = {}) => p.svg.dispatchEvent(makeEvent(type, { target: p.svg, clientX: 0, clientY: 0, pointerId: 1, isPrimary: true, button: 0, pointerType: "mouse", stopImmediatePropagation() {}, ...props }));

for (const [name, edit] of Object.entries(edits)) {
  test(`after ${name} a swapped page equals a freshly loaded one, byte for byte`, () => {
    const first = render(demo()), next = edit(demo());
    const fresh = render(next, first.layout, ["web01"]), cached = render(next, first.layout, ["web01"], first.routeCache);
    const loaded = bootPage(fresh), swapped = bootPage(first);
    assert.deepEqual(loaded.errors, []);
    assert.equal(swap(swapped, cached).ok, true);
    assert.deepEqual(swapped.errors, []);
    assert.deepEqual(sceneDiff(sceneView(swapped), sceneView(loaded)), []);
  });
}

test("swapping back and forth keeps equal to a fresh load each time, and the page keeps its identity", () => {
  const a = render(demo()), b = render(rename(demo()), a.layout, ["web01"]);
  const p = bootPage(a), svg = p.svg, core = p.core, els = core.els, D = core.D;
  assert.equal(swap(p, b).ok, true);
  assert.deepEqual(sceneDiff(sceneView(p), sceneView(bootPage(b))), []);
  assert.equal(swap(p, a).ok, true);
  assert.deepEqual(sceneDiff(sceneView(p), sceneView(bootPage(a))), []);
  assert.equal(p.core.svg, svg);
  assert.equal(p.core.els, els);
  assert.equal(p.core.D, D);
  assert.equal(p.core.els.length, bootPage(a).core.els.length);
});

test("the render event fires and subscribers see the new scene; the scene event reports what changed", () => {
  const a = render(demo()), b = render(mod(demo(), "notes.toml", "Cache tier proposed", "Cache tier planned"), a.layout);
  const p = bootPage(a), seen = [];
  p.core.on("scene", (scene, changed) => seen.push(["scene", scene.shell, changed.notes, p.core.D.notes[1].title]));
  p.core.on("render", () => seen.push(["render"]));
  swap(p, b);
  assert.deepEqual(seen.map((s) => s[0]), ["scene", "render"]);
  assert.deepEqual(seen[0].slice(1), [a.scene.shell, true, "Cache tier planned"]);
  seen.length = 0;
  swap(p, b);
  assert.equal(seen[0][2], false);
});

test("zoom stays through a swap, in fit mode and after a free pan", () => {
  const a = render(demo()), b = render(rename(demo()), a.layout, ["web01"]);
  const p = bootPage(a);
  p.click(p.$("zi"));
  p.click(p.$("zi"));
  const zoomed = p.svg.getAttribute("viewBox");
  assert.match(p.svg.getAttribute("class"), /zoomed/);
  swap(p, b);
  assert.equal(p.svg.getAttribute("viewBox"), zoomed);
  assert.match(p.svg.getAttribute("class"), /zoomed/);
  pointer(p, "pointerdown", { clientX: 300, clientY: 300 });
  pointer(p, "pointermove", { clientX: 250, clientY: 280 });
  pointer(p, "pointerup", { clientX: 250, clientY: 280 });
  const panned = p.svg.getAttribute("viewBox");
  assert.notEqual(panned, zoomed);
  swap(p, a);
  assert.equal(p.svg.getAttribute("viewBox"), panned);
});

test("the sketch style takes the new view box from the scene instead of measuring", () => {
  const a = render(demo()), b = render(rename(demo()), a.layout, ["web01"]);
  const p = bootPage(a);
  p.I.setStyle("sketch");
  swap(p, b);
  assert.equal(p.svg.getAttribute("viewBox"), b.scene.viewBox);
  assert.equal(p.I.ctx.style, "sketch");
});

test("the selection stays on a server that still exists and its panel shows the new data", () => {
  const a = render(demo()), b = render(rename(demo()), a.layout, ["web01"]);
  const p = bootPage(a);
  p.I.select(WEB01);
  assert.match(p.$("pn").textContent, /web-01\.example\.test/);
  swap(p, b);
  assert.equal(p.I.ctx.sel, WEB01);
  assert.equal(p.$("pn").hidden, false);
  assert.match(p.$("pn").textContent, /web-01b\.example\.test/);
  const el = p.core.ents.find((e) => e.dataset.ent === WEB01);
  assert.ok(el.classList.contains("sel"));
  assert.ok(p.core.ents.some((e) => e.classList.contains("dim")));
});

test("the selection clears when its server is gone", () => {
  const a = render(demo()), b = render(dropStats(demo()), a.layout);
  const p = bootPage(a);
  p.I.select(STATS01);
  swap(p, b);
  assert.equal(p.I.ctx.sel, null);
  assert.equal(p.$("pn").hidden, true);
  assert.ok(p.core.ents.every((e) => !e.classList.contains("dim") && !e.classList.contains("sel")));
});

test("with nothing selected nothing is selected afterwards", () => {
  const a = render(demo()), b = render(rename(demo()), a.layout, ["web01"]);
  const p = bootPage(a);
  swap(p, b);
  assert.equal(p.I.ctx.sel, null);
  assert.equal(p.$("pn").hidden, true);
});

test("an open server form with pending edits keeps its panel while the page behind it is swapped", () => {
  const serverEditor = { source: () => ({ id: "web01", name: "web-01", server_type: "web", details: "", types: [{ id: "web", label: "Web" }] }), apply: () => null };
  const a = render(demo()), b = render(rename(demo()), a.layout, ["web01"]);
  const p = bootPage(a, { host: { noteParser: () => ({}), serverEditor } });
  p.I.select(WEB01);
  p.$("pn").dispatchEvent(makeEvent("click", { target: p.$("pe") }));
  const name = p.$("pn").querySelector(".sname");
  name.value = "typed by the user";
  assert.equal(p.core.services.pending(), true);
  swap(p, b);
  assert.equal(p.I.ctx.sel, WEB01);
  assert.equal(p.$("pn").querySelector(".sname"), name);
  assert.equal(name.value, "typed by the user");
  assert.equal(p.core.ents.find((e) => e.dataset.ent === WEB01).classList.contains("sel"), true);
});

test("edit mode, the drawing tool, the legend switches and the info switch stay", () => {
  const a = render(demo()), b = render(rename(demo()), a.layout, ["web01"]);
  const p = bootPage(a);
  p.click(p.$("te"));
  p.click(p.doc.querySelector('#dtg [data-t="pencil"]'));
  p.I.toggle("db01x", false);
  p.click(p.$("lbl"));
  p.click(p.$("osv"));
  const labels = p.I.ctx.labels, sys = p.I.ctx.sys, hidden = JSON.stringify(p.I.ctx.hidden);
  swap(p, b);
  assert.equal(p.M["canvas/model"].state.on, true);
  assert.equal(p.$("te").getAttribute("aria-pressed"), "true");
  assert.equal(p.$("tx").hidden, false);
  assert.match(p.svg.getAttribute("class"), /edit/);
  assert.match(p.svg.getAttribute("class"), /draw-pencil/);
  assert.equal(p.M["canvas/draw"].tool(), "pencil");
  assert.equal(p.$("dpo").hidden, false);
  assert.equal(p.I.ctx.labels, labels);
  assert.equal(p.I.ctx.sys, sys);
  assert.equal(JSON.stringify(p.I.ctx.hidden), hidden);
  assert.equal(p.$("lbl").getAttribute("aria-checked"), String(labels));
  assert.equal(p.$("osv").getAttribute("aria-checked"), String(sys));
  const marked = p.core.els.filter((e) => e.dataset.e);
  assert.ok(marked.length > 10);
  assert.ok(p.core.els.find((e) => e.dataset.ent === WEB01 && e.dataset.e));
  assert.ok(p.svg.querySelector("#rh"));
  assert.ok(p.M["canvas/edit-mode"].currentLayout().nodes.web01);
});

test("an edit keeps the layout the user arranged: the new scene's geometry becomes the base", () => {
  const a = render(demo());
  const p = bootPage(a);
  p.click(p.$("te"));
  const model = p.M["canvas/model"], edit = p.M["canvas/edit-mode"];
  model.state.st = model.apply(model.state.st, WEB01, 40, 20);
  model.render(model.state.st);
  assert.equal(edit.isDirty(), true);
  const moved = edit.currentLayout(), b = render(rename(demo()), { ...a.layout, nodes: { ...a.layout.nodes, web01: moved.nodes.web01 }, clusters: moved.clusters }, ["web01"]);
  swap(p, b);
  assert.equal(edit.currentLayout().nodes.web01.x, moved.nodes.web01.x);
  assert.equal(edit.isDirty(), false);
  assert.equal(model.state.on, true);
  const loaded = bootPage(b);
  loaded.click(loaded.$("te"));
  assert.deepEqual(sceneDiff(sceneView(p, { loose: true }), sceneView(loaded, { loose: true })), []);
});

test("a stroke drawn before the swap and not yet saved stays, with its undo history and dirty mark", () => {
  const a = render(demo());
  const p = bootPage(a), draw = p.M["canvas/draw"];
  p.click(p.doc.querySelector('#dtg [data-t="pencil"]'));
  pointer(p, "pointerdown", { clientX: 10, clientY: 10 });
  pointer(p, "pointermove", { clientX: 60, clientY: 40 });
  pointer(p, "pointermove", { clientX: 90, clientY: 80 });
  pointer(p, "pointerup", { clientX: 90, clientY: 80 });
  assert.equal(draw.list().length, 1);
  assert.equal(draw.isDirty(), true);
  const b = render(rename(demo()), { ...a.layout, drawings: draw.list() }, ["web01"]);
  swap(p, b);
  assert.equal(draw.list().length, 1);
  assert.equal(draw.isDirty(), true);
  assert.equal(draw.tool(), "pencil");
  assert.equal(p.$("dw").children.length, 1);
  assert.equal(p.$("dtu").disabled, false);
  assert.equal(p.$("dw").innerHTML, bootPage(b).$("dw").innerHTML);
  draw.undo();
  assert.equal(p.$("dw").children.length, 0);
});

test("the network filter follows its network to the new list, and clears when the network is gone", () => {
  const a = render(demo()), p = bootPage(a), at = (cidr) => p.core.D.nets.findIndex((n) => n.cidr === cidr);
  p.I.setNet(at("192.0.2.0/24"));
  swap(p, render(edits["a network name"](demo()), a.layout));
  assert.equal(p.I.ctx.net, at("192.0.2.0/24"));
  assert.equal(p.core.D.nets[p.I.ctx.net].name, "Demo LAN 2");
  assert.equal(p.$("wl").querySelector('.nw[data-n="' + p.I.ctx.net + '"]').getAttribute("aria-pressed"), "true");
  assert.ok(p.core.ents.some((e) => e.classList.contains("nf")));
  p.I.setNet(at("2001:db8::/32"));
  const dropped = mod(demo(), "networks.toml", '\n[[networks]]\ncidr = "2001:db8::/32"\nname = "Demo IPv6 lab"\n', "");
  swap(p, render(dropped, a.layout));
  assert.equal(at("2001:db8::/32"), -1);
  assert.equal(p.I.ctx.net, null);
  assert.ok(p.core.ents.every((e) => !e.classList.contains("nf")));
  assert.ok(p.$("wl").querySelectorAll(".nw").every((b) => b.getAttribute("aria-pressed") === "false"));
});

test("a network without a cidr is found again by its name", () => {
  const a = render(demo()), p = bootPage(a), data = JSON.parse(a.scene.data);
  p.core.D.nets[1].cidr = "";
  p.I.setNet(1);
  const nameless = { ...a.scene, data: JSON.stringify({ ...data, nets: data.nets.map((n) => ({ ...n, cidr: "" })) }) };
  assert.equal(p.I.replaceScene(nameless).ok, true);
  assert.equal(p.I.ctx.net, 1);
  p.core.D.nets[1].name = "";
  p.core.D.nets[1].cidr = "";
  p.I.setNet(1);
  assert.equal(p.I.replaceScene(nameless).ok, true);
  assert.equal(p.I.ctx.net, null);
});

test("notes: a changed panel is rebuilt and the note editor starts from the new texts; an unchanged one is left alone", () => {
  const a = render(demo()), b = render(edits["a note"](demo()), a.layout), p = bootPage(a), notes = p.M["ui/notes-edit"];
  const card = p.$("nl").querySelector(".note");
  swap(p, b);
  assert.equal(p.$("nh").textContent, "Notes (2)");
  assert.match(p.$("nl").textContent, /Cache tier planned/);
  assert.deepEqual([...notes.texts()], b.notes);
  assert.equal(notes.isDirty(), false);
  assert.notEqual(p.$("nl").querySelector(".note"), card);
  const kept = p.$("nl").querySelector(".note");
  swap(p, b);
  assert.equal(p.$("nl").querySelector(".note"), kept);
  assert.deepEqual([...notes.texts()], b.notes);
});

test("a page that is not file-backed has no note editor and still swaps its notes", () => {
  const a = render(demo()), b = render(edits["a note"](demo()), a.layout), p = bootPage(a, { fileBacked: false });
  swap(p, b);
  swap(p, b);
  assert.match(p.$("nl").textContent, /Cache tier planned/);
  assert.equal(p.$("na"), null);
  assert.deepEqual(sceneDiff(sceneView(p), sceneView(bootPage(b, { fileBacked: false }))), []);
});

test("related documents and the legend are rebuilt from the new scene", () => {
  const a = render(demo()), b = render(edits["a related document"](demo()), a.layout), c = render(edits["a new server"](demo()), a.layout), p = bootPage(a);
  swap(p, b);
  assert.match(p.$("dl").textContent, /Demo overview/);
  swap(p, c);
  assert.equal(p.$("lg").querySelectorAll(".sw").length, p.core.D.types.length);
  assert.equal(p.$("lb").querySelectorAll(".sw.es").length, p.core.D.edgeSwitches.length);
});

test("the page title and the svg style sheet follow the scene", () => {
  const a = render(demo()), b = render(mod(demo(), "topology.toml", 'title = "Demo infrastructure"', 'title = "Demo estate"'), a.layout), p = bootPage(a);
  swap(p, b);
  assert.equal(p.doc.title, "Demo estate");
  assert.equal(p.$("css-svg").textContent, b.scene.cssSvg);
});

test("the runtime refuses a scene that does not belong to this page and changes nothing", () => {
  const a = render(demo()), p = bootPage(a), before = sceneView(p);
  const reason = (scene) => { const r = p.I.replaceScene(scene); assert.equal(r.ok, false); return r.reason; };
  assert.equal(reason(null), "no scene");
  assert.equal(reason("scene"), "no scene");
  assert.equal(reason({ ...a.scene, viewBox: undefined }), "the scene is incomplete");
  assert.equal(reason({ ...a.scene, noteCount: "2" }), "the scene is incomplete");
  assert.equal(reason({ ...a.scene, nets: 5 }), "the scene is incomplete");
  assert.equal(reason({ ...a.scene, nets: undefined }), "the scene is incomplete");
  assert.match(reason({ ...a.scene, data: "{" }), /JSON/);
  assert.equal(reason({ ...a.scene, nets: null }), "the Networks panel appears or disappears");
  assert.equal(reason(render(mod(demo(), "topology.toml", 'id = "demo"', 'id = "other"')).scene), "the scene belongs to another diagram");
  p.I.ctx.ready = false;
  assert.equal(reason(a.scene), "the page has not started yet");
  p.I.ctx.ready = true;
  assert.deepEqual(sceneDiff(sceneView(p), before), []);
});

test("a page without networks refuses a scene that has them", () => {
  const small = render(mini()), p = bootPage(small), other = render(mod(mini(), "topology.toml", 'title = "t"', 'title = "t2"'));
  assert.equal(small.scene.nets, null);
  assert.equal(swap(p, other).ok, true);
  assert.equal(p.I.replaceScene({ ...other.scene, nets: "\n" }).reason, "the Networks panel appears or disappears");
});

test("a scene that breaks half way is reported as failed so the caller can reload", () => {
  const a = render(demo()), p = bootPage(a), data = JSON.parse(a.scene.data);
  const r = p.I.replaceScene({ ...a.scene, data: JSON.stringify({ id: data.id, layout: data.layout }) });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Cannot read|undefined|filter/);
  assert.equal(p.I.replaceScene({ ...a.scene, data: "null" }).ok, false);
});

test("the keyboard focus ring does not outlive the swap", () => {
  const a = render(demo()), b = render(rename(demo()), a.layout, ["web01"]), p = bootPage(a);
  const target = p.core.els.find((e) => e.dataset.ent === WEB01 && e.getAttribute("tabindex") === "0");
  p.doc.activeElement = target;
  target.keyboardFocus = true;
  p.svg.dispatchEvent(makeEvent("focusin", { target }));
  assert.ok(p.svg.querySelector("#fr"));
  swap(p, b);
  assert.equal(p.svg.querySelector("#fr"), null);
  assert.ok(p.core.els.some((e) => e.dataset.ent === DB01 && e.getAttribute("tabindex") === "0"));
});
