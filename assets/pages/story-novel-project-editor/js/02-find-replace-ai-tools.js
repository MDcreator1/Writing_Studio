
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
  restoreEditorSelection();
  const wasActive = activeInlineFormats[cmd] || queryInlineFormatState(cmd);
  document.execCommand(cmd, false, null);
  activeInlineFormats[cmd] = !wasActive;
  inlineFormatSyncLockedUntil = Date.now() + 350;
  rememberEditorSelection();
  updateFormattingButtons({ syncFromSelection: false });
  updateStats();
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

  if (isCommandKey && !event.altKey && isFindOpen && (key === 'f' || key === 'h')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (isTrashDraftActive()) return true;
    if (key === 'f' || isReplaceOpen) {
      setFindPanel(false);
    } else {
      openFindReplacePanel({ allowSavedRange: false });
    }
    return true;
  }

  if (!isEditorShortcutActive()) return false;

  if (
    event.altKey &&
    !isCommandKey &&
    typeof handleNamingCategoryShortcut === 'function' &&
    handleNamingCategoryShortcut(event, key)
  ) {
    return true;
  }

  if (isCommandKey && key === 'f' && !event.altKey) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (isTrashDraftActive()) return true;
    if (isFindOpen) {
      setFindPanel(false);
      return true;
    }
    openFindPanel();
    return true;
  }

  if (isCommandKey && key === 'h' && !event.altKey) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (isTrashDraftActive()) return true;
    if (isFindOpen && isReplaceOpen) {
      setFindPanel(false);
      return true;
    }
    openFindReplacePanel({ allowSavedRange: false });
    return true;
  }

  if (isCommandKey && key === 's' && !event.altKey) {
    event.preventDefault();
    event.stopImmediatePropagation();
    manualSave();
    return true;
  }

  if (isCommandKey && formatCommandByKey[key] && !event.altKey) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!canEditActiveDocument()) return true;
    fmt(formatCommandByKey[key]);
    return true;
  }

  const nativeEditorKeys = new Set(['a', 'c', 'v', 'x', 'z', 'y']);
  if (isCommandKey && nativeEditorKeys.has(key) && !event.altKey) return false;

  if (!isCommandKey && !event.altKey && key === 'f10') {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (Boolean(isDraftTrashMode) || isTrashDraftActive()) return true;
    toggleFocus();
    return true;
  }

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
      const range = editorFormattingSelectionRange.cloneRange();
      editor.focus({ preventScroll: true });
      const nextSelection = window.getSelection();
      nextSelection?.removeAllRanges();
      nextSelection?.addRange(range);
      return range;
    }
    return null;
  }

  const range = selection.getRangeAt(0).cloneRange();
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
  const plainTextMode = typeof isEditorPlainTextMode === 'function' && isEditorPlainTextMode(editor);
  const safeLineHeight = normalizeEditorLineHeight(document.getElementById('lineSpacingSel')?.value);
  if (!plainTextMode && applyEditorBlockStylesToSelection({ 'line-height': safeLineHeight }, 'selection-line-height')) return;
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
  const plainTextMode = typeof isEditorPlainTextMode === 'function' && isEditorPlainTextMode(editor);
  const safeParagraphGap = normalizeEditorParagraphGap(document.getElementById('paragraphGapSel')?.value);
  if (!plainTextMode && applyEditorParagraphGapToSelection(safeParagraphGap)) return;
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

function applyDockSpacingPreviewToSelection(selectId, value, range, editor) {
  if (typeof isEditorPlainTextMode === 'function' && isEditorPlainTextMode(editor)) return false;
  const blocks = selectedEditorParagraphBlocks(range, editor);
  if (!blocks.length) return false;

  if (selectId === 'lineSpacingSel') {
    const safeLineHeight = normalizeEditorLineHeight(value);
    blocks.forEach(block => block.style.setProperty('line-height', String(safeLineHeight)));
    return true;
  }

  if (selectId === 'paragraphMarginSel') {
    const safeParagraphMargin = normalizeEditorParagraphMargin(value);
    blocks.forEach(block => block.style.setProperty('--editor-paragraph-margin', `${safeParagraphMargin}px`));
    return true;
  }

  if (selectId === 'paragraphGapSel') {
    const safeParagraphGap = normalizeEditorParagraphGap(value);
    if (blocks.length < 2) return false;
    blocks.slice(0, -1).forEach(block => {
      if (safeParagraphGap) block.style.setProperty('--editor-selection-paragraph-gap', `${safeParagraphGap}lh`);
      else block.style.removeProperty('--editor-selection-paragraph-gap');
    });
    return true;
  }

  return false;
}

function applyDockSpacingPreviewToEditor(selectId, value, editor) {
  if (!editor) return false;
  const plainTextMode = typeof isEditorPlainTextMode === 'function' && isEditorPlainTextMode(editor);

  if (selectId === 'lineSpacingSel') {
    editor.style.setProperty('--editor-line-height', String(normalizeEditorLineHeight(value)));
    return true;
  }

  if (selectId === 'paragraphMarginSel') {
    if (plainTextMode) return true;
    editor.style.setProperty('--editor-paragraph-margin', `${normalizeEditorParagraphMargin(value)}px`);
    return true;
  }

  if (selectId === 'paragraphGapSel') {
    if (plainTextMode && typeof applyPlainTextParagraphGapToEditor === 'function') {
      applyPlainTextParagraphGapToEditor(editor, normalizeEditorParagraphGap(value));
    } else {
      applyEditorParagraphGapBreaks(editor, normalizeEditorParagraphGap(value));
    }
    return true;
  }

  return false;
}

function previewDockSpacing(selectId, value) {
  const editor = document.getElementById('editor');
  if (!editor) return;

  clearDockSpacingPreview();
  clearDockFontPreview();

  const range = currentEditorFontPreviewRange();
  const selectionSnapshot = currentEditorPreviewSelectionSnapshot(editor, range);
  dockSpacingPreviewState = {
    mode: typeof isEditorPlainTextMode === 'function' && isEditorPlainTextMode(editor) ? 'plain' : 'html',
    text: typeof cleanPlainTextEditorValue === 'function' ? cleanPlainTextEditorValue(editor) : '',
    html: editor.innerHTML,
    lineHeight: editor.style.getPropertyValue('--editor-line-height'),
    paragraphMargin: editor.style.getPropertyValue('--editor-paragraph-margin'),
    selection: selectionSnapshot,
    scrollLeft: editor.scrollLeft || 0,
    scrollTop: editor.scrollTop || 0
  };

  if (range) {
    applyDockSpacingPreviewToSelection(selectId, value, range, editor);
    return;
  }
  applyDockSpacingPreviewToEditor(selectId, value, editor);
}

function bindDockFontPreview() {
  const fontMenu = document.getElementById('fontSelMenu');
  if (!fontMenu || fontMenu.dataset.fontPreviewBound === 'true') return;
  fontMenu.dataset.fontPreviewBound = 'true';
  document.querySelector('.dock-font-trigger')?.addEventListener('pointerdown', captureEditorFormattingSelection);
  fontMenu.addEventListener('pointerdown', captureEditorFormattingSelection, { capture: true });
  fontMenu.addEventListener('pointerleave', clearDockFontPreview);
  fontMenu.addEventListener('focusout', event => {
    if (!fontMenu.contains(event.relatedTarget)) clearDockFontPreview();
  });
  fontMenu.querySelectorAll('.dock-select-option').forEach(optionButton => {
    optionButton.addEventListener('pointerenter', () => previewDockFont(optionButton.dataset.value));
    optionButton.addEventListener('focus', () => previewDockFont(optionButton.dataset.value));
  });
}

function bindDockSpacingPreview() {
  ['lineSpacingSel', 'paragraphGapSel', 'paragraphMarginSel'].forEach(selectId => {
    const menu = document.getElementById(`${selectId}Menu`);
    if (!menu || menu.dataset.spacingPreviewBound === 'true') return;
    menu.dataset.spacingPreviewBound = 'true';
    menu.addEventListener('pointerleave', clearDockSpacingPreview);
    menu.addEventListener('focusout', event => {
      if (!menu.contains(event.relatedTarget)) clearDockSpacingPreview();
    });
    menu.querySelectorAll('.dock-select-option').forEach(optionButton => {
      optionButton.addEventListener('pointerenter', () => previewDockSpacing(selectId, optionButton.dataset.value));
      optionButton.addEventListener('focus', () => previewDockSpacing(selectId, optionButton.dataset.value));
    });
  });
}

function paragraphMarginLabelText(value) {
  if (isDockSpacingValueUnset(value)) return DOCK_SPACING_PLACEHOLDER_TEXT;
  return `${normalizeEditorParagraphMargin(value)}px`;
}

function parseParagraphMarginLabel(value) {
  const cleaned = String(value || '').replace(/[^\d.-]/g, '').trim();
  if (!cleaned) return null;
  return normalizeEditorParagraphMargin(cleaned);
}

function setParagraphMarginSelectValue(value) {
  const select = document.getElementById('paragraphMarginSel');
  if (!select) return;

  if (isDockSpacingValueUnset(value)) {
    select.querySelectorAll('option[data-custom-margin="true"]').forEach(option => option.remove());
    select.value = '';
    return;
  }

  const safeMargin = normalizeEditorParagraphMargin(value);
  const safeValue = String(safeMargin);
  const customLabel = paragraphMarginLabelText(safeMargin);

  select.querySelectorAll('option[data-custom-margin="true"]').forEach(option => {
    if (option.value !== safeValue) option.remove();
  });

  if (!Array.from(select.options).some(option => option.value === safeValue)) {
    const customOption = document.createElement('option');
    customOption.value = safeValue;
    customOption.textContent = customLabel;
    customOption.dataset.customMargin = 'true';
    select.appendChild(customOption);
  }

  select.value = safeValue;
}

function toggleDockSelectFromTrigger(event, selectId) {
  if (event?.target?.closest?.('.dock-editable-value')) return;
  toggleDockSelect(selectId);
}

function handleDockSelectTriggerKey(event, selectId) {
  if (event.target?.closest?.('.dock-editable-value')) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  toggleDockSelect(selectId);
}

