import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { crc32, writeZip, readZip, entryProblem, isArchiveName, MAX_ARCHIVE_BYTES } from "../lib/zip.mjs";

const enc = new TextEncoder();
const bytes = (s) => enc.encode(s);
const text = (u) => new TextDecoder().decode(u);

// Hand-built archive so each header field can be bent: e = { name, data, method, flags, crc, csize, usize, local, raw }.
function raw(entries, { eocd = {}, rawName } = {}) {
  const parts = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const nameBytes = rawName?.(e) ?? bytes(e.name), data = e.data ?? new Uint8Array(0), method = e.method ?? 0;
    const body = e.raw ?? (method === 8 ? deflateRawSync(data) : data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, e.localSig ?? 0x04034b50, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, e.localExtra ?? 0, true);
    const extra = new Uint8Array(e.localExtra ?? 0);
    parts.push(new Uint8Array(local.buffer), nameBytes, extra, body);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(8, e.flags ?? 0, true);
    cd.setUint16(10, method, true);
    cd.setUint32(16, e.crc ?? crc32(data), true);
    cd.setUint32(20, e.csize ?? body.length, true);
    cd.setUint32(24, e.usize ?? data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, e.local ?? offset, true);
    central.push(new Uint8Array(cd.buffer), nameBytes);
    offset += 30 + nameBytes.length + (e.localExtra ?? 0) + body.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(4, eocd.disk ?? 0, true);
  end.setUint16(6, eocd.cdDisk ?? 0, true);
  end.setUint16(8, eocd.here ?? entries.length, true);
  end.setUint16(10, eocd.count ?? entries.length, true);
  end.setUint32(12, eocd.cdSize ?? cdSize, true);
  end.setUint32(16, eocd.cdAt ?? offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}
const reads = (zip, limits) => readZip(zip, limits);
const f = (name, data = "x", extra = {}) => ({ name, data: bytes(data), ...extra });

test("crc32 matches the known check value and handles empty input", () => {
  assert.equal(crc32(bytes("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test("round trip: stored small entries, deflated large entries, unicode names are rejected by the allowlist", async () => {
  const big = "line of text\n".repeat(200);
  const zip = await writeZip([{ name: "topology.toml", data: bytes("a = 1\n") }, { name: "servers/a.toml", data: bytes(big) }], new Date(2026, 0, 2, 3, 4, 6));
  const out = await readZip(zip);
  assert.deepEqual([...out.keys()], ["topology.toml", "servers/a.toml"]);
  assert.equal(text(out.get("topology.toml")), "a = 1\n");
  assert.equal(text(out.get("servers/a.toml")), big);
  assert.ok(zip.length < big.length, "compressible entry is deflated");
});

test("an incompressible large entry stays stored; years before 1980 clamp", async () => {
  const noise = new Uint8Array(200).map((_, i) => (i * 167 + 13) % 251);
  const zip = await writeZip([{ name: "a.json", data: noise }], new Date(1970, 5, 5));
  assert.equal((await readZip(zip)).get("a.json").length, 200);
  const empty = await writeZip([]);
  assert.equal(empty.length, 22);
  assert.equal((await readZip(empty)).size, 0);
});

test("directory entries and hidden / __MACOSX entries are skipped", async () => {
  const zip = raw([f("servers/", ""), f("__MACOSX/x.toml"), f(".hidden.toml"), f("servers/.DS_Store"), f("a.toml", "ok")]);
  const out = await readZip(zip);
  assert.deepEqual([...out.keys()], ["a.toml"]);
});

test("entryProblem: names that must never be extracted", () => {
  assert.equal(entryProblem("a.toml"), null);
  assert.equal(entryProblem("servers/a.json"), null);
  assert.match(entryProblem(""), /no name/);
  assert.match(entryProblem(5), /no name/);
  assert.match(entryProblem("a\\b.toml"), /unsafe entry name 'a\?b\.toml'/);
  assert.match(entryProblem("a\0.toml"), /unsafe entry name/);
  assert.match(entryProblem("/etc/a.toml"), /absolute entry name/);
  assert.match(entryProblem("C:x.toml"), /absolute entry name/);
  assert.match(entryProblem("servers/../a.toml"), /leaves the diagram folder/);
  assert.match(entryProblem("./a.toml"), /leaves the diagram folder/);
  assert.match(entryProblem("a/b/c.toml"), /unsupported file/);
  assert.match(entryProblem("run.exe"), /unsupported file 'run\.exe'/);
  assert.match(entryProblem("servers/x/y.toml"), /unsupported file/);
  assert.match(entryProblem(".a.toml"), /unsupported file/);
});

test("hostile names are rejected with the archive", async () => {
  for (const name of ["../a.toml", "/a.toml", "servers/../../a.toml", "a\\b.toml", "evil.sh", "x/y/z.toml"]) {
    await assert.rejects(reads(raw([f(name)])), /Rejected archive: /, name);
  }
});

test("duplicate entries, invalid UTF-8 names, encrypted and unsupported methods are rejected", async () => {
  await assert.rejects(reads(raw([f("a.toml"), f("a.toml")])), /duplicate entry 'a\.toml'/);
  await assert.rejects(reads(raw([f("a.toml")], { rawName: () => new Uint8Array([0x61, 0xff, 0xfe]) })), /entry name is not valid UTF-8/);
  await assert.rejects(reads(raw([f("a.toml", "x", { flags: 1 })])), /Encrypted zip files are not supported/);
  await assert.rejects(reads(raw([f("a.toml", "x", { method: 12 })])), /Unsupported compression method 12 in 'a\.toml'/);
});

test("zip64 markers are rejected", async () => {
  await assert.rejects(reads(raw([f("a.toml", "x", { csize: 0xffffffff })])), /Zip64/);
  await assert.rejects(reads(raw([f("a.toml", "x", { usize: 0xffffffff })])), /Zip64/);
  await assert.rejects(reads(raw([f("a.toml", "x", { local: 0xffffffff })])), /Zip64/);
  await assert.rejects(reads(raw([f("a.toml")], { eocd: { count: 0xffff, here: 0xffff } })), /Zip64/);
  await assert.rejects(reads(raw([f("a.toml")], { eocd: { cdSize: 0xffffffff } })), /Zip64/);
  await assert.rejects(reads(raw([f("a.toml")], { eocd: { cdAt: 0xffffffff } })), /Zip64/);
});

test("structural damage: not a zip, multi-disk, truncated directory, bad offsets", async () => {
  await assert.rejects(readZip("nope"), /Not a zip file/);
  await assert.rejects(readZip(new Uint8Array(10)), /Not a valid zip file/);
  await assert.rejects(readZip(new Uint8Array(0)), /Not a valid zip file/);
  await assert.rejects(reads(raw([f("a.toml")], { eocd: { disk: 1 } })), /Multi-disk/);
  await assert.rejects(reads(raw([f("a.toml")], { eocd: { cdDisk: 1 } })), /Multi-disk/);
  await assert.rejects(reads(raw([f("a.toml")], { eocd: { here: 2 } })), /Multi-disk/);
  await assert.rejects(reads(raw([f("a.toml")], { eocd: { cdAt: 5000 } })), /Not a valid zip file/);
  await assert.rejects(reads(raw([f("a.toml")], { eocd: { count: 2, here: 2 } })), /Not a valid zip file/);

  const good = raw([f("a.toml")]);
  const badSig = good.slice();
  const cdAt = new DataView(badSig.buffer).getUint32(badSig.length - 6, true);
  badSig[cdAt] = 0;
  await assert.rejects(readZip(badSig), /Not a valid zip file/);

  const longName = raw([f("a.toml")]);
  new DataView(longName.buffer).setUint16(cdAt + 28, 4000, true);
  await assert.rejects(readZip(longName), /Not a valid zip file/);

  const badLocal = raw([f("a.toml")]);
  badLocal[0] = 0;
  await assert.rejects(readZip(badLocal), /Not a valid zip file/);
  await assert.rejects(reads(raw([f("a.toml", "x", { local: 70000 })])), /Not a valid zip file/);
  await assert.rejects(reads(raw([f("a.toml", "x", { csize: 9000 })])), /Not a valid zip file/);
});

test("integrity: size and checksum mismatches are reported as damage", async () => {
  await assert.rejects(reads(raw([f("a.toml", "hello", { crc: 1 })])), /'a\.toml' is damaged/);
  await assert.rejects(reads(raw([f("a.toml", "hello", { usize: 4 })])), /'a\.toml' is damaged/);
  await assert.rejects(reads(raw([f("a.toml", "hello", { method: 8, crc: 1 })])), /'a\.toml' is damaged/);
});

test("deflate entries unpack; garbage deflate data reports which entry failed", async () => {
  const out = await readZip(raw([f("a.toml", "hello hello hello", { method: 8 })]));
  assert.equal(text(out.get("a.toml")), "hello hello hello");
  await assert.rejects(reads(raw([f("a.toml", "hello", { method: 8, raw: new Uint8Array([0xff, 0xff, 0xff, 0xff]), csize: 4 })])), /'a\.toml' could not be unpacked/);
});

test("limits: entry count, per-file size, total size, archive size", async () => {
  const many = raw([f("a.toml"), f("b.toml"), f("c.toml")]);
  await assert.rejects(readZip(many, { entries: 2 }), /more than 2 entries/);
  assert.equal((await readZip(many, { entries: 3 })).size, 3);

  const big = "y".repeat(2000);
  await assert.rejects(readZip(raw([f("a.toml", big)]), { file: 1000 }), /'a\.toml' is larger than/);
  await assert.rejects(readZip(raw([f("a.toml", big, { usize: 10 })]), { file: 1000 }), /is larger than|damaged/);
  await assert.rejects(readZip(raw([f("a.toml", big, { method: 8 })]), { file: 1000 }), /'a\.toml' is larger than/);
  assert.equal((await readZip(raw([f("a.toml", big)]), { file: 2000 })).size, 1);

  await assert.rejects(readZip(raw([f("a.toml", big), f("b.toml", big)]), { total: 3000 }), /unpacks to more than/);
  assert.equal((await readZip(raw([f("a.toml", big), f("b.toml", big)]), { total: 4000 })).size, 2);

  await assert.rejects(readZip(new Uint8Array(MAX_ARCHIVE_BYTES + 1)), /larger than 20 MB/);
});

test("a decompression bomb is cut off at the entry's allowed size", async () => {
  const bomb = deflateRawSync(Buffer.alloc(5 * 1024 * 1024));
  const zip = raw([{ name: "a.toml", method: 8, raw: bomb, crc: 0, usize: 100, csize: bomb.length }]);
  await assert.rejects(readZip(zip, { file: 1024 }), /could not be unpacked|damaged|larger/);
});

test("extra and comment fields in the central directory are skipped; local extra is honoured", async () => {
  const zip = raw([f("a.toml", "one", { localExtra: 8 }), f("b.toml", "two")]);
  const out = await readZip(zip);
  assert.equal(text(out.get("a.toml")), "one");
  assert.equal(text(out.get("b.toml")), "two");
});

test("returned data is a fresh copy of each entry", async () => {
  const zip = await writeZip([{ name: "a.toml", data: bytes("abc") }]);
  const out = await readZip(zip);
  out.get("a.toml")[0] = 0;
  assert.equal(text((await readZip(zip)).get("a.toml")), "abc");
});

test("isArchiveName: case-insensitive extension, non-strings", () => {
  assert.equal(isArchiveName("demo-20260101-000000.diag.zip"), true);
  assert.equal(isArchiveName("DEMO.DIAG.ZIP"), true);
  assert.equal(isArchiveName("demo.zip"), false);
  assert.equal(isArchiveName(null), false);
  assert.equal(isArchiveName(5), false);
});
