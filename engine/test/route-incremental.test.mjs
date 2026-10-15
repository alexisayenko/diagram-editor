// Incremental routing must equal a full re-route to the last bit: seeded random edit sequences on generated diagrams, each step routed with the
// state of the previous one and compared with a route from scratch (ADR-0020).
import test from "node:test";
import assert from "node:assert/strict";
import { generate } from "../../tools/bench.mjs";
import { prepareDiagram } from "../browser/render.mjs";
import { serverPath } from "../lib/files.mjs";

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

const pad = (i) => String(i).padStart(3, "0");
const blocks = (top) => top.split(/(?=\[\[connections\]\])/);

function ids(files) { return [...files.keys()].filter((k) => k.startsWith("servers/")).map((k) => k.slice(8, -5)).sort(); }

function newServer(files, rnd, id, region) {
  const tpl = [...files].find(([k]) => k.startsWith("servers/"))[1];
  const text = tpl.replace(/^id = .*$/m, `id = "${id}"`).replace(/^name = .*$/m, `name = "${id}.example.test"`).replace(/^region = .*$/m, `region = "${region}"`).replace(/^services = .*$/m, `services = ["Service N${Math.floor(rnd() * 9)}"]`);
  files.set(serverPath(id), text);
}

const OPS = {
  move(ctx) {
    const id = ctx.pick(ids(ctx.files)), g = ctx.saved.nodes[id];
    if (!g) return false;
    const dx = Math.round((ctx.rnd() - 0.5) * 160), dy = Math.round((ctx.rnd() - 0.5) * 160);
    g.x += dx; g.y += dy; g.title[0] += dx; g.title[1] += dy;
    return true;
  },
  tinyMove(ctx) {
    const id = ctx.pick(ids(ctx.files)), g = ctx.saved.nodes[id];
    if (!g) return false;
    g.x += 1; g.title[0] += 1;
    return true;
  },
  resize(ctx) {
    const id = ctx.pick(ids(ctx.files)), g = ctx.saved.nodes[id];
    if (!g) return false;
    g.w += Math.round(ctx.rnd() * 80);
    g.h += Math.round(ctx.rnd() * 40);
    return true;
  },
  regionResize(ctx) {
    const id = ctx.pick(Object.keys(ctx.saved.clusters)), c = ctx.saved.clusters[id];
    c.w += Math.round(ctx.rnd() * 120); c.h += Math.round(ctx.rnd() * 120);
    return true;
  },
  regionMove(ctx) {
    const id = ctx.pick(Object.keys(ctx.saved.clusters)), c = ctx.saved.clusters[id];
    const dx = Math.round((ctx.rnd() - 0.5) * 100), dy = Math.round((ctx.rnd() - 0.5) * 100);
    c.x += dx; c.y += dy; c.title[0] += dx; c.title[1] += dy;
    for (const n of Object.values(ctx.saved.nodes)) if (n.x >= c.x - dx && n.x <= c.x - dx + c.w && n.y >= c.y - dy && n.y <= c.y - dy + c.h) { n.x += dx; n.y += dy; n.title[0] += dx; n.title[1] += dy; }
    return true;
  },
  rename(ctx) {
    const id = ctx.pick(ids(ctx.files)), path = serverPath(id), long = ctx.rnd() < 0.5;
    ctx.files.set(path, ctx.files.get(path).replace(/^name = .*$/m, `name = "${id}${long ? "-a-considerably-longer-host-name-here" : "-x"}.example.test"`));
    ctx.refit.push(id);
    return true;
  },
  services(ctx) {
    const id = ctx.pick(ids(ctx.files)), path = serverPath(id), list = ctx.rnd() < 0.5 ? '"Extra service line", "Another one with a rather long description text"' : '"Only"';
    ctx.files.set(path, ctx.files.get(path).replace(/^services = .*$/m, `services = [${list}]`));
    ctx.refit.push(id);
    return true;
  },
  text(ctx) {
    const id = ctx.pick(ids(ctx.files)), path = serverPath(id);
    ctx.files.set(path, ctx.files.get(path).replace(/^role = .*$/m, `role = "Role ${Math.floor(ctx.rnd() * 99)}"`));
    return true;
  },
  addServer(ctx) {
    const all = ids(ctx.files), id = "srv" + pad(900 + ctx.counter++), regions = [...ctx.files.get("topology.toml").matchAll(/^\[\[regions\]\]\nid = "(.*)"/gm)].map((m) => m[1]);
    newServer(ctx.files, ctx.rnd, id, ctx.pick(regions));
    let top = ctx.files.get("topology.toml");
    for (let i = 0; i < 1 + Math.floor(ctx.rnd() * 3); i++) {
      const other = ctx.pick(all), out = ctx.rnd() < 0.5;
      top += `[[connections]]\nfrom = "${out ? id : other}"\nto = "${out ? other : id}"\nlabel = "TCP · port ${2000 + i}"\n${ctx.rnd() < 0.3 ? "firewall = true\n" : ""}\n`;
    }
    ctx.files.set("topology.toml", top);
    return true;
  },
  deleteServer(ctx) {
    const id = ctx.pick(ids(ctx.files));
    ctx.files.delete(serverPath(id));
    delete ctx.saved.nodes[id];
    const parts = blocks(ctx.files.get("topology.toml"));
    ctx.files.set("topology.toml", parts.filter((p, i) => i === 0 || !(p.includes(`from = "${id}"`) || p.includes(`to = "${id}"`))).join(""));
    return true;
  },
  addConnection(ctx) {
    const all = ids(ctx.files), a = ctx.pick(all), b = ctx.pick(all);
    if (a === b || ctx.files.get("topology.toml").includes(`from = "${a}"\nto = "${b}"`)) return false;
    ctx.files.set("topology.toml", ctx.files.get("topology.toml") + `[[connections]]\nfrom = "${a}"\nto = "${b}"\nlabel = "UDP · port ${3000 + ctx.counter++}"\n${ctx.rnd() < 0.4 ? "firewall = true\n" : ""}\n`);
    return true;
  },
  removeConnection(ctx) {
    const parts = blocks(ctx.files.get("topology.toml"));
    if (parts.length < 4) return false;
    parts.splice(1 + Math.floor(ctx.rnd() * (parts.length - 1)), 1);
    ctx.files.set("topology.toml", parts.join(""));
    return true;
  },
  swapConnections(ctx) {
    const parts = blocks(ctx.files.get("topology.toml"));
    if (parts.length < 4) return false;
    const i = 1 + Math.floor(ctx.rnd() * (parts.length - 1)), j = 1 + Math.floor(ctx.rnd() * (parts.length - 1));
    [parts[i], parts[j]] = [parts[j], parts[i]];
    ctx.files.set("topology.toml", parts.join(""));
    return true;
  },
  regionChange(ctx) {
    const id = ctx.pick(ids(ctx.files)), regions = [...ctx.files.get("topology.toml").matchAll(/^\[\[regions\]\]\nid = "(.*)"/gm)].map((m) => m[1]), path = serverPath(id);
    ctx.files.set(path, ctx.files.get(path).replace(/^region = .*$/m, `region = "${ctx.pick(regions)}"`));
    return true;
  },
  swapRegions(ctx) {
    const top = ctx.files.get("topology.toml"), parts = top.split(/(?=\[\[regions\]\])/);
    if (parts.length < 3) return false;
    const last = parts[parts.length - 1], conn = last.indexOf("[[connections]]"), tail = conn < 0 ? "" : last.slice(conn);
    parts[parts.length - 1] = conn < 0 ? last : last.slice(0, conn);
    [parts[1], parts[2]] = [parts[2], parts[1]];
    ctx.files.set("topology.toml", parts.join("") + tail);
    return true;
  },
  waypoint(ctx) {
    const keys = [...ctx.edges];
    if (!keys.length) return false;
    const k = ctx.pick(keys), g = ctx.saved.nodes[ctx.pick(Object.keys(ctx.saved.nodes))];
    ctx.saved.edges[k] = { ...ctx.saved.edges[k], via: [[g.x + 40, g.y + 40]] };
    return true;
  },
  fixedLabel(ctx) {
    const keys = [...ctx.edges];
    if (!keys.length) return false;
    const k = ctx.pick(keys), g = ctx.saved.nodes[ctx.pick(Object.keys(ctx.saved.nodes))];
    ctx.saved.edges[k] = { ...ctx.saved.edges[k], label: [g.x + 10, g.y + 10] };
    return true;
  },
  clearEdge(ctx) {
    const keys = Object.keys(ctx.saved.edges);
    if (!keys.length) return false;
    delete ctx.saved.edges[ctx.pick(keys)].via;
    return true;
  },
};
const OP_NAMES = Object.keys(OPS);

