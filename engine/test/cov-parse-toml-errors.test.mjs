import test from "node:test";
import assert from "node:assert/strict";
import { parseToml } from "../parse/toml.mjs";
import { setNetworkName, normalizeName } from "../parse/networks-name.mjs";

const bad = (src, re) => assert.throws(() => parseToml(src), re);

test("parseToml: string, array and header errors", () => {
  bad('a = """x""""""\n', /too many quotes/);
  bad('a = """x \\ y"""\n', /unsupported string escape/);
  bad('a = """x\\\n   ', /unterminated string/);
  bad('a = "\\u12"\n', /invalid Unicode escape/);
  bad('a = "\\ud800"\n', /invalid Unicode escape/);
  bad('a = "\\q"\n', /unsupported string escape/);
  bad('a = "\\', /unsupported string escape/);
  bad("a = [", /unterminated array/);
  bad('a = ["x" "y"]\n', /expected ','/);
  bad('servers = "x"\n[[servers]]\n', /already used as a key/);
  bad("1 = 2\n", /expected key = value/);
  bad("a = tru\n", /expected a quoted string/);
  bad('a = "x" y\n', /unexpected text after value/);
  bad("[a]\n", /expected a \[\[name\]\] table header/);
});

test("parseToml: valid escapes, continuation and trailing commas", () => {
  assert.deepEqual({ ...parseToml('a = """x\\\n   y"""\nb = ["p", "q",]\nc = "\\u0041\\U0001F600"\n') }, { a: "xy", b: ["p", "q"], c: "A\u{1F600}" });
});

test("setNetworkName: missing name, single-quoted cidr and unterminated file", () => {
  assert.equal(normalizeName(null), "");
  assert.equal(normalizeName(undefined), "");
  assert.equal(setNetworkName("[[networks]]\ncidr = '192.0.2.0/24'", "192.0.2.0/24", "Lab"), '[[networks]]\ncidr = \'192.0.2.0/24\'\nname = "Lab"');
  assert.equal(setNetworkName("# note", "192.0.2.0/24", "Lab"), '# note\n\n[[networks]]\ncidr = "192.0.2.0/24"\nname = "Lab"\n');
});
