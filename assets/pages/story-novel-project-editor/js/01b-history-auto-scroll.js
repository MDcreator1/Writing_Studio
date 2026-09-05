function restoreEditorHistorySnapshot(snapshot, options = {}) {
  const editor = document.getElementById('editor');
  if (!editor || !snapshot) return false;
  const targetSelection = options.selection || snapshot.selection;
  const restoreSequence = ++editorHistoryRestoreSequence;
  if (activeVirtualEditorDocument) {
    virtualEditorHistoryInputSuppressionUntil = performance.now() + 2000;
    prepareVirtualEditorHistoryRestore();
    const state = activeVirtualEditorDocument;
    const preserveMaterializedDOM = options.preserveMaterializedDOM === true || Boolean(state.temporarilyMaterialized);
    const documentItem = state.documentItem;
    const html = snapshot.html || '';
    const paragraphs = virtualEditorLogicalParagraphs(editorHistoryHTMLToText(html));
    activeEditorHTMLBuffer = html;
    activeEditorHTMLBufferVersion += 1;
    committedEditorHTMLBufferVersion = activeEditorHTMLBufferVersion;
    if (documentItem) documentItem.content = html;
    if (preserveMaterializedDOM) {
      setPlainTextEditorValue(editor, paragraphs.join('\n'));
      state.html = html;
      state.sessionParagraphs = paragraphs;
      state.start = 0;
      state.end = paragraphs.length;
      state.total = paragraphs.length;
      state.temporarilyMaterialized = true;
      state.temporaryReason = 'history-restore';
      state.fullTextParagraphCount = paragraphs.length;
      state.fullTextCharacterCount = (editor.textContent || '').length;
      editor.classList.remove('is-virtual-document');
      editor.classList.add('is-temporarily-materialized');
      delete editor.dataset.virtualWindowStart;
      delete editor.dataset.virtualWindowEnd;
      delete editor.dataset.virtualLoadedParagraphs;
      editor.style.removeProperty('--virtual-editor-top-space');
      editor.style.removeProperty('--virtual-editor-bottom-space');
      editorHTMLBridgeWorkerLane.run({
        documentKey: state.key,
        html,
        paragraphs,
        start: 0,
        windowSize: VIRTUAL_EDITOR_WINDOW_SIZE
      }, 'load-virtual-document').then(result => {
        if (activeVirtualEditorDocument !== state || typeof result?.windowText !== 'string') return;
        state.workerReady = true;
        state.revision = Number(result.revision) || 0;
        state.total = paragraphs.length;
      }).catch(error => {
        if (activeVirtualEditorDocument === state) state.workerUnavailable = true;
        console.warn('Virtual history backing restore failed:', error);
      });
      syncEditorPlaceholderState();
      updateFormattingButtons({ syncFromSelection: false });
      updateEditorScrollThumb(false);
      positionEditorAutoScrollDepthMarker();
      const restoreMaterializedSelection = () => {
        if (restoreSequence !== editorHistoryRestoreSequence || !targetSelection) return;
        editor.focus({ preventScroll: true });
        const restored = activeVirtualEditorDocument === state
          ? restoreVirtualEditorGlobalSelection(editor, targetSelection)
          : restoreEditorHistorySelection(editor, targetSelection);
        if (!restored) restoreEditorHistorySelectionByTextOffset(editor, targetSelection);
      };
      restoreMaterializedSelection();
      requestAnimationFrame(restoreMaterializedSelection);
      return true;
    }
    const restoreDocumentSequence = ++editorDocumentLoadSequence;
    startVirtualEditorDocument(documentItem, restoreDocumentSequence, html, null, {
      preservePaintedDOM: preserveMaterializedDOM
    });
    const target = targetSelection?.start;
    if (!preserveMaterializedDOM && target && Number.isFinite(target.paragraph) && activeVirtualEditorDocument) {
      const start = Math.max(0, Math.min(
        Math.max(0, paragraphs.length - VIRTUAL_EDITOR_WINDOW_SIZE),
        target.paragraph - Math.floor(VIRTUAL_EDITOR_WINDOW_SIZE / 2)
      ));
      applyVirtualEditorWindow({
        documentKey: activeVirtualEditorDocument.key,
        start,
        end: Math.min(paragraphs.length, start + VIRTUAL_EDITOR_WINDOW_SIZE),
        total: paragraphs.length,
        windowText: paragraphs.slice(start, start + VIRTUAL_EDITOR_WINDOW_SIZE).join('\n'),
        html
      }, { caretAnchor: target, windowSize: VIRTUAL_EDITOR_WINDOW_SIZE });
      const endTarget = targetSelection?.end || target;
      if (endTarget.paragraph >= start && endTarget.paragraph < start + VIRTUAL_EDITOR_WINDOW_SIZE) {
        restoreVirtualEditorGlobalSelection(editor, {
          start: target,
          end: endTarget,
          startTextOffset: targetSelection?.startTextOffset,
          endTextOffset: targetSelection?.endTextOffset,
          collapsed: targetSelection?.collapsed !== false,
          direction: targetSelection?.direction || 'forward'
        });
      }
    }
    syncEditorPlaceholderState();
    updateFormattingButtons({ syncFromSelection: false });
    updateEditorScrollThumb(false);
    positionEditorAutoScrollDepthMarker();
    return true;
  }

  isApplyingEditorHistorySnapshot = true;
  try {
    if (isEditorPlainTextMode(editor)) {
      setPlainTextEditorValue(editor, editorHistoryHTMLToText(snapshot.html || ''));
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

  const restoreSelection = () => {
    if (restoreSequence !== editorHistoryRestoreSequence) return;
    editor.focus({ preventScroll: true });
    const restoredSelection = restoreEditorHistorySelection(editor, targetSelection);
    if (!restoredSelection) {
      const fallbackOffset = Number.isFinite(Number(targetSelection?.startTextOffset))
          ? Number(targetSelection.startTextOffset)
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
  };
  restoreSelection();
  requestAnimationFrame(restoreSelection);
  return true;
}

function undoEditorHistory() {
  const preserveMaterializedDOM = Boolean(activeVirtualEditorDocument?.temporarilyMaterialized);
  virtualEditorHistoryInputSuppressionUntil = performance.now() + 2000;
  if (!flushPendingEditorHistoryInput()) return false;
  if (!editorHistoryStack.length || editorHistoryIndex <= 0) return false;
  const operation = editorHistoryStack[editorHistoryIndex]?.operation;
  editorHistoryIndex -= 1;
  const restored = restoreEditorHistorySnapshot(editorHistoryStack[editorHistoryIndex], {
    selection: operation?.beforeSelection || editorHistoryStack[editorHistoryIndex]?.selection,
    preserveMaterializedDOM,
    autoScroll: false
  });
  if (restored) persistEditorHistory();
  return restored;
}

function redoEditorHistory() {
  const preserveMaterializedDOM = Boolean(activeVirtualEditorDocument?.temporarilyMaterialized);
  virtualEditorHistoryInputSuppressionUntil = performance.now() + 2000;
  if (!flushPendingEditorHistoryInput()) return false;
  if (!editorHistoryStack.length || editorHistoryIndex >= editorHistoryStack.length - 1) return false;
  editorHistoryIndex += 1;
  const snapshot = editorHistoryStack[editorHistoryIndex];
  const restored = restoreEditorHistorySnapshot(snapshot, {
    selection: snapshot.operation?.afterSelection || snapshot.selection,
    preserveMaterializedDOM,
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
  editorHistoryShortcutSuppressionUntil = performance.now() + 500;
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
window.getEditorHistoryDiagnostics = function getEditorHistoryDiagnostics() {
  const nextUndo = editorHistoryIndex > 0 ? editorHistoryStack[editorHistoryIndex] : null;
  const nextRedo = editorHistoryIndex < editorHistoryStack.length - 1 ? editorHistoryStack[editorHistoryIndex + 1] : null;
  return {
    documentKey: editorHistoryDocKey,
    undoEntries: Math.max(0, editorHistoryIndex),
    redoEntries: Math.max(0, editorHistoryStack.length - editorHistoryIndex - 1),
    totalEntries: editorHistoryStack.length,
    nextUndoType: nextUndo?.operation?.type || nextUndo?.reason || null,
    nextUndoMatches: nextUndo ? nextUndo.html === getCleanEditorHTML() : false,
    nextRedoType: nextRedo?.operation?.type || nextRedo?.reason || null,
    currentIndex: editorHistoryIndex
  };
};

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
        const matcher = new RegExp(`(^|[^\\p{L}\\p{N}\\p{M}_])(${namePattern})(?=$|[^\\p{L}\\p{N}\\p{M}_])`, 'giu');
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
    const pattern = `(^|[^\\p{L}\\p{N}\\p{M}_])${namePattern}(?=$|[^\\p{L}\\p{N}\\p{M}_])`;
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
    const pattern = `(^|[^\\p{L}\\p{N}\\p{M}_])${namePattern}(?=$|[^\\p{L}\\p{N}\\p{M}_])`;
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

  entry.source = sourceFromNamingMeta(documentMeta, attachedAt);
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

function resolveDraftNamingEntriesForChapter(chapterIndex = curChap, chapterText = getCleanEditorText(), savedAt = new Date().toISOString(), draftIdentity = null) {
  if (!draftIdentity || !chapters[chapterIndex]) return false;
  return remapNamesForAdvancedPromotion({
    draftIdentity, createdChapters: [{ chapter: chapters[chapterIndex], index: chapterIndex, text: chapterText }],
    remainderDraft: null, promotedAt: savedAt
  });
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

function scanNamingUsesForDocument(documentKey = currentNamingChapterKey(), documentText = getCleanEditorText(), documentMeta = activeNamingDocumentMeta(), savedAt = new Date().toISOString(), options = {}) {
  namingData = normalizeNamingData(namingData);
  const resolvedUndefined = options.resolveUnattached === false ? false : resolveUndefinedNamingEntriesForDocument(documentText, documentMeta, savedAt);
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
  return scanNamingUsesForDocument(chapterKey, chapterText, documentMeta, savedAt);
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

function editorAutoScrollProjectTemplatePercent(key, fallback) {
  const template = typeof projectAutoScrollSettingsTemplate === 'function'
    ? projectAutoScrollSettingsTemplate()
    : null;
  const value = parseFloat(template?.[key]);
  return Number.isFinite(value) ? clampEditorAutoScrollValue(value, 1, 100) : fallback;
}

function applyAutoScrollCssVariablesFromSettings() {
  const root = document.documentElement;
  if (!root) return;

  const defaultDepth = editorAutoScrollProjectTemplatePercent('autoScrollDepth', 72);
  const defaultTop = editorAutoScrollProjectTemplatePercent('autoScrollBandTop', 34);
  const defaultBottom = editorAutoScrollProjectTemplatePercent('autoScrollBandBottom', 78);
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

  const defaultDepth = editorAutoScrollProjectTemplatePercent('autoScrollDepth', 72);
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
  const defaultDepthFrac = editorAutoScrollProjectTemplatePercent('autoScrollDepth', 72) / 100;
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
  const defaultTopFrac = editorAutoScrollProjectTemplatePercent('autoScrollBandTop', 34) / 100;
  const defaultBottomFrac = editorAutoScrollProjectTemplatePercent('autoScrollBandBottom', 78) / 100;
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
