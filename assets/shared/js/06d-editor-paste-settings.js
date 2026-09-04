function togglePasteSettings() {
  isPasteSettingsEnabled = !isPasteSettingsEnabled;
  savePasteCopySettings();
  updatePasteSettingsUI();
}

function togglePasteSettingsPanel() {
  const pastePanel = document.getElementById('smartPasteOptionsPanel');
  if (!isPasteSettingsSelectorOpen && pastePanel?.hidden && typeof window.prepareFloatingPanelFocusReturn === 'function') {
    window.prepareFloatingPanelFocusReturn(pastePanel);
  }
  isPasteSettingsSelectorOpen = !isPasteSettingsSelectorOpen;
  if (isPasteSettingsSelectorOpen) {
    isStatusSelectorOpen = false;
    isFindSettingsSelectorOpen = false;
    isReplaceSettingsSelectorOpen = false;
    isEditorAutoScrollModeSelectorOpen = false;
    isCopySettingsSelectorOpen = false;
  }
  updatePasteSettingsUI();
  updateCopySettingsUI();
  updateEditorSettingsUI();
}



function toggleSmartPasteAutoApply() {
  smartPasteAutoApply = !smartPasteAutoApply;
  savePasteCopySettings();
  updatePasteSettingsUI();
  if (smartPasteAutoApply) {
    scheduleSmartPasteAutoApply();
  } else {
    clearTimeout(smartPasteAutoApplyTimer);
  }
}

let smartPasteAutoApplyTimer = null;

function scheduleSmartPasteAutoApply() {
  clearTimeout(smartPasteAutoApplyTimer);
  if (!smartPasteAutoApply) return;
  smartPasteAutoApplyTimer = setTimeout(() => {
    if (typeof applySmartPasteStylesGlobally === 'function') {
      applySmartPasteStylesGlobally();
    }
  }, typeof lmEditorAdvancedNumber === 'function'
    ? lmEditorAdvancedNumber('smartPasteAutoApplyDelay', 120000)
    : 120000);
}

async function applySmartPasteStylesGlobally() {
  const globalFormatting = typeof editorGlobalTextFormattingDefaults === 'function'
    ? editorGlobalTextFormattingDefaults()
    : { alignment: 'justify', lineHeight: null, paragraphGap: 0, fontFamily: EDITOR_FONT_FAMILIES[0], fontSize: 16 };
  // Update in-memory drafts
  if (Array.isArray(chapterDrafts)) {
    chapterDrafts.forEach(draft => {
      Object.assign(draft, globalFormatting);
    });
  }

  // Update in-memory chapters
  if (Array.isArray(chapters)) {
    chapters.forEach(chapter => {
      Object.assign(chapter, globalFormatting);
    });
  }

  // Update in-memory chapter edit drafts
  if (chapterEditDrafts && typeof chapterEditDrafts === 'object') {
    Object.values(chapterEditDrafts).forEach(draft => {
      Object.assign(draft, globalFormatting);
    });
  }

  // Apply to active document in editor if present
  const doc = activeEditorDocument();
  if (doc) {
    Object.assign(doc, globalFormatting);
    
    // Apply styling to active editor
    const editor = document.getElementById('editor');
    const displayedParagraphMargin = typeof isEditorReviewMode === 'function' && isEditorReviewMode(editor)
      ? (typeof editorReviewModeMarginDefault === 'function' ? editorReviewModeMarginDefault() : 0)
      : null;
    applyEditorAlignment(globalFormatting.alignment, { clearSelectionScopedStyles: true });
    applyEditorSpacing(globalFormatting.lineHeight, globalFormatting.paragraphGap, displayedParagraphMargin);
    applyEditorFontFamily(globalFormatting.fontFamily, { clearSelectionScopedStyles: true });
    applyEditorFontSize(globalFormatting.fontSize, { clearSelectionScopedStyles: true });

    // Update active control states
    const lineSelect = document.getElementById('lineSpacingSel');
    if (lineSelect) {
      lineSelect.value = String(globalFormatting.lineHeight || '');
      if (typeof syncDockSelect === 'function') syncDockSelect('lineSpacingSel');
    }
    if (typeof setParagraphGapSelectValue === 'function') {
      setParagraphGapSelectValue(globalFormatting.paragraphGap);
    }
    const fsizeInp = document.getElementById('fsize');
    if (fsizeInp) {
      fsizeInp.value = globalFormatting.fontSize;
    }
  }

  // Persist project manifest & storage state
  persistProjectManifestSnapshot();
  saveToStorage(true);

  if (hasActiveStory() && projectDirectoryHandle) {
    try {
      await Promise.all([
        writeProjectManifest(),
        writeDraftsDataToProject(),
        writeChapterEditDraftsToProject()
      ]);
      showSmartCopyToast("Applied styles globally!");
    } catch (err) {
      console.error("Failed to write updated project files: ", err);
      showSmartCopyToast("Applied styles to current session.");
    }
  } else {
    showSmartCopyToast("Applied styles globally!");
  }
}

function setSmartPasteLineSpacing(value) {
  smartPasteLineSpacing = normalizeSmartPasteLineSpacing(value);
  savePasteCopySettings();
  updatePasteSettingsUI();
}

function setSmartPasteParagraphGap(value) {
  smartPasteParagraphGap = normalizeSmartPasteParagraphGap(value);
  savePasteCopySettings();
  updatePasteSettingsUI();
}

function setSmartPasteFontSize(value) {
  smartPasteFontSize = normalizeSmartPasteFontSize(value);
  savePasteCopySettings();
  updatePasteSettingsUI();
}