function selectParagraphMarginLabelText() {
  requestAnimationFrame(() => {
    const label = document.getElementById('paragraphMarginSelLabel');
    if (!label) return;
    const range = document.createRange();
    range.selectNodeContents(label);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

function commitParagraphMarginLabelEdit() {
  const label = document.getElementById('paragraphMarginSelLabel');
  if (!label || isDockSpacingValueUnset(label.textContent) || label.textContent.trim().toLowerCase() === DOCK_SPACING_PLACEHOLDER_TEXT.toLowerCase()) {
    setParagraphMarginSelectValue(null);
    syncDockSelect('paragraphMarginSel');
    return;
  }
  const safeMargin = parseParagraphMarginLabel(label?.textContent);
  if (safeMargin === null) {
    setParagraphMarginSelectValue(null);
    syncDockSelect('paragraphMarginSel');
    return;
  }
  setParagraphMarginSelectValue(safeMargin);
  changeParagraphMargin();
}

function handleParagraphMarginLabelKey(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    commitParagraphMarginLabelEdit();
    event.currentTarget.blur();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    const select = document.getElementById('paragraphMarginSel');
    event.currentTarget.textContent = shouldShowDockSpacingPlaceholder('paragraphMarginSel', select)
      ? DOCK_SPACING_PLACEHOLDER_TEXT
      : paragraphMarginLabelText(select?.value);
    event.currentTarget.blur();
  }
}

function syncDockSelect(selectId) {
  const select = document.getElementById(selectId);
  const wrapper = select?.closest('.dock-custom-select');
  if (!select || !wrapper) return;

  const menu = document.getElementById(`${selectId}Menu`);
  const trigger = wrapper.querySelector('.dock-select-trigger');
  const label = document.getElementById(`${selectId}Label`);
  if (selectId === 'paragraphMarginSel') setParagraphMarginSelectValue(select.value);
  const selectedOption = Array.from(select.options).find(option => option.value === select.value) || select.options[0];
  const selectedText = selectId === 'paragraphMarginSel'
    ? paragraphMarginLabelText(select.value)
    : selectedOption?.textContent?.trim() || select.value;
  const showPlaceholder = shouldShowDockSpacingPlaceholder(selectId, select);
  const displayText = showPlaceholder ? DOCK_SPACING_PLACEHOLDER_TEXT : selectedText;
  const isOpen = openDockSelectId === selectId;

  if (showPlaceholder && isDockSpacingSelect(selectId)) {
    select.value = DOCK_SPACING_DEFAULT_VALUES[selectId];
  }

  if (label && document.activeElement !== label) label.textContent = displayText;
  if (trigger) {
    trigger.setAttribute('aria-expanded', String(isOpen));
    trigger.title = displayText;
  }
  if (menu) menu.hidden = !isOpen;
  wrapper.classList.toggle('is-open', isOpen);
  wrapper.classList.toggle('is-placeholder', showPlaceholder);

  menu?.querySelectorAll('.dock-select-option').forEach(optionButton => {
    const isSelected = !showPlaceholder && optionButton.dataset.value === select.value;
    optionButton.classList.toggle('is-selected', isSelected);
    optionButton.setAttribute('aria-selected', String(isSelected));
  });
}

function syncAllDockSelects() {
  ['lineSpacingSel', 'paragraphGapSel', 'paragraphMarginSel', 'fontSel'].forEach(syncDockSelect);
}

function toggleDockSelect(selectId) {
  clearDockFontPreview();
  clearDockSpacingPreview();
  openDockSelectId = openDockSelectId === selectId ? null : selectId;
  syncAllDockSelects();
  if (isToolDockOpen) requestAnimationFrame(positionToolDockPanelFromDock);
}

function closeDockSelects() {
  clearDockFontPreview();
  clearDockSpacingPreview();
  if (!openDockSelectId) return;
  openDockSelectId = null;
  syncAllDockSelects();
}

function selectDockOption(selectId, value) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const nextValue = String(value);
  const isSameValue = select.value === nextValue;
  clearDockFontPreview();
  clearDockSpacingPreview();
  select.value = nextValue;

  if (isSameValue) {
    syncDockSelect(selectId);
    closeDockSelects();
    document.getElementById('editor')?.focus({ preventScroll: true });
    return;
  }

  if (selectId === 'lineSpacingSel') changeLineSpacing();
  else if (selectId === 'paragraphGapSel') changeParagraphGap();
  else if (selectId === 'paragraphMarginSel') changeParagraphMargin();
  else if (selectId === 'fontSel') changeFont();

  closeDockSelects();
  document.getElementById('editor')?.focus({ preventScroll: true });
}

function initDockSelects() {
  syncToolDockMode({ closeInvalidSelect: false });
  syncDockFontOptionLabels();
  bindDockFontPreview();
  bindDockSpacingPreview();
  bindToolDockPanelWidthObserver();
  ['lineSpacingSel', 'paragraphGapSel', 'paragraphMarginSel', 'fontSel'].forEach(selectId => {
    const select = document.getElementById(selectId);
    const wrapper = select?.closest('.dock-custom-select');
    wrapper?.querySelector('.dock-select-trigger')?.addEventListener('pointerdown', captureEditorFormattingSelection);
    wrapper?.querySelector('.dock-select-menu')?.addEventListener('pointerdown', captureEditorFormattingSelection, { capture: true });
    document.getElementById(selectId)?.addEventListener('change', () => {
      syncDockSelect(selectId);
    });
    syncDockSelect(selectId);
  });
  document.getElementById('fsize')?.addEventListener('pointerdown', captureEditorFormattingSelection);
  document.querySelector('.dock-fsize-stepper')?.addEventListener('pointerdown', captureEditorFormattingSelection, { capture: true });
}

function setFontToolsPanel(open) {
  isFontToolsOpen = Boolean(open) && currentToolDockMode !== 'review';
  const section = document.getElementById('fontToolsSection');
  const toggle = document.getElementById('fontToolsToggle');
  if (section) section.hidden = !isFontToolsOpen;
  if (!isFontToolsOpen) closeDockSelects();
  if (toggle) {
    toggle.classList.toggle('active', isFontToolsOpen);
    toggle.setAttribute('aria-expanded', String(isFontToolsOpen));
  }
  if (isToolDockOpen) requestAnimationFrame(positionToolDockPanelFromDock);
}

function toggleFontTools() {
  setFontToolsPanel(!isFontToolsOpen);
}

function resolveToolDockMode() {
  const editor = document.getElementById('editor');
  const reviewMode = typeof isEditorReviewMode === 'function' && isEditorReviewMode(editor);
  return reviewMode ? 'review' : 'edit';
}

function syncToolDockMode(options = {}) {
  const dock = document.getElementById('floating-tools');
  const panel = dock?.querySelector('.tool-dock-panel');
  const mode = resolveToolDockMode();
  currentToolDockMode = mode;
  if (dock) dock.dataset.toolDockMode = mode;
  if (panel) panel.dataset.toolDockMode = mode;

  const editPanel = panel?.querySelector('[data-tool-dock-mode-panel="edit"]');
  const reviewPanel = panel?.querySelector('[data-tool-dock-mode-panel="review"]');
  if (editPanel) editPanel.hidden = mode !== 'edit';
  if (reviewPanel) reviewPanel.hidden = mode !== 'review';

  if (mode === 'review') {
    const reviewMargin = typeof editorReviewModeMarginDefault === 'function' ? editorReviewModeMarginDefault() : 0;
    const documentItem = typeof activeEditorDocument === 'function' ? activeEditorDocument() : null;
    applyEditorSpacing(documentItem?.lineHeight, documentItem?.paragraphGap, reviewMargin, { applyParagraphGap: false });
  } else {
    const documentItem = typeof activeEditorDocument === 'function' ? activeEditorDocument() : null;
    applyEditorSpacing(documentItem?.lineHeight, documentItem?.paragraphGap, null, { applyParagraphGap: false });
  }

  if (mode === 'review' && isFontToolsOpen) setFontToolsPanel(false);
  if (options.closeInvalidSelect !== false) {
    if (mode === 'review' && openDockSelectId && openDockSelectId !== 'paragraphMarginSel') closeDockSelects();
    if (mode === 'edit' && openDockSelectId === 'paragraphMarginSel') closeDockSelects();
  }
  if (isToolDockOpen) requestAnimationFrame(positionToolDockPanelFromDock);
  return mode;
}

function closeToolDockAfterControlBlur() {
  requestAnimationFrame(() => {
    const dock = document.getElementById('floating-tools');
    if (isToolDockOpen && dock && !dock.contains(document.activeElement)) {
      setToolDock(false);
    }
  });
}

function canUseEditorToolDock() {
  const reviewMode = resolveToolDockMode() === 'review';
  return canEditActiveDocument() || (reviewMode && !(typeof isTrashDraftActive === 'function' && isTrashDraftActive()));
}

function toggleToolDock() {
  syncToolDockMode();
  if (!canUseEditorToolDock()) return;
  const shouldOpen = !isToolDockOpen;
  if (shouldOpen) setFindPanel(false);
  setToolDock(shouldOpen);
}

function setToolDock(open) {
  syncToolDockMode();
  if (open && !canUseEditorToolDock()) open = false;
  if (open && !isToolDockOpen && typeof prepareFloatingPanelFocusReturn === 'function') {
    prepareFloatingPanelFocusReturn('floating-tools');
  }
  isToolDockOpen = open;
  const dock = document.getElementById('floating-tools');
  const toggle = document.getElementById('toolDockToggle');
  if (!dock || !toggle) return;
  dock.classList.toggle('is-expanded', open);
  dock.classList.toggle('is-collapsed', !open);
  toggle.setAttribute('aria-expanded', String(open));
  if (!open) {
    closeDockSelects();
    setFontToolsPanel(false);
  }
  if (!open && dock.contains(document.activeElement)) {
    document.activeElement.blur();
  }
  if (open) {
    syncToolDockMode();
    updateFormattingButtons();
    requestAnimationFrame(positionToolDockPanelFromDock);
  }
}

function toolDockBounds() {
  const editorArea = document.getElementById('editor-area');
  const dock = document.getElementById('floating-tools');
  const actions = dock?.querySelector('.tool-dock-actions');
  if (!editorArea || !dock) return null;
  const padding = 32;
  const toppadding = 68;
  const dragWidth = actions?.offsetWidth || dock.offsetWidth;
  const dragHeight = actions?.offsetHeight || dock.offsetHeight;
  return {
    editorArea,
    dock,
    actions,
    padding,
    toppadding,
    maxLeft: Math.max(padding, editorArea.clientWidth - dragWidth - padding),
    maxTop: Math.max(toppadding, editorArea.clientHeight - dragHeight - padding)
  };
}

function normalizeToolDockOrientation(value) {
  return value === 'vertical' ? 'vertical' : 'horizontal';
}

function applyToolDockOrientation(orientation = toolDockOrientation) {
  const dock = document.getElementById('floating-tools');
  toolDockOrientation = normalizeToolDockOrientation(orientation);
  if (!dock) return;
  dock.classList.toggle('is-dock-vertical', toolDockOrientation === 'vertical');
  dock.classList.toggle('is-dock-horizontal', toolDockOrientation !== 'vertical');
}

function toolDockActionPosition() {
  const bounds = toolDockBounds();
  if (!bounds) return null;
  const actionRect = (bounds.actions || bounds.dock).getBoundingClientRect();
  const areaRect = bounds.editorArea.getBoundingClientRect();
  return {
    left: actionRect.left - areaRect.left,
    top: actionRect.top - areaRect.top
  };
}

function setToolDockPosition(left, top, persist = false) {
  const bounds = toolDockBounds();
  if (!bounds) return;
  const safeLeft = clampNumber(left, bounds.padding, bounds.maxLeft);
  const safeTop = clampNumber(top, bounds.toppadding, bounds.maxTop);

  bounds.dock.classList.add('is-positioned');
  bounds.dock.style.position = 'absolute';
  bounds.dock.style.left = `${Math.round(safeLeft)}px`;
  bounds.dock.style.top = `${Math.round(safeTop)}px`;
  bounds.dock.style.right = 'auto';
  bounds.dock.style.bottom = 'auto';
  bounds.dock.style.transform = 'none';

  if (persist) {
    localStorage.setItem(TOOL_DOCK_POSITION_KEY, JSON.stringify({
      leftRatio: bounds.maxLeft > bounds.padding ? safeLeft / bounds.maxLeft : 0,
      topRatio: bounds.maxTop > bounds.padding ? safeTop / bounds.maxTop : 0,
      orientation: toolDockOrientation
    }));
  }
  positionToolDockPanelFromDock();
  positionFindPanelFromDock();
}

function restoreToolDockPosition() {
  try {
    const savedPosition = JSON.parse(localStorage.getItem(TOOL_DOCK_POSITION_KEY) || 'null');
    if (!savedPosition || typeof savedPosition !== 'object') {
      applyToolDockOrientation('horizontal');
      return;
    }
    applyToolDockOrientation(savedPosition.orientation);
    requestAnimationFrame(() => {
      const bounds = toolDockBounds();
      if (!bounds) return;
      const left = Number(savedPosition.leftRatio) * bounds.maxLeft;
      const top = Number(savedPosition.topRatio) * bounds.maxTop;
      if (Number.isFinite(left) && Number.isFinite(top)) {
        setToolDockPosition(left, top, false);
      }
    });
  } catch (error) {
    localStorage.removeItem(TOOL_DOCK_POSITION_KEY);
    applyToolDockOrientation('horizontal');
  }
}

function toggleToolDockOrientation() {
  const currentPosition = toolDockActionPosition();
  const nextOrientation = toolDockOrientation === 'vertical' ? 'horizontal' : 'vertical';
  applyToolDockOrientation(nextOrientation);
  requestAnimationFrame(() => {
    if (currentPosition) {
      setToolDockPosition(currentPosition.left, currentPosition.top, true);
    } else {
      const bounds = toolDockBounds();
      if (bounds) setToolDockPosition(bounds.padding, bounds.toppadding, true);
    }
  });
}

function moveToolDockToDragOrigin() {
  const bounds = toolDockBounds();
  if (!bounds) return;
  setToolDockPosition(bounds.padding, bounds.toppadding, true);
}

function positionFindPanelFromDock() {
  if (!isFindOpen) return;
  const editorArea = document.getElementById('editor-area');
  const findBar = document.getElementById('find-bar');
  if (!editorArea || !findBar) return;

  if (isFocus && positionFocusFloatingPanelAtEditorCenter(findBar, { fixed: false, padding: 14 })) {
    findBar.classList.add('is-editor-centered');
    findBar.classList.remove('is-caret-positioned');
    return;
  }

  const dock = document.getElementById('floating-tools');
  if (!dock) return;

  const padding = 12;
  const areaRect = editorArea.getBoundingClientRect();
  const dockRect = dock.getBoundingClientRect();
  const findWidth = findBar.offsetWidth;
  const findHeight = findBar.offsetHeight;
  const actions = dock.querySelector('.tool-dock-actions');
  const anchorRect = actions?.getBoundingClientRect() || dockRect;
  const dockCenter = anchorRect.left + anchorRect.width / 2 - areaRect.left;
  let left = dockCenter - findWidth / 2;
  let top = anchorRect.top - areaRect.top - findHeight - padding;

  if (top < padding) top = anchorRect.bottom - areaRect.top + padding;
  left = clampNumber(left, padding, Math.max(padding, editorArea.clientWidth - findWidth - padding));
  top = clampNumber(top, padding, Math.max(padding, editorArea.clientHeight - findHeight - padding));

  findBar.classList.add('is-dock-positioned');
  findBar.classList.remove('is-caret-positioned', 'is-editor-centered');
  findBar.style.position = 'absolute';
  findBar.style.left = `${Math.round(left)}px`;
  findBar.style.top = `${Math.round(top)}px`;
  findBar.style.right = 'auto';
  findBar.style.bottom = 'auto';
  findBar.style.transform = 'none';
}

function syncToolDockPanelWidth(panel, editorArea, padding = 12) {
  if (!panel || !editorArea) return;
  const computed = window.getComputedStyle(panel);
  const paddingX = (parseFloat(computed.paddingLeft) || 0) + (parseFloat(computed.paddingRight) || 0);
  const borderX = (parseFloat(computed.borderLeftWidth) || 0) + (parseFloat(computed.borderRightWidth) || 0);
  const contentWidth = toolDockPanelContentWidth(panel);
  const targetWidth = contentWidth + paddingX + borderX;
  const availableWidth = Math.max(120, editorArea.clientWidth - padding * 2);
  const safeWidth = clampNumber(targetWidth, Math.min(120, availableWidth), availableWidth);

  panel.style.maxWidth = '';
  panel.style.width = '';
  panel.style.setProperty('--tool-panel-max-width', `${Math.round(availableWidth)}px`);
  panel.style.setProperty('--tool-panel-width', `${Math.round(safeWidth)}px`);
}

function positionToolDockPanelFromDock() {
  if (!isToolDockOpen) return;
  const editorArea = document.getElementById('editor-area');
  const dock = document.getElementById('floating-tools');
  const panel = dock?.querySelector('.tool-dock-panel');
  const actions = dock?.querySelector('.tool-dock-actions');
  if (!editorArea || !dock || !panel) return;

  const padding = 12;
  const areaRect = editorArea.getBoundingClientRect();
  const dockRect = dock.getBoundingClientRect();
  const anchorRect = actions?.getBoundingClientRect() || dockRect;
  syncToolDockPanelWidth(panel, editorArea, padding);

  const panelWidth = panel.offsetWidth;
  const panelHeight = panel.offsetHeight;
  const gap = 8;
  const baseLeft = dockRect.left - areaRect.left + dockRect.width / 2 - panelWidth / 2;
  const anchorLeft = anchorRect.left - areaRect.left + anchorRect.width / 2 - panelWidth / 2;
  const safeLeft = clampNumber(anchorLeft, padding, Math.max(padding, editorArea.clientWidth - panelWidth - padding));
  const shift = safeLeft - baseLeft;
  panel.style.setProperty('--tool-panel-shift-x', `${Math.round(shift)}px`);

  const dockTop = dockRect.top - areaRect.top;
  const dockBottom = dockRect.bottom - areaRect.top;
  const anchorTop = anchorRect.top - areaRect.top;
  const anchorBottom = anchorRect.bottom - areaRect.top;
  const aboveTop = anchorTop - panelHeight - gap;
  const belowTop = anchorBottom + gap;
  const aboveFits = aboveTop >= padding;
  const belowFits = belowTop + panelHeight <= editorArea.clientHeight - padding;
  const availableAbove = Math.max(0, anchorTop - padding - gap);
  const availableBelow = Math.max(0, editorArea.clientHeight - anchorBottom - padding - gap);
  const placeBelow = !aboveFits && (belowFits || availableBelow >= availableAbove);
  let baseTop;

  if (placeBelow) {
    panel.style.top = `${Math.round(anchorBottom - dockTop + gap)}px`;
    panel.style.bottom = 'auto';
    baseTop = belowTop;
  } else {
    panel.style.top = 'auto';
    panel.style.bottom = `${Math.round(dockBottom - anchorTop + gap)}px`;
    baseTop = aboveTop;
  }

  const safeTop = clampNumber(baseTop, padding, Math.max(padding, editorArea.clientHeight - panelHeight - padding));
  panel.style.setProperty('--tool-panel-shift-y', `${Math.round(safeTop - baseTop)}px`);
}

function initDraggableToolDock() {
  const dock = document.getElementById('floating-tools');
  const actions = dock?.querySelector('.tool-dock-actions');
  const dragHandle = dock?.querySelector('.dock-drag-handle');
  if (!dock || !actions || !dragHandle || dock.dataset.dragReady === 'true') return;
  dock.dataset.dragReady = 'true';

  requestAnimationFrame(restoreToolDockPosition);

  dragHandle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const editorArea = document.getElementById('editor-area');
    if (!editorArea) return;

    const areaRect = editorArea.getBoundingClientRect();
    const actionRect = actions.getBoundingClientRect();
    const startLeft = actionRect.left - areaRect.left;
    const startTop = actionRect.top - areaRect.top;
    toolDockDragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft,
      startTop,
      didDrag: false
    };
    event.preventDefault();
  });

  dragHandle.addEventListener('pointermove', event => {
    if (!toolDockDragState || toolDockDragState.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - toolDockDragState.startX;
    const deltaY = event.clientY - toolDockDragState.startY;
    if (!toolDockDragState.didDrag && Math.hypot(deltaX, deltaY) < 6) return;

    const justStartedDrag = !toolDockDragState.didDrag;
    toolDockDragState.didDrag = true;
    if (justStartedDrag) dragHandle.setPointerCapture?.(event.pointerId);
    suppressNextToolDockClick = true;
    dock.classList.add('is-dragging');
    event.preventDefault();
    setToolDockPosition(toolDockDragState.startLeft + deltaX, toolDockDragState.startTop + deltaY, false);
  });

  const finishDrag = event => {
    if (!toolDockDragState || toolDockDragState.pointerId !== event.pointerId) return;
    if (toolDockDragState.didDrag) {
      const bounds = toolDockBounds();
      if (bounds) {
        const dockRect = bounds.dock.getBoundingClientRect();
        const actionRect = bounds.actions?.getBoundingClientRect() || dockRect;
        const areaRect = bounds.editorArea.getBoundingClientRect();
        setToolDockPosition(actionRect.left - areaRect.left, actionRect.top - areaRect.top, true);
      }
    }
    dock.classList.remove('is-dragging');
    toolDockDragState = null;
  };

  dragHandle.addEventListener('pointerup', finishDrag);
  dragHandle.addEventListener('pointercancel', finishDrag);
  dragHandle.addEventListener('click', event => {
    if (suppressNextToolDockClick) return;
    event.preventDefault();
    event.stopPropagation();
    clearTimeout(toolDockHandleClickTimer);
    toolDockHandleClickTimer = setTimeout(() => {
      toolDockHandleClickTimer = null;
      toggleToolDockOrientation();
    }, 260);
  });
  dragHandle.addEventListener('dblclick', event => {
    event.preventDefault();
    event.stopPropagation();
    clearTimeout(toolDockHandleClickTimer);
    toolDockHandleClickTimer = null;
    moveToolDockToDragOrigin();
  });
  dock.addEventListener('click', event => {
    if (!suppressNextToolDockClick) return;
    suppressNextToolDockClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
}

function getFloatingPanelPositions() {
  try {
    return JSON.parse(localStorage.getItem(FLOATING_PANEL_POSITION_KEY) || '{}') || {};
  } catch (error) {
    return {};
  }
}

function saveFloatingPanelPosition(panel) {
  if (!panel?.id) return;
  const panelRect = panel.getBoundingClientRect();
  const positions = getFloatingPanelPositions();
  positions[panel.id] = {
    left: Math.round(panelRect.left),
    top: Math.round(panelRect.top)
  };
  localStorage.setItem(FLOATING_PANEL_POSITION_KEY, JSON.stringify(positions));
}

function floatingPanelBounds(panel) {
  const gap = 12;
  const chapterPanel = document.getElementById('chapter-panel');
  const mainArea = document.getElementById('main');
  const topBar = document.getElementById('top-bar');
  const chapterRect = chapterPanel?.getBoundingClientRect();
  const mainRect = mainArea?.getBoundingClientRect();
  const topBarRect = topBar?.getBoundingClientRect();
  const chapterVisible = chapterRect && chapterRect.width > 0 && chapterRect.height > 0;
  const topHeadBottom = Math.max(topBarRect?.bottom || 0, mainRect?.top || 0);
  const leftBoundary = chapterVisible
    ? Math.max(gap, Math.round(chapterRect.right + gap))
    : gap;
  const topBoundary = Math.max(gap, Math.round(topHeadBottom + gap));
  const panelWidth = panel?.offsetWidth || 320;
  const panelHeight = panel?.offsetHeight || 280;
  return {
    minLeft: leftBoundary,
    maxLeft: Math.max(leftBoundary, window.innerWidth - panelWidth - gap),
    minTop: topBoundary,
    maxTop: Math.max(topBoundary, window.innerHeight - panelHeight)
  };
}

function clampFloatingPanelPosition(panel, left, top) {
  const bounds = floatingPanelBounds(panel);
  return {
    left: clampNumber(Math.round(left), bounds.minLeft, bounds.maxLeft),
    top: clampNumber(Math.round(top), bounds.minTop, bounds.maxTop)
  };
}

function applySavedFloatingPanelPosition(panel) {
  if (!panel?.id) return false;
  const savedPosition = getFloatingPanelPositions()[panel.id];
  if (!savedPosition) return false;
  const nextPosition = clampFloatingPanelPosition(panel, savedPosition.left, savedPosition.top);
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.left = `${nextPosition.left}px`;
  panel.style.top = `${nextPosition.top}px`;
  panel.style.visibility = '';
  return true;
}

function startFloatingPanelDrag(event, panelId) {
  if (event.button !== undefined && event.button !== 0) return;
  if (event.target.closest('button, input, textarea, select, a, [contenteditable="true"]')) return;
  const panel = document.getElementById(panelId);
  if (!panel || panel.hidden) return;
  const panelRect = panel.getBoundingClientRect();
  floatingPanelDragState = {
    panelId,
    pointerId: event.pointerId,
    offsetX: event.clientX - panelRect.left,
    offsetY: event.clientY - panelRect.top
  };
  panel.classList.add('is-panel-dragging');
  event.currentTarget.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function moveFloatingPanelDrag(event) {
  if (!floatingPanelDragState || floatingPanelDragState.pointerId !== event.pointerId) return;
  const panel = document.getElementById(floatingPanelDragState.panelId);
  if (!panel) return;
  const nextPosition = clampFloatingPanelPosition(
    panel,
    event.clientX - floatingPanelDragState.offsetX,
    event.clientY - floatingPanelDragState.offsetY
  );
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.left = `${nextPosition.left}px`;
  panel.style.top = `${nextPosition.top}px`;
  event.preventDefault();
}

function endFloatingPanelDrag(event) {
  if (!floatingPanelDragState || floatingPanelDragState.pointerId !== event.pointerId) return;
  const panel = document.getElementById(floatingPanelDragState.panelId);
  if (panel) {
    panel.classList.remove('is-panel-dragging');
    saveFloatingPanelPosition(panel);
  }
  floatingPanelDragState = null;
}

function initDraggableFloatingPanels() {
  [
    ['namingEntryPanel', '.naming-entry-head'],
    ['factComposerPanel', '.fact-compose-head'],
    ['categoryInputPanel', '.category-input-head']
  ].forEach(([panelId, handleSelector]) => {
    const handle = document.querySelector(`#${panelId} ${handleSelector}`);
    if (!handle || handle.dataset.dragReady === 'true') return;
    handle.dataset.dragReady = 'true';
    handle.addEventListener('pointerdown', event => startFloatingPanelDrag(event, panelId));
  });
  window.addEventListener('pointermove', moveFloatingPanelDrag);
  window.addEventListener('pointerup', endFloatingPanelDrag);
  window.addEventListener('pointercancel', endFloatingPanelDrag);
}

function applyDark() {
  const mode = window.getCurrentThemeMode?.() || (isDark ? 'dark' : 'light');
  isDark = mode === 'dark';
  document.body.classList.toggle('light-mode', mode === 'light');
  document.body.classList.toggle('dark-mode', mode === 'dark');
  document.body.classList.toggle('grey-mode', mode === 'grey');
  document.body.classList.toggle('purple-mode', mode === 'purple');
  document.body.classList.toggle('sunset-mode', mode === 'sunset');
  document.body.classList.toggle('forest-mode', mode === 'forest');
  document.body.classList.toggle('colorful-mode', false);
  window.applyLekhakThemeClasses?.(mode);
  window.syncThemePanelState?.();
}

function toggleFind() {
  setFindPanel(!isFindOpen);
}

function handleFindPanelKey(event) {
  if (event.isComposing) return;
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    event.stopPropagation();
    if (!findMatches.length && document.getElementById('findInp')?.value) doFind();
    if (event.key === 'ArrowUp') prevMatch();
    else nextMatch();
    return;
  }
  if (event.key !== 'Enter') return;
  if (event.target?.closest?.('button')) return;
  event.preventDefault();
  if (event.target?.id === 'replInp') {
    replaceOne();
    return;
  }
  setFindPanel(false);
}

function focusFindInputWithSelection(options = {}) {
  const findInput = document.getElementById('findInp');
  if (!findInput) return;
  const focusFindInput = () => {
    findInput.focus({ preventScroll: true });
    findInput.select();
  };
  requestAnimationFrame(() => {
    focusFindInput();
    if (options.retry) requestAnimationFrame(focusFindInput);
  });
}

function selectedEditorTextForFind(options = {}) {
  const allowSavedRange = options.allowSavedRange !== false;
  const selection = window.getSelection();
  let sourceRange = null;
  const hasEditorSelection = Boolean(
    selection?.rangeCount &&
    isNodeInsideEditor(selection.anchorNode) &&
    isNodeInsideEditor(selection.focusNode)
  );

  if (hasEditorSelection && !selection.isCollapsed) {
    sourceRange = selection.getRangeAt(0).cloneRange();
  } else if (hasEditorSelection) {
    return '';
  } else if (
    allowSavedRange &&
    savedEditorRange &&
    !savedEditorRange.collapsed &&
    isNodeInsideEditor(savedEditorRange.startContainer) &&
    isNodeInsideEditor(savedEditorRange.endContainer)
  ) {
    sourceRange = savedEditorRange.cloneRange();
  }

  const selectedText = sourceRange?.toString?.().replace(/\u00a0/g, ' ').trim() || '';
  sourceRange?.detach?.();
  return selectedText;
}

function fillFindInputFromSelection(selectedText) {
  const findInput = document.getElementById('findInp');
  if (!findInput || !selectedText) return false;
  findInput.value = selectedText;
  doFind({ preferredSnapshot: findPanelReturnSelection });
  return true;
}

function focusReplaceInputWithSelection(options = {}) {
  const replaceInput = document.getElementById('replInp');
  if (!replaceInput) return;
  requestAnimationFrame(() => {
    if (replaceInput.closest?.('[hidden], [aria-hidden="true"]')) return;
    replaceInput.focus({ preventScroll: true });
    if (options.select !== false) replaceInput.select();
  });
}

function openFindPanel() {
  setFindPanel(true);
  setReplacePanel(false);
  focusFindInputWithSelection();
}

function openFindReplacePanel(options = {}) {
  const selectedText = selectedEditorTextForFind({ allowSavedRange: options.allowSavedRange !== false });
  const hasSelectedText = Boolean(selectedText);
  setFindPanel(true);
  setReplacePanel(false);
  if (!hasSelectedText) {
    setReplacePanel(canEditActiveDocument());
    focusFindInputWithSelection({ retry: true });
    return;
  }
  fillFindInputFromSelection(selectedText);
  const shouldOpenReplace = Boolean(canEditActiveDocument() && findMatches.length > 0);
  setReplacePanel(shouldOpenReplace);
  if (shouldOpenReplace) focusReplaceInputWithSelection();
  else focusFindInputWithSelection();
}

function syncFindReplaceAvailability() {
  const findBar = document.getElementById('find-bar');
  const toggle = document.getElementById('replaceToggleBtn');
  const canReplace = canEditActiveDocument();
  const query = document.getElementById('findInp')?.value || '';
  const canShowReplaceToggle = Boolean(canReplace && query && findMatches.length > 1);
  const canKeepReplacePanelOpen = Boolean(canReplace && query && findMatches.length > 0);
  if (findBar) findBar.classList.toggle('is-find-readonly', !canReplace);
  if (toggle) {
    toggle.hidden = !canShowReplaceToggle;
    toggle.disabled = !canShowReplaceToggle;
    toggle.setAttribute('aria-hidden', String(!canShowReplaceToggle));
  }
  if (!canKeepReplacePanelOpen && isReplaceOpen) setReplacePanel(false);
  syncReplaceActionAvailability();
}

function syncReplaceActionAvailability() {
  const replaceOneButton = document.getElementById('replaceOneBtn');
  const replaceAllButton = document.getElementById('replaceAllBtn');
  const query = document.getElementById('findInp')?.value || '';
  const hideReplaceActions = Boolean(query && !findMatches.length);

  [replaceOneButton, replaceAllButton].forEach(button => {
    if (!button) return;
    button.hidden = hideReplaceActions;
    button.disabled = hideReplaceActions;
    button.setAttribute('aria-hidden', String(hideReplaceActions));
  });
}

function handleEditorScrollReveal() {
  const editor = document.getElementById('editor');
  if (!editor) return;
  handleFocusScrollStatsReveal(editor);
  if (typeof isEditorCaretAutoScrollSuppressed === 'function' && isEditorCaretAutoScrollSuppressed()) {
    editor.classList.remove('is-scrolling');
    clearTimeout(editorScrollHideTimer);
    updateEditorScrollThumb(false);
    return;
  }
  if (editor.classList.contains('has-find-rail')) {
    editor.classList.remove('is-scrolling');
    isEditorScrollbarHovered = false;
    clearTimeout(editorScrollHideTimer);
    updateEditorScrollThumb(false);
    return;
  }
  editor.classList.add('is-scrolling');
  updateEditorScrollThumb(true);
  clearTimeout(editorScrollHideTimer);
  editorScrollHideTimer = setTimeout(() => {
    editor.classList.remove('is-scrolling');
    updateEditorScrollThumb(false);
  }, 850);
}

function setEditorScrollbarHover(isHovered) {
  const editor = document.getElementById('editor');
  isEditorScrollbarHovered = Boolean(isHovered);
  editor?.classList.toggle('is-scrollbar-hovered', isEditorScrollbarHovered);
  updateEditorScrollThumb(editor?.classList.contains('is-scrolling'));
}

function handleEditorScrollbarHover(event) {
  const editor = document.getElementById('editor');
  if (!editor || editor.classList.contains('has-find-rail')) {
    setEditorScrollbarHover(false);
    return;
  }

  const editorRect = editor.getBoundingClientRect();
  const hoverWidth = 18;
  const hoverBleed = 8;
  const isInsideY = event.clientY >= editorRect.top && event.clientY <= editorRect.bottom;
  const isNearScrollbar = event.clientX >= editorRect.right - hoverWidth && event.clientX <= editorRect.right + hoverBleed;
  setEditorScrollbarHover(isInsideY && isNearScrollbar);
}

function clearEditorScrollbarHover() {
  setEditorScrollbarHover(false);
}

function editorScrollMetrics() {
  const editor = document.getElementById('editor');
  const wrap = document.getElementById('editor-wrap');
  if (!editor || !wrap) return null;

  const maxScroll = editor.scrollHeight - editor.clientHeight;
  if (maxScroll <= 2 || editor.classList.contains('has-find-rail')) return null;

  const wrapRect = wrap.getBoundingClientRect();
  const editorRect = editor.getBoundingClientRect();
  const trackPadding = 14;
  const trackTop = editorRect.top - wrapRect.top + trackPadding;
  const trackHeight = Math.max(44, editorRect.height - trackPadding * 2);
  const thumbHeight = Math.min(trackHeight, Math.max(36, (editor.clientHeight / editor.scrollHeight) * trackHeight));
  const scrollableTrack = Math.max(1, trackHeight - thumbHeight);

  return { editor, wrap, maxScroll, trackTop, trackHeight, thumbHeight, scrollableTrack };
}

function startEditorScrollThumbDrag(event) {
  const thumb = document.getElementById('editor-scroll-thumb');
  const metrics = editorScrollMetrics();
  if (!thumb || !metrics) return;

  event.preventDefault();
  event.stopPropagation();
  if (typeof markEditorManualScrollOverride === 'function') {
    markEditorManualScrollOverride({ source: 'scrollbar-thumb', showThumb: false });
  }
  clearTimeout(editorScrollHideTimer);
  editorScrollThumbDrag = {
    pointerId: event.pointerId,
    startY: event.clientY,
    startScrollTop: metrics.editor.scrollTop,
    maxScroll: metrics.maxScroll,
    scrollableTrack: metrics.scrollableTrack
  };
  isEditorScrollbarHovered = true;
  metrics.editor.classList.add('is-scrolling');
  thumb.classList.add('is-dragging');
  thumb.setPointerCapture?.(event.pointerId);
  updateEditorScrollThumb(true);
}

function handleEditorScrollThumbDrag(event) {
  const drag = editorScrollThumbDrag;
  const editor = document.getElementById('editor');
  if (!drag || !editor || event.pointerId !== drag.pointerId) return;

  event.preventDefault();
  if (typeof markEditorManualScrollOverride === 'function') {
    markEditorManualScrollOverride({ source: 'scrollbar-thumb', showThumb: false });
  }
  const deltaY = event.clientY - drag.startY;
  const nextScrollTop = drag.startScrollTop + (deltaY / drag.scrollableTrack) * drag.maxScroll;
  editor.scrollTop = clampNumber(nextScrollTop, 0, drag.maxScroll);
  updateEditorScrollThumb(true);
}

function endEditorScrollThumbDrag(event) {
  const drag = editorScrollThumbDrag;
  if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;

  const editor = document.getElementById('editor');
  const thumb = document.getElementById('editor-scroll-thumb');
  thumb?.releasePointerCapture?.(drag.pointerId);
  thumb?.classList.remove('is-dragging');
  editorScrollThumbDrag = null;
  isEditorScrollbarHovered = false;
  editor?.classList.remove('is-scrollbar-hovered');
  if (editor) {
    editorScrollHideTimer = setTimeout(() => {
      editor.classList.remove('is-scrolling');
      updateEditorScrollThumb(false);
    }, 650);
  } else {
    updateEditorScrollThumb(false);
  }
}

function updateEditorScrollThumb(visible = false) {
  const editor = document.getElementById('editor');
  const thumb = document.getElementById('editor-scroll-thumb');
  const metrics = editorScrollMetrics();
  if (!editor || !thumb) return;

  if (metrics) {
    const wrapRect = metrics.wrap.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    const thumbTop = metrics.trackTop + (editor.scrollTop / metrics.maxScroll) * metrics.scrollableTrack;
    const thumbRight = Math.max(8, wrapRect.right - editorRect.right + 8);

    thumb.style.top = `${thumbTop}px`;
    thumb.style.right = `${thumbRight}px`;
    thumb.style.height = `${metrics.thumbHeight}px`;
  }

  if (typeof isEditorAutoScrollInProgress === 'function' && isEditorAutoScrollInProgress()) {
    thumb.hidden = true;
    thumb.classList.remove('is-visible', 'is-dragging');
    return;
  }

  const shouldShow = Boolean((visible || isEditorScrollbarHovered || editorScrollThumbDrag) && metrics);
  thumb.hidden = !shouldShow;
  thumb.classList.toggle('is-visible', shouldShow);
}

function setFindPanel(open) {
  const wasOpen = Boolean(isFindOpen);
  if (open && !wasOpen && typeof prepareFloatingPanelFocusReturn === 'function') {
    prepareFloatingPanelFocusReturn('find-bar');
  }
  if (open && !wasOpen) captureFindPanelReturnSelection();
  if (open && typeof suspendVirtualEditorForFullDOM === 'function') {
    Promise.resolve(suspendVirtualEditorForFullDOM()).then(materialized => {
      if (materialized && isFindOpen) refreshFindResultsFromOpenQuery();
    });
  }
  isFindOpen = open;
  const findBar = document.getElementById('find-bar');
  const findBtn = document.getElementById('findBtn');
  if (!findBar) return;
  findBar.hidden = !open;
  if (findBtn) findBtn.setAttribute('aria-expanded', String(open));
  syncFindReplaceAvailability();
  if (open) {
    setToolDock(false);
    setReplacePanel(false);
    positionFindPanelFromDock();
    if (isFocus && typeof claimFocusPanelSlot === 'function') claimFocusPanelSlot(findBar, 'center');
    refreshFindResultsFromOpenQuery();
    focusFindInputWithSelection();
  } else {
    setReplacePanel(false);
    const didSelectReplacement = wasOpen && selectLastReplacementInEditorForFindClose();
    if (wasOpen && typeof flushVirtualEditorPatchBatch === 'function') flushVirtualEditorPatchBatch();
    if (activeVirtualEditorDocument?.temporaryReason === 'find') {
      activeVirtualEditorDocument.temporaryReason = 'caret-inactive';
    }
    const didSelectMatch = !didSelectReplacement && wasOpen && selectCurrentFindMatchInEditor();
    if (!didSelectReplacement && !didSelectMatch) {
      clearHighlights();
      const matchCount = document.getElementById('matchCount');
      if (matchCount) matchCount.textContent = '';
      if (wasOpen) restoreFindPanelReturnSelection();
    }
  }
}

function toggleReplacePanel() {
  if (!canEditActiveDocument()) {
    setReplacePanel(false);
    return;
  }
  const nextOpen = !isReplaceOpen;
  setReplacePanel(nextOpen);
  if (nextOpen) focusReplaceInputWithSelection({ select: false });
}

function setReplacePanel(open) {
  const wasOpen = Boolean(isReplaceOpen);
  const safeOpen = Boolean(open && canEditActiveDocument());
  if (safeOpen) shouldFocusFindCloseAfterReplaceClose = false;
  isReplaceOpen = safeOpen;
  const findBar = document.getElementById('find-bar');
  const toggle = document.getElementById('replaceToggleBtn');
  if (findBar) findBar.classList.toggle('is-replace-open', safeOpen);
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(safeOpen));
    toggle.title = safeOpen ? text().hideReplace : text().showReplace;
  }
  if (wasOpen && !safeOpen) resolveFindCloseFocusAfterReplaceClose();
  requestAnimationFrame(positionFindPanelFromDock);
}

