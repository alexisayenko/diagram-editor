import { NETWORKS_FILE } from "../lib/files.mjs";

export const plural = (n) => (n === 1 ? "" : "s");

export function saveMessage(session, changed, net) {
  if (session.layoutLocked) return (changed.length ? `Saved ${changed.length} file(s) in local/${session.folder}/` : "Nothing saved") + ` · ${session.layoutName} not written: it was made by a newer engine`;
  const saved = changed.length ? `Saved ${session.layoutName} and ${changed.length} file(s) in local/${session.folder}/` : `Saved ${session.layoutName} in local/`;
  const added = net.count ? ` · ${net.count} new networks added to ${NETWORKS_FILE}` : "";
  const renamedNote = net.renamed ? ` · ${net.renamed} network name${plural(net.renamed)} saved to ${NETWORKS_FILE}` : "";
  const failed = net.error ? ` · ${NETWORKS_FILE} not updated: ${net.error}` : "";
  return saved + added + renamedNote + failed;
}

export function partialSaveMessage(session, changed, error) {
  const left = [session.layoutName, ...changed.map((c) => session.folder + "/" + c)].filter((n) => !error.saved.includes(n));
  return `Saved ${error.saved.join(", ")}. ${error.message} Not saved: ${left.join(", ")}.`;
}
