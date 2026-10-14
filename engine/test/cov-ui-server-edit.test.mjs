import test from "node:test";
import assert from "node:assert/strict";
import { loadUi, fixture } from "./cov-ui-env.mjs";

const source = (o = {}) => ({
  name: "Service A", server_type: "web", details: "", os: "Ubuntu 24.04", hardware: "", cpu: "4", ram: "8G", swap: "", disk: "", role: "",
  ips: ["192.0.2.10/24"], dns: [], jobs: [], rmi_services: [], systemd_services: [],
  types: [{ id: "web", label: "Web" }, { id: "db", label: "Database" }], ...o,
});

function editor({ raw = source(), enabled = true, over, applyErr = null } = {}) {
  const f = fixture(over);
  const t = loadUi(["ui/server-edit"], { ...f, globals: enabled ? { InfraDiagramFileBacked: true } : {} });
  t.applied = [];
  t.rawSource = raw;
  t.ID.serverEditor = { source: (id) => (id === "a" ? t.rawSource : null), apply: (id, form) => { t.applied.push([id, form]); return t.applyErr ?? applyErr; } };
  t.mod = t.modules["ui/server-edit"];
  t.core = t.modules["ui/core"];
  t.select = (k = "n:a") => t.modules["ui/selection"].select(k);
  t.open = () => { t.select(); t.fire(t.$("pe"), "click"); };
  t.pn = t.$("pn");
  t.form = () => t.pn.querySelector(".sf");
  t.field = (label) => t.pn.querySelector('[aria-label="' + label + '"]');
  t.err = () => t.pn.querySelector(".sferr");
  t.btn = (text) => t.pn.querySelectorAll("button").find((b) => b.textContent === text);
  return t;
}

test("selecting a server adds an Edit button and makes the title clickable; regions do not", () => {
  const t = editor();
  t.select();
  assert.ok(t.$("pe"));
  assert.equal(t.$("pe").textContent, "Edit");
  assert.ok(t.pn.querySelector("h1").classList.contains("sed"));
  assert.equal(t.pn.querySelector("h1").title, "Click to edit");
  t.select("c:r1");
  assert.ok(t.$("pe") === null);
});

test("no Edit affordance when the diagram is not file-backed or the bridge is missing", () => {
  let t = editor({ enabled: false });
  t.select();
  assert.ok(t.$("pe") === null);
  t = editor();
  t.ID.serverEditor = null;
  t.select();
  assert.ok(t.$("pe") === null);
});

test("opening the form builds name, text fields, list editors, notes and buttons from the source", () => {
  const t = editor({ raw: source({ details: "Line one\nLine two", dns: ["a.example.test"] }) });
  t.open();
  assert.ok(t.form());
  assert.equal(t.field("Server name").value, "Service A");
  assert.equal(t.field("OS").value, "Ubuntu 24.04");
  assert.equal(t.field("OS").placeholder, "Ubuntu 24.04");
  assert.equal(t.field("CPU (cores)").value, "4");
  assert.equal(t.field("Role").value, "");
  assert.deepEqual(t.pn.querySelectorAll(".sfb").map((b) => b.querySelectorAll("input").length), [1, 1, 0, 0, 0]);
  assert.equal(t.field("Notes").value, "Line one\nLine two");
  assert.equal(t.field("Notes").rows, 5);
  assert.ok(t.btn("Done") && t.btn("Cancel") && t.btn("Add IP") && t.btn("Add systemd service"));
  assert.equal(t.pn.querySelector(".sfh").textContent, "Enter saves, Esc cancels");
  assert.ok(t.err().hidden);
  assert.equal(t.err().getAttribute("role"), "alert");
  assert.ok(t.doc.activeElement === t.field("Server name"));
  assert.ok(t.pn.querySelector(".tg").classList.contains("sedb"));
  assert.equal(t.pn.querySelector(".tg").getAttribute("role"), "button");
  assert.equal(t.pn.querySelector(".tg").title, "Click to change the server type");
});

test("Notes textarea only exists when the server has notes, and its height follows the line count", () => {
  let t = editor();
  t.open();
  assert.ok(t.field("Notes") === null);
  t = editor({ raw: source({ details: Array(30).fill("x").join("\n") }) });
  t.open();
  assert.equal(t.field("Notes").rows, 14);
});