function normalizeReplaceAllScope(scope) {
  return typeof normalizeEditorReplaceScope === 'function'
    ? normalizeEditorReplaceScope(scope)
    : ['after', 'before', 'all'].includes(scope) ? scope : 'all';
}

function clearHighlights(options = {}) {
  const editor = document.getElementById('editor');
  unwrapHighlights(editor);
  findMatches = [];
  findIdx = 0;
  if (options.sync !== false) {
    updateFindMatchCount();
    renderFindMarkerRail();
  }
}

function currentFindMatchSelectionSnapshot() {
  const editor = document.getElementById('editor');
  const currentMatch = findMatches[findIdx];
  if (!editor || !currentMatch?.isConnected || !editor.contains(currentMatch)) return null;

  const range = document.createRange();
  range.selectNodeContents(currentMatch);
  const snapshot = editorRangeToTextOffsets(range, editor);
  range.detach?.();
  return snapshot;
}

function selectCurrentFindMatchInEditor() {
  const snapshot = currentFindMatchSelectionSnapshot();
  if (!snapshot) return false;

  if (typeof discardFloatingPanelFocusReturn === 'function') {
    discardFloatingPanelFocusReturn('find-bar');
  }
  clearHighlights();
  const matchCount = document.getElementById('matchCount');
  if (matchCount) matchCount.textContent = '';
  findPanelReturnSelection = null;
  findPanelSearchAnchorSelection = null;
  findPanelLastReplacementSelection = null;
  const didRestoreSelection = restoreEditorSelectionFromTextOffsets(snapshot);
  if (didRestoreSelection && typeof syncEditorAutoScrollDepthMarkerToSelection === 'function') {
    syncEditorAutoScrollDepthMarkerToSelection({ persist: false });
  }
  return didRestoreSelection;
}

