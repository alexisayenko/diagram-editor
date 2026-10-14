// Surgical append of derived networks to a diagram folder's networks.toml: only `cidr` tables for CIDRs not yet listed, in address order,
// after the existing bytes (comments, formatting and line endings untouched; CRLF files get CRLF).
import { parseNetworksFile } from "./shared-networks.mjs";
import { derivedCidrs } from "../lib/net.mjs";

export function appendNetworks(existing, ips) {
  const defined = existing === null ? [] : parseNetworksFile(existing).map((n) => n.cidr);
  const added = derivedCidrs(ips).filter((c) => !defined.includes(c));
  if (!added.length) return { text: existing, added };
  const nl = existing !== null && existing.includes("\r\n") ? "\r\n" : "\n";
  const tables = added.map((c) => `[[networks]]${nl}cidr = "${c}"${nl}`).join(nl);
  let head = "";
  if (existing !== null && existing.trim()) head = (existing.endsWith("\n") ? existing : existing + nl) + nl;
  else if (existing !== null) head = existing;
  return { text: head + tables, added };
}
