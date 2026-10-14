// WCAG 2.x contrast ratio and a reader for the skin tokens in engine/css/svg/tokens.css.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TOKENS = join(dirname(fileURLToPath(import.meta.url)), "../css/svg/tokens.css");

export function parseHex(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error("Not a hex colour: " + hex);
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
}

export function luminance(hex) {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const declarations = (body) => Object.fromEntries([...body.matchAll(/--([\w-]+):([^;}]+)/g)].map((m) => [m[1], m[2].trim()]));

// Resolved token maps per skin; the sketch skin has a light and a dark variant.
export function readSkins(css = readFileSync(TOKENS, "utf8")) {
  const dark = css.match(/\/\*DARK<\*\/([\s\S]*?)\/\*>DARK\*\//)?.[1] ?? "";
  const rules = [...css.replace(/@media[^{]*\{\/\*DARK<\*\/[\s\S]*?\/\*>DARK\*\/\}/, "").matchAll(/([^{}]+)\{([^}]*)\}/g)];
  const skins = {};
  for (const [, sel, body] of rules) {
    const name = /data-style="(\w+)"/.exec(sel)?.[1] ?? "sketch";
    skins[name] = { ...skins[name], ...declarations(body) };
  }
  skins["sketch-dark"] = { ...skins.sketch, ...declarations(dark.slice(dark.indexOf("{") + 1)) };
  return skins;
}

const solid = (v) => (v && v !== "none" && v.startsWith("#") ? v : null);

// The key text-on-surface pairs of a skin; a skin without a token falls back the way the CSS does.
export function keyPairs(t) {
  const card = solid(t.card) ?? t.panel;
  const pill = solid(t.ipf) ?? card;
  return [
    ["text on card", t.fg, card],
    ["muted text on card", t.mut, card],
    ["EOL text on card", t.eol, card],
    ["pill text on pill", t.ipt ?? t.fg, pill],
    ["EOL badge text on badge", t.eolt, solid(t.eolf) ?? card],
  ];
}