function isFindCloseLoopAutoScrollMode() {
  const canUseAutoScroll = typeof isEditorAutoScrollSystemActive === 'function'
    ? isEditorAutoScrollSystemActive()
    : Boolean(typeof isEditorAutoScrollEnabled !== 'undefined' && isEditorAutoScrollEnabled);
  return Boolean(
    canUseAutoScroll &&
    typeof isEditorAutoScrollBandMode === 'function' &&
    isEditorAutoScrollBandMode()
  );
}

function replacementSelectionSnapshotFromMatchSnapshot(matchSnapshot, replacement) {
  if (!matchSnapshot || !Number.isFinite(matchSnapshot.start)) return null;
  const replacementLength = String(replacement ?? '').length;
  if (replacementLength <= 0) return null;
  return {
    ...matchSnapshot,
    end: matchSnapshot.start + replacementLength
  };
}

function selectLastReplacementInEditorForFindClose() {
  if (!isFindCloseLoopAutoScrollMode() || !findPanelLastReplacementSelection) return false;

  if (typeof discardFloatingPanelFocusReturn === 'function') {
    discardFloatingPanelFocusReturn('find-bar');
  }
  clearHighlights();
  const matchCount = document.getElementById('matchCount');
  if (matchCount) matchCount.textContent = '';
  const snapshot = findPanelLastReplacementSelection;
  findPanelReturnSelection = null;
  findPanelSearchAnchorSelection = null;
  findPanelLastReplacementSelection = null;
  const didRestoreSelection = restoreEditorSelectionFromTextOffsets(snapshot);
  if (didRestoreSelection && typeof syncEditorAutoScrollDepthMarkerToSelection === 'function') {
    syncEditorAutoScrollDepthMarkerToSelection({ persist: false });
  }
  return didRestoreSelection;
}

