function searchIconSvg() {
  return lmIcon('searchFull');
}

function lmChevronIcon(direction = 'right', extraClass = '') {
  const validDirection = ['left', 'right', 'up', 'down'].includes(direction) ? direction : 'right';
  return lmIcon('collapseChevron', ['part-chevron-svg', `lm-chevron-${validDirection}`, extraClass].filter(Boolean).join(' '));
}

function lmChevronSpan(direction = 'right', extraClass = '') {
  return `<span class="part-chevron">${lmChevronIcon(direction, extraClass)}</span>`;
}

function lmChapterBoundaryTransferSpan(direction = 'down') {
  const directionClass = direction === 'up' ? 'is-up' : '';
  return `<span class="part-chevron">${lmIcon('chapterBoundaryTransfer', directionClass)}</span>`;
}

const FOCUS_WIDTH_ACTIVE_IDLE_MS = lmEditorAdvancedNumber('focusIdleDelay', 5000);
const EDITOR_CARET_AUTO_SCROLL_SUPPRESS_MS = lmEditorAdvancedNumber('caretScrollSuppress', 260);
const EDITOR_MANUAL_SCROLL_OVERRIDE_MS = lmEditorAdvancedNumber('manualScrollOverride', 1200);
const EDITOR_MANUAL_SCROLL_INTENT_MS = lmEditorAdvancedNumber('manualScrollIntent', 700);
const EDITOR_PROGRAMMATIC_SCROLL_EVENT_MS = lmEditorAdvancedNumber('programmaticScrollWindow', 160);
const EDITOR_AUTO_SCROLL_MARKER_DRAG_THRESHOLD_PX = lmEditorAdvancedNumber('markerDragThreshold', 4);
const EDITOR_AUTO_SCROLL_MARKER_CLICK_DELAY_MS = lmEditorAdvancedNumber('markerClickDelay', 240);
const FOCUS_HOVER_INTENT_DELAY_MS = 500;
const FOCUS_HOVER_INTENT_STATIONARY_PX = 4;
let focusWidthActiveHideTimer = null;
let editorCaretAutoScrollFrame = null;
let editorAutoScrollAnimationFrame = null;
let editorCaretAutoScrollSuppressUntil = 0;
let editorManualScrollOverrideUntil = 0;
let editorManualScrollIntentUntil = 0;
let editorManualScrollPausedUntilEditorClick = false;
let editorProgrammaticScrollEventUntil = 0;
let editorManualScrollResumeTimer = null;
let editorCaretPointerPlacementUntil = 0;
let editorAutoScrollDepthDrag = null;
let editorAutoScrollMarkerClickTimer = null;
let editorAutoScrollCaretPlacementSyncFrame = null;
let editorAutoScrollCaretPlacementSyncTimer = null;
let focusChapterContextHideTimer = null;
let focusChapterContextEditorHoverTimer = null;
let focusChapterContextScrollHideTimer = null;
let focusChapterContextScrollThumbDrag = null;
let focusTopControlsEditorHoverTimer = null;
let focusTopSettingsPanelHome = null;
let focusTopThemePanelHome = null;
const focusHoverIntentState = {};
const FOCUS_CHAPTER_CONTEXT_EDITOR_HOVER_CLOSE_MS = 2000;
const FOCUS_TOP_EDITOR_HOVER_CLOSE_MS = 2000;

function clearFocusHoverIntent(slot) {
  const state = focusHoverIntentState[slot];
  if (state?.timer) clearTimeout(state.timer);
  delete focusHoverIntentState[slot];
}

function focusHoverIntentEventFromPoint(point, fallbackTarget) {
  const target = document.elementFromPoint?.(point.x, point.y) || fallbackTarget || document.body;
  return {
    clientX: point.x,
    clientY: point.y,
    pointerId: point.pointerId,
    target
  };
}

function scheduleFocusHoverIntent(slot, event, zoneTest, openPanel) {
  if (!isFocus || !event || typeof zoneTest !== 'function' || typeof openPanel !== 'function') {
    clearFocusHoverIntent(slot);
    return false;
  }
  if (!zoneTest(event)) {
    clearFocusHoverIntent(slot);
    return false;
  }

  const nextPoint = {
    x: event.clientX,
    y: event.clientY,
    pointerId: event.pointerId,
    target: event.target
  };
  const current = focusHoverIntentState[slot];
  const moved = current
    ? Math.hypot(nextPoint.x - current.x, nextPoint.y - current.y) > FOCUS_HOVER_INTENT_STATIONARY_PX
    : true;

  if (current && !moved) return true;

  clearFocusHoverIntent(slot);
  const nextState = {
    ...nextPoint,
    timer: setTimeout(() => {
      const state = focusHoverIntentState[slot];
      delete focusHoverIntentState[slot];
      if (!state || !isFocus) return;
      const delayedEvent = focusHoverIntentEventFromPoint(state, state.target);
      if (!zoneTest(delayedEvent)) return;
      openPanel(delayedEvent);
    }, FOCUS_HOVER_INTENT_DELAY_MS)
  };
  focusHoverIntentState[slot] = nextState;
  return true;
}

window.clearFocusHoverIntent = clearFocusHoverIntent;
window.scheduleFocusHoverIntent = scheduleFocusHoverIntent;


function standaloneFocusParams() {
  try {
    return new URLSearchParams(window.location.search);
  } catch (error) {
    return new URLSearchParams();
  }
}

function isStandaloneFocusEditorRequest() {
  return standaloneFocusParams().get('lmFocusPage') === '1';
}

function standaloneFocusEditorTargetUrl() {
  const targetUrl = new URL('story-novel-project-editor.html', window.location.href);
  standaloneFocusParams().forEach((value, key) => {
    if (!['lmFocusPage', 'lmFocusShell'].includes(key)) targetUrl.searchParams.set(key, value);
  });
  return targetUrl.href;
}

function navigateOutOfStandaloneFocusEditor() {
  if (!isStandaloneFocusEditorRequest()) return false;
  const targetUrl = standaloneFocusEditorTargetUrl();
  try {
    window.top.location.href = targetUrl;
  } catch (error) {
    window.location.href = targetUrl;
  }
  return true;
}

function scheduleStandaloneFocusModeLaunch() {
  if (!isStandaloneFocusEditorRequest()) return;
  document.body.classList.add('is-standalone-focus-page');
  requestAnimationFrame(() => {
    if (!isFocus && typeof toggleFocus === 'function') toggleFocus();
    document.getElementById('editor')?.focus();
  });
}

function clearFocusWidthActiveIdleTimer() {
  clearTimeout(focusWidthActiveHideTimer);
  focusWidthActiveHideTimer = null;
}

function isFocusWidthEditorActive() {
  const editor = document.getElementById('editor');
  return Boolean(editor && (document.activeElement === editor || editor.contains(document.activeElement)));
}

function isVisibleFocusCenterPanelTarget(target) {
  const panel = target?.closest?.('[data-focus-panel-slot="center"], .is-focus-center-panel');
  if (!panel) return false;
  return !panel.hidden && panel.getAttribute('aria-hidden') !== 'true';
}

