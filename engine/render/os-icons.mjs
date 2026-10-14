// Original monochrome OS glyphs on a 14x14 grid: s = outline path, f = filled shapes. Shared by the card, the details panel (runtime module "ui/os-icons", generated from osIconKit) and tests.
export function osIconKit() {
  var ICONS = {
    debian: { s: "M10.2 3.6A4.6 4.6 0 1 0 11.4 8.6C11.4 6.4 9.8 5.4 8.2 5.4S5.6 7 6.6 8.2 9.2 8.6 9.2 7.4" },
    ubuntu: { s: "M7 2.2A4.8 4.8 0 1 0 7.01 2.2M7 5.2A1.8 1.8 0 1 0 7.01 5.2", f: "M6.3 1.6a.7.7 0 1 0 1.4 0a.7.7 0 1 0-1.4 0M1.9 9.2a.7.7 0 1 0 1.4 0a.7.7 0 1 0-1.4 0M10.7 9.2a.7.7 0 1 0 1.4 0a.7.7 0 1 0-1.4 0" },
    rhel: { s: "M2 9.6h10M3.6 9.6C3.6 5.2 5 3.2 7 3.2s3.4 2 3.4 6.4M1.6 11.2c2.8 1.2 8 1.2 10.8 0", f: "M3.7 7.9h6.6v1.4H3.7z" },
    centos: { s: "M2.4 2.4h9.2v9.2H2.4zM7 2.4v9.2M2.4 7h9.2" },
    rocky: { s: "M2.2 11.4 1.8 7.2 5 3.2h4.2l3 3.4.4 4.8z" },
    alma: { s: "M2.4 11.8 7 2.4l4.6 9.4M4.6 8.4h4.8" },
    oracle: { s: "M4.6 3.6h4.8a3.4 3.4 0 0 1 0 6.8H4.6a3.4 3.4 0 0 1 0-6.8z" },
    suse: { s: "M7 2A5 5 0 1 0 7.01 2M4.4 8.4c1.4 1.8 4 1.8 5.4-.4", f: "M7.9 5.2a.7.7 0 1 0 1.4 0a.7.7 0 1 0-1.4 0" },
    fedora: { s: "M7 1.8A5.2 5.2 0 1 0 7.01 1.8M8.8 4.6A1.6 1.6 0 0 0 5.6 5V10.2M4.4 7.2h4.4" },
    amazon: { s: "M2.6 9c2.8 2.4 5.8 2.4 8.8 0M9.8 8.7l1.7.3-.3 1.7M4.2 2.8h5.6v4.4H4.2zM4.2 5h5.6" },
    alpine: { s: "M1.6 11.6 5 4.8l3.4 6.8M6.6 8.4 9 3.2l3.4 8.4" },
    windows: { f: "M1.8 2.8 6.4 2.2v4.4H1.8zM7.6 2 12.2 1.4v5.2H7.6zM1.8 7.6h4.6v4.4L1.8 11.4zM7.6 7.6h4.6v5.2L7.6 12.2z" },
    macos: { s: "M3 2h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM4.6 9c1.4 1.6 3.4 1.6 4.8 0", f: "M4.3 5.6a.7.7 0 1 0 1.4 0a.7.7 0 1 0-1.4 0M8.3 5.6a.7.7 0 1 0 1.4 0a.7.7 0 1 0-1.4 0" },
    linux: { s: "M7 1.8c-1.8 0-2.6 1.5-2.6 3 0 1-1.7 2.5-1.7 4.7 0 1.5 1 2.5 2.4 2.7h3.8c1.4-.2 2.4-1.2 2.4-2.7 0-2.2-1.7-3.7-1.7-4.7 0-1.5-.8-3-2.6-3z", f: "M5.2 4.4a.7.7 0 1 0 1.4 0a.7.7 0 1 0-1.4 0M7.4 4.4a.7.7 0 1 0 1.4 0a.7.7 0 1 0-1.4 0M6.2 5.8h1.6L7 6.9z" },
    unknown: { s: "M7 1.8A5.2 5.2 0 1 0 7.01 1.8M5.6 5.6a1.4 1.4 0 1 1 1.8 1.3c-.3.2-.4.5-.4 1", f: "M6.3 10.2a.7.7 0 1 0 1.4 0a.7.7 0 1 0-1.4 0" },
  };
  function glyph(fam) {
    var g = ICONS[fam] || ICONS.unknown;
    return (g.s ? '<path class="osis" d="' + g.s + '"/>' : "") + (g.f ? '<path class="osif" d="' + g.f + '"/>' : "");
  }
  function iconSvg(fam, size) {
    return '<svg class="osi" data-f="' + (ICONS[fam] ? fam : "unknown") + '" viewBox="0 0 14 14" width="' + size + '" height="' + size + '" aria-hidden="true">' + glyph(fam) + "</svg>";
  }
  return { ICONS: ICONS, glyph: glyph, iconSvg: iconSvg };
}

export const osIcons = osIconKit();
