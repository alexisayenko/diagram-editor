import test from "node:test";
import assert from "node:assert/strict";
import { tomlBasic, tomlMultilineBody } from "../parse/toml-escape.mjs";
import { parseToml } from "../parse/toml.mjs";

test("tomlBasic quotes and escapes", () => {
  assert.equal(tomlBasic('a"b\\c\nd\te'), String.raw`"a\"b\\c\nd\te"`);
  assert.equal(tomlBasic("x\u0001y\u007f"), String.raw`"x\u0001y\u007f"`);
  assert.throws(() => tomlBasic("\ud800"), /Text contains an unpaired surrogate/);
  assert.throws(() => tomlBasic("\ud800", "Name"), /Name contains/);
});

test("tomlBasic output parses back to the input", () => {
  const text = 'q"uo\\te\n\ttab \u0007 é';
  assert.equal(parseToml(`k = ${tomlBasic(text)}\n`).k, text);
});

test("tomlMultilineBody keeps newlines and neutralises quote runs", () => {
  assert.equal(tomlMultilineBody("a\nb", "\r\n"), "a\r\nb");
  assert.equal(tomlMultilineBody('say """hi"', "\n"), String.raw`say \"\"\"hi\"`);
  assert.throws(() => tomlMultilineBody("\udfff", "\n"), /Note text contains an unpaired surrogate/);
  const body = 'x\\y """ z"';
  assert.equal(parseToml(`k = """\n${tomlMultilineBody(body, "\n")}"""\n`).k, body);
});
