import test from "node:test";
import assert from "node:assert/strict";
import { osFamily } from "../parse/os-display.mjs";
import { osInfo } from "../parse/os-eol.mjs";
import { osIcons, osIconKit } from "../render/os-icons.mjs";
import { geometryMeta, geometryKit } from "../render/geometry.mjs";
import { tomlModel } from "../parse/toml.mjs";
import { renderDiagram } from "../browser/render.mjs";
import { css, script } from "../page/assets.mjs";
import { mini } from "./helpers.mjs";
import { loadUi, fixture } from "./cov-ui-env.mjs";

const assets = { cssSvg: css("svg"), cssPage: css("page"), js: script() };

test("osFamily maps stored and displayed OS strings to a family id", () => {
  const table = [
    ["Debian GNU/Linux 11 (bullseye)", "debian"], ["Debian 11.11 bullseye", "debian"], ["Ubuntu 16.04 LTS Xenial", "ubuntu"],
    ["Red Hat Enterprise Linux 8.6 (Ootpa)", "rhel"], ["RHEL 8.6 Ootpa", "rhel"], ["CentOS Linux 7 (Core)", "centos"], ["CentOS Stream 9", "centos"],
    ["Rocky Linux 9.4", "rocky"], ["AlmaLinux 9.2", "alma"], ["Oracle Linux Server 8.8", "oracle"],
    ["SUSE Linux Enterprise Server 15", "suse"], ["openSUSE Leap 15.5", "suse"], ["Fedora Linux 39", "fedora"],
    ["Amazon Linux 2023", "amazon"], ["Alpine Linux 3.19.1", "alpine"], ["Microsoft Windows Server 2019", "windows"], ["Windows Server 2016", "windows"],
    ["macOS 14.2", "macos"], ["Mac OS X 10.15", "macos"], ["Arch Linux", "linux"], ["Linux Mint 21", "linux"], ["Foo GNU/Linux", "linux"],
    ["FreeBSD 13", "unknown"], ["Foo OS rolling", "unknown"], ["", "unknown"], [null, "unknown"], [undefined, "unknown"], [42, "unknown"],
  ];
  for (const [s, f] of table) assert.equal(osFamily(s), f, String(s));
  assert.equal(osInfo("Rocky Linux 9.4").f, "rocky");
});

