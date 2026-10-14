import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../serve.mjs";
import { MAX_BYTES } from "../lib/store.mjs";

const ENGINE = fileURLToPath(new URL("..", import.meta.url));

async function withApp(setup, fn) {
  const root = mkdtempSync(join(tmpdir(), "diagram-serve-"));
  const dir = join(root, "local"), page = join(root, "page.html");
  mkdirSync(dir);
  setup?.({ dir, page });
  const server = createApp({ dir, page });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const call = (method, path, { headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(body);
  });
  try { await fn({ call, dir, port }); }
  finally { await new Promise((r) => { server.close(r); server.closeAllConnections?.(); }); rmSync(root, { recursive: true, force: true }); }
}

const put = (call, files, headers = {}) => call("PUT", "/api/files", { headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ files }) });

test("GET / and /diagram.html serve the page with no-store and nosniff", async () => {
  await withApp(({ page }) => writeFileSync(page, "<h1>page</h1>"), async ({ call }) => {
    for (const path of ["/", "/diagram.html"]) {
      const r = await call("GET", path);
      assert.equal(r.status, 200);
      assert.equal(r.text, "<h1>page</h1>");
      assert.match(r.headers["content-type"], /^text\/html/);
      assert.equal(r.headers["cache-control"], "no-store");
      assert.equal(r.headers["x-content-type-options"], "nosniff");
    }
  });
});

test("missing page answers 500 with a hint; other paths and methods answer 404", async () => {
  await withApp(null, async ({ call }) => {
    const r = await call("GET", "/");
    assert.equal(r.status, 500);
    assert.match(r.text, /node engine\/browser\.mjs/);
    const other = await call("GET", "/other");
    assert.equal(other.status, 404);
    assert.equal(other.headers["cache-control"], "no-store");
    assert.equal((await call("POST", "/")).status, 404);
  });
});

test("API: list, write, read, 409 on a stale base, overwrite, name allowlist", async () => {
  await withApp(null, async ({ call }) => {
    let r = await call("GET", "/api/files");
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(r.text), { files: [] });
    assert.equal(r.headers["cache-control"], "no-store");
    assert.match(r.headers["content-type"], /^application\/json/);

    r = await put(call, [{ name: "demo/topology.toml", text: "a = 1\n", base: null }]);
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(r.text).saved, ["demo/topology.toml"]);

    r = await call("GET", "/api/file?name=demo%2Ftopology.toml");
    assert.equal(JSON.parse(r.text).text, "a = 1\n");
    assert.equal((await call("GET", "/api/file?name=demo%2Fmissing.toml")).status, 404);

    r = await put(call, [{ name: "demo/topology.toml", text: "a = 2\n", base: "old" }]);
    assert.equal(r.status, 409);
    assert.deepEqual(JSON.parse(r.text).conflicts, ["demo/topology.toml"]);
    assert.equal(JSON.parse((await call("GET", "/api/file?name=demo%2Ftopology.toml")).text).text, "a = 1\n");

    r = await put(call, [{ name: "demo/topology.toml", text: "a = 2\n", overwrite: true }]);
    assert.equal(r.status, 200);

    for (const name of ["../x.toml", "demo/a.txt", "a/b/c/d.toml", ".hidden.toml"]) {
      r = await put(call, [{ name, text: "x", overwrite: true }]);
      assert.equal(r.status, 400, name);
    }
    assert.equal((await call("GET", "/api/file?name=..%2Fsecret.toml")).status, 400);
  });
});

test("API: origin and host checks", async () => {
  await withApp(null, async ({ call, port }) => {
    let r = await call("GET", "/api/files", { headers: { host: "evil.example.test" } });
    assert.equal(r.status, 403);
    r = await call("GET", "/api/files", { headers: { origin: "http://evil.example.test" } });
    assert.equal(r.status, 403);
    r = await call("GET", "/api/files", { headers: { origin: `http://127.0.0.1:${port}` } });
    assert.equal(r.status, 200);
    r = await call("GET", "/api/files", { headers: { "sec-fetch-site": "cross-site" } });
    assert.equal(r.status, 403);
    r = await call("GET", "/api/files", { headers: { "sec-fetch-site": "same-origin" } });
    assert.equal(r.status, 200);
  });
});

test("API: content type, bad JSON, method and route errors", async () => {
  await withApp(null, async ({ call }) => {
    let r = await call("PUT", "/api/files", { headers: { "content-type": "text/plain" }, body: "{}" });
    assert.equal(r.status, 415);
    r = await call("PUT", "/api/files", { headers: { "content-type": "application/json" }, body: "{oops" });
    assert.equal(r.status, 400);
    r = await call("PUT", "/api/files", { headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(r.status, 400);
    assert.equal((await call("DELETE", "/api/files")).status, 405);
    assert.equal((await call("POST", "/api/file")).status, 405);
    assert.equal((await call("GET", "/api/nothing")).status, 404);
  });
});

test("API: a file over the size cap is 413; a request over four times the cap is refused", async () => {
  await withApp(null, async ({ call }) => {
    let r = await put(call, [{ name: "demo/big.toml", text: "#".repeat(MAX_BYTES + 1), overwrite: true }]);
    assert.equal(r.status, 413);
    r = await call("PUT", "/api/files", { headers: { "content-type": "application/json" }, body: "x".repeat(MAX_BYTES * 4 + 1) });
    assert.equal(r.status, 413);
    assert.match(r.text, /Request too large/);
  });
});

test("browser.mjs --check passes when diagram.html is current and the page is self-contained", () => {
  const r = spawnSync(process.execPath, [join(ENGINE, "browser.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /diagram\.html up to date/);
  const html = readFileSync(join(ENGINE, "..", "diagram.html"), "utf8");
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<iframe id="view"/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
});
