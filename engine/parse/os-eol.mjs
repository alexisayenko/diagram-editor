// End of standard support (extended for Windows Server 2016, Premier for Oracle Linux), "YYYY-MM": EOL once that month has passed.
const EOL = {
  ubuntu: { "14.04": "2019-04", "16.04": "2021-04", "18.04": "2023-05", "20.04": "2025-05", "22.04": "2027-04", "24.04": "2029-05" },
  debian: { 8: "2018-06", 9: "2020-07", 10: "2022-09", 11: "2024-08", 12: "2026-06", 13: "2028-08" },
  centos: { 7: "2024-06" },
  oracle: { 7: "2024-12", 8: "2029-07", 9: "2032-06" },
  windows: { 2012: "2023-10", "2012 R2": "2023-10", 2016: "2027-01" },
};

function eolOf(os) {
  let m;
  if ((m = os.match(/^Ubuntu (\d+)(?:\.(\d+))?/i))) return EOL.ubuntu[`${m[1]}.${m[2] || "04"}`] || null;
  if ((m = os.match(/^Debian (\d+)/i))) return EOL.debian[m[1]] || null;
  if ((m = os.match(/^CentOS (\d+)/i))) return EOL.centos[m[1]] || null;
  if ((m = os.match(/^Oracle Linux (\d+)/i))) return EOL.oracle[m[1]] || null;
  if ((m = os.match(/^Windows Server (\d{4})( R2)?/i))) return EOL.windows[m[1] + (m[2] ? " R2" : "")] || null;
  return null;
}

export function osInfo(os, today = new Date()) {
  if (!os) return null;
  const eol = eolOf(os);
  return { v: os, eol: eol && today.toISOString().slice(0, 7) > eol ? eol : null };
}
