import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../serve.mjs";
import { checkOrigin, HttpError, MAX_BYTES } from "../lib/store.mjs";
import { readZip, writeZip } from "../lib/zip.mjs";
import { parseToml } from "../parse/toml.mjs";
import { formatNotes, setNotes } from "../parse/toml-write.mjs";
import { tomlBasic } from "../parse/toml-escape.mjs";

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
const int = (r, n) => Math.floor(r() * n);

const refused = (headers) => {
  try { checkOrigin(headers); } catch (e) { return e instanceof HttpError ? e.status : e; }
  return null;
};

test("Host variants: only loopback names with a numeric port are accepted", () => {
  for (const host of ["127.0.0.1:8080", "localhost:8080", "[::1]:8080", "localhost:1", "127.0.0.1:65535"]) assert.equal(refused({ host }), null, host);
  const bad = ["[::1]", "::1:8080", "[::2]:8080", "[0:0:0:0:0:0:0:1]:8080", "localhost.:8080", "127.0.0.1.:8080", "LOCALHOST:8080", "Localhost:8080", "localhost:80a", "localhost: 80", "localhost:8080/", "localhost:8080,evil.example.test", "user@localhost:8080", "127.0.0.2:8080", "0.0.0.0:8080", "[::1]:8080 ", " localhost:8080", "localhost:", ":8080", "local\nhost:8080"];
  for (const host of bad) assert.equal(refused({ host }), 403, JSON.stringify(host));
});

test("Origin variants: only the exact page origin passes, a port mismatch is refused", () => {
  const host = "localhost:8080";
  assert.equal(refused({ host, origin: "http://localhost:8080" }), null);
  for (const origin of ["http://localhost:9999", "http://localhost", "http://localhost:8080/", "http://LOCALHOST:8080", "https://localhost:8080", "null", "http://127.0.0.1:8080", "http://[::1]:8080", "http://localhost.:8080", "http://localhost:8080.evil.example.test"]) {
    assert.equal(refused({ host, origin }), 403, origin);
  }
  assert.equal(refused({ host: "[::1]:8080", origin: "http://[::1]:8080" }), null);
  assert.equal(refused({ host: "[::1]:8080", origin: "http://[::1]:8081" }), 403);
});

test("Sec-Fetch-Site: only same-origin and none pass", () => {
  for (const v of ["same-origin", "none"]) assert.equal(refused({ host: "localhost:1", "sec-fetch-site": v }), null);
  for (const v of ["same-site", "cross-site", "SAME-ORIGIN", "x"]) assert.equal(refused({ host: "localhost:1", "sec-fetch-site": v }), 403, v);
});

async function withApp(fn) {
  const root = mkdtempSync(join(tmpdir(), "fuzz-serve-"));
  const dir = join(root, "local");
  mkdirSync(dir);
  const server = createApp({ dir, page: join(root, "p.html") });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const call = (method, path, { headers = {}, chunks = [] } = {}) => new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      const parts = [];
      res.on("data", (c) => parts.push(c));
      res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(parts).toString("utf8") }));
    });
    req.on("error", (e) => (e.code === "EPIPE" || e.code === "ECONNRESET" ? resolve({ status: 413, text: "connection closed" }) : reject(e)));
    for (const c of chunks) req.write(c);
    req.end();
  });
  try { await fn(call); }
  finally { await new Promise((r) => { server.close(r); server.closeAllConnections?.(); }); rmSync(root, { recursive: true, force: true }); }
}

test("request body cap: exactly the limit gets through, one byte more is 413 (declared and chunked)", async () => {
  const limit = MAX_BYTES * 4, json = { "content-type": "application/json" };
  await withApp(async (call) => {
    const exact = Buffer.alloc(limit, " ");
    let r = await call("PUT", "/api/files", { headers: { ...json, "content-length": String(limit) }, chunks: [exact] });
    assert.equal(r.status, 400, "reaches the JSON parser");
    r = await call("PUT", "/api/files", { headers: { ...json, "content-length": String(limit + 1) }, chunks: [Buffer.alloc(limit + 1, " ")] });
    assert.equal(r.status, 413);
    r = await call("PUT", "/api/files", { headers: { ...json, "transfer-encoding": "chunked" }, chunks: [exact] });
    assert.equal(r.status, 400);
    r = await call("PUT", "/api/files", { headers: { ...json, "transfer-encoding": "chunked" }, chunks: [exact, Buffer.from(" ")] });
    assert.equal(r.status, 413);
  });
});

