// Save writes the changed files of the session to the local store, Export packs them into a .diag.zip.
import { appendNetworks } from "../parse/networks-append.mjs";
import { setNetworkName } from "../parse/networks-name.mjs";
import { tomlModel } from "../parse/toml.mjs";
import { archiveName } from "../lib/names.mjs";
import { packDiagram } from "../lib/diagrams.mjs";
import { LAYOUT_VERSION } from "../parse/layout-version.mjs";
import { TOPOLOGY_FILE, NOTES_FILE, NETWORKS_FILE } from "../lib/files.mjs";
import { withNotes } from "./edits.mjs";
import { notesEdited, recordSaved } from "./session.mjs";
import { saveMessage, partialSaveMessage } from "./messages.mjs";

export function saveFiles(session, p, replace) {
  const prefix = session.folder + "/";
  const guard = (base) => replace ? { overwrite: true } : { base };
  const files = session.layoutLocked ? [] : [{ name: session.layoutName, text: p.layoutText, ...guard(session.text) }];
  for (const path of p.changed) files.push({ name: prefix + path, text: p.files.get(path), ...guard(session.source.get(path) ?? null) });
  return files;
}

/** @param {{sessions: object, bridge: object, api: ReturnType<import("./api.mjs").createApi>, confirmer: ReturnType<import("./dialogs.mjs").createConfirmer>, isServerUp: () => boolean, message: (text: string, error?: boolean) => void, download: (name: string, bytes: Uint8Array, type: string) => void}} deps */
export function createSaver({ sessions, bridge, api, confirmer, isServerUp, message, download }) {
  async function settle() {
    const open = bridge.server()?.finish();
    if (open) throw new Error("Fix the server first: " + open);
    const session = sessions.current();
    if (session.reload) await session.reload;
  }
  function pending() {
    const session = sessions.current(), editor = bridge.editor(), notes = bridge.notes();
    const open = notes.finish();
    if (open) throw new Error("Fix the note first: " + open);
    const texts = notes.texts(), notesChanged = notesEdited(session, texts);
    const layout = editor.currentLayout(), drawings = bridge.draw().list();
    const files = notesChanged ? withNotes(session.work, texts) : session.work;
    const changed = [...files].filter(([p, t]) => session.source.get(p) !== t && (p !== NETWORKS_FILE || session.fresh)).map(([p]) => p);
    return {
      api: editor, notes, texts, drawings, files, changed, layout,
      layoutText: JSON.stringify({ version: LAYOUT_VERSION, diagramId: session.id, ...session.extra, ...layout, ...(drawings.length || session.hadDrawings ? { drawings } : {}) }, null, 2) + "\n",
    };
  }
  async function syncNetworks() {
    const session = sessions.current();
    const ips = [...tomlModel(session.work, session.folder).model.nodes.values()].flatMap((n) => n.ip), name = session.folder + "/" + NETWORKS_FILE;
    for (let attempt = 0; attempt < 2; attempt++) {
      const base = await api.stored(name);
      let text = base, renamed = 0;
      for (const [cidr, label] of session.netNames) {
        const next = setNetworkName(text, cidr, label);
        if (next !== text) renamed++;
        text = next;
      }
      const res = appendNetworks(text, ips);
      if (res.text === base) { session.netNames.clear(); return { count: 0, renamed: 0 }; }
      try {
        await api.putFiles([{ name, text: res.text, base }]);
        recordSaved(session, NETWORKS_FILE, res.text); session.netNames.clear();
        return { count: res.added.length, renamed };
      } catch (e) { if (e.status !== 409 || attempt) return { count: 0, renamed: 0, error: e.message }; }
    }
  }
  async function confirmReplace() {
    const session = sessions.current();
    if (!session.fresh || !isServerUp() || await api.stored(session.folder + "/" + TOPOLOGY_FILE) === null) return false;
    return confirmer.replace(session.folder) ? true : null;
  }
  function afterSave(p, names) {
    const session = sessions.current();
    if (names.includes(session.layoutName)) { session.text = p.layoutText; p.api.commit(p.layout); bridge.draw().markSaved(); session.hadDrawings = session.hadDrawings || p.drawings.length > 0; session.carryLayout = false; }
    for (const path of p.changed) {
      if (!names.includes(session.folder + "/" + path)) continue;
      recordSaved(session, path, p.files.get(path));
      if (path === NOTES_FILE) { session.notes = p.texts; p.notes.markSaved(p.texts); }
    }
  }
  function saveFailure(p, e) {
    if (!p || !e.saved?.length) { message("Save failed: " + e.message, true); return; }
    afterSave(p, e.saved);
    message(partialSaveMessage(sessions.current(), p.changed, e), true);
  }
  async function runSave(ctx) {
    await settle();
    const session = sessions.current(), p = ctx.p = pending(), replace = await confirmReplace();
    if (replace === null) return;
    const files = saveFiles(session, p, replace);
    if (!files.length) { message(saveMessage(session, p.changed, { count: 0, renamed: 0 })); return; }
    await api.putFiles(files);
    session.fresh = false;
    afterSave(p, files.map((f) => f.name));
    const net = await syncNetworks().catch((e) => ({ count: 0, error: e.message }));
    message(saveMessage(session, p.changed, net), !!net.error);
  }
  async function save() {
    const ctx = { p: null };
    try { await runSave(ctx); }
    catch (e) { saveFailure(ctx.p, e); }
  }
  async function exportDiagram() {
    try {
      await settle();
      const session = sessions.current(), p = pending(), name = archiveName(session.folder);
      download(name, await packDiagram(p.files, session.layoutLocked ? session.text : p.layoutText), "application/zip");
      message(`Exported ${name} (${p.files.size + 1} files) to your downloads`);
    } catch (e) { message("Export failed: " + e.message, true); }
  }
  return { save, exportDiagram, pending, settle, syncNetworks };
}
