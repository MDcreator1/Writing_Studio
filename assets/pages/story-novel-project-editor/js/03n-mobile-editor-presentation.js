(() => {
  const editor = document.getElementById('editor');
  const header = document.getElementById('editor-info-panel');
  if (!editor || !header) return;
  const mobile = window.matchMedia('(max-width: 940px)');
  let lastTop = Math.max(0, editor.scrollTop);
  let hideTimer;

  function clearHideTimer() {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  function show() {
    header.classList.remove('is-mobile-scroll-hidden');
  }

  function hasOpenHeaderPanel() {
    return Boolean(header.querySelector('.editor-settings-panel:not([hidden])') ||
      document.getElementById('chapter-panel')?.classList.contains('is-mobile-open'));
  }

  function hide() {
    clearHideTimer();
    if (!mobile.matches || editor.scrollTop <= 1 || document.body.classList.contains('focus-mode')) return show();
    if (hasOpenHeaderPanel()) return scheduleHide();
    header.classList.add('is-mobile-scroll-hidden');
  }

  function scheduleHide() {
    clearHideTimer();
    hideTimer = setTimeout(hide, 3000);
  }

  function onScroll() {
    const top = Math.max(0, editor.scrollTop);
    const delta = top - lastTop;
    lastTop = top;
    if (!mobile.matches || document.body.classList.contains('focus-mode') || top <= 1) {
      clearHideTimer();
      show();
    } else if (delta > 0.5) {
      hide();
    } else if (delta < -0.5) {
      show();
      scheduleHide();
    }
  }

  function sync() {
    clearHideTimer();
    show();
    lastTop = Math.max(0, editor.scrollTop);
    const compression = typeof lmEditorAdvancedNumber === 'function'
      ? lmEditorAdvancedNumber('mobileFontSizeCompress', 0) : 0;
    editor.style.setProperty('--mobile-font-size-compress', `${Math.max(0, Math.min(100, compression))}px`);
    header.style.setProperty('--mobile-info-height', `${header.offsetHeight}px`);
    if (mobile.matches && lastTop > 1) scheduleHide();
  }

  editor.addEventListener('scroll', onScroll, { passive: true });
  mobile.addEventListener('change', sync);
  new ResizeObserver(() => {
    header.style.setProperty('--mobile-info-height', `${header.offsetHeight}px`);
  }).observe(header);
  new MutationObserver(() => {
    clearHideTimer();
    show();
    lastTop = Math.max(0, editor.scrollTop);
    if (mobile.matches && lastTop > 1 && !document.body.classList.contains('focus-mode')) scheduleHide();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  sync();
})();
