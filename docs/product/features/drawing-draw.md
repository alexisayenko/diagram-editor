# Drawing on the diagram

The owner sketches on the diagram with a pencil and an eraser.

## Purpose

Mark up a diagram (circle, underline, arrow) without changing the
infrastructure model
([ADR-0009](../../tech/decisions/adr-0009-drawings-in-layout-json.md)).

## Behaviour

- Toolbar: **Select**, **Pencil**, **Eraser**, **Undo**, **Redo**.
- **Pencil** draws free-hand strokes (mouse, pen or touch). Its
  popover offers five colours (default blue) and three widths
  (2, 4, 8 px).
- **Eraser** removes the whole stroke under the pointer, by click or
  drag.
- **Select** or Esc returns to normal mode. While a tool is active,
  servers and regions do not drag, clicks do not select and panning
  is off (the wheel still zooms).
- Ctrl+Z undoes, Ctrl+Y or Ctrl+Shift+Z redoes a stroke or one
  erase gesture; history lasts until reload.
- Strokes pan and zoom with the diagram and are included in SVG /
  PNG exports.
- Drawing changes count as unsaved; **Save** and **Export** include
  them.

## Data keys

`diagram.layout.json`, key `drawings`:
`{ "id": "d1", "color": "#3b82f6", "width": 2, "points": [[x, y]] }`.
`color` is `#rrggbb`, `width` 0.5-40, ids unique. See
[authoring.md](../../tech/authoring.md#drawing-on-the-diagram).

## Edge cases

- No `drawings` key means none; unknown layout keys are kept on Save.
- An invalid entry makes the layout fail to load with
  `Invalid saved drawing N`.
- A stroke does not follow a server that moves.
- Edits to the TOML files never touch drawings.
- The Mermaid build writes drawings into `layout.html` and the
  `.excalidraw` scene; the TOML page has no Excalidraw export.

## Out of scope

- Shapes, text boxes, layers, selecting or moving a stroke.
- Sharing drawings between diagrams.
