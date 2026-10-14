InfraDiagram.define("ui/details", ["ui/core", "ui/os-icons", "ui/keys"], function (core, osIcons, keys) {
  var D = core.D, esc = core.esc, $ = core.$;

  function inline(s) {
    return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\[([^\]]+)\]\((https?:\/\/[^)\s"]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  var HEADING = /^(#{1,6})\s+(\S.*)?$/, TABLE_ROW = /^\s*\|/, LIST_ITEM = /^\s*[-*]\s+/;
  function mdCells(l) { return l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(function (c) { return c.trim(); }); }
  function mdRow(cs, cell) {
    return "<tr>" + cs.map(function (c) { return "<" + cell + ">" + inline(c) + "</" + cell + ">"; }).join("") + "</tr>";
  }
  function mdTable(rows) {
    var body = rows.slice(/^[\s|:-]+$/.test(rows[1] || "") ? 2 : 1);
    return "<table><thead>" + mdRow(mdCells(rows[0]), "th") + "</thead><tbody>" + body.map(function (r) { return mdRow(mdCells(r), "td"); }).join("") + "</tbody></table>";
  }
  function mdList(items) {
    return "<ul>" + items.map(function (l) { return "<li>" + inline(l.replace(LIST_ITEM, "")) + "</li>"; }).join("") + "</ul>";
  }
  function mdRun(L, i, test) {
    var run = [];
    while (i < L.length && test(L[i])) { run.push(L[i]); i++; }
    return run;
  }
  function mdParagraphLine(l) { return !!l.trim() && !HEADING.test(l) && !TABLE_ROW.test(l) && !LIST_ITEM.test(l); }
  function md(src) {
    var L = src.split("\n"), o = [], i = 0, l, m, run;
    while (i < L.length) {
      l = L[i];
      if (!l.trim()) { i++; continue; }
      m = l.match(HEADING);
      if (m) { o.push("<h" + m[1].length + ">" + inline(m[2] || "") + "</h" + m[1].length + ">"); i++; continue; }
      if (TABLE_ROW.test(l)) { run = mdRun(L, i, function (x) { return TABLE_ROW.test(x); }); o.push(mdTable(run)); }
      else if (LIST_ITEM.test(l)) { run = mdRun(L, i, function (x) { return LIST_ITEM.test(x); }); o.push(mdList(run)); }
      else { run = mdRun(L, i, mdParagraphLine); o.push("<p>" + inline(run.join(" ")) + "</p>"); }
      i += run.length;
    }
    return o.join("");
  }

  function confluence(sec) {
    var url = null;
    var rest = sec.split("\n").filter(function (l) {
      var m = l.match(/^\s*\|\s*Confluence\s*\|\s*(.*?)\s*\|\s*$/i), u;
      if (!m || url) return true;
      u = m[1].match(/\]\((https?:\/\/[^)\s"]+)\)/) || m[1].match(/^<?(https?:\/\/[^\s>"]+)>?$/);
      if (!u) return true;
      url = u[1];
      return false;
    }).join("\n");
    return { url: url, sec: rest };
  }

  function osRow(pn, os) {
    var first = pn.querySelector("table"), head = first && first.querySelector("th"), body = head && head.textContent.trim() === "Key" ? first.querySelector("tbody") : null, cell;
    if (body) {
      body.insertAdjacentHTML("afterbegin", "<tr><td>OS</td><td></td></tr>");
      cell = body.querySelector("tr td:last-child");
    } else {
      pn.querySelector(".tg").insertAdjacentHTML("afterend", '<table class="po"><tbody><tr><td>OS</td><td></td></tr></tbody></table>');
      cell = pn.querySelector(".po td:last-child");
    }
    cell.textContent = os ? (os.d || os.v) : "TBD";
    if (os?.d && os.d !== os.v) cell.title = os.v;
    cell.insertAdjacentHTML("afterbegin", osIcons.iconSvg(os ? os.f : "unknown", 14));
    if (os?.eol) cell.insertAdjacentHTML("beforeend", ' <span class="eolb" title="End of standard support: ' + esc(os.eol) + '">EOL</span>');
  }

  // Network button after every IP with a network in D.ipNet (outside links); clicks are wired by ui/init.
  var NET_ICON = "M5.5 2.5h3v2.5h-3zM2 8.5h3v2.5h-3zM9 8.5h3v2.5h-3zM7 5v1.75M3.5 8.5v-1.75h7v1.75";
  function netButtons(root) {
    if (!D.nets || !D.ipNet) return;
    var re = /(?<![\d.])(\d{1,3}(?:\.\d{1,3}){3})(?![\d.])(\/\d{1,2}(?!\d))?/g, tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), list = [], n;
    while ((n = tw.nextNode())) if (!n.parentNode.closest("a,button,h1")) list.push(n);
    list.forEach(function (tn) {
      var s = tn.nodeValue, last = 0, m, frag = null;
      re.lastIndex = 0;
      while ((m = re.exec(s))) {
        var j = D.ipNet[m[1]];
        if (j === undefined) continue;
        frag = frag || document.createDocumentFragment();
        var end = m.index + m[0].length, b = document.createElement("button"), net = D.nets[j], lbl = ("Show network " + net.cidr + " " + net.name).trim();
        frag.appendChild(document.createTextNode(s.slice(last, end)));
        b.type = "button";
        b.className = "nwd" + (core.ctx.net === j ? " on" : "");
        b.dataset.n = j;
        b.setAttribute("aria-pressed", core.ctx.net === j ? "true" : "false");
        b.setAttribute("aria-label", lbl);
        b.title = lbl;
        b.innerHTML = '<svg viewBox="0 0 14 13" width="14" height="13" aria-hidden="true"><path d="' + NET_ICON + '"/></svg>';
        frag.appendChild(b);
        last = end;
      }
      if (!frag) return;
      frag.appendChild(document.createTextNode(s.slice(last)));
      tn.parentNode.replaceChild(frag, tn);
    });
  }

  // Hardware strip (value then label, e.g. "4 cpu · 8G ram", as on the card): after the first table of the section, else after the type tag.
  function hwStrip(pn, cells) {
    if (!cells?.length) return;
    var d = document.createElement("div");
    d.className = "hws";
    d.textContent = cells.map(function (c) { return c[1] + " " + c[0]; }).join(" · ");
    var t = pn.querySelector("table");
    if (t) t.parentNode.insertBefore(d, t.nextSibling);
    else pn.insertBefore(d, pn.querySelector(".tg").nextSibling);
  }

  // The "Close" button (#pc) is wired once by ui/init.
  function renderPanel(key) {
    var e = D.ent[key], pn = $("pn");
    if (!e) return;
    var sec = D.sections[e.title], cf = confluence(sec || "");
    var link = cf.url ? ' <a id="pl" href="' + esc(cf.url) + '" target="_blank" rel="noopener" aria-label="Open Confluence page" title="' + esc(cf.url) + '">↗</a>' : "";
    var html = '<button id="pc" type="button" aria-label="Close">Close</button><h1>' + esc(e.title) + link + '</h1><span class="tg" data-ty="' + e.ty + '">' + esc(e.tag) + "</span>";
    if (sec) html += md(cf.sec);
    else {
      html += '<p class="pm">No details section for this entity; showing diagram data.</p>';
      var lines = (e.body || []).concat(e.ip || []);
      if (lines.length) html += "<ul>" + lines.map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</ul>";
    }
    if (e.cl && D.ent[keys.nodeKey("region", e.cl)]) {
      var ce = D.ent[keys.nodeKey("region", e.cl)], cs = D.sections[ce.title];
      if (cs && !sec) html += '<hr><p class="pm">Part of ' + esc(ce.title) + "</p>" + md(cs);
      else html += '<p class="pm">Part of ' + esc(ce.title) + "</p>";
    }
    pn.innerHTML = html;
    if (keys.isKind(key, "server")) hwStrip(pn, e.hwc);
    if (keys.isKind(key, "server")) osRow(pn, e.os);
    netButtons(pn);
    pn.dataset.ty = e.ty;
    core.emit("panel", key, pn);
  }

  return { md: md, renderPanel: renderPanel };
});
