// The names of the files a diagram folder and its archive are made of; the single source for the page, the server and the builder.
export const TOPOLOGY_FILE = "topology.toml";
export const LEGACY_TOPOLOGY_FILE = "diagram.toml";
export const SERVER_TYPES_FILE = "server-types.toml";
export const NOTES_FILE = "notes.toml";
export const DOCUMENTS_FILE = "documents.toml";
export const NETWORKS_FILE = "networks.toml";
export const LAYOUT_FILE = "diagram.layout.json";
export const SERVER_DIR_NAME = "servers";
export const SERVER_DIR = "servers/";
export const ARCHIVE_EXT = ".diag.zip";

export const serverPath = (id) => `${SERVER_DIR}${id}.toml`;
