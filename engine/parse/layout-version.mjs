export const LAYOUT_VERSION = 1;

export function decideLayoutLoad(layout, supported = LAYOUT_VERSION) {
  const v = layout?.version;
  if (typeof v === "number" && v > supported) {
    return { use: null, lockSave: true, warning: `The saved layout is version ${v}, newer than this engine supports (${supported}); showing an automatic arrangement and leaving the saved layout untouched` };
  }
  return { use: layout ?? null, lockSave: false, warning: null };
}
