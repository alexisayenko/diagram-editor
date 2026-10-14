// A saved diagram is a folder in local/ behind engine/serve.mjs; the model and geometry stay in this tab. Files travel as .diag.zip archives.
const { parseNoteText, withRoot } = require("parse/toml.mjs");
const { newDiagram } = require("parse/new-diagram.mjs");
const { renderDiagram } = require("browser/render.mjs");
const { layoutNameFor } = require("lib/names.mjs");
const { unpackDiagram } = require("lib/diagrams.mjs");
const { LAYOUT_VERSION, decideLayoutLoad } = require("parse/layout-version.mjs");
const { isArchiveName, MAX_ARCHIVE_BYTES } = require("lib/zip.mjs");
const { TOPOLOGY_FILE, LEGACY_TOPOLOGY_FILE } = require("lib/files.mjs");
const { createApi } = require("browser/api.mjs");
const { createSession, createSessionHolder, markNew, markImported, hasUnsaved } = require("browser/session.mjs");
const { createFrameBridge } = require("browser/frame-bridge.mjs");
const { createDialogs, createConfirmer } = require("browser/dialogs.mjs");
const { createOpenFlow, createNewFlow, createImportFlow, createHostFlow } = require("browser/dialog-flows.mjs");
const { createEdits } = require("browser/edits.mjs");
const { createSaver } = require("browser/save.mjs");
const $ = (id) => document.querySelector("#" + id);
const [newButton, openButton, diagButton, diagFile, saveButton, exportButton, importButton, status, frame] = ["new", "open", "importdiag", "diagfile", "save", "export", "import", "status", "view"].map($);
let serverOk = false, busy = false;
const isServerUp = () => serverOk;
const isTomlPath = (p) => /\.toml$/i.test(p);
const api = createApi((path, options) => fetch(path, options));
const sessions = createSessionHolder();
const confirmer = createConfirmer((text) => window.confirm(text));
const dialogs = createDialogs();
let routeCache = null;
const render = (files, folder, layout, refit) => {
  const result = renderDiagram(files, folder, layout, ASSETS, refit, routeCache);
  routeCache = result.routeCache;
  return result;
};
const noteParser = (text) => { const n = parseNoteText(text, "Note", true); return { title: n.title, date: n.date, paras: n.paras }; };
const host = { noteParser, get serverEditor() { return edits.serverEditor; } };
const bridge = createFrameBridge(frame, { host, onLoad, onChange: () => { if (!busy) controls(); } });
const edits = createEdits({ sessions, bridge, render });
const saver = createSaver({ sessions, bridge, api, confirmer, isServerUp, message, download });
const dirty = () => bridge.isDirty() || hasUnsaved(sessions.current(), bridge.noteTexts());
const discard = () => confirmer.discard(dirty);
function message(text, error = false) { status.textContent = text; status.classList.toggle("error", error); }
function controls() {
  const ready = bridge.isReady();
  frame.inert = busy;
  newButton.disabled = busy;
  openButton.disabled = busy;
  diagButton.disabled = busy;
  saveButton.disabled = busy || !ready || !serverOk || !dirty(); exportButton.disabled = busy || !ready;
  importButton.disabled = busy || !ready || importFlow.isOpen();
}
function onLoad(ready) {
  if (!ready) message("The diagram could not start. Reload it to retry.", true);
  else {
    const session = sessions.current(), after = session.after;
    session.after = null;
    if (after?.edit) bridge.clickEdit();
    if (after?.key) bridge.select(after.key);
  }
  controls();
}
function load(folder, files, layoutText) {
  const layoutName = layoutNameFor(folder);
  let saved = null;
  if (layoutText !== null) { try { saved = JSON.parse(layoutText); } catch (e) { throw new Error(layoutName + ": invalid JSON: " + e.message); } }
  const decision = decideLayoutLoad(saved, LAYOUT_VERSION), result = render(files, folder, decision.use, []);
  sessions.start(createSession({ folder, layoutName, files, layoutText, layout: decision.use, layoutLocked: decision.lockSave, id: result.id, notes: result.notes }));
  bridge.show(result.html);
  $("welcome").hidden = true;
  frame.hidden = false;
  message(`${folder} · ${layoutText === null || decision.lockSave ? "Automatically arranged" : "Saved layout restored"}${result.problems ? " · Open Edit layout to resolve highlighted spacing" : ""}${[...(decision.warning ? [decision.warning] : []), ...result.warnings].map((w) => " · Warning: " + w).join("")}`);
}
async function loadStored(folder) {
  const { files: listed } = await api.call("/api/files"), prefix = folder + "/";
  const paths = listed.map((f) => f.name).filter((n) => n.startsWith(prefix) && isTomlPath(n)).map((n) => n.slice(prefix.length));
  const texts = await Promise.all(paths.map((p) => api.stored(prefix + p)));
  const files = new Map();
  paths.forEach((p, i) => { if (texts[i] !== null) files.set(p, texts[i]); });
  if (!files.has(TOPOLOGY_FILE) && !files.has(LEGACY_TOPOLOGY_FILE)) throw new Error(folder + " is no longer stored.");
  load(folder, withRoot(files), await api.stored(layoutNameFor(folder)));
}
async function whileBusy(task) {
  busy = true; controls();
  try { await task(); }
  catch (e) { message(e.message, true); }
  finally { busy = false; controls(); }
}
async function importArchive(file) {
  if (!isArchiveName(file.name)) { message("Only .diag.zip files can be opened.", true); return; }
  if (file.size > MAX_ARCHIVE_BYTES) { message("The archive is larger than 20 MB.", true); return; }
  if (!discard()) return;
  await whileBusy(async () => {
    const opened = await unpackDiagram(new Uint8Array(await file.arrayBuffer()), file.name);
    load(opened.name, withRoot(opened.files), opened.layoutText);
    markImported(sessions.current());
    message(`${opened.name} · Imported from ${file.name}, not saved yet${serverOk ? "" : " · No local server: Export downloads it"}`);
  });
}
function download(name, bytes, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const openFlow = createOpenFlow({
  dialogs, doc: document, opener: openButton, api, isServerUp, discard,
  els: { panel: $("op"), close: $("opclose"), list: $("oplist"), query: $("opq"), note: $("opnote") },
  onPick: (name) => whileBusy(() => loadStored(name)),
});
const newFlow = createNewFlow({
  dialogs, doc: document, opener: newButton, api, isServerUp, discard,
  els: { panel: $("nw"), name: $("nwname"), msg: $("nwmsg"), list: $("nwlist"), taken: $("nwtaken"), ok: $("nwok"), cancel: $("nwcancel") },
  onCreate(folder) {
    try {
      load(folder, newDiagram(folder), null);
      markNew(sessions.current());
      message(`${folder} · New diagram, not saved yet${serverOk ? "" : " · No local server: Export downloads it"}`);
    } catch (e) { message(e.message, true); }
    controls();
  },
});
const importFlow = createImportFlow({
  dialogs, doc: document, opener: importButton, sessions, bridge, rerenderMany: edits.rerenderMany, message, isServerUp, controls,
  makeOption: (text, value) => new Option(text, value),
  els: { panel: $("imp"), files: $("impfiles"), list: $("implist"), type: $("imptype"), region: $("impregion"), info: $("impinfo"), ok: $("impok"), cancel: $("impcancel") },
});
const hostButton = $("hostscript");
const hostFlow = createHostFlow({
  dialogs, doc: document, opener: hostButton, script: HOST_SCRIPT,
  env: { navigator, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (t) => clearTimeout(t) },
  els: { panel: $("hs"), text: $("hstext"), note: $("hsnote"), details: $("hsd"), close: $("hsclose"), copyButtons: [...$("hs").querySelectorAll(".cp")] },
});

openButton.addEventListener("click", openFlow.show);
newButton.addEventListener("click", newFlow.show);
importButton.addEventListener("click", importFlow.pick);
hostButton.addEventListener("click", hostFlow.show);
diagButton.addEventListener("click", () => diagFile.click());
const reportError = (e) => message(e.message, true);
diagFile.addEventListener("change", () => {
  const f = diagFile.files[0];
  diagFile.value = "";
  if (f) importArchive(f).catch(reportError);
});
saveButton.addEventListener("click", async () => {
  if (!bridge.editor()) return;
  busy = true; controls();
  try { await saver.save(); }
  finally { busy = false; controls(); }
});
exportButton.addEventListener("click", () => { if (bridge.editor()) saver.exportDiagram(); });
window.addEventListener("unhandledrejection", (e) => { message("Unexpected error: " + (e.reason?.message ?? e.reason), true); });
window.addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); });
window.addEventListener("drop", (e) => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  if (!busy) importArchive(e.dataTransfer.files[0]).catch(reportError);
});
window.addEventListener("beforeunload", (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ""; /* NOSONAR: required by browsers to show the unload prompt */ } });
(async () => {
  try {
    serverOk = true;
    const latest = await api.latestStored();
    if (latest) await loadStored(latest);
  } catch (e) {
    if (serverOk && sessions.has()) message(e.message, true);
    else {
      serverOk = !/not reachable/.test(e.message);
      message(serverOk ? e.message : "No local server: saved diagrams are unavailable and nothing can be saved here. Use Import diagram to open a .diag.zip, or run node engine/serve.mjs and open its address; Export still works.", true);
    }
  }
  controls();
})().catch((e) => message(e.message, true));
