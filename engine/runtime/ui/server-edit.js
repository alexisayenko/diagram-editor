InfraDiagram.define("ui/server-edit", ["ui/core", "ui/selection", "ui/panels", "ui/server-fields", "ui/keys"], function (core, selection, panels, serverFields, keys) {
  var $ = core.$;
  var TEXTS = serverFields.FIELDS.filter(function (f) { return f.row; }).map(function (f) { return [f.key, f.formLabel || f.label, f.placeholder]; });
  var LISTS = serverFields.FIELDS.filter(function (f) { return f.type === "list" && f.form; }).map(function (f) { return [f.key, f.label, f.add, f.placeholder]; });
  var edit = null, current = null;

  function bridge() { return core.host.serverEditor || null; }
  function enabled() { return !!window.InfraDiagramFileBacked && !!bridge(); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function button(label, cls, fn) {
    var b = el("button", cls, label);
    b.type = "button";
    b.addEventListener("click", fn);
    return b;
  }

  function textInput(value, placeholder, label) {
    var i = el("input");
    i.type = "text";
    i.value = value;
    i.placeholder = placeholder;
    i.spellcheck = false;
    i.setAttribute("aria-label", label);
    return i;
  }

  function addRow(box, value, placeholder, label) {
    var row = el("div", "sfr"), input = textInput(value, placeholder, label);
    row.appendChild(input);
    row.appendChild(button("×", "sfx", function () { row.remove(); }));
    box.appendChild(row);
    return input;
  }

  function trimmed(list) {
    return list.map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function norm(f) {
    var o = { name: f.name.trim(), server_type: f.server_type, details: (f.details || "").trimEnd() };
    TEXTS.forEach(function (t) { o[t[0]] = (f[t[0]] || "").trim(); });
    LISTS.forEach(function (l) { o[l[0]] = trimmed(f[l[0]] || []); });
    return o;
  }

  function collect() {
    var f = { name: edit.name.value, server_type: edit.type, details: edit.notes ? edit.notes.value : edit.raw.details || "" };
    TEXTS.forEach(function (t) { f[t[0]] = edit.texts[t[0]].value; });
    LISTS.forEach(function (l) {
      f[l[0]] = Array.from(edit.lists[l[0]].querySelectorAll("input"), function (i) { return i.value; });
    });
    return f;
  }

  function changed() { return JSON.stringify(norm(collect())) !== JSON.stringify(norm(edit.raw)); }

  function field(label) {
    var l = el("div", "sfl", label);
    edit.form.appendChild(l);
    return l;
  }

  function buildPicker(raw, pn, tg) {
    var pick = el("div", "sfp");
    pick.hidden = true;
    (raw.types || []).forEach(function (t) {
      var b = button(t.label.toUpperCase(), "tg", function (e) {
        e.stopPropagation();
        edit.type = t.id;
        tg.setAttribute("data-ty", t.id);
        pn.setAttribute("data-ty", t.id);
        tg.textContent = t.label.toUpperCase() + edit.suffix;
        pick.hidden = true;
      });
      b.setAttribute("data-ty", t.id);
      pick.appendChild(b);
    });
    return pick;
  }

  function buildTexts(raw) {
    TEXTS.forEach(function (t) {
      field(t[1]);
      var i = textInput(raw[t[0]] || "", t[2], t[1]);
      edit.texts[t[0]] = i;
      edit.form.appendChild(i);
    });
  }

  function buildLists(raw) {
    LISTS.forEach(function (l) {
      field(l[1]);
      var box = el("div", "sfb");
      edit.lists[l[0]] = box;
      (raw[l[0]] || []).forEach(function (v) { addRow(box, v, l[3], l[1]); });
      edit.form.appendChild(box);
      edit.form.appendChild(button(l[2], "sfa", function () { addRow(box, "", l[3], l[1]).focus(); }));
    });
  }

  function buildNotes(raw) {
    if (!raw.details) return;
    field("Notes");
    edit.notes = el("textarea");
    edit.notes.value = raw.details;
    edit.notes.rows = Math.min(14, Math.max(5, raw.details.split("\n").length + 1));
    edit.notes.spellcheck = false;
    edit.notes.setAttribute("aria-label", "Notes");
    edit.form.appendChild(edit.notes);
  }

  function buildActions() {
    var row = el("div", "sfrow");
    edit.err = el("div", "sferr");
    edit.err.setAttribute("role", "alert");
    edit.err.hidden = true;
    row.appendChild(button("Done", "sfd", commit));
    row.appendChild(button("Cancel", "", cancel));
    row.appendChild(el("span", "sfh", "Enter saves, Esc cancels"));
    edit.form.appendChild(edit.err);
    edit.form.appendChild(row);
  }

  function openForm(key) {
    var raw = bridge().source(keys.parseKey(key).id), pn = $("pn");
    if (!raw) return;
    var close = pn.querySelector("#pc"), tg = pn.querySelector(".tg");
    edit = { key: key, raw: raw, form: el("div", "sf"), texts: {}, lists: {}, notes: null, type: raw.server_type, tg: tg, suffix: tg.textContent.endsWith(" · PROPOSED") ? " · PROPOSED" : "" };
    tg.classList.add("sedb");
    tg.setAttribute("role", "button");
    tg.setAttribute("tabindex", "0");
    tg.title = "Click to change the server type";
    edit.pick = buildPicker(raw, pn, tg);
    edit.name = el("input", "sname");
    edit.name.type = "text";
    edit.name.value = raw.name;
    edit.name.setAttribute("aria-label", "Server name");
    buildTexts(raw);
    buildLists(raw);
    buildNotes(raw);
    buildActions();
    pn.replaceChildren(close, edit.name, tg, edit.pick, edit.form);
    edit.name.focus();
    panels.placeChrome();
  }

  function commit() {
    if (!edit) return true;
    var f = collect(), err;
    if (!changed()) { cancel(); return true; }
    err = bridge().apply(keys.parseKey(edit.key).id, f);
    if (err) {
      edit.err.textContent = err;
      edit.err.hidden = false;
      return false;
    }
    var key = edit.key;
    edit = null;
    selection.select(key);
    return true;
  }

  function cancel() {
    var key = edit?.key;
    edit = null;
    if (key) selection.select(key);
  }

  core.provide("beforeSelect", function () {
    if (!edit || !changed()) return true;
    edit.err.textContent = "Finish this edit first: Done or Esc.";
    edit.err.hidden = false;
    return false;
  });

  core.provide("pending", function () { return !!edit && changed(); });

  core.on("panel", function (key, pn) {
    edit = null;
    current = null;
    if (!keys.isKind(key, "server") || !enabled()) return;
    current = key;
    var h = pn.querySelector("h1");
    h.classList.add("sed");
    h.title = "Click to edit";
    pn.insertBefore(button("Edit", "", function () {}), pn.firstChild).id = "pe";
  });

  $("pn").addEventListener("click", function (e) {
    if (!current || !e.target.closest) return;
    var badge = e.target.closest(".tg") && !e.target.closest(".sfp");
    if (edit) {
      if (badge) edit.pick.hidden = !edit.pick.hidden;
      return;
    }
    if (e.target.closest("#pe") || (e.target.closest("h1.sed") && !e.target.closest("a"))) openForm(current);
    else if (badge) { openForm(current); if (edit) edit.pick.hidden = false; }
  });

  $("pn").addEventListener("keydown", function (e) {
    if (!edit) return;
    var ta = e.target.tagName === "TEXTAREA";
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); }
    else if (e.key === "Enter" && e.target.tagName === "INPUT" && !e.isComposing) { e.preventDefault(); e.stopPropagation(); commit(); }
    else if (e.key === "Enter" && ta && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); commit(); }
  });

  function isDirty() { return !!edit && changed(); }
  function finish() { return edit && !commit() ? edit.err.textContent : null; }

  return { isDirty: isDirty, finish: finish };
});
