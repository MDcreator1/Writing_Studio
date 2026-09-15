
function isNodeInsideEditor(node) {
  const editor = document.getElementById('editor');
  if (!editor || !node) return false;
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
  return Boolean(element && editor.contains(element));
}

function rememberEditorSelection() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !isNodeInsideEditor(selection.anchorNode)) return;
  savedEditorRange = selection.getRangeAt(0).cloneRange();
}

let editorFormattingSelectionRange = null;
let editorFormattingSelectionCapturedAt = 0;
const EDITOR_FORMATTING_SELECTION_GRACE_MS = lmEditorAdvancedNumber('formatSelectionGrace', 30000);

function isValidEditorFormattingRange(range) {
  return Boolean(
    range &&
    !range.collapsed &&
    isNodeInsideEditor(range.startContainer) &&
    isNodeInsideEditor(range.endContainer)
  );
}

function captureEditorFormattingSelection() {
  const selection = window.getSelection();
  editorFormattingSelectionRange = null;
  editorFormattingSelectionCapturedAt = 0;

  if (!selection || !selection.rangeCount || !isNodeInsideEditor(selection.anchorNode) || !isNodeInsideEditor(selection.focusNode)) {
    savedEditorRange = null;
    return false;
  }

  const range = selection.getRangeAt(0).cloneRange();
  savedEditorRange = range.cloneRange();
  if (!isValidEditorFormattingRange(range)) return false;

  editorFormattingSelectionRange = range.cloneRange();
  editorFormattingSelectionCapturedAt = Date.now();
  return true;
}

function restoreEditorSelection() {
  const editor = document.getElementById('editor');
  if (!editor) return false;

  editor.focus({ preventScroll: true });
  if (!savedEditorRange) return false;

  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(savedEditorRange);
  return true;
}

let findPanelReturnSelection = null;
let findPanelSearchAnchorSelection = null;
let findPanelLastReplacementSelection = null;
let shouldFocusFindCloseAfterReplaceClose = false;

function focusFindCloseButton(options = {}) {
  const button = document.getElementById('closeFindBtn');
  const findBar = document.getElementById('find-bar');
  if (!button || !findBar || findBar.hidden) return false;

  const focusButton = () => {
    if (findBar.hidden || button.disabled || button.hidden) return;
    button.focus({ preventScroll: true });
  };
  requestAnimationFrame(() => {
    focusButton();
    if (options.retry) requestAnimationFrame(focusButton);
  });
  return true;
}

function queueFindCloseFocusAfterReplaceClose() {
  shouldFocusFindCloseAfterReplaceClose = true;
}

function resolveFindCloseFocusAfterReplaceClose() {
  if (!shouldFocusFindCloseAfterReplaceClose) return;
  shouldFocusFindCloseAfterReplaceClose = false;
  focusFindCloseButton({ retry: true });
}

function editorRangeEndpointTextOffset(editor, container, offset) {
  if (!editor || !container || !isNodeInsideEditor(container)) return null;
  try {
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.setEnd(container, offset);
    const textOffset = range.toString().length;
    range.detach?.();
    return textOffset;
  } catch (error) {
    return null;
  }
}

function editorRangeToTextOffsets(range, editor = document.getElementById('editor')) {
  if (!range || !editor || !isNodeInsideEditor(range.startContainer) || !isNodeInsideEditor(range.endContainer)) return null;
  const start = editorRangeEndpointTextOffset(editor, range.startContainer, range.startOffset);
  const end = editorRangeEndpointTextOffset(editor, range.endContainer, range.endOffset);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return {
    documentKey: typeof activeEditorStorageKey === 'function' ? activeEditorStorageKey() : '',
    start: Math.max(0, Math.min(start, end)),
    end: Math.max(0, Math.max(start, end)),
    scrollLeft: editor.scrollLeft || 0,
    scrollTop: editor.scrollTop || 0
  };
}

function captureFindPanelReturnSelection() {
  const editor = document.getElementById('editor');
  const selection = window.getSelection();
  let sourceRange = null;

  if (
    selection?.rangeCount &&
    isNodeInsideEditor(selection.anchorNode) &&
    isNodeInsideEditor(selection.focusNode)
  ) {
    sourceRange = selection.getRangeAt(0).cloneRange();
  } else if (
    savedEditorRange &&
    isNodeInsideEditor(savedEditorRange.startContainer) &&
    isNodeInsideEditor(savedEditorRange.endContainer)
  ) {
    sourceRange = savedEditorRange.cloneRange();
  }

  findPanelReturnSelection = editorRangeToTextOffsets(sourceRange, editor);
  findPanelSearchAnchorSelection = findPanelReturnSelection ? { ...findPanelReturnSelection } : null;
  findPanelLastReplacementSelection = null;
}

function editorTextOffsetPosition(editor, targetOffset) {
  const safeOffset = Math.max(0, Number(targetOffset) || 0);
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.nodeValue ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  let consumed = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const length = node.nodeValue.length;
    if (safeOffset <= consumed + length) {
      return { container: node, offset: Math.max(0, safeOffset - consumed) };
    }
    consumed += length;
  }

  return { container: editor, offset: editor.childNodes.length };
}

function restoreEditorSelectionFromTextOffsets(snapshot) {
  const editor = document.getElementById('editor');
  if (!editor || !snapshot) return false;
  if (
    snapshot.documentKey &&
    typeof activeEditorStorageKey === 'function' &&
    snapshot.documentKey !== activeEditorStorageKey()
  ) {
    return false;
  }

  const start = editorTextOffsetPosition(editor, snapshot.start);
  const end = editorTextOffsetPosition(editor, snapshot.end);
  const range = document.createRange();
  range.setStart(start.container, start.offset);
  range.setEnd(end.container, end.offset);
  editor.focus({ preventScroll: true });
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  editor.scrollLeft = snapshot.scrollLeft || 0;
  if (typeof markEditorProgrammaticScrollEvent === 'function') markEditorProgrammaticScrollEvent();
  editor.scrollTop = snapshot.scrollTop || 0;
  savedEditorRange = range.cloneRange();
  updateFormattingButtons({ syncFromSelection: false });
  return true;
}

function ensureEditorRichFormattingMode(preferredRange = null) {
  const editor = document.getElementById('editor');
  if (!editor || !isEditorPlainTextMode(editor)) return preferredRange;

  if (activeVirtualEditorDocument && !activeVirtualEditorDocument.temporarilyMaterialized &&
      typeof applyTemporaryVirtualEditorFullDOM === 'function') {
    applyTemporaryVirtualEditorFullDOM(activeVirtualEditorDocument, editor, 'formatting');
    preferredRange = null;
  }

  let sourceRange = preferredRange;
  if (!sourceRange || !isNodeInsideEditor(sourceRange.startContainer) || !isNodeInsideEditor(sourceRange.endContainer)) {
    const selection = window.getSelection();
    if (selection?.rangeCount && isNodeInsideEditor(selection.anchorNode) && isNodeInsideEditor(selection.focusNode)) {
      sourceRange = selection.getRangeAt(0).cloneRange();
    } else if (savedEditorRange && isNodeInsideEditor(savedEditorRange.startContainer) && isNodeInsideEditor(savedEditorRange.endContainer)) {
      sourceRange = savedEditorRange.cloneRange();
    }
  }

  const selectionSnapshot = sourceRange ? editorRangeToTextOffsets(sourceRange, editor) : null;
  const sourceText = activeVirtualEditorDocument
    ? editorHTMLToText(activeEditorHTMLBuffer || activeVirtualEditorDocument.html || '')
    : cleanPlainTextEditorValue(editor);
  const richHTML = sourceText.trim() ? textToEditorHTML(sourceText) : '';

  if (activeVirtualEditorDocument && typeof clearVirtualEditorDocument === 'function') clearVirtualEditorDocument();
  setEditorRenderMode(editor, 'rich');
  editor.innerHTML = richHTML || '<p><br></p>';
  normalizeEditorGapMarkers(editor);
  if (typeof normalizeEditorParagraphBlocks === 'function') normalizeEditorParagraphBlocks(editor);
  syncEditorPlaceholderState();

  if (!selectionSnapshot || !restoreEditorSelectionFromTextOffsets(selectionSnapshot)) return null;
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const restoredRange = selection.getRangeAt(0).cloneRange();
  savedEditorRange = restoredRange.cloneRange();
  if (!restoredRange.collapsed) {
    editorFormattingSelectionRange = restoredRange.cloneRange();
    editorFormattingSelectionCapturedAt = Date.now();
  }
  return restoredRange;
}

