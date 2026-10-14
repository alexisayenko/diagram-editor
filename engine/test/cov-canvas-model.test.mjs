import test from "node:test";
import assert from "node:assert/strict";
import { makePage, loadModel, clone } from "./cov-canvas.mjs";
import { plain } from "./cov-dom.mjs";

const setup = (opts) => { const page = makePage(opts); return { page, model: loadModel(page) }; };

test("model exposes the shared draft state seeded from the saved layout", () => {
  const { page, model } = setup();
  assert.equal(model.base, page.D.layout);
  assert.deepEqual(model.state.st, page.D.layout);
  assert.notEqual(model.state.st, model.base);
  assert.equal(model.state.on, false);
  assert.deepEqual(model.clone({ a: [1, { b: 2 }] }), { a: [1, { b: 2 }] });
});

test("apply moves a server with its title, body and ip rows, and leaves the source untouched", () => {
  const { model } = setup();
  const from = model.base, before = clone(from), g = from.nodes.db01;
  const s = model.apply(from, "n:db01", 7, -3);
  assert.equal(s.nodes.db01.x, g.x + 7);
  assert.equal(s.nodes.db01.y, g.y - 3);
  assert.deepEqual(s.nodes.db01.title, [g.title[0] + 7, g.title[1] - 3]);
  assert.deepEqual(s.nodes.db01.body[0], [g.body[0][0] + 7, g.body[0][1] - 3]);
  assert.deepEqual(s.nodes.db01.ip[0], [g.ip[0][0] + 7, g.ip[0][1] - 3]);
  assert.deepEqual(from, before);
  assert.deepEqual(s.nodes.web01, from.nodes.web01);
});

test("apply on a server dragged far outside its region grows that region; a standalone server does not", () => {
  const { model } = setup();
  const r = model.base.clusters.db, far = model.apply(model.base, "n:db01", 2000, 0);
  assert.ok(far.clusters.db.x + far.clusters.db.w >= model.base.nodes.db01.x + 2000);
  assert.equal(far.clusters.db.x, r.x);
  const alone = model.apply(model.base, "n:batch01", 500, 500);
  assert.deepEqual(alone.clusters, model.base.clusters);
  assert.equal(alone.nodes.batch01.x, model.base.nodes.batch01.x + 500);
});

test("apply on a region moves the region, its title and every server inside it", () => {
  const { page, model } = setup();
  const s = model.apply(model.base, "c:app", 10, 20), b = model.base;
  assert.equal(s.clusters.app.x, b.clusters.app.x + 10);
  assert.deepEqual(s.clusters.app.title, [b.clusters.app.title[0] + 10, b.clusters.app.title[1] + 20]);
  for (const n of page.D.kids.app) assert.equal(s.nodes[n].y, b.nodes[n].y + 20, n);
  assert.deepEqual(s.nodes.web01, b.nodes.web01);
  assert.deepEqual(s.clusters.web, b.clusters.web);
});

test("apply ignores hidden servers and unknown keys", () => {
  const { model } = setup();
  const src = model.clone(model.base);
  src.nodes.db01.hidden = true;
  assert.deepEqual(model.apply(src, "n:db01", 50, 50).nodes.db01, src.nodes.db01);
  assert.deepEqual(model.apply(model.base, "x:db01", 5, 5), model.base);
});

test("resize moves only the dragged sides and never the servers", () => {
  const { model } = setup();
  const b = model.base.clusters.web, s = model.resize(model.base, "web", "se", 30, 40);
  assert.equal(s.clusters.web.x, b.x);
  assert.equal(s.clusters.web.w, b.w + 30);
  assert.equal(s.clusters.web.h, b.h + 40);
  assert.deepEqual(s.nodes, model.base.nodes);
  const w = model.resize(model.base, "web", "w", -25, 0);
  assert.equal(w.clusters.web.x, b.x - 25);
  assert.equal(w.clusters.web.w, b.w + 25);
});

test("resize cannot shrink a region below its servers", () => {
  const { model } = setup();
  const s = model.resize(model.base, "web", "e", -5000, 0), g = s.clusters.web, n = s.nodes.web01;
  assert.ok(g.w > 0);
  assert.ok(g.x + g.w >= n.x + n.w);
});

