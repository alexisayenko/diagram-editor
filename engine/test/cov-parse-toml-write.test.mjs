import test from "node:test";
import assert from "node:assert/strict";
import { parseToml, mergeFolder, tomlModel } from "../parse/toml.mjs";
import { setNotes, formatNotes, setServer, checkServerFields, addServer, setKeys, duplicateServer, freeRegionTypes, addRegion, moveServer, SERVER_STRINGS, SERVER_LISTS } from "../parse/toml-write.mjs";
import { mini, demo as loadDemo } from "./helpers.mjs";

const demoFiles = loadDemo();
const blank = { name: "a", os: "", hardware: "", cpu: "", ram: "", swap: "", disk: "", role: "", ips: [], dns: [], jobs: [], rmi_services: [], systemd_services: [], details: "" };
const withRegions = (extra = "") => mini(`title = "t"\n\n[[regions]]\nid = "r1"\ntitle = "R1"\nserver_type = "web"\n\n[[regions]]\nid = "r2"\ntitle = "R2"\nserver_type = "cache"\n${extra}`, { "servers/b.toml": 'id = "b"\nserver_type = "web"\n' }, 'id = "a"\nregion = "r1"\n');

test("notes: appended to a file without keys or tables, with CRLF, BOM and no trailing newline", () => {
  assert.equal(setNotes("", ["n"]), 'notes = [\n  """\nn""",\n]\n');
  assert.equal(setNotes('a = "1"', ["n"]), 'a = "1"\nnotes = [\n  """\nn""",\n]\n');
  const crlf = setNotes('﻿a = "1"\r\n', ["x\ny"]);
  assert.ok(crlf.startsWith('﻿a = "1"\r\nnotes = [\r\n'));
  assert.deepEqual(parseToml(crlf).notes, ["x\ny"]);
  assert.equal(crlf.replaceAll("\r\n", "").includes("\n"), false);
});

test("notes: inserted before the first table when the file has only tables", () => {
  const out = setNotes('[[regions]]\nid = "r"\n', ["n"]);
  assert.ok(out.startsWith("notes = ["));
  assert.deepEqual(parseToml(out).notes, ["n"]);
  assert.equal(parseToml(out).regions[0].id, "r");
});

test("notes: replace in place, remove when empty, and no-op when absent", () => {
  const src = 'title = "t"\nnotes = [\n  """\nold""",\n]\nafter = "1"\n';
  assert.equal(setNotes(src, ["new"]), 'title = "t"\nnotes = [\n  """\nnew""",\n]\nafter = "1"\n');
  assert.equal(setNotes(src, []), 'title = "t"\nafter = "1"\n');
  assert.equal(setNotes('title = "t"\n', []), 'title = "t"\n');
  assert.equal(setNotes('notes = ["x"]', []), "");
});

test("notes: validation and escaping", () => {
  for (const bad of [null, "a", [""], ["  "], [1], ["ok", "\n"]]) assert.throws(() => setNotes("", bad), /non-empty strings/);
  assert.throws(() => setNotes("", ["\ud800"]), /unpaired surrogate/);
  const tricky = ['say """hi""" and ""', "back\\slash\ttab", "ctrl\u0001char\u007f", 'ends with quote"', "unicode ✓ \u{1F600}"];
  for (const t of tricky) assert.deepEqual(parseToml(setNotes("", [t])).notes, [t], JSON.stringify(t));
  assert.equal(formatNotes(["a"], "\r\n"), '[\r\n  """\r\na""",\r\n]');
});

