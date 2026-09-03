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

