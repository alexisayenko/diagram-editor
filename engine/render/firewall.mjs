const FW_D = "M-3.5 -11L3.5 -6.6L-3.5 -2.2L3.5 2.2L-3.5 6.6L3.5 11";

// Firewall zigzag at [x, y], rotated a degrees; placement comes from geometry.mjs (route → fw).
export const fwGlyph = ([x, y], a) => `<path class="fwb" d="${FW_D}" transform="translate(${x} ${y}) rotate(${a})"/><path class="fwz" d="${FW_D}" transform="translate(${x} ${y}) rotate(${a})"/>`;
