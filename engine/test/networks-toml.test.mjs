import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseIp, parseCidr, parseNetworksFile, assignNetwork, buildNetworks, derivedCidr, derivedCidrs, withDerived } from "../parse/shared-networks.mjs";
import { tomlModel } from "../parse/toml.mjs";
import { renderDiagram } from "../browser/render.mjs";
import { createStore, handleApi, MAX_BYTES } from "../lib/store.mjs";
import { validName } from "../lib/names.mjs";
import { demo as loadDemo, withFile, without, mini } from "./helpers.mjs";

const demo = loadDemo();
const example = demo.get("networks.toml");
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
  assert.throws(one('[[networks]]\ncidr = "192.0.2.0/24"\nname = ""\n'), /name must be a non-empty string/);
  assert.throws(one('[[networks]]\ncidr = "192.0.2.0/24"\nname = ["x"]\n'), /name must be a non-empty string/);
  assert.equal(one('[[networks]]\ncidr = "192.0.2.0/24"\n')()[0].name, "");
  assert.throws(one('[[networks]]\ncidr = "192.0.2.0/24"\nname = "a"\nzone = "x"\n'), /unknown key zone/);
  assert.throws(one('title = "x"\n[[networks]]\ncidr = "192.0.2.0/24"\nname = "a"\n'), /unknown key title/);
  assert.deepEqual(one("# nothing\n")(), []);
  assert.equal(items.length, 5);
  assert.equal(items[0].description, "Application and database servers");
});

test("networks belong in the folder's networks.toml, not in topology.toml; an empty file is allowed", () => {
  assert.throws(() => tomlModel(withFile(demo, "topology.toml", example + demo.get("topology.toml")), "x"), /topology.toml: unknown key networks/);
  assert.doesNotThrow(() => tomlModel(demo, "x"));
  assert.doesNotThrow(() => renderDiagram(withFile(demo, "networks.toml", "# empty\n"), "demo", null, stub));
});

test("demo servers: multi-homed server in each network, most specific segment, rows ordered with depth", () => {
  const { model } = tomlModel(demo, "demo");
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
  const src = mini('title = "t"\n', { "networks.toml": '[[networks]]\ncidr = "192.0.2.0/24"\nname = "Lab"\n' }, 'id = "a"\nserver_type = "web"\nname = "a.test"\nips = ["192.0.2.5/24", "10.1.1.1/32"]\n');
  const out = renderDiagram(src, "t", null, stub);
  assert.match(out.html, /<aside id="wp"/);
  assert.match(out.html, /Unassigned network/);
  assert.ok(out.html.includes("192.0.2.5/24 — Lab"));
  assert.ok(out.html.includes("10.1.1.1/32 — unassigned network"));
  assert.equal(JSON.parse(out.html.match(/id="layout-data">(.*?)<\/script>/s)[1]).nets.length, 2);
});

test("without a networks file and without prefixed IPs nothing changes: no panel, plain IP lines", () => {
  const out = renderDiagram(mini('title = "t"\n', {}, 'id = "a"\nserver_type = "web"\nname = "a.test"\nips = ["192.0.2.5/32", "198.51.100.7/32"]\n'), "t", null, stub);
  assert.ok(!out.html.includes('id="wp"'));
  assert.ok(!out.html.includes("unassigned network"));
});

test("store and API: networks.toml is stored in the diagram folder, read back, validated by name and size", () => {
  const dir = mkdtempSync(join(tmpdir(), "nets-"));
  const store = createStore(dir), headers = { host: "127.0.0.1:8080", "content-type": "application/json" };
  assert.equal(handleApi(store, { method: "GET", url: "/api/file?name=demo%2Fnetworks.toml", headers }).status, 404);
  const put = handleApi(store, { method: "PUT", url: "/api/files", headers }, JSON.stringify({ files: [{ name: "demo/networks.toml", text: example, overwrite: true }] }));
  assert.equal(put.status, 200);
  assert.equal(handleApi(store, { method: "GET", url: "/api/file?name=demo%2Fnetworks.toml", headers }).body.text, example);
  assert.ok(handleApi(store, { method: "GET", url: "/api/files", headers }).body.files.some((f) => f.name === "demo/networks.toml"));
  assert.equal(validName("demo/networks.toml"), true);
  const big = handleApi(store, { method: "PUT", url: "/api/files", headers }, JSON.stringify({ files: [{ name: "demo/networks.toml", text: "#".repeat(MAX_BYTES + 1), overwrite: true }] }));
  assert.equal(big.status, 413);
  assert.equal(handleApi(store, { method: "GET", url: "/api/file?name=demo%2F..%2Fnetworks.toml", headers }).status, 400);
});

test("derived CIDRs: masked host bits, /32, no prefix and IPv6 skipped, duplicates collapse, address order", () => {
  assert.equal(derivedCidr("192.0.2.10/24"), "192.0.2.0/24");
  assert.equal(derivedCidr("192.0.2.77/29"), "192.0.2.72/29");
  for (const t of ["192.0.2.10/32", "192.0.2.10", "2001:db8::1/64", "nope/24", "192.0.2.10/0"]) assert.equal(derivedCidr(t), null, t);
  assert.deepEqual(derivedCidrs(["203.0.113.5/24", "192.0.2.10/24", "192.0.2.99/24", "192.0.2.5/32", "192.0.2.40/29"]), ["192.0.2.0/24", "192.0.2.40/29", "203.0.113.0/24"]);
});

