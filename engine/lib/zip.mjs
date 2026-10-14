// Dependency-free zip reader / writer for `.diag.zip` diagram archives (stored and deflate entries only).
// Browser and Node 22: uses the platform CompressionStream / DecompressionStream ("deflate-raw").
// An archive is untrusted input: names, counts and sizes are checked, and the size caps are enforced while inflating.
import { segmentProblem, caseKey } from "./names.mjs";
export const MAX_ENTRIES = 500;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
export const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
export const ARCHIVE_EXT = ".diag.zip";
const ENTRY_NAME = /^(?:servers\/)?[A-Za-z0-9][A-Za-z0-9._-]*\.(?:toml|json)$/;

let table = null;
export function crc32(bytes) {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = table[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function pipe(bytes, stream, cap) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader(), chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (cap !== undefined && total > cap) { await reader.cancel(); throw new Error("an entry is larger than its declared or allowed size"); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

function dosTime(d) {
  const year = Math.max(1980, d.getFullYear());
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

// entries: [{ name, data: Uint8Array }] -> Uint8Array of a zip file (deflated when that is smaller and the platform supports it).
export async function writeZip(entries, date = new Date()) {
  const enc = new TextEncoder(), parts = [], central = [], when = dosTime(date);
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = enc.encode(name), crc = crc32(data);
    let method = 0, body = data;
    if (typeof CompressionStream === "function" && data.length > 64) {
      const packed = await pipe(data, new CompressionStream("deflate-raw"));
      if (packed.length < data.length) { method = 8; body = packed; }
    }
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, method, true);
    local.setUint16(10, when.time, true); local.setUint16(12, when.date, true); local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true); local.setUint32(22, data.length, true); local.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, body);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, method, true);
    cd.setUint16(12, when.time, true); cd.setUint16(14, when.date, true); cd.setUint32(16, crc, true);
    cd.setUint32(20, body.length, true); cd.setUint32(24, data.length, true); cd.setUint16(28, nameBytes.length, true); cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nameBytes);
    offset += 30 + nameBytes.length + body.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}

// Why an entry name is not acceptable inside an archive, or null.
export function entryProblem(name) {
  if (typeof name !== "string" || !name) return "an entry has no name";
  if (/[\0\\]/.test(name)) return "unsafe entry name '" + name.replace(/[\0\\]/g, "?") + "'";
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) return "absolute entry name '" + name + "'";
  if (name.split("/").some((s) => s === ".." || s === ".")) return "entry name '" + name + "' leaves the diagram folder";
  if (!ENTRY_NAME.test(name)) return "unsupported file '" + name + "' (a diagram holds .toml and .json files, servers in servers/)";
  for (const s of name.split("/")) {
    const p = segmentProblem(s);
    if (p) return "unusable file name " + p;
  }
  return null;
}

const ignorable = (name) => name.startsWith("__MACOSX/") || name.split("/").some((s) => s !== ".." && s !== "." && s.startsWith("."));

const SIG_EOCD = 0x06054b50, SIG_CENTRAL = 0x02014b50, SIG_LOCAL = 0x04034b50, NOT_ZIP = "Not a valid zip file.", ZIP64 = "Zip64 archives are not supported.";

function findEocd(bytes, dv) {
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) return i;
  }
  return -1;
}

function readHeader(dv, bytes, p, eocd, dec) {
  if (p + 46 > eocd || dv.getUint32(p, true) !== SIG_CENTRAL) throw new Error(NOT_ZIP);
  const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), next = p + 46 + nl + xl + cl;
  if (next > eocd) throw new Error(NOT_ZIP);
  let name;
  try { name = dec.decode(bytes.subarray(p + 46, p + 46 + nl)); } catch (_) { throw new Error("An entry name is not valid UTF-8."); }
  return {
    name, next, flags: dv.getUint16(p + 8, true), method: dv.getUint16(p + 10, true), crc: dv.getUint32(p + 16, true),
    csize: dv.getUint32(p + 20, true), usize: dv.getUint32(p + 24, true), local: dv.getUint32(p + 42, true),
  };
}

