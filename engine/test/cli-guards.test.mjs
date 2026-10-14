import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

test("runCli prints a FormatError and sets exit code 1", () => {
  const code = `import { runCli } from ${JSON.stringify(new URL("../lib/cli.mjs", import.meta.url).href)};
import { FormatError } from ${JSON.stringify(new URL("../lib/errors.mjs", import.meta.url).href)};
runCli("demo", () => { throw new FormatError("bad file"); });`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /demo: bad file/);
});

test("browser.mjs and serve.mjs run their main through runCli", () => {
  for (const f of ["../browser.mjs", "../serve.mjs"]) assert.match(readFileSync(here(f), "utf8"), /runCli\("(browser|serve)"/);
});
