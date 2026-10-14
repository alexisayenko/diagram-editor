// One builder for the page's dialogs (Open saved, New diagram, Import servers, Host script): the markup stays in the page shell as native <dialog> elements; showModal gives the backdrop, the focus trap and Escape, this adds outside click, the close hooks and focus return.
/**
 * @param {{panel: HTMLDialogElement, closeButton?: HTMLElement, returnTo: () => ?HTMLElement, onClose?: () => void}} options
 * open() shows modally; close() and hide() both close it, and the native close event (also fired by Escape) runs onClose and focuses returnTo().
 */
function dialog({ panel, closeButton, returnTo, onClose }) {
  const d = {
    panel,
    isOpen: () => panel.open,
    open() { if (!panel.open) panel.showModal(); },
    hide() { if (panel.open) panel.close(); },
    close() { d.hide(); },
  };
  panel.addEventListener("close", () => {
    if (panel.open) return;
    onClose?.();
    returnTo()?.focus();
  });
  closeButton?.addEventListener("click", d.close);
  panel.addEventListener("mousedown", (e) => { if (e.target === panel) d.close(); });
  return d;
}
export function createDialogs() {
  return { dialog };
}

// Native confirm prompts, behind one object so the two questions have one wording and one test seam.
export function createConfirmer(ask) {
  return {
    discard: (isDirty) => !isDirty() || ask("Discard unsaved changes?"),
    replace: (folder) => ask(`Replace the saved diagram ${folder}?`),
  };
}