test("checkServerFields: every rule", () => {
  assert.doesNotThrow(() => checkServerFields(blank));
  assert.throws(() => checkServerFields(undefined), /name is empty/);
  assert.throws(() => checkServerFields({ ...blank, name: "  " }), /name is empty/);
  assert.throws(() => checkServerFields({ ...blank, name: "a\nb" }), /single line/);
  for (const k of SERVER_STRINGS) assert.throws(() => checkServerFields({ ...blank, [k]: "x\ny" }), new RegExp(`${k} must be a single line`));
  for (const k of SERVER_STRINGS) assert.throws(() => checkServerFields({ ...blank, [k]: undefined }), /single line/);
  for (const k of SERVER_LISTS) {
    assert.throws(() => checkServerFields({ ...blank, [k]: "x" }), new RegExp(`${k} must be single-line`));
    assert.throws(() => checkServerFields({ ...blank, [k]: [" "] }), /non-empty entries/);
    assert.throws(() => checkServerFields({ ...blank, [k]: ["a\nb"] }), /non-empty entries/);
  }
  assert.throws(() => checkServerFields({ ...blank, ips: ["192.0.2.1"] }), /^Error: ips: .*e\.g\. 192\.0\.2\.10\/24/);
  assert.throws(() => checkServerFields({ ...blank, ips: ["300.0.2.1/24"] }), /ips: /);
  assert.doesNotThrow(() => checkServerFields({ ...blank, ips: [" 192.0.2.1/24 "] }));
  assert.throws(() => checkServerFields({ ...blank, dns: ["bad host!"] }), /dns: /);
  assert.throws(() => checkServerFields({ ...blank, details: 5 }), /details must be text/);
  assert.throws(() => checkServerFields({ ...blank, server_type: "" }), /server_type must be a type id/);
  assert.throws(() => checkServerFields({ ...blank, server_type: 5 }), /server_type must be a type id/);
  assert.doesNotThrow(() => checkServerFields({ ...blank, server_type: "web" }));
});

test("setServer: the file must be this server's; unknown type; details trailing whitespace", () => {
  const src = 'id = "a"\nserver_type = "web"\n';
  assert.throws(() => setServer(src, "b", blank), /Server 'b' is not in the file/);
  assert.throws(() => setServer(src, "a", { ...blank, server_type: "nope" }, {}), /Unknown server type 'nope'\. Known: web, /);
  const out = setServer(src, "a", { ...blank, details: "line 1\nline 2\n\n" });
  assert.equal(parseToml(out).details, "line 1\nline 2");
  assert.equal(setServer(out, "a", { ...blank, details: "line 1\nline 2\n" }), out);
});

