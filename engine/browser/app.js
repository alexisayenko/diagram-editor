// Files live in local/ behind engine/serve.mjs; the model and geometry stay in this tab.
const { setNotes, setServer } = require("parse/toml-write.mjs");
const { parseNoteText, parseToml } = require("parse/toml.mjs");
const { mergeTypes } = require("parse/types.mjs");
const { parseNetworksFile, isNetworksFile } = require("parse/shared-networks.mjs");
const NETWORKS = "networks.toml";
const { validName, layoutNameFor, exportNames } = require("lib/names.mjs");
const openButton = document.querySelector("#open");
const picker = document.querySelector("#picker");
const saveButton = document.querySelector("#save");
const exportButton = document.querySelector("#export");
const status = document.querySelector("#status");
const frame = document.querySelector("#view");
let serverOk = false, active = null, ready = false, busy = false, netText = null, netItems = null, netError = null;
const editor = () => ready ? frame.contentWindow.InfraDiagram?.modules["canvas/edit-mode"] : null;
const notesApi = () => ready ? frame.contentWindow.InfraDiagram?.modules["ui/notes-edit"] : null;
const serverApi = () => ready ? frame.contentWindow.InfraDiagram?.modules["ui/server-edit"] : null;
const drawApi = () => ready ? frame.contentWindow.InfraDiagram?.modules["canvas/draw"] : null;
const unsaved = () => !!active && (active.work !== active.source || active.carryLayout || (notesApi() ? JSON.stringify(notesApi().texts()) !== JSON.stringify(active.notes) : false));
const dirty = () => editor()?.isDirty() || notesApi()?.isDirty() || serverApi()?.isDirty() || drawApi()?.isDirty() || unsaved() || false;
function message(text, error = false) { status.textContent = text; status.classList.toggle("error", error); }
function controls() {
  frame.inert = busy;
  openButton.disabled = busy;
  saveButton.disabled = busy || !ready || !serverOk || !dirty(); exportButton.disabled = busy || !ready;
}
function discard() { return !dirty() || window.confirm("Discard unsaved changes?"); }
async function call(path, options) {
  let response;
  try { response = await fetch(path, options); }
  catch (e) { throw new Error("The local server is not reachable. Run node engine/serve.mjs."); }
  let body = {};
  try { body = await response.json(); } catch (_) {}
  if (!response.ok) { const err = new Error(body.error || `Server error ${response.status}`); err.status = response.status; err.saved = body.saved || []; throw err; }
  return body;
}
async function stored(name) {
  try { return (await call("/api/file?name=" + encodeURIComponent(name))).text; }
  catch (e) { if (e.status === 404) return null; throw e; }
}
const putFiles = (files) => call("/api/files", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files }) });
async function latestStored() {
  const { files } = await call("/api/files");
  const tomls = files.filter((f) => /\.toml$/i.test(f.name) && f.name !== NETWORKS).sort((x, y) => y.mtime - x.mtime);
  return tomls.length ? tomls[0].name : null;
}
function load(filename, source, layoutText) {
  const layoutName = layoutNameFor(filename);
  let saved = null;
  if (layoutText !== null) { try { saved = JSON.parse(layoutText); } catch (e) { throw new Error(layoutName + ": invalid JSON: " + e.message); } }
  const result = require("browser/render.mjs").renderDiagram(source, filename, saved, ASSETS, [], netItems);
  ready = false;
  const LAYOUT_KEYS = ["version", "diagramId", "nodes", "clusters", "edges", "drawings"];
  const extra = saved ? Object.fromEntries(Object.entries(saved).filter(([k]) => !LAYOUT_KEYS.includes(k))) : {};
  active = { filename, layoutName, source, work: source, text: layoutText, extra, hadDrawings: !!saved && "drawings" in saved, id: result.id, notes: result.notes, carryLayout: false, reload: null, after: null };
  frame.srcdoc = result.html;
  document.querySelector("#welcome").hidden = true;
  frame.hidden = false;
  message(`${filename} · ${layoutText === null ? "Automatically arranged" : "Saved layout restored"}${result.problems ? " · Open Edit layout to resolve highlighted spacing" : ""}`);
}
function useNetworks(text) {
  netText = text; netItems = null; netError = null;
  if (text === null) return;
  try { netItems = parseNetworksFile(text); } catch (e) { netError = e.message; }
}
async function loadStored(name) {
  const source = await stored(name);
  if (source === null) throw new Error(name + " is no longer stored.");
  useNetworks(await stored(NETWORKS));
  load(name, source, await stored(layoutNameFor(name)));
  if (netError) message(netError, true);
}
frame.addEventListener("load", () => {
  if (!active) return;
  const diagram = frame.contentWindow.InfraDiagram;
  ready = !!diagram?.modules["canvas/edit-mode"];
  if (!ready) message("The diagram could not start. Reload it to retry.", true);
  else {
    diagram.noteParser = (text) => { const n = parseNoteText(text, "Note", true); return { title: n.title, date: n.date, paras: n.paras }; };
    diagram.serverEditor = { source: serverSource, apply: applyServer };
    const after = active.after;
    active.after = null;
    if (after?.edit) frame.contentDocument.getElementById("te").click();
    if (after?.key) diagram.select(after.key);
  }
  controls();
});
const decode = async (file) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(await file.arrayBuffer());
openButton.addEventListener("click", () => { if (discard()) picker.click(); });
picker.addEventListener("change", async () => {
  const chosen = [...picker.files]; picker.value = "";
  if (!chosen.length) return;
  busy = true; controls();
  try {
    const bad = chosen.filter((f) => !validName(f.name)).map((f) => f.name);
    if (bad.length) throw new Error(`Unsupported file name: ${bad.join(", ")}. Use letters, digits, dot, dash or underscore, ending in .toml or .json.`);
    const texts = new Map(await Promise.all(chosen.map(async (f) => [f.name, await decode(f)])));
    const net = [...texts].find(([n, t]) => /\.toml$/i.test(n) && isNetworksFile(n, t));
    if (net) { parseNetworksFile(net[1]); texts.delete(net[0]); texts.set(NETWORKS, net[1]); }
    const tomls = [...texts.keys()].filter((n) => /\.toml$/i.test(n) && n !== NETWORKS).sort((a, b) => a.localeCompare(b));
    if (!tomls.length && !net) throw new Error("Choose a .toml file (and optionally its .layout.json).");
    const name = tomls[0], layoutName = name && layoutNameFor(name);
    if (!serverOk) {
      if (net) useNetworks(net[1]);
      if (name) load(name, texts.get(name), texts.get(layoutName) ?? null);
      else if (active) load(active.filename, active.source, active.text);
      return;
    }
    const differing = [];
    for (const [n, text] of texts) { const old = await stored(n); if (old !== null && old !== text) differing.push(n); }
    if (differing.length && !window.confirm(`Replace the stored ${differing.join(", ")} with the file you chose?`)) return;
    await putFiles([...texts].map(([n, text]) => ({ name: n, text, overwrite: true })));
    if (name) await loadStored(name);
    else if (active) await loadStored(active.filename);
    else { useNetworks(net[1]); message("Stored networks.toml in local/; open a diagram to see it."); }
    if (netError) message(netError, true);
  } catch (e) { message(e.message, true); }
  finally { busy = false; controls(); }
});
function serverSource(id) {
  const root = parseToml(active.work), s = (root.servers || []).find((x) => x.id === id);
  if (!s) return null;
  const types = mergeTypes(root.server_types), region = (root.regions || []).find((r) => r.id === s.region);
  return { ...s, name: s.name ?? s.id, server_type: s.server_type ?? region?.server_type, types: Object.entries(types).map(([tid, t]) => ({ id: tid, label: t.label })) };
}
function applyServer(id, fields) {
  const open = notesApi().finish();
  if (open) return "Fix the note first: " + open;
  try {
    const next = setServer(active.work, id, fields);
    if (next !== active.work) rerender(next, id);
    return null;
  } catch (e) { return String(e.message).replace(/^TOML: /, ""); }
}
function rerender(next, id) {
  const api = editor(), notes = notesApi(), texts = notes.texts();
  const edited = JSON.stringify(texts) !== JSON.stringify(active.notes);
  const layout = { ...api.currentLayout(), drawings: drawApi().list() };
  const result = require("browser/render.mjs").renderDiagram(edited ? setNotes(next, texts) : next, active.filename, layout, ASSETS, [id], netItems);
  const wasEdit = !!frame.contentWindow.InfraDiagram.modules["canvas/model"].state.on;
  active.carryLayout = active.carryLayout || api.isDirty() || drawApi().isDirty();
  active.work = next;
  active.after = { key: "n:" + id, edit: wasEdit };
  ready = false;
  active.reload = new Promise((resolve) => frame.addEventListener("load", () => { active.reload = null; resolve(); }, { once: true }));
  frame.srcdoc = result.html;
}
async function settle() {
  const open = serverApi()?.finish();
  if (open) throw new Error("Fix the server first: " + open);
  if (active.reload) await active.reload;
}
function pending() {
  const api = editor(), notes = notesApi();
  const open = notes.finish();
  if (open) throw new Error("Fix the note first: " + open);
  const texts = notes.texts(), notesChanged = JSON.stringify(texts) !== JSON.stringify(active.notes);
  const layout = api.currentLayout(), drawings = drawApi().list();
  const tomlText = notesChanged ? setNotes(active.work, texts) : active.work;
  return {
    api, notes, texts, drawings, changed: tomlText !== active.source, layout,
    layoutText: JSON.stringify({ version: 1, diagramId: active.id, ...active.extra, ...layout, ...(drawings.length || active.hadDrawings ? { drawings } : {}) }, null, 2) + "\n",
    tomlText,
  };
}
saveButton.addEventListener("click", async () => {
  if (!editor()) return;
  busy = true; controls();
  let p = null;
  try {
    await settle();
    p = pending();
    const files = [{ name: active.layoutName, text: p.layoutText, base: active.text }];
    if (p.changed) files.push({ name: active.filename, text: p.tomlText, base: active.source });
    await putFiles(files);
    afterSave(p, files.map((f) => f.name));
    message(p.changed ? `Saved ${active.layoutName} and ${active.filename} in local/` : `Saved ${active.layoutName} in local/`);
  } catch (e) {
    if (p && e.saved?.length) {
      afterSave(p, e.saved);
      const left = [active.layoutName, ...(p.changed ? [active.filename] : [])].filter((n) => !e.saved.includes(n));
      message(`Saved ${e.saved.join(", ")}. ${e.message} Not saved: ${left.join(", ")}.`, true);
    } else message("Save failed: " + e.message, true);
  }
  finally { busy = false; controls(); }
});
function afterSave(p, names) {
  if (names.includes(active.layoutName)) { active.text = p.layoutText; p.api.commit(p.layout); drawApi().markSaved(); active.hadDrawings = active.hadDrawings || p.drawings.length > 0; }
  if (p.changed && names.includes(active.filename)) { active.source = p.tomlText; active.work = p.tomlText; active.notes = p.texts; p.notes.markSaved(p.texts); }
  if (names.includes(active.layoutName)) active.carryLayout = false;
}
function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
exportButton.addEventListener("click", async () => {
  if (!editor()) return;
  try {
    await settle();
    const p = pending(), names = exportNames(active.filename);
    download(names.toml, p.tomlText);
    setTimeout(() => download(names.layout, p.layoutText), 400);
    message(`Exported ${names.toml} and ${names.layout} to your downloads`);
  } catch (e) { message("Export failed: " + e.message, true); }
});
window.addEventListener("beforeunload", (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ""; } });
setInterval(() => { if (!busy) controls(); }, 250);
(async () => {
  try {
    serverOk = true;
    const latest = await latestStored();
    if (latest) await loadStored(latest);
  } catch (e) {
    if (serverOk && active) message(e.message, true);
    else {
      serverOk = !/not reachable/.test(e.message);
      message(serverOk ? e.message : "No local server: files open in memory only and cannot be saved here. Run node engine/serve.mjs and open its address to store and save files; Export still works.", true);
    }
  }
  controls();
})();