function updateCopySettingsUI() {
  const copyBtn = document.getElementById('copySettingsToggleBtn');
  const copyPanel = document.getElementById('copySettingsSelectorPanel');
  const copyState = document.getElementById('copySettingsState');
  const customGapRow = document.getElementById('copyParagraphGapsRow');
  const copy = text();
  const smartCopyPinned = typeof isEditorQuickSettingPinned === 'function' ? isEditorQuickSettingPinned('smartCopy') : true;

  if (!smartCopyPinned && isCopySettingsSelectorOpen) isCopySettingsSelectorOpen = false;
  if (copyPanel) copyPanel.hidden = !smartCopyPinned || !isCopySettingsSelectorOpen;
  if (copyBtn) {
    copyBtn.hidden = !smartCopyPinned;
    copyBtn.setAttribute('aria-expanded', String(isCopySettingsSelectorOpen));
    copyBtn.setAttribute('aria-pressed', String(Boolean(isCopySettingsEnabled)));
    copyBtn.classList.toggle('is-active', Boolean(isCopySettingsEnabled));
  }
  if (copyState) {
    copyState.textContent = isCopySettingsEnabled ? (copy.settingOn || 'On') : (copy.settingOff || 'Off');
  }

  updateCopyParaModeOptionState('gap', 'copyParaModeGapState');
  updateCopyParaModeOptionState('single', 'copyParaModeSingleState');

  // Set opacity/pointer-events based on global enable and mode selection
  const optionRows = document.querySelectorAll('#copySettingsSelectorPanel .status-option-row');
  optionRows.forEach(row => {
    row.style.opacity = isCopySettingsEnabled ? '1' : '0.5';
    row.style.pointerEvents = isCopySettingsEnabled ? 'auto' : 'none';
  });

  if (customGapRow) {
    if (!isCopySettingsEnabled) {
      customGapRow.style.opacity = '0.5';
      customGapRow.style.pointerEvents = 'none';
    } else {
      customGapRow.style.opacity = '1';
      customGapRow.style.pointerEvents = 'auto';
    }
  }
  if (typeof syncAdvancedQuickControlsFromRuntime === 'function') syncAdvancedQuickControlsFromRuntime();
}

function updateCopyParaModeOptionState(mode, stateId) {
  const copy = text();
  const isActive = copyParaMode === mode;
  const optionBtn = document.querySelector(`[data-copy-para-mode="${mode}"]`);
  if (optionBtn) {
    optionBtn.setAttribute('aria-pressed', String(isActive));
    optionBtn.classList.toggle('is-active', isActive);
  }
  setText(stateId, isActive ? (copy.settingOn || 'On') : (copy.settingOff || 'Off'));
}

function toggleCopySettingsPanel() {
  const copyPanel = document.getElementById('copySettingsSelectorPanel');
  if (!isCopySettingsSelectorOpen && copyPanel?.hidden && typeof window.prepareFloatingPanelFocusReturn === 'function') {
    window.prepareFloatingPanelFocusReturn(copyPanel);
  }
  isCopySettingsSelectorOpen = !isCopySettingsSelectorOpen;
  if (isCopySettingsSelectorOpen) {
    isStatusSelectorOpen = false;
    isFindSettingsSelectorOpen = false;
    isReplaceSettingsSelectorOpen = false;
    isEditorAutoScrollModeSelectorOpen = false;
    isPasteSettingsSelectorOpen = false;
  }
  updatePasteSettingsUI();
  updateCopySettingsUI();
  updateEditorSettingsUI();
}

function toggleCopySettings() {
  isCopySettingsEnabled = !isCopySettingsEnabled;
  savePasteCopySettings();
  updateCopySettingsUI();
}

function setCopyParaMode(mode) {
  if (typeof isCopySettingsEnabled !== 'undefined' && !isCopySettingsEnabled) return;
  if (copyParaMode === mode) {
    copyParaMode = (mode === 'single') ? 'gap' : 'single';
  } else {
    copyParaMode = mode;
  }
  savePasteCopySettings();
  updateCopySettingsUI();
}

function savePasteCopySettings() {
  localStorage.setItem(getStoryStorageKey(PASTE_SETTINGS_ENABLED_KEY), String(isPasteSettingsEnabled));
  localStorage.setItem(getStoryStorageKey(COPY_SETTINGS_ENABLED_KEY), String(isCopySettingsEnabled));
  localStorage.setItem(getStoryStorageKey(COPY_PARA_MODE_KEY), copyParaMode);
  localStorage.setItem(getStoryStorageKey(COPY_PARAGRAPH_GAPS_KEY), String(copyParagraphGaps));
  localStorage.setItem(getStoryStorageKey(SMART_PASTE_LINE_SPACING_KEY), String(smartPasteLineSpacing));
  localStorage.setItem(getStoryStorageKey(SMART_PASTE_PARAGRAPH_GAP_KEY), String(smartPasteParagraphGap));
  localStorage.setItem(getStoryStorageKey(SMART_PASTE_FONT_SIZE_KEY), String(smartPasteFontSize));
  localStorage.setItem(getStoryStorageKey(SMART_PASTE_AUTO_APPLY_KEY), String(smartPasteAutoApply));

  if (typeof projectManifest !== 'undefined' && projectManifest) {
    projectManifest.smartPaste = {
      enabled: Boolean(isPasteSettingsEnabled),
      lineSpacing: smartPasteLineSpacing,
      paragraphGap: smartPasteParagraphGap,
      fontSize: smartPasteFontSize
    };
    if (typeof persistProjectManifestSnapshot === 'function') persistProjectManifestSnapshot();
  }
}

function loadPasteCopySettings() {
  if (typeof projectManifest !== 'undefined' && projectManifest?.smartPaste) {
    const sp = projectManifest.smartPaste;
    if (sp.enabled !== undefined) isPasteSettingsEnabled = Boolean(sp.enabled);
    if (sp.lineSpacing !== undefined) smartPasteLineSpacing = normalizeSmartPasteLineSpacing(sp.lineSpacing);
    if (sp.paragraphGap !== undefined) smartPasteParagraphGap = normalizeSmartPasteParagraphGap(sp.paragraphGap);
    if (sp.fontSize !== undefined) smartPasteFontSize = normalizeSmartPasteFontSize(sp.fontSize);
  } else {
    const storedPaste = localStorage.getItem(getStoryStorageKey(PASTE_SETTINGS_ENABLED_KEY));
    const storedPasteLineSpacing = localStorage.getItem(getStoryStorageKey(SMART_PASTE_LINE_SPACING_KEY));
    const storedPasteGap = localStorage.getItem(getStoryStorageKey(SMART_PASTE_PARAGRAPH_GAP_KEY));
    const storedPasteFontSize = localStorage.getItem(getStoryStorageKey(SMART_PASTE_FONT_SIZE_KEY));

    if (storedPaste !== null) isPasteSettingsEnabled = storedPaste === 'true';
    if (storedPasteLineSpacing !== null) smartPasteLineSpacing = normalizeSmartPasteLineSpacing(storedPasteLineSpacing);
    if (storedPasteGap !== null) smartPasteParagraphGap = normalizeSmartPasteParagraphGap(storedPasteGap);
    if (storedPasteFontSize !== null) smartPasteFontSize = normalizeSmartPasteFontSize(storedPasteFontSize);
  }

  const storedCopyEnabled = localStorage.getItem(getStoryStorageKey(COPY_SETTINGS_ENABLED_KEY));
  const storedCopyMode = localStorage.getItem(getStoryStorageKey(COPY_PARA_MODE_KEY));
  const storedCopyGaps = localStorage.getItem(getStoryStorageKey(COPY_PARAGRAPH_GAPS_KEY));
  const storedAutoApply = localStorage.getItem(getStoryStorageKey(SMART_PASTE_AUTO_APPLY_KEY));

  if (storedCopyEnabled !== null) isCopySettingsEnabled = storedCopyEnabled === 'true';
  if (storedCopyMode !== null) copyParaMode = EDITOR_COPY_PARA_MODES.includes(storedCopyMode) ? storedCopyMode : 'gap';
  if (storedCopyGaps !== null) copyParagraphGaps = Math.max(0, Math.min(4, Number(storedCopyGaps) || 0));
  if (storedAutoApply !== null) smartPasteAutoApply = storedAutoApply === 'true';
}

