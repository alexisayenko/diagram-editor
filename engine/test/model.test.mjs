import test from "node:test";
import assert from "node:assert/strict";
import { tomlModel } from "../parse/toml.mjs";
import { serverFields, serverSection, cardUnits } from "../model/server.mjs";
import { edgeKey, endKey, isDashed } from "../model/edges.mjs";
import { displayOs, osFamily, osInfo } from "../model/os.mjs";
import { mini } from "./helpers.mjs";

const server = (...lines) => mini('id = "d"\ntitle = "t"\n', {}, ['id = "a"', 'name = "Service A"', 'server_type = "web"', ...lines, ""].join("\n"));
const fieldsOf = (...lines) => tomlModel(server(...lines), "x").model.nodes.get("a").fields;

test("fields: os is trimmed, null for none or TBD, and the pipe is replaced like in the details row", () => {
  assert.equal(fieldsOf('os = "  Ubuntu 24.04 "').os, "Ubuntu 24.04");
  assert.equal(fieldsOf('os = "TBD"').os, null);
  assert.equal(fieldsOf().os, null);
  assert.equal(fieldsOf('os = "A | B"').os, "A / B");
});

test("fields: hardware parts are normalised, the strip and the cells match the card", () => {
  const f = fieldsOf('cpu = "4 cores"', 'ram = "8 GiB"', 'swap = "2048 MiB"', 'disk = "50G"', 'hardware = "free text"');
  assert.deepEqual(f.hardware, { cpu: "4", ram: "8G", swap: "2G", disk: "50G", free: "free text", cells: [["cpu", "4"], ["ram", "8G"], ["swap", "2G"], ["sd", "50G"]], strip: "4 cpu · 8G ram · 2G swap · 50G sd" });
  const none = fieldsOf().hardware;
  assert.deepEqual([none.cpu, none.ram, none.swap, none.disk, none.free, none.cells, none.strip], [null, null, null, null, null, [], ""]);
});

test("fields: lists, notes, role and the table rows keep the stored text", () => {
  const f = fieldsOf('role = "Proxy"', 'ips = ["192.0.2.5/24"]', 'dns = ["a.example.test"]', 'services = ["s"]', 'jobs = ["j", "cron: x"]', 'rmi_services = ["r"]', 'systemd_services = ["u.service"]', 'details = "Free text."');
  assert.deepEqual([f.role, f.ips, f.dns, f.services, f.jobs, f.rmi, f.systemd, f.notes], ["Proxy", ["192.0.2.5/24"], ["a.example.test"], ["s"], ["j", "cron: x"], ["r"], ["u.service"], "Free text."]);
  assert.deepEqual(f.unitGroups, [["systemd services", ["u.service"]]]);
  assert.deepEqual(f.rows, [["Role", "Proxy"]]);
});

test("the node carries the structured fields next to the card strings", () => {
  const n = tomlModel(server('os = "Debian 12.3"', 'cpu = "2"', 'jobs = ["cron: x", "j"]'), "x").model.nodes.get("a");
  assert.equal(n.os, n.fields.os);
  assert.equal(n.hw, n.fields.hardware.strip);
  assert.equal(n.hwc, n.fields.hardware.cells);
  assert.deepEqual(n.body, ["j"]);
  assert.deepEqual(n.fields.jobs, ["cron: x", "j"]);
});

test("serverSection renders the details markdown from the fields only, without the OS row", () => {
  const f = serverFields({ os: "Debian 12", role: "A|B", details: "Notes" }, { ips: ["192.0.2.1/24"], dns: ["h.example.test"], services: [], jobs: [], rmi: ["R"], units: ["a.service"] }, []);
  const md = serverSection(f);
  assert.equal(md, "| Key | Value |\n|---|---|\n| Role | A/B |\n\n## IPs\n\n- 192.0.2.1/24\n\n## DNS\n\n- h.example.test\n\n## RMI services\n\n- R\n\n## systemd services\n\n- a.service\n\nNotes");
  const nets = { of: (ip) => (ip === "192.0.2.1/24" ? { name: "Net 1", cidr: "192.0.2.0/24" } : null) };
  assert.match(serverSection(f, nets), /- 192\.0\.2\.1\/24 — Net 1/);
  assert.match(serverSection({ ...f, ips: ["198.51.100.1/24"] }, { of: () => null }), /- 198\.51\.100\.1\/24 — unassigned network/);
  assert.match(serverSection({ ...f, ips: ["x"] }, { of: () => ({ cidr: "192.0.2.0/24" }) }), /- x — 192\.0\.2\.0\/24/);
  assert.equal(serverSection(serverFields({}, { ips: [], dns: [], services: [], jobs: [], rmi: [], units: [] }, [])), "");
});

test("cardUnits keeps all units without a card group", () => {
  assert.deepEqual(cardUnits(["a", "b"], []), ["a", "b"]);
});

test("edge helpers key connections and ends", () => {
  assert.equal(edgeKey({ from: "a", to: "b" }), "a>b");
  const model = { nodes: new Map([["a", {}]]), linkStyles: new Map([[0, "stroke-dasharray:6 4"]]) };
  assert.deepEqual([endKey(model, "a"), endKey(model, "r"), isDashed(model, 0), isDashed(model, 1)], ["n:a", "c:r", true, false]);
});

test("the os helpers stay importable from one model module", () => {
  assert.equal(displayOs("Ubuntu 16.04.7 LTS"), "Ubuntu 16.04 LTS");
  assert.equal(osFamily("Debian 12"), "debian");
  assert.equal(osInfo("Ubuntu 16.04", new Date("2026-01-01")).eol, "2021-04");
});