function findMatchIndexForEditorSnapshot(snapshot) {
  const editor = document.getElementById('editor');
  if (!editor || !snapshot || !findMatches.length) return -1;
  if (
    snapshot.documentKey &&
    typeof activeEditorStorageKey === 'function' &&
    snapshot.documentKey !== activeEditorStorageKey()
  ) {
    return -1;
  }
  if (!Number.isFinite(snapshot.start) || !Number.isFinite(snapshot.end) || snapshot.start === snapshot.end) return -1;

  for (let index = 0; index < findMatches.length; index += 1) {
    const range = document.createRange();
    range.selectNodeContents(findMatches[index]);
    const matchSnapshot = editorRangeToTextOffsets(range, editor);
    range.detach?.();
    if (matchSnapshot?.start === snapshot.start && matchSnapshot?.end === snapshot.end) {
      return index;
    }
  }

  return -1;
}

function findMatchIndexAfterEditorSnapshot(snapshot) {
  const editor = document.getElementById('editor');
  if (!editor || !snapshot || !findMatches.length) return -1;
  if (
    snapshot.documentKey &&
    typeof activeEditorStorageKey === 'function' &&
    snapshot.documentKey !== activeEditorStorageKey()
  ) {
    return -1;
  }
  const anchorOffset = Number.isFinite(snapshot.end) ? snapshot.end : snapshot.start;
  if (!Number.isFinite(anchorOffset)) return -1;

  let firstMatchIndex = -1;
  for (let index = 0; index < findMatches.length; index += 1) {
    const range = document.createRange();
    range.selectNodeContents(findMatches[index]);
    const matchSnapshot = editorRangeToTextOffsets(range, editor);
    range.detach?.();
    if (!matchSnapshot) continue;
    if (firstMatchIndex === -1) firstMatchIndex = index;
    if (matchSnapshot.start >= anchorOffset) return index;
  }

  return firstMatchIndex;
}

function refreshFindResultsFromOpenQuery() {
  const findInput = document.getElementById('findInp');
  if (!findInput?.value) {
    updateFindMatchCount();
    renderFindMarkerRail();
    return;
  }
  doFind({
    preferredSnapshot: findPanelReturnSelection,
    searchAnchorSnapshot: findPanelSearchAnchorSelection
  });
}

function updateFindMatchCount() {
  const matchCount = document.getElementById('matchCount');
  if (!matchCount) {
    syncFindReplaceAvailability();
    return;
  }
  const query = document.getElementById('findInp')?.value || '';
  if (!query) {
    matchCount.textContent = '';
    syncFindReplaceAvailability();
    return;
  }
  matchCount.textContent = findMatches.length ? `${findIdx + 1}/${findMatches.length}` : '0/0';
  syncFindReplaceAvailability();
}

function renderFindMarkerRail() {
  const rail = document.getElementById('find-marker-rail');
  const editor = document.getElementById('editor');
  const wrap = document.getElementById('editor-wrap');
  const query = document.getElementById('findInp')?.value || '';
  if (!rail || !editor) return;

  const shouldShow = Boolean(query && findMatches.length);
  rail.hidden = !shouldShow;
  rail.innerHTML = '';
  editor.classList.toggle('has-find-rail', shouldShow);
  if (shouldShow) {
    editor.classList.remove('is-scrolling');
    clearTimeout(editorScrollHideTimer);
  }
  updateEditorScrollThumb(false);
  if (!shouldShow) return;

  if (wrap) {
    const editorRect = editor.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const editorStyle = window.getComputedStyle(editor);
    const topInset = parseFloat(editorStyle.paddingTop) || 54;
    const bottomInset = 48;
    const rightInset = 14;
    const railWidth = rail.offsetWidth || 8;
    const left = Math.max(0, editorRect.right - wrapRect.left - rightInset - railWidth);
    const top = Math.max(0, editorRect.top - wrapRect.top + topInset);
    const bottom = Math.max(0, wrapRect.bottom - editorRect.bottom + bottomInset);
    rail.style.left = `${Math.round(left)}px`;
    rail.style.right = 'auto';
    rail.style.top = `${Math.round(top)}px`;
    rail.style.bottom = `${Math.round(bottom)}px`;
  }

  const scrollHeight = Math.max(editor.scrollHeight, editor.clientHeight, 1);
  const markerMaxPercent = 98;
  findMatches.forEach((match, index) => {
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = `find-marker-dot${index === findIdx ? ' current' : ''}`;
    marker.tabIndex = -1;
    marker.title = `${index + 1}/${findMatches.length}`;
    const topPercent = Math.min(markerMaxPercent, Math.max(2, (match.offsetTop / scrollHeight) * 100));
    marker.style.top = `${topPercent}%`;
    marker.addEventListener('pointerdown', event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    });
    marker.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      goToFindMatch(index, { preservePanel: true });
    });
    rail.appendChild(marker);
  });
}

function preserveOpenFindPanelAfterMarkerNavigation() {
  const findBar = document.getElementById('find-bar');
  const findBtn = document.getElementById('findBtn');
  isFindOpen = true;
  if (findBar) findBar.hidden = false;
  if (findBtn) findBtn.setAttribute('aria-expanded', 'true');
  if (typeof positionFindPanelFromDock === 'function') positionFindPanelFromDock();
}

function goToFindMatch(index, options = {}) {
  if (!findMatches.length) return;
  if (options.preservePanel) preserveOpenFindPanelAfterMarkerNavigation();
  findIdx = Math.min(Math.max(index, 0), findMatches.length - 1);
  highlightCurrent();
  if (options.preservePanel) {
    preserveOpenFindPanelAfterMarkerNavigation();
    requestAnimationFrame(preserveOpenFindPanelAfterMarkerNavigation);
  }
}

function clampFindScrollValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scrollFindMatchToAutoScrollDepth(match) {
  const editor = document.getElementById('editor');
  if (!editor || !match?.isConnected || !editor.contains(match)) return false;
  const canUseAutoScroll = typeof isEditorAutoScrollSystemActive === 'function'
    ? isEditorAutoScrollSystemActive()
    : Boolean(isEditorAutoScrollEnabled);
  if (!canUseAutoScroll) return false;

  const editorRect = editor.getBoundingClientRect();
  const matchRect = match.getBoundingClientRect();
  if (!editorRect.height || !matchRect.height) return false;

  const depth = typeof editorAutoScrollTargetDepthPx === 'function'
    ? editorAutoScrollTargetDepthPx(editor)
    : typeof editorAutoScrollDepthPx === 'function'
      ? editorAutoScrollDepthPx(editor)
    : editor.clientHeight * 0.72;
  const safeDepth = Number.isFinite(depth) && depth > 0
    ? clampFindScrollValue(depth, 0, editor.clientHeight)
    : editor.clientHeight / 2;
  const matchCenterY = matchRect.top - editorRect.top + (matchRect.height / 2);
  const maxScrollTop = Math.max(0, editor.scrollHeight - editor.clientHeight);
  const nextScrollTop = clampFindScrollValue(editor.scrollTop + matchCenterY - safeDepth, 0, maxScrollTop);

  if (typeof setEditorAutoScrollTop === 'function') {
    setEditorAutoScrollTop(editor, nextScrollTop);
  } else {
    editor.scrollTop = nextScrollTop;
  }
  return true;
}

function doFind(options = {}) {
  const query = document.getElementById('findInp').value;
  clearHighlights({ sync: false });
  if (!query) {
    updateFindMatchCount();
    renderFindMarkerRail();
    return;
  }
  const editor = document.getElementById('editor');
  const findMode = typeof currentEditorFindMode === 'function' ? currentEditorFindMode() : 'deep';

  getEditorTextNodes().forEach(node => {
    if (!countEditorFindMatches(node.nodeValue, query, findMode)) return;
    node.replaceWith(buildHighlightedFragment(node.nodeValue, query, { mode: findMode }));
  });

  findMatches = [...editor.querySelectorAll('mark.highlight-find')];
  if (findMatches.length) {
    const preferredIndex = findMatchIndexForEditorSnapshot(options.preferredSnapshot);
    const anchorIndex = preferredIndex >= 0
      ? preferredIndex
      : findMatchIndexAfterEditorSnapshot(options.searchAnchorSnapshot || findPanelSearchAnchorSelection);
    findIdx = anchorIndex >= 0 ? anchorIndex : 0;
    highlightCurrent();
  } else {
    updateFindMatchCount();
    renderFindMarkerRail();
  }
}

function highlightCurrent() {
  findMatches.forEach((match, index) => match.classList.toggle('current', index === findIdx));
  updateFindMatchCount();
  renderFindMarkerRail();
  const currentMatch = findMatches[findIdx];
  if (currentMatch && !scrollFindMatchToAutoScrollDepth(currentMatch)) {
    currentMatch.scrollIntoView({ block: 'center' });
  }
}

function nextMatch() {
  if (!findMatches.length) return;
  findIdx = (findIdx + 1) % findMatches.length;
  highlightCurrent();
}

function prevMatch() {
  if (!findMatches.length) return;
  findIdx = (findIdx - 1 + findMatches.length) % findMatches.length;
  highlightCurrent();
}

function replacementCountReminderMessage(count) {
  const safeCount = Math.max(0, Number(count) || 0);
  if (!safeCount) return '';
  const copy = typeof text === 'function' ? text() : {};
  if (safeCount === 1) return copy.replaceCountSingle || '1 word replaced';
  const template = copy.replaceCountMany || '{count} words replaced';
  return template.replace('{count}', String(safeCount));
}

function showReplacementCountReminder(count) {
  const message = replacementCountReminderMessage(count);
  if (message && typeof showMiniReminder === 'function') showMiniReminder(message);
}

function replaceOne() {
  if (!canEditActiveDocument()) return;
  const query = document.getElementById('findInp').value;
  const replacement = document.getElementById('replInp').value;
  if (!query) return;
  const currentMatch = findMatches[findIdx];
  if (!currentMatch) {
    doFind();
    return;
  }

  const matchSnapshot = currentFindMatchSelectionSnapshot();
  const parent = currentMatch.parentNode;
  if (typeof captureEditorHistorySnapshot === 'function') {
    captureEditorHistorySnapshot('replace-one-before', { force: true });
  }
  currentMatch.replaceWith(document.createTextNode(replacement));
  if (parent) parent.normalize();
  const nextMatchAnchor = matchSnapshot
    ? {
      ...matchSnapshot,
      start: matchSnapshot.start + replacement.length,
      end: matchSnapshot.start + replacement.length
    }
    : null;
  findPanelLastReplacementSelection = replacementSelectionSnapshotFromMatchSnapshot(matchSnapshot, replacement);
  doFind({ searchAnchorSnapshot: nextMatchAnchor });
  if (typeof captureEditorHistorySnapshot === 'function') {
    captureEditorHistorySnapshot('replace-one-after', { force: true });
  }
  updateStats();
  showReplacementCountReminder(1);
}

