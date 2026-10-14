// Edits made in the diagram frame come back here: each one changes the working files of the session and re-renders the frame.
import { setNotes, setServer, addServer, duplicateServer, addRegion, moveServer, freeRegionTypes } from "../parse/toml-write.mjs";
import { setNetworkName, normalizeName } from "../parse/networks-name.mjs";
import { mergeFolder } from "../parse/toml.mjs";
import { mergeTypes } from "../parse/types.mjs";
import { NOTES_FILE, NETWORKS_FILE, serverPath } from "../lib/files.mjs";
import { nodeKey } from "../lib/keys.mjs";
import { notesEdited } from "./session.mjs";

const REGION_W = 220, REGION_H = 120;

export const guarded = (blockedBy, fn) => (...args) => {
  const blocked = blockedBy();
  if (blocked) return blocked;
  try { fn(...args); return null; } catch (e) { return String(e.message); }
};

export function withNotes(files, texts) {
  const out = new Map(files), prev = out.get(NOTES_FILE), next = setNotes(prev ?? "", texts);
  if (prev !== undefined || next !== "") out.set(NOTES_FILE, next);
  return out;
}

/** @param {{sessions: ReturnType<import("./session.mjs").createSessionHolder>, bridge: ReturnType<import("./frame-bridge.mjs").createFrameBridge>, render: (files: Map<string,string>, folder: string, layout: object, refit: string[]) => {html: string}}} deps */
export function createEdits({ sessions, bridge, render }) {
  const editBlocked = () => {
    if (!bridge.isReady()) return "Try again once the diagram has reloaded.";
    const open = bridge.notes().finish() || bridge.server().finish();
    return open ? "Fix the open edit first: " + open : null;
  };
  const noteBlocked = () => {
    const open = bridge.notes()?.finish();
    return open ? "Fix the note first: " + open : null;
  };

  function rerenderMany(added, places, ids, key, extra = {}) {
    const session = sessions.current(), api = bridge.editor(), draw = bridge.draw(), texts = bridge.notes().texts();
    const edited = notesEdited(session, texts);
    const work = new Map([...session.work, ...added]);
    const layout = { ...api.currentLayout(), drawings: draw.list() };
    for (const [id, at] of Object.entries(places)) layout.nodes[id] = { x: at[0], y: at[1], w: 1, h: 1, title: at.slice() };
    if (extra.region) layout.clusters[ids[0]] = extra.region;
    const result = render(edited ? withNotes(work, texts) : work, session.folder, layout, ids);
    const wasEdit = bridge.editing();
    session.carryLayout = session.carryLayout || api.isDirty() || draw.isDirty();
    session.work = work;
    session.after = { key, edit: wasEdit };
    session.reload = bridge.show(result.html).then(() => { session.reload = null; });
  }
  function rerender(path, next, id, at, extra = {}) {
    rerenderMany(new Map([[path, next]]), at ? { [id]: at } : {}, [id], extra.key ?? nodeKey("server", id), extra);
  }

  function serverSource(id) {
    const root = mergeFolder(sessions.current().work), s = (root.servers || []).find((x) => x.id === id);
    if (!s) return null;
    const types = mergeTypes(root.server_types), region = (root.regions || []).find((r) => r.id === s.region);
    return { ...s, name: s.name ?? s.id, server_type: s.server_type ?? region?.server_type, types: Object.entries(types).map(([tid, t]) => ({ id: tid, label: t.label })) };
  }
  const applyServer = guarded(noteBlocked, (id, fields) => {
    const work = sessions.current().work, path = serverPath(id), text = work.get(path);
    if (text === undefined) throw new Error(`Server '${id}' has no file ${path}.`);
    const next = setServer(text, id, fields, mergeFolder(work));
    if (next !== text) rerender(path, next, id);
  });
  const add = guarded(editBlocked, (region, x, y) => {
    const work = sessions.current().work;
    const generic = mergeTypes(mergeFolder(work).server_types).server ? "server" : undefined;
    const { path, text, id } = addServer(work, region ? { region } : { server_type: generic });
    rerender(path, text, id, [x, y]);
  });
  const duplicate = guarded(editBlocked, (id) => {
    const { path, text, id: copy } = duplicateServer(sessions.current().work, id), from = bridge.editor().currentLayout().nodes[id];
    rerender(path, text, copy, from ? [Math.round(from.x) + 30, Math.round(from.y) + 30] : undefined);
  });
  const regionTypes = () => freeRegionTypes(sessions.current().work);
  const addNewRegion = guarded(editBlocked, (type, x, y) => {
    const { path, text, id } = addRegion(sessions.current().work, { server_type: type });
    rerender(path, text, id, null, { key: nodeKey("region", id), region: { x, y, w: REGION_W, h: REGION_H, title: [x + REGION_W / 2, y + 20] } });
  });
  const move = guarded(editBlocked, (id, region) => {
    const work = sessions.current().work, { path, text } = moveServer(work, id, region);
    if (text !== work.get(path)) rerender(path, text, id);
  });
  const renameNetwork = guarded(editBlocked, (cidr, name) => {
    const session = sessions.current(), clean = normalizeName(name), prev = session.work.get(NETWORKS_FILE) ?? null, next = setNetworkName(prev, cidr, clean);
    if (next === prev) return;
    session.netNames.set(cidr, clean);
    rerenderMany(new Map([[NETWORKS_FILE, next]]), {}, [], undefined);
  });

  return { rerenderMany, serverEditor: { source: serverSource, apply: applyServer, add, duplicate, regionTypes, addRegion: addNewRegion, move, renameNetwork } };
}
