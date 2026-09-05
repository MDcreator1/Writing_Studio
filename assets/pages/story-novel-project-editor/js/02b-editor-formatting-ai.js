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
  setWordEditingQuickPanel(false);
  syncToolDockMode();
  if (!canUseEditorToolDock()) return;
  const shouldOpen = !isToolDockOpen;
  if (shouldOpen) setFindPanel(false);
  setToolDock(shouldOpen);
}

function setWordEditingQuickPanel(open) {
  const panel = document.getElementById('wordEditingQuickPanel');
  const toggle = document.getElementById('wordEditingQuickToggleBtn');
  if (!panel || !toggle) return;
  const shouldOpen = Boolean(open);
  panel.hidden = !shouldOpen;
  if (!shouldOpen) setWordEditingCollectMiniPanel(false);
  toggle.setAttribute('aria-expanded', String(shouldOpen));
  toggle.classList.toggle('is-active', shouldOpen);
  if (shouldOpen) {
    if (isFindOpen) setFindPanel(false);
    if (isToolDockOpen) setToolDock(false);
    window.lmAdvancedWordEditing?.syncEditorDockPanel?.();
    requestAnimationFrame(positionWordEditingQuickPanel);
  }
}

function setWordEditingCollectMiniPanel(open) {
  const miniPanel = document.getElementById('wordEditingCollectMiniPanel');
  const button = document.getElementById('wordEditingCollectSettingsBtn');
  if (!miniPanel || !button) return;
  const shouldOpen = Boolean(open);
  miniPanel.hidden = !shouldOpen;
  button.setAttribute('aria-expanded', String(shouldOpen));
  if (shouldOpen) requestAnimationFrame(() => {
    positionWordEditingCollectMiniPanel();
    positionWordEditingQuickPanel();
  });
}

function positionWordEditingCollectMiniPanel() {
  const miniPanel = document.getElementById('wordEditingCollectMiniPanel');
  const button = document.getElementById('wordEditingCollectSettingsBtn');
  if (!miniPanel || miniPanel.hidden || !button) return;
  miniPanel.classList.remove('opens-left');
  const buttonRect = button.getBoundingClientRect();
  const panelRect = miniPanel.getBoundingClientRect();
  const gap = 10;
  const viewportPadding = 12;
  const roomRight = window.innerWidth - buttonRect.right - viewportPadding;
  const roomLeft = buttonRect.left - viewportPadding;
  if (roomRight < panelRect.width + gap && roomLeft > roomRight) {
    miniPanel.classList.add('opens-left');
  }
}

function positionWordEditingQuickPanel() {
  const panel = document.getElementById('wordEditingQuickPanel');
  const dock = document.getElementById('floating-tools');
  const editorArea = document.getElementById('editor-area');
  if (!panel || panel.hidden || !dock || !editorArea) return;
  const areaRect = editorArea.getBoundingClientRect();
  const dockRect = dock.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const padding = 12;
  const gap = 8;
  const baseLeft = dockRect.left - areaRect.left + (dockRect.width - panelRect.width) / 2;
  const safeLeft = Math.max(padding, Math.min(baseLeft, editorArea.clientWidth - panelRect.width - padding));
  panel.style.setProperty('--word-editing-panel-shift-x', `${Math.round(safeLeft - baseLeft)}px`);

  const dockTop = dockRect.top - areaRect.top;
  const dockBottom = dockRect.bottom - areaRect.top;
  const roomAbove = dockTop - padding;
  if (roomAbove >= panelRect.height + gap) {
    panel.style.top = 'auto';
    panel.style.bottom = `calc(100% + ${gap}px)`;
  } else {
    panel.style.bottom = 'auto';
    panel.style.top = `calc(100% + ${gap}px)`;
    const belowBottom = dockBottom + gap + panelRect.height;
    if (belowBottom > editorArea.clientHeight - padding) {
      panel.style.top = `${Math.round(editorArea.clientHeight - padding - panelRect.height - dockTop)}px`;
    }
  }
}

function toggleWordEditingQuickPanel(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const panel = document.getElementById('wordEditingQuickPanel');
  setWordEditingQuickPanel(Boolean(panel?.hidden));
}

async function openWordEditingTemporaryNames() {
  setWordEditingQuickPanel(false);
  await window.lmAdvancedWordEditing?.openTemporaryCandidatesFromDock?.();
}

async function openWordEditingCollectSettings(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const miniPanel = document.getElementById('wordEditingCollectMiniPanel');
  if (!miniPanel) return;
  const shouldOpen = miniPanel.hidden;
  if (!shouldOpen) {
    setWordEditingCollectMiniPanel(false);
    return;
  }
  await window.lmAdvancedWordEditing?.getEditorDockPanelState?.();
  if (typeof syncCustomSelects === 'function') syncCustomSelects(miniPanel);
  setWordEditingCollectMiniPanel(true);
}

async function toggleWordEditingKeepSetting() {
  setWordEditingCollectMiniPanel(false);
  await window.lmAdvancedWordEditing?.toggleKeepEditorReplacementsFromDock?.();
}

function bindWordEditingCollectMiniPanel() {
  const panel = document.getElementById('wordEditingCollectMiniPanel');
  if (!panel || panel.dataset.bound === 'true') return;
  panel.dataset.bound = 'true';
  panel.addEventListener('change', async event => {
    const target = event.target;
    const api = window.lmAdvancedWordEditing;
    if (!api?.updateCollectSettingsFromDock) return;
    if (target.matches('[data-awe-dock-collect-enabled]')) {
      await api.updateCollectSettingsFromDock({ enabled: target.checked });
    } else if (target.matches('[data-awe-dock-collect-category]')) {
      await api.updateCollectSettingsFromDock({ category: target.value });
    } else if (target.matches('[data-awe-dock-collect-minimum-input]')) {
      const minimumOccurrences = Math.min(10000, Math.max(1, Math.floor(Number(target.value) || 3)));
      target.value = String(minimumOccurrences);
      await api.updateCollectSettingsFromDock({ minimumOccurrences });
    }
  });
}

function adjustWordEditingCollectMinimum(direction) {
  const input = document.querySelector('[data-awe-dock-collect-minimum-input]');
  if (!input) return;
  const delta = Number(direction) || 0;
  const nextValue = Math.min(10000, Math.max(1, Math.floor(Number(input.value) || 3) + delta));
  input.value = String(nextValue);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

bindWordEditingCollectMiniPanel();
window.addEventListener('resize', positionWordEditingCollectMiniPanel);

document.addEventListener('pointerdown', event => {
  const panel = document.getElementById('wordEditingQuickPanel');
  const toggle = document.getElementById('wordEditingQuickToggleBtn');
  if (!panel || panel.hidden || panel.contains(event.target) || toggle?.contains(event.target)) return;
  setWordEditingQuickPanel(false);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') setWordEditingQuickPanel(false);
});

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
  if (open) setWordEditingQuickPanel(false);
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
