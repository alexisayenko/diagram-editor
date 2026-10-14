import test from "node:test";
import assert from "node:assert/strict";
import { tomlModel, globRegExp, groupUnits } from "../parse/toml.mjs";
import { addRegion } from "../parse/toml-write.mjs";
import { demo, mod } from "./helpers.mjs";

const groups = [{ label: "Application services", patterns: ["app-*"].map(globRegExp) }, { label: "Middleware", patterns: ["wildfly*", "app-?"].map(globRegExp) }];

test("glob: * and ? are wildcards, case-insensitive, whole name, regex characters are literal", () => {
  assert.ok(globRegExp("app-*").test("APP-billing"));
  assert.ok(globRegExp("wildfly?").test("wildfly9"));
  assert.ok(!globRegExp("wildfly?").test("wildfly10"));
  assert.ok(!globRegExp("app").test("app-x"));
  assert.ok(globRegExp("a.b").test("a.b"));
  assert.ok(!globRegExp("a.b").test("axb"));
});

test("units split by group: first match wins, .service suffix ignored, Other bucket, empty sections omitted", () => {
  const out = groupUnits(["app-1.service", "wildfly-main", "app-2", "cron-x"], groups);
  assert.deepEqual(out, [["Application services", ["app-1.service", "app-2"]], ["Middleware", ["wildfly-main"]]]);
  assert.deepEqual(groupUnits(["wildfly-main"], groups), [["Middleware", ["wildfly-main"]]]);
  assert.deepEqual(groupUnits(["a", "b"], []), [["systemd services", ["a", "b"]]]);
  assert.deepEqual(groupUnits([], groups), []);
});

test("details sections of the demo use the groups, in group order, and no Other section", () => {
  const { sections } = tomlModel(demo(), "demo");
  const web = sections["web-01"] ?? Object.values(sections).find((s) => s.includes("nginx"));
  assert.ok(web.includes("## Middleware\n\n- nginx"));
  assert.ok(!web.includes("Other services") && !web.includes("demo-agent"));
  assert.ok(!web.includes("## systemd services"));
  const app = Object.values(sections).find((s) => s.includes("tomcat-demo"));
  assert.ok(app.includes("## Application services\n\n- tomcat-demo"));
});

test("without groups the single systemd services list stays", () => {
  const files = demo(), t = files.get("topology.toml");
  files.set("topology.toml", t.slice(0, t.indexOf("[[service_groups]]")));
  assert.ok(Object.values(tomlModel(files, "demo").sections).some((s) => s.includes("## systemd services\n\n- nginx\n- demo-agent")));
});

test("service_groups validation names the group and the problem", () => {
  const bad = (from, to, re) => assert.throws(() => tomlModel(mod(demo(), "topology.toml", from, to), "demo"), re);
  bad('label = "Middleware"', 'label = ""', /service_groups\[2\]\.label must be a non-empty string/);
  bad('patterns = ["wildfly*", "nginx"]', "patterns = []", /service_groups\[2\]\.patterns must be a non-empty array/);
  bad('patterns = ["wildfly*", "nginx"]', 'patterns = ["ok", " "]', /service_groups\[2\]\.patterns must be a non-empty array/);
  bad('id = "middleware"', 'id = "middleware"\ncolour = "x"', /service_groups\[2\]: unknown key colour/);
});

test("write-back for regions keeps [[service_groups]] tables byte for byte", () => {
  const files = demo(), before = files.get("topology.toml"), block = before.slice(before.indexOf("[[service_groups]]"));
  const r = addRegion(files, { server_type: "batch" });
  assert.ok(r.text.includes(block));
  assert.equal(tomlModel(new Map(files).set("topology.toml", r.text), "demo").config.id, "demo");
});
