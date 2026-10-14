import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tomlModel } from "../parse/toml.mjs";
import { serviceLines, hardwareStrip } from "../model/server.mjs";
import { shortTitle, TITLE_MAX, geometryKit, geometryMeta } from "../render/geometry.mjs";
import { prepareDiagram, renderDiagram } from "../browser/render.mjs";
import { css, script } from "../page/assets.mjs";
import { mini } from "./helpers.mjs";
import { SERVER_FIELDS } from "../model/server-fields.mjs";

const assets = { cssSvg: css("svg"), cssPage: css("page"), js: script() };
const long = "very-long-server-name-" + "x".repeat(60) + ".example.test";
const probe = (...lines) => mini('id = "d"\ntitle = "t"\n', {}, ['id = "a"', `name = "${long}"`, 'server_type = "web"', 'os = "Debian 12.3"', 'ips = ["192.0.2.5/24"]', ...lines, ""].join("\n"));

test("body lines: jobs section first, then services, RMI and systemd lines; jobs, RMI and systemd capped with +N more", () => {
  assert.deepEqual(serviceLines(["x"], ["j"], ["r"], ["u"]), ["j", "x", "r", "u"]);
  assert.deepEqual(serviceLines([], [], [], ["a", "b", "c", "d", "e", "f"]), ["a", "b", "c", "d", "+2 more"]);
  assert.deepEqual(serviceLines([], ["1", "2", "3", "4", "5"]), ["1", "2", "3", "4", "+1 more"]);
  const { model } = tomlModel(probe('jobs = ["j1"]', 'services = ["svc"]', 'systemd_services = ["a", "b"]'), "x");
  const n = model.nodes.get("a");
  assert.deepEqual(n.body, ["j1", "svc", "a", "b"]);
  assert.equal(n.jn, 1);
  assert.equal(n.svc, 1);
  assert.equal(n.os, "Debian 12.3");
});

test("jobs divider: only between a non-empty jobs section and a non-empty services section", () => {
  const nj = (...l) => prepareDiagram(probe(...l), "x").meta.nodes.a;
  const both = nj('jobs = ["j1", "j2"]', 'systemd_services = ["a"]');
  assert.deepEqual([both.nj, both.nb], [2, 3]);
  const jobsOnly = nj('jobs = ["j1"]');
  assert.deepEqual([jobsOnly.nj, jobsOnly.nb], [1, 1]);
  const svcOnly = nj('systemd_services = ["a"]');
  assert.deepEqual([svcOnly.nj, svcOnly.nb], [0, 1]);
  const none = nj();
  assert.deepEqual([none.nj, none.nb], [0, 0]);
  const src = css("svg") && script();
  assert.ok(src.includes("m.nj && nb > m.nj"));
});

test("process anchors match services only, not jobs", () => {
  const files = mini('id = "d"\ntitle = "t"\n', {}, ['id = "a"', 'name = "a.example.test"', 'server_type = "web"', 'jobs = ["Nightly import"]', 'services = ["Nightly API"]', ""].join("\n"));
  const { model } = tomlModel(files, "x");
  assert.equal(model.nodes.get("a").body.slice(model.nodes.get("a").jn)[0], "Nightly API");
});

test("hardware strip: set cells in order, free-text fallback, empty when none", () => {
  assert.equal(hardwareStrip({ cpu: "11 cores", ram: "21 GiB", swap: "2 GiB", disk: "50G" }), "11 cpu · 21G ram · 2G swap · 50G sd");
  assert.equal(hardwareStrip({ ram: "8 GiB" }), "8G ram");
  assert.equal(hardwareStrip({ hardware: "2 vCPU" }), "2 vCPU");
  assert.equal(hardwareStrip({}), "");
  assert.throws(() => tomlModel(probe("cpu = 4"), "x"), /expected a quoted string/);
});

test("hardware strip takes its own row in the box height", () => {
  const files = probe('cpu = "4 cores"', 'ram = "8 GiB"', 'systemd_services = ["a"]');
  const { layout, meta } = prepareDiagram(files, "x");
  assert.equal(layout.nodes.a.h, 20 + 16 * (1 + 1 + 1) + 18);
  assert.equal(meta.nodes.a.hw, "4 cpu · 8G ram");
  assert.ok(renderDiagram(files, "x", null, assets).html.includes("4 cpu · 8G ram"));
});

test("long names are cut with an ellipsis and keep the full name as a tooltip", () => {
  assert.equal(shortTitle("short"), "short");
  assert.equal(shortTitle(long).length, TITLE_MAX);
  assert.ok(shortTitle(long).endsWith("…"));
  const { html } = renderDiagram(probe('systemd_services = ["a"]'), "x", null, assets);
  assert.ok(html.includes(`<title>${long}</title>`));
  assert.ok(html.includes(shortTitle(long)));
});

