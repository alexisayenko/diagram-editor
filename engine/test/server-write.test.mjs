import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parseToml, tomlModel, mergeFolder } from "../parse/toml.mjs";
import { setServer } from "../parse/toml-write.mjs";
import { mergeTypes } from "../parse/types.mjs";
import { demo as loadDemo, mod, withFile, mini } from "./helpers.mjs";

const demoFiles = loadDemo(), ctx = mergeFolder(demoFiles);
const file = (id) => demoFiles.get(`servers/${id}.toml`);
const set = (id, fields) => setServer(file(id), id, fields, ctx);
const blank = { name: "", os: "", hardware: "", role: "", ips: [], dns: [], jobs: [], rmi_services: [], systemd_services: [], details: "" };
const fieldsOf = (src) => {
  const s = parseToml(src);
  return { ...blank, name: s.name ?? s.id, os: s.os ?? "", hardware: s.hardware ?? "", role: s.role ?? "", details: s.details ?? "",
    ips: s.ips ?? [], dns: s.dns ?? [], jobs: s.jobs ?? [], rmi_services: s.rmi_services ?? [], systemd_services: s.systemd_services ?? [] };
};
const server = (src) => parseToml(src);

test("no change returns the file untouched", () => {
  assert.equal(set("web01", fieldsOf(file("web01"))), file("web01"));
});

test("rename touches only the name value; the rest of the file is byte-identical", () => {
  const out = set("web01", { ...fieldsOf(file("web01")), name: "web-09.example.test" });
  assert.equal(out, file("web01").replace('name = "web-01.example.test"', 'name = "web-09.example.test"'));
  assert.equal(server(out).name, "web-09.example.test");
});

test("edit every field: the re-parsed server equals the edit and the folder still loads", () => {
  const f = { ...fieldsOf(file("app01")), name: "app-01b.example.test", os: "Ubuntu 24.04", hardware: "16 vCPU", role: "API", ips: ["192.0.2.31/24", "192.0.2.131/24"],
    dns: ["api.example.test"], jobs: ["Job 1"], rmi_services: [], systemd_services: ["a", "b"], details: 'Line one.\n\nLine two with "quotes" and \\ and tab\t.' };
  const out = set("app01", f), s = server(out);
  assert.equal(s.name, f.name);
  assert.deepEqual(s.ips, f.ips);
  assert.deepEqual(s.systemd_services, f.systemd_services);
  assert.equal(s.details, f.details);
  assert.equal(s.rmi_services, undefined);
  assert.deepEqual(s.services, ["Tomcat: demo-api", "Job 104 batch import"]);
  assert.equal(s.id, "app01");
  assert.equal(s.region, "app");
  assert.ok(tomlModel(withFile(demoFiles, "servers/app01.toml", out), "demo"));
});

test("keys: added when non-empty, removed when emptied, new keys appended at the end of the file, order kept", () => {
  const src = 'id = "a"\n# keep me\nname = "a.test"  # trailing\nserver_type = "web"\nips = ["192.0.2.1/24"]\nos = "Debian 12"\n';
  const out = setServer(src, "a", { ...fieldsOf(src), os: "", role: "Proxy", dns: ["a.example.test"] });
  assert.equal(out, 'id = "a"\n# keep me\nname = "a.test"  # trailing\nserver_type = "web"\nips = ["192.0.2.1/24"]\nrole = "Proxy"\ndns = ["a.example.test"]\n');
  const back = setServer(out, "a", { ...fieldsOf(out), role: "", dns: [], os: "Debian 12" });
  assert.equal(back, src);
});

test("a file without a trailing newline, and a name equal to the id adds no key", () => {
  const src = 'id = "a"\nserver_type = "web"';
  const out = setServer(src, "a", { ...blank, name: "a", role: "R" });
  assert.equal(out, 'id = "a"\nserver_type = "web"\nrole = "R"');
  assert.equal(server(setServer(src, "a", { ...blank, name: "a.test" })).name, "a.test");
});

test("CRLF files keep CRLF, BOM kept, multi-line values use the file's line endings", () => {
  const src = "﻿" + file("app01").replace(/\n/g, "\r\n");
  const out = setServer(src, "app01", { ...fieldsOf(file("app01")), name: "x.example.test", details: "a\nb", jobs: ["one", "two"] }, ctx);
  assert.ok(out.startsWith("﻿"));
  assert.ok(!/[^\r]\n/.test(out));
  assert.equal(server(out).details, "a\nb");
  assert.deepEqual(server(out).jobs, ["one", "two"]);
  assert.equal(setServer(out, "app01", fieldsOf(out), ctx), out);
});

test("multi-line arrays stay multi-line; single-line stay single-line", () => {
  const src = 'id = "a"\nserver_type = "web"\nips = [\n  "192.0.2.1/24", # first\n  "192.0.2.2/24",\n]\nos = "x"\n';
  const out = setServer(src, "a", { ...blank, name: "a", os: "x", ips: ["192.0.2.3/24"] });
  assert.equal(out, 'id = "a"\nserver_type = "web"\nips = [\n  "192.0.2.3/24",\n]\nos = "x"\n');
});

