(() => {
  const title = document.getElementById('storySummaryTitle');
  if (!title) return;
  const tablet = window.matchMedia('(width > 940px) and (max-width: 1420px)');
  let frame = null;
  let observedWidth = -1;

  function fitTitle() {
    frame = null;
    title.style.removeProperty('--story-title-fit-size');
    if (!tablet.matches || !title.clientWidth) return;
    const maximum = parseFloat(getComputedStyle(title).fontSize);
    if (!Number.isFinite(maximum) || title.scrollWidth <= title.clientWidth) return;
    // Measure the rendered text, including Hindi glyphs and the actual font.
    // Always start at the normal size so widening the sidebar grows it again.
    let low = 0, high = maximum;
    for (let step = 0; step < 10; step++) {
      const size = (low + high) / 2;
      title.style.setProperty('--story-title-fit-size', `${size}px`);
      if (title.scrollWidth > title.clientWidth) high = size;
      else low = size;
    }
    title.style.setProperty('--story-title-fit-size', `${low}px`);
  }

  function scheduleFit() {
    if (frame === null) frame = requestAnimationFrame(fitTitle);
  }
  new ResizeObserver(entries => {
    const width = entries[0].contentRect.width;
    if (width === observedWidth) return;
    observedWidth = width;
    scheduleFit();
  }).observe(title);
  new MutationObserver(scheduleFit).observe(title, { childList: true, characterData: true, subtree: true });
  window.addEventListener('resize', scheduleFit, { passive: true });
  document.fonts?.ready.then(scheduleFit);
  scheduleFit();
})();
