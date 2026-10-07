InfraDiagram.define("ui/details", ["ui/core"], function (core) {
  var D = core.D, esc = core.esc, $ = core.$;

  function inline(s) {
    return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\[([^\]]+)\]\((https?:\/\/[^)\s"]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  function md(src) {
    var L = src.split("\n"), o = [], i = 0;
    function cells(l) { return l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(function (c) { return c.trim(); }); }
    while (i < L.length) {
      var l = L[i], m;
      if (!l.trim()) { i++; continue; }
      if ((m = l.match(/^(#{1,6})\s+(.*)$/))) { o.push("<h" + m[1].length + ">" + inline(m[2]) + "</h" + m[1].length + ">"); i++; continue; }
      if (/^\s*\|/.test(l)) {
        var rows = [];
        while (i < L.length && /^\s*\|/.test(L[i])) { rows.push(L[i]); i++; }
        var h = cells(rows[0]), t = "<table><thead><tr>" + h.map(function (c) { return "<th>" + inline(c) + "</th>"; }).join("") + "</tr></thead><tbody>";
        rows.slice(/^[\s|:-]+$/.test(rows[1] || "") ? 2 : 1).forEach(function (r) { t += "<tr>" + cells(r).map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>"; });
        o.push(t + "</tbody></table>");
        continue;
      }
      if (/^\s*[-*]\s+/.test(l)) {
        var u = "<ul>";
        while (i < L.length && /^\s*[-*]\s+/.test(L[i])) { u += "<li>" + inline(L[i].replace(/^\s*[-*]\s+/, "")) + "</li>"; i++; }
        o.push(u + "</ul>");
        continue;
      }
      var p = [];
      while (i < L.length && L[i].trim() && !/^(#|\s*\||\s*[-*]\s)/.test(L[i])) { p.push(L[i]); i++; }
      o.push("<p>" + inline(p.join(" ")) + "</p>");
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
    var cell = null;
    [].forEach.call(pn.querySelectorAll("td:first-child"), function (td) {
      if (!cell && td.textContent.trim() === "OS" && td.nextElementSibling) cell = td.nextElementSibling;
    });
    if (!cell) {
      pn.querySelector(".tg").insertAdjacentHTML("afterend", '<table class="po"><tbody><tr><td>OS</td><td>' + esc(os ? os.v : "TBD") + "</td></tr></tbody></table>");
      cell = pn.querySelector(".po td:last-child");
    }
    if (os && os.eol) cell.insertAdjacentHTML("beforeend", ' <span class="eolb" title="End of standard support: ' + esc(os.eol) + '">EOL</span>');
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
        var end = m.index + m[0].length, b = document.createElement("button"), net = D.nets[j], lbl = "Show network " + net.cidr + " " + net.name;
        frag.appendChild(document.createTextNode(s.slice(last, end)));
        b.type = "button";
        b.className = "nwd" + (core.ctx.net === j ? " on" : "");
        b.setAttribute("data-n", j);
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

  // The "Close" button (#pc) is wired once by ui/init.
  function renderPanel(key) {
    var e = D.ent[key], pn = $("pn");
    if (!e) return;
    var sec = D.sections[e.title], cf = confluence(sec || "");
    var link = cf.url ? ' <a id="pl" href="' + esc(cf.url) + '" target="_blank" rel="noopener" aria-label="Open Confluence page" title="' + esc(cf.url) + '">↗</a>' : "";
    var html = '<button id="pc" type="button" aria-label="Close">Close</button><h1>' + esc(e.title) + link + '</h1><span class="tg" data-ty="' + e.ty + '">' + esc(e.tag) + "</span>";
    if (sec) html += md(cf.sec);
    else {
      html += '<p class="pm">No section for this entity in details.md; showing diagram data.</p>';
      var lines = (e.body || []).concat(e.ip || []);
      if (lines.length) html += "<ul>" + lines.map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</ul>";
    }
    if (e.cl && D.ent["c:" + e.cl]) {
      var ce = D.ent["c:" + e.cl], cs = D.sections[ce.title];
      if (cs && !sec) html += '<hr><p class="pm">Part of ' + esc(ce.title) + "</p>" + md(cs);
      else html += '<p class="pm">Part of ' + esc(ce.title) + "</p>";
    }
    pn.innerHTML = html;
    if (key.charAt(0) === "n") osRow(pn, e.os);
    netButtons(pn);
    pn.setAttribute("data-ty", e.ty);
    if (core.hooks.panel) core.hooks.panel(key, pn);
  }

  return { md: md, renderPanel: renderPanel };
});