function syncSavedEditorRangeFromTextOffsets(snapshot) {
  const editor = document.getElementById('editor');
  if (!editor || !snapshot) return false;
  if (
    snapshot.documentKey &&
    typeof activeEditorStorageKey === 'function' &&
    snapshot.documentKey !== activeEditorStorageKey()
  ) {
    return false;
  }

  const start = editorTextOffsetPosition(editor, snapshot.start);
  const end = editorTextOffsetPosition(editor, snapshot.end);
  const range = document.createRange();
  range.setStart(start.container, start.offset);
  range.setEnd(end.container, end.offset);
  savedEditorRange = range.cloneRange();
  return true;
}

function restoreFindPanelReturnSelection() {
  const snapshot = findPanelReturnSelection;
  findPanelReturnSelection = null;
  findPanelSearchAnchorSelection = null;
  findPanelLastReplacementSelection = null;
  if (typeof discardFloatingPanelFocusReturn === 'function') {
    discardFloatingPanelFocusReturn('find-bar');
  }
  return restoreEditorSelectionFromTextOffsets(snapshot);
}

function positionFocusFloatingPanelAtEditorCenter(panel, options = {}) {
  const editor = document.getElementById('editor');
  if (!isFocus || !panel || !editor) return false;

  const editorRect = editor.getBoundingClientRect();
  const fixed = options.fixed ?? window.getComputedStyle(panel).position === 'fixed';
  const padding = options.padding ?? 12;
  const panelWidth = panel.offsetWidth || panel.getBoundingClientRect().width || 320;
  const panelHeight = panel.offsetHeight || panel.getBoundingClientRect().height || 120;

  if (fixed) {
    const left = clampNumber(
      editorRect.left + editorRect.width / 2 - panelWidth / 2,
      padding,
      Math.max(padding, window.innerWidth - panelWidth - padding)
    );
    const top = clampNumber(
      editorRect.top + editorRect.height / 2 - panelHeight / 2,
      padding,
      Math.max(padding, window.innerHeight - panelHeight - padding)
    );
    panel.style.position = 'fixed';
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  } else {
    const editorArea = document.getElementById('editor-area');
    if (!editorArea) return false;
    const areaRect = editorArea.getBoundingClientRect();
    const left = clampNumber(
      editorRect.left - areaRect.left + editorRect.width / 2 - panelWidth / 2,
      padding,
      Math.max(padding, editorArea.clientWidth - panelWidth - padding)
    );
    const top = clampNumber(
      editorRect.top - areaRect.top + editorRect.height / 2 - panelHeight / 2,
      padding,
      Math.max(padding, editorArea.clientHeight - panelHeight - padding)
    );
    panel.style.position = 'absolute';
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  }

  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.transform = 'none';
  return true;
}

function queryInlineFormatState(command) {
  try {
    return Boolean(document.queryCommandState(command));
  } catch (error) {
    return false;
  }
}

function fmt(cmd) {
  if (!(cmd in activeInlineFormats)) return;
  if (!canEditActiveDocument()) return;
  ensureEditorRichFormattingMode(savedEditorRange);
  restoreEditorSelection();
  const wasActive = activeInlineFormats[cmd] || queryInlineFormatState(cmd);
  document.execCommand(cmd, false, null);
  activeInlineFormats[cmd] = !wasActive;
  inlineFormatSyncLockedUntil = Date.now() + 350;
  rememberEditorSelection();
  updateFormattingButtons({ syncFromSelection: false });
  updateStats();
  saveSelectionScopedEditorFormat(`inline-${cmd}`);
  document.getElementById('editor').focus({ preventScroll: true });
}

