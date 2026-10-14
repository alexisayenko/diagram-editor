import { readFileSync } from "node:fs";

export { esc } from "./text.mjs";

export const readText = (path) => readFileSync(path, "utf8").replaceAll("\r\n", "\n");
