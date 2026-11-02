(() => {
  const button = document.getElementById('tabletSidePanelBtn');
  const panel = document.getElementById('note-panel');
  if (!button || !panel) return;

  const compact = window.matchMedia('(max-width: 1420px)');
  // Some Naming/Fact popovers are moved to body while open. Treat these as
  // part of the sidebar even after they leave its DOM subtree.
  const relatedPanels = [
    'namingEntryPanel', 'nameDetailPanel', 'categoryInputPanel', 'categoryActionPanel',
    'factComposerPanel', 'factDetailPanel', 'categoryInfoPopover',
    'namingEntryDescriptionPopover', 'categorySortPanel', 'namingSortPanel',
    'namingColorLegendPanel', 'namingDuplicateResolverPanel',
    'namingPortableTransferModal', 'namingPartPickerDialog'
  ].map(id => `#${id}`).join(',');

  function setOpen(open) {
    const visible = Boolean(open && compact.matches && !document.body.classList.contains('focus-mode'));
    panel.classList.toggle('is-tablet-open', visible);
    button.setAttribute('aria-expanded', String(visible));
    if (visible) positionPanel();
  }

  function positionPanel() {
    const topBarBottom = document.getElementById('top-bar').getBoundingClientRect().bottom;
    const editorHeaderBottom = window.innerWidth > 940
      ? document.getElementById('editor-info-panel')?.getBoundingClientRect().bottom
      : null;
    const top = Math.max(8, Math.ceil(Math.max(topBarBottom, editorHeaderBottom || 0)) + 8);
    panel.style.setProperty('--tablet-panel-top', `${top}px`);
  }

  button.addEventListener('click', () => {
    // Repeated clicks keep the panel open; outside clicks dismiss it.
    setOpen(true);
  });
  document.addEventListener('pointerdown', event => {
    if (!panel.classList.contains('is-tablet-open')) return;
    const path = event.composedPath();
    if (path.includes(panel) || path.includes(button)) return;
    if (path.some(node => node.matches?.(relatedPanels))) return;
    setOpen(false);
  }, true);
  compact.addEventListener('change', () => setOpen(false));
  window.addEventListener('resize', () => {
    if (panel.classList.contains('is-tablet-open')) positionPanel();
  }, { passive: true });
  new MutationObserver(() => {
    if (document.body.classList.contains('focus-mode')) setOpen(false);
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();
