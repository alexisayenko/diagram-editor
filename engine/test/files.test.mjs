import test from "node:test";
import assert from "node:assert/strict";
import * as files from "../lib/files.mjs";
import { demo } from "./helpers.mjs";

test("file-name constants match the demo folder", () => {
  const names = demo();
  for (const f of [files.TOPOLOGY_FILE, files.SERVER_TYPES_FILE, files.NOTES_FILE, files.NETWORKS_FILE]) assert.ok(names.has(f), f);
  assert.ok([...names.keys()].some((n) => n.startsWith(files.SERVER_DIR)));
  assert.equal(files.serverPath("a"), "servers/a.toml");
  assert.equal(files.SERVER_DIR, files.SERVER_DIR_NAME + "/");
  assert.equal(files.ARCHIVE_EXT, ".diag.zip");
});
