(() => {
  const heading = document.querySelector('#top-bar h1');
  const button = document.getElementById('storySummaryMenuBtn');
  const menu = document.getElementById('storySummaryMenuPanel');
  const sourceTitle = document.getElementById('storySummaryTitle');
  if (!heading || !button || !menu || !sourceTitle) return;
  const buttonHome = button.parentNode, buttonNext = button.nextSibling;
  const menuHome = menu.parentNode, menuNext = menu.nextSibling;
  const originalLabel = button.getAttribute('aria-label');
  const originalTitle = button.title;
  const title = document.createElement('span');
  title.className = 'mobile-story-title';
  button.appendChild(title);
  const mobile = window.matchMedia('(max-width: 940px)');

  function syncTitle() {
    const text = sourceTitle.textContent.trim() || 'Untitled Story';
    title.textContent = text;
    if (mobile.matches) {
      button.title = text;
      button.setAttribute('aria-label', `${text} — Story menu`);
    }
  }
  function updateLayout() {
    if (typeof closeStorySummaryMenu === 'function') closeStorySummaryMenu();
    if (mobile.matches) {
      heading.appendChild(button);
      // Keep the original menu usable while its former summary box is hidden.
      document.body.appendChild(menu);
    } else {
      buttonHome.insertBefore(button, buttonNext);
      menuHome.insertBefore(menu, menuNext);
      button.title = originalTitle;
      button.setAttribute('aria-label', originalLabel);
    }
    syncTitle();
  }
  new MutationObserver(syncTitle).observe(sourceTitle, { childList: true, characterData: true, subtree: true });
  mobile.addEventListener('change', updateLayout);
  updateLayout();
})();
