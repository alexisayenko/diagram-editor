// The page's side of the diagram iframe: it gives the runtime its host interface, reports when the runtime is ready and when the user may have changed something, and wraps every look into the frame.
// A frame is loaded once per shell (document, styles, runtime); later edits of the same diagram swap the scene inside it (see replace) and reload only when that is not possible.
const MODULES = { editor: "canvas/edit-mode", notes: "ui/notes-edit", server: "ui/server-edit", draw: "canvas/draw", model: "canvas/model" };
const ACTIVITY = ["pointerup", "keyup", "input", "change", "click"];

/**
 * @typedef {object} Host what the runtime may call on the page; handed to the runtime through InfraDiagram.attachHost(host) once it is ready
 * @property {(text: string) => {title: string, date: string, paras: string[]}} noteParser
 * @property {object} serverEditor  source, apply, add, duplicate, regionTypes, addRegion, move, renameNetwork
 */

/**
 * @param {HTMLIFrameElement} frame
 * @param {{host: Host, onLoad: (ready: boolean, swapped: boolean) => void, onChange: () => void, defer?: (fn: () => void) => void}} options
 * onLoad fires after every load of a frame that show() started (swapped: false) and after every scene swap that replace() made (swapped: true); onChange fires, once per burst, after pointer, key or form activity inside a ready frame.
 */
export function createFrameBridge(frame, { host, onLoad, onChange, defer = (fn) => setTimeout(fn, 0) }) {
  let ready = false, expecting = false, queued = false, shell = null;
  const waiters = [];
  const diagram = () => frame.contentWindow.InfraDiagram;
  const mod = (key) => (ready ? diagram()?.modules[MODULES[key]] ?? null : null);
  const notify = () => {
    if (queued) return;
    queued = true;
    defer(() => { queued = false; onChange(); });
  };
  function show(html, key = null) {
    expecting = true;
    ready = false;
    shell = key;
    const loaded = new Promise((resolve) => waiters.push(resolve));
    frame.srcdoc = html;
    return loaded;
  }
  const swapped = (scene) => {
    try { return diagram().replaceScene(scene).ok; } catch { return false; }
  };
  frame.addEventListener("load", () => {
    if (!expecting) return;
    ready = !!diagram()?.modules[MODULES.editor];
    if (ready) {
      diagram().attachHost(host);
      for (const type of ACTIVITY) frame.contentDocument.addEventListener(type, notify, true);
    }
    onLoad(ready, false);
    waiters.splice(0).forEach((resolve) => resolve());
  });
  return {
    isReady: () => ready,
    editor: () => mod("editor"),
    notes: () => mod("notes"),
    server: () => mod("server"),
    draw: () => mod("draw"),
    editing: () => !!diagram().modules[MODULES.model].state.on,
    isDirty: () => !!(mod("editor")?.isDirty() || mod("notes")?.isDirty() || mod("server")?.isDirty() || mod("draw")?.isDirty()),
    noteTexts: () => mod("notes")?.texts() ?? null,
    select: (key) => diagram().select(key),
    clickEdit: () => frame.contentDocument.getElementById("te").click(),
    show,
    /** Swaps the scene of the loaded frame in place; loads the whole page when the shell differs or the runtime refuses or fails. Resolves with "swapped" or "reloaded". */
    replace({ html, scene }) {
      if (ready && scene?.shell === shell && swapped(scene)) {
        onLoad(true, true);
        return Promise.resolve("swapped");
      }
      return show(html, scene?.shell ?? null).then(() => "reloaded");
    },
  };
}