function measured(prepared, rnd) {
  if (rnd() < 0.6) return undefined;
  const w = {}, lw = {};
  for (const id of Object.keys(prepared.layout.nodes)) if (rnd() < 0.2) w[id] = prepared.layout.nodes[id].w + Math.round(rnd() * 50);
  for (const e of prepared.meta.edges) if (rnd() < 0.3) lw[e.k] = 40 + Math.round(rnd() * 100);
  return { w, lw };
}

function sequence(n, seed, steps, tally) {
  const rnd = rng(seed), pick = (a) => a[Math.floor(rnd() * a.length)];
  let files = generate(n), saved = null, prepared = prepareDiagram(files, "bench", saved, []);
  let state = prepared.kit.routeWith(prepared.layout, prepared.meta, { trace: true }, null).state;
  const log = [];
  for (let step = 0; step < steps; step++) {
    const nextFiles = new Map(files), nextSaved = structuredClone(prepared.layout), refit = [], name = pick(OP_NAMES);
    const ctx = { files: nextFiles, saved: nextSaved, refit, rnd, pick, counter: step + seed % 50, edges: prepared.meta.edges.map((e) => e.k) };
    let next;
    try {
      if (!OPS[name](ctx)) continue;
      next = prepareDiagram(nextFiles, "bench", nextSaved, refit);
    } catch {
      continue;
    }
    log.push(name);
    const o = measured(next, rnd);
    const inc = next.kit.routeWith(next.layout, next.meta, { ...o, trace: true }, state), full = next.kit.route(next.layout, next.meta, o);
    assert.equal(JSON.stringify(inc.routes), JSON.stringify(full), `n=${n} seed=${seed} step=${step} ops=${log.join(",")}: incremental routes differ from a full re-route`);
    assert.deepEqual(Object.keys(inc.routes), Object.keys(full));
    const fresh = next.kit.routeWith(next.layout, next.meta, { ...o, trace: true }, null).state.edges;
    for (const [k, rec] of Object.entries(inc.state.edges)) {
      const f = fresh[k];
      assert.deepEqual([rec.h1, rec.h2, rec.fwr?.h, rec.lbl?.h], [f.h1, f.h2, f.fwr?.h, f.lbl?.h], `n=${n} seed=${seed} step=${step} ops=${log.join(",")} edge ${k}: a reused result is not what a new search does`);
    }
    tally.steps++;
    tally.edges += next.meta.edges.length;
    tally.pass1 += inc.state.stats.pass1;
    tally.pass2 += inc.state.stats.pass2;
    tally.labels += inc.state.stats.labels;
    files = nextFiles; saved = nextSaved; prepared = next; state = inc.state;
  }
}

