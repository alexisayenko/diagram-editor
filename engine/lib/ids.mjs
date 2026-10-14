// Id grammars and slug sanitising shared by the page, the local server and the CLI.
export const DIAGRAM_ID = /^[a-z0-9][a-z0-9-]*$/;
export const SERVER_ID = /^[A-Za-z][A-Za-z0-9_-]*$/;

export const slugify = (raw) => String(raw).toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");

export function trimDashes(s) {
  let from = 0, to = s.length;
  while (from < to && s[from] === "-") from++;
  while (to > from && s[to - 1] === "-") to--;
  return s.slice(from, to);
}

export function sanitizeId(raw) {
  const id = trimDashes(slugify(raw));
  if (!id) return "server";
  return /^\d/.test(id) ? "s" + id : id;
}

export function sanitizeName(raw) {
  return trimDashes(trimDashes(slugify(raw)).slice(0, 60)) || "diagram";
}