function updateFormattingButtons(options = {}) {
  const shouldSyncFromSelection = options.syncFromSelection !== false;
  const selection = window.getSelection();
  const isEditorSelection = selection && selection.rangeCount && isNodeInsideEditor(selection.anchorNode);
  if (isEditorSelection) rememberEditorSelection();

  const formatButtons = {
    bold: document.getElementById('boldBtn'),
    italic: document.getElementById('italicBtn'),
    underline: document.getElementById('underlineBtn')
  };

  if (
    shouldSyncFromSelection &&
    Date.now() > inlineFormatSyncLockedUntil &&
    isEditorSelection &&
    document.activeElement === document.getElementById('editor')
  ) {
    Object.keys(activeInlineFormats).forEach(command => {
      activeInlineFormats[command] = queryInlineFormatState(command);
    });
  }

  Object.entries(formatButtons).forEach(([command, button]) => {
    if (!button) return;
    const isActive = Boolean(activeInlineFormats[command]);
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

const FOCUS_EDITOR_WIDTH_STORAGE_KEY = 'lm_focus_editor_width_percent';
const FOCUS_EDITOR_WIDTH_MIN_VW = lmEditorAdvancedNumber('focusWidthMin', 30);
const FOCUS_EDITOR_WIDTH_MAX_VW = lmEditorAdvancedNumber('focusWidthMax', 90);
const FOCUS_EDITOR_WIDTH_DEFAULT_PERCENT = lmEditorAdvancedNumber('focusWidthDefault', 67);
const FOCUS_STATS_HIDE_DELAY_MS = lmEditorAdvancedNumber('focusStatsHide', 4000);

let focusStatsHideTimer = null;
let lastFocusStatsScrollTop = 0;

function isEditorShortcutActive() {
  const editor = document.getElementById('editor');
  const findBar = document.getElementById('find-bar');
  const toolDock = document.getElementById('floating-tools');
  if (!editor) return false;
  const activeElement = document.activeElement;
  return activeElement === editor ||
    editor.contains(activeElement) ||
    Boolean(toolDock?.contains(activeElement)) ||
    (isFindOpen && Boolean(findBar?.contains(activeElement)));
}

function isMainEditorFocused() {
  const editor = document.getElementById('editor');
  const activeElement = document.activeElement;
  return Boolean(editor && (activeElement === editor || editor.contains(activeElement)));
}

function hasRetainedMainEditorSelection() {
  const selection = window.getSelection();
  if (
    selection?.rangeCount &&
    !selection.isCollapsed &&
    isNodeInsideEditor(selection.anchorNode) &&
    isNodeInsideEditor(selection.focusNode)
  ) return true;
  return Boolean(
    savedEditorRange &&
    !savedEditorRange.collapsed &&
    isNodeInsideEditor(savedEditorRange.startContainer) &&
    isNodeInsideEditor(savedEditorRange.endContainer)
  );
}

function isEditorEditingShortcutActive() {
  return Boolean(canEditActiveDocument() && (isMainEditorFocused() || hasRetainedMainEditorSelection()));
}

function shortcutKey(event) {
  const key = (event.key || '').toLowerCase();
  if (key && key.length === 1 && /^[a-z]$/.test(key)) return key;
  const code = (event.code || '').toLowerCase();
  return code.startsWith('key') ? code.slice(3) : key;
}

function normalizeFocusEditorWidthPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return FOCUS_EDITOR_WIDTH_DEFAULT_PERCENT;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function focusEditorWidthFromPercent(percent) {
  const safePercent = normalizeFocusEditorWidthPercent(percent);
  const widthRange = FOCUS_EDITOR_WIDTH_MAX_VW - FOCUS_EDITOR_WIDTH_MIN_VW;
  return FOCUS_EDITOR_WIDTH_MIN_VW + (safePercent / 100) * widthRange;
}

function storedFocusEditorWidthPercent() {
  const storedValue = localStorage.getItem(FOCUS_EDITOR_WIDTH_STORAGE_KEY);
  return storedValue === null
    ? FOCUS_EDITOR_WIDTH_DEFAULT_PERCENT
    : normalizeFocusEditorWidthPercent(storedValue);
}

function setFocusEditorWidthPercent(value, options = {}) {
  const percent = normalizeFocusEditorWidthPercent(value);
  const width = focusEditorWidthFromPercent(percent);
  const widthText = `${Number(width.toFixed(1))}vw`;
  const range = document.getElementById('focusWidthRange');
  const label = document.getElementById('focusWidthPercent');

  document.documentElement.style.setProperty('--focus-editor-width', widthText);
  if (range) {
    range.value = String(percent);
    range.setAttribute('aria-valuetext', `${percent}% (${Math.round(width)}% viewport width)`);
  }
  if (label) label.textContent = `${percent}%`;
  if (options.persist !== false) localStorage.setItem(FOCUS_EDITOR_WIDTH_STORAGE_KEY, String(percent));
  requestAnimationFrame(() => {
    if (typeof renderFindMarkerRail === 'function') renderFindMarkerRail();
    if (typeof scheduleEditorAutoScrollDepthMarkerReposition === 'function') {
      scheduleEditorAutoScrollDepthMarkerReposition();
    } else if (typeof positionEditorAutoScrollDepthMarker === 'function') {
      positionEditorAutoScrollDepthMarker();
    }
    if (typeof updateEditorScrollThumb === 'function') {
      updateEditorScrollThumb(document.getElementById('editor')?.classList.contains('is-scrolling'));
    }
  });
}

function initFocusEditorWidthControl() {
  const range = document.getElementById('focusWidthRange');
  setFocusEditorWidthPercent(storedFocusEditorWidthPercent(), { persist: false });
  if (!range || range.dataset.widthControlBound === 'true') return;
  range.dataset.widthControlBound = 'true';
  range.addEventListener('input', () => setFocusEditorWidthPercent(range.value));
}

function hideFocusScrollStats() {
  clearTimeout(focusStatsHideTimer);
  focusStatsHideTimer = null;
  document.getElementById('editor-wrap')?.classList.remove('is-focus-scroll-stats-visible');
}

function syncFocusScrollStatsBaseline(editor = document.getElementById('editor')) {
  lastFocusStatsScrollTop = editor ? editor.scrollTop || 0 : 0;
}

function hasVisibleFocusStats() {
  return EDITOR_STAT_KEYS.some(statusKey => visibleEditorStatuses[statusKey]);
}

function revealFocusScrollStats(editor) {
  const wrap = document.getElementById('editor-wrap');
  if (!wrap || !editor || !isFocus || !hasVisibleFocusStats()) {
    hideFocusScrollStats();
    return;
  }

  updateStats();
  wrap.classList.add('is-focus-scroll-stats-visible');
  clearTimeout(focusStatsHideTimer);
  focusStatsHideTimer = setTimeout(hideFocusScrollStats, FOCUS_STATS_HIDE_DELAY_MS);
}

function handleFocusScrollStatsReveal(editor) {
  if (!editor) return;
  const currentScrollTop = editor.scrollTop || 0;
  const isScrollingUp = currentScrollTop < lastFocusStatsScrollTop - 1;
  const isScrollingDown = currentScrollTop > lastFocusStatsScrollTop + 1;

  lastFocusStatsScrollTop = currentScrollTop;

  if (!isFocus) {
    hideFocusScrollStats();
    return;
  }

  if (isScrollingUp) {
    revealFocusScrollStats(editor);
  } else if (isScrollingDown) {
    hideFocusScrollStats();
  }
}

function handleEditorShortcutGuard(event) {
  const key = shortcutKey(event);
  const isCommandKey = event.ctrlKey || event.metaKey;
  const formatCommandByKey = {
    b: 'bold',
    i: 'italic',
    u: 'underline'
  };

  if (typeof handleEditorHistoryShortcut === 'function' && handleEditorHistoryShortcut(event)) {
    return true;
  }

  // Finding always targets the main editor, but its keyboard entry point is
  // page-global so the editor does not need to own focus first.
  if (isCommandKey && key === 'f' && !event.altKey) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (isTrashDraftActive()) return true;
    if (isFindOpen) {
      setFindPanel(false);
    } else {
      openFindPanel();
    }
    return true;
  }

  if (
    event.altKey &&
    !isCommandKey &&
    typeof handleNamingCategoryShortcut === 'function' &&
    handleNamingCategoryShortcut(event, key)
  ) {
    return true;
  }

  if (isCommandKey && key === 'h' && !event.altKey) {
    if (!isEditorEditingShortcutActive()) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (isFindOpen && isReplaceOpen) {
      setFindPanel(false);
      return true;
    }
    openFindReplacePanel({ allowSavedRange: false });
    return true;
  }

  if (isCommandKey && key === 's' && !event.altKey) {
    if (!isEditorShortcutActive()) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    manualSave();
    return true;
  }

  if (isCommandKey && formatCommandByKey[key] && !event.altKey && isEditorEditingShortcutActive()) {
    event.preventDefault();
    event.stopImmediatePropagation();
    fmt(formatCommandByKey[key]);
    return true;
  }

  if (!isCommandKey && !event.altKey && key === 'f10') {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (Boolean(isDraftTrashMode) || isTrashDraftActive()) return true;
    toggleFocus();
    return true;
  }

  if (!isEditorShortcutActive()) return false;

  const nativeEditorKeys = new Set(['a', 'c', 'v', 'x', 'z', 'y']);
  if (isCommandKey && nativeEditorKeys.has(key) && !event.altKey) return false;

  const isBrowserFunctionKey = ['f1', 'f3', 'f5', 'f6', 'f7', 'f10', 'f11', 'f12'].includes(key);
  const isBrowserAltNav = event.altKey && ['arrowleft', 'arrowright', 'home'].includes(key);
  if (isCommandKey || isBrowserFunctionKey || isBrowserAltNav) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  return false;
}

function editorFormattingRange() {
  const editor = document.getElementById('editor');
  if (!editor) return null;
  const selection = window.getSelection();
  if (
    !selection ||
    !selection.rangeCount ||
    selection.isCollapsed ||
    !isNodeInsideEditor(selection.anchorNode) ||
    !isNodeInsideEditor(selection.focusNode)
  ) {
    if (
      isValidEditorFormattingRange(editorFormattingSelectionRange) &&
      Date.now() - editorFormattingSelectionCapturedAt <= EDITOR_FORMATTING_SELECTION_GRACE_MS
    ) {
      let range = editorFormattingSelectionRange.cloneRange();
      range = ensureEditorRichFormattingMode(range) || range;
      editor.focus({ preventScroll: true });
      const nextSelection = window.getSelection();
      nextSelection?.removeAllRanges();
      nextSelection?.addRange(range);
      return range;
    }
    return null;
  }

  let range = selection.getRangeAt(0).cloneRange();
  range = ensureEditorRichFormattingMode(range) || range;
  return range.collapsed ? null : range;
}

function editorNodeIntersectsRange(range, node) {
  try {
    return range.intersectsNode(node);
  } catch (error) {
    return false;
  }
}

function closestEditorParagraphBlock(node, editor = document.getElementById('editor')) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  const block = element?.closest?.('p, div, li, blockquote, h1, h2, h3, h4, h5, h6');
  return block && editor?.contains(block) && !isEditorParagraphGapNode(block) ? block : null;
}

function selectedEditorParagraphBlocks(range, editor = document.getElementById('editor')) {
  if (!range || !editor) return [];
  if (typeof normalizeEditorParagraphBlocks === 'function') normalizeEditorParagraphBlocks(editor);
  const blockSelector = 'p, div, li, blockquote, h1, h2, h3, h4, h5, h6';
  const blocks = Array.from(editor.querySelectorAll(blockSelector))
    .filter(block => !isEditorParagraphGapNode(block) && editorNodeIntersectsRange(range, block));
  if (blocks.length) return blocks;
  const fallbackBlock = closestEditorParagraphBlock(range.startContainer, editor);
  return fallbackBlock ? [fallbackBlock] : [];
}

function saveSelectionScopedEditorFormat(reason = 'selection-format') {
  const editor = document.getElementById('editor');
  if (!editor) return;
  if (typeof syncActiveEditorDocumentFromEditor === 'function') syncActiveEditorDocumentFromEditor();
  const activeDocument = typeof activeEditorDocument === 'function' ? activeEditorDocument() : null;
  if (activeDocument && typeof editorDocumentRichContentForStorage === 'function') {
    activeDocument.richContentHTML = editorDocumentRichContentForStorage(activeDocument);
  }
  syncEditorPlaceholderState();
  rememberEditorSelection();
  updateFormattingButtons({ syncFromSelection: false });
  updateStats();
  if (typeof flushEditorHistorySnapshot === 'function') flushEditorHistorySnapshot(reason);
  persistActiveDocumentSettings();
  editor.focus({ preventScroll: true });
}

function applyEditorBlockStylesToSelection(styles, reason = 'selection-block-format') {
  const editor = document.getElementById('editor');
  const range = editorFormattingRange();
  const blocks = selectedEditorParagraphBlocks(range, editor);
  if (!blocks.length) return false;

  blocks.forEach(block => {
    Object.entries(styles).forEach(([property, value]) => {
      if (value === null || value === undefined || value === '') block.style.removeProperty(property);
      else block.style.setProperty(property, String(value));
    });
    if (!block.getAttribute('style')) block.removeAttribute('style');
  });

  saveSelectionScopedEditorFormat(reason);
  return true;
}

function selectedEditorTextSegments(range, editor = document.getElementById('editor')) {
  if (!range || !editor) return [];
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !editorNodeIntersectsRange(range, node)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const segments = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const length = node.nodeValue.length;
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : length;
    const safeStart = clampNumber(start, 0, length);
    const safeEnd = clampNumber(end, 0, length);
    if (safeEnd > safeStart) segments.push({ node, start: safeStart, end: safeEnd });
  }
  return segments;
}

