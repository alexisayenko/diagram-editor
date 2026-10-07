// File-name rules shared by the page and the local file server.
export const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(toml|json)$/;

export function validName(name) {
  return typeof name === "string" && name.length <= 100 && FILE_NAME.test(name) && !name.includes("..");
}

export const layoutNameFor = (tomlName) => tomlName.replace(/\.toml$/i, ".layout.json");

const two = (n) => String(n).padStart(2, "0");
export function stamp(d) {
  return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}

export function exportNames(tomlName, d = new Date()) {
  const stem = tomlName.replace(/\.toml$/i, ""), t = stamp(d);
  return { toml: `${stem}-${t}.toml`, layout: `${stem}-${t}.layout.json` };
}
