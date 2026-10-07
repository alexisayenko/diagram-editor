import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parseToml, tomlModel } from "../parse/toml.mjs";
import { setServer } from "../parse/toml-write.mjs";
import { mergeTypes } from "../parse/types.mjs";

const demo = readFileSync(new URL("../../examples/demo/demo.toml", import.meta.url), "utf8");
const blank = { name: "", os: "", hardware: "", role: "", ips: [], dns: [], jobs: [], rmi_services: [], systemd_services: [], details: "" };
const fieldsOf = (src, id) => {
  const s = parseToml(src).servers.find((x) => x.id === id);
  return { ...blank, name: s.name ?? s.id, os: s.os ?? "", hardware: s.hardware ?? "", role: s.role ?? "", details: s.details ?? "",
    ips: s.ips ?? [], dns: s.dns ?? [], jobs: s.jobs ?? [], rmi_services: s.rmi_services ?? [], systemd_services: s.systemd_services ?? [] };
};
const server = (src, id) => parseToml(src).servers.find((s) => s.id === id);
const table = (src, id) => {
  const start = src.indexOf(`id = "${id}"`), from = src.lastIndexOf("[[servers]]", start), next = src.indexOf("\n[[", start);
  return [from, next < 0 ? src.length : next];
};

test("no change returns the file untouched", () => {
  assert.equal(setServer(demo, "web01", fieldsOf(demo, "web01")), demo);
});

test("rename touches only the name value; the rest of the file is byte-identical", () => {
  const out = setServer(demo, "web01", { ...fieldsOf(demo, "web01"), name: "web-09.example.test" });
  assert.equal(out, demo.replace('name = "web-01.example.test"', 'name = "web-09.example.test"'));
  assert.equal(server(out, "web01").name, "web-09.example.test");
});

test("edit every field: re-parsed server equals the edit, other servers and the rest are byte-identical", () => {
  const f = { ...fieldsOf(demo, "app01"), name: "app-01b.example.test", os: "Ubuntu 24.04", hardware: "16 vCPU", role: "API", ips: ["192.0.2.31/24", "192.0.2.131/24"],
    dns: ["api.example.test"], jobs: ["Job 1"], rmi_services: [], systemd_services: ["a", "b"], details: 'Line one.\n\nLine two with "quotes" and \\ and tab\t.' };
  const out = setServer(demo, "app01", f);
  const s = server(out, "app01");
  assert.equal(s.name, f.name);
  assert.deepEqual(s.ips, f.ips);
  assert.deepEqual(s.systemd_services, f.systemd_services);
  assert.equal(s.details, f.details);
  assert.equal(s.rmi_services, undefined);
  assert.deepEqual(s.services, ["Tomcat: demo-api", "Job 104 batch import"]);
  const [a, b] = table(demo, "app01"), [c] = table(out, "app01");
  assert.equal(out.slice(0, c), demo.slice(0, a));
  assert.equal(out.slice(out.length - (demo.length - b)), demo.slice(b));
  assert.ok(tomlModel(out, "demo.toml"));
});

test("keys: added when non-empty, removed when emptied, new keys appended at the end of the table, order kept", () => {
  const src = 'title = "T"\n\n[[servers]]\nid = "a"\n# keep me\nname = "a.test"  # trailing\nserver_type = "web"\nips = ["192.0.2.1/24"]\nos = "Debian 12"\n\n[[servers]]\nid = "b"\nserver_type = "web"\n';
  const out = setServer(src, "a", { ...fieldsOf(src, "a"), os: "", role: "Proxy", dns: ["a.example.test"] });
  assert.equal(out, 'title = "T"\n\n[[servers]]\nid = "a"\n# keep me\nname = "a.test"  # trailing\nserver_type = "web"\nips = ["192.0.2.1/24"]\nrole = "Proxy"\ndns = ["a.example.test"]\n\n[[servers]]\nid = "b"\nserver_type = "web"\n');
  const back = setServer(out, "a", { ...fieldsOf(out, "a"), role: "", dns: [], os: "Debian 12" });
  assert.equal(back, src.replace('os = "Debian 12"\n', "").replace('ips = ["192.0.2.1/24"]\n', 'ips = ["192.0.2.1/24"]\nos = "Debian 12"\n'));
});

test("last table without a trailing newline, and a name equal to the id adds no key", () => {
  const src = 'title = "T"\n[[servers]]\nid = "a"\nserver_type = "web"';
  const out = setServer(src, "a", { ...blank, name: "a", role: "R" });
  assert.equal(out, 'title = "T"\n[[servers]]\nid = "a"\nserver_type = "web"\nrole = "R"');
  assert.equal(server(setServer(src, "a", { ...blank, name: "a.test" }), "a").name, "a.test");
});

test("CRLF files keep CRLF, BOM kept, multi-line values use the file's line endings", () => {
  const src = "﻿" + demo.replace(/\n/g, "\r\n");
  const out = setServer(src, "app01", { ...fieldsOf(demo, "app01"), name: "x.example.test", details: "a\nb", jobs: ["one", "two"] });
  assert.ok(out.startsWith("﻿"));
  assert.ok(!/[^\r]\n/.test(out));
  assert.equal(server(out, "app01").details, "a\nb");
  assert.deepEqual(server(out, "app01").jobs, ["one", "two"]);
  assert.equal(setServer(out, "app01", fieldsOf(out, "app01")), out);
});

test("multi-line arrays stay multi-line; single-line stay single-line", () => {
  const src = 'title = "T"\n[[servers]]\nid = "a"\nserver_type = "web"\nips = [\n  "192.0.2.1/24", # first\n  "192.0.2.2/24",\n]\nos = "x"\n';
  const out = setServer(src, "a", { ...blank, name: "a", os: "x", ips: ["192.0.2.3/24"] });
  assert.equal(out, 'title = "T"\n[[servers]]\nid = "a"\nserver_type = "web"\nips = [\n  "192.0.2.3/24",\n]\nos = "x"\n');
});

