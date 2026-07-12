(() => {
  const DEVANAGARI_VIRAMA = '\u094D';
  const DEVANAGARI_NUKTA = '\u093C';
  const DEVANAGARI_BINDU = '\u0902';
  const DEVANAGARI_CHANDRABINDU = '\u0901';
  const DEVANAGARI_VISARGA = '\u0903';
  const DEVANAGARI_STRESS_SIGNS = new Set(['\u0951', '\u0952', '\u0953', '\u0954']);
  const DEVANAGARI_JOINERS = new Set(['\u200C', '\u200D']);
  const DEVANAGARI_PRIMARY_MATRAS = new Set([
    '\u093E',
    '\u093F',
    '\u0940',
    '\u0941',
    '\u0942',
    '\u0943',
    '\u0947',
    '\u0948',
    '\u094B',
    '\u094C'
  ]);
  const DEVANAGARI_SECONDARY_MARKS = new Set([
    DEVANAGARI_NUKTA,
    DEVANAGARI_BINDU,
    DEVANAGARI_CHANDRABINDU,
    DEVANAGARI_VISARGA
  ]);
  const initializedEditors = new WeakSet();
  const editorLogicalStates = new WeakMap();
  const pendingViramaCaretOverlays = new WeakMap();
  const pendingViramaBoundaryMarkers = new WeakMap();
  const visualGraphemeSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('hi', { granularity: 'grapheme' })
    : null;

  function isCodePointInRange(char, startCodePoint, endCodePoint) {
    const codePoint = char?.codePointAt?.(0);
    return Number.isInteger(codePoint) && codePoint >= startCodePoint && codePoint <= endCodePoint;
  }

  function isDevanagariChar(char) {
    return isCodePointInRange(char, 0x0900, 0x097F);
  }

  function isDevanagariBaseConsonant(char) {
    return isCodePointInRange(char, 0x0915, 0x0939) || isCodePointInRange(char, 0x0958, 0x095F);
  }

  function isDevanagariIndependentVowel(char) {
    return isCodePointInRange(char, 0x0904, 0x0914) || isCodePointInRange(char, 0x0960, 0x0961);
  }

  function isDevanagariMatra(char) {
    return isCodePointInRange(char, 0x093E, 0x094C) || isCodePointInRange(char, 0x0962, 0x0963);
  }

  function isPrimaryDevanagariMatra(char) {
    return DEVANAGARI_PRIMARY_MATRAS.has(char);
  }

  function isSecondaryDevanagariMark(char) {
    return DEVANAGARI_SECONDARY_MARKS.has(char) || DEVANAGARI_STRESS_SIGNS.has(char);
  }

  function isDevanagariCombiningMark(char) {
    return char === DEVANAGARI_VIRAMA ||
      char === DEVANAGARI_NUKTA ||
      char === DEVANAGARI_BINDU ||
      char === DEVANAGARI_CHANDRABINDU ||
      char === DEVANAGARI_VISARGA ||
      DEVANAGARI_STRESS_SIGNS.has(char) ||
      isDevanagariMatra(char);
  }

  function classifyHindiCodePoint(char) {
    if (!char) return 'empty';
    if (char === DEVANAGARI_VIRAMA) return 'virama';
    if (char === DEVANAGARI_NUKTA) return 'nukta';
    if (char === DEVANAGARI_BINDU) return 'bindu';
    if (char === DEVANAGARI_CHANDRABINDU) return 'chandrabindu';
    if (char === DEVANAGARI_VISARGA) return 'visarga';
    if (DEVANAGARI_STRESS_SIGNS.has(char)) return 'stress-mark';
    if (isDevanagariMatra(char)) return 'matra';
    if (isDevanagariBaseConsonant(char)) return 'base-consonant';
    if (isDevanagariIndependentVowel(char)) return 'independent-vowel';
    if (isDevanagariChar(char)) return 'devanagari';
    if (DEVANAGARI_JOINERS.has(char)) return 'joiner';
    return 'other';
  }

  function isHindiEditableComponent(char, fullText = '', offset = 0) {
    const kind = classifyHindiCodePoint(char);
    if (kind !== 'other' && kind !== 'empty' && kind !== 'joiner') return true;
    if (!DEVANAGARI_JOINERS.has(char)) return false;
    const beforeChar = codePointBefore(fullText, offset)?.char || '';
    const afterChar = codePointAfter(fullText, offset + char.length)?.char || '';
    return isDevanagariChar(beforeChar) || isDevanagariChar(afterChar);
  }

  function codePointsWithOffsets(value) {
    const points = [];
    let offset = 0;
    for (const char of String(value || '')) {
      const start = offset;
      offset += char.length;
      points.push({
        char,
        start,
        end: offset,
        kind: classifyHindiCodePoint(char)
      });
    }
    return points;
  }

  function logicalInputSequence(value) {
    return codePointsWithOffsets(value).map((point, logicalIndex) => ({
      ...point,
      logicalIndex,
      isDevanagariComponent: isHindiEditableComponent(point.char, value, point.start)
    }));
  }

  function editorLogicalState(editor) {
    let state = editorLogicalStates.get(editor);
    if (!state) {
      state = {
        editor,
        isComposing: false,
        pendingViramaOffset: null,
        logicalRefreshTimer: null,
        text: '',
        sequence: []
      };
      editorLogicalStates.set(editor, state);
    }
    return state;
  }

  function refreshEditorLogicalInputSequence(editor, state = editorLogicalState(editor)) {
    if (state.logicalRefreshTimer) {
      clearTimeout(state.logicalRefreshTimer);
      state.logicalRefreshTimer = null;
    }
    state.text = editorLogicalText(editor);
    state.sequence = logicalInputSequence(state.text);
    return state.sequence;
  }

  function shouldDeferEditorLogicalRefresh(options = {}) {
    return typeof options.shouldDeferLogicalRefresh === 'function' &&
      options.shouldDeferLogicalRefresh();
  }

  function editorLogicalRefreshDelay(options = {}) {
    const delay = typeof options.logicalRefreshDelay === 'function'
      ? Number(options.logicalRefreshDelay())
      : Number(options.logicalRefreshDelay);
    return Number.isFinite(delay) && delay > 0 ? delay : 650;
  }

  function scheduleEditorLogicalInputSequenceRefresh(editor, state = editorLogicalState(editor), options = {}) {
    if (!shouldDeferEditorLogicalRefresh(options)) {
      refreshEditorLogicalInputSequence(editor, state);
      return false;
    }
    if (state.logicalRefreshTimer) clearTimeout(state.logicalRefreshTimer);
    state.logicalRefreshTimer = setTimeout(() => {
      state.logicalRefreshTimer = null;
      refreshEditorLogicalInputSequence(editor, state);
    }, editorLogicalRefreshDelay(options));
    return true;
  }

  function codePointBefore(value, offset) {
    let previousPoint = null;
    for (const point of codePointsWithOffsets(value)) {
      if (point.end > offset) break;
      previousPoint = point;
    }
    return previousPoint;
  }

  function codePointAfter(value, offset) {
    return codePointsWithOffsets(value).find(point => point.start >= offset) || null;
  }

  function logicalUnitBefore(value, offset, sequence = logicalInputSequence(value)) {
    const point = sequence.reduce((previousPoint, currentPoint) => {
      if (currentPoint.end > offset) return previousPoint;
      return currentPoint;
    }, null);
    if (!point || !isHindiEditableComponent(point.char, value, point.start)) return null;
    return point;
  }

  function logicalUnitAfter(value, offset, sequence = logicalInputSequence(value)) {
    const point = sequence.find(currentPoint => currentPoint.start >= offset) || null;
    if (!point || !isHindiEditableComponent(point.char, value, point.start)) return null;
    return point;
  }

  function logicalDeletionPlan(value, offset, direction = 'backward') {
    const sequence = logicalInputSequence(value);
    const unit = direction === 'backward'
      ? logicalUnitBefore(value, offset, sequence)
      : logicalUnitAfter(value, offset, sequence);
    if (!unit) return null;
    return {
      direction,
      offset,
      unit,
      sequence,
      nextValue: value.slice(0, unit.start) + value.slice(unit.end),
      nextCaretOffset: direction === 'backward' ? unit.start : unit.start
    };
  }

  function clearPendingViramaState(state) {
    if (!state) return;
    state.pendingViramaOffset = null;
    removePendingViramaBoundaryMarker(state.editor);
    hidePendingViramaCaretOverlay(state.editor);
  }

  function setPendingViramaState(state, offset) {
    if (!state) return;
    state.pendingViramaOffset = Number.isFinite(offset) ? offset : null;
    if (Number.isFinite(state.pendingViramaOffset)) {
      updatePendingViramaCaretOverlay(state.editor, state.pendingViramaOffset);
    } else {
      hidePendingViramaCaretOverlay(state.editor);
    }
  }

  function fallbackVisualGraphemeSegments(value) {
    const sequence = codePointsWithOffsets(value);
    const segments = [];
    let index = 0;

    while (index < sequence.length) {
      const start = sequence[index].start;
      let end = sequence[index].end;
      index += 1;

      while (index < sequence.length) {
        const point = sequence[index];
        if (isDevanagariCombiningMark(point.char) || DEVANAGARI_JOINERS.has(point.char)) {
          end = point.end;
          const wasVirama = point.char === DEVANAGARI_VIRAMA;
          index += 1;

          if (wasVirama) {
            while (index < sequence.length && DEVANAGARI_JOINERS.has(sequence[index].char)) {
              end = sequence[index].end;
              index += 1;
            }
            if (index < sequence.length && isDevanagariChar(sequence[index].char)) {
              end = sequence[index].end;
              index += 1;
            }
          }
          continue;
        }
        break;
      }

      segments.push({ start, end });
    }

    return segments;
  }

  function visualGraphemeSegments(value) {
    const textValue = String(value || '');
    if (!textValue) return [];
    if (visualGraphemeSegmenter) {
      return Array.from(visualGraphemeSegmenter.segment(textValue), segment => ({
        start: segment.index,
        end: segment.index + segment.segment.length
      }));
    }
    return fallbackVisualGraphemeSegments(textValue);
  }

  function visualGraphemeBoundaries(value) {
    const textValue = String(value || '');
    const boundaries = new Set([0, textValue.length]);
    visualGraphemeSegments(textValue).forEach(segment => {
      boundaries.add(segment.start);
      boundaries.add(segment.end);
    });
    return [...boundaries].sort((left, right) => left - right);
  }

  function pendingViramaNextRun(value, offset) {
    const sequence = logicalInputSequence(value);
    const firstPoint = sequence.find(point => point.start >= offset) || null;
    if (!firstPoint) return null;
    let end = firstPoint.end;
    let index = sequence.indexOf(firstPoint) + 1;
    while (index < sequence.length) {
      const point = sequence[index];
      if (
        isDevanagariMatra(point.char) ||
        isSecondaryDevanagariMark(point.char) ||
        point.char === DEVANAGARI_NUKTA ||
        DEVANAGARI_JOINERS.has(point.char)
      ) {
        end = point.end;
        index += 1;
        continue;
      }
      break;
    }
    return {
      start: firstPoint.start,
      end,
      point: firstPoint
    };
  }

  function pendingViramaBaseRun(value, offset) {
    const sequence = logicalInputSequence(value);
    const viramaIndex = sequence.findIndex(point => point.end === offset && point.char === DEVANAGARI_VIRAMA);
    if (viramaIndex < 0) return null;

    for (let index = viramaIndex - 1; index >= 0; index -= 1) {
      const point = sequence[index];
      if (point.kind === 'base-consonant') {
        return {
          start: point.start,
          end: offset,
          point
        };
      }
      if (point.char === DEVANAGARI_NUKTA || DEVANAGARI_JOINERS.has(point.char)) continue;
      break;
    }

    return null;
  }

  function isMatraClusterBoundaryPoint(point) {
    if (!point) return true;
    if (point.kind === 'base-consonant' || point.kind === 'independent-vowel') return true;
    return !isDevanagariCombiningMark(point.char) && !DEVANAGARI_JOINERS.has(point.char);
  }

  function findMatraTargetBase(value, offset, sequence = logicalInputSequence(value)) {
    let pointIndex = -1;
    for (let index = 0; index < sequence.length; index += 1) {
      if (sequence[index].end > offset) break;
      pointIndex = index;
    }

    for (let index = pointIndex; index >= 0; index -= 1) {
      const point = sequence[index];
      if (point.kind === 'base-consonant') return { point, index };
      if (point.kind === 'independent-vowel') return null;
      if (isDevanagariCombiningMark(point.char) || DEVANAGARI_JOINERS.has(point.char)) continue;
      return null;
    }

    return null;
  }

  function matraClusterForBase(value, baseIndex, sequence = logicalInputSequence(value)) {
    const base = sequence[baseIndex];
    if (!base || base.kind !== 'base-consonant') return null;

    let endIndex = baseIndex + 1;
    while (endIndex < sequence.length && !isMatraClusterBoundaryPoint(sequence[endIndex])) {
      endIndex += 1;
    }

    return {
      base,
      baseIndex,
      points: sequence.slice(baseIndex, endIndex),
      start: base.start,
      end: sequence[endIndex - 1]?.end ?? base.end
    };
  }

  function composeMatraClusterWithPrimary(cluster, nextMatra) {
    if (!cluster || !isPrimaryDevanagariMatra(nextMatra)) return '';
    const nuktaMarks = [];
    const secondaryMarks = [];
    const otherMarks = [];

    cluster.points.slice(1).forEach(point => {
      if (point.char === DEVANAGARI_NUKTA) {
        nuktaMarks.push(point.char);
      } else if (isPrimaryDevanagariMatra(point.char)) {
        return;
      } else if (point.char === DEVANAGARI_VIRAMA || DEVANAGARI_JOINERS.has(point.char)) {
        return;
      } else if (isSecondaryDevanagariMark(point.char)) {
        secondaryMarks.push(point.char);
      } else if (isDevanagariMatra(point.char)) {
        return;
      } else {
        otherMarks.push(point.char);
      }
    });

    return [
      cluster.base.char,
      ...nuktaMarks,
      nextMatra,
      ...secondaryMarks,
      ...otherMarks
    ].join('');
  }

  function logicalMatraReplacementPlan(value, offset, nextMatra) {
    if (!isPrimaryDevanagariMatra(nextMatra)) return null;
    const sequence = logicalInputSequence(value);
    const target = findMatraTargetBase(value, offset, sequence);
    if (!target) return null;

    const cluster = matraClusterForBase(value, target.index, sequence);
    if (!cluster) return null;
    const replacement = composeMatraClusterWithPrimary(cluster, nextMatra);
    if (!replacement) return null;

    const nextValue = value.slice(0, cluster.start) + replacement + value.slice(cluster.end);
    const lengthDelta = replacement.length - (cluster.end - cluster.start);
    const nextCaretOffset = offset >= cluster.end
      ? offset + lengthDelta
      : cluster.start + replacement.length;

    return {
      offset,
      matra: nextMatra,
      sequence,
      cluster,
      start: cluster.start,
      end: cluster.end,
      replacement,
      nextValue,
      nextCaretOffset: Math.max(cluster.start, Math.min(nextValue.length, nextCaretOffset))
    };
  }

  function editorTextNodes(editor) {
    if (!editor) return [];
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.nodeValue ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function editorLogicalText(editor) {
    return editorTextNodes(editor).map(node => node.nodeValue || '').join('');
  }

  function editorBoundaryTextOffset(editor, container, offset) {
    if (!editor || !container || !editor.contains(container.nodeType === Node.ELEMENT_NODE ? container : container.parentNode)) {
      return null;
    }

    if (container.nodeType === Node.TEXT_NODE) {
      let consumed = 0;
      for (const node of editorTextNodes(editor)) {
        if (node === container) return consumed + Math.max(0, Math.min(offset, node.nodeValue.length));
        consumed += node.nodeValue.length;
      }
    }

    try {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.setEnd(container, offset);
      const rangeTextLength = range.toString().length;
      range.detach?.();
      return rangeTextLength;
    } catch (error) {
      return null;
    }
  }

  function currentCollapsedTextOffset(editor) {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    return editorBoundaryTextOffset(editor, range.startContainer, range.startOffset);
  }

  function currentSelectionTextOffsets(editor) {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const start = editorBoundaryTextOffset(editor, range.startContainer, range.startOffset);
    const end = editorBoundaryTextOffset(editor, range.endContainer, range.endOffset);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return {
      start: Math.min(start, end),
      end: Math.max(start, end),
      collapsed: range.collapsed
    };
  }

  function editorTextOffsetPosition(editor, targetOffset) {
    const safeOffset = Math.max(0, Number(targetOffset) || 0);
    const nodes = editorTextNodes(editor);
    let consumed = 0;

    for (const node of nodes) {
      const length = node.nodeValue.length;
      if (safeOffset <= consumed + length) {
        return {
          container: node,
          offset: Math.max(0, Math.min(length, safeOffset - consumed))
        };
      }
      consumed += length;
    }

    if (nodes.length) {
      const lastNode = nodes[nodes.length - 1];
      return { container: lastNode, offset: lastNode.nodeValue.length };
    }

    return { container: editor, offset: editor.childNodes.length };
  }

  function setEditorCaretAtTextOffset(editor, targetOffset) {
    const position = editorTextOffsetPosition(editor, targetOffset);
    const range = document.createRange();
    range.setStart(position.container, position.offset);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return range;
  }

  function removePendingViramaBoundaryMarker(editor) {
    if (!editor) return;
    const marker = pendingViramaBoundaryMarkers.get(editor);
    if (marker?.parentNode) {
      const parent = marker.parentNode;
      marker.remove();
      parent.normalize?.();
    }
    pendingViramaBoundaryMarkers.delete(editor);
  }

  function insertPendingViramaBoundaryMarker(editor, targetOffset) {
    if (!editor || !Number.isFinite(targetOffset)) return null;
    removePendingViramaBoundaryMarker(editor);

    const position = editorTextOffsetPosition(editor, targetOffset);
    const marker = document.createElement('span');
    marker.className = 'hindi-pending-virama-boundary lm-id-hindiPendingViramaBoundary';
    marker.dataset.lmPendingViramaBoundary = 'true';
    marker.contentEditable = 'false';
    marker.setAttribute('aria-hidden', 'true');

    if (position.container.nodeType === Node.TEXT_NODE) {
      const node = position.container;
      if (position.offset < node.nodeValue.length) {
        const tailNode = node.splitText(position.offset);
        node.parentNode.insertBefore(marker, tailNode);
      } else {
        node.parentNode.insertBefore(marker, node.nextSibling);
      }
    } else {
      const referenceNode = position.container.childNodes[position.offset] || null;
      position.container.insertBefore(marker, referenceNode);
    }

    pendingViramaBoundaryMarkers.set(editor, marker);
    return marker;
  }

  function pendingViramaBoundaryMarkerRect(editor) {
    const marker = pendingViramaBoundaryMarkers.get(editor);
    if (!marker?.isConnected) return null;
    const rect = marker.getBoundingClientRect();
    return rect && (rect.width || rect.height) ? rect : null;
  }

  function editorTextRangeClientRect(editor, startOffset, endOffset) {
    const start = editorTextOffsetPosition(editor, startOffset);
    const end = editorTextOffsetPosition(editor, endOffset);
    const range = document.createRange();
    range.setStart(start.container, start.offset);
    range.setEnd(end.container, end.offset);
    const rect = [...range.getClientRects()].find(candidate => candidate.width || candidate.height) ||
      range.getBoundingClientRect();
    range.detach?.();
    return rect && (rect.width || rect.height) ? rect : null;
  }

  function editorTextRangeLastClientRect(editor, startOffset, endOffset) {
    const start = editorTextOffsetPosition(editor, startOffset);
    const end = editorTextOffsetPosition(editor, endOffset);
    const range = document.createRange();
    range.setStart(start.container, start.offset);
    range.setEnd(end.container, end.offset);
    const rects = [...range.getClientRects()].filter(candidate => candidate.width || candidate.height);
    const rect = rects[rects.length - 1] || range.getBoundingClientRect();
    range.detach?.();
    return rect && (rect.width || rect.height) ? rect : null;
  }

  function pendingViramaCaretOverlay(editor) {
    if (!editor) return null;
    let overlay = pendingViramaCaretOverlays.get(editor);
    if (overlay) return overlay;

    overlay = document.createElement('span');
    overlay.className = 'hindi-pending-virama-caret lm-id-hindiPendingViramaCaret';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    const host = editor.parentElement || editor;
    host.appendChild(overlay);
    pendingViramaCaretOverlays.set(editor, overlay);
    return overlay;
  }

  function hidePendingViramaCaretOverlay(editor) {
    if (!editor) return;
    editor.classList.remove('is-hindi-pending-virama-caret');
    const overlay = pendingViramaCaretOverlays.get(editor);
    if (overlay) overlay.hidden = true;
  }

  function updatePendingViramaCaretOverlay(editor, offset) {
    if (!editor || !Number.isFinite(offset)) return;
    const overlay = pendingViramaCaretOverlay(editor);
    if (!overlay) return;

    const value = editorLogicalText(editor);
    const markerRect = pendingViramaBoundaryMarkerRect(editor);
    const baseRun = pendingViramaBaseRun(value, offset);
    const nextRun = pendingViramaNextRun(value, offset);
    const baseRect = baseRun
      ? editorTextRangeLastClientRect(editor, baseRun.start, baseRun.end)
      : null;
    const nextRect = nextRun
      ? editorTextRangeClientRect(editor, nextRun.start, nextRun.end)
      : editorTextRangeClientRect(editor, offset, Math.min(value.length, offset + 1));
    const targetRect = markerRect || baseRect || nextRect;
    if (!targetRect) {
      hidePendingViramaCaretOverlay(editor);
      return;
    }

    const host = overlay.offsetParent || editor.parentElement || editor;
    const hostRect = host.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    const computed = window.getComputedStyle(editor);
    const lineHeight = Number.parseFloat(computed.lineHeight) || targetRect.height || Number.parseFloat(computed.fontSize) * 1.8 || 28;
    const caretHeight = Math.max(18, Math.min(lineHeight, targetRect.height || lineHeight));
    const boundaryX = markerRect ? markerRect.left : (baseRect ? baseRect.right : targetRect.left);
    const left = Math.max(editorRect.left, Math.min(boundaryX, editorRect.right)) - hostRect.left;
    const top = targetRect.top - hostRect.top + Math.max(0, ((targetRect.height || lineHeight) - caretHeight) / 2);

    overlay.style.left = `${Math.round(left)}px`;
    overlay.style.top = `${Math.round(top)}px`;
    overlay.style.height = `${Math.round(caretHeight)}px`;
    overlay.hidden = false;
    editor.classList.add('is-hindi-pending-virama-caret');
  }

  function mutateEditorTextRange(editor, startOffset, endOffset, replacement = '') {
    const nodes = editorTextNodes(editor);
    const safeStart = Math.max(0, Math.min(startOffset, endOffset));
    const safeEnd = Math.max(safeStart, Math.max(startOffset, endOffset));
    let consumed = 0;
    let insertedReplacement = false;

    if (safeStart === safeEnd) {
      if (!replacement) return false;
      const position = editorTextOffsetPosition(editor, safeStart);
      if (position.container.nodeType === Node.TEXT_NODE) {
        const nodeValue = position.container.nodeValue || '';
        position.container.nodeValue = nodeValue.slice(0, position.offset) + replacement + nodeValue.slice(position.offset);
      } else {
        const textNode = document.createTextNode(replacement);
        const referenceNode = position.container.childNodes[position.offset] || null;
        position.container.insertBefore(textNode, referenceNode);
      }
      return true;
    }

    for (const node of nodes) {
      const nodeValue = node.nodeValue || '';
      const nodeStart = consumed;
      const nodeEnd = consumed + nodeValue.length;
      consumed = nodeEnd;
      if (safeEnd <= nodeStart || safeStart >= nodeEnd) continue;

      const localStart = Math.max(0, safeStart - nodeStart);
      const localEnd = Math.min(nodeValue.length, safeEnd - nodeStart);
      const prefix = nodeValue.slice(0, localStart);
      const suffix = nodeValue.slice(localEnd);
      node.nodeValue = prefix + (insertedReplacement ? '' : replacement) + suffix;
      insertedReplacement = true;
    }

    return insertedReplacement;
  }

  function deleteEditorLogicalRange(editor, startOffset, endOffset, inputType) {
    mutateEditorTextRange(editor, startOffset, endOffset, '');
    const caretRange = setEditorCaretAtTextOffset(editor, startOffset);
    return { inputType, range: caretRange };
  }

  function shouldIgnoreEditorKey(event, state) {
    return Boolean(
      state.isComposing ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    );
  }

  function handleLogicalDelete(event, editor, direction, state, options) {
    if (event.defaultPrevented && !event.__lmHindiLogicalDelete) return false;
    if (shouldIgnoreEditorKey(event, state)) return false;
    if (typeof options.canEdit === 'function' && !options.canEdit()) return false;

    const offset = currentCollapsedTextOffset(editor);
    if (!Number.isFinite(offset)) return false;

    const value = editorLogicalText(editor);
    const sequence = refreshEditorLogicalInputSequence(editor, state);
    const unit = direction === 'backward'
      ? logicalUnitBefore(value, offset, sequence)
      : logicalUnitAfter(value, offset, sequence);
    if (!unit) {
      refreshEditorLogicalInputSequence(editor, state);
      return false;
    }

    event.preventDefault();
    event.stopImmediatePropagation?.();
    event.__lmHindiLogicalDelete = true;
    const inputType = direction === 'backward' ? 'deleteContentBackward' : 'deleteContentForward';
    const result = deleteEditorLogicalRange(editor, unit.start, unit.end, inputType);
    clearPendingViramaState(state);
    refreshEditorLogicalInputSequence(editor, state);
    options.onLogicalEdit?.({
      editor,
      inputType,
      unit,
      range: result.range
    });
    return true;
  }

  function handlePendingViramaConsonantInput(event, editor, state, options) {
    if (event.defaultPrevented || shouldIgnoreEditorKey(event, state)) return false;
    if (!Number.isFinite(state.pendingViramaOffset)) return false;
    if (event.inputType !== 'insertText' || !isDevanagariBaseConsonant(event.data)) return false;
    if (typeof options.canEdit === 'function' && !options.canEdit()) return false;

    const offset = currentCollapsedTextOffset(editor);
    if (!Number.isFinite(offset) || offset !== state.pendingViramaOffset) {
      clearPendingViramaState(state);
      return false;
    }

    event.preventDefault();
    event.stopImmediatePropagation?.();
    event.__lmHindiPendingViramaConsonant = true;
    removePendingViramaBoundaryMarker(editor);
    mutateEditorTextRange(editor, offset, offset, event.data);
    const nextCaretOffset = offset + event.data.length;
    const range = setEditorCaretAtTextOffset(editor, nextCaretOffset);
    clearPendingViramaState(state);
    refreshEditorLogicalInputSequence(editor, state);
    options.onLogicalEdit?.({
      editor,
      inputType: event.inputType,
      unit: {
        char: event.data,
        kind: 'pending-virama-consonant',
        start: offset,
        end: nextCaretOffset
      },
      range
    });
    return true;
  }

  function handlePendingViramaInput(event, editor, state, options) {
    if (event.defaultPrevented || shouldIgnoreEditorKey(event, state)) return false;
    if (event.inputType !== 'insertText' || event.data !== DEVANAGARI_VIRAMA) return false;
    if (typeof options.canEdit === 'function' && !options.canEdit()) return false;

    const selectionOffsets = currentSelectionTextOffsets(editor);
    if (!selectionOffsets) return false;

    event.preventDefault();
    event.stopImmediatePropagation?.();
    event.__lmHindiPendingVirama = true;
    mutateEditorTextRange(editor, selectionOffsets.start, selectionOffsets.end, DEVANAGARI_VIRAMA);
    const nextCaretOffset = selectionOffsets.start + DEVANAGARI_VIRAMA.length;
    insertPendingViramaBoundaryMarker(editor, nextCaretOffset);
    const range = setEditorCaretAtTextOffset(editor, nextCaretOffset);
    setPendingViramaState(state, nextCaretOffset);
    refreshEditorLogicalInputSequence(editor, state);
    requestAnimationFrame(() => {
      if (state.pendingViramaOffset !== nextCaretOffset) return;
      const offset = currentCollapsedTextOffset(editor);
      if (Number.isFinite(offset) && offset !== nextCaretOffset) {
        setEditorCaretAtTextOffset(editor, nextCaretOffset);
      }
      updatePendingViramaCaretOverlay(editor, nextCaretOffset);
    });
    options.onLogicalEdit?.({
      editor,
      inputType: event.inputType,
      unit: {
        char: DEVANAGARI_VIRAMA,
        kind: 'pending-virama',
        start: selectionOffsets.start,
        end: nextCaretOffset
      },
      range
    });
    return true;
  }

  function handleLogicalMatraInput(event, editor, state, options) {
    if (event.defaultPrevented || shouldIgnoreEditorKey(event, state)) return false;
    if (event.inputType !== 'insertText' || !isPrimaryDevanagariMatra(event.data)) return false;
    if (typeof options.canEdit === 'function' && !options.canEdit()) return false;

    const offset = currentCollapsedTextOffset(editor);
    if (!Number.isFinite(offset)) return false;

    const value = editorLogicalText(editor);
    const plan = logicalMatraReplacementPlan(value, offset, event.data);
    if (!plan) return false;

    event.preventDefault();
    event.stopImmediatePropagation?.();
    event.__lmHindiLogicalMatra = true;
    mutateEditorTextRange(editor, plan.start, plan.end, plan.replacement);
    const range = setEditorCaretAtTextOffset(editor, plan.nextCaretOffset);
    clearPendingViramaState(state);
    refreshEditorLogicalInputSequence(editor, state);
    options.onLogicalEdit?.({
      editor,
      inputType: event.inputType,
      unit: {
        char: event.data,
        kind: 'primary-matra',
        start: plan.start,
        end: plan.end
      },
      range
    });
    return true;
  }

  function normalizeHindiLogicalText(value) {
    return String(value || '').normalize('NFC');
  }

  function normalizeEditorHindiTextNodes(editor) {
    const caretOffset = currentCollapsedTextOffset(editor);
    let changed = false;

    for (const node of editorTextNodes(editor)) {
      if (!/[\u0900-\u097F]/u.test(node.nodeValue || '')) continue;
      const normalizedValue = normalizeHindiLogicalText(node.nodeValue);
      if (normalizedValue === node.nodeValue) continue;
      node.nodeValue = normalizedValue;
      changed = true;
    }

    if (changed && Number.isFinite(caretOffset)) {
      setEditorCaretAtTextOffset(editor, Math.min(caretOffset, editorLogicalText(editor).length));
    }

    return changed;
  }

  function handleLogicalBeforeInput(event, editor, state, options) {
    if (event.__lmHindiLogicalDelete) return true;
    if (event.__lmHindiLogicalMatra) return true;
    if (event.__lmHindiPendingVirama) return true;
    if (event.__lmHindiPendingViramaConsonant) return true;
    if (handlePendingViramaConsonantInput(event, editor, state, options)) return true;
    if (handlePendingViramaInput(event, editor, state, options)) return true;
    if (handleLogicalMatraInput(event, editor, state, options)) return true;
    if (event.inputType === 'deleteContentBackward') {
      return handleLogicalDelete(event, editor, 'backward', state, options);
    }
    if (event.inputType === 'deleteContentForward') {
      return handleLogicalDelete(event, editor, 'forward', state, options);
    }
    return false;
  }

  function initHindiUnicodeEditing(editor, options = {}) {
    if (!editor || initializedEditors.has(editor)) return false;
    initializedEditors.add(editor);
    const state = editorLogicalState(editor);
    refreshEditorLogicalInputSequence(editor, state);

    editor.addEventListener('compositionstart', () => {
      state.isComposing = true;
      clearPendingViramaState(state);
    });

    editor.addEventListener('compositionend', () => {
      state.isComposing = false;
      requestAnimationFrame(() => {
        const normalized = normalizeEditorHindiTextNodes(editor);
        refreshEditorLogicalInputSequence(editor, state);
        options.onCompositionComplete?.({ editor, normalized });
      });
    });

    editor.addEventListener('beforeinput', event => {
      handleLogicalBeforeInput(event, editor, state, options);
    }, true);

    editor.addEventListener('input', () => {
      if (!state.isComposing) {
        if (Number.isFinite(state.pendingViramaOffset)) {
          const offset = currentCollapsedTextOffset(editor);
          if (Number.isFinite(offset) && offset !== state.pendingViramaOffset) {
            clearPendingViramaState(state);
          }
        }
        scheduleEditorLogicalInputSequenceRefresh(editor, state, options);
      }
    });

    editor.addEventListener('keydown', event => {
      if (event.key === 'Backspace') {
        handleLogicalDelete(event, editor, 'backward', state, options);
      } else if (event.key === 'Delete') {
        handleLogicalDelete(event, editor, 'forward', state, options);
      } else if (event.key === 'ArrowLeft') {
        clearPendingViramaState(state);
      } else if (event.key === 'ArrowRight') {
        clearPendingViramaState(state);
      } else if (event.key === 'ArrowUp') {
        clearPendingViramaState(state);
      } else if (event.key === 'ArrowDown') {
        clearPendingViramaState(state);
      } else if (event.key === 'Home' || event.key === 'End' || event.key === 'PageUp' || event.key === 'PageDown' || event.key === 'Escape') {
        clearPendingViramaState(state);
      }
    }, true);

    editor.addEventListener('pointerdown', () => {
      clearPendingViramaState(state);
    });

    editor.addEventListener('scroll', () => {
      if (Number.isFinite(state.pendingViramaOffset)) {
        updatePendingViramaCaretOverlay(editor, state.pendingViramaOffset);
      }
    }, { passive: true });

    window.addEventListener('resize', () => {
      if (Number.isFinite(state.pendingViramaOffset)) {
        updatePendingViramaCaretOverlay(editor, state.pendingViramaOffset);
      }
    }, { passive: true });

    return true;
  }

  window.LmHindiUnicodeEditing = {
    DEVANAGARI_VIRAMA,
    DEVANAGARI_NUKTA,
    DEVANAGARI_BINDU,
    DEVANAGARI_CHANDRABINDU,
    DEVANAGARI_VISARGA,
    isPrimaryDevanagariMatra,
    isSecondaryDevanagariMark,
    classifyHindiCodePoint,
    codePointsWithOffsets,
    logicalInputSequence,
    logicalDeletionPlan,
    visualGraphemeSegments,
    visualGraphemeBoundaries,
    logicalMatraReplacementPlan,
    logicalUnitBefore,
    logicalUnitAfter,
    refreshEditorLogicalInputSequence,
    normalizeHindiLogicalText,
    normalizeEditorHindiTextNodes,
    initHindiUnicodeEditing
  };
})();
