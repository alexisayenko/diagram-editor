import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseIp, parseCidr, parseNetworksFile, isNetworksFile, assignNetwork, buildNetworks } from "../parse/shared-networks.mjs";
import { tomlModel } from "../parse/toml.mjs";
import { renderDiagram } from "../browser/render.mjs";
import { createStore, handleApi, MAX_BYTES } from "../lib/store.mjs";
import { validName } from "../lib/names.mjs";

const demo = readFileSync(new URL("../../examples/demo/demo.toml", import.meta.url), "utf8");
const example = readFileSync(new URL("../../examples/networks.toml", import.meta.url), "utf8");
const items = parseNetworksFile(example);
const stub = { cssSvg: "", cssPage: "", js: "" };

test("CIDR parsing: IPv4 and IPv6, edge prefixes, errors", () => {
  assert.equal(parseIp("192.0.2.1").v, 4);
  assert.equal(parseIp("256.0.0.1"), null);
  assert.equal(parseIp("2001:db8::1").v, 6);
  assert.equal(parseIp("::").n, 0n);
  assert.equal(parseIp("1:2:3:4:5:6:7:8").v, 6);
  for (const bad of ["1:2:3", ":::", "2001:db8::1::2", "g::1", "1:2:3:4:5:6:7:8:9", "", "192.0.2"]) assert.equal(parseIp(bad), null, bad);
  const all = parseCidr("0.0.0.0/0");
  assert.equal(all.hi, 2n ** 32n - 1n);
  assert.equal(parseCidr("192.0.2.7/32").lo, parseCidr("192.0.2.7/32").hi);
  assert.equal(parseCidr("::/0").hi, 2n ** 128n - 1n);
  assert.equal(parseCidr("2001:db8::1/128").lo, parseCidr("2001:db8::1/128").hi);
  assert.match(parseCidr("192.0.2.0/33").error, /prefix is at most 32/);
  assert.match(parseCidr("2001:db8::/129").error, /prefix is at most 128/);
  assert.match(parseCidr("192.0.2.5/24").error, /host bits/);
  assert.match(parseCidr("nope/24").error, /invalid CIDR/);
  assert.match(parseCidr("192.0.2.0").error, /invalid CIDR/);
});

test("longest prefix wins, IPv4 and IPv6 do not mix, host prefix is ignored", () => {
  const n = parseNetworksFile('[[networks]]\ncidr = "192.0.2.0/24"\nname = "wide"\n[[networks]]\ncidr = "192.0.2.40/29"\nname = "narrow"\n[[networks]]\ncidr = "::/0"\nname = "all6"\n[[networks]]\ncidr = "0.0.0.0/0"\nname = "all4"\n');
  const name = (ip) => n[assignNetwork(n, ip)]?.name;
  assert.equal(name("192.0.2.41/24"), "narrow");
  assert.equal(name("192.0.2.39/24"), "wide");
  assert.equal(name("192.0.2.47"), "narrow");
  assert.equal(name("192.0.2.48"), "wide");
  assert.equal(name("203.0.113.1/24"), "all4");
  assert.equal(name("2001:db8::5"), "all6");
  assert.equal(assignNetwork(items, "10.9.9.9/8"), -1);
  assert.equal(assignNetwork(items, "not an ip"), -1);
});

test("file validation names the entry", () => {
  const one = (body) => () => parseNetworksFile(body);
  assert.throws(one('[[networks]]\ncidr = "192.0.2.0/24"\nname = "a"\n[[networks]]\ncidr = "192.0.2.0/24"\nname = "b"\n'), /networks\[2\] \(192\.0\.2\.0\/24\): duplicate cidr, already networks\[1\]/);
  assert.throws(one('[[networks]]\ncidr = "192.0.2.1/24"\nname = "a"\n'), /networks\[1\] \(192\.0\.2\.1\/24\): '192\.0\.2\.1\/24' has host bits set/);
  assert.throws(one('[[networks]]\ncidr = "999.0.0.0/8"\nname = "a"\n'), /networks\[1\] \(999\.0\.0\.0\/8\): invalid CIDR/);
  assert.throws(one('[[networks]]\ncidr = "192.0.2.0/24"\n'), /name must be a non-empty string/);
  assert.throws(one('[[networks]]\ncidr = "192.0.2.0/24"\nname = "a"\nzone = "x"\n'), /unknown key zone/);
  assert.throws(one('title = "x"\n[[networks]]\ncidr = "192.0.2.0/24"\nname = "a"\n'), /unknown key title/);
  assert.throws(one("# nothing\n"), /no \[\[networks\]\] entries/);
  assert.equal(items.length, 5);
  assert.equal(items[0].description, "Application and database servers");
});

