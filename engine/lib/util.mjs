import { readFileSync } from "node:fs";
import { join } from "node:path";

export { esc, unq } from "./text.mjs";

export const readText = (path) => readFileSync(path, "utf8").replaceAll("\r\n", "\n");
export const reader = (dir) => (f) => readText(join(dir, f));