function replaceFindMatchElements(matches, replacement) {
  matches.forEach(match => {
    if (!match?.isConnected) return;
    const parent = match.parentNode;
    match.replaceWith(document.createTextNode(replacement));
    if (parent) parent.normalize();
  });
}

function findReplacementEditSnapshots(matches, replacement) {
  const editor = document.getElementById('editor');
  if (!editor) return [];
  const replacementLength = String(replacement ?? '').length;

  return matches
    .map(match => {
      if (!match?.isConnected || !editor.contains(match)) return null;
      const range = document.createRange();
      range.selectNodeContents(match);
      const snapshot = editorRangeToTextOffsets(range, editor);
      range.detach?.();
      if (!snapshot || !Number.isFinite(snapshot.start) || !Number.isFinite(snapshot.end)) return null;
      return {
        start: snapshot.start,
        end: snapshot.end,
        replacementLength,
        delta: replacementLength - Math.max(0, snapshot.end - snapshot.start)
      };
    })
    .filter(Boolean)
    .sort((first, second) => first.start - second.start || first.end - second.end);
}

function remapTextOffsetAfterReplacementEdits(offset, edits) {
  if (!Number.isFinite(offset) || !Array.isArray(edits) || !edits.length) return offset;
  let shift = 0;

  for (const edit of edits) {
    if (!edit || !Number.isFinite(edit.start) || !Number.isFinite(edit.end)) continue;
    const oldStart = edit.start;
    const oldEnd = Math.max(oldStart, edit.end);
    const replacementLength = Math.max(0, Number(edit.replacementLength) || 0);
    const newStart = oldStart + shift;
    const newEnd = newStart + replacementLength;

    if (offset < oldStart) break;
    if (offset > oldEnd) {
      shift += Number(edit.delta) || 0;
      continue;
    }
    if (offset === oldStart) return newStart;
    if (offset === oldEnd) return newEnd;
    return newStart + Math.min(Math.max(0, offset - oldStart), replacementLength);
  }

  return offset + shift;
}

function remapSelectionSnapshotAfterReplacementEdits(snapshot, edits) {
  if (!snapshot || !Array.isArray(edits) || !edits.length) return snapshot;
  const start = remapTextOffsetAfterReplacementEdits(snapshot.start, edits);
  const end = remapTextOffsetAfterReplacementEdits(snapshot.end, edits);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return snapshot;
  return {
    ...snapshot,
    start: Math.max(0, Math.min(start, end)),
    end: Math.max(0, Math.max(start, end))
  };
}

function remapFindPanelReturnSelectionAfterReplacementEdits(edits) {
  findPanelReturnSelection = remapSelectionSnapshotAfterReplacementEdits(findPanelReturnSelection, edits);
  findPanelSearchAnchorSelection = remapSelectionSnapshotAfterReplacementEdits(findPanelSearchAnchorSelection, edits);
}

function replacementSelectionSnapshotFromEdits(snapshot, edits) {
  if (!snapshot || !Array.isArray(edits) || !edits.length) return null;
  const sourceStart = Number(snapshot.start);
  const sourceEnd = Number(snapshot.end);
  if (!Number.isFinite(sourceStart) || !Number.isFinite(sourceEnd) || sourceStart === sourceEnd) return null;

  let shift = 0;
  for (const edit of edits) {
    if (!edit || !Number.isFinite(edit.start) || !Number.isFinite(edit.end)) continue;
    const oldStart = edit.start;
    const oldEnd = Math.max(oldStart, edit.end);
    const replacementLength = Math.max(0, Number(edit.replacementLength) || 0);
    const newStart = oldStart + shift;
    const newEnd = newStart + replacementLength;
    if (sourceStart < oldEnd && sourceEnd > oldStart && newEnd > newStart) {
      return {
        ...snapshot,
        start: newStart,
        end: newEnd
      };
    }
    shift += Number(edit.delta) || 0;
  }

  return null;
}

function scopedReplaceAllMatches(query, scope = 'all') {
  if (!findMatches.length && query) doFind();
  if (!findMatches.length) return [];
  const safeScope = normalizeReplaceAllScope(scope);
  if (safeScope === 'all') return [...findMatches];
  const currentIndex = Math.min(Math.max(findIdx, 0), findMatches.length - 1);
  if (safeScope === 'after') return findMatches.slice(currentIndex);
  return findMatches.slice(0, currentIndex);
}

function replaceAll(scope) {
  const selectedScope = scope ?? (
    typeof currentEditorReplaceScope === 'function'
      ? currentEditorReplaceScope()
      : 'all'
  );
  const safeScope = normalizeReplaceAllScope(selectedScope);
  if (scope !== undefined && typeof setEditorReplaceScope === 'function') setEditorReplaceScope(safeScope);
  if (!canEditActiveDocument()) {
    return;
  }
  const query = document.getElementById('findInp').value;
  const replacement = document.getElementById('replInp').value;
  if (!query) {
    return;
  }
  const targetMatches = scopedReplaceAllMatches(query, safeScope);
  if (!targetMatches.length) {
    return;
  }
  if (typeof captureEditorHistorySnapshot === 'function') {
    captureEditorHistorySnapshot('replace-all-before', { force: true });
  }
  const replacementEdits = findReplacementEditSnapshots(targetMatches, replacement);
  const lastReplacementSelection = replacementSelectionSnapshotFromEdits(findPanelReturnSelection, replacementEdits);
  replaceFindMatchElements(targetMatches, replacement);
  remapFindPanelReturnSelectionAfterReplacementEdits(replacementEdits);
  findPanelLastReplacementSelection = lastReplacementSelection;
  syncSavedEditorRangeFromTextOffsets(findPanelReturnSelection);
  if (isReplaceOpen) queueFindCloseFocusAfterReplaceClose();
  doFind({
    searchAnchorSnapshot: findPanelSearchAnchorSelection,
    preferredSnapshot: findPanelReturnSelection
  });
  if (findMatches.length) shouldFocusFindCloseAfterReplaceClose = false;
  if (typeof captureEditorHistorySnapshot === 'function') {
    captureEditorHistorySnapshot('replace-all-after', { force: true });
  }
  updateStats();
  showReplacementCountReminder(targetMatches.length);
}

function fillPrompt() {
  const select = document.getElementById('ai-prompt-select');
  if (select.value) {
    document.getElementById('ai-input').value = select.value;
    select.value = '';
    queueCustomSelectSync();
  }
}

const AI_DESK_STORAGE_PREFIX = 'lm_ai_desk_state:';
const AI_NORMAL_BRIDGE_URL = 'http://127.0.0.1:8797/gpt/chat';
const AI_PROVIDER_DEFINITIONS = [
  {
    id: 'openai',
    label: 'ChatGPT / OpenAI',
    shortLabel: 'ChatGPT',
    badge: 'GPT',
    bridgePlaceholder: 'http://localhost:8787/openai/chat'
  },
  {
    id: 'gemini',
    label: 'Gemini / Google AI',
    shortLabel: 'Gemini',
    badge: 'G',
    bridgePlaceholder: 'http://localhost:8787/gemini/chat'
  },
  {
    id: 'claude',
    label: 'Claude / Anthropic',
    shortLabel: 'Claude',
    badge: 'C',
    bridgePlaceholder: 'http://localhost:8787/claude/chat'
  },
  {
    id: 'custom',
    label: 'Custom AI Bridge',
    shortLabel: 'Custom',
    badge: 'AI',
    bridgePlaceholder: 'http://localhost:8787/ai/chat'
  }
];

let aiDeskState = null;
let aiDeskStateKey = '';

function aiProjectStorageId() {
  const folderName = projectDirectoryHandle?.name || localStorage.getItem(PROJECT_FOLDER_KEY) || '';
  const manifestTitle = normalizeProjectManifest(projectManifest || createProjectManifest()).title;
  return uniqueNameKey(folderName || manifestTitle || 'workspace');
}

function aiDeskStorageKey() {
  return `${AI_DESK_STORAGE_PREFIX}${aiProjectStorageId()}`;
}

function aiProviderDefinition(providerId = 'openai') {
  return AI_PROVIDER_DEFINITIONS.find(provider => provider.id === providerId) || AI_PROVIDER_DEFINITIONS[0];
}

function defaultAIAccount(providerId) {
  return {
    providerId,
    connected: false,
    accountName: '',
    authMode: 'bridge',
    bridgeUrl: '',
    token: '',
    connectedAt: null,
    updatedAt: null
  };
}

function normalizeAIAccount(account = {}, providerId = 'openai') {
  const normalizedProviderId = aiProviderDefinition(account.providerId || providerId).id;
  return {
    providerId: normalizedProviderId,
    connected: Boolean(account.connected),
    accountName: String(account.accountName || account.name || '').trim(),
    authMode: ['bridge', 'oauth', 'manual'].includes(account.authMode) ? account.authMode : 'bridge',
    bridgeUrl: String(account.bridgeUrl || account.endpoint || '').trim(),
    token: String(account.token || account.apiKey || '').trim(),
    connectedAt: account.connectedAt || null,
    updatedAt: account.updatedAt || account.connectedAt || null
  };
}

function normalizeAIMessage(message = {}, index = 0) {
  const role = message.role === 'user' ? 'user' : 'assistant';
  return {
    id: String(message.id || `ai-msg-${Date.now()}-${index}`),
    role,
    content: String(message.content || message.message || ''),
    providerId: aiProviderDefinition(message.providerId || 'openai').id,
    createdAt: message.createdAt || new Date().toISOString()
  };
}

function normalizeAINormalMessage(message = {}, index = 0) {
  const role = message.role === 'user' ? 'user' : 'assistant';
  return {
    id: String(message.id || `ai-normal-msg-${Date.now()}-${index}`),
    role,
    content: String(message.content || message.message || ''),
    createdAt: message.createdAt || new Date().toISOString()
  };
}

function normalizeAIThread(thread = {}, index = 0) {
  const providerId = aiProviderDefinition(thread.providerId || 'openai').id;
  const createdAt = thread.createdAt || new Date().toISOString();
  return {
    id: String(thread.id || `ai-thread-${Date.now()}-${index}`),
    providerId,
    title: String(thread.title || text().aiChatUntitled || 'New chat').trim(),
    createdAt,
    updatedAt: thread.updatedAt || createdAt,
    messages: Array.isArray(thread.messages)
      ? thread.messages.map((message, messageIndex) => normalizeAIMessage({ ...message, providerId: message.providerId || providerId }, messageIndex))
      : []
  };
}

function defaultAIDeskState() {
  return {
    activeMode: 'normal',
    activeProviderId: 'openai',
    activeThreadId: '',
    connectionPanelOpen: false,
    manualBoard: '',
    manualBoardUpdatedAt: null,
    normalChatStarted: false,
    normalMessages: [],
    accounts: Object.fromEntries(AI_PROVIDER_DEFINITIONS.map(provider => [provider.id, defaultAIAccount(provider.id)])),
    threads: []
  };
}

function normalizeAIDeskState(rawState = {}) {
  const fallback = defaultAIDeskState();
  const activeProviderId = aiProviderDefinition(rawState.activeProviderId || fallback.activeProviderId).id;
  const rawAccounts = rawState.accounts && typeof rawState.accounts === 'object' ? rawState.accounts : {};
  const accounts = Object.fromEntries(AI_PROVIDER_DEFINITIONS.map(provider => [
    provider.id,
    normalizeAIAccount(rawAccounts[provider.id] || {}, provider.id)
  ]));
  const threads = Array.isArray(rawState.threads)
    ? rawState.threads.map(normalizeAIThread)
    : [];
  const activeThreadId = threads.some(thread => thread.id === rawState.activeThreadId)
    ? rawState.activeThreadId
    : '';

  return {
    activeMode: rawState.activeMode === 'tool' ? 'tool' : fallback.activeMode,
    activeProviderId,
    activeThreadId,
    connectionPanelOpen: Boolean(rawState.connectionPanelOpen),
    manualBoard: String(rawState.manualBoard || ''),
    manualBoardUpdatedAt: rawState.manualBoardUpdatedAt || null,
    normalChatStarted: Boolean(rawState.normalChatStarted),
    normalMessages: Array.isArray(rawState.normalMessages)
      ? rawState.normalMessages.map(normalizeAINormalMessage)
      : [],
    accounts,
    threads
  };
}

function loadAIDeskState() {
  const storageKey = aiDeskStorageKey();
  if (aiDeskState && aiDeskStateKey === storageKey) return aiDeskState;
  aiDeskStateKey = storageKey;
  try {
    aiDeskState = normalizeAIDeskState(JSON.parse(localStorage.getItem(storageKey) || 'null') || {});
  } catch (error) {
    aiDeskState = defaultAIDeskState();
  }
  ensureActiveAIThread(aiDeskState);
  return aiDeskState;
}