function wrapEditorTextSegment(segment, styles) {
  let targetNode = segment.node;
  if (!targetNode?.parentNode) return null;
  if (segment.end < targetNode.nodeValue.length) targetNode.splitText(segment.end);
  if (segment.start > 0) targetNode = targetNode.splitText(segment.start);

  const span = document.createElement('span');
  span.className = 'editor-inline-format';
  Object.entries(styles).forEach(([property, value]) => {
    if (value !== null && value !== undefined && value !== '') span.style.setProperty(property, String(value));
  });
  targetNode.parentNode.insertBefore(span, targetNode);
  span.appendChild(targetNode);
  return span;
}

function applyEditorInlineStylesToSelection(styles, reason = 'selection-inline-format') {
  const editor = document.getElementById('editor');
  const range = editorFormattingRange();
  const segments = selectedEditorTextSegments(range, editor);
  if (!segments.length) return false;

  segments.reverse().forEach(segment => wrapEditorTextSegment(segment, styles));
  saveSelectionScopedEditorFormat(reason);
  return true;
}

function applyEditorParagraphGapToSelection(paragraphGap) {
  const editor = document.getElementById('editor');
  const range = editorFormattingRange();
  const blocks = selectedEditorParagraphBlocks(range, editor);
  if (blocks.length < 2) return false;

  const safeParagraphGap = normalizeEditorParagraphGap(paragraphGap);
  blocks.slice(0, -1).forEach((block, index) => {
    if (safeParagraphGap) block.style.setProperty('--editor-selection-paragraph-gap', `${safeParagraphGap}lh`);
    else block.style.removeProperty('--editor-selection-paragraph-gap');
    if (!block.getAttribute('style')) block.removeAttribute('style');
  });

  saveSelectionScopedEditorFormat('selection-paragraph-gap');
  return true;
}

function unwrapEmptyEditorInlineFormatSpans(root) {
  root?.querySelectorAll?.('span.editor-inline-format').forEach(span => {
    if (span.getAttribute('style')) return;
    span.replaceWith(...Array.from(span.childNodes));
  });
}

function clearEditorScopedStyleProperties(properties = []) {
  const editor = document.getElementById('editor');
  if (!editor || !properties.length) return false;
  let changed = false;
  editor.querySelectorAll('[style]').forEach(node => {
    properties.forEach(property => {
      if (!node.style.getPropertyValue(property)) return;
      node.style.removeProperty(property);
      changed = true;
    });
    if (!node.getAttribute('style')) node.removeAttribute('style');
  });
  unwrapEmptyEditorInlineFormatSpans(editor);
  return changed;
}

function clearEditorBlockAlignment(editor) {
  let changed = false;
  editor.querySelectorAll('[align], [style]').forEach(node => {
    if (node.hasAttribute('align')) {
      node.removeAttribute('align');
      changed = true;
    }
    if (node.style && node.style.textAlign) {
      node.style.textAlign = '';
      changed = true;
      if (!node.getAttribute('style')) node.removeAttribute('style');
    }
  });
  return changed;
}

function applyEditorAlignment(alignment, options = {}) {
  const editor = document.getElementById('editor');
  if (!editor) return false;
  const safeAlignment = normalizeEditorAlignment(alignment);
  const clearedStyles = options.clearSelectionScopedStyles ? clearEditorBlockAlignment(editor) : false;
  const nextAlignment = safeAlignment === 'justify' ? 'justify' : safeAlignment;
  const previousAlignment = editor.style.getPropertyValue('--editor-text-align');
  editor.style.setProperty('--editor-text-align', safeAlignment === 'justify' ? 'justify' : safeAlignment);
  updateAlignmentButtons(safeAlignment);
  return clearedStyles || previousAlignment !== nextAlignment;
}

function applyEditorFontFamily(fontFamily, options = {}) {
  const editor = document.getElementById('editor');
  const select = document.getElementById('fontSel');
  const safeFontFamily = normalizeEditorFontFamily(fontFamily);
  const clearedStyles = options.clearSelectionScopedStyles ? clearEditorScopedStyleProperties(['font-family']) : false;
  const previousFontFamily = editor?.style.getPropertyValue('--editor-font-family') || '';
  if (editor) editor.style.setProperty('--editor-font-family', safeFontFamily);
  if (select) select.value = safeFontFamily;
  syncDockSelect('fontSel');
  return clearedStyles || previousFontFamily !== safeFontFamily;
}

