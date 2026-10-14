import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { El } from "./cov-dom.mjs";
import { createDialogs } from "../browser/dialogs.mjs";

function setup(onClose) {
  const panel = new El("dialog"), opener = new El("button"), closeButton = new El("button");
  const d = createDialogs().dialog({ panel, closeButton, returnTo: () => opener, onClose });
  return { panel, opener, closeButton, d };
}

test("open shows the dialog modally and close hides it, with onClose and focus back on the opener", () => {
  let closed = 0;
  const { panel, opener, d } = setup(() => { closed++; });
  assert.equal(d.isOpen(), false);
  d.open();
  assert.equal(panel.open, true);
  assert.equal(panel.modal, true);
  assert.equal(d.isOpen(), true);
  d.open();
  assert.equal(panel.open, true);
  d.close();
  assert.equal(d.isOpen(), false);
  assert.equal(closed, 1);
  assert.equal(opener.focused, 1);
  d.close();
  assert.equal(closed, 1);
});

test("Escape closes through the native close event", () => {
  let closed = 0;
  const { panel, opener, d } = setup(() => { closed++; });
  d.open();
  panel.pressEscape();
  assert.equal(panel.open, false);
  assert.equal(closed, 1);
  assert.equal(opener.focused, 1);
});

test("a cancelled Escape keeps the dialog open", () => {
  const { panel, d } = setup();
  d.open();
  panel.listeners.cancel = [(e) => e.preventDefault()];
  panel.pressEscape();
  assert.equal(panel.open, true);
});

test("a click on the dialog element (the backdrop) closes it, a click inside does not", () => {
  const { panel, d } = setup();
  d.open();
  panel.fire("mousedown", { target: new El("div") });
  assert.equal(panel.open, true);
  panel.fire("mousedown", { target: panel });
  assert.equal(panel.open, false);
});

test("the close button closes and hide skips nothing but the focus is returned too", () => {
  const { panel, opener, closeButton, d } = setup();
  d.open();
  closeButton.click();
  assert.equal(panel.open, false);
  d.open();
  d.hide();
  assert.equal(panel.open, false);
  assert.equal(opener.focused, 2);
});

test("a close event that arrives after the dialog was reopened is ignored", () => {
  let closed = 0;
  const { panel, d } = setup(() => { closed++; });
  d.open();
  panel.open = true;
  panel.fire("close");
  assert.equal(closed, 0);
});

test("a dialog without a close button or a return target still closes", () => {
  const panel = new El("dialog"), d = createDialogs().dialog({ panel, returnTo: () => null });
  d.open();
  d.close();
  assert.equal(panel.open, false);
});

test("the page shell dialogs are native <dialog> elements labelled by their heading", () => {
  const html = readFileSync(new URL("../page/shell.html", import.meta.url), "utf8");
  for (const [id, label] of [["hs", "hst"], ["imp", "impt"], ["op", "opt"], ["nw", "nwt"]]) {
    assert.ok(html.includes(`<dialog id="${id}" class="dlg" aria-labelledby="${label}">`), id);
    assert.ok(html.includes(`id="${label}"`), label);
  }
  assert.ok(!html.includes('role="dialog"'));
});
