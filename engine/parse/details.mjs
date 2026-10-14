export function parseDetails(src) {
  const sections = {};
  src.split(/^## /m).slice(1).forEach((s) => {
    const nl = s.indexOf("\n");
    sections[s.slice(0, nl).trim()] = s.slice(nl + 1).trim();
  });
  return sections;
}

export function osOf(section) {
  const m = /^\s*\|\s*OS\s*\|\s*(.*?)\s*\|\s*$/im.exec(section || "");
  return m?.[1] && !/^TBD$/i.test(m[1]) ? m[1] : null;
}
