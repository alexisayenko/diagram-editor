import { fail } from "../lib/util.mjs";

export function parseLayout(src) {
  const layout = JSON.parse(src);
  if ("notes" in layout) fail('layout.json has "notes"; notes live in notes.md now');
  if ("legend" in layout) fail('layout.json has "legend"; the legend is a page panel now, remove the key');
  return layout;
}
