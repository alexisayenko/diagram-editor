// Local diagram files: a single flat folder, strict file names, atomic writes, compare-before-write.
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { validName } from "./names.mjs";

export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_FILES = 8;

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

export function createStore(dir) {
  const pathOf = (name) => {
    if (!validName(name)) throw new HttpError(400, "Invalid file name. Use letters, digits, dot, dash or underscore, ending in .toml or .json.");
    return join(dir, name);
  };
  const read = (name) => {
    try { return readFileSync(pathOf(name), "utf8"); }
    catch (e) { if (e.code === "ENOENT") return null; throw e; }
  };
  function list() {
    let names;
    try { names = readdirSync(dir); } catch (e) { if (e.code === "ENOENT") return []; throw e; }
    return names.filter(validName).sort((a, b) => a.localeCompare(b)).flatMap((name) => {
      const s = statSync(join(dir, name));
      return s.isFile() ? [{ name, size: s.size, mtime: s.mtimeMs }] : [];
    });
  }
  function get(name) {
    const text = read(name);
    if (text === null) throw new HttpError(404, "File not found: " + name);
    return { name, text };
  }
  function write(entries) {
    if (!Array.isArray(entries) || !entries.length || entries.length > MAX_FILES) throw new HttpError(400, `Send 1 to ${MAX_FILES} files`);
    const seen = new Set(), conflicts = [];
    for (const e of entries) {
      if (!e || typeof e !== "object") throw new HttpError(400, "Invalid file entry");
      pathOf(e.name);
      if (seen.has(e.name)) throw new HttpError(400, "Duplicate file name: " + e.name);
      seen.add(e.name);
      if (typeof e.text !== "string") throw new HttpError(400, "Missing text for " + e.name);
      if (Buffer.byteLength(e.text) > MAX_BYTES) throw new HttpError(413, `${e.name} is larger than ${MAX_BYTES / 1024 / 1024} MB`);
      if (e.overwrite === true) continue;
      if (!("base" in e) || (e.base !== null && typeof e.base !== "string")) throw new HttpError(400, "Missing base for " + e.name);
      if (read(e.name) !== e.base) conflicts.push(e.name);
    }
    if (conflicts.length) throw new HttpError(409, `${conflicts.join(", ")} changed on disk since it was loaded. Nothing was written.`, { conflicts });
    mkdirSync(dir, { recursive: true });
    const saved = [];
    for (const e of entries) {
      const tmp = join(dir, "." + randomBytes(6).toString("hex") + ".tmp");
      try {
        writeFileSync(tmp, e.text, "utf8");
        renameSync(tmp, pathOf(e.name));
        saved.push(e.name);
      } catch (err) {
        try { unlinkSync(tmp); } catch (_) {}
        throw new HttpError(500, `Writing ${e.name} failed: ${err.message}`, { saved });
      }
    }
    return { saved };
  }
  return { list, get, write };
}

const HOST = /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/;

export function checkOrigin(headers) {
  const host = headers.host || "";
  if (!HOST.test(host)) throw new HttpError(403, "Forbidden host");
  if (headers.origin && headers.origin !== "http://" + host) throw new HttpError(403, "Cross-origin requests are refused");
  const site = headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") throw new HttpError(403, "Cross-origin requests are refused");
}

export function handleApi(store, { method, url, headers }, bodyText) {
  try {
    checkOrigin(headers);
    const u = new URL(url, "http://local");
    if (u.pathname === "/api/files" && method === "GET") return { status: 200, body: { files: store.list() } };
    if (u.pathname === "/api/file" && method === "GET") return { status: 200, body: store.get(u.searchParams.get("name")) };
    if (u.pathname === "/api/files" && method === "PUT") {
      if (!/^application\/json\b/i.test(headers["content-type"] || "")) throw new HttpError(415, "Send application/json");
      let data;
      try { data = JSON.parse(bodyText); } catch (_) { throw new HttpError(400, "Invalid JSON"); }
      return { status: 200, body: store.write(data && data.files) };
    }
    if (u.pathname === "/api/files" || u.pathname === "/api/file") throw new HttpError(405, "Method not allowed");
    throw new HttpError(404, "Not found");
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { error: e.message, ...e.extra } };
    return { status: 500, body: { error: e.message } };
  }
}
