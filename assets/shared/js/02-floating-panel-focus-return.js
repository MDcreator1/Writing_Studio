const FLOATING_FOCUS_PANEL_IDS = [
  'find-bar',
  'floating-tools',
  'namingEntryPanel',
  'nameDetailPanel',
  'categoryActionPanel',
  'categoryInputPanel',
  'factComposerPanel',
  'factDetailPanel',
  'partDetailsPanel',
  'chapterDetailsPanel',
  'draftDetailsPanel',
  'storyLibraryPanel',
  'storySummaryMenuPanel',
  'themeModePanel',
  'editorSettingsPanel',
  'statusSelectorPanel',
  'focusFactsPanel',
  'story-info-modal'
];

const floatingPanelFocusSnapshots = new WeakMap();
const floatingPanelOpenStates = new WeakMap();
const floatingPanelCloseContexts = new WeakMap();
const focusPanelSlotCloseLocks = new WeakSet();
const FOCUS_PANEL_POSITION_DEFAULTS = {
  focusTopPanel: {
    gap: 10,
    topOffset: 0,
    leftOffset: 0,
    rightOffset: 0,
    viewportPadding: 12
  },
  focusTopSettingsPanel: {
    gap: 10,
    topOffset: 0,
    leftOffset: 45,
    rightOffset: 0,
    panelWidth: 300,
    viewportPadding: 12
  },
  focusTopThemePanel: {
    gap: 10,
    topOffset: 0,
    leftOffset: 0,
    rightOffset: 0,
    viewportPadding: 12
  },
  focusChapterContextPanel: {
    selector: '#focusChapterContextPanel',
    gap: 16,
    topOffset: 0,
    leftOffset: 0,
    rightOffset: 0,
    panelWidth: 315,
    viewportPadding: 12
  },
  focusFactsPanel: {
    selector: '#focusFactsPanel',
    gap: 16,
    topOffset: 0,
    leftOffset: 0,
    rightOffset: 0,
    panelWidth: 315,
    viewportPadding: 12
  },
  focusNamingEntryPanel: {
    topOffset: 0,
    leftOffset: 0,
    rightOffset: 0,
    panelWidthFallback: 360,
    panelHeightFallback: 280,
    viewportPadding: 14
  },
  focusFactCenterPanel: {
    topOffset: 0,
    leftOffset: 0,
    rightOffset: 0,
    panelWidthFallback: 360,
    panelHeightFallback: 280,
    viewportPadding: 14
  }
};
let lastPointerFocusSnapshot = null;
let lastPointerFocusSnapshotAt = 0;

function focusPanelNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function focusPanelPositionKey(panelOrKey, options = {}) {
  if (options.positionKey) return options.positionKey;
  if (typeof panelOrKey === 'string') return panelOrKey;
  if (!panelOrKey) return '';
  return panelOrKey.dataset?.positionKey || panelOrKey.id || '';
}

function focusPanelPositionConfig(panelOrKey, fallback = {}, options = {}) {
  const key = focusPanelPositionKey(panelOrKey, options);
  return {
    ...fallback,
    ...(FOCUS_PANEL_POSITION_DEFAULTS[key] || {})
  };
}

function floatingFocusPanelElements() {
  return FLOATING_FOCUS_PANEL_IDS
    .map(panelId => document.getElementById(panelId))
    .filter(Boolean);
}

function isFloatingFocusPanelOpen(panel) {
  if (!panel) return false;
  if (panel.id === 'floating-tools') return panel.classList.contains('is-expanded');
  if (panel.id === 'story-info-modal') return panel.classList.contains('is-visible');
  return !panel.hidden;
}

function isFocusPanelSlotModeActive() {
  return typeof isFocus !== 'undefined' && Boolean(isFocus);
}

function normalizeFocusPanelSlot(slot) {
  return ['center', 'left', 'right', 'top'].includes(slot) ? slot : '';
}

function focusPanelSlotForPanel(panel) {
  if (!panel) return '';
  const datasetSlot = normalizeFocusPanelSlot(panel.dataset?.focusPanelSlot || '');
  if (datasetSlot) return datasetSlot;
  if (panel.classList?.contains('is-focus-center-panel')) return 'center';
  if (panel.classList?.contains('is-focus-left-panel')) return 'left';
  if (panel.classList?.contains('is-focus-right-panel')) return 'right';
  if (panel.classList?.contains('is-focus-top-panel')) return 'top';
  return '';
}