function loadAutoScrollSettingsFromManifest() {
  if (typeof projectManifest === 'undefined' || !projectManifest?.autoScroll) return;
  const as = projectManifest.autoScroll;
  if (as.enabled !== undefined) isEditorAutoScrollEnabled = Boolean(as.enabled);
  if (as.emptyOnly !== undefined) isEditorAutoScrollEmptyParagraphOnly = Boolean(as.emptyOnly);
  if (as.mode !== undefined && ['depth', 'band'].includes(as.mode)) editorAutoScrollMode = as.mode;
  if (as.focusTime !== undefined && typeof setEditorAutoScrollFocusTime === 'function') {
    setEditorAutoScrollFocusTime(as.focusTime);
  }
  if (as.depth !== undefined) localStorage.setItem(EDITOR_AUTO_SCROLL_DEPTH_KEY, `${as.depth}%`);
  if (as.bandTop !== undefined) localStorage.setItem(EDITOR_AUTO_SCROLL_BAND_TOP_KEY, `${as.bandTop}%`);
  if (as.bandBottom !== undefined) localStorage.setItem(EDITOR_AUTO_SCROLL_BAND_BOTTOM_KEY, `${as.bandBottom}%`);
  if (as.bandMinGap !== undefined && document.documentElement) {
    document.documentElement.style.setProperty('--editor-auto-scroll-band-min-gap', `${as.bandMinGap}%`);
  }

  if (typeof positionEditorAutoScrollDepthMarker === 'function') positionEditorAutoScrollDepthMarker();
  if (typeof updateEditorSettingsUI === 'function') updateEditorSettingsUI();
}

function updateStatusOptionState(statusKey, stateId) {
  const copy = text();
  const optionBtn = document.querySelector(`[data-status-option="${statusKey}"]`);
  if (optionBtn) optionBtn.setAttribute('aria-pressed', String(Boolean(visibleEditorStatuses[statusKey])));
  setText(stateId, visibleEditorStatuses[statusKey] ? copy.settingOn : copy.settingOff);
}

function updateFindModeOptionState(mode, stateId) {
  const copy = text();
  const canUseFindMode = isEditorFindModeSystemActive();
  const isActive = canUseFindMode && currentEditorFindMode() === mode;
  const optionBtn = document.querySelector(`[data-find-mode="${mode}"]`);
  if (optionBtn) {
    optionBtn.disabled = !canUseFindMode;
    optionBtn.setAttribute('aria-pressed', String(isActive));
    optionBtn.classList.toggle('is-active', isActive);
    optionBtn.classList.toggle('is-disabled', !canUseFindMode);
  }
  setText(stateId, isActive ? copy.settingOn : copy.settingOff);
}

function updateEditorAutoScrollModeOptionState(mode, stateId) {
  const copy = text();
  const isActive = currentEditorAutoScrollMode() === mode;
  const optionBtn = document.querySelector(`[data-editor-auto-scroll-mode="${mode}"]`);
  if (optionBtn) {
    optionBtn.setAttribute('aria-pressed', String(isActive));
    optionBtn.classList.toggle('is-active', isActive);
  }
  setText(stateId, isActive ? copy.settingOn : copy.settingOff);
}

function updateEditorAutoScrollEmptyOnlyState() {
  const copy = text();
  const optionBtn = document.getElementById('editorAutoScrollEmptyOnlyToggleBtn');
  if (optionBtn) {
    optionBtn.setAttribute('aria-pressed', String(Boolean(isEditorAutoScrollEmptyParagraphOnly)));
    optionBtn.classList.toggle('is-active', Boolean(isEditorAutoScrollEmptyParagraphOnly));
  }
  setText('editorAutoScrollEmptyOnlyState', isEditorAutoScrollEmptyParagraphOnly ? copy.settingOn : copy.settingOff);
}

function updateReplaceScopeOptionState(scope, stateId) {
  const copy = text();
  const isActive = currentEditorReplaceScope() === scope;
  const optionBtn = document.querySelector(`[data-editor-replace-scope="${scope}"]`);
  if (optionBtn) {
    optionBtn.setAttribute('aria-pressed', String(isActive));
    optionBtn.classList.toggle('is-active', isActive);
  }
  setText(stateId, isActive ? copy.settingOn : copy.settingOff);
}

function toggleAutoSaveSetting() {
  if (isTrashDraftActive()) return;
  isAutoSaveEnabled = !isAutoSaveEnabled;
  clearTimeout(autoSaveTimer);
  if (!isAutoSaveEnabled) stopTimedAutoSave();
  saveEditorSettings();
  setDefaultSaveStatus();
  updateEditorSettingsUI();
  if (isAutoSaveEnabled) updateStats();
}