function saveAIDeskState() {
  const state = loadAIDeskState();
  localStorage.setItem(aiDeskStorageKey(), JSON.stringify(state));
}

function activeAIProvider(state = loadAIDeskState()) {
  return aiProviderDefinition(state.activeProviderId);
}

function activeAIAccount(state = loadAIDeskState()) {
  const provider = activeAIProvider(state);
  state.accounts[provider.id] = normalizeAIAccount(state.accounts[provider.id], provider.id);
  return state.accounts[provider.id];
}

function activeAIMode(state = loadAIDeskState()) {
  return state.activeMode === 'tool' ? 'tool' : 'normal';
}

function ensureActiveAIThread(state = loadAIDeskState()) {
  const provider = activeAIProvider(state);
  let thread = state.threads.find(item => item.id === state.activeThreadId && item.providerId === provider.id);
  if (thread) return thread;

  thread = state.threads
    .filter(item => item.providerId === provider.id)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))[0];
  if (thread) {
    state.activeThreadId = thread.id;
    return thread;
  }

  thread = normalizeAIThread({
    id: `ai-thread-${Date.now()}`,
    providerId: provider.id,
    title: text().aiChatUntitled || 'New chat',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: []
  });
  state.threads.unshift(thread);
  state.activeThreadId = thread.id;
  return thread;
}

function aiThreadTitleFromMessage(message) {
  const cleaned = String(message || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return text().aiChatUntitled || 'New chat';
  return cleaned.length > 42 ? `${cleaned.slice(0, 42)}...` : cleaned;
}

function aiThreadLabel(thread) {
  const date = new Date(thread.updatedAt || thread.createdAt);
  const timeLabel = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(text().locale, { month: 'short', day: 'numeric' });
  return `${thread.title || text().aiChatUntitled}${timeLabel ? ` - ${timeLabel}` : ''}`;
}

function aiMessageHtml(message) {
  const provider = aiProviderDefinition(message.providerId);
  const roleLabel = message.role === 'user' ? 'You' : provider.shortLabel;
  return `
    <div class="ai-msg ai-${message.role === 'user' ? 'user' : 'bot'}">
      <div class="ai-msg-meta">${escapeHtml(roleLabel)}</div>
      <div class="ai-msg-text">${escapeHtml(message.content).replace(/\n/g, '<br>')}</div>
    </div>`;
}

function aiNormalMessageHtml(message) {
  const roleLabel = message.role === 'user' ? 'You' : 'ChatGPT';
  return `
    <div class="ai-msg ai-${message.role === 'user' ? 'user' : 'bot'}">
      <div class="ai-msg-meta">${escapeHtml(roleLabel)}</div>
      <div class="ai-msg-text">${escapeHtml(message.content).replace(/\n/g, '<br>')}</div>
    </div>`;
}

function renderAINormalMessages(state = loadAIDeskState()) {
  const messages = document.getElementById('ai-normal-messages');
  if (!messages) return;
  if (!state.normalMessages.length) {
    messages.innerHTML = `
      <div class="ai-msg ai-bot">
        <div class="ai-msg-meta">ChatGPT</div>
        <div class="ai-msg-text">${escapeHtml(text().aiNormalIntro || 'Send a message to the local ChatGPT app bridge.')}</div>
      </div>`;
    scrollAINormal();
    return;
  }
  messages.innerHTML = state.normalMessages.map(aiNormalMessageHtml).join('');
  scrollAINormal();
}

function renderAIModeShell(state = loadAIDeskState()) {
  const mode = activeAIMode(state);
  const panel = document.getElementById('ai-panel');
  const normalPanel = document.getElementById('ai-normal-mode-panel');
  const toolPanel = document.getElementById('ai-tool-mode-panel');
  const normalButton = document.getElementById('aiNormalModeBtn');
  const toolButton = document.getElementById('aiToolModeBtn');
  const manualInput = document.getElementById('ai-manual-board-input');

  if (panel) panel.dataset.aiMode = mode;
  if (normalPanel) normalPanel.hidden = mode !== 'normal';
  if (toolPanel) toolPanel.hidden = mode !== 'tool';
  if (normalButton) {
    normalButton.classList.toggle('is-active', mode === 'normal');
    normalButton.setAttribute('aria-selected', String(mode === 'normal'));
  }
  if (toolButton) {
    toolButton.classList.toggle('is-active', mode === 'tool');
    toolButton.setAttribute('aria-selected', String(mode === 'tool'));
  }
  if (manualInput && document.activeElement !== manualInput) {
    manualInput.value = state.manualBoard || '';
  }
  renderAINormalMessages(state);
}

function setAIMode(mode) {
  const state = loadAIDeskState();
  state.activeMode = mode === 'tool' ? 'tool' : 'normal';
  saveAIDeskState();
  renderAIDesk();
  if (state.activeMode === 'normal') {
    requestAnimationFrame(() => document.getElementById('ai-manual-board-input')?.focus());
  }
}

function saveAIManualBoard() {
  const state = loadAIDeskState();
  const manualInput = document.getElementById('ai-manual-board-input');
  state.manualBoard = manualInput?.value || '';
  state.manualBoardUpdatedAt = new Date().toISOString();
  saveAIDeskState();
  renderAIModeShell(state);
  showSidePanelSaveLine(text().aiManualBoardSaved || 'AI board saved');
}

function addAINormalMessage(message, role) {
  const state = loadAIDeskState();
  const timestamp = new Date().toISOString();
  state.normalMessages.push(normalizeAINormalMessage({
    id: `ai-normal-msg-${Date.now()}`,
    role,
    content: message,
    createdAt: timestamp
  }, state.normalMessages.length));
  saveAIDeskState();
  renderAINormalMessages(state);
}

function setAINormalThinking(visible = true) {
  const messages = document.getElementById('ai-normal-messages');
  if (!messages) return;
  document.getElementById('aiNormalThinkingMessage')?.remove();
  if (!visible) return;
  const div = document.createElement('div');
  div.id = 'aiNormalThinkingMessage';
  div.className = 'ai-msg ai-bot ai-typing';
  div.setAttribute('aria-label', text().aiNormalThinking || text().aiThinking || 'Thinking...');
  div.innerHTML = '<span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span>';
  messages.appendChild(div);
  scrollAINormal();
}

function normalizeAINormalReplyPayload(payload) {
  const reply = normalizeAIReplyPayload(payload);
  if (reply) return reply;
  if (payload && typeof payload.error === 'string') return payload.error;
  return '';
}

async function requestAINormalReply(message, options = {}) {
  const response = await fetch(AI_NORMAL_BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      newChat: Boolean(options.newChat),
      story: typeof aiActiveStoryContext === 'function' ? aiActiveStoryContext() : null
    })
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const errorMessage = normalizeAINormalReplyPayload(payload) || text().aiNormalBridgeFailed || 'ChatGPT bridge request failed.';
    throw new Error(errorMessage);
  }
  return normalizeAINormalReplyPayload(payload) || text().aiNormalBridgeFailed || 'ChatGPT bridge returned an empty response.';
}

async function sendAINormalMessage() {
  const input = document.getElementById('ai-manual-board-input');
  const sendButton = document.getElementById('aiNormalSendBtn');
  if (!input) return;
  const message = input.value.trim();
  if (!message) return;
  const shouldOpenNewChat = !loadAIDeskState().normalChatStarted;

  addAINormalMessage(message, 'user');
  const state = loadAIDeskState();
  state.manualBoard = '';
  state.manualBoardUpdatedAt = new Date().toISOString();
  saveAIDeskState();
  input.value = '';
  input.disabled = true;
  sendButton?.setAttribute('disabled', 'disabled');
  setAINormalThinking(true);

  try {
    const reply = await requestAINormalReply(message, { newChat: shouldOpenNewChat });
    setAINormalThinking(false);
    const successState = loadAIDeskState();
    successState.normalChatStarted = true;
    saveAIDeskState();
    addAINormalMessage(reply, 'assistant');
  } catch (error) {
    console.warn('Normal AI bridge failed:', error);
    setAINormalThinking(false);
    addAINormalMessage(error?.message || text().aiNormalBridgeFailed || 'ChatGPT bridge request failed.', 'assistant');
  } finally {
    input.disabled = false;
    sendButton?.removeAttribute('disabled');
    requestAnimationFrame(() => input.focus());
  }
}

function handleAINormalInputKey(event) {
  if (event.key !== 'Enter' || event.shiftKey) return;
  event.preventDefault();
  sendAINormalMessage();
}

function renderAIProviderOptions(state = loadAIDeskState()) {
  const select = document.getElementById('ai-provider-select');
  if (!select) return;
  select.innerHTML = AI_PROVIDER_DEFINITIONS
    .map(provider => `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.label)}</option>`)
    .join('');
  select.value = activeAIProvider(state).id;
}

let aiConnectionPanelPositionFrame = null;

function aiConnectionPanelPositionConfig() {
  const fallback = {
    gap: 12,
    topOffset: -4,
    leftOffset: 0,
    rightOffset: 0,
    panelWidth: 360,
    viewportPadding: 12
  };
  return window.lmFloatingPanelPositionConfig?.('aiConnectionPanel', fallback) || fallback;
}

function positionAIConnectionPanel() {
  aiConnectionPanelPositionFrame = null;
  const panel = document.getElementById('ai-connection-panel');
  const anchor = document.getElementById('aiConnectionToggle');
  if (!panel || panel.hidden || !anchor) return;

  const config = aiConnectionPanelPositionConfig();
  const numberValue = window.lmPanelNumber || ((value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  });
  const viewportPadding = numberValue(config.viewportPadding, 12);
  const gap = numberValue(config.gap, 12);
  const leftOffset = numberValue(config.leftOffset, 0);
  const rightOffset = numberValue(config.rightOffset, 0);
  const topOffset = numberValue(config.topOffset, -4);
  const panelWidth = Math.min(numberValue(config.panelWidth, 360), Math.max(180, window.innerWidth - viewportPadding * 2));
  const anchorRect = anchor.getBoundingClientRect();

  panel.style.width = `${Math.round(panelWidth)}px`;
  panel.style.maxHeight = `${Math.max(160, Math.round(window.innerHeight - viewportPadding * 2))}px`;

  const panelHeight = Math.min(
    panel.offsetHeight || panel.getBoundingClientRect().height || 320,
    Math.max(160, window.innerHeight - viewportPadding * 2)
  );
  let left = anchorRect.right + gap + leftOffset - rightOffset;
  if (left + panelWidth > window.innerWidth - viewportPadding) {
    left = anchorRect.left - panelWidth - gap + leftOffset - rightOffset;
  }
  left = Math.max(viewportPadding, Math.min(left, window.innerWidth - panelWidth - viewportPadding));

  const maxTop = Math.max(viewportPadding, window.innerHeight - panelHeight - viewportPadding);
  const top = Math.max(viewportPadding, Math.min(anchorRect.top + topOffset, maxTop));
  panel.style.inset = `${Math.round(top)}px auto auto ${Math.round(left)}px`;
}

function scheduleAIConnectionPanelPosition() {
  const panel = document.getElementById('ai-connection-panel');
  if (!panel || panel.hidden || aiConnectionPanelPositionFrame) return;
  aiConnectionPanelPositionFrame = requestAnimationFrame(positionAIConnectionPanel);
}

function renderAIConnectionPanel(state = loadAIDeskState()) {
  const provider = activeAIProvider(state);
  const account = activeAIAccount(state);
  const summary = document.getElementById('ai-account-summary');
  const panel = document.getElementById('ai-connection-panel');
  const toggle = document.getElementById('aiConnectionToggle');
  const accountInput = document.getElementById('ai-account-name');
  const authModeSelect = document.getElementById('ai-auth-mode');
  const bridgeInput = document.getElementById('ai-bridge-url');
  const tokenInput = document.getElementById('ai-api-token');

  if (summary) {
    const statusText = account.connected
      ? `${text().aiConnectedAs}: ${account.accountName || provider.label}`
      : text().aiNotConnected;
    summary.innerHTML = `
      <span class="ai-provider-badge">${escapeHtml(provider.badge)}</span>
      <span>${escapeHtml(statusText)}</span>`;
    summary.classList.toggle('is-connected', account.connected);
  }

  if (toggle) {
    toggle.textContent = account.connected ? text().aiAccountName : text().aiConnect;
    toggle.setAttribute('aria-expanded', String(state.connectionPanelOpen));
  }
  if (panel) {
    panel.hidden = !state.connectionPanelOpen;
    if (state.connectionPanelOpen) scheduleAIConnectionPanelPosition();
  }
  if (accountInput) accountInput.value = account.accountName || '';
  if (authModeSelect) authModeSelect.value = account.authMode || 'bridge';
  if (bridgeInput) {
    bridgeInput.value = account.bridgeUrl || '';
    bridgeInput.placeholder = provider.bridgePlaceholder;
  }
  if (tokenInput) {
    tokenInput.value = '';
    tokenInput.placeholder = account.token ? 'Saved locally - enter a new value to replace' : 'Optional, stored locally';
  }
}