function applyEditorFontSize(fontSize, options = {}) {
  const editor = document.getElementById('editor');
  const input = document.getElementById('fsize');
  const safeFontSize = normalizeEditorFontSize(fontSize);
  const clearedStyles = options.clearSelectionScopedStyles ? clearEditorScopedStyleProperties(['font-size']) : false;
  const previousFontSize = editor?.style.getPropertyValue('--editor-font-size') || '';
  if (editor) editor.style.setProperty('--editor-font-size', `${safeFontSize}px`);
  if (input) input.value = String(safeFontSize);
  return clearedStyles || previousFontSize !== `${safeFontSize}px`;
}

function updateAlignmentButtons(alignment) {
  const safeAlignment = normalizeEditorAlignment(alignment);
  const dockButtons = { left: 'aL', center: 'aC', right: 'aR', justify: 'aJ' };

  Object.entries(dockButtons).forEach(([buttonAlignment, id]) => {
    document.getElementById(id)?.classList.toggle('active', buttonAlignment === safeAlignment);
  });
}

function activeMutableEditorDocumentForChange() {
  if (!isDraftActive() && isChapterEditUnlocked && !isChapterEditDraftActive()) {
    return materializeChapterEditDraftForChange();
  }
  return activeEditorDocument();
}

function align(alignment) {
  if (!canEditActiveDocument()) return;
  const safeAlignment = normalizeEditorAlignment(alignment);
  if (applyEditorBlockStylesToSelection({ 'text-align': safeAlignment }, 'selection-alignment')) {
    updateAlignmentButtons(safeAlignment);
    return;
  }
  ensureChapters();
  const currentDocument = activeEditorDocument();
  if (currentDocument && normalizeEditorAlignment(currentDocument.alignment) === safeAlignment) {
    const changed = applyEditorAlignment(safeAlignment, { clearSelectionScopedStyles: true });
    rememberEditorSelection();
    if (changed) {
      updateStats();
      if (typeof flushEditorHistorySnapshot === 'function') flushEditorHistorySnapshot('alignment');
      persistActiveDocumentSettings();
    }
    document.getElementById('editor').focus({ preventScroll: true });
    return;
  }
  const documentItem = activeMutableEditorDocumentForChange();
  if (documentItem) documentItem.alignment = safeAlignment;
  const changed = applyEditorAlignment(safeAlignment, { clearSelectionScopedStyles: true });
  rememberEditorSelection();
  updateStats();
  if (changed && typeof flushEditorHistorySnapshot === 'function') flushEditorHistorySnapshot('alignment');
  persistActiveDocumentSettings();
  document.getElementById('editor').focus({ preventScroll: true });
}

function isEditorParagraphBlockElement(node) {
  return node?.nodeType === Node.ELEMENT_NODE &&
    ['P', 'DIV', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.tagName);
}

function isEditorParagraphGapNode(node) {
  return node?.nodeType === Node.ELEMENT_NODE &&
    node.classList.contains(EDITOR_PARAGRAPH_GAP_BR_CLASS);
}

function resetEditorParagraphGapNode(gapNode) {
  if (!gapNode || gapNode.nodeType !== Node.ELEMENT_NODE) return;
  gapNode.classList.remove(EDITOR_PARAGRAPH_GAP_BR_CLASS);
  delete gapNode.dataset.editorParagraphGap;
  gapNode.removeAttribute('aria-hidden');
}

function normalizeMaterializedEditorParagraphGapNodes(editor) {
  editor?.querySelectorAll(`p.${EDITOR_PARAGRAPH_GAP_BR_CLASS}`).forEach(gapNode => {
    if (isEditorVisuallyEmpty(gapNode)) {
      gapNode.dataset.editorParagraphGap = 'true';
      gapNode.setAttribute('aria-hidden', 'true');
      if (!gapNode.childNodes.length) gapNode.appendChild(document.createElement('br'));
      return;
    }
    resetEditorParagraphGapNode(gapNode);
  });
}

function normalizeEditorParagraphBlocks(editor) {
  if (!editor || isEditorVisuallyEmpty(editor)) return;
  normalizeEditorGapMarkers(editor);
  normalizeMaterializedEditorParagraphGapNodes(editor);

  const inlineNodes = [];
  let changed = false;

  const flushInlineNodes = beforeNode => {
    if (!inlineNodes.length) return;
    const hasMeaningfulContent = inlineNodes.some(node => {
      if (node.nodeType === Node.TEXT_NODE) return Boolean(node.nodeValue && node.nodeValue.trim());
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') return true;
      return node.nodeType === Node.ELEMENT_NODE && !isEditorVisuallyEmpty(node);
    });
    if (!hasMeaningfulContent) {
      inlineNodes.splice(0).forEach(node => node.remove());
      changed = true;
      return;
    }

    const paragraph = document.createElement('p');
    inlineNodes.splice(0).forEach(node => paragraph.appendChild(node));
    if (!paragraph.childNodes.length) paragraph.appendChild(document.createElement('br'));
    editor.insertBefore(paragraph, beforeNode || null);
    changed = true;
  };

  Array.from(editor.childNodes).forEach(node => {
    if (isEditorParagraphBlockElement(node) || isEditorParagraphGapNode(node)) {
      flushInlineNodes(node);
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains(EDITOR_FILE_GAP_BR_CLASS)) {
      flushInlineNodes(node);
      return;
    }

    inlineNodes.push(node);
  });
  flushInlineNodes(null);
  if (changed) editor.normalize();
  normalizeMaterializedEditorParagraphGapNodes(editor);
}

function isEditorInterParagraphGapNode(node) {
  if (!node) return false;
  if (node.nodeType === Node.TEXT_NODE) return !node.textContent.trim();
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  if (node.tagName === 'BR') return true;
  if (node.classList.contains(EDITOR_PARAGRAPH_GAP_BR_CLASS)) return true;
  if (node.classList.contains(EDITOR_FILE_GAP_BR_CLASS)) return true;
  return isEditorBlockElement(node) && isEditorVisuallyEmpty(node);
}

function isEditorContentNode(node) {
  if (!node) return false;
  if (node.nodeType === Node.TEXT_NODE) return Boolean(node.textContent.trim());
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  if (node.tagName === 'BR') return false;
  if (node.classList.contains(EDITOR_PARAGRAPH_GAP_BR_CLASS)) return false;
  if (node.classList.contains(EDITOR_FILE_GAP_BR_CLASS)) return false;
  return !isEditorVisuallyEmpty(node);
}

function removeEditorInterParagraphEmptyLines(editor) {
  if (!editor) return;
  normalizeEditorGapMarkers(editor);
  Array.from(editor.childNodes).forEach(node => {
    if (isEditorInterParagraphGapNode(node)) {
      node.remove();
    }
  });
}

function detectEditorParagraphGap(editor) {
  if (!editor || isEditorVisuallyEmpty(editor)) return 0;
  normalizeEditorGapMarkers(editor);

  let hasPreviousContent = false;
  let currentGap = 0;
  let detectedGap = 0;

  Array.from(editor.childNodes).forEach(node => {
    if (isEditorContentNode(node)) {
      if (hasPreviousContent) detectedGap = Math.max(detectedGap, currentGap);
      hasPreviousContent = true;
      currentGap = 0;
      return;
    }
    if (hasPreviousContent && isEditorInterParagraphGapNode(node)) {
      currentGap += editorGapLineValue(node);
    }
  });

  return normalizeEditorParagraphGap(detectedGap);
}