function isFocusSlotPanelOpen(panel) {
  if (!panel || !focusPanelSlotForPanel(panel)) return false;
  if (panel.id === 'find-bar') return !panel.hidden;
  if (panel.id === 'floating-tools') return panel.classList.contains('is-expanded');
  return !panel.hidden && panel.getAttribute('aria-hidden') !== 'true';
}

function focusPanelSlotElements(slot) {
  return [...document.querySelectorAll('[data-focus-panel-slot], .is-focus-center-panel, .is-focus-left-panel, .is-focus-right-panel, .is-focus-top-panel')]
    .filter(panel => focusPanelSlotForPanel(panel) === slot);
}

function closeFocusPanelSlotGroup(slot, activePanel = null) {
  focusPanelSlotElements(slot).forEach(panel => {
    if (panel === activePanel || !isFocusSlotPanelOpen(panel)) return;
    closeFocusPanelSlotPanel(panel);
  });
}

function closeFocusPanelSlotPanel(panel) {
  if (!panel || focusPanelSlotCloseLocks.has(panel)) return;
  focusPanelSlotCloseLocks.add(panel);
  try {
    const closeFunctionName = panel.dataset?.focusPanelClose || '';
    if (closeFunctionName && typeof window[closeFunctionName] === 'function') {
      window[closeFunctionName]();
    } else if (panel.id === 'find-bar' && typeof setFindPanel === 'function') {
      setFindPanel(false);
    } else if (panel.id === 'floating-tools' && typeof setToolDock === 'function') {
      setToolDock(false);
    } else if (panel.id === 'namingEntryPanel' && typeof closeNamingEntryPanel === 'function') {
      closeNamingEntryPanel({
        preserveFocusSidePanels: true,
        suppressFocusRestore: true
      });
    } else if (panel.id === 'focusNamingCategoryPanel' && typeof hideFocusNamingCategoryPanel === 'function') {
      hideFocusNamingCategoryPanel();
    } else {
      panel.hidden = true;
      panel.classList?.remove('is-visible', 'is-expanded');
    }
  } finally {
    requestAnimationFrame(() => focusPanelSlotCloseLocks.delete(panel));
  }
}

function enforceFocusPanelSlot(panel) {
  if (!isFocusPanelSlotModeActive() || !isFocusSlotPanelOpen(panel)) return;
  const slot = focusPanelSlotForPanel(panel);
  if (!slot) return;

  if (slot === 'top') {
    closeFocusPanelSlotGroup('left', panel);
    closeFocusPanelSlotGroup('right', panel);
  } else if (slot === 'left' || slot === 'right') {
    const oppositeSideSlot = slot === 'left' ? 'right' : 'left';
    closeFocusPanelSlotGroup(oppositeSideSlot, panel);
    if (typeof window.hideFocusTopControls === 'function') {
      window.hideFocusTopControls();
    } else {
      closeFocusPanelSlotGroup('top', panel);
    }
  }
  focusPanelSlotElements(slot).forEach(otherPanel => {
    if (otherPanel === panel || !isFocusSlotPanelOpen(otherPanel)) return;
    closeFocusPanelSlotPanel(otherPanel);
  });
}

function claimFocusPanelSlot(panelOrId, slot, options = {}) {
  const panel = typeof panelOrId === 'string' ? document.getElementById(panelOrId) : panelOrId;
  const safeSlot = normalizeFocusPanelSlot(slot);
  if (!panel || !safeSlot) return false;
  panel.dataset.focusPanelSlot = safeSlot;
  if (options.closeFunction) panel.dataset.focusPanelClose = options.closeFunction;
  if (options.enforce !== false) enforceFocusPanelSlot(panel);
  return true;
}

function closeFocusModePanels(options = {}) {
  if (!isFocusPanelSlotModeActive() && options.force !== true) return;
  const slots = Array.isArray(options.slots) && options.slots.length
    ? options.slots.map(normalizeFocusPanelSlot).filter(Boolean)
    : ['center', 'left', 'right', 'top'];
  if (typeof window.clearFocusHoverIntent === 'function') {
    slots.forEach(slot => window.clearFocusHoverIntent(slot));
  }
  const panels = new Set(slots.flatMap(focusPanelSlotElements));
  panels.forEach(panel => {
    if (isFocusSlotPanelOpen(panel)) closeFocusPanelSlotPanel(panel);
  });
}

