// What happens inside each dialog; the shared chrome (close, Escape, focus return) comes from dialogs.mjs.
import { planImport, gridPlacements, summary } from "../parse/import-servers.mjs";
import { mergeFolder } from "../parse/toml.mjs";
import { mergeTypes } from "../parse/types.mjs";
import { filterDiagrams, FILTER_MIN, nameProblem, whenText } from "../lib/diagrams.mjs";
import { plural } from "./messages.mjs";

export function createOpenFlow({ dialogs, doc, els, opener, api, isServerUp, discard, onPick }) {
  const { panel, close, list, query, note } = els;
  const dialog = dialogs.dialog({ panel, closeButton: close, returnTo: () => opener });
  let rows = [];
  function render() {
    const shown = filterDiagrams(rows, query.value);
    list.textContent = "";
    for (const r of shown) {
      const li = doc.createElement("li"), b = doc.createElement("button"), n = doc.createElement("strong"), meta = doc.createElement("span");
      b.type = "button"; b.className = "item"; b.dataset.name = r.name;
      n.textContent = r.name;
      meta.textContent = `${r.servers} server${plural(r.servers)} · ${whenText(r.mtime)}`;
      b.append(n, meta);
      b.addEventListener("click", () => pick(r.name));
      li.append(b); list.append(li);
    }
    if (!rows.length) note.textContent = "No saved diagrams yet. Use New diagram or Import diagram.";
    else note.textContent = shown.length ? "" : "No diagram matches the filter.";
  }
  async function show() {
    rows = []; query.value = ""; query.hidden = true; list.textContent = ""; note.textContent = "";
    dialog.open();
    if (!isServerUp()) note.textContent = "No local server is running, so there are no saved diagrams. Use Import diagram to open a .diag.zip file, or run node engine/serve.mjs.";
    else {
      try { rows = await api.listStored(); query.hidden = rows.length < FILTER_MIN; render(); }
      catch (e) { note.textContent = e.message; }
    }
    (query.hidden ? list.querySelector("button") ?? close : query).focus();
  }
  async function pick(name) {
    if (!discard()) return;
    dialog.hide();
    await onPick(name);
  }
  query.addEventListener("input", render);
  return { show, isOpen: dialog.isOpen };
}

export function createNewFlow({ dialogs, doc, els, opener, api, isServerUp, discard, onCreate }) {
  const { panel, name, msg, list, taken: takenNote, ok, cancel } = els;
  const dialog = dialogs.dialog({ panel, closeButton: cancel, returnTo: () => opener });
  let taken = [];
  function check() {
    const problem = nameProblem(name.value.trim(), taken);
    msg.textContent = name.value.trim() ? problem || "" : "";
    ok.disabled = !!problem;
  }
  async function show() {
    taken = [];
    if (isServerUp()) { try { taken = (await api.listStored()).map((r) => r.name); } catch (_) { /* the list only warns about clashes; the server refuses them anyway */ } }
    list.textContent = "";
    for (const n of taken) { const li = doc.createElement("li"); li.textContent = n; list.append(li); }
    takenNote.hidden = !taken.length;
    name.value = "new-diagram"; check();
    dialog.open();
    name.focus(); name.select();
  }
  function create() {
    const folder = name.value.trim();
    if (nameProblem(folder, taken) || !discard()) return;
    dialog.hide();
    onCreate(folder);
  }
  name.addEventListener("input", check);
  name.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); create(); } });
  ok.addEventListener("click", create);
  return { show, isOpen: dialog.isOpen };
}

const decode = async (file) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(await file.arrayBuffer());

