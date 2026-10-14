// Relative performance guards (scaling ratios, never absolute times) on synthetic diagrams (method and numbers: docs/tech/performance.md). Skipped when CI_SLOW is set.
import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { generate, assets } from "../../tools/bench.mjs";
import { renderDiagram } from "../browser/render.mjs";

const skip = process.env.CI_SLOW ? "CI_SLOW is set" : false;
const bundle = assets();
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) / 2)];

function measure(n, runs) {
  const files = generate(n), times = [];
  let html = "";
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    html = renderDiagram(files, "bench", null, bundle, []).html;
    times.push(performance.now() - t);
  }
  return { ms: median(times), bytes: Buffer.byteLength(html) };
}

test("the generator is deterministic and uses documentation addresses only", { skip }, () => {
  const a = generate(30), b = generate(30);
  assert.deepEqual([...a], [...b]);
  assert.equal([...a.keys()].filter((k) => k.startsWith("servers/")).length, 30);
  const ips = [...a.values()].join("\n").match(/\d+\.\d+\.\d+\.\d+/g) ?? [];
  assert.ok(ips.length > 0 && ips.every((ip) => /^(192\.0\.2|198\.51\.100|203\.0\.113)\./.test(ip)), "only RFC 5737 ranges");
});

test("doubling the servers costs well under 8x, and the page stays small", { skip, timeout: 120000 }, () => {
  measure(30, 1);
  const small = measure(100, 3), medium = measure(200, 3);
  const ratio = medium.ms / small.ms;
  assert.ok(ratio < 8, `200 servers cost ${ratio.toFixed(1)}x of 100 (ceiling 8x; measured about 3.5x after the indexed router, 5x before)`);
  assert.ok(medium.bytes < 1.5 * 1024 * 1024, `200-server page is ${medium.bytes} bytes (ceiling 1.5 MB)`);
});

test("cost does not blow up beyond the measured scaling from 100 to 400 servers", { skip, timeout: 300000 }, () => {
  measure(30, 1);
  const small = measure(100, 3), large = measure(400, 2);
  const ratio = large.ms / small.ms, sizeRatio = large.bytes / small.bytes;
  assert.ok(sizeRatio < 6, `page size grew ${sizeRatio.toFixed(1)}x for 4x the servers (ceiling 6x)`);
  assert.ok(ratio < 20, `400 servers cost ${ratio.toFixed(1)}x of 100 (ceiling 20x; measured about 13x after the indexed router, 23x before)`);
});

test("an edit that changes no box reuses the routes and is far cheaper than a full render", { skip, timeout: 120000 }, () => {
  const files = generate(150);
  const first = renderDiagram(files, "bench", null, bundle, []);
  const t0 = performance.now();
  const full = renderDiagram(files, "bench", first.layout, bundle, ["srv010"]);
  const fullMs = performance.now() - t0, t1 = performance.now();
  const cached = renderDiagram(files, "bench", first.layout, bundle, ["srv010"], first.routeCache);
  const cachedMs = performance.now() - t1;
  assert.equal(cached.html, full.html);
  assert.ok(cachedMs * 3 < fullMs, `cached ${cachedMs.toFixed(0)} ms, full ${fullMs.toFixed(0)} ms (cached must be under a third)`);
});