test("box is sized from content: OS row reserved, width covers the name and OS pill, saved size grows", () => {
  const files = probe('systemd_services = ["a", "b"]');
  const { layout, meta } = prepareDiagram(files, "x");
  const g = layout.nodes.a;
  assert.equal(meta.nodes.a.os, 1);
  assert.equal(g.h, 20 + 16 * (2 + 1) + 18);
  assert.equal(g.ip[0][1] - g.y, 22 + 16 * 3);
  assert.ok(g.w >= meta.nodes.a.tl * 6.6 + 28);
  const small = { nodes: { a: { x: 10, y: 10, w: 40, h: 20, title: [20, 4] } } };
  const grown = prepareDiagram(files, "x", small).layout.nodes.a;
  assert.equal(grown.h, g.h);
  assert.ok(grown.w >= 100);
});

test("OS pill is rendered for every server with an os, none without", () => {
  const withOs = renderDiagram(probe(), "x", null, assets).html;
  assert.match(withOs, /class="ost"[^>]*>Debian 12\.3<\/text><text class="ose" y="9">EOL<\/text>/);
  const none = renderDiagram(mini('id = "d"\ntitle = "t"\n'), "x", null, assets).html;
  assert.match(none, /osg unk/);
});

test("header label: first DNS label, IPs and plain names unchanged, collisions keep full names", async () => {
  const { hostLabel, displayLabels } = await import("../render/geometry.mjs");
  assert.equal(hostLabel("web-01.example.test"), "web-01");
  assert.equal(hostLabel("web-01"), "web-01");
  assert.equal(hostLabel("192.0.2.10"), "192.0.2.10");
  assert.equal(hostLabel("2001:db8::1"), "2001:db8::1");
  assert.equal(hostLabel("[2001:db8::1]"), "[2001:db8::1]");
  assert.equal(hostLabel("Service A"), "Service A");
  assert.deepEqual(displayLabels({ a: "web-01.example.test", b: "web-01.other.test", c: "db-01.example.test", d: "db-01" }), { a: "web-01.example.test", b: "web-01.other.test", c: "db-01.example.test", d: "db-01" });
  assert.deepEqual(displayLabels({ a: "web-01.example.test", b: "db-01.example.test" }), { a: "web-01", b: "db-01" });
});

test("header text is centred in the header bar and left padded in chrome skins", () => {
  const kit = geometryKit();
  const g = { x: 100, y: 60, w: 150, h: 50, title: [100, 54] };
  assert.deepEqual(kit.headerTitle(g, "clean"), [110, 50]);
  assert.deepEqual(kit.headerTitle(g, "swiss"), [110, 50]);
  assert.deepEqual(kit.headerTitle(g, "sketch"), [100, 54]);
  const { html } = renderDiagram(probe('systemd_services = ["a"]'), "x", null, assets);
  assert.ok(/class="nt"[^>]*x="\d+(\.\d+)?" y="\d+(\.\d+)?"/.test(html));
});

test("hardware cells feed the details panel strip: four cells in card order, omitted when empty", async () => {
  const { hardwareCells } = await import("../model/server.mjs");
  assert.deepEqual(hardwareCells({ cpu: "11 cores", ram: "21 GiB", swap: "2 GiB", disk: "50G" }), [["cpu", "11"], ["ram", "21G"], ["swap", "2G"], ["sd", "50G"]]);
  assert.deepEqual(hardwareCells({ ram: "8 GiB", hardware: "free text" }), [["ram", "8G"]]);
  assert.deepEqual(hardwareCells({ hardware: "free text" }), []);
  const { html } = renderDiagram(probe('cpu = "4 cores"', 'swap = "2 GiB"', 'systemd_services = ["a"]'), "x", null, assets);
  assert.ok(html.includes('"hwc":[["cpu","4"],["swap","2G"]]'));
  assert.ok(html.includes("function hwStrip"));
});

test("hardware normaliser: cpu number, sizes to <n>G, conversions, unknown formats as stored", async () => {
  const { normCpu, normSize, SIZE_UNIT } = await import("../model/server.mjs");
  assert.equal(SIZE_UNIT, "G");
  for (const v of ["4 cores", "4", "4 cpu", "4cores", "4 vCPU"]) assert.equal(normCpu(v), "4");
  assert.equal(normCpu("2 sockets x 4"), "2 sockets x 4");
  for (const v of ["8 GiB", "8GiB", "8 GB", "8G", "8192 MiB", "8192MB", "8 g"]) assert.equal(normSize(v), "8G");
  assert.equal(normSize("512 MiB"), "0.5G");
  assert.equal(normSize("1.5 TiB"), "1536G");
  assert.equal(normSize("1000 MB"), "1G");
  assert.equal(normSize("2.0G"), "2G");
  for (const v of ["8", "about 8 gigs", "8 bytes"]) assert.equal(normSize(v), v);
  assert.equal(hardwareStrip({ cpu: "4", ram: "weird" }), "4 cpu · weird ram");
});