test("each enumerates regions and servers with their element indices, optional ones included", () => {
  const { page, model } = setup();
  const seen = {};
  model.each((key, idxs) => { seen[key] = idxs; });
  assert.deepEqual(plain(seen["c:web"]), [0, 1, 2]);
  const e = page.D.idx.nodes.app02;
  assert.deepEqual(plain(seen["n:app02"]), [e.c, e.t, e.r, ...e.b, ...e.i, e.o]);
  const noOpt = clone(page.D.idx.nodes.web01);
  delete noOpt.o;
  page.D.idx.nodes.web01 = noOpt;
  const again = {};
  model.each((key, idxs) => { again[key] = idxs; });
  assert.equal(again["n:web01"].length, seen["n:web01"].length - 1);
});

test("point maps client coordinates through the inverse screen matrix, or passes them through without one", () => {
  const { page, model } = setup();
  const a = model.point({ clientX: 10, clientY: 20 });
  assert.deepEqual([a.x, a.y], [10, 20]);
  page.svg.ctm = { a: 2, e: 100, f: 50 };
  const p = model.point({ clientX: 300, clientY: 150 });
  assert.deepEqual([p.x, p.y], [100, 50]);
  page.svg.ctm = null;
  const q = model.point({ clientX: 7, clientY: 8 });
  assert.deepEqual([q.x, q.y], [7, 8]);
});

test("regionAt returns the smallest region containing the point, or null", () => {
  const { model } = setup();
  const s = { clusters: { big: { x: 0, y: 0, w: 500, h: 500 }, small: { x: 100, y: 100, w: 100, h: 100 } } };
  assert.equal(model.regionAt(s, { x: 150, y: 150 }), "small");
  assert.equal(model.regionAt(s, { x: 400, y: 400 }), "big");
  assert.equal(model.regionAt(s, { x: 500, y: 500 }), "big");
  assert.equal(model.regionAt(s, { x: 501, y: 10 }), null);
});

test("render writes geometry to the elements, routes edges and hands the saved state to skins", () => {
  const { page, model } = setup();
  const s = model.apply(model.base, "n:db01", 12, 8), idx = page.D.idx;
  model.render(s);
  const r = page.els[idx.nodes.db01.r], c = page.els[idx.clusters.db[0]];
  assert.equal(r.attrs.x, String(s.nodes.db01.x));
  assert.equal(r.attrs.width, String(s.nodes.db01.w));
  assert.equal(c.attrs.height, String(s.clusters.db.h));
  assert.equal(page.els[idx.clusters.db[1]].attrs.x, String(s.clusters.db.title[0]));
  assert.equal(page.els[idx.nodes.db01.b[0]].attrs.y, String(s.nodes.db01.body[0][1]));
  assert.equal(page.els[idx.nodes.db01.i[0]].attrs.x, String(s.nodes.db01.ip[0][0]));
  assert.equal(page.skins.synced, s);
  assert.ok(page.ctx.routes["app01>db01"].d);
  assert.equal(page.els[idx.edges["app01>db01"].p].attrs.d, page.ctx.routes["app01>db01"].d);
  const lab = page.ctx.routes["app01>db01"].label;
  assert.equal(page.els[idx.edges["app01>db01"].l].attrs.x, String(lab[0]));
});

test("render moves the firewall marker group with the route and sets its text anchor", () => {
  const { page, model } = setup();
  model.render(model.base);
  const e = page.D.idx.edges["web01>app01"], fg = page.els[e.fw], fw = page.ctx.routes["web01>app01"].fw;
  assert.ok(fw);
  assert.equal(fg.paths[0].attrs.transform, `translate(${fw.at.join(" ")}) rotate(${fw.a})`);
  assert.equal(fg.paths[1].attrs.transform, fg.paths[0].attrs.transform);
  assert.equal(fg.text.attrs["text-anchor"], fw.anchor);
  assert.equal(fg.text.attrs.x, String(fw.label[0]));
});