function toggleEditorAutoScrollSetting() {
  if (isChapterReviewModeForEditorSettings()) {
    isEditorAutoScrollModeSelectorOpen = false;
    if (typeof cancelEditorCaretAutoScroll === 'function') cancelEditorCaretAutoScroll();
    if (typeof positionEditorAutoScrollDepthMarker === 'function') positionEditorAutoScrollDepthMarker();
    updateEditorSettingsUI();
    return;
  }
  isEditorAutoScrollEnabled = !isEditorAutoScrollEnabled;
  saveEditorSettings();
  updateEditorSettingsUI();
  if (typeof positionEditorAutoScrollDepthMarker === 'function') positionEditorAutoScrollDepthMarker();
  if (isEditorAutoScrollEnabled) {
    if (typeof scheduleEditorCaretAutoScroll === 'function') scheduleEditorCaretAutoScroll();
  } else if (typeof cancelEditorCaretAutoScroll === 'function') {
    cancelEditorCaretAutoScroll();
  }
}

function isEditorAutoScrollModeStateClick(event) {
  return Boolean(event?.target?.closest?.('#editorAutoScrollModeState'));
}

function toggleEditorAutoScrollModePanel(event) {
  if (isChapterReviewModeForEditorSettings()) {
    isEditorAutoScrollModeSelectorOpen = false;
    if (typeof cancelEditorCaretAutoScroll === 'function') cancelEditorCaretAutoScroll();
    updateEditorSettingsUI();
    return;
  }
  if (isEditorAutoScrollModeStateClick(event)) {
    event.preventDefault();
    event.stopPropagation();
    toggleEditorAutoScrollSetting();
    return;
  }

  const autoScrollModePanel = document.getElementById('editorAutoScrollModeSelectorPanel');
  if (!isEditorAutoScrollModeSelectorOpen && autoScrollModePanel?.hidden && typeof window.prepareFloatingPanelFocusReturn === 'function') {
    window.prepareFloatingPanelFocusReturn(autoScrollModePanel);
  }
  isEditorAutoScrollModeSelectorOpen = !isEditorAutoScrollModeSelectorOpen;
  if (isEditorAutoScrollModeSelectorOpen) {
    isStatusSelectorOpen = false;
    isFindSettingsSelectorOpen = false;
    isReplaceSettingsSelectorOpen = false;
    isPasteSettingsSelectorOpen = false;
    isCopySettingsSelectorOpen = false;
  }
  updateEditorSettingsUI();
}

function toggleStatusVisibilitySetting() {
  const statusSelectorPanel = document.getElementById('statusSelectorPanel');
  if (!isStatusSelectorOpen && statusSelectorPanel?.hidden && typeof window.prepareFloatingPanelFocusReturn === 'function') {
    window.prepareFloatingPanelFocusReturn(statusSelectorPanel);
  }
  isStatusSelectorOpen = !isStatusSelectorOpen;
  if (isStatusSelectorOpen) {
    isFindSettingsSelectorOpen = false;
    isReplaceSettingsSelectorOpen = false;
    isEditorAutoScrollModeSelectorOpen = false;
    isPasteSettingsSelectorOpen = false;
    isCopySettingsSelectorOpen = false;
  }
  updateEditorSettingsUI();
}

function toggleFindSettingsPanel() {
  if (!isEditorFindModeSystemActive()) {
    isFindSettingsSelectorOpen = false;
    updateEditorSettingsUI();
    return;
  }
  const findSettingsPanel = document.getElementById('findSettingsSelectorPanel');
  if (!isFindSettingsSelectorOpen && findSettingsPanel?.hidden && typeof window.prepareFloatingPanelFocusReturn === 'function') {
    window.prepareFloatingPanelFocusReturn(findSettingsPanel);
  }
  isFindSettingsSelectorOpen = !isFindSettingsSelectorOpen;
  if (isFindSettingsSelectorOpen) {
    isStatusSelectorOpen = false;
    isReplaceSettingsSelectorOpen = false;
    isEditorAutoScrollModeSelectorOpen = false;
    isPasteSettingsSelectorOpen = false;
    isCopySettingsSelectorOpen = false;
  }
  updateEditorSettingsUI();
}

function toggleReplaceSettingsPanel() {
  const replaceSettingsPanel = document.getElementById('replaceSettingsSelectorPanel');
  if (!isReplaceSettingsSelectorOpen && replaceSettingsPanel?.hidden && typeof window.prepareFloatingPanelFocusReturn === 'function') {
    window.prepareFloatingPanelFocusReturn(replaceSettingsPanel);
  }
  isReplaceSettingsSelectorOpen = !isReplaceSettingsSelectorOpen;
  if (isReplaceSettingsSelectorOpen) {
    isStatusSelectorOpen = false;
    isFindSettingsSelectorOpen = false;
    isEditorAutoScrollModeSelectorOpen = false;
    isPasteSettingsSelectorOpen = false;
    isCopySettingsSelectorOpen = false;
  }
  updateEditorSettingsUI();
}

function toggleSingleStatusSetting(statusKey) {
  if (!EDITOR_STATUS_KEYS.includes(statusKey)) return;
  if (!editorSettingsStatusKeys().includes(statusKey)) return;
  visibleEditorStatuses[statusKey] = !visibleEditorStatuses[statusKey];
  saveEditorSettings();
  updateEditorSettingsUI();
}

function setEditorFindMode(mode, options = {}) {
  if (!isEditorFindModeSystemActive()) {
    isFindSettingsSelectorOpen = false;
    updateEditorSettingsUI();
    return;
  }
  const nextMode = normalizeEditorFindMode(mode);
  if (editorFindMode === nextMode && options.force !== true) {
    updateEditorSettingsUI();
    return;
  }
  editorFindMode = nextMode;
  if (options.persist !== false) saveEditorSettings();
  updateEditorSettingsUI();
  if (typeof doFind === 'function' && isFindOpen && document.getElementById('findInp')?.value) doFind();
  if (typeof syncEditorSelectionWordStatus === 'function') syncEditorSelectionWordStatus();
}