function isRestorableFocusElement(element) {
  if (!element || element === document.body || element === document.documentElement) return false;
  if (!element.isConnected || typeof element.focus !== 'function') return false;
  if (element.closest?.('[hidden], [aria-hidden="true"]')) return false;
  return true;
}

function isFieldLikeFocusElement(element) {
  if (!element) return false;
  const tagName = element.tagName;
  return Boolean(
    element.isContentEditable ||
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT'
  );
}

function focusTargetUsesPointerCursor(target) {
  let element = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
  while (element && element !== document.documentElement) {
    try {
      if (window.getComputedStyle(element).cursor === 'pointer') return true;
    } catch (error) {
    }
    element = element.parentElement;
  }
  return false;
}

function editorSelectionSnapshotForFocus(element) {
  const editor = document.getElementById('editor');
  if (
    !editor ||
    !editor.contains(element) ||
    typeof editorRangeToTextOffsets !== 'function' ||
    typeof isNodeInsideEditor !== 'function'
  ) {
    return null;
  }
  const selection = window.getSelection();
  const savedRange = typeof savedEditorRange !== 'undefined' ? savedEditorRange : null;
  let sourceRange = null;

  if (
    selection?.rangeCount &&
    isNodeInsideEditor(selection.anchorNode) &&
    isNodeInsideEditor(selection.focusNode)
  ) {
    sourceRange = selection.getRangeAt(0).cloneRange();
  } else if (
    savedRange &&
    isNodeInsideEditor(savedRange.startContainer) &&
    isNodeInsideEditor(savedRange.endContainer)
  ) {
    sourceRange = savedRange.cloneRange();
  } else {
    return {
      documentKey: typeof activeEditorStorageKey === 'function' ? activeEditorStorageKey() : '',
      start: 0,
      end: 0,
      scrollLeft: editor.scrollLeft || 0,
      scrollTop: editor.scrollTop || 0
    };
  }

  return editorRangeToTextOffsets(sourceRange, editor);
}

function captureFloatingFocusSnapshotFrom(element) {
  if (!isRestorableFocusElement(element)) return null;
  return {
    element,
    isFieldLike: isFieldLikeFocusElement(element),
    editorSnapshot: editorSelectionSnapshotForFocus(element),
    createdAt: Date.now()
  };
}

function floatingPanelSnapshotForElement(element) {
  if (!element) return null;
  const sourcePanel = floatingFocusPanelElements()
    .find(panel => panel.contains(element) && floatingPanelFocusSnapshots.has(panel));
  return sourcePanel ? floatingPanelFocusSnapshots.get(sourcePanel) : null;
}

function currentFloatingFocusSnapshot() {
  const activeSnapshot = captureFloatingFocusSnapshotFrom(document.activeElement);
  const recentPointerSnapshot = Date.now() - lastPointerFocusSnapshotAt < 900
    ? lastPointerFocusSnapshot
    : null;
  const activePanelSnapshot = floatingPanelSnapshotForElement(document.activeElement);
  const pointerPanelSnapshot = floatingPanelSnapshotForElement(recentPointerSnapshot?.element);

  if (pointerPanelSnapshot?.isFieldLike) return pointerPanelSnapshot;
  if (activePanelSnapshot?.isFieldLike) return activePanelSnapshot;
  if (recentPointerSnapshot?.isFieldLike) return recentPointerSnapshot;
  if (activeSnapshot?.isFieldLike) return activeSnapshot;
  if (pointerPanelSnapshot) return pointerPanelSnapshot;
  if (activePanelSnapshot) return activePanelSnapshot;
  return recentPointerSnapshot || activeSnapshot;
}

function prepareFloatingPanelFocusReturn(panelOrId) {
  const panel = typeof panelOrId === 'string' ? document.getElementById(panelOrId) : panelOrId;
  if (!panel || floatingPanelFocusSnapshots.has(panel)) return;
  const snapshot = currentFloatingFocusSnapshot();
  if (snapshot) floatingPanelFocusSnapshots.set(panel, snapshot);
  floatingPanelOpenStates.set(panel, true);
}

function discardFloatingPanelFocusReturn(panelOrId) {
  const panel = typeof panelOrId === 'string' ? document.getElementById(panelOrId) : panelOrId;
  if (!panel) return false;
  floatingPanelFocusSnapshots.delete(panel);
  floatingPanelCloseContexts.delete(panel);
  return true;
}

