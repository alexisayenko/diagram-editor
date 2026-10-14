#!/usr/bin/env node
// Synthetic-diagram benchmark: node tools/bench.mjs [--sizes 50,100,200,400] [--runs 5] [--out result.json]
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { tomlModel, mergeFolder } from "../engine/parse/toml.mjs";
import { parseNetworksFile, withDerived, assignNetwork } from "../engine/parse/shared-networks.mjs";
import { parseConfig, checkConnections } from "../engine/model/config.mjs";
import { edgeKey } from "../engine/model/edges.mjs";
import { geometryKit, geometryMeta } from "../engine/render/geometry.mjs";
import { autoLayoutKit } from "../engine/render/auto-layout.mjs";
import { drawKit } from "../engine/render/draw-kit.mjs";
import { renderModel } from "../engine/render/pipeline.mjs";
import { resolveTypes } from "../engine/parse/types.mjs";
import { renderSvg } from "../engine/render/svg.mjs";
import { buildNetworks } from "../engine/parse/shared-networks.mjs";
import { osInfo } from "../engine/model/os.mjs";
import { renderDiagram } from "../engine/browser/render.mjs";
import { setServer } from "../engine/parse/toml-write.mjs";
import { serverPath, NETWORKS_FILE } from "../engine/lib/files.mjs";
import { css, script } from "../engine/page/assets.mjs";

const TYPES = ["web", "application", "oracle", "cache", "nas", "statistics"];
const OSES = ["Ubuntu 22.04 LTS Jammy", "Debian 12 Bookworm", "Rocky Linux 9.3", "Windows Server 2022"];
const BLOCKS = ["192.0.2", "198.51.100", "203.0.113"];
const pad = (i) => String(i).padStart(3, "0");

// Deterministic synthetic diagram of n servers; fictional names and RFC 5737 addresses only.
export function generate(n) {
  const files = new Map(), regions = Math.max(4, Math.round(n / 12));
  const rid = (r) => "region" + pad(r);
  let top = `id = "bench"\ntitle = "Synthetic benchmark ${n}"\n\n`;
  for (let r = 0; r < regions; r++) top += `[[regions]]\nid = "${rid(r)}"\ntitle = "Region ${r + 1}"\nserver_type = "${TYPES[r % TYPES.length]}"\n\n`;
  const sid = (i) => "srv" + pad(i);
  for (let i = 0; i < n; i++) {
    const block = BLOCKS[i % BLOCKS.length], host = 1 + Math.floor(i / BLOCKS.length) % 250;
    files.set(serverPath(sid(i)), [
      `id = "${sid(i)}"`, `name = "${sid(i)}.example.test"`, `region = "${rid(i % regions)}"`,
      `services = ["Service A${i % 7}", "Service B${i % 5}: node ${i}"]`, `ips = ["${block}.${host}/24"]`,
      `os = "${OSES[i % OSES.length]}"`, `role = "Role ${i % 9}"`,
      `details = "Synthetic server ${i}.\\n\\nSecond paragraph of notes."`, "",
    ].join("\n"));
  }
  const edges = new Set();
  const target = Math.round(n * 1.5);
  for (let i = 0; edges.size < target && i < target * 20; i++) {
    const a = (i * 7 + 3) % n, b = i % 3 === 0 ? (a + regions) % n : (i * 13 + 1 + (i % 5)) % n, k = edges.size;
    if (a === b || edges.has(a + ">" + b)) continue;
    edges.add(a + ">" + b);
    top += `[[connections]]\nfrom = "${sid(a)}"\nto = "${sid(b)}"\nlabel = "TCP · port ${1000 + (k % 50)}"\n${k % 11 === 0 ? "firewall = true\n" : ""}\n`;
  }
  files.set("topology.toml", top);
  let nets = "";
  for (let b = 0; b < BLOCKS.length; b++) nets += `[[networks]]\ncidr = "${BLOCKS[b]}.0/24"\nname = "Network ${b + 1}"\ndescription = "Synthetic segment"\n\n`;
  for (let b = 0; b < BLOCKS.length; b++) for (let s = 0; s < 4; s++) nets += `[[networks]]\ncidr = "${BLOCKS[b]}.${s * 64}/26"\nname = "Segment ${b + 1}.${s + 1}"\n\n`;
  files.set(NETWORKS_FILE, nets);
  const notes = Array.from({ length: 5 }, (_, i) => `"Note ${i + 1}\\nDate: 2026-01-0${i + 1}\\n\\nSynthetic note text for item ${i + 1}."`);
  files.set("notes.toml", `notes = [\n  ${notes.join(",\n  ")},\n]\n`);
  return files;
}

export function writeFolder(files, dir) {
  mkdirSync(join(dir, "servers"), { recursive: true });
  for (const [path, text] of files) writeFileSync(join(dir, path), text);
}

export const assets = () => ({ cssSvg: css("svg"), cssPage: css("page"), js: script() });

const ms = (fn) => { const t = performance.now(); const value = fn(); return { t: performance.now() - t, value }; };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };
const p95 = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)]; };

function prepared(files, folder) {
  const defined = parseNetworksFile(files.get(NETWORKS_FILE));
  const ips = [...tomlModel(files, folder).model.nodes.values()].flatMap((nd) => nd.ip);
  const all = withDerived(defined, ips), networks = all.length ? all : null;
  const nets = networks && { of: (ip) => networks[assignNetwork(networks, ip)] ?? null };
  return { networks, nets };
}