function setEditorAutoScrollMode(mode, options = {}) {
  if (isChapterReviewModeForEditorSettings()) {
    isEditorAutoScrollModeSelectorOpen = false;
    if (typeof cancelEditorCaretAutoScroll === 'function') cancelEditorCaretAutoScroll();
    if (typeof positionEditorAutoScrollDepthMarker === 'function') positionEditorAutoScrollDepthMarker();
    updateEditorSettingsUI();
    return;
  }
  const nextMode = normalizeEditorAutoScrollMode(mode);
  const shouldEnableAutoScroll = options.enable !== false;
  const modeChanged = editorAutoScrollMode !== nextMode;
  if (shouldEnableAutoScroll) isEditorAutoScrollEnabled = true;
  if (!modeChanged && options.force !== true) {
    if (shouldEnableAutoScroll && options.persist !== false) saveEditorSettings();
    updateEditorSettingsUI();
    if (typeof positionEditorAutoScrollDepthMarker === 'function') positionEditorAutoScrollDepthMarker();
    if (isEditorAutoScrollEnabled && typeof scheduleEditorCaretAutoScroll === 'function') scheduleEditorCaretAutoScroll();
    return;
  }
  editorAutoScrollMode = nextMode;
  if (options.persist !== false) saveEditorSettings();
  updateEditorSettingsUI();
  if (typeof positionEditorAutoScrollDepthMarker === 'function') positionEditorAutoScrollDepthMarker();
  if (typeof scheduleEditorCaretAutoScroll === 'function') scheduleEditorCaretAutoScroll();
}

function toggleEditorAutoScrollEmptyParagraphOnly() {
  if (isChapterReviewModeForEditorSettings()) {
    isEditorAutoScrollModeSelectorOpen = false;
    if (typeof cancelEditorCaretAutoScroll === 'function') cancelEditorCaretAutoScroll();
    updateEditorSettingsUI();
    return;
  }
  isEditorAutoScrollEmptyParagraphOnly = !isEditorAutoScrollEmptyParagraphOnly;
  saveEditorSettings();
  updateEditorSettingsUI();
  if (isEditorAutoScrollEnabled && typeof scheduleEditorCaretAutoScroll === 'function') {
    scheduleEditorCaretAutoScroll();
  } else if (typeof cancelEditorCaretAutoScroll === 'function') {
    cancelEditorCaretAutoScroll();
  }
}

function setEditorReplaceScope(scope, options = {}) {
  editorReplaceScope = normalizeEditorReplaceScope(scope);
  if (options.persist !== false) saveEditorSettings();
  updateEditorSettingsUI();
}

function showProjectGate(message = text().projectGateBody) {
  const gate = document.getElementById('project-gate');
  if (!gate) return;
  setText('projectGateBody', message);
  gate.classList.add('is-visible');
}

function hideProjectGate() {
  const gate = document.getElementById('project-gate');
  if (gate) gate.classList.remove('is-visible');
}

let appLoaderSafetyTimer = null;

function showAppLoader(message = text().loading) {
  const loader = document.getElementById('appLoader');
  if (!loader) return;

  clearTimeout(appLoaderHideTimer);
  clearTimeout(appLoaderSafetyTimer);
  appLoadingDepth += 1;
  setText('appLoaderText', message);
  loader.hidden = false;
  loader.setAttribute('aria-label', message);
  requestAnimationFrame(() => {
    if (appLoadingDepth > 0 && !loader.hidden) loader.classList.add('is-visible');
  });

  // Safety fallback: Automatically dismiss loader after 4.5 seconds to prevent hanging
  appLoaderSafetyTimer = setTimeout(() => {
    hideAppLoader(true);
  }, 4500);
}

function hideAppLoader(force = false) {
  const loader = document.getElementById('appLoader');
  if (!loader) return;

  clearTimeout(appLoaderSafetyTimer);
  appLoadingDepth = force ? 0 : Math.max(0, appLoadingDepth - 1);
  if (appLoadingDepth > 0) return;

  loader.classList.remove('is-visible');
  appLoaderHideTimer = setTimeout(() => {
    if (appLoadingDepth === 0) loader.hidden = true;
  }, 180);
}

