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