test("special characters round-trip", () => {
  const names = ['quo"te.example.test', "back\\slash", "tab\there", "unié \u{1F600}", "ctrl\u0001"];
  for (const name of names) {
    const out = set("web01", { ...fieldsOf(file("web01")), name, role: name, details: name + "\n" + name + '"""' });
    assert.equal(server(out).name, name);
    assert.equal(server(out).details, name + "\n" + name + '"""');
  }
});

test("validation: empty name, bad IP, bad host name, multi-line entries, duplicate name, other server's file", () => {
  const f = fieldsOf(file("web01"));
  assert.throws(() => set("web01", { ...f, name: "  " }), /name is empty/);
  assert.throws(() => set("web01", { ...f, ips: ["300.1.1.1/24"] }), /invalid IPv4 CIDR/);
  assert.throws(() => set("web01", { ...f, ips: ["192.0.2.1"] }), /invalid IPv4 CIDR/);
  assert.throws(() => set("web01", { ...f, dns: ["bad name!"] }), /invalid host name/);
  assert.throws(() => set("web01", { ...f, jobs: ["a\nb"] }), /single-line/);
  assert.throws(() => set("web01", { ...f, name: "app-01.example.test" }), /duplicate server name/);
  assert.throws(() => setServer(file("web01"), "nope", f, ctx), /not in the file/);
});

test("server_type: write-back, inherited type is not written, unknown id fails", () => {
  const f = fieldsOf(file("app01"));
  assert.equal(set("app01", { ...f, server_type: "application" }), file("app01"));
  const out = set("app01", { ...f, server_type: "batch" });
  assert.equal(server(out).server_type, "batch");
  assert.equal(out, file("app01") + 'server_type = "batch"\n');
  assert.equal(tomlModel(withFile(demoFiles, "servers/app01.toml", out), "demo").model.classes.get("app01")[0], "batch");
  const changed = set("stats01", { ...fieldsOf(file("stats01")), server_type: "nas" });
  assert.equal(changed, file("stats01").replace('server_type = "statistics"', 'server_type = "nas"'));
  assert.throws(() => set("app01", { ...f, server_type: "ghost" }), /Unknown server type 'ghost'/);
});