function scheduleFocusWidthActiveIdleHide() {
  clearFocusWidthActiveIdleTimer();
  document.body.classList.remove('is-focus-editor-active-idle');
  if (!isFocus || !isFocusWidthEditorActive()) return;
  focusWidthActiveHideTimer = setTimeout(() => {
    if (
      isFocus &&
      isFocusWidthEditorActive() &&
      !document.body.classList.contains('is-focus-editor-pointer-inside') &&
      !document.body.classList.contains('is-focus-center-panel-pointer-inside')
    ) {
      document.body.classList.add('is-focus-editor-active-idle');
    }
  }, FOCUS_WIDTH_ACTIVE_IDLE_MS);
}

function clearFocusWidthControlTransientState() {
  clearFocusWidthActiveIdleTimer();
  document.body.classList.remove(
    'is-focus-editor-active',
    'is-focus-editor-active-idle',
    'is-focus-editor-pointer-inside',
    'is-focus-center-panel-pointer-inside'
  );
}

function updateFocusWidthPointerState(target) {
  const editor = document.getElementById('editor');
  const isPointerInEditor = Boolean(editor?.contains(target));
  const isPointerInCenterPanel = isVisibleFocusCenterPanelTarget(target);

  document.body.classList.toggle('is-focus-editor-pointer-inside', isPointerInEditor);
  document.body.classList.toggle('is-focus-center-panel-pointer-inside', isPointerInCenterPanel);

  if (isPointerInEditor || isPointerInCenterPanel) {
    clearFocusWidthActiveIdleTimer();
    document.body.classList.remove('is-focus-editor-active-idle');
  } else {
    scheduleFocusWidthActiveIdleHide();
  }
}

function unwrapHighlights(root = document.getElementById('editor')) {
  root.querySelectorAll('mark.highlight-find').forEach(mark => {
    const textNode = document.createTextNode(mark.textContent);
    const parent = mark.parentNode;
    mark.replaceWith(textNode);
    if (parent) parent.normalize();
  });
}

function isEditorFillerText(value) {
  const compactValue = String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, '')
    .toLowerCase();

  return /^(?:&nbsp;|<br\/?>|<div><br\/?><\/div>|<p><br\/?><\/p>)+$/.test(compactValue);
}

function isEditorVisuallyEmpty(root) {
  const hasMeaningfulMedia = Boolean(root.querySelector('img, video, iframe, canvas, svg'));
  if (hasMeaningfulMedia) return false;

  const plainText = (root.textContent || '').replace(/\u00a0/g, ' ').trim();
  return !plainText || isEditorFillerText(plainText);
}

function isEditorPlainTextMode(editor = document.getElementById('editor')) {
  return editor?.dataset?.editorMode === 'plain';
}

function isEditorReviewMode(editor = document.getElementById('editor')) {
  return editor?.dataset?.editorMode === 'review';
}

function setEditorRenderMode(editor, mode) {
  if (!editor) return;
  const normalizedMode = mode === 'review' ? 'review' : mode === 'rich' ? 'rich' : 'plain';
  editor.dataset.editorMode = normalizedMode;
  editor.classList.toggle('is-plain-text-mode', normalizedMode === 'plain');
  editor.classList.toggle('is-review-mode', normalizedMode === 'review');
  editor.classList.toggle('is-rich-text-mode', normalizedMode === 'rich');
}

