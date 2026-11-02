(() => {
  const button = document.getElementById('mobileChaptersBtn');
  const panel = document.getElementById('chapter-panel');
  if (!button || !panel) return;
  const mobile = window.matchMedia('(max-width: 940px)');
  const isCollapsible = () => !mobile.matches && Math.abs(window.innerWidth - window.innerHeight) <= 500;
  let sidebarHidden = false;
  const related = '#partDetailsPanel,#chapterDetailsPanel,#draftDetailsPanel,#storySummaryMenuPanel';
  function syncButton() {
    const focused = document.body.classList.contains('focus-mode');
    const collapsible = isCollapsible();
    const body = document.body;
    if (body.classList.contains('has-collapsible-chapter-sidebar') !== collapsible) {
      body.classList.toggle('has-collapsible-chapter-sidebar', collapsible);
    }
    const visible = !focused && (collapsible ? !sidebarHidden : mobile.matches && panel.classList.contains('is-mobile-open'));
    button.setAttribute('aria-expanded', String(visible));
    button.setAttribute('aria-label', visible ? 'Hide chapters panel' : 'Show chapters panel');
    button.title = visible ? 'Hide chapters panel' : 'Show chapters panel';
  }
  function positionPanel() {
    const header = document.getElementById('editor-info-panel');
    panel.style.setProperty('--mobile-chapters-top', `${Math.ceil(header.getBoundingClientRect().bottom) + 4}px`);
  }
  function setOpen(open) {
    const visible = Boolean(open && mobile.matches && !document.body.classList.contains('focus-mode'));
    panel.classList.toggle('is-mobile-open', visible);
    syncButton();
    if (visible) positionPanel();
  }
  button.addEventListener('click', () => {
    if (isCollapsible() && !document.body.classList.contains('focus-mode')) {
      sidebarHidden = !sidebarHidden;
      panel.classList.toggle('is-wide-sidebar-hidden', sidebarHidden);
      syncButton();
      return;
    }
    setOpen(!panel.classList.contains('is-mobile-open'));
  });
  document.addEventListener('pointerdown', event => {
    if (!panel.classList.contains('is-mobile-open')) return;
    const path = event.composedPath();
    if (path.includes(panel) || path.includes(button) || path.some(node => node.matches?.(related))) return;
    setOpen(false);
  }, true);
  mobile.addEventListener('change', () => setOpen(false));
  window.addEventListener('resize', () => {
    syncButton();
    if (panel.classList.contains('is-mobile-open')) positionPanel();
  }, { passive: true });
  new MutationObserver(() => {
    if (document.body.classList.contains('focus-mode')) setOpen(false);
    else syncButton();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  syncButton();
})();
