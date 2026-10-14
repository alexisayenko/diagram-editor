export const DIAGRAM_ID = /^[a-z0-9][a-z0-9-]*$/;

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
    ["topology.toml", `id = ${JSON.stringify(id)}\ntitle = ${JSON.stringify(titleFor(id))}\n`],
    ["networks.toml", ""],
    ["server-types.toml", SERVER_TYPES],
    ["notes.toml", ""],
    ["documents.toml", ""],
  ]);
}
