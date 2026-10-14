import test from "node:test";
import assert from "node:assert/strict";
import { mergeFolder, tomlModel } from "../parse/toml.mjs";
import { addRegion, moveServer, freeRegionTypes } from "../parse/toml-write.mjs";
import { renderDiagram } from "../browser/render.mjs";
import { css, script } from "../page/assets.mjs";
import { demo, mini, mod, withFile } from "./helpers.mjs";
import { newDiagram } from "../parse/new-diagram.mjs";

const assets = { cssSvg: css("svg"), cssPage: css("page"), js: script() };

test("freeRegionTypes lists only the types without a region", () => {
  const free = freeRegionTypes(demo()).map((t) => t.id);
  for (const used of ["web", "application", "oracle", "cache"]) assert.ok(!free.includes(used), used);
  assert.ok(free.includes("batch") && free.includes("mongo"));
  assert.deepEqual(freeRegionTypes(demo()).find((t) => t.id === "batch"), { id: "batch", label: "Batch Server" });
});

test("addRegion appends a region after the last one, id and title from the type", () => {
  const files = demo(), r = addRegion(files, { server_type: "batch" });
  assert.deepEqual([r.path, r.id], ["topology.toml", "batch"]);
  const regions = mergeFolder(withFile(files, r.path, r.text)).regions;
  assert.deepEqual({ ...regions.at(-1) }, { id: "batch", title: "Batch Server", server_type: "batch" });
  assert.ok(r.text.indexOf('id = "batch"') < r.text.indexOf("[[connections]]"));
  assert.equal(r.text.replace(/\n\n\[\[regions\]\]\nid = "batch"\ntitle = "Batch Server"\nserver_type = "batch"/, ""), files.get("topology.toml"));
});

test("addRegion works on a new diagram with no regions, and keeps CRLF files", () => {
  const files = newDiagram("fresh"), r = addRegion(files, { server_type: "database" });
  assert.equal(r.text, 'format_version = "1"\nid = "fresh"\ntitle = "Fresh"\n\n[[regions]]\nid = "database"\ntitle = "Database"\nserver_type = "database"\n');
  tomlModel(withFile(files, r.path, r.text));
  const crlf = withFile(files, "topology.toml", 'id = "fresh"\r\ntitle = "Fresh"\r\n\r\n[[regions]]\r\nid = "x"\r\ntitle = "X"\r\nserver_type = "gateway"\r\n');
  assert.ok(!addRegion(crlf, { server_type: "server" }).text.replace(/\r\n/g, "").includes("\n"));
  const noEol = withFile(files, "topology.toml", 'id = "fresh"\ntitle = "Fresh"');
  assert.equal(addRegion(noEol, { server_type: "server" }).text, 'id = "fresh"\ntitle = "Fresh"\n\n[[regions]]\nid = "server"\ntitle = "Server"\nserver_type = "server"\n');
});

test("addRegion refuses a second region for a type and unknown types", () => {
  const files = demo();
  assert.throws(() => addRegion(files, { server_type: "web" }), /already has the region 'web'/);
  assert.throws(() => addRegion(files, { server_type: "nope" }), /Unknown server type/);
  assert.throws(() => addRegion(files, {}), /Unknown server type/);
  const once = addRegion(files, { server_type: "mongo" });
  assert.throws(() => addRegion(withFile(files, once.path, once.text), { server_type: "mongo" }), /at most one region per server type/);
});

test("addRegion picks a free id when a server already has the type's id", () => {
  const files = withFile(mini(), "servers/web.toml", 'server_type = "web"\n');
  assert.equal(addRegion(files, { server_type: "web" }).id, "web-region");
});

test("a type is used up once its region exists, until every type has one", () => {
  let files = newDiagram("all");
  for (let free = freeRegionTypes(files); free.length; free = freeRegionTypes(files)) {
    const r = addRegion(files, { server_type: free[0].id });
    files = withFile(files, r.path, r.text);
  }
  assert.equal(mergeFolder(files).regions.length, Object.keys(mergeFolder(files).regions.reduce((o, r) => ({ ...o, [r.server_type]: 1 }), {})).length);
  assert.deepEqual(freeRegionTypes(files), []);
});

test("moveServer into a region sets region and adopts the type only when the file has its own", () => {
  const files = demo(), inherited = moveServer(files, "web01", "app");
  assert.equal(inherited.text, files.get("servers/web01.toml").replace('region = "web"', 'region = "app"'));
  const own = withFile(files, "servers/batch01.toml", "id = \"batch01\"\nserver_type = \"batch\"\n");
  const moved = moveServer(own, "batch01", "db");
  assert.equal(moved.text, 'id = "batch01"\nserver_type = "oracle"\nregion = "db"\n');
  const s = mergeFolder(withFile(own, moved.path, moved.text)).servers.find((x) => x.id === "batch01");
  assert.deepEqual([s.region, s.server_type], ["db", "oracle"]);
  assert.throws(() => moveServer(files, "web01", "nope"), /Unknown region/);
  assert.throws(() => moveServer(files, "nope", "web"), /no file/);
});

test("moveServer out of every region clears region and keeps the inherited type", () => {
  const files = demo(), out = moveServer(files, "web01", null);
  assert.ok(!/^region/m.test(out.text));
  assert.match(out.text, /^server_type = "web"$/m);
  const s = mergeFolder(withFile(files, out.path, out.text)).servers.find((x) => x.id === "web01");
  assert.deepEqual([s.region, s.server_type], [undefined, "web"]);
  const kept = moveServer(withFile(files, "servers/web01.toml", 'id = "web01"\nserver_type = "cache"\nregion = "web"\nname = "w"\n'), "web01", null);
  assert.equal(kept.text, 'id = "web01"\nserver_type = "cache"\nname = "w"\n');
  assert.equal(moveServer(files, "batch01", null).text, files.get("servers/batch01.toml"));
  assert.equal(moveServer(files, "web01", "web").text, files.get("servers/web01.toml"));
});

test("a new region keeps its saved position and size across renders, and a moved server follows its region", () => {
  const files = demo(), first = renderDiagram(files, "demo", null, assets), r = addRegion(files, { server_type: "batch" });
  const work = withFile(files, r.path, r.text), saved = { version: 1, diagramId: first.id, ...first.layout };
  saved.clusters.batch = { x: 2000, y: 100, w: 220, h: 120, title: [2110, 120] };
  const again = renderDiagram(work, "demo", saved, assets);
  assert.deepEqual(again.layout.clusters.batch, saved.clusters.batch);
  const m = moveServer(work, "batch01", "batch"), layout = { ...saved, nodes: { ...again.layout.nodes } };
  layout.nodes.batch01 = { ...layout.nodes.batch01, x: 2020, y: 160 };
  layout.nodes.batch01.title = [2030, 154];
  const final = renderDiagram(withFile(work, m.path, m.text), "demo", layout, assets);
  const c = final.layout.clusters.batch, n = final.layout.nodes.batch01;
  assert.ok(c.x <= n.x && c.y < n.y && c.x + c.w >= n.x + n.w && c.y + c.h >= n.y + n.h);
  assert.equal(final.layout.clusters.web.x, again.layout.clusters.web.x);
  assert.equal(mod(work, "topology.toml", "[[connections]]", "[[connections]]").size, work.size);
});