function restoreFloatingPanelFocusSnapshot(snapshot) {
  if (!snapshot) return false;
  if (
    snapshot.editorSnapshot &&
    typeof restoreEditorSelectionFromTextOffsets === 'function' &&
    restoreEditorSelectionFromTextOffsets(snapshot.editorSnapshot)
  ) {
    return true;
  }
  if (isRestorableFocusElement(snapshot.element)) {
    snapshot.element.focus({ preventScroll: true });
    if (
      snapshot.element instanceof HTMLInputElement ||
      snapshot.element instanceof HTMLTextAreaElement
    ) {
      const length = snapshot.element.value.length;
      snapshot.element.setSelectionRange?.(length, length);
    }
    return true;
  }
  return false;
}

function restoreFloatingPanelFocusReturn(panel) {
  const snapshot = floatingPanelFocusSnapshots.get(panel);
  floatingPanelFocusSnapshots.delete(panel);
  const closeContext = floatingPanelCloseContexts.get(panel);
  floatingPanelCloseContexts.delete(panel);

  if (!snapshot) return;
  if (closeContext?.reason === 'outside' && closeContext.usesPointerCursor) return;
  requestAnimationFrame(() => restoreFloatingPanelFocusSnapshot(snapshot));
}

function syncFloatingPanelFocusState(panel) {
  const isOpen = isFloatingFocusPanelOpen(panel);
  const wasOpen = Boolean(floatingPanelOpenStates.get(panel));
  if (isOpen && !wasOpen) {
    prepareFloatingPanelFocusReturn(panel);
  } else if (!isOpen && wasOpen) {
    floatingPanelOpenStates.set(panel, false);
    restoreFloatingPanelFocusReturn(panel);
  }
}

function initFloatingPanelFocusReturnSystem() {
  if (window.__lmFloatingPanelFocusReturnReady || !document.body) return;
  window.__lmFloatingPanelFocusReturnReady = true;

  document.addEventListener('pointerdown', event => {
    lastPointerFocusSnapshot = captureFloatingFocusSnapshotFrom(document.activeElement);
    lastPointerFocusSnapshotAt = Date.now();
    const usesPointerCursor = focusTargetUsesPointerCursor(event.target);
    floatingFocusPanelElements().forEach(panel => {
      if (!isFloatingFocusPanelOpen(panel) || panel.contains(event.target)) return;
      floatingPanelCloseContexts.set(panel, {
        reason: 'outside',
        usesPointerCursor,
        target: event.target,
        time: Date.now()
      });
    });
  }, true);

  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.type === 'attributes' && FLOATING_FOCUS_PANEL_IDS.includes(mutation.target.id)) {
        syncFloatingPanelFocusState(mutation.target);
      }
      if (mutation.type === 'attributes' && mutation.target.nodeType === Node.ELEMENT_NODE) {
        enforceFocusPanelSlot(mutation.target);
      }
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (FLOATING_FOCUS_PANEL_IDS.includes(node.id)) syncFloatingPanelFocusState(node);
        enforceFocusPanelSlot(node);
        node.querySelectorAll?.(FLOATING_FOCUS_PANEL_IDS.map(id => `#${id}`).join(','))
          .forEach(syncFloatingPanelFocusState);
        node.querySelectorAll?.('[data-focus-panel-slot], .is-focus-center-panel, .is-focus-left-panel, .is-focus-right-panel, .is-focus-top-panel')
          .forEach(enforceFocusPanelSlot);
      });
    });
  });
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['hidden', 'class', 'aria-hidden'],
    childList: true,
    subtree: true
  });
  floatingFocusPanelElements().forEach(syncFloatingPanelFocusState);
}

window.prepareFloatingPanelFocusReturn = prepareFloatingPanelFocusReturn;
window.discardFloatingPanelFocusReturn = discardFloatingPanelFocusReturn;
window.restoreFloatingPanelFocusReturn = restoreFloatingPanelFocusReturn;
window.claimFocusPanelSlot = claimFocusPanelSlot;
window.enforceFocusPanelSlot = enforceFocusPanelSlot;
window.closeFocusModePanels = closeFocusModePanels;
window.lmFocusPanelPositionDefaults = FOCUS_PANEL_POSITION_DEFAULTS;
window.lmFocusPanelPositionConfig = focusPanelPositionConfig;
window.lmFocusPanelNumber = focusPanelNumber;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFloatingPanelFocusReturnSystem, { once: true });
} else {
  initFloatingPanelFocusReturnSystem();
}
