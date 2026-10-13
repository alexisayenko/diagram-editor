import test from "node:test";
import assert from "node:assert/strict";
import { tomlModel, serviceLines, hardwareStrip } from "../parse/toml.mjs";
import { shortTitle, TITLE_MAX } from "../render/geometry.mjs";
import { prepareDiagram, renderDiagram } from "../browser/render.mjs";
import { css, script } from "../page/assets.mjs";
import { mini } from "./helpers.mjs";

const assets = { cssSvg: css("svg"), cssPage: css("page"), js: script() };
const long = "very-long-server-name-" + "x".repeat(60) + ".example.test";
const probe = (...lines) => mini('id = "d"\ntitle = "t"\n', {}, ['id = "a"', `name = "${long}"`, 'server_type = "web"', 'os = "Debian 12.3"', 'ips = ["192.0.2.5/24"]', ...lines, ""].join("\n"));

test("body lines: services, then jobs, RMI and systemd lines, each of the last three capped with +N more", () => {
  assert.deepEqual(serviceLines(["x"], ["j"], ["r"], ["u"]), ["x", "j", "r", "u"]);
  assert.deepEqual(serviceLines([], [], [], ["a", "b", "c", "d", "e", "f"]), ["a", "b", "c", "d", "+2 more"]);
  const { model } = tomlModel(probe('jobs = ["j1"]', 'systemd_services = ["a", "b"]'), "x");
  assert.deepEqual(model.nodes.get("a").body, ["j1", "a", "b"]);
  assert.equal(model.nodes.get("a").os, "Debian 12.3");
});

test("hardware strip: set cells in order, free-text fallback, empty when none", () => {
  assert.equal(hardwareStrip({ cpu: "11 cores", ram: "21 GiB", swap: "2 GiB", disk: "50G" }), "cpu: 11 cores │ ram: 21 GiB │ swap: 2 GiB │ sd: 50G");
  assert.equal(hardwareStrip({ ram: "8 GiB" }), "ram: 8 GiB");
  assert.equal(hardwareStrip({ hardware: "2 vCPU" }), "2 vCPU");
  assert.equal(hardwareStrip({}), "");
  assert.throws(() => tomlModel(probe("cpu = 4"), "x"), /expected a quoted string/);
});

test("hardware strip takes its own row in the box height", () => {
  const files = probe('cpu = "4 cores"', 'ram = "8 GiB"', 'systemd_services = ["a"]');
  const { layout, meta } = prepareDiagram(files, "x");
  assert.equal(layout.nodes.a.h, 20 + 16 * (1 + 1 + 1) + 18);
  assert.equal(meta.nodes.a.hw, "cpu: 4 cores │ ram: 8 GiB");
  assert.ok(renderDiagram(files, "x", null, assets).html.includes("cpu: 4 cores"));
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
  assert.match(withOs, /class="ost"[^>]*>Debian 12\.3 <tspan class="ose">EOL<\/tspan>/);
  const none = renderDiagram(mini('id = "d"\ntitle = "t"\n'), "x", null, assets).html;
  assert.match(none, /osg unk/);
});
