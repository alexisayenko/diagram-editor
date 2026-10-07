import { esc } from "../lib/util.mjs";
import { isDashed } from "../parse/mmd.mjs";
import { fwGlyph } from "./firewall.mjs";

// labels: { request, dashed, firewall } from diagram.json edgeLabels. kinds feeds the index.html legend.
// rows (export legend) end with one row per connection group; the page legend shows groups as switches instead (ui/legend).
export function buildEdgeKey(model, labels, groups) {
  const { edges } = model;
  const hasDashed = edges.some((e, ei) => isDashed(model, ei));
  const keyed = [
    ["request", '<line x1="2" y1="12" x2="40" y2="12" class="r" marker-end="url(#ar)"/>'],
    ...(hasDashed ? [["dashed", '<line x1="2" y1="12" x2="40" y2="12" class="k" marker-end="url(#ak)"/>']] : []),
    ...(edges.some((e) => e.fw) ? [["firewall", `<line x1="2" y1="12" x2="42" y2="12" class="r"/>${fwGlyph([22, 12], 0)}`]] : []),
  ];
  const base = keyed.map(([k, s]) => [s, labels[k]]);
  const html = base.map(([s, l]) => `<div class="lkr"><svg class="lks" viewBox="0 0 44 24" width="44" height="24" aria-hidden="true">${s}</svg><span>${esc(l)}</span></div>`).join("");
  const grows = Object.entries(groups).map(([g, d]) => [`<line x1="2" y1="12" x2="40" y2="12" class="r" data-g="${g}" marker-end="url(#ag-${g})"/>`, d.label]);
  return { rows: [...base, ...grows], html, kinds: keyed.map(([k]) => [k, labels[k]]) };
}

// Per-group arrowhead markers and colour variables (--gc; darkColor in the Dark skin).
export function groupAssets(groups) {
  const ids = Object.keys(groups);
  const markers = ids.map((g) => `<marker id="ag-${g}" data-g="${g}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path class="mo" d="M1 1L9 5L1 9"/><path class="mf" d="M2 2L9 5L2 8Z"/></marker>`).join("\n");
  const css = ids.map((g) => `[data-g="${g}"]{--gc:${groups[g].color}}\n:root[data-style="dark"] [data-g="${g}"]{--gc:${groups[g].darkColor}}`).join("\n");
  return { markers, css };
}