test("server types: built-ins merged with server-types.toml, override by id, unknown id and bad entries fail", () => {
  const types = mergeTypes([{ id: "batch", label: "Batch", color: "#00796B" }, { id: "web", label: "Front End" }]);
  assert.equal(types.web.label, "Front End");
  assert.equal(types.web.color, "#C2185B");
  assert.equal(types.web.tag, "FRONT END");
  assert.equal(types.batch.dark, "#00796B");
  assert.ok(types.oracle.db && types.application);
  const typed = (typesText, serverText = 'id = "a"\nserver_type = "batch"\n') => mini('title = "t"\n', { "server-types.toml": typesText }, serverText);
  const base = '[[server_types]]\nid = "batch"\nlabel = "Batch"\ncolor = "#112233"\n';
  assert.equal(tomlModel(typed(base), "t").model.classDefs.get("batch"), "stroke:#112233");
  assert.throws(() => tomlModel(typed(base, 'id = "a"\nserver_type = "ghost"\n'), "t"), /server_type must be one of .*batch/);
  assert.throws(() => tomlModel(typed(base.replace('label = "Batch"\n', "")), "t"), /needs label and color/);
  assert.throws(() => tomlModel(typed(base.replace("#112233", "red")), "t"), /#rrggbb/);
  assert.throws(() => tomlModel(typed(base.replace('id = "batch"', 'id = "proposed"')), "t"), /invalid id/);
  assert.throws(() => tomlModel(typed('title = "x"\n'), "t"), /server-types\.toml: unknown key title/);
  const override = '[[server_types]]\nid = "web"\nlabel = "Front"\n';
  assert.equal(tomlModel(typed(override, 'id = "a"\nserver_type = "web"\n'), "t").model.classDefs.get("web"), "stroke:#C2185B");
  const inRegion = mini('title = "t"\n[[regions]]\nid = "r"\ntitle = "R"\nserver_type = "batch"\n', { "server-types.toml": base }, 'id = "a"\nregion = "r"\n');
  const { model } = tomlModel(inRegion, "t");
  assert.equal(model.classes.get("r")[0], "batch");
  assert.equal(model.classes.get("a")[0], "batch");
});

test("new server keys: types validated, details panel sections built", () => {
  const base = 'id = "a"\nserver_type = "web"\n', one = (extra) => mini('title = "t"\n', {}, base + extra);
  assert.throws(() => tomlModel(one('dns = "x"\n'), "t"), /a\.dns must be an array/);
  assert.throws(() => tomlModel(one('jobs = [""]\n'), "t"), /jobs must be an array/);
  assert.throws(() => tomlModel(one('hardware = ""\n'), "t"), /hardware must be a non-empty string/);
  assert.throws(() => tomlModel(one('dns = ["bad name"]\n'), "t"), /invalid host name/);
  const { sections } = tomlModel(one('os = "Debian 12"\nhardware = "H"\nrole = "R"\nips = ["192.0.2.1/24"]\ndns = ["a.example.test"]\njobs = ["J1"]\nrmi_services = ["S1"]\nsystemd_services = ["u1"]\ndetails = "Free text."\n'), "t");
  for (const part of ["| OS | Debian 12 |", "| Hardware | H |", "| Role | R |", "## IPs\n\n- 192.0.2.1/24", "## DNS\n\n- a.example.test", "## Jobs\n\n- J1", "## RMI services\n\n- S1", "## systemd services\n\n- u1", "Free text."]) assert.ok(sections.a.includes(part), part);
});

function fakeDom() {
  const all = (e) => e.children.flatMap((c) => [c, ...all(c)]);
  const matches = (e, s) => (s === "input" ? e.tag === "input" : s.startsWith("#") ? e.id === s.slice(1) : s.startsWith(".") ? e.className.split(" ").includes(s.slice(1)) || e.classes.has(s.slice(1)) : e.tag === s);
  return (tag) => {
    const e = { tag, tagName: tag.toUpperCase(), children: [], attrs: {}, listeners: {}, value: "", hidden: false, textContent: "", className: "", classes: new Set(),
      classList: { add: (c) => e.classes.add(c), contains: (c) => e.classes.has(c), toggle() {} },
      setAttribute(k, v) { e.attrs[k] = String(v); }, getAttribute: (k) => e.attrs[k] ?? null, addEventListener(t, f) { (e.listeners[t] ||= []).push(f); },
      appendChild(c) { e.children.push(c); c.parent = e; return c; }, replaceChildren(...c) { e.children = c; c.forEach((x) => { x.parent = e; }); },
      insertBefore(c, ref) { e.children.splice(Math.max(0, e.children.indexOf(ref)), 0, c); return c; }, remove() { if (e.parent) e.parent.children = e.parent.children.filter((x) => x !== e); },
      focus() {}, closest: (s) => (matches(e, s) ? e : null), querySelector: (s) => all(e).find((x) => matches(x, s)) || null,
      querySelectorAll: (s) => all(e).filter((x) => matches(x, s)), fire(t, ev = {}) { (e.listeners[t] || []).forEach((f) => f({ target: e, stopPropagation() {}, preventDefault() {}, ...ev })); } };
    return e;
  };
}

test("server editor: type picker and field edits feed the dirty state; Done sends the edited fields", () => {
  const make = fakeDom(), pn = make("aside"), tg = make("span"), close = make("button"), h1 = make("h1");
  close.id = "pc"; tg.className = "tg"; tg.textContent = "WEB SERVER";
  pn.children = [close, h1, tg];
  const applied = [], hooks = {}, selected = [];
  const raw = { name: "web-01.example.test", server_type: "web", types: [{ id: "web", label: "Web Server" }, { id: "batch", label: "Batch Server" }], os: "Debian 12", ips: ["192.0.2.1/24"], dns: [], jobs: [], rmi_services: [], systemd_services: [], details: "" };
  let mod;
  const window = { InfraDiagramFileBacked: true, InfraDiagram: { serverEditor: { source: () => raw, apply: (id, f) => { applied.push([id, f]); return f.ips.includes("bad") ? "bad ip" : null; } } } };
  const src = readFileSync(new URL("../runtime/ui/server-edit.js", import.meta.url), "utf8");
  runInNewContext(src, { window, document: { createElement: make }, InfraDiagram: { define: (n, d, f) => { mod = f({ $: () => pn, hooks }, { select: (k) => selected.push(k) }, { placeChrome() {} }); } } });
  hooks.panel("n:web01", pn);
  assert.equal(mod.isDirty(), false);
  pn.fire("click", { target: tg });
  assert.equal(pn.children.length, 5);
  assert.equal(mod.isDirty(), false);
  pn.children[3].children.find((b) => b.attrs["data-ty"] === "batch").fire("click");
  assert.equal(tg.attrs["data-ty"], "batch");
  assert.equal(tg.textContent, "BATCH SERVER");
  assert.equal(mod.isDirty(), true);
  const row = pn.children[4].querySelectorAll("input").find((i) => i.value === "192.0.2.1/24");
  row.value = "bad";
  assert.equal(mod.finish(), "bad ip");
  row.value = "192.0.2.9/24";
  assert.equal(mod.finish(), null);
  assert.equal(JSON.stringify(applied[1][1].ips), JSON.stringify(["192.0.2.9/24"]));
  assert.equal(applied[1][1].server_type, "batch");
  assert.equal(applied[1][0], "web01");
  assert.equal(JSON.stringify(selected), JSON.stringify(["n:web01"]));
});
