# ADR-0009: Drawings stored in the layout JSON

Status: Accepted · 2026-10-07
Commit: f0d9c5a

## Context

Users want to sketch on a diagram: circle a risk, underline a
path. Strokes are not infrastructure facts, so they do not belong
in the TOML model, but they must survive reload and appear in
exports.

## Decision

- Pencil and Eraser strokes are saved in `diagram.layout.json` as a
  `drawings` array of `{ id, color, width, points }`; the key is
  optional, so old layouts load unchanged. Unknown layout keys are
  kept on Save.
- Strokes use diagram coordinates, so they pan and zoom with the
  diagram, and SVG / PNG exports include them.
- They sit in their own `<g id="dw">` layer, apart from the layout
  state, so layout reconciliation never touches them.
- Points are rounded to 1 decimal and near-duplicates dropped; the
  schema is validated on load (`Invalid saved drawing N`).
- Undo and redo last until reload.

## Consequences

- TOML stays facts only; edits to it never move or drop a drawing.
- A stroke does not follow a server that moves.
- The layout file grows with drawings.

## Alternatives

- Store in TOML: mixes sketches with data.
- Browser storage: lost on another machine, not in Export.
