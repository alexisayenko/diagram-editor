InfraDiagram.define("ui/server-edit", ["ui/core", "ui/selection", "ui/panels"], function (core, selection, panels) {
  var $ = core.$;
  var TEXTS = [["os", "OS", "Ubuntu 24.04"], ["hardware", "Hardware", "8 vCPU, 16 GB RAM"], ["role", "Role", "Reverse proxy"]];
  var LISTS = [
    ["ips", "IPs", "Add IP", "192.0.2.10/24"], ["dns", "DNS", "Add DNS name", "host.example.test"], ["jobs", "Jobs", "Add job", "Job 104 batch import"],
    ["rmi_services", "RMI services", "Add RMI service", "ExampleService"], ["systemd_services", "systemd services", "Add systemd service", "example.service"]
  ];
  var edit = null, current = null;

  function bridge() { return window.InfraDiagram.serverEditor || null; }
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

  function addRow(box, value, placeholder, label) {
    var row = el("div", "sfr"), input = el("input");
    input.type = "text";
    input.value = value;
    input.placeholder = placeholder;
    input.spellcheck = false;
    input.setAttribute("aria-label", label);
    row.appendChild(input);
    row.appendChild(button("×", "sfx", function () { row.remove(); }));
    box.appendChild(row);
    return input;
  }

  function trimmed(list) {
    return list.map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function norm(f) {
    var o = { name: f.name.trim(), server_type: f.server_type, details: (f.details || "").replace(/\s+$/, "") };
    TEXTS.forEach(function (t) { o[t[0]] = (f[t[0]] || "").trim(); });
    LISTS.forEach(function (l) { o[l[0]] = trimmed(f[l[0]] || []); });
    return o;
  }

  function collect() {
    var f = { name: edit.name.value, server_type: edit.type, details: edit.notes ? edit.notes.value : edit.raw.details || "" };
    TEXTS.forEach(function (t) { f[t[0]] = edit.texts[t[0]].value; });
    LISTS.forEach(function (l) {
      f[l[0]] = [].map.call(edit.lists[l[0]].querySelectorAll("input"), function (i) { return i.value; });
    });
    return f;
  }

  function changed() { return JSON.stringify(norm(collect())) !== JSON.stringify(norm(edit.raw)); }

  function field(label) {
    var l = el("div", "sfl", label);
    edit.form.appendChild(l);
    return l;
  }

  function openForm(key) {
    var raw = bridge().source(key.slice(2)), pn = $("pn");
    if (!raw) return;
    var close = pn.querySelector("#pc"), tg = pn.querySelector(".tg");
    edit = { key: key, raw: raw, form: el("div", "sf"), texts: {}, lists: {}, notes: null, type: raw.server_type, tg: tg, suffix: / · PROPOSED$/.test(tg.textContent) ? " · PROPOSED" : "" };
    tg.classList.add("sedb");
    tg.setAttribute("role", "button");
    tg.setAttribute("tabindex", "0");
    tg.title = "Click to change the server type";
    edit.pick = el("div", "sfp");
    edit.pick.hidden = true;
    (raw.types || []).forEach(function (t) {
      var b = button(t.label.toUpperCase(), "tg", function (e) {
        e.stopPropagation();
        edit.type = t.id;
        tg.setAttribute("data-ty", t.id);
        pn.setAttribute("data-ty", t.id);
        tg.textContent = t.label.toUpperCase() + edit.suffix;
        edit.pick.hidden = true;
      });
      b.setAttribute("data-ty", t.id);
      edit.pick.appendChild(b);
    });
    edit.name = el("input", "sname");
    edit.name.type = "text";
    edit.name.value = raw.name;
    edit.name.setAttribute("aria-label", "Server name");
    TEXTS.forEach(function (t) {
      field(t[1]);
      var i = el("input");
      i.type = "text";
      i.value = raw[t[0]] || "";
      i.placeholder = t[2];
      i.spellcheck = false;
      i.setAttribute("aria-label", t[1]);
      edit.texts[t[0]] = i;
      edit.form.appendChild(i);
    });
    LISTS.forEach(function (l) {
      field(l[1]);
      var box = el("div", "sfb");
      edit.lists[l[0]] = box;
      (raw[l[0]] || []).forEach(function (v) { addRow(box, v, l[3], l[1]); });
      edit.form.appendChild(box);
      edit.form.appendChild(button(l[2], "sfa", function () { addRow(box, "", l[3], l[1]).focus(); }));
    });
    if (raw.details) {
      field("Notes");
      edit.notes = el("textarea");
      edit.notes.value = raw.details;
      edit.notes.rows = Math.min(14, Math.max(5, raw.details.split("\n").length + 1));
      edit.notes.spellcheck = false;
      edit.notes.setAttribute("aria-label", "Notes");
      edit.form.appendChild(edit.notes);
    }
    edit.err = el("div", "sferr");
    edit.err.setAttribute("role", "alert");
    edit.err.hidden = true;
    var row = el("div", "sfrow");
    row.appendChild(button("Done", "sfd", commit));
    row.appendChild(button("Cancel", "", cancel));
    row.appendChild(el("span", "sfh", "Enter saves, Esc cancels"));
    edit.form.appendChild(edit.err);
    edit.form.appendChild(row);
    pn.replaceChildren(close, edit.name, tg, edit.pick, edit.form);
    edit.name.focus();
    panels.placeChrome();
  }

  function commit() {
    if (!edit) return true;
    var f = collect(), err;
    if (!changed()) { cancel(); return true; }
    err = bridge().apply(edit.key.slice(2), f);
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
    var key = edit && edit.key;
    edit = null;
    if (key) selection.select(key);
  }

  core.hooks.beforeSelect = function () {
    if (!edit || !changed()) return true;
    edit.err.textContent = "Finish this edit first: Done or Esc.";
    edit.err.hidden = false;
    return false;
  };

  core.hooks.panel = function (key, pn) {
    edit = null;
    current = null;
    if (key.charAt(0) !== "n" || !enabled()) return;
    current = key;
    var h = pn.querySelector("h1");
    h.classList.add("sed");
    h.title = "Click to edit";
    pn.insertBefore(button("Edit", "", function () {}), pn.firstChild).id = "pe";
  };

  $("pn").addEventListener("click", function (e) {
    if (!current || !e.target.closest) return;
    var badge = e.target.closest(".tg") && !e.target.closest(".sfp");
    if (edit) { if (badge) edit.pick.hidden = !edit.pick.hidden; return; }
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
