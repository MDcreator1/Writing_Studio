(function () {
  const ID_ALIAS_PREFIX = 'lm-id-';
  const DEFAULT_THEME_MODES = ['light', 'dark', 'grey', 'purple', 'sunset', 'forest'];
  let themeModes = [...DEFAULT_THEME_MODES];
  let themeFamilies = [];
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
    if (themeModes.includes(value)) return value;
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
    if (themeModes.includes(activeThemeMode)) return activeThemeMode;
    const classMode = themeModes.find(mode => document.body?.classList.contains(`lm-theme-${mode}`) || document.body?.classList.contains(`${mode}-mode`));
    if (classMode) return classMode;
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
    [...element.classList].filter(className => className.startsWith('lm-theme-')).forEach(className => element.classList.remove(className));
    element.classList.add(`lm-theme-${nextMode}`);
  }

  function applyLekhakThemeClasses(mode = getCurrentThemeMode()) {
    const nextMode = normalizeThemeMode(mode);
    activeThemeMode = nextMode;
    themeModes.forEach(theme => document.body?.classList.toggle(`${theme}-mode`, nextMode === theme));
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
      moreButton: document.getElementById('themeMoreBtn'),
      moreOptions: document.getElementById('themeMoreOptions')
    };
  }

  function discoverThemeModes() {
    const discovered = new Set(DEFAULT_THEME_MODES);
    const canonicalMode = mode => ({ gray: 'grey', colorful: 'purple' })[mode] || mode;
    const visitRules = rules => {
      [...(rules || [])].forEach(rule => {
        const selector = String(rule.selectorText || '');
        for (const match of selector.matchAll(/\.lm-theme-([a-z0-9-]+)/gi)) discovered.add(canonicalMode(match[1].toLowerCase()));
        try { if (rule.cssRules) visitRules(rule.cssRules); } catch (error) {}
      });
    };
    [...document.styleSheets].forEach(sheet => { try { visitRules(sheet.cssRules); } catch (error) {} });
    themeModes = [...DEFAULT_THEME_MODES, ...[...discovered].filter(mode => !DEFAULT_THEME_MODES.includes(mode)).sort()];
    return themeModes;
  }

  function themeModeLabel(mode) {
    return String(mode).split('-').filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
  }

  function themeButtonId(mode) {
    return `theme${String(mode).split('-').map(part => part[0]?.toUpperCase() + part.slice(1)).join('')}Btn`;
  }

  function buildThemeFamilies() {
    const families = new Map();
    themeModes.forEach((mode, order) => {
      const match = mode.match(/^(.+)-(light|dark)$/);
      const name = match?.[1] || mode;
      const family = families.get(name) || { name, order, base: null, light: null, dark: null };
      if (match) family[match[2]] = mode;
      else family.base = mode;
      families.set(name, family);
    });
    themeFamilies = [...families.values()].sort((a, b) => a.order - b.order).map(family => {
      const hasExplicitPair = Boolean(family.light && family.dark);
      if (!hasExplicitPair && family.base && family.light && !family.dark) family.dark = family.base;
      else if (!hasExplicitPair && family.base && family.dark && !family.light) family.light = family.base;
      family.hasVariants = Boolean(family.light && family.dark && family.light !== family.dark);
      family.mode = family.base || family.light || family.dark;
      return family;
    });
    return themeFamilies;
  }

  function applyThemeButtonPreview(button, mode) {
    const probe = document.createElement('span');
    probe.className = `lm-theme-${mode}`;
    probe.hidden = true;
    document.body.appendChild(probe);
    const style = getComputedStyle(probe);
    const value = name => style.getPropertyValue(name).trim();
    const paper = value('--paper') || value('--surface') || '#fff';
    const surface = value('--surface-soft') || value('--surface') || paper;
    const accent = value('--accent') || '#777';
    const border = value('--border') || accent;
    const ink = value('--ink') || '#111';
    probe.remove();
    button.style.setProperty('--theme-option-preview-bg', `linear-gradient(135deg, ${paper}, ${surface})`);
    button.style.setProperty('--theme-option-preview-border', border);
    button.style.setProperty('--theme-option-preview-color', ink);
    button.style.setProperty('--theme-option-preview-accent', accent);
    button.style.setProperty('--theme-option-preview-shadow', `0 9px 20px color-mix(in srgb, ${accent} 20%, transparent)`);
  }

  function createThemeButton(mode, label = themeModeLabel(mode)) {
    const button = document.createElement('button');
    button.className = `theme-mode-option lm-id-${themeButtonId(mode)}`;
    button.id = themeButtonId(mode);
    button.type = 'button';
    button.dataset.themeMode = mode;
    button.textContent = label;
    button.addEventListener('click', () => selectThemeMode(mode));
    applyThemeButtonPreview(button, mode);
    return button;
  }

  function createThemeFamilyControl(family) {
    if (!family.hasVariants) return createThemeButton(family.mode, themeModeLabel(family.name));
    const control = document.createElement('div');
    control.className = 'theme-mode-family';
    control.dataset.themeFamily = family.name;
    const currentMode = getCurrentThemeMode();
    const preferredMode = [family.light, family.dark].includes(currentMode) ? currentMode : family.light;
    const mainButton = createThemeButton(preferredMode, themeModeLabel(family.name));
    mainButton.classList.add('theme-mode-family-main');
    mainButton.dataset.themeFamilyMain = family.name;
    const switcher = document.createElement('div');
    switcher.className = 'theme-mode-variant-switch';
    switcher.setAttribute('role', 'group');
    switcher.setAttribute('aria-label', `${themeModeLabel(family.name)} variant`);
    [['light', family.light, '☀'], ['dark', family.dark, '☾']].forEach(([variant, mode, icon]) => {
      const button = document.createElement('button');
      button.className = 'theme-mode-variant-btn';
      button.type = 'button';
      button.dataset.themeMode = mode;
      button.dataset.themeVariant = variant;
      button.title = themeModeLabel(variant);
      button.setAttribute('aria-label', `${themeModeLabel(family.name)} ${themeModeLabel(variant)}`);
      button.textContent = icon;
      button.addEventListener('click', event => {
        event.stopPropagation();
        selectThemeMode(mode);
      });
      switcher.append(button);
    });
    applyThemeButtonPreview(control, preferredMode);
    control.append(mainButton, switcher);
    return control;
  }

  function renderThemeModePanel() {
    const panel = document.getElementById('themeModePanel');
    if (!panel) return;
    buildThemeFamilies();
    const primaryNames = ['light', 'grey'];
    const primaryFamilies = themeFamilies.filter(family => primaryNames.includes(family.name));
    const extraFamilies = themeFamilies.filter(family => !primaryNames.includes(family.name));
    panel.replaceChildren(...primaryFamilies.map(createThemeFamilyControl));
    if (!extraFamilies.length) return;
    const moreButton = document.createElement('button');
    moreButton.className = 'theme-mode-option theme-mode-more-btn lm-id-themeMoreBtn';
    moreButton.id = 'themeMoreBtn';
    moreButton.type = 'button';
    moreButton.setAttribute('aria-expanded', 'false');
    moreButton.setAttribute('aria-controls', 'themeMoreOptions');
    moreButton.innerHTML = '<span>More themes</span><span class="theme-mode-more-arrow" aria-hidden="true">›</span>';
    moreButton.addEventListener('click', toggleMoreThemeOptions);
    const moreOptions = document.createElement('div');
    moreOptions.className = 'theme-mode-more-options lm-id-themeMoreOptions';
    moreOptions.id = 'themeMoreOptions';
    moreOptions.hidden = true;
    moreOptions.append(...extraFamilies.map(createThemeFamilyControl));
    panel.append(moreButton, moreOptions);
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
    const { button, panel, moreButton, moreOptions } = getThemePanelElements();
    const mode = getCurrentThemeMode();
    const extraThemeActive = !['light', 'grey'].includes(mode);
    button?.classList.toggle('is-open', Boolean(panel && !panel.hidden));
    button?.setAttribute('aria-expanded', String(Boolean(panel && !panel.hidden)));
    panel?.querySelectorAll?.('[data-theme-mode]').forEach(themeButton => themeButton.classList.toggle('is-active', themeButton.dataset.themeMode === mode));
    panel?.querySelectorAll?.('[data-theme-family]').forEach(familyControl => {
      const active = [...familyControl.querySelectorAll('[data-theme-mode]')].some(button => button.dataset.themeMode === mode);
      familyControl.classList.toggle('is-active', active);
      const mainButton = familyControl.querySelector('[data-theme-family-main]');
      if (mainButton && active) {
        mainButton.dataset.themeMode = mode;
        applyThemeButtonPreview(familyControl, mode);
      }
    });
    if (moreOptions) moreOptions.hidden = !moreThemesExpanded;
    moreButton?.classList.toggle('is-expanded', moreThemesExpanded);
    moreButton?.classList.toggle('has-active-extra', extraThemeActive);
    moreButton?.setAttribute('aria-expanded', String(moreThemesExpanded));
    if (typeof window.syncFocusTopControlsState === 'function') window.syncFocusTopControlsState();
    if (typeof window.positionFocusTopOpenPanels === 'function') window.positionFocusTopOpenPanels();
  }

  function setThemePanel(open) {
    if (open) {
      discoverThemeModes();
      renderThemeModePanel();
    }
    const { panel } = getThemePanelElements();
    if (!panel) return;
    if (!open) moreThemesExpanded = false;
    if (open && panel.hidden && typeof window.prepareFloatingPanelFocusReturn === 'function') {
      window.prepareFloatingPanelFocusReturn(panel);
    }
    panel.hidden = !open;
    document.getElementById('top-bar')?.classList.toggle('is-theme-panel-open', open);
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
    discoverThemeModes();
    renderThemeModePanel();
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
  window.addEventListener('resize', positionThemePanel, { passive: true });
  window.addEventListener('scroll', positionThemePanel, { capture: true, passive: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLekhakThemeClasses, { once: true });
  } else {
    initLekhakThemeClasses();
  }
}());
