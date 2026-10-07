// Files live in local/ behind engine/serve.mjs; the model and geometry stay in this tab.
const { setNotes } = require("parse/toml-write.mjs");
const { parseNoteText } = require("parse/toml.mjs");
const { validName, layoutNameFor, exportNames } = require("lib/names.mjs");
const openButton = document.querySelector("#open");
const picker = document.querySelector("#picker");
const saveButton = document.querySelector("#save");
const exportButton = document.querySelector("#export");
const status = document.querySelector("#status");
const frame = document.querySelector("#view");
let serverOk = false, active = null, ready = false, busy = false;
const editor = () => ready ? frame.contentWindow.InfraDiagram?.modules["canvas/edit-mode"] : null;
const notesApi = () => ready ? frame.contentWindow.InfraDiagram?.modules["ui/notes-edit"] : null;
const dirty = () => editor()?.isDirty() || notesApi()?.isDirty() || false;
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
  const tomls = files.filter((f) => /\.toml$/i.test(f.name)).sort((x, y) => y.mtime - x.mtime);
  return tomls.length ? tomls[0].name : null;
}
function load(filename, source, layoutText) {
  const layoutName = layoutNameFor(filename);
  let saved = null;
  if (layoutText !== null) { try { saved = JSON.parse(layoutText); } catch (e) { throw new Error(layoutName + ": invalid JSON: " + e.message); } }
  const result = require("browser/render.mjs").renderDiagram(source, filename, saved, ASSETS);
  ready = false;
  active = { filename, layoutName, source, text: layoutText, id: result.id, notes: result.notes };
  frame.srcdoc = result.html;
  document.querySelector("#welcome").hidden = true;
  frame.hidden = false;
  message(`${filename} · ${layoutText === null ? "Automatically arranged" : "Saved layout restored"}${result.problems ? " · Open Edit layout to resolve highlighted spacing" : ""}`);
}
async function loadStored(name) {
  const source = await stored(name);
  if (source === null) throw new Error(name + " is no longer stored.");
  load(name, source, await stored(layoutNameFor(name)));
}
frame.addEventListener("load", () => {
  if (!active) return;
  const diagram = frame.contentWindow.InfraDiagram;
  ready = !!diagram?.modules["canvas/edit-mode"];
  if (!ready) message("The diagram could not start. Reload it to retry.", true);
  else diagram.noteParser = (text) => { const n = parseNoteText(text, "Note", true); return { title: n.title, date: n.date, paras: n.paras }; };
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
    const tomls = chosen.filter((f) => /\.toml$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
    if (!tomls.length) throw new Error("Choose a .toml file (and optionally its .layout.json).");
    const texts = new Map(await Promise.all(chosen.map(async (f) => [f.name, await decode(f)])));
    const name = tomls[0].name, layoutName = layoutNameFor(name);
    if (!serverOk) { load(name, texts.get(name), texts.get(layoutName) ?? null); return; }
    const differing = [];
    for (const [n, text] of texts) { const old = await stored(n); if (old !== null && old !== text) differing.push(n); }
    if (differing.length && !window.confirm(`Replace the stored ${differing.join(", ")} with the file you chose?`)) return;
    await putFiles([...texts].map(([n, text]) => ({ name: n, text, overwrite: true })));
    await loadStored(name);
  } catch (e) { message(e.message, true); }
  finally { busy = false; controls(); }
});
function pending() {
  const api = editor(), notes = notesApi();
  const open = notes.finish();
  if (open) throw new Error("Fix the note first: " + open);
  const texts = notes.texts(), changed = JSON.stringify(texts) !== JSON.stringify(active.notes);
  const layout = api.currentLayout();
  return {
    api, notes, texts, changed, layout,
    layoutText: JSON.stringify({ version: 1, diagramId: active.id, ...layout }, null, 2) + "\n",
    tomlText: changed ? setNotes(active.source, texts) : active.source,
  };
}
saveButton.addEventListener("click", async () => {
  if (!editor()) return;
  busy = true; controls();
  let p = null;
  try {
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
  if (names.includes(active.layoutName)) { active.text = p.layoutText; p.api.commit(p.layout); }
  if (p.changed && names.includes(active.filename)) { active.source = p.tomlText; active.notes = p.texts; p.notes.markSaved(p.texts); }
}
function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
exportButton.addEventListener("click", () => {
  if (!editor()) return;
  try {
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
