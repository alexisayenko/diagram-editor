// Localhost-only server: the engine page plus a small JSON API over one git-ignored folder (local/).
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runCli } from "./lib/cli.mjs";
import { checkOrigin, createStore, handleApi, MAX_BYTES } from "./lib/store.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

const LIMIT = MAX_BYTES * 4;
const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: blob:; connect-src 'self'; frame-src 'self' about: data: blob:; child-src 'self' about: data: blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export function createApp({ dir = here("../local"), page = here("../diagram.html") } = {}) {
  const store = createStore(dir);
  const server = createServer((req, res) => {
    const base = { "Cache-Control": "no-store", ...SECURITY_HEADERS };
    const send = (status, type, body) => { res.writeHead(status, { ...base, "Content-Type": type }); res.end(body); };
    try { checkOrigin(req.headers); }
    catch (e) { send(e.status ?? 403, "application/json; charset=utf-8", JSON.stringify({ error: e.message })); return; }
    if (req.url.startsWith("/api/")) {
      const declared = Number(req.headers["content-length"]);
      if (declared > LIMIT) { send(413, "application/json", JSON.stringify({ error: "Request too large" })); req.resume(); return; }
      const chunks = []; let size = 0, over = false;
      req.on("data", (c) => {
        size += c.length;
        if (size > LIMIT) over = true; else chunks.push(c);
      });
      req.on("end", () => {
        if (over) { send(413, "application/json", JSON.stringify({ error: "Request too large" })); return; }
        const r = handleApi(store, req, Buffer.concat(chunks).toString("utf8"));
        send(r.status, "application/json; charset=utf-8", JSON.stringify(r.body));
      });
      return;
    }
    if (req.method !== "GET" || (req.url !== "/" && req.url !== "/diagram.html")) { send(404, "text/plain", "Not found"); return; }
    try { send(200, "text/html; charset=utf-8", readFileSync(page)); }
    catch (_) { send(500, "text/plain", "Run node engine/browser.mjs first."); }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli("serve", () => {
    const port = Number(process.env.PORT || 8080), server = createApp();
    server.on("error", (e) => { console.error(e.message); process.exitCode = 1; });
    server.listen(port, "127.0.0.1", () => console.log(`Open http://127.0.0.1:${port} in any modern browser. Files are stored in local/. Ctrl+C stops the server.`));
  });
}
