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
  const normalizedMode = mode === 'review' ? 'review' : 'plain';
  editor.dataset.editorMode = normalizedMode;
  editor.classList.toggle('is-plain-text-mode', normalizedMode === 'plain');
  editor.classList.toggle('is-review-mode', normalizedMode === 'review');
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
  setEditorRenderMode(editor, canEdit ? 'plain' : 'review');
  if (canEdit) setPlainTextEditorValue(editor, sourceText);
  else setReviewEditorValue(editor, sourceText);
}

function getCleanEditorHTML() {
  const editor = document.getElementById('editor');
  if (!editor) return '';
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
    const trashKey = chapterTrashDrafts[curTrashDraft]?.contentPath || `trash-${curTrashDraft}`;
    return `${projectKey}::trash::${trashKey}`;
  }
  if (isDraftActive()) {
    const draft = chapterDrafts[curDraft] || {};
    return `${projectKey}::draft::${draft.contentPath || draft.id || curDraft}`;
  }
  const chapter = chapters[curChap] || {};
  return `${projectKey}::chapter::${chapter.contentPath || chapter.id || chapterStorageKey(curChap)}`;
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

  return {
    startPath: editorHistoryNodePath(editor, range.startContainer),
    startOffset: range.startOffset,
    endPath: editorHistoryNodePath(editor, range.endContainer),
    endOffset: range.endOffset,
    startTextOffset: editorHistoryTextOffset(editor, range.startContainer, range.startOffset),
    endTextOffset: editorHistoryTextOffset(editor, range.endContainer, range.endOffset),
    collapsed: range.collapsed
  };
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
    const startPosition = editorHistoryPositionForTextOffset(editor, selectionSnapshot.startTextOffset);
    const endPosition = editorHistoryPositionForTextOffset(editor, selectionSnapshot.endTextOffset);
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
  return {
    html: getCleanEditorHTML(),
    selection: currentEditorHistorySelection(editor),
    reason,
    timestamp: Date.now()
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

  if (editorHistoryIndex < editorHistoryStack.length - 1) {
    editorHistoryStack = editorHistoryStack.slice(0, editorHistoryIndex + 1);
  }

  const shouldMergeTyping = !options.force &&
    reason === 'input' &&
    currentSnapshot?.reason === 'input' &&
    snapshot.timestamp - currentSnapshot.timestamp <= EDITOR_HISTORY_INPUT_GROUP_MS;

  if (shouldMergeTyping) {
    editorHistoryStack[editorHistoryIndex] = {
      ...snapshot,
      createdAt: currentSnapshot.createdAt || currentSnapshot.timestamp
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

function restoreEditorHistorySnapshot(snapshot, options = {}) {
  const editor = document.getElementById('editor');
  if (!editor || !snapshot) return false;
  // Full-document history snapshots must never replace a bounded virtual DOM.
  // Virtual undo needs paragraph/revision history and is intentionally disabled
  // until that representation is available.
  if (activeVirtualEditorDocument) return false;

  isApplyingEditorHistorySnapshot = true;
  try {
    if (isEditorPlainTextMode(editor)) {
      setPlainTextEditorValue(editor, editorHTMLToText(snapshot.html || ''));
    } else {
      editor.innerHTML = snapshot.html || '<p><br></p>';
      normalizeEditorGapMarkers(editor);
      if (typeof normalizeEditorParagraphBlocks === 'function') normalizeEditorParagraphBlocks(editor);
    }
    syncEditorPlaceholderState();
    handleEditorContentInput();
    updateFormattingButtons({ syncFromSelection: false });
    updateEditorScrollThumb(false);
    positionEditorAutoScrollDepthMarker();
  } finally {
    isApplyingEditorHistorySnapshot = false;
  }

  requestAnimationFrame(() => {
    editor.focus({ preventScroll: true });
    const preservedSelection = options.preserveSelection || null;
    const restoredSelection = preservedSelection
      ? restoreEditorHistorySelectionByTextOffset(editor, preservedSelection)
      : restoreEditorHistorySelection(editor, snapshot.selection);
    if (!restoredSelection) {
      const fallbackOffset = Number.isFinite(Number(preservedSelection?.startTextOffset))
        ? Number(preservedSelection.startTextOffset)
        : Number.isFinite(Number(snapshot.selection?.startTextOffset))
          ? Number(snapshot.selection.startTextOffset)
          : 0;
      const fallbackPosition = editorHistoryPositionForTextOffset(editor, fallbackOffset);
      const range = document.createRange();
      range.setStart(fallbackPosition.node, fallbackPosition.offset);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      savedEditorRange = range.cloneRange();
    }
    if (options.autoScroll !== false) scheduleEditorCaretAutoScroll();
  });
  return true;
}

function undoEditorHistory() {
  const preservedSelection = currentEditorHistorySelection();
  flushEditorHistorySnapshot('undo-entry');
  if (!editorHistoryStack.length || editorHistoryIndex <= 0) return false;
  editorHistoryIndex -= 1;
  const restored = restoreEditorHistorySnapshot(editorHistoryStack[editorHistoryIndex], {
    preserveSelection: preservedSelection,
    autoScroll: false
  });
  if (restored) persistEditorHistory();
  return restored;
}

function redoEditorHistory() {
  if (!ensureEditorHistoryForCurrentDocument()) return false;
  if (!editorHistoryStack.length || editorHistoryIndex >= editorHistoryStack.length - 1) return false;
  const preservedSelection = currentEditorHistorySelection();
  editorHistoryIndex += 1;
  const restored = restoreEditorHistorySnapshot(editorHistoryStack[editorHistoryIndex], {
    preserveSelection: preservedSelection,
    autoScroll: false
  });
  if (restored) persistEditorHistory();
  return restored;
}

function isEditorHistoryTextControl(target) {
  if (!target) return false;
  const tagName = target.tagName;
  return tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    (tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'submit'].includes(target.type));
}

function shouldHandleEditorHistoryShortcut(event) {
  const key = shortcutKey(event);
  const isUndo = key === 'z' && !event.shiftKey;
  const isRedo = key === 'y' || (key === 'z' && event.shiftKey);
  if (!(event.ctrlKey || event.metaKey) || event.altKey || (!isUndo && !isRedo)) return false;

  const editor = document.getElementById('editor');
  const findBar = document.getElementById('find-bar');
  const toolDock = document.getElementById('floating-tools');
  const target = event.target;
  if (!editor || (typeof canEditActiveDocument === 'function' && !canEditActiveDocument())) return false;
  if (target === editor || editor.contains(target)) return true;
  if (toolDock?.contains(target)) return true;
  if (isFindOpen && findBar?.contains(target)) return !isEditorHistoryTextControl(target);
  return document.activeElement === editor;
}

function handleEditorHistoryShortcut(event) {
  if (!shouldHandleEditorHistoryShortcut(event)) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  const key = shortcutKey(event);
  const shouldRedo = key === 'y' || (key === 'z' && event.shiftKey);
  if (shouldRedo) redoEditorHistory();
  else undoEditorHistory();
  return true;
}

window.captureEditorHistorySnapshot = captureEditorHistorySnapshot;
window.scheduleEditorHistorySnapshot = scheduleEditorHistorySnapshot;
window.flushEditorHistorySnapshot = flushEditorHistorySnapshot;
window.resetEditorHistoryForActiveDocument = resetEditorHistoryForActiveDocument;
window.handleEditorHistoryShortcut = handleEditorHistoryShortcut;

function normalizeScanText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function namingEntryNameKey(name) {
  return normalizeScanText(name).toLocaleLowerCase();
}

function namingEntrySearchNames(entry = {}) {
  const candidates = [entry.name, ...(Array.isArray(entry.similarNames) ? entry.similarNames : [])];
  const unique = new Map();
  candidates.forEach(candidate => {
    const cleaned = normalizeScanText(candidate);
    const key = namingEntryNameKey(cleaned);
    if (cleaned.length >= 2 && key && !unique.has(key)) unique.set(key, cleaned);
  });
  return [...unique.values()];
}

function isNamingEntryUsedInText(entry = {}, documentText = '') {
  return namingEntrySearchNames(entry).some(name => isSavedNameUsedInText(name, documentText));
}

function countNamingEntryUsesInText(entry = {}, documentText = '') {
  const cleanedText = normalizeScanText(documentText);
  if (!cleanedText) return 0;
  const ranges = [];
  namingEntrySearchNames(entry)
    .sort((left, right) => right.length - left.length)
    .forEach(name => {
      try {
        const namePattern = name.split(/\s+/).map(escapeRegExp).join('\\s+');
        const matcher = new RegExp(`(^|[^\\p{L}\\p{N}_])(${namePattern})(?=$|[^\\p{L}\\p{N}_])`, 'giu');
        for (const match of cleanedText.matchAll(matcher)) {
          const start = (match.index || 0) + (match[1]?.length || 0);
          const end = start + (match[2]?.length || name.length);
          if (!ranges.some(range => start < range.end && end > range.start)) ranges.push({ start, end });
        }
      } catch (_error) {
        // The normal Unicode-regex path handles supported browsers.
      }
    });
  return ranges.length;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isSavedNameUsedInText(name, chapterText) {
  const cleanedName = normalizeScanText(name);
  const cleanedText = normalizeScanText(chapterText);
  if (cleanedName.length < 2 || !cleanedText) return false;

  try {
    const namePattern = cleanedName.split(/\s+/).map(escapeRegExp).join('\\s+');
    const pattern = `(^|[^\\p{L}\\p{N}_])${namePattern}(?=$|[^\\p{L}\\p{N}_])`;
    return new RegExp(pattern, 'iu').test(cleanedText);
  } catch (error) {
    return cleanedText.toLocaleLowerCase().includes(cleanedName.toLocaleLowerCase());
  }
}

function countSavedNameUsesInText(name, chapterText) {
  const cleanedName = normalizeScanText(name);
  const cleanedText = normalizeScanText(chapterText);
  if (cleanedName.length < 2 || !cleanedText) return 0;

  try {
    const namePattern = cleanedName.split(/\s+/).map(escapeRegExp).join('\\s+');
    const pattern = `(^|[^\\p{L}\\p{N}_])${namePattern}(?=$|[^\\p{L}\\p{N}_])`;
    return [...cleanedText.matchAll(new RegExp(pattern, 'giu'))].length;
  } catch (error) {
    const loweredText = cleanedText.toLocaleLowerCase();
    const loweredName = cleanedName.toLocaleLowerCase();
    let count = 0;
    let cursor = 0;

    while (cursor < loweredText.length) {
      const foundIndex = loweredText.indexOf(loweredName, cursor);
      if (foundIndex === -1) break;
      count += 1;
      cursor = foundIndex + loweredName.length;
    }
    return count;
  }
}

function isDraftNamingEntry(entry = {}) {
  return normalizeNamingEntryStatus(entry) === 'draft';
}

function namingMetaForChapterDocument(chapterIndex = curChap, savedAt = new Date().toISOString()) {
  const chapter = chapters[chapterIndex] || {};
  return {
    chapterStatus: 'chapter',
    documentType: 'chapter',
    chapterKey: chapterStorageKey(chapterIndex),
    chapterIndex,
    chapterNo: chapter.chapterNo || chapterIndex + 1,
    chapterTitle: chapterDisplayTitle(chapter, chapterIndex),
    draftKey: null,
    draftIndex: null,
    draftNo: null,
    draftTitle: '',
    contentPath: chapter.contentPath || chapterStorageKey(chapterIndex),
    savedAt
  };
}

function namingMetaForDraftDocument(draftIndex = curDraft, savedAt = new Date().toISOString()) {
  const draft = chapterDrafts[draftIndex] || {};
  const draftKey = draft.contentPath || draftFilePath(draftIndex);
  const draftTitle = draft.title || `${text().draftPrefix} ${draftIndex + 1}`;
  return {
    chapterStatus: 'draft',
    documentType: 'draft',
    chapterKey: draftKey,
    chapterIndex: null,
    chapterNo: null,
    chapterTitle: draftTitle,
    draftKey,
    draftIndex,
    draftNo: draft.draftNo || draftIndex + 1,
    draftTitle,
    contentPath: draft.contentPath || draftKey,
    savedAt
  };
}

function activeNamingDocumentMeta(savedAt = new Date().toISOString()) {
  if (isTrashDraftActive()) return null;
  if (isDraftActive()) return namingMetaForDraftDocument(curDraft, savedAt);
  return namingMetaForChapterDocument(curChap, savedAt);
}

function applyNamingEntryDocumentMeta(entry = {}, documentMeta = null, attachedAt = new Date().toISOString()) {
  if (!entry || !documentMeta) return false;

  entry.chapterStatus = documentMeta.chapterStatus;
  entry.documentType = documentMeta.documentType;
  entry.chapterKey = documentMeta.chapterKey;
  entry.chapterIndex = documentMeta.chapterIndex;
  entry.chapterNo = documentMeta.chapterNo;
  entry.chapterTitle = documentMeta.chapterTitle;
  entry.draftKey = documentMeta.draftKey || null;
  entry.draftIndex = documentMeta.draftIndex ?? null;
  entry.draftNo = documentMeta.draftNo ?? null;
  entry.draftTitle = documentMeta.draftTitle || '';
  entry.contentPath = documentMeta.contentPath || documentMeta.chapterKey || '';
  entry.descriptionMeta = { ...documentMeta, attachedAt };
  entry.attachedAt = attachedAt;
  return true;
}

function resolveUndefinedNamingEntriesForDocument(documentText = getCleanEditorText(), documentMeta = activeNamingDocumentMeta(), savedAt = new Date().toISOString()) {
  if (!documentMeta) return false;
  namingData = normalizeNamingData(namingData);
  let didResolve = false;

  namingData.entries.forEach(entry => {
    if (!isUndefinedNamingEntry(entry)) return;
    if (!isNamingEntryUsedInText(entry, documentText)) return;
    didResolve = applyNamingEntryDocumentMeta(entry, documentMeta, savedAt) || didResolve;
  });

  if (didResolve) namingData = normalizeNamingData(namingData);
  return didResolve;
}

function resolveDraftNamingEntriesForChapter(chapterIndex = curChap, chapterText = getCleanEditorText(), savedAt = new Date().toISOString()) {
  const chapter = chapters[chapterIndex];
  if (!chapter) return false;

  namingData = normalizeNamingData(namingData);
  const chapterKey = chapterStorageKey(chapterIndex);
  const chapterTitle = chapterDisplayTitle(chapter, chapterIndex);
  let didResolve = false;

  namingData.entries.forEach(entry => {
    if (!isDraftNamingEntry(entry)) return;
    if (!isNamingEntryUsedInText(entry, chapterText)) return;

    const draftMeta = entry.resolvedFromDraft || {
      draftKey: entry.draftKey || entry.chapterKey || null,
      draftIndex: entry.draftIndex ?? null,
      draftNo: entry.draftNo ?? null,
      draftTitle: entry.draftTitle || entry.chapterTitle || text().draftPrefix
    };

    entry.chapterStatus = 'chapter';
    entry.documentType = 'chapter';
    entry.chapterKey = chapterKey;
    entry.chapterIndex = chapterIndex;
    entry.chapterNo = chapter.chapterNo || chapterIndex + 1;
    entry.chapterTitle = chapterTitle;
    entry.contentPath = chapter.contentPath || chapterKey;
    entry.resolvedAt = savedAt;
    entry.chapterSavedAt = savedAt;
    entry.draftPromotedAt = savedAt;
    entry.resolvedFromDraft = draftMeta;
    didResolve = true;
  });

  if (didResolve) namingData = normalizeNamingData(namingData);
  return didResolve;
}

function activeChapterTextForNameCount() {
  const editor = document.getElementById('editor');
  if (editor) return getCleanEditorText();
  return htmlToCountableText(chapters[curChap]?.content || '');
}

function nameDetailTimeLabel(entry = {}) {
  const updatedAt = entry.updatedAt || '';
  const createdAt = entry.createdAt || '';
  const chapterSavedAt = entry.chapterSavedAt || entry.resolvedAt || '';

  if (updatedAt && updatedAt !== createdAt && (!chapterSavedAt || new Date(updatedAt) > new Date(chapterSavedAt))) {
    return `${text().nameEditedAt}: ${factTimeLabel(updatedAt)}`;
  }

  if (chapterSavedAt) return `${text().nameAddedAt}: ${factTimeLabel(chapterSavedAt)}`;
  if (createdAt) return `${text().nameAddedAt}: ${factTimeLabel(createdAt)}`;
  return '';
}

function scanNamingUsesForDocument(documentKey = currentNamingChapterKey(), documentText = getCleanEditorText(), documentMeta = activeNamingDocumentMeta(), savedAt = new Date().toISOString()) {
  namingData = normalizeNamingData(namingData);
  const resolvedUndefined = resolveUndefinedNamingEntriesForDocument(documentText, documentMeta, savedAt);
  const currentDocumentEntryIds = new Set(
    namingData.entries
      .filter(entry => entry.chapterKey === documentKey)
      .map(entry => entry.id)
  );
  const detectedIds = namingData.entries
    .filter(entry => !isUndefinedNamingEntry(entry))
    .filter(entry => entry.chapterKey !== documentKey && !currentDocumentEntryIds.has(entry.id))
    .filter(entry => isNamingEntryUsedInText(entry, documentText))
    .map(entry => entry.id);

  const detectedByChapter = {
    ...(namingData.detectedByChapter || {})
  };
  const uniqueDetectedIds = [...new Set(detectedIds)];
  const previousIds = namingData.detectedByChapter?.[documentKey] || [];
  const changed = previousIds.length !== uniqueDetectedIds.length ||
    previousIds.some(entryId => !uniqueDetectedIds.includes(entryId));

  if (uniqueDetectedIds.length) detectedByChapter[documentKey] = uniqueDetectedIds;
  else delete detectedByChapter[documentKey];
  namingData.detectedByChapter = detectedByChapter;
  return changed || resolvedUndefined;
}

function scanCurrentChapterForNamingUses(chapterIndex = curChap, chapterText = getCleanEditorText(), savedAt = new Date().toISOString()) {
  namingData = normalizeNamingData(namingData);
  const chapterKey = chapterStorageKey(chapterIndex);
  const documentMeta = namingMetaForChapterDocument(chapterIndex, savedAt);
  const resolvedDraft = resolveDraftNamingEntriesForChapter(chapterIndex, chapterText, savedAt);
  return scanNamingUsesForDocument(chapterKey, chapterText, documentMeta, savedAt) || resolvedDraft;
}

function scanActiveEditorForNamingUses(savedAt = new Date().toISOString(), documentText = getCleanEditorText()) {
  if (!namingData.entries?.length) return false;
  return scanNamingUsesForDocument(currentNamingChapterKey(), documentText, activeNamingDocumentMeta(savedAt), savedAt);
}

function syncEditorPlaceholderState() {
  const editor = document.getElementById('editor');
  const isEmpty = isEditorVisuallyEmpty(editor);
  if (isEmpty && editor.innerHTML) editor.replaceChildren();
  editor.classList.toggle('is-empty', isEmpty);
}

function isEditorAutoScrollNodeInside(node, editor) {
  if (!node || !editor) return false;
  if (node === editor) return true;
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return Boolean(element && editor.contains(element));
}

function isCollapsedEditorSelectionInside(editor) {
  const selection = window.getSelection();
  return Boolean(
    selection &&
    selection.rangeCount &&
    selection.isCollapsed &&
    isEditorAutoScrollNodeInside(selection.anchorNode, editor) &&
    isEditorAutoScrollNodeInside(selection.focusNode, editor)
  );
}

function isCollapsedEditorSelectionAtTextStart(editor) {
  const selection = window.getSelection();
  if (
    !editor ||
    !selection ||
    !selection.rangeCount ||
    !selection.isCollapsed ||
    !isEditorAutoScrollNodeInside(selection.anchorNode, editor) ||
    !isEditorAutoScrollNodeInside(selection.focusNode, editor)
  ) {
    return false;
  }

  const selectionRange = selection.getRangeAt(0);
  const leadingRange = document.createRange();
  try {
    leadingRange.selectNodeContents(editor);
    leadingRange.setEnd(selectionRange.startContainer, selectionRange.startOffset);
    return leadingRange.toString().length === 0;
  } catch (error) {
    return false;
  } finally {
    leadingRange.detach?.();
  }
}

function editorAutoScrollCaretBlock(editor) {
  const selection = window.getSelection();
  if (
    !editor ||
    !selection ||
    !selection.rangeCount ||
    !selection.isCollapsed ||
    !isEditorAutoScrollNodeInside(selection.anchorNode, editor)
  ) {
    return null;
  }

  let node = selection.anchorNode;
  if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
  while (node && node !== editor) {
    if (isEditorBlockElement(node)) return node;
    node = node.parentElement;
  }
  return null;
}

function editorPlainTextSelectionOffset(editor) {
  const selection = window.getSelection();
  if (
    !editor ||
    !selection ||
    !selection.rangeCount ||
    !selection.isCollapsed ||
    !isEditorAutoScrollNodeInside(selection.anchorNode, editor) ||
    !isEditorAutoScrollNodeInside(selection.focusNode, editor)
  ) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const leadingRange = document.createRange();
  try {
    leadingRange.selectNodeContents(editor);
    leadingRange.setEnd(range.startContainer, range.startOffset);
    return leadingRange.toString().length;
  } catch (error) {
    return null;
  } finally {
    leadingRange.detach?.();
  }
}

function isEditorPlainTextEmptyLineCaret(editor) {
  if (!editor || !isEditorPlainTextMode(editor)) return false;
  const offset = editorPlainTextSelectionOffset(editor);
  if (!Number.isFinite(offset)) return false;
  const textValue = String(editor.textContent || '').replace(/\u00a0/g, ' ');
  const previousBreak = offset <= 0 ? -1 : textValue.lastIndexOf('\n', offset - 1);
  const nextBreak = textValue.indexOf('\n', offset);
  const lineStart = previousBreak + 1;
  const lineEnd = nextBreak === -1 ? textValue.length : nextBreak;
  const lineText = textValue.slice(lineStart, lineEnd).replace(/\u200b/g, '').trim();
  return lineText.length === 0;
}

function editorPlainTextEmptyLineCaretRect(editor) {
  if (!isEditorPlainTextEmptyLineCaret(editor)) return null;
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;

  const originalRange = selection.getRangeAt(0).cloneRange();
  const markerRange = originalRange.cloneRange();
  const marker = document.createElement('span');
  marker.dataset.editorAutoScrollCaretProbe = 'true';
  marker.textContent = '\u200b';
  marker.style.display = 'inline-block';
  marker.style.width = '0';
  marker.style.minWidth = '0';
  marker.style.overflow = 'hidden';
  marker.style.lineHeight = 'inherit';

  try {
    markerRange.insertNode(marker);
    const rect = marker.getBoundingClientRect();
    return rect && (rect.width || rect.height) ? rect : null;
  } catch (error) {
    return null;
  } finally {
    marker.remove();
    selection.removeAllRanges();
    selection.addRange(originalRange);
    markerRange.detach?.();
  }
}

function isEditorAutoScrollEmptyParagraphCaret(editor) {
  if (isEditorPlainTextMode(editor)) return isEditorPlainTextEmptyLineCaret(editor);
  const block = editorAutoScrollCaretBlock(editor);
  return Boolean(block && isEditorBlockElement(block) && isEditorVisuallyEmpty(block));
}

function editorAutoScrollEmptyParagraphCaretRect(editor) {
  if (isEditorPlainTextMode(editor)) return editorPlainTextEmptyLineCaretRect(editor);
  const block = editorAutoScrollCaretBlock(editor);
  if (!block || !isEditorBlockElement(block) || !isEditorVisuallyEmpty(block)) return null;
  const rect = block.getBoundingClientRect();
  return rect && (rect.width || rect.height) ? rect : null;
}

function shouldRunEditorAutoScrollForCaret(editor) {
  return !isEditorAutoScrollEmptyParagraphOnly || isEditorAutoScrollEmptyParagraphCaret(editor);
}

function parseEditorAutoScrollTimeMs(value, fallback = 320) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return fallback;
  const numericValue = parseFloat(rawValue);
  if (!Number.isFinite(numericValue)) return fallback;
  if (rawValue.endsWith('s') && !rawValue.endsWith('ms')) return numericValue * 1000;
  return numericValue;
}

function editorAutoScrollFocusTimeBounds() {
  const styles = window.getComputedStyle(document.documentElement);
  const min = parseEditorAutoScrollTimeMs(styles.getPropertyValue('--editor-auto-scroll-focus-min-time'), 200);
  const max = parseEditorAutoScrollTimeMs(styles.getPropertyValue('--editor-auto-scroll-focus-max-time'), 5000);
  const safeMin = Math.max(0, Number.isFinite(min) ? min : 200);
  const safeMax = Math.max(safeMin, Number.isFinite(max) ? max : 5000);
  return { min: safeMin, max: safeMax };
}

function editorAutoScrollDefaultFocusTimeMs() {
  const styles = window.getComputedStyle(document.documentElement);
  const bounds = editorAutoScrollFocusTimeBounds();
  const defaultTime = parseEditorAutoScrollTimeMs(styles.getPropertyValue('--editor-auto-scroll-focus-default-time'), 320);
  return clampEditorAutoScrollValue(defaultTime, bounds.min, bounds.max);
}

function normalizeEditorAutoScrollFocusTime(value) {
  const bounds = editorAutoScrollFocusTimeBounds();
  const parsedValue = parseEditorAutoScrollTimeMs(value, editorAutoScrollDefaultFocusTimeMs());
  return Math.round(clampEditorAutoScrollValue(parsedValue, bounds.min, bounds.max));
}

function currentEditorAutoScrollFocusTimeMs() {
  const storedValue = localStorage.getItem(EDITOR_AUTO_SCROLL_FOCUS_TIME_KEY);
  return storedValue === null
    ? editorAutoScrollDefaultFocusTimeMs()
    : normalizeEditorAutoScrollFocusTime(storedValue);
}

function editorAutoScrollFocusTimePercent(value = currentEditorAutoScrollFocusTimeMs()) {
  const bounds = editorAutoScrollFocusTimeBounds();
  if (bounds.max <= bounds.min) return 0;
  return Math.round(((normalizeEditorAutoScrollFocusTime(value) - bounds.min) / (bounds.max - bounds.min)) * 100);
}

function editorAutoScrollFocusTimeFromPercent(percent) {
  const bounds = editorAutoScrollFocusTimeBounds();
  const safePercent = clampEditorAutoScrollValue(Number(percent) || 0, 0, 100);
  return Math.round(bounds.min + ((bounds.max - bounds.min) * safePercent / 100));
}

function editorAutoScrollFocusTimeSeconds(value = currentEditorAutoScrollFocusTimeMs()) {
  return normalizeEditorAutoScrollFocusTime(value) / 1000;
}

function editorAutoScrollFocusTimeLabel(value = currentEditorAutoScrollFocusTimeMs()) {
  return `${editorAutoScrollFocusTimeSeconds(value).toFixed(1)} s`;
}

function syncEditorAutoScrollFocusSpeedControl() {
  const range = document.getElementById('editorAutoScrollFocusSpeedRange');
  const pill = document.getElementById('editorAutoScrollFocusSpeedPill');
  const value = document.getElementById('editorAutoScrollFocusSpeedValue');
  const currentTime = currentEditorAutoScrollFocusTimeMs();
  const currentTimeLabel = editorAutoScrollFocusTimeLabel(currentTime);
  const currentPercent = editorAutoScrollFocusTimePercent(currentTime);
  if (pill) {
    pill.style.setProperty('--editor-auto-scroll-focus-speed-fill', `${currentPercent}%`);
  }
  if (range) {
    range.value = String(currentPercent);
    range.setAttribute('aria-valuetext', currentTimeLabel);
  }
  if (value) value.textContent = currentTimeLabel;
}

function setEditorAutoScrollFocusTime(value, options = {}) {
  const nextTime = normalizeEditorAutoScrollFocusTime(value);
  if (options.persist !== false) {
    localStorage.setItem(EDITOR_AUTO_SCROLL_FOCUS_TIME_KEY, String(nextTime));
    if (typeof saveEditorSettings === 'function') saveEditorSettings();
  }
  syncEditorAutoScrollFocusSpeedControl();
  return nextTime;
}

function editorAutoScrollFocusSpeedInputValue(value = currentEditorAutoScrollFocusTimeMs()) {
  return editorAutoScrollFocusTimeSeconds(value).toFixed(1);
}

function parseEditorAutoScrollFocusSpeedSeconds(value) {
  const rawValue = String(value || '').trim().replace(',', '.');
  if (!rawValue) return null;
  const seconds = parseFloat(rawValue);
  return Number.isFinite(seconds) ? `${seconds * 1000}ms` : null;
}

function beginEditorAutoScrollFocusSpeedValueEdit(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const button = document.getElementById('editorAutoScrollFocusSpeedValue');
  if (!button || button.hidden) return;

  const existingInput = document.getElementById('editorAutoScrollFocusSpeedValueInput');
  if (existingInput) {
    existingInput.focus({ preventScroll: true });
    existingInput.select?.();
    return;
  }

  const bounds = editorAutoScrollFocusTimeBounds();
  const input = document.createElement('input');
  input.id = 'editorAutoScrollFocusSpeedValueInput';
  input.className = 'setting-state editor-setting-range-value editor-focus-speed-value-input lm-id-editorAutoScrollFocusSpeedValueInput';
  input.type = 'number';
  input.inputMode = 'decimal';
  input.step = '0.1';
  input.min = (bounds.min / 1000).toFixed(1);
  input.max = (bounds.max / 1000).toFixed(1);
  input.value = editorAutoScrollFocusSpeedInputValue();
  input.setAttribute('aria-label', 'Scrolling speed seconds');

  button.hidden = true;
  button.after(input);
  input.focus({ preventScroll: true });
  input.select();

  let isFinished = false;
  const finishEdit = commit => {
    if (isFinished) return;
    isFinished = true;
    const nextTime = commit ? parseEditorAutoScrollFocusSpeedSeconds(input.value) : null;
    input.remove();
    button.hidden = false;
    if (nextTime !== null) {
      setEditorAutoScrollFocusTime(nextTime);
      button.focus({ preventScroll: true });
    } else {
      syncEditorAutoScrollFocusSpeedControl();
    }
  };

  input.addEventListener('keydown', keyEvent => {
    if (keyEvent.key === 'Enter') {
      keyEvent.preventDefault();
      finishEdit(true);
    } else if (keyEvent.key === 'Escape') {
      keyEvent.preventDefault();
      finishEdit(false);
      button.focus({ preventScroll: true });
    }
  });
  input.addEventListener('blur', () => finishEdit(true));
}

function setEditorAutoScrollFocusSpeedFromPointer(event, pill, range) {
  if (!event || !pill || !range) return;
  const rect = pill.getBoundingClientRect();
  if (!rect.width) return;
  const percent = clampEditorAutoScrollValue(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
  range.value = String(Math.round(percent));
  setEditorAutoScrollFocusTime(editorAutoScrollFocusTimeFromPercent(range.value));
}

function initEditorAutoScrollFocusSpeedControl() {
  const range = document.getElementById('editorAutoScrollFocusSpeedRange');
  const pill = document.getElementById('editorAutoScrollFocusSpeedPill');
  const valueButton = document.getElementById('editorAutoScrollFocusSpeedValue');
  syncEditorAutoScrollFocusSpeedControl();
  if (!range || range.dataset.autoFocusSpeedBound === 'true') return;
  range.dataset.autoFocusSpeedBound = 'true';
  if (valueButton && valueButton.dataset.autoFocusSpeedValueBound !== 'true') {
    valueButton.dataset.autoFocusSpeedValueBound = 'true';
    valueButton.addEventListener('click', beginEditorAutoScrollFocusSpeedValueEdit);
  }
  range.addEventListener('input', () => {
    setEditorAutoScrollFocusTime(editorAutoScrollFocusTimeFromPercent(range.value));
  });
  let pointerId = null;
  pill?.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    pointerId = event.pointerId;
    pill.classList.add('is-dragging');
    pill.setPointerCapture?.(event.pointerId);
    range.focus({ preventScroll: true });
    setEditorAutoScrollFocusSpeedFromPointer(event, pill, range);
  });
  pill?.addEventListener('pointermove', event => {
    if (pointerId !== event.pointerId) return;
    event.preventDefault();
    setEditorAutoScrollFocusSpeedFromPointer(event, pill, range);
  });
  const endPointerDrag = event => {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    pill.classList.remove('is-dragging');
    pill.releasePointerCapture?.(event.pointerId);
  };
  pill?.addEventListener('pointerup', endPointerDrag);
  pill?.addEventListener('pointercancel', endPointerDrag);
}

function easeEditorAutoScrollFocus(progress) {
  const safeProgress = clampEditorAutoScrollValue(progress, 0, 1);
  return 1 - Math.pow(1 - safeProgress, 3);
}

function setEditorAutoScrollTop(editor, nextScrollTop, options = {}) {
  if (!editor) return false;
  const maxScroll = Math.max(0, editor.scrollHeight - editor.clientHeight);
  const targetScrollTop = clampEditorAutoScrollValue(nextScrollTop, 0, maxScroll);
  const startScrollTop = editor.scrollTop || 0;
  const scrollDelta = targetScrollTop - startScrollTop;
  if (Math.abs(scrollDelta) <= 0.5) return false;

  cancelAnimationFrame(editorAutoScrollAnimationFrame);
  editorAutoScrollAnimationFrame = null;
  markEditorCaretAutoScroll();
  editor.classList.remove('is-scrolling');
  if (typeof updateEditorScrollThumb === 'function') updateEditorScrollThumb(false);

  const duration = options.instant ? 0 : currentEditorAutoScrollFocusTimeMs();
  if (!duration || duration <= 16) {
    markEditorProgrammaticScrollEvent();
    editor.scrollTop = targetScrollTop;
    if (typeof updateEditorScrollThumb === 'function') updateEditorScrollThumb(false);
    return true;
  }

  const startedAt = performance.now();
  const animateScroll = now => {
    const progress = clampEditorAutoScrollValue((now - startedAt) / duration, 0, 1);
    markEditorProgrammaticScrollEvent();
    editor.scrollTop = startScrollTop + (scrollDelta * easeEditorAutoScrollFocus(progress));
    if (typeof updateEditorScrollThumb === 'function') updateEditorScrollThumb(false);
    if (progress < 1) {
      editorAutoScrollAnimationFrame = requestAnimationFrame(animateScroll);
      return;
    }
    editorAutoScrollAnimationFrame = null;
    markEditorProgrammaticScrollEvent();
    editor.scrollTop = targetScrollTop;
    if (typeof updateEditorScrollThumb === 'function') updateEditorScrollThumb(false);
  };
  editorAutoScrollAnimationFrame = requestAnimationFrame(animateScroll);
  return true;
}

function clampEditorAutoScrollValue(value, min, max) {
  if (typeof clampNumber === 'function') return clampNumber(value, min, max);
  return Math.min(max, Math.max(min, value));
}

function markEditorCaretAutoScroll() {
  editorCaretAutoScrollSuppressUntil = performance.now() + EDITOR_CARET_AUTO_SCROLL_SUPPRESS_MS;
}

function markEditorProgrammaticScrollEvent() {
  editorProgrammaticScrollEventUntil = performance.now() + EDITOR_PROGRAMMATIC_SCROLL_EVENT_MS;
}

function isEditorProgrammaticScrollEventActive() {
  return performance.now() <= editorProgrammaticScrollEventUntil;
}

function isEditorManualScrollOverrideActive() {
  return editorManualScrollPausedUntilEditorClick || performance.now() <= editorManualScrollOverrideUntil;
}

function markEditorManualScrollOverride(options = {}) {
  const now = performance.now();
  if (options.source === 'scroll') {
    if (isEditorProgrammaticScrollEventActive() || now > editorManualScrollIntentUntil) return false;
  } else {
    editorManualScrollIntentUntil = now + EDITOR_MANUAL_SCROLL_INTENT_MS;
  }
  editorCaretAutoScrollSuppressUntil = 0;
  editorProgrammaticScrollEventUntil = 0;
  editorManualScrollPausedUntilEditorClick = true;
  editorManualScrollOverrideUntil = now + EDITOR_MANUAL_SCROLL_OVERRIDE_MS;
  cancelEditorCaretAutoScroll();
  if (typeof updateEditorScrollThumb === 'function') {
    updateEditorScrollThumb(options.showThumb !== false);
  }
  clearTimeout(editorManualScrollResumeTimer);
  editorManualScrollResumeTimer = null;
  return true;
}

function scheduleEditorManualScrollResume() {
  if (editorManualScrollPausedUntilEditorClick) return;
  clearTimeout(editorManualScrollResumeTimer);
  const delay = Math.max(0, editorManualScrollOverrideUntil - performance.now()) + 20;
  editorManualScrollResumeTimer = setTimeout(() => {
    editorManualScrollResumeTimer = null;
    if (isEditorManualScrollOverrideActive()) {
      scheduleEditorManualScrollResume();
      return;
    }
    editorManualScrollIntentUntil = 0;
    const editor = document.getElementById('editor');
    const canRunAutoScroll = typeof isEditorAutoScrollSystemActive === 'function'
      ? isEditorAutoScrollSystemActive()
      : isEditorAutoScrollEnabled;
    if (editor && canRunAutoScroll && document.activeElement === editor) {
      scheduleEditorCaretAutoScroll();
    }
  }, delay);
}

function resumeEditorAutoScrollAfterManualPause(options = {}) {
  const wasPaused = editorManualScrollPausedUntilEditorClick || performance.now() <= editorManualScrollOverrideUntil;
  editorManualScrollPausedUntilEditorClick = false;
  editorManualScrollOverrideUntil = 0;
  editorManualScrollIntentUntil = 0;
  clearTimeout(editorManualScrollResumeTimer);
  editorManualScrollResumeTimer = null;
  if (!wasPaused || options.schedule === false) return false;

  const editor = document.getElementById('editor');
  const canRunAutoScroll = typeof isEditorAutoScrollSystemActive === 'function'
    ? isEditorAutoScrollSystemActive()
    : isEditorAutoScrollEnabled;
  if (editor && canRunAutoScroll && document.activeElement === editor) {
    requestAnimationFrame(scheduleEditorCaretAutoScroll);
  }
  return true;
}

function isEditorCaretAutoScrollSuppressed() {
  return performance.now() <= editorCaretAutoScrollSuppressUntil;
}

function isEditorAutoScrollInProgress() {
  return Boolean(editorAutoScrollAnimationFrame) || isEditorCaretAutoScrollSuppressed();
}

function markEditorCaretPointerPlacement() {
  editorCaretPointerPlacementUntil = performance.now() + EDITOR_CARET_AUTO_SCROLL_SUPPRESS_MS;
  cancelEditorCaretAutoScroll();
}

function isEditorCaretPointerPlacementActive() {
  return performance.now() <= editorCaretPointerPlacementUntil;
}

function editorAutoScrollDepthBounds(editor) {
  const editorHeight = editor?.clientHeight || 0;
  if (!editorHeight) return { min: 0, max: 0 };
  const min = Math.min(80, editorHeight);
  const max = Math.max(min, editorHeight - 24);
  return { min, max };
}

function normalizeEditorAutoScrollDepthSetting(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';

  if (rawValue.endsWith('%')) {
    const percent = parseFloat(rawValue);
    return Number.isFinite(percent) ? `${Number(clampEditorAutoScrollValue(percent, 1, 100).toFixed(2))}%` : '';
  }

  if (rawValue.endsWith('px')) {
    const pixels = parseFloat(rawValue);
    return Number.isFinite(pixels) && pixels > 0 ? `${Number(pixels.toFixed(1))}px` : '';
  }

  const numericValue = parseFloat(rawValue);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return '';
  if (numericValue <= 1) return `${Number(clampEditorAutoScrollValue(numericValue * 100, 1, 100).toFixed(2))}%`;
  if (numericValue <= 100) return `${Number(clampEditorAutoScrollValue(numericValue, 1, 100).toFixed(2))}%`;
  return `${Number(numericValue.toFixed(1))}px`;
}

function applyEditorAutoScrollDepthSetting(value, options = {}) {
  const editor = document.getElementById('editor');
  if (!editor) return;

  const normalizedValue = normalizeEditorAutoScrollDepthSetting(value);
  if (normalizedValue) {
    editor.style.setProperty('--editor-auto-scroll-depth', normalizedValue);
    if (options.persist) localStorage.setItem(EDITOR_AUTO_SCROLL_DEPTH_KEY, normalizedValue);
  } else {
    editor.style.removeProperty('--editor-auto-scroll-depth');
    if (options.persist) localStorage.removeItem(EDITOR_AUTO_SCROLL_DEPTH_KEY);
  }
  if (options.persist && typeof saveEditorSettings === 'function') saveEditorSettings();

  if (options.position !== false) positionEditorAutoScrollDepthMarker();
}

function resetEditorAutoScrollDepthToDefault(options = {}) {
  applyEditorAutoScrollDepthSetting('', {
    persist: options.persist !== false,
    position: options.position !== false
  });
  if (options.schedule !== false) scheduleEditorCaretAutoScroll();
}

function restoreEditorAutoScrollDepthSetting() {
  applyEditorAutoScrollDepthSetting(localStorage.getItem(EDITOR_AUTO_SCROLL_DEPTH_KEY), { persist: false });
  applyEditorAutoScrollBandSetting(
    localStorage.getItem(EDITOR_AUTO_SCROLL_BAND_TOP_KEY),
    localStorage.getItem(EDITOR_AUTO_SCROLL_BAND_BOTTOM_KEY),
    { persist: false }
  );
}

function applyAutoScrollCssVariablesFromSettings() {
  const root = document.documentElement;
  if (!root) return;

  const defaultDepth = typeof lmEditorAdvancedNumber === 'function' ? lmEditorAdvancedNumber('defaultAutoScrollDepth', 72) : 72;
  const defaultTop = typeof lmEditorAdvancedNumber === 'function' ? lmEditorAdvancedNumber('defaultAutoScrollBandTop', 14) : 14;
  const defaultBottom = typeof lmEditorAdvancedNumber === 'function' ? lmEditorAdvancedNumber('defaultAutoScrollBandBottom', 88) : 88;
  const bandMinGap = typeof lmEditorAdvancedNumber === 'function' ? lmEditorAdvancedNumber('autoScrollBandMinGap', 22) : 22;

  const storedDepth = localStorage.getItem(EDITOR_AUTO_SCROLL_DEPTH_KEY);
  const storedTop = localStorage.getItem(EDITOR_AUTO_SCROLL_BAND_TOP_KEY);
  const storedBottom = localStorage.getItem(EDITOR_AUTO_SCROLL_BAND_BOTTOM_KEY);

  const depthVal = storedDepth !== null ? parseFloat(storedDepth) : defaultDepth;
  const topVal = storedTop !== null ? parseFloat(storedTop) : defaultTop;
  const bottomVal = storedBottom !== null ? parseFloat(storedBottom) : defaultBottom;

  root.style.setProperty('--editor-auto-scroll-depth', `${Number.isFinite(depthVal) ? depthVal : defaultDepth}%`);
  root.style.setProperty('--editor-auto-scroll-band-top', `${Number.isFinite(topVal) ? topVal : defaultTop}%`);
  root.style.setProperty('--editor-auto-scroll-band-bottom', `${Number.isFinite(bottomVal) ? bottomVal : defaultBottom}%`);
  root.style.setProperty('--editor-auto-scroll-band-min-gap', `${Number.isFinite(bandMinGap) ? bandMinGap : 22}%`);
}

function editorAutoScrollDepthPx(editor) {
  const editorHeight = editor?.clientHeight || 0;
  if (!editorHeight) return 0;

  const defaultDepth = typeof lmEditorAdvancedNumber === 'function'
    ? lmEditorAdvancedNumber('defaultAutoScrollDepth', 72)
    : 72;
  const rawDepth = window.getComputedStyle(editor)
    .getPropertyValue('--editor-auto-scroll-depth')
    .trim();
  const fallbackDepth = editorHeight * (defaultDepth / 100);
  let depth = fallbackDepth;

  if (rawDepth.endsWith('%')) {
    depth = editorHeight * ((parseFloat(rawDepth) || defaultDepth) / 100);
  } else if (rawDepth.endsWith('px')) {
    depth = parseFloat(rawDepth) || fallbackDepth;
  } else if (rawDepth) {
    const numericDepth = parseFloat(rawDepth);
    if (Number.isFinite(numericDepth)) {
      depth = numericDepth <= 1 ? editorHeight * numericDepth : numericDepth <= 100 ? editorHeight * (numericDepth / 100) : numericDepth;
    }
  }

  const bounds = editorAutoScrollDepthBounds(editor);
  return clampEditorAutoScrollValue(depth, bounds.min, bounds.max);
}

function editorAutoScrollDepthPercent(editor, depthPx) {
  if (!editor?.clientHeight) return 0;
  return clampEditorAutoScrollValue((depthPx / editor.clientHeight) * 100, 1, 100);
}

function isEditorAutoScrollBandMode() {
  return typeof currentEditorAutoScrollMode === 'function'
    ? currentEditorAutoScrollMode() === 'band'
    : editorAutoScrollMode === 'band';
}

function isEditorAutoScrollDepthMode() {
  return !isEditorAutoScrollBandMode();
}

function editorAutoScrollDimensionPx(editor, value, fallbackPercent) {
  const editorHeight = editor?.clientHeight || 0;
  if (!editorHeight) return 0;

  const rawValue = String(value || '').trim();
  let depth = editorHeight * fallbackPercent;

  if (rawValue.endsWith('%')) {
    const percent = parseFloat(rawValue);
    if (Number.isFinite(percent)) depth = editorHeight * (percent / 100);
  } else if (rawValue.endsWith('px')) {
    const pixels = parseFloat(rawValue);
    if (Number.isFinite(pixels)) depth = pixels;
  } else if (rawValue) {
    const numericValue = parseFloat(rawValue);
    if (Number.isFinite(numericValue)) {
      depth = numericValue <= 1
        ? editorHeight * numericValue
        : numericValue <= 100
          ? editorHeight * (numericValue / 100)
          : numericValue;
    }
  }

  return depth;
}

function editorAutoScrollCssDepthPx(editor, propertyName, fallbackPercent) {
  const rawValue = window.getComputedStyle(editor).getPropertyValue(propertyName).trim();
  return editorAutoScrollDimensionPx(editor, rawValue, fallbackPercent);
}

function editorAutoScrollRootDepthPx(editor) {
  const defaultDepthFrac = (typeof lmEditorAdvancedNumber === 'function' ? lmEditorAdvancedNumber('defaultAutoScrollDepth', 72) : 72) / 100;
  const rawDepth = window.getComputedStyle(document.documentElement)
    .getPropertyValue('--editor-auto-scroll-depth')
    .trim();
  return editorAutoScrollDimensionPx(editor, rawDepth, defaultDepthFrac);
}

function editorAutoScrollBandMinGapPx(editor) {
  const editorHeight = editor?.clientHeight || 0;
  if (!editorHeight) return 0;
  const configuredValue = typeof lmEditorAdvancedNumber === 'function'
    ? lmEditorAdvancedNumber('autoScrollBandMinGap', 22)
    : null;
  const rawGap = configuredValue !== null
    ? `${configuredValue}%`
    : window.getComputedStyle(editor).getPropertyValue('--editor-auto-scroll-band-min-gap').trim();
  const fallbackGap = editorHeight * 0.22;
  const gap = editorAutoScrollDimensionPx(editor, rawGap, 0.22) || fallbackGap;
  return clampEditorAutoScrollValue(gap, 48, Math.max(48, editorHeight - 48));
}

function editorAutoScrollBandBounds(editor) {
  const baseBounds = editorAutoScrollDepthBounds(editor);
  const usableHeight = Math.max(1, baseBounds.max - baseBounds.min);
  const gap = clampEditorAutoScrollValue(editorAutoScrollBandMinGapPx(editor), 1, usableHeight);
  return { min: baseBounds.min, max: baseBounds.max, gap };
}

function editorAutoScrollBandRange(editor) {
  const bounds = editorAutoScrollBandBounds(editor);
  const defaultTopFrac = (typeof lmEditorAdvancedNumber === 'function' ? lmEditorAdvancedNumber('defaultAutoScrollBandTop', 14) : 14) / 100;
  const defaultBottomFrac = (typeof lmEditorAdvancedNumber === 'function' ? lmEditorAdvancedNumber('defaultAutoScrollBandBottom', 88) : 88) / 100;
  let top = editorAutoScrollCssDepthPx(editor, '--editor-auto-scroll-band-top', defaultTopFrac);
  let bottom = editorAutoScrollCssDepthPx(editor, '--editor-auto-scroll-band-bottom', defaultBottomFrac);

  bottom = clampEditorAutoScrollValue(bottom, bounds.min + bounds.gap, bounds.max);
  top = clampEditorAutoScrollValue(top, bounds.min, bottom - bounds.gap);

  if (bottom - top < bounds.gap) {
    bottom = clampEditorAutoScrollValue(top + bounds.gap, bounds.min + bounds.gap, bounds.max);
    top = clampEditorAutoScrollValue(bottom - bounds.gap, bounds.min, bounds.max - bounds.gap);
  }

  return { top, bottom, ...bounds };
}

function editorAutoScrollBandTopPx(editor) {
  return editorAutoScrollBandRange(editor).top;
}

function editorAutoScrollTargetDepthPx(editor) {
  return isEditorAutoScrollBandMode()
    ? editorAutoScrollBandTopPx(editor)
    : editorAutoScrollDepthPx(editor);
}

function applyEditorAutoScrollBandSetting(topValue, bottomValue, options = {}) {
  const editor = document.getElementById('editor');
  if (!editor) return;

  const normalizedTop = normalizeEditorAutoScrollDepthSetting(topValue);
  const normalizedBottom = normalizeEditorAutoScrollDepthSetting(bottomValue);
  if (normalizedTop) {
    editor.style.setProperty('--editor-auto-scroll-band-top', normalizedTop);
    if (options.persist) localStorage.setItem(EDITOR_AUTO_SCROLL_BAND_TOP_KEY, normalizedTop);
  } else {
    editor.style.removeProperty('--editor-auto-scroll-band-top');
    if (options.persist) localStorage.removeItem(EDITOR_AUTO_SCROLL_BAND_TOP_KEY);
  }

  if (normalizedBottom) {
    editor.style.setProperty('--editor-auto-scroll-band-bottom', normalizedBottom);
    if (options.persist) localStorage.setItem(EDITOR_AUTO_SCROLL_BAND_BOTTOM_KEY, normalizedBottom);
  } else {
    editor.style.removeProperty('--editor-auto-scroll-band-bottom');
    if (options.persist) localStorage.removeItem(EDITOR_AUTO_SCROLL_BAND_BOTTOM_KEY);
  }
  if (options.persist && typeof saveEditorSettings === 'function') saveEditorSettings();

  positionEditorAutoScrollDepthMarker();
}

function resetEditorAutoScrollBandPointToDefault(kind, options = {}) {
  const editor = document.getElementById('editor');
  if (!editor || !['top', 'bottom'].includes(kind)) return;

  if (kind === 'top') {
    editor.style.removeProperty('--editor-auto-scroll-band-top');
    if (options.persist !== false) localStorage.removeItem(EDITOR_AUTO_SCROLL_BAND_TOP_KEY);
  } else {
    editor.style.removeProperty('--editor-auto-scroll-band-bottom');
    if (options.persist !== false) localStorage.removeItem(EDITOR_AUTO_SCROLL_BAND_BOTTOM_KEY);
  }
  if (options.persist !== false && typeof saveEditorSettings === 'function') saveEditorSettings();

  positionEditorAutoScrollDepthMarker();
  if (options.schedule !== false) scheduleEditorCaretAutoScroll();
}

function setEditorAutoScrollBandPx(topPx, bottomPx, options = {}) {
  const editor = document.getElementById('editor');
  if (!editor) return;

  const bounds = editorAutoScrollBandBounds(editor);
  let safeTop = clampEditorAutoScrollValue(topPx, bounds.min, bounds.max - bounds.gap);
  let safeBottom = clampEditorAutoScrollValue(bottomPx, bounds.min + bounds.gap, bounds.max);

  if (safeBottom - safeTop < bounds.gap) {
    safeBottom = clampEditorAutoScrollValue(safeTop + bounds.gap, bounds.min + bounds.gap, bounds.max);
    safeTop = clampEditorAutoScrollValue(safeBottom - bounds.gap, bounds.min, bounds.max - bounds.gap);
  }

  const topValue = `${Number(editorAutoScrollDepthPercent(editor, safeTop).toFixed(2))}%`;
  const bottomValue = `${Number(editorAutoScrollDepthPercent(editor, safeBottom).toFixed(2))}%`;
  editor.style.setProperty('--editor-auto-scroll-band-top', topValue);
  editor.style.setProperty('--editor-auto-scroll-band-bottom', bottomValue);
  if (options.persist) {
    localStorage.setItem(EDITOR_AUTO_SCROLL_BAND_TOP_KEY, topValue);
    localStorage.setItem(EDITOR_AUTO_SCROLL_BAND_BOTTOM_KEY, bottomValue);
    if (typeof saveEditorSettings === 'function') saveEditorSettings();
  }
  positionEditorAutoScrollDepthMarker();
  if (options.schedule !== false) scheduleEditorCaretAutoScroll();
}

function centerEditorAutoScrollDepthMarker(options = {}) {
  const editor = document.getElementById('editor');
  if (!editor || !shouldShowEditorAutoScrollDepthMarker(editor)) return;
  setEditorAutoScrollDepthPx(editor.clientHeight / 2, {
    persist: options.persist !== false,
    schedule: options.schedule !== false
  });
}

function centerEditorAutoScrollBandMarkersWithMinGap(options = {}) {
  const editor = document.getElementById('editor');
  if (!editor || !shouldShowEditorAutoScrollBandMarkers(editor)) return;

  const bounds = editorAutoScrollBandBounds(editor);
  const halfGap = bounds.gap / 2;
  const center = clampEditorAutoScrollValue(
    editor.clientHeight / 2,
    bounds.min + halfGap,
    bounds.max - halfGap
  );
  setEditorAutoScrollBandPx(center - halfGap, center + halfGap, {
    persist: options.persist !== false,
    schedule: options.schedule !== false
  });
}

function setEditorAutoScrollBandPointPx(kind, depthPx, options = {}) {
  const editor = document.getElementById('editor');
  if (!editor) return;

  const range = editorAutoScrollBandRange(editor);
  const bounds = editorAutoScrollBandBounds(editor);
  let top = range.top;
  let bottom = range.bottom;

  if (kind === 'top') {
    top = clampEditorAutoScrollValue(depthPx, bounds.min, bounds.max - bounds.gap);
    if (top + bounds.gap > bottom) {
      const shiftedBottom = top + bounds.gap;
      if (shiftedBottom <= bounds.max) bottom = shiftedBottom;
      else {
        bottom = bounds.max;
        top = bottom - bounds.gap;
      }
    }
  } else {
    bottom = clampEditorAutoScrollValue(depthPx, bounds.min + bounds.gap, bounds.max);
    if (bottom - bounds.gap < top) {
      const shiftedTop = bottom - bounds.gap;
      if (shiftedTop >= bounds.min) top = shiftedTop;
      else {
        top = bounds.min;
        bottom = top + bounds.gap;
      }
    }
  }

  setEditorAutoScrollBandPx(top, bottom, options);
}

function editorDefaultBottomPaddingPx(editor) {
  if (!editor) return 0;

  const rawPadding = window.getComputedStyle(editor)
    .getPropertyValue('--editor-padding-bottom')
    .trim();
  const numericPadding = parseFloat(rawPadding);

  if (rawPadding.endsWith('%') && Number.isFinite(numericPadding)) {
    return editor.clientWidth * (numericPadding / 100);
  }
  if (rawPadding.endsWith('px') && Number.isFinite(numericPadding)) {
    return numericPadding;
  }
  if (Number.isFinite(numericPadding)) {
    return numericPadding;
  }

  return parseFloat(window.getComputedStyle(editor).paddingBottom) || 0;
}

function syncEditorAutoScrollLinkedPadding(editor, depthPx) {
  if (!editor) return;
  if (!isEditorAutoScrollEnabled) {
    editor.style.removeProperty('--editor-auto-scroll-linked-padding');
    return;
  }

  const defaultPadding = editorDefaultBottomPaddingPx(editor);
  const linkedPadding = Math.max(0, editor.clientHeight - depthPx);
  if (linkedPadding > defaultPadding + 0.5) {
    editor.style.setProperty('--editor-auto-scroll-linked-padding', `${Math.ceil(linkedPadding)}px`);
  } else {
    editor.style.removeProperty('--editor-auto-scroll-linked-padding');
  }
}

function setEditorAutoScrollDepthPx(depthPx, options = {}) {
  const editor = document.getElementById('editor');
  if (!editor) return;

  const bounds = editorAutoScrollDepthBounds(editor);
  const safeDepth = clampEditorAutoScrollValue(depthPx, bounds.min, bounds.max);
  const nextValue = `${Number(editorAutoScrollDepthPercent(editor, safeDepth).toFixed(2))}%`;
  editor.style.setProperty('--editor-auto-scroll-depth', nextValue);
  if (options.persist) {
    localStorage.setItem(EDITOR_AUTO_SCROLL_DEPTH_KEY, nextValue);
    if (typeof saveEditorSettings === 'function') saveEditorSettings();
  }
  positionEditorAutoScrollDepthMarker(safeDepth);
  if (options.schedule !== false) scheduleEditorCaretAutoScroll();
}

function shouldShowEditorAutoScrollDepthMarker(editor) {
  if (!editor || !isEditorAutoScrollEnabled) return false;
  if (typeof canEditActiveDocument === 'function' && !canEditActiveDocument()) return false;
  return isEditorAutoScrollDepthMode() && !editor.classList.contains('is-readonly');
}

function shouldShowEditorAutoScrollBandMarkers(editor) {
  if (!editor || !isEditorAutoScrollEnabled) return false;
  if (typeof canEditActiveDocument === 'function' && !canEditActiveDocument()) return false;
  return isEditorAutoScrollBandMode() && !editor.classList.contains('is-readonly');
}

function hideEditorAutoScrollBandMarkers() {
  document.getElementById('editorAutoScrollTopMarker')?.setAttribute('hidden', '');
  document.getElementById('editorAutoScrollBottomMarker')?.setAttribute('hidden', '');
}

function positionEditorAutoScrollBandMarkers() {
  const editor = document.getElementById('editor');
  const wrap = document.getElementById('editor-wrap');
  const topMarker = document.getElementById('editorAutoScrollTopMarker');
  const bottomMarker = document.getElementById('editorAutoScrollBottomMarker');
  if (!editor || !wrap || !topMarker || !bottomMarker || !shouldShowEditorAutoScrollBandMarkers(editor)) {
    hideEditorAutoScrollBandMarkers();
    if (editor && !isEditorAutoScrollDepthMode()) editor.style.removeProperty('--editor-auto-scroll-linked-padding');
    return;
  }

  const editorRect = editor.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const range = editorAutoScrollBandRange(editor);
  const markerWidth = Math.max(topMarker.offsetWidth || 15, bottomMarker.offsetWidth || 15);
  const markerInset = 1;
  const markerLeft = Math.round(editorRect.left - wrapRect.left + markerInset);
  const guideWidth = Math.max(0, Math.round(editorRect.width - markerWidth - markerInset * 2));

  syncEditorAutoScrollLinkedPadding(editor, range.top);
  [
    { marker: topMarker, depth: range.top, kind: 'top' },
    { marker: bottomMarker, depth: range.bottom, kind: 'bottom' }
  ].forEach(({ marker, depth, kind }) => {
    const percent = Math.round(editorAutoScrollDepthPercent(editor, depth));
    marker.hidden = false;
    marker.style.left = `${markerLeft}px`;
    marker.style.top = `${Math.round(editorRect.top - wrapRect.top + depth)}px`;
    marker.style.setProperty('--editor-auto-scroll-guide-width', `${guideWidth}px`);
    marker.setAttribute('aria-valuemin', '1');
    marker.setAttribute('aria-valuemax', '100');
    marker.setAttribute('aria-valuenow', String(percent));
    marker.setAttribute('aria-valuetext', `${percent}%`);
    marker.title = kind === 'top'
      ? `Auto scroll top marker: ${percent}%`
      : `Auto scroll bottom marker: ${percent}%`;
  });
}

function positionEditorAutoScrollDepthMarker(depthOverride = null) {
  const marker = document.getElementById('editorAutoScrollDepthMarker');
  const editor = document.getElementById('editor');
  const wrap = document.getElementById('editor-wrap');
  if (isEditorAutoScrollBandMode()) {
    if (marker) marker.hidden = true;
    positionEditorAutoScrollBandMarkers();
    return;
  }
  hideEditorAutoScrollBandMarkers();
  if (!marker || !editor || !wrap || !shouldShowEditorAutoScrollDepthMarker(editor)) {
    if (marker) marker.hidden = true;
    if (editor) editor.style.removeProperty('--editor-auto-scroll-linked-padding');
    return;
  }

  const editorRect = editor.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const depth = Number.isFinite(depthOverride) ? depthOverride : editorAutoScrollDepthPx(editor);
  const percent = Math.round(editorAutoScrollDepthPercent(editor, depth));
  const markerWidth = marker.offsetWidth || 32;
  const markerInset = 1;
  const markerLeft = Math.round(editorRect.left - wrapRect.left + markerInset);
  const guideWidth = Math.max(0, Math.round(editorRect.width - markerWidth - markerInset * 2));

  marker.hidden = false;
  syncEditorAutoScrollLinkedPadding(editor, depth);
  marker.style.left = `${markerLeft}px`;
  marker.style.top = `${Math.round(editorRect.top - wrapRect.top + depth)}px`;
  marker.style.setProperty('--editor-auto-scroll-guide-width', `${guideWidth}px`);
  marker.setAttribute('aria-valuemin', '1');
  marker.setAttribute('aria-valuemax', '100');
  marker.setAttribute('aria-valuenow', String(percent));
  marker.setAttribute('aria-valuetext', `${percent}%`);
  marker.title = `Auto scroll depth: ${percent}%`;
}

function scheduleEditorAutoScrollDepthMarkerReposition() {
  requestAnimationFrame(() => {
    positionEditorAutoScrollDepthMarker();
    requestAnimationFrame(positionEditorAutoScrollDepthMarker);
  });
  setTimeout(positionEditorAutoScrollDepthMarker, 180);
}

function editorCaretRect(editor) {
  const selection = window.getSelection();
  if (
    !selection ||
    !selection.rangeCount ||
    !selection.isCollapsed ||
    !isEditorAutoScrollNodeInside(selection.anchorNode, editor) ||
    !isEditorAutoScrollNodeInside(selection.focusNode, editor)
  ) {
    return null;
  }

  const range = selection.getRangeAt(0).cloneRange();
  const rect = range.getBoundingClientRect();
  if (rect && (rect.width || rect.height)) return rect;

  const rects = Array.from(range.getClientRects());
  if (rects.length) return rects[rects.length - 1];

  if (isEditorPlainTextMode(editor) && isEditorPlainTextEmptyLineCaret(editor)) {
    return editorAutoScrollEmptyParagraphCaretRect(editor);
  }

  if (range.startContainer?.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
    const fallbackRange = range.cloneRange();
    fallbackRange.setStart(range.startContainer, Math.max(0, range.startOffset - 1));
    const fallbackRects = Array.from(fallbackRange.getClientRects());
    if (fallbackRects.length) return fallbackRects[fallbackRects.length - 1];
  }

  return editorAutoScrollEmptyParagraphCaretRect(editor);
}

function runEditorEmptyParagraphCaretAutoScroll(editor, caretRect) {
  const editorRect = editor.getBoundingClientRect();
  let targetDepth = editorAutoScrollTargetDepthPx(editor);
  let visualY = caretRect.bottom - editorRect.top;

  if (isEditorAutoScrollBandMode()) {
    const range = editorAutoScrollBandRange(editor);
    const paragraphTop = caretRect.top - editorRect.top;
    const paragraphBottom = caretRect.bottom - editorRect.top;

    targetDepth = range.top;
    if (paragraphBottom >= range.bottom - 0.5) {
      visualY = paragraphBottom;
    } else {
      const topInsideBand = paragraphTop >= range.top - 0.5 && paragraphTop <= range.bottom + 0.5;
      const bottomInsideBand = paragraphBottom >= range.top - 0.5 && paragraphBottom <= range.bottom + 0.5;
      const coversBand = paragraphTop <= range.top + 0.5 && paragraphBottom >= range.bottom - 0.5;
      if (topInsideBand || bottomInsideBand || coversBand) return;
      visualY = paragraphTop;
    }
  }

  const scrollDelta = visualY - targetDepth;
  if (Math.abs(scrollDelta) <= 0.5) return;

  const maxScroll = Math.max(0, editor.scrollHeight - editor.clientHeight);
  const nextScrollTop = clampEditorAutoScrollValue(editor.scrollTop + scrollDelta, 0, maxScroll);
  if (Math.abs(nextScrollTop - editor.scrollTop) <= 0.5) return;

  setEditorAutoScrollTop(editor, nextScrollTop);
}

function runEditorCaretBandAutoScroll(editor, caretRect) {
  const editorRect = editor.getBoundingClientRect();
  const range = editorAutoScrollBandRange(editor);
  const topY = editorRect.top + range.top;
  const bottomY = editorRect.top + range.bottom;
  let scrollDelta = 0;

  if (caretRect.bottom >= bottomY - 0.5) {
    scrollDelta = caretRect.bottom - topY;
  } else if (caretRect.top < topY - 0.5) {
    scrollDelta = caretRect.top - topY;
  } else {
    return;
  }

  const maxScroll = Math.max(0, editor.scrollHeight - editor.clientHeight);
  const nextScrollTop = clampEditorAutoScrollValue(editor.scrollTop + scrollDelta, 0, maxScroll);
  if (Math.abs(nextScrollTop - editor.scrollTop) <= 0.5) return;

  setEditorAutoScrollTop(editor, nextScrollTop);
}

function runEditorCaretAutoScroll() {
  editorCaretAutoScrollFrame = null;
  const editor = document.getElementById('editor');
  const isBandMode = isEditorAutoScrollBandMode();
  if (
    !editor ||
    (typeof isEditorAutoScrollSystemActive === 'function'
      ? !isEditorAutoScrollSystemActive()
      : !isEditorAutoScrollEnabled) ||
    (!isBandMode && isEditorCaretPointerPlacementActive()) ||
    isEditorManualScrollOverrideActive() ||
    document.activeElement !== editor ||
    editor.scrollHeight <= editor.clientHeight + 1 ||
    (typeof canEditActiveDocument === 'function' && !canEditActiveDocument())
  ) {
    return;
  }

  const caretRect = editorCaretRect(editor);
  if (!caretRect) return;

  if (isEditorAutoScrollEmptyParagraphOnly) {
    if (isEditorAutoScrollEmptyParagraphCaret(editor)) {
      runEditorEmptyParagraphCaretAutoScroll(editor, caretRect);
    }
    return;
  }

  if (isBandMode) {
    runEditorCaretBandAutoScroll(editor, caretRect);
    return;
  }

  const editorRect = editor.getBoundingClientRect();
  const triggerY = editorRect.top + editorAutoScrollDepthPx(editor);
  const overflow = caretRect.bottom - triggerY;
  if (overflow <= 0) return;

  const maxScroll = Math.max(0, editor.scrollHeight - editor.clientHeight);
  const nextScrollTop = clampEditorAutoScrollValue(editor.scrollTop + overflow, 0, maxScroll);
  if (nextScrollTop <= editor.scrollTop + 0.5) return;

  setEditorAutoScrollTop(editor, nextScrollTop);
}

function scheduleEditorCaretAutoScroll() {
  if (isVirtualEditorDOMSelectionTransaction) {
    cancelEditorCaretAutoScroll();
    return;
  }
  const canRunAutoScroll = typeof isEditorAutoScrollSystemActive === 'function'
    ? isEditorAutoScrollSystemActive()
    : isEditorAutoScrollEnabled;
  if (!canRunAutoScroll) {
    cancelEditorCaretAutoScroll();
    return;
  }
  if (isEditorManualScrollOverrideActive()) {
    cancelEditorCaretAutoScroll();
    return;
  }
  if (!isEditorAutoScrollBandMode() && isEditorCaretPointerPlacementActive()) {
    const editor = document.getElementById('editor');
    if (!isEditorAutoScrollEmptyParagraphOnly || !isEditorAutoScrollEmptyParagraphCaret(editor)) {
      cancelEditorCaretAutoScroll();
      return;
    }
  }
  cancelAnimationFrame(editorCaretAutoScrollFrame);
  editorCaretAutoScrollFrame = requestAnimationFrame(runEditorCaretAutoScroll);
}

function applyEditorAutoScrollDepthMarkerToCaret(editor, options = {}) {
  if (!editor || editorAutoScrollDepthDrag || !shouldShowEditorAutoScrollDepthMarker(editor)) return false;
  if (document.activeElement !== editor || !isCollapsedEditorSelectionInside(editor)) return false;

  const caretRect = editorCaretRect(editor);
  const editorRect = editor.getBoundingClientRect();
  const fallbackDepth = Number.isFinite(options.fallbackClientY)
    ? depthFromEditorPointerY(editor, options.fallbackClientY)
    : null;
  const nextDepth = caretRect ? caretRect.bottom - editorRect.top : fallbackDepth;
  if (!Number.isFinite(nextDepth)) return false;

  const allowedMaxDepth = editorAutoScrollRootDepthPx(editor);
  if (options.scrollPastMax === true && nextDepth > allowedMaxDepth + 0.5) {
    const bounds = editorAutoScrollDepthBounds(editor);
    const targetDepth = clampEditorAutoScrollValue(allowedMaxDepth, bounds.min, bounds.max);
    setEditorAutoScrollDepthPx(targetDepth, {
      persist: options.persist !== false,
      schedule: false
    });
    const scrollDelta = nextDepth - targetDepth;
    const maxScroll = Math.max(0, editor.scrollHeight - editor.clientHeight);
    const nextScrollTop = clampEditorAutoScrollValue(editor.scrollTop + scrollDelta, 0, maxScroll);
    if (Math.abs(nextScrollTop - editor.scrollTop) > 0.5) {
      setEditorAutoScrollTop(editor, nextScrollTop);
    }
    return true;
  }

  setEditorAutoScrollDepthPx(nextDepth, {
    persist: options.persist !== false,
    schedule: options.schedule !== false
  });
  return true;
}

function syncEditorAutoScrollDepthMarkerToCaret(options = {}) {
  const editor = document.getElementById('editor');
  if (!editor || editorAutoScrollDepthDrag) return;
  if (isEditorAutoScrollEmptyParagraphOnly) {
    requestAnimationFrame(() => {
      applyEditorAutoScrollDepthMarkerToCaret(editor, {
        ...options,
        schedule: false
      });
      if (
        document.activeElement === editor &&
        isCollapsedEditorSelectionInside(editor) &&
        isEditorAutoScrollEmptyParagraphCaret(editor)
      ) {
        scheduleEditorCaretAutoScroll();
      }
    });
    return;
  }
  if (isEditorAutoScrollBandMode()) {
    requestAnimationFrame(() => {
      if (
        document.activeElement === editor &&
        isCollapsedEditorSelectionInside(editor) &&
        shouldRunEditorAutoScrollForCaret(editor)
      ) {
        scheduleEditorCaretAutoScroll();
      }
    });
    return;
  }
  if (!shouldShowEditorAutoScrollDepthMarker(editor)) return;

  requestAnimationFrame(() => {
    if (!shouldRunEditorAutoScrollForCaret(editor)) return;
    applyEditorAutoScrollDepthMarkerToCaret(editor, options);
  });
}

function scheduleEditorAutoScrollDepthMarkerCaretSync(options = {}) {
  cancelAnimationFrame(editorAutoScrollCaretPlacementSyncFrame);
  clearTimeout(editorAutoScrollCaretPlacementSyncTimer);

  const syncOptions = { ...options };
  const runSync = () => syncEditorAutoScrollDepthMarkerToCaret(syncOptions);
  runSync();

  editorAutoScrollCaretPlacementSyncFrame = requestAnimationFrame(() => {
    editorAutoScrollCaretPlacementSyncFrame = requestAnimationFrame(() => {
      editorAutoScrollCaretPlacementSyncFrame = null;
      runSync();
    });
  });
  editorAutoScrollCaretPlacementSyncTimer = setTimeout(() => {
    editorAutoScrollCaretPlacementSyncTimer = null;
    runSync();
  }, lmEditorAdvancedNumber('caretSyncDelay', 90));
}

function editorSelectionVisualRect(editor) {
  const selection = window.getSelection();
  if (
    !selection ||
    !selection.rangeCount ||
    !isEditorAutoScrollNodeInside(selection.anchorNode, editor) ||
    !isEditorAutoScrollNodeInside(selection.focusNode, editor)
  ) {
    return null;
  }

  if (selection.isCollapsed) return editorCaretRect(editor);

  const range = selection.getRangeAt(0).cloneRange();
  const rects = Array.from(range.getClientRects()).filter(rect => rect.width || rect.height);
  const rect = rects[0] || range.getBoundingClientRect();
  range.detach?.();
  return rect && (rect.width || rect.height) ? rect : null;
}

function syncEditorAutoScrollDepthMarkerToSelection(options = {}) {
  const editor = document.getElementById('editor');
  if (!editor || editorAutoScrollDepthDrag) return;
  if (isEditorAutoScrollEmptyParagraphOnly) return;

  requestAnimationFrame(() => {
    if (document.activeElement !== editor || editorAutoScrollDepthDrag) return;
    const selectionRect = editorSelectionVisualRect(editor);
    if (!selectionRect) return;

    const editorRect = editor.getBoundingClientRect();
    if (isEditorAutoScrollBandMode()) {
      const targetDepth = editorAutoScrollBandTopPx(editor);
      const visualTop = selectionRect.top - editorRect.top;
      const maxScroll = Math.max(0, editor.scrollHeight - editor.clientHeight);
      const nextScrollTop = clampEditorAutoScrollValue(editor.scrollTop + visualTop - targetDepth, 0, maxScroll);
      if (Math.abs(nextScrollTop - editor.scrollTop) > 0.5) {
        setEditorAutoScrollTop(editor, nextScrollTop);
      }
      return;
    }
    if (!shouldShowEditorAutoScrollDepthMarker(editor)) return;

    const nextDepth = selectionRect.bottom - editorRect.top;
    if (!Number.isFinite(nextDepth)) return;
    setEditorAutoScrollDepthPx(nextDepth, {
      persist: options.persist === true,
      schedule: false
    });
  });
}

function handleEditorCaretPointerPlacementStart(event) {
  const editor = document.getElementById('editor');
  if (
    !editor ||
    !editor.contains(event.target) ||
    event.target.closest?.('#editorAutoScrollDepthMarker, [data-auto-scroll-band-marker]')
  ) return;
  resumeEditorAutoScrollAfterManualPause({ schedule: false });
  markEditorCaretPointerPlacement();
}

function handleEditorCaretPointerPlacement(event) {
  const editor = document.getElementById('editor');
  if (!editor || !editor.contains(event.target)) return;
  resumeEditorAutoScrollAfterManualPause({ schedule: false });
  markEditorCaretPointerPlacement();
  scheduleEditorAutoScrollDepthMarkerCaretSync({
    persist: true,
    schedule: false,
    scrollPastMax: true,
    fallbackClientY: event.clientY
  });
}

function handleEditorManualScrollIntent() {
  markEditorManualScrollOverride({ source: 'intent' });
}

function handleEditorManualScrollKeydown(event) {
  if (!['PageUp', 'PageDown'].includes(event.key)) return;
  markEditorManualScrollOverride({ source: 'keyboard' });
}

function isEditorCaretNavigationKey(event) {
  return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key);
}

function handleEditorCaretNavigationKeydown(event) {
  if (!isEditorCaretNavigationKey(event) || !isEditorManualScrollOverrideActive()) return;
  const editor = document.getElementById('editor');
  if (!editor || document.activeElement !== editor) return;

  resumeEditorAutoScrollAfterManualPause({ schedule: false });
  scheduleEditorAutoScrollDepthMarkerCaretSync({
    persist: false,
    schedule: true,
    scrollPastMax: true
  });
}

function handleEditorManualScrollEvent() {
  markEditorManualScrollOverride({ source: 'scroll' });
}

function cancelEditorCaretAutoScroll() {
  cancelAnimationFrame(editorCaretAutoScrollFrame);
  cancelAnimationFrame(editorAutoScrollAnimationFrame);
  editorCaretAutoScrollFrame = null;
  editorAutoScrollAnimationFrame = null;
}

function depthFromEditorPointerY(editor, clientY) {
  const editorRect = editor.getBoundingClientRect();
  return clientY - editorRect.top;
}

function startEditorAutoScrollDepthDrag(event) {
  const marker = document.getElementById('editorAutoScrollDepthMarker');
  const editor = document.getElementById('editor');
  if (!marker || !editor || !shouldShowEditorAutoScrollDepthMarker(editor)) return;

  event.preventDefault();
  event.stopPropagation();
  editorAutoScrollDepthDrag = {
    pointerId: event.pointerId,
    marker,
    kind: 'depth',
    startX: event.clientX,
    startY: event.clientY,
    didDrag: false
  };
  marker.classList.add('is-dragging');
  marker.setPointerCapture?.(event.pointerId);
}

function startEditorAutoScrollBandDrag(event) {
  const marker = event.currentTarget;
  const editor = document.getElementById('editor');
  const kind = marker?.dataset?.autoScrollBandMarker;
  if (!marker || !editor || !shouldShowEditorAutoScrollBandMarkers(editor) || !['top', 'bottom'].includes(kind)) return;

  event.preventDefault();
  event.stopPropagation();
  editorAutoScrollDepthDrag = {
    pointerId: event.pointerId,
    marker,
    kind,
    startX: event.clientX,
    startY: event.clientY,
    didDrag: false
  };
  marker.classList.add('is-dragging');
  marker.setPointerCapture?.(event.pointerId);
}

function handleEditorAutoScrollDepthDrag(event) {
  if (!editorAutoScrollDepthDrag || event.pointerId !== editorAutoScrollDepthDrag.pointerId) return;
  const editor = document.getElementById('editor');
  if (!editor) return;

  event.preventDefault();
  const pointerDistance = Math.hypot(
    event.clientX - editorAutoScrollDepthDrag.startX,
    event.clientY - editorAutoScrollDepthDrag.startY
  );
  if (!editorAutoScrollDepthDrag.didDrag && pointerDistance < EDITOR_AUTO_SCROLL_MARKER_DRAG_THRESHOLD_PX) return;
  editorAutoScrollDepthDrag.didDrag = true;
  const pointerDepth = depthFromEditorPointerY(editor, event.clientY);
  if (editorAutoScrollDepthDrag.kind === 'top' || editorAutoScrollDepthDrag.kind === 'bottom') {
    setEditorAutoScrollBandPointPx(editorAutoScrollDepthDrag.kind, pointerDepth, { persist: false });
  } else {
    setEditorAutoScrollDepthPx(pointerDepth, { persist: false });
  }
}

function endEditorAutoScrollDepthDrag(event) {
  if (!editorAutoScrollDepthDrag || event.pointerId !== editorAutoScrollDepthDrag.pointerId) return;
  const editor = document.getElementById('editor');
  const marker = editorAutoScrollDepthDrag.marker;

  if (editor && editorAutoScrollDepthDrag.didDrag) {
    const pointerDepth = depthFromEditorPointerY(editor, event.clientY);
    if (editorAutoScrollDepthDrag.kind === 'top' || editorAutoScrollDepthDrag.kind === 'bottom') {
      setEditorAutoScrollBandPointPx(editorAutoScrollDepthDrag.kind, pointerDepth, { persist: true });
    } else {
      setEditorAutoScrollDepthPx(pointerDepth, { persist: true });
    }
    if (marker) {
      marker.dataset.autoScrollIgnoreClick = 'true';
      setTimeout(() => {
        if (marker.dataset.autoScrollIgnoreClick === 'true') delete marker.dataset.autoScrollIgnoreClick;
      }, 0);
    }
  }
  marker?.classList.remove('is-dragging');
  marker?.releasePointerCapture?.(event.pointerId);
  editorAutoScrollDepthDrag = null;
  editor?.focus({ preventScroll: true });
}

function handleEditorAutoScrollMarkerClick(event) {
  const marker = event.currentTarget;
  if (marker?.dataset.autoScrollIgnoreClick === 'true') {
    delete marker.dataset.autoScrollIgnoreClick;
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  clearTimeout(editorAutoScrollMarkerClickTimer);
  editorAutoScrollMarkerClickTimer = null;
  if (event.detail > 1) return;

  const kind = marker?.dataset?.autoScrollBandMarker || 'depth';
  editorAutoScrollMarkerClickTimer = setTimeout(() => {
    editorAutoScrollMarkerClickTimer = null;
    if (kind === 'top' || kind === 'bottom') {
      resetEditorAutoScrollBandPointToDefault(kind, { persist: true });
    } else {
      resetEditorAutoScrollDepthToDefault({ persist: true });
    }
    document.getElementById('editor')?.focus({ preventScroll: true });
  }, EDITOR_AUTO_SCROLL_MARKER_CLICK_DELAY_MS);
}

function handleEditorAutoScrollMarkerDoubleClick(event) {
  event.preventDefault();
  event.stopPropagation();
  clearTimeout(editorAutoScrollMarkerClickTimer);
  editorAutoScrollMarkerClickTimer = null;
  const kind = event.currentTarget?.dataset?.autoScrollBandMarker || 'depth';
  if (kind === 'top' || kind === 'bottom') {
    centerEditorAutoScrollBandMarkersWithMinGap({ persist: true });
  } else {
    centerEditorAutoScrollDepthMarker({ persist: true });
  }
  document.getElementById('editor')?.focus({ preventScroll: true });
}

function handleEditorAutoScrollDepthMarkerKey(event) {
  if (!['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) return;
  const editor = document.getElementById('editor');
  if (!editor) return;

  event.preventDefault();
  const bandKind = event.currentTarget?.dataset?.autoScrollBandMarker;
  const step = event.shiftKey ? 24 : 8;
  if (bandKind === 'top' || bandKind === 'bottom') {
    if (!shouldShowEditorAutoScrollBandMarkers(editor)) return;
    const range = editorAutoScrollBandRange(editor);
    const bounds = editorAutoScrollBandBounds(editor);
    let nextDepth = bandKind === 'top' ? range.top : range.bottom;

    if (event.key === 'ArrowUp') nextDepth -= step;
    else if (event.key === 'ArrowDown') nextDepth += step;
    else if (event.key === 'PageUp') nextDepth -= 32;
    else if (event.key === 'PageDown') nextDepth += 32;
    else if (event.key === 'Home') nextDepth = bandKind === 'top' ? bounds.min : range.top + bounds.gap;
    else if (event.key === 'End') nextDepth = bandKind === 'top' ? range.bottom - bounds.gap : bounds.max;

    setEditorAutoScrollBandPointPx(bandKind, nextDepth, { persist: true });
    return;
  }

  if (!shouldShowEditorAutoScrollDepthMarker(editor)) return;
  const bounds = editorAutoScrollDepthBounds(editor);
  const currentDepth = editorAutoScrollDepthPx(editor);
  let nextDepth = currentDepth;

  if (event.key === 'ArrowUp') nextDepth -= step;
  else if (event.key === 'ArrowDown') nextDepth += step;
  else if (event.key === 'PageUp') nextDepth -= 32;
  else if (event.key === 'PageDown') nextDepth += 32;
  else if (event.key === 'Home') nextDepth = bounds.min;
  else if (event.key === 'End') nextDepth = bounds.max;

  setEditorAutoScrollDepthPx(nextDepth, { persist: true });
}

function insertPlainTextAtEditorSelection(editor, value) {
  const selection = window.getSelection();
  if (!editor || !selection || !selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return false;

  range.deleteContents();
  const textNode = document.createTextNode(String(value || ''));
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  savedEditorRange = range.cloneRange();
  return true;
}

function commitPlainTextEditorManualInput() {
  syncEditorPlaceholderState();
  scheduleEditorCaretAutoScroll();
  handleEditorContentInput();
  updateFormattingButtons({ syncFromSelection: false });
}

function handlePlainTextEditorBeforeInput(event) {
  const editor = document.getElementById('editor');
  if (!editor || !isEditorPlainTextMode(editor)) return;
  if (!canEditActiveDocument()) return;
  if (event.inputType !== 'insertParagraph') return;

  event.preventDefault();
  if (insertPlainTextAtEditorSelection(editor, '\n')) {
    commitPlainTextEditorManualInput();
  }
}

function handleEditorPaste(event) {
  if (!canEditActiveDocument()) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  const clipboardData = event.clipboardData;
  if (!clipboardData) return;
  const plainText = clipboardData.getData('text/plain');
  const html = clipboardData.getData('text/html');
  const editor = document.getElementById('editor');
  if (!editor) return;

  if (activeVirtualEditorDocument && !activeVirtualEditorDocument.temporarilyMaterialized) {
    const preservedSelection = captureVirtualEditorGlobalSelection(editor, activeVirtualEditorDocument);
    const pasteText = typeof editorTextFromPaste === 'function'
      ? editorTextFromPaste(plainText, html)
      : plainText.replace(/\r\n?/g, '\n');
    event.preventDefault();
    expandVirtualEditorForSelection(preservedSelection).then(materialized => {
      if (!materialized) return;
      editor.focus({ preventScroll: true });
      if (insertPlainTextAtEditorSelection(editor, pasteText)) commitPlainTextEditorManualInput();
    });
    return;
  }

  if (isEditorPlainTextMode(editor)) {
    const pasteText = typeof editorTextFromPaste === 'function'
      ? editorTextFromPaste(plainText, html)
      : plainText.replace(/\r\n?/g, '\n');
    event.preventDefault();
    editor.focus({ preventScroll: true });
    if (insertPlainTextAtEditorSelection(editor, pasteText)) {
      commitPlainTextEditorManualInput();
    }
    return;
  }

  const pasteHTML = editorHTMLFromPaste(plainText, html);
  if (!pasteHTML) return;

  event.preventDefault();
  editor.focus({ preventScroll: true });
  document.execCommand('insertHTML', false, pasteHTML);
  syncEditorPlaceholderState();
  scheduleEditorCaretAutoScroll();
  stageEditorHTMLForMemoryCommit();
}

function handleVirtualEditorCut(event) {
  const state = activeVirtualEditorDocument;
  const editor = document.getElementById('editor');
  const selection = window.getSelection();
  if (!state || state.temporarilyMaterialized || !editor || !selection?.rangeCount || selection.isCollapsed) return;
  const preservedSelection = captureVirtualEditorGlobalSelection(editor, state);
  const selectedText = selection.toString();
  if (!preservedSelection || !selectedText) return;
  event.preventDefault();
  event.clipboardData?.setData('text/plain', selectedText);
  expandVirtualEditorForSelection(preservedSelection).then(materialized => {
    if (!materialized) return;
    editor.focus({ preventScroll: true });
    document.execCommand('delete', false);
    commitPlainTextEditorManualInput();
  });
}

function guardLockedEditorMutation(event) {
  if (canEditActiveDocument()) return;
  event.preventDefault();
  event.stopPropagation();
}

function getEditorTextNodes() {
  const editor = document.getElementById('editor');
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.nodeValue ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

function isEditorFindWordChar(char) {
  return Boolean(char && /[\p{L}\p{N}\p{M}_]/u.test(char));
}

function isEditorFindBoundary(value, index) {
  return index < 0 || index >= value.length || !isEditorFindWordChar(value[index]);
}

function normalizeRawFindToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase();
}

function findDeepMatchRanges(value, query) {
  const ranges = [];
  const queryLower = query.toLocaleLowerCase();
  const valueLower = value.toLocaleLowerCase();
  let cursor = 0;
  let matchIndex = valueLower.indexOf(queryLower, cursor);

  while (matchIndex !== -1) {
    ranges.push({ start: matchIndex, end: matchIndex + query.length });
    cursor = matchIndex + query.length;
    matchIndex = valueLower.indexOf(queryLower, cursor);
  }

  return ranges;
}

function findSafeMatchRanges(value, query) {
  const ranges = [];
  let cursor = 0;
  let matchIndex = value.indexOf(query, cursor);

  while (matchIndex !== -1) {
    const matchEnd = matchIndex + query.length;
    if (isEditorFindBoundary(value, matchIndex - 1) && isEditorFindBoundary(value, matchEnd)) {
      ranges.push({ start: matchIndex, end: matchEnd });
    }
    cursor = matchEnd;
    matchIndex = value.indexOf(query, cursor);
  }

  return ranges;
}

function findRawTokenMatchRanges(value, query) {
  const ranges = [];
  const normalizedQuery = normalizeRawFindToken(query);
  if (!normalizedQuery) return ranges;

  const tokenPattern = /[\p{L}\p{N}\p{M}_]+/gu;
  let tokenMatch = tokenPattern.exec(value);
  while (tokenMatch) {
    const token = tokenMatch[0];
    if (normalizeRawFindToken(token) === normalizedQuery) {
      ranges.push({ start: tokenMatch.index, end: tokenMatch.index + token.length });
    }
    tokenMatch = tokenPattern.exec(value);
  }

  return ranges;
}

function findRawPhraseMatchRanges(value, query) {
  const ranges = [];
  const queryLower = query.toLocaleLowerCase();
  const valueLower = value.toLocaleLowerCase();
  let cursor = 0;
  let matchIndex = valueLower.indexOf(queryLower, cursor);

  while (matchIndex !== -1) {
    const matchEnd = matchIndex + query.length;
    if (isEditorFindBoundary(value, matchIndex - 1) && isEditorFindBoundary(value, matchEnd)) {
      ranges.push({ start: matchIndex, end: matchEnd });
    }
    cursor = matchEnd;
    matchIndex = valueLower.indexOf(queryLower, cursor);
  }

  return ranges;
}

function editorFindMatchRanges(value, query, mode = currentEditorFindMode()) {
  const safeValue = String(value || '');
  const safeQuery = String(query || '');
  if (!safeValue || !safeQuery) return [];

  const findMode = typeof normalizeEditorFindMode === 'function'
    ? normalizeEditorFindMode(mode)
    : 'deep';
  if (findMode === 'safe') return findSafeMatchRanges(safeValue, safeQuery);
  if (findMode === 'raw') {
    return /\s/.test(safeQuery.trim())
      ? findRawPhraseMatchRanges(safeValue, safeQuery)
      : findRawTokenMatchRanges(safeValue, safeQuery);
  }
  return findDeepMatchRanges(safeValue, safeQuery);
}

function countEditorFindMatches(value, query, mode = currentEditorFindMode()) {
  return editorFindMatchRanges(value, query, mode).length;
}

function buildHighlightedFragment(value, query, options = {}) {
  const fragment = document.createDocumentFragment();
  const ranges = editorFindMatchRanges(value, query, options.mode);
  let cursor = 0;

  ranges.forEach(range => {
    if (range.start > cursor) {
      fragment.append(document.createTextNode(value.slice(cursor, range.start)));
    }

    const mark = document.createElement('mark');
    mark.className = 'highlight-find';
    mark.textContent = value.slice(range.start, range.end);
    fragment.append(mark);
    cursor = range.end;
  });

  if (cursor < value.length || !ranges.length) {
    fragment.append(document.createTextNode(value.slice(cursor)));
  }

  return fragment;
}

async function init() {
  loadFromStorage();
  showAppLoader(text().loadingProject);
  const wantsLocalProject = localStorage.getItem(PROJECT_MODE_KEY) === 'local';
  let loadedLocalProject = false;

  try {
    loadedLocalProject = await restoreLocalProject();
  } catch (error) {
    console.warn('Saved story folder restore failed:', error);
  }

  const projectGateMessage = !supportsLocalProjectFolders()
    ? text().projectUnsupported
    : wantsLocalProject && !workspaceDirectoryHandle
      ? text().projectPermissionNeeded
      : text().projectGateBody;

  if (loadedLocalProject) ensureChapters();
  if (!hasActiveStory()) {
    hideAppLoader(true);
    navigateToHomePage();
    return;
  }
  applyLanguage();
  renderChapters();
  renderTags();
  renderNotes();
  loadEditor();
  if (!supportsLocalProjectFolders()) showProjectGate(projectGateMessage);
  else hideProjectGate();
  hideAppLoader(true);

  const editor = document.getElementById('editor');
  try {
    document.execCommand('defaultParagraphSeparator', false, 'p');
  } catch (error) {
    console.warn('Paragraph separator setup failed:', error);
  }
  restoreEditorAutoScrollDepthSetting();
  editor.addEventListener('focus', () => {
    document.body.classList.add('is-focus-editor-active');
    if (isFocus && typeof hideFocusTopControls === 'function') hideFocusTopControls();
    if (isFocus && typeof closeFocusModePanels === 'function') closeFocusModePanels();
    scheduleFocusWidthActiveIdleHide();
    requestAnimationFrame(syncEditorPlaceholderState);
    scheduleEditorCaretAutoScroll();
  });
  editor.addEventListener('blur', () => {
    endRestrictedInputRendering('editor-blur');
    flushEditorHistorySnapshot('blur');
    clearFocusWidthActiveIdleTimer();
    document.body.classList.remove('is-focus-editor-active');
    document.body.classList.remove('is-focus-editor-active-idle');
    syncEditorPlaceholderState();
  });
  editor.addEventListener('input', syncEditorPlaceholderState);
  editor.addEventListener('input', handleEditorParagraphGapInput);
  editor.addEventListener('beforeinput', captureVirtualEditorBeforeInputContext, true);
  window.addEventListener('keydown', handleRestrictedInputSessionKeydown, true);
  editor.addEventListener('beforeinput', guardLockedEditorMutation);
  editor.addEventListener('beforeinput', handlePlainTextEditorBeforeInput, true);
  if (window.LmHindiUnicodeEditing?.initHindiUnicodeEditing) {
    window.LmHindiUnicodeEditing.initHindiUnicodeEditing(editor, {
      canEdit: () => typeof canEditActiveDocument !== 'function' || canEditActiveDocument(),
      onLogicalEdit({ range } = {}) {
        if (range) savedEditorRange = range.cloneRange();
        syncEditorPlaceholderState();
        handleEditorContentInput();
        updateFormattingButtons({ syncFromSelection: false });
        scheduleEditorCaretAutoScroll();
      },
      onCompositionComplete() {
        requestAnimationFrame(() => {
          syncEditorPlaceholderState();
          updateFormattingButtons({ syncFromSelection: false });
          scheduleEditorCaretAutoScroll();
        });
      }
    });
  }
  editor.addEventListener('paste', handleEditorPaste);
  editor.addEventListener('cut', handleVirtualEditorCut);
  document.getElementById('smartCopyBtn')?.addEventListener('mousedown', event => event.preventDefault());
  document.addEventListener('copy', handleEditorCopy, true);
  editor.addEventListener('drop', guardLockedEditorMutation);
  editor.addEventListener('wheel', handleEditorManualScrollIntent, { passive: true });
  editor.addEventListener('touchstart', handleEditorManualScrollIntent, { passive: true });
  editor.addEventListener('touchmove', handleEditorManualScrollIntent, { passive: true });
  editor.addEventListener('keydown', handleEditorManualScrollKeydown);
  document.addEventListener('keydown', handleVirtualEditorClipboardShortcut, true);
  editor.addEventListener('keydown', handleEditorCaretNavigationKeydown);
  editor.addEventListener('scroll', handleEditorManualScrollEvent, { passive: true });
  editor.addEventListener('scroll', handleEditorScrollReveal, { passive: true });
  editor.addEventListener('scroll', handleVirtualEditorScroll, { passive: true });
  editor.addEventListener('wheel', handleVirtualEditorScrollStartIntent, { passive: true });
  editor.addEventListener('touchstart', handleVirtualEditorScrollStartIntent, { passive: true });
  editor.addEventListener('pointerenter', event => updateFocusWidthPointerState(event.target));
  editor.addEventListener('pointerdown', handleEditorCaretPointerPlacementStart);
  document.addEventListener('pointerdown', endRestrictedInputRenderingBeforePointerAction, true);
  document.addEventListener('mousemove', endRestrictedInputRenderingOnMouseMove, { capture: true, passive: true });
  editor.addEventListener('pointerup', handleEditorCaretPointerPlacement);
  editor.addEventListener('pointerleave', () => {
    document.body.classList.remove('is-focus-editor-pointer-inside');
    scheduleFocusWidthActiveIdleHide();
  });
  document.addEventListener('pointermove', event => updateFocusWidthPointerState(event.target), { passive: true });
  document.addEventListener('pointerdown', event => updateFocusWidthPointerState(event.target), { passive: true });
  document.addEventListener('pointermove', handleFocusTopPointerMove, { passive: true });
  document.addEventListener('pointermove', handleFocusChapterContextPointerMove, { passive: true });
  document.addEventListener('pointerdown', handleFocusChapterContextPointerDown, { passive: true });
  document.addEventListener('pointermove', event => {
    if (typeof handleFocusFactsPointerMove === 'function') handleFocusFactsPointerMove(event);
  }, { passive: true });
  document.addEventListener('pointerdown', event => {
    if (typeof handleFocusFactsPointerDown === 'function') handleFocusFactsPointerDown(event);
  }, { passive: true });
  document.addEventListener('pointermove', handleFocusChapterContextScrollThumbDrag);
  document.addEventListener('pointerup', endFocusChapterContextScrollThumbDrag);
  document.addEventListener('pointercancel', endFocusChapterContextScrollThumbDrag);
  document.getElementById('editorAutoScrollDepthMarker')?.addEventListener('pointerdown', startEditorAutoScrollDepthDrag);
  document.getElementById('editorAutoScrollDepthMarker')?.addEventListener('keydown', handleEditorAutoScrollDepthMarkerKey);
  document.getElementById('editorAutoScrollDepthMarker')?.addEventListener('click', handleEditorAutoScrollMarkerClick);
  document.getElementById('editorAutoScrollDepthMarker')?.addEventListener('dblclick', handleEditorAutoScrollMarkerDoubleClick);
  document.getElementById('editorAutoScrollTopMarker')?.addEventListener('pointerdown', startEditorAutoScrollBandDrag);
  document.getElementById('editorAutoScrollBottomMarker')?.addEventListener('pointerdown', startEditorAutoScrollBandDrag);
  document.getElementById('editorAutoScrollTopMarker')?.addEventListener('keydown', handleEditorAutoScrollDepthMarkerKey);
  document.getElementById('editorAutoScrollBottomMarker')?.addEventListener('keydown', handleEditorAutoScrollDepthMarkerKey);
  document.getElementById('editorAutoScrollTopMarker')?.addEventListener('click', handleEditorAutoScrollMarkerClick);
  document.getElementById('editorAutoScrollBottomMarker')?.addEventListener('click', handleEditorAutoScrollMarkerClick);
  document.getElementById('editorAutoScrollTopMarker')?.addEventListener('dblclick', handleEditorAutoScrollMarkerDoubleClick);
  document.getElementById('editorAutoScrollBottomMarker')?.addEventListener('dblclick', handleEditorAutoScrollMarkerDoubleClick);
  initEditorAutoScrollFocusSpeedControl();
  document.addEventListener('pointermove', handleEditorAutoScrollDepthDrag);
  document.addEventListener('pointerup', endEditorAutoScrollDepthDrag);
  document.addEventListener('pointercancel', endEditorAutoScrollDepthDrag);
  document.getElementById('editor-wrap')?.addEventListener('pointermove', handleEditorScrollbarHover, { passive: true });
  document.getElementById('editor-wrap')?.addEventListener('pointerleave', clearEditorScrollbarHover);
  document.getElementById('editor-scroll-thumb')?.addEventListener('pointerdown', startEditorScrollThumbDrag);
  document.addEventListener('pointermove', handleEditorScrollThumbDrag);
  document.addEventListener('pointerup', endEditorScrollThumbDrag);
  document.addEventListener('pointercancel', endEditorScrollThumbDrag);
  ['cur-chap', 'chapterNumberBadge'].forEach(id => {
    document.getElementById(id)?.addEventListener('dblclick', copyChapterTitleInReviewMode);
  });
  document.querySelector('.editor-info-title')?.addEventListener('dblclick', copyChapterTitleInReviewMode);
  document.getElementById('draftBox')?.addEventListener('scroll', () => handleSidebarScrollReveal('draft'), { passive: true });
  document.getElementById('chapter-list')?.addEventListener('scroll', () => handleSidebarScrollReveal('chapters'), { passive: true });
  bindSidebarScrollHoverTarget('draft');
  bindSidebarScrollHoverTarget('chapters');
  document.addEventListener('pointermove', handleSidebarScrollThumbDrag);
  document.addEventListener('pointerup', endSidebarScrollThumbDrag);
  document.addEventListener('pointercancel', endSidebarScrollThumbDrag);
  editor.addEventListener('keyup', updateFormattingButtons);
  editor.addEventListener('keyup', scheduleEditorCaretAutoScroll);
  editor.addEventListener('mouseup', updateFormattingButtons);
  editor.addEventListener('mouseup', scheduleEditorCaretAutoScroll);
  editor.addEventListener('input', updateFormattingButtons);
  document.addEventListener('selectionchange', () => {
    handleVirtualEditorSelectionExpansion();
    updateFormattingButtons();
    syncEditorSelectionWordStatus({ revealFocus: true });
    // Replacing the virtual/full DOM can emit a synthetic selectionchange.
    // Keep caret-window tracking alive, but do not let that synthetic event
    // start auto-scroll before the preserved viewport anchor is restored.
    if (!isVirtualEditorDOMSelectionTransaction) scheduleEditorCaretAutoScroll();
  });
  initRestrictedInputFloatingPanelObserver();
  window.addEventListener('resize', () => {
    renderFindMarkerRail();
    positionEditorAutoScrollDepthMarker();
    positionFocusTopControls();
    positionFocusChapterContextPanel();
    if (typeof positionFocusFactsPanel === 'function') positionFocusFactsPanel();
    positionSelectionOccurrenceBadge();
    updateEditorScrollThumb(document.getElementById('editor')?.classList.contains('is-scrolling'));
    syncSidebarScrollThumbs();
  });
  document.querySelectorAll('[data-format-command], [data-align-command]').forEach(editorControl => {
    editorControl.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (typeof captureEditorFormattingSelection === 'function') captureEditorFormattingSelection();
      else rememberEditorSelection();
    });
  });

  document.getElementById('editorSettingsBtn')?.addEventListener('click', toggleEditorSettings);
  document.getElementById('autosaveToggleBtn')?.addEventListener('click', toggleAutoSaveSetting);
  document.getElementById('editorAutoScrollModeToggleBtn')?.addEventListener('click', toggleEditorAutoScrollModePanel);
  document.getElementById('findSettingsToggleBtn')?.addEventListener('click', toggleFindSettingsPanel);
  document.getElementById('replaceSettingsToggleBtn')?.addEventListener('click', toggleReplaceSettingsPanel);
  document.getElementById('statusVisibilityToggleBtn')?.addEventListener('click', toggleStatusVisibilitySetting);
  document.querySelectorAll('[data-find-mode]').forEach(findModeBtn => {
    findModeBtn.addEventListener('click', () => setEditorFindMode(findModeBtn.dataset.findMode));
  });
  document.querySelectorAll('[data-editor-auto-scroll-mode]').forEach(autoScrollModeBtn => {
    autoScrollModeBtn.addEventListener('click', () => setEditorAutoScrollMode(autoScrollModeBtn.dataset.editorAutoScrollMode));
  });
  document.querySelector('[data-editor-auto-scroll-empty-only]')?.addEventListener('click', toggleEditorAutoScrollEmptyParagraphOnly);
  document.querySelectorAll('[data-editor-replace-scope]').forEach(replaceScopeBtn => {
    replaceScopeBtn.addEventListener('click', () => setEditorReplaceScope(replaceScopeBtn.dataset.editorReplaceScope));
  });
  document.querySelectorAll('[data-status-option]').forEach(statusOptionBtn => {
    statusOptionBtn.addEventListener('click', () => toggleSingleStatusSetting(statusOptionBtn.dataset.statusOption));
  });
  // Paste & Copy settings
  document.getElementById('pasteSettingsToggleBtn')?.addEventListener('click', () => { if (typeof togglePasteSettingsPanel === 'function') togglePasteSettingsPanel(); });
  document.getElementById('pasteSettingsState')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof togglePasteSettings === 'function') togglePasteSettings();
  });
  document.getElementById('autoApplySmartPasteToggleBtn')?.addEventListener('click', () => { if (typeof toggleSmartPasteAutoApply === 'function') toggleSmartPasteAutoApply(); });
  document.getElementById('applySmartPasteStylesGloballyBtn')?.addEventListener('click', () => { if (typeof applySmartPasteStylesGlobally === 'function') applySmartPasteStylesGlobally(); });
  document.getElementById('copySettingsToggleBtn')?.addEventListener('click', () => { if (typeof toggleCopySettingsPanel === 'function') toggleCopySettingsPanel(); });
  document.getElementById('copySettingsState')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof toggleCopySettings === 'function') toggleCopySettings();
  });
  document.querySelectorAll('[data-copy-para-mode]').forEach(btn => {
    btn.addEventListener('click', () => { if (typeof setCopyParaMode === 'function') setCopyParaMode(btn.dataset.copyParaMode); });
  });

  // Collapse Smart Paste / Smart Copy panels when the user clicks anywhere
  // inside editorSettingsPanel that is outside those sub-panels (same behaviour
  // as all other mutually-exclusive settings sub-panels).
  document.getElementById('editorSettingsPanel')?.addEventListener('pointerdown', event => {
    const pastePanel = document.getElementById('smartPasteOptionsPanel');
    const copyPanel  = document.getElementById('copySettingsSelectorPanel');
    const pasteRow   = document.getElementById('pasteSettingsToggleBtn');
    const copyRow    = document.getElementById('copySettingsToggleBtn');

    const insidePaste = pastePanel?.contains(event.target) || pasteRow?.contains(event.target);
    const insideCopy  = copyPanel?.contains(event.target)  || copyRow?.contains(event.target);

    let changed = false;
    if (!insidePaste && typeof isPasteSettingsSelectorOpen !== 'undefined' && isPasteSettingsSelectorOpen) {
      isPasteSettingsSelectorOpen = false;
      if (typeof stopSmartPasteTimeTick === 'function') stopSmartPasteTimeTick();
      changed = true;
    }
    if (!insideCopy && typeof isCopySettingsSelectorOpen !== 'undefined' && isCopySettingsSelectorOpen) {
      isCopySettingsSelectorOpen = false;
      changed = true;
    }
    if (changed) {
      if (typeof updatePasteSettingsUI === 'function') updatePasteSettingsUI();
      if (typeof updateCopySettingsUI  === 'function') updateCopySettingsUI();
      if (typeof updateEditorSettingsUI === 'function') updateEditorSettingsUI();
    }
  });
  (function initPasteCopyRangeListeners() {
    const smartPasteRangeBindings = [
      ['smartPasteLineSpacingRange', 'setSmartPasteLineSpacing'],
      ['smartPasteParagraphGapRange', 'setSmartPasteParagraphGap'],
      ['smartPasteFontSizeRange', 'setSmartPasteFontSize']
    ];
    smartPasteRangeBindings.forEach(([rangeId, setterName]) => {
      const range = document.getElementById(rangeId);
      const setter = window[setterName] || (typeof globalThis !== 'undefined' ? globalThis[setterName] : null);
      if (!range || typeof setter !== 'function') return;
      range.addEventListener('input', () => setter(range.value));
      range.addEventListener('change', () => setter(range.value));
    });
  })();
  document.getElementById('fsize')?.addEventListener('blur', closeToolDockAfterControlBlur);
  document.getElementById('fontSel')?.addEventListener('blur', closeToolDockAfterControlBlur);
  document.getElementById('lineSpacingSel')?.addEventListener('blur', closeToolDockAfterControlBlur);
  document.getElementById('paragraphGapSel')?.addEventListener('blur', closeToolDockAfterControlBlur);
  document.getElementById('paragraphMarginSel')?.addEventListener('blur', closeToolDockAfterControlBlur);
  initDockSelects();
  initCustomSelects();
  initDraggableToolDock();
  if (typeof initFocusEditorWidthControl === 'function') initFocusEditorWidthControl();
  initDraggableFloatingPanels();

  document.getElementById('ai-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAI();
    }
  });

  document.getElementById('storyLibraryBtn')?.addEventListener('click', toggleStoryLibraryPanel);
  document.getElementById('newStoryBtn')?.addEventListener('click', openNewStoryPanel);
  document.getElementById('openExistingStoriesBtn')?.addEventListener('click', renderRecentProjectsList);
  document.getElementById('storyLibraryList')?.addEventListener('click', event => {
    const storyButton = event.target.closest('[data-story-folder]');
    const storyReference = storyButton?.dataset.storyFolder || storyButton?.getAttribute('data-story-folder');
    if (storyReference) openWorkspaceStory(storyReference);
  });
  document.getElementById('storySummaryMenuBtn')?.addEventListener('click', toggleStorySummaryMenu);
  document.getElementById('storySummaryMenuDetailsBtn')?.addEventListener('click', openStoryDetailsFromSummaryMenu);
  document.getElementById('storySummaryMenuDeleteBtn')?.addEventListener('click', openStoryDeleteConfirm);
  document.getElementById('storySummaryDeleteCancelBtn')?.addEventListener('click', closeStoryDeleteConfirm);
  document.getElementById('storySummaryDeleteConfirmBtn')?.addEventListener('click', deleteActiveStory);

  document.addEventListener('pointerdown', e => {
    handleSidebarSelectionPointerDown(e);

    const dock = document.getElementById('floating-tools');
    if (dock && dock.contains(document.activeElement) && !dock.contains(e.target)) {
      document.activeElement.blur();
    }
    if (isToolDockOpen && dock && !dock.contains(e.target)) {
      setToolDock(false);
    }
    if (!e.target.closest('.dock-custom-select')) {
      closeDockSelects();
    }

    const findBar = document.getElementById('find-bar');
    const findTriggers = [document.getElementById('findBtn')].filter(Boolean);
    const clickedFindTrigger = findTriggers.some(trigger => trigger.contains(e.target)) ||
      Boolean(e.target.closest?.('.tag-find-btn'));
    if (isFindOpen && findBar && !findBar.contains(e.target) && !clickedFindTrigger) {
      setFindPanel(false);
    }
    const storyLibraryPanel = document.getElementById('storyLibraryPanel');
    const storyLibraryBtn = document.getElementById('storyLibraryBtn');
    if (
      storyLibraryPanel &&
      !storyLibraryPanel.hidden &&
      !storyLibraryPanel.contains(e.target) &&
      !storyLibraryBtn?.contains(e.target)
    ) {
      closeStoryLibraryPanel();
    }

    const storySummaryMenuPanel = document.getElementById('storySummaryMenuPanel');
    const storySummaryMenuBtn = document.getElementById('storySummaryMenuBtn');
    if (
      storySummaryMenuPanel &&
      !storySummaryMenuPanel.hidden &&
      !storySummaryMenuPanel.contains(e.target) &&
      !storySummaryMenuBtn?.contains(e.target)
    ) {
      closeStorySummaryMenu();
    }

    const storyInfoPanel = document.getElementById('story-info-modal');
    const storyInfoCard = storyInfoPanel?.querySelector('.story-info-card');
    if (
      storyInfoPanel?.classList.contains('is-visible') &&
      storyInfoCard &&
      !storyInfoCard.contains(e.target) &&
      !storySummaryMenuPanel?.contains(e.target) &&
      !storySummaryMenuBtn?.contains(e.target)
    ) {
      closeStoryInfoModal();
    }

    const nameDetailPanel = document.getElementById('nameDetailPanel');
    const namingEntryPanel = document.getElementById('namingEntryPanel');
    const focusNamingCategoryPanel = document.getElementById('focusNamingCategoryPanel');
    const isFocusNamingEntryPanel = Boolean(
      isFocus &&
      namingEntryPanel &&
      !namingEntryPanel.hidden &&
      namingEntryPanel.classList.contains('is-focus-center-panel')
    );
    const clickedFocusNamingRelatedPanel = Boolean(
      isFocusNamingEntryPanel &&
      (
        focusNamingCategoryPanel?.contains(e.target) ||
        findBar?.contains(e.target) ||
        e.target.closest?.('.tag-find-btn')
      )
    );
    if (nameDetailPanel && !nameDetailPanel.hidden && !nameDetailPanel.contains(e.target) && !e.target.closest('.naming-entry-item')) {
      closeNameDetailPanel();
    }
    if (
      namingEntryPanel &&
      !namingEntryPanel.hidden &&
      !namingEntryPanel.contains(e.target) &&
      !clickedFocusNamingRelatedPanel &&
      !e.target.closest('.category-add-btn')
    ) {
      closeNamingEntryPanel();
    }

    const factComposerPanel = document.getElementById('factComposerPanel');
    const factDetailPanel = document.getElementById('factDetailPanel');
    const focusFactsPanel = document.getElementById('focusFactsPanel');
    const openFactComposerBtn = document.getElementById('openFactComposerBtn');
    const isFocusFactComposerPanel = Boolean(
      isFocus &&
      factComposerPanel &&
      !factComposerPanel.hidden &&
      factComposerPanel.classList.contains('is-focus-center-panel')
    );
    const clickedFocusFactsRelatedPanel = Boolean(
      isFocusFactComposerPanel &&
      (
        focusFactsPanel?.contains(e.target) ||
        factDetailPanel?.contains(e.target)
      )
    );
    if (
      factComposerPanel &&
      !factComposerPanel.hidden &&
      !factComposerPanel.contains(e.target) &&
      !clickedFocusFactsRelatedPanel &&
      !openFactComposerBtn?.contains(e.target)
    ) {
      closeFactComposer();
    }
    if (
      factDetailPanel &&
      !factDetailPanel.hidden &&
      !factDetailPanel.contains(e.target) &&
      !e.target.closest('.fact-item')
    ) {
      closeFactDetailPanel();
    }

    const categoryActionPanel = document.getElementById('categoryActionPanel');
    if (
      categoryActionPanel &&
      !categoryActionPanel.hidden &&
      !categoryActionPanel.contains(e.target) &&
      !e.target.closest('.category-action-panel-anchor')
    ) {
      closeCategoryActionPanel();
    }
    if (
      categoryActionPanel &&
      !categoryActionPanel.hidden &&
      categoryActionPanel.contains(e.target) &&
      !e.target.closest('.category-title-edit-input, .category-info-edit-input')
    ) {
      deactivateCategoryEditInputs();
    }

    const partDetailsPanel = document.getElementById('partDetailsPanel');
    if (
      partDetailsPanel &&
      !partDetailsPanel.hidden &&
      partDetailsPanel.contains(e.target) &&
      !e.target.closest('.chapter-title-editor')
    ) {
      deactivatePartDetailsEdits();
    }
    if (
      partDetailsPanel &&
      !partDetailsPanel.hidden &&
      !partDetailsPanel.contains(e.target) &&
      !e.target.closest('.part-menu-btn')
    ) {
      closePartDetailsPanel();
    }

    const chapterDetailsPanel = document.getElementById('chapterDetailsPanel');
    if (
      chapterDetailsPanel &&
      !chapterDetailsPanel.hidden &&
      chapterDetailsPanel.contains(e.target) &&
      !e.target.closest('#chapterDetailsTitleInp')
    ) {
      deactivateChapterDetailsTitleEdit();
    }
    if (
      chapterDetailsPanel &&
      !chapterDetailsPanel.hidden &&
      !chapterDetailsPanel.contains(e.target) &&
      !e.target.closest('.chapter-menu-btn')
    ) {
      closeChapterDetailsPanel();
    }

    const draftDetailsPanel = document.getElementById('draftDetailsPanel');
    if (
      draftDetailsPanel &&
      !draftDetailsPanel.hidden &&
      !draftDetailsPanel.contains(e.target) &&
      !e.target.closest('.draft-item .chapter-menu-btn')
    ) {
      closeDraftActionsPanel();
    }

    const categoryInputPanel = document.getElementById('categoryInputPanel');
    const addCategoryBtn = document.getElementById('addCategoryBtn');
    if (
      categoryInputPanel &&
      !categoryInputPanel.hidden &&
      !categoryInputPanel.contains(e.target) &&
      !addCategoryBtn?.contains(e.target)
    ) {
      setCategoryInputPanel(false);
    }

    const settingsPanel = document.getElementById('editorSettingsPanel');
    const settingsBtn = document.getElementById('editorSettingsBtn');
    if (
      isEditorSettingsOpen &&
      settingsPanel &&
      settingsBtn &&
      !settingsPanel.contains(e.target) &&
      !settingsBtn.contains(e.target) &&
      !(isFocus && settingsPanel.classList.contains('is-focus-top-panel'))
    ) {
      setEditorSettingsPanel(false);
    }
  });

  window.addEventListener('keydown', handleEditorShortcutGuard, true);
  window.addEventListener('resize', () => {
    restoreToolDockPosition();
    positionToolDockPanelFromDock();
    positionFindPanelFromDock();
    if (document.getElementById('story-info-modal')?.classList.contains('is-visible')) {
      positionStoryInfoPanel();
    }
    if (!document.getElementById('storyLibraryPanel')?.hidden) {
      positionStoryLibraryPanel();
    }
    if (!document.getElementById('storySummaryMenuPanel')?.hidden) {
      positionStorySummaryMenuPanel();
    }
    const visibleFloatingPanel = ['namingEntryPanel', 'nameDetailPanel', 'categoryActionPanel', 'categoryInputPanel', 'factComposerPanel', 'factDetailPanel', 'partDetailsPanel', 'chapterDetailsPanel', 'draftDetailsPanel']
      .map(panelId => document.getElementById(panelId))
      .find(panel => panel && !panel.hidden);
    if (
      isFocus &&
      visibleFloatingPanel?.id === 'namingEntryPanel' &&
      visibleFloatingPanel.classList.contains('is-focus-center-panel') &&
      typeof positionFocusFloatingPanelAtEditorCenter === 'function'
    ) {
      positionFocusFloatingPanelAtEditorCenter(visibleFloatingPanel, { fixed: true, padding: 14 });
      if (typeof syncFocusNamingCategoryPanel === 'function') syncFocusNamingCategoryPanel();
      return;
    }
    const useSavedFloatingPosition = visibleFloatingPanel &&
      !['chapterDetailsPanel', 'factDetailPanel', 'categoryActionPanel'].includes(visibleFloatingPanel.id);
    if (useSavedFloatingPosition && applySavedFloatingPanelPosition(visibleFloatingPanel)) {
      return;
    }
    if (visibleFloatingPanel && activeFloatingAnchor) {
      positionFloatingPanel(visibleFloatingPanel, activeFloatingAnchor);
    }
    scheduleChapterPanelOverflowCheck();
  });
  document.addEventListener('keydown', handleEditorShortcutGuard, true);
  document.addEventListener('keydown', e => {
    const categoryActionPanel = document.getElementById('categoryActionPanel');
    const categoryInputPanel = document.getElementById('categoryInputPanel');
    const factComposerPanel = document.getElementById('factComposerPanel');
    const factDetailPanel = document.getElementById('factDetailPanel');
    const partDetailsPanel = document.getElementById('partDetailsPanel');
    const chapterDetailsPanel = document.getElementById('chapterDetailsPanel');
    const draftDetailsPanel = document.getElementById('draftDetailsPanel');
    const chapterEditRecoveryPanel = document.getElementById('chapter-edit-recovery-modal');
    const storySummaryMenuPanel = document.getElementById('storySummaryMenuPanel');
    const storyInfoPanel = document.getElementById('story-info-modal');
    const storyLibraryPanel = document.getElementById('storyLibraryPanel');
    if (e.key === 'Escape' && openDockSelectId) closeDockSelects();
    else if (e.key === 'Escape' && chapterEditRecoveryPanel?.classList.contains('is-visible')) closeChapterEditRecoveryPanel();
    else if (e.key === 'Escape' && isFindOpen) setFindPanel(false);
    else if (e.key === 'Escape' && isToolDockOpen) setToolDock(false);
    else if (e.key === 'Escape' && isEditorSettingsOpen) setEditorSettingsPanel(false);
    else if (e.key === 'Escape' && storyLibraryPanel && !storyLibraryPanel.hidden) closeStoryLibraryPanel();
    else if (e.key === 'Escape' && storyInfoPanel?.classList.contains('is-visible')) closeStoryInfoModal();
    else if (e.key === 'Escape' && storySummaryMenuPanel && !storySummaryMenuPanel.hidden) closeStorySummaryMenu();
    else if (e.key === 'Escape' && categoryActionPanel && !categoryActionPanel.hidden) closeCategoryActionPanel();
    else if (e.key === 'Escape' && categoryInputPanel && !categoryInputPanel.hidden) setCategoryInputPanel(false);
    else if (e.key === 'Escape' && factComposerPanel && !factComposerPanel.hidden) closeFactComposer();
    else if (e.key === 'Escape' && factDetailPanel && !factDetailPanel.hidden) closeFactDetailPanel();
    else if (e.key === 'Escape' && partDetailsPanel && !partDetailsPanel.hidden) closePartDetailsPanel();
    else if (e.key === 'Escape' && chapterDetailsPanel && !chapterDetailsPanel.hidden) closeChapterDetailsPanel();
    else if (e.key === 'Escape' && draftDetailsPanel && !draftDetailsPanel.hidden) closeDraftActionsPanel();
  });
  scheduleStandaloneFocusModeLaunch();
}

function saveToStorage(updateCurrentContent = true) {
  const currentThemeMode = window.getCurrentThemeMode?.() || (isDark ? 'dark' : 'light');
  localStorage.setItem('lm_theme', currentThemeMode);
  if (!hasActiveStory()) {
    localStorage.setItem('lm_dark', isDark);
    saveEditorSettings();
    if (workspaceDirectoryHandle) {
      localStorage.setItem(PROJECT_MODE_KEY, 'workspace');
      localStorage.setItem(WORKSPACE_FOLDER_KEY, workspaceDirectoryHandle.name || '');
    }
    return;
  }

  ensureChapters();
  const shouldSyncCurrentContent = isDraftActive() || isChapterEditDraftActive() || isChapterEditUnlocked;
  if (updateCurrentContent && shouldSyncCurrentContent) {
    const currentContent = getCleanEditorHTML();
    if (
      !isDraftActive() &&
      isChapterEditUnlocked &&
      !isChapterEditDraftActive() &&
      hasChapterEditContentChangedFromSaved(currentContent, curChap)
    ) {
      materializeChapterEditDraftForChange(currentContent);
    }
    const documentItem = activeEditorDocument();
    if (documentItem) documentItem.content = currentContent;
  }
  saveEditorSettings();
  if (!projectDirectoryHandle) {
    localStorage.setItem('lm_chapters', JSON.stringify(chaptersForStorage()));
  }
  localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(draftsForStorage(!projectDirectoryHandle)));
  localStorage.setItem(TRASH_DRAFTS_STORAGE_KEY, JSON.stringify(trashDraftsForStorage(!projectDirectoryHandle)));
  localStorage.setItem(CHAPTER_EDIT_DRAFTS_STORAGE_KEY, JSON.stringify(normalizeChapterEditDrafts(chapterEditDrafts)));
  localStorage.setItem('lm_tags', JSON.stringify(tags));
  localStorage.setItem(NAMING_STORAGE_KEY, JSON.stringify(normalizeNamingData(namingData)));
  localStorage.setItem(FACTS_STORAGE_KEY, JSON.stringify(normalizeStoryFacts(storyFacts)));
  localStorage.setItem('lm_curChap', curChap);
  localStorage.setItem('lm_curPart', curPart);
  localStorage.setItem('lm_curDraft', curDraft);
  localStorage.setItem('lm_activeEditorMode', isDraftActive() ? 'draft' : 'chapter');
  localStorage.setItem('lm_dark', isDark);
  if (projectDirectoryHandle) {
    localStorage.setItem(PROJECT_MODE_KEY, 'local');
    localStorage.setItem(PROJECT_FOLDER_KEY, projectDirectoryHandle.name || '');
    if (typeof setActiveProjectTypeFolderName === 'function') {
      setActiveProjectTypeFolderName(typeof currentProjectTypeFolderName === 'function' ? currentProjectTypeFolderName() : '');
    }
    saveActiveEditorStateForStory(
      projectDirectoryHandle.name || '',
      typeof currentProjectTypeFolderName === 'function' ? currentProjectTypeFolderName() : ''
    );
  }
}

function loadFromStorage() {
  try {
    const ch = localStorage.getItem('lm_chapters');
    const tg = localStorage.getItem('lm_tags');
    const cc = localStorage.getItem('lm_curChap');
    const cp = localStorage.getItem('lm_curPart');
    const cd = localStorage.getItem('lm_curDraft');
    const activeMode = localStorage.getItem('lm_activeEditorMode');
    const storedThemeMode = localStorage.getItem('lm_theme');
    const dk = localStorage.getItem('lm_dark');
    const autosaveEnabled = localStorage.getItem(AUTOSAVE_ENABLED_KEY);
    const editorAutoScrollEnabled = localStorage.getItem(EDITOR_AUTO_SCROLL_ENABLED_KEY);
    const storedEditorAutoScrollMode = localStorage.getItem(EDITOR_AUTO_SCROLL_MODE_KEY);
    const editorAutoScrollEmptyOnly = localStorage.getItem(EDITOR_AUTO_SCROLL_EMPTY_ONLY_KEY);
    const statusesVisible = localStorage.getItem(STATUS_VISIBILITY_KEY);
    const storedFindMode = localStorage.getItem(FIND_MODE_STORAGE_KEY);
    const storedReplaceScope = localStorage.getItem(REPLACE_SCOPE_STORAGE_KEY);
    const projectMode = localStorage.getItem(PROJECT_MODE_KEY);
    const manifest = localStorage.getItem(PROJECT_MANIFEST_KEY);
    const storedNaming = localStorage.getItem(NAMING_STORAGE_KEY);
    const storedFacts = localStorage.getItem(FACTS_STORAGE_KEY);
    const storedDrafts = localStorage.getItem(DRAFTS_STORAGE_KEY);
    const storedTrashDrafts = localStorage.getItem(TRASH_DRAFTS_STORAGE_KEY);
    const storedChapterEditDrafts = localStorage.getItem(CHAPTER_EDIT_DRAFTS_STORAGE_KEY);

    if (autosaveEnabled !== null) isAutoSaveEnabled = autosaveEnabled !== 'false';
    if (editorAutoScrollEnabled !== null) isEditorAutoScrollEnabled = editorAutoScrollEnabled !== 'false';
    if (storedEditorAutoScrollMode !== null) editorAutoScrollMode = normalizeEditorAutoScrollMode(storedEditorAutoScrollMode);
    if (editorAutoScrollEmptyOnly !== null) isEditorAutoScrollEmptyParagraphOnly = editorAutoScrollEmptyOnly !== 'false';
    if (storedFindMode !== null) editorFindMode = normalizeEditorFindMode(storedFindMode);
    if (storedReplaceScope !== null) editorReplaceScope = normalizeEditorReplaceScope(storedReplaceScope);
    visibleEditorStatuses = normalizeStatusVisibility(statusesVisible);
    if (projectMode !== 'workspace' && manifest) {
      projectManifest = normalizeProjectManifest(JSON.parse(manifest));
      storyFacts = normalizeStoryFacts(projectManifest.facts);
    }
    if (storedNaming) namingData = normalizeNamingData(JSON.parse(storedNaming));
    if (storedFacts) storyFacts = normalizeStoryFacts(JSON.parse(storedFacts));
    if (projectMode !== 'local' && storedDrafts) {
      chapterDrafts = normalizeDrafts(JSON.parse(storedDrafts));
    }
    if (projectMode !== 'local' && storedTrashDrafts) {
      chapterTrashDrafts = normalizeTrashDrafts(JSON.parse(storedTrashDrafts));
    }
    if (storedChapterEditDrafts) {
      chapterEditDrafts = normalizeChapterEditDrafts(JSON.parse(storedChapterEditDrafts));
    }
    if (projectMode !== 'local' && ch) {
      const storedChapters = JSON.parse(ch);
      if (Array.isArray(storedChapters) && storedChapters.length) {
        chapters = storedChapters.map(normalizeChapter);
        hasStoredChapters = true;
      }
    }
    if (tg) tags = { ...tags, ...JSON.parse(tg) };
    if (!storedNaming && tg) migrateLegacyTagsToNaming();
    const namingDocumentLinksChanged = typeof validateNamingEntryDocumentLinksOnProjectOpen === 'function' &&
      validateNamingEntryDocumentLinksOnProjectOpen();
    const namingDraftMentionsChanged = typeof validateNamingEntryDraftMentionsOnProjectOpen === 'function' &&
      validateNamingEntryDraftMentionsOnProjectOpen();
    if (namingDocumentLinksChanged || namingDraftMentionsChanged) {
      localStorage.setItem(NAMING_STORAGE_KEY, JSON.stringify(normalizeNamingData(namingData)));
    }
    if (cc) curChap = parseInt(cc, 10) || 0;
    if (cp) curPart = parseInt(cp, 10) || 0;
    if (cd !== null) curDraft = parseInt(cd, 10);
    if (activeMode === 'draft' || activeMode === 'chapter') activeEditorMode = activeMode;
    restoreSavedActiveEditorTarget();
    if (projectMode !== 'workspace') ensureChapters();
    storyFacts = normalizeStoryFacts(storyFacts);
    const themeMode = window.getStoredThemeMode?.() || (storedThemeMode || (dk === 'true' ? 'dark' : 'light'));
    window.setStoredThemeMode?.(themeMode);
    isDark = themeMode === 'dark';
    if (typeof applyDark === 'function') applyDark();
    else window.applyLekhakThemeClasses?.(themeMode);
    if (typeof loadPasteCopySettings === 'function') loadPasteCopySettings();
    if (typeof scheduleSmartPasteAutoApply === 'function') scheduleSmartPasteAutoApply();
  } catch (e) {
  }
}

function applyLanguage() {
  const copy = text();
  document.documentElement.lang = 'en';
  document.title = copy.title;

  setText('brandName', copy.brand);
  setText('chapterPanelTitle', copy.chapters);
  setText('addChapterBtn', copy.addChapter);
  setText('partsHeading', copy.parts);
  setText('notePanelTitle', copy.sideNotes);
  setText('tagsTabBtn', copy.tagsTab);
  setText('notesTabBtn', copy.notesTab);
  setText('namingTabBtn', copy.namingTab);
  setText('factsTabBtn', copy.factsTab);
  setText('namingPanelTitle', copy.namingPanelTitle);
  setText('namingPanelHint', copy.namingPanelHint);
  setText('addCategoryBtn', copy.addCategory);
  setText('categoryInputKicker', copy.categoryInfoTitle);
  setText('categoryInputTitle', copy.addCategory);
  setText('categoryInputCancelBtn', copy.storyInfoCancel);
  setText('categoryInputSaveBtn', copy.saveCategory);
  setText('addTagBtn', copy.addTag);
  setText('namingSaveBtn', copy.saveName);
  setText('openFactComposerBtn', copy.addFact);
  setText('addFactBtn', copy.addFact);
  setText('aiNormalModeBtn', copy.aiModeNormal);
  setText('aiToolModeBtn', copy.aiModeChooseTool);
  setText('aiManualBoardKicker', copy.aiManualBoardKicker);
  setText('aiManualBoardTitle', copy.aiManualBoardTitle);
  setText('aiManualSaveBtn', copy.aiManualBoardSave);
  setText('aiNormalSendBtn', copy.aiNormalSend);
  setText('aiIntro', copy.aiIntro);
  setText('ai-send', copy.aiSend);
  setText('aiProviderLabel', copy.aiProviderLabel);
  setText('aiConnectionToggle', copy.aiConnect);
  setText('aiAccountNameLabel', copy.aiAccountName);
  setText('aiAuthModeLabel', copy.aiAuthMode);
  setText('aiBridgeUrlLabel', copy.aiBridgeUrl);
  setText('aiTokenLabel', copy.aiToken);
  setText('aiConnectionNote', copy.aiConnectionNote);
  setText('aiSaveConnectionBtn', copy.aiSaveConnection);
  setText('aiDisconnectBtn', copy.aiDisconnect);
  setText('aiNewChatBtn', copy.aiNewChat);
  setTitle('aiDeleteChatBtn', copy.aiDeleteChat);
  document.getElementById('aiDeleteChatBtn')?.setAttribute('aria-label', copy.aiDeleteChat);
  setText('projectGateTitle', copy.projectGateTitle);
  setText('projectGateBody', copy.projectGateBody);
  setText('projectGateNote', copy.projectGateNote);
  setText('projectSelectBtn', copy.projectSelect);
  setText('chapterEditRecoveryKicker', copy.chapterEditRecoveryKicker);
  setText('chapterEditRecoveryTitle', copy.chapterEditRecoveryTitle);
  setText('chapterEditRecoveryBody', copy.chapterEditRecoveryBody);
  setText('chapterEditRecoveryUseBtn', copy.chapterEditRecoveryUse);
  setText('chapterEditRecoveryDiscardBtn', copy.chapterEditRecoveryDiscard);
  setText('storyInfoTitle', copy.storyInfoTitle);
  setTitle('storyInfoEditBtn', copy.storyInfoEdit);
  document.getElementById('storyInfoEditBtn')?.setAttribute('aria-label', copy.storyInfoEdit);
  setText('storyTitleLabel', copy.storyTitleLabel);
  setText('storyTypeLabel', copy.storyTypeLabel);
  setText('storyAuthorLabel', copy.storyAuthorLabel);
  setText('storyLanguageLabel', copy.storyLanguageLabel);
  setText('storySynopsisLabel', copy.storySynopsisLabel);
  setText('storyInfoSaveBtn', copy.storyInfoSave);
  setText('storySummaryMenuDetailsBtn', copy.storyInfoTitle);
  setText('storySummaryMenuDeleteBtn', copy.storyDelete);
  setText('storySummaryDeleteConfirmTitle', copy.storyDeleteConfirmTitle);
  setText('storySummaryDeleteConfirmBody', copy.storyDeleteConfirmBody);
  setText('storySummaryDeleteCancelBtn', copy.storyInfoCancel);
  setText('storySummaryDeleteConfirmBtn', copy.confirmDeleteName);
  const libraryCopy = typeof storyLibraryContextText === 'function' ? storyLibraryContextText() : copy;
  setText('storyLibraryTitle', libraryCopy.storyLibraryTitle);
  setText('newStoryBtn', libraryCopy.newStory);
  setText('openExistingStoriesBtn', libraryCopy.openExistingStories);
  setText('addPartBtn', copy.addPart);
  setText('partInfoKicker', copy.partInfoKicker);
  setText('partInfoTitle', copy.partInfoTitle);
  setText('partTitleLabel', copy.partTitleLabel);
  setText('partNumberLabel', copy.partNumberLabel);
  setText('partSynopsisLabel', copy.partSynopsisLabel);
  setText('partInfoCancelBtn', copy.partInfoCancel);
  setText('partInfoSaveBtn', copy.partInfoSave);
  setTitle('replaceOneBtn', copy.replaceOne);
  document.getElementById('replaceOneBtn')?.setAttribute('aria-label', copy.replaceOne);
  setTitle('replaceAllBtn', copy.replaceAll);
  document.getElementById('replaceAllBtn')?.setAttribute('aria-label', copy.replaceAll);
  setText('wcLbl', copy.words);
  setText('ccLbl', copy.characters);
  setText('pcLbl', copy.paragraphs);
  setText('scLbl', copy.sentences);
  setText('rtLbl', copy.minute);
  setText('focusWcLbl', copy.words);
  setText('focusCcLbl', copy.characters);
  setText('focusPcLbl', copy.paragraphs);
  setText('focusScLbl', copy.sentences);
  setText('focusRtLbl', copy.minute);
  setText('kokilaOption', copy.fontHindi);

  setPlaceholder('findInp', copy.findPlaceholder);
  setPlaceholder('replInp', copy.replacePlaceholder);
  setPlaceholder('tagName', copy.tagNamePlaceholder);
  setPlaceholder('newNamingCategoryInp', copy.addCategoryPlaceholder);
  setPlaceholder('newNamingCategoryInfoInp', copy.categoryInfoPlaceholder);
  setPlaceholder('namingNameInp', copy.namePlaceholder);
  setPlaceholder('namingSimilarNameInp', copy.similarNamePlaceholder || 'Similar name');
  setPlaceholder('namingDescriptionInp', copy.nameDescriptionPlaceholder);
  setPlaceholder('factSearchInp', copy.factSearchPlaceholder);
  setPlaceholder('factKeywordInp', copy.factKeywordPlaceholder);
  setPlaceholder('factDescriptionInp', copy.factDescriptionPlaceholder);
  setPlaceholder('ai-manual-board-input', copy.aiManualBoardPlaceholder);
  setPlaceholder('ai-input', copy.aiInputPlaceholder);
  document.getElementById('editor').dataset.placeholder = copy.editorPlaceholder;
  syncEditorPlaceholderState();

  setTitle('boldBtn', copy.bold);
  setTitle('italicBtn', copy.italic);
  setTitle('underlineBtn', copy.underline);
  setTitle('fsize', copy.fontSize);
  setTitle('toolDockToggle', copy.toolDockTitle);
  setTitle('storyLibraryBtn', libraryCopy.storyLibraryTitle);
  document.getElementById('storyLibraryBtn')?.setAttribute('aria-label', libraryCopy.storyLibraryTitle);
  setTitle('saveBtn', copy.saveChapterTitle);
  setTitle('promoteDraftBtn', copy.saveDraftAsChapter);
  document.getElementById('promoteDraftBtn')?.setAttribute('aria-label', copy.saveDraftAsChapter);
  setTitle('chapterEditBtn', copy.editChapter);
  document.getElementById('chapterEditBtn')?.setAttribute('aria-label', copy.editChapter);
  setTitle('categoryManagerBtn', copy.categoryManagerTitle);
  setTitle('storySummaryMenuBtn', copy.storyInfoTitle);
  document.getElementById('storySummaryMenuBtn')?.setAttribute('aria-label', copy.storyInfoTitle);
  setTitle('cur-chap', copy.editChapterTitle);
  setPlaceholder('chapterTitleInput', copy.editChapterTitle);
  setTitle('chapterTitleInput', copy.editChapterTitle);
  const chapterTitleInput = document.getElementById('chapterTitleInput');
  if (chapterTitleInput) chapterTitleInput.setAttribute('aria-label', copy.editChapterTitle);
  setTitle('prevMatchBtn', copy.prev);
  setTitle('nextMatchBtn', copy.next);
  setTitle('closeFindBtn', copy.close);
  setTitle('aL', copy.alignLeft);
  setTitle('aC', copy.alignCenter);
  setTitle('aR', copy.alignRight);
  setTitle('aJ', copy.alignJustify);
  setTitle('findBtn', copy.findTitle);
  setTitle('darkBtn', copy.darkTitle);
  setTitle('aiBtn', copy.aiTitleShort);
  setTitle('focBtn', copy.focusTitle);
  setTitle('exportBtn', copy.exportTitle);

  renderTagOptions();
  renderAIPrompts();
  if (typeof renderAIDesk === 'function') renderAIDesk();
  renderStoryTypeOptions();
  queueCustomSelectSync();
  updateStorySummary();
  setToolDock(isToolDockOpen);
  setReplacePanel(isReplaceOpen);
  updateChapterStatus();
  updateEditorSettingsUI();
  setDefaultSaveStatus();
}

function renderTagOptions() {
  const tagCat = document.getElementById('tagCat');
  if (!tagCat) return;
  const selected = tagCat.value || 'char';
  const options = text().tagOptions;
  tagCat.innerHTML = Object.entries(options)
    .map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`)
    .join('');
  tagCat.value = options[selected] ? selected : 'char';
}

function renderStoryTypeOptions() {
  const typeSelect = document.getElementById('storyTypeInp');
  const languageSelect = document.getElementById('storyLanguageInp');
  if (typeSelect) {
    const selected = typeSelect.value || normalizeProjectManifest(projectManifest || {}).type;
    typeSelect.innerHTML = `
      <option value="novel">${escapeHtml(text().storyTypeNovel)}</option>
      <option value="story">${escapeHtml(text().storyTypeStory)}</option>`;
    typeSelect.value = selected === 'story' ? 'story' : 'novel';
  }
  if (languageSelect) {
    const selectedLanguage = languageSelect.value || normalizeProjectManifest(projectManifest || {}).language;
    languageSelect.innerHTML = '<option value="en">English</option><option value="hi">Hindi</option>';
    languageSelect.value = selectedLanguage === 'hi' ? 'hi' : 'en';
  }
  queueCustomSelectSync();
}

function renderAIPrompts() {
  const select = document.getElementById('ai-prompt-select');
  if (!select) return;
  const copy = text();
  select.innerHTML = `<option value="">${escapeHtml(copy.aiPromptDefault)}</option>` +
    copy.aiPrompts
      .map(prompt => `<option value="${escapeHtml(prompt.value)}">${escapeHtml(prompt.label)}</option>`)
      .join('');
  queueCustomSelectSync();
}

function chapterDisplayNumber(chapter, index = curChap) {
  const number = Number.isInteger(index) && index >= 0
    ? index + 1
    : chapter?.chapterNo || 1;
  return String(number).padStart(2, '0');
}

const CHAPTER_EDIT_DRAFT_ICON_SVG = '<svg class="btn-svg chapter-edit-svg" viewBox="0 0 24 24" width="512" height="512" aria-hidden="true" focusable="false"><path d="m12,7V.46c.913.346,1.753.879,2.465,1.59l3.484,3.486c.712.711,1.245,1.551,1.591,2.464h-6.54c-.552,0-1-.449-1-1Zm1.27,12.48c-.813.813-1.27,1.915-1.27,3.065v1.455h1.455c1.15,0,2.252-.457,3.065-1.27l6.807-6.807c.897-.897.897-2.353,0-3.25-.897-.897-2.353-.897-3.25,0l-6.807,6.807Zm-3.27,3.065c0-1.692.659-3.283,1.855-4.479l6.807-6.807c.389-.389.842-.688,1.331-.901-.004-.12-.009-.239-.017-.359h-6.976c-1.654,0-3-1.346-3-3V.024c-.161-.011-.322-.024-.485-.024h-4.515C2.243,0,0,2.243,0,5v14c0,2.757,2.243,5,5,5h5v-1.455Z"/></svg>';
const CHAPTER_EDIT_FRESH_ICON_SVG = '<svg class="btn-svg chapter-edit-svg" viewBox="0 0 24 24" width="512" height="512" aria-hidden="true" focusable="false"><path d="m13,9c-1.105,0-2-.895-2-2V3h-5.5c-1.378,0-2.5,1.122-2.5,2.5v13c0,1.378,1.122,2.5,2.5,2.5h3c.829,0,1.5.671,1.5,1.5s-.671,1.5-1.5,1.5h-3c-3.033,0-5.5-2.467-5.5-5.5V5.5C0,2.467,2.467,0,5.5,0h6.343c1.469,0,2.85.572,3.889,1.611l2.657,2.657c1.039,1.039,1.611,2.419,1.611,3.889v1.343c0,.829-.671,1.5-1.5,1.5s-1.5-.671-1.5-1.5v-.5h-4Zm10.512,3.849c-.875-1.07-2.456-1.129-3.409-.176l-6.808,6.808c-.813.813-1.269,1.915-1.269,3.064v.955c0,.276.224.5.5.5h.955c1.149,0,2.252-.457,3.064-1.269l6.715-6.715c.85-.85,1.013-2.236.252-3.167Z"/></svg>';

function chapterEditButtonIconState(hasEditDraft) {
  return hasEditDraft ? 'draft' : 'fresh';
}

function chapterEditButtonIconSvg(hasEditDraft) {
  return hasEditDraft ? CHAPTER_EDIT_DRAFT_ICON_SVG : CHAPTER_EDIT_FRESH_ICON_SVG;
}

function setChapterEditButtonIcon(button, hasEditDraft) {
  if (!button) return;
  const nextState = chapterEditButtonIconState(hasEditDraft);
  if (button.dataset.chapterEditIconState === nextState) return;
  button.innerHTML = chapterEditButtonIconSvg(hasEditDraft);
  button.dataset.chapterEditIconState = nextState;
}

function hasChapterEditDraftInMemory(index = curChap) {
  return Boolean(chapterEditDrafts && chapterEditDrafts[chapterEditDraftKey(index)]);
}

function syncDraftPromoteButton() {
  const promoteDraftButton = document.getElementById('promoteDraftBtn');
  if (!promoteDraftButton) return;

  const shouldShow = activeEditorMode === 'draft' &&
    curDraft >= 0 &&
    Array.isArray(chapterDrafts) &&
    Boolean(chapterDrafts[curDraft]);

  promoteDraftButton.hidden = !shouldShow;
  promoteDraftButton.classList.toggle('is-visible', shouldShow);
  promoteDraftButton.disabled = !shouldShow;
  promoteDraftButton.setAttribute('aria-hidden', String(!shouldShow));
  syncFocusTopControlsState();
}

function syncChapterEditButton() {
  const chapterEditButton = document.getElementById('chapterEditBtn');
  if (!chapterEditButton) return;

  const shouldShow = hasActiveStory() && !isDraftActive() && !isTrashDraftActive();
  const hasEditDraft = shouldShow && hasChapterEditDraftInMemory(curChap);
  chapterEditButton.hidden = !shouldShow;
  chapterEditButton.disabled = !shouldShow || isChapterEditToggleBusy;
  setChapterEditButtonIcon(chapterEditButton, hasEditDraft);
  chapterEditButton.classList.toggle('is-visible', shouldShow);
  chapterEditButton.classList.toggle('is-unlocked', shouldShow && isChapterEditUnlocked);
  chapterEditButton.classList.toggle('has-edit-draft', hasEditDraft);
  chapterEditButton.setAttribute('aria-hidden', String(!shouldShow));
  chapterEditButton.setAttribute('aria-pressed', String(shouldShow && isChapterEditUnlocked));
  syncFocusTopControlsState();
}

function syncActiveEditorEditState() {
  const editor = document.getElementById('editor');
  const titleButton = document.getElementById('cur-chap');
  const titleInput = document.getElementById('chapterTitleInput');
  const saveButton = document.getElementById('saveBtn');
  const focusButton = document.getElementById('focBtn');
  const smartCopyButton = document.getElementById('smartCopyBtn');
  const toolDockToggle = document.getElementById('toolDockToggle');
  const floatingTools = document.getElementById('floating-tools');
  const editorInfoPanel = document.getElementById('editor-info-panel');
  const canEdit = canEditActiveDocument();
  const trashMode = isTrashDraftActive();
  const lockedChapter = !isDraftActive() && !canEdit;

  if (editor) {
    editor.contentEditable = canEdit ? 'true' : 'false';
    editor.classList.toggle('is-readonly', lockedChapter);
    editor.setAttribute('aria-readonly', String(lockedChapter));
  }

  if (titleButton) {
    titleButton.disabled = false;
    titleButton.classList.toggle('is-locked', lockedChapter);
    titleButton.title = lockedChapter ? text().chapterLockedTitle : text().editChapterTitle;
  }

  if (titleInput) {
    titleInput.disabled = lockedChapter;
    titleInput.title = lockedChapter ? text().chapterLockedTitle : text().editChapterTitle;
  }

  if (saveButton) {
    saveButton.hidden = trashMode;
    saveButton.disabled = trashMode;
    saveButton.setAttribute('aria-hidden', String(trashMode));
  }
  syncFocusTopControlsState();

  if (focusButton) {
    focusButton.hidden = trashMode;
    focusButton.disabled = trashMode;
    focusButton.setAttribute('aria-hidden', String(trashMode));
  }

  if (smartCopyButton) {
    smartCopyButton.hidden = trashMode;
    smartCopyButton.disabled = trashMode;
    smartCopyButton.setAttribute('aria-hidden', String(trashMode));
  }

  if (toolDockToggle) {
    toolDockToggle.hidden = trashMode;
    toolDockToggle.disabled = trashMode;
    toolDockToggle.setAttribute('aria-hidden', String(trashMode));
  }
  if (floatingTools) {
    floatingTools.hidden = trashMode;
    floatingTools.classList.toggle('is-writing-locked', trashMode);
  }
  if (editorInfoPanel) {
    editorInfoPanel.classList.toggle('is-trash-preview', trashMode);
  }
  if (typeof syncToolDockMode === 'function') syncToolDockMode();
  if (trashMode && isToolDockOpen) setToolDock(false);
  if (!canEdit) cancelEditorCaretAutoScroll();
  if (trashMode) {
    if (typeof setFindPanel === 'function') setFindPanel(false);
    if (typeof setReplacePanel === 'function') setReplacePanel(false);
  }

  syncDraftPromoteButton();
  syncChapterEditButton();
  syncFindReplaceAvailability();
  syncFocusSaveStatusIndicator();
  positionEditorAutoScrollDepthMarker();
  if (typeof syncSidePanelAvailability === 'function') syncSidePanelAvailability();
  if (typeof updatePasteSettingsUI === 'function') updatePasteSettingsUI();
}

async function unlockChapterEditing() {
  if (isChapterEditToggleBusy) return;
  if (isDraftActive()) return;

  if (isChapterEditUnlocked) {
    isChapterEditToggleBusy = true;
    syncChapterEditButton();
    setSaveStatusDot('busy', text().chapterEditClosing);
    let editCloseLoaderShown = false;
    const editCloseLoaderTimer = setTimeout(() => {
      editCloseLoaderShown = true;
      showAppLoader(text().chapterEditClosing);
    }, 140);

    try {
      if (isEditingChapterTitle) {
        const titleCommitted = await commitChapterTitleEdit();
        if (!titleCommitted) {
          setDefaultSaveStatus();
          return;
        }
      }
      syncActiveEditorDocumentFromEditor();
      const draftKey = activeChapterEditKey;
      const draft = activeChapterEditDraft();
      const currentDraftText = getCleanEditorText();
      const currentDraftHTML = getCleanEditorHTML();
      const draftAlreadySaved = draft &&
        normalizeChapterEditComparePlainTextFile(currentDraftText) ===
          normalizeChapterEditComparePlainTextFile(draft.lastAutosavedText) &&
        currentDraftHTML === (draft.lastAutosavedHTML || '');
      const draftRemovedAsUnchanged = await cleanupActiveChapterEditDraftIfUnchanged(curChap, draftKey);

      if (!draftRemovedAsUnchanged && draftKey && chapterEditDrafts[draftKey] && projectDirectoryHandle && !draftAlreadySaved) {
        if (draft) draft.updatedAt = new Date().toISOString();
        await writeChapterEditDraftToLocalFile(draftKey, currentDraftText);
      } else if (!draftRemovedAsUnchanged && !draftAlreadySaved) {
        if (draft) draft.updatedAt = new Date().toISOString();
        persistChapterEditDrafts();
      }

      isChapterEditUnlocked = false;
      activeChapterEditKey = null;
      loadEditor();
      syncActiveEditorEditState();
      updateStats();
      setDefaultSaveStatus();
    } catch (error) {
      console.warn('Chapter edit mode close failed:', error);
      setSaveStatusDot('dirty', text().chapterEditCloseFailed);
    } finally {
      clearTimeout(editCloseLoaderTimer);
      if (editCloseLoaderShown) hideAppLoader();
      isChapterEditToggleBusy = false;
      syncChapterEditButton();
    }
    return;
  }

  if (chapterEditDrafts[chapterEditDraftKey(curChap)]) {
    if (
      typeof chapterEditDraftFileMatchesSavedChapter === 'function' &&
      await chapterEditDraftFileMatchesSavedChapter(curChap)
    ) {
      showMiniReminder(text().chapterEditSameReminder);
      activateChapterEditDraft(curChap);
      return;
    }
    showChapterEditRecoveryPanel(curChap);
    return;
  }

  activateChapterEditDraft(curChap);
}

function updateChapterStatus() {
  if (!hasActiveStory()) {
    setText('chapterNumberBadge', '--');
    setText('cur-chap', text().noStoryAvailable);
    syncDraftPromoteButton();
    syncActiveEditorEditState();
    return;
  }

  if (isTrashDraftActive()) {
    const title = activeEditorDisplayTitle() || `${text().draftPrefix} ${curTrashDraft + 1}`;
    const titleInput = document.getElementById('chapterTitleInput');
    setText('chapterNumberBadge', `T${curTrashDraft + 1}.`);
    setText('cur-chap', title);
    if (titleInput) {
      titleInput.value = title;
      titleInput.title = text().trashMode;
    }
    setTitle('cur-chap', text().trashMode);
    syncDraftPromoteButton();
    syncActiveEditorEditState();
    return;
  }

  if (!isDraftActive() && !chapters[curChap]) {
    setText('chapterNumberBadge', '--');
    setText('cur-chap', text().noSavedChapters);
    syncDraftPromoteButton();
    syncActiveEditorEditState();
    return;
  }

  const chapter = activeEditorDisplayTitle() || text().defaultChapterTitle;
  const titleInput = document.getElementById('chapterTitleInput');

  setText('chapterNumberBadge', isDraftActive() ? `D${curDraft + 1}.` : chapterDisplayNumber(chapters[curChap], curChap) + ".");
  syncDraftPromoteButton();
  if (!isEditingChapterTitle) {
    setText('cur-chap', chapter);
    if (titleInput) titleInput.value = chapter;
  }
  setTitle('cur-chap', text().editChapterTitle);
  if (titleInput) titleInput.title = text().editChapterTitle;
  syncActiveEditorEditState();
}

function copyChapterTitleInReviewMode(event) {
  if (event) {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
  }

  if (isEditingChapterTitle) return;

  const titleBtn = document.getElementById('cur-chap');
  const titleText = String(activeEditorDisplayTitle() || (titleBtn ? titleBtn.textContent.trim() : '') || '').trim();
  if (!titleText) return;

  try {
    const sel = window.getSelection();
    if (sel && typeof sel.removeAllRanges === 'function') sel.removeAllRanges();
  } catch (err) {
  }

  let copied = false;

  try {
    const textArea = document.createElement('textarea');
    textArea.value = titleText;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    textArea.style.opacity = '0';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, titleText.length);
    copied = document.execCommand('copy');
    document.body.removeChild(textArea);
  } catch (err) {
    copied = false;
  }

  if (!copied && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      navigator.clipboard.writeText(titleText).catch(() => {});
      copied = true;
    } catch (err) {
    }
  }

  const toastMsg = (typeof text === 'function' && text().titleCopied) ? text().titleCopied : 'Title copied to clipboard';
  if (typeof showSmartCopyToast === 'function') {
    showSmartCopyToast(toastMsg);
  }
}

window.copyChapterTitleInReviewMode = copyChapterTitleInReviewMode;

function beginChapterTitleEdit() {
  ensureChapters();
  if (!isDraftActive() && !isChapterEditUnlocked) return;
  const documentItem = activeEditorDocument();
  if (!documentItem) return;

  const titleButton = document.getElementById('cur-chap');
  const titleInput = document.getElementById('chapterTitleInput');
  if (!titleButton || !titleInput) return;

  const currentTitle = activeEditorDisplayTitle();
  isEditingChapterTitle = true;
  titleInput.value = currentTitle;
  titleInput.dataset.originalValue = currentTitle;
  titleButton.hidden = true;
  titleInput.hidden = false;
  titleInput.focus();
  titleInput.select();
}

function cancelChapterTitleEdit() {
  isEditingChapterTitle = false;
  const titleButton = document.getElementById('cur-chap');
  const titleInput = document.getElementById('chapterTitleInput');
  if (titleInput) titleInput.hidden = true;
  if (titleButton) titleButton.hidden = false;
  updateChapterStatus();
}

function handleChapterTitleKey(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    commitChapterTitleEdit();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    cancelChapterTitleEdit();
  }
}

function syncChapterTitleControls(chapterIndex, title) {
  if (chapterIndex === curChap) {
    const activeTitleButton = document.getElementById('cur-chap');
    const activeTitleInput = document.getElementById('chapterTitleInput');
    if (activeTitleInput) {
      activeTitleInput.value = title;
      activeTitleInput.dataset.originalValue = title;
      activeTitleInput.hidden = true;
    }
    if (activeTitleButton) {
      activeTitleButton.textContent = title;
      activeTitleButton.hidden = false;
    }
  }

  if (activeChapterDetailsIndex === chapterIndex) {
    const detailsTitle = document.querySelector('#chapterTitleSummary .chapter-title-display');
    const detailsInput = document.getElementById('chapterDetailsTitleInp');
    const detailsWrap = document.getElementById('chapterTitleSummary');
    if (detailsTitle) detailsTitle.textContent = title;
    if (detailsInput) {
      detailsInput.value = title;
      detailsInput.dataset.originalValue = title;
      detailsInput.hidden = true;
    }
    detailsWrap?.classList.remove('is-editing');
    markChapterDetailsTitleEdited();
  }
}

function setChapterEditDraftTitle(chapterIndex, title, savedAt = new Date().toISOString()) {
  const draftKey = chapterEditDraftKey(chapterIndex);
  const rawDraft = chapterEditDrafts[draftKey] ||
    (chapterIndex === curChap && isChapterEditUnlocked ? ensureChapterEditDraft(chapterIndex) : null);
  if (!rawDraft) return null;

  const draft = normalizeChapterEditDraft(rawDraft, draftKey);
  draft.title = title;
  draft.updatedAt = savedAt;
  chapterEditDrafts[draftKey] = draft;
  if (chapterIndex === curChap && isChapterEditUnlocked) activeChapterEditKey = draftKey;
  return draft;
}

async function saveSavedChapterTitle(chapterIndex, title, { syncEditDraft = true } = {}) {
  ensureChapters();
  const chapter = chapters[chapterIndex];
  if (!chapter) return null;

  const savedAt = new Date().toISOString();
  chapter.title = title;
  chapter.createdAt = chapter.createdAt || savedAt;
  const syncedDraft = syncEditDraft ? setChapterEditDraftTitle(chapterIndex, title, savedAt) : null;
  const nextManifest = persistProjectManifestSnapshot();
  saveToStorage(false);

  if (projectDirectoryHandle) await writeProjectManifest(nextManifest);
  if (syncedDraft) await writeChapterEditDraftsToProject();

  syncChapterTitleControls(chapterIndex, title);
  renderChapters();
  if (chapterIndex === curChap) updateChapterStatus();
  return { chapter, editDraft: syncedDraft };
}

function hasPendingChapterTitleCommit() {
  return Boolean(pendingChapterTitleCommitPromise);
}

async function commitChapterTitleEdit() {
  if (pendingChapterTitleCommitPromise) return pendingChapterTitleCommitPromise;

  pendingChapterTitleCommitPromise = performChapterTitleEditCommit()
    .finally(() => {
      pendingChapterTitleCommitPromise = null;
    });

  return pendingChapterTitleCommitPromise;
}

async function performChapterTitleEditCommit() {
  if (!isEditingChapterTitle) return true;

  ensureChapters();
  const titleButton = document.getElementById('cur-chap');
  const titleInput = document.getElementById('chapterTitleInput');
  if (!titleButton || !titleInput) return false;

  const cleanedTitle = titleInput.value.trim();
  const originalTitle = titleInput.dataset.originalValue || activeEditorDisplayTitle();
  isEditingChapterTitle = false;
  titleInput.hidden = true;
  titleButton.hidden = false;

  if (!cleanedTitle || cleanedTitle === originalTitle) {
    updateChapterStatus();
    return true;
  }
  const draftActive = isDraftActive();
  let chapterEditActive = isChapterEditDraftActive();
  if (!draftActive && chapterTitleExists(cleanedTitle, curChap)) {
    showDuplicateReminder(text().duplicateChapterTitle);
    titleInput.value = originalTitle;
    updateChapterStatus();
    return false;
  }

  try {
    let savedDocument = null;
    if (draftActive) {
      savedDocument = chapterDrafts[curDraft];
      savedDocument.title = cleanedTitle;
      saveToStorage(false);
      if (projectDirectoryHandle) await writeDraftsDataToProject();
    } else if (isChapterEditUnlocked) {
      if (!chapterEditActive) {
        materializeChapterEditDraftForChange();
        chapterEditActive = isChapterEditDraftActive();
      }
      savedDocument = setChapterEditDraftTitle(curChap, cleanedTitle) || activeChapterEditDraft();
      saveToStorage(false);
      syncChapterTitleControls(curChap, cleanedTitle);
      renderChapters();
      updateChapterStatus();
      updateStats();
      setSaveButtonSaved(getCleanEditorHTML() === (savedDocument?.lastAutosavedHTML || ''));
      setSaveStatusDot('busy', text().saving);
      if (projectDirectoryHandle) await writeChapterEditDraftsToProject();
    } else {
      const result = await saveSavedChapterTitle(curChap, cleanedTitle);
      savedDocument = result?.chapter || chapters[curChap];
    }
    syncChapterTitleControls(curChap, cleanedTitle);
    renderChapters();
    updateChapterStatus();
    updateStats();
    setSaveButtonSaved(chapterEditActive
      ? getCleanEditorHTML() === (savedDocument?.lastAutosavedHTML || '')
      : true);
    setSaveStatusDot('saved', text().chapterTitleSaved);
    return true;
  } catch (error) {
    console.warn('Chapter title save failed:', error);
    setDefaultSaveStatus();
    return false;
  }
}

function latestPartIndex(manifest = normalizeProjectManifest(projectManifest || createProjectManifest())) {
  return manifest.parts.length ? manifest.parts.length - 1 : -1;
}

function partCreatedLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return date.toLocaleTimeString(text().locale, { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString(text().locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

function partStatusLabel(partIndex, chapterCount) {
  const copy = text();
  if (!chapterCount) return copy.partEmptyStatus;
  return partIndex === curPart ? copy.partActiveStatus : copy.partDraftStatus;
}

function syncCurrentChapterContentFromEditor() {
  syncActiveEditorDocumentFromEditor();
}

function materializeChapterEditDraftForChange(currentContent = getCleanEditorHTML()) {
  if (isDraftActive() || !isChapterEditUnlocked || isChapterEditDraftActive()) {
    return activeEditorDocument();
  }

  ensureChapters();
  if (!chapters[curChap]) return activeEditorDocument();

  const draft = ensureChapterEditDraft(curChap);
  if (!draft) return activeEditorDocument();

  activeChapterEditKey = draft.chapterKey;
  isChapterEditUnlocked = true;
  draft.content = currentContent;
  draft.updatedAt = new Date().toISOString();
  chapterEditDrafts[draft.chapterKey] = normalizeChapterEditDraft(draft, draft.chapterKey);
  setSaveButtonSaved(false);
  syncActiveEditorEditState();
  return chapterEditDrafts[draft.chapterKey];
}

function cleanupChapterEditDraftIfUnchanged(index = curChap, draftKey = chapterEditDraftKey(index)) {
  const draft = chapterEditDrafts[draftKey];
  if (!draft) return false;

  const normalizedDraft = normalizeChapterEditDraft(draft, draftKey);
  normalizedDraft.chapterIndex = index;
  if (isChapterEditDraftSameAsChapter(normalizedDraft, index)) {
    const draftPath = normalizedDraft.contentPath || '';
    delete chapterEditDrafts[draftKey];
    if (draftPath) removeProjectFileIfExists(draftPath).catch(error => console.warn('Chapter edit draft file cleanup failed:', error));
    return true;
  }

  chapterEditDrafts[draftKey] = normalizedDraft;
  return false;
}

async function cleanupActiveChapterEditDraftIfUnchanged(index = curChap, draftKey = activeChapterEditKey || chapterEditDraftKey(index)) {
  if (!draftKey || !chapterEditDrafts[draftKey]) return false;
  const removed = cleanupChapterEditDraftIfUnchanged(index, draftKey);
  if (!removed) return false;

  if (projectDirectoryHandle) await writeChapterEditDraftsToProject();
  else persistChapterEditDrafts();
  return true;
}

function setChapterWordCache(index, words) {
  if (!chapters[index]) return;
  const val = Math.max(0, Number(words) || 0);
  chapters[index]._wordCount = val;
  chapters[index].wordCount = val;
}

function setDraftWordCache(index, words) {
  if (!chapterDrafts[index]) return;
  const val = Math.max(0, Number(words) || 0);
  chapterDrafts[index]._wordCount = val;
  chapterDrafts[index].wordCount = val;
}

function cachedChapterWordTotal(chapter) {
  if (!chapter) return 0;
  const cachedTotal = Number.isFinite(chapter._wordCount) ? Number(chapter._wordCount) : (Number.isFinite(chapter.wordCount) ? Number(chapter.wordCount) : null);
  if (Number.isFinite(cachedTotal) && cachedTotal >= 0) return cachedTotal;

  const calculatedTotal = wordCount(chapter.content);
  chapter._wordCount = calculatedTotal;
  chapter.wordCount = calculatedTotal;
  return calculatedTotal;
}

function chapterWordTotal(chapter, index) {
  if (!chapter) return 0;
  return cachedChapterWordTotal(chapter);
}

function chapterWordTotalForDeleteCheck(chapterIndex) {
  const chapter = chapters[chapterIndex];
  if (!chapter) return 0;
  if (!isDraftActive() && chapterIndex === curChap && canEditActiveDocument()) {
    return countWordsFromText(getCleanEditorText());
  }
  return chapterWordTotal(chapter, chapterIndex);
}

function partWordTotal(partIndex) {
  return chapters.reduce((total, chapter, index) => (
    chapter.partIndex === partIndex ? total + chapterWordTotal(chapter, index) : total
  ), 0);
}

function reindexProjectStructure(manifest) {
  const normalizedManifest = normalizeProjectManifest(manifest || projectManifest || createProjectManifest());

  if (!normalizedManifest.parts.length) {
    chapters.forEach((chapter, index) => {
      chapter.partIndex = -1;
      chapter.chapterNo = index + 1;
      chapter.contentPath = chapter.contentPath || chapterFilePath(index);
    });
    projectManifest = normalizedManifest;
    return normalizedManifest;
  }

  normalizedManifest.parts = normalizedManifest.parts.map((part, index) => ({
    ...normalizePart(part, index),
    no: index + 1,
    chapters: []
  }));

  const chapterCounts = new Map();
  let flatChapterCount = 0;
  chapters.forEach((chapter, index) => {
    const hasValidPart = Number.isInteger(chapter.partIndex) && chapter.partIndex >= 0 && chapter.partIndex < normalizedManifest.parts.length;
    if (!hasValidPart) {
      chapter.partIndex = -1;
      flatChapterCount += 1;
      chapter.chapterNo = flatChapterCount;
      chapter.contentPath = chapter.contentPath || chapterFilePath(index);
      return;
    }
    const nextChapterNo = (chapterCounts.get(chapter.partIndex) || 0) + 1;
    chapterCounts.set(chapter.partIndex, nextChapterNo);
    chapter.chapterNo = nextChapterNo;
    chapter.contentPath = chapter.contentPath || chapterFilePath(index);
  });

  projectManifest = normalizedManifest;
  return normalizedManifest;
}

function ensureChapterAfterDelete(manifest, preferredPartIndex = 0) {
  if (chapters.length) return;
  if (!manifest.parts.length) return;

  const partIndex = clampNumber(preferredPartIndex, 0, manifest.parts.length - 1);
  chapters = [normalizeChapter({
    id: Date.now(),
    title: `${text().newChapterPrefix} 1`,
    content: '',
    notes: [],
    contentPath: chapterFilePath(0),
    partIndex,
    chapterNo: 1,
    createdAt: new Date().toISOString(),
    ...editorGlobalTextFormattingDefaults()
  }, 0, partIndex, 0)];
}

function chapterCreatedLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return date.toLocaleTimeString(text().locale, { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString(text().locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

function chapterDetailsStats(chapter) {
  const value = htmlToCountableText(chapter?.content || '');
  return {
    words: countWordsFromText(value),
    characters: value.replace(/\s/g, '').length
  };
}

function chapterStatusLabel(chapterIndex) {
  return !isDraftActive() && chapterIndex === curChap ? text().chapterActiveStatus : text().chapterDraftStatus;
}

function closeChapterDetailsPanel() {
  const panel = document.getElementById('chapterDetailsPanel');
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = '';
  }
  activeChapterDetailsIndex = null;
  activeFloatingAnchor = null;
}

function closeDraftActionsPanel() {
  const panel = document.getElementById('draftDetailsPanel');
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = '';
    panel.removeAttribute('data-position-key');
    panel.classList.remove(
      'draft-actions-panel',
      'draft-delete-confirm-panel',
      'chapter-to-draft-panel',
      'draft-promote-destination-panel',
      'draft-naming-cleanup-panel',
      'trash-actions-panel',
      'trash-bulk-actions-panel'
    );
  }
  activeDraftDetailsIndex = null;
  activeFloatingAnchor = null;
}

function floatingAnchorSnapshot(anchor) {
  const rect = anchor?.getBoundingClientRect?.();
  if (!rect) return anchor;
  return {
    getBoundingClientRect: () => rect
  };
}

function normalizeDraftSelection() {
  if (!(selectedDraftIndexes instanceof Set)) {
    selectedDraftIndexes = new Set(Array.isArray(selectedDraftIndexes) ? selectedDraftIndexes : []);
  }
  selectedDraftIndexes.forEach(index => {
    if (!Number.isInteger(index) || index < 0 || index >= chapterDrafts.length) {
      selectedDraftIndexes.delete(index);
    }
  });
  if (!Number.isInteger(lastSelectedDraftIndex) || lastSelectedDraftIndex < 0 || lastSelectedDraftIndex >= chapterDrafts.length) {
    lastSelectedDraftIndex = null;
  }
  return selectedDraftIndexes;
}

function normalizeTrashDraftSelection() {
  if (!(selectedTrashDraftIndexes instanceof Set)) {
    selectedTrashDraftIndexes = new Set(Array.isArray(selectedTrashDraftIndexes) ? selectedTrashDraftIndexes : []);
  }
  selectedTrashDraftIndexes.forEach(index => {
    if (!Number.isInteger(index) || index < 0 || index >= chapterTrashDrafts.length) {
      selectedTrashDraftIndexes.delete(index);
    }
  });
  if (
    !Number.isInteger(lastSelectedTrashDraftIndex) ||
    lastSelectedTrashDraftIndex < 0 ||
    lastSelectedTrashDraftIndex >= chapterTrashDrafts.length
  ) {
    lastSelectedTrashDraftIndex = null;
  }
  return selectedTrashDraftIndexes;
}

function normalizedDraftDeleteIndexes(indexes = []) {
  chapterDrafts = normalizeDrafts(chapterDrafts);
  return [...new Set(indexes)]
    .filter(index => Number.isInteger(index) && index >= 0 && index < chapterDrafts.length)
    .sort((left, right) => left - right);
}

function draftDeleteWouldEmptyStoryEditor(indexes = []) {
  const deleteIndexes = normalizedDraftDeleteIndexes(indexes);
  return Boolean(chapters.length === 0 && chapterDrafts.length > 0 && deleteIndexes.length >= chapterDrafts.length);
}

function canDeleteDraftIndexes(indexes = []) {
  const deleteIndexes = normalizedDraftDeleteIndexes(indexes);
  return Boolean(deleteIndexes.length && !draftDeleteWouldEmptyStoryEditor(deleteIndexes));
}

function showDraftDeleteBlockedReminder() {
  showMiniReminder(text().draftDeleteLastDocumentBlocked);
}

function clearTrashDraftSelection(shouldRender = true) {
  normalizeTrashDraftSelection();
  if (!selectedTrashDraftIndexes.size && lastSelectedTrashDraftIndex === null) return;
  selectedTrashDraftIndexes.clear();
  lastSelectedTrashDraftIndex = null;
  closeDraftActionsPanel();
  if (shouldRender) renderChapters();
}

function chapterScopeKey(scopeType = 'all', scopeIndex = -1) {
  if (scopeType === 'part') return `part:${scopeIndex}`;
  if (scopeType === 'raw') return 'raw';
  return 'all';
}

function chapterScopeForIndex(chapterIndex) {
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const chapter = chapters[chapterIndex];
  if (!chapter) return { type: 'all', index: -1, key: 'all' };
  const partIndex = Number.isInteger(chapter.partIndex) ? chapter.partIndex : -1;
  if (manifest.parts.length && partIndex >= 0 && partIndex < manifest.parts.length) {
    return { type: 'part', index: partIndex, key: chapterScopeKey('part', partIndex) };
  }
  return { type: manifest.parts.length ? 'raw' : 'all', index: -1, key: manifest.parts.length ? 'raw' : 'all' };
}

function chapterIndexesForScope(scopeType = 'all', scopeIndex = -1) {
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  return chapters
    .map((chapter, index) => ({ chapter, index }))
    .filter(({ chapter }) => {
      const partIndex = Number.isInteger(chapter.partIndex) ? chapter.partIndex : -1;
      if (scopeType === 'part') return partIndex === scopeIndex;
      if (scopeType === 'raw') return manifest.parts.length && (partIndex < 0 || partIndex >= manifest.parts.length);
      return !manifest.parts.length;
    })
    .map(({ index }) => index);
}

function normalizeChapterSelection() {
  if (!(selectedChapterIndexes instanceof Set)) {
    selectedChapterIndexes = new Set(Array.isArray(selectedChapterIndexes) ? selectedChapterIndexes : []);
  }
  selectedChapterIndexes.forEach(index => {
    if (!Number.isInteger(index) || index < 0 || index >= chapters.length) {
      selectedChapterIndexes.delete(index);
    }
  });
  if (selectedChapterIndexes.size) {
    const firstIndex = Array.from(selectedChapterIndexes)[0];
    const scope = chapterScopeForIndex(firstIndex);
    selectedChapterScope = scope.key;
    selectedChapterIndexes.forEach(index => {
      if (chapterScopeForIndex(index).key !== selectedChapterScope) selectedChapterIndexes.delete(index);
    });
  } else {
    selectedChapterScope = null;
  }
  return selectedChapterIndexes;
}

function clearChapterSelection(shouldRender = true) {
  normalizeChapterSelection();
  if (!selectedChapterIndexes.size && selectedChapterScope === null) return;
  selectedChapterIndexes.clear();
  selectedChapterScope = null;
  closeDraftActionsPanel();
  if (shouldRender) renderChapters();
}

function clearSidebarSelections(shouldRender = true) {
  normalizeDraftSelection();
  normalizeTrashDraftSelection();
  normalizeChapterSelection();
  const hadVisibleSelection = selectedDraftIndexes.size > 0 || selectedTrashDraftIndexes.size > 0 || selectedChapterIndexes.size > 0;
  const hadSelectionState = hadVisibleSelection ||
    lastSelectedDraftIndex !== null ||
    lastSelectedTrashDraftIndex !== null ||
    selectedChapterScope !== null;
  if (!hadSelectionState) return false;

  selectedDraftIndexes.clear();
  lastSelectedDraftIndex = null;
  selectedTrashDraftIndexes.clear();
  lastSelectedTrashDraftIndex = null;
  selectedChapterIndexes.clear();
  selectedChapterScope = null;
  closeDraftActionsPanel();
  if (shouldRender && hadVisibleSelection) renderChapters();
  return hadVisibleSelection;
}

function chapterSelectionAnchorIndexForScope(scope) {
  if (
    !isDraftActive() &&
    Number.isInteger(curChap) &&
    curChap >= 0 &&
    curChap < chapters.length &&
    chapterScopeForIndex(curChap).key === scope.key
  ) {
    return curChap;
  }

  normalizeChapterSelection();
  return Array.from(selectedChapterIndexes)
    .find(index => chapterScopeForIndex(index).key === scope.key) ?? null;
}

function shouldKeepSidebarSelectionForTarget(target) {
  if (!target) return false;
  if (target.closest('#draftDetailsPanel, .chapter-to-draft-btn, .draft-title-delete-btn, .trash-title-action-btn')) return true;
  return Boolean(target.closest('.chap-item') && !target.closest('.chapter-menu-btn'));
}

function handleSidebarSelectionPointerDown(event) {
  if (event?.shiftKey || shouldKeepSidebarSelectionForTarget(event?.target)) return;
  clearSidebarSelections(true);
}

function recentChapterIndexesForScope(scopeType = 'all', scopeIndex = -1, count = 1) {
  const scopeIndexes = chapterIndexesForScope(scopeType, scopeIndex);
  const safeCount = clampNumber(parseInt(count, 10) || 1, 1, Math.max(scopeIndexes.length, 1));
  return scopeIndexes.slice(Math.max(0, scopeIndexes.length - safeCount));
}

function canConvertPartChaptersToDraft(partIndex) {
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  return Boolean(
    manifest.parts.length &&
    partIndex === latestPartIndex(manifest) &&
    chapterIndexesForScope('raw').length === 0
  );
}

function handleChapterItemClick(event, chapterIndex) {
  if (chapterIndex < 0 || chapterIndex >= chapters.length) return;
  normalizeChapterSelection();
  const scope = chapterScopeForIndex(chapterIndex);
  const scopeIndexes = chapterIndexesForScope(scope.type, scope.index);
  const scopePosition = scopeIndexes.indexOf(chapterIndex);

  if (event?.shiftKey && scopePosition >= 0) {
    event.preventDefault();
    event.stopPropagation();
    const anchorIndex = chapterSelectionAnchorIndexForScope(scope);
    const anchorPosition = Number.isInteger(anchorIndex) ? scopeIndexes.indexOf(anchorIndex) : -1;
    const selectionStart = anchorPosition >= 0 ? Math.min(anchorPosition, scopePosition) : scopePosition;
    selectedDraftIndexes.clear();
    lastSelectedDraftIndex = null;
    selectedChapterIndexes.clear();
    scopeIndexes.slice(selectionStart).forEach(index => selectedChapterIndexes.add(index));
    selectedChapterScope = scope.key;
    closeDraftActionsPanel();
    renderChapters();
    return;
  }

  const selectionChanged = clearSidebarSelections(false);
  if (!isDraftActive() && chapterIndex === curChap) {
    if (selectionChanged) renderChapters();
    return;
  }
  switchChap(chapterIndex);
}

function handleDraftItemClick(event, index) {
  if (index < 0 || index >= chapterDrafts.length) return;
  normalizeDraftSelection();

  if (event?.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    const hadChapterSelection = selectedChapterIndexes.size > 0 || selectedChapterScope !== null;
    if (hadChapterSelection) clearChapterSelection(false);
    const activeDraftAnchor = isDraftActive() && Number.isInteger(curDraft) && curDraft >= 0 && curDraft < chapterDrafts.length
      ? curDraft
      : null;
    const anchorIndex = Number.isInteger(lastSelectedDraftIndex) ? lastSelectedDraftIndex : activeDraftAnchor ?? index;
    const startIndex = Math.min(anchorIndex, index);
    const endIndex = Math.max(anchorIndex, index);
    selectedDraftIndexes.clear();
    for (let draftIndex = startIndex; draftIndex <= endIndex; draftIndex += 1) {
      selectedDraftIndexes.add(draftIndex);
    }
    lastSelectedDraftIndex = index;
    closeDraftActionsPanel();
    if (hadChapterSelection) renderChapters();
    else renderDrafts();
    return;
  }

  if (event?.ctrlKey || event?.metaKey) {
    event.preventDefault();
    event.stopPropagation();
    const hadChapterSelection = selectedChapterIndexes.size > 0 || selectedChapterScope !== null;
    if (hadChapterSelection) clearChapterSelection(false);
    if (selectedDraftIndexes.has(index)) selectedDraftIndexes.delete(index);
    else selectedDraftIndexes.add(index);
    lastSelectedDraftIndex = index;
    closeDraftActionsPanel();
    if (hadChapterSelection) renderChapters();
    else renderDrafts();
    return;
  }

  const selectionChanged = clearSidebarSelections(false);
  lastSelectedDraftIndex = index;
  if (isDraftActive() && index === curDraft) {
    if (selectionChanged) renderChapters();
    return;
  }
  switchDraft(index);
}

function ensureFocusTopControls() {
  let controls = document.getElementById('focusTopControls');
  if (controls) return controls;

  controls = document.createElement('div');
  controls.id = 'focusTopControls';
  controls.className = 'focus-top-controls lm-id-focusTopControls';
  controls.hidden = true;
  controls.setAttribute('aria-hidden', 'true');
  controls.innerHTML = `
    <div class="focus-top-left-group">
      <button class="focus-top-back-btn focus-top-action-btn lm-id-focusTopBackBtn" id="focusTopBackBtn"
        type="button" title="Exit focus mode" aria-label="Exit focus mode">
        <svg class="focus-top-back-svg" viewBox="0 0 35.274013 24.079393" width="752.51227" height="513.69373" aria-hidden="true" focusable="false">
          <path d="m 11.183887,22.081925 c -0.77,0 -1.5099997,-0.3 -2.0899997,-0.88 l -6.73,-6.33 c -1.57000004,-1.57 -1.57000004,-4.09 -0.02,-5.64 l 0.02,-0.02 6.75,-6.35 c 0.84,-0.85 2.0899997,-1.1 3.2199997,-0.63 1.13,0.47 1.84,1.52 1.85,2.74 v 2.06 h 15.93625 c 2.19,0 3.97,1.8 3.97,4.01 v 1.98 c 0,2.21 -1.78,4.01 -3.97,4.01 h -15.93625 v 2.06 c 0,1.23 -0.71,2.28 -1.85,2.75 -0.38,0.16 -0.77,0.23 -1.15,0.23 z"></path>
        </svg>
      </button>
      <a class="brand-home-link focus-top-brand-link lm-id-focusTopBrandLink" href="home.html" aria-label="Go to home">
        <span class="brand-mark">LM</span>
      </a>
    </div>
    <div class="focus-top-action-group">
      <button class="editor-chapter-edit-btn focus-top-action-btn lm-id-focusTopChapterActionBtn" id="focusTopChapterActionBtn"
        type="button" title="Edit Chapter" aria-label="Edit Chapter">
        ${chapterEditButtonIconSvg(false)}
      </button>
      <button class="editor-save-btn focus-top-action-btn lm-id-focusTopSaveBtn" id="focusTopSaveBtn"
        type="button" title="Save" aria-label="Save Chapter" data-lm-shortcut="Ctrl+S">
        ${lmIcon('saveOutline')}
        ${lmIcon('saveFilled')}
      </button>
      <button class="editor-settings-btn focus-top-action-btn lm-id-focusTopSettingsBtn" id="focusTopSettingsBtn"
        type="button" aria-expanded="false" aria-controls="editorSettingsPanel" title="Editor settings" aria-label="Editor settings">
        ${lmIcon('settings')}
      </button>
      <button class="tb-icon theme-menu-btn focus-top-action-btn lm-id-focusThemeBtn" id="focusThemeBtn" type="button"
        title="Theme" aria-label="Choose theme" aria-expanded="false" aria-controls="themeModePanel">
        ${lmIcon('themeModeDefault')}
        ${lmIcon('themeModeHover')}
      </button>
    </div>`;
  controls.addEventListener('pointerenter', clearFocusTopControlsEditorHoverTimer);
  controls.addEventListener('pointermove', clearFocusTopControlsEditorHoverTimer);
  controls.querySelector('#focusTopBackBtn')?.addEventListener('click', handleFocusTopBackClick);
  controls.querySelector('#focusTopChapterActionBtn')?.addEventListener('click', handleFocusTopChapterAction);
  controls.querySelector('#focusTopSaveBtn')?.addEventListener('click', () => manualSave());
  controls.querySelector('#focusTopSettingsBtn')?.addEventListener('click', handleFocusTopSettingsClick);
  controls.querySelector('#focusThemeBtn')?.addEventListener('click', handleFocusTopThemeClick);
  document.body.appendChild(controls);
  window.syncLekhakIdClasses?.(controls);
  window.applyLekhakThemeClasses?.();
  return controls;
}

function isFocusTopControlsVisible() {
  const controls = document.getElementById('focusTopControls');
  return Boolean(controls && !controls.hidden);
}

function focusTopPanelElements() {
  return [
    document.getElementById('editorSettingsPanel'),
    document.getElementById('themeModePanel')
  ].filter(Boolean);
}

function isFocusTopPanelOpen() {
  return focusTopPanelElements().some(panel => !panel.hidden && panel.classList.contains('is-focus-top-panel'));
}

function clearFocusTopControlsEditorHoverTimer() {
  clearTimeout(focusTopControlsEditorHoverTimer);
  focusTopControlsEditorHoverTimer = null;
}

function scheduleFocusTopControlsEditorHoverClose() {
  if (!isFocusTopControlsVisible() && !isFocusTopPanelOpen()) return;
  if (focusTopControlsEditorHoverTimer) return;
  focusTopControlsEditorHoverTimer = setTimeout(() => {
    focusTopControlsEditorHoverTimer = null;
    hideFocusTopControls();
  }, FOCUS_TOP_EDITOR_HOVER_CLOSE_MS);
}

function syncFocusTopControlsState() {
  const controls = document.getElementById('focusTopControls');
  if (!controls) return;

  const chapterActionButton = document.getElementById('focusTopChapterActionBtn');
  const backButton = document.getElementById('focusTopBackBtn');
  const saveButton = document.getElementById('focusTopSaveBtn');
  const settingsButton = document.getElementById('focusTopSettingsBtn');
  const themeButton = document.getElementById('focusThemeBtn');
  const originalPromoteButton = document.getElementById('promoteDraftBtn');
  const originalChapterEditButton = document.getElementById('chapterEditBtn');
  const originalSaveButton = document.getElementById('saveBtn');
  const originalSettingsButton = document.getElementById('editorSettingsBtn');
  const showPromote = Boolean(originalPromoteButton && !originalPromoteButton.hidden);
  const showEdit = Boolean(originalChapterEditButton && !originalChapterEditButton.hidden);

  if (backButton) {
    const label = text().focusClose || text().focusTitle || 'Exit focus mode';
    backButton.title = label;
    backButton.setAttribute('aria-label', label);
  }

  if (chapterActionButton) {
    const hasEditDraft = originalChapterEditButton?.dataset.chapterEditIconState === 'draft';
    chapterActionButton.hidden = !(showPromote || showEdit);
    chapterActionButton.disabled = showPromote ? Boolean(originalPromoteButton?.disabled) : Boolean(originalChapterEditButton?.disabled);
    chapterActionButton.className = showPromote
      ? `editor-promote-draft-btn focus-top-action-btn lm-id-focusTopChapterActionBtn ${originalPromoteButton?.className || ''}`
      : `editor-chapter-edit-btn focus-top-action-btn lm-id-focusTopChapterActionBtn ${originalChapterEditButton?.className || ''}`;
    if (showPromote) {
      delete chapterActionButton.dataset.chapterEditIconState;
      chapterActionButton.innerHTML = lmIcon('promoteDraft');
    } else {
      setChapterEditButtonIcon(chapterActionButton, hasEditDraft);
    }
    chapterActionButton.title = showPromote ? (originalPromoteButton?.title || text().saveDraftAsChapter) : (originalChapterEditButton?.title || text().editChapter);
    chapterActionButton.setAttribute('aria-label', showPromote ? text().saveDraftAsChapter : text().editChapter);
  }

  if (saveButton && originalSaveButton) {
    saveButton.hidden = originalSaveButton.hidden;
    saveButton.disabled = originalSaveButton.disabled;
    saveButton.className = `editor-save-btn focus-top-action-btn lm-id-focusTopSaveBtn ${originalSaveButton.className}`;
    saveButton.title = originalSaveButton.title || text().saveChapterTitle;
    saveButton.setAttribute('aria-label', originalSaveButton.getAttribute('aria-label') || text().saveChapterTitle);
  }

  if (settingsButton && originalSettingsButton) {
    settingsButton.classList.toggle('is-open', Boolean(isEditorSettingsOpen));
    settingsButton.setAttribute('aria-expanded', String(Boolean(isEditorSettingsOpen)));
    settingsButton.title = originalSettingsButton.title || text().editorSettings;
    settingsButton.setAttribute('aria-label', originalSettingsButton.getAttribute('aria-label') || text().editorSettings);
  }

  if (themeButton) {
    const themePanel = document.getElementById('themeModePanel');
    themeButton.classList.toggle('is-open', Boolean(themePanel && !themePanel.hidden));
    themeButton.setAttribute('aria-expanded', String(Boolean(themePanel && !themePanel.hidden)));
  }
}

function showFocusTopControls() {
  if (!isFocus) return false;
  const controls = ensureFocusTopControls();
  if (typeof closeFocusModePanels === 'function') {
    closeFocusModePanels({ slots: ['left', 'right'] });
  }
  syncFocusTopControlsState();
  clearFocusTopControlsEditorHoverTimer();
  controls.hidden = false;
  controls.setAttribute('aria-hidden', 'false');
  controls.classList.add('is-visible');
  positionFocusTopControls();
  return true;
}

function positionFocusTopControls() {
  const controls = document.getElementById('focusTopControls');
  const editor = document.getElementById('editor');
  if (!controls || controls.hidden || !editor) return false;

  const editorRect = editor.getBoundingClientRect();
  const top = Math.max(12, editorRect.top - 58);
  controls.style.top = `${Math.round(top)}px`;
  positionFocusTopOpenPanels();
  return true;
}

function focusTopPanelHome(panel, key) {
  if (!panel) return null;
  const currentHome = key === 'theme' ? focusTopThemePanelHome : focusTopSettingsPanelHome;
  if (currentHome) return currentHome;
  const home = { parent: panel.parentElement, nextSibling: panel.nextElementSibling };
  if (key === 'theme') focusTopThemePanelHome = home;
  else focusTopSettingsPanelHome = home;
  return home;
}

function portalFocusTopPanel(panel, key) {
  if (!panel) return;
  focusTopPanelHome(panel, key);
  if (panel.parentElement !== document.body) document.body.appendChild(panel);
  panel.classList.add('is-focus-top-panel');
  panel.dataset.focusPanelSlot = 'top';
  panel.dataset.focusPanelClose = key === 'theme' ? 'closeThemePanel' : 'setEditorSettingsPanel';
}

function restoreFocusTopPanel(panel, key) {
  const home = key === 'theme' ? focusTopThemePanelHome : focusTopSettingsPanelHome;
  if (!panel || !home?.parent) return;
  panel.classList.remove('is-focus-top-panel');
  delete panel.dataset.focusPanelSlot;
  delete panel.dataset.focusPanelClose;
  if (home.nextSibling && home.nextSibling.parentElement === home.parent) {
    home.parent.insertBefore(panel, home.nextSibling);
  } else {
    home.parent.appendChild(panel);
  }
  if (key === 'theme') focusTopThemePanelHome = null;
  else focusTopSettingsPanelHome = null;
}

function positionFocusTopPanel(panel, anchor, positionKey = 'focusTopPanel') {
  if (!panel || panel.hidden || !anchor) return false;
  const anchorRect = anchor.getBoundingClientRect();
  const config = window.lmFocusPanelPositionConfig?.(panel, {
    gap: 10,
    topOffset: 0,
    leftOffset: 0,
    rightOffset: 0,
    viewportPadding: 12
  }, { positionKey }) || {};
  const configuredWidth = window.lmFocusPanelNumber?.(config.panelWidth, 0) ?? 0;
  if (configuredWidth > 0) panel.style.width = `${Math.round(configuredWidth)}px`;
  const panelWidth = configuredWidth || panel.offsetWidth || panel.getBoundingClientRect().width || 300;
  const panelHeight = panel.offsetHeight || panel.getBoundingClientRect().height || 180;
  const padding = window.lmFocusPanelNumber?.(config.viewportPadding, 12) ?? 12;
  const gap = window.lmFocusPanelNumber?.(config.gap, 10) ?? 10;
  const topOffset = window.lmFocusPanelNumber?.(config.topOffset, 0) ?? 0;
  const leftOffset = window.lmFocusPanelNumber?.(config.leftOffset, 0) ?? 0;
  const rightOffset = window.lmFocusPanelNumber?.(config.rightOffset, 0) ?? 0;
  const left = Math.max(
    padding,
    Math.min(anchorRect.right - panelWidth + leftOffset - rightOffset, window.innerWidth - panelWidth - padding)
  );
  const top = Math.max(
    padding,
    Math.min(anchorRect.bottom + gap + topOffset, window.innerHeight - panelHeight - padding)
  );
  panel.style.position = 'fixed';
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.transform = 'none';
  return true;
}

function positionFocusTopOpenPanels() {
  if (!isFocus) return;
  const settingsPanel = document.getElementById('editorSettingsPanel');
  const themePanel = document.getElementById('themeModePanel');
  if (settingsPanel?.classList.contains('is-focus-top-panel') && !settingsPanel.hidden) {
    positionFocusTopPanel(settingsPanel, document.getElementById('focusTopSettingsBtn'), 'focusTopSettingsPanel');
  }
  if (themePanel?.classList.contains('is-focus-top-panel') && !themePanel.hidden) {
    positionFocusTopPanel(themePanel, document.getElementById('focusThemeBtn'), 'focusTopThemePanel');
  }
}

function closeFocusTopPanels() {
  const settingsPanel = document.getElementById('editorSettingsPanel');
  const themePanel = document.getElementById('themeModePanel');
  const isSettingsFocusTopPanel = settingsPanel?.classList.contains('is-focus-top-panel');
  const isThemeFocusTopPanel = themePanel?.classList.contains('is-focus-top-panel');
  if (isSettingsFocusTopPanel && typeof setEditorSettingsPanel === 'function' && isEditorSettingsOpen) {
    setEditorSettingsPanel(false);
  }
  if (isThemeFocusTopPanel && typeof closeThemePanel === 'function') {
    closeThemePanel();
  }
  if (isSettingsFocusTopPanel) restoreFocusTopPanel(settingsPanel, 'settings');
  if (isThemeFocusTopPanel) restoreFocusTopPanel(themePanel, 'theme');
}

function hideFocusTopControls(options = {}) {
  clearFocusTopControlsEditorHoverTimer();
  clearFocusHoverIntent('top');
  const controls = document.getElementById('focusTopControls');
  if (controls) {
    controls.hidden = true;
    controls.setAttribute('aria-hidden', 'true');
    controls.classList.remove('is-visible');
  }
  if (options.closePanels !== false) closeFocusTopPanels();
}

function handleFocusTopBackClick(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (isFocus && typeof toggleFocus === 'function') toggleFocus();
}

function handleFocusTopChapterAction(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const promoteButton = document.getElementById('promoteDraftBtn');
  if (promoteButton && !promoteButton.hidden) {
    promoteActiveDraftToChapter();
    return;
  }
  unlockChapterEditing();
}

function handleFocusTopSettingsClick(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (!isFocus) return toggleEditorSettings(event);
  showFocusTopControls();
  const settingsPanel = document.getElementById('editorSettingsPanel');
  portalFocusTopPanel(settingsPanel, 'settings');
  toggleEditorSettings(event);
  if (isEditorSettingsOpen) {
    if (typeof claimFocusPanelSlot === 'function') claimFocusPanelSlot(settingsPanel, 'top', { closeFunction: 'setEditorSettingsPanel' });
    positionFocusTopPanel(settingsPanel, document.getElementById('focusTopSettingsBtn'), 'focusTopSettingsPanel');
  } else {
    restoreFocusTopPanel(settingsPanel, 'settings');
  }
  syncFocusTopControlsState();
}

function handleFocusTopThemeClick(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (!isFocus) return toggleThemePanel(event);
  showFocusTopControls();
  const themePanel = document.getElementById('themeModePanel');
  portalFocusTopPanel(themePanel, 'theme');
  toggleThemePanel(event);
  if (themePanel && !themePanel.hidden) {
    if (typeof claimFocusPanelSlot === 'function') claimFocusPanelSlot(themePanel, 'top', { closeFunction: 'closeThemePanel' });
    positionFocusTopPanel(themePanel, document.getElementById('focusThemeBtn'), 'focusTopThemePanel');
  } else {
    restoreFocusTopPanel(themePanel, 'theme');
  }
  syncFocusTopControlsState();
}

function isFocusTopHoverZone(event) {
  if (!isFocus || !event) return false;
  const editor = document.getElementById('editor');
  if (!editor) return false;
  const controls = document.getElementById('focusTopControls');
  if (controls?.contains(event.target) || focusTopPanelElements().some(panel => panel.contains(event.target))) return true;
  if (editor.contains(event.target)) return false;
  const editorRect = editor.getBoundingClientRect();
  return event.clientY < editorRect.top && event.clientY >= 0;
}

function handleFocusTopPointerMove(event) {
  if (!isFocus) {
    clearFocusHoverIntent('top');
    hideFocusTopControls({ closePanels: false });
    return;
  }
  const editor = document.getElementById('editor');
  if (editor?.contains(event.target)) {
    clearFocusHoverIntent('top');
    scheduleFocusTopControlsEditorHoverClose();
    return;
  }
  if (isFocusTopHoverZone(event)) {
    if (isFocusTopControlsVisible() || isFocusTopPanelOpen()) {
      clearFocusHoverIntent('top');
      showFocusTopControls();
    } else {
      scheduleFocusHoverIntent('top', event, isFocusTopHoverZone, showFocusTopControls);
    }
  } else {
    clearFocusHoverIntent('top');
    clearFocusTopControlsEditorHoverTimer();
  }
}

function ensureFocusChapterContextPanel() {
  let panel = document.getElementById('focusChapterContextPanel');
  if (panel) return panel;

  panel = document.createElement('div');
  panel.id = 'focusChapterContextPanel';
  panel.className = 'focus-chapter-context-panel lm-id-focusChapterContextPanel';
  panel.dataset.focusPanelSlot = 'left';
  panel.dataset.focusPanelClose = 'hideFocusChapterContextPanel';
  panel.dataset.positionKey = 'focusChapterContextPanel';
  panel.hidden = true;
  panel.setAttribute('aria-hidden', 'true');
  panel.addEventListener('pointerenter', clearFocusChapterContextHideTimer);
  panel.addEventListener('pointerleave', clearFocusChapterContextHideTimer);
  panel.addEventListener('pointermove', handleFocusChapterContextScrollbarHover, { passive: true });
  panel.addEventListener('pointerleave', clearFocusChapterContextScrollbarHover);
  panel.addEventListener('scroll', handleFocusChapterContextScrollReveal, { passive: true });
  document.body.appendChild(panel);
  return panel;
}

function clearFocusChapterContextHideTimer() {
  clearTimeout(focusChapterContextHideTimer);
  focusChapterContextHideTimer = null;
}

function hideFocusChapterContextPanel() {
  clearFocusChapterContextHideTimer();
  clearFocusChapterContextEditorHoverTimer();
  clearFocusChapterContextScrollHideTimer();
  clearFocusHoverIntent('left');
  const panel = document.getElementById('focusChapterContextPanel');
  if (!panel) return;
  panel.hidden = true;
  panel.setAttribute('aria-hidden', 'true');
  panel.classList.remove('is-visible');
  panel.classList.remove('is-scrolling', 'is-scrollbar-hovered');
  updateFocusChapterContextScrollThumb(false);
}

function clearFocusChapterContextEditorHoverTimer() {
  clearTimeout(focusChapterContextEditorHoverTimer);
  focusChapterContextEditorHoverTimer = null;
}

function scheduleFocusChapterContextEditorHoverClose() {
  const panel = document.getElementById('focusChapterContextPanel');
  if (!panel || panel.hidden || focusChapterContextEditorHoverTimer) return;
  focusChapterContextEditorHoverTimer = setTimeout(() => {
    focusChapterContextEditorHoverTimer = null;
    hideFocusChapterContextPanel();
  }, FOCUS_CHAPTER_CONTEXT_EDITOR_HOVER_CLOSE_MS);
}

function clearFocusChapterContextScrollHideTimer() {
  clearTimeout(focusChapterContextScrollHideTimer);
  focusChapterContextScrollHideTimer = null;
}

function ensureFocusChapterContextScrollThumb() {
  let thumb = document.getElementById('focusChapterContextScrollThumb');
  if (thumb) return thumb;

  thumb = document.createElement('div');
  thumb.id = 'focusChapterContextScrollThumb';
  thumb.className = 'sidebar-scroll-thumb focus-context-scroll-thumb lm-id-focusChapterContextScrollThumb';
  thumb.hidden = true;
  thumb.setAttribute('aria-hidden', 'true');
  thumb.addEventListener('pointerdown', startFocusChapterContextScrollThumbDrag);
  thumb.addEventListener('pointerenter', () => {
    document.getElementById('focusChapterContextPanel')?.classList.add('is-scrollbar-hovered');
    updateFocusChapterContextScrollThumb(true);
  });
  thumb.addEventListener('pointerleave', () => {
    if (!focusChapterContextScrollThumbDrag) {
      document.getElementById('focusChapterContextPanel')?.classList.remove('is-scrollbar-hovered');
      updateFocusChapterContextScrollThumb(false);
    }
  });
  document.body.appendChild(thumb);
  return thumb;
}

function focusChapterContextScrollTarget(panel = document.getElementById('focusChapterContextPanel')) {
  if (!panel) return null;
  return panel.querySelector('.focus-context-scroll-scope') || panel;
}

function bindFocusChapterContextScrollTarget(panel = document.getElementById('focusChapterContextPanel')) {
  const target = focusChapterContextScrollTarget(panel);
  if (!target || target.dataset.focusContextScrollReady === 'true') return;
  target.dataset.focusContextScrollReady = 'true';
  target.addEventListener('scroll', handleFocusChapterContextScrollReveal, { passive: true });
  target.addEventListener('pointermove', handleFocusChapterContextScrollbarHover, { passive: true });
  target.addEventListener('pointerleave', clearFocusChapterContextScrollbarHover);
}

function syncFocusChapterContextScrollScopeHeight(panel = document.getElementById('focusChapterContextPanel')) {
  const target = focusChapterContextScrollTarget(panel);
  if (!panel || !target || target === panel) return;

  const section = target.closest('.focus-context-section') || panel;
  const panelStyle = window.getComputedStyle(panel);
  const sectionStyle = window.getComputedStyle(section);
  const panelMaxHeight = parseFloat(panel.style.maxHeight) || panel.getBoundingClientRect().height || window.innerHeight * 0.72;
  const panelPadding =
    (parseFloat(panelStyle.paddingTop) || 0) +
    (parseFloat(panelStyle.paddingBottom) || 0);
  const sectionPadding =
    (parseFloat(sectionStyle.paddingTop) || 0) +
    (parseFloat(sectionStyle.paddingBottom) || 0);
  const fixedHeight = [...section.children].reduce((height, child) => {
    if (child === target) return height;
    const childStyle = window.getComputedStyle(child);
    return height +
      child.getBoundingClientRect().height +
      (parseFloat(childStyle.marginTop) || 0) +
      (parseFloat(childStyle.marginBottom) || 0);
  }, 0);
  const availableHeight = panelMaxHeight - panelPadding - sectionPadding - fixedHeight;
  target.style.maxHeight = `${Math.max(120, Math.floor(availableHeight))}px`;
}

function focusChapterContextScrollMetrics() {
  const panel = document.getElementById('focusChapterContextPanel');
  const thumb = ensureFocusChapterContextScrollThumb();
  const target = focusChapterContextScrollTarget(panel);
  if (!panel || !thumb || !target || panel.hidden) return null;

  const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
  const isScrollable = target.clientHeight > 0 && maxScroll > 2;
  if (!isScrollable) return { panel, target, thumb, maxScroll, isScrollable };

  const targetRect = target.getBoundingClientRect();
  const trackPadding = 12;
  const trackTop = targetRect.top + trackPadding;
  const trackHeight = Math.max(34, targetRect.height - trackPadding * 2);
  const thumbHeight = Math.min(trackHeight, Math.max(30, (target.clientHeight / target.scrollHeight) * trackHeight));
  const scrollableTrack = Math.max(1, trackHeight - thumbHeight);
  const thumbLeft = targetRect.right - 3;

  return {
    panel,
    target,
    thumb,
    maxScroll,
    isScrollable,
    targetRect,
    trackTop,
    trackHeight,
    thumbHeight,
    scrollableTrack,
    thumbLeft
  };
}

function updateFocusChapterContextScrollThumb(visible = false) {
  const thumb = ensureFocusChapterContextScrollThumb();
  const metrics = focusChapterContextScrollMetrics();
  if (!thumb) return;
  if (!metrics || !metrics.isScrollable) {
    thumb.hidden = true;
    thumb.classList.remove('is-visible', 'is-dragging');
    return;
  }

  const shouldShow = Boolean(
    visible ||
    metrics.target.classList.contains('is-scrolling') ||
    metrics.target.classList.contains('is-scrollbar-hovered') ||
    focusChapterContextScrollThumbDrag
  );
  thumb.hidden = !shouldShow;
  thumb.classList.toggle('is-visible', shouldShow);
  if (!shouldShow) return;

  const thumbTop = metrics.trackTop + (metrics.target.scrollTop / metrics.maxScroll) * metrics.scrollableTrack;
  thumb.style.top = `${thumbTop}px`;
  thumb.style.left = `${metrics.thumbLeft}px`;
  thumb.style.height = `${metrics.thumbHeight}px`;
}

function handleFocusChapterContextScrollReveal() {
  const panel = document.getElementById('focusChapterContextPanel');
  const target = focusChapterContextScrollTarget(panel);
  if (!panel || !target || panel.hidden) return;
  target.classList.add('is-scrolling');
  updateFocusChapterContextScrollThumb(true);
  clearFocusChapterContextScrollHideTimer();
  focusChapterContextScrollHideTimer = setTimeout(() => {
    target.classList.remove('is-scrolling');
    updateFocusChapterContextScrollThumb(false);
  }, 850);
}

function handleFocusChapterContextScrollbarHover(event) {
  const metrics = focusChapterContextScrollMetrics();
  if (!metrics || !metrics.isScrollable) return;
  const hoverWidth = 18;
  const hoverBleed = 8;
  const isInsideY = event.clientY >= metrics.targetRect.top && event.clientY <= metrics.targetRect.bottom;
  const isNearScrollbar =
    event.clientX >= metrics.targetRect.right - hoverWidth &&
    event.clientX <= metrics.targetRect.right + hoverBleed;
  metrics.target.classList.toggle('is-scrollbar-hovered', isInsideY && isNearScrollbar);
  updateFocusChapterContextScrollThumb(isInsideY && isNearScrollbar);
}

function clearFocusChapterContextScrollbarHover() {
  if (focusChapterContextScrollThumbDrag) return;
  focusChapterContextScrollTarget()?.classList.remove('is-scrollbar-hovered');
  updateFocusChapterContextScrollThumb(false);
}

function startFocusChapterContextScrollThumbDrag(event) {
  const metrics = focusChapterContextScrollMetrics();
  if (!metrics || !metrics.isScrollable) return;

  event.preventDefault();
  event.stopPropagation();
  clearFocusChapterContextScrollHideTimer();
  focusChapterContextScrollThumbDrag = {
    pointerId: event.pointerId,
    startY: event.clientY,
    startScrollTop: metrics.target.scrollTop,
    maxScroll: metrics.maxScroll,
    scrollableTrack: metrics.scrollableTrack
  };
  metrics.target.classList.add('is-scrolling', 'is-scrollbar-hovered');
  metrics.thumb.classList.add('is-dragging');
  metrics.thumb.setPointerCapture?.(event.pointerId);
  updateFocusChapterContextScrollThumb(true);
}

function handleFocusChapterContextScrollThumbDrag(event) {
  const drag = focusChapterContextScrollThumbDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  const target = focusChapterContextScrollTarget();
  if (!target) return;

  event.preventDefault();
  const deltaY = event.clientY - drag.startY;
  target.scrollTop = clampNumber(drag.startScrollTop + (deltaY / drag.scrollableTrack) * drag.maxScroll, 0, drag.maxScroll);
  updateFocusChapterContextScrollThumb(true);
}

function endFocusChapterContextScrollThumbDrag(event) {
  const drag = focusChapterContextScrollThumbDrag;
  if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;

  const target = focusChapterContextScrollTarget();
  const thumb = document.getElementById('focusChapterContextScrollThumb');
  thumb?.releasePointerCapture?.(drag.pointerId);
  thumb?.classList.remove('is-dragging');
  focusChapterContextScrollThumbDrag = null;
  target?.classList.remove('is-scrollbar-hovered');
  if (target) {
    clearFocusChapterContextScrollHideTimer();
    focusChapterContextScrollHideTimer = setTimeout(() => {
      target.classList.remove('is-scrolling');
      updateFocusChapterContextScrollThumb(false);
    }, 650);
  } else {
    updateFocusChapterContextScrollThumb(false);
  }
}

function focusChapterContextRawItems(manifest = normalizeProjectManifest(projectManifest || createProjectManifest())) {
  return chapters
    .map((chapter, index) => ({ chapter, index }))
    .filter(({ chapter }) => {
      const partIndex = Number.isInteger(chapter?.partIndex) ? chapter.partIndex : -1;
      return partIndex < 0 || partIndex >= manifest.parts.length;
    });
}

function focusChapterContextData() {
  if (!isFocus || !hasActiveStory() || isTrashDraftActive()) return null;

  if (isDraftActive() && chapterDrafts.length) {
    return {
      type: 'drafts',
      title: text().drafts,
      count: chapterDrafts.length
    };
  }

  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const activeChapter = chapters[curChap];
  if (!activeChapter) return null;

  const partIndex = Number.isInteger(activeChapter.partIndex) ? activeChapter.partIndex : -1;
  if (partIndex >= 0 && partIndex < manifest.parts.length) {
    return {
      type: 'part',
      partIndex,
      part: manifest.parts[partIndex],
      chapters: chapters
        .map((chapter, index) => ({ chapter, index }))
        .filter(({ chapter }) => chapter.partIndex === partIndex)
    };
  }

  const rawItems = focusChapterContextRawItems(manifest);
  if (!rawItems.length) return null;
  return {
    type: 'raw',
    title: text().chapters,
    chapters: rawItems
  };
}

function focusChapterContextCountLabel(count, label) {
  return `${count} ${escapeHtml(label)}`;
}

function focusChapterContextChapterButton(chapter, index, copy = text()) {
  return `
    <button class="chap-item focus-context-item ${!isDraftActive() && index === curChap ? 'active' : ''}" type="button"
      onclick="activateFocusContextChapter(${index})">
      <span class="chap-title-row">
        <span class="chap-file-icon">${chapterDisplayNumber(chapter, index)}</span>
        <span class="chap-item-main">
          <span class="chap-title">${escapeHtml(chapterDisplayTitle(chapter, index))}</span>
          <span class="cn">${chapterWordTotal(chapter, index)} ${escapeHtml(copy.words)}</span>
        </span>
      </span>
    </button>`;
}

function renderFocusChapterContextPanel(panel, context = focusChapterContextData()) {
  if (!panel || !context) return false;
  const copy = text();
  panel.dataset.focusContextType = context.type;

  if (context.type === 'drafts') {
    panel.innerHTML = `
      <div class="draft-box focus-context-section">
        <div class="draft-box-title">
          <span class="draft-title-label"><span class="draft-save-dot" aria-hidden="true"></span>${escapeHtml(context.title)}</span>
          <span class="draft-count-pill">${escapeHtml(String(context.count))}</span>
        </div>
        <div class="focus-context-list focus-context-scroll-scope">
          ${chapterDrafts.map((draft, index) => `
            <button class="chap-item draft-item focus-context-item ${isDraftActive() && index === curDraft ? 'active' : ''}" type="button"
              onclick="activateFocusContextDraft(${index})">
              <span class="chap-title-row">
                <span class="chap-file-icon draft-icon">D${index + 1}</span>
                <span class="chap-item-main">
                  <span class="chap-title">${escapeHtml(draft.title || `${copy.draftPrefix} ${index + 1}`)}</span>
                  <span class="cn">${chapterWordTotal(draft, index)} ${escapeHtml(copy.words)}</span>
                </span>
              </span>
            </button>`).join('')}
        </div>
      </div>`;
    return true;
  }

  if (context.type === 'part') {
    const partTitle = context.part?.title || defaultPartTitle(context.partIndex);
    const partMeta = focusChapterContextCountLabel(context.chapters.length, copy.chapters);
    panel.innerHTML = `
      <div class="part-section is-expanded is-active-part focus-context-section">
        <div class="part-header focus-context-part-header">
          <div class="part-tree-main">
            <span class="part-toggle-btn" aria-hidden="true">${lmChevronSpan('down')}</span>
            <div class="part-copy">
              <div class="part-title">${escapeHtml(partTitle)}</div>
              <div class="part-meta">${partMeta}${context.part?.synopsis ? ' · ' + escapeHtml(context.part.synopsis) : ''}</div>
            </div>
          </div>
        </div>
        <div class="part-children part-chapter-children focus-context-list focus-context-scroll-scope">
          ${context.chapters.length
            ? context.chapters.map(({ chapter, index }) => focusChapterContextChapterButton(chapter, index, copy)).join('')
            : `<div class="part-empty">${escapeHtml(copy.noChaptersInPart)}</div>`}
        </div>
      </div>`;
    return true;
  }

  panel.innerHTML = `
    <div class="raw-chapter-section is-expanded focus-context-section">
      <div class="parts-heading raw-chapters-heading">
        <span class="parts-collapse-toggle-btn raw-chapters-toggle-btn" aria-expanded="true">
          <span class="parts-collapse-label">${escapeHtml(context.title)}</span>
          ${lmChevronSpan('down')}
        </span>
      </div>
      <div class="part-children raw-chapter-children raw-chapter-list focus-context-list focus-context-scroll-scope">
        ${context.chapters.map(({ chapter, index }) => focusChapterContextChapterButton(chapter, index, copy)).join('')}
      </div>
    </div>`;
  return true;
}

function hasBlockingFocusChapterContextPanel(panel) {
  return [...document.querySelectorAll('[data-focus-panel-slot="left"], .is-focus-left-panel')]
    .some(otherPanel => {
      if (otherPanel === panel) return false;
      return !otherPanel.hidden && otherPanel.getAttribute('aria-hidden') !== 'true';
    });
}

function positionFocusChapterContextPanel() {
  const panel = document.getElementById('focusChapterContextPanel');
  const editor = document.getElementById('editor');
  if (!panel || panel.hidden || !editor) return false;

  const editorRect = editor.getBoundingClientRect();
  const config = window.lmFocusPanelPositionConfig?.(panel, {
    gap: 16,
    topOffset: 0,
    leftOffset: 0,
    rightOffset: 0,
    panelWidth: 315,
    viewportPadding: 12
  }, { positionKey: 'focusChapterContextPanel' }) || window.lmFloatingPanelPositionConfig?.(panel, {
    gap: 16,
    topOffset: 0,
    leftOffset: 0,
    rightOffset: 0,
    panelWidth: 315,
    viewportPadding: 12
  }, { positionKey: 'focusChapterContextPanel' }) || {};
  const panelWidth = window.lmFocusPanelNumber?.(config.panelWidth, 315) ?? window.lmPanelNumber?.(config.panelWidth, 315) ?? 315;
  const panelHeight = panel.offsetHeight || panel.getBoundingClientRect().height || editorRect.height;
  const padding = window.lmFocusPanelNumber?.(config.viewportPadding, 12) ?? window.lmPanelNumber?.(config.viewportPadding, 12) ?? 12;
  const gap = window.lmFocusPanelNumber?.(config.gap, 16) ?? window.lmPanelNumber?.(config.gap, 16) ?? 16;
  const leftOffset = window.lmFocusPanelNumber?.(config.leftOffset, 0) ?? window.lmPanelNumber?.(config.leftOffset, 0) ?? 0;
  const rightOffset = window.lmFocusPanelNumber?.(config.rightOffset, 0) ?? window.lmPanelNumber?.(config.rightOffset, 0) ?? 0;
  const topOffset = window.lmFocusPanelNumber?.(config.topOffset, 0) ?? window.lmPanelNumber?.(config.topOffset, 0) ?? 0;
  const left = Math.min(
    Math.max(padding, editorRect.left - gap - panelWidth + leftOffset - rightOffset),
    Math.max(padding, window.innerWidth - panelWidth - padding)
  );
  const top = Math.min(
    Math.max(padding, editorRect.top + topOffset),
    Math.max(padding, window.innerHeight - panelHeight - padding)
  );

  panel.style.position = 'fixed';
  panel.style.width = `${Math.round(panelWidth)}px`;
  panel.style.maxHeight = `${Math.max(160, Math.round(Math.min(editorRect.height, window.innerHeight - padding * 2)))}px`;
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  syncFocusChapterContextScrollScopeHeight(panel);
  updateFocusChapterContextScrollThumb(false);
  return true;
}

function showFocusChapterContextPanel() {
  if (!isFocus) return false;
  const context = focusChapterContextData();
  if (!context) {
    hideFocusChapterContextPanel();
    return false;
  }

  const panel = ensureFocusChapterContextPanel();
  if (hasBlockingFocusChapterContextPanel(panel)) return false;
  if (!renderFocusChapterContextPanel(panel, context)) return false;
  bindFocusChapterContextScrollTarget(panel);
  clearFocusChapterContextHideTimer();
  panel.hidden = false;
  panel.setAttribute('aria-hidden', 'false');
  panel.classList.add('is-visible');
  if (typeof claimFocusPanelSlot === 'function') {
    claimFocusPanelSlot(panel, 'left', { closeFunction: 'hideFocusChapterContextPanel' });
  }
  positionFocusChapterContextPanel();
  return true;
}

function refreshVisibleFocusChapterContextPanel() {
  const panel = document.getElementById('focusChapterContextPanel');
  if (!panel || panel.hidden) return;
  const context = focusChapterContextData();
  if (!context) {
    hideFocusChapterContextPanel();
    return;
  }
  renderFocusChapterContextPanel(panel, context);
  bindFocusChapterContextScrollTarget(panel);
  positionFocusChapterContextPanel();
  handleFocusChapterContextScrollReveal();
  requestAnimationFrame(() => {
    panel.querySelector('.focus-context-item.active')?.focus({ preventScroll: true });
  });
}

function isFocusChapterContextHoverZone(event) {
  if (!isFocus || !event) return false;
  if (isFocusTopPanelOpen()) return false;
  const editor = document.getElementById('editor');
  const panel = document.getElementById('focusChapterContextPanel');
  if (panel?.contains(event.target)) return true;
  if (!editor || editor.contains(event.target)) return false;

  const editorRect = editor.getBoundingClientRect();
  return event.clientX < editorRect.left &&
    event.clientY >= editorRect.top &&
    event.clientY <= editorRect.bottom;
}

function handleFocusChapterContextPointerMove(event) {
  if (!isFocus) {
    clearFocusHoverIntent('left');
    hideFocusChapterContextPanel();
    return;
  }
  if (isFocusTopPanelOpen()) {
    clearFocusHoverIntent('left');
    hideFocusChapterContextPanel();
    return;
  }
  const panel = document.getElementById('focusChapterContextPanel');
  if (panel?.contains(event.target)) {
    clearFocusHoverIntent('left');
    clearFocusChapterContextEditorHoverTimer();
    clearFocusChapterContextHideTimer();
    return;
  }
  const editor = document.getElementById('editor');
  if (editor?.contains(event.target)) {
    clearFocusHoverIntent('left');
    scheduleFocusChapterContextEditorHoverClose();
    return;
  }
  clearFocusChapterContextEditorHoverTimer();
  if (isFocusChapterContextHoverZone(event)) {
    if (panel && !panel.hidden) {
      clearFocusHoverIntent('left');
      showFocusChapterContextPanel();
    } else {
      scheduleFocusHoverIntent('left', event, isFocusChapterContextHoverZone, showFocusChapterContextPanel);
    }
  }
  else {
    clearFocusHoverIntent('left');
    clearFocusChapterContextHideTimer();
    hideFocusChapterContextPanel();
  }
}

function handleFocusChapterContextPointerDown(event) {
  const panel = document.getElementById('focusChapterContextPanel');
  if (!isFocus) hideFocusChapterContextPanel();
  if (!panel || panel.hidden) return;
  if (panel.contains(event.target)) return;
  clearFocusChapterContextHideTimer();
  hideFocusChapterContextPanel();
}

function activateFocusContextChapter(index) {
  Promise.resolve(switchChap(index)).finally(refreshVisibleFocusChapterContextPanel);
}

function activateFocusContextDraft(index) {
  Promise.resolve(switchDraft(index)).finally(refreshVisibleFocusChapterContextPanel);
}

function handleTrashDraftItemClick(event, index) {
  if (!isDraftTrashMode || index < 0 || index >= chapterTrashDrafts.length) return;
  normalizeTrashDraftSelection();

  if (event?.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    const activeTrashAnchor = isTrashDraftActive() ? curTrashDraft : null;
    const anchorIndex = Number.isInteger(lastSelectedTrashDraftIndex) ? lastSelectedTrashDraftIndex : activeTrashAnchor ?? index;
    const startIndex = Math.min(anchorIndex, index);
    const endIndex = Math.max(anchorIndex, index);
    selectedTrashDraftIndexes.clear();
    for (let draftIndex = startIndex; draftIndex <= endIndex; draftIndex += 1) {
      selectedTrashDraftIndexes.add(draftIndex);
    }
    lastSelectedTrashDraftIndex = index;
    closeDraftActionsPanel();
    renderChapters();
    return;
  }

  if (event?.ctrlKey || event?.metaKey) {
    event.preventDefault();
    event.stopPropagation();
    if (selectedTrashDraftIndexes.has(index)) selectedTrashDraftIndexes.delete(index);
    else selectedTrashDraftIndexes.add(index);
    lastSelectedTrashDraftIndex = index;
    closeDraftActionsPanel();
    renderChapters();
    return;
  }

  clearSidebarSelections(false);
  lastSelectedTrashDraftIndex = index;
  switchTrashDraft(index);
}

function switchTrashDraft(index) {
  if (!isDraftTrashMode || index < 0 || index >= chapterTrashDrafts.length) return;
  activeEditorMode = 'trash';
  curTrashDraft = index;
  isChapterEditUnlocked = false;
  activeChapterEditKey = null;
  isEditingChapterTitle = false;
  closeDraftActionsPanel();
  renderChapters();
  loadEditor();
  updateChapterStatus();
}

function closePartDetailsPanel() {
  const panel = document.getElementById('partDetailsPanel');
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = '';
  }
  activePartDetailsIndex = null;
  activeFloatingAnchor = null;
}

function openPartDetailsPanel(partIndex, anchor = null) {
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const panel = document.getElementById('partDetailsPanel');
  if (!panel || !manifest.parts[partIndex]) return;

  syncCurrentChapterContentFromEditor();
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  const copy = text();
  const part = normalizePart(manifest.parts[partIndex], partIndex);
  const partChapters = chapters.filter(chapter => chapter.partIndex === partIndex);
  const partWords = partWordTotal(partIndex);
  const canDelete = partWords === 0;
  const canDeleteKeepChapters = partIndex === manifest.parts.length - 1 && partChapters.length > 0 && partWords > 0;
  const partTitle = part.title || defaultPartTitle(partIndex);
  const partSynopsis = part.synopsis || '';
  activePartDetailsIndex = partIndex;
  activeFloatingAnchor = anchor;

  panel.innerHTML = `
    <div class="part-details-head chapter-details-head">
      <div class="chapter-details-heading">
        <span class="part-details-kicker">${escapeHtml(copy.partPrefix)} ${part.no || partIndex + 1}</span>
      </div>
      <div class="chapter-details-head-actions">
        <span class="chapter-created-stamp" title="${escapeHtml(copy.partCreated)}">${escapeHtml(partCreatedLabel(part.createdAt))}</span>
        <button class="name-panel-close" type="button" onclick="closePartDetailsPanel()">${CROSS_CLOSE_SVG}</button>
      </div>
    </div>
    <div class="chapter-title-summary part-edit-section" id="partTitleSummary">
      <span class="part-details-kicker">${escapeHtml(copy.partTitleLabel)}</span>
      <div class="chapter-title-display-row">
        <strong class="chapter-title-display">${escapeHtml(partTitle)}</strong>
        <button class="chapter-title-edit-btn" type="button" onclick="beginPartDetailsTitleEdit(${partIndex})"
          title="${escapeHtml(copy.editPart)}" aria-label="${escapeHtml(copy.editPart)}">
          ${lmIcon("detailEdit")}
        </button>
      </div>
      <input class="chapter-title-editor" type="text" id="partDetailsTitleInp" hidden
        value="${escapeHtml(partTitle)}" data-original-value="${escapeHtml(partTitle)}"
        data-empty-label="${escapeHtml(defaultPartTitle(partIndex))}"
        oninput="markPartDetailsEdited()" onblur="deactivatePartDetailsFieldEdit('partTitleSummary', 'partDetailsTitleInp')"
        onkeydown="handlePartDetailsKey(event, ${partIndex})">
    </div>
    <div class="part-details-grid">
      <div class="part-detail-card"><span>${escapeHtml(copy.partStatus)}</span><strong>${escapeHtml(partStatusLabel(partIndex, partChapters.length))}</strong></div>
      <div class="part-detail-card"><span>${escapeHtml(copy.chapters)}</span><strong>${partChapters.length}</strong></div>
    </div>
    <div class="chapter-title-summary part-edit-section" id="partSynopsisSummary">
      <span class="part-details-kicker">${escapeHtml(copy.partSummary)}</span>
      <div class="chapter-title-display-row">
        <strong class="chapter-title-display part-summary-display ${partSynopsis ? '' : 'is-muted'}">${escapeHtml(partSynopsis || '—')}</strong>
        <button class="chapter-title-edit-btn" type="button" onclick="beginPartDetailsSummaryEdit(${partIndex})"
          title="${escapeHtml(copy.partSummary)}" aria-label="${escapeHtml(copy.partSummary)}">
          ${lmIcon("detailEdit")}
        </button>
      </div>
      <textarea class="chapter-title-editor part-summary-editor" id="partDetailsSynopsisInp" hidden
        data-original-value="${escapeHtml(partSynopsis)}" data-empty-label="—" data-muted-when-empty="true"
        oninput="markPartDetailsEdited()" onblur="deactivatePartDetailsFieldEdit('partSynopsisSummary', 'partDetailsSynopsisInp')"
        onkeydown="handlePartDetailsKey(event, ${partIndex})">${escapeHtml(partSynopsis)}</textarea>
    </div>
    <div class="part-details-actions chapter-details-actions">
      ${canDelete ? `<button class="part-delete-btn part-delete-action-btn" data-part-delete-action="true" type="button" onclick="deletePartIfEmpty(${partIndex})">${escapeHtml(copy.partDelete)}</button>` : ''}
      ${canDeleteKeepChapters ? `<button class="part-delete-btn part-delete-action-btn part-keep-chapters-delete-btn" data-part-delete-action="true" type="button" onclick="deletePartKeepingChapters(${partIndex})">${escapeHtml(copy.partDeleteKeepChapters)}</button>` : ''}
      <button class="part-save-btn chapter-info-save-btn" id="partDetailsSaveBtn" type="button" hidden
        onclick="savePartDetailsPanel(${partIndex})">${escapeHtml(copy.partInfoSave)}</button>
    </div>`;

  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
}

function beginPartDetailsTitleEdit() {
  beginPartDetailsFieldEdit('partTitleSummary', 'partDetailsTitleInp');
}

function beginPartDetailsSummaryEdit() {
  beginPartDetailsFieldEdit('partSynopsisSummary', 'partDetailsSynopsisInp');
}

function beginPartDetailsFieldEdit(sectionId, inputId) {
  const section = document.getElementById(sectionId);
  const input = document.getElementById(inputId);
  if (!section || !input) return;

  section.classList.add('is-editing');
  input.hidden = false;
  markPartDetailsEdited();
  requestAnimationFrame(() => {
    input.focus();
    if (input.tagName !== 'TEXTAREA') input.select();
  });
}

function syncDetailSectionDisplay(section, input) {
  const display = section?.querySelector('.chapter-title-display');
  if (!display || !input) return;

  const nextValue = input.value.trim();
  const fallbackValue = input.dataset.emptyLabel || input.dataset.originalValue || '';
  display.textContent = nextValue || fallbackValue;
  display.classList.toggle('is-muted', input.dataset.mutedWhenEmpty === 'true' && !nextValue);
}

function deactivatePartDetailsFieldEdit(sectionId, inputId) {
  const section = document.getElementById(sectionId);
  const input = document.getElementById(inputId);
  if (!section || !input) return;

  section.classList.remove('is-editing');
  input.hidden = true;
  syncDetailSectionDisplay(section, input);
  markPartDetailsEdited();
}

function deactivatePartDetailsEdits() {
  deactivatePartDetailsFieldEdit('partTitleSummary', 'partDetailsTitleInp');
  deactivatePartDetailsFieldEdit('partSynopsisSummary', 'partDetailsSynopsisInp');
}

function cancelPartDetailsEdits() {
  ['partTitleSummary', 'partSynopsisSummary'].forEach(sectionId => {
    document.getElementById(sectionId)?.classList.remove('is-editing');
  });
  ['partDetailsTitleInp', 'partDetailsSynopsisInp'].forEach(inputId => {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.value = input.dataset.originalValue || '';
    input.hidden = true;
    const section = inputId === 'partDetailsTitleInp'
      ? document.getElementById('partTitleSummary')
      : document.getElementById('partSynopsisSummary');
    syncDetailSectionDisplay(section, input);
  });
  markPartDetailsEdited();
}

function markPartDetailsEdited() {
  const saveButton = document.getElementById('partDetailsSaveBtn');
  if (!saveButton) return;

  const isEditing = ['partTitleSummary', 'partSynopsisSummary']
    .some(sectionId => document.getElementById(sectionId)?.classList.contains('is-editing'));
  const titleInput = document.getElementById('partDetailsTitleInp');
  const synopsisInput = document.getElementById('partDetailsSynopsisInp');
  const titleChanged = titleInput && titleInput.value.trim() !== (titleInput.dataset.originalValue || '').trim();
  const synopsisChanged = synopsisInput && synopsisInput.value.trim() !== (synopsisInput.dataset.originalValue || '').trim();
  const hasChanges = Boolean(titleChanged || synopsisChanged);
  document.querySelectorAll('#partDetailsPanel [data-part-delete-action]').forEach(button => {
    button.hidden = isEditing || hasChanges;
  });
  saveButton.hidden = !hasChanges;
}

function openDraftActionsPanel(draftIndex, anchor = null) {
  chapterDrafts = normalizeDrafts(chapterDrafts);
  const panel = document.getElementById('draftDetailsPanel');
  const draft = chapterDrafts[draftIndex];
  if (!panel || !draft) return;
  const canDeleteDraft = canDeleteDraftIndexes([draftIndex]);
  const deleteTitle = canDeleteDraft ? text().deleteDraft : text().draftDeleteLastDocumentBlocked;

  closePartDetailsPanel();
  closeDraftActionsPanel();
  closeChapterDetailsPanel();
  activeDraftDetailsIndex = draftIndex;
  activeFloatingAnchor = anchor;
  panel.classList.add('draft-actions-panel');
  panel.innerHTML = `
    <div class="part-details-head">
      <div>
        <span class="part-details-kicker">${escapeHtml(text().draftPrefix)} ${draftIndex + 1}</span>
        <strong>${escapeHtml(text().draftActions)}</strong>
      </div>
      <button class="name-panel-close" type="button" onclick="closeDraftActionsPanel()">${CROSS_CLOSE_SVG}</button>
    </div>
    <div class="draft-panel-actions">
      <button class="part-save-btn" type="button" onclick="requestPromoteDraftToChapter(${draftIndex}, this)">${escapeHtml(text().saveDraftAsChapter)}</button>
      <button class="part-delete-btn" type="button" ${canDeleteDraft ? `onclick="deleteDraftWithConfirm(${draftIndex})"` : 'disabled'}
        title="${escapeHtml(deleteTitle)}" aria-label="${escapeHtml(deleteTitle)}">${escapeHtml(text().deleteDraft)}</button>
    </div>`;

  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
}

function openTrashDraftActionsPanel(draftIndex, anchor = null) {
  chapterTrashDrafts = normalizeTrashDrafts(chapterTrashDrafts);
  const panel = document.getElementById('draftDetailsPanel');
  const draft = chapterTrashDrafts[draftIndex];
  if (!panel || !draft) return;

  closePartDetailsPanel();
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  activeDraftDetailsIndex = `trash:${draftIndex}`;
  activeFloatingAnchor = anchor;
  panel.classList.add('draft-actions-panel', 'trash-actions-panel');
  panel.innerHTML = `
    <div class="part-details-head">
      <div>
        <span class="part-details-kicker">${escapeHtml(text().trash)} ${draftIndex + 1}</span>
        <strong>${escapeHtml(text().trashActions)}</strong>
      </div>
      <button class="name-panel-close" type="button" onclick="closeDraftActionsPanel()">${CROSS_CLOSE_SVG}</button>
    </div>
    <div class="draft-panel-actions">
      <button class="part-save-btn trash-restore-action-btn" type="button" onclick="restoreTrashDraftsByIndexes([${draftIndex}])">${escapeHtml(text().restoreDraft)}</button>
      <button class="part-delete-btn" type="button" onclick="permanentlyDeleteTrashDraftsByIndexes([${draftIndex}])">${escapeHtml(text().permanentlyDeleteDraft)}</button>
    </div>`;

  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
}

function openDraftBulkDeletePanel(anchor = null) {
  chapterDrafts = normalizeDrafts(chapterDrafts);
  normalizeDraftSelection();
  const panel = document.getElementById('draftDetailsPanel');
  if (!panel || !chapterDrafts.length) return;

  const selectedCount = selectedDraftIndexes.size;
  const deleteAll = selectedCount === 0;
  const deleteIndexes = deleteAll
    ? chapterDrafts.map((_, index) => index)
    : Array.from(selectedDraftIndexes);
  if (!canDeleteDraftIndexes(deleteIndexes)) {
    showDraftDeleteBlockedReminder();
    return;
  }
  const deleteCount = deleteAll ? chapterDrafts.length : selectedCount;
  const copy = text();
  const title = deleteAll ? copy.deleteAllDraftsConfirmTitle : copy.deleteSelectedDraftsConfirmTitle;
  const body = deleteAll
    ? copy.deleteAllDraftsConfirmBody
    : copy.deleteSelectedDraftsConfirmBody.replace('{count}', deleteCount);

  closePartDetailsPanel();
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  activeDraftDetailsIndex = deleteAll ? 'all' : 'selected';
  activeFloatingAnchor = anchor;
  panel.classList.add('draft-actions-panel', 'draft-delete-confirm-panel');
  panel.innerHTML = `
    <div class="part-details-head draft-delete-confirm-head">
      <strong>${escapeHtml(title)}</strong>
      <div class="draft-delete-head-actions">
      <span class="draft-delete-count">${deleteCount} ${escapeHtml(copy.drafts)}</span>
        <button class="name-panel-close" type="button" onclick="closeDraftActionsPanel()">${CROSS_CLOSE_SVG}</button>
      </div>
    </div>
    <p class="draft-delete-confirm-copy">${escapeHtml(body)}</p>
    <div class="draft-panel-actions draft-delete-confirm-actions">
      <button class="panel-mini-btn" type="button" onclick="closeDraftActionsPanel()">${escapeHtml(copy.storyInfoCancel)}</button>
      <button class="part-delete-btn" type="button" onclick="deleteDraftBatchFromPanel(${deleteAll})">Delete</button>
    </div>`;

  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
}

function openChapterRecentToDraftPanel(scopeType = 'all', scopeIndex = -1, anchor = null) {
  ensureChapters();
  syncCurrentChapterContentFromEditor();
  normalizeChapterSelection();
  const panel = document.getElementById('draftDetailsPanel');
  const scopeIndexes = chapterIndexesForScope(scopeType, scopeIndex);
  if (scopeType === 'part' && !canConvertPartChaptersToDraft(scopeIndex)) return;
  if (!panel || !scopeIndexes.length) return;

  const scopeKey = chapterScopeKey(scopeType, scopeIndex);
  const selectedCount = selectedChapterScope === scopeKey ? selectedChapterIndexes.size : 0;
  const selectedIndexes = selectedCount
    ? Array.from(selectedChapterIndexes)
      .filter(index => Number.isInteger(index) && index >= 0 && index < chapters.length)
      .sort((left, right) => left - right)
    : [];
  const selectedWords = selectedIndexes.reduce((total, index) => total + chapterWordTotalForDeleteCheck(index), 0);
  const canDeleteSelectedEmptyChapters = selectedIndexes.length > 0 && selectedWords === 0;
  const defaultCount = selectedCount || 1;
  const shouldShowCountInput = selectedCount === 0;
  const copy = text();

  closePartDetailsPanel();
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  activeDraftDetailsIndex = `chapter-to-draft:${scopeKey}`;
  activeFloatingAnchor = anchor;
  panel.classList.add('draft-actions-panel', 'chapter-to-draft-panel');
  panel.innerHTML = `
    <div class="part-details-head draft-delete-confirm-head">
      <strong>${escapeHtml(copy.recentChaptersToDraft)}</strong>
      <button class="name-panel-close" type="button" onclick="closeDraftActionsPanel()">${CROSS_CLOSE_SVG}</button>
    </div>
    ${shouldShowCountInput ? `<p class="draft-delete-confirm-copy">${escapeHtml(copy.recentChaptersToDraftBody)}</p>` : ''}
    ${shouldShowCountInput ? `<label class="chapter-to-draft-count-field">
      <span class="chapter-to-draft-count-wrap">
        <span class="chapter-to-draft-count-control">
          <input id="chapterToDraftCountInp" type="number" min="1" max="${scopeIndexes.length}" value="${defaultCount}">
          <span class="chapter-to-draft-count-stepper" aria-label="${escapeHtml(copy.chapterConvertCountLabel)} controls">
            <button class="chapter-to-draft-count-step" type="button" onclick="adjustChapterToDraftCount(1)" aria-label="Increase recent chapters">${lmIcon('collapseChevron', 'step-chevron-svg lm-chevron-up')}</button>
            <button class="chapter-to-draft-count-step" type="button" onclick="adjustChapterToDraftCount(-1)" aria-label="Decrease recent chapters">${lmIcon('collapseChevron', 'step-chevron-svg lm-chevron-down')}</button>
          </span>
        </span>
        <small>${defaultCount}/${scopeIndexes.length} ${escapeHtml(copy.chapterConvertCountLabel)}</small>
      </span>
    </label>` : ''}
    <div class="draft-panel-actions draft-delete-confirm-actions">
      <button class="${canDeleteSelectedEmptyChapters ? 'part-delete-btn' : 'panel-mini-btn'}" type="button"
        onclick="${canDeleteSelectedEmptyChapters ? `deleteSelectedEmptyChaptersFromPanel('${scopeType}', ${scopeIndex})` : 'closeDraftActionsPanel()'}">
        ${escapeHtml(canDeleteSelectedEmptyChapters ? copy.confirmDeleteName : copy.storyInfoCancel)}
      </button>
      <button class="part-delete-btn" id="chapterToDraftConfirmBtn" type="button" onclick="convertRecentChaptersToDraftFromPanel('${scopeType}', ${scopeIndex})">${escapeHtml(copy.moveChapterToDraft)}</button>
    </div>`;

  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
  requestAnimationFrame(() => document.getElementById('chapterToDraftConfirmBtn')?.focus());
}

async function convertRecentChaptersToDraftFromPanel(scopeType = 'all', scopeIndex = -1) {
  const scopeKey = chapterScopeKey(scopeType, scopeIndex);
  if (selectedChapterScope === scopeKey && selectedChapterIndexes.size) {
    await moveChaptersToDraft(Array.from(selectedChapterIndexes));
    return;
  }

  const input = document.getElementById('chapterToDraftCountInp');
  const count = parseInt(input?.value || '1', 10) || 1;
  await moveRecentChaptersToDraft(scopeType, scopeIndex, count);
}

async function deleteSelectedEmptyChaptersFromPanel(scopeType = 'all', scopeIndex = -1) {
  const scopeKey = chapterScopeKey(scopeType, scopeIndex);
  if (selectedChapterScope !== scopeKey || !selectedChapterIndexes.size) return;
  await deleteEmptyChaptersByIndexes(Array.from(selectedChapterIndexes));
}

function adjustChapterToDraftCount(delta) {
  const input = document.getElementById('chapterToDraftCountInp');
  if (!input) return;
  const minCount = Number(input.min) || 1;
  const maxCount = Number(input.max) || Math.max(minCount, 1);
  const currentCount = Number(input.value) || minCount;
  input.value = clampNumber(currentCount + delta, minCount, maxCount);
  input.focus();
}

function openChapterDetailsPanel(chapterIndex, anchor = null) {
  ensureChapters();
  if (isEditingChapterTitle) commitChapterTitleEdit();
  syncCurrentChapterContentFromEditor();
  const panel = document.getElementById('chapterDetailsPanel');
  const chapter = chapters[chapterIndex];
  if (!panel || !chapter) return;

  closePartDetailsPanel();
  closeDraftActionsPanel();
  const copy = text();
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const hasParts = manifest.parts.length > 0;
  const partIndex = hasParts && Number.isInteger(chapter.partIndex) ? chapter.partIndex : 0;
  const part = hasParts ? normalizePart(manifest.parts[partIndex], partIndex) : null;
  const partLabel = part ? part.title || defaultPartTitle(partIndex) : copy.chapters;
  const stats = chapterDetailsStats(chapter);
  const canDelete = stats.words === 0;
  const canMoveToDraft = chapterIndex === chapters.length - 1;
  const chapterTitle = chapterDisplayTitle(chapter, chapterIndex);
  activeChapterDetailsIndex = chapterIndex;
  activeFloatingAnchor = anchor;

  panel.innerHTML = `
    <div class="part-details-head chapter-details-head">
      <div class="chapter-details-heading">
        <span class="part-details-kicker">${escapeHtml(copy.chapterStatus)} ${escapeHtml(chapterDisplayNumber(chapter, chapterIndex))}</span>
      </div>
      <div class="chapter-details-head-actions">
        <span class="chapter-created-stamp" title="${escapeHtml(copy.chapterCreated)}">${escapeHtml(chapterCreatedLabel(chapter.createdAt))}</span>
        <button class="name-panel-close" type="button" onclick="closeChapterDetailsPanel()">${CROSS_CLOSE_SVG}</button>
      </div>
    </div>
    <div class="chapter-title-summary" id="chapterTitleSummary">
      <span class="part-details-kicker">${escapeHtml(copy.chapterTitleLabel)}</span>
      <div class="chapter-title-display-row">
        <strong class="chapter-title-display">${escapeHtml(chapterTitle)}</strong>
        <button class="chapter-title-edit-btn" type="button" onclick="beginChapterDetailsTitleEdit(${chapterIndex})"
          title="${escapeHtml(copy.editChapterTitle)}" aria-label="${escapeHtml(copy.editChapterTitle)}">
          ${lmIcon("detailEdit")}
        </button>
      </div>
      <input class="chapter-title-editor" type="text" id="chapterDetailsTitleInp" hidden
        value="${escapeHtml(chapterTitle)}" data-original-value="${escapeHtml(chapterTitle)}"
        data-empty-label="${escapeHtml(`${text().newChapterPrefix} ${chapterIndex + 1}`)}"
        oninput="markChapterDetailsTitleEdited()" onblur="deactivateChapterDetailsTitleEdit()"
        onkeydown="handleChapterDetailsKey(event, ${chapterIndex})">
    </div>
    <div class="part-details-grid chapter-details-grid">
      <div class="part-detail-card"><span>${escapeHtml(copy.partStatus)}</span><strong>${escapeHtml(chapterStatusLabel(chapterIndex))}</strong></div>
      <div class="part-detail-card"><span>${escapeHtml(copy.words)}</span><strong>${stats.words}</strong></div>
      <div class="part-detail-card"><span>${escapeHtml(copy.characters)}</span><strong>${stats.characters}</strong></div>
      <div class="part-detail-card"><span>${escapeHtml(copy.chapterPartLabel)}</span><strong>${escapeHtml(partLabel)}</strong></div>
    </div>
    <div class="part-details-actions chapter-details-actions">
      ${canDelete ? `<button class="part-delete-btn" id="chapterDetailsDeleteBtn" type="button" onclick="deleteChapterIfEmpty(${chapterIndex})">${escapeHtml(copy.chapterDelete)}</button>` : ''}
      ${canMoveToDraft ? `<button class="part-delete-btn" id="chapterDetailsToDraftBtn" type="button" onclick="moveChapterToDraft(${chapterIndex})">${escapeHtml(copy.moveChapterToDraft)}</button>` : ''}
      <button class="part-save-btn chapter-info-save-btn" id="chapterDetailsSaveBtn" type="button" hidden
        onclick="saveChapterDetailsPanel(${chapterIndex})">${escapeHtml(copy.chapterInfoSave)}</button>
    </div>`;

  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
}

function beginChapterDetailsTitleEdit() {
  const titleWrap = document.getElementById('chapterTitleSummary');
  const titleInput = document.getElementById('chapterDetailsTitleInp');
  if (!titleWrap || !titleInput) return;

  titleWrap.classList.add('is-editing');
  titleInput.hidden = false;
  markChapterDetailsTitleEdited();
  requestAnimationFrame(() => {
    titleInput.focus();
    titleInput.select();
  });
}

function cancelChapterDetailsTitleEdit() {
  const titleWrap = document.getElementById('chapterTitleSummary');
  const titleInput = document.getElementById('chapterDetailsTitleInp');
  if (!titleWrap || !titleInput) return;

  titleInput.value = titleInput.dataset.originalValue || '';
  titleInput.hidden = true;
  titleWrap.classList.remove('is-editing');
  syncDetailSectionDisplay(titleWrap, titleInput);
  markChapterDetailsTitleEdited();
}

function deactivateChapterDetailsTitleEdit() {
  const titleWrap = document.getElementById('chapterTitleSummary');
  const titleInput = document.getElementById('chapterDetailsTitleInp');
  if (!titleWrap || !titleInput) return;

  titleInput.hidden = true;
  titleWrap.classList.remove('is-editing');
  syncDetailSectionDisplay(titleWrap, titleInput);
  markChapterDetailsTitleEdited();
}

function markChapterDetailsTitleEdited() {
  const titleWrap = document.getElementById('chapterTitleSummary');
  const titleInput = document.getElementById('chapterDetailsTitleInp');
  const saveButton = document.getElementById('chapterDetailsSaveBtn');
  const deleteButton = document.getElementById('chapterDetailsDeleteBtn');
  const moveToDraftButton = document.getElementById('chapterDetailsToDraftBtn');
  if (!titleWrap || !titleInput || !saveButton) return;

  const originalTitle = (titleInput.dataset.originalValue || '').trim();
  const nextTitle = titleInput.value.trim();
  const hasChanges = nextTitle !== originalTitle;
  saveButton.hidden = !hasChanges;
  if (deleteButton) deleteButton.hidden = hasChanges;
  if (moveToDraftButton) moveToDraftButton.hidden = hasChanges;
}

function handleChapterDetailsKey(event, chapterIndex) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    if (document.getElementById('chapterTitleSummary')?.classList.contains('is-editing')) {
      cancelChapterDetailsTitleEdit();
    } else {
      closeChapterDetailsPanel();
    }
  } else if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    if (!document.getElementById('chapterDetailsSaveBtn')?.hidden) saveChapterDetailsPanel(chapterIndex);
  }
}

async function saveChapterDetailsPanel(chapterIndex) {
  ensureChapters();
  const chapter = chapters[chapterIndex];
  if (!chapter) return;

  const titleInput = document.getElementById('chapterDetailsTitleInp');
  const saveButton = document.getElementById('chapterDetailsSaveBtn');
  if (saveButton?.disabled) return;
  const sidebarTarget = sidebarSaveTargetForChapter(chapterIndex);

  const cleanedTitle = titleInput?.value.trim() || `${text().newChapterPrefix} ${chapterIndex + 1}`;
  if (chapterTitleExists(cleanedTitle, chapterIndex)) {
    showDuplicateReminder(text().duplicateChapterTitle);
    return;
  }

  if (chapterIndex === curChap) {
    isEditingChapterTitle = false;
  }

  try {
    if (saveButton) {
      saveButton.hidden = false;
      saveButton.disabled = true;
      saveButton.textContent = text().saving;
      saveButton.setAttribute('aria-busy', 'true');
    }
    if (titleInput) titleInput.disabled = true;
    setSidebarSaveIndicator(sidebarTarget, 'busy');
    const result = await saveSavedChapterTitle(chapterIndex, cleanedTitle, { syncEditDraft: true });
    setSaveButtonSaved(isChapterEditDraftActive()
      ? getCleanEditorHTML() === (result?.editDraft?.lastAutosavedHTML || activeChapterEditDraft()?.lastAutosavedHTML || '')
      : true);
    setSidebarSaveIndicator(sidebarTarget, 'saved');
    closeChapterDetailsPanel();
  } catch (error) {
    console.warn('Chapter details save failed:', error);
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = text().chapterInfoSave;
      saveButton.removeAttribute('aria-busy');
    }
    if (titleInput) titleInput.disabled = false;
    setSidebarSaveIndicator(sidebarTarget, 'idle');
  }
}

function handlePartDetailsKey(event, partIndex) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    const hasOpenEdit = ['partTitleSummary', 'partSynopsisSummary']
      .some(sectionId => document.getElementById(sectionId)?.classList.contains('is-editing'));
    if (hasOpenEdit) {
      cancelPartDetailsEdits();
    } else {
      closePartDetailsPanel();
    }
  } else if (event.key === 'Enter' && !event.shiftKey && event.target.tagName !== 'TEXTAREA') {
    event.preventDefault();
    event.stopPropagation();
    if (!document.getElementById('partDetailsSaveBtn')?.hidden) savePartDetailsPanel(partIndex);
  }
}

async function savePartDetailsPanel(partIndex) {
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  if (!manifest.parts[partIndex]) return;
  const saveButton = document.getElementById('partDetailsSaveBtn');
  const titleInput = document.getElementById('partDetailsTitleInp');
  const synopsisInput = document.getElementById('partDetailsSynopsisInp');
  if (saveButton?.disabled) return;

  const existingPart = normalizePart(manifest.parts[partIndex], partIndex);
  const nextTitle = titleInput?.value.trim() || defaultPartTitle(partIndex);
  if (partTitleExists(nextTitle, partIndex)) {
    showDuplicateReminder(text().duplicatePartTitle);
    return;
  }

  manifest.parts[partIndex] = {
    ...existingPart,
    title: nextTitle,
    synopsis: synopsisInput?.value.trim() || '',
    createdAt: existingPart.createdAt || new Date().toISOString(),
    chapters: existingPart.chapters || []
  };

  projectManifest = manifest;
  persistProjectManifestSnapshot();
  saveToStorage(false);
  renderChapters();
  updateStorySummary();

  try {
    if (saveButton) {
      saveButton.hidden = false;
      saveButton.disabled = true;
      saveButton.textContent = text().saving;
      saveButton.setAttribute('aria-busy', 'true');
    }
    if (titleInput) titleInput.disabled = true;
    if (synopsisInput) synopsisInput.disabled = true;
    setSidebarSaveIndicator('parts', 'busy');
    if (projectDirectoryHandle) await writeProjectManifest();
    setSidebarSaveIndicator('parts', 'saved');
    closePartDetailsPanel();
  } catch (error) {
    console.warn('Part details save failed:', error);
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = text().partInfoSave;
      saveButton.removeAttribute('aria-busy');
    }
    if (titleInput) titleInput.disabled = false;
    if (synopsisInput) synopsisInput.disabled = false;
    setSidebarSaveIndicator('parts', 'idle');
  }
}

async function deleteChapterIfEmpty(chapterIndex) {
  ensureChapters();
  syncCurrentChapterContentFromEditor();
  const chapter = chapters[chapterIndex];
  if (!chapter || chapterWordTotalForDeleteCheck(chapterIndex) > 0) return;

  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const oldCurChap = curChap;
  const deletedPartIndex = chapter.partIndex || 0;
  const deletedPath = chapter.contentPath || '';
  chapters.splice(chapterIndex, 1);
  ensureChapterAfterDelete(manifest, deletedPartIndex);

  if (!chapters.length) curChap = 0;
  else if (oldCurChap === chapterIndex) curChap = Math.min(chapterIndex, chapters.length - 1);
  else if (oldCurChap > chapterIndex) curChap = oldCurChap - 1;
  else curChap = oldCurChap;

  reindexProjectStructure(manifest);
  curPart = chapters[curChap]?.partIndex ?? (manifest.parts.length ? 0 : -1);
  expandedPartIndex = manifest.parts.length ? curPart : -1;
  persistProjectManifestSnapshot();
  saveToStorage(false);
  closeChapterDetailsPanel();
  loadEditor();
  renderChapters();
  renderTags();
  renderNotes();
  updateStorySummary();
  updateChapterStatus();

  try {
    await removeProjectFileIfExists(deletedPath);
    if (projectDirectoryHandle) await writeProjectManifest();
    setSaveStatusDot('saved', text().chapterDeleted);
    showMiniReminder(text().chapterDeleted);
  } catch (error) {
    console.warn('Chapter delete failed:', error);
    setDefaultSaveStatus();
    showMiniReminder(text().storyCreateFailed);
  }
}

async function deleteEmptyChaptersByIndexes(chapterIndexes = []) {
  ensureChapters();
  const uniqueIndexes = Array.from(new Set(chapterIndexes))
    .filter(index => Number.isInteger(index) && index >= 0 && index < chapters.length)
    .sort((left, right) => left - right);
  if (!uniqueIndexes.length) return;

  if (uniqueIndexes.includes(curChap) && isEditingChapterTitle) {
    const titleCommitted = await commitChapterTitleEdit();
    if (!titleCommitted) return;
  }

  syncCurrentChapterContentFromEditor();
  const hasWords = uniqueIndexes.some(index => chapterWordTotalForDeleteCheck(index) > 0);
  if (hasWords) return;

  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const wasDraftActive = isDraftActive();
  const currentChapterRef = chapters[curChap];
  const oldCurDraft = curDraft;
  const deletedSet = new Set(uniqueIndexes);
  const activeChapterDeleted = !wasDraftActive && deletedSet.has(curChap);
  const firstDeletedChapter = chapters[uniqueIndexes[0]];
  const preferredPartIndex = Number.isInteger(firstDeletedChapter?.partIndex) ? firstDeletedChapter.partIndex : 0;
  const deletedPaths = uniqueIndexes
    .map(index => chapters[index]?.contentPath)
    .filter(Boolean);
  const editDraftPaths = uniqueIndexes
    .map(index => {
      const editDraftKey = chapterEditDraftKey(index);
      const editDraftPath = chapterEditDrafts[editDraftKey]?.contentPath || '';
      delete chapterEditDrafts[editDraftKey];
      return editDraftPath;
    })
    .filter(Boolean);

  chapters = chapters.filter((_, index) => !deletedSet.has(index));
  ensureChapterAfterDelete(manifest, preferredPartIndex);
  selectedChapterIndexes.clear();
  selectedChapterScope = null;
  isChapterEditUnlocked = false;
  activeChapterEditKey = null;

  if (wasDraftActive) {
    activeEditorMode = 'draft';
    curDraft = Math.min(oldCurDraft, Math.max(0, chapterDrafts.length - 1));
  } else if (activeChapterDeleted) {
    activeEditorMode = 'chapter';
    curChap = chapters.length ? Math.min(uniqueIndexes[0], chapters.length - 1) : 0;
  } else {
    activeEditorMode = 'chapter';
    const currentStillIndex = chapters.indexOf(currentChapterRef);
    curChap = chapters.length ? (currentStillIndex >= 0 ? currentStillIndex : Math.min(curChap, chapters.length - 1)) : 0;
  }

  const activePartIndex = chapters[curChap]?.partIndex;
  const hasActivePart = manifest.parts.length &&
    Number.isInteger(activePartIndex) &&
    activePartIndex >= 0 &&
    activePartIndex < manifest.parts.length;
  curPart = hasActivePart ? activePartIndex : -1;
  expandedPartIndex = hasActivePart ? curPart : -1;
  isRawChapterSectionExpanded = !hasActivePart && chapters.length > 0;
  isPartsListCollapsedByRaw = !hasActivePart && chapters.length > 0;
  isPartsListForceExpanded = hasActivePart;

  reindexProjectStructure(manifest);
  persistProjectManifestSnapshot();
  saveToStorage(false);
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  loadEditor();
  renderChapters();
  renderTags();
  renderNotes();
  updateStorySummary();
  updateChapterStatus();
  focusSidebarItemAfterRender(wasDraftActive ? 'draft' : hasActivePart ? 'chapter' : 'raw');

  try {
    if (projectDirectoryHandle) {
      await Promise.all([...deletedPaths, ...editDraftPaths].map(removeProjectFileIfExists));
      await writeProjectManifest();
      await writeChapterEditDraftsToProject();
    }
    const message = uniqueIndexes.length === 1 ? text().chapterDeleted : (text().chaptersDeleted || text().chapterDeleted);
    setSaveStatusDot('saved', message);
    showMiniReminder(message);
  } catch (error) {
    console.warn('Empty chapters delete failed:', error);
    setDefaultSaveStatus();
    showMiniReminder(text().storyCreateFailed);
  }
}

async function moveChapterToDraft(chapterIndex) {
  ensureChapters();
  if (chapterIndex !== chapters.length - 1) return;
  if (isEditingChapterTitle && chapterIndex === curChap) {
    const titleCommitted = await commitChapterTitleEdit();
    if (!titleCommitted) return;
  }

  syncCurrentChapterContentFromEditor();
  const chapter = chapters[chapterIndex];
  if (!chapter) return;

  showAppLoader(text().movingChapterToDraft);
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const oldChapterPath = chapter.contentPath || '';
  const editDraftKey = chapterEditDraftKey(chapterIndex);
  const editDraft = chapterEditDrafts[editDraftKey]
    ? normalizeChapterEditDraft(chapterEditDrafts[editDraftKey], editDraftKey)
    : null;
  const shouldUseActiveEditDraft = chapterIndex === curChap && isChapterEditDraftActive();
  const shouldUseStoredEditDraft = Boolean(
    editDraft &&
    !shouldUseActiveEditDraft &&
    !isChapterEditDraftSameAsChapter(editDraft, chapterIndex)
  );
  const draftIndex = chapterDrafts.length;
  const draftPath = nextDraftFilePath();
  const draftContent = shouldUseActiveEditDraft
    ? getCleanEditorHTML()
    : shouldUseStoredEditDraft
      ? editDraft.content || ''
      : chapter.content || '';
  const draftText = shouldUseActiveEditDraft
    ? getCleanEditorText()
    : editorHTMLToText(draftContent);
  const draftTitle = (shouldUseActiveEditDraft || shouldUseStoredEditDraft) && editDraft?.title
    ? editDraft.title
    : chapterDisplayTitle(chapter, chapterIndex);
  const newDraft = normalizeDraft({
    ...createDefaultDraft(draftIndex),
    id: Date.now(),
    title: draftTitle,
    content: draftContent,
    notes: chapter.notes || [],
    contentPath: draftPath,
    createdAt: chapter.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    alignment: chapter.alignment,
    lineHeight: chapter.lineHeight,
    paragraphGap: chapter.paragraphGap,
    paragraphMargin: chapter.paragraphMargin,
    fontFamily: chapter.fontFamily,
    fontSize: chapter.fontSize,
    _wordCount: countWordsFromText(draftText)
  }, draftIndex);
  const editDraftPath = editDraft?.contentPath || '';

  chapters.splice(chapterIndex, 1);
  chapterDrafts.push(newDraft);
  chapterDrafts = normalizeDrafts(chapterDrafts);
  delete chapterEditDrafts[editDraftKey];
  selectedDraftIndexes.clear();
  lastSelectedDraftIndex = null;
  activeEditorMode = 'draft';
  isChapterEditUnlocked = false;
  activeChapterEditKey = null;
  curDraft = chapterDrafts.length - 1;
  curChap = chapters.length ? Math.min(chapterIndex, chapters.length - 1) : 0;
  curPart = -1;
  expandedPartIndex = -1;
  isRawChapterSectionExpanded = false;
  isPartsListCollapsedByRaw = false;
  isPartsListForceExpanded = false;
  reindexProjectStructure(manifest);
  persistProjectManifestSnapshot();
  saveToStorage(false);
  closeChapterDetailsPanel();
  setDraftBoxSaveIndicator('busy');
  loadEditor();
  renderChapters();
  renderTags();
  renderNotes();
  updateStorySummary();
  updateChapterStatus();
  focusSidebarItemAfterRender('draft');

  try {
    if (projectDirectoryHandle) {
      await writeDraftToLocalFile(curDraft, draftText);
      await removeProjectFileIfExists(oldChapterPath);
      if (editDraftPath) await removeProjectFileIfExists(editDraftPath);
      await writeProjectManifest();
      await writeDraftsDataToProject();
      await writeChapterEditDraftsToProject();
    }
    setDraftBoxSaveIndicator('saved');
  } catch (error) {
    console.warn('Chapter move to draft failed:', error);
    setDraftBoxSaveIndicator('idle');
    setDefaultSaveStatus();
  } finally {
    hideAppLoader();
  }
}

function chapterToDraftPayload(chapterIndex, draftIndex, timestamp = new Date().toISOString(), draftPath = nextDraftFilePath()) {
  const chapter = chapters[chapterIndex];
  if (!chapter) return null;

  const editDraftKey = chapterEditDraftKey(chapterIndex);
  const editDraft = chapterEditDrafts[editDraftKey]
    ? normalizeChapterEditDraft(chapterEditDrafts[editDraftKey], editDraftKey)
    : null;
  const shouldUseActiveEditDraft = chapterIndex === curChap && isChapterEditDraftActive();
  const shouldUseStoredEditDraft = Boolean(
    editDraft &&
    !shouldUseActiveEditDraft &&
    !isChapterEditDraftSameAsChapter(editDraft, chapterIndex)
  );
  const draftContent = shouldUseActiveEditDraft
    ? getCleanEditorHTML()
    : shouldUseStoredEditDraft
      ? editDraft.content || ''
      : chapter.content || '';
  const draftText = shouldUseActiveEditDraft
    ? getCleanEditorText()
    : editorHTMLToText(draftContent);
  const draftTitle = (shouldUseActiveEditDraft || shouldUseStoredEditDraft) && editDraft?.title
    ? editDraft.title
    : chapterDisplayTitle(chapter, chapterIndex);
  const draft = normalizeDraft({
    ...createDefaultDraft(draftIndex),
    id: Date.now() + draftIndex,
    title: draftTitle,
    content: draftContent,
    notes: chapter.notes || [],
    contentPath: draftPath,
    createdAt: chapter.createdAt || timestamp,
    updatedAt: timestamp,
    alignment: chapter.alignment,
    lineHeight: chapter.lineHeight,
    paragraphGap: chapter.paragraphGap,
    paragraphMargin: chapter.paragraphMargin,
    fontFamily: chapter.fontFamily,
    fontSize: chapter.fontSize,
    _wordCount: countWordsFromText(draftText)
  }, draftIndex);

  return {
    chapter,
    chapterIndex,
    draft,
    draftText,
    oldChapterPath: chapter.contentPath || '',
    editDraftKey,
    editDraftPath: editDraft?.contentPath || ''
  };
}

async function moveChaptersToDraft(chapterIndexes = []) {
  ensureChapters();
  const uniqueIndexes = Array.from(new Set(chapterIndexes))
    .filter(index => Number.isInteger(index) && index >= 0 && index < chapters.length)
    .sort((left, right) => left - right);
  if (!uniqueIndexes.length) return;

  if (uniqueIndexes.includes(curChap) && isEditingChapterTitle) {
    const titleCommitted = await commitChapterTitleEdit();
    if (!titleCommitted) return;
  }

  syncCurrentChapterContentFromEditor();
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const wasDraftActive = isDraftActive();
  const currentChapterRef = chapters[curChap];
  const oldCurDraft = curDraft;
  const originalDraftCount = chapterDrafts.length;
  const convertedSet = new Set(uniqueIndexes);
  const activeChapterConverted = !wasDraftActive && convertedSet.has(curChap);
  const timestamp = new Date().toISOString();

  showAppLoader(uniqueIndexes.length > 1 ? text().movingChaptersToDraft : text().movingChapterToDraft);
  const reservedDraftPaths = new Set(chapterDrafts.map(draft => draft.contentPath).filter(Boolean));
  const reserveDraftPath = draftIndex => {
    let pathIndex = draftIndex;
    let draftPath = draftFilePath(pathIndex);
    while (reservedDraftPaths.has(draftPath)) {
      pathIndex += 1;
      draftPath = draftFilePath(pathIndex);
    }
    reservedDraftPaths.add(draftPath);
    return draftPath;
  };
  const payloads = uniqueIndexes.map((chapterIndex, offset) => (
    chapterToDraftPayload(
      chapterIndex,
      originalDraftCount + offset,
      timestamp,
      reserveDraftPath(originalDraftCount + offset)
    )
  )).filter(Boolean);
  if (!payloads.length) {
    hideAppLoader();
    return;
  }

  chapters = chapters.filter((_, index) => !convertedSet.has(index));
  payloads.forEach(payload => {
    chapterDrafts.push(payload.draft);
    delete chapterEditDrafts[payload.editDraftKey];
  });
  chapterDrafts = normalizeDrafts(chapterDrafts);
  selectedDraftIndexes.clear();
  lastSelectedDraftIndex = null;
  selectedChapterIndexes.clear();
  selectedChapterScope = null;
  isChapterEditUnlocked = false;
  activeChapterEditKey = null;

  if (activeChapterConverted) {
    activeEditorMode = 'draft';
    curDraft = originalDraftCount + payloads.findIndex(payload => payload.chapterIndex === curChap);
    curChap = chapters.length ? Math.min(curChap, chapters.length - 1) : 0;
    curPart = -1;
    expandedPartIndex = -1;
    isRawChapterSectionExpanded = false;
    isPartsListCollapsedByRaw = false;
    isPartsListForceExpanded = false;
  } else if (wasDraftActive) {
    activeEditorMode = 'draft';
    curDraft = Math.min(oldCurDraft, chapterDrafts.length - 1);
  } else {
    const currentStillIndex = chapters.indexOf(currentChapterRef);
    curChap = chapters.length ? (currentStillIndex >= 0 ? currentStillIndex : Math.min(curChap, chapters.length - 1)) : 0;
    const activePartIndex = chapters[curChap]?.partIndex;
    const hasActivePart = manifest.parts.length &&
      Number.isInteger(activePartIndex) &&
      activePartIndex >= 0 &&
      activePartIndex < manifest.parts.length;
    curPart = hasActivePart ? activePartIndex : -1;
    expandedPartIndex = hasActivePart ? curPart : -1;
    isRawChapterSectionExpanded = !hasActivePart;
    isPartsListCollapsedByRaw = !hasActivePart;
    isPartsListForceExpanded = hasActivePart;
  }

  reindexProjectStructure(manifest);
  persistProjectManifestSnapshot();
  saveToStorage(false);
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  setDraftBoxSaveIndicator('busy');
  loadEditor();
  renderChapters();
  renderTags();
  renderNotes();
  updateStorySummary();
  updateChapterStatus();
  focusSidebarItemAfterRender(activeChapterConverted || wasDraftActive ? 'draft' : 'chapter');

  try {
    if (projectDirectoryHandle) {
      await Promise.all(payloads.map(async payload => {
        const draftHandle = await getProjectFileHandle(payload.draft.contentPath, { create: true });
        payload.draft.contentHandle = draftHandle;
        await writeFileText(draftHandle, payload.draftText);
      }));
      await Promise.all(payloads.flatMap(payload => [
        payload.oldChapterPath,
        payload.editDraftPath
      ].filter(Boolean).map(removeProjectFileIfExists)));
      await writeProjectManifest();
      await writeDraftsDataToProject();
      await writeChapterEditDraftsToProject();
    }
    setDraftBoxSaveIndicator('saved');
  } catch (error) {
    console.warn('Chapters move to draft failed:', error);
    setDraftBoxSaveIndicator('idle');
    setDefaultSaveStatus();
  } finally {
    hideAppLoader();
  }
}

async function moveRecentChaptersToDraft(scopeType = 'all', scopeIndex = -1, count = 1) {
  const indexes = recentChapterIndexesForScope(scopeType, scopeIndex, count);
  await moveChaptersToDraft(indexes);
}

function focusSidebarItemAfterRender(target = 'chapter') {
  requestAnimationFrame(() => {
    const selector = target === 'draft'
      ? '#draftBox .draft-item.active'
      : target === 'raw'
        ? '#rawChapterSection .chap-item.active'
        : '#chapter-list .chap-item.active, #chapter-list .is-active-part .part-header';
    document.querySelector(selector)?.scrollIntoView({ block: 'nearest' });
  });
}

function syncSidebarAfterPartKeepDelete(wasDraftActive = false, activeChapterMovedToRaw = false) {
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  if (wasDraftActive) {
    return 'draft';
  }

  const activePartIndex = chapters[curChap]?.partIndex;
  const activeChapterHasPart = manifest.parts.length &&
    Number.isInteger(activePartIndex) &&
    activePartIndex >= 0 &&
    activePartIndex < manifest.parts.length;

  if (activeChapterMovedToRaw || !activeChapterHasPart) {
    curPart = -1;
    expandedPartIndex = -1;
    isRawChapterSectionExpanded = true;
    isPartsListCollapsedByRaw = true;
    isPartsListForceExpanded = false;
    return 'raw';
  }

  curPart = activePartIndex;
  expandedPartIndex = curPart;
  isRawChapterSectionExpanded = false;
  isPartsListCollapsedByRaw = false;
  isPartsListForceExpanded = true;
  if (chapterListOverflowMode === 'collapsed') chapterListOverflowMode = 'expanded';
  return 'part';
}

async function deletePartIfEmpty(partIndex) {
  ensureChapters();
  syncCurrentChapterContentFromEditor();
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  if (!manifest.parts[partIndex] || partWordTotal(partIndex) > 0) return;

  const oldCurChap = curChap;
  const currentChapterRef = chapters[curChap];
  const wasDraftActive = isDraftActive();
  const previousSidebarState = wasDraftActive ? {
    curPart,
    expandedPartIndex,
    isRawChapterSectionExpanded,
    isPartsListCollapsedByRaw,
    isPartsListForceExpanded,
    chapterListOverflowMode
  } : null;
  const deletedPaths = chapters
    .filter(chapter => chapter.partIndex === partIndex)
    .map(chapter => chapter.contentPath)
    .filter(Boolean);

  chapters = chapters.filter(chapter => chapter.partIndex !== partIndex);
  chapters.forEach(chapter => {
    if (chapter.partIndex > partIndex) chapter.partIndex -= 1;
  });

  manifest.parts.splice(partIndex, 1);
  ensureChapterAfterDelete(manifest, Math.max(0, Math.min(partIndex, manifest.parts.length - 1)));

  const currentStillIndex = chapters.indexOf(currentChapterRef);
  curChap = chapters.length
    ? currentStillIndex >= 0 ? currentStillIndex : Math.min(oldCurChap, chapters.length - 1)
    : 0;
  reindexProjectStructure(manifest);
  if (wasDraftActive && previousSidebarState) {
    const shiftPartIndexAfterDelete = value => {
      if (!Number.isInteger(value) || value < 0) return value;
      if (value === partIndex) return -1;
      return value > partIndex ? value - 1 : value;
    };
    curPart = shiftPartIndexAfterDelete(previousSidebarState.curPart);
    expandedPartIndex = shiftPartIndexAfterDelete(previousSidebarState.expandedPartIndex);
    isRawChapterSectionExpanded = previousSidebarState.isRawChapterSectionExpanded;
    isPartsListCollapsedByRaw = previousSidebarState.isPartsListCollapsedByRaw;
    isPartsListForceExpanded = previousSidebarState.isPartsListForceExpanded;
    chapterListOverflowMode = previousSidebarState.chapterListOverflowMode;
  } else {
    curPart = chapters[curChap]?.partIndex ?? (manifest.parts.length ? 0 : -1);
    expandedPartIndex = manifest.parts.length ? curPart : -1;
  }
  persistProjectManifestSnapshot();
  saveToStorage(false);
  closePartDetailsPanel();
  loadEditor();
  renderChapters();
  renderTags();
  renderNotes();
  updateStorySummary();
  updateChapterStatus();

  try {
    await Promise.all(deletedPaths.map(removeProjectFileIfExists));
    if (projectDirectoryHandle) await writeProjectManifest();
    setSaveStatusDot('saved', text().partDeleted);
  } catch (error) {
    console.warn('Part delete failed:', error);
    setDefaultSaveStatus();
  }
}

async function deletePartKeepingChapters(partIndex) {
  ensureChapters();
  syncCurrentChapterContentFromEditor();
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  if (!manifest.parts[partIndex] || partIndex !== manifest.parts.length - 1) return;

  const oldCurChap = curChap;
  const currentChapterRef = chapters[curChap];
  const wasDraftActive = isDraftActive();
  const previousSidebarState = wasDraftActive ? {
    curPart,
    expandedPartIndex,
    isRawChapterSectionExpanded,
    isPartsListCollapsedByRaw,
    isPartsListForceExpanded,
    chapterListOverflowMode
  } : null;
  const activeChapterMovedToRaw = !wasDraftActive && currentChapterRef?.partIndex === partIndex;
  let movedChapterCount = 0;
  chapters.forEach(chapter => {
    if (chapter.partIndex === partIndex) {
      chapter.partIndex = -1;
      movedChapterCount += 1;
    } else if (chapter.partIndex > partIndex) {
      chapter.partIndex -= 1;
    }
  });
  if (!movedChapterCount) return;

  manifest.parts.splice(partIndex, 1);
  const currentStillIndex = chapters.indexOf(currentChapterRef);
  curChap = chapters.length
    ? currentStillIndex >= 0 ? currentStillIndex : Math.min(oldCurChap, chapters.length - 1)
    : 0;
  reindexProjectStructure(manifest);
  let sidebarFocusTarget = 'draft';
  if (wasDraftActive && previousSidebarState) {
    curPart = previousSidebarState.curPart === partIndex ? -1 : previousSidebarState.curPart;
    expandedPartIndex = previousSidebarState.expandedPartIndex === partIndex ? -1 : previousSidebarState.expandedPartIndex;
    isRawChapterSectionExpanded = previousSidebarState.isRawChapterSectionExpanded;
    isPartsListCollapsedByRaw = previousSidebarState.isPartsListCollapsedByRaw;
    isPartsListForceExpanded = previousSidebarState.isPartsListForceExpanded;
    chapterListOverflowMode = previousSidebarState.chapterListOverflowMode;
  } else {
    sidebarFocusTarget = syncSidebarAfterPartKeepDelete(wasDraftActive, activeChapterMovedToRaw);
  }
  persistProjectManifestSnapshot();
  saveToStorage(false);
  closePartDetailsPanel();
  loadEditor();
  renderChapters();
  renderTags();
  renderNotes();
  updateStorySummary();
  updateChapterStatus();
  focusSidebarItemAfterRender(sidebarFocusTarget);

  try {
    if (projectDirectoryHandle) await writeProjectManifest();
    setSaveStatusDot('saved', text().partDeletedKeepChapters);
  } catch (error) {
    console.warn('Part delete without chapter delete failed:', error);
    setDefaultSaveStatus();
  }
}

function togglePartExpansion(partIndex) {
  const willExpand = expandedPartIndex !== partIndex;
  expandedPartIndex = willExpand ? partIndex : -1;
  if (willExpand) {
    isRawChapterSectionExpanded = false;
    isPartsListCollapsedByRaw = false;
    isPartsListForceExpanded = true;
    if (chapterListOverflowMode === 'collapsed') chapterListOverflowMode = 'expanded';
  }
  renderChapters();
}

function updateChapterPanelBottomActions() {
  const trashButton = document.getElementById('trashToggleBtn');
  const addPartButton = document.getElementById('addPartBtn');

  if (trashButton) {
    const trashCount = chapterTrashDrafts.length;
    const shouldShowTrash = hasActiveStory() && !isDraftTrashMode && trashCount > 0;
    trashButton.hidden = !shouldShowTrash;
    trashButton.innerHTML = `
      ${TRASH_MODE_SVG}
      <span class="trash-toggle-count-badge" aria-hidden="true">${escapeHtml(String(trashCount))}</span>`;
    trashButton.title = text().trashDrafts;
    trashButton.setAttribute('aria-label', `${text().trashDrafts}: ${trashCount}`);
  }

  if (addPartButton) {
    addPartButton.hidden = !hasActiveStory();
    addPartButton.textContent = isDraftTrashMode ? text().workspace : text().addPart;
    addPartButton.title = isDraftTrashMode ? text().workspace : text().addPart;
    addPartButton.setAttribute('aria-label', isDraftTrashMode ? text().workspace : text().addPart);
    addPartButton.onclick = isDraftTrashMode ? () => setDraftTrashMode(false) : addPart;
  }
}

function openTrashBulkActionPanel(action = 'restore', anchor = null) {
  chapterTrashDrafts = normalizeTrashDrafts(chapterTrashDrafts);
  normalizeTrashDraftSelection();
  const panel = document.getElementById('draftDetailsPanel');
  const batchIndexes = trashDraftBatchIndexes();
  if (!panel || !batchIndexes.length) return;

  const copy = text();
  const isRestore = action === 'restore';
  const actionLabel = isRestore ? copy.restoreDrafts : copy.permanentlyDeleteDrafts;
  const buttonLabel = isRestore ? copy.restoreDraft : copy.permanentlyDeleteDraft;
  const clickHandler = isRestore ? 'restoreTrashDraftBatchFromPanel()' : 'permanentlyDeleteTrashDraftBatchFromPanel()';
  const actionClass = isRestore ? 'part-save-btn trash-restore-action-btn' : 'part-delete-btn';

  closePartDetailsPanel();
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  activeDraftDetailsIndex = `trash-bulk:${action}`;
  activeFloatingAnchor = anchor;
  panel.classList.add('draft-actions-panel', 'trash-actions-panel', 'trash-bulk-actions-panel');
  panel.innerHTML = `
    <div class="part-details-head">
      <div>
        <span class="part-details-kicker">${escapeHtml(copy.trash)} ${batchIndexes.length}</span>
        <strong>${escapeHtml(actionLabel)}</strong>
      </div>
      <button class="name-panel-close" type="button" onclick="closeDraftActionsPanel()">${CROSS_CLOSE_SVG}</button>
    </div>
    <div class="draft-panel-actions">
      <button class="panel-mini-btn" type="button" onclick="closeDraftActionsPanel()">${escapeHtml(copy.storyInfoCancel)}</button>
      <button class="${actionClass}" type="button" onclick="${clickHandler}">${escapeHtml(buttonLabel)}</button>
    </div>`;

  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
}

function restoreEditorAfterTrashMode() {
  const returnState = trashReturnEditorState;
  if (returnState?.mode === 'draft' && chapterDrafts[returnState.curDraft]) {
    activeEditorMode = 'draft';
    curDraft = returnState.curDraft;
  } else if (returnState?.mode === 'chapter' && chapters[returnState.curChap]) {
    activeEditorMode = 'chapter';
    curChap = returnState.curChap;
  } else if (chapterDrafts.length) {
    activeEditorMode = 'draft';
    curDraft = Math.min(Math.max(curDraft, 0), chapterDrafts.length - 1);
  } else {
    activeEditorMode = 'chapter';
    curChap = chapters.length ? Math.min(Math.max(curChap, 0), chapters.length - 1) : 0;
  }
  curTrashDraft = chapterTrashDrafts.length ? Math.min(Math.max(curTrashDraft, 0), chapterTrashDrafts.length - 1) : -1;
  trashReturnEditorState = null;
}

function setDraftTrashMode(enabled = true) {
  if (enabled && !chapterTrashDrafts.length) {
    isDraftTrashMode = false;
    showMiniReminder(text().trashEmpty);
  } else {
    isDraftTrashMode = Boolean(enabled);
  }
  if (isDraftTrashMode) {
    trashReturnEditorState = activeEditorMode === 'trash'
      ? trashReturnEditorState
      : { mode: activeEditorMode, curChap, curDraft };
    activeEditorMode = 'trash';
    curTrashDraft = chapterTrashDrafts.length - 1;
    isChapterEditUnlocked = false;
    activeChapterEditKey = null;
    isEditingChapterTitle = false;
    if (isFocus && typeof toggleFocus === 'function') toggleFocus();
  } else if (activeEditorMode === 'trash') {
    restoreEditorAfterTrashMode();
  }
  closeDraftActionsPanel();
  closePartDetailsPanel();
  closeChapterDetailsPanel();
  clearSidebarSelections(false);
  if (!isDraftTrashMode) clearTrashDraftSelection(false);
  renderChapters();
  loadEditor();
  updateChapterStatus();
}

function renderDrafts() {
  const draftBox = document.getElementById('draftBox');
  if (!draftBox) return;
  draftBox.classList.remove('trash-draft-box');
  if (!hasActiveStory()) {
    selectedDraftIndexes.clear();
    lastSelectedDraftIndex = null;
    draftBox.hidden = true;
    draftBox.innerHTML = '';
    updateSidebarScrollThumb('draft', false);
    return;
  }

  chapterDrafts = normalizeDrafts(chapterDrafts);
  normalizeDraftSelection();
  if (!chapterDrafts.length) {
    selectedDraftIndexes.clear();
    lastSelectedDraftIndex = null;
    setDraftBoxSaveIndicator.state = 'idle';
    clearTimeout(setDraftBoxSaveIndicator.timer);
    draftBox.innerHTML = '';
    draftBox.hidden = true;
    updateSidebarScrollThumb('draft', false);
    return;
  }

  draftBox.hidden = false;
  const selectedDraftCount = selectedDraftIndexes.size;
  const draftCountLabel = selectedDraftCount ? `${selectedDraftCount}/${chapterDrafts.length}` : chapterDrafts.length;
  const deleteDraftsLabel = selectedDraftCount ? text().deleteSelectedDrafts : text().deleteAllDrafts;
  const draftDeleteIndexes = selectedDraftCount
    ? Array.from(selectedDraftIndexes)
    : chapterDrafts.map((_, index) => index);
  const canDeleteDraftBatch = canDeleteDraftIndexes(draftDeleteIndexes);
  const draftDeleteTitle = canDeleteDraftBatch ? deleteDraftsLabel : text().draftDeleteLastDocumentBlocked;
  draftBox.innerHTML = `
    <div class="draft-box-title ${selectedDraftCount ? 'has-draft-selection' : ''}" id="draftBoxTitle">
      <span class="draft-title-label"><span class="draft-save-dot" aria-hidden="true"></span>${escapeHtml(text().drafts)}</span>
      <span class="draft-title-actions">
        <button class="draft-title-delete-btn" type="button" ${canDeleteDraftBatch ? '' : 'disabled'}
          onclick="event.stopPropagation(); openDraftBulkDeletePanel(this)"
          title="${escapeHtml(draftDeleteTitle)}" aria-label="${escapeHtml(draftDeleteTitle)}">
          ${DRAFT_DELETE_SVG}
        </button>
        <span class="draft-count-pill ${selectedDraftCount ? 'is-selecting' : ''}">${escapeHtml(String(draftCountLabel))}</span>
      </span>
    </div>
    ${chapterDrafts.map((draft, index) => `
      <div class="chap-item draft-item ${isDraftActive() && index === curDraft ? 'active' : ''} ${selectedDraftIndexes.has(index) ? 'is-selected' : ''}"
        data-editor-document="draft" data-editor-document-index="${index}"
        onclick="handleDraftItemClick(event, ${index})" aria-selected="${selectedDraftIndexes.has(index)}">
        <div class="chap-title-row">
            <span class="chap-file-icon draft-icon">D${index + 1}</span>
            <div class="chap-item-main">
              <span class="chap-title">${escapeHtml(draft.title || `${text().draftPrefix} ${index + 1}`)}</span>
              <span class="cn">${chapterWordTotal(draft, index)} ${escapeHtml(text().words)}</span>
            </div>
          </div>
        <button class="chapter-menu-btn" type="button" onclick="event.stopPropagation(); openDraftActionsPanel(${index}, this)"
          title="${escapeHtml(text().draftActions)}" aria-label="${escapeHtml(text().draftActions)}">
          ${lmIcon("kebab")}
        </button>
      </div>`).join('')}`;
  applyDraftBoxSaveIndicatorState();
  syncSidebarScrollThumbs();
}

function renderTrashDrafts() {
  const draftBox = document.getElementById('draftBox');
  if (!draftBox) return;

  chapterTrashDrafts = normalizeTrashDrafts(chapterTrashDrafts);
  normalizeTrashDraftSelection();
  draftBox.hidden = false;
  draftBox.classList.add('trash-draft-box');
  const selectedCount = selectedTrashDraftIndexes.size;
  const countLabel = selectedCount ? `${selectedCount}/${chapterTrashDrafts.length}` : chapterTrashDrafts.length;
  const restoreLabel = selectedCount ? text().restoreDrafts : text().restoreAllDrafts;
  const deleteLabel = selectedCount ? text().permanentlyDeleteDrafts : text().permanentlyDeleteDrafts;

  draftBox.innerHTML = `
    <div class="draft-box-title trash-box-title ${selectedCount ? 'has-draft-selection' : ''}" id="trashDraftBoxTitle">
      <span class="draft-title-label"><span class="draft-save-dot" aria-hidden="true"></span>${escapeHtml(text().trashDrafts)}</span>
      <span class="draft-title-actions">
        <button class="draft-title-delete-btn trash-title-action-btn trash-title-restore-btn" type="button" ${chapterTrashDrafts.length ? '' : 'disabled'}
          onclick="event.stopPropagation(); openTrashBulkActionPanel('restore', this)"
          title="${escapeHtml(restoreLabel)}" aria-label="${escapeHtml(restoreLabel)}">
          ${RESTORE_DRAFT_SVG}
        </button>
        <button class="draft-title-delete-btn trash-title-action-btn" type="button" ${chapterTrashDrafts.length ? '' : 'disabled'}
          onclick="event.stopPropagation(); openTrashBulkActionPanel('delete', this)"
          title="${escapeHtml(deleteLabel)}" aria-label="${escapeHtml(deleteLabel)}">
          ${DRAFT_DELETE_SVG}
        </button>
        <span class="draft-count-pill ${selectedCount ? 'is-selecting' : ''}">${escapeHtml(String(countLabel))}</span>
      </span>
    </div>
    ${chapterTrashDrafts.length
      ? chapterTrashDrafts.map((draft, index) => `
        <div class="chap-item draft-item trash-draft-item ${isTrashDraftActive() && index === curTrashDraft ? 'active' : ''} ${selectedTrashDraftIndexes.has(index) ? 'is-selected' : ''}"
          onclick="handleTrashDraftItemClick(event, ${index})" aria-selected="${selectedTrashDraftIndexes.has(index)}">
          <div class="chap-title-row">
            <span class="chap-file-icon draft-icon">T${index + 1}</span>
            <div class="chap-item-main">
              <span class="chap-title">${escapeHtml(draft.title || `${text().draftPrefix} ${index + 1}`)}</span>
              <span class="cn">${chapterWordTotal(draft, index)} ${escapeHtml(text().words)}</span>
            </div>
          </div>
          <button class="chapter-menu-btn" type="button" onclick="event.stopPropagation(); openTrashDraftActionsPanel(${index}, this)"
            title="${escapeHtml(text().trashActions)}" aria-label="${escapeHtml(text().trashActions)}">
            ${lmIcon("kebab")}
          </button>
        </div>`).join('')
      : `<div class="part-empty">${escapeHtml(text().trashEmpty)}</div>`}`;
  syncSidebarScrollThumbs();
}

function applyDraftBoxSaveIndicatorState() {
  const draftTitle = document.getElementById('draftBoxTitle');
  if (!draftTitle) return;
  const state = setDraftBoxSaveIndicator.state || 'idle';

  draftTitle.classList.remove('is-draft-saving', 'is-draft-saved');
  if (state === 'idle') return;

  draftTitle.classList.add(state === 'saved' ? 'is-draft-saved' : 'is-draft-saving');
}

function setDraftBoxSaveIndicator(state = 'busy') {
  clearTimeout(setDraftBoxSaveIndicator.timer);
  if (!chapterDrafts.length) {
    setDraftBoxSaveIndicator.state = 'idle';
    applyDraftBoxSaveIndicatorState();
    return;
  }

  setDraftBoxSaveIndicator.state = state;
  applyDraftBoxSaveIndicatorState();

  if (state === 'saved') {
    setDraftBoxSaveIndicator.timer = setTimeout(() => {
      setDraftBoxSaveIndicator.state = 'idle';
      applyDraftBoxSaveIndicatorState();
      if (!chapterDrafts.length) renderDrafts();
    }, 1800);
  }
}

function sidebarScrollTarget(kind = 'chapters') {
  if (kind === 'draft') return document.getElementById('draftBox');
  if (kind === 'raw') return document.getElementById('rawChapterList');
  return document.getElementById('chapter-list');
}

const CHAPTER_PANEL_MIN_LIST_HEIGHT = lmEditorAdvancedNumber('sidebarMinHeight', 160);
const DRAFT_COMPACT_VISIBLE_ITEMS = lmEditorAdvancedNumber('draftVisibleItems', 2.5);
const DRAFT_COMPACT_MIN_ITEMS = lmEditorAdvancedNumber('draftCompactMinimum', 3);
const DRAFT_COMPACT_FALLBACK_HEIGHT = lmEditorAdvancedNumber('draftFallbackHeight', 190);

function sidebarScrollKindKey(kind = 'chapters') {
  return kind === 'draft' || kind === 'raw' ? kind : 'chapters';
}

function sidebarScrollThumbId(kind = 'chapters') {
  const key = sidebarScrollKindKey(kind);
  if (key === 'draft') return 'draft-box-scroll-thumb';
  if (key === 'raw') return 'raw-chapter-scroll-thumb';
  return 'chapter-list-scroll-thumb';
}

function sidebarScrollThumbClass(kind = 'chapters') {
  const key = sidebarScrollKindKey(kind);
  if (key === 'draft') return 'draft-box-scroll-thumb';
  if (key === 'raw') return 'raw-chapter-scroll-thumb';
  return 'chapter-list-scroll-thumb';
}

function ensureSidebarScrollThumb(kind = 'chapters') {
  const panel = document.getElementById('chapter-panel');
  if (!panel) return null;
  const key = sidebarScrollKindKey(kind);
  const thumbId = sidebarScrollThumbId(key);
  let thumb = document.getElementById(thumbId);
  if (!thumb) {
    thumb = document.createElement('div');
    thumb.id = thumbId;
    thumb.className = `sidebar-scroll-thumb ${sidebarScrollThumbClass(key)}`;
    thumb.hidden = true;
    thumb.setAttribute('aria-hidden', 'true');
    panel.appendChild(thumb);
  }
  if (thumb.dataset.sidebarThumbReady !== 'true') {
    thumb.dataset.sidebarThumbReady = 'true';
    thumb.addEventListener('pointerdown', event => startSidebarScrollThumbDrag(key, event));
    thumb.addEventListener('pointerenter', () => setSidebarScrollbarHover(key, true));
    thumb.addEventListener('pointerleave', () => clearSidebarScrollbarHover(key));
  }
  return thumb;
}

function sidebarScrollMetrics(kind = 'chapters') {
  const key = sidebarScrollKindKey(kind);
  const panel = document.getElementById('chapter-panel');
  const thumb = ensureSidebarScrollThumb(key);
  const target = sidebarScrollTarget(key);
  if (!panel || !thumb || !target) return null;

  const targetStyle = window.getComputedStyle(target);
  const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
  const targetVisible = !target.hidden && targetStyle.display !== 'none' && target.clientHeight > 0;
  const isScrollable = targetVisible && maxScroll > 2;
  if (!isScrollable) {
    return { key, panel, thumb, target, maxScroll, targetVisible, isScrollable };
  }

  const panelRect = panel.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const trackPadding = 12;
  const trackTop = targetRect.top - panelRect.top + trackPadding;
  const trackHeight = Math.max(34, targetRect.height - trackPadding * 2);
  const thumbHeight = Math.min(trackHeight, Math.max(30, (target.clientHeight / target.scrollHeight) * trackHeight));
  const scrollableTrack = Math.max(1, trackHeight - thumbHeight);
  const thumbRightOffset = key === 'draft' ? 2.5 : -1;
  const thumbRight = Math.max(6, panelRect.right - targetRect.right + thumbRightOffset);

  return {
    key,
    panel,
    thumb,
    target,
    maxScroll,
    targetVisible,
    isScrollable,
    panelRect,
    targetRect,
    trackTop,
    trackHeight,
    thumbHeight,
    scrollableTrack,
    thumbRight
  };
}

function bindSidebarScrollHoverTarget(kind = 'chapters') {
  const key = sidebarScrollKindKey(kind);
  const target = sidebarScrollTarget(key);
  if (!target || target.dataset.sidebarScrollHoverReady === key) return;
  target.dataset.sidebarScrollHoverReady = key;
  target.addEventListener('pointermove', event => handleSidebarScrollbarHover(key, event), { passive: true });
  target.addEventListener('pointerleave', () => clearSidebarScrollbarHover(key));
}

function setSidebarScrollbarHover(kind = 'chapters', isHovered = false) {
  const key = sidebarScrollKindKey(kind);
  const previousKind = sidebarScrollHoverKind;
  sidebarScrollHoverKind = isHovered ? key : (previousKind === key ? '' : previousKind);
  sidebarScrollTarget(key)?.classList.toggle('is-scrollbar-hovered', sidebarScrollHoverKind === key);
  if (previousKind && previousKind !== sidebarScrollHoverKind) {
    sidebarScrollTarget(previousKind)?.classList.remove('is-scrollbar-hovered');
    updateSidebarScrollThumb(previousKind, false);
  }
  updateSidebarScrollThumb(key, sidebarScrollTarget(key)?.classList.contains('is-scrolling'));
}

function handleSidebarScrollbarHover(kind = 'chapters', event) {
  const key = sidebarScrollKindKey(kind);
  const metrics = sidebarScrollMetrics(key);
  if (!metrics || !metrics.isScrollable) {
    setSidebarScrollbarHover(key, false);
    return;
  }

  const hoverWidth = 18;
  const hoverBleed = 8;
  const isInsideY = event.clientY >= metrics.targetRect.top && event.clientY <= metrics.targetRect.bottom;
  const isNearScrollbar =
    event.clientX >= metrics.targetRect.right - hoverWidth &&
    event.clientX <= metrics.targetRect.right + hoverBleed;
  setSidebarScrollbarHover(key, isInsideY && isNearScrollbar);
}

function clearSidebarScrollbarHover(kind = 'chapters') {
  setSidebarScrollbarHover(kind, false);
}

function startSidebarScrollThumbDrag(kind = 'chapters', event) {
  const key = sidebarScrollKindKey(kind);
  const metrics = sidebarScrollMetrics(key);
  if (!metrics || !metrics.isScrollable) return;

  event.preventDefault();
  event.stopPropagation();
  clearTimeout(sidebarScrollHideTimers[key]);
  sidebarScrollThumbDrag = {
    kind: key,
    pointerId: event.pointerId,
    startY: event.clientY,
    startScrollTop: metrics.target.scrollTop,
    maxScroll: metrics.maxScroll,
    scrollableTrack: metrics.scrollableTrack
  };
  sidebarScrollHoverKind = key;
  metrics.target.classList.add('is-scrolling');
  metrics.target.classList.add('is-scrollbar-hovered');
  metrics.thumb.classList.add('is-dragging');
  metrics.thumb.setPointerCapture?.(event.pointerId);
  updateSidebarScrollThumb(key, true);
}

function handleSidebarScrollThumbDrag(event) {
  const drag = sidebarScrollThumbDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;

  const target = sidebarScrollTarget(drag.kind);
  if (!target) return;

  event.preventDefault();
  const deltaY = event.clientY - drag.startY;
  const nextScrollTop = drag.startScrollTop + (deltaY / drag.scrollableTrack) * drag.maxScroll;
  target.scrollTop = clampNumber(nextScrollTop, 0, drag.maxScroll);
  updateSidebarScrollThumb(drag.kind, true);
}

function endSidebarScrollThumbDrag(event) {
  const drag = sidebarScrollThumbDrag;
  if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;

  const target = sidebarScrollTarget(drag.kind);
  const thumb = document.getElementById(sidebarScrollThumbId(drag.kind));
  thumb?.releasePointerCapture?.(drag.pointerId);
  thumb?.classList.remove('is-dragging');
  sidebarScrollThumbDrag = null;
  sidebarScrollHoverKind = '';
  target?.classList.remove('is-scrollbar-hovered');
  clearTimeout(sidebarScrollHideTimers[drag.kind]);
  if (target) {
    sidebarScrollHideTimers[drag.kind] = setTimeout(() => {
      target.classList.remove('is-scrolling');
      updateSidebarScrollThumb(drag.kind, false);
    }, 650);
  } else {
    updateSidebarScrollThumb(drag.kind, false);
  }
}

function updateSidebarScrollThumb(kind = 'chapters', visible = false) {
  const key = sidebarScrollKindKey(kind);
  const thumb = ensureSidebarScrollThumb(key);
  const metrics = sidebarScrollMetrics(key);
  if (!thumb) return;
  if (!metrics || !metrics.isScrollable) {
    thumb.hidden = true;
    thumb.classList.remove('is-visible', 'is-dragging');
    return;
  }

  const shouldShow = Boolean(
    (visible || sidebarScrollHoverKind === key || sidebarScrollThumbDrag?.kind === key) &&
    metrics.isScrollable
  );
  thumb.hidden = !shouldShow;
  thumb.classList.toggle('is-visible', shouldShow);
  if (!shouldShow) return;

  const thumbTop = metrics.trackTop + (metrics.target.scrollTop / metrics.maxScroll) * metrics.scrollableTrack;

  thumb.style.top = `${thumbTop}px`;
  thumb.style.right = `${metrics.thumbRight}px`;
  thumb.style.height = `${metrics.thumbHeight}px`;
}

function handleSidebarScrollReveal(kind = 'chapters') {
  const key = sidebarScrollKindKey(kind);
  const target = sidebarScrollTarget(key);
  if (!target) return;
  target.classList.add('is-scrolling');
  updateSidebarScrollThumb(key, true);
  clearTimeout(sidebarScrollHideTimers[key]);
  sidebarScrollHideTimers[key] = setTimeout(() => {
    target.classList.remove('is-scrolling');
    updateSidebarScrollThumb(key, false);
  }, 850);
}

function syncSidebarScrollThumbs() {
  requestAnimationFrame(() => {
    syncChapterPanelLayoutMetrics();
    bindSidebarScrollHoverTarget('draft');
    bindSidebarScrollHoverTarget('chapters');
    bindSidebarScrollHoverTarget('raw');
    updateSidebarScrollThumb('draft', false);
    updateSidebarScrollThumb('chapters', false);
    updateSidebarScrollThumb('raw', false);
  });
}

function chapterPanelOuterHeight(element) {
  if (!element || element.hidden) return 0;
  const style = window.getComputedStyle(element);
  return element.getBoundingClientRect().height +
    (parseFloat(style.marginTop) || 0) +
    (parseFloat(style.marginBottom) || 0);
}

function isExpandedSidebarListScrollable() {
  const panel = document.getElementById('chapter-panel');
  if (!panel?.classList.contains('is-sidebar-list-expanded')) return false;
  return [document.getElementById('chapter-list'), document.getElementById('rawChapterList')]
    .some(target => {
      if (!target || target.hidden) return false;
      const style = window.getComputedStyle(target);
      if (style.display === 'none' || style.visibility === 'hidden' || target.clientHeight <= 0) return false;
      return target.scrollHeight - target.clientHeight > 2;
    });
}

function draftBoxFullOuterHeight(draftBox) {
  if (!draftBox || draftBox.hidden) return 0;
  const style = window.getComputedStyle(draftBox);
  if (isExpandedSidebarListScrollable()) {
    return draftBox.getBoundingClientRect().height +
      (parseFloat(style.marginTop) || 0) +
      (parseFloat(style.marginBottom) || 0);
  }
  const borderHeight =
    (parseFloat(style.borderTopWidth) || 0) +
    (parseFloat(style.borderBottomWidth) || 0);
  return draftBox.scrollHeight + borderHeight +
    (parseFloat(style.marginTop) || 0) +
    (parseFloat(style.marginBottom) || 0);
}

function hasChapterPanelListContent() {
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  return Boolean(manifest.parts.length || chapters.length);
}

function shouldConstrainChapterPanelLists() {
  if (!hasActiveStory() || !chapterDrafts.length || !hasChapterPanelListContent()) return false;

  const panel = document.getElementById('chapter-panel');
  const draftBox = document.getElementById('draftBox');
  const partsHeading = document.getElementById('partsHeading');
  const rawChapterSection = document.getElementById('rawChapterSection');
  const storySummary = document.getElementById('story-summary');
  const draftActionRow = document.querySelector('.draft-action-row');
  const chapterActionsBottom = document.querySelector('.chapter-actions-bottom');
  if (!panel || !draftBox || draftBox.hidden || !partsHeading || partsHeading.hidden) return false;

  const fixedHeight =
    chapterPanelOuterHeight(storySummary) +
    chapterPanelOuterHeight(draftActionRow) +
    draftBoxFullOuterHeight(draftBox) +
    chapterPanelOuterHeight(partsHeading) +
    chapterPanelOuterHeight(rawChapterSection) +
    chapterPanelOuterHeight(chapterActionsBottom);
  return panel.clientHeight - fixedHeight < CHAPTER_PANEL_MIN_LIST_HEIGHT;
}

function syncChapterPanelLayoutMetrics() {
  const panel = document.getElementById('chapter-panel');
  const draftBox = document.getElementById('draftBox');
  if (!panel || !draftBox || draftBox.hidden) {
    panel?.style.removeProperty('--draft-compact-height');
    return;
  }

  const draftTitle = document.getElementById('draftBoxTitle');
  const draftItem = draftBox.querySelector('.draft-item');
  if (!draftTitle || !draftItem) {
    panel.style.removeProperty('--draft-compact-height');
    return;
  }
  if (chapterDrafts.length < DRAFT_COMPACT_MIN_ITEMS) {
    panel.style.removeProperty('--draft-compact-height');
    return;
  }

  const draftBoxStyle = window.getComputedStyle(draftBox);
  const draftBoxChrome =
    (parseFloat(draftBoxStyle.paddingTop) || 0) +
    (parseFloat(draftBoxStyle.paddingBottom) || 0) +
    (parseFloat(draftBoxStyle.borderTopWidth) || 0) +
    (parseFloat(draftBoxStyle.borderBottomWidth) || 0);
  const measuredCompactHeight = Math.ceil(
    draftBoxChrome +
    chapterPanelOuterHeight(draftTitle) +
    chapterPanelOuterHeight(draftItem) * DRAFT_COMPACT_VISIBLE_ITEMS
  );
  const rootCompactHeight = parseFloat(
    window.getComputedStyle(document.documentElement).getPropertyValue('--draft-compact-height')
  );
  const compactHeight = rootCompactHeight > 0
    ? rootCompactHeight
    : measuredCompactHeight || DRAFT_COMPACT_FALLBACK_HEIGHT;
  panel.style.setProperty('--draft-compact-height', `${compactHeight}px`);
}

function applyChapterPanelOverflowClasses() {
  const panel = document.getElementById('chapter-panel');
  const chapterList = document.getElementById('chapter-list');
  if (!panel || !chapterList) return;

  syncChapterPanelLayoutMetrics();
  const isConstrained = chapterListOverflowMode !== 'normal' || isPartsListCollapsedByRaw || isPartsListForceExpanded;
  const isCollapsed = !isPartsListForceExpanded && (chapterListOverflowMode === 'collapsed' || isPartsListCollapsedByRaw);
  const rawSection = document.getElementById('rawChapterSection');
  const isPartsExpanded = !isCollapsed && (chapterListOverflowMode === 'expanded' || isPartsListForceExpanded);
  const isRawExpanded = Boolean(rawSection && !rawSection.hidden && rawSection.classList.contains('is-expanded'));
  const isExpandedAfterDraftOverflow = isPartsExpanded || isRawExpanded;
  const shouldCompactDraftBox = isExpandedAfterDraftOverflow && chapterDrafts.length >= DRAFT_COMPACT_MIN_ITEMS;
  panel.classList.toggle('is-chapter-list-constrained', isConstrained);
  panel.classList.toggle('is-chapter-list-collapsed', isCollapsed);
  panel.classList.toggle('is-chapter-list-expanded', isPartsExpanded);
  panel.classList.toggle('is-raw-list-expanded', isRawExpanded);
  panel.classList.toggle('is-sidebar-list-expanded', isExpandedAfterDraftOverflow);
  panel.classList.toggle('is-draft-box-compact', shouldCompactDraftBox);
  chapterList.hidden = isCollapsed;
  panel.classList.toggle('has-scrollable-sidebar-list', isExpandedSidebarListScrollable());
}

function scheduleChapterPanelOverflowCheck() {
  cancelAnimationFrame(chapterPanelOverflowRaf);
  chapterPanelOverflowRaf = requestAnimationFrame(() => {
    chapterPanelOverflowRaf = null;
    if (isPartsListForceExpanded || isPartsListCollapsedByRaw) {
      applyChapterPanelOverflowClasses();
      return;
    }
    const shouldConstrain = shouldConstrainChapterPanelLists();
    if (!shouldConstrain && chapterListOverflowMode !== 'normal') {
      chapterListOverflowMode = 'normal';
      renderChapters();
      return;
    }
    if (shouldConstrain && chapterListOverflowMode === 'normal') {
      chapterListOverflowMode = 'collapsed';
      renderChapters();
      return;
    }
    applyChapterPanelOverflowClasses();
  });
}

function toggleChapterListOverflowPanel() {
  const isCollapsed = !isPartsListForceExpanded && (chapterListOverflowMode === 'collapsed' || isPartsListCollapsedByRaw);
  if (chapterListOverflowMode === 'normal' && !isPartsListCollapsedByRaw && !isPartsListForceExpanded) return;
  if (isCollapsed) {
    isPartsListCollapsedByRaw = false;
    isPartsListForceExpanded = true;
    chapterListOverflowMode = 'expanded';
    isRawChapterSectionExpanded = false;
  } else {
    isPartsListForceExpanded = false;
    isPartsListCollapsedByRaw = true;
    if (chapterListOverflowMode !== 'normal') {
      chapterListOverflowMode = 'collapsed';
    }
  }
  renderChapters();
}

function toggleRawChapterExpansion() {
  const willExpandRawChapters = !isRawChapterSectionExpanded;
  isRawChapterSectionExpanded = willExpandRawChapters;
  if (willExpandRawChapters) {
    expandedPartIndex = -1;
    isPartsListCollapsedByRaw = true;
    isPartsListForceExpanded = false;
  }
  renderChapters();
}

function handleRawChapterToggleKeydown(event) {
  if (event.target !== event.currentTarget) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  toggleRawChapterExpansion();
}

function renderChapterPanelHeading(partsHeading, label) {
  if (!partsHeading) return;
  const isConstrained = chapterListOverflowMode !== 'normal' || isPartsListCollapsedByRaw || isPartsListForceExpanded;
  const isCollapsed = !isPartsListForceExpanded && (chapterListOverflowMode === 'collapsed' || isPartsListCollapsedByRaw);
  partsHeading.classList.toggle('is-collapse-toggle', isConstrained);
  if (!isConstrained) {
    partsHeading.textContent = label;
    partsHeading.removeAttribute('title');
    return;
  }

  partsHeading.title = isCollapsed ? `Show ${label}` : `Hide ${label}`;
  partsHeading.innerHTML = `
    <button class="parts-collapse-toggle-btn" type="button" onclick="toggleChapterListOverflowPanel()"
      aria-expanded="${!isCollapsed}">
      <span class="parts-collapse-label">${escapeHtml(label)}</span>
      ${lmChevronSpan(isCollapsed ? 'right' : 'down')}
    </button>`;
}

function renderRawChapterSection(rawChapterSection, flatChapterItems = [], copy = text()) {
  if (!rawChapterSection) return;
  const hasRawChapters = flatChapterItems.length > 0;
  rawChapterSection.hidden = !hasRawChapters;
  rawChapterSection.classList.toggle('is-expanded', hasRawChapters && isRawChapterSectionExpanded);
  rawChapterSection.classList.toggle('is-collapsed', hasRawChapters && !isRawChapterSectionExpanded);
  if (!hasRawChapters) {
    rawChapterSection.classList.remove('has-chapter-selection', 'is-panel-saving', 'is-panel-saved');
    rawChapterSection.innerHTML = '';
    updateSidebarScrollThumb('raw', false);
    return;
  }
  const isExpanded = isRawChapterSectionExpanded;
  const selectedRawCount = selectedChapterScope === 'raw'
    ? flatChapterItems.filter(({ index }) => selectedChapterIndexes.has(index)).length
    : 0;
  rawChapterSection.classList.toggle('has-chapter-selection', selectedRawCount > 0);

  rawChapterSection.innerHTML = `
    <div class="parts-collapse-toggle-btn raw-chapters-toggle-btn" role="button" tabindex="0"
      onclick="toggleRawChapterExpansion()" onkeydown="handleRawChapterToggleKeydown(event)"
      aria-expanded="${isExpanded}">
      <span class="parts-collapse-label">${escapeHtml(copy.chapters)}</span>
      <button class="part-menu-btn chapter-to-draft-btn raw-chapter-to-draft-btn" type="button"
        onclick="event.stopPropagation(); openChapterRecentToDraftPanel('raw', -1, this)"
        title="${escapeHtml(copy.moveChaptersToDraft)}" aria-label="${escapeHtml(copy.moveChaptersToDraft)}">
        ${CHAPTER_TO_DRAFT_SVG}
      </button>
      ${lmChevronSpan(isExpanded ? 'down' : 'right')}
    </div>
    <div class="part-children raw-chapter-children raw-chapter-list" id="rawChapterList">
      ${isExpanded ? flatChapterItems.map(({ chapter, index }) => `
        <div class="chap-item ${!isDraftActive() && index === curChap ? 'active' : ''} ${selectedChapterIndexes.has(index) ? 'is-selected' : ''}"
          data-editor-document="chapter" data-editor-document-index="${index}"
          onclick="handleChapterItemClick(event, ${index})" aria-selected="${selectedChapterIndexes.has(index)}">
          <div class="chap-title-row">
            <span class="chap-file-icon">${chapterDisplayNumber(chapter, index)}</span>
            <div class="chap-item-main">
              <span class="chap-title">${escapeHtml(chapterDisplayTitle(chapter, index))}</span>
              <span class="cn">${chapterWordTotal(chapter, index)} ${copy.words}</span>
            </div>
          </div>
          <button class="chapter-menu-btn" type="button" onclick="event.stopPropagation(); openChapterDetailsPanel(${index}, this)"
            title="${escapeHtml(copy.chapterDetails)}" aria-label="${escapeHtml(copy.chapterDetails)}">
            ${lmIcon("kebab")}
          </button>
        </div>`).join('') : ''}
    </div>`;
  document.getElementById('rawChapterList')?.addEventListener('scroll', () => handleSidebarScrollReveal('raw'), { passive: true });
  bindSidebarScrollHoverTarget('raw');
}

function syncWorkspaceTopbarState() {
  const hasStory = hasActiveStory();

  const storyLibraryButton = document.getElementById('storyLibraryBtn');
  const exportButton = document.getElementById('exportBtn');
  if (storyLibraryButton) storyLibraryButton.hidden = !hasStory;
  if (exportButton) exportButton.hidden = !hasStory;

  if (hasStory) return;

  closeStoryLibraryPanel();
  closeStorySummaryMenu();
  closePartDetailsPanel();
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  closeFactComposer();
  closeFactDetailPanel();
  closeCategoryActionPanel();
  closeNamingEntryPanel();
  closeNameDetailPanel();
  setToolDock(false);
  setFindPanel(false);
}

function sidebarSaveHeadingForTarget(target = 'parts') {
  if (target === 'chapters') {
    const rawHeading = document.getElementById('rawChapterSection');
    if (rawHeading && !rawHeading.hidden) return rawHeading;
    return document.getElementById('partsHeading');
  }
  return document.getElementById('partsHeading');
}

function setSidebarSaveIndicator(target = 'parts', state = 'busy') {
  const heading = sidebarSaveHeadingForTarget(target);
  if (!heading) return;

  const timerKey = target === 'chapters' ? 'chaptersTimer' : 'partsTimer';
  clearTimeout(setSidebarSaveIndicator[timerKey]);
  heading.classList.remove('is-panel-saving', 'is-panel-saved');

  if (state === 'idle') return;

  heading.classList.add(state === 'saved' ? 'is-panel-saved' : 'is-panel-saving');
  if (state === 'saved') {
    setSidebarSaveIndicator[timerKey] = setTimeout(() => {
      heading.classList.remove('is-panel-saved');
    }, 1800);
  }
}

function sidebarSaveTargetForChapter(chapterIndex) {
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const chapter = chapters[chapterIndex];
  const partIndex = Number.isInteger(chapter?.partIndex) ? chapter.partIndex : -1;
  return manifest.parts.length && partIndex >= 0 && partIndex < manifest.parts.length
    ? 'parts'
    : 'chapters';
}

function renderChapters() {
  syncWorkspaceTopbarState();
  const chapterList = document.getElementById('chapter-list');
  const storySummary = document.getElementById('story-summary');
  const draftActionRow = document.querySelector('.draft-action-row');
  const partsHeading = document.getElementById('partsHeading');
  const rawChapterSection = document.getElementById('rawChapterSection');
  const chapterActionsBottom = document.querySelector('.chapter-actions-bottom');

  if (!hasActiveStory()) {
    chapterListOverflowMode = 'normal';
    isPartsListCollapsedByRaw = false;
    isPartsListForceExpanded = false;
    isRawChapterSectionExpanded = false;
    isDraftTrashMode = false;
    applyChapterPanelOverflowClasses();
    renderDrafts();
    updateChapterPanelBottomActions();
    if (storySummary) storySummary.hidden = true;
    if (draftActionRow) draftActionRow.hidden = true;
    if (partsHeading) partsHeading.hidden = true;
    if (rawChapterSection) {
      rawChapterSection.hidden = true;
      rawChapterSection.innerHTML = '';
    }
    if (chapterActionsBottom) chapterActionsBottom.hidden = true;
    if (chapterList) chapterList.innerHTML = `<div class="no-story-empty">${escapeHtml(text().noStoryAvailable)}</div>`;
    updateStorySummary();
    syncSidebarScrollThumbs();
    return;
  }

  if (storySummary) storySummary.hidden = false;
  if (draftActionRow) draftActionRow.hidden = false;
  if (partsHeading) partsHeading.hidden = false;
  if (rawChapterSection) {
    rawChapterSection.hidden = true;
    rawChapterSection.innerHTML = '';
  }
  if (chapterActionsBottom) chapterActionsBottom.hidden = false;
  ensureChapters();
  normalizeChapterSelection();
  normalizeTrashDraftSelection();

  if (isDraftTrashMode) {
    selectedDraftIndexes.clear();
    lastSelectedDraftIndex = null;
    selectedChapterIndexes.clear();
    selectedChapterScope = null;
    if (draftActionRow) draftActionRow.hidden = true;
    if (partsHeading) partsHeading.hidden = true;
    if (chapterList) {
      chapterList.hidden = true;
      chapterList.innerHTML = '';
    }
    if (rawChapterSection) {
      rawChapterSection.hidden = true;
      rawChapterSection.innerHTML = '';
    }
    renderTrashDrafts();
    updateChapterPanelBottomActions();
    applyChapterPanelOverflowClasses();
    syncSidebarScrollThumbs();
    return;
  }

  if (chapterList) chapterList.hidden = false;
  renderDrafts();
  updateChapterPanelBottomActions();
  const copy = text();
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const hasParts = manifest.parts.length > 0;
  if (partsHeading) {
    partsHeading.hidden = !hasParts && !chapters.length;
    renderChapterPanelHeading(partsHeading, hasParts ? copy.parts : copy.chapters);
  }
  if (!hasParts) {
    isRawChapterSectionExpanded = false;
    isPartsListCollapsedByRaw = false;
    isPartsListForceExpanded = false;
    renderRawChapterSection(rawChapterSection, [], copy);
    chapterList.innerHTML = chapters.length
      ? chapters.map((chapter, index) => `
          <div class="chap-item ${!isDraftActive() && index === curChap ? 'active' : ''} ${selectedChapterIndexes.has(index) ? 'is-selected' : ''}"
            data-editor-document="chapter" data-editor-document-index="${index}"
            onclick="handleChapterItemClick(event, ${index})" aria-selected="${selectedChapterIndexes.has(index)}">
            <div class="chap-title-row">
                <span class="chap-file-icon">${chapterDisplayNumber(chapter, index)}</span>
                <div class="chap-item-main">
                  <span class="chap-title">${escapeHtml(chapterDisplayTitle(chapter, index))}</span>
                  <span class="cn">${chapterWordTotal(chapter, index)} ${copy.words}</span>
                </div>
              </div>
            <button class="chapter-menu-btn" type="button" onclick="event.stopPropagation(); openChapterDetailsPanel(${index}, this)"
              title="${escapeHtml(copy.chapterDetails)}" aria-label="${escapeHtml(copy.chapterDetails)}">
              ${lmIcon("kebab")}
            </button>
          </div>`)
        .join('')
      : `<div class="part-empty">${escapeHtml(copy.noSavedChapters)}</div>`;
    updateStorySummary();
    applyChapterPanelOverflowClasses();
    scheduleChapterPanelOverflowCheck();
    syncSidebarScrollThumbs();
    return;
  }

  const chaptersByPart = new Map();
  const flatChapterItems = [];

  chapters.forEach((chapter, index) => {
    const partIndex = Number.isInteger(chapter.partIndex) ? chapter.partIndex : -1;
    if (partIndex < 0 || partIndex >= manifest.parts.length) {
      flatChapterItems.push({ chapter, index });
      return;
    }
    if (!chaptersByPart.has(partIndex)) chaptersByPart.set(partIndex, []);
    chaptersByPart.get(partIndex).push({ chapter, index });
  });

  const partSections = manifest.parts.map((part, partIndex) => {
    const isExpanded = partIndex === expandedPartIndex;
    const isActivePart = partIndex === curPart;
    const partChapters = chaptersByPart.get(partIndex) || [];
    const canShowPartChapterToDraft = canConvertPartChaptersToDraft(partIndex);
    const selectedInPartCount = canShowPartChapterToDraft && selectedChapterScope === chapterScopeKey('part', partIndex)
      ? partChapters.filter(({ index }) => selectedChapterIndexes.has(index)).length
      : 0;

    const chapterItems = isExpanded && partChapters.length
      ? partChapters.map(({ chapter, index }, chapterIndex) => `
          <div class="chap-item ${!isDraftActive() && index === curChap ? 'active' : ''} ${selectedChapterIndexes.has(index) ? 'is-selected' : ''}"
            data-editor-document="chapter" data-editor-document-index="${index}"
            onclick="handleChapterItemClick(event, ${index})" aria-selected="${selectedChapterIndexes.has(index)}">
            <div class="chap-title-row">
                <span class="chap-file-icon">${chapterDisplayNumber(chapter, index)}</span>
                <div class="chap-item-main">
                  <span class="chap-title">${escapeHtml(chapterDisplayTitle(chapter, index))}</span>
                  <span class="cn">${chapterWordTotal(chapter, index)} ${copy.words}</span>
                </div>
            </div>
            <button class="chapter-menu-btn" type="button" onclick="event.stopPropagation(); openChapterDetailsPanel(${index}, this)"
              title="${escapeHtml(copy.chapterDetails)}" aria-label="${escapeHtml(copy.chapterDetails)}">
              ${lmIcon("kebab")}
            </button>
          </div>`)
        .join('')
      : isExpanded
        ? `<div class="part-empty">${escapeHtml(copy.noChaptersInPart)}</div>`
        : '';

    return `
      <div class="part-section ${isExpanded ? 'is-expanded' : 'is-collapsed'} ${isActivePart ? 'is-active-part' : ''} ${selectedInPartCount ? 'has-chapter-selection' : ''}">
        <div class="part-header">
          <div class="part-tree-main">
            <button class="part-toggle-btn" type="button" onclick="togglePartExpansion(${partIndex})" aria-expanded="${isExpanded}">
              ${lmChevronSpan(isExpanded ? 'down' : 'right')}
            </button>
            <button class="part-copy part-copy-btn" type="button" onclick="togglePartExpansion(${partIndex})" title="Expand / Collapse">
              <div class="part-title">${escapeHtml(part.title || defaultPartTitle(partIndex))}</div>
              <div class="part-meta">${partChapters.length} ${escapeHtml(copy.chapters)}${part.synopsis ? ' Â· ' + escapeHtml(part.synopsis) : ''}</div>
            </button>
          </div>
          ${partChapters.length && canShowPartChapterToDraft ? `<button class="part-menu-btn chapter-to-draft-btn" type="button"
            onclick="event.stopPropagation(); openChapterRecentToDraftPanel('part', ${partIndex}, this)"
            title="${escapeHtml(copy.moveChaptersToDraft)}" aria-label="${escapeHtml(copy.moveChaptersToDraft)}">
            ${CHAPTER_TO_DRAFT_SVG}
          </button>` : ''}
          <button class="part-menu-btn part-details-menu-btn" type="button" onclick="openPartDetailsPanel(${partIndex}, this)" title="${escapeHtml(copy.partDetails)}" aria-label="${escapeHtml(copy.partDetails)}">
            ${lmIcon("kebab")}
          </button>
        </div>
        <div class="part-children part-chapter-children">${chapterItems}</div>
      </div>`;
  }).join('');

  chapterList.innerHTML = partSections;
  renderRawChapterSection(rawChapterSection, flatChapterItems, copy);
  updateStorySummary();
  applyChapterPanelOverflowClasses();
  scheduleChapterPanelOverflowCheck();
  syncSidebarScrollThumbs();
}

let editorDocumentLoadSequence = 0;
let activeEditorHTMLBuffer = '';
let activeEditorHTMLBufferVersion = 0;
let committedEditorHTMLBufferVersion = 0;
let editorHTMLMemoryCommitTimer = null;
let activeEditorHTMLAnalysisPromise = null;
let activeEditorHTMLBridgePromise = null;
let editorInputBridgeSequence = 0;
let completedEditorInputBridgeSequence = 0;
let persistedEditorInputSequence = 0;
const switchedDocumentSnapshots = new Map();
let switchedDocumentSnapshotSequence = 0;
const EDITOR_READING_WORDS_PER_MINUTE = lmEditorAdvancedNumber('readingWordsPerMinute', 200);
const EDITOR_PROCESSING_WORKER_URL = `assets/pages/story-novel-project-editor/js/editor-processing-worker.js?v=20260813-preserve-empty-lines&readingWpm=${EDITOR_READING_WORDS_PER_MINUTE}`;
const EDITOR_HTML_BRIDGE_WORKER_URL = `assets/pages/story-novel-project-editor/js/editor-html-bridge-worker.js?v=20260813-preserve-empty-lines&readingWpm=${EDITOR_READING_WORDS_PER_MINUTE}&maxWindow=${lmEditorAdvancedNumber('workerWindowMaximum', 40)}`;
let editorWorkerJobSequence = 0;

function editorWorkerNamesPayload() {
  return (namingData?.entries || []).map(entry => ({ id: entry.id, names: namingEntrySearchNames(entry) }));
}

function fallbackEditorWorkerAnalysis(payload = {}) {
  const normalizedHTML = payload.plainTextMode
    ? (payload.rawText?.trim() ? textToEditorHTML(String(payload.rawText).replace(/\r\n?/g, '\n').trimEnd()) : '')
    : String(payload.html || payload.rawHTML || '');
  const textValue = payload.plainTextMode
    ? String(payload.rawText || '').replace(/\r\n?/g, '\n').trimEnd()
    : editorHTMLToText(normalizedHTML);
  const words = countWordsFromText(textValue);
  return {
    normalizedHTML,
    text: textValue,
    stats: {
      words,
      characters: textValue.replace(/\s/g, '').length,
      paragraphs: textValue.split(/\n+/).filter(part => part.trim()).length || (textValue.trim() ? 1 : 0),
      sentences: textValue.split(/[।.!?]+/).filter(sentence => sentence.trim()).length,
      readingTime: Math.max(1, Math.round(words / EDITOR_READING_WORDS_PER_MINUTE))
    },
    nameMatches: []
  };
}

function createEditorWorkerLane({
  cancelPrevious = false,
  workerUrl = EDITOR_PROCESSING_WORKER_URL,
  fallbackHandler = fallbackEditorWorkerAnalysis
} = {}) {
  let worker = null;
  const pending = new Map();
  const responseTimeout = lmEditorAdvancedNumber('workerResponseTimeout', 8000);

  function rejectPending(reason = 'Worker restarted') {
    pending.forEach(({ reject, timeoutId }) => {
      clearTimeout(timeoutId);
      reject(new DOMException(reason, 'AbortError'));
    });
    pending.clear();
  }

  function stop() {
    worker?.terminate();
    worker = null;
  }

  function start() {
    if (worker || typeof Worker !== 'function') return worker;
    worker = new Worker(workerUrl);
    worker.onmessage = event => {
      const message = event.data || {};
      const task = pending.get(message.id);
      if (!task) return;
      pending.delete(message.id);
      clearTimeout(task.timeoutId);
      if (message.ok) task.resolve(message.result);
      else task.reject(new Error(message.error?.message || 'Editor worker task failed'));
    };
    worker.onerror = error => {
      const failure = new Error(error?.message || 'Editor processing worker failed');
      pending.forEach(({ reject, timeoutId }) => {
        clearTimeout(timeoutId);
        reject(failure);
      });
      pending.clear();
      stop();
    };
    return worker;
  }

  return {
    async run(payload = {}, type = 'analyze') {
      if (cancelPrevious && pending.size) {
        rejectPending('Superseded by a newer editor analysis');
        stop();
      }
      const activeWorker = start();
      if (!activeWorker) return fallbackHandler(payload);
      const id = ++editorWorkerJobSequence;
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          const timedOutTask = pending.get(id);
          if (!timedOutTask) return;
          pending.delete(id);
          timedOutTask.reject(new Error(`Editor Worker timed out after ${responseTimeout} ms`));
          rejectPending('Worker restarted after timeout');
          stop();
        }, responseTimeout);
        pending.set(id, { resolve, reject, timeoutId });
        activeWorker.postMessage({ id, type, payload });
      });
    },
    stop() {
      rejectPending('Editor worker stopped');
      stop();
    }
  };
}

const editorSurfaceWorkerLane = createEditorWorkerLane({ cancelPrevious: true });
const editorSnapshotWorkerLane = createEditorWorkerLane({ cancelPrevious: false });
const editorHTMLBridgeWorkerLane = createEditorWorkerLane({
  cancelPrevious: false,
  workerUrl: EDITOR_HTML_BRIDGE_WORKER_URL,
  fallbackHandler: payload => ({
    html: payload.plainTextMode
      ? (String(payload.rawText || '').trim() ? textToEditorHTML(String(payload.rawText).replace(/\r\n?/g, '\n').trimEnd()) : '')
      : String(payload.rawHTML || ''),
    inputSequence: payload.inputSequence,
    capturedAt: payload.capturedAt
  })
});
const VIRTUAL_EDITOR_WORD_THRESHOLD = lmEditorAdvancedNumber('virtualWordThreshold', 3000);
const VIRTUAL_EDITOR_WINDOW_SIZE = lmEditorAdvancedNumber('virtualWindowSize', 25);
let activeVirtualEditorDocument = null;
let virtualEditorScrollFrame = null;
let virtualEditorWindowRequest = 0;
let virtualEditorBeforeInputContext = null;
let virtualEditorMaterializeTimer = null;
let virtualEditorFullAnalysisTimer = null;
let virtualEditorPatchBatchTimer = null;
let virtualEditorPendingPatchBatch = null;
let virtualEditorProgrammaticScrollGuard = 0;
let isExpandingVirtualEditorSelection = false;
let virtualEditorSelectionExpansionPromise = null;
let isVirtualEditorDOMSelectionTransaction = false;
let virtualEditorDOMSelectionTransactionSequence = 0;
const VIRTUAL_EDITOR_PATCH_BATCH_MS = lmEditorAdvancedNumber('patchBatchDelay', 75);
const VIRTUAL_EDITOR_MATERIALIZE_DELAY_MS = lmEditorAdvancedNumber('materializeDelay', 700);
const VIRTUAL_EDITOR_FULL_ANALYSIS_DELAY_MS = lmEditorAdvancedNumber('fullAnalysisDelay', 2200);
const EDITOR_MEMORY_COMMIT_DELAY_MS = lmEditorAdvancedNumber('memoryCommitDelay', 180);
const EDITOR_AUTOSAVE_DELAY_MS = lmEditorAdvancedNumber('autosaveDelay', 1500);
const RESTRICTED_INPUT_IDLE_DELAY_MS = lmEditorAdvancedNumber('restrictedInputIdleDelay', 3000);
const SAVE_BUTTON_TYPING_IDLE_CHECK_MS = lmEditorAdvancedNumber('autosaveInputIdleDelay', 750);
const SAVE_BUTTON_STATE_POLL_MS = 120;
let isRestrictedInputRenderingActive = false;
let restrictedInputIdleTimer = null;
let saveButtonTypingIdleTimer = null;

function activeEditorSaveBaselineHTML() {
  const chapterEditDraft = typeof activeChapterEditDraft === 'function' ? activeChapterEditDraft() : null;
  return chapterEditDraft ? chapterEditDraft.lastAutosavedHTML || '' : lastSavedChapterHTML;
}

function markActiveEditorInputPersisted() {
  persistedEditorInputSequence = editorInputBridgeSequence;
  setSaveButtonSaved(true);
}

function reconcileSaveButtonAfterTyping(inputSequence, documentSequence) {
  if (inputSequence !== editorInputBridgeSequence || documentSequence !== editorDocumentLoadSequence) return;
  if (!isAutoSaveEnabled || !canEditActiveDocument()) return;

  const baselineHTML = activeEditorSaveBaselineHTML();
  const memoryIsCurrent = committedEditorHTMLBufferVersion === activeEditorHTMLBufferVersion;
  const snapshotIsSaved = persistedEditorInputSequence === inputSequence ||
    (memoryIsCurrent && activeEditorHTMLBuffer === baselineHTML);

  // Re-apply the state even when data-save-state already says "saved". This
  // repairs an icon/class that was left visually stale by an earlier async UI
  // callback and also synchronises the focus-mode save button.
  if (snapshotIsSaved) {
    setSaveButtonSaved(true);
    return;
  }

  saveButtonTypingIdleTimer = setTimeout(() => {
    saveButtonTypingIdleTimer = null;
    reconcileSaveButtonAfterTyping(inputSequence, documentSequence);
  }, SAVE_BUTTON_STATE_POLL_MS);
}

function scheduleSaveButtonTypingIdleCheck() {
  clearTimeout(saveButtonTypingIdleTimer);
  const inputSequence = editorInputBridgeSequence;
  const documentSequence = editorDocumentLoadSequence;
  saveButtonTypingIdleTimer = setTimeout(() => {
    saveButtonTypingIdleTimer = null;
    if (
      inputSequence === editorInputBridgeSequence &&
      documentSequence === editorDocumentLoadSequence &&
      isAutoSaveEnabled &&
      canEditActiveDocument()
    ) {
      // This timeout has already fired, so a subsequent input must not cancel
      // this save or its non-cancelling HTML bridge lane. That later input will
      // simply schedule/queue the next autosave generation.
      runAutoSave('typing-idle-750');
    }
    reconcileSaveButtonAfterTyping(inputSequence, documentSequence);
  }, SAVE_BUTTON_TYPING_IDLE_CHECK_MS);
}

function virtualEditorLogicalParagraphs(text) {
  // Every newline is structural editor data. Empty array entries represent
  // user-created blank lines and must survive restricted rendering.
  return String(text || '').replace(/\r\n?/g, '\n').split('\n');
}

function virtualEditorLogicalParagraphIndexForTextOffset(text, offset) {
  const source = String(text || '').replace(/\r\n?/g, '\n');
  const safeOffset = Math.max(0, Math.min(source.length, Number(offset) || 0));
  return Math.max(0, source.slice(0, safeOffset).split('\n').length - 1);
}

function virtualEditorParagraphSeparator() {
  // Configured and manually edited gaps already exist as empty logical lines.
  // Adding the configured gap again here would duplicate or erase formatting.
  return '\n';
}

function captureVirtualEditorGlobalSelection(editor, state) {
  const snapshot = currentEditorHistorySelection(editor);
  if (!snapshot) return null;
  const textValue = editor.textContent || '';
  const endpoint = offset => {
    const localParagraph = virtualEditorLogicalParagraphIndexForTextOffset(textValue, offset);
    const paragraphStart = virtualEditorParagraphStartOffset(textValue, localParagraph);
    return {
      paragraph: localParagraph + (state.temporarilyMaterialized ? 0 : state.start),
      offsetInParagraph: Math.max(0, offset - paragraphStart)
    };
  };
  return {
    start: endpoint(snapshot.startTextOffset),
    end: endpoint(snapshot.endTextOffset),
    collapsed: snapshot.collapsed
  };
}

function restoreVirtualEditorGlobalSelection(editor, snapshot) {
  if (!editor || !snapshot) return false;
  const textValue = editor.textContent || '';
  const positionFor = endpoint => {
    const paragraphStart = virtualEditorParagraphStartOffset(textValue, endpoint.paragraph);
    return editorHistoryPositionForTextOffset(editor, paragraphStart + endpoint.offsetInParagraph);
  };
  const start = positionFor(snapshot.start);
  const end = positionFor(snapshot.end);
  if (!start?.node || !end?.node) return false;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  savedEditorRange = range.cloneRange();
  return true;
}

function expandVirtualEditorForSelection(snapshot = null) {
  const state = activeVirtualEditorDocument;
  const editor = document.getElementById('editor');
  if (!state || !editor) return Promise.resolve(false);
  if (state.temporarilyMaterialized) return Promise.resolve(true);
  if (virtualEditorSelectionExpansionPromise) return virtualEditorSelectionExpansionPromise;
  const preserved = snapshot || captureVirtualEditorGlobalSelection(editor, state);
  isExpandingVirtualEditorSelection = true;
  virtualEditorSelectionExpansionPromise = Promise.resolve(temporarilyMaterializeVirtualEditor('selection'))
    .then(materialized => {
      if (materialized && preserved) restoreVirtualEditorGlobalSelection(editor, preserved);
      return materialized;
    })
    .finally(() => {
      isExpandingVirtualEditorSelection = false;
      virtualEditorSelectionExpansionPromise = null;
    });
  return virtualEditorSelectionExpansionPromise;
}

function waitForVirtualEditorFullDOM(editor, state, attempts = 8) {
  return new Promise(resolve => {
    let readyFrames = 0;
    const check = () => {
      const currentState = activeVirtualEditorDocument;
      const expectedLength = Math.max(0, Number(state.fullTextCharacterCount) || 0);
      const renderedLength = String(editor.textContent || '').replace(/\r\n?/g, '\n').length;
      const isReady = Boolean(
        currentState?.key === state.key &&
        currentState.temporarilyMaterialized &&
        renderedLength >= expectedLength
      );
      readyFrames = isReady ? readyFrames + 1 : 0;
      if (readyFrames >= 2 || attempts <= 1) {
        resolve(readyFrames >= 2);
        return;
      }
      attempts -= 1;
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

function handleVirtualEditorClipboardShortcut(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const key = typeof shortcutKey === 'function'
    ? shortcutKey(event)
    : String(event.key || '').toLowerCase();
  if (!['a', 'c', 'x', 'v'].includes(key) || !activeVirtualEditorDocument) return;
  if (activeVirtualEditorDocument.temporarilyMaterialized && !isRestrictedInputRenderingActive) return;
  const editor = document.getElementById('editor');
  if (!editor || (event.target !== editor && !editor.contains(event.target)) || document.activeElement !== editor) return;
  if (key === 'a') {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const state = activeVirtualEditorDocument;
    expandVirtualEditorForSelection().then(async materialized => {
      if (!materialized) return;
      const fullDOMReady = await waitForVirtualEditorFullDOM(editor, state);
      if (!fullDOMReady || activeVirtualEditorDocument?.key !== state.key) return;
      isVirtualEditorDOMSelectionTransaction = true;
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      savedEditorRange = range.cloneRange();
      requestAnimationFrame(() => { isVirtualEditorDOMSelectionTransaction = false; });
    });
    return;
  }
  if (activeVirtualEditorDocument.temporarilyMaterialized) return;
  expandVirtualEditorForSelection();
}

function handleVirtualEditorSelectionExpansion() {
  const state = activeVirtualEditorDocument;
  const editor = document.getElementById('editor');
  const selection = window.getSelection();
  if (!state || !editor || state.temporarilyMaterialized || isExpandingVirtualEditorSelection || !selection?.rangeCount || selection.isCollapsed) return;
  const snapshot = currentEditorHistorySelection(editor);
  if (!snapshot) return;
  const textLength = (editor.textContent || '').length;
  const reachesWindowBoundary = snapshot.startTextOffset <= 0 || snapshot.endTextOffset >= textLength;
  const selectedParagraphs = virtualEditorLogicalParagraphIndexForTextOffset(editor.textContent || '', snapshot.endTextOffset) -
    virtualEditorLogicalParagraphIndexForTextOffset(editor.textContent || '', snapshot.startTextOffset) + 1;
  if (reachesWindowBoundary || selectedParagraphs >= VIRTUAL_EDITOR_WINDOW_SIZE) {
    expandVirtualEditorForSelection(captureVirtualEditorGlobalSelection(editor, state));
  }
}

function virtualEditorParagraphStartOffset(text, paragraphIndex) {
  const source = String(text || '').replace(/\r\n?/g, '\n');
  if (paragraphIndex <= 0) return 0;
  let index = 0;
  let paragraph = 0;
  const separators = /\n/g;
  let match;
  while ((match = separators.exec(source))) {
    paragraph += 1;
    index = match.index + 1;
    if (paragraph >= paragraphIndex) return index;
  }
  return source.length;
}

function virtualEditorTextOffsetViewportTop(editor, textOffset) {
  if (!editor || typeof editorHistoryPositionForTextOffset !== 'function') return null;
  const position = editorHistoryPositionForTextOffset(editor, textOffset, { boundaryAffinity: 'forward' });
  if (!position?.node) return null;
  const range = document.createRange();
  const maxOffset = position.node.nodeType === Node.TEXT_NODE
    ? position.node.nodeValue?.length || 0
    : position.node.childNodes?.length || 0;
  const safeOffset = Math.max(0, Math.min(maxOffset, position.offset || 0));
  range.setStart(position.node, safeOffset);
  if (position.node.nodeType === Node.TEXT_NODE && safeOffset < maxOffset) range.setEnd(position.node, safeOffset + 1);
  else range.collapse(true);
  const rect = range.getClientRects()[0] || range.getBoundingClientRect();
  return Number.isFinite(rect?.top) ? rect.top : null;
}

function createVirtualEditorVisualShield(editor) {
  const wrap = document.getElementById('editor-wrap');
  if (!editor || !wrap) return null;
  wrap.querySelector('.virtual-editor-visual-shield')?.remove();
  const editorRect = editor.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const shield = editor.cloneNode(true);
  shield.removeAttribute('id');
  shield.removeAttribute('contenteditable');
  shield.setAttribute('aria-hidden', 'true');
  shield.classList.remove('is-empty');
  shield.classList.add('virtual-editor-visual-shield');
  shield.style.left = `${editorRect.left - wrapRect.left}px`;
  shield.style.top = `${editorRect.top - wrapRect.top}px`;
  shield.style.width = `${editorRect.width}px`;
  shield.style.height = `${editorRect.height}px`;
  wrap.appendChild(shield);
  shield.scrollTop = editor.scrollTop;
  shield.scrollLeft = editor.scrollLeft;
  return shield;
}

function releaseVirtualEditorVisualShield(shield, editor, anchor, localOffset, preferCaret = false) {
  if (!shield) return;
  requestAnimationFrame(() => {
    // Recheck after fonts/layout and the virtual pseudo-spacers have settled.
    const caretRect = preferCaret && typeof editorCaretRect === 'function' ? editorCaretRect(editor) : null;
    const settledTop = Number.isFinite(caretRect?.top)
      ? caretRect.top
      : virtualEditorTextOffsetViewportTop(editor, localOffset);
    if (Number.isFinite(settledTop) && Number.isFinite(anchor?.top)) {
      editor.scrollTop += settledTop - anchor.top;
    }
    updateEditorScrollThumb(false);
    requestAnimationFrame(() => shield.remove());
  });
}

function virtualEditorSelectionParagraphRange(editor, text, selectionSnapshot = currentEditorHistorySelection(editor)) {
  const paragraphs = virtualEditorLogicalParagraphs(text);
  if (!selectionSnapshot) return { start: 0, end: Math.min(1, paragraphs.length), paragraphCount: paragraphs.length };
  const startLine = virtualEditorLogicalParagraphIndexForTextOffset(text, selectionSnapshot.startTextOffset);
  const adjustedEndOffset = selectionSnapshot.collapsed
    ? selectionSnapshot.endTextOffset
    : Math.max(selectionSnapshot.startTextOffset, selectionSnapshot.endTextOffset - 1);
  const endLine = virtualEditorLogicalParagraphIndexForTextOffset(text, adjustedEndOffset);

  if (!selectionSnapshot.collapsed) {
    return {
      start: Math.max(0, startLine - 2),
      end: Math.min(paragraphs.length, endLine + 3),
      paragraphCount: paragraphs.length
    };
  }

  if (!(paragraphs[startLine] || '').trim()) {
    return {
      start: Math.max(0, startLine - 1),
      end: Math.min(paragraphs.length, startLine + 2),
      paragraphCount: paragraphs.length
    };
  }

  return { start: startLine, end: startLine + 1, paragraphCount: paragraphs.length };
}

function captureVirtualEditorBeforeInputContext(event) {
  const editor = document.getElementById('editor');
  if (!activeVirtualEditorDocument || !editor) {
    virtualEditorBeforeInputContext = null;
    return;
  }
  const textValue = editor.textContent || '';
  const selectionSnapshot = currentEditorHistorySelection(editor);
  const context = virtualEditorSelectionParagraphRange(editor, textValue, selectionSnapshot);
  if (selectionSnapshot?.collapsed) {
    const paragraphs = virtualEditorLogicalParagraphs(textValue);
    const line = virtualEditorLogicalParagraphIndexForTextOffset(textValue, selectionSnapshot.startTextOffset);
    const lineStart = virtualEditorParagraphStartOffset(textValue, line);
    const lineEnd = lineStart + String(paragraphs[line] || '').length;
    if (event?.inputType === 'deleteContentBackward' && selectionSnapshot.startTextOffset === lineStart && line > 0) {
      context.start = Math.min(context.start, line - 1);
    } else if (event?.inputType === 'deleteContentForward' && selectionSnapshot.startTextOffset === lineEnd && line < paragraphs.length - 1) {
      context.end = Math.max(context.end, line + 2);
    }
  }
  virtualEditorBeforeInputContext = context;
}

function virtualEditorPatchPayload(editor, state) {
  const textValue = String(editor?.textContent || '').replace(/\r\n?/g, '\n');
  const paragraphs = virtualEditorLogicalParagraphs(textValue);
  if (state.temporarilyMaterialized) {
    virtualEditorBeforeInputContext = null;
    return {
      start: 0,
      end: state.total,
      paragraphs,
      windowStart: 0
    };
  }
  const before = virtualEditorBeforeInputContext;
  virtualEditorBeforeInputContext = null;

  if (!before) {
    const current = virtualEditorSelectionParagraphRange(editor, textValue);
    return {
      start: state.start + current.start,
      end: state.start + current.end,
      paragraphs: paragraphs.slice(current.start, current.end),
      windowStart: state.start
    };
  }

  const paragraphDelta = paragraphs.length - before.paragraphCount;
  const replacementEnd = Math.max(before.start, Math.min(paragraphs.length, before.end + paragraphDelta));
  return {
    start: state.start + before.start,
    end: state.start + before.end,
    paragraphs: paragraphs.slice(before.start, replacementEnd),
    windowStart: state.start
  };
}

function flushVirtualEditorPatchBatch() {
  clearTimeout(virtualEditorPatchBatchTimer);
  virtualEditorPatchBatchTimer = null;
  const batch = virtualEditorPendingPatchBatch;
  virtualEditorPendingPatchBatch = null;
  if (!batch?.patches?.length) return activeEditorHTMLBridgePromise;

  const bridgeTask = editorHTMLBridgeWorkerLane.run({
    documentKey: batch.documentKey,
    patches: batch.patches,
    windowStart: batch.windowStart,
    windowSize: VIRTUAL_EDITOR_WINDOW_SIZE
  }, 'patch-virtual-batch');

  activeEditorHTMLBridgePromise = bridgeTask
    .then(result => {
      if (
        !result ||
        batch.documentSequence !== editorDocumentLoadSequence ||
        activeVirtualEditorDocument?.key !== batch.documentKey
      ) return null;
      completedEditorInputBridgeSequence = Math.max(completedEditorInputBridgeSequence, batch.inputSequence);
      applyVirtualEditorDeltaResult(result);
      if (batch.inputSequence === editorInputBridgeSequence && !virtualEditorPendingPatchBatch) {
        scheduleVirtualEditorIdleStages();
      }
      return result;
    })
    .catch(error => {
      console.warn('Virtual editor patch batch failed:', error);
      setSaveButtonSaved(false);
      setDefaultSaveStatus();
      return null;
    });
  return activeEditorHTMLBridgePromise;
}

function queueVirtualEditorPatchBatch(editor, state, inputSequence, documentSequence) {
  const patch = virtualEditorPatchPayload(editor, state);
  if (Array.isArray(state.sessionParagraphs)) {
    state.sessionParagraphs.splice(patch.start, patch.end - patch.start, ...patch.paragraphs);
  }
  if (
    !virtualEditorPendingPatchBatch ||
    virtualEditorPendingPatchBatch.documentKey !== state.key ||
    virtualEditorPendingPatchBatch.documentSequence !== documentSequence
  ) {
    flushVirtualEditorPatchBatch();
    virtualEditorPendingPatchBatch = {
      documentKey: state.key,
      documentSequence,
      windowStart: state.start,
      inputSequence,
      patches: []
    };
  }
  const previousPatch = virtualEditorPendingPatchBatch.patches.at(-1);
  if (
    previousPatch &&
    previousPatch.start === patch.start &&
    previousPatch.end === patch.end &&
    previousPatch.windowStart === patch.windowStart
  ) {
    // Repeated keystrokes in the same paragraph only need the newest paragraph snapshot.
    virtualEditorPendingPatchBatch.patches[virtualEditorPendingPatchBatch.patches.length - 1] = patch;
  } else {
    virtualEditorPendingPatchBatch.patches.push(patch);
  }
  virtualEditorPendingPatchBatch.inputSequence = inputSequence;
  virtualEditorPendingPatchBatch.windowStart = state.start;
  clearTimeout(virtualEditorPatchBatchTimer);
  clearTimeout(virtualEditorMaterializeTimer);
  clearTimeout(virtualEditorFullAnalysisTimer);
  virtualEditorPatchBatchTimer = setTimeout(flushVirtualEditorPatchBatch, VIRTUAL_EDITOR_PATCH_BATCH_MS);
}

function virtualEditorDocumentKey(documentItem = activeEditorDocument()) {
  return `${activeEditorStorageKey()}::${documentItem?.id || documentItem?.contentPath || 'document'}`;
}

function editorDocumentWordCountSignature(documentItem) {
  const content = String(documentItem?.content || '');
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${content.length}:${hash >>> 0}`;
}

function verifiedEditorDocumentWordCount(documentItem) {
  if (!documentItem) return 0;
  const signature = editorDocumentWordCountSignature(documentItem);
  if (
    documentItem._wordCountVerifiedSignature === signature &&
    Number.isFinite(documentItem._wordCount)
  ) {
    return Math.max(0, Number(documentItem._wordCount) || 0);
  }

  const words = countWordsFromText(editorHTMLToText(documentItem.content || ''));
  documentItem._wordCount = words;
  documentItem.wordCount = words;
  documentItem._wordCountVerifiedSignature = signature;
  return words;
}

function isLargeVirtualEditorDocument(documentItem = activeEditorDocument()) {
  return verifiedEditorDocumentWordCount(documentItem) >= VIRTUAL_EDITOR_WORD_THRESHOLD;
}

function shouldActivateRestrictedEditorRendering(documentItem = activeEditorDocument()) {
  return isRestrictedInputRenderingActive && isLargeVirtualEditorDocument(documentItem);
}

function isRestrictedInputProducingKey(event) {
  if (!event || event.isComposing || event.keyCode === 229) return true;
  if (event.ctrlKey || event.metaKey) {
    return !event.altKey && ['v', 'x', 'z', 'y'].includes(typeof shortcutKey === 'function'
      ? shortcutKey(event)
      : String(event.key || '').toLowerCase());
  }
  if (event.altKey) return false;
  return String(event.key || '').length === 1 || ['Enter', 'Backspace', 'Delete'].includes(event.key);
}

function materializeRestrictedInputDOMImmediately(state) {
  const editor = document.getElementById('editor');
  if (!state || !editor || state.temporarilyMaterialized || !Array.isArray(state.sessionParagraphs)) return;
  const fullText = state.sessionParagraphs.join(virtualEditorParagraphSeparator(state));
  const fullHTML = typeof textToEditorHTML === 'function' ? textToEditorHTML(fullText) : '';
  state.html = fullHTML;
  activeEditorHTMLBuffer = fullHTML;
  activeEditorHTMLBufferVersion += 1;
  applyTemporaryVirtualEditorFullDOM(state, editor, 'input-session-end');
}

function triggerAutoSaveAfterFullDOMRender() {
  if (!isAutoSaveEnabled || !canEditActiveDocument()) return;
  runAutoSave('full-dom-rendered');
}

function endRestrictedInputRendering() {
  clearTimeout(restrictedInputIdleTimer);
  restrictedInputIdleTimer = null;
  if (!isRestrictedInputRenderingActive && !activeVirtualEditorDocument) return Promise.resolve(false);
  isRestrictedInputRenderingActive = false;
  const state = activeVirtualEditorDocument;
  if (!state) {
    triggerAutoSaveAfterFullDOMRender();
    return Promise.resolve(true);
  }
  materializeRestrictedInputDOMImmediately(state);
  if (virtualEditorPendingPatchBatch) flushVirtualEditorPatchBatch();
  return Promise.resolve(activeEditorHTMLBridgePromise)
    .then(() => state.dirty ? materializeActiveVirtualEditorDocument({ fullAnalysis: false }) : null)
    .catch(error => console.warn('Restricted input session close failed:', error))
    .finally(() => {
      if (!isRestrictedInputRenderingActive) {
        if (activeVirtualEditorDocument?.key === state.key) clearVirtualEditorDocument();
        triggerAutoSaveAfterFullDOMRender();
      }
    });
}

function scheduleRestrictedInputRenderingIdle() {
  clearTimeout(restrictedInputIdleTimer);
  restrictedInputIdleTimer = setTimeout(() => endRestrictedInputRendering('input-idle'), RESTRICTED_INPUT_IDLE_DELAY_MS);
}

function beginRestrictedInputRendering() {
  const editor = document.getElementById('editor');
  const documentItem = activeEditorDocument();
  if (!editor || !documentItem || !canEditActiveDocument() || !isLargeVirtualEditorDocument(documentItem)) return;
  scheduleRestrictedInputRenderingIdle();
  if (isRestrictedInputRenderingActive) {
    if (activeVirtualEditorDocument) {
      activeVirtualEditorDocument.inputCaretAnchor = temporaryVirtualEditorViewportAnchor(editor, activeVirtualEditorDocument, true);
    }
    return;
  }
  isRestrictedInputRenderingActive = true;
  if (activeVirtualEditorDocument?.documentItem === documentItem) {
    activeVirtualEditorDocument.inputCaretAnchor = temporaryVirtualEditorViewportAnchor(editor, activeVirtualEditorDocument, true);
    return;
  }
  const sourceText = String(editor.textContent || '').replace(/\r\n?/g, '\n');
  const sourceHTML = typeof textToEditorHTML === 'function' ? textToEditorHTML(sourceText) : editor.innerHTML;
  const sequence = editorDocumentLoadSequence;
  startVirtualEditorDocument(documentItem, sequence, sourceHTML, sourceText);
  if (activeVirtualEditorDocument) {
    activeVirtualEditorDocument.inputCaretAnchor = temporaryVirtualEditorViewportAnchor(editor, activeVirtualEditorDocument, true);
  }
}

function handleRestrictedInputSessionKeydown(event) {
  if (!isRestrictedInputRenderingActive || isRestrictedInputProducingKey(event)) return;
  materializeRestrictedInputDOMImmediately(activeVirtualEditorDocument);
  endRestrictedInputRendering('non-input-key');
}

function endRestrictedInputRenderingBeforePointerAction() {
  if (isRestrictedInputRenderingActive) {
    materializeRestrictedInputDOMImmediately(activeVirtualEditorDocument);
    endRestrictedInputRendering('pointer-action');
  }
}

function endRestrictedInputRenderingOnMouseMove() {
  if (isRestrictedInputRenderingActive) endRestrictedInputRendering('mouse-move');
}

function initRestrictedInputFloatingPanelObserver() {
  if (!document.body || typeof MutationObserver !== 'function') return;
  const observer = new MutationObserver(() => {
    if (!isRestrictedInputRenderingActive) return;
    const registeredPanel = typeof floatingFocusPanelElements === 'function' && typeof isFloatingFocusPanelOpen === 'function'
      ? floatingFocusPanelElements().find(isFloatingFocusPanelOpen)
      : null;
    const visiblePanel = registeredPanel || Array.from(document.querySelectorAll('[role="dialog"], .floating-panel, .is-focus-center-panel, #find-bar, #floating-tools.is-expanded'))
      .find(panel => !panel.hidden && panel.getAttribute('aria-hidden') !== 'true' && panel.getClientRects().length > 0);
    if (visiblePanel) endRestrictedInputRendering('floating-panel');
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class', 'aria-hidden'] });
}

function shouldVirtualizeEditorDocument(documentItem) {
  return Boolean(documentItem && isLargeVirtualEditorDocument(documentItem));
}

function boundedVirtualFallbackFromHTML(documentItem) {
  const source = String(documentItem?.content || '');
  const decoded = editorHTMLToText(source);
  const paragraphs = virtualEditorLogicalParagraphs(decoded);
  const words = decoded.trim().match(/[\p{L}\p{N}\p{M}]+(?:['’\-][\p{L}\p{N}\p{M}]+)*/gu)?.length || 0;
  return {
    paragraphs,
    result: {
      documentKey: virtualEditorDocumentKey(documentItem),
      start: 0,
      end: Math.min(paragraphs.length, VIRTUAL_EDITOR_WINDOW_SIZE),
      total: paragraphs.length,
      windowText: paragraphs.slice(0, VIRTUAL_EDITOR_WINDOW_SIZE).join('\n'),
      stats: { words, characters: decoded.replace(/\s/g, '').length, paragraphs: paragraphs.filter(value => value.trim()).length }
    }
  };
}

function renderBoundedVirtualWorkerFallback(documentItem, sequence, error) {
  if (sequence !== editorDocumentLoadSequence) return;
  console.warn('Virtual editor Worker unavailable; using a bounded non-DOM fallback:', error);
  const fallback = boundedVirtualFallbackFromHTML(documentItem);
  const key = virtualEditorDocumentKey(documentItem);
  if (!activeVirtualEditorDocument || activeVirtualEditorDocument.key !== key) {
    activeVirtualEditorDocument = { key, documentItem, documentSequence: sequence, start: 0, end: 0, total: fallback.paragraphs.length, estimatedParagraphHeight: 48, workerUnavailable: true, fallbackParagraphs: fallback.paragraphs };
  } else {
    activeVirtualEditorDocument.workerUnavailable = true;
    activeVirtualEditorDocument.fallbackParagraphs = fallback.paragraphs;
  }
  activeVirtualEditorDocument.workerReady = true;
  if (activeVirtualEditorDocument.temporarilyMaterialized) {
    setEditorStatValues(fallback.result.stats);
    setSaveButtonSaved(true);
    return;
  }
  applyVirtualEditorWindow(fallback.result);
  setEditorStatValues(fallback.result.stats);
  setSaveButtonSaved(true);
}

function clearVirtualEditorDocument({ release = true } = {}) {
  const previous = activeVirtualEditorDocument;
  activeVirtualEditorDocument = null;
  cancelAnimationFrame(virtualEditorScrollFrame);
  virtualEditorScrollFrame = null;
  clearTimeout(virtualEditorMaterializeTimer);
  clearTimeout(virtualEditorFullAnalysisTimer);
  clearTimeout(virtualEditorPatchBatchTimer);
  virtualEditorMaterializeTimer = null;
  virtualEditorFullAnalysisTimer = null;
  virtualEditorPatchBatchTimer = null;
  virtualEditorPendingPatchBatch = null;
  const editor = document.getElementById('editor');
  document.querySelector('.virtual-editor-visual-shield')?.remove();
  editor?.classList.remove('is-virtual-document');
  editor?.classList.remove('is-temporarily-materialized');
  if (editor) {
    delete editor.dataset.virtualWindowStart;
    delete editor.dataset.virtualWindowEnd;
    delete editor.dataset.virtualLoadedParagraphs;
    delete editor.dataset.virtualWindowLimit;
  }
  editor?.style.removeProperty('--virtual-editor-top-space');
  editor?.style.removeProperty('--virtual-editor-bottom-space');
  if (release && previous?.key && !previous.retainedForSnapshot) {
    editorHTMLBridgeWorkerLane.run({ documentKey: previous.key }, 'release-virtual-document').catch(() => {});
  }
}

function updateActiveDocumentWordCountLabel(words) {
  const kind = isDraftActive() ? 'draft' : 'chapter';
  const index = isDraftActive() ? curDraft : curChap;
  const item = document.querySelector(`[data-editor-document="${kind}"][data-editor-document-index="${index}"]`);
  const countLabel = item?.querySelector('.cn');
  if (countLabel) countLabel.textContent = `${Math.max(0, Number(words) || 0)} ${text().words}`;
}

function applyVirtualEditorDeltaResult(result) {
  const state = activeVirtualEditorDocument;
  if (!state || !result || result.documentKey !== state.key) return false;
  state.start = result.start;
  state.end = result.end;
  state.total = result.total;
  state.revision = result.revision;
  state.dirty = true;
  setEditorStatValues(result.stats || {});
  if (isDraftActive()) setDraftWordCache(curDraft, result.stats?.words || 0);
  else setChapterWordCache(curChap, result.stats?.words || 0);
  updateActiveDocumentWordCountLabel(result.stats?.words || 0);
  return true;
}

async function materializeActiveVirtualEditorDocument(options = {}) {
  const state = activeVirtualEditorDocument;
  if (!state?.dirty) return null;
  const key = state.key;
  const expectedRevision = state.revision;
  const result = await editorHTMLBridgeWorkerLane.run({ documentKey: key }, 'materialize-virtual-document');
  if (
    activeVirtualEditorDocument?.key !== key ||
    activeVirtualEditorDocument.revision !== expectedRevision
  ) return null;
  activeVirtualEditorDocument.dirty = false;
  activeVirtualEditorDocument.html = result.html;
  activeEditorHTMLBuffer = String(result.html || '');
  activeEditorHTMLBufferVersion += 1;
  commitActiveEditorHTMLBuffer(activeEditorHTMLBufferVersion);
  if (options.fullAnalysis !== false) {
    runSurfaceEditorWorkerAnalysis(activeEditorHTMLBuffer, { sequence: editorDocumentLoadSequence });
  }
  return result;
}

function scheduleVirtualEditorIdleStages() {
  clearTimeout(virtualEditorMaterializeTimer);
  clearTimeout(virtualEditorFullAnalysisTimer);
  virtualEditorMaterializeTimer = setTimeout(() => {
    virtualEditorMaterializeTimer = null;
    materializeActiveVirtualEditorDocument({ fullAnalysis: false }).catch(error => {
      console.warn('Virtual editor materialization failed:', error);
      setSaveButtonSaved(false);
      setDefaultSaveStatus();
    });
  }, VIRTUAL_EDITOR_MATERIALIZE_DELAY_MS);
  virtualEditorFullAnalysisTimer = setTimeout(async () => {
    virtualEditorFullAnalysisTimer = null;
    try {
      if (activeVirtualEditorDocument?.dirty) {
        await materializeActiveVirtualEditorDocument({ fullAnalysis: false });
      }
      if (activeVirtualEditorDocument && activeEditorHTMLBuffer) {
        await runSurfaceEditorWorkerAnalysis(activeEditorHTMLBuffer, { sequence: editorDocumentLoadSequence });
      }
    } catch (error) {
      console.warn('Virtual editor idle analysis failed:', error);
    }
  }, VIRTUAL_EDITOR_FULL_ANALYSIS_DELAY_MS);
}

function applyVirtualEditorWindow(result, options = {}) {
  const editor = document.getElementById('editor');
  if (!editor || !activeVirtualEditorDocument || result.documentKey !== activeVirtualEditorDocument.key) return;
  const visualShield = options.viewportAnchor
    ? createVirtualEditorVisualShield(editor)
    : null;
  const requestedWindowSize = Math.max(1, Number(options.windowSize || VIRTUAL_EDITOR_WINDOW_SIZE) || 1);
  const receivedParagraphs = String(result.windowText || '').replace(/\r\n?/g, '\n').split('\n');
  const windowParagraphs = receivedParagraphs.slice(0, requestedWindowSize);
  const safeStart = Math.max(0, Number(result.start) || 0);
  const safeEnd = Math.min(Number(result.total) || windowParagraphs.length, safeStart + windowParagraphs.length);
  const previousRatio = options.preserveRatio && editor.scrollHeight > editor.clientHeight
    ? editor.scrollTop / (editor.scrollHeight - editor.clientHeight)
    : null;
  activeVirtualEditorDocument.start = safeStart;
  activeVirtualEditorDocument.end = safeEnd;
  activeVirtualEditorDocument.total = result.total;
  activeVirtualEditorDocument.temporarilyMaterialized = false;
  activeVirtualEditorDocument.temporaryReason = '';
  if (typeof result.html === 'string') activeVirtualEditorDocument.html = result.html;
  const paragraphSpace = activeVirtualEditorDocument.estimatedParagraphHeight || 48;
  editor.classList.add('is-virtual-document');
  editor.classList.remove('is-temporarily-materialized');
  editor.dataset.virtualWindowStart = String(safeStart);
  editor.dataset.virtualWindowEnd = String(safeEnd);
  editor.dataset.virtualLoadedParagraphs = String(windowParagraphs.length);
  editor.dataset.virtualWindowLimit = String(requestedWindowSize);
  editor.style.setProperty('--virtual-editor-top-space', `${Math.max(0, safeStart * paragraphSpace)}px`);
  editor.style.setProperty('--virtual-editor-bottom-space', `${Math.max(0, ((Number(result.total) || 0) - safeEnd) * paragraphSpace)}px`);
  const selectionTransaction = ++virtualEditorDOMSelectionTransactionSequence;
  isVirtualEditorDOMSelectionTransaction = true;
  cancelEditorCaretAutoScroll();
  const finishSelectionTransaction = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (selectionTransaction === virtualEditorDOMSelectionTransactionSequence) {
          isVirtualEditorDOMSelectionTransaction = false;
        }
      });
    });
  };
  // A virtual window is only the content source. Render it through the same
  // HTML -> plain text -> editor.textContent path used by the legacy editor;
  // the Worker remains responsible only for the full-document backing state.
  const windowText = windowParagraphs.join(virtualEditorParagraphSeparator(activeVirtualEditorDocument));
  renderEditorDocumentContent(editor, { content: textToEditorHTML(windowText) }, { virtualWindow: true });
  if (options.caretAnchor && Number.isFinite(options.caretAnchor.paragraph)) {
    const localCaretParagraph = Math.max(0, options.caretAnchor.paragraph - safeStart);
    const localParagraphStart = virtualEditorParagraphStartOffset(editor.textContent || '', localCaretParagraph);
    const localParagraphText = windowParagraphs[localCaretParagraph] || '';
    const localCaretOffset = localParagraphStart + Math.max(0, Math.min(
      localParagraphText.length,
      Number(options.caretAnchor.offsetInParagraph) || 0
    ));
    const caretPosition = editorHistoryPositionForTextOffset(editor, localCaretOffset);
    if (caretPosition?.node) {
      const caretRange = document.createRange();
      caretRange.setStart(caretPosition.node, caretPosition.offset);
      caretRange.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(caretRange);
      savedEditorRange = caretRange.cloneRange();
    }
  }
  if (options.viewportAnchor && Number.isFinite(options.viewportAnchor.paragraph)) {
    const localParagraph = Math.max(0, options.viewportAnchor.paragraph - safeStart);
    const localOffset = virtualEditorParagraphStartOffset(editor.textContent || '', localParagraph);
    virtualEditorProgrammaticScrollGuard = Date.now() + 160;
    // Force measurement and correct the scroll position in the same task. This
    // prevents the bounded window from painting once at the wrong position.
    const caretRect = options.caretAnchor && typeof editorCaretRect === 'function' ? editorCaretRect(editor) : null;
    const renderedTop = Number.isFinite(caretRect?.top)
      ? caretRect.top
      : virtualEditorTextOffsetViewportTop(editor, localOffset);
    if (Number.isFinite(renderedTop) && Number.isFinite(options.viewportAnchor.top)) {
      editor.scrollTop += renderedTop - options.viewportAnchor.top;
    }
    updateEditorScrollThumb(false);
    releaseVirtualEditorVisualShield(visualShield, editor, options.viewportAnchor, localOffset, Boolean(options.caretAnchor));
    finishSelectionTransaction();
    return;
  }
  visualShield?.remove();
  if (previousRatio !== null) {
    virtualEditorProgrammaticScrollGuard = Date.now() + 120;
    requestAnimationFrame(() => {
      editor.scrollTop = previousRatio * Math.max(0, editor.scrollHeight - editor.clientHeight);
      updateEditorScrollThumb(false);
    });
  }
  finishSelectionTransaction();
}

function startVirtualEditorDocument(documentItem, sequence, sourceHTML = documentItem?.content || '', sourceText = null) {
  const editor = document.getElementById('editor');
  if (!editor) return;
  clearVirtualEditorDocument();
  const key = virtualEditorDocumentKey(documentItem);
  const sessionParagraphs = virtualEditorLogicalParagraphs(sourceText === null ? editorHTMLToText(sourceHTML) : sourceText);
  activeVirtualEditorDocument = {
    key,
    documentItem,
    documentSequence: sequence,
    start: 0,
    end: 0,
    total: sessionParagraphs.length,
    estimatedParagraphHeight: 48,
    workerReady: false,
    sessionParagraphs
  };
  setEditorRenderMode(editor, 'plain');
  activeVirtualEditorDocument.html = sourceHTML;
  const preservePaintedInputDOM = isRestrictedInputRenderingActive;
  // During an input event Chromium's live Range must not be replaced. On an
  // ordinary document load, however, paint the bounded source immediately by
  // sending it through the legacy normal-content renderer.
  activeVirtualEditorDocument.temporarilyMaterialized = preservePaintedInputDOM;
  activeVirtualEditorDocument.temporaryReason = preservePaintedInputDOM ? 'input-session-start' : '';
  activeVirtualEditorDocument.fullTextParagraphCount = activeVirtualEditorDocument.sessionParagraphs.length;
  activeVirtualEditorDocument.fullTextCharacterCount = String(editor.textContent || '').length;
  editor.classList.toggle('is-virtual-document', !preservePaintedInputDOM);
  editor.classList.toggle('is-temporarily-materialized', preservePaintedInputDOM);
  editor.dataset.placeholder = text().editorPlaceholder || 'Start writing here... your story is waiting.';
  if (!preservePaintedInputDOM) {
    applyVirtualEditorWindow({
      documentKey: key,
      start: 0,
      end: Math.min(sessionParagraphs.length, VIRTUAL_EDITOR_WINDOW_SIZE),
      total: sessionParagraphs.length,
      windowText: sessionParagraphs.slice(0, VIRTUAL_EDITOR_WINDOW_SIZE).join('\n')
    });
  }
  editorHTMLBridgeWorkerLane.run({
    documentKey: key,
    html: sourceHTML,
    paragraphs: sessionParagraphs,
    start: 0,
    windowSize: VIRTUAL_EDITOR_WINDOW_SIZE
  }, 'load-virtual-document').then(result => {
    if (sequence !== editorDocumentLoadSequence || activeVirtualEditorDocument?.key !== key) return;
    if (typeof result?.windowText !== 'string' || !result?.stats) {
      throw new Error('Virtual Worker returned an incomplete document window');
    }
    const verifiedWords = Math.max(0, Number(result.stats?.words) || 0);
    activeVirtualEditorDocument.workerReady = true;
    activeVirtualEditorDocument.total = Math.max(0, Number(result.total) || 0);
    activeVirtualEditorDocument.revision = Number(result.revision) || 0;
    documentItem._wordCount = verifiedWords;
    documentItem.wordCount = verifiedWords;
    documentItem._wordCountVerifiedSignature = editorDocumentWordCountSignature(documentItem);
    if (isDraftActive()) setDraftWordCache(curDraft, verifiedWords);
    else setChapterWordCache(curChap, verifiedWords);
    updateActiveDocumentWordCountLabel(verifiedWords);
    editor.dataset.placeholder = text().editorPlaceholder || 'Start writing here... your story is waiting.';
    if (isRestrictedInputRenderingActive) {
      if (virtualEditorPendingPatchBatch) flushVirtualEditorPatchBatch();
      Promise.resolve(activeEditorHTMLBridgePromise).finally(() => {
        if (isRestrictedInputRenderingActive && activeVirtualEditorDocument?.key === key) {
          restoreVirtualEditorWindowAroundViewport({
            force: true,
            preferCaret: true,
            viewportAnchor: activeVirtualEditorDocument.inputCaretAnchor,
            windowSize: VIRTUAL_EDITOR_WINDOW_SIZE
          });
        }
      });
    }
  }).catch(error => {
    renderBoundedVirtualWorkerFallback(documentItem, sequence, error);
  });
}

function requestVirtualEditorWindow(start) {
  const state = activeVirtualEditorDocument;
  if (!state || state.windowPending) return;
  const requestId = ++virtualEditorWindowRequest;
  state.windowPending = true;
  editorHTMLBridgeWorkerLane.run({
    documentKey: state.key,
    start,
    windowSize: VIRTUAL_EDITOR_WINDOW_SIZE
  }, 'render-virtual-window').then(result => {
    if (requestId !== virtualEditorWindowRequest || activeVirtualEditorDocument?.key !== state.key) return;
    applyVirtualEditorWindow(result, { preserveRatio: true });
  }).catch(error => console.warn('Virtual editor window load failed:', error))
    .finally(() => {
      if (activeVirtualEditorDocument?.key === state.key) activeVirtualEditorDocument.windowPending = false;
    });
}

function temporaryVirtualEditorViewportAnchor(editor, state, preferCaret = false) {
  const selection = window.getSelection();
  if (
    preferCaret &&
    selection?.rangeCount &&
    selection.anchorNode &&
    editor.contains(selection.anchorNode) &&
    typeof editorRangeToTextOffsets === 'function'
  ) {
    const offsets = editorRangeToTextOffsets(selection.getRangeAt(0), editor);
    if (offsets && Number.isFinite(offsets.start)) {
      const localParagraph = virtualEditorLogicalParagraphIndexForTextOffset(editor.textContent || '', offsets.start);
      const paragraph = localParagraph + (state.temporarilyMaterialized ? 0 : state.start);
      const startOffset = virtualEditorParagraphStartOffset(editor.textContent || '', localParagraph);
      const caretRect = typeof editorCaretRect === 'function' ? editorCaretRect(editor) : null;
      return {
        paragraph,
        top: Number.isFinite(caretRect?.top)
          ? caretRect.top
          : virtualEditorTextOffsetViewportTop(editor, startOffset),
        caretAnchor: {
          paragraph,
          offsetInParagraph: Math.max(0, offsets.start - startOffset)
        }
      };
    }
  }
  const editorRect = editor.getBoundingClientRect();
  const probeX = editorRect.left + Math.min(80, Math.max(20, editorRect.width * 0.08));
  const probeY = editorRect.top + Math.min(96, Math.max(28, editor.clientHeight * 0.18));
  const caretPosition = document.caretPositionFromPoint?.(probeX, probeY);
  const caretRange = !caretPosition && document.caretRangeFromPoint?.(probeX, probeY);
  const node = caretPosition?.offsetNode || caretRange?.startContainer;
  const offset = caretPosition?.offset ?? caretRange?.startOffset;
  if (node && editor.contains(node)) {
    const range = document.createRange();
    range.setStart(node, offset || 0);
    range.collapse(true);
    const offsets = editorRangeToTextOffsets(range, editor);
    if (offsets && Number.isFinite(offsets.start)) {
      const paragraph = virtualEditorLogicalParagraphIndexForTextOffset(editor.textContent || '', offsets.start);
      const startOffset = virtualEditorParagraphStartOffset(editor.textContent || '', paragraph);
      return { paragraph, top: virtualEditorTextOffsetViewportTop(editor, startOffset) ?? probeY };
    }
  }
  const maxScroll = Math.max(1, editor.scrollHeight - editor.clientHeight);
  const paragraph = Math.round((editor.scrollTop / maxScroll) * Math.max(0, state.total - 1));
  return { paragraph, top: probeY };
}

function applyTemporaryVirtualEditorFullDOM(state, editor, reason = 'scroll') {
  if (!state || !editor || state.temporarilyMaterialized) return false;
  const preservedSelection = captureVirtualEditorGlobalSelection(editor, state);
  const viewportAnchor = temporaryVirtualEditorViewportAnchor(editor, state, true);
  const maxScroll = Math.max(1, editor.scrollHeight - editor.clientHeight);
  const scrollRatio = editor.scrollTop / maxScroll;
  const fullHTML = activeEditorHTMLBuffer || state.html || state.documentItem?.content || '';
  const fullText = Array.isArray(state.sessionParagraphs)
    ? state.sessionParagraphs.join('\n')
    : editorHTMLToText(fullHTML);
  state.temporarilyMaterialized = true;
  state.temporaryReason = reason;
  state.fullTextParagraphCount = virtualEditorLogicalParagraphs(fullText).length;
  state.fullTextCharacterCount = fullText.length;
  editor.classList.remove('is-virtual-document');
  editor.classList.add('is-temporarily-materialized');
  editor.style.removeProperty('--virtual-editor-top-space');
  editor.style.removeProperty('--virtual-editor-bottom-space');
  const selectionTransaction = ++virtualEditorDOMSelectionTransactionSequence;
  isVirtualEditorDOMSelectionTransaction = true;
  cancelEditorCaretAutoScroll();
  setPlainTextEditorValue(editor, fullText);
  if (preservedSelection) restoreVirtualEditorGlobalSelection(editor, preservedSelection);
  virtualEditorProgrammaticScrollGuard = Date.now() + 120;
  if (viewportAnchor && Number.isFinite(viewportAnchor.paragraph) && Number.isFinite(viewportAnchor.top)) {
    const fullParagraphOffset = virtualEditorParagraphStartOffset(editor.textContent || '', viewportAnchor.paragraph);
    const caretRect = preservedSelection && typeof editorCaretRect === 'function' ? editorCaretRect(editor) : null;
    const renderedTop = Number.isFinite(caretRect?.top)
      ? caretRect.top
      : virtualEditorTextOffsetViewportTop(editor, fullParagraphOffset);
    if (Number.isFinite(renderedTop)) editor.scrollTop += renderedTop - viewportAnchor.top;
  } else {
    editor.scrollTop = scrollRatio * Math.max(0, editor.scrollHeight - editor.clientHeight);
  }
  updateEditorScrollThumb(false);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (selectionTransaction === virtualEditorDOMSelectionTransactionSequence) {
        isVirtualEditorDOMSelectionTransaction = false;
      }
    });
  });
  return true;
}

function temporarilyMaterializeVirtualEditor(reason = 'scroll') {
  const state = activeVirtualEditorDocument;
  const editor = document.getElementById('editor');
  if (!state || !editor) return Promise.resolve(false);
  if (state.temporarilyMaterialized) {
    state.temporaryReason = reason === 'find' ? 'find' : state.temporaryReason;
    return Promise.resolve(true);
  }
  if (state.temporaryMaterializationPromise) return state.temporaryMaterializationPromise;

  const needsLatestMaterialization = Boolean(virtualEditorPendingPatchBatch || state.dirty);
  if (!needsLatestMaterialization) {
    return Promise.resolve(applyTemporaryVirtualEditorFullDOM(state, editor, reason));
  }

  if (virtualEditorPendingPatchBatch) flushVirtualEditorPatchBatch();
  state.temporaryMaterializationPromise = Promise.resolve(activeEditorHTMLBridgePromise)
    .then(() => materializeActiveVirtualEditorDocument({ fullAnalysis: false }))
    .then(() => {
      if (activeVirtualEditorDocument?.key !== state.key) return false;
      if (reason === 'find' && !isFindOpen) return false;
      return applyTemporaryVirtualEditorFullDOM(state, editor, reason);
    })
    .catch(error => {
      console.warn('Temporary full editor materialization failed:', error);
      return false;
    })
    .finally(() => {
      if (activeVirtualEditorDocument?.key === state.key) state.temporaryMaterializationPromise = null;
    });
  return state.temporaryMaterializationPromise;
}

function restoreVirtualEditorWindowAroundViewport(options = {}) {
  const state = activeVirtualEditorDocument;
  const editor = document.getElementById('editor');
  if (!state || !editor || state.windowPending) return false;
  if (!state.temporarilyMaterialized && options.preferCaret !== true) return false;
  if (state.temporaryReason === 'find' && isFindOpen && !options.force) return false;
  if (state.workerUnavailable) {
    const currentText = String(editor.textContent || '').replace(/\r\n?/g, '\n');
    state.fallbackParagraphs = virtualEditorLogicalParagraphs(currentText);
    state.total = state.fallbackParagraphs.length;
    const currentHTML = currentText && typeof textToEditorHTML === 'function' ? textToEditorHTML(currentText) : '';
    activeEditorHTMLBuffer = currentHTML;
    state.html = currentHTML;
    if (state.documentItem) state.documentItem.content = currentHTML;
  }
  const viewportAnchor = options.viewportAnchor || temporaryVirtualEditorViewportAnchor(editor, state, options.preferCaret === true);
  const targetParagraph = viewportAnchor.paragraph;
  const windowSize = Math.max(1, Number(options.windowSize || VIRTUAL_EDITOR_WINDOW_SIZE) || 1);
  const start = Math.max(0, Math.min(
    Math.max(0, state.total - windowSize),
    targetParagraph - Math.floor(windowSize / 2)
  ));
  if (state.workerUnavailable && Array.isArray(state.fallbackParagraphs)) {
    const paragraphs = state.fallbackParagraphs;
    applyVirtualEditorWindow({
      documentKey: state.key,
      start,
      end: Math.min(paragraphs.length, start + windowSize),
      total: paragraphs.length,
      windowText: paragraphs.slice(start, start + windowSize).join('\n')
    }, { viewportAnchor, caretAnchor: viewportAnchor.caretAnchor, windowSize });
    return true;
  }
  state.windowPending = true;
  const requestId = ++virtualEditorWindowRequest;
  editorHTMLBridgeWorkerLane.run({
    documentKey: state.key,
    start,
    windowSize
  }, 'render-virtual-window').then(result => {
    if (requestId !== virtualEditorWindowRequest || activeVirtualEditorDocument?.key !== state.key) return;
    const latestAnchor = viewportAnchor;
    const resultStart = Math.max(0, Number(result.start) || 0);
    const resultEnd = Math.max(resultStart, Number(result.end) || resultStart);
    if (
      options.preferCaret &&
      latestAnchor?.caretAnchor &&
      (latestAnchor.paragraph < resultStart || latestAnchor.paragraph >= resultEnd)
    ) {
      // This result belongs to an older caret position. Leave the live anchor
      // queued; the single post-response reconciliation below will request the
      // correct window after this request has completely released its lock.
      return;
    }
    applyVirtualEditorWindow(result, { viewportAnchor: latestAnchor, caretAnchor: latestAnchor.caretAnchor, windowSize });
  }).catch(error => console.warn('Virtual editor window restore failed:', error))
    .finally(() => {
      const isCurrentDocument = activeVirtualEditorDocument?.key === state.key;
      if (isCurrentDocument) activeVirtualEditorDocument.windowPending = false;
    });
  return true;
}

function handleVirtualEditorScrollStartIntent() {
  const state = activeVirtualEditorDocument;
  if (!state) return;
  if (state.temporarilyMaterialized) return;
  temporarilyMaterializeVirtualEditor('scroll');
}

function handleVirtualEditorScroll() {
  const state = activeVirtualEditorDocument;
  const editor = document.getElementById('editor');
  if (
    !state ||
    !editor ||
    state.windowPending
  ) return;
  if (Date.now() < virtualEditorProgrammaticScrollGuard) return;
  if (!state.temporarilyMaterialized) {
    temporarilyMaterializeVirtualEditor('scroll');
    return;
  }
  if (state.temporarilyMaterialized) return;
  cancelAnimationFrame(virtualEditorScrollFrame);
  virtualEditorScrollFrame = requestAnimationFrame(() => {
    virtualEditorScrollFrame = null;
    const maxScroll = Math.max(1, editor.scrollHeight - editor.clientHeight);
    const targetParagraph = Math.round((editor.scrollTop / maxScroll) * Math.max(0, state.total - 1));
    if (targetParagraph >= state.start + 8 && targetParagraph < state.end - 8) return;
    const nextStart = Math.max(0, Math.min(state.total - VIRTUAL_EDITOR_WINDOW_SIZE, targetParagraph - Math.floor(VIRTUAL_EDITOR_WINDOW_SIZE / 2)));
    if (nextStart !== state.start) requestVirtualEditorWindow(nextStart);
  });
}

function suspendVirtualEditorForFullDOM() {
  return temporarilyMaterializeVirtualEditor('find');
}

function captureHiddenSwitchedDocumentSnapshot() {
  const editor = document.getElementById('editor');
  const virtualState = activeVirtualEditorDocument;
  if (virtualState && virtualEditorPendingPatchBatch) flushVirtualEditorPatchBatch();
  if (virtualState) virtualState.retainedForSnapshot = true;
  const virtualHTML = activeVirtualEditorDocument
    ? activeEditorHTMLBuffer || activeVirtualEditorDocument.html || ''
    : '';
  const snapshotId = ++switchedDocumentSnapshotSequence;
  const snapshot = {
    id: snapshotId,
    status: 'captured',
    mode: isDraftActive() ? 'draft' : isChapterEditDraftActive() ? 'chapter-edit-draft' : 'chapter',
    chapterIndex: curChap,
    draftIndex: curDraft,
    chapterEditKey: activeChapterEditKey,
    documentItem: activeEditorDocument(),
    virtualDocumentKey: virtualState?.key || '',
    wasChapterEditUnlocked: isChapterEditUnlocked,
    plainTextMode: virtualHTML ? false : Boolean(editor && isEditorPlainTextMode(editor)),
    rawText: virtualHTML ? '' : editor?.textContent || '',
    rawHTML: virtualHTML || editor?.innerHTML || '',
    capturedAt: Date.now()
  };
  switchedDocumentSnapshots.set(snapshotId, snapshot);
  return snapshot;
}

function normalizeHiddenSwitchedSnapshotHTML(snapshot) {
  if (!snapshot) return '';
  if (snapshot.plainTextMode) {
    return snapshot.rawText.trim()
      ? textToEditorHTML(snapshot.rawText.replace(/\r\n?/g, '\n'))
      : '';
  }

  const probe = document.createElement('div');
  probe.innerHTML = snapshot.rawHTML || '';
  unwrapHighlights(probe);
  probe.querySelectorAll('.hindi-pending-virama-boundary, [data-lm-pending-virama-boundary]').forEach(node => node.remove());
  normalizeEditorGapMarkers(probe);
  if (typeof normalizeEditorParagraphBlocks === 'function') normalizeEditorParagraphBlocks(probe);
  return isEditorVisuallyEmpty(probe) ? '' : probe.innerHTML;
}

async function commitHiddenSwitchedSnapshotToMemory(snapshot) {
  if (!snapshot || !switchedDocumentSnapshots.has(snapshot.id)) return snapshot;
  snapshot.status = 'normalizing';
  let processed;
  try {
    if (snapshot.virtualDocumentKey) {
      const materialized = await editorHTMLBridgeWorkerLane.run({
        documentKey: snapshot.virtualDocumentKey
      }, 'materialize-virtual-document');
      processed = await editorSnapshotWorkerLane.run({
        html: materialized.html,
        names: editorWorkerNamesPayload()
      });
    } else {
      processed = await editorSnapshotWorkerLane.run({
        plainTextMode: snapshot.plainTextMode,
        rawText: snapshot.rawText,
        rawHTML: snapshot.rawHTML,
        names: editorWorkerNamesPayload()
      });
    }
  } catch (error) {
    console.warn('Snapshot worker fallback:', error);
    snapshot.html = normalizeHiddenSwitchedSnapshotHTML(snapshot);
    snapshot.text = editorHTMLToText(snapshot.html);
    processed = fallbackEditorWorkerAnalysis({ html: snapshot.html });
  }
  snapshot.html = processed.normalizedHTML;
  snapshot.text = processed.text;
  snapshot.stats = processed.stats;
  snapshot.nameMatches = processed.nameMatches;

  if (snapshot.mode === 'draft' && snapshot.documentItem) {
    snapshot.documentItem.content = snapshot.html;
    setDraftWordCache(snapshot.draftIndex, snapshot.stats?.words ?? countWordsFromText(snapshot.text));
  } else if (snapshot.mode === 'chapter-edit-draft' && snapshot.documentItem) {
    snapshot.documentItem.content = snapshot.html;
    snapshot.documentItem.updatedAt = new Date().toISOString();
  } else if (
    snapshot.mode === 'chapter' &&
    snapshot.wasChapterEditUnlocked &&
    hasChapterEditContentChangedFromSaved(snapshot.html, snapshot.chapterIndex)
  ) {
    const draft = ensureChapterEditDraft(snapshot.chapterIndex);
    if (draft) {
      draft.content = snapshot.html;
      draft.updatedAt = new Date().toISOString();
      chapterEditDrafts[draft.chapterKey] = normalizeChapterEditDraft(draft, draft.chapterKey);
      snapshot.mode = 'chapter-edit-draft';
      snapshot.chapterEditKey = draft.chapterKey;
      snapshot.documentItem = chapterEditDrafts[draft.chapterKey];
    }
  }

  snapshot.status = 'memory-saved';
  return snapshot;
}

function releaseHiddenSwitchedSnapshot(snapshot) {
  if (!snapshot) return;
  snapshot.status = 'released';
  switchedDocumentSnapshots.delete(snapshot.id);
  if (snapshot.virtualDocumentKey) {
    editorHTMLBridgeWorkerLane.run({
      documentKey: snapshot.virtualDocumentKey
    }, 'release-virtual-document').catch(() => {});
  }
}

function resetActiveEditorHTMLBuffer(sourceHTML = '') {
  clearTimeout(editorHTMLMemoryCommitTimer);
  editorHTMLMemoryCommitTimer = null;
  activeEditorHTMLBuffer = String(sourceHTML || '');
  activeEditorHTMLBufferVersion += 1;
  committedEditorHTMLBufferVersion = activeEditorHTMLBufferVersion;
  activeEditorHTMLAnalysisPromise = null;
  activeEditorHTMLBridgePromise = null;
  completedEditorInputBridgeSequence = editorInputBridgeSequence;
}

function commitActiveEditorHTMLBuffer(version) {
  if (version !== activeEditorHTMLBufferVersion || version === committedEditorHTMLBufferVersion) return;

  if (
    !isDraftActive() &&
    isChapterEditUnlocked &&
    !isChapterEditDraftActive() &&
    hasChapterEditContentChangedFromSaved(activeEditorHTMLBuffer, curChap)
  ) {
    materializeChapterEditDraftForChange(activeEditorHTMLBuffer);
  }

  const documentItem = activeEditorDocument();
  if (documentItem) documentItem.content = activeEditorHTMLBuffer;
  committedEditorHTMLBufferVersion = version;
  // This is only the DOM/worker -> authoritative in-memory handoff. It must
  // not impersonate a real autosave or show the saving/saved animation.
  setSaveButtonSaved(false);
  setSaveStatusDot('dirty', text().unsaved);

  if (isAutoSaveEnabled && canEditActiveDocument()) {
    clearTimeout(autoSaveTimer);
    ensureTimedAutoSave();
    autoSaveTimer = setTimeout(() => runAutoSave('html-memory-commit'), EDITOR_AUTOSAVE_DELAY_MS);
  }
}

async function flushEditorHTMLMemoryCommit() {
  if (editorHTMLMemoryCommitTimer) {
    clearTimeout(editorHTMLMemoryCommitTimer);
    editorHTMLMemoryCommitTimer = null;
  }
  if (activeVirtualEditorDocument && virtualEditorPendingPatchBatch) flushVirtualEditorPatchBatch();
  if (completedEditorInputBridgeSequence !== editorInputBridgeSequence && !activeEditorHTMLBridgePromise) {
    activeEditorHTMLBuffer = getCleanEditorHTML();
    activeEditorHTMLBufferVersion += 1;
    completedEditorInputBridgeSequence = editorInputBridgeSequence;
  }
  try {
    await activeEditorHTMLBridgePromise;
  } catch (_error) {
    // A manual save may continue with the synchronous fallback buffer.
  }
  try {
    if (activeVirtualEditorDocument?.dirty) {
      await materializeActiveVirtualEditorDocument({ fullAnalysis: false });
    }
  } catch (_error) {
    // Keep the document unsaved if its authoritative worker state cannot be materialized.
    setSaveButtonSaved(false);
    setDefaultSaveStatus();
    throw _error;
  }
  try {
    await activeEditorHTMLAnalysisPromise;
  } catch (_error) {
    // Worker fallback is handled by the analysis pipeline.
  }
  commitActiveEditorHTMLBuffer(activeEditorHTMLBufferVersion);
}

function stageEditorHTMLForMemoryCommit() {
  const inputSequence = ++editorInputBridgeSequence;
  const documentSequence = editorDocumentLoadSequence;
  const immediateEditor = document.getElementById('editor');
  const immediateVirtualState = activeVirtualEditorDocument;

  if (immediateEditor && immediateVirtualState) {
    setSaveButtonSaved(false);
    setSaveStatusDot('dirty', text().unsaved);
    queueVirtualEditorPatchBatch(immediateEditor, immediateVirtualState, inputSequence, documentSequence);
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (
        inputSequence !== editorInputBridgeSequence ||
        inputSequence <= completedEditorInputBridgeSequence ||
        documentSequence !== editorDocumentLoadSequence
      ) return;
      const editor = document.getElementById('editor');
      if (!editor) return;

      const payload = {
        plainTextMode: isEditorPlainTextMode(editor),
        rawText: editor.textContent || '',
        rawHTML: editor.innerHTML || '',
        inputSequence,
        capturedAt: Date.now()
      };

      setSaveButtonSaved(false);
      setSaveStatusDot('dirty', text().unsaved);
      const virtualState = activeVirtualEditorDocument;
      const virtualPatch = virtualState ? virtualEditorPatchPayload(editor, virtualState) : null;
      const bridgeTask = virtualState
        ? editorHTMLBridgeWorkerLane.run({
            documentKey: virtualState.key,
            ...virtualPatch,
            windowSize: VIRTUAL_EDITOR_WINDOW_SIZE
          }, 'patch-virtual-range')
        : editorHTMLBridgeWorkerLane.run(payload);
      activeEditorHTMLBridgePromise = bridgeTask
        .catch(error => {
          if (error?.name === 'AbortError') return null;
          console.warn('Editor HTML bridge fallback:', error);
          if (virtualState) {
            const paragraphs = virtualEditorLogicalParagraphs(editorHTMLToText(activeEditorHTMLBuffer || virtualState.html || ''));
            const replacement = virtualPatch?.paragraphs || [];
            paragraphs.splice(virtualPatch.start, virtualPatch.end - virtualPatch.start, ...replacement);
            const fallbackHTML = textToEditorHTML(paragraphs.join('\n'));
            const fallbackAnalysis = fallbackEditorWorkerAnalysis({ html: fallbackHTML });
            return {
              documentKey: virtualState.key,
              html: fallbackHTML,
              start: virtualState.start,
              end: virtualState.end + replacement.length - (virtualPatch.end - virtualPatch.start),
              total: paragraphs.length,
              stats: fallbackAnalysis.stats,
              revision: (virtualState.revision || 0) + 1,
              inputSequence
            };
          }
          return {
            html: payload.plainTextMode
              ? (payload.rawText.trim() ? textToEditorHTML(payload.rawText.replace(/\r\n?/g, '\n')) : '')
              : payload.rawHTML,
            inputSequence
          };
        })
        .then(result => {
          if (
            !result ||
            inputSequence !== editorInputBridgeSequence ||
            inputSequence <= completedEditorInputBridgeSequence ||
            documentSequence !== editorDocumentLoadSequence
          ) return null;
          if (virtualState && activeVirtualEditorDocument?.key === virtualState.key) {
            completedEditorInputBridgeSequence = inputSequence;
            applyVirtualEditorDeltaResult(result);
            scheduleVirtualEditorIdleStages();
            return result;
          }
          activeEditorHTMLBuffer = String(result.html || '');
          activeEditorHTMLBufferVersion += 1;
          completedEditorInputBridgeSequence = inputSequence;
          const version = activeEditorHTMLBufferVersion;

          activeEditorHTMLAnalysisPromise = runSurfaceEditorWorkerAnalysis(activeEditorHTMLBuffer, {
            sequence: documentSequence,
            bufferVersion: version
          });

          clearTimeout(editorHTMLMemoryCommitTimer);
          editorHTMLMemoryCommitTimer = setTimeout(async () => {
            editorHTMLMemoryCommitTimer = null;
            try {
              await activeEditorHTMLAnalysisPromise;
            } catch (_error) {
              // Surface analysis owns its worker fallback.
            }
            commitActiveEditorHTMLBuffer(version);
          }, EDITOR_MEMORY_COMMIT_DELAY_MS);
          return result;
        });
    });
  });
}

function syncImmediateSidebarDocumentHighlight(kind, index, sequence) {
  document.querySelectorAll('.chap-item.active').forEach(item => item.classList.remove('active'));
  const target = document.querySelector(`[data-editor-document="${kind}"][data-editor-document-index="${index}"]`);
  if (target) {
    target.classList.add('active');
    return;
  }

  requestAnimationFrame(() => {
    if (sequence !== editorDocumentLoadSequence) return;
    renderChapters();
  });
}

function applyEditorWorkerAnalysis(result, { sequence = editorDocumentLoadSequence, bufferVersion = null } = {}) {
  if (!result || sequence !== editorDocumentLoadSequence) return false;
  if (bufferVersion !== null && bufferVersion !== activeEditorHTMLBufferVersion) return false;

  setEditorStatValues(result.stats || {});
  if (isDraftActive()) setDraftWordCache(curDraft, result.stats?.words || 0);
  else setChapterWordCache(curChap, result.stats?.words || 0);

  const namingChanged = scanActiveEditorForNamingUses(new Date().toISOString(), result.text || '');
  renderChapters();
  if (activeSidePanel === 'naming' && namingChanged) renderTags();
  updateChapterStatus();
  return true;
}

function runSurfaceEditorWorkerAnalysis(sourceHTML, options = {}) {
  const sequence = options.sequence ?? editorDocumentLoadSequence;
  const bufferVersion = options.bufferVersion ?? null;
  return editorSurfaceWorkerLane.run({
    html: String(sourceHTML || ''),
    names: editorWorkerNamesPayload()
  }).then(result => {
    applyEditorWorkerAnalysis(result, { sequence, bufferVersion });
    return result;
  }).catch(error => {
    if (error?.name === 'AbortError') return null;
    console.warn('Editor analysis worker fallback:', error);
    if (sequence !== editorDocumentLoadSequence) return null;
    const fallback = fallbackEditorWorkerAnalysis({ html: sourceHTML });
    applyEditorWorkerAnalysis(fallback, { sequence, bufferVersion });
    return fallback;
  });
}

function scheduleEditorDocumentPostRender(sequence, documentItem, tasks = {}) {
  requestAnimationFrame(() => {
    const isCurrentDocument = sequence === editorDocumentLoadSequence;
    if (isCurrentDocument) {
      runSurfaceEditorWorkerAnalysis(documentItem.content || '', { sequence });
      loadEditor({ phase: 'analysis-layout', documentItem });
      renderChapters();
      renderTags();
      renderNotes();
      updateChapterStatus();
      saveToStorage(false);
    }

    Promise.resolve(tasks.commitPreviousSnapshot?.())
      .then(() => tasks.cleanupPreviousEditDraft?.())
      .then(previousEditDraftRemoved => tasks.savePreviousDocument?.(Boolean(previousEditDraftRemoved)))
      .then(() => {
        tasks.releasePreviousSnapshot?.();
        if (isCurrentDocument) setSaveStatusDot('saved', text().saved);
      })
      .catch(error => {
        console.warn('Background document save failed:', error);
        tasks.releasePreviousSnapshot?.();
        if (isCurrentDocument) setDefaultSaveStatus();
      });
  });
}

async function switchChap(index) {
  ensureChapters();
  if (index < 0 || index >= chapters.length || (!isDraftActive() && index === curChap)) return;
  if (isChapterEditDraftActive() && isEditingChapterTitle) {
    const titleCommitted = await commitChapterTitleEdit();
    if (!titleCommitted) return;
  }
  const switchedSnapshot = captureHiddenSwitchedDocumentSnapshot();
  const previousIndex = curChap;
  const previousDraftIndex = curDraft;
  const wasDraftActive = isDraftActive();
  const previousChapterEditKey = activeChapterEditKey;
  clearTimeout(autoSaveTimer);
  stopTimedAutoSave();
  activeEditorMode = 'chapter';
  isChapterEditUnlocked = false;
  activeChapterEditKey = null;
  syncDraftPromoteButton();
  curChap = index;
  const nextPartIndex = chapters[curChap]?.partIndex;
  const hasTargetPart = Number.isInteger(nextPartIndex) && nextPartIndex >= 0;
  curPart = hasTargetPart ? nextPartIndex : -1;
  expandedPartIndex = hasTargetPart ? curPart : -1;
  isRawChapterSectionExpanded = !hasTargetPart;
  isPartsListCollapsedByRaw = !hasTargetPart;
  isPartsListForceExpanded = hasTargetPart;
  if (hasTargetPart && chapterListOverflowMode === 'collapsed') chapterListOverflowMode = 'expanded';
  closeNameDetailPanel();
  closeNamingEntryPanel();
  closeCategoryActionPanel();
  closePartDetailsPanel();
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  closeFactComposer();
  const documentItem = activeEditorDocument() || chapters[curChap];
  const sequence = ++editorDocumentLoadSequence;
  loadEditor({ phase: 'paint', documentItem });
  syncImmediateSidebarDocumentHighlight('chapter', curChap, sequence);
  updateChapterStatus();
  scheduleEditorDocumentPostRender(sequence, documentItem, {
    commitPreviousSnapshot: () => {
      commitHiddenSwitchedSnapshotToMemory(switchedSnapshot);
    },
    cleanupPreviousEditDraft: () => switchedSnapshot.mode === 'chapter-edit-draft'
      ? cleanupActiveChapterEditDraftIfUnchanged(previousIndex, switchedSnapshot.chapterEditKey || previousChapterEditKey)
      : false,
    savePreviousDocument: previousEditDraftRemoved => wasDraftActive
      ? writeDraftToLocalFile(previousDraftIndex, switchedSnapshot.text || '')
      : switchedSnapshot.mode === 'chapter-edit-draft' && !previousEditDraftRemoved
        ? writeChapterEditDraftToLocalFile(switchedSnapshot.chapterEditKey || previousChapterEditKey, switchedSnapshot.text || '')
        : Promise.resolve(),
    releasePreviousSnapshot: () => releaseHiddenSwitchedSnapshot(switchedSnapshot)
    });
}

function loadEditor(options = {}) {
  if (!hasActiveStory()) {
    const editor = document.getElementById('editor');
    if (editor) {
      setEditorRenderMode(editor, 'plain');
      editor.dataset.placeholder = text().noStoryAvailable;
      setPlainTextEditorValue(editor, '');
    }
    lastSavedChapterHTML = '';
    updateStats();
    setSaveButtonSaved(true);
    syncDraftPromoteButton();
    updateEditorScrollThumb(false);
    positionEditorAutoScrollDepthMarker();
    resetEditorHistoryForActiveDocument();
    return;
  }

  ensureChapters();
  const editor = document.getElementById('editor');
  const documentItem = options.documentItem || activeEditorDocument() || chapters[curChap];
  if (!documentItem) {
    setEditorRenderMode(editor, 'plain');
    editor.dataset.placeholder = text().noSavedChapters;
    setPlainTextEditorValue(editor, '');
    lastSavedChapterHTML = '';
    updateStats();
    setSaveButtonSaved(true);
    syncDraftPromoteButton();
    syncActiveEditorEditState();
    updateEditorScrollThumb(false);
    positionEditorAutoScrollDepthMarker();
    resetEditorHistoryForActiveDocument();
    return;
  }
  if (typeof applyEditorGlobalTextFormatting === 'function') {
    applyEditorGlobalTextFormatting(documentItem);
  }
  const usingChapterEditDraft = isChapterEditDraftActive();
  if (!options.phase && shouldVirtualizeEditorDocument(documentItem)) {
    const sequence = ++editorDocumentLoadSequence;
    loadEditor({ phase: 'paint', documentItem });
    scheduleEditorDocumentPostRender(sequence, documentItem);
    return;
  }
  if (options.phase === 'paint') {
    resetActiveEditorHTMLBuffer(documentItem.content || '');
    if (shouldVirtualizeEditorDocument(documentItem)) {
      startVirtualEditorDocument(documentItem, editorDocumentLoadSequence);
    } else {
      clearVirtualEditorDocument();
      renderEditorDocumentContent(editor, documentItem);
    }
    const displayedParagraphMargin = isEditorReviewMode(editor) && typeof editorReviewModeMarginDefault === 'function'
      ? editorReviewModeMarginDefault()
      : null;
    applyEditorAlignment(documentItem.alignment);
    applyEditorSpacing(documentItem.lineHeight, documentItem.paragraphGap, displayedParagraphMargin, {
      resetDockManualSelection: true
    });
    if (typeof applyEditorFontFamily === 'function') applyEditorFontFamily(documentItem.fontFamily);
    if (typeof applyEditorFontSize === 'function') applyEditorFontSize(documentItem.fontSize);
    if (!usingChapterEditDraft) lastSavedChapterHTML = documentItem.content || '';
    setSaveButtonSaved(!usingChapterEditDraft);
    syncDraftPromoteButton();
    syncActiveEditorEditState();
    return;
  }
  if (typeof applyActiveEditorSettingsForDocument === 'function') {
    applyActiveEditorSettingsForDocument(documentItem);
  }
  let detectedParagraphGap = 0;
  if (!activeVirtualEditorDocument) {
    const spacingProbe = document.createElement('div');
    spacingProbe.innerHTML = documentItem.content || '';
    normalizeEditorGapMarkers(spacingProbe);
    if (typeof normalizeEditorParagraphBlocks === 'function') normalizeEditorParagraphBlocks(spacingProbe);
    detectedParagraphGap = detectEditorParagraphGap(spacingProbe);
  }
  const savedParagraphGap = typeof normalizeOptionalEditorParagraphGap === 'function'
    ? normalizeOptionalEditorParagraphGap(documentItem.paragraphGap)
    : (documentItem.paragraphGap === undefined || documentItem.paragraphGap === null || String(documentItem.paragraphGap).trim() === ''
      ? null
      : normalizeEditorParagraphGap(documentItem.paragraphGap));
  if (detectedParagraphGap > 0 && savedParagraphGap === null) {
    documentItem.paragraphGap = detectedParagraphGap;
  }
  if (!String(options.phase || '').startsWith('analysis')) renderEditorDocumentContent(editor, documentItem);
  const displayedParagraphMargin = isEditorReviewMode(editor) && typeof editorReviewModeMarginDefault === 'function'
    ? editorReviewModeMarginDefault()
    : null;
  applyEditorAlignment(documentItem.alignment);
  applyEditorSpacing(documentItem.lineHeight, documentItem.paragraphGap, displayedParagraphMargin, {
    resetDockManualSelection: true
  });
  if (typeof applyEditorFontFamily === 'function') applyEditorFontFamily(documentItem.fontFamily);
  if (typeof applyEditorFontSize === 'function') applyEditorFontSize(documentItem.fontSize);
  if (!usingChapterEditDraft) lastSavedChapterHTML = getCleanEditorHTML();
  if (options.phase !== 'analysis-layout') updateStats(options.phase === 'analysis' ? { sourceHTML: documentItem.content || '' } : {});
  if (!usingChapterEditDraft) setSaveButtonSaved(true);
  syncDraftPromoteButton();
  updateEditorScrollThumb(false);
  positionEditorAutoScrollDepthMarker();
  resetEditorHistoryForActiveDocument();
  if (options.phase !== 'analysis-layout') validateNamingMentionsAfterEditorLoad(documentItem.content || '');
}

function validateNamingMentionsAfterEditorLoad(sourceHTML = '') {
  if (!hasActiveStory() || typeof validateNamingEntriesWithoutStoryMentions !== 'function') return;
  const activeText = editorHTMLToText(sourceHTML);
  const scanOptions = { activeText };

  if (isDraftActive()) scanOptions.activeDraftIndex = curDraft;
  else scanOptions.activeChapterIndex = curChap;

  const storyMentionsChanged = validateNamingEntriesWithoutStoryMentions(scanOptions);
  if (storyMentionsChanged && typeof saveNamingData === 'function') saveNamingData();
}

async function addChapter() {
  await addDraft();
}

async function addDraft() {
  if (!hasActiveStory()) return;
  showAppLoader(text().creatingChapter);
  const nextIndex = chapterDrafts.length;
  const draft = normalizeDraft({
    ...createDefaultDraft(nextIndex),
    contentPath: nextDraftFilePath()
  }, nextIndex);

  chapterDrafts.push(draft);
  saveToStorage(false);
  renderChapters();
  setDraftBoxSaveIndicator('busy');
  await switchDraft(nextIndex);

  if (!projectDirectoryHandle) {
    setDraftBoxSaveIndicator('saved');
    hideAppLoader();
    return;
  }

  requestAnimationFrame(() => {
    const savedDraft = chapterDrafts[nextIndex] || draft;
    getProjectFileHandle(savedDraft.contentPath, { create: true })
      .then(fileHandle => {
        savedDraft.contentHandle = fileHandle;
        return writeDraftsDataToProject();
      })
      .then(() => setDraftBoxSaveIndicator('saved'))
      .catch(error => {
        console.warn('Draft create failed:', error);
        setDraftBoxSaveIndicator('idle');
      })
      .finally(() => hideAppLoader());
  });
}

function hasRawChaptersInPanel(manifest = normalizeProjectManifest(projectManifest || createProjectManifest())) {
  return Boolean(
    manifest.parts.length &&
    chapters.some(chapter => {
      const partIndex = Number.isInteger(chapter.partIndex) ? chapter.partIndex : -1;
      return partIndex < 0 || partIndex >= manifest.parts.length;
    })
  );
}

function collapseChapterListsForDraftEditor() {
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const hasParts = manifest.parts.length > 0;
  curPart = -1;
  expandedPartIndex = -1;
  isRawChapterSectionExpanded = false;
  isPartsListCollapsedByRaw = hasParts;
  isPartsListForceExpanded = false;
  chapterListOverflowMode = hasParts ? 'collapsed' : 'normal';
}

function openDraftPromoteDestinationPanel(draftIndex, anchor = null) {
  chapterDrafts = normalizeDrafts(chapterDrafts);
  const panel = document.getElementById('draftDetailsPanel');
  const draft = chapterDrafts[draftIndex];
  if (!panel || !draft) return;

  const copy = text();
  const openedFromDraftActionPanel = Boolean(anchor?.closest?.('#draftDetailsPanel'));
  const positionAnchor = openedFromDraftActionPanel ? floatingAnchorSnapshot(anchor) : anchor;
  const positionKey = openedFromDraftActionPanel
    ? 'draftActionPromoteDestinationPanel'
    : 'editorPromoteDestinationPanel';
  closePartDetailsPanel();
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  activeDraftDetailsIndex = `promote:${draftIndex}`;
  activeFloatingAnchor = positionAnchor;
  panel.dataset.positionKey = positionKey;
  panel.classList.add('draft-actions-panel', 'draft-promote-destination-panel');
  panel.innerHTML = `
    <div class="part-details-head draft-delete-confirm-head">
      <strong>${escapeHtml(copy.promoteDestinationTitle)}</strong>
      <button class="name-panel-close" type="button" onclick="closeDraftActionsPanel()">${CROSS_CLOSE_SVG}</button>
    </div>
    <p class="draft-delete-confirm-copy">${escapeHtml(copy.promoteDestinationBody)}</p>
    <div class="draft-promote-choice-grid">
      <button class="draft-promote-choice-btn" type="button" onclick="confirmDraftPromoteDestination(${draftIndex}, 'part')">
        ${escapeHtml(copy.promoteToRecentPart)}
      </button>
      <button class="draft-promote-choice-btn" type="button" onclick="confirmDraftPromoteDestination(${draftIndex}, 'raw')">
        ${escapeHtml(copy.promoteToRawChapters)}
      </button>
    </div>`;

  panel.hidden = false;
  positionFloatingPanel(panel, positionAnchor);
}

async function confirmDraftPromoteDestination(draftIndex, destination = 'part') {
  await promoteDraftToChapter(draftIndex, destination);
}

async function requestPromoteDraftToChapter(draftIndex, anchor = null) {
  ensureChapters();
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  if (hasRawChaptersInPanel(manifest)) {
    openDraftPromoteDestinationPanel(draftIndex, anchor || document.getElementById('promoteDraftBtn'));
    return;
  }

  await promoteDraftToChapter(draftIndex, 'part');
}

async function switchDraft(index) {
  ensureChapters();
  if (index < 0 || index >= chapterDrafts.length || (isDraftActive() && index === curDraft)) return;
  selectedDraftIndexes.clear();
  lastSelectedDraftIndex = index;
  selectedChapterIndexes.clear();
  selectedChapterScope = null;
  if (isChapterEditDraftActive() && isEditingChapterTitle) {
    const titleCommitted = await commitChapterTitleEdit();
    if (!titleCommitted) return;
  }
  const switchedSnapshot = captureHiddenSwitchedDocumentSnapshot();
  const previousChapterIndex = curChap;
  const previousDraftIndex = curDraft;
  const wasDraftActive = isDraftActive();
  const previousChapterEditKey = activeChapterEditKey;
  clearTimeout(autoSaveTimer);
  stopTimedAutoSave();
  activeEditorMode = 'draft';
  isChapterEditUnlocked = false;
  activeChapterEditKey = null;
  curDraft = index;
  collapseChapterListsForDraftEditor();
  syncActiveEditorEditState();
  closeNameDetailPanel();
  closeNamingEntryPanel();
  closeCategoryActionPanel();
  closePartDetailsPanel();
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  closeFactComposer();
  const documentItem = activeEditorDocument() || chapterDrafts[curDraft];
  const sequence = ++editorDocumentLoadSequence;
  loadEditor({ phase: 'paint', documentItem });
  syncImmediateSidebarDocumentHighlight('draft', curDraft, sequence);
  updateChapterStatus();
  scheduleEditorDocumentPostRender(sequence, documentItem, {
    commitPreviousSnapshot: () => {
      commitHiddenSwitchedSnapshotToMemory(switchedSnapshot);
    },
    cleanupPreviousEditDraft: () => switchedSnapshot.mode === 'chapter-edit-draft'
      ? cleanupActiveChapterEditDraftIfUnchanged(previousChapterIndex, switchedSnapshot.chapterEditKey || previousChapterEditKey)
      : false,
    savePreviousDocument: previousEditDraftRemoved => wasDraftActive
      ? writeDraftToLocalFile(previousDraftIndex, switchedSnapshot.text || '')
      : switchedSnapshot.mode === 'chapter-edit-draft' && !previousEditDraftRemoved
        ? writeChapterEditDraftToLocalFile(switchedSnapshot.chapterEditKey || previousChapterEditKey, switchedSnapshot.text || '')
        : Promise.resolve(),
    releasePreviousSnapshot: () => releaseHiddenSwitchedSnapshot(switchedSnapshot)
    });
}

async function promoteDraftToChapter(draftIndex, destination = 'part') {
  ensureChapters();
  const draft = chapterDrafts[draftIndex];
  if (!draft) return;

  showAppLoader(text().saveDraftAsChapter);
  if (isDraftActive() && draftIndex === curDraft) {
    draft.content = getCleanEditorHTML();
    setDraftWordCache(draftIndex, countWordsFromText(getCleanEditorText()));
  }

  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const hasParts = manifest.parts.length > 0;
  const shouldPromoteToRaw = destination === 'raw' && hasRawChaptersInPanel(manifest);
  const targetPartIndex = shouldPromoteToRaw ? -1 : hasParts ? latestPartIndex(manifest) : -1;

  const nextIndex = chapters.length;
  const partChapterCount = targetPartIndex >= 0
    ? chapters.filter(chapter => chapter.partIndex === targetPartIndex).length
    : hasParts
      ? chapters.filter(chapter => {
        const partIndex = Number.isInteger(chapter.partIndex) ? chapter.partIndex : -1;
        return partIndex < 0 || partIndex >= manifest.parts.length;
      }).length
      : chapters.length;
  const promotedAt = new Date().toISOString();
  const promotedTitle = draft.title || `${text().newChapterPrefix} ${nextIndex + 1}`;
  if (chapterTitleExists(promotedTitle)) {
    showDuplicateReminder(text().duplicateChapterTitle);
    hideAppLoader();
    return;
  }

  const chapter = normalizeChapter({
    id: Date.now(),
    title: promotedTitle,
    content: draft.content || '',
    notes: draft.notes || [],
    contentPath: chapterFilePath(nextIndex),
    partIndex: targetPartIndex,
    chapterNo: partChapterCount + 1,
    createdAt: promotedAt,
    alignment: draft.alignment,
    lineHeight: draft.lineHeight,
    paragraphGap: draft.paragraphGap,
    paragraphMargin: draft.paragraphMargin,
    fontFamily: draft.fontFamily,
    fontSize: draft.fontSize,
    _wordCount: Number.isFinite(draft._wordCount) ? draft._wordCount : wordCount(draft.content)
  }, nextIndex, targetPartIndex, partChapterCount);
  const draftPath = draft.contentPath;
  const chapterText = isDraftActive() && draftIndex === curDraft
    ? getCleanEditorText()
    : editorHTMLToText(draft.content);

  chapters.push(chapter);
  scanCurrentChapterForNamingUses(nextIndex, chapterText, promotedAt);
  chapterDrafts.splice(draftIndex, 1);
  chapterDrafts = normalizeDrafts(chapterDrafts);
  selectedDraftIndexes.clear();
  lastSelectedDraftIndex = null;
  activeEditorMode = 'chapter';
  isChapterEditUnlocked = false;
  syncDraftPromoteButton();
  curChap = nextIndex;
  curDraft = chapterDrafts.length ? Math.min(draftIndex, chapterDrafts.length - 1) : -1;
  curPart = targetPartIndex;
  expandedPartIndex = targetPartIndex;
  isRawChapterSectionExpanded = shouldPromoteToRaw;
  isPartsListCollapsedByRaw = shouldPromoteToRaw;
  isPartsListForceExpanded = !shouldPromoteToRaw && targetPartIndex >= 0;
  if (!shouldPromoteToRaw && targetPartIndex >= 0 && chapterListOverflowMode === 'collapsed') chapterListOverflowMode = 'expanded';
  persistProjectManifestSnapshot();
  saveToStorage(false);
  closeDraftActionsPanel();
  setDraftBoxSaveIndicator('busy');
  loadEditor();
  renderChapters();
  renderTags();
  renderNotes();
  updateChapterStatus();

  try {
    if (projectDirectoryHandle) {
      const chapterHandle = await getProjectFileHandle(chapter.contentPath, { create: true });
      chapter.contentHandle = chapterHandle;
      await writeFileText(chapterHandle, chapterText);
      await removeProjectFileIfExists(draftPath);
      await writeProjectManifest();
      await writeDraftsDataToProject();
      await writeNamingDataToProject();
    }
    rememberCurrentChapterSaved();
    setDraftBoxSaveIndicator('saved');
  } catch (error) {
    console.warn('Draft promote failed:', error);
    setDraftBoxSaveIndicator('idle');
  } finally {
    hideAppLoader();
  }
}

async function promoteActiveDraftToChapter() {
  if (!isDraftActive()) return;
  await requestPromoteDraftToChapter(curDraft, document.getElementById('promoteDraftBtn'));
}

function expandSidebarSectionForActiveChapter() {
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const hasParts = manifest.parts.length > 0;
  if (!hasParts) {
    curPart = -1;
    expandedPartIndex = -1;
    isRawChapterSectionExpanded = false;
    isPartsListCollapsedByRaw = false;
    isPartsListForceExpanded = false;
    chapterListOverflowMode = 'normal';
    return 'chapter';
  }

  const activePartIndex = chapters[curChap]?.partIndex;
  const hasActivePart = Number.isInteger(activePartIndex) && activePartIndex >= 0 && activePartIndex < manifest.parts.length;
  if (hasActivePart) {
    curPart = activePartIndex;
    expandedPartIndex = activePartIndex;
    isRawChapterSectionExpanded = false;
    isPartsListCollapsedByRaw = false;
    isPartsListForceExpanded = true;
    if (chapterListOverflowMode === 'collapsed') chapterListOverflowMode = 'expanded';
    return 'chapter';
  }

  curPart = -1;
  expandedPartIndex = -1;
  isRawChapterSectionExpanded = chapters.length > 0;
  isPartsListCollapsedByRaw = chapters.length > 0;
  isPartsListForceExpanded = false;
  return chapters.length ? 'raw' : 'chapter';
}

function activateRecentDraftOrChapterAfterDraftDelete() {
  clearTimeout(autoSaveTimer);
  stopTimedAutoSave();
  isChapterEditUnlocked = false;
  activeChapterEditKey = null;
  if (chapterDrafts.length) {
    activeEditorMode = 'draft';
    curDraft = chapterDrafts.length - 1;
    collapseChapterListsForDraftEditor();
    loadEditor();
    syncActiveEditorEditState();
    return 'draft';
  } else {
    activeEditorMode = 'chapter';
    curDraft = -1;
    curChap = chapters.length ? chapters.length - 1 : 0;
    const sidebarTarget = expandSidebarSectionForActiveChapter();
    loadEditor();
    syncActiveEditorEditState();
    return sidebarTarget;
  }
}

let pendingDraftNamingCleanupRequest = null;
let draftNamingCleanupRememberMode = 'once';

function normalizeDraftNamingCleanupPreference(value = localStorage.getItem(DRAFT_NAMING_DELETE_PROMPT_KEY)) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    const mode = parsed?.mode === 'always' ? 'always' : 'once';
    const action = parsed?.action === 'delete' ? 'delete' : parsed?.action === 'keep' ? 'keep' : '';
    return { mode, action };
  } catch (error) {
    return { mode: 'once', action: '' };
  }
}

function saveDraftNamingCleanupPreference(action, mode = draftNamingCleanupRememberMode) {
  const normalizedMode = mode === 'always' ? 'always' : 'once';
  const normalizedAction = action === 'delete' ? 'delete' : 'keep';
  localStorage.setItem(DRAFT_NAMING_DELETE_PROMPT_KEY, JSON.stringify({
    mode: normalizedMode,
    action: normalizedAction
  }));
}

function normalizeDraftNamingCleanupPath(path = '') {
  return String(path || '').replace(/\\/g, '/').trim();
}

function draftNamingCleanupEntriesForIndexes(indexes = []) {
  namingData = normalizeNamingData(namingData);
  const draftRefs = indexes
    .map(index => ({ index, draft: chapterDrafts[index] }))
    .filter(ref => ref.draft);
  if (!draftRefs.length) return [];

  const draftPaths = new Set(draftRefs
    .flatMap(({ draft, index }) => [
      draft.contentPath,
      draftFilePath(index)
    ])
    .map(normalizeDraftNamingCleanupPath)
    .filter(Boolean));
  const draftIndexes = new Set(draftRefs.map(({ index }) => index));

  return namingData.entries.filter(entry => {
    if (normalizeNamingEntryStatus(entry) !== 'draft') return false;
    const entryPaths = [entry.draftKey, entry.contentPath, entry.chapterKey]
      .map(normalizeDraftNamingCleanupPath)
      .filter(Boolean);
    if (entryPaths.some(entryPath => draftPaths.has(entryPath))) return true;
    return !entryPaths.length && Number.isInteger(entry.draftIndex) && draftIndexes.has(entry.draftIndex);
  });
}

function updateDraftNamingCleanupRememberButtons() {
  document.querySelectorAll('[data-draft-name-cleanup-mode]').forEach(button => {
    const isActive = button.dataset.draftNameCleanupMode === draftNamingCleanupRememberMode;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function setDraftNamingCleanupRememberMode(mode = 'once') {
  draftNamingCleanupRememberMode = mode === 'always' ? 'always' : 'once';
  updateDraftNamingCleanupRememberButtons();
}

function openDraftNamingCleanupPanel(indexes = [], loaderLabel = text().deleteDrafts, entries = []) {
  const panel = document.getElementById('draftDetailsPanel');
  if (!panel || !entries.length) return false;

  const copy = text();
  const uniqueEntries = [...new Map(entries.map(entry => [entry.id, entry])).values()];
  const positionAnchor = activeFloatingAnchor || panel;
  const namesPreview = uniqueEntries
    .slice(0, 6)
    .map(entry => `<span>${escapeHtml(entry.name)}</span>`)
    .join('');
  const moreCount = Math.max(0, uniqueEntries.length - 6);
  pendingDraftNamingCleanupRequest = {
    indexes: [...indexes],
    loaderLabel,
    entryIds: uniqueEntries.map(entry => entry.id)
  };
  draftNamingCleanupRememberMode = 'once';

  closePartDetailsPanel();
  closeChapterDetailsPanel();
  activeDraftDetailsIndex = `name-cleanup:${indexes.join(',')}`;
  activeFloatingAnchor = positionAnchor;
  panel.dataset.positionKey = 'draftDeleteConfirmPanel';
  panel.classList.add('draft-actions-panel', 'draft-delete-confirm-panel', 'draft-naming-cleanup-panel');
  panel.innerHTML = `
    <div class="draft-name-cleanup-card">
      <div class="draft-name-cleanup-top">
        <span class="draft-name-cleanup-kicker">${escapeHtml(copy.draftNameCleanupKicker)}</span>
        <span class="draft-delete-count">${uniqueEntries.length}</span>
        <button class="name-panel-close" type="button" onclick="cancelDraftNamingCleanupPanel()">${CROSS_CLOSE_SVG}</button>
      </div>
      <h2>${escapeHtml(copy.draftNameCleanupTitle)}</h2>
      <p class="draft-delete-confirm-copy">${escapeHtml(copy.draftNameCleanupBody.replace('{count}', uniqueEntries.length))}</p>
      ${namesPreview ? `<div class="draft-name-cleanup-preview">${namesPreview}${moreCount ? `<span>+${moreCount}</span>` : ''}</div>` : ''}
      <div class="draft-panel-actions draft-delete-confirm-actions draft-name-cleanup-actions">
        <button class="panel-mini-btn" type="button" onclick="confirmDraftNamingCleanup('keep')">${escapeHtml(copy.draftNameCleanupKeep)}</button>
        <button class="part-delete-btn" type="button" onclick="confirmDraftNamingCleanup('delete')">${escapeHtml(copy.draftNameCleanupDelete)}</button>
      </div>
      <div class="draft-name-cleanup-remember">
        <span>${escapeHtml(copy.draftNameCleanupRemember)}</span>
        <div class="draft-name-cleanup-mode-group">
          <button class="draft-name-cleanup-mode-btn is-active" type="button" data-draft-name-cleanup-mode="once" aria-pressed="true" onclick="setDraftNamingCleanupRememberMode('once')">${escapeHtml(copy.draftNameCleanupOnce)}</button>
          <button class="draft-name-cleanup-mode-btn" type="button" data-draft-name-cleanup-mode="always" aria-pressed="false" onclick="setDraftNamingCleanupRememberMode('always')">${escapeHtml(copy.draftNameCleanupAlways)}</button>
        </div>
      </div>
    </div>`;

  panel.hidden = false;
  positionFloatingPanel(panel, positionAnchor);
  requestAnimationFrame(() => panel.querySelector('.draft-name-cleanup-actions .part-delete-btn')?.focus({ preventScroll: true }));
  return true;
}

function cancelDraftNamingCleanupPanel() {
  pendingDraftNamingCleanupRequest = null;
  closeDraftActionsPanel();
}

async function confirmDraftNamingCleanup(action = 'keep') {
  const request = pendingDraftNamingCleanupRequest;
  if (!request) {
    closeDraftActionsPanel();
    return;
  }
  const normalizedAction = action === 'delete' ? 'delete' : 'keep';
  saveDraftNamingCleanupPreference(normalizedAction, draftNamingCleanupRememberMode);
  pendingDraftNamingCleanupRequest = null;
  closeDraftActionsPanel();
  await deleteDraftsByIndexes(request.indexes, request.loaderLabel, {
    namingCleanupAction: normalizedAction,
    namingCleanupEntryIds: request.entryIds
  });
}

function cleanupDetectedNamingEntryReferences(entryIds = new Set()) {
  if (!entryIds.size || !namingData.detectedByChapter) return;
  namingData.detectedByChapter = Object.fromEntries(
    Object.entries(namingData.detectedByChapter)
      .map(([chapterKey, detectedIds]) => [
        chapterKey,
        (Array.isArray(detectedIds) ? detectedIds : []).filter(entryId => !entryIds.has(entryId))
      ])
      .filter(([, detectedIds]) => detectedIds.length > 0)
  );
}

function applyDraftNamingCleanupDecision(entries = [], action = 'keep', deletedAt = new Date().toISOString()) {
  const cleanupIds = new Set(entries.map(entry => entry.id).filter(Boolean));
  if (!cleanupIds.size) return false;

  namingData = normalizeNamingData(namingData);
  if (action === 'delete') {
    namingData.entries = namingData.entries.filter(entry => !cleanupIds.has(entry.id));
    cleanupDetectedNamingEntryReferences(cleanupIds);
    namingData = normalizeNamingData(namingData);
    return true;
  }

  let didChange = false;
  namingData.entries.forEach(entry => {
    if (!cleanupIds.has(entry.id)) return;
    const sourceMeta = {
      draftKey: entry.draftKey || entry.chapterKey || entry.contentPath || null,
      draftIndex: entry.draftIndex ?? null,
      draftNo: entry.draftNo ?? null,
      draftTitle: entry.draftTitle || entry.chapterTitle || text().draftPrefix,
      contentPath: entry.contentPath || entry.draftKey || entry.chapterKey || null,
      orphanedAt: deletedAt
    };
    entry.chapterStatus = 'orphan';
    entry.documentType = 'orphan';
    entry.chapterIndex = null;
    entry.chapterNo = null;
    entry.orphanedAt = deletedAt;
    entry.orphanedFromDraft = entry.orphanedFromDraft || sourceMeta;
    didChange = true;
  });

  if (didChange) namingData = normalizeNamingData(namingData);
  return didChange;
}

async function deleteDraftsByIndexes(indexes = [], loaderLabel = text().deleteDrafts, options = {}) {
  chapterDrafts = normalizeDrafts(chapterDrafts);
  chapterTrashDrafts = normalizeTrashDrafts(chapterTrashDrafts);
  const hadDraftsBeforeDelete = chapterDrafts.length > 0;
  const deleteIndexes = normalizedDraftDeleteIndexes(indexes);
  if (!deleteIndexes.length) return;
  if (draftDeleteWouldEmptyStoryEditor(deleteIndexes)) {
    showDraftDeleteBlockedReminder();
    return;
  }

  let namingCleanupAction = options.namingCleanupAction === 'delete'
    ? 'delete'
    : options.namingCleanupAction === 'keep'
      ? 'keep'
      : '';
  let namingCleanupEntries = draftNamingCleanupEntriesForIndexes(deleteIndexes);
  if (options.namingCleanupEntryIds?.length) {
    const allowedIds = new Set(options.namingCleanupEntryIds);
    namingCleanupEntries = namingCleanupEntries.filter(entry => allowedIds.has(entry.id));
  }
  if (namingCleanupEntries.length && !namingCleanupAction) {
    const preference = normalizeDraftNamingCleanupPreference();
    if (preference.mode === 'always' && preference.action) {
      namingCleanupAction = preference.action;
    } else {
      openDraftNamingCleanupPanel(deleteIndexes, loaderLabel, namingCleanupEntries);
      return;
    }
  }

  showAppLoader(loaderLabel);
  const deleteSet = new Set(deleteIndexes);
  const activeDraftDeleted = isDraftActive() && deleteSet.has(curDraft);
  const activeDraft = isDraftActive() ? chapterDrafts[curDraft] : null;
  if (activeDraft && !activeDraftDeleted) {
    activeDraft.content = getCleanEditorHTML();
    setDraftWordCache(curDraft, countWordsFromText(getCleanEditorText()));
  }
  if (activeDraft && activeDraftDeleted) {
    activeDraft.content = getCleanEditorHTML();
    setDraftWordCache(curDraft, countWordsFromText(getCleanEditorText()));
  }

  const reservedTrashPaths = new Set(chapterTrashDrafts.map(draft => draft.contentPath).filter(Boolean));
  const reserveTrashPath = () => {
    let pathIndex = chapterTrashDrafts.length;
    let trashPath = trashDraftFilePath(pathIndex);
    while (reservedTrashPaths.has(trashPath)) {
      pathIndex += 1;
      trashPath = trashDraftFilePath(pathIndex);
    }
    reservedTrashPaths.add(trashPath);
    return trashPath;
  };
  const deletedAt = new Date().toISOString();
  const namingCleanupChanged = namingCleanupEntries.length && namingCleanupAction
    ? applyDraftNamingCleanupDecision(namingCleanupEntries, namingCleanupAction, deletedAt)
    : false;
  const permanentlyDeletedPaths = [];
  const trashPayloads = deleteIndexes
    .map(index => {
      const draft = chapterDrafts[index];
      if (!draft) return null;
      const draftText = activeDraftDeleted && index === curDraft
        ? getCleanEditorText()
        : editorHTMLToText(draft.content || '');
      const wordTotal = countWordsFromText(draftText);
      if (wordTotal <= 0) {
        if (draft.contentPath) permanentlyDeletedPaths.push(draft.contentPath);
        return null;
      }
      const trashPath = reserveTrashPath();
      const trashDraft = normalizeTrashDraft({
        ...draft,
        content: draft.content || textToEditorHTML(draftText),
        contentPath: trashPath,
        contentHandle: null,
        originalDraftNo: draft.draftNo || index + 1,
        originalContentPath: draft.contentPath || '',
        deletedAt,
        _wordCount: Number.isFinite(draft._wordCount) ? draft._wordCount : wordTotal
      }, chapterTrashDrafts.length);
      return {
        draft,
        originalPath: draft.contentPath,
        trashDraft,
        draftText
      };
    })
    .filter(Boolean);

  const remainingDrafts = chapterDrafts.filter((_, index) => !deleteSet.has(index));
  const remainingActiveDraftIndex = activeDraft ? remainingDrafts.indexOf(activeDraft) : -1;
  chapterTrashDrafts = normalizeTrashDrafts([...chapterTrashDrafts, ...trashPayloads.map(payload => payload.trashDraft)]);
  chapterDrafts = normalizeDrafts(remainingDrafts);
  selectedDraftIndexes.clear();
  lastSelectedDraftIndex = null;
  const draftsExhausted = hadDraftsBeforeDelete && !chapterDrafts.length;
  let sidebarFocusTargetAfterDelete = null;

  if (activeDraftDeleted) {
    sidebarFocusTargetAfterDelete = activateRecentDraftOrChapterAfterDraftDelete();
  } else if (isDraftActive()) {
    curDraft = remainingActiveDraftIndex >= 0
      ? remainingActiveDraftIndex
      : (chapterDrafts.length ? Math.min(curDraft, chapterDrafts.length - 1) : -1);
  } else if (curDraft >= chapterDrafts.length) {
    curDraft = chapterDrafts.length ? chapterDrafts.length - 1 : -1;
  }
  if (!activeDraftDeleted && draftsExhausted && activeEditorMode !== 'trash') {
    sidebarFocusTargetAfterDelete = expandSidebarSectionForActiveChapter();
  }

  closeDraftActionsPanel();
  setDraftBoxSaveIndicator('busy');
  renderChapters();
  if (sidebarFocusTargetAfterDelete) focusSidebarItemAfterRender(sidebarFocusTargetAfterDelete);
  renderTags();
  renderNotes();
  updateChapterStatus();
  saveToStorage(false);

  try {
    if (projectDirectoryHandle) {
      await getProjectDirectoryHandle(PROJECT_TRASH_DIR, { create: true });
      for (const payload of trashPayloads) {
        const trashHandle = await getProjectFileHandle(payload.trashDraft.contentPath, { create: true });
        payload.trashDraft.contentHandle = trashHandle;
        await writeFileText(trashHandle, payload.draftText);
      }
      for (const payload of trashPayloads) {
        if (payload.originalPath) await removeProjectFileIfExists(payload.originalPath);
      }
      for (const draftPath of permanentlyDeletedPaths) {
        await removeProjectFileIfExists(draftPath);
      }
      await writeDraftsDataToProject();
      await writeTrashDraftsDataToProject();
      if (namingCleanupChanged) await writeNamingDataToProject();
    }
    setDraftBoxSaveIndicator('saved');
    const onlyPermanentDelete = trashPayloads.length === 0;
    showMiniReminder(onlyPermanentDelete
      ? (deleteIndexes.length === 1 ? text().draftDeletedForever : text().draftsDeletedForever)
      : (deleteIndexes.length === 1 ? text().draftMovedToTrash : text().draftsMovedToTrash));
  } catch (error) {
    console.warn('Draft delete failed:', error);
    setDraftBoxSaveIndicator('idle');
  } finally {
    hideAppLoader();
  }
}

async function deleteDraftBatchFromPanel(deleteAll = false) {
  chapterDrafts = normalizeDrafts(chapterDrafts);
  normalizeDraftSelection();
  const deleteIndexes = deleteAll || !selectedDraftIndexes.size
    ? chapterDrafts.map((_, index) => index)
    : Array.from(selectedDraftIndexes);
  const loaderLabel = deleteAll || !selectedDraftIndexes.size ? text().deleteAllDrafts : text().deleteSelectedDrafts;
  await deleteDraftsByIndexes(deleteIndexes, loaderLabel);
}

async function deleteDraftWithConfirm(draftIndex) {
  if (!chapterDrafts[draftIndex]) return;
  await deleteDraftsByIndexes([draftIndex], text().deleteDraft);
}

function trashDraftBatchIndexes() {
  chapterTrashDrafts = normalizeTrashDrafts(chapterTrashDrafts);
  normalizeTrashDraftSelection();
  return (selectedTrashDraftIndexes.size
    ? Array.from(selectedTrashDraftIndexes)
    : chapterTrashDrafts.map((_, index) => index))
    .filter(index => Number.isInteger(index) && index >= 0 && index < chapterTrashDrafts.length)
    .sort((left, right) => left - right);
}

async function restoreTrashDraftsByIndexes(indexes = [], loaderLabel = text().restoreDrafts) {
  chapterDrafts = normalizeDrafts(chapterDrafts);
  chapterTrashDrafts = normalizeTrashDrafts(chapterTrashDrafts);
  const restoreIndexes = [...new Set(indexes)]
    .filter(index => Number.isInteger(index) && index >= 0 && index < chapterTrashDrafts.length)
    .sort((left, right) => left - right);
  if (!restoreIndexes.length) return;

  showAppLoader(loaderLabel);
  const restoreSet = new Set(restoreIndexes);
  const reservedDraftPaths = new Set(chapterDrafts.map(draft => draft.contentPath).filter(Boolean));
  const reserveDraftPath = draftIndex => {
    let pathIndex = draftIndex;
    let draftPath = draftFilePath(pathIndex);
    while (reservedDraftPaths.has(draftPath)) {
      pathIndex += 1;
      draftPath = draftFilePath(pathIndex);
    }
    reservedDraftPaths.add(draftPath);
    return draftPath;
  };

  const restorePayloads = [];
  for (const trashIndex of restoreIndexes) {
    const trashDraft = chapterTrashDrafts[trashIndex];
    if (!trashDraft) continue;
    const draftIndex = chapterDrafts.length + restorePayloads.length;
    const draftPath = reserveDraftPath(draftIndex);
    let draftText = editorHTMLToText(trashDraft.content || '');
    if (!draftText && projectDirectoryHandle && trashDraft.contentPath) {
      draftText = await readProjectTextFileIfExists(trashDraft.contentPath) || '';
      trashDraft.content = trashDraft.content || textToEditorHTML(draftText);
    }
    const restoredDraft = normalizeDraft({
      ...trashDraft,
      content: trashDraft.content || textToEditorHTML(draftText),
      contentPath: draftPath,
      contentHandle: null,
      draftNo: draftIndex + 1,
      _wordCount: Number.isFinite(trashDraft._wordCount) ? trashDraft._wordCount : countWordsFromText(draftText)
    }, draftIndex);
    restorePayloads.push({
      trashDraft,
      restoredDraft,
      draftText,
      trashPath: trashDraft.contentPath
    });
  }
  if (!restorePayloads.length) {
    hideAppLoader();
    return;
  }

  chapterTrashDrafts = normalizeTrashDrafts(chapterTrashDrafts.filter((_, index) => !restoreSet.has(index)));
  chapterDrafts = normalizeDrafts([...chapterDrafts, ...restorePayloads.map(payload => payload.restoredDraft)]);
  selectedTrashDraftIndexes.clear();
  lastSelectedTrashDraftIndex = null;
  selectedDraftIndexes.clear();
  lastSelectedDraftIndex = null;
  activeEditorMode = 'draft';
  curDraft = chapterDrafts.length - 1;
  curChap = chapters.length ? curChap : 0;
  isDraftTrashMode = false;
  collapseChapterListsForDraftEditor();

  closeDraftActionsPanel();
  renderChapters();
  loadEditor();
  renderTags();
  renderNotes();
  updateChapterStatus();
  saveToStorage(false);

  try {
    if (projectDirectoryHandle) {
      await getProjectDirectoryHandle('Drafts', { create: true });
      for (const payload of restorePayloads) {
        const draftHandle = await getProjectFileHandle(payload.restoredDraft.contentPath, { create: true });
        payload.restoredDraft.contentHandle = draftHandle;
        await writeFileText(draftHandle, payload.draftText);
      }
      for (const payload of restorePayloads) {
        if (payload.trashPath) await removeProjectFileIfExists(payload.trashPath);
      }
      await writeDraftsDataToProject();
      await writeTrashDraftsDataToProject();
    }
    showMiniReminder(restorePayloads.length === 1 ? text().draftRestored : text().draftsRestored);
  } catch (error) {
    console.warn('Trash draft restore failed:', error);
    showMiniReminder(text().storyCreateFailed);
  } finally {
    hideAppLoader();
  }
}

async function restoreTrashDraftBatchFromPanel() {
  await restoreTrashDraftsByIndexes(trashDraftBatchIndexes(), text().restoreDrafts);
}

async function permanentlyDeleteTrashDraftsByIndexes(indexes = [], loaderLabel = text().permanentlyDeleteDrafts) {
  chapterTrashDrafts = normalizeTrashDrafts(chapterTrashDrafts);
  const deleteIndexes = [...new Set(indexes)]
    .filter(index => Number.isInteger(index) && index >= 0 && index < chapterTrashDrafts.length)
    .sort((left, right) => left - right);
  if (!deleteIndexes.length) return;

  showAppLoader(loaderLabel);
  const deleteSet = new Set(deleteIndexes);
  const trashPaths = deleteIndexes
    .map(index => chapterTrashDrafts[index]?.contentPath)
    .filter(Boolean);
  const activeTrashDeleted = activeEditorMode === 'trash' && deleteSet.has(curTrashDraft);

  chapterTrashDrafts = normalizeTrashDrafts(chapterTrashDrafts.filter((_, index) => !deleteSet.has(index)));
  selectedTrashDraftIndexes.clear();
  lastSelectedTrashDraftIndex = null;
  if (!chapterTrashDrafts.length) {
    isDraftTrashMode = false;
    if (activeEditorMode === 'trash') restoreEditorAfterTrashMode();
  } else if (activeEditorMode === 'trash' && (activeTrashDeleted || curTrashDraft >= chapterTrashDrafts.length)) {
    curTrashDraft = Math.min(curTrashDraft, chapterTrashDrafts.length - 1);
  }
  closeDraftActionsPanel();
  renderChapters();
  loadEditor();
  updateChapterStatus();
  saveToStorage(false);

  try {
    if (projectDirectoryHandle) {
      for (const trashPath of trashPaths) {
        await removeProjectFileIfExists(trashPath);
      }
      await writeTrashDraftsDataToProject();
    }
    showMiniReminder(deleteIndexes.length === 1 ? text().draftDeletedForever : text().draftsDeletedForever);
  } catch (error) {
    console.warn('Trash draft permanent delete failed:', error);
    showMiniReminder(text().storyCreateFailed);
  } finally {
    hideAppLoader();
  }
}

async function permanentlyDeleteTrashDraftBatchFromPanel() {
  await permanentlyDeleteTrashDraftsByIndexes(trashDraftBatchIndexes(), text().permanentlyDeleteDrafts);
}

async function addChapterToPart() {
  showAppLoader(text().creatingChapter);
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  if (!manifest.parts.length) {
    manifest.parts.push(createDefaultPart(0));
    chapters.forEach((chapter, index) => {
      chapter.partIndex = 0;
      chapter.chapterNo = index + 1;
    });
  }
  curPart = latestPartIndex(manifest);
  expandedPartIndex = curPart;
  if (!manifest.parts[curPart]) {
    manifest.parts[curPart] = createDefaultPart(curPart);
    manifest.parts[curPart].chapters = [];
  }

  projectManifest = manifest;
  const partChapterCount = chapters.filter(chapter => chapter.partIndex === curPart).length;
  const nextIndex = chapters.length;
  const defaultTitle = `${text().newChapterPrefix} ${nextIndex + 1}`;
  const chapter = normalizeChapter({
    id: Date.now(),
    title: defaultTitle,
    content: '',
    notes: [],
    contentPath: chapterFilePath(nextIndex),
    partIndex: curPart,
    chapterNo: partChapterCount + 1,
    createdAt: new Date().toISOString(),
    ...editorGlobalTextFormattingDefaults(),
    _wordCount: 0
  }, nextIndex, curPart, partChapterCount);

  chapters.push(chapter);

  persistProjectManifestSnapshot();
  saveToStorage(false);

  await switchChap(nextIndex);

  if (!projectDirectoryHandle) {
    setSaveStatusDot('saved', text().chapterInfoSaved);
    hideAppLoader();
    return;
  }

  requestAnimationFrame(() => {
    getProjectFileHandle(chapter.contentPath, { create: true })
      .then(fileHandle => {
        chapter.contentHandle = fileHandle;
        return writeProjectManifest();
      })
      .then(() => setSaveStatusDot('saved', text().chapterInfoSaved))
      .catch(error => {
        console.warn('Chapter create failed:', error);
        setDefaultSaveStatus();
      })
      .finally(() => hideAppLoader());
  });
}

function wordCount(html) {
  return countWordsFromText(htmlToCountableText(html));
}

let latestEditorStatValues = {
  words: 0,
  characters: 0,
  paragraphs: 0,
  sentences: 0,
  readingTime: 1
};

function isSelectionInsideEditor(selection, editor) {
  if (!selection || !editor || selection.isCollapsed || !selection.rangeCount) return false;
  const nodeInsideEditor = node => {
    if (!node) return false;
    if (node === editor) return true;
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return Boolean(element && editor.contains(element));
  };
  return nodeInsideEditor(selection.anchorNode) && nodeInsideEditor(selection.focusNode);
}

function selectedEditorText() {
  const editor = document.getElementById('editor');
  const selection = window.getSelection();
  if (!isSelectionInsideEditor(selection, editor)) return '';
  return selection.toString().replace(/\u00a0/g, ' ').trim();
}

function editorSelectionFocusStatsMinWords() {
  const rawValue = window.getComputedStyle(document.documentElement)
    .getPropertyValue('--editor-selection-focus-stats-min-words')
    .trim();
  const minWords = Number.parseInt(rawValue, 10);
  return Number.isFinite(minWords) && minWords > 0 ? minWords : 20;
}

function normalizeSelectionOccurrenceText(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function countSelectedTextOccurrences(selectedText) {
  const query = normalizeSelectionOccurrenceText(selectedText);
  const sourceText = normalizeSelectionOccurrenceText(getCleanEditorText());
  if (!query || !sourceText) return 0;
  return countEditorFindMatches(sourceText, query, 'raw');
}

function positionSelectionOccurrenceBadge() {
  const badge = document.getElementById('selectionOccurrenceBadge');
  const editor = document.getElementById('editor');
  const wrap = document.getElementById('editor-wrap');
  if (!badge || !editor || !wrap || badge.hidden) return;

  const editorRect = editor.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  badge.style.right = `${Math.max(12, Math.round(wrapRect.right - editorRect.right + 18))}px`;
  badge.style.bottom = `${Math.max(12, Math.round(wrapRect.bottom - editorRect.bottom + 18))}px`;
}

function setSelectionOccurrenceBadge(count = 0) {
  const badge = document.getElementById('selectionOccurrenceBadge');
  if (!badge) return;
  if (count <= 1) {
    badge.hidden = true;
    badge.textContent = '';
    badge.style.removeProperty('right');
    badge.style.removeProperty('bottom');
    return;
  }

  badge.textContent = `${count} ${count === 1 ? 'match' : 'matches'}`;
  badge.hidden = false;
  requestAnimationFrame(positionSelectionOccurrenceBadge);
}

function revealFocusStatsForSelection() {
  if (!isFocus || !visibleEditorStatuses.words) return;
  const wrap = document.getElementById('editor-wrap');
  const focusStats = document.getElementById('focus-stats');
  if (!wrap || !focusStats || focusStats.hidden) return;

  wrap.classList.add('is-focus-scroll-stats-visible');
  if (typeof focusStatsHideTimer !== 'undefined') {
    clearTimeout(focusStatsHideTimer);
    const hideDelay = typeof FOCUS_STATS_HIDE_DELAY_MS !== 'undefined' ? FOCUS_STATS_HIDE_DELAY_MS : 4000;
    focusStatsHideTimer = setTimeout(() => {
      if (typeof hideFocusScrollStats === 'function') hideFocusScrollStats();
      else wrap.classList.remove('is-focus-scroll-stats-visible');
    }, hideDelay);
  }
}

function syncEditorSelectionWordStatus(options = {}) {
  const selectedText = selectedEditorText();
  const selectedWords = countWordsFromText(selectedText);
  const focusStatsMinWords = editorSelectionFocusStatsMinWords();
  const hasLargeSelection = selectedWords > focusStatsMinWords;
  const totalWords = latestEditorStatValues.words || 0;
  const wordValue = selectedWords > 0 ? `${selectedWords} of ${totalWords}` : totalWords;

  setText('wc', wordValue);
  setText('focusWc', hasLargeSelection ? wordValue : totalWords);
  document.querySelectorAll('[data-status-key="words"]').forEach(statusEl => {
    statusEl.classList.toggle('has-selection', selectedWords > 0);
    statusEl.title = selectedWords > 0 ? `${selectedWords} of ${totalWords} words selected` : '';
  });
  if (hasLargeSelection) {
    setSelectionOccurrenceBadge(0);
    if (options.revealFocus) revealFocusStatsForSelection();
    return;
  }

  if (typeof hideFocusScrollStats === 'function') hideFocusScrollStats();
  else document.getElementById('editor-wrap')?.classList.remove('is-focus-scroll-stats-visible');

  if (selectedWords > 0 && selectedWords <= focusStatsMinWords) {
    setSelectionOccurrenceBadge(countSelectedTextOccurrences(selectedText));
  } else {
    setSelectionOccurrenceBadge(0);
  }
}

function setEditorStatValues({ words = 0, characters = 0, paragraphs = 0, sentences = 0, readingTime = 1 } = {}) {
  latestEditorStatValues = { words, characters, paragraphs, sentences, readingTime };
  setText('wc', words);
  setText('cc', characters);
  setText('pc', paragraphs);
  setText('sc', sentences);
  setText('rt', readingTime);
  setText('focusWc', words);
  setText('focusCc', characters);
  setText('focusPc', paragraphs);
  setText('focusSc', sentences);
  setText('focusRt', readingTime);
  syncEditorSelectionWordStatus();
}

function updateStats(options = {}) {
  if (!hasActiveStory()) {
    const editor = document.getElementById('editor');
    if (editor) syncEditorPlaceholderState();
    setEditorStatValues();
    stopTimedAutoSave();
    setDefaultSaveStatus();
    updateChapterStatus();
    return;
  }

  ensureChapters();
  const editor = document.getElementById('editor');
  syncEditorPlaceholderState();
  const hasSourceHTML = Object.prototype.hasOwnProperty.call(options, 'sourceHTML');
  const deferMemoryCommit = options.deferMemoryCommit === true;
  const currentContent = hasSourceHTML ? String(options.sourceHTML || '') : getCleanEditorHTML();
  if (isTrashDraftActive()) {
    const value = getCleanEditorText();
    const words = countWordsFromText(value);
    const chars = value.replace(/\s/g, '').length;
    const sentences = value.split(/[।.!?]+/).filter(sentence => sentence.trim()).length;
    const domParagraphs = getEditorParagraphBlocks(editor).filter(block => !isEditorVisuallyEmpty(block)).length;
    const paras = domParagraphs || value.split(/\n+/).filter(para => para.trim()).length || (value.trim() ? 1 : 0);
    setEditorStatValues({
      words,
      characters: chars,
      paragraphs: paras,
      sentences,
      readingTime: Math.max(1, Math.round(words / EDITOR_READING_WORDS_PER_MINUTE))
    });
    stopTimedAutoSave();
    setSaveButtonSaved(true);
    setDefaultSaveStatus();
    renderChapters();
    updateChapterStatus();
    return;
  }
  if (
    !deferMemoryCommit &&
    !isDraftActive() &&
    isChapterEditUnlocked &&
    !isChapterEditDraftActive() &&
    hasChapterEditContentChangedFromSaved(currentContent, curChap)
  ) {
    materializeChapterEditDraftForChange(currentContent);
  }
  const documentItem = activeEditorDocument();
  if (!deferMemoryCommit && documentItem && (isDraftActive() || isChapterEditDraftActive() || isChapterEditUnlocked)) {
    documentItem.content = currentContent;
  }
  const chapterEditDraft = activeChapterEditDraft();
  const chapterEditDraftMatchesChapter = chapterEditDraft && isChapterEditDraftSameAsChapter(chapterEditDraft, curChap);
  const isContentSaved = deferMemoryCommit ? false : chapterEditDraft
    ? currentContent === (chapterEditDraft.lastAutosavedHTML || '') || chapterEditDraftMatchesChapter
    : currentContent === lastSavedChapterHTML;
  const needsAutoSave = chapterEditDraft
    ? !isContentSaved
    : !isContentSaved;
  setSaveButtonSaved(isContentSaved);
  const value = hasSourceHTML ? editorHTMLToText(currentContent) : getCleanEditorText();
  const words = countWordsFromText(value);
  if (isDraftActive()) setDraftWordCache(curDraft, words);
  else setChapterWordCache(curChap, words);
  const namingChanged = scanActiveEditorForNamingUses(new Date().toISOString(), value);
  const chars = value.replace(/\s/g, '').length;
  const sentences = value.split(/[à¥¤.!?]+/).filter(sentence => sentence.trim()).length;
  const paragraphProbe = hasSourceHTML ? document.createElement('div') : null;
  if (paragraphProbe) paragraphProbe.innerHTML = currentContent;
  const domParagraphs = getEditorParagraphBlocks(paragraphProbe || editor).filter(block => !isEditorVisuallyEmpty(block)).length;
  const paras = domParagraphs || value.split(/\n+/).filter(para => para.trim()).length || (value.trim() ? 1 : 0);
  const copy = text();

  setEditorStatValues({
    words,
    characters: chars,
    paragraphs: paras,
    sentences,
    readingTime: Math.max(1, Math.round(words / EDITOR_READING_WORDS_PER_MINUTE))
  });

  if (deferMemoryCommit) {
    clearTimeout(autoSaveTimer);
    stopTimedAutoSave();
    setSaveButtonSaved(false);
    renderChapters();
    if (activeSidePanel === 'naming' && namingChanged) renderTags();
    updateChapterStatus();
    return;
  }

  clearTimeout(autoSaveTimer);
  if (!isContentSaved) {
    showUnsavedSaveStatus(copy.unsaved);

    if (needsAutoSave && isAutoSaveEnabled && canEditActiveDocument()) {
      ensureTimedAutoSave();
      autoSaveTimer = setTimeout(() => {
        runAutoSave('idle');
      }, EDITOR_AUTOSAVE_DELAY_MS);
    } else if (!needsAutoSave) {
      stopTimedAutoSave();
    }
  } else {
    stopTimedAutoSave();
    setDefaultSaveStatus();
  }

  renderChapters();
  if (activeSidePanel === 'naming' && namingChanged) renderTags();
  updateChapterStatus();
}

function handleEditorContentInput() {
  const editor = document.getElementById('editor');
  if (editor && !isEditorPlainTextMode(editor) && typeof normalizeEditorParagraphBlocks === 'function') {
    normalizeEditorParagraphBlocks(editor);
  }
  const documentItem = activeEditorDocument();
  if (isLargeVirtualEditorDocument(documentItem)) {
    // Establish/reuse the full-document backing session before capturing this
    // input, so the visible legacy-rendered window is patched into that state.
    beginRestrictedInputRendering();
  }
  // Both editor sizes retain the innerHTML bridge and processing pipeline.
  // Only large documents attach that pipeline to a virtual backing document.
  stageEditorHTMLForMemoryCommit();
  scheduleSaveButtonTypingIdleCheck();
  if (!isApplyingEditorHistorySnapshot) scheduleEditorHistorySnapshot('input');
}

// ── Smart Copy ──────────────────────────────────────────────────────────────
const SMART_COPY_DEFAULT_ICON = 'smartCopyDefault';
const SMART_COPY_SUCCESS_ICON = 'smartCopySuccess';
const SMART_COPY_SUCCESS_RESET_MS = lmEditorAdvancedNumber('smartCopyReset', 3500);
let smartCopyIconResetTimer = null;

function setSmartCopyIcon(iconName = SMART_COPY_DEFAULT_ICON) {
  const button = document.getElementById('smartCopyBtn');
  if (!button || typeof window.lmIcon !== 'function') return;

  const isCopied = iconName === SMART_COPY_SUCCESS_ICON;
  button.innerHTML = window.lmIcon(iconName);
  button.classList.toggle('is-smart-copy-copied', isCopied);
}

function showSmartCopySuccess() {
  clearTimeout(smartCopyIconResetTimer);
  setSmartCopyIcon(SMART_COPY_SUCCESS_ICON);
  smartCopyIconResetTimer = setTimeout(() => {
    smartCopyIconResetTimer = null;
    setSmartCopyIcon(SMART_COPY_DEFAULT_ICON);
  }, SMART_COPY_SUCCESS_RESET_MS);
}

function handleSmartCopySuccess(message = 'Copied!') {
  showSmartCopySuccess();
  showSmartCopyToast(message);
}

function editorSelectionIntersectsEditor(range, editor) {
  if (!range || !editor) return false;
  try {
    if (range.intersectsNode(editor)) return true;
  } catch (error) {
    // Fall through to node containment checks.
  }
  const startNode = range.startContainer?.nodeType === Node.ELEMENT_NODE
    ? range.startContainer
    : range.startContainer?.parentNode;
  const endNode = range.endContainer?.nodeType === Node.ELEMENT_NODE
    ? range.endContainer
    : range.endContainer?.parentNode;
  return Boolean(startNode && editor.contains(startNode)) || Boolean(endNode && editor.contains(endNode));
}

function selectedEditorCopyPayload() {
  const editor = document.getElementById('editor');
  const selection = window.getSelection?.();
  if (!editor || !selection || !selection.rangeCount || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  if (!editorSelectionIntersectsEditor(range, editor)) return null;

  const plainText = selection.toString().replace(/\r\n?/g, '\n').trimEnd();
  if (!plainText.trim()) return null;

  const holder = document.createElement('div');
  holder.appendChild(range.cloneContents());
  holder.querySelectorAll?.('script, style, meta, link').forEach(node => node.remove());
  unwrapHighlights(holder);
  normalizeEditorGapMarkers(holder);

  let htmlText = holder.innerHTML.trim();
  if (!htmlText || !/<[a-z][\s\S]*>/i.test(htmlText)) {
    htmlText = typeof textToEditorHTML === 'function'
      ? textToEditorHTML(plainText)
      : escapeHtml(plainText).replace(/\n/g, '<br>');
  }

  return { plainText, htmlText };
}

function writeSmartCopyPayload(payload) {
  const plainText = payload?.plainText || '';
  if (!plainText) return false;
  const htmlText = payload.htmlText || (typeof textToEditorHTML === 'function' ? textToEditorHTML(plainText) : '');

  if (navigator.clipboard && window.ClipboardItem && htmlText) {
    const blob = new Blob([htmlText], { type: 'text/html' });
    const blobPlain = new Blob([plainText], { type: 'text/plain' });
    navigator.clipboard.write([new ClipboardItem({ 'text/html': blob, 'text/plain': blobPlain })])
      .then(() => handleSmartCopySuccess('Copied!'))
      .catch(() => fallbackSmartCopy(plainText));
  } else {
    fallbackSmartCopy(plainText);
  }
  return true;
}

function writeSelectedEditorCopyEvent(event, payload) {
  if (!event?.clipboardData || !payload?.plainText) return false;
  event.preventDefault();
  event.clipboardData.setData('text/plain', payload.plainText);
  if (payload.htmlText) event.clipboardData.setData('text/html', payload.htmlText);
  handleSmartCopySuccess('Copied!');
  return true;
}

function handleEditorCopy(event) {
  if (typeof isCopySettingsEnabled !== 'undefined' && !isCopySettingsEnabled) {
    return; // browser default copy
  }
  const payload = selectedEditorCopyPayload();
  if (payload) writeSelectedEditorCopyEvent(event, payload);
}

function doSmartCopy() {
  const editor = document.getElementById('editor');
  if (!editor) return;

  const selectedPayload = selectedEditorCopyPayload();
  if (selectedPayload) {
    writeSmartCopyPayload(selectedPayload);
    return;
  }

  const enabled = typeof isCopySettingsEnabled === 'undefined' || isCopySettingsEnabled;
  const mode = enabled ? ((typeof copyParaMode !== 'undefined') ? copyParaMode : 'gap') : 'gap';

  // Collect all paragraph text content
  const paragraphs = Array.from(editor.querySelectorAll('p'))
    .filter(p => !p.dataset.editorParagraphGap && !p.classList.contains('editor-paragraph-gap-br') && !p.dataset.fileParagraphGap);
  const plainModeParts = (!paragraphs.length && isEditorPlainTextMode(editor))
    ? cleanPlainTextEditorValue(editor).split(/\n+/).map(part => part.trim()).filter(Boolean)
    : [];

  let plainText = '';
  let htmlText = '';

  if (plainModeParts.length) {
    if (mode === 'single') {
      plainText = plainModeParts.join('\n');
      htmlText = `<p>${plainModeParts.map(part => escapeHtml(part)).join('<br>')}</p>`;
    } else {
      const gaps = enabled ? ((typeof copyParagraphGaps !== 'undefined') ? copyParagraphGaps : 1) : 1;
      const gapHtml = gaps > 0 ? Array(gaps).fill('<p><br></p>').join('\n') : '';
      const gapPlain = '\n'.repeat(gaps + 1);
      htmlText = plainModeParts.map(part => `<p>${escapeHtml(part)}</p>`).join(gaps > 0 ? '\n' + gapHtml + '\n' : '\n');
      plainText = plainModeParts.join(gapPlain);
    }
  } else if (mode === 'single') {
    // Join all paragraph text inside a single <p> separated by <br>
    const combinedHtml = paragraphs.map(p => p.innerHTML || p.textContent || '').join('<br>');
    const combinedPlain = paragraphs.map(p => p.textContent || '').join('\n');
    plainText = combinedPlain;
    htmlText = `<p>${combinedHtml}</p>`;
  } else {
    // Each paragraph as separate <p> with custom empty lines gap between them
    const gaps = enabled ? ((typeof copyParagraphGaps !== 'undefined') ? copyParagraphGaps : 1) : 1;
    const plainParts = paragraphs.map(p => p.textContent || '');
    if (gaps === 0) {
      htmlText = paragraphs.map(p => p.outerHTML).join('\n');
      plainText = plainParts.join('\n');
    } else {
      const gapHtml = Array(gaps).fill('<p><br></p>').join('\n');
      const gapPlain = '\n'.repeat(gaps + 1);
      htmlText = paragraphs.map(p => p.outerHTML).join('\n' + gapHtml + '\n');
      plainText = plainParts.join(gapPlain);
    }
  }

  if (!plainText) return;

  writeSmartCopyPayload({ plainText, htmlText });
}

function fallbackSmartCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) { /* ignore */ }
  document.body.removeChild(ta);
  handleSmartCopySuccess('Copied!');
}

function showSmartCopyToast(msg) {
  let toast = document.getElementById('smartCopyToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'smartCopyToast';
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--accent,#6c63ff);color:#fff;padding:8px 20px;border-radius:20px;font-size:14px;font-weight:700;z-index:9999;pointer-events:none;transition:opacity .3s ease;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 1600);
}

// ── Smart Paste ─────────────────────────────────────────────────────────────
function handleSmartPaste(event) {
  handleEditorPaste(event);
}