function getEditorParagraphBlocks(editor) {
  return Array.from(editor?.children || []).filter(child => (
    isEditorParagraphBlockElement(child) &&
    !isEditorParagraphGapNode(child) &&
    !isEditorVisuallyEmpty(child)
  ));
}

function applyEditorParagraphGapBreaks(editor, paragraphGap, options = {}) {
  if (!editor || isEditorVisuallyEmpty(editor)) return;
  const breakCount = normalizeEditorParagraphGap(paragraphGap);
  if (options.normalizePlainText !== false) normalizeEditorParagraphBlocks(editor);
  removeEditorInterParagraphEmptyLines(editor);
  if (!breakCount) return;

  const blocks = getEditorParagraphBlocks(editor);
  if (blocks.length < 2) return;

  blocks.slice(0, -1).forEach((block, index) => {
    const nextBlock = blocks[index + 1];
    for (let count = 0; count < breakCount; count += 1) {
      editor.insertBefore(createEditorParagraphGapNode(), nextBlock);
    }
  });
}

function syncCurrentEditorParagraphGapBreaks() {
  const editor = document.getElementById('editor');
  if (!editor) return;
  normalizeEditorParagraphBlocks(editor);
  normalizeMaterializedEditorParagraphGapNodes(editor);
  syncEditorPlaceholderState();
}

function handleEditorParagraphGapInput(event) {
  const editor = document.getElementById('editor');
  if (typeof isEditorPlainTextMode === 'function' && isEditorPlainTextMode(editor)) return;
  if (typeof scheduleEditorDeferredHeavyOperation === 'function') {
    scheduleEditorDeferredHeavyOperation('paragraphGap', syncCurrentEditorParagraphGapBreaks);
    return;
  }
  requestAnimationFrame(syncCurrentEditorParagraphGapBreaks);
}

function applyEditorSpacing(lineHeight, paragraphGap, paragraphMargin, options = {}) {
  const editor = document.getElementById('editor');
  if (!editor) return;
  const plainTextMode = typeof isEditorPlainTextMode === 'function' && isEditorPlainTextMode(editor);
  const hasLineHeightValue = !isDockSpacingValueUnset(lineHeight);
  const hasParagraphGapValue = !isDockSpacingValueUnset(paragraphGap);
  const hasParagraphMarginValue = !isDockSpacingValueUnset(paragraphMargin);
  const safeLineHeight = hasLineHeightValue ? normalizeEditorLineHeight(lineHeight) : null;
  const safeParagraphGap = hasParagraphGapValue ? normalizeEditorParagraphGap(paragraphGap) : null;
  const safeParagraphMargin = hasParagraphMarginValue ? normalizeEditorParagraphMargin(paragraphMargin) : null;
  if (hasLineHeightValue) editor.style.setProperty('--editor-line-height', String(safeLineHeight));
  else editor.style.removeProperty('--editor-line-height');
  if (hasParagraphMarginValue && !plainTextMode) editor.style.setProperty('--editor-paragraph-margin', `${safeParagraphMargin}px`);
  else editor.style.removeProperty('--editor-paragraph-margin');
  if (hasParagraphMarginValue && safeParagraphMargin > 0 && !plainTextMode) normalizeEditorParagraphBlocks(editor);
  if (options.applyParagraphGap !== false) {
    if (plainTextMode && typeof applyPlainTextParagraphGapToEditor === 'function') {
      applyPlainTextParagraphGapToEditor(editor, hasParagraphGapValue ? safeParagraphGap : 0);
    } else {
      applyEditorParagraphGapBreaks(editor, hasParagraphGapValue ? safeParagraphGap : 0);
    }
  }
  const lineSelect = document.getElementById('lineSpacingSel');
  const paragraphSelect = document.getElementById('paragraphGapSel');
  const paragraphMarginSelect = document.getElementById('paragraphMarginSel');
  if (lineSelect) lineSelect.value = hasLineHeightValue ? String(safeLineHeight) : '';
  if (paragraphSelect) paragraphSelect.value = hasParagraphGapValue ? String(safeParagraphGap) : '';
  if (paragraphMarginSelect) setParagraphMarginSelectValue(hasParagraphMarginValue ? safeParagraphMargin : null);
  syncDockSelect('lineSpacingSel');
  syncDockSelect('paragraphGapSel');
  syncDockSelect('paragraphMarginSel');
}

function saveEditorSpacingChange() {
  rememberEditorSelection();
  updateStats();
  if (typeof flushEditorHistorySnapshot === 'function') flushEditorHistorySnapshot('spacing-format');
  persistActiveDocumentSettings();
  document.getElementById('editor')?.focus({ preventScroll: true });
}

function changeLineSpacing() {
  if (!canEditActiveDocument()) return;
  ensureChapters();
  const editor = document.getElementById('editor');
  let plainTextMode = typeof isEditorPlainTextMode === 'function' && isEditorPlainTextMode(editor);
  const safeLineHeight = normalizeEditorLineHeight(document.getElementById('lineSpacingSel')?.value);
  if (applyEditorBlockStylesToSelection({ 'line-height': safeLineHeight }, 'selection-line-height')) return;
  plainTextMode = typeof isEditorPlainTextMode === 'function' && isEditorPlainTextMode(editor);
  const currentDocument = activeEditorDocument();
  if (currentDocument && dockSpacingValueKey(currentDocument.lineHeight) === dockSpacingValueKey(safeLineHeight)) {
    const changed = plainTextMode ? false : clearEditorScopedStyleProperties(['line-height']);
    applyEditorSpacing(currentDocument.lineHeight, currentDocument.paragraphGap, null);
    if (changed) saveEditorSpacingChange();
    document.getElementById('editor')?.focus({ preventScroll: true });
    return;
  }
  const documentItem = activeMutableEditorDocumentForChange();
  if (documentItem) documentItem.lineHeight = safeLineHeight;
  if (!plainTextMode) clearEditorScopedStyleProperties(['line-height']);
  applyEditorSpacing(safeLineHeight, documentItem?.paragraphGap, null);
  saveEditorSpacingChange();
}

function changeParagraphGap() {
  if (!canEditActiveDocument()) return;
  ensureChapters();
  const editor = document.getElementById('editor');
  let plainTextMode = typeof isEditorPlainTextMode === 'function' && isEditorPlainTextMode(editor);
  const safeParagraphGap = normalizeEditorParagraphGap(document.getElementById('paragraphGapSel')?.value);
  if (applyEditorParagraphGapToSelection(safeParagraphGap)) return;
  plainTextMode = typeof isEditorPlainTextMode === 'function' && isEditorPlainTextMode(editor);
  const currentDocument = activeEditorDocument();
  if (currentDocument && dockSpacingValueKey(currentDocument.paragraphGap) === dockSpacingValueKey(safeParagraphGap)) {
    const changed = plainTextMode ? false : clearEditorScopedStyleProperties(['--editor-selection-paragraph-gap']);
    applyEditorSpacing(currentDocument.lineHeight, currentDocument.paragraphGap, null, { applyParagraphGap: true });
    if (changed) saveEditorSpacingChange();
    document.getElementById('editor')?.focus({ preventScroll: true });
    return;
  }
  const documentItem = activeMutableEditorDocumentForChange();
  if (documentItem) documentItem.paragraphGap = safeParagraphGap;
  if (!plainTextMode) clearEditorScopedStyleProperties(['--editor-selection-paragraph-gap']);
  applyEditorSpacing(documentItem?.lineHeight, safeParagraphGap, null, { applyParagraphGap: true });
  saveEditorSpacingChange();
}