function cleanPlainTextEditorValue(root) {
  if (!root) return '';
  const clone = root.cloneNode(true);
  unwrapHighlights(clone);
  clone.querySelectorAll?.('.hindi-pending-virama-boundary, [data-lm-pending-virama-boundary]').forEach(node => node.remove());
  return (clone.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n');
}

function normalizePlainTextParagraphGapValue(value, paragraphGap) {
  const normalizedValue = String(value || '').replace(/\r\n?/g, '\n').trimEnd();
  if (!normalizedValue.trim()) return '';

  const safeParagraphGap = typeof normalizeEditorParagraphGap === 'function'
    ? normalizeEditorParagraphGap(paragraphGap)
    : Math.max(0, Math.min(3, Number(paragraphGap) || 0));
  const separator = '\n'.repeat(safeParagraphGap + 1);
  return normalizedValue
    .split(/\n+/)
    .filter(part => part.trim())
    .join(separator);
}

function setPlainTextEditorValue(editor, value) {
  if (!editor) return;
  editor.textContent = String(value || '').replace(/\r\n?/g, '\n');
  syncEditorPlaceholderState();
}

function setReviewEditorValue(editor, value) {
  if (!editor) return;
  const html = typeof textToEditorHTML === 'function'
    ? textToEditorHTML(value || '')
    : escapeHtml(value || '').replace(/\n/g, '<br>');
  editor.innerHTML = html;
  normalizeEditorGapMarkers(editor);
  if (typeof normalizeEditorParagraphBlocks === 'function') normalizeEditorParagraphBlocks(editor);
  syncEditorPlaceholderState();
}

function applyPlainTextParagraphGapToEditor(editor, paragraphGap) {
  if (!editor || !isEditorPlainTextMode(editor)) return false;
  const currentText = cleanPlainTextEditorValue(editor);
  const nextText = normalizePlainTextParagraphGapValue(currentText, paragraphGap);
  if (nextText === currentText) return false;
  setPlainTextEditorValue(editor, nextText);
  return true;
}

function renderEditorDocumentContent(editor, documentItem, options = {}) {
  if (!editor) return;
  const renderVirtualWindowAsNormalContent = options.virtualWindow === true;
  if (
    !renderVirtualWindowAsNormalContent &&
    activeVirtualEditorDocument &&
    !isLargeVirtualEditorDocument(documentItem)
  ) {
    clearVirtualEditorDocument();
  }
  if (
    !renderVirtualWindowAsNormalContent &&
    documentItem &&
    typeof shouldVirtualizeEditorDocument === 'function' &&
    shouldVirtualizeEditorDocument(documentItem) &&
    activeVirtualEditorDocument?.documentItem !== documentItem
  ) {
    startVirtualEditorDocument(documentItem, editorDocumentLoadSequence);
    return;
  }
  const sourceText = editorHTMLToText(documentItem?.content || '');
  const canEdit = typeof canEditActiveDocument === 'function' ? canEditActiveDocument() : true;
  const hasRichFormatting = canEdit && typeof editorContentHasRichFormatting === 'function' &&
    editorContentHasRichFormatting(documentItem?.content || '');
  setEditorRenderMode(editor, canEdit ? (hasRichFormatting ? 'rich' : 'plain') : 'review');
  if (hasRichFormatting) {
    editor.innerHTML = documentItem.content || '';
    normalizeEditorGapMarkers(editor);
    if (typeof normalizeEditorParagraphBlocks === 'function') normalizeEditorParagraphBlocks(editor);
    syncEditorPlaceholderState();
  } else if (canEdit) setPlainTextEditorValue(editor, sourceText);
  else setReviewEditorValue(editor, sourceText);
}

function getCleanEditorHTML() {
  const editor = document.getElementById('editor');
  if (!editor) return '';
  if (activeVirtualEditorDocument?.temporarilyMaterialized) {
    const plainText = cleanPlainTextEditorValue(editor);
    return plainText.trim() ? textToEditorHTML(plainText) : '';
  }
  if (activeVirtualEditorDocument) return activeEditorHTMLBuffer || activeVirtualEditorDocument.html || '';
  if (isEditorPlainTextMode(editor)) {
    const plainText = cleanPlainTextEditorValue(editor);
    if (!plainText.trim()) return '';
    return typeof textToEditorHTML === 'function'
      ? textToEditorHTML(plainText)
      : escapeHtml(plainText).replace(/\n/g, '<br>');
  }

  const clone = editor.cloneNode(true);
  unwrapHighlights(clone);
  clone.querySelectorAll('.hindi-pending-virama-boundary, [data-lm-pending-virama-boundary]').forEach(node => node.remove());
  normalizeEditorGapMarkers(clone);
  if (typeof normalizeEditorParagraphBlocks === 'function') normalizeEditorParagraphBlocks(clone);
  if (isEditorVisuallyEmpty(clone)) return '';
  return clone.innerHTML;
}

function setSaveButtonSaved(isSaved) {
  const saveButton = document.getElementById('saveBtn');
  if (!saveButton) return;
  const editDraftMode = typeof isChapterEditDraftActive === 'function' && isChapterEditDraftActive();
  const draftMode = typeof isDraftActive === 'function' && isDraftActive();
  saveButton.classList.toggle('is-saved', Boolean(isSaved));
  saveButton.classList.toggle('is-edit-draft', editDraftMode);
  saveButton.classList.toggle('is-draft-mode', draftMode);
  saveButton.dataset.saveState = isSaved ? 'saved' : 'unsaved';
  saveButton.dataset.documentMode = editDraftMode
    ? 'chapter-edit-draft'
    : draftMode
      ? 'draft'
      : 'chapter';
  syncFocusTopControlsState();
}

function rememberCurrentChapterSaved(savedHTML = null) {
  const editor = document.getElementById('editor');
  lastSavedChapterHTML = savedHTML ?? (editor ? getCleanEditorHTML() : '');
  setSaveButtonSaved(true);
}

function persistActiveDocumentSettings() {
  if (!isDraftActive() && isChapterEditUnlocked && !isChapterEditDraftActive()) {
    materializeChapterEditDraftForChange();
  }
  saveToStorage(false);
  if (!projectDirectoryHandle) return;

  const saveTask = isDraftActive()
    ? writeDraftsDataToProject()
    : isChapterEditDraftActive()
      ? writeChapterEditDraftsToProject()
      : writeProjectManifest();

  saveTask.catch(error => console.warn('Editor settings save failed:', error));
}

function isEditorBlockElement(node) {
  return node?.nodeType === Node.ELEMENT_NODE &&
    ['P', 'DIV', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.tagName);
}

function normalizeEditorGapMarkers(root) {
  root?.querySelectorAll(`br.${EDITOR_FILE_GAP_BR_CLASS}`).forEach(breakNode => {
    const gapNode = document.createElement('span');
    gapNode.className = EDITOR_FILE_GAP_BR_CLASS;
    gapNode.dataset.fileParagraphGap = 'true';
    gapNode.setAttribute('aria-hidden', 'true');
    breakNode.replaceWith(gapNode);
  });
  root?.querySelectorAll(`br.${EDITOR_PARAGRAPH_GAP_BR_CLASS}, span.${EDITOR_PARAGRAPH_GAP_BR_CLASS}`).forEach(gapNode => {
    gapNode.replaceWith(createEditorParagraphGapNode());
  });
  root?.querySelectorAll(`p.${EDITOR_PARAGRAPH_GAP_BR_CLASS}`).forEach(gapParagraph => {
    gapParagraph.dataset.editorParagraphGap = 'true';
    gapParagraph.setAttribute('aria-hidden', 'true');
    if (!gapParagraph.childNodes.length) gapParagraph.appendChild(document.createElement('br'));
  });
}

function editorGapLineValue(node) {
  if (!node || node.nodeType === Node.TEXT_NODE) return 0;
  if (node.nodeType !== Node.ELEMENT_NODE) return 0;
  if (node.tagName === 'BR') return 1;
  if (node.classList.contains(EDITOR_PARAGRAPH_GAP_BR_CLASS)) return 1;
  if (node.classList.contains(EDITOR_FILE_GAP_BR_CLASS)) return 1;
  return isEditorBlockElement(node) && isEditorVisuallyEmpty(node) ? 1 : 0;
}

function editorContentExportText(node) {
  const contentClone = node.cloneNode(true);
  if (contentClone.querySelectorAll) {
    normalizeEditorGapMarkers(contentClone);
    contentClone.querySelectorAll('br').forEach(breakNode => breakNode.replaceWith('\n'));
  }
  return (contentClone.textContent || '').replace(/\u00a0/g, ' ').trimEnd();
}

function htmlToCountableText(html) {
  const root = document.createElement('div');
  root.innerHTML = String(html || '');
  normalizeEditorGapMarkers(root);
  const textParts = [];

  const pushGap = () => {
    if (!textParts.length || /\s$/.test(textParts[textParts.length - 1])) return;
    textParts.push('\n');
  };

  const walkNode = node => {
    if (node.nodeType === Node.TEXT_NODE) {
      textParts.push(node.nodeValue || '');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    if (
      node.tagName === 'BR' ||
      node.classList.contains(EDITOR_PARAGRAPH_GAP_BR_CLASS) ||
      node.classList.contains(EDITOR_FILE_GAP_BR_CLASS)
    ) {
      pushGap();
      return;
    }

    const isBlock = isEditorBlockElement(node);
    if (isBlock) pushGap();
    node.childNodes.forEach(walkNode);
    if (isBlock) pushGap();
  };

  root.childNodes.forEach(walkNode);
  return textParts.join('').replace(/\u00a0/g, ' ').trim();
}

function countWordsFromText(value) {
  const normalizedValue = String(value || '').replace(/\u00a0/g, ' ').trim();
  return normalizedValue ? normalizedValue.split(/\s+/).length : 0;
}

function getCleanEditorText() {
  const editor = document.getElementById('editor');
  if (!editor) return '';
  if (activeVirtualEditorDocument) return editorHTMLToText(activeEditorHTMLBuffer || activeVirtualEditorDocument.html || '');
  if (isEditorPlainTextMode(editor)) return cleanPlainTextEditorValue(editor);

  const clone = editor.cloneNode(true);
  unwrapHighlights(clone);
  normalizeEditorGapMarkers(clone);
  if (isEditorVisuallyEmpty(clone)) return '';

  const outputParts = [];
  let node = clone.firstChild;
  while (node) {
    if (!isEditorContentNode(node)) {
      node = node.nextSibling;
      continue;
    }

    outputParts.push(editorContentExportText(node));
    let gapLineCount = 0;
    let cursor = node.nextSibling;
    while (cursor && isEditorInterParagraphGapNode(cursor)) {
      gapLineCount += editorGapLineValue(cursor);
      cursor = cursor.nextSibling;
    }

    if (cursor && isEditorContentNode(cursor)) {
      outputParts.push('\n'.repeat(gapLineCount + 1));
    } else if (gapLineCount > 0) {
      outputParts.push('\n'.repeat(gapLineCount));
    }
    node = cursor;
  }

  return outputParts.join('');
}

function editorHTMLToText(html) {
  const root = document.createElement('div');
  root.innerHTML = String(html || '');
  unwrapHighlights(root);
  normalizeEditorGapMarkers(root);
  if (isEditorVisuallyEmpty(root)) return '';

  const outputParts = [];
  let node = root.firstChild;
  while (node) {
    if (!isEditorContentNode(node)) {
      node = node.nextSibling;
      continue;
    }

    outputParts.push(editorContentExportText(node));
    let gapLineCount = 0;
    let cursor = node.nextSibling;
    while (cursor && isEditorInterParagraphGapNode(cursor)) {
      gapLineCount += editorGapLineValue(cursor);
      cursor = cursor.nextSibling;
    }

    if (cursor && isEditorContentNode(cursor)) {
      outputParts.push('\n'.repeat(gapLineCount + 1));
    } else if (gapLineCount > 0) {
      outputParts.push('\n'.repeat(gapLineCount));
    }
    node = cursor;
  }

  return outputParts.join('');
}

const EDITOR_HISTORY_STORAGE_KEY = 'lm_editor_history_v1';
const EDITOR_HISTORY_PERSIST_TO_BROWSER_STORAGE = false;
const EDITOR_HISTORY_LIMIT = lmEditorAdvancedNumber('historyLimit', 120);
const EDITOR_HISTORY_MAX_DOCUMENTS = lmEditorAdvancedNumber('historyDocuments', 16);
const EDITOR_HISTORY_INPUT_GROUP_MS = lmEditorAdvancedNumber('historyTypingGroup', 4500);
const EDITOR_HISTORY_INPUT_DEBOUNCE_MS = lmEditorAdvancedNumber('historyDebounce', 650);

let editorHistoryDocKey = '';
let editorHistoryStack = [];
let editorHistoryIndex = -1;
let editorHistoryTimer = null;
let editorHistoryMemoryStore = { version: 1, documents: {} };
let editorHistoryPersistentCleanupDone = false;
let isApplyingEditorHistorySnapshot = false;
let editorHistoryInputContext = null;
let editorHistoryComposition = null;
let editorHistoryTransactionSequence = 0;
let editorHistoryRestoreSequence = 0;
let virtualEditorHistoryInputSuppressionUntil = 0;
let editorHistoryShortcutSuppressionUntil = 0;

function emptyEditorHistoryStore() {
  return { version: 1, documents: {} };
}

function clearPersistentEditorHistoryStore() {
  if (editorHistoryPersistentCleanupDone) return;
  editorHistoryPersistentCleanupDone = true;
  try {
    localStorage.removeItem(EDITOR_HISTORY_STORAGE_KEY);
  } catch (error) {
    console.warn('Editor history cleanup failed:', error);
  }
}

function readEditorHistoryStore() {
  if (!EDITOR_HISTORY_PERSIST_TO_BROWSER_STORAGE) {
    clearPersistentEditorHistoryStore();
    return editorHistoryMemoryStore;
  }
  try {
    const rawStore = localStorage.getItem(EDITOR_HISTORY_STORAGE_KEY);
    const parsedStore = rawStore ? JSON.parse(rawStore) : null;
    return parsedStore && typeof parsedStore === 'object'
      ? { version: 1, documents: parsedStore.documents && typeof parsedStore.documents === 'object' ? parsedStore.documents : {} }
      : emptyEditorHistoryStore();
  } catch (error) {
    console.warn('Editor history read failed:', error);
    return emptyEditorHistoryStore();
  }
}

function writeEditorHistoryStore(store) {
  if (!EDITOR_HISTORY_PERSIST_TO_BROWSER_STORAGE) {
    editorHistoryMemoryStore = store && typeof store === 'object' ? store : emptyEditorHistoryStore();
    clearPersistentEditorHistoryStore();
    return true;
  }
  try {
    localStorage.setItem(EDITOR_HISTORY_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch (error) {
    console.warn('Editor history write failed:', error);
    return false;
  }
}

if (!EDITOR_HISTORY_PERSIST_TO_BROWSER_STORAGE) clearPersistentEditorHistoryStore();

function activeEditorHistoryProjectKey() {
  const folderName = projectDirectoryHandle?.name ||
    localStorage.getItem(PROJECT_FOLDER_KEY) ||
    localStorage.getItem(WORKSPACE_FOLDER_KEY) ||
    'browser-story';
  return typeof projectWorkspacePath === 'function'
    ? projectWorkspacePath(folderName, typeof currentProjectTypeFolderName === 'function' ? currentProjectTypeFolderName() : '')
    : folderName;
}

function activeEditorHistoryDocumentKey() {
  if (!hasActiveStory()) return '';
  const projectKey = activeEditorHistoryProjectKey();
  if (isTrashDraftActive()) {
    const trash = chapterTrashDrafts[curTrashDraft] || {};
    const trashKey = trash.id || trash.createdAt || trash.originalId || `trash-${curTrashDraft}`;
    return `${projectKey}::trash::${trashKey}`;
  }
  if (isDraftActive()) {
    const draft = chapterDrafts[curDraft] || {};
    return `${projectKey}::draft::${draft.id || draft.createdAt || curDraft}`;
  }
  const chapter = chapters[curChap] || {};
  return `${projectKey}::chapter::${chapter.id || chapter.createdAt || chapterStorageKey(curChap)}`;
}

function editorHistorySelectionSignature(snapshot) {
  if (!snapshot) return '';
  const startIdentity = snapshot.start?.paragraph ?? snapshot.startBlock?.path ?? snapshot.startTextOffset;
  const startOffset = snapshot.start?.offsetInParagraph ?? snapshot.startBlock?.offset ?? snapshot.startTextOffset;
  const endIdentity = snapshot.end?.paragraph ?? snapshot.endBlock?.path ?? snapshot.endTextOffset;
  const endOffset = snapshot.end?.offsetInParagraph ?? snapshot.endBlock?.offset ?? snapshot.endTextOffset;
  return JSON.stringify([
    startIdentity,
    startOffset,
    endIdentity,
    endOffset,
    Boolean(snapshot.collapsed)
  ]);
}

function editorHistoryInputFamily(inputType = '') {
  if (inputType === 'historyUndo' || inputType === 'historyRedo') return 'native-history';
  if (inputType === 'deleteContentBackward') return 'backspace';
  if (inputType === 'deleteContentForward') return 'forward-delete';
  if (inputType.startsWith('delete')) return 'selection-delete';
  if (inputType === 'insertFromPaste' || inputType === 'insertFromDrop') return 'paste';
  if (inputType === 'insertReplacementText') return 'replacement';
  if (inputType.startsWith('format')) return 'formatting';
  if (inputType === 'insertParagraph' || inputType === 'insertLineBreak') return 'paragraph-boundary';
  if (inputType === 'insertCompositionText' || inputType === 'deleteCompositionText') return 'composition';
  if (inputType === 'insertText') return 'typing';
  return inputType || 'input';
}

function editorHistoryShouldMerge(previousOperation, nextOperation, elapsed, sameCaret, compositionContinues = false) {
  if (!previousOperation || !nextOperation || !sameCaret) return false;
  if (compositionContinues) return true;
  if (elapsed > EDITOR_HISTORY_INPUT_GROUP_MS) return false;
  if (nextOperation.type === 'typing' && previousOperation.type === 'typing') {
    return !previousOperation.endsWordBoundary;
  }
  if (nextOperation.type === 'backspace' && previousOperation.type === 'typing') {
    return !nextOperation.crossesWhitespace;
  }
  if (nextOperation.type === 'backspace' && previousOperation.type === 'backspace') {
    return !nextOperation.crossesWhitespace && !previousOperation.crossesWhitespace;
  }
  return false;
}

function editorHistoryPendingTypingContinues(pending, family, isTypingWhitespace) {
  return Boolean(
    family === 'typing' &&
    pending?.family === 'typing' &&
    (isTypingWhitespace || !pending.endsWordBoundary)
  );
}

function editorHistoryContentPatch(beforeHTML = '', afterHTML = '') {
  const before = String(beforeHTML || '');
  const after = String(afterHTML || '');
  let start = 0;
  const sharedLimit = Math.min(before.length, after.length);
  while (start < sharedLimit && before[start] === after[start]) start += 1;
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  return {
    range: { start, end: beforeEnd },
    removedContent: before.slice(start, beforeEnd),
    insertedContent: after.slice(start, afterEnd)
  };
}

function editorHistoryHTMLToText(html = '') {
  const root = document.createElement('div');
  root.innerHTML = String(html || '');
  unwrapHighlights(root);
  root.querySelectorAll?.('.hindi-pending-virama-boundary, [data-lm-pending-virama-boundary]').forEach(node => node.remove());
  const contentNodes = Array.from(root.childNodes).filter(node =>
    node.nodeType === Node.TEXT_NODE || (node.nodeType === Node.ELEMENT_NODE && isEditorBlockElement(node))
  );
  if (!contentNodes.length) return (root.textContent || '').replace(/\u00a0/g, ' ');
  return contentNodes.map(node => {
    if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue || '').replace(/\u00a0/g, ' ');
    if (isEditorVisuallyEmpty(node)) return '';
    const clone = node.cloneNode(true);
    clone.querySelectorAll?.('br').forEach(breakNode => breakNode.replaceWith('\n'));
    return (clone.textContent || '').replace(/\u00a0/g, ' ');
  }).join('\n');
}

function editorHistoryInsertedWordSegments(value = '') {
  const source = String(value || '');
  const segments = [];
  let offset = 0;
  while (offset < source.length) {
    const start = offset;
    while (offset < source.length && /\s/u.test(source[offset])) offset += 1;
    if (offset >= source.length) {
      const trailingWhitespace = source.slice(start);
      if (segments.length) segments[segments.length - 1] += trailingWhitespace;
      else if (trailingWhitespace) segments.push(trailingWhitespace);
      break;
    }
    while (offset < source.length && !/\s/u.test(source[offset])) offset += 1;
    // A boundary belongs to the word just completed. Undo therefore removes
    // "word + following space" in one step and never exposes a space-only
    // history entry between adjacent words.
    while (offset < source.length && /\s/u.test(source[offset])) offset += 1;
    if (offset > start) segments.push(source.slice(start, offset));
  }
  return segments;
}

function editorHistoryPlainTextInsertionPlan(beforeHTML = '', afterHTML = '') {
  const beforeText = editorHistoryHTMLToText(beforeHTML);
  const afterText = editorHistoryHTMLToText(afterHTML);
  let start = 0;
  const sharedLimit = Math.min(beforeText.length, afterText.length);
  while (start < sharedLimit && beforeText[start] === afterText[start]) start += 1;
  let beforeEnd = beforeText.length;
  let afterEnd = afterText.length;
  while (beforeEnd > start && afterEnd > start && beforeText[beforeEnd - 1] === afterText[afterEnd - 1]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  if (beforeEnd !== start) return null;
  const insertedText = afterText.slice(start, afterEnd);
  const segments = editorHistoryInsertedWordSegments(insertedText);
  if (segments.filter(segment => segment.trim()).length < 2) return null;
  return { beforeText, afterText, start, afterEnd, segments };
}

function editorHistorySelectionAtTextOffset(offset = 0, textValue = '') {
  const safeOffset = Math.max(0, Number(offset) || 0);
  if (activeVirtualEditorDocument) {
    const source = String(textValue || (
      Array.isArray(activeVirtualEditorDocument.sessionParagraphs)
        ? activeVirtualEditorDocument.sessionParagraphs.join('\n')
        : editorHTMLToText(activeEditorHTMLBuffer || activeVirtualEditorDocument.html || '')
    )).replace(/\r\n?/g, '\n');
    const paragraph = virtualEditorLogicalParagraphIndexForTextOffset(source, safeOffset);
    const point = {
      paragraph,
      offsetInParagraph: Math.max(0, safeOffset - virtualEditorParagraphStartOffset(source, paragraph))
    };
    return {
      start: point,
      end: { ...point },
      startTextOffset: safeOffset,
      endTextOffset: safeOffset,
      collapsed: true,
      direction: 'forward'
    };
  }
  return {
    startPath: null,
    startOffset: 0,
    endPath: null,
    endOffset: 0,
    startTextOffset: safeOffset,
    endTextOffset: safeOffset,
    startBlock: null,
    endBlock: null,
    collapsed: true,
    direction: 'forward'
  };
}

function appendEditorHistoryPhraseSnapshots(currentSnapshot, finalSnapshot) {
  const editor = document.getElementById('editor');
  if (!editor || !isEditorPlainTextMode(editor)) return false;
  if (!currentSnapshot || finalSnapshot?.operation?.type !== 'typing') return false;
  const plan = editorHistoryPlainTextInsertionPlan(currentSnapshot.html, finalSnapshot.html);
  if (!plan) return false;

  let accumulated = '';
  let previousSnapshot = currentSnapshot;
  let previousSelection = finalSnapshot.operation.beforeSelection || currentSnapshot.selection;
  plan.segments.forEach((segment, index) => {
    accumulated += segment;
    const isFinal = index === plan.segments.length - 1;
    const nextText = plan.beforeText.slice(0, plan.start) + accumulated + plan.afterText.slice(plan.afterEnd);
    const nextSelection = isFinal
      ? finalSnapshot.selection
      : editorHistorySelectionAtTextOffset(plan.start + accumulated.length, nextText);
    const nextSnapshot = isFinal
      ? finalSnapshot
      : {
          html: textToEditorHTML(nextText),
          selection: nextSelection,
          reason: 'input',
          timestamp: finalSnapshot.timestamp,
          operation: null
        };
    nextSnapshot.operation = {
      ...finalSnapshot.operation,
      beforeSelection: previousSelection,
      afterSelection: nextSelection,
      transactionId: `${finalSnapshot.operation.transactionId}:word-${index + 1}`,
      endsWordBoundary: true,
      ...editorHistoryContentPatch(previousSnapshot.html, nextSnapshot.html)
    };
    editorHistoryStack.push(nextSnapshot);
    previousSnapshot = nextSnapshot;
    previousSelection = nextSelection;
  });
  if (editorHistoryStack.length > EDITOR_HISTORY_LIMIT) {
    editorHistoryStack = editorHistoryStack.slice(-EDITOR_HISTORY_LIMIT);
  }
  editorHistoryIndex = editorHistoryStack.length - 1;
  persistEditorHistory();
  return true;
}

function editorHistoryBeforeInput(event) {
  if (isApplyingEditorHistorySnapshot) return;
  if (!event.inputType && performance.now() <= editorHistoryShortcutSuppressionUntil) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.inputType === 'historyRedo') redoEditorHistory();
    else undoEditorHistory();
    return;
  }
  virtualEditorHistoryInputSuppressionUntil = 0;
  if (activeVirtualEditorDocument) {
    activeVirtualEditorDocument.historyRestoreHold = false;
    if (!activeVirtualEditorDocument.temporarilyMaterialized) {
      applyTemporaryVirtualEditorFullDOM(activeVirtualEditorDocument, document.getElementById('editor'), 'input');
    }
    isRestrictedInputRenderingActive = true;
    scheduleRestrictedInputRenderingIdle();
  }
  const editor = document.getElementById('editor');
  const selection = activeVirtualEditorDocument
    ? captureVirtualEditorGlobalSelection(editor, activeVirtualEditorDocument)
    : currentEditorHistorySelection(editor);
  const isRangeDeletion = (event.inputType === 'deleteContentBackward' || event.inputType === 'deleteContentForward') &&
    selection && !selection.collapsed;
  let family = isRangeDeletion ? 'selection-delete' : editorHistoryInputFamily(event.inputType);
  const isTypingWhitespace = family === 'typing' && /\s/u.test(String(event.data || ''));
  let crossesWhitespace = false;
  if (family === 'backspace' && selection?.collapsed) {
    const source = activeVirtualEditorDocument
      ? editorHTMLToText(activeEditorHTMLBuffer || activeVirtualEditorDocument.html || '')
      : editor.textContent || '';
    const offset = activeVirtualEditorDocument
      ? virtualEditorParagraphStartOffset(source, selection.start?.paragraph || 0) + (selection.start?.offsetInParagraph || 0)
      : selection.startTextOffset;
    crossesWhitespace = Number.isFinite(offset) && offset > 0 && /\s/u.test(source.slice(offset - 1, offset));
  }
  const pending = editorHistoryInputContext;
  const selectionSignature = editorHistorySelectionSignature(selection);
  const sameComposition = Boolean(
    editorHistoryComposition &&
    pending?.transactionId &&
    pending.transactionId === editorHistoryComposition.id
  );
  const pendingContinues = Boolean(
    editorHistoryTimer &&
    pending &&
    (
      sameComposition ||
      (
        pending.afterSelectionSignature &&
        pending.afterSelectionSignature === selectionSignature &&
        !pending.crossesWhitespace &&
        !crossesWhitespace &&
        (
          editorHistoryPendingTypingContinues(pending, family, isTypingWhitespace) ||
          (family === 'backspace' && ['typing', 'backspace'].includes(pending.family))
        )
      )
    )
  );
  if (editorHistoryTimer && pending && !pendingContinues) {
    if (isTypingWhitespace && pending.family === 'typing') pending.endsWordBoundary = true;
    clearTimeout(editorHistoryTimer);
    editorHistoryTimer = null;
    captureEditorHistorySnapshot('input', { context: pending });
  }
  editorHistoryInputContext = {
    inputType: event.inputType || '',
    family,
    data: event.data ?? '',
    crossesWhitespace,
    // Whitespace completes the current word transaction. The next non-space
    // input commits this transaction before starting the following word.
    endsWordBoundary: isTypingWhitespace || Boolean(pendingContinues && pending?.endsWordBoundary),
    beforeSelection: pendingContinues
      ? pending.beforeSelection
      : editorHistoryComposition?.beforeSelection || selection,
    selectionSignature,
    afterSelectionSignature: '',
    transactionId: pendingContinues ? pending.transactionId : editorHistoryComposition?.id || null,
    timestamp: Date.now()
  };
}

function editorHistoryAfterInput() {
  if (!editorHistoryInputContext || isApplyingEditorHistorySnapshot) return;
  const editor = document.getElementById('editor');
  const selection = activeVirtualEditorDocument
    ? captureVirtualEditorGlobalSelection(editor, activeVirtualEditorDocument)
    : currentEditorHistorySelection(editor);
  editorHistoryInputContext.afterSelectionSignature = editorHistorySelectionSignature(selection);
}

function editorHistoryCompositionStart() {
  editorHistoryComposition = {
    id: `composition-${++editorHistoryTransactionSequence}`,
    beforeSelection: activeVirtualEditorDocument
      ? captureVirtualEditorGlobalSelection(document.getElementById('editor'), activeVirtualEditorDocument)
      : currentEditorHistorySelection()
  };
}

function editorHistoryCompositionEnd() {
  if (editorHistoryInputContext) editorHistoryInputContext.family = 'typing';
  editorHistoryComposition = null;
}

function trimEditorHistoryStore(store, activeKey = editorHistoryDocKey) {
  const documents = store.documents || {};
  Object.keys(documents).forEach(key => {
    const docHistory = documents[key];
    if (!docHistory || !Array.isArray(docHistory.stack) || !docHistory.stack.length) {
      delete documents[key];
      return;
    }
    docHistory.stack = docHistory.stack
      .filter(snapshot => snapshot && typeof snapshot.html === 'string')
      .slice(-EDITOR_HISTORY_LIMIT);
    const storedIndex = Number(docHistory.index);
    const safeIndex = Number.isFinite(storedIndex) ? storedIndex : docHistory.stack.length - 1;
    docHistory.index = Math.max(0, Math.min(safeIndex, docHistory.stack.length - 1));
    docHistory.updatedAt = Number(docHistory.updatedAt) || Date.now();
  });

  const entries = Object.entries(documents);
  if (entries.length <= EDITOR_HISTORY_MAX_DOCUMENTS) return store;

  entries
    .filter(([key]) => key !== activeKey)
    .sort(([, a], [, b]) => (Number(a.updatedAt) || 0) - (Number(b.updatedAt) || 0))
    .slice(0, entries.length - EDITOR_HISTORY_MAX_DOCUMENTS)
    .forEach(([key]) => delete documents[key]);

  return store;
}

function persistEditorHistory() {
  if (!editorHistoryDocKey) return;
  const store = readEditorHistoryStore();
  store.documents[editorHistoryDocKey] = {
    index: Math.max(0, Math.min(editorHistoryIndex, editorHistoryStack.length - 1)),
    stack: editorHistoryStack.slice(-EDITOR_HISTORY_LIMIT),
    updatedAt: Date.now()
  };
  if (editorHistoryStack.length > EDITOR_HISTORY_LIMIT) {
    editorHistoryStack = editorHistoryStack.slice(-EDITOR_HISTORY_LIMIT);
    editorHistoryIndex = editorHistoryStack.length - 1;
  }
  trimEditorHistoryStore(store, editorHistoryDocKey);
  if (writeEditorHistoryStore(store)) return;

  editorHistoryStack = editorHistoryStack.slice(-Math.ceil(EDITOR_HISTORY_LIMIT / 2));
  editorHistoryIndex = editorHistoryStack.length - 1;
  store.documents = {
    [editorHistoryDocKey]: {
      index: editorHistoryIndex,
      stack: editorHistoryStack,
      updatedAt: Date.now()
    }
  };
  writeEditorHistoryStore(store);
}

function editorHistoryNodePath(root, node) {
  if (!root || !node) return null;
  const path = [];
  let cursor = node;
  while (cursor && cursor !== root) {
    const parent = cursor.parentNode;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, cursor));
    cursor = parent;
  }
  return cursor === root ? path : null;
}

