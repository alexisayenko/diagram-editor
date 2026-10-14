// One builder for the page's dialogs (Open saved, New diagram, Import servers, Host script): the markup stays in the page shell, this adds hide / close / Escape / outside-click / focus return.
export function createDialogs(doc) {
  const all = [];
  doc.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = all.find((d) => d.isOpen());
    if (!open) return;
    e.preventDefault();
    open.close();
  });
  /**
   * @param {{panel: HTMLElement, closeButton?: HTMLElement, returnTo: () => ?HTMLElement, onClose?: () => void}} options
   * close() hides, runs onClose and focuses returnTo(); hide() / open() only toggle the panel. Escape closes the first open dialog in creation order.
   */
  function dialog({ panel, closeButton, returnTo, onClose }) {
    const d = {
      panel,
      isOpen: () => !panel.hidden,
      open() { panel.hidden = false; },
      hide() { panel.hidden = true; },
      close() { panel.hidden = true; onClose?.(); returnTo()?.focus(); },
    };
    closeButton?.addEventListener("click", d.close);
    panel.addEventListener("mousedown", (e) => { if (e.target === panel) d.close(); });
    all.push(d);
    return d;
  }
  return { dialog };
}

// Native confirm prompts, behind one object so the two questions have one wording and one test seam.
export function createConfirmer(ask) {
  return {
    discard: (isDirty) => !isDirty() || ask("Discard unsaved changes?"),
    replace: (folder) => ask(`Replace the saved diagram ${folder}?`),
  };
}
