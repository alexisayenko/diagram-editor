import { LAYOUT_FILE, ARCHIVE_EXT } from "./files.mjs";

// File-name rules shared by the page and the local file server: <diagram folder>/[servers/]<name>.toml|json.
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*){0,2}\.(toml|json)$/;

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

// Why a path segment cannot be a file or folder name on Windows, or null.
export function segmentProblem(segment) {
  if (/[. ]$/.test(segment)) return `'${segment}' ends with a dot or space`;
  if (RESERVED.test(segment.split(".")[0])) return `'${segment}' is a reserved device name on Windows`;
  return null;
}

export const caseKey = (name) => name.toLowerCase();

export function validName(name) {
  return typeof name === "string" && name.length <= 150 && FILE_NAME.test(name) && !name.includes("..") && !name.split("/").some(segmentProblem);
}
export const layoutNameFor = (folder) => `${folder}/${LAYOUT_FILE}`;

const two = (n) => String(n).padStart(2, "0");
export function stamp(d) {
  return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}


export const archiveName = (folder, d = new Date()) => `${folder}-${stamp(d)}${ARCHIVE_EXT}`;