function refreshProjectUI() {
  if (isHomePage()) {
    hideProjectGate();
    if (workspaceDirectoryHandle) setHomeMenuStatus(`Workspace ready: ${workspaceDirectoryHandle.name || 'Selected folder'}`);
    return;
  }

  if (!hasActiveStory()) {
    navigateToHomePage();
    return;
  }

  applyLanguage();
  renderChapters();
  if (typeof renderActiveWorkspaceSidePanel === 'function') renderActiveWorkspaceSidePanel();
  else {
    renderTags();
    renderNotes();
  }
  loadEditor();
  updateChapterStatus();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function escapeJsString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function customSelectShouldEnhance(select) {
  return Boolean(
    select &&
    select.tagName === 'SELECT' &&
    !select.classList.contains('dock-native-select') &&
    select.dataset.customSelect !== 'off'
  );
}

function customSelectKey(select) {
  if (!select.dataset.customSelectKey) {
    customSelectCounter += 1;
    select.dataset.customSelectKey = select.id || `lm-custom-select-${customSelectCounter}`;
  }
  return select.dataset.customSelectKey;
}

function customSelectShell(select) {
  const nextElement = select?.nextElementSibling;
  return nextElement?.classList?.contains('lm-custom-select') ? nextElement : null;
}

function selectedCustomSelectOption(select) {
  return select.selectedOptions?.[0] ||
    Array.from(select.options).find(option => option.value === select.value) ||
    select.options[0] ||
    null;
}

function customSelectOptionText(option, fallback = '—') {
  return option?.textContent?.trim() || option?.value || fallback;
}

function isCustomSelectPlaceholderOption(select, option, optionIndex = -1) {
  if (!select || !option) return false;
  if (option.dataset?.placeholder === 'false') return false;
  if (option.dataset?.placeholder === 'true') return true;

  const isFirstOption = optionIndex === 0 || option === select.options?.[0];
  return isFirstOption && option.value === '';
}

function customSelectPlaceholderText(select) {
  const directPlaceholder =
    select?.dataset?.placeholder ||
    select?.getAttribute?.('placeholder') ||
    select?.getAttribute?.('aria-placeholder');

  if (directPlaceholder?.trim()) return directPlaceholder.trim();

  const firstOption = select?.options?.[0];
  if (firstOption && isCustomSelectPlaceholderOption(select, firstOption, 0)) {
    return customSelectOptionText(firstOption, select.getAttribute('aria-label') || 'Select');
  }

  return select?.getAttribute?.('aria-label') || 'Select';
}

function customSelectBoundaryElement(shell) {
  return shell?.closest?.([
    '[data-custom-select-boundary]',
    '.story-info-card',
    '.fact-compose-popover',
    '.naming-entry-panel',
    '.category-input-panel',
    '.category-action-panel',
    '.draft-details-panel',
    '.draft-actions-panel',
    '.draft-promote-destination-panel',
    '.advanced-promote-panel',
    '.chapter-to-draft-panel',
    '.part-details-panel',
    '.chapter-details-panel',
    '.advanced-editor-settings-content',
    '.advanced-editor-settings-card',
    '.side-workspace',
    '.modal-card',
    '.project-gate-card'
  ].join(', ')) || shell?.parentElement || document.documentElement;
}

function centeredCustomSelectLeft(shellRect, menuWidth, viewportGap = 12, fixed = false) {
  const centeredViewportLeft = shellRect.left + ((shellRect.width - menuWidth) / 2);
  const maximumViewportLeft = Math.max(viewportGap, window.innerWidth - viewportGap - menuWidth);
  const clampedViewportLeft = clampNumber(centeredViewportLeft, viewportGap, maximumViewportLeft);
  return fixed ? clampedViewportLeft : clampedViewportLeft - shellRect.left;
}

function centerExpandedCustomSelectMenu(shell, menu, viewportGap = 12) {
  const shellRect = shell.getBoundingClientRect();
  const menuWidth = menu.getBoundingClientRect().width;
  if (!menuWidth || menuWidth <= shellRect.width + 1) return;
  const fixed = getComputedStyle(menu).position === 'fixed';
  const left = centeredCustomSelectLeft(shellRect, menuWidth, viewportGap, fixed);
  menu.style.setProperty('left', `${left}px`, 'important');
  menu.style.setProperty('right', 'auto', 'important');
}

function updateCustomSelectMenuHeight(select, shell, trigger, menu) {
  if (!shell || !trigger || !menu) return;

  const triggerRect = trigger.getBoundingClientRect();
  if (!triggerRect.height) {
    menu.style.removeProperty('--lm-custom-select-menu-max-height');
    return;
  }

  const visibleOptionCount = Array.from(select.options || []).filter((option, optionIndex) =>
    !option.hidden && !isCustomSelectPlaceholderOption(select, option, optionIndex)
  ).length;
  const optionButtons = [...menu.querySelectorAll('.lm-custom-select-option:not([hidden])')];
  const optionGap = 4;
  const menuPadding = 14;
  const optionHeights = optionButtons.map(button => Math.max(34, Math.ceil(button.getBoundingClientRect().height || button.offsetHeight || 34)));
  const heightForCount = count => Math.max(48, optionHeights.slice(0, count).reduce((sum, height) => sum + height, 0) + (Math.max(0, count - 1) * optionGap) + menuPadding);
  const allOptionsHeight = heightForCount(visibleOptionCount);

  const isInAweFloatingDialog = Boolean(select.closest('.awe-rule-entry-panel') || select.closest('.awe-category-action-dialog'));
  if (isInAweFloatingDialog) {
    const maxVisibleOptions = 5;
    const shellRect = shell.getBoundingClientRect();
    const viewportGap = 12;
    const menuGap = 7;
    const requestedHeight = heightForCount(Math.min(maxVisibleOptions, visibleOptionCount));
    const availableBelow = Math.max(48, window.innerHeight - shellRect.bottom - menuGap - viewportGap);
    const availableAbove = Math.max(48, shellRect.top - menuGap - viewportGap);
    const openUpwards = availableBelow < requestedHeight && availableAbove > availableBelow;
    const usedHeight = Math.min(requestedHeight, openUpwards ? availableAbove : availableBelow);
    const widestButton = optionButtons.reduce((width, button) => Math.max(width, Math.ceil(button.scrollWidth)), 0);
    const desiredWidth = Math.max(shellRect.width, widestButton + 18);
    const maxWidth = Math.max(shellRect.width, window.innerWidth - (viewportGap * 2));
    const usedWidth = Math.min(desiredWidth, maxWidth);
    const left = centeredCustomSelectLeft(shellRect, usedWidth, viewportGap);
    const needsScroll = visibleOptionCount > maxVisibleOptions || requestedHeight > (openUpwards ? availableAbove : availableBelow);

    menu.classList.toggle('opens-upward', openUpwards);
    menu.style.setProperty('position', 'absolute', 'important');
    menu.style.setProperty('top', openUpwards ? 'auto' : `calc(100% + ${menuGap}px)`, 'important');
    menu.style.setProperty('bottom', openUpwards ? `calc(100% + ${menuGap}px)` : 'auto', 'important');
    menu.style.setProperty('left', `${left}px`, 'important');
    menu.style.setProperty('right', 'auto', 'important');
    menu.style.setProperty('width', `${usedWidth}px`, 'important');
    menu.style.setProperty('min-width', `${shellRect.width}px`, 'important');
    menu.style.setProperty('max-width', `calc(100vw - ${viewportGap * 2}px)`, 'important');
    menu.style.setProperty('height', `${usedHeight}px`, 'important');
    menu.style.setProperty('max-height', `${usedHeight}px`, 'important');
    menu.style.setProperty('overflow-y', needsScroll ? 'auto' : 'hidden', 'important');
    menu.style.setProperty('z-index', '100001', 'important');
    menu.style.setProperty('--lm-custom-select-menu-max-height', `${usedHeight}px`);
    return;
  }

  const isInAdvancedSettings = Boolean(select.closest('.advanced-editor-settings-modal') || select.closest('.advanced-editor-settings-card'));
  if (isInAdvancedSettings) {
    const maxVisibleOptions = 5;
    const visibleRows = Math.min(maxVisibleOptions, visibleOptionCount);
    const requestedHeight = heightForCount(visibleRows);

    const shellRect = shell.getBoundingClientRect();
    const menuGap = 7;
    const viewportGap = 12;
    const availableBelow = Math.max(48, Math.floor(window.innerHeight - shellRect.bottom - menuGap - viewportGap));
    const availableAbove = Math.max(48, Math.floor(shellRect.top - menuGap - viewportGap));
    const openUpwards = availableBelow < requestedHeight && availableAbove > availableBelow;
    const directionalSpace = openUpwards ? availableAbove : availableBelow;
    const usedHeight = Math.min(requestedHeight, directionalSpace);
    const needsScroll = visibleOptionCount > maxVisibleOptions || requestedHeight > directionalSpace;
    const widestButton = optionButtons.reduce((width, button) => Math.max(width, Math.ceil(button.scrollWidth)), 0);
    const desiredWidth = Math.max(shellRect.width, widestButton + 18);
    const usedWidth = Math.min(desiredWidth, Math.max(shellRect.width, window.innerWidth - (viewportGap * 2)));
    const left = centeredCustomSelectLeft(shellRect, usedWidth, viewportGap, true);
    const top = openUpwards ? Math.max(viewportGap, shellRect.top - menuGap - usedHeight) : shellRect.bottom + menuGap;

    menu.classList.toggle('opens-upward', openUpwards);
    // position:fixed escapes all overflow:hidden ancestors (advanced-editor-settings-card etc.)
    menu.style.setProperty('position', 'fixed', 'important');
    menu.style.setProperty('top', `${top}px`, 'important');
    menu.style.setProperty('bottom', 'auto', 'important');
    menu.style.setProperty('left', `${left}px`, 'important');
    menu.style.setProperty('right', 'auto', 'important');
    menu.style.setProperty('width', `${usedWidth}px`, 'important');
    menu.style.setProperty('min-width', `${shellRect.width}px`, 'important');
    menu.style.setProperty('max-width', `calc(100vw - ${viewportGap * 2}px)`, 'important');
    menu.style.setProperty('height', `${usedHeight}px`, 'important');
    menu.style.setProperty('max-height', `${usedHeight}px`, 'important');
    menu.style.setProperty('overflow', 'hidden', 'important');
    menu.style.setProperty('overflow-y', needsScroll ? 'auto' : 'hidden', 'important');
    menu.style.setProperty('z-index', '99999', 'important');
    menu.style.setProperty('--lm-custom-select-menu-max-height', `${usedHeight}px`);
    return;
  }

  const advancedCard = select.closest('.advanced-editor-settings-card') || select.closest('.advanced-editor-settings-content') || select.closest('.advanced-editor-settings-modal');
  const boundary = customSelectBoundaryElement(shell) || advancedCard;
  const boundaryRect = boundary?.getBoundingClientRect?.();
  const viewportBottom = boundaryRect?.height
    ? Math.min(boundaryRect.bottom - 12, window.innerHeight - 12)
    : Math.max(0, window.innerHeight - 12);
  const boundaryTop = boundaryRect?.height
    ? Math.max(boundaryRect.top + 12, 12)
    : 12;
  const gap = 6;
  const padding = 10;
  const availableBelow = Math.floor(viewportBottom - triggerRect.bottom - gap - padding);
  const availableAbove = Math.floor(triggerRect.top - boundaryTop - gap - padding);
  const boundaryHeight = boundaryRect?.height || window.innerHeight;
  const availableByBox = Math.floor(boundaryHeight - triggerRect.height - gap - (padding * 2));

  const configuredMaxHeight = Number(select?.dataset?.menuMaxHeight) || 0;
  const openUpwards = availableBelow < allOptionsHeight && availableAbove > availableBelow;
  const directionalSpace = openUpwards ? availableAbove : availableBelow;
  const availableHeight = directionalSpace > 0 ? directionalSpace : availableByBox;
  const maxAllowedSpace = Math.max(48, Math.floor(availableHeight));
  const usableMaxHeight = configuredMaxHeight ? Math.min(configuredMaxHeight, maxAllowedSpace) : maxAllowedSpace;

  menu.classList.toggle('opens-upward', openUpwards);

  if (allOptionsHeight <= usableMaxHeight) {
    menu.style.maxHeight = `${Math.floor(allOptionsHeight)}px`;
    menu.style.setProperty('--lm-custom-select-menu-max-height', `${Math.floor(allOptionsHeight)}px`);
    menu.style.overflowY = 'hidden';
  } else {
    menu.style.maxHeight = `${Math.floor(usableMaxHeight)}px`;
    menu.style.setProperty('--lm-custom-select-menu-max-height', `${Math.floor(usableMaxHeight)}px`);
    menu.style.overflowY = 'auto';
  }
  centerExpandedCustomSelectMenu(shell, menu);
}

function closeCustomSelects() {
  if (!activeCustomSelectKey) return;
  const previousKey = activeCustomSelectKey;
  activeCustomSelectKey = null;
  document.querySelectorAll(`select[data-custom-select-key="${CSS.escape(previousKey)}"]`).forEach(syncCustomSelect);
}

function chooseCustomSelectOption(select, optionIndex) {
  if (!select || optionIndex < 0 || optionIndex >= select.options.length) return;
  const option = select.options[optionIndex];
  if (!option || option.hidden || option.disabled || isCustomSelectPlaceholderOption(select, option, optionIndex)) return;
  const previousValue = select.value;
  select.selectedIndex = optionIndex;
  syncCustomSelect(select);
  closeCustomSelects();

  if (select.value !== previousValue) {
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  requestAnimationFrame(() => syncCustomSelect(select));
}

function handleCustomSelectTriggerKey(event, select) {
  if (!select) return;
  const selectedIndex = Math.max(0, select.selectedIndex);

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    toggleCustomSelect(select);
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closeCustomSelects();
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (activeCustomSelectKey !== customSelectKey(select)) {
      activeCustomSelectKey = customSelectKey(select);
      syncCustomSelect(select);
      return;
    }

    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const selectableIndexes = Array.from(select.options)
      .map((option, optionIndex) => ({ option, optionIndex }))
      .filter(({ option, optionIndex }) =>
        !option.hidden &&
        !option.disabled &&
        !isCustomSelectPlaceholderOption(select, option, optionIndex)
      )
      .map(({ optionIndex }) => optionIndex);
    if (!selectableIndexes.length) return;

    const currentSelectableIndex = selectableIndexes.indexOf(selectedIndex);
    const fallbackIndex = delta > 0 ? selectableIndexes[0] : selectableIndexes[selectableIndexes.length - 1];
    const nextIndex = currentSelectableIndex === -1
      ? fallbackIndex
      : selectableIndexes[clampNumber(currentSelectableIndex + delta, 0, selectableIndexes.length - 1)];
    chooseCustomSelectOption(select, nextIndex);
  }
}

function ensureCustomSelect(select) {
  if (!customSelectShouldEnhance(select)) return null;

  const key = customSelectKey(select);
  select.classList.add('lm-native-select');
  let shell = customSelectShell(select);

  if (!shell) {
    shell = document.createElement('div');
    shell.className = 'lm-custom-select';
    shell.dataset.selectKey = key;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'lm-custom-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const value = document.createElement('span');
    value.className = 'lm-custom-select-value';

    const caret = document.createElement('span');
    caret.className = 'lm-custom-select-caret';
    caret.setAttribute('aria-hidden', 'true');

    const caretSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    caretSvg.setAttribute('viewBox', '0 0 512 512');
    caretSvg.setAttribute('focusable', 'false');
    const caretPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    caretPath.setAttribute('d', 'm98 190.06 139.78 163.12a24 24 0 0 0 36.44 0L414 190.06c13.34-15.57 2.28-39.62-18.22-39.62h-279.6c-20.5 0-31.56 24.05-18.18 39.62z');
    caretPath.setAttribute('fill', 'currentColor');
    caretSvg.append(caretPath);
    caret.append(caretSvg);

    const menu = document.createElement('div');
    menu.className = 'lm-custom-select-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    trigger.append(value, caret);
    shell.append(trigger, menu);
    select.insertAdjacentElement('afterend', shell);

    trigger.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      toggleCustomSelect(select);
    });
    shell.addEventListener('pointerdown', event => {
      event.stopPropagation();
    });
    trigger.addEventListener('keydown', event => handleCustomSelectTriggerKey(event, select));
  }

  if (!customSelectObservers.has(select)) {
    const observer = new MutationObserver(() => queueCustomSelectSync());
    observer.observe(select, { attributes: true, childList: true, subtree: true, characterData: true });
    customSelectObservers.set(select, observer);
    select.addEventListener('change', () => syncCustomSelect(select));
  }

  return shell;
}

