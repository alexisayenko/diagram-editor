import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { setNetworkName, normalizeName, MAX_NAME } from "../parse/networks-name.mjs";
import { appendNetworks } from "../parse/networks-append.mjs";
import { parseNetworksFile } from "../parse/shared-networks.mjs";

const A = "192.0.2.0/24", B = "198.51.100.0/24";
const file = `# segments\n[[networks]]\ncidr = "${A}" # office\n\n[[networks]]\ncidr = "${B}"\nname = "Old"\ndescription = "d"\n`;

test("add a name to a cidr-only entry: one line inserted, comments kept", () => {
  assert.equal(setNetworkName(file, A, "Office"), file.replace(`# office\n`, `# office\nname = "Office"\n`));
});

test("edit replaces only the name line; remove deletes it and keeps the entry", () => {
  assert.equal(setNetworkName(file, B, "New"), file.replace('"Old"', '"New"'));
  const removed = setNetworkName(file, B, "  ");
  assert.equal(removed, file.replace('name = "Old"\n', ""));
  assert.deepEqual(parseNetworksFile(removed).map((n) => [n.cidr, n.name]), [[A, ""], [B, ""]]);
});

test("derived network (no entry) appends a table; empty name on a missing entry changes nothing", () => {
  const next = setNetworkName(file, "203.0.113.0/24", "Lab");
  assert.equal(next, file + '\n[[networks]]\ncidr = "203.0.113.0/24"\nname = "Lab"\n');
  assert.equal(setNetworkName(null, "203.0.113.0/24", ""), null);
  assert.equal(setNetworkName(file, "203.0.113.0/24", ""), file);
  assert.equal(setNetworkName(null, A, "X"), `[[networks]]\ncidr = "${A}"\nname = "X"\n`);
  assert.equal(setNetworkName("", A, "X"), `[[networks]]\ncidr = "${A}"\nname = "X"\n`);
  assert.equal(setNetworkName("[[networks]]\ncidr = \"" + A + "\"", A, "X"), `[[networks]]\ncidr = "${A}"\nname = "X"`);
});

test("CRLF files keep CRLF on every inserted, replaced and appended line", () => {
  const crlf = file.replace(/\n/g, "\r\n");
  assert.equal(setNetworkName(crlf, A, "Office"), crlf.replace("# office\r\n", '# office\r\nname = "Office"\r\n'));
  assert.equal(setNetworkName(crlf, B, "New"), crlf.replace('"Old"', '"New"'));
  assert.equal(setNetworkName(crlf, B, ""), crlf.replace('name = "Old"\r\n', ""));
  const added = setNetworkName(crlf, "203.0.113.0/24", "Lab");
  assert.ok(added.endsWith('\r\n[[networks]]\r\ncidr = "203.0.113.0/24"\r\nname = "Lab"\r\n'));
  assert.ok(!/[^\r]\n/.test(added));
});

test("names are trimmed, quoted safely and validated; a duplicate entry is never created", () => {
  assert.equal(normalizeName("  Core  "), "Core");
  assert.throws(() => normalizeName("a\nb"), /single line/);
  assert.throws(() => normalizeName("x".repeat(MAX_NAME + 1)), /at most 80/);
  assert.throws(() => setNetworkName(file, "192.0.2.5/24", "x"), /host bits/);
  const quoted = setNetworkName(file, A, 'He said "hi" \ ok');
  assert.equal(parseNetworksFile(quoted)[0].name, 'He said "hi" \ ok');
  const once = setNetworkName(null, A, "One"), twice = setNetworkName(once, A, "Two");
  assert.equal(parseNetworksFile(twice).length, 1);
  assert.equal(twice, `[[networks]]\ncidr = "${A}"\nname = "Two"\n`);
});

test("naming a derived network and the automatic append do not double-add the same cidr", () => {
  const named = setNetworkName(null, A, "Office"), res = appendNetworks(named, ["192.0.2.10/24", "198.51.100.5/24"]);
  assert.deepEqual(res.added, [B]);
  assert.deepEqual(parseNetworksFile(res.text).map((n) => [n.cidr, n.name]), [[A, "Office"], [B, ""]]);
});

const app = readFileSync(new URL("../browser/app.js", import.meta.url), "utf8");

test("Save writes pending network names with the append in one base-checked put, retrying once on 409", async () => {
  const start = app.indexOf("async function syncNetworks()"), fn = app.slice(start, app.indexOf("\n}\n", start) + 2);
  const run = async (store, conflicts) => {
    const puts = [];
    const ctx = { NETWORKS_FILE: "networks.toml", setNetworkName, appendNetworks, tomlModel: () => ({ model: { nodes: new Map([["a", { ip: ["192.0.2.10/24", "198.51.100.5/24"] }]]) } }),
      stored: async () => store.text, putFiles: async (f) => { puts.push(f[0]); if (conflicts-- > 0) { store.text = (store.text ?? "") + "# edited elsewhere\n"; throw Object.assign(new Error("conflict"), { status: 409 }); } store.text = f[0].text; },
      active: { folder: "d", source: new Map(), work: new Map(), netNames: new Map([[A, "Office"]]) } };
    const out = await runInNewContext(`${fn}\nsyncNetworks()`, ctx);
    return { out, puts, active: ctx.active };
  };
  const ok = await run({ text: null }, 0);
  assert.equal(ok.puts.length, 1);
  assert.equal(ok.puts[0].base, null);
  assert.equal(ok.puts[0].text, `[[networks]]\ncidr = "${A}"\nname = "Office"\n\n[[networks]]\ncidr = "${B}"\n`);
  assert.deepEqual([ok.out.count, ok.out.renamed], [1, 1]);
  assert.equal(ok.active.netNames.size, 0);
  assert.equal(ok.active.source.get("networks.toml"), ok.puts[0].text);
  const retry = await run({ text: `[[networks]]\ncidr = "${A}"\n` }, 1);
  assert.equal(retry.puts.length, 2);
  assert.match(retry.puts[1].text, /name = "Office"[\s\S]*# edited elsewhere/);
  const fail = await run({ text: null }, 2);
  assert.match(fail.out.error, /conflict/);
});

test("renamed networks.toml is dirty work for Save, Export and the discard guards, and written only through the network sync", () => {
  assert.match(app, /const renameNetwork = guarded\(editBlocked, \(cidr, name\)[\s\S]*?rerenderMany\(new Map\(\[\[NETWORKS_FILE, next\]\]\)/);
  assert.match(app, /\(p !== NETWORKS_FILE \|\| active\.fresh\)/);
  assert.match(app, /renameNetwork \};/);
});