function renderAIThreadSelect(state = loadAIDeskState()) {
  const select = document.getElementById('ai-thread-select');
  if (!select) return;
  const activeThread = ensureActiveAIThread(state);
  const providerId = activeAIProvider(state).id;
  const threads = state.threads
    .filter(thread => thread.providerId === providerId)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  select.innerHTML = threads
    .map(thread => `<option value="${escapeHtml(thread.id)}">${escapeHtml(aiThreadLabel(thread))}</option>`)
    .join('');
  select.value = activeThread.id;
}

function renderAIMessages(state = loadAIDeskState()) {
  const messages = document.getElementById('ai-messages');
  if (!messages) return;
  const thread = ensureActiveAIThread(state);
  if (!thread.messages.length) {
    messages.innerHTML = `
      <div class="ai-msg ai-bot lm-id-aiIntro" id="aiIntro">
        <div class="ai-msg-meta">${escapeHtml(activeAIProvider(state).shortLabel)}</div>
        <div class="ai-msg-text">${escapeHtml(text().aiIntro)}</div>
      </div>`;
    scrollAI();
    return;
  }
  messages.innerHTML = thread.messages.map(aiMessageHtml).join('');
  scrollAI();
}

function renderAIDesk() {
  const state = loadAIDeskState();
  ensureActiveAIThread(state);
  renderAIModeShell(state);
  renderAIProviderOptions(state);
  renderAIConnectionPanel(state);
  renderAIThreadSelect(state);
  renderAIMessages(state);
  queueCustomSelectSync();
}

function selectAIProvider(providerId) {
  const state = loadAIDeskState();
  state.activeProviderId = aiProviderDefinition(providerId).id;
  ensureActiveAIThread(state);
  saveAIDeskState();
  renderAIDesk();
}

function toggleAIConnectionPanel() {
  const state = loadAIDeskState();
  state.connectionPanelOpen = !state.connectionPanelOpen;
  saveAIDeskState();
  renderAIConnectionPanel(state);
  queueCustomSelectSync();
}

window.addEventListener('resize', scheduleAIConnectionPanelPosition);
window.addEventListener('scroll', scheduleAIConnectionPanelPosition, { capture: true, passive: true });

function saveAIConnection() {
  const state = loadAIDeskState();
  const provider = activeAIProvider(state);
  const existingAccount = activeAIAccount(state);
  const accountName = document.getElementById('ai-account-name')?.value.trim() || provider.label;
  const authMode = document.getElementById('ai-auth-mode')?.value || 'bridge';
  const bridgeUrl = document.getElementById('ai-bridge-url')?.value.trim() || '';
  const tokenValue = document.getElementById('ai-api-token')?.value.trim() || existingAccount.token || '';
  const timestamp = new Date().toISOString();

  state.accounts[provider.id] = normalizeAIAccount({
    providerId: provider.id,
    connected: true,
    accountName,
    authMode,
    bridgeUrl,
    token: tokenValue,
    connectedAt: existingAccount.connectedAt || timestamp,
    updatedAt: timestamp
  }, provider.id);
  state.connectionPanelOpen = false;
  saveAIDeskState();
  renderAIDesk();
  showSidePanelSaveLine(text().aiConnectionSaved);
}

function disconnectAIProvider() {
  const state = loadAIDeskState();
  const provider = activeAIProvider(state);
  state.accounts[provider.id] = defaultAIAccount(provider.id);
  state.connectionPanelOpen = false;
  saveAIDeskState();
  renderAIDesk();
  showSidePanelSaveLine(text().aiDisconnected);
}

function createAIThread() {
  const state = loadAIDeskState();
  const provider = activeAIProvider(state);
  const thread = normalizeAIThread({
    id: `ai-thread-${Date.now()}`,
    providerId: provider.id,
    title: text().aiChatUntitled || 'New chat',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: []
  });
  state.threads.unshift(thread);
  state.activeThreadId = thread.id;
  saveAIDeskState();
  renderAIDesk();
  requestAnimationFrame(() => document.getElementById('ai-input')?.focus());
}

function selectAIThread(threadId) {
  const state = loadAIDeskState();
  if (state.threads.some(thread => thread.id === threadId)) {
    state.activeThreadId = threadId;
    saveAIDeskState();
    renderAIDesk();
  }
}

function deleteActiveAIThread() {
  const state = loadAIDeskState();
  const thread = ensureActiveAIThread(state);
  state.threads = state.threads.filter(item => item.id !== thread.id);
  state.activeThreadId = '';
  ensureActiveAIThread(state);
  saveAIDeskState();
  renderAIDesk();
  showSidePanelSaveLine(text().aiChatDeleted);
}

function openAIAgentsDashboard() {
  window.open('ai-agents.html', '_blank');
}

function aiActiveStoryContext() {
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const activeDocument = activeEditorDocument?.() || {};
  const activeText = typeof getCleanEditorText === 'function' ? getCleanEditorText() : '';
  const namesSummary = Array.isArray(typeof namingData !== 'undefined' && namingData?.entries)
    ? namingData.entries.slice(0, 30).map(e => ({ name: e.name, category: e.categoryId, info: e.info || '' }))
    : [];
  const factsSummary = Array.isArray(typeof storyFacts !== 'undefined' && storyFacts)
    ? storyFacts.slice(0, 30).map(f => ({ text: f.text || f.title || '', pinned: Boolean(f.pinned) }))
    : [];

  return {
    storyTitle: manifest.title,
    storyType: manifest.type,
    language: manifest.language,
    activeDocumentTitle: typeof activeEditorDisplayTitle === 'function' ? activeEditorDisplayTitle() : activeDocument.title || '',
    activeDocumentMode: activeEditorMode,
    activeDocumentText: activeText.length > 6000 ? activeText.slice(-6000) : activeText,
    namingEntries: namesSummary,
    storyFacts: factsSummary
  };
}

function normalizeAIReplyPayload(payload) {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.reply === 'string') return payload.reply;
  if (typeof payload.message === 'string') return payload.message;
  if (typeof payload.content === 'string') return payload.content;
  if (typeof payload.output === 'string') return payload.output;
  const openAIReply = payload.choices?.[0]?.message?.content;
  if (typeof openAIReply === 'string') return openAIReply;
  const geminiParts = payload.candidates?.[0]?.content?.parts;
  if (Array.isArray(geminiParts)) {
    return geminiParts.map(part => part.text || '').filter(Boolean).join('\n');
  }
  return '';
}

async function requestAIReply(message, state = loadAIDeskState()) {
  const provider = activeAIProvider(state);
  const account = activeAIAccount(state);
  const thread = ensureActiveAIThread(state);
  if (!account.connected) return text().aiUnavailable;
  if (!account.bridgeUrl) {
    return account.authMode === 'manual'
      ? text().aiManualMode
      : text().aiNoBridge;
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-Lekhak-AI-Provider': provider.id
  };
  if (account.token) headers.Authorization = `Bearer ${account.token}`;

  const response = await fetch(account.bridgeUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      provider: provider.id,
      providerLabel: provider.label,
      account: {
        name: account.accountName,
        authMode: account.authMode
      },
      story: aiActiveStoryContext(),
      thread: {
        id: thread.id,
        title: thread.title
      },
      messages: thread.messages.map(item => ({
        role: item.role === 'user' ? 'user' : 'assistant',
        content: item.content
      })),
      input: message
    })
  });

  if (!response.ok) throw new Error(`AI bridge returned ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  return normalizeAIReplyPayload(payload) || text().aiBridgeFailed;
}

function setAIThinking(visible = true) {
  const messages = document.getElementById('ai-messages');
  if (!messages) return;
  document.getElementById('aiThinkingMessage')?.remove();
  if (!visible) return;
  const div = document.createElement('div');
  div.id = 'aiThinkingMessage';
  div.className = 'ai-msg ai-bot ai-typing';
  div.setAttribute('aria-label', text().aiThinking);
  div.innerHTML = '<span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span>';
  messages.appendChild(div);
  scrollAI();
}

async function sendAI() {
  const input = document.getElementById('ai-input');
  if (!input) return;
  const message = input.value.trim();
  if (!message) return;
  addAIMsg(message, 'user');
  input.value = '';
  input.disabled = true;
  document.getElementById('ai-send')?.setAttribute('disabled', 'disabled');
  setAIThinking(true);

  try {
    const reply = await requestAIReply(message);
    setAIThinking(false);
    addAIMsg(reply, 'bot');
  } catch (error) {
    console.warn('AI bridge failed:', error);
    setAIThinking(false);
    addAIMsg(text().aiBridgeFailed, 'bot');
  } finally {
    input.disabled = false;
    document.getElementById('ai-send')?.removeAttribute('disabled');
    requestAnimationFrame(() => input.focus());
  }
}

function addAIMsg(message, who) {
  const state = loadAIDeskState();
  const provider = activeAIProvider(state);
  const thread = ensureActiveAIThread(state);
  const role = who === 'user' ? 'user' : 'assistant';
  const timestamp = new Date().toISOString();
  thread.messages.push(normalizeAIMessage({
    id: `ai-msg-${Date.now()}`,
    role,
    content: message,
    providerId: provider.id,
    createdAt: timestamp
  }, thread.messages.length));
  if (role === 'user' && (!thread.title || thread.title === (text().aiChatUntitled || 'New chat'))) {
    thread.title = aiThreadTitleFromMessage(message);
  }
  thread.updatedAt = timestamp;
  saveAIDeskState();
  renderAIThreadSelect(state);
  renderAIMessages(state);
  queueCustomSelectSync();
}

function scrollAI() {
  const messages = document.getElementById('ai-messages');
  if (messages) messages.scrollTop = messages.scrollHeight;
}

function scrollAINormal() {
  const messages = document.getElementById('ai-normal-messages');
  if (messages) messages.scrollTop = messages.scrollHeight;
}

let focusModeHistoryActive = false;
let suppressNextFocusHistoryPop = false;

function focusModeHistoryState() {
  const currentState = history.state;
  const baseState = currentState && typeof currentState === 'object' && !Array.isArray(currentState)
    ? { ...currentState }
    : {};
  return { ...baseState, lmFocusMode: true };
}

function pushFocusModeHistoryState() {
  if (focusModeHistoryActive) return;
  try {
    history.pushState(focusModeHistoryState(), '', window.location.href);
    focusModeHistoryActive = true;
  } catch (error) {
    focusModeHistoryActive = false;
  }
}

function releaseFocusModeHistoryEntry() {
  if (!focusModeHistoryActive || suppressNextFocusHistoryPop) return;
  suppressNextFocusHistoryPop = true;
  focusModeHistoryActive = false;
  try {
    history.back();
  } catch (error) {
    suppressNextFocusHistoryPop = false;
  }
  setTimeout(() => {
    suppressNextFocusHistoryPop = false;
  }, 400);
}

window.addEventListener('popstate', () => {
  if (suppressNextFocusHistoryPop) {
    suppressNextFocusHistoryPop = false;
    return;
  }
  if (!isFocus || !focusModeHistoryActive) {
    focusModeHistoryActive = false;
    return;
  }
  focusModeHistoryActive = false;
  toggleFocus({ fromHistory: true });
});

function toggleFocus(options = {}) {
  if (!options.fromHistory && isFocus && typeof navigateOutOfStandaloneFocusEditor === 'function' && navigateOutOfStandaloneFocusEditor()) {
    return;
  }
  const nextFocus = !isFocus;
  if (nextFocus) pushFocusModeHistoryState();
  else if (!options.fromHistory) releaseFocusModeHistoryEntry();
  isFocus = nextFocus;
  const editor = document.getElementById('editor');
  document.body.classList.toggle('focus-mode', isFocus);
  document.getElementById('focBtn')?.classList.toggle('active', isFocus);
  syncFocusScrollStatsBaseline(editor);
  hideFocusScrollStats();
  syncFocusSaveStatusIndicator();
  if (isFocus) {
    setFocusEditorWidthPercent(storedFocusEditorWidthPercent(), { persist: false });
    setFindPanel(false);
    setToolDock(false);
    editor?.focus();
    updateStats();
    syncFocusSaveStatusIndicator();
  } else {
    if (typeof clearFocusWidthControlTransientState === 'function') {
      clearFocusWidthControlTransientState();
    } else {
      document.body.classList.remove(
        'is-focus-editor-active',
        'is-focus-editor-active-idle',
        'is-focus-editor-pointer-inside',
        'is-focus-center-panel-pointer-inside'
      );
    }
    if (typeof hideFocusNamingCategoryPanel === 'function') hideFocusNamingCategoryPanel();
    if (typeof hideFocusChapterContextPanel === 'function') hideFocusChapterContextPanel();
    if (typeof hideFocusFactsPanel === 'function') hideFocusFactsPanel();
    if (typeof hideFocusTopControls === 'function') hideFocusTopControls();
    if (typeof restoreNamingEntryPanelHome === 'function') restoreNamingEntryPanelHome();
    if (typeof restoreFactComposerPanelHome === 'function') restoreFactComposerPanelHome();
  }
  if (typeof scheduleEditorAutoScrollDepthMarkerReposition === 'function') {
    scheduleEditorAutoScrollDepthMarkerReposition();
  } else if (typeof positionEditorAutoScrollDepthMarker === 'function') {
    requestAnimationFrame(positionEditorAutoScrollDepthMarker);
  }
}
