// The one error type for invalid diagram input. Libraries throw it; only CLI entry points catch it and exit.
export class FormatError extends Error {
  constructor(detail, { file = null, line = null, path = null } = {}) {
    const where = file ? (line ? `${file}:${line}` : file) : line ? `line ${line}` : "";
    const lead = [where, path].filter(Boolean).join(": ");
    super(lead ? `${lead}: ${detail}` : detail);
    this.name = "FormatError";
    this.detail = detail;
    this.file = file;
    this.line = line;
    this.path = path;
  }
}

export const fail = (detail, where) => { throw new FormatError(detail, where); };