test("setServer: a file without an id key is accepted; lists are added, rewritten, removed", () => {
  const src = 'server_type = "web"\n';
  const a = setServer(src, "a", { ...blank, ips: ["192.0.2.1/24", "192.0.2.2/24"], jobs: ["cron: x"] });
  assert.deepEqual(parseToml(a).ips, ["192.0.2.1/24", "192.0.2.2/24"]);
  assert.match(a, /ips = \[/);
  const b = setServer(a, "a", { ...blank, ips: ["198.51.100.1/24"], jobs: [] });
  assert.deepEqual([parseToml(b).ips, parseToml(b).jobs], [["198.51.100.1/24"], undefined]);
  assert.equal(setServer(b, "a", { ...blank, ips: [] }), 'server_type = "web"\n');
});

test("setServer: appended keys on a file without trailing newline", () => {
  const out = setServer('id = "a"\nserver_type = "web"', "a", { ...blank, name: "Service A", role: "front" });
  assert.equal(out, 'id = "a"\nserver_type = "web"\nname = "Service A"\nrole = "front"');
});

test("addServer: next free id and name, region or type, validation through the model", () => {
  const files = mini();
  const first = addServer(files, {});
  assert.equal(first.id, "server2");
  assert.equal(first.path, "servers/server2.toml");
  assert.equal(parseToml(first.text).name, "server-2");
  assert.equal(parseToml(first.text).server_type, "web");
  const typed = addServer(files, { server_type: "cache" });
  assert.equal(parseToml(typed.text).server_type, "cache");
  assert.equal(parseToml(addServer(withRegions(), { region: "r2" }).text).region, "r2");
  assert.equal(parseToml(addServer(withRegions(), { region: "r2" }).text).server_type, undefined);
  const crowded = mini('title = "t"\n', { "servers/server2.toml": 'id = "server2"\nserver_type = "web"\n', "servers/server3.toml": 'id = "server3"\nname = "server-3"\nserver_type = "web"\n' });
  assert.equal(addServer(crowded).id, "server4");
  assert.throws(() => addServer(mini(), { region: "missing" }));
});

test("setKeys: replace existing, append missing, keep order, handle no trailing newline, CRLF and empty files", () => {
  assert.equal(setKeys('id = "a"\nserver_type = "web"\n', [["server_type", "cache"]]), 'id = "a"\nserver_type = "cache"\n');
  assert.equal(setKeys('id = "a"\n', [["region", "r1"], ["name", "x"]]), 'id = "a"\nregion = "r1"\nname = "x"\n');
  assert.equal(setKeys('id = "a"', [["region", "r1"]]), 'id = "a"\nregion = "r1"\n');
  assert.equal(setKeys("", [["id", "a"]]), 'id = "a"\n');
  assert.equal(setKeys('id = "a"\r\n', [["region", "r1"]]), 'id = "a"\r\nregion = "r1"\r\n');
  assert.equal(setKeys("# only a comment\n", [["id", "a"]]), '# only a comment\nid = "a"\n');
  const quoted = setKeys('id = "a"\n', [["name", 'He said "hi" \\ ok']]);
  assert.equal(parseToml(quoted).name, 'He said "hi" \\ ok');
});

test("duplicateServer: copy suffix, numbering, name handling, errors", () => {
  const files = mini('title = "t"\n', {}, 'id = "a"\nname = "Service A"\nserver_type = "web"\nips = ["192.0.2.1/24"]\n');
  const one = duplicateServer(files, "a");
  assert.deepEqual([one.id, one.path], ["a-copy", "servers/a-copy.toml"]);
  assert.equal(parseToml(one.text).name, "Service A-copy");
  assert.deepEqual(parseToml(one.text).ips, ["192.0.2.1/24"]);
  const next = new Map(files).set(one.path, one.text);
  const two = duplicateServer(next, "a");
  assert.equal(two.id, "a-copy-2");
  const third = new Map(next).set(two.path, two.text);
  assert.equal(duplicateServer(third, "a").id, "a-copy-3");
  assert.throws(() => duplicateServer(files, "zz"), /Server 'zz' has no file servers\/zz\.toml/);
  assert.throws(() => duplicateServer(new Map(files).set("servers/ghost.toml", "# not a server\n"), "ghost"));
});

test("duplicateServer: a file without id or name keys gets both appended; CRLF kept", () => {
  const out = duplicateServer(mini('title = "t"\n', {}, 'server_type = "web"\r\n'), "a");
  assert.equal(out.text, 'server_type = "web"\r\nid = "a-copy"\r\nname = "a-copy"\r\n');
  const bare = duplicateServer(mini('title = "t"\n', {}, 'server_type = "web"'), "a");
  assert.equal(bare.text, 'server_type = "web"\nid = "a-copy"\nname = "a-copy"\n');
});

test("freeRegionTypes lists only types without a region", () => {
  const ids = (f) => freeRegionTypes(f).map((t) => t.id);
  assert.ok(ids(mini()).includes("web"));
  const some = ids(withRegions());
  assert.equal(some.includes("web"), false);
  assert.equal(some.includes("cache"), false);
  assert.ok(some.includes("application"));
  assert.deepEqual(freeRegionTypes(mini()).find((t) => t.id === "web"), { id: "web", label: "Web Server" });
});

test("addRegion: appended after the last region, with its own id and the type's label", () => {
  const out = addRegion(withRegions(), { server_type: "application" });
  assert.equal(out.id, "application");
  const regions = parseToml(out.text).regions;
  assert.deepEqual({ ...regions.at(-1) }, { id: "application", title: "Application Server", server_type: "application" });
  assert.equal(regions.length, 3);
  assert.equal(out.path, "topology.toml");
});

test("addRegion: id collisions get a -region suffix, then numbers", () => {
  const busy = mini('title = "t"\n', { "servers/application.toml": 'id = "application"\nserver_type = "web"\n', "servers/application-region.toml": 'id = "application-region"\nserver_type = "web"\n' });
  assert.equal(addRegion(busy, { server_type: "application" }).id, "application-region-2");
  const one = mini('title = "t"\n', { "servers/application.toml": 'id = "application"\nserver_type = "web"\n' });
  assert.equal(addRegion(one, { server_type: "application" }).id, "application-region");
});

test("addRegion: placement without regions (before first table, at the end, empty file) and EOL styles", () => {
  const before = addRegion(mini('title = "t"\n\n[[connections]]\nfrom = "a"\nto = "b"\n', { "servers/b.toml": 'id = "b"\nserver_type = "web"\n' }), { server_type: "web" });
  assert.ok(before.text.indexOf("[[regions]]") < before.text.indexOf("[[connections]]"));
  assert.equal(parseToml(before.text).regions.length, 1);
  assert.equal(addRegion(mini('title = "t"'), { server_type: "web" }).text, 'title = "t"\n\n[[regions]]\nid = "web"\ntitle = "Web Server"\nserver_type = "web"\n');
  const crlf = addRegion(mini('title = "t"\r\n\r\n[[regions]]\r\nid = "r1"\r\ntitle = "R1"\r\nserver_type = "web"'), { server_type: "cache" });
  assert.equal(crlf.text.replaceAll("\r\n", "").includes("\n"), false);
  assert.equal(parseToml(crlf.text.replaceAll("\r\n", "\n")).regions.length, 2);
  const middle = addRegion(withRegions('\n[[connections]]\nfrom = "a"\nto = "b"\n'), { server_type: "application" });
  assert.ok(middle.text.indexOf('id = "application"') < middle.text.indexOf("[[connections]]"));
  assert.ok(middle.text.indexOf('id = "application"') > middle.text.indexOf('id = "r2"'));
});

test("addRegion: errors", () => {
  assert.throws(() => addRegion(new Map(), { server_type: "web" }), /topology\.toml is missing/);
  assert.throws(() => addRegion(mini(), {}), /Unknown server type 'undefined'/);
  assert.throws(() => addRegion(mini(), { server_type: "toString" }), /Unknown server type 'toString'/);
  assert.throws(() => addRegion(mini(), { server_type: "nope" }), /Unknown server type 'nope'\. Known: web, /);
  assert.throws(() => addRegion(withRegions(), { server_type: "web" }), /already has the region 'r1'/);
});

test("moveServer: into a region, between regions, out of every region, no-op", () => {
  const files = withRegions();
  assert.equal(moveServer(files, "a", "r1").text, files.get("servers/a.toml"));
  assert.equal(parseToml(moveServer(files, "a", "r2").text).region, "r2");
  const out = moveServer(files, "a", null);
  assert.equal(parseToml(out.text).region, undefined);
  assert.equal(parseToml(out.text).server_type, "web");
});

test("moveServer: keeps or adopts the server_type as documented", () => {
  const head = withRegions().get("topology.toml");
  const typed = mini(head, {}, 'id = "a"\nregion = "r1"\nserver_type = "web"\n');
  assert.equal(parseToml(moveServer(typed, "a", "r2").text).server_type, "cache");
  const loose = mini(head, {}, 'id = "a"\nserver_type = "oracle"\n');
  const entered = moveServer(loose, "a", "r1");
  assert.equal(parseToml(entered.text).region, "r1");
  assert.equal(parseToml(entered.text).server_type, "web");
});

test("moveServer: errors", () => {
  const files = withRegions();
  assert.throws(() => moveServer(files, "zz", "r1"), /Server 'zz' has no file servers\/zz\.toml/);
  assert.throws(() => moveServer(files, "a", "nope"), /Unknown region 'nope'/);
});

test("moveServer: editing preserves the rest of the file byte for byte", () => {
  const head = withRegions().get("topology.toml");
  const src = '# keep me\nid = "a"\nregion = "r1"\nos = "Linux"   # trailing\n';
  assert.equal(moveServer(mini(head, {}, src), "a", "r2").text, src.replace('region = "r1"', 'region = "r2"'));
  const crlf = src.replaceAll("\n", "\r\n");
  assert.equal(moveServer(mini(head, {}, crlf), "a", "r2").text, crlf.replace('region = "r1"', 'region = "r2"'));
});

test("demo folder: duplicate and add-region round trips keep the folder loadable", () => {
  const dup = duplicateServer(demoFiles, "web01");
  const files = new Map(demoFiles).set(dup.path, dup.text);
  assert.ok(mergeFolder(files).servers.some((s) => s.id === dup.id));
  assert.doesNotThrow(() => tomlModel(files));
  const free = freeRegionTypes(files);
  if (free.length) {
    const region = addRegion(files, { server_type: free[0].id });
    assert.doesNotThrow(() => tomlModel(new Map(files).set(region.path, region.text)));
  }
});
