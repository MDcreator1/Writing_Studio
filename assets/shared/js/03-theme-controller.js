(function () {
  const ID_ALIAS_PREFIX = 'lm-id-';
  const THEME_LIGHT_CLASS = 'lm-theme-light';
  const THEME_DARK_CLASS = 'lm-theme-dark';
  const THEME_GREY_CLASS = 'lm-theme-grey';
  const THEME_PURPLE_CLASS = 'lm-theme-purple';
  const THEME_SUNSET_CLASS = 'lm-theme-sunset';
  const THEME_FOREST_CLASS = 'lm-theme-forest';
  const THEME_MODES = ['light', 'dark', 'grey', 'purple', 'sunset', 'forest'];
  const EXTRA_THEME_MODES = ['dark', 'purple', 'sunset', 'forest'];
  let activeThemeMode = null;
  let moreThemesExpanded = false;
  const SPECIAL_ID_CLASSES = {
    'top-bar': ['app-top-bar'],
    'note-header': ['note-header']
  };

  function idToAliasClass(id) {
    return `${ID_ALIAS_PREFIX}${String(id || '').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  function syncElementIdClasses(element) {
    if (!element?.id || !element.classList) return;
    element.classList.add(idToAliasClass(element.id));
    (SPECIAL_ID_CLASSES[element.id] || []).forEach(className => element.classList.add(className));
  }

  function syncIdClasses(root = document) {
    if (root?.nodeType === 1) syncElementIdClasses(root);
    root?.querySelectorAll?.('[id]').forEach(syncElementIdClasses);
  }

  function normalizeThemeMode(mode) {
    const value = String(mode || '').toLowerCase();
    if (value === 'colorful') return 'purple';
    if (THEME_MODES.includes(value)) return value;
    if (mode === true || value === 'true') return 'dark';
    if (document.body?.classList.contains('forest-mode')) return 'forest';
    if (document.body?.classList.contains('sunset-mode')) return 'sunset';
    if (document.body?.classList.contains('purple-mode') || document.body?.classList.contains('colorful-mode')) return 'purple';
    if (document.body?.classList.contains('grey-mode')) return 'grey';
    if (document.body?.classList.contains('dark-mode')) return 'dark';
    if (document.body?.classList.contains('light-mode')) return 'light';
    return localStorage.getItem('lm_dark') === 'true' ? 'dark' : 'light';
  }

  function getStoredThemeMode() {
    const storedMode = normalizeThemeMode(localStorage.getItem('lm_theme'));
    if (localStorage.getItem('lm_theme')) return storedMode;
    return localStorage.getItem('lm_dark') === 'true' ? 'dark' : 'light';
  }

  function getCurrentThemeMode() {
    if (THEME_MODES.includes(activeThemeMode)) return activeThemeMode;
    if (document.body?.classList.contains('forest-mode')) return 'forest';
    if (document.body?.classList.contains('sunset-mode')) return 'sunset';
    if (document.body?.classList.contains('purple-mode') || document.body?.classList.contains('colorful-mode')) return 'purple';
    if (document.body?.classList.contains('grey-mode')) return 'grey';
    if (document.body?.classList.contains('dark-mode')) return 'dark';
    if (document.body?.classList.contains('light-mode')) return 'light';
    return getStoredThemeMode();
  }

  function setStoredThemeMode(mode) {
    const nextMode = normalizeThemeMode(mode);
    activeThemeMode = nextMode;
    localStorage.setItem('lm_theme', nextMode);
    localStorage.setItem('lm_dark', String(nextMode === 'dark'));
    return nextMode;
  }

  function syncThemeClass(element, mode) {
    if (!element?.classList) return;
    const nextMode = normalizeThemeMode(mode);
    element.classList.toggle(THEME_DARK_CLASS, nextMode === 'dark');
    element.classList.toggle(THEME_GREY_CLASS, nextMode === 'grey');
    element.classList.toggle(THEME_PURPLE_CLASS, nextMode === 'purple');
    element.classList.toggle(THEME_SUNSET_CLASS, nextMode === 'sunset');
    element.classList.toggle(THEME_FOREST_CLASS, nextMode === 'forest');
    element.classList.toggle(THEME_LIGHT_CLASS, nextMode === 'light');
  }

  function applyLekhakThemeClasses(mode = getCurrentThemeMode()) {
    const nextMode = normalizeThemeMode(mode);
    activeThemeMode = nextMode;
    document.body?.classList.toggle('light-mode', nextMode === 'light');
    document.body?.classList.toggle('dark-mode', nextMode === 'dark');
    document.body?.classList.toggle('grey-mode', nextMode === 'grey');
    document.body?.classList.toggle('purple-mode', nextMode === 'purple');
    document.body?.classList.toggle('sunset-mode', nextMode === 'sunset');
    document.body?.classList.toggle('forest-mode', nextMode === 'forest');
    document.body?.classList.toggle('colorful-mode', false);
    syncThemeClass(document.documentElement, nextMode);
    syncThemeClass(document.body, nextMode);
    document.querySelectorAll('[id], [data-lm-theme-target]').forEach(element => syncThemeClass(element, nextMode));
  }

  function setGlobalDarkState(nextDark, mode = nextDark ? 'dark' : 'light') {
    try {
      if (typeof isDark !== 'undefined') isDark = Boolean(nextDark);
    } catch (error) {
    }
  }

  function getThemePanelElements() {
    const defaultButton = document.getElementById('darkBtn');
    const focusButton = document.getElementById('focusThemeBtn');
    const useFocusButton = Boolean(
      document.body?.classList.contains('focus-mode') &&
      focusButton &&
      !focusButton.closest('[hidden], [aria-hidden="true"]')
    );
    return {
      button: useFocusButton ? focusButton : defaultButton,
      panel: document.getElementById('themeModePanel'),
      lightButton: document.getElementById('themeLightBtn'),
      darkButton: document.getElementById('themeDarkBtn'),
      greyButton: document.getElementById('themeGreyBtn'),
      purpleButton: document.getElementById('themePurpleBtn'),
      sunsetButton: document.getElementById('themeSunsetBtn'),
      forestButton: document.getElementById('themeForestBtn'),
      moreButton: document.getElementById('themeMoreBtn'),
      moreOptions: document.getElementById('themeMoreOptions')
    };
  }

  function positionThemePanel() {
    const { button, panel } = getThemePanelElements();
    if (!button || !panel || panel.hidden) return;
    const buttonRect = button.getBoundingClientRect();
    const positionConfig = window.lmFloatingPanelPositionConfig?.('themeModePanel', {
      gap: 8,
      topOffset: 0,
      leftOffset: 0,
      rightOffset: 0,
      panelWidth: 184,
      viewportPadding: 10
    }) || {};
    const viewportPadding = window.lmPanelNumber?.(positionConfig.viewportPadding, 10) ?? 10;
    const gap = window.lmPanelNumber?.(positionConfig.gap, 8) ?? 8;
    const leftOffset = window.lmPanelNumber?.(positionConfig.leftOffset, 0) ?? 0;
    const rightOffset = window.lmPanelNumber?.(positionConfig.rightOffset, 0) ?? 0;
    const topOffset = window.lmPanelNumber?.(positionConfig.topOffset, 0) ?? 0;
    const panelWidth = Math.min(
      window.lmPanelNumber?.(positionConfig.panelWidth, 184) ?? 184,
      window.innerWidth - viewportPadding * 2
    );
    panel.style.width = `${panelWidth}px`;
    const panelHeight = panel.offsetHeight || 180;
    let left = buttonRect.right - panelWidth + leftOffset - rightOffset;
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - panelWidth - viewportPadding));
    let top = buttonRect.bottom + gap + topOffset;
    top = Math.max(viewportPadding, Math.min(top, window.innerHeight - panelHeight - viewportPadding));
    panel.style.inset = `${top}px auto auto ${left}px`;
  }

  function syncThemePanelState() {
    const { button, panel, lightButton, darkButton, greyButton, purpleButton, sunsetButton, forestButton, moreButton, moreOptions } = getThemePanelElements();
    const mode = getCurrentThemeMode();
    const extraThemeActive = EXTRA_THEME_MODES.includes(mode);
    button?.classList.toggle('is-open', Boolean(panel && !panel.hidden));
    button?.setAttribute('aria-expanded', String(Boolean(panel && !panel.hidden)));
    lightButton?.classList.toggle('is-active', mode === 'light');
    darkButton?.classList.toggle('is-active', mode === 'dark');
    greyButton?.classList.toggle('is-active', mode === 'grey');
    purpleButton?.classList.toggle('is-active', mode === 'purple');
    sunsetButton?.classList.toggle('is-active', mode === 'sunset');
    forestButton?.classList.toggle('is-active', mode === 'forest');
    if (moreOptions) moreOptions.hidden = !moreThemesExpanded;
    moreButton?.classList.toggle('is-expanded', moreThemesExpanded);
    moreButton?.classList.toggle('has-active-extra', extraThemeActive);
    moreButton?.setAttribute('aria-expanded', String(moreThemesExpanded));
    if (typeof window.syncFocusTopControlsState === 'function') window.syncFocusTopControlsState();
    if (typeof window.positionFocusTopOpenPanels === 'function') window.positionFocusTopOpenPanels();
  }

  function setThemePanel(open) {
    const { panel } = getThemePanelElements();
    if (!panel) return;
    if (!open) moreThemesExpanded = false;
    if (open && panel.hidden && typeof window.prepareFloatingPanelFocusReturn === 'function') {
      window.prepareFloatingPanelFocusReturn(panel);
    }
    panel.hidden = !open;
    syncThemePanelState();
    if (open) positionThemePanel();
  }

  function toggleMoreThemeOptions(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    moreThemesExpanded = !moreThemesExpanded;
    syncThemePanelState();
    positionThemePanel();
  }

  function toggleThemePanel(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const { panel } = getThemePanelElements();
    setThemePanel(Boolean(panel?.hidden));
  }

  function selectThemeMode(mode) {
    const nextMode = setStoredThemeMode(mode);
    setGlobalDarkState(nextMode === 'dark', nextMode);
    if (typeof applyDark === 'function') applyDark();
    else if (typeof applyHomeDarkMode === 'function') applyHomeDarkMode();
    else {
      applyLekhakThemeClasses(nextMode);
    }
    if (typeof saveToStorage === 'function') saveToStorage();
    setThemePanel(false);
    syncThemePanelState();
  }

  function observeThemeTargets() {
    if (!document.body || window.__lmThemeClassObserver) return;
    window.__lmThemeClassObserver = new MutationObserver(mutations => {
      const mode = getCurrentThemeMode();
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          syncIdClasses(node);
          if (node.matches?.('[id], [data-lm-theme-target]')) syncThemeClass(node, mode);
          node.querySelectorAll?.('[id], [data-lm-theme-target]').forEach(element => syncThemeClass(element, mode));
        });
      });
    });
    window.__lmThemeClassObserver.observe(document.body, { childList: true, subtree: true });
  }

  function initLekhakThemeClasses() {
    syncIdClasses(document);
    applyLekhakThemeClasses();
    syncThemePanelState();
    observeThemeTargets();
  }

  window.syncLekhakIdClasses = syncIdClasses;
  window.getCurrentThemeMode = getCurrentThemeMode;
  window.getStoredThemeMode = getStoredThemeMode;
  window.setStoredThemeMode = setStoredThemeMode;
  window.applyLekhakThemeClasses = applyLekhakThemeClasses;
  window.positionThemePanel = positionThemePanel;
  window.syncThemePanelState = syncThemePanelState;
  window.setThemePanel = setThemePanel;
  window.closeThemePanel = () => setThemePanel(false);
  window.toggleThemePanel = toggleThemePanel;
  window.toggleMoreThemeOptions = toggleMoreThemeOptions;
  window.selectThemeMode = selectThemeMode;
  window.initLekhakThemeClasses = initLekhakThemeClasses;

  document.addEventListener('pointerdown', function (event) {
    const { button, panel } = getThemePanelElements();
    if (!panel || panel.hidden) return;
    if (panel.contains(event.target) || button?.contains(event.target)) return;
    if (document.body?.classList.contains('focus-mode') && panel.classList.contains('is-focus-top-panel')) return;
    setThemePanel(false);
  });
  document.addEventListener('keydown', function (event) {
    const { panel } = getThemePanelElements();
    if (event.key !== 'Escape' || !panel || panel.hidden) return;
    setThemePanel(false);
    event.stopImmediatePropagation?.();
  });
  window.addEventListener('resize', positionThemePanel);
  window.addEventListener('scroll', positionThemePanel, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLekhakThemeClasses, { once: true });
  } else {
    initLekhakThemeClasses();
  }
}());