const enc = new TextEncoder();
const clean = async (promise) => {
  try {
    await promise;
    return "parsed";
  } catch (e) {
    assert.ok(e instanceof Error && e.constructor === Error, `raw ${e?.constructor?.name}: ${e?.message}`);
    assert.ok(typeof e.message === "string" && e.message.length > 3 && !/undefined|NaN|\[object/.test(e.message), "unclear message: " + e.message);
    return "rejected";
  }
};

test("zip bomb by ratio: many highly compressible entries stop at the total cap", async () => {
  const big = new Uint8Array(MAX_BYTES).fill(0x20);
  const entries = Array.from({ length: 12 }, (_, i) => ({ name: `servers/s${i}.toml`, data: big }));
  const zip = await writeZip(entries);
  assert.ok(zip.length < 200 * 1024, "the archive itself is small: " + zip.length);
  await assert.rejects(readZip(zip), /unpacks to more than/);
});

test("mutation fuzz of valid archives: every mutant parses or fails with a clean message, never hangs", async () => {
  const base = await writeZip([
    { name: "topology.toml", data: enc.encode('id = "a"\ntitle = "A"\n') },
    { name: "servers/s1.toml", data: enc.encode('name = "S1"\n'.repeat(60)) },
    { name: "diagram.layout.json", data: enc.encode(JSON.stringify({ version: 1, boxes: {} })) },
  ]);
  const r = rng(20261014), outcome = { parsed: 0, rejected: 0 };
  for (let n = 0; n < 400; n++) {
    let m = Uint8Array.from(base);
    const kind = int(r, 5);
    if (kind === 0) m[int(r, m.length)] = int(r, 256);
    else if (kind === 1) for (let k = 0, c = 1 + int(r, 8); k < c; k++) m[int(r, m.length)] ^= 1 << int(r, 8);
    else if (kind === 2) m = m.slice(0, int(r, m.length));
    else if (kind === 3) { const at = int(r, m.length), len = int(r, 40); m = Uint8Array.from([...m.slice(0, at), ...m.slice(at + len)]); }
    else { const at = int(r, m.length); m = Uint8Array.from([...m.slice(0, at), ...Array.from({ length: 1 + int(r, 30) }, () => int(r, 256)), ...m.slice(at)]); }
    const start = Date.now();
    outcome[await clean(readZip(m))]++;
    assert.ok(Date.now() - start < 2000, "mutant " + n + " took too long");
  }
  assert.ok(outcome.rejected > 50, JSON.stringify(outcome));
});

const KEYS = ["id", "title", "name", "role", "os", "k1", "z_9", "notes"];
const WORDS = ["alpha", "Beta", "x y", 'q"uote', "back\\slash", "tab\there", "line\nbreak", "ünï", "日本", "#hash", "= eq", "[br]", "", "emoji \u{1F600}", "a'b", "\u0001ctl"];
const text = (r) => Array.from({ length: int(r, 4) }, () => pick(r, WORDS)).join(pick(r, [" ", "", "/"]));

function value(r, depth) {
  const k = int(r, depth ? 4 : 3);
  if (k === 0) return text(r);
  if (k === 1) return r() < 0.5;
  if (k === 2) return Array.from({ length: int(r, 4) }, () => text(r));
  return Array.from({ length: int(r, 3) }, () => value(r, depth - 1));
}
function keys(r, n) {
  const out = {};
  for (let i = 0; i < n; i++) out[pick(r, KEYS)] = value(r, 2);
  return out;
}
function model(r) {
  const root = keys(r, int(r, 5));
  for (const t of Array.from({ length: int(r, 3) }, () => pick(r, ["servers", "regions", "svc"]))) {
    if (!Object.hasOwn(root, t)) root[t] = [];
    if (isTables(root[t]) || (Array.isArray(root[t]) && !root[t].length)) root[t].push(keys(r, int(r, 4)));
  }
  return root;
}
const isTables = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === "object" && !Array.isArray(x));
const tomlValue = (v) => (typeof v === "string" ? tomlBasic(v) : typeof v === "boolean" ? String(v) : "[" + v.map(tomlValue).join(", ") + "]");
const tomlTable = (obj, sep) => Object.entries(obj).map(([k, v]) => `${k} = ${tomlValue(v)}`).join(sep);
function render(root, r) {
  const sep = pick(r, ["\n", "\r\n"]);
  const scalars = Object.fromEntries(Object.entries(root).filter(([, v]) => !Array.isArray(v) || !v.length || !isTables(v)));
  const out = [tomlTable(scalars, sep)];
  for (const [name, list] of Object.entries(root)) if (isTables(list)) for (const t of list) out.push(`[[${name}]]` + sep + tomlTable(t, sep));
  return out.filter((s) => s !== "").join(sep + (r() < 0.5 ? "" : "# c" + sep)) + sep;
}
const plain = (o) => JSON.parse(JSON.stringify(o));

test("parseToml round trip: random valid models written as TOML parse back equal (seeded)", () => {
  const r = rng(424242);
  for (let n = 0; n < 300; n++) {
    const m = model(r);
    for (const [k, v] of Object.entries(m)) if (Array.isArray(v) && !v.length) delete m[k];
    const src = render(m, r);
    assert.deepEqual(plain(parseToml(src)), plain(m), "case " + n + "\n" + src);
  }
});

test("notes round trip: formatNotes and setNotes survive hostile text (seeded)", () => {
  const r = rng(777), words = WORDS.filter((w) => w !== "\u0001ctl");
  for (let n = 0; n < 200; n++) {
    const texts = Array.from({ length: 1 + int(r, 4) }, () => "n" + Array.from({ length: 1 + int(r, 4) }, () => pick(r, words)).join(pick(r, [" ", "\n", '"', '"""', "\\"])));
    assert.deepEqual(parseToml(`notes = ${formatNotes(texts)}\n`).notes, texts, "format " + n);
    assert.deepEqual(parseToml(setNotes('id = "a"\n', texts)).notes, texts, "set " + n);
  }
});

test("mutation fuzz of TOML text: every mutant parses or fails with a FormatError", () => {
  const r = rng(99), seed = render(model(rng(5)), r) + '[[servers]]\nid = "s"\nnotes = """\nhi\n"""\n';
  let rejected = 0;
  for (let n = 0; n < 500; n++) {
    const at = int(r, seed.length), cut = int(r, 6), ins = pick(r, ["", '"', "'", "[", "]", "[[", "\\", "\\u12", "\n", "=", "#", "\0", "\u{1F600}", '"""', "true"]);
    const m = seed.slice(0, at) + ins + seed.slice(at + cut);
    try { parseToml(m); } catch (e) { rejected++; assert.equal(e.name, "FormatError", `${e.name}: ${e.message}\n${JSON.stringify(m)}`); }
  }
  assert.ok(rejected > 50);
});