test("derived networks merge with defined ones: defined name wins, own prefix network beats other servers' derived ones, defined narrower wins", () => {
  const defined = parseNetworksFile('[[networks]]\ncidr = "192.0.2.0/24"\nname = "Lab"\n[[networks]]\ncidr = "198.51.100.8/29"\nname = "Narrow"\n');
  const all = withDerived(defined, ["192.0.2.10/24", "192.0.2.8/29", "198.51.100.9/24", "203.0.113.1/24"]);
  assert.deepEqual(all.map((n) => [n.cidr, n.name, !!n.derived]), [["192.0.2.0/24", "Lab", false], ["198.51.100.8/29", "Narrow", false], ["192.0.2.8/29", "", true], ["198.51.100.0/24", "", true], ["203.0.113.0/24", "", true]]);
  const at = (ip) => all[assignNetwork(all, ip)].cidr;
  assert.equal(at("192.0.2.10/24"), "192.0.2.0/24");
  assert.equal(at("192.0.2.9/29"), "192.0.2.8/29");
  assert.equal(at("198.51.100.9/24"), "198.51.100.8/29");
  assert.equal(at("198.51.100.200/24"), "198.51.100.0/24");
});

test("derived networks reach the panel and the details without a networks file; unnamed rows use the CIDR", () => {
  const src = mini('title = "t"\n', {}, 'id = "a"\nserver_type = "web"\nname = "a.test"\nips = ["192.0.2.5/24", "10.1.1.1/32"]\n');
  const out = renderDiagram(src, "t", null, stub);
  assert.match(out.html, /<aside id="wp"/);
  assert.ok(out.html.includes("192.0.2.5/24 — 192.0.2.0/24"));
  assert.ok(out.html.includes("10.1.1.1/32 — unassigned network"));
});

test("append: creates the file, appends only missing CIDRs in address order, keeps existing bytes and CRLF", async () => {
  const { appendNetworks } = await import("../parse/networks-append.mjs");
  const ips = ["203.0.113.5/24", "192.0.2.10/24", "192.0.2.20/24", "192.0.2.5/32", "2001:db8::1/64"];
  const created = appendNetworks(null, ips);
  assert.deepEqual(created.added, ["192.0.2.0/24", "203.0.113.0/24"]);
  assert.equal(created.text, '[[networks]]\ncidr = "192.0.2.0/24"\n\n[[networks]]\ncidr = "203.0.113.0/24"\n');
  assert.deepEqual(parseNetworksFile(created.text).map((n) => n.name), ["", ""]);
  const old = '# keep me\n[[networks]]\ncidr = "192.0.2.0/24"\nname = "Lab"   # note\n';
  const next = appendNetworks(old, ips);
  assert.deepEqual(next.added, ["203.0.113.0/24"]);
  assert.ok(next.text.startsWith(old));
  assert.equal(next.text.slice(old.length), '\n[[networks]]\ncidr = "203.0.113.0/24"\n');
  const noEol = appendNetworks('[[networks]]\ncidr = "198.51.100.0/24"', ["192.0.2.1/24"]);
  assert.equal(noEol.text, '[[networks]]\ncidr = "198.51.100.0/24"\n\n[[networks]]\ncidr = "192.0.2.0/24"\n');
  const crlf = appendNetworks('[[networks]]\r\ncidr = "198.51.100.0/24"\r\n', ["192.0.2.1/24"]);
  assert.equal(crlf.text, '[[networks]]\r\ncidr = "198.51.100.0/24"\r\n\r\n[[networks]]\r\ncidr = "192.0.2.0/24"\r\n');
  const none = appendNetworks(old, ["192.0.2.9/24"]);
  assert.deepEqual(none.added, []);
  assert.equal(none.text, old);
  assert.equal(appendNetworks("# empty\n", ["192.0.2.9/24"]).text, '# empty\n\n[[networks]]\ncidr = "192.0.2.0/24"\n');
  assert.throws(() => appendNetworks('[[networks]]\ncidr = "bad"\n', ips), /networks.toml/);
});

test("store: appended networks.toml is written with a base check; a stale base answers 409", () => {
  const dir = mkdtempSync(join(tmpdir(), "nets-"));
  const store = createStore(dir), headers = { host: "127.0.0.1:8080", "content-type": "application/json" };
  const put = (files) => handleApi(store, { method: "PUT", url: "/api/files", headers }, JSON.stringify({ files }));
  assert.equal(put([{ name: "demo/networks.toml", text: '[[networks]]\ncidr = "192.0.2.0/24"\n', base: null }]).status, 200);
  assert.equal(put([{ name: "demo/networks.toml", text: "x", base: null }]).status, 409);
  assert.equal(put([{ name: "demo/networks.toml", text: '[[networks]]\ncidr = "192.0.2.0/24"\n\n[[networks]]\ncidr = "203.0.113.0/24"\n', base: '[[networks]]\ncidr = "192.0.2.0/24"\n' }]).status, 200);
});
