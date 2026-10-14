// A saved diagram is a folder in local/ behind engine/serve.mjs; the model and geometry stay in this tab. Files travel as .diag.zip archives.
const { setNotes, setServer, addServer, duplicateServer, addRegion, moveServer, freeRegionTypes } = require("parse/toml-write.mjs");
const { appendNetworks } = require("parse/networks-append.mjs");
const { setNetworkName, normalizeName } = require("parse/networks-name.mjs");
const { parseNoteText, mergeFolder, withRoot, tomlModel } = require("parse/toml.mjs");
const { mergeTypes } = require("parse/types.mjs");
const { newDiagram, DIAGRAM_ID } = require("parse/new-diagram.mjs");
const { planImport, gridPlacements, summary } = require("parse/import-servers.mjs");
const { layoutNameFor, archiveName } = require("lib/names.mjs");
const { listDiagrams, filterDiagrams, FILTER_MIN, nameProblem, whenText, packDiagram, unpackDiagram } = require("lib/diagrams.mjs");
const { isArchiveName, MAX_ARCHIVE_BYTES } = require("lib/zip.mjs");
const newButton = document.querySelector("#new");
const openButton = document.querySelector("#open");
const diagButton = document.querySelector("#importdiag");
const diagFile = document.querySelector("#diagfile");
const saveButton = document.querySelector("#save");
const exportButton = document.querySelector("#export");
const importButton = document.querySelector("#import");
const status = document.querySelector("#status");
const frame = document.querySelector("#view");
let serverOk = false, active = null, ready = false, busy = false;
const NOTES = "notes.toml", LAYOUT = "diagram.layout.json", REGION_W = 220, REGION_H = 120;
const isTomlPath = (p) => /\.toml$/i.test(p);
const editor = () => ready ? frame.contentWindow.InfraDiagram?.modules["canvas/edit-mode"] : null;
const notesApi = () => ready ? frame.contentWindow.InfraDiagram?.modules["ui/notes-edit"] : null;
const serverApi = () => ready ? frame.contentWindow.InfraDiagram?.modules["ui/server-edit"] : null;
const drawApi = () => ready ? frame.contentWindow.InfraDiagram?.modules["canvas/draw"] : null;
const unsaved = () => !!active && (JSON.stringify([...active.work]) !== JSON.stringify([...active.source]) || active.carryLayout || (notesApi() ? JSON.stringify(notesApi().texts()) !== JSON.stringify(active.notes) : false));
const dirty = () => editor()?.isDirty() || notesApi()?.isDirty() || serverApi()?.isDirty() || drawApi()?.isDirty() || unsaved() || false;
const notesEdited = (texts) => JSON.stringify(texts) !== JSON.stringify(active.notes);
const plural = (n) => (n === 1 ? "" : "s");
function message(text, error = false) { status.textContent = text; status.classList.toggle("error", error); }
function controls() {
  frame.inert = busy;
  newButton.disabled = busy;
  openButton.disabled = busy;
  diagButton.disabled = busy;
  saveButton.disabled = busy || !ready || !serverOk || !dirty(); exportButton.disabled = busy || !ready;
  importButton.disabled = busy || !ready || !impPanel.hidden;
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
  catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}