function editorHistoryNodeFromPath(root, path) {
  if (!root || !Array.isArray(path)) return null;
  let cursor = root;
  for (const index of path) {
    if (!cursor?.childNodes || index < 0 || index >= cursor.childNodes.length) return null;
    cursor = cursor.childNodes[index];
  }
  return cursor;
}

function editorHistoryTextOffset(root, container, offset) {
  if (!root || !container) return 0;
  try {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.setEnd(container, offset);
    return range.toString().length;
  } catch {
    return (root.textContent || '').length;
  }
}

function editorHistoryPositionForTextOffset(root, targetOffset = 0, options = {}) {
  const safeOffset = Math.max(0, Number(targetOffset) || 0);
  const preferForwardBoundary = options.boundaryAffinity === 'forward';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let lastTextNode = null;
  let node = walker.nextNode();
  while (node) {
    const length = node.nodeValue.length;
    lastTextNode = node;
    if (
      consumed + length > safeOffset ||
      (!preferForwardBoundary && consumed + length === safeOffset)
    ) {
      return { node, offset: Math.max(0, Math.min(length, safeOffset - consumed)) };
    }
    consumed += length;
    node = walker.nextNode();
  }

  if (lastTextNode && safeOffset === consumed) {
    return { node: lastTextNode, offset: lastTextNode.nodeValue.length };
  }

  const fallbackBlock = root.querySelector?.('p, div, li, blockquote') || root;
  return { node: fallbackBlock, offset: fallbackBlock.childNodes?.length ? fallbackBlock.childNodes.length : 0 };
}