export function createImportFlow({ dialogs, doc, els, opener, sessions, bridge, makeOption, rerenderMany, message, isServerUp, controls }) {
  const { panel, files: fileInput, list, type, region, info, ok, cancel } = els;
  let entries = [], plan = null;
  const dialog = dialogs.dialog({ panel, closeButton: cancel, returnTo: () => opener, onClose() { plan = null; controls(); } });
  function row(r) {
    const li = doc.createElement("li"), label = doc.createElement("label"), box = doc.createElement("input"), text = doc.createElement("span");
    box.type = "checkbox"; box.dataset.file = r.file; box.checked = r.included && !r.error; box.disabled = !!r.error;
    box.addEventListener("change", render);
    const ipLabel = `${r.ips} IP${plural(r.ips)}`;
    text.textContent = r.error ? `${r.file}: ${r.error}` : `${r.id} · ${r.name} · ${ipLabel}`;
    if (r.error) text.className = "bad";
    label.append(box, text);
    if (r.renamed) {
      const tag = doc.createElement("span"), nameNote = r.name === r.origName ? "" : ` (${r.name})`;
      tag.className = "tag";
      tag.textContent = `renamed to ${r.id}${nameNote}`;
      label.append(tag);
    }
    li.append(label);
    return li;
  }
  function render() {
    const skip = new Set([...list.querySelectorAll("input:not(:checked)")].map((i) => i.dataset.file));
    const regionId = region.value;
    type.disabled = !!regionId;
    plan = planImport(sessions.current().work, entries, { server_type: type.value, region: regionId || undefined, skip });
    list.textContent = "";
    for (const r of plan.rows) list.append(row(r));
    const n = plan.files.size;
    info.textContent = n ? `${n} server${plural(n)} will be added` : "Nothing selected";
    ok.disabled = !n;
  }
  function open(chosen) {
    const root = mergeFolder(sessions.current().work), types = Object.entries(mergeTypes(root.server_types));
    entries = chosen;
    type.textContent = ""; region.textContent = "";
    for (const [id, t] of types) type.add(makeOption(`${t.label ?? id} (${id})`, id));
    type.value = types.some(([id]) => id === "server") ? "server" : types[0][0];
    region.add(makeOption("None (use the server type)", ""));
    for (const r of root.regions || []) region.add(makeOption(r.title ?? r.id, r.id));
    list.textContent = "";
    plan = null;
    dialog.open();
    controls();
    render();
  }
  function places(ids, layout) {
    const box = region.value ? layout.clusters[region.value] : null;
    const occupied = Object.values(layout.nodes);
    if (!box) occupied.push(...Object.values(layout.clusters));
    const origin = box ? { x: box.x + 20, y: box.y + 50, cols: Math.max(1, Math.floor((box.w - 20) / 240)) } : { x: 40, y: 40, cols: 4 };
    const spots = gridPlacements(ids.length, occupied, origin), out = {};
    ids.forEach((id, i) => { out[id] = spots[i]; });
    return out;
  }
  function confirm() {
    const pending = bridge.notes().finish() || bridge.server().finish();
    if (pending) { info.textContent = "Fix the open edit first: " + pending; return; }
    if (!bridge.isReady() || !plan?.files.size) return;
    try {
      const { rows, files } = plan, ids = rows.filter((r) => r.path && r.included).map((r) => r.id);
      const placed = places(ids, bridge.editor().currentLayout());
      const text = summary(rows);
      dialog.hide();
      rerenderMany(files, placed, ids, null);
      message(text + (isServerUp() ? "" : " · No local server: Export downloads them"));
      plan = null;
    } catch (e) { dialog.open(); info.textContent = String(e.message); }
    controls();
  }
  async function choose(chosen) {
    if (!chosen.length || !bridge.isReady()) return;
    try { open(await Promise.all(chosen.map(async (f) => ({ name: f.name, text: await decode(f) })))); }
    catch (e) { message("Import failed: " + e.message, true); }
  }
  fileInput.addEventListener("change", () => { const chosen = [...fileInput.files]; fileInput.value = ""; return choose(chosen); });
  [type, region].forEach((el) => el.addEventListener("change", render));
  ok.addEventListener("click", confirm);
  return { pick: () => { if (bridge.isReady()) fileInput.click(); }, isOpen: dialog.isOpen };
}

export function createHostFlow({ dialogs, doc, env, els, opener, script }) {
  const { panel, text, note, details, copyButtons, close } = els;
  const dialog = dialogs.dialog({ panel, closeButton: close, returnTo: () => opener });
  async function copyText(value) {
    try {
      await env.navigator.clipboard.writeText(value);
      return true;
    } catch (_) {
      // clipboard API unavailable or denied: fall back to execCommand
    }
    const t = doc.createElement("textarea");
    t.value = value; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;left:-9999px;top:0";
    doc.body.appendChild(t); t.select();
    let done = false;
    try {
      done = doc.execCommand("copy"); // NOSONAR: legacy fallback when the clipboard API is unavailable
    } catch (_) {
      done = false;
    }
    t.remove();
    return done;
  }
  async function copy(btn) {
    const done = await copyText(doc.querySelector(btn.dataset.copy).textContent);
    const label = btn.dataset.label || (btn.dataset.label = btn.textContent);
    env.clearTimeout(btn.timer);
    btn.textContent = done ? "Copied" : "Copy failed";
    note.textContent = done ? "" : "Copy failed: select the text and copy it manually";
    btn.timer = env.setTimeout(() => { btn.textContent = label; note.textContent = ""; }, 1500);
  }
  function show() {
    text.textContent = script;
    note.textContent = "";
    details.open = false;
    dialog.open();
    copyButtons[0].focus();
  }
  copyButtons.forEach((btn) => btn.addEventListener("click", () => copy(btn)));
  return { show, isOpen: dialog.isOpen };
}