test("opening is a no-op when the bridge has no source for the server", () => {
  const t = editor();
  t.rawSource = null;
  t.open();
  assert.ok(t.form() === null);
});

test("clicking the title opens the form; clicking a link inside the title does not", () => {
  const t = editor();
  t.select();
  t.fire(t.pn.querySelector("#pl"), "click");
  assert.ok(t.form() === null);
  t.fire(t.pn.querySelector("h1"), "click");
  assert.ok(t.form());
});

test("clicking the type badge opens the form with the type picker visible, and toggles it afterwards", () => {
  const t = editor();
  t.select();
  t.fire(t.pn.querySelector(".tg"), "click");
  const pick = t.pn.querySelector(".sfp");
  assert.ok(pick.hidden === false);
  assert.deepEqual(pick.querySelectorAll("button").map((b) => b.textContent), ["WEB", "DATABASE"]);
  t.fire(t.pn.querySelector(".tg.sedb"), "click");
  assert.ok(pick.hidden === true);
  t.fire(t.pn.querySelector(".tg.sedb"), "click");
  assert.ok(pick.hidden === false);
});

test("choosing a type updates the badge and panel, keeping a PROPOSED suffix, and the choice is submitted", () => {
  const t = editor({ over: { ent: { ...fixture().D.ent, "n:a": { ...fixture().D.ent["n:a"], tag: "WEB · PROPOSED" } } } });
  t.open();
  const pick = t.pn.querySelector(".sfp");
  pick.hidden = false;
  t.fire(pick.querySelectorAll("button")[1], "click");
  const tg = t.pn.querySelector(".tg.sedb");
  assert.equal(tg.textContent, "DATABASE · PROPOSED");
  assert.equal(tg.getAttribute("data-ty"), "db");
  assert.equal(t.pn.getAttribute("data-ty"), "db");
  assert.ok(pick.hidden);
  t.fire(t.btn("Done"), "click");
  assert.equal(t.applied[0][1].server_type, "db");
});

test("list editors: Add adds a focused row, the x button removes it", () => {
  const t = editor();
  t.open();
  t.fire(t.btn("Add DNS name"), "click");
  const rows = t.pn.querySelectorAll(".sfb")[1].querySelectorAll(".sfr");
  assert.equal(rows.length, 1);
  const input = rows[0].querySelector("input");
  assert.equal(input.placeholder, "host.example.test");
  assert.equal(input.getAttribute("aria-label"), "DNS");
  assert.ok(t.doc.activeElement === input);
  t.fire(rows[0].querySelector(".sfx"), "click");
  assert.equal(t.pn.querySelectorAll(".sfb")[1].querySelectorAll(".sfr").length, 0);
});

test("Done submits the whole form with raw values; blanks are still sent so the bridge can trim", () => {
  const t = editor();
  t.open();
  t.field("Server name").value = "  Service A2 ";
  t.field("RAM (size)").value = "16G";
  t.fire(t.btn("Add IP"), "click");
  t.pn.querySelectorAll(".sfb")[0].querySelectorAll("input")[1].value = "198.51.100.5";
  t.fire(t.btn("Done"), "click");
  assert.equal(t.applied.length, 1);
  assert.equal(t.applied[0][0], "a");
  const f = t.applied[0][1];
  assert.equal(f.name, "  Service A2 ");
  assert.equal(f.ram, "16G");
  assert.deepEqual([...f.ips], ["192.0.2.10/24", "198.51.100.5"]);
  assert.equal(f.details, "");
  assert.ok(t.form() === null, "panel re-rendered after success");
  assert.match(t.pn.innerHTML, /Service A/);
});

test("Done without changes just closes the form; whitespace-only differences are not changes", () => {
  const t = editor({ raw: source({ details: "Notes\n" }) });
  t.open();
  t.field("Server name").value = " Service A  ";
  t.fire(t.btn("Done"), "click");
  assert.deepEqual(t.applied, []);
  assert.ok(t.form() === null);
  assert.equal(t.mod.isDirty(), false);
});

