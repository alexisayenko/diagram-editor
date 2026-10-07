export function parseDetails(src) {
  const sections = {};
  src.split(/^## /m).slice(1).forEach((s) => {
    const nl = s.indexOf("\n");
    sections[s.slice(0, nl).trim()] = s.slice(nl + 1).trim();
  });
  return sections;
}

export function osOf(section) {
  const m = (section || "").match(/^\s*\|\s*OS\s*\|\s*(.*?)\s*\|\s*$/im);
  return m && m[1] && !/^TBD$/i.test(m[1]) ? m[1] : null;
}
