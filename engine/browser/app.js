// A diagram is a folder in local/ behind engine/serve.mjs; the model and geometry stay in this tab.
const { setNotes, setServer, addServer, duplicateServer, addRegion, moveServer, freeRegionTypes } = require("parse/toml-write.mjs");
const { parseNoteText, mergeFolder, withRoot } = require("parse/toml.mjs");
const { mergeTypes } = require("parse/types.mjs");
const { newDiagram, DIAGRAM_ID } = require("parse/new-diagram.mjs");
const { planImport, gridPlacements, summary } = require("parse/import-servers.mjs");
const { validName, layoutNameFor, exportNames } = require("lib/names.mjs");
const newButton = document.querySelector("#new");
const openButton = document.querySelector("#open");
const picker = document.querySelector("#picker");
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
function message(text, error = false) { status.textContent = text; status.classList.toggle("error", error); }
function controls() {
  frame.inert = busy;
  newButton.disabled = busy;
  openButton.disabled = busy;
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
  catch (e) { if (e.status === 404) return null; throw e; }
}
const putFiles = (files) => call("/api/files", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files }) });
async function latestStored() {
  const { files } = await call("/api/files"), newest = new Map();
  for (const f of files) {
    const folder = f.name.split("/")[0];
    newest.set(folder, Math.max(newest.get(folder) ?? 0, f.mtime));
  }
  const folders = files.filter((f) => /^[^/]+\/(topology|diagram)\.toml$/.test(f.name)).map((f) => f.name.split("/")[0]).sort((x, y) => newest.get(y) - newest.get(x));
  return folders.length ? folders[0] : null;
}
function load(folder, files, layoutText) {
  const layoutName = layoutNameFor(folder);
  let saved = null;
  if (layoutText !== null) { try { saved = JSON.parse(layoutText); } catch (e) { throw new Error(layoutName + ": invalid JSON: " + e.message); } }
  const result = require("browser/render.mjs").renderDiagram(files, folder, saved, ASSETS, []);
  ready = false;
  const LAYOUT_KEYS = ["version", "diagramId", "nodes", "clusters", "edges", "drawings"];
  const extra = saved ? Object.fromEntries(Object.entries(saved).filter(([k]) => !LAYOUT_KEYS.includes(k))) : {};
  active = { folder, layoutName, source: new Map(files), work: new Map(files), text: layoutText, extra, hadDrawings: !!saved && "drawings" in saved, id: result.id, notes: result.notes, carryLayout: false, reload: null, after: null };
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
    diagram.serverEditor = { source: serverSource, apply: applyServer, add: addNewServer, duplicate: duplicateExisting, regionTypes, addRegion: addNewRegion, move: moveToRegion };
    const after = active.after;
    active.after = null;
    if (after?.edit) frame.contentDocument.getElementById("te").click();
    if (after?.key) diagram.select(after.key);
  }
  controls();
});
newButton.addEventListener("click", async () => {
  if (!discard()) return;
  const asked = window.prompt("Name the new diagram (lowercase letters, digits and hyphens). It is saved as a folder of this name:", "new-diagram");
  if (asked === null) return;
  const folder = asked.trim();
  busy = true; controls();
  try {
    if (!DIAGRAM_ID.test(folder)) throw new Error("A diagram name uses lowercase letters, digits and hyphens.");
    if (serverOk && await stored(folder + "/topology.toml") !== null) throw new Error(`${folder} already exists in local/. Open it, or choose another name.`);
    load(folder, newDiagram(folder), null);
    active.source = new Map();
    message(`${folder} · New diagram, not saved yet${serverOk ? "" : " · No local server: Export downloads it"}`);
  } catch (e) { message(e.message, true); }
  finally { busy = false; controls(); }
});
const decode = async (file) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(await file.arrayBuffer());
openButton.addEventListener("click", () => { if (discard()) picker.click(); });
picker.addEventListener("change", async () => {
  const chosen = [...picker.files]; picker.value = "";
  if (!chosen.length) return;
  busy = true; controls();
  try {
    const parts = chosen.map((f) => ({ f, path: (f.webkitRelativePath || f.name).split("/") })).filter((x) => x.path.length > 1);
    if (!parts.length) throw new Error("Choose a diagram folder (it holds topology.toml).");
    const folder = parts[0].path[0], texts = new Map();
    for (const { f, path } of parts) {
      const rel = path.slice(1).join("/");
      if (rel !== LAYOUT && !(isTomlPath(rel) && path.length <= 3)) continue;
      if (!validName(folder + "/" + rel)) throw new Error(`Unsupported file name: ${folder}/${rel}. Use letters, digits, dot, dash or underscore, ending in .toml or .json.`);
      texts.set(rel, await decode(f));
    }
    const layoutText = texts.get(LAYOUT) ?? null;
    texts.delete(LAYOUT);
    const rooted = withRoot(texts);
    if (!rooted.has("topology.toml")) throw new Error(`${folder} has no topology.toml.`);
    if (!serverOk) { load(folder, rooted, layoutText); return; }
    const all = new Map([...rooted].map(([p, t]) => [folder + "/" + p, t]));
    if (layoutText !== null) all.set(layoutNameFor(folder), layoutText);
    const differing = [];
    for (const [n, text] of all) { const old = await stored(n); if (old !== null && old !== text) differing.push(n); }
    if (differing.length && !window.confirm(`Replace ${differing.length} stored file(s) (${differing.slice(0, 3).join(", ")}${differing.length > 3 ? ", ..." : ""}) with the folder you chose?`)) return;
    await putFiles([...all].map(([n, text]) => ({ name: n, text, overwrite: true })));
    await loadStored(folder);
  } catch (e) { message(e.message, true); }
  finally { busy = false; controls(); }
});
const serverPath = (id) => `servers/${id}.toml`;
function serverSource(id) {
  const root = mergeFolder(active.work), s = (root.servers || []).find((x) => x.id === id);
  if (!s) return null;
  const types = mergeTypes(root.server_types), region = (root.regions || []).find((r) => r.id === s.region);
  return { ...s, name: s.name ?? s.id, server_type: s.server_type ?? region?.server_type, types: Object.entries(types).map(([tid, t]) => ({ id: tid, label: t.label })) };
}
function applyServer(id, fields) {
  const open = notesApi().finish();
  if (open) return "Fix the note first: " + open;
  try {
    const path = serverPath(id), text = active.work.get(path);
    if (text === undefined) return `Server '${id}' has no file ${path}.`;
    const next = setServer(text, id, fields, mergeFolder(active.work));
    if (next !== text) rerender(path, next, id);
    return null;
  } catch (e) { return String(e.message).replace(/^TOML: /, ""); }
}
function addNewServer(region, x, y) {
  const open = notesApi().finish() || serverApi().finish();
  if (open) return "Fix the open edit first: " + open;
  if (!ready) return "Try again once the diagram has reloaded.";
  try {
    const generic = mergeTypes(mergeFolder(active.work).server_types).server ? "server" : undefined;
    const { path, text, id } = addServer(active.work, region ? { region } : { server_type: generic });
    rerender(path, text, id, [x, y]);
    return null;
  } catch (e) { return String(e.message).replace(/^TOML: /, ""); }
}
function duplicateExisting(id) {
  const open = notesApi().finish() || serverApi().finish();
  if (open) return "Fix the open edit first: " + open;
  if (!ready) return "Try again once the diagram has reloaded.";
  try {
    const { path, text, id: copy } = duplicateServer(active.work, id), from = editor().currentLayout().nodes[id];
    rerender(path, text, copy, from ? [Math.round(from.x) + 30, Math.round(from.y) + 30] : undefined);
    return null;
  } catch (e) { return String(e.message).replace(/^TOML: /, ""); }
}
function regionTypes() { return freeRegionTypes(active.work); }
function addNewRegion(type, x, y) {
  const open = notesApi().finish() || serverApi().finish();
  if (open) return "Fix the open edit first: " + open;
  if (!ready) return "Try again once the diagram has reloaded.";
  try {
    const { path, text, id } = addRegion(active.work, { server_type: type });
    rerender(path, text, id, null, { key: "c:" + id, region: { x, y, w: REGION_W, h: REGION_H, title: [x + REGION_W / 2, y + 20] } });
    return null;
  } catch (e) { return String(e.message).replace(/^TOML: /, ""); }
}
function moveToRegion(id, region) {
  const open = notesApi().finish() || serverApi().finish();
  if (open) return "Fix the open edit first: " + open;
  if (!ready) return "Try again once the diagram has reloaded.";
  try {
    const { path, text } = moveServer(active.work, id, region);
    if (text !== active.work.get(path)) rerender(path, text, id);
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
  const edited = JSON.stringify(texts) !== JSON.stringify(active.notes);
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
  const texts = notes.texts(), notesChanged = JSON.stringify(texts) !== JSON.stringify(active.notes);
  const layout = api.currentLayout(), drawings = drawApi().list();
  const files = notesChanged ? withNotes(active.work, texts) : active.work;
  const changed = [...files].filter(([p, t]) => active.source.get(p) !== t).map(([p]) => p);
  return {
    api, notes, texts, drawings, files, changed, layout,
    layoutText: JSON.stringify({ version: 1, diagramId: active.id, ...active.extra, ...layout, ...(drawings.length || active.hadDrawings ? { drawings } : {}) }, null, 2) + "\n",
  };
}
saveButton.addEventListener("click", async () => {
  if (!editor()) return;
  busy = true; controls();
  let p = null;
  try {
    await settle();
    p = pending();
    const prefix = active.folder + "/", files = [{ name: active.layoutName, text: p.layoutText, base: active.text }];
    for (const path of p.changed) files.push({ name: prefix + path, text: p.files.get(path), base: active.source.get(path) ?? null });
    await putFiles(files);
    afterSave(p, files.map((f) => f.name));
    message(p.changed.length ? `Saved ${active.layoutName} and ${p.changed.length} file(s) in local/${active.folder}/` : `Saved ${active.layoutName} in local/`);
  } catch (e) {
    if (p && e.saved?.length) {
      afterSave(p, e.saved);
      const left = [active.layoutName, ...p.changed.map((c) => active.folder + "/" + c)].filter((n) => !e.saved.includes(n));
      message(`Saved ${e.saved.join(", ")}. ${e.message} Not saved: ${left.join(", ")}.`, true);
    } else message("Save failed: " + e.message, true);
  }
  finally { busy = false; controls(); }
});
function afterSave(p, names) {
  if (names.includes(active.layoutName)) { active.text = p.layoutText; p.api.commit(p.layout); drawApi().markSaved(); active.hadDrawings = active.hadDrawings || p.drawings.length > 0; active.carryLayout = false; }
  for (const path of p.changed) {
    if (!names.includes(active.folder + "/" + path)) continue;
    active.source.set(path, p.files.get(path)); active.work.set(path, p.files.get(path));
    if (path === NOTES) { active.notes = p.texts; p.notes.markSaved(p.texts); }
  }
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
    const p = pending(), names = exportNames(active.folder);
    download(names.layout, p.layoutText);
    p.changed.forEach((path, i) => setTimeout(() => download(names.file(path), p.files.get(path)), 400 * (i + 1)));
    message(`Exported ${names.layout}${p.changed.length ? ` and ${p.changed.length} changed file(s)` : ""} to your downloads`);
  } catch (e) { message("Export failed: " + e.message, true); }
});
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
    const li = document.createElement("li"), label = document.createElement("label"), box = document.createElement("input"), text = document.createElement("span");
    box.type = "checkbox"; box.dataset.file = row.file; box.checked = row.included && !row.error; box.disabled = !!row.error;
    box.addEventListener("change", impRender);
    text.textContent = row.error ? `${row.file}: ${row.error}` : `${row.id} · ${row.name} · ${row.ips} IP${row.ips === 1 ? "" : "s"}`;
    if (row.error) text.className = "bad";
    label.append(box, text);
    if (row.renamed) { const tag = document.createElement("span"); tag.className = "tag"; tag.textContent = `renamed to ${row.id}${row.name !== row.origName ? ` (${row.name})` : ""}`; label.append(tag); }
    li.append(label); impList.append(li);
  }
  const n = impPlan.files.size;
  impInfo.textContent = n ? `${n} server${n === 1 ? "" : "s"} will be added` : "Nothing selected";
  impOk.disabled = !n;
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
function impConfirm() {
  const open = notesApi().finish() || serverApi().finish();
  if (open) { impInfo.textContent = "Fix the open edit first: " + open; return; }
  if (!ready || !impPlan?.files.size) return;
  try {
    const { rows, files } = impPlan, ids = rows.filter((r) => r.path && r.included).map((r) => r.id), layout = editor().currentLayout();
    const regionId = impRegion.value, box = regionId ? layout.clusters[regionId] : null;
    const occupied = Object.values(layout.nodes);
    if (!box) occupied.push(...Object.values(layout.clusters));
    const origin = box ? { x: box.x + 20, y: box.y + 50, cols: Math.max(1, Math.floor((box.w - 20) / 240)) } : { x: 40, y: 40, cols: 4 };
    const spots = gridPlacements(ids.length, occupied, origin), places = {};
    ids.forEach((id, i) => { places[id] = spots[i]; });
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
  try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
  const t = document.createElement("textarea");
  t.value = text; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.appendChild(t); t.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (_) {}
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
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !impPanel.hidden) { e.preventDefault(); impClose(); } else if (e.key === "Escape" && !hostPanel.hidden) { e.preventDefault(); hostClose(); } });
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
      message(serverOk ? e.message : "No local server: folders open in memory only and cannot be saved here. Run node engine/serve.mjs and open its address to store and save folders; Export still works.", true);
    }
  }
  controls();
})();
