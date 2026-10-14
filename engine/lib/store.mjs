// Local diagram files: one sub-folder per diagram, strict relative file names, staged all-or-nothing writes, compare-before-write.
import * as nodeFs from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { validName, caseKey } from "./names.mjs";

export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_FILES = 256;

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const TEMP_FILE = /^\.[0-9a-f]{12}\.tmp$/;

export function createStore(dir, io = nodeFs) {
  const { mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync } = io;
  const pathOf = (name) => {
    if (!validName(name)) throw new HttpError(400, "Invalid file name. Use letters, digits, dot, dash or underscore, ending in .toml or .json, at most two folder levels; Windows device names such as con or nul and names ending in a dot are not allowed.");
    return join(dir, ...name.split("/"));
  };
  const read = (name) => {
    try {
      return readFileSync(pathOf(name), "utf8");
    } catch (e) {
      if (e.code === "ENOENT") return null;
      if (e.code === "ENOTDIR" || e.code === "EISDIR") throw new HttpError(400, "Name collides with an existing file or folder: " + name);
      throw e;
    }
  };
  function list() {
    const out = [];
    const walk = (rel, depth) => {
      let names;
      try {
        names = readdirSync(join(dir, ...rel));
      } catch (e) {
        if (e.code === "ENOENT") return;
        throw e;
      }
      for (const n of names.sort((x, y) => x.localeCompare(y))) {
        const path = [...rel, n], s = statSync(join(dir, ...path));
        if (s.isDirectory()) {
          if (depth < 2 && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(n)) walk(path, depth + 1);
        } else if (s.isFile() && validName(path.join("/"))) {
          out.push({ name: path.join("/"), size: s.size, mtime: s.mtimeMs });
        }
      }
    };
    walk([], 0);
    return out;
  }
  function get(name) {
    const text = read(name);
    if (text === null) throw new HttpError(404, "File not found: " + name);
    return { name, text };
  }
  function conflictsWithDisk(e, seen) {
    if (!e || typeof e !== "object") throw new HttpError(400, "Invalid file entry");
    pathOf(e.name);
    if (seen.has(caseKey(e.name))) throw new HttpError(400, "Duplicate file name (names are compared ignoring case): " + e.name);
    seen.add(caseKey(e.name));
    if (typeof e.text !== "string") throw new HttpError(400, "Missing text for " + e.name);
    if (Buffer.byteLength(e.text) > MAX_BYTES) throw new HttpError(413, `${e.name} is larger than ${MAX_BYTES / 1024 / 1024} MB`);
    const current = read(e.name);
    if (e.overwrite === true) return false;
    if (!("base" in e) || (e.base !== null && typeof e.base !== "string")) throw new HttpError(400, "Missing base for " + e.name);
    return current !== e.base;
  }
  const tempName = (target) => join(dirname(target), "." + randomBytes(6).toString("hex") + ".tmp");
  function writeTemp(path, text) {
    const fd = io.openSync(path, "wx");
    try {
      io.writeSync(fd, text, null, "utf8");
      io.fsyncSync(fd);
    } finally {
      io.closeSync(fd);
    }
  }
  const quietly = (fn) => {
    try {
      fn();
      return true;
    } catch (_) {
      return false;
    }
  };
  function sweep() {
    const walk = (rel, depth) => {
      let names;
      try {
        names = readdirSync(join(dir, ...rel), { withFileTypes: true });
      } catch (_) {
        return;
      }
      for (const n of names) {
        if (n.isDirectory()) {
          if (depth < 2) walk([...rel, n.name], depth + 1);
        } else if (TEMP_FILE.test(n.name)) quietly(() => unlinkSync(join(dir, ...rel, n.name)));
      }
    };
    walk([], 0);
  }
  function write(entries) {
    if (!Array.isArray(entries) || !entries.length || entries.length > MAX_FILES) throw new HttpError(400, `Send 1 to ${MAX_FILES} files`);
    const seen = new Set(), conflicts = [];
    for (const e of entries) {
      if (conflictsWithDisk(e, seen)) conflicts.push(e.name);
    }
    if (conflicts.length) throw new HttpError(409, `${conflicts.join(", ")} changed on disk since it was loaded. Nothing was written.`, { conflicts });
    sweep();
    const plan = entries.map((e) => {
      const target = pathOf(e.name);
      return { name: e.name, text: e.text, target, tmp: tempName(target), before: read(e.name) };
    });
    const staged = [];
    try {
      for (const p of plan) {
        mkdirSync(dirname(p.target), { recursive: true });
        staged.push(p);
        writeTemp(p.tmp, p.text);
      }
    } catch (err) {
      for (const p of staged) quietly(() => unlinkSync(p.tmp));
      throw new HttpError(500, `Writing ${staged.at(-1).name} failed: ${err.message}. Nothing was saved.`, { saved: [] });
    }
    const done = [];
    try {
      for (const p of plan) {
        renameSync(p.tmp, p.target);
        done.push(p);
      }
    } catch (err) {
      for (const p of plan) if (!done.includes(p)) quietly(() => unlinkSync(p.tmp));
      const stuck = restore(done);
      const failed = plan[done.length].name;
      throw new HttpError(500, `Saving ${failed} failed: ${err.message}. ` + (stuck.length ? `Could not restore ${stuck.join(", ")}.` : "Nothing was saved."), { saved: stuck });
    }
    return { saved: entries.map((e) => e.name) };
  }
  function restore(done) {
    const stuck = [];
    for (const p of done.toReversed()) {
      const ok = quietly(() => {
        if (p.before === null) {
          unlinkSync(p.target);
          return;
        }
        const back = tempName(p.target);
        try {
          writeTemp(back, p.before);
          renameSync(back, p.target);
        } catch (err) {
          quietly(() => unlinkSync(back));
          throw err;
        }
      });
      if (!ok) stuck.push(p.name);
    }
    return stuck.toReversed();
  }
  sweep();
  return { list, get, write };
}

const HOST = /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/;

export function checkOrigin(headers) {
  const host = headers.host || "";
  if (!HOST.test(host)) throw new HttpError(403, "Forbidden host");
  if (headers.origin && headers.origin !== "http://" + host) /* NOSONAR: the local server is plain http on loopback */ throw new HttpError(403, "Cross-origin requests are refused");
  const site = headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") throw new HttpError(403, "Cross-origin requests are refused");
}

export function handleApi(store, { method, url, headers }, bodyText) {
  try {
    checkOrigin(headers);
    const u = new URL(url, "http://local"); // NOSONAR: base only for parsing a relative path, nothing is fetched
    if (u.pathname === "/api/files" && method === "GET") return { status: 200, body: { files: store.list() } };
    if (u.pathname === "/api/file" && method === "GET") return { status: 200, body: store.get(u.searchParams.get("name")) };
    if (u.pathname === "/api/files" && method === "PUT") {
      if (!/^application\/json\b/i.test(headers["content-type"] || "")) throw new HttpError(415, "Send application/json");
      let data;
      try { data = JSON.parse(bodyText); } catch (_) { throw new HttpError(400, "Invalid JSON"); }
      return { status: 200, body: store.write(data?.files) };
    }
    if (u.pathname === "/api/files" || u.pathname === "/api/file") throw new HttpError(405, "Method not allowed");
    throw new HttpError(404, "Not found");
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { error: e.message, ...e.extra } };
    return { status: 500, body: { error: e.message } };
  }
}
