import { esc, fail } from "../lib/util.mjs";

const CSS = `:root{--bg:#fff;--fg:#1d2433;--muted:#5b6475;--line:#d6dae3;--note-bg:#fff4b8;--note-fg:#3b3200;--note-line:#e2c94a;--red:#d62728}
@media (prefers-color-scheme:dark){:root{--bg:#14171f;--fg:#e6e9f0;--muted:#9aa3b5;--line:#2c3342;--note-bg:#4a4116;--note-fg:#fff3b0;--note-line:#8a7a2a;--red:#ff6b6b}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
main{padding:16px;max-width:1600px;margin:0 auto}
h1{font-size:1.3rem;margin:0 0 12px}
.layout{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
.diagram{flex:1 1 640px;min-width:0;overflow-x:auto;border:1px solid var(--line);border-radius:8px;padding:12px}
.side{flex:0 0 300px;max-width:100%}
.note{background:var(--note-bg);color:var(--note-fg);border:1px solid var(--note-line);border-radius:6px;padding:10px 14px;margin-bottom:12px}
.note h2{font-size:.95rem;margin:0 0 6px}
.note p{margin:4px 0}
.legend{font-size:.85rem;color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:8px 12px}
.legend div{display:flex;align-items:center;gap:8px;margin:4px 0}
.legend i{display:inline-block;width:36px;border-top:3px solid var(--red)}
.legend i.dash{border-top:2px dashed var(--fg)}
.details{margin-top:24px;border-top:1px solid var(--line);padding-top:8px}
.details h1{font-size:1.4rem}
.details h2{font-size:1.15rem;margin-top:1.6em;border-bottom:1px solid var(--line);padding-bottom:2px}
.details table{border-collapse:collapse;margin:8px 0}
.details th,.details td{border:1px solid var(--line);padding:4px 10px;text-align:left}`;

const LINE = { request: "<i></i>", dashed: '<i class="dash"></i>' };

// Mermaid view of the model; edgeKinds is buildEdgeKey().kinds (the firewall row has no Mermaid equivalent).
export function renderIndexHtml({ title, mmd, details, notes, edgeKinds }) {
  if (/<\/script/i.test(details)) fail('details.md: contains "</script"');
  const notesHtml = notes
    .map((n) => `<div class="note">\n<h2>${esc(n.title)}, ${esc(n.date)}</h2>\n${n.paras.map((p) => `<p>${esc(p)}</p>`).join("\n")}\n</div>`)
    .join("\n");
  const legend = edgeKinds.filter(([k]) => LINE[k]).map(([k, l]) => `<div>${LINE[k]} ${esc(l)}</div>`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
${CSS}
</style>
</head>
<body>
<main>
<h1>${esc(title)}</h1>
<div class="layout">
<div class="diagram">
<pre class="mermaid">
${mmd.trimEnd().replace(/&/g, "&amp;").replace(/</g, "&lt;")}
</pre>
</div>
<aside class="side">
${notesHtml}
<div class="legend">
${legend}
</div>
</aside>
</div>
<section class="details" id="details"></section>
</main>
<script type="text/markdown" id="details-md">
${details.trimEnd()}
</script>
<script type="module">
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
const dark = matchMedia("(prefers-color-scheme: dark)").matches;
mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "default" });
await mermaid.run();
document.getElementById("details").innerHTML = marked.parse(document.getElementById("details-md").textContent);
</script>
</body>
</html>
`;
}
