import { esc } from "../lib/util.mjs";

const FONTS = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap";
const STYLES = [["sketch", "Sketch"], ["clean", "Clean"], ["dark", "Dark"], ["swiss", "Swiss"]];

const notesHtml = (notes) => notes
  .map((n) => `<article class="note"><h3>${esc(n.title)}</h3>${n.paras.map((p) => `<p>${esc(p)}</p>`).join("")}<time>${esc(n.date)}</time></article>`)
  .join("\n");
const docsHtml = (docs) => docs
  .map((d) => `<li><a href="${esc(d.url).replace(/"/g, "&quot;")}" target="_blank" rel="noopener">${esc(d.title)}</a>${d.desc ? ` <span>— ${esc(d.desc)}</span>` : ""}</li>`)
  .join("\n");
const netsHtml = (nets) => nets
  .map((n, i) => `<button type="button" class="nw${n.hosts ? "" : " z"}" data-n="${i}" aria-pressed="false" style="--d:${n.depth}"><span>${n.cidr ? `<code>${esc(n.cidr)}</code> ` : ""}${esc(n.name)}</span><span class="nk" title="${n.hosts} host${n.hosts === 1 ? "" : "s"}">${n.hosts}</span></button>`)
  .join("\n");
const netsPanel = (nets) => nets
  ? `\n<aside id="wp" class="cp" aria-label="Networks"><button id="wh" class="cph" type="button" aria-expanded="true" aria-controls="wb">Networks</button><div id="wb" class="cpb"><div id="wl" role="group" aria-label="Network filter">\n${netsHtml(nets)}\n</div><button type="button" class="reset" id="wr">Show all</button></div></aside>`
  : "";
const styleBtns = STYLES
  .map(([k, l]) => `<button type="button" data-s="${k}" aria-pressed="${k === "clean"}">${l}</button>`)
  .join("");

export function renderLayoutHtml({ title, cssSvg, cssPage, viewBox, svgBody, markers, edgeKeyHtml, notes, docs, nets, dataJson, js }) {
  return `<!doctype html>
<html lang="en" data-style="clean">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="${FONTS}">
<style id="css-svg">
${cssSvg}
</style>
<style id="css-page">
${cssPage}
</style>
</head>
<body>
<div id="ta"><span id="tal"><span id="ss" role="group" aria-label="Diagram style">${styleBtns}</span><span id="zm" role="group" aria-label="Zoom"><button id="zo" type="button" aria-label="Zoom out" title="Zoom out (-)">−</button><button id="zi" type="button" aria-label="Zoom in" title="Zoom in (+)">+</button><button id="zf" type="button" title="Fit to window (0)">Fit</button></span></span><span id="tar"><button id="xs" type="button">SVG</button><button id="xp" type="button">PNG</button> <button id="te" type="button" aria-pressed="false">Edit layout</button><span id="tx" hidden><button id="tc" type="button">Copy layout.json</button> <button id="td" type="button">Download</button> <button id="tr" type="button">Reset</button> <label><input id="ts" type="checkbox" checked>Snap 5px (Shift: off)</label> <span id="tm"></span></span></span></div>
<svg class="s-clean" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
<defs>
<marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path class="mo" d="M1 1L9 5L1 9"/><path class="mf" d="M2 2L9 5L2 8Z"/></marker>
<marker id="ak" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path class="mo" d="M1 1L9 5L1 9"/><path class="mf" d="M2 2L9 5L2 8Z"/></marker>${markers ? "\n" + markers : ""}
</defs>

${svgBody}
</svg>
<div id="lc">
<aside id="lp" class="cp" aria-label="Legend"><button id="lh" class="cph" type="button" aria-expanded="true" aria-controls="lb">Legend</button><div id="lb" class="cpb"><div id="lg" role="group" aria-label="Server types"></div><div class="lk"><b>Connections</b>${edgeKeyHtml}</div></div></aside>${netsPanel(nets)}
</div>
<aside id="pn" aria-label="Details" hidden></aside>
<div id="ch" role="status" aria-live="polite"></div>
<div id="rc">
<aside id="np" class="cp" aria-label="Notes"><button id="nh" class="cph" type="button" aria-expanded="true" aria-controls="nl">Notes (${notes.length})</button><div id="nl" class="cpb">
${notesHtml(notes)}
</div></aside>
<aside id="dp" class="cp" aria-label="Related documents"><button id="dh" class="cph" type="button" aria-expanded="true" aria-controls="dl">Related documents</button><ul id="dl" class="cpb">
${docsHtml(docs)}
</ul></aside>
</div>
<script type="application/json" id="layout-data">${dataJson}</script>
<script>
${js}
</script>
</body>
</html>
`;
}
