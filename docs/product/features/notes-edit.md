# Notes editing

The owner adds, edits and deletes diagram notes in the page; notes
are saved to `notes.toml`.

## Purpose

Keep short remarks (decisions, open risks) on the diagram, visible
without selecting a server, and in the exports.

## Behaviour

- The Notes panel lists one card per note. **Add note** opens a new
  card as an editor; clicking inside a card turns it into the same
  editor.
- Text format: first line is the title, an optional `Date: <stamp>`
  line, then the body.
- **Done**, a click outside or Ctrl+Enter commits; **Esc** cancels;
  **Delete** removes the note after a confirmation.
- Edits count as unsaved changes. **Save** replaces only the
  `notes` value in `notes.toml` and creates the file if missing.
- Notes are included in SVG / PNG exports.
- The Related documents panel shows `[[documents]]` from
  `documents.toml` (hand-edited; not editable in the page).

## Data keys

- `notes.toml`: one top-level `notes`, a string or an array of
  strings.
- `documents.toml`: `[[documents]]` with `title`, `url` (http or
  https), optional `description`.

Reference: [authoring.md](../../tech/authoring.md#editing-notes-in-the-page).

## Edge cases

- Empty title, missing body or a bad `Date:` line shows a message
  and keeps the editor open.
- No `notes` key yet: one is added after the last top-level key.
  Deleting every note removes the key.
- Comments, key order, whitespace, line endings and BOM in the file
  are kept.
- Changed on disk since load: Save answers 409, nothing is written.

## Known limits

- Right after **Save** the page reloads the diagram; a note edit
  started before that ends is refused until the diagram has reloaded.

## Out of scope

- Rich text, attachments, per-server notes (use a server's `details`).
- Editing documents in the page.
