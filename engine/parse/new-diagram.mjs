import { FORMAT_VERSION } from "./toml.mjs";
import { DIAGRAM_ID } from "../lib/ids.mjs";
import { TOPOLOGY_FILE, NETWORKS_FILE, SERVER_TYPES_FILE, NOTES_FILE, DOCUMENTS_FILE } from "../lib/files.mjs";

const SERVER_TYPES = `[[server_types]]
id = "server"
label = "Server"
color = "#455A64"
dark = "#B0BEC5"

[[server_types]]
id = "database"
label = "Database"
color = "#E65100"
dark = "#F2B24C"
db = true

[[server_types]]
id = "gateway"
label = "Gateway"
color = "#00838F"
dark = "#4DD0E1"
infra = true
`;

const titleFor = (id) => id.replace(/-+/g, " ").replace(/^./, (c) => c.toUpperCase());

// An empty diagram folder (path -> text); `servers/` has no files until the first server is added.
export function newDiagram(id) {
  if (!DIAGRAM_ID.test(id)) throw new Error("A diagram name uses lowercase letters, digits and hyphens.");
  return new Map([
    [TOPOLOGY_FILE, `format_version = ${JSON.stringify(FORMAT_VERSION)}\nid = ${JSON.stringify(id)}\ntitle = ${JSON.stringify(titleFor(id))}\n`],
    [NETWORKS_FILE, ""],
    [SERVER_TYPES_FILE, SERVER_TYPES],
    [NOTES_FILE, ""],
    [DOCUMENTS_FILE, ""],
  ]);
}