const putFiles = (files) => call("/api/files", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files }) });
async function listStored() { return listDiagrams((await call("/api/files")).files); }
async function latestStored() { return (await listStored())[0]?.name ?? null; }
function load(folder, files, layoutText) {
  const layoutName = layoutNameFor(folder);
  let saved = null;
  if (layoutText !== null) { try { saved = JSON.parse(layoutText); } catch (e) { throw new Error(layoutName + ": invalid JSON: " + e.message); } }
  const result = require("browser/render.mjs").renderDiagram(files, folder, saved, ASSETS, []);
  ready = false;
  const LAYOUT_KEYS = new Set(["version", "diagramId", "nodes", "clusters", "edges", "drawings"]);
  const extra = saved ? Object.fromEntries(Object.entries(saved).filter(([k]) => !LAYOUT_KEYS.has(k))) : {};
  active = { folder, layoutName, source: new Map(files), work: new Map(files), text: layoutText, extra, hadDrawings: !!saved && "drawings" in saved, id: result.id, notes: result.notes, carryLayout: false, reload: null, after: null, netNames: new Map() };
  frame.srcdoc = result.html;
  document.querySelector("#welcome").hidden = true;
  frame.hidden = false;
  message(`${folder} · ${layoutText === null ? "Automatically arranged" : "Saved layout restored"}${result.problems ? " · Open Edit layout to resolve highlighted spacing" : ""}`);
}
async function loadStored(folder) {
  const { files: listed } = await call("/api/files"), prefix = folder + "/";
  const paths = listed.map((f) => f.name).filter((n) => n.startsWith(prefix) && isTomlPath(n)).map((n) => n.slice(prefix.length));
  const texts = await Promise.all(paths.map((p) => stored(prefix + p)));
  const files = new Map();
  paths.forEach((p, i) => { if (texts[i] !== null) files.set(p, texts[i]); });
  if (!files.has("topology.toml") && !files.has("diagram.toml")) throw new Error(folder + " is no longer stored.");
  load(folder, withRoot(files), await stored(layoutNameFor(folder)));
}
frame.addEventListener("load", () => {
  if (!active) return;
  const diagram = frame.contentWindow.InfraDiagram;
  ready = !!diagram?.modules["canvas/edit-mode"];
  if (!ready) message("The diagram could not start. Reload it to retry.", true);
  else {
    diagram.noteParser = (text) => { const n = parseNoteText(text, "Note", true); return { title: n.title, date: n.date, paras: n.paras }; };
    diagram.serverEditor = { source: serverSource, apply: applyServer, add: addNewServer, duplicate: duplicateExisting, regionTypes, addRegion: addNewRegion, move: moveToRegion, renameNetwork };
    const after = active.after;
    active.after = null;
    if (after?.edit) frame.contentDocument.getElementById("te").click();
    if (after?.key) diagram.select(after.key);
  }
  controls();
});
const decode = async (file) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(await file.arrayBuffer());
const opPanel = document.querySelector("#op"), opList = document.querySelector("#oplist"), opQuery = document.querySelector("#opq"), opNote = document.querySelector("#opnote");
const nwPanel = document.querySelector("#nw"), nwName = document.querySelector("#nwname"), nwMsg = document.querySelector("#nwmsg"), nwList = document.querySelector("#nwlist"), nwOk = document.querySelector("#nwok");
let opRows = [], nwTaken = [];
function opClose() { opPanel.hidden = true; openButton.focus(); }
function opRender() {
  const rows = filterDiagrams(opRows, opQuery.value);
  opList.textContent = "";
  for (const r of rows) {
    const li = document.createElement("li"), b = document.createElement("button"), n = document.createElement("strong"), meta = document.createElement("span");
    b.type = "button"; b.className = "item"; b.dataset.name = r.name;
    n.textContent = r.name;
    meta.textContent = `${r.servers} server${r.servers === 1 ? "" : "s"} · ${whenText(r.mtime)}`;
    b.append(n, meta);
    b.addEventListener("click", () => opPick(r.name));
    li.append(b); opList.append(li);
  }
  if (!opRows.length) opNote.textContent = "No saved diagrams yet. Use New diagram or Import diagram.";
  else opNote.textContent = rows.length ? "" : "No diagram matches the filter.";
}
async function opShow() {
  opRows = []; opQuery.value = ""; opQuery.hidden = true; opList.textContent = ""; opNote.textContent = "";
  opPanel.hidden = false;
  if (!serverOk) opNote.textContent = "No local server is running, so there are no saved diagrams. Use Import diagram to open a .diag.zip file, or run node engine/serve.mjs.";
  else {
    try { opRows = await listStored(); opQuery.hidden = opRows.length < FILTER_MIN; opRender(); }
    catch (e) { opNote.textContent = e.message; }
  }
  (opQuery.hidden ? opList.querySelector("button") ?? document.querySelector("#opclose") : opQuery).focus();
}
async function opPick(name) {
  if (!discard()) return;
  opPanel.hidden = true;
  busy = true; controls();
  try { await loadStored(name); }
  catch (e) { message(e.message, true); }
  finally { busy = false; controls(); }
}
openButton.addEventListener("click", opShow);
opQuery.addEventListener("input", opRender);
document.querySelector("#opclose").addEventListener("click", opClose);
opPanel.addEventListener("mousedown", (e) => { if (e.target === opPanel) opClose(); });
function nwClose() { nwPanel.hidden = true; newButton.focus(); }
function nwCheck() {
  const problem = nameProblem(nwName.value.trim(), nwTaken);
  nwMsg.textContent = nwName.value.trim() ? problem || "" : "";
  nwOk.disabled = !!problem;
}
async function nwShow() {
  nwTaken = [];
  if (serverOk) { try { nwTaken = (await listStored()).map((r) => r.name); } catch (_) {} }
  nwList.textContent = "";
  for (const n of nwTaken) { const li = document.createElement("li"); li.textContent = n; nwList.append(li); }
  document.querySelector("#nwtaken").hidden = !nwTaken.length;
  nwName.value = "new-diagram"; nwCheck();
  nwPanel.hidden = false;
  nwName.focus(); nwName.select();
}
function nwCreate() {
  const folder = nwName.value.trim();
  if (nameProblem(folder, nwTaken) || !discard()) return;
  nwPanel.hidden = true;
  try {
    load(folder, newDiagram(folder), null);
    active.source = new Map();
    message(`${folder} · New diagram, not saved yet${serverOk ? "" : " · No local server: Export downloads it"}`);
  } catch (e) { message(e.message, true); }
  controls();
}
newButton.addEventListener("click", nwShow);
nwName.addEventListener("input", nwCheck);
nwName.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); nwCreate(); } });
nwOk.addEventListener("click", nwCreate);
document.querySelector("#nwcancel").addEventListener("click", nwClose);
nwPanel.addEventListener("mousedown", (e) => { if (e.target === nwPanel) nwClose(); });
async function importArchive(file) {
  if (!isArchiveName(file.name)) { message("Only .diag.zip files can be opened.", true); return; }
  if (file.size > MAX_ARCHIVE_BYTES) { message("The archive is larger than 20 MB.", true); return; }
  if (!discard()) return;
  busy = true; controls();
  try {
    const opened = await unpackDiagram(new Uint8Array(await file.arrayBuffer()), file.name);
    load(opened.name, withRoot(opened.files), opened.layoutText);
    active.source = new Map(); active.text = null; active.carryLayout = true; active.fresh = true;
    message(`${opened.name} · Imported from ${file.name}, not saved yet${serverOk ? "" : " · No local server: Export downloads it"}`);
  } catch (e) { message(e.message, true); }
  finally { busy = false; controls(); }
}
const reportError = (e) => message(e.message, true);
diagButton.addEventListener("click", () => diagFile.click());
diagFile.addEventListener("change", () => {
  const f = diagFile.files[0];
  diagFile.value = "";
  if (f) importArchive(f).catch(reportError);
});
window.addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); });
window.addEventListener("drop", (e) => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  if (!busy) importArchive(e.dataTransfer.files[0]).catch(reportError);
});
const serverPath = (id) => `servers/${id}.toml`;
function serverSource(id) {
  const root = mergeFolder(active.work), s = (root.servers || []).find((x) => x.id === id);
  if (!s) return null;
  const types = mergeTypes(root.server_types), region = (root.regions || []).find((r) => r.id === s.region);
  return { ...s, name: s.name ?? s.id, server_type: s.server_type ?? region?.server_type, types: Object.entries(types).map(([tid, t]) => ({ id: tid, label: t.label })) };
}
function applyServer(id, fields) {
  const open = notesApi()?.finish();
  if (open) return "Fix the note first: " + open;
  try {
    const path = serverPath(id), text = active.work.get(path);
    if (text === undefined) return `Server '${id}' has no file ${path}.`;
    const next = setServer(text, id, fields, mergeFolder(active.work));
    if (next !== text) rerender(path, next, id);
    return null;
  } catch (e) { return String(e.message).replace(/^TOML: /, ""); }
}
const editBlocked = () => {
  if (!ready) return "Try again once the diagram has reloaded.";
  const open = notesApi().finish() || serverApi().finish();
  return open ? "Fix the open edit first: " + open : null;
};
function addNewServer(region, x, y) {
  const blocked = editBlocked();
  if (blocked) return blocked;
  try {
    const generic = mergeTypes(mergeFolder(active.work).server_types).server ? "server" : undefined;
    const { path, text, id } = addServer(active.work, region ? { region } : { server_type: generic });
    rerender(path, text, id, [x, y]);
    return null;
  } catch (e) { return String(e.message).replace(/^TOML: /, ""); }
}
function duplicateExisting(id) {
  const blocked = editBlocked();
  if (blocked) return blocked;
  try {
    const { path, text, id: copy } = duplicateServer(active.work, id), from = editor().currentLayout().nodes[id];
    rerender(path, text, copy, from ? [Math.round(from.x) + 30, Math.round(from.y) + 30] : undefined);
    return null;
  } catch (e) { return String(e.message).replace(/^TOML: /, ""); }
}
function regionTypes() { return freeRegionTypes(active.work); }
function addNewRegion(type, x, y) {
  const blocked = editBlocked();
  if (blocked) return blocked;
  try {
    const { path, text, id } = addRegion(active.work, { server_type: type });
    rerender(path, text, id, null, { key: "c:" + id, region: { x, y, w: REGION_W, h: REGION_H, title: [x + REGION_W / 2, y + 20] } });
    return null;
  } catch (e) { return String(e.message).replace(/^TOML: /, ""); }
}
function moveToRegion(id, region) {
  const blocked = editBlocked();
  if (blocked) return blocked;
  try {
    const { path, text } = moveServer(active.work, id, region);
    if (text !== active.work.get(path)) rerender(path, text, id);
    return null;
  } catch (e) { return String(e.message).replace(/^TOML: /, ""); }
}
function renameNetwork(cidr, name) {
  const blocked = editBlocked();
  if (blocked) return blocked;
  try {
    const clean = normalizeName(name), prev = active.work.get(NETWORKS) ?? null, next = setNetworkName(prev, cidr, clean);
    if (next === prev) return null;
    active.netNames.set(cidr, clean);
    rerenderMany(new Map([[NETWORKS, next]]), {}, [], undefined);
    return null;
  } catch (e) { return String(e.message).replace(/^TOML: /, ""); }
}
function withNotes(files, texts) {
  const out = new Map(files), prev = out.get(NOTES), next = setNotes(prev ?? "", texts);
  if (prev !== undefined || next !== "") out.set(NOTES, next);
  return out;
}
function rerender(path, next, id, at, extra = {}) {
  rerenderMany(new Map([[path, next]]), at ? { [id]: at } : {}, [id], extra.key ?? "n:" + id, extra);
}
function rerenderMany(added, places, ids, key, extra = {}) {
  const api = editor(), notes = notesApi(), texts = notes.texts();
  const edited = notesEdited(texts);
  const work = new Map([...active.work, ...added]);
  const layout = { ...api.currentLayout(), drawings: drawApi().list() };
  for (const [id, at] of Object.entries(places)) layout.nodes[id] = { x: at[0], y: at[1], w: 1, h: 1, title: at.slice() };
  if (extra.region) layout.clusters[ids[0]] = extra.region;
  const result = require("browser/render.mjs").renderDiagram(edited ? withNotes(work, texts) : work, active.folder, layout, ASSETS, ids);
  const wasEdit = !!frame.contentWindow.InfraDiagram.modules["canvas/model"].state.on;
  active.carryLayout = active.carryLayout || api.isDirty() || drawApi().isDirty();
  active.work = work;
  active.after = { key, edit: wasEdit };
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
  const texts = notes.texts(), notesChanged = notesEdited(texts);
  const layout = api.currentLayout(), drawings = drawApi().list();
  const files = notesChanged ? withNotes(active.work, texts) : active.work;
  const changed = [...files].filter(([p, t]) => active.source.get(p) !== t && (p !== NETWORKS || active.fresh)).map(([p]) => p);
  return {
    api, notes, texts, drawings, files, changed, layout,
    layoutText: JSON.stringify({ version: 1, diagramId: active.id, ...active.extra, ...layout, ...(drawings.length || active.hadDrawings ? { drawings } : {}) }, null, 2) + "\n",
  };
}
const NETWORKS = "networks.toml";
async function syncNetworks() {
  const ips = [...tomlModel(active.work, active.folder).model.nodes.values()].flatMap((n) => n.ip), name = active.folder + "/" + NETWORKS;
  for (let attempt = 0; attempt < 2; attempt++) {
    const base = await stored(name);
    let text = base, renamed = 0;
    for (const [cidr, label] of active.netNames) {
      const next = setNetworkName(text, cidr, label);
      if (next !== text) renamed++;
      text = next;
    }
    const res = appendNetworks(text, ips);
    if (res.text === base) { active.netNames.clear(); return { count: 0, renamed: 0 }; }
    try {
      await putFiles([{ name, text: res.text, base }]);
      active.source.set(NETWORKS, res.text); active.work.set(NETWORKS, res.text); active.netNames.clear();
      return { count: res.added.length, renamed };
    } catch (e) { if (e.status !== 409 || attempt) return { count: 0, renamed: 0, error: e.message }; }
  }
}
async function confirmReplace() {
  if (!active.fresh || !serverOk || await stored(active.folder + "/topology.toml") === null) return false;
  return window.confirm(`Replace the saved diagram ${active.folder}?`) ? true : null;
}
function saveFiles(p, replace) {
  const prefix = active.folder + "/";
  const guard = (base) => replace ? { overwrite: true } : { base };
  const files = [{ name: active.layoutName, text: p.layoutText, ...guard(active.text) }];
  for (const path of p.changed) files.push({ name: prefix + path, text: p.files.get(path), ...guard(active.source.get(path) ?? null) });
  return files;
}
function saveMessage(p, net) {
  const saved = p.changed.length ? `Saved ${active.layoutName} and ${p.changed.length} file(s) in local/${active.folder}/` : `Saved ${active.layoutName} in local/`;
  const added = net.count ? ` · ${net.count} new networks added to networks.toml` : "";
  const renamedNote = net.renamed ? ` · ${net.renamed} network name${plural(net.renamed)} saved to networks.toml` : "";
  const failed = net.error ? ` · networks.toml not updated: ${net.error}` : "";
  return saved + added + renamedNote + failed;
}
function saveFailure(p, e) {
  if (!p || !e.saved?.length) { message("Save failed: " + e.message, true); return; }
  afterSave(p, e.saved);
  const left = [active.layoutName, ...p.changed.map((c) => active.folder + "/" + c)].filter((n) => !e.saved.includes(n));
  message(`Saved ${e.saved.join(", ")}. ${e.message} Not saved: ${left.join(", ")}.`, true);
}
async function runSave(ctx) {
  await settle();
  const p = ctx.p = pending(), replace = await confirmReplace();
  if (replace === null) return;
  const files = saveFiles(p, replace);
  await putFiles(files);
  active.fresh = false;
  afterSave(p, files.map((f) => f.name));
  const net = await syncNetworks().catch((e) => ({ count: 0, error: e.message }));
  message(saveMessage(p, net), !!net.error);
}
async function saveClick() {
  if (!editor()) return;
  busy = true; controls();
  const ctx = { p: null };
  try { await runSave(ctx); }
  catch (e) { saveFailure(ctx.p, e); }
  finally { busy = false; controls(); }
}
saveButton.addEventListener("click", saveClick);
function afterSave(p, names) {
  if (names.includes(active.layoutName)) { active.text = p.layoutText; p.api.commit(p.layout); drawApi().markSaved(); active.hadDrawings = active.hadDrawings || p.drawings.length > 0; active.carryLayout = false; }
  for (const path of p.changed) {
    if (!names.includes(active.folder + "/" + path)) continue;
    active.source.set(path, p.files.get(path)); active.work.set(path, p.files.get(path));
    if (path === NOTES) { active.notes = p.texts; p.notes.markSaved(p.texts); }
  }
}
function download(name, bytes, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function exportClick() {
  if (!editor()) return;
  try {
    await settle();
    const p = pending(), name = archiveName(active.folder);
    download(name, await packDiagram(p.files, p.layoutText), "application/zip");
    message(`Exported ${name} (${p.files.size + 1} files) to your downloads`);
  } catch (e) { message("Export failed: " + e.message, true); }
}
exportButton.addEventListener("click", exportClick);
const impPanel = document.querySelector("#imp"), impFiles = document.querySelector("#impfiles"), impList = document.querySelector("#implist"), impType = document.querySelector("#imptype"), impRegion = document.querySelector("#impregion"), impInfo = document.querySelector("#impinfo"), impOk = document.querySelector("#impok");
let impEntries = [], impPlan = null;
function impClose() { impPanel.hidden = true; impPlan = null; controls(); importButton.focus(); }
function impRender() {
  const skip = new Set([...impList.querySelectorAll("input:not(:checked)")].map((i) => i.dataset.file));
  const region = impRegion.value;
  impType.disabled = !!region;
  impPlan = planImport(active.work, impEntries, { server_type: impType.value, region: region || undefined, skip });
  impList.textContent = "";
  for (const row of impPlan.rows) {
    impList.append(impRow(row));
  }
  const n = impPlan.files.size;
  impInfo.textContent = n ? `${n} server${plural(n)} will be added` : "Nothing selected";
  impOk.disabled = !n;
}
function impRow(row) {
  const li = document.createElement("li"), label = document.createElement("label"), box = document.createElement("input"), text = document.createElement("span");
  {
    box.type = "checkbox"; box.dataset.file = row.file; box.checked = row.included && !row.error; box.disabled = !!row.error;
    box.addEventListener("change", impRender);
    const ipLabel = `${row.ips} IP${plural(row.ips)}`;
    text.textContent = row.error ? `${row.file}: ${row.error}` : `${row.id} · ${row.name} · ${ipLabel}`;
    if (row.error) text.className = "bad";
    label.append(box, text);
    if (row.renamed) {
      const tag = document.createElement("span"), nameNote = row.name === row.origName ? "" : ` (${row.name})`;
      tag.className = "tag";
      tag.textContent = `renamed to ${row.id}${nameNote}`;
      label.append(tag);
    }
    li.append(label);
  }
  return li;
}
function impOpen(entries) {
  const root = mergeFolder(active.work), types = Object.entries(mergeTypes(root.server_types));
  impEntries = entries;
  impType.textContent = ""; impRegion.textContent = "";
  for (const [id, t] of types) impType.add(new Option(`${t.label ?? id} (${id})`, id));
  impType.value = types.some(([id]) => id === "server") ? "server" : types[0][0];
  impRegion.add(new Option("None (use the server type)", ""));
  for (const r of root.regions || []) impRegion.add(new Option(r.title ?? r.id, r.id));
  impList.textContent = "";
  impPlan = null;
  impPanel.hidden = false;
  controls();
  impRender();
}
function impPlaces(ids, layout) {
  const regionId = impRegion.value, box = regionId ? layout.clusters[regionId] : null;
  const occupied = Object.values(layout.nodes);
  if (!box) occupied.push(...Object.values(layout.clusters));
  const origin = box ? { x: box.x + 20, y: box.y + 50, cols: Math.max(1, Math.floor((box.w - 20) / 240)) } : { x: 40, y: 40, cols: 4 };
  const spots = gridPlacements(ids.length, occupied, origin), places = {};
  ids.forEach((id, i) => { places[id] = spots[i]; });
  return places;
}
function impConfirm() {
  const open = notesApi().finish() || serverApi().finish();
  if (open) { impInfo.textContent = "Fix the open edit first: " + open; return; }
  if (!ready || !impPlan?.files.size) return;
  try {
    const { rows, files } = impPlan, ids = rows.filter((r) => r.path && r.included).map((r) => r.id);
    const places = impPlaces(ids, editor().currentLayout());
    const text = summary(rows);
    impPanel.hidden = true;
    rerenderMany(files, places, ids, null);
    message(text + (serverOk ? "" : " · No local server: Export downloads them"));
    impPlan = null;
  } catch (e) { impPanel.hidden = false; impInfo.textContent = String(e.message).replace(/^TOML: /, ""); }
  controls();
}
importButton.addEventListener("click", () => { if (ready) impFiles.click(); });
impFiles.addEventListener("change", async () => {
  const chosen = [...impFiles.files]; impFiles.value = "";
  if (!chosen.length || !ready) return;
  try { impOpen(await Promise.all(chosen.map(async (f) => ({ name: f.name, text: await decode(f) })))); }
  catch (e) { message("Import failed: " + e.message, true); }
});
[impType, impRegion].forEach((el) => el.addEventListener("change", impRender));
impOk.addEventListener("click", impConfirm);
document.querySelector("#impcancel").addEventListener("click", impClose);
impPanel.addEventListener("mousedown", (e) => { if (e.target === impPanel) impClose(); });
const hostPanel = document.querySelector("#hs"), hostText = document.querySelector("#hstext"), hostNote = document.querySelector("#hsnote");
function hostClose() { hostPanel.hidden = true; document.querySelector("#hostscript").focus(); }
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    // clipboard API unavailable or denied: fall back to execCommand
  }
  const t = document.createElement("textarea");
  t.value = text; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.appendChild(t); t.select();
  let ok = false;
  try {
    ok = document.execCommand("copy"); // NOSONAR: legacy fallback when the clipboard API is unavailable
  } catch (_) {
    ok = false;
  }
  t.remove();
  return ok;
}
async function hostCopy(btn) {
  const ok = await copyText(document.querySelector(btn.dataset.copy).textContent);
  const label = btn.dataset.label || (btn.dataset.label = btn.textContent);
  clearTimeout(btn.timer);
  btn.textContent = ok ? "Copied" : "Copy failed";
  hostNote.textContent = ok ? "" : "Copy failed: select the text and copy it manually";
  btn.timer = setTimeout(() => { btn.textContent = label; hostNote.textContent = ""; }, 1500);
}
document.querySelector("#hostscript").addEventListener("click", () => { hostText.textContent = HOST_SCRIPT; hostNote.textContent = ""; document.querySelector("#hsd").open = false; hostPanel.hidden = false; document.querySelector("#hs .cp").focus(); });
hostPanel.querySelectorAll(".cp").forEach((btn) => btn.addEventListener("click", () => hostCopy(btn)));
document.querySelector("#hsclose").addEventListener("click", hostClose);
hostPanel.addEventListener("mousedown", (e) => { if (e.target === hostPanel) hostClose(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !opPanel.hidden) { e.preventDefault(); opClose(); } else if (e.key === "Escape" && !nwPanel.hidden) { e.preventDefault(); nwClose(); } else if (e.key === "Escape" && !impPanel.hidden) { e.preventDefault(); impClose(); } else if (e.key === "Escape" && !hostPanel.hidden) { e.preventDefault(); hostClose(); } });
window.addEventListener("beforeunload", (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ""; /* NOSONAR: required by browsers to show the unload prompt */ } });
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
      message(serverOk ? e.message : "No local server: saved diagrams are unavailable and nothing can be saved here. Use Import diagram to open a .diag.zip, or run node engine/serve.mjs and open its address; Export still works.", true);
    }
  }
  controls();
})().catch((e) => message(e.message, true));