test("a rejected edit stays open and shows the bridge's message", () => {
  const t = editor({ applyErr: "Name already used" });
  t.open();
  t.field("Server name").value = "Taken";
  t.fire(t.btn("Done"), "click");
  assert.ok(t.form(), "form is still there");
  assert.equal(t.err().textContent, "Name already used");
  assert.ok(t.err().hidden === false);
  assert.equal(t.mod.isDirty(), true);
  assert.equal(t.mod.finish(), "Name already used");
  t.applyErr = "";
  t.field("Server name").value = "Free";
  assert.equal(t.mod.finish(), null);
  assert.ok(t.form() === null);
});

test("Cancel and Escape discard the edit and re-render the panel", () => {
  const t = editor();
  t.open();
  t.field("Server name").value = "Changed";
  t.fire(t.btn("Cancel"), "click");
  assert.ok(t.form() === null);
  assert.equal(t.pn.querySelector("h1").textContent.trim().startsWith("Service A"), true);
  t.open();
  t.field("Server name").value = "Changed";
  const ev = t.fire(t.field("Server name"), "keydown", { key: "Escape" });
  assert.equal(ev, false);
  assert.ok(t.form() === null);
  assert.deepEqual(t.applied, []);
});

test("Enter in a text field saves; in the notes textarea only Ctrl/Cmd+Enter saves; composing and other keys are ignored", () => {
  const t = editor({ raw: source({ details: "Notes" }) });
  t.open();
  t.field("Server name").value = "N1";
  t.fire(t.field("Server name"), "keydown", { key: "Enter", isComposing: true });
  t.fire(t.field("Server name"), "keydown", { key: "a" });
  assert.equal(t.applied.length, 0);
  t.fire(t.field("Notes"), "keydown", { key: "Enter" });
  assert.equal(t.applied.length, 0);
  t.fire(t.field("Notes"), "keydown", { key: "Enter", ctrlKey: true });
  assert.equal(t.applied.length, 1);
  t.open();
  t.field("Server name").value = "N2";
  t.fire(t.field("Notes"), "keydown", { key: "Enter", metaKey: true });
  assert.equal(t.applied.length, 2);
  t.open();
  t.field("Server name").value = "N3";
  t.fire(t.field("Server name"), "keydown", { key: "Enter" });
  assert.equal(t.applied.length, 3);
});

test("keys and clicks on the panel are ignored while no form is open", () => {
  const t = editor();
  t.select();
  t.fire(t.pn.querySelector("h1"), "keydown", { key: "Escape" });
  t.fire(t.pn.querySelector("h1"), "keydown", { key: "Enter" });
  assert.ok(t.form() === null);
  t.fire(t.pn.querySelector("p, ul, table") || t.pn, "click");
  assert.ok(t.form() === null);
});

test("selecting something else is blocked while the form has changes, and allowed when clean", () => {
  const t = editor();
  t.open();
  t.select("n:b");
  assert.equal(t.core.ctx.sel, "n:b", "unchanged form lets go");
  t.open();
  t.field("Server name").value = "Dirty";
  t.select("c:r1");
  assert.equal(t.core.ctx.sel, "n:a");
  assert.equal(t.err().textContent, "Finish this edit first: Done or Esc.");
  assert.ok(t.err().hidden === false);
  assert.equal(t.core.hooks.pending(), true);
  assert.equal(t.mod.isDirty(), true);
  t.field("Server name").value = "Service A";
  assert.equal(t.core.hooks.pending(), false);
});

test("isDirty and finish are inert without an open form", () => {
  const t = editor();
  assert.equal(t.mod.isDirty(), false);
  assert.equal(t.mod.finish(), null);
  t.select();
  assert.equal(t.core.hooks.pending(), false);
});

test("finish with an unchanged open form closes it and reports no error", () => {
  const t = editor();
  t.open();
  assert.equal(t.mod.finish(), null);
  assert.ok(t.form() === null);
});

test("edit.details falls back to the source value when the server has no notes box", () => {
  const t = editor();
  t.open();
  t.fire(t.btn("Add job"), "click");
  t.pn.querySelectorAll(".sfb")[2].querySelector("input").value = "Job 1";
  t.fire(t.btn("Done"), "click");
  assert.equal(t.applied[0][1].details, "");
  assert.deepEqual([...t.applied[0][1].jobs], ["Job 1"]);
});
