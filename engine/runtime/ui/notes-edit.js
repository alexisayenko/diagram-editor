InfraDiagram.define("ui/notes-edit", ["ui/core", "ui/panels"], function (core, panels) {
  var D = core.D, $ = core.$;
  var host = $("nl");
  var enabled = !!window.InfraDiagramFileBacked && !!host;
  var list = (D.notes || []).map(function (n) { return n.text || ""; });
  var cards = (D.notes || []).slice();
  var baseline = list.slice();
  var edit = null, busy = false;

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function day(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function stampNow(now) { return day(now) + " " + pad(now.getHours()) + ":" + pad(now.getMinutes()); }

  function show(date, now) {
    if (!date || date === "Note") return "";
    var m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(date);
    if (!m) return date;
    return m[2] && now && m[1] === day(now) ? m[2] : m[1];
  }

  function dateLine(text) {
    var l = text.trim().split("\n")[1] || "";
    return /^\s*Date:/.test(l) ? l.replace(/^\s*Date:\s*/, "").trim() : null;
  }

  function stamped(text, original, isNew, now) {
    var t = text.trim(), lines = t.split("\n"), had = dateLine(t);
    if (!isNew && t === original.trim()) return t;
    if (had !== null && (isNew || had !== dateLine(original))) return t;
    var line = "Date: " + stampNow(now);
    if (had !== null) lines[1] = line; else lines.splice(1, 0, line, "");
    return lines.join("\n");
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function parse(text) {
    if (!text.trim()) throw new Error("The title is empty. Type the title on the first line, then the note text.");
    var parser = InfraDiagram.noteParser;
    if (!parser) throw new Error("The note editor is not ready. Reload the diagram.");
    return parser(text);
  }

  function card(i) {
    var n = cards[i], a = el("article", "note"), p;
    a.setAttribute("data-i", i);
    a.appendChild(el("h3", "", n.title));
    n.paras.forEach(function (t) { a.appendChild(el("p", "", t)); });
    p = el("time", "", show(n.date, new Date()));
    a.appendChild(p);
    return a;
  }

  function button(label, cls, fn) {
    var b = el("button", cls, label);
    b.type = "button";
    b.addEventListener("mousedown", function (e) { e.preventDefault(); });
    b.addEventListener("click", fn);
    return b;
  }

  function editor(i, text) {
    var a = el("article", "note editing"), ta = el("textarea", "ned"), err = el("div", "nerr"), row = el("div", "nrow");
    a.setAttribute("data-i", i);
    ta.value = text;
    ta.rows = Math.max(6, text.split("\n").length + 1);
    ta.spellcheck = false;
    ta.setAttribute("aria-label", "Note text: title on the first line, optional Date line, then the body");
    err.setAttribute("role", "alert");
    err.hidden = true;
    ta.addEventListener("input", function () { err.hidden = true; });
    ta.addEventListener("blur", function () { if (edit && edit.ta === ta && !busy) commit(); });
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); }
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); commit(); }
    });
    row.appendChild(button("Done", "nbtn", function () { commit(); }));
    row.appendChild(button("Delete", "nbtn ndel", remove));
    row.appendChild(el("span", "nhint", "Ctrl+Enter saves, Esc cancels"));
    a.appendChild(ta);
    a.appendChild(err);
    a.appendChild(row);
    edit.ta = ta;
    edit.err = err;
    edit.original = text;
    return a;
  }

  function syncData() {
    D.notes = cards.map(function (c, i) { return { title: c.title, date: show(c.date, null), paras: c.paras, text: list[i] }; });
  }

  function render(focus) {
    var nodes = [], add = button("Add note", "nadd", addNote);
    add.id = "na";
    nodes.push(add);
    list.forEach(function (t, i) {
      nodes.push(edit && !edit.isNew && edit.i === i ? editor(i, t) : card(i));
    });
    if (edit && edit.isNew) nodes.push(editor(list.length, ""));
    host.replaceChildren.apply(host, nodes);
    $("nh").textContent = "Notes (" + list.length + ")";
    syncData();
    panels.placeChrome();
    if (focus && edit) {
      edit.ta.focus();
      edit.ta.scrollIntoView({ block: "nearest" });
    }
  }

  function commit() {
    if (!edit) return true;
    var text = edit.ta.value, parsed;
    try { parsed = parse(text); }
    catch (e) {
      edit.err.textContent = String(e.message).replace(/^TOML: /, "");
      edit.err.hidden = false;
      return false;
    }
    text = stamped(text, edit.isNew ? "" : edit.original, edit.isNew, new Date());
    parsed = parse(text);
    var c = { title: parsed.title, date: parsed.date, paras: parsed.paras };
    if (edit.isNew) { list.push(text); cards.push(c); } else { list[edit.i] = text; cards[edit.i] = c; }
    edit = null;
    render(false);
    return true;
  }

  function cancel() {
    edit = null;
    render(false);
  }

  function remove() {
    if (!edit) return;
    busy = true;
    var ok = window.confirm("Delete this note?");
    busy = false;
    if (!ok) { edit.ta.focus(); return; }
    if (!edit.isNew) { list.splice(edit.i, 1); cards.splice(edit.i, 1); }
    edit = null;
    render(false);
  }

  function addNote() {
    if (!commit()) return;
    edit = { i: list.length, isNew: true };
    render(true);
  }

  function startEdit(i) {
    if (!commit()) return;
    edit = { i: i, isNew: false };
    render(true);
  }

  function dirty() {
    if (JSON.stringify(list) !== JSON.stringify(baseline)) return true;
    return !!edit && edit.ta.value.trim() !== edit.original.trim();
  }

  function finish() {
    if (!edit) return null;
    commit();
    return edit ? edit.err.textContent : null;
  }

  if (enabled) {
    host.classList.add("ed");
    var add = button("Add note", "nadd", addNote);
    add.id = "na";
    host.insertBefore(add, host.firstChild);
    [].forEach.call(host.querySelectorAll(".note"), function (n, i) {
      n.setAttribute("data-i", i);
      var t = n.querySelector("time");
      if (t) t.textContent = show(cards[i].date, new Date());
    });
    syncData();
    host.addEventListener("click", function (e) {
      var n = e.target.closest && e.target.closest(".note");
      if (!n || n.classList.contains("editing")) return;
      var s = window.getSelection();
      if (s && !s.isCollapsed && n.contains(s.anchorNode)) return;
      startEdit(+n.getAttribute("data-i"));
    });
  }

  function isDirty() { return enabled && dirty(); }
  function finishEdit() { return enabled ? finish() : null; }
  function texts() { return list.slice(); }
  function markSaved(saved) { baseline = saved.slice(); }

  return { isDirty: isDirty, finish: finishEdit, texts: texts, markSaved: markSaved, show: show, stamped: stamped };
});