function changeParagraphMargin() {
  const editor = document.getElementById('editor');
  const reviewMode = typeof isEditorReviewMode === 'function' && isEditorReviewMode(editor);
  if (!reviewMode) return;
  ensureChapters();
  const safeParagraphMargin = normalizeEditorParagraphMargin(document.getElementById('paragraphMarginSel')?.value);
  setParagraphMarginSelectValue(safeParagraphMargin);
  clearEditorScopedStyleProperties(['--editor-paragraph-margin']);
  const reviewMargin = typeof setEditorReviewModeMarginDefault === 'function'
    ? setEditorReviewModeMarginDefault(safeParagraphMargin)
    : safeParagraphMargin;
  const doc = activeEditorDocument();
  applyEditorSpacing(doc?.lineHeight, doc?.paragraphGap, reviewMargin);
  if (typeof updateEditorSettingsUI === 'function') updateEditorSettingsUI();
  editor?.focus({ preventScroll: true });
}

// Helper called by the review-mode Margin buttons in editorSettingsPanel.
// Always sets the underlying select value then calls changeParagraphMargin so
// re-clicking the same value still triggers a save.
function setReviewMargin(value) {
  const sel = document.getElementById('paragraphMarginSel');
  if (sel) sel.value = String(value);
  changeParagraphMargin();
}

function changeFont() {
  if (!canEditActiveDocument()) return;
  ensureChapters();
  const safeFontFamily = normalizeEditorFontFamily(document.getElementById('fontSel')?.value);
  if (applyEditorInlineStylesToSelection({ 'font-family': safeFontFamily }, 'selection-font-family')) {
    syncDockSelect('fontSel');
    return;
  }
  const currentDocument = activeEditorDocument();
  if (currentDocument && normalizeEditorFontFamily(currentDocument.fontFamily) === safeFontFamily) {
    const changed = applyEditorFontFamily(safeFontFamily, { clearSelectionScopedStyles: true });
    if (changed) {
      if (typeof flushEditorHistorySnapshot === 'function') flushEditorHistorySnapshot('font-family');
      persistActiveDocumentSettings();
    }
    document.getElementById('editor')?.focus({ preventScroll: true });
    return;
  }
  const documentItem = activeMutableEditorDocumentForChange();
  if (documentItem) documentItem.fontFamily = safeFontFamily;
  const changed = applyEditorFontFamily(safeFontFamily, { clearSelectionScopedStyles: true });
  if (changed && typeof flushEditorHistorySnapshot === 'function') flushEditorHistorySnapshot('font-family');
  persistActiveDocumentSettings();
  document.getElementById('editor')?.focus({ preventScroll: true });
}

function changeFontSize() {
  if (!canEditActiveDocument()) return;
  const input = document.getElementById('fsize');
  const editor = document.getElementById('editor');
  if (!input || !editor) return;
  ensureChapters();
  const minSize = Number(input.min) || EDITOR_FONT_SIZE_MIN;
  const maxSize = Number(input.max) || EDITOR_FONT_SIZE_MAX;
  const currentSize = Number(input.value) || 16;
  const safeSize = normalizeEditorFontSize(clampNumber(currentSize, minSize, maxSize));
  input.value = safeSize;
  if (applyEditorInlineStylesToSelection({ 'font-size': `${safeSize}px` }, 'selection-font-size')) return;
  const currentDocument = activeEditorDocument();
  if (currentDocument && normalizeEditorFontSize(currentDocument.fontSize) === safeSize) {
    const changed = applyEditorFontSize(safeSize, { clearSelectionScopedStyles: true });
    if (changed) {
      if (typeof flushEditorHistorySnapshot === 'function') flushEditorHistorySnapshot('font-size');
      persistActiveDocumentSettings();
    }
    editor.focus({ preventScroll: true });
    return;
  }
  const documentItem = activeMutableEditorDocumentForChange();
  if (documentItem) documentItem.fontSize = safeSize;
  const changed = applyEditorFontSize(safeSize, { clearSelectionScopedStyles: true });
  if (changed && typeof flushEditorHistorySnapshot === 'function') flushEditorHistorySnapshot('font-size');
  persistActiveDocumentSettings();
  editor.focus({ preventScroll: true });
}

function adjustDockFontSize(delta) {
  if (!canEditActiveDocument()) return;
  const input = document.getElementById('fsize');
  if (!input) return;
  const minSize = Number(input.min) || 10;
  const maxSize = Number(input.max) || 36;
  const currentSize = Number(input.value) || 16;
  input.value = clampNumber(currentSize + delta, minSize, maxSize);
  changeFontSize();
  input.focus();
}

const DOCK_SPACING_DEFAULT_VALUES = {
  lineSpacingSel: '',
  paragraphGapSel: '',
  paragraphMarginSel: ''
};
const DOCK_SPACING_PLACEHOLDER_TEXT = 'None';
const DOCK_FONT_OPTION_LABELS = {
  "'Lora',serif": 'Lora (Default)',
  "'Times New Roman',serif": 'Times New Roman (English)',
  'Kokila,serif': 'कोकिला (हिंदी)',
  "'Playfair Display',serif": 'Playfair Display',
  "'Georgia',serif": 'Georgia',
  "'Courier New',monospace": 'Courier New'
};
let currentToolDockMode = 'edit';
let dockFontPreviewState = null;
let dockSpacingPreviewState = null;
let toolDockPanelWidthObserver = null;
let toolDockPanelWidthSyncFrame = null;
let toolDockPanelWidthObserverBound = false;

function isDockSpacingSelect(selectId) {
  return Object.prototype.hasOwnProperty.call(DOCK_SPACING_DEFAULT_VALUES, selectId);
}