test("details panel has no Jobs section; card still lists jobs; editor keeps the jobs field", () => {
  const { model, sections } = tomlModel(probe('jobs = ["Nightly import"]', 'dns = ["a.example.test"]'), "x");
  assert.deepEqual(model.nodes.get("a").body, ["Nightly import"]);
  const panel = Object.values(sections).join("\n");
  assert.ok(panel.includes("## DNS"));
  assert.ok(!/## Jobs/.test(panel));
  assert.ok(!panel.includes("Nightly import"));
  assert.ok(SERVER_FIELDS.some((f) => f.key === "jobs" && f.form && f.card));
});

test("service group card flag: card lists only flagged groups' units; panel unchanged; non-boolean rejected", () => {
  const topo = (card) => 'id = "d"\ntitle = "t"\n\n[[service_groups]]\nlabel = "Application services"\npatterns = ["app-*"]\n' + card;
  const srv = 'id = "a"\nserver_type = "web"\nsystemd_services = ["nginx", "app-b", "app-a", "other"]\n';
  const build = (card) => tomlModel(mini(topo(card), {}, srv), "x");
  const on = build("card = true\n");
  assert.deepEqual(on.model.nodes.get("a").body, ["app-b", "app-a"]);
  const off = build("");
  assert.deepEqual(off.model.nodes.get("a").body, ["nginx", "app-b", "app-a", "other"]);
  for (const r of [on, off]) {
    const panel = Object.values(r.sections)[0];
    assert.ok(panel.includes("## Application services\n\n- app-b\n- app-a"));
    assert.ok(!panel.includes("Other services") && !panel.includes("nginx") && !panel.includes("- other"));
  }
  assert.throws(() => build('card = "yes"\n'), /card must be true or false/);
});

test("card pill sizing uses the shortened OS text", () => {
  const ol = (os) => {
    const { model, config } = tomlModel(mini('id = "d"\ntitle = "t"\n', {}, `id = "a"\nserver_type = "web"\nos = "${os}"\n`), "x");
    return geometryMeta(model, {}, {}).nodes.a.ol;
  };
  assert.equal(ol("Debian GNU/Linux 11 (bullseye)"), "Debian 11 bullseye".length);
  assert.equal(ol("Debian 11.11 bullseye"), "Debian 11.11 bullseye".length);
});

test("card hides probe-found cron: jobs but keeps timer: and hand-written ones; the data keeps them all", () => {
  const files = probe('jobs = ["cron: 17 * * * * cmd", "timer: report.timer", "Nightly import", "cron: 25 6 * * * anacron"]', 'services = ["svc"]');
  const { model } = tomlModel(files, "x");
  const n = model.nodes.get("a");
  assert.deepEqual(n.body, ["timer: report.timer", "Nightly import", "svc"]);
  assert.equal(n.jn, 2);
  assert.ok(files.get("servers/a.toml").includes("cron: 17"));
});

test("jobs section and its height vanish when only cron: entries exist", () => {
  const only = probe('jobs = ["cron: 17 * * * * cmd", "cron: 25 6 * * * anacron"]', 'services = ["svc"]');
  const n = tomlModel(only, "x").model.nodes.get("a");
  assert.deepEqual(n.body, ["svc"]);
  assert.equal(n.jn, 0);
  const none = probe('services = ["svc"]');
  assert.equal(prepareDiagram(only, "x").layout.nodes.a.h, prepareDiagram(none, "x").layout.nodes.a.h);
});

test("the +N more cap counts only the shown (non-cron) jobs", () => {
  const jobs = [...Array.from({ length: 10 }, (_, i) => `cron: ${i} * * * * c${i}`), "timer: a.timer", "timer: b.timer", "timer: c.timer", "timer: d.timer", "timer: e.timer"];
  const n = tomlModel(probe(`jobs = ${JSON.stringify(jobs)}`), "x").model.nodes.get("a");
  assert.deepEqual(n.body, ["timer: a.timer", "timer: b.timer", "timer: c.timer", "timer: d.timer", "+1 more"]);
  assert.equal(n.jn, 5);
});
