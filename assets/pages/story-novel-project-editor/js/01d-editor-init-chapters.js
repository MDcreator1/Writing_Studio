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

  if (wantsLocalProject && !loadedLocalProject) clearActiveStoryState();

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
  if (typeof renderActiveWorkspaceSidePanel === 'function') renderActiveWorkspaceSidePanel();
  else {
    renderTags();
    renderNotes();
  }
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
  editor.addEventListener('input', editorHistoryAfterInput);
  editor.addEventListener('beforeinput', editorHistoryBeforeInput, true);
  editor.addEventListener('compositionstart', editorHistoryCompositionStart, true);
  editor.addEventListener('compositionend', editorHistoryCompositionEnd, true);
  editor.addEventListener('beforeinput', captureVirtualEditorBeforeInputContext, true);
  window.addEventListener('keydown', handleRestrictedInputSessionKeydown, true);
  editor.addEventListener('beforeinput', guardLockedEditorMutation);
  editor.addEventListener('beforeinput', handlePlainTextEditorBeforeInput, true);
  if (window.LmHindiUnicodeEditing?.initHindiUnicodeEditing) {
    window.LmHindiUnicodeEditing.initHindiUnicodeEditing(editor, {
      canEdit: () => typeof canEditActiveDocument !== 'function' || canEditActiveDocument(),
      onBeforeLogicalEdit({ inputType } = {}) {
        editorHistoryBeforeInput({
          inputType: inputType || '',
          data: null,
          preventDefault() {},
          stopImmediatePropagation() {}
        });
      },
      onLogicalEdit({ range } = {}) {
        if (range) savedEditorRange = range.cloneRange();
        editorHistoryAfterInput();
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
    saveEditorSettings({ persistProject: false });
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
  saveEditorSettings({ persistProject: false });
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
  if (activeSidePanel === 'ai' && typeof renderAIDesk === 'function') renderAIDesk();
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
