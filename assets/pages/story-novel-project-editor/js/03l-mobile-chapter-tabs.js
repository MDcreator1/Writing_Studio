(() => {
  const panel = document.getElementById('chapter-panel');
  const actions = panel?.querySelector('.draft-action-row');
  const footer = panel?.querySelector('.chapter-actions-bottom');
  const drafts = document.getElementById('mobileDraftsTab');
  const parts = document.getElementById('mobilePartsTab');
  if (!panel || !actions || !footer || !drafts || !parts) return;
  const originalParent = actions.parentNode, originalNext = actions.nextSibling;
  const mobile = window.matchMedia('(max-width: 940px)');
  let section = 'drafts';

  function selectSection(next) {
    section = next;
    if (mobile.matches) panel.dataset.mobileSection = section;
    drafts.setAttribute('aria-selected', String(section === 'drafts'));
    parts.setAttribute('aria-selected', String(section === 'parts'));
    if (mobile.matches && section === 'parts' && typeof syncMobilePartExpansion === 'function') {
      syncMobilePartExpansion(normalizeProjectManifest(projectManifest || createProjectManifest()), true);
      if (typeof renderChapters === 'function') renderChapters();
    }
    requestAnimationFrame(() => {
      if (typeof scheduleChapterPanelOverflowCheck === 'function') scheduleChapterPanelOverflowCheck();
      if (typeof syncSidebarScrollThumbs === 'function') syncSidebarScrollThumbs();
    });
  }
  function updateLayout() {
    if (mobile.matches) {
      footer.appendChild(actions);
      selectSection(section);
    } else {
      delete panel.dataset.mobileSection;
      originalParent.insertBefore(actions, originalNext);
      if (typeof hasActiveStory === 'function' && hasActiveStory() && typeof renderChapters === 'function') renderChapters();
    }
  }
  drafts.addEventListener('click', () => selectSection('drafts'));
  parts.addEventListener('click', () => selectSection('parts'));
  document.getElementById('trashToggleBtn')?.addEventListener('click', () => {
    if (mobile.matches) selectSection('drafts');
  }, true);
  mobile.addEventListener('change', updateLayout);
  updateLayout();
})();