test("render builds the resize handles once, with arcs on the corners and bands on the sides, then repositions them", () => {
  const { page, model } = setup();
  model.render(model.base);
  const layer = page.svg.children.at(-1);
  assert.equal(layer.attrs.id, "rh");
  assert.equal(layer.children.length, 8 * Object.keys(page.D.idx.clusters).length);
  const g = model.base.clusters.web, mine = layer.children.filter((h) => h.attrs["data-rc"] === "web");
  const by = Object.fromEntries(mine.map((h) => [h.attrs["data-rs"], h]));
  assert.equal(by.nw.tagName, "PATH");
  assert.match(by.nw.attrs.d, /^M-?[\d.]+ -?[\d.]+A14 14 0 0 1/);
  assert.equal(by.n.tagName, "RECT");
  assert.equal(by.n.attrs.x, String(g.x + 14));
  assert.equal(by.n.attrs.y, String(g.y - 4));
  assert.equal(by.n.attrs.height, "8");
  assert.equal(by.e.attrs.x, String(g.x + g.w - 4));
  assert.equal(by.se.attrs.class, "rh rh-se");
  const moved = model.resize(model.base, "web", "e", 60, 0);
  model.render(moved);
  assert.equal(page.svg.children.length, 1);
  assert.equal(by.e.attrs.x, String(moved.clusters.web.x + moved.clusters.web.w - 4));
  const tiny = model.clone(model.base);
  tiny.clusters.web.w = 10;
  model.render(tiny);
  assert.equal(by.n.attrs.width, "0");
});

test("markBad outlines overlapping servers only while edit mode is on", () => {
  const { page, model } = setup();
  const s = model.clone(model.base), a = s.nodes.app01, d = s.nodes.db01;
  d.x = a.x; d.y = a.y;
  model.render(s);
  const idx = page.D.idx.nodes;
  assert.ok(!page.els[idx.app01.r].classes.has("bad"));
  model.state.on = true;
  model.render(s);
  assert.ok(page.els[idx.app01.r].classes.has("bad") || page.els[idx.db01.r].classes.has("bad"));
  assert.ok(!page.els[idx.web01.r].classes.has("bad"));
  model.render(model.base);
  assert.ok(!page.els[idx.app01.r].classes.has("bad"));
  assert.ok(!page.els[idx.db01.r].classes.has("bad"));
});

test("with system information off, a card with OS or hardware rows is shortened and its IP rows move up", () => {
  const { page, model } = setup({ sys: false });
  const id = "batch01", m = page.D.meta.nodes[id], g = model.base.nodes[id], rows = Number(!!m.hw) + Number(!!m.os);
  assert.ok(rows > 0);
  const v = page.hooks.viewNode(id, g);
  assert.equal(v.h, Math.max(g.h - 16 * rows, 20 + 16 * m.nb + 18 * m.ni));
  assert.deepEqual(plain(v.ip[0]), [g.ip[0][0], g.ip[0][1] - 16 * rows]);
  assert.equal(page.hooks.viewNode("app02", model.base.nodes.app02), model.base.nodes.app02);
  assert.equal(page.hooks.viewNode("ghost", g), g);
  const all = page.hooks.view(model.base);
  assert.equal(all.nodes[id].h, v.h);
  assert.equal(all.clusters, model.base.clusters);
  model.render(model.base);
  assert.equal(page.els[page.D.idx.nodes[id].r].attrs.height, String(v.h));
});

test("with system information on, view returns the state itself", () => {
  const { page, model } = setup();
  assert.equal(page.hooks.view(model.base), model.base);
  assert.equal(page.hooks.viewNode("batch01", model.base.nodes.batch01), model.base.nodes.batch01);
});

test("services: rerender and route use the current state, and do nothing without one", () => {
  const { page, model } = setup();
  page.hooks.rerender();
  page.hooks.route();
  assert.equal(page.skins.synced, undefined);
  assert.equal(page.ctx.routes, undefined);
  const s = model.apply(model.base, "n:app02", 20, 0);
  page.core.provide("getState", () => s);
  page.hooks.rerender();
  assert.equal(page.skins.synced, s);
  page.hooks.route();
  assert.ok(page.ctx.routes["app02>cache"]);
  assert.equal(typeof page.hooks.title, "function");
});

test("routing skips connections without a computed route", () => {
  const { page, model } = setup();
  page.D.idx.edges.ghost = { p: 0, l: -1 };
  assert.doesNotThrow(() => model.render(model.base));
});
