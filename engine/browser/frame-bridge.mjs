// The page's side of the diagram iframe: it gives the runtime its host interface, reports when the runtime is ready and when the user may have changed something, and wraps every look into the frame.
const MODULES = { editor: "canvas/edit-mode", notes: "ui/notes-edit", server: "ui/server-edit", draw: "canvas/draw", model: "canvas/model" };
const ACTIVITY = ["pointerup", "keyup", "input", "change", "click"];

/**
 * @typedef {object} Host what the runtime may call on the page; installed on InfraDiagram once the runtime is ready
 * @property {(text: string) => {title: string, date: string, paras: string[]}} noteParser
 * @property {object} serverEditor  source, apply, add, duplicate, regionTypes, addRegion, move, renameNetwork
 */

/**
 * @param {HTMLIFrameElement} frame
 * @param {{host: Host, onLoad: (ready: boolean) => void, onChange: () => void, defer?: (fn: () => void) => void}} options
 * onLoad fires after every load of a frame that show() started; onChange fires, once per burst, after pointer, key or form activity inside a ready frame.
 */
export function createFrameBridge(frame, { host, onLoad, onChange, defer = (fn) => setTimeout(fn, 0) }) {
  let ready = false, expecting = false, queued = false;
  const waiters = [];
  const diagram = () => frame.contentWindow.InfraDiagram;
  const mod = (key) => (ready ? diagram()?.modules[MODULES[key]] ?? null : null);
  const notify = () => {
    if (queued) return;
    queued = true;
    defer(() => { queued = false; onChange(); });
  };
  frame.addEventListener("load", () => {
    if (!expecting) return;
    ready = !!diagram()?.modules[MODULES.editor];
    if (ready) {
      diagram().noteParser = host.noteParser;
      diagram().serverEditor = host.serverEditor;
      for (const type of ACTIVITY) frame.contentDocument.addEventListener(type, notify, true);
    }
    onLoad(ready);
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
    show(html) {
      expecting = true;
      ready = false;
      const loaded = new Promise((resolve) => waiters.push(resolve));
      frame.srcdoc = html;
      return loaded;
    },
  };
}
