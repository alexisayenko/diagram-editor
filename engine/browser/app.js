// Folder handles remain in this tab; model and geometry never leave the browser.
const openButton = document.querySelector("#open");
const select = document.querySelector("#diagram");
const reloadButton = document.querySelector("#reload");
const saveButton = document.querySelector("#save");
const status = document.querySelector("#status");
const frame = document.querySelector("#view");
let folder = null, active = null, ready = false, busy = false;
const editor = () => ready ? frame.contentWindow.InfraDiagram?.modules["canvas/edit-mode"] : null;
const dirty = () => editor()?.isDirty() || false;
function message(text, error = false) { status.textContent = text; status.classList.toggle("error", error); }
function controls() {
  frame.inert = busy;
  openButton.disabled = busy; select.disabled = busy || !folder;
  reloadButton.disabled = busy || !active; saveButton.disabled = busy || !ready;
}
function discard() { return !dirty() || window.confirm("Discard unsaved layout changes?"); }
async function layoutText(dir, name) {
  try { return await (await (await dir.getFileHandle(name)).getFile()).text(); }
  catch (e) { if (e.name === "NotFoundError") return null; throw e; }
}
async function load(dir, filename) {
  const source = await (await (await dir.getFileHandle(filename)).getFile()).text();
  const layoutName = filename.replace(/\.toml$/i, ".layout.json");
  const text = await layoutText(dir, layoutName);
  let saved = null;
  if (text !== null) { try { saved = JSON.parse(text); } catch (e) { throw new Error(layoutName + ": invalid JSON: " + e.message); } }
  const result = require("browser/render.mjs").renderDiagram(source, filename, saved, ASSETS);
  // Replace the view only after both the model and saved geometry are accepted.
  ready = false;
  active = { filename, layoutName, text, id: result.id, folder: dir };
  frame.srcdoc = result.html;
  document.querySelector("#welcome").hidden = true;
  frame.hidden = false;
  message(`${filename} · ${text === null ? "Automatically arranged" : "Saved layout restored"}${result.problems ? " · Open Edit layout to resolve highlighted spacing" : ""}`);
}
frame.addEventListener("load", () => {
  if (!active) return;
  ready = !!frame.contentWindow.InfraDiagram?.modules["canvas/edit-mode"];
  if (!ready) message("The diagram could not start. Reload it to retry.", true);
  controls();
});
openButton.addEventListener("click", async () => {
  if (!discard()) return;
  busy = true; controls();
  try {
    const chosen = await window.showDirectoryPicker({ id: "infra-diagrams", mode: "readwrite" });
    const files = [];
    for await (const [name, handle] of chosen.entries()) if (handle.kind === "file" && /\.toml$/i.test(name)) files.push(name);
    files.sort((a, b) => a.localeCompare(b));
    if (!files.length) throw new Error("This folder contains no TOML files. Choose the folder containing your diagram.");
    await load(chosen, files[0]);
    folder = chosen;
    select.replaceChildren(...files.map((name) => { const o = document.createElement("option"); o.value = name; o.textContent = name; return o; }));
    select.value = files[0];
  } catch (e) { if (e.name !== "AbortError") message(e.message, true); }
  finally { busy = false; controls(); }
});
select.addEventListener("change", async () => {
  if (!discard()) { select.value = active.filename; return; }
  busy = true; controls();
  try { await load(folder, select.value); }
  catch (e) { select.value = active.filename; message(e.message, true); }
  finally { busy = false; controls(); }
});
reloadButton.addEventListener("click", async () => {
  if (!discard()) return;
  busy = true; controls();
  try { await load(active.folder, active.filename); }
  catch (e) { message(e.message, true); }
  finally { busy = false; controls(); }
});
saveButton.addEventListener("click", async () => {
  const api = editor(); if (!api) return;
  busy = true; controls();
  try {
    // Request permission from this top-level click, before any asynchronous file reads.
    if (await active.folder.requestPermission({ mode: "readwrite" }) !== "granted") throw new Error("Folder write permission was denied. Your edits are still open.");
    if (await layoutText(active.folder, active.layoutName) !== active.text) throw new Error("The layout file changed on disk. Save was stopped to preserve it. Download your edits or reload the diagram.");
    const layout = api.currentLayout();
    const text = JSON.stringify({ version: 1, diagramId: active.id, ...layout }, null, 2) + "\n";
    const handle = await active.folder.getFileHandle(active.layoutName, { create: true });
    const writer = await handle.createWritable();
    try { await writer.write(text); await writer.close(); }
    catch (e) { try { await writer.abort(); } catch (_) {} throw e; }
    active.text = text;
    api.commit(layout);
    message(`Saved ${active.layoutName} beside ${active.filename}`);
  } catch (e) { message("Save failed: " + e.message, true); }
  finally { busy = false; controls(); }
});
window.addEventListener("beforeunload", (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ""; } });
if (!window.isSecureContext || !window.showDirectoryPicker) {
  openButton.disabled = true;
  message("Open this page in desktop Edge or Chrome. If folder access is unavailable, run node engine/serve.mjs and open its localhost address.", true);
}
