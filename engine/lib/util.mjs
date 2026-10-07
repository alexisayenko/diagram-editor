import { readFileSync } from "node:fs";
import { join } from "node:path";

export const fail = (m) => {
  console.error("build: " + m);
  process.exit(1);
};
export const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const unq = (s) => s.trim().replace(/^"(.*)"$/, "$1");
export const readText = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
export const reader = (dir) => (f) => readText(join(dir, f));