function acceptEntry(h, seen, maxFile) {
  const { name, flags, method, crc, csize, usize, local } = h;
  if (name.endsWith("/")) return null;
  if (flags & 1) throw new Error("Encrypted zip files are not supported.");
  if (csize === 0xffffffff || usize === 0xffffffff || local === 0xffffffff) throw new Error(ZIP64);
  if (method !== 0 && method !== 8) throw new Error("Unsupported compression method " + method + " in '" + name + "' (only stored and deflate).");
  if (ignorable(name)) return null;
  const problem = entryProblem(name);
  if (problem) throw new Error("Rejected archive: " + problem + ".");
  if (seen.has(caseKey(name))) throw new Error("Rejected archive: duplicate entry '" + name + "' (names that differ only in case collide on Windows and macOS).");
  seen.add(caseKey(name));
  if (usize > maxFile) throw new Error("'" + name + "' is larger than " + maxFile / 1024 / 1024 + " MB.");
  return { name, method, crc, csize, usize, local };
}

async function unpackEntry(bytes, dv, j, cdAt, maxFile) {
  if (j.local + 30 > cdAt || dv.getUint32(j.local, true) !== SIG_LOCAL) throw new Error(NOT_ZIP);
  const start = j.local + 30 + dv.getUint16(j.local + 26, true) + dv.getUint16(j.local + 28, true);
  if (start + j.csize > cdAt) throw new Error(NOT_ZIP);
  const raw = bytes.subarray(start, start + j.csize);
  let data;
  if (j.method === 0) {
    if (raw.length > maxFile) throw new Error("'" + j.name + "' is larger than " + maxFile / 1024 / 1024 + " MB.");
    data = raw;
  } else {
    if (typeof DecompressionStream !== "function") throw new Error("This browser cannot unpack compressed zip entries.");
    try { data = await pipe(raw, new DecompressionStream("deflate-raw"), Math.min(maxFile, j.usize)); }
    catch (e) { throw new Error("'" + j.name + "' could not be unpacked: " + e.message + "."); }
  }
  if (data.length !== j.usize || crc32(data) !== j.crc) throw new Error("'" + j.name + "' is damaged (size or checksum mismatch).");
  return data;
}

// bytes: Uint8Array of a .diag.zip -> Map of relative path -> Uint8Array. Throws Error with a readable reason; nothing partial is returned.
export async function readZip(bytes, limits = {}) {
  const maxEntries = limits.entries ?? MAX_ENTRIES, maxFile = limits.file ?? MAX_FILE_BYTES, maxTotal = limits.total ?? MAX_TOTAL_BYTES;
  if (!(bytes instanceof Uint8Array)) throw new Error("Not a zip file.");
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error("The archive is larger than " + MAX_ARCHIVE_BYTES / 1024 / 1024 + " MB.");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), eocd = findEocd(bytes, dv);
  if (eocd < 0) throw new Error(NOT_ZIP);
  const disk = dv.getUint16(eocd + 4, true), cdDisk = dv.getUint16(eocd + 6, true), count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true), cdAt = dv.getUint32(eocd + 16, true);
  if (disk !== 0 || cdDisk !== 0 || dv.getUint16(eocd + 8, true) !== count) throw new Error("Multi-disk zip files are not supported.");
  if (count === 0xffff || cdSize === 0xffffffff || cdAt === 0xffffffff) throw new Error(ZIP64);
  if (count > maxEntries) throw new Error("The archive has more than " + maxEntries + " entries.");
  if (cdAt + cdSize > eocd) throw new Error(NOT_ZIP);
  const dec = new TextDecoder("utf-8", { fatal: true }), jobs = [], seen = new Set();
  let p = cdAt;
  for (let i = 0; i < count; i++) {
    const h = readHeader(dv, bytes, p, eocd, dec);
    p = h.next;
    const job = acceptEntry(h, seen, maxFile);
    if (job) jobs.push(job);
  }
  if (p !== cdAt + cdSize) throw new Error("The zip central directory size does not match its entries.");
  const out = new Map();
  let total = 0;
  for (const j of jobs) {
    const data = await unpackEntry(bytes, dv, j, cdAt, maxFile);
    total += data.length;
    if (total > maxTotal) throw new Error("The archive unpacks to more than " + maxTotal / 1024 / 1024 + " MB.");
    out.set(j.name, new Uint8Array(data));
  }
  return out;
}

export const isArchiveName = (name) => typeof name === "string" && name.toLowerCase().endsWith(ARCHIVE_EXT);