test("import detection: by file name or by [[networks]] without servers or regions", () => {
  assert.equal(isNetworksFile("networks.toml", ""), true);
  assert.equal(isNetworksFile("lan.toml", example), true);
  assert.equal(isNetworksFile("demo.toml", demo), false);
  assert.equal(isNetworksFile("mixed.toml", example + '\n[[servers]]\nid = "a"\n'), false);
  assert.equal(isNetworksFile("mixed.toml", example + '\n[[regions]]\nid = "a"\n'), false);
  assert.throws(() => tomlModel(example, "x.toml"), /unknown key networks/);
});

test("demo servers: multi-homed server in each network, most specific segment, rows ordered with depth", () => {
  const { model } = tomlModel(demo, "demo.toml");
  const layout = { nodes: {} };
  const { nets, ipNet } = buildNetworks(items, model, layout);
  assert.deepEqual(nets.map((n) => [n.cidr, n.depth, n.hosts]), [["192.0.2.0/24", 0, 4], ["192.0.2.40/29", 1, 2], ["198.51.100.128/25", 0, 1], ["203.0.113.0/24", 0, 1], ["2001:db8::/32", 0, 0]]);
  const web = nets.find((n) => n.cidr === "203.0.113.0/24").m, lan = nets[0].m;
  assert.ok(web.includes("n:web01") && lan.includes("n:web01"));
  assert.ok(nets[1].m.includes("n:db01") && !lan.includes("n:db01"));
  assert.equal(ipNet["192.0.2.41"], 1);
  assert.equal(ipNet["203.0.113.10"], 3);
});

test("unassigned IPs get an Unassigned network row and a labelled line in the details", () => {
  const src = 'title = "t"\n[[servers]]\nid = "a"\nserver_type = "web"\nname = "a.test"\nips = ["192.0.2.5/24", "10.1.1.1/8"]\n';
  const one = parseNetworksFile('[[networks]]\ncidr = "192.0.2.0/24"\nname = "Lab"\n');
  const out = renderDiagram(src, "t.toml", null, stub, [], one);
  assert.match(out.html, /<aside id="wp"/);
  assert.match(out.html, /Unassigned network/);
  assert.ok(out.html.includes("192.0.2.5/24 — Lab"));
  assert.ok(out.html.includes("10.1.1.1/8 — unassigned network"));
  assert.equal(JSON.parse(out.html.match(/id="layout-data">(.*?)<\/script>/s)[1]).nets.length, 2);
});

test("without a networks file nothing changes: no panel, plain IP lines", () => {
  const out = renderDiagram(demo, "demo.toml", null, stub);
  assert.ok(!out.html.includes('id="wp"'));
  assert.ok(!out.html.includes("unassigned network"));
});

test("store and API: networks.toml is stored, read back, validated by name and size", () => {
  const dir = mkdtempSync(join(tmpdir(), "nets-"));
  const store = createStore(dir), headers = { host: "127.0.0.1:8080", "content-type": "application/json" };
  assert.equal(handleApi(store, { method: "GET", url: "/api/file?name=networks.toml", headers }).status, 404);
  const put = handleApi(store, { method: "PUT", url: "/api/files", headers }, JSON.stringify({ files: [{ name: "networks.toml", text: example, overwrite: true }] }));
  assert.equal(put.status, 200);
  assert.equal(handleApi(store, { method: "GET", url: "/api/file?name=networks.toml", headers }).body.text, example);
  assert.ok(handleApi(store, { method: "GET", url: "/api/files", headers }).body.files.some((f) => f.name === "networks.toml"));
  assert.equal(validName("networks.toml"), true);
  const big = handleApi(store, { method: "PUT", url: "/api/files", headers }, JSON.stringify({ files: [{ name: "networks.toml", text: "#".repeat(MAX_BYTES + 1), overwrite: true }] }));
  assert.equal(big.status, 413);
  assert.equal(handleApi(store, { method: "GET", url: "/api/file?name=..%2Fnetworks.toml", headers }).status, 400);
});
