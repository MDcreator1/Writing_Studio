(() => {
  const editor = document.getElementById('editor');
  const header = document.getElementById('editor-info-panel');
  if (!editor || !header) return;
  const mobile = window.matchMedia('(max-width: 940px)');
  const edgeTolerance = 2;
  const revealDistance = 8;
  const revealDelay = 500;
  let lastTop = 0;
  let upwardDistance = 0;
  let revealTimer = null;

  function cancelReveal() {
    clearTimeout(revealTimer);
    revealTimer = null;
    upwardDistance = 0;
  }

  function scrollState() {
    const end = Math.max(0, editor.scrollHeight - editor.clientHeight);
    const top = Math.min(end, Math.max(0, editor.scrollTop));
    return { top, atTop: top <= edgeTolerance, atBottom: end > edgeTolerance && end - top <= edgeTolerance };
  }

  function mobileHeaderActive() {
    return mobile.matches && !document.body.classList.contains('focus-mode');
  }

  function setHidden(hidden) {
    header.classList.toggle('is-mobile-scroll-hidden', hidden);
  }

  function onScroll() {
    const { top, atTop, atBottom } = scrollState();
    const delta = top - lastTop;
    lastTop = top;
    if (!mobileHeaderActive() || atTop || atBottom || delta > 0) {
      cancelReveal();
      setHidden(mobileHeaderActive() && !atTop);
      return;
    }
    if (delta >= 0 || !header.classList.contains('is-mobile-scroll-hidden')) return;
    upwardDistance -= delta;
    if (upwardDistance < revealDistance || revealTimer !== null) return;
    revealTimer = setTimeout(() => {
      cancelReveal();
      const current = scrollState();
      if (mobileHeaderActive() && !current.atBottom) setHidden(false);
    }, revealDelay);
  }

  function sync() {
    cancelReveal();
    const { top, atTop } = scrollState();
    lastTop = top;
    setHidden(mobileHeaderActive() && !atTop);
    const compression = typeof lmEditorAdvancedNumber === 'function'
      ? lmEditorAdvancedNumber('mobileFontSizeCompress', 0) : 0;
    editor.style.setProperty('--mobile-font-size-compress', `${Math.max(0, Math.min(100, compression))}px`);
    header.style.setProperty('--mobile-info-height', `${header.offsetHeight}px`);

  }

  editor.addEventListener('scroll', onScroll, { passive: true });
  mobile.addEventListener('change', sync);
  new ResizeObserver(() => {
    header.style.setProperty('--mobile-info-height', `${header.offsetHeight}px`);
  }).observe(header);
  let focused = document.body.classList.contains('focus-mode');
  new MutationObserver(() => {
    const next = document.body.classList.contains('focus-mode');
    if (next === focused) return;
    focused = next;
    sync();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  sync();
})();
