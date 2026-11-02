(() => {
  const mobile = window.matchMedia('(max-width: 940px)');
  const registered = Object.values(window.LEKHAK_FLOATING_PANEL_POSITIONS?.panelPositions || {})
    .map(config => config.selector).filter(Boolean);
  const selector = [...new Set([...registered,
    '#namingEntryPanel', '#factComposerPanel', '#editorSettingsPanel', '.status-selector-panel',
    '#categorySortPanel', '#namingSortPanel', '#namingColorLegendPanel', '#namingDuplicateResolverPanel',
    '#wordEditingQuickPanel', '#wordEditingCollectMiniPanel', '.lm-custom-select-menu', '.dock-select-menu',
    '.awe-dialog', '.awe-confirm-dialog', '.awe-export-panel', '.awe-sort-panel', '.advanced-editor-settings-card',
    '.text-import-panel', '.text-import-progress', '.advanced-promote-panel', '.naming-part-picker-dialog',
    '.naming-transfer-card', '.advanced-settings-decision-card', '#find-bar'
  ])].join(',');
  const panels = new Set(), offsets = new WeakMap(), writtenStyles = new WeakMap();
  const dockMenus = new Map();
  // Only chapter-panel dialogs receive the compact, centered presentation.
  const chapterPanels = '#partDetailsPanel, #chapterDetailsPanel, #draftDetailsPanel, .text-import-panel, .text-import-progress, .advanced-promote-panel';
  let frame = null;
  const resize = new ResizeObserver(schedule);

  function discover(root) {
    const found = [...(root.querySelectorAll?.(selector) || [])];
    if (root.matches?.(selector)) found.push(root);
    for (const panel of found) {
      if (panels.has(panel)) continue;
      panels.add(panel);
      panel.classList.add('lm-mobile-overlay');
      if (panel.matches?.(chapterPanels)) panel.classList.add('lm-mobile-centered-panel');
      resize.observe(panel);
    }
  }
  function positionDockMenus() {
    const dock = document.getElementById('floating-tools');
    if (!dock) return;
    for (const menu of document.querySelectorAll('.dock-select-menu')) {
      let portal = dockMenus.get(menu);
      if (!mobile.matches || menu.hidden) {
        if (!portal) continue;
        portal.home.insertBefore(menu, portal.next);
        portal.host.remove();
        dockMenus.delete(menu);
        continue;
      }
      if (!portal) {
        const home = menu.parentNode, trigger = home.querySelector('.dock-select-trigger');
        if (!trigger) continue;
        const host = document.createElement('div');
        host.className = 'dock-custom-select mobile-dock-menu-host';
        portal = {home, next:menu.nextSibling, trigger, host};
        dockMenus.set(menu, portal);
        dock.appendChild(host);
        host.appendChild(menu);
        menu.style.removeProperty('--mobile-overlay-x');
        menu.style.removeProperty('--mobile-overlay-y');
        offsets.delete(menu);
      }
      if (!portal.trigger.getClientRects().length) {
        if (typeof closeDockSelects === 'function') closeDockSelects();
        continue;
      }
      const anchor = portal.trigger.getBoundingClientRect(), bounds = dock.getBoundingClientRect();
      const rect = menu.getBoundingClientRect();
      const left = Math.max(8, Math.min(anchor.left, window.innerWidth - rect.width - 8));
      let top = anchor.top - rect.height - 6;
      if (top < 8) top = Math.min(anchor.bottom + 6, window.innerHeight - rect.height - 8);
      const x = `${Math.round(left - bounds.left)}px`, y = `${Math.round(Math.max(8, top) - bounds.top)}px`;
      if (portal.host.style.left !== x) portal.host.style.left = x;
      if (portal.host.style.top !== y) portal.host.style.top = y;
      writtenStyles.set(portal.host, portal.host.getAttribute('style'));
    }
  }
  function fit() {
    frame = null;
    positionDockMenus();
    const viewport = window.visualViewport;
    const left = (viewport?.offsetLeft || 0) + 8, top = (viewport?.offsetTop || 0) + 8;
    const right = left + (viewport?.width || window.innerWidth) - 16;
    const bottom = top + (viewport?.height || window.innerHeight) - 16;
    for (const panel of panels) {
      if (!panel.isConnected) { panels.delete(panel); resize.unobserve(panel); continue; }
      if (!mobile.matches) {
        if (!offsets.has(panel) && !panel.style.getPropertyValue('--mobile-overlay-max-height')) continue;
        panel.style.removeProperty('--mobile-overlay-x');
        panel.style.removeProperty('--mobile-overlay-y');
        panel.style.removeProperty('--mobile-overlay-max-height');
        offsets.delete(panel);
        writtenStyles.set(panel, panel.getAttribute('style'));
        continue;
      }
      if (!panel.getClientRects().length || panel.hidden) continue;
      const centered = Boolean(panel.matches?.(chapterPanels));
      const maxHeight = `${Math.max(48, (bottom - top) / (centered ? 0.85 : 1))}px`;
      if (panel.style.getPropertyValue('--mobile-overlay-max-height') !== maxHeight) {
        panel.style.setProperty('--mobile-overlay-max-height', maxHeight);
        writtenStyles.set(panel, panel.getAttribute('style'));
      }
      const rect = panel.getBoundingClientRect(), old = offsets.get(panel) || {x:0,y:0};
      const baseX = rect.left - old.x, baseY = rect.top - old.y;
      const x = Math.round((centered ? (left + right - rect.width) / 2 : Math.max(left, Math.min(baseX, right - rect.width))) - baseX);
      const y = Math.round((centered ? (top + bottom - rect.height) / 2 : Math.max(top, Math.min(baseY, bottom - rect.height))) - baseY);
      if (x === old.x && y === old.y) continue;
      panel.style.setProperty('--mobile-overlay-x', `${x}px`);
      panel.style.setProperty('--mobile-overlay-y', `${y}px`);
      offsets.set(panel, {x,y});
      writtenStyles.set(panel, panel.getAttribute('style'));
    }
  }
  function schedule() { if (frame === null) frame = requestAnimationFrame(fit); }
  new MutationObserver(records => {
    let changed = false;
    for (const record of records) {
      if (record.type === 'childList') {
        record.addedNodes.forEach(discover);
        if (record.addedNodes.length || record.removedNodes.length) changed = true;
      } else if (record.attributeName !== 'style' || record.target.getAttribute('style') !== writtenStyles.get(record.target)) changed = true;
    }
    if (changed) schedule();
  }).observe(document.body, {childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class','open','style']});
  mobile.addEventListener('change', schedule);
  window.addEventListener('resize', schedule, {passive:true});
  window.visualViewport?.addEventListener('resize', schedule, {passive:true});
  window.visualViewport?.addEventListener('scroll', schedule, {passive:true});
  document.addEventListener('scroll', schedule, {capture:true,passive:true});
  document.addEventListener('transitionend', schedule, true);
  document.addEventListener('animationend', schedule, true);
  discover(document);
  schedule();
})();
