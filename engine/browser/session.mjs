// The open diagram: one session object per opened, imported or new diagram, reached through a holder so no module keeps a shared mutable binding.
const LAYOUT_KEYS = new Set(["version", "diagramId", "nodes", "clusters", "edges", "drawings"]);

/**
 * @typedef {object} Session
 * @property {string} folder          diagram folder name, also the folder under local/
 * @property {string} layoutName      store name of the layout file, "<folder>/diagram.layout.json"
 * @property {Map<string,string>} source  folder-relative path to text as last saved; empty for a new or imported diagram, so every file counts as changed
 * @property {Map<string,string>} work    folder-relative path to text including edits not saved yet
 * @property {?string} text           layout file text as last read or saved, the base of the next compare-before-write; null when none exists
 * @property {boolean} layoutLocked   the layout was made by a newer engine: it is shown auto-arranged and never written back
 * @property {object} extra           layout keys this engine does not know, carried through Save unchanged
 * @property {boolean} hadDrawings    the layout had a drawings key, so an empty drawings list is still written
 * @property {string} id              diagram id from topology.toml
 * @property {string[]} notes         note texts as last saved (compared with the Notes panel)
 * @property {boolean} carryLayout    the layout in the frame is not on disk: it survives a re-render and counts as unsaved work
 * @property {?Promise<void>} reload  pending frame reload after an edit, or null
 * @property {?{key: ?string, edit: boolean}} after  what to restore once the frame has reloaded: reselect `key`, re-enter edit mode
 * @property {Map<string,string>} netNames  network names typed in the page, written to networks.toml on Save
 * @property {boolean} fresh          never saved yet (imported archive): Save asks before replacing a stored diagram and includes networks.toml
 */

/** @param {{folder: string, layoutName: string, files: Map<string,string>, layoutText: ?string, layout: ?object, layoutLocked: boolean, id: string, notes: string[]}} init @returns {Session} */
export function createSession({ folder, layoutName, files, layoutText, layout, layoutLocked, id, notes }) {
  return {
    folder, layoutName, source: new Map(files), work: new Map(files), text: layoutText, layoutLocked,
    extra: layout ? Object.fromEntries(Object.entries(layout).filter(([k]) => !LAYOUT_KEYS.has(k))) : {},
    hadDrawings: !!layout && "drawings" in layout,
    id, notes, carryLayout: false, reload: null, after: null, netNames: new Map(), fresh: false,
  };
}

export function createSessionHolder() {
  let current = null;
  return {
    current: () => current,
    has: () => current !== null,
    start(session) { current = session; return session; },
  };
}

export function markNew(session) { session.source = new Map(); }

export function markImported(session) {
  session.source = new Map();
  session.text = null;
  session.carryLayout = true;
  session.fresh = true;
}

const differs = (a, b) => JSON.stringify(a) !== JSON.stringify(b);

export const notesEdited = (session, texts) => differs(texts, session.notes);

export function hasUnsaved(session, notesTexts) {
  if (!session) return false;
  return differs([...session.work], [...session.source]) || session.carryLayout || (notesTexts ? notesEdited(session, notesTexts) : false);
}

export function recordSaved(session, path, text) {
  session.source.set(path, text);
  session.work.set(path, text);
}