// One timed pass; each stage returns its own milliseconds.
export function measureOnce(files, folder, assetBundle) {
  const out = {};
  let r = ms(() => tomlModel(files, folder));
  out.parse = r.t;
  r = ms(() => prepared(files, folder));
  const { networks, nets } = r.value;
  out.networks = r.t;
  const parsed = ms(() => tomlModel(files, folder, nets)).value;
  const { config: raw, model, sections, notes, docs } = parsed;
  r = ms(() => {
    const config = parseConfig(JSON.stringify(raw), raw.id);
    checkConnections(config, model.edges.map(edgeKey), model.nodes);
    return config;
  });
  const config = r.value;
  out.model = r.t;
  r = ms(() => ({ meta: geometryMeta(model, config.groups, config.processes), kit: geometryKit() }));
  const { meta, kit } = r.value;
  const layout = { clusters: {}, nodes: {}, edges: {} };
  r = ms(() => {
    autoLayoutKit(kit).fill(layout, meta);
    for (const id of model.nodes.keys()) kit.fitBox(layout.nodes[id], meta.nodes[id]);
    for (const id of model.clusters.keys()) kit.fitRegion(layout, meta, id);
  });
  out.layout = r.t + 0;
  const drawings = drawKit().validate(undefined);
  const shared = networks;
  r = ms(() => kit.route(layout, meta));
  out.route = r.t;
  const routes = r.value;
  r = ms(() => buildNetworks(networks, model, layout));
  const { nets: nn, ipNet } = r.value;
  out.deriveNetworks = r.t;
  const { ent, typeList } = resolveTypes(model, layout, config.proposedLabel);
  for (const nd of model.nodes.values()) if (ent["n:" + nd.id]) ent["n:" + nd.id].os = osInfo(nd.fields.os);
  r = ms(() => renderSvg({ model, layout, ent, nets: nn, ipNet, routes, groups: config.groups, meta }));
  out.render = r.t;
  r = ms(() => renderModel({ config, model, layout, meta, kit, sections, notes, docs, drawings, assets: assetBundle, networks: shared }));
  out.pipeline = r.t;
  out.pageBytes = Buffer.byteLength(r.value.html);
  out.svgBytes = Buffer.byteLength(r.value.svgBody);
  out.dataBytes = Buffer.byteLength(r.value.dataJson);
  out.srcdocBytes = out.pageBytes;
  void typeList;
  return out;
}

// The page's server-edit path without the browser: setServer on the file, then a full render with the layout of the previous render.
export function measureEdit(files, folder, assetBundle) {
  const first = renderDiagram(files, folder, null, assetBundle, []);
  const id = "srv010";
  const path = serverPath(id);
  const t0 = performance.now();
  const root = mergeFolder(files), s = root.servers.find((x) => x.id === id);
  const fields = { name: s.name + "-x", details: s.details ?? "", ...Object.fromEntries(["os", "hardware", "cpu", "ram", "swap", "disk", "role"].map((k) => [k, s[k] ?? ""])) };
  for (const k of ["ips", "dns", "jobs", "rmi_services", "systemd_services", "services"]) fields[k] = s[k] ?? [];
  const next = setServer(files.get(path), id, fields, root);
  const t1 = performance.now();
  const work = new Map(files).set(path, next);
  const result = renderDiagram(work, folder, first.layout, assetBundle, [id]);
  const t2 = performance.now();
  return { write: t1 - t0, rebuild: t2 - t1, total: t2 - t0, bytes: Buffer.byteLength(result.html) };
}

export function bench(sizes, runs, log = () => {}) {
  const assetBundle = assets(), result = {};
  for (const n of sizes) {
    const files = generate(n), dir = mkdtempSync(join(tmpdir(), "bench-" + n + "-"));
    try {
      writeFolder(files, dir);
      const folderName = "bench";
      measureOnce(files, folderName, assetBundle);
      const samples = Array.from({ length: runs }, () => measureOnce(files, folderName, assetBundle));
      const edits = Array.from({ length: runs }, () => measureEdit(files, folderName, assetBundle));
      const row = {};
      for (const k of Object.keys(samples[0])) {
        const v = samples.map((s) => s[k]);
        row[k] = k.endsWith("Bytes") ? v[0] : { median: median(v), p95: p95(v) };
      }
      row.edit = { median: median(edits.map((e) => e.total)), p95: p95(edits.map((e) => e.total)), write: median(edits.map((e) => e.write)), rebuild: median(edits.map((e) => e.rebuild)) };
      row.connections = (files.get("topology.toml").match(/\[\[connections\]\]/g) || []).length;
      result[n] = row;
      log(n, row);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  return result;
}

const f = (x) => (x.median ?? x).toFixed(1).padStart(10);
function table(result) {
  const cols = ["parse", "networks", "model", "layout", "route", "deriveNetworks", "render", "pipeline"];
  const lines = ["servers " + cols.map((c) => c.padStart(10)).join("") + "  edit(med/p95)  page(KB)  data(KB)"];
  for (const [n, row] of Object.entries(result)) {
    lines.push(String(n).padEnd(7) + " " + cols.map((c) => f(row[c])).join("") + `  ${row.edit.median.toFixed(0).padStart(5)}/${row.edit.p95.toFixed(0).padEnd(5)}  ${(row.pageBytes / 1024).toFixed(0).padStart(8)}  ${(row.dataBytes / 1024).toFixed(0).padStart(8)}`);
  }
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name, dflt) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : dflt; };
  const sizes = arg("sizes", "50,100,200,400").split(",").map(Number), runs = Number(arg("runs", "5")), out = arg("out", null);
  const result = bench(sizes, runs);
  console.log("ms, median of " + runs + " runs (parse = one tomlModel pass; networks = IP scan + derive; layout = restore, auto-layout, fit)");
  console.log(table(result));
  if (out) writeFileSync(out, JSON.stringify({ runs, node: process.version, result }, null, 2));
}