function suite(n, count, steps, seedBase) {
  test(`incremental routing equals a full re-route: ${count} random edit sequences on ${n} servers`, { timeout: 600000 }, () => {
    const tally = { steps: 0, edges: 0, pass1: 0, pass2: 0, labels: 0 };
    for (let i = 0; i < count; i++) sequence(n, seedBase + i, steps, tally);
    assert.ok(tally.steps > count * steps * 0.5, `only ${tally.steps} steps ran`);
    assert.ok(tally.pass1 < tally.edges * 0.8, `${tally.pass1} of ${tally.edges} first searches ran: nothing was reused`);
    assert.ok(tally.labels < tally.edges * 0.8, `${tally.labels} of ${tally.edges} labels were placed: nothing was reused`);
  });
}

suite(20, 150, 6, 1000);
suite(60, 50, 5, 2000);
suite(150, 12, 4, 3000);

function prepared(n) {
  const p = prepareDiagram(generate(n), "bench", null, []);
  return { ...p, first: p.kit.routeWith(p.layout, p.meta, undefined, null) };
}

test("an unchanged diagram reuses every search, label and marker", () => {
  const p = prepared(60), again = p.kit.routeWith(p.layout, p.meta, undefined, p.first.state);
  assert.deepEqual(again.state.stats, { pass1: 0, pass2: 0, fw: 0, labels: 0 });
  assert.equal(JSON.stringify(again.routes), JSON.stringify(p.first.routes));
  assert.ok(p.first.state.stats.pass1 > 0 && p.first.state.stats.fw > 0 && p.first.state.stats.labels > 0);
});

test("a state is never changed by a run that uses it: the same previous state gives the same routes", () => {
  const p = prepared(40), saved = structuredClone(p.layout);
  saved.nodes[Object.keys(saved.nodes)[3]].x += 90;
  const next = prepareDiagram(generate(40), "bench", saved, []);
  const a = next.kit.routeWith(next.layout, next.meta, undefined, p.first.state), b = next.kit.routeWith(next.layout, next.meta, undefined, p.first.state);
  assert.equal(JSON.stringify(a.routes), JSON.stringify(b.routes));
  assert.deepEqual(a.state.stats, b.state.stats);
  assert.equal(JSON.stringify(a.routes), JSON.stringify(next.kit.route(next.layout, next.meta)));
});

test("a moved server leaves routes far from it alone", () => {
  const p = prepared(100), saved = structuredClone(p.layout), id = Object.keys(saved.nodes)[0];
  saved.nodes[id].x += 3; saved.nodes[id].title[0] += 3;
  const next = prepareDiagram(generate(100), "bench", saved, []), inc = next.kit.routeWith(next.layout, next.meta, undefined, p.first.state);
  assert.ok(inc.state.stats.pass2 < p.first.state.stats.pass2 * 0.8, `${inc.state.stats.pass2} of ${p.first.state.stats.pass2} final searches ran again`);
  assert.equal(JSON.stringify(inc.routes), JSON.stringify(next.kit.route(next.layout, next.meta)));
});

test("a previous state of another version or an unusable one is ignored", () => {
  const p = prepared(20), full = JSON.stringify(p.first.routes);
  for (const prev of [{}, { v: 2 }, null, undefined]) assert.equal(JSON.stringify(p.kit.routeWith(p.layout, p.meta, undefined, prev).routes), full);
});
