(() => {
  // Use the visible area when the on-screen keyboard or browser bars resize it.
  function syncVisibleViewport() {
    const viewport = window.visualViewport;
    document.body.style.setProperty('--home-visible-height', `${viewport?.height || window.innerHeight}px`);
    document.body.style.setProperty('--home-visible-top', `${viewport?.offsetTop || 0}px`);
  }
  window.addEventListener('resize', syncVisibleViewport, { passive: true });
  window.visualViewport?.addEventListener('resize', syncVisibleViewport, { passive: true });
  window.visualViewport?.addEventListener('scroll', syncVisibleViewport, { passive: true });
  syncVisibleViewport();
})();
