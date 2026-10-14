import { FormatError } from "../parse/errors.mjs";

export function runCli(name, main) {
  try {
    return main();
  } catch (e) {
    if (!(e instanceof FormatError)) throw e;
    console.error(`${name}: ${e.message}`);
    process.exitCode = 1;
  }
}
