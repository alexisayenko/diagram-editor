import test from "node:test";
import assert from "node:assert/strict";
import { ipv4Number, ipv4Text, ipv4CidrProblem, parseIp, parseCidr, contains, derivedCidr, derivedCidrs, cmpBig } from "../lib/net.mjs";

test("ipv4Number and ipv4Text round-trip", () => {
  assert.equal(ipv4Number("192.0.2.1"), 3221225985);
  assert.equal(ipv4Text(3221225985), "192.0.2.1");
  for (const bad of ["256.0.0.1", "1.2.3", "a.b.c.d", "1.2.3.4.5", ""]) assert.equal(ipv4Number(bad), null, bad);
});

test("ipv4CidrProblem checks the shape only", () => {
  assert.equal(ipv4CidrProblem("192.0.2.10/24"), null);
  assert.match(ipv4CidrProblem("192.0.2.10"), /invalid IPv4 CIDR/);
  assert.match(ipv4CidrProblem("192.0.2.10/33"), /invalid IPv4 CIDR/);
  assert.match(ipv4CidrProblem("300.0.2.10/24"), /invalid IPv4 CIDR/);
});

test("contains respects family and range", () => {
  const net = parseCidr("192.0.2.0/24");
  assert.ok(contains(net, parseIp("192.0.2.200")));
  assert.ok(!contains(net, parseIp("198.51.100.1")));
  assert.ok(!contains(net, parseIp("::1")));
});

test("derived networks and ordering", () => {
  assert.equal(derivedCidr("192.0.2.77/29"), "192.0.2.72/29");
  assert.deepEqual(derivedCidrs(["203.0.113.5/24", "192.0.2.10/24"]), ["192.0.2.0/24", "203.0.113.0/24"]);
  assert.deepEqual([2n, 1n, 3n].sort(cmpBig), [1n, 2n, 3n]);
});