function clampEditorHistoryOffset(node, offset) {
  if (!node) return 0;
  const maxOffset = node.nodeType === Node.TEXT_NODE
    ? node.nodeValue.length
    : node.childNodes?.length || 0;
  return Math.max(0, Math.min(Number(offset) || 0, maxOffset));
}

function currentEditorHistorySelection(editor = document.getElementById('editor')) {
  const selection = window.getSelection();
  if (!editor || !selection || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (
    !editor.contains(range.startContainer) ||
    !editor.contains(range.endContainer)
  ) {
    return null;
  }

  const snapshot = {
    startPath: editorHistoryNodePath(editor, range.startContainer),
    startOffset: range.startOffset,
    endPath: editorHistoryNodePath(editor, range.endContainer),
    endOffset: range.endOffset,
    startTextOffset: editorHistoryTextOffset(editor, range.startContainer, range.startOffset),
    endTextOffset: editorHistoryTextOffset(editor, range.endContainer, range.endOffset),
    collapsed: range.collapsed,
    direction: selection.anchorNode === range.endContainer && selection.anchorOffset === range.endOffset
      ? 'backward'
      : 'forward'
  };
  const blockFor = node => (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)
    ?.closest?.('p, div, li, blockquote');
  const blockPosition = (container, offset) => {
    const block = blockFor(container);
    if (!block || !editor.contains(block)) return null;
    return {
      path: editorHistoryNodePath(editor, block),
      offset: editorHistoryTextOffset(block, container, offset)
    };
  };
  snapshot.startBlock = blockPosition(range.startContainer, range.startOffset);
  snapshot.endBlock = blockPosition(range.endContainer, range.endOffset);
  return snapshot;
}

function restoreEditorHistorySelection(editor, selectionSnapshot) {
  if (!editor || !selectionSnapshot) return false;
  const selection = window.getSelection();
  if (!selection) return false;

  let startNode = editorHistoryNodeFromPath(editor, selectionSnapshot.startPath);
  let endNode = editorHistoryNodeFromPath(editor, selectionSnapshot.endPath);
  let startOffset = clampEditorHistoryOffset(startNode, selectionSnapshot.startOffset);
  let endOffset = clampEditorHistoryOffset(endNode, selectionSnapshot.endOffset);

  if (!startNode || !endNode) {
    const blockPosition = blockSnapshot => {
      const block = editorHistoryNodeFromPath(editor, blockSnapshot?.path);
      return block ? editorHistoryPositionForTextOffset(block, blockSnapshot.offset) : null;
    };
    const startPosition = blockPosition(selectionSnapshot.startBlock) ||
      editorHistoryPositionForTextOffset(editor, selectionSnapshot.startTextOffset);
    const endPosition = blockPosition(selectionSnapshot.endBlock) ||
      editorHistoryPositionForTextOffset(editor, selectionSnapshot.endTextOffset);
    startNode = startPosition.node;
    startOffset = startPosition.offset;
    endNode = endPosition.node;
    endOffset = endPosition.offset;
  }

  try {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    selection.removeAllRanges();
    selection.addRange(range);
    if (selectionSnapshot.direction === 'backward' && typeof selection.setBaseAndExtent === 'function') {
      selection.setBaseAndExtent(endNode, endOffset, startNode, startOffset);
    }
    savedEditorRange = range.cloneRange();
    return true;
  } catch (error) {
    console.warn('Editor history selection restore failed:', error);
    return false;
  }
}

function restoreEditorHistorySelectionByTextOffset(editor, selectionSnapshot) {
  if (!editor || !selectionSnapshot) return false;
  const selection = window.getSelection();
  if (!selection) return false;

  try {
    const startPosition = editorHistoryPositionForTextOffset(editor, selectionSnapshot.startTextOffset);
    const endPosition = editorHistoryPositionForTextOffset(editor, selectionSnapshot.endTextOffset);
    const range = document.createRange();
    range.setStart(startPosition.node, startPosition.offset);
    range.setEnd(endPosition.node, endPosition.offset);
    selection.removeAllRanges();
    selection.addRange(range);
    savedEditorRange = range.cloneRange();
    return true;
  } catch (error) {
    console.warn('Editor history text-offset selection restore failed:', error);
    return false;
  }
}

function createEditorHistorySnapshot(reason = 'input') {
  const editor = document.getElementById('editor');
  if (!editor) return null;
  const selection = activeVirtualEditorDocument
    ? captureVirtualEditorGlobalSelection(editor, activeVirtualEditorDocument)
    : currentEditorHistorySelection(editor);
  return {
    html: getCleanEditorHTML(),
    selection,
    reason,
    timestamp: Date.now(),
    operation: null
  };
}

function ensureEditorHistoryForCurrentDocument() {
  const nextKey = activeEditorHistoryDocumentKey();
  if (!nextKey) return false;
  if (nextKey === editorHistoryDocKey) return true;

  clearTimeout(editorHistoryTimer);
  editorHistoryTimer = null;
  editorHistoryDocKey = nextKey;
  const store = readEditorHistoryStore();
  const storedHistory = store.documents[nextKey];
  editorHistoryStack = Array.isArray(storedHistory?.stack)
    ? storedHistory.stack.filter(snapshot => snapshot && typeof snapshot.html === 'string').slice(-EDITOR_HISTORY_LIMIT)
    : [];
  const storedIndex = Number(storedHistory?.index);
  const safeIndex = Number.isFinite(storedIndex) ? storedIndex : editorHistoryStack.length - 1;
  editorHistoryIndex = editorHistoryStack.length
    ? Math.max(0, Math.min(safeIndex, editorHistoryStack.length - 1))
    : -1;
  return true;
}

function resetEditorHistoryForActiveDocument() {
  if (!ensureEditorHistoryForCurrentDocument()) return;
  const currentSnapshot = createEditorHistorySnapshot('load');
  if (!currentSnapshot) return;

  if (!editorHistoryStack.length) {
    editorHistoryStack = [currentSnapshot];
    editorHistoryIndex = 0;
    persistEditorHistory();
    return;
  }

  const matchingIndex = editorHistoryStack.findLastIndex(snapshot => snapshot.html === currentSnapshot.html);
  if (matchingIndex >= 0) {
    editorHistoryIndex = matchingIndex;
    editorHistoryStack[matchingIndex] = {
      ...editorHistoryStack[matchingIndex],
      selection: currentSnapshot.selection,
      timestamp: Date.now()
    };
    persistEditorHistory();
    return;
  }

  editorHistoryStack = editorHistoryStack.slice(0, editorHistoryIndex + 1);
  editorHistoryStack.push(currentSnapshot);
  editorHistoryStack = editorHistoryStack.slice(-EDITOR_HISTORY_LIMIT);
  editorHistoryIndex = editorHistoryStack.length - 1;
  persistEditorHistory();
}

function captureEditorHistorySnapshot(reason = 'input', options = {}) {
  if (isApplyingEditorHistorySnapshot || isTrashDraftActive()) return false;
  if (!ensureEditorHistoryForCurrentDocument()) return false;
  const snapshot = createEditorHistorySnapshot(reason);
  if (!snapshot) return false;
  const context = options.context || (reason === 'input' ? editorHistoryInputContext : null);
  if (reason === 'input') editorHistoryInputContext = null;
  const family = context?.family || reason;
  snapshot.operation = {
    type: family,
    inputType: context?.inputType || reason,
    data: context?.data ?? '',
    beforeSelection: context?.beforeSelection || null,
    afterSelection: snapshot.selection,
    transactionId: context?.transactionId || editorHistoryComposition?.id || `edit-${++editorHistoryTransactionSequence}`,
    endsWordBoundary: Boolean(context?.endsWordBoundary ?? (family === 'typing' && /\s/u.test(String(context?.data || '')))),
    crossesWhitespace: Boolean(context?.crossesWhitespace)
  };

  const currentSnapshot = editorHistoryStack[editorHistoryIndex];
  if (currentSnapshot?.html === snapshot.html) {
    editorHistoryStack[editorHistoryIndex] = {
      ...currentSnapshot,
      selection: snapshot.selection,
      timestamp: Date.now()
    };
    persistEditorHistory();
    return false;
  }
  Object.assign(snapshot.operation, editorHistoryContentPatch(currentSnapshot?.html || '', snapshot.html));

  if (editorHistoryIndex < editorHistoryStack.length - 1) {
    editorHistoryStack = editorHistoryStack.slice(0, editorHistoryIndex + 1);
  }

  if (appendEditorHistoryPhraseSnapshots(currentSnapshot, snapshot)) return true;

  const previousOperation = currentSnapshot?.operation;
  const elapsed = snapshot.timestamp - (currentSnapshot?.timestamp || 0);
  const sameCaret = context?.selectionSignature &&
    context.selectionSignature === editorHistorySelectionSignature(currentSnapshot?.selection);
  const compositionContinues = Boolean(editorHistoryComposition && previousOperation?.transactionId === editorHistoryComposition.id);
  const shouldMergeTyping = !options.force && reason === 'input' &&
    editorHistoryShouldMerge(previousOperation, snapshot.operation, elapsed, sameCaret, compositionContinues);

  if (shouldMergeTyping) {
    const transactionBaseline = editorHistoryStack[editorHistoryIndex - 1]?.html || '';
    editorHistoryStack[editorHistoryIndex] = {
      ...snapshot,
      createdAt: currentSnapshot.createdAt || currentSnapshot.timestamp,
      operation: {
        ...snapshot.operation,
        type: previousOperation?.type === 'typing' ? 'typing' : family,
        beforeSelection: previousOperation?.beforeSelection || snapshot.operation.beforeSelection,
        transactionId: previousOperation?.transactionId || snapshot.operation.transactionId,
        endsWordBoundary: snapshot.operation.endsWordBoundary,
        crossesWhitespace: snapshot.operation.crossesWhitespace,
        ...editorHistoryContentPatch(transactionBaseline, snapshot.html)
      }
    };
  } else {
    editorHistoryStack.push(snapshot);
    if (editorHistoryStack.length > EDITOR_HISTORY_LIMIT) editorHistoryStack.shift();
    editorHistoryIndex = editorHistoryStack.length - 1;
  }

  persistEditorHistory();
  return true;
}

function scheduleEditorHistorySnapshot(reason = 'input') {
  if (isApplyingEditorHistorySnapshot) return;
  clearTimeout(editorHistoryTimer);
  editorHistoryTimer = setTimeout(() => {
    if (editorHistoryComposition) {
      scheduleEditorHistorySnapshot(reason);
      return;
    }
    editorHistoryTimer = null;
    captureEditorHistorySnapshot(reason);
  }, EDITOR_HISTORY_INPUT_DEBOUNCE_MS);
}

function flushEditorHistorySnapshot(reason = 'flush') {
  if (editorHistoryTimer) {
    clearTimeout(editorHistoryTimer);
    editorHistoryTimer = null;
  }
  return captureEditorHistorySnapshot(reason, { force: true });
}

function flushPendingEditorHistoryInput() {
  if (!editorHistoryTimer && !editorHistoryInputContext) {
    return ensureEditorHistoryForCurrentDocument();
  }
  if (editorHistoryTimer) {
    clearTimeout(editorHistoryTimer);
    editorHistoryTimer = null;
  }
  const context = editorHistoryInputContext;
  editorHistoryInputContext = null;
  if (!context) return ensureEditorHistoryForCurrentDocument();
  return captureEditorHistorySnapshot('input', { force: true, context });
}

function prepareVirtualEditorHistoryRestore() {
  restrictedInputCloseSequence += 1;
  clearTimeout(restrictedInputIdleTimer);
  restrictedInputIdleTimer = null;
  isRestrictedInputRenderingActive = false;
  clearTimeout(virtualEditorPatchBatchTimer);
  virtualEditorPatchBatchTimer = null;
  virtualEditorPendingPatchBatch = null;
  // Any already-dispatched input bridge belongs to the DOM state that history
  // is replacing. Its completion must not patch the newly restored document.
  editorInputBridgeSequence += 1;
  completedEditorInputBridgeSequence = editorInputBridgeSequence;
  activeEditorHTMLBridgePromise = null;
  virtualEditorWindowRequest += 1;
}