function syncCustomSelect(select) {
  if (!customSelectShouldEnhance(select)) return;
  const shell = ensureCustomSelect(select);
  if (!shell) return;

  const key = customSelectKey(select);
  const trigger = shell.querySelector('.lm-custom-select-trigger');
  const valueLabel = shell.querySelector('.lm-custom-select-value');
  const menu = shell.querySelector('.lm-custom-select-menu');
  const selectedOption = selectedCustomSelectOption(select);
  const selectedOptionIndex = selectedOption ? Array.prototype.indexOf.call(select.options, selectedOption) : -1;
  const isShowingPlaceholder = !select.value || isCustomSelectPlaceholderOption(select, selectedOption, selectedOptionIndex);
  const selectedText = isShowingPlaceholder
    ? customSelectPlaceholderText(select)
    : customSelectOptionText(selectedOption, select.getAttribute('aria-label') || 'Select');
  const isOpen = activeCustomSelectKey === key;

  shell.classList.toggle('is-open', isOpen);
  shell.classList.toggle('is-disabled', select.disabled);
  shell.classList.toggle('has-placeholder', isShowingPlaceholder);
  shell.dataset.selectId = select.id || '';

  if (valueLabel) valueLabel.textContent = selectedText;
  if (trigger) {
    trigger.disabled = select.disabled;
    trigger.title = selectedText;
    trigger.setAttribute('aria-expanded', String(isOpen));
    trigger.setAttribute('aria-label', select.getAttribute('aria-label') || selectedText);
  }
  if (!menu) return;

  menu.hidden = !isOpen;
  // Reset fixed-position styles when menu closes (set by isInRuleDialog for AWE section)
  if (!isOpen) {
    menu.style.removeProperty('position');
    menu.style.removeProperty('top');
    menu.style.removeProperty('left');
    menu.style.removeProperty('right');
    menu.style.removeProperty('bottom');
    menu.style.removeProperty('width');
    menu.style.removeProperty('min-width');
    menu.style.removeProperty('max-width');
    menu.style.removeProperty('height');
    menu.style.removeProperty('max-height');
    menu.style.removeProperty('overflow');
    menu.style.removeProperty('overflow-y');
    menu.style.removeProperty('z-index');
  }
  menu.innerHTML = '';
  Array.from(select.options).forEach((option, optionIndex) => {
    if (option.hidden || isCustomSelectPlaceholderOption(select, option, optionIndex)) return;
    const optionButton = document.createElement('button');
    optionButton.type = 'button';
    optionButton.className = 'lm-custom-select-option';
    optionButton.textContent = customSelectOptionText(option);
    optionButton.dataset.index = String(optionIndex);
    optionButton.setAttribute('role', 'option');
    optionButton.setAttribute('aria-selected', String(optionIndex === select.selectedIndex));
    optionButton.disabled = option.disabled;
    optionButton.classList.toggle('is-selected', optionIndex === select.selectedIndex);
    optionButton.addEventListener('pointerdown', event => {
      event.preventDefault();
      event.stopPropagation();
      if (!option.disabled) chooseCustomSelectOption(select, optionIndex);
    });
    optionButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (!option.disabled) chooseCustomSelectOption(select, optionIndex);
    });
    menu.appendChild(optionButton);
  });
  if (trigger && isOpen) updateCustomSelectMenuHeight(select, shell, trigger, menu);
}

function toggleCustomSelect(select) {
  if (!customSelectShouldEnhance(select) || select.disabled) return;
  const key = customSelectKey(select);
  activeCustomSelectKey = activeCustomSelectKey === key ? null : key;
  syncCustomSelects();
  if (activeCustomSelectKey === key) requestAnimationFrame(() => syncCustomSelect(select));
}

function syncCustomSelects(root = document) {
  root.querySelectorAll?.('select')?.forEach(select => {
    if (customSelectShouldEnhance(select)) syncCustomSelect(select);
  });
}

function queueCustomSelectSync(root = document) {
  cancelAnimationFrame(customSelectSyncRaf);
  customSelectSyncRaf = requestAnimationFrame(() => syncCustomSelects(root));
}

function initCustomSelects(root = document) {
  syncCustomSelects(root);
  if (customSelectGlobalsBound) return;
  customSelectGlobalsBound = true;

  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('.lm-custom-select')) closeCustomSelects();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeCustomSelects();
  });
  window.addEventListener('resize', closeCustomSelects);
}

document.addEventListener('DOMContentLoaded', () => {
  requestAnimationFrame(() => initCustomSelects());
});
