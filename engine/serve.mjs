// Serve only the standalone engine page; never expose a directory of diagram data.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const page = fileURLToPath(new URL("../diagram.html", import.meta.url));
const port = Number(process.env.PORT || 8080);
const server = createServer((req, res) => {
  if (req.url !== "/" && req.url !== "/diagram.html") { res.writeHead(404); res.end("Not found"); return; }
  try { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); res.end(readFileSync(page)); }
  catch (_) { res.writeHead(500); res.end("Run node engine/browser.mjs first."); }
});
server.on("error", (e) => { console.error(e.message); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => console.log(`Open http://127.0.0.1:${port} in Edge or Chrome. Ctrl+C stops the server.`));