test("special characters round-trip", () => {
  const names = ['quo"te.example.test', "back\\slash", "tab\there", "unié \u{1F600}", "ctrl\u0001"];
  for (const name of names) {
    const out = setServer(demo, "web01", { ...fieldsOf(demo, "web01"), name, role: name, details: name + "\n" + name + '"""' });
    assert.equal(server(out, "web01").name, name);
    assert.equal(server(out, "web01").details, name + "\n" + name + '"""');
  }
});

test("validation: empty name, bad IP, bad host name, multi-line entries, duplicate name, unknown server", () => {
  const f = fieldsOf(demo, "web01");
  assert.throws(() => setServer(demo, "web01", { ...f, name: "  " }), /name is empty/);
  assert.throws(() => setServer(demo, "web01", { ...f, ips: ["300.1.1.1/24"] }), /invalid IPv4 CIDR/);
  assert.throws(() => setServer(demo, "web01", { ...f, ips: ["192.0.2.1"] }), /invalid IPv4 CIDR/);
  assert.throws(() => setServer(demo, "web01", { ...f, dns: ["bad name!"] }), /invalid host name/);
  assert.throws(() => setServer(demo, "web01", { ...f, jobs: ["a\nb"] }), /single-line/);
  assert.throws(() => setServer(demo, "web01", { ...f, name: "app-01.example.test" }), /duplicate server name/);
  assert.throws(() => setServer(demo, "nope", f), /not in the file/);
});

test("server_type: write-back, inherited type is not written, unknown id fails", () => {
  const f = fieldsOf(demo, "app01");
  assert.equal(setServer(demo, "app01", { ...f, server_type: "application" }), demo);
  const out = setServer(demo, "app01", { ...f, server_type: "batch" });
  assert.equal(server(out, "app01").server_type, "batch");
  const [a, b] = table(demo, "app01"), [c, d] = table(out, "app01");
  assert.equal(out.slice(0, c), demo.slice(0, a));
  assert.equal(out.slice(d), demo.slice(b));
  assert.equal(tomlModel(out, "d.toml").model.classes.get("app01")[0], "batch");
  const changed = setServer(demo, "stats01", { ...fieldsOf(demo, "stats01"), server_type: "nas" });
  assert.equal(changed, demo.replace('server_type = "statistics"', 'server_type = "nas"'));
  assert.throws(() => setServer(demo, "app01", { ...f, server_type: "ghost" }), /Unknown server type 'ghost'/);
});

test("server types: built-ins merged with the file, override by id, unknown id and bad entries fail", () => {
  const types = mergeTypes([{ id: "batch", label: "Batch", color: "#00796B" }, { id: "web", label: "Front End" }]);
  assert.equal(types.web.label, "Front End");
  assert.equal(types.web.color, "#C2185B");
  assert.equal(types.web.tag, "FRONT END");
  assert.equal(types.batch.dark, "#00796B");
  assert.ok(types.oracle.db && types.application);
  const base = 'title = "t"\n[[server_types]]\nid = "batch"\nlabel = "Batch"\ncolor = "#112233"\n[[servers]]\nid = "a"\nserver_type = "batch"\n';
  assert.equal(tomlModel(base, "t.toml").model.classDefs.get("batch"), "stroke:#112233");
  assert.throws(() => tomlModel(base.replace('server_type = "batch"', 'server_type = "ghost"'), "t.toml"), /server_type must be one of .*batch/);
  assert.throws(() => tomlModel(base.replace('label = "Batch"\n', ""), "t.toml"), /needs label and color/);
  assert.throws(() => tomlModel(base.replace("#112233", "red"), "t.toml"), /#rrggbb/);
  assert.throws(() => tomlModel(base.replace('id = "batch"', 'id = "proposed"'), "t.toml"), /invalid id/);
  const override = base.replace('id = "batch"', 'id = "web"').replace('label = "Batch"\ncolor = "#112233"', 'label = "Front"').replace('server_type = "batch"', 'server_type = "web"');
  assert.equal(tomlModel(override, "t.toml").model.classDefs.get("web"), "stroke:#C2185B");
  const inRegion = base.replace("[[servers]]", '[[regions]]\nid = "r"\ntitle = "R"\nserver_type = "batch"\n[[servers]]').replace('server_type = "batch"\n', 'region = "r"\n').replace('region = "r"\n', 'region = "r"\n');
  assert.equal(tomlModel(inRegion.replace('title = "R"\nregion = "r"', 'title = "R"\nserver_type = "batch"'), "t.toml").model.classes.get("r")[0], "batch");
});

test("new server keys: types validated, details panel sections built", () => {
  const base = 'title = "t"\n[[servers]]\nid = "a"\nserver_type = "web"\n';
  assert.throws(() => tomlModel(base + 'dns = "x"\n', "t.toml"), /a\.dns must be an array/);
  assert.throws(() => tomlModel(base + 'jobs = [""]\n', "t.toml"), /jobs must be an array/);
  assert.throws(() => tomlModel(base + 'hardware = ""\n', "t.toml"), /hardware must be a non-empty string/);
  assert.throws(() => tomlModel(base + 'dns = ["bad name"]\n', "t.toml"), /invalid host name/);
  const { sections } = tomlModel(base + 'os = "Debian 12"\nhardware = "H"\nrole = "R"\nips = ["192.0.2.1/24"]\ndns = ["a.example.test"]\njobs = ["J1"]\nrmi_services = ["S1"]\nsystemd_services = ["u1"]\ndetails = "Free text."\n', "t.toml");
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