test("every family has a glyph and unknown ids fall back to the unknown glyph", () => {
  const fams = ["debian", "ubuntu", "rhel", "centos", "rocky", "alma", "oracle", "suse", "fedora", "amazon", "alpine", "windows", "macos", "linux", "unknown"];
  assert.deepEqual(Object.keys(osIcons.ICONS).sort(), [...fams].sort());
  for (const f of fams) {
    assert.match(osIcons.glyph(f), /<path class="osi[sf]" d="M/, f);
    assert.match(osIcons.iconSvg(f, 14), new RegExp(`class="osi" data-f="${f}" viewBox="0 0 14 14" width="14"`), f);
  }
  assert.equal(osIcons.glyph("nope"), osIcons.glyph("unknown"));
  assert.match(osIcons.iconSvg("nope", 12), /data-f="unknown"/);
  assert.deepEqual(Object.keys(osIconKit()), ["ICONS", "glyph", "iconSvg"]);
});

const page = (os) => renderDiagram(mini('id = "d"\ntitle = "t"\n', {}, `id = "a"\nserver_type = "web"\nos = "${os}"\nips = ["192.0.2.5/24"]\n`), "x", null, assets).html;
const pill = (html) => /<g class="osg[\s\S]*?<\/title><\/g>/.exec(html)[0];

test("card pill is neutral, carries the family icon, and has a separate bold EOL text for an EOL OS", () => {
  const eol = pill(page("CentOS Linux 7 (Core)"));
  assert.match(eol, /^<g class="osg eol"/);
  assert.match(eol, /<g class="osi" data-f="centos"/);
  assert.match(eol, /<text class="ose" y="9">EOL<\/text>/);
  assert.ok(!eol.includes("<tspan"));
  assert.match(eol, /<title>CentOS Linux 7 \(Core\) - End of life \(support ended 2024-06\)<\/title>/);
  const ok = pill(page("Ubuntu 24.04 LTS"));
  assert.match(ok, /^<g class="osg"/);
  assert.match(ok, /data-f="ubuntu"/);
  assert.ok(!ok.includes('class="ose"'));
  assert.match(ok, /<title>Ubuntu 24\.04 LTS<\/title>/);
  assert.match(pill(mini('id = "d"\ntitle = "t"\n') && renderDiagram(mini('id = "d"\ntitle = "t"\n'), "x", null, assets).html), /osg unk[\s\S]*data-f="unknown"[\s\S]*OS \?/);
});

test("css: pill uses the IP pill family in each skin; EOL text is bold in the EOL colour with no box of its own", () => {
  const c = css("svg");
  assert.match(c, /\.ose\{fill:var\(--eol\);[^}]*font-weight:700\}/);
  assert.ok(!/\.osg\.eol \.osp/.test(c));
  assert.match(c, /svg\.s-clean \.osp\{fill:var\(--ipf\);stroke:none\}/);
  assert.match(c, /svg\.s-dark \.osp\{fill:var\(--ipf\);stroke:var\(--ipln\)/);
  assert.match(c, /svg\.s-swiss \.osp\{fill:none;stroke:var\(--ipln\)/);
  assert.match(c, /svg:not\(\.showsys\) \.osg/);
});

test("meta oe flags an EOL OS and the box grows for pill plus EOL marker", () => {
  const meta = (os) => geometryMeta(tomlModel(mini('id = "d"\ntitle = "t"\n', {}, `id = "a"\nserver_type = "web"\nos = "${os}"\n`), "x").model, {}, {}).nodes.a;
  const a = meta("CentOS Linux 7 (Core)"), b = meta("Ubuntu 24.04 LTS");
  assert.equal(a.oe, 1);
  assert.equal(b.oe, 0);
  const kit = geometryKit(), fit = (t) => { const g = { x: 0, y: 0, w: 10, ip: [], body: [] }; kit.fitBox(g, { tl: 1, bl: 0, il: 0, hw: "", ...t }); return g.w; };
  assert.ok(fit({ os: 1, ol: 20, oe: 1 }) > fit({ os: 1, ol: 20, oe: 0 }));
  assert.ok(fit({ os: 1, ol: 20, oe: 0 }) > fit({ os: 0, ol: 0, oe: 0 }));
});

const ENT_OS = { v: "CentOS Linux 7 (Core)", d: "CentOS 7", f: "centos", eol: "2024-06" };

test("runtime: EOL marker sits after the pill, long text is ellipsised before the marker is clipped", () => {
  const t = loadUi(["ui/skins"], fixture());
  const g = t.doc.getElementById("oa");
  g.insertAdjacentHTML("beforeend", '<text class="ose" y="9">EOL</text>');
  const core = t.modules["ui/core"];
  core.ctx.ready = true;
  core.hooks.getState = () => ({ nodes: { a: { x: 10, y: 20, w: 120, h: 80, ip: [[20, 90]], body: [[20, 50]], title: [20, 36] }, b: { x: 200, y: 20, w: 120, h: 60, ip: [[210, 70]], body: [], title: [210, 36] } }, clusters: { r1: { x: 5, y: 6 } } });
  core.D.layout.nodes.a.w = 200;
  t.modules["ui/skins"].setStyle("clean");
  const rect = g.querySelector("rect"), eol = g.querySelector(".ose");
  assert.equal(Number(eol.getAttribute("x")), Number(rect.getAttribute("width")) + 4);
  core.D.layout.nodes.a.w = 80;
  g.querySelector(".ost").setAttribute("data-t", "A very long operating system name 12.34");
  t.modules["ui/skins"].setStyle("dark");
  const text = g.querySelector(".ost").textContent;
  assert.ok(text.endsWith("…"));
  assert.ok(Number(eol.getAttribute("x")) + 16 <= 80, "marker stays inside the box");
});

test("details panel OS row has the family icon before the text", () => {
  const f = fixture();
  f.D.ent["n:a"].os = ENT_OS;
  const t = loadUi(["ui/details"], f);
  t.modules["ui/details"].renderPanel("n:a");
  const html = t.doc.getElementById("pn").innerHTML;
  assert.match(html, /<td><svg class="osi" data-f="centos"[^>]*>[\s\S]*<\/svg>CentOS 7/);
});
