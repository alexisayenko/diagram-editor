import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore, handleApi, MAX_BYTES } from "../lib/store.mjs";
import { validName, exportNames, stamp, layoutNameFor } from "../lib/names.mjs";
import { createApp } from "../serve.mjs";

const fresh = () => { const dir = join(mkdtempSync(join(tmpdir(), "store-")), "local"); return { dir, store: createStore(dir) }; };
const H = { host: "127.0.0.1:8080", "content-type": "application/json" };
const call = (store, method, url, body, headers = H) => handleApi(store, { method, url, headers }, body === undefined ? "" : JSON.stringify(body));

test("file names: strict allowlist", () => {
  for (const ok of ["a.toml", "My-diagram_1.layout.json", "x.y.toml"]) assert.ok(validName(ok), ok);
  for (const bad of ["", ".hidden.toml", "../a.toml", "a/b.toml", "a\b.toml", "a.txt", "a.toml.exe", "a..b.toml", "a b.toml", "a.toml\n", "x".repeat(101) + ".toml", null, 5]) assert.ok(!validName(bad), String(bad));
});

test("export names carry a timestamp and keep the original name", () => {
  const d = new Date(2026, 9, 7, 14, 30, 12);
  assert.equal(stamp(d), "20261007-143012");
  assert.deepEqual(exportNames("demo.toml", d), { toml: "demo-20261007-143012.toml", layout: "demo-20261007-143012.layout.json" });
  assert.equal(layoutNameFor("demo.toml"), "demo.layout.json");
});

test("write, list and read; the folder is created on first write; no temp files remain", () => {
  const { dir, store } = fresh();
  assert.deepEqual(store.list(), []);
  assert.deepEqual(store.write([{ name: "a.toml", text: "title = \"é\"\r\n", overwrite: true }, { name: "a.layout.json", text: "{}", base: null }]).saved, ["a.toml", "a.layout.json"]);
  assert.deepEqual(store.list().map((f) => f.name), ["a.layout.json", "a.toml"]);
  assert.equal(store.get("a.toml").text, "title = \"é\"\r\n");
  assert.deepEqual(readdirSync(dir).sort(), ["a.layout.json", "a.toml"]);
  assert.throws(() => store.get("missing.toml"), /not found/);
});

test("409 when the file on disk differs from the expected base; nothing is written", () => {
  const { dir, store } = fresh();
  store.write([{ name: "a.toml", text: "one", overwrite: true }, { name: "a.layout.json", text: "L1", overwrite: true }]);
  writeFileSync(join(dir, "a.toml"), "changed outside");
  const r = call(store, "PUT", "/api/files", { files: [{ name: "a.layout.json", text: "L2", base: "L1" }, { name: "a.toml", text: "two", base: "one" }] });
  assert.equal(r.status, 409);
  assert.deepEqual(r.body.conflicts, ["a.toml"]);
  assert.equal(readFileSync(join(dir, "a.layout.json"), "utf8"), "L1");
  assert.equal(call(store, "PUT", "/api/files", { files: [{ name: "a.toml", text: "two", base: "changed outside" }] }).status, 200);
  assert.equal(call(store, "PUT", "/api/files", { files: [{ name: "new.toml", text: "x", base: "something" }] }).status, 409);
  assert.equal(call(store, "PUT", "/api/files", { files: [{ name: "a.toml", text: "x", base: null }] }).status, 409);
  assert.equal(call(store, "PUT", "/api/files", { files: [{ name: "a.toml", text: "x" }] }).status, 400);
});

test("bad requests: names, sizes, counts, duplicates, content type, malformed JSON, methods", () => {
  const { store } = fresh();
  const put = (files, h) => call(store, "PUT", "/api/files", { files }, h);
  assert.equal(put([{ name: "../x.toml", text: "", overwrite: true }]).status, 400);
  assert.equal(put([{ name: "a.toml", text: "x".repeat(MAX_BYTES + 1), overwrite: true }]).status, 413);
  assert.equal(put([]).status, 400);
  assert.equal(put(Array.from({ length: 9 }, (_, i) => ({ name: `f${i}.toml`, text: "", overwrite: true }))).status, 400);
  assert.equal(put([{ name: "a.toml", text: "", overwrite: true }, { name: "a.toml", text: "", overwrite: true }]).status, 400);
  assert.equal(put([{ name: "a.toml", text: "", overwrite: true }], { host: "127.0.0.1:1", "content-type": "text/plain" }).status, 415);
  assert.equal(handleApi(store, { method: "PUT", url: "/api/files", headers: H }, "{").status, 400);
  assert.equal(call(store, "GET", "/api/file?name=..%2Fsecret.toml").status, 400);
  assert.equal(call(store, "GET", "/api/file").status, 400);
  assert.equal(call(store, "DELETE", "/api/files").status, 405);
  assert.equal(call(store, "GET", "/api/other").status, 404);
});

test("cross-origin and foreign host requests are refused", () => {
  const { store } = fresh();
  assert.equal(call(store, "GET", "/api/files", undefined, { host: "127.0.0.1:8080", origin: "https://evil.test" }).status, 403);
  assert.equal(call(store, "GET", "/api/files", undefined, { host: "evil.test:8080" }).status, 403);
  assert.equal(call(store, "GET", "/api/files", undefined, { host: "127.0.0.1:8080", "sec-fetch-site": "cross-site" }).status, 403);
  assert.equal(call(store, "GET", "/api/files", undefined, { host: "127.0.0.1:8080", origin: "http://127.0.0.1:8080", "sec-fetch-site": "same-origin" }).status, 200);
});

test("server over HTTP: loopback only, no-store, API round trip, static page only", async () => {
  const { dir } = fresh();
  const page = join(dir, "..", "page.html");
  writeFileSync(page, "<html>page</html>");
  const server = createApp({ dir, page });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port, address } = server.address();
  assert.equal(address, "127.0.0.1");
  const url = (p) => `http://127.0.0.1:${port}${p}`;
  try {
    const home = await fetch(url("/"));
    assert.equal(home.headers.get("cache-control"), "no-store");
    assert.equal(await home.text(), "<html>page</html>");
    assert.equal((await fetch(url("/README.md"))).status, 404);
    assert.equal((await fetch(url("/local/a.toml"))).status, 404);
    const put = await fetch(url("/api/files"), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: [{ name: "a.toml", text: "t = 1", overwrite: true }] }) });
    assert.equal(put.status, 200);
    assert.equal(put.headers.get("cache-control"), "no-store");
    const read = await (await fetch(url("/api/file?name=a.toml"))).json();
    assert.equal(read.text, "t = 1");
    const cross = await fetch(url("/api/files"), { headers: { Origin: "https://evil.test" } });
    assert.equal(cross.status, 403);
  } finally { await new Promise((r) => server.close(r)); rmSync(join(dir, ".."), { recursive: true, force: true }); }
});