function isDockSpacingValueUnset(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function dockSpacingValueKey(value) {
  return isDockSpacingValueUnset(value) ? '' : String(value);
}

function shouldShowDockSpacingPlaceholder(selectId, select) {
  if (!select || !isDockSpacingSelect(selectId)) return false;
  return isDockSpacingValueUnset(select.value);
}

function activeToolDockModePanel(panel) {
  return panel?.querySelector('[data-tool-dock-mode-panel]:not([hidden])') || panel;
}

function toolDockPanelWidthTargets(panel) {
  const targets = [];
  panel?.querySelectorAll('.tool-dock-main-row').forEach(mainRow => targets.push(mainRow));
  panel?.querySelectorAll('.font-tools-section').forEach(fontSection => {
    Array.from(fontSection.children || []).forEach(control => {
      if (control.classList?.contains('dock-font-control') || control.classList?.contains('dock-fsize-control')) {
        targets.push(control);
      }
    });
  });
  return targets;
}

function toolDockPanelContentWidth(panel) {
  const activePanel = activeToolDockModePanel(panel);
  const mainRow = activePanel?.querySelector('.tool-dock-main-row');
  const fontSection = activePanel?.querySelector('.font-tools-section');
  const mainRowWidth = mainRow?.getBoundingClientRect().width || 0;
  if (!fontSection || fontSection.hidden) return mainRowWidth;

  const fontComputed = window.getComputedStyle(fontSection);
  const fontGap = parseFloat(fontComputed.columnGap || fontComputed.gap) || 0;
  const fontPaddingX = (parseFloat(fontComputed.paddingLeft) || 0) + (parseFloat(fontComputed.paddingRight) || 0);
  const fontBorderX = (parseFloat(fontComputed.borderLeftWidth) || 0) + (parseFloat(fontComputed.borderRightWidth) || 0);
  const fontControls = Array.from(fontSection.children).filter(control =>
    control.classList?.contains('dock-font-control') || control.classList?.contains('dock-fsize-control')
  );
  const fontControlsWidth = fontControls.reduce((total, control) => total + control.getBoundingClientRect().width, 0);
  const fontGapsWidth = Math.max(0, fontControls.length - 1) * fontGap;
  const fontRowWidth = fontControlsWidth + fontGapsWidth + fontPaddingX + fontBorderX;
  return Math.max(mainRowWidth, fontRowWidth);
}

function scheduleToolDockPanelWidthSync() {
  if (toolDockPanelWidthSyncFrame) return;
  toolDockPanelWidthSyncFrame = requestAnimationFrame(() => {
    toolDockPanelWidthSyncFrame = null;
    if (isToolDockOpen) positionToolDockPanelFromDock();
  });
}

function bindToolDockPanelWidthObserver() {
  if (toolDockPanelWidthObserverBound || typeof ResizeObserver === 'undefined') return;
  const dock = document.getElementById('floating-tools');
  const panel = dock?.querySelector('.tool-dock-panel');
  const widthTargets = toolDockPanelWidthTargets(panel);
  if (!dock || !panel || !widthTargets.length) return;

  toolDockPanelWidthObserver = new ResizeObserver(() => {
    if (!isToolDockOpen) return;
    scheduleToolDockPanelWidthSync();
  });
  widthTargets.forEach(target => toolDockPanelWidthObserver.observe(target));
  toolDockPanelWidthObserverBound = true;
}

function dockFontLabel(fontValue) {
  const safeFontValue = normalizeEditorFontFamily(fontValue);
  return DOCK_FONT_OPTION_LABELS[safeFontValue] || safeFontValue;
}

function syncDockFontOptionLabels() {
  const fontSelect = document.getElementById('fontSel');
  fontSelect?.querySelectorAll('option').forEach(option => {
    option.textContent = dockFontLabel(option.value);
    option.style.fontFamily = normalizeEditorFontFamily(option.value);
  });

  document.querySelectorAll('#fontSelMenu .dock-select-option').forEach(optionButton => {
    const safeFontValue = normalizeEditorFontFamily(optionButton.dataset.value);
    optionButton.textContent = dockFontLabel(safeFontValue);
    optionButton.style.fontFamily = safeFontValue;
  });
}

function currentEditorFontPreviewRange() {
  const editor = document.getElementById('editor');
  if (!editor) return null;
  const selection = window.getSelection();
  let range = null;

  if (
    selection?.rangeCount &&
    !selection.isCollapsed &&
    isNodeInsideEditor(selection.anchorNode) &&
    isNodeInsideEditor(selection.focusNode)
  ) {
    range = selection.getRangeAt(0).cloneRange();
  } else if (
    isValidEditorFormattingRange(editorFormattingSelectionRange) &&
    Date.now() - editorFormattingSelectionCapturedAt <= EDITOR_FORMATTING_SELECTION_GRACE_MS
  ) {
    range = editorFormattingSelectionRange.cloneRange();
  }

  return range && !range.collapsed ? range : null;
}

function isEditorRangeInsideEditor(range) {
  return Boolean(
    range &&
    isNodeInsideEditor(range.startContainer) &&
    isNodeInsideEditor(range.endContainer)
  );
}

function currentEditorPreviewSelectionSnapshot(editor, preferredRange = null) {
  if (!editor || typeof editorRangeToTextOffsets !== 'function') return null;
  if (isEditorRangeInsideEditor(preferredRange)) return editorRangeToTextOffsets(preferredRange, editor);

  const selection = window.getSelection();
  if (
    selection?.rangeCount &&
    isNodeInsideEditor(selection.anchorNode) &&
    isNodeInsideEditor(selection.focusNode)
  ) {
    return editorRangeToTextOffsets(selection.getRangeAt(0), editor);
  }

  return null;
}

function restoreEditorStyleProperty(editor, property, value) {
  if (!editor) return;
  if (value) editor.style.setProperty(property, value);
  else editor.style.removeProperty(property);
}

function clearDockFontPreview() {
  const state = dockFontPreviewState;
  dockFontPreviewState = null;
  if (!state) return;

  const editor = document.getElementById('editor');
  if (!editor) return;
  if (state.mode === 'selection') {
    editor.innerHTML = state.html;
    if (state.selection && typeof restoreEditorSelectionFromTextOffsets === 'function') {
      restoreEditorSelectionFromTextOffsets(state.selection);
    }
  }
  if (state.editorFontFamily) {
    editor.style.setProperty('--editor-font-family', state.editorFontFamily);
  } else {
    editor.style.removeProperty('--editor-font-family');
  }
  editor.scrollLeft = state.scrollLeft || 0;
  if (typeof markEditorProgrammaticScrollEvent === 'function') markEditorProgrammaticScrollEvent();
  editor.scrollTop = state.scrollTop || 0;
  if (typeof syncEditorPlaceholderState === 'function') syncEditorPlaceholderState();
  updateFormattingButtons({ syncFromSelection: false });
}

function previewDockFont(fontValue) {
  const editor = document.getElementById('editor');
  if (!editor) return;

  clearDockFontPreview();
  clearDockSpacingPreview();
  const safeFontValue = normalizeEditorFontFamily(fontValue);
  const range = currentEditorFontPreviewRange();
  const selectionSnapshot = range && typeof editorRangeToTextOffsets === 'function'
    ? editorRangeToTextOffsets(range, editor)
    : null;

  dockFontPreviewState = {
    mode: selectionSnapshot ? 'selection' : 'editor',
    html: editor.innerHTML,
    editorFontFamily: editor.style.getPropertyValue('--editor-font-family'),
    selection: selectionSnapshot,
    scrollLeft: editor.scrollLeft || 0,
    scrollTop: editor.scrollTop || 0
  };

  if (selectionSnapshot) {
    const segments = selectedEditorTextSegments(range, editor);
    segments.reverse().forEach(segment => wrapEditorTextSegment(segment, { 'font-family': safeFontValue }));
    editor.querySelectorAll('span.editor-inline-format').forEach(span => {
      span.classList.add('editor-font-preview');
    });
    return;
  }

  editor.style.setProperty('--editor-font-family', safeFontValue);
}

function clearDockSpacingPreview() {
  const state = dockSpacingPreviewState;
  dockSpacingPreviewState = null;
  if (!state) return;

  const editor = document.getElementById('editor');
  if (!editor) return;
  if (state.mode === 'plain' && typeof setPlainTextEditorValue === 'function') {
    setPlainTextEditorValue(editor, state.text || '');
  } else {
    editor.innerHTML = state.html;
  }
  restoreEditorStyleProperty(editor, '--editor-line-height', state.lineHeight);
  restoreEditorStyleProperty(editor, '--editor-paragraph-margin', state.paragraphMargin);
  if (state.selection && typeof restoreEditorSelectionFromTextOffsets === 'function') {
    restoreEditorSelectionFromTextOffsets(state.selection);
  }
  editor.scrollLeft = state.scrollLeft || 0;
  if (typeof markEditorProgrammaticScrollEvent === 'function') markEditorProgrammaticScrollEvent();
  editor.scrollTop = state.scrollTop || 0;
  if (typeof syncEditorPlaceholderState === 'function') syncEditorPlaceholderState();
  updateFormattingButtons({ syncFromSelection: false });
}
