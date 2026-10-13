// File-name rules shared by the page and the local file server: <diagram folder>/[servers/]<name>.toml|json.
export const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*){0,2}\.(toml|json)$/;

export function validName(name) {
  return typeof name === "string" && name.length <= 150 && FILE_NAME.test(name) && !name.includes("..");
}

export const layoutNameFor = (folder) => `${folder}/diagram.layout.json`;

const two = (n) => String(n).padStart(2, "0");
export function stamp(d) {
  return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}


export const archiveName = (folder, d = new Date()) => `${folder}-${stamp(d)}.diag.zip`;
