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
  if (documentItem._contentLoadState === 'quarantined') return 0;
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
  if (!isRestrictedInputRenderingActive) return Promise.resolve(false);
  isRestrictedInputRenderingActive = false;
  const closeSequence = ++restrictedInputCloseSequence;
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
      if (!isRestrictedInputRenderingActive && closeSequence === restrictedInputCloseSequence) {
        if (activeVirtualEditorDocument === state) clearVirtualEditorDocument();
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

function endRestrictedInputRenderingBeforePointerAction(event) {
  const editor = document.getElementById('editor');
  if (
    activeVirtualEditorDocument &&
    !activeVirtualEditorDocument.temporarilyMaterialized &&
    editor &&
    (event?.target === editor || editor.contains(event?.target))
  ) {
    event.preventDefault();
    applyTemporaryVirtualEditorFullDOM(activeVirtualEditorDocument, editor, 'pointer-edit');
    const caretPosition = document.caretPositionFromPoint?.(event.clientX, event.clientY);
    const caretRange = !caretPosition && document.caretRangeFromPoint?.(event.clientX, event.clientY);
    const caretNode = caretPosition?.offsetNode || caretRange?.startContainer;
    const caretOffset = caretPosition?.offset ?? caretRange?.startOffset;
    if (caretNode && editor.contains(caretNode)) {
      const range = document.createRange();
      range.setStart(caretNode, Math.max(0, Number(caretOffset) || 0));
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      savedEditorRange = range.cloneRange();
      editor.focus({ preventScroll: true });
    }
  }
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
  const hasRichFormatting = typeof editorContentHasRichFormatting === 'function' &&
    editorContentHasRichFormatting(documentItem?.content || documentItem?.richContentHTML || '');
  return Boolean(documentItem && !hasRichFormatting && isLargeVirtualEditorDocument(documentItem));
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

function startVirtualEditorDocument(documentItem, sequence, sourceHTML = documentItem?.content || '', sourceText = null, options = {}) {
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
  const preservePaintedInputDOM = isRestrictedInputRenderingActive || options.preservePaintedDOM === true;
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
    if (isRestrictedInputRenderingActive && !activeVirtualEditorDocument.historyRestoreHold) {
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
    projectHandle: projectDirectoryHandle,
    canPersist: activeEditorDocument()?._contentLoadState === 'loaded' && activeEditorDocument()?._contentPresented === true,
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
  if (!snapshot.canPersist) {
    snapshot.status = 'skipped-unhydrated';
    return snapshot;
  }
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

  if (snapshot.canPersist && snapshot.mode === 'draft' && snapshot.documentItem) {
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
  const isQuarantined = activeEditorDocument()?._contentLoadState === 'quarantined';
  if (!isQuarantined) {
    if (isDraftActive()) setDraftWordCache(curDraft, result.stats?.words || 0);
    else setChapterWordCache(curChap, result.stats?.words || 0);
  }
  const namingChanged = !isQuarantined && scanActiveEditorForNamingUses(new Date().toISOString(), result.text || '');
  const shouldRefreshNamingProjection = !isQuarantined && Boolean(String(result.text || '').trim()) &&
    (activeSidePanel === 'naming' || window.LmWorkspaceSectionLoader?.isReady?.('naming'));
  if (shouldRefreshNamingProjection) window.LmInitialRendering?.queueActiveNamingSnapshotRefresh?.();
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
      const shouldRefreshNaming = activeSidePanel === 'naming' || window.LmWorkspaceSectionLoader?.isReady?.('naming');
      Promise.resolve(shouldRefreshNaming ? window.LmInitialRendering?.loadNamingForActiveDocument?.() : null)
        .then(() => {
          if (sequence !== editorDocumentLoadSequence) return;
          if (typeof renderActiveWorkspaceSidePanel === 'function') renderActiveWorkspaceSidePanel();
          else {
            renderTags();
            renderNotes();
          }
        })
        .catch(error => console.warn('Active naming render refresh failed:', error));
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
  if (!(await ensureChapterContentLoaded(index))) {
    showMiniReminder('Chapter content load नहीं हुआ; सुरक्षित रूप से switch रोक दिया गया।');
    return;
  }
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
    commitPreviousSnapshot: () => commitHiddenSwitchedSnapshotToMemory(switchedSnapshot),
    cleanupPreviousEditDraft: () => !switchedSnapshot.canPersist
      ? false
      : switchedSnapshot.mode === 'chapter-edit-draft'
      ? cleanupActiveChapterEditDraftIfUnchanged(previousIndex, switchedSnapshot.chapterEditKey || previousChapterEditKey)
      : false,
    savePreviousDocument: previousEditDraftRemoved => !switchedSnapshot.canPersist || switchedSnapshot.projectHandle !== projectDirectoryHandle
      ? Promise.resolve()
      : wasDraftActive
      ? writeDraftToLocalFile(previousDraftIndex, switchedSnapshot.text || '')
      : switchedSnapshot.mode === 'chapter-edit-draft' && !previousEditDraftRemoved
        ? writeChapterEditDraftToLocalFile(switchedSnapshot.chapterEditKey || previousChapterEditKey, switchedSnapshot.text || '')
        : Promise.resolve(),
    releasePreviousSnapshot: () => releaseHiddenSwitchedSnapshot(switchedSnapshot)
    });
}

function loadEditor(options = {}) {
  if (options.phase === 'paint') window.LmInitialRendering?.queueActiveDocumentSync?.();
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
    documentItem._contentPresented = true;
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
  if (!String(options.phase || '').startsWith('analysis')) documentItem._contentPresented = true;
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
  if (activeEditorDocument()?._contentLoadState === 'quarantined') return;
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
