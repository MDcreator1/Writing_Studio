function openSelectedDraftsPromoteDestinationPanel(anchor = null) {
  chapterDrafts = normalizeDrafts(chapterDrafts);
  normalizeDraftSelection();
  const panel = document.getElementById('draftDetailsPanel');
  const selectedCount = selectedDraftIndexes.size;
  if (!panel || !selectedCount) return;

  const copy = text();
  closePartDetailsPanel();
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  activeDraftDetailsIndex = 'promote:selected';
  activeFloatingAnchor = anchor;
  panel.dataset.positionKey = 'draftActionPromoteDestinationPanel';
  panel.classList.add('draft-actions-panel', 'draft-promote-destination-panel');
  panel.innerHTML = `
    <div class="part-details-head draft-delete-confirm-head">
      <strong>${escapeHtml(copy.promoteSelectedDestinationTitle)}</strong>
      <button class="name-panel-close" type="button" onclick="closeDraftActionsPanel()">${CROSS_CLOSE_SVG}</button>
    </div>
    <p class="draft-delete-confirm-copy">${escapeHtml(copy.promoteSelectedDestinationBody)}</p>
    <div class="draft-promote-choice-grid">
      <button class="draft-promote-choice-btn" type="button" onclick="confirmSelectedDraftsPromoteDestination('part')">
        ${escapeHtml(copy.promoteToRecentPart)}
      </button>
      <button class="draft-promote-choice-btn" type="button" onclick="confirmSelectedDraftsPromoteDestination('raw')">
        ${escapeHtml(copy.promoteToRawChapters)}
      </button>
    </div>`;

  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
}

async function confirmSelectedDraftsPromoteDestination(destination = 'part') {
  await promoteSelectedDraftsToChapters(destination);
}

async function requestPromoteSelectedDrafts(anchor = null) {
  ensureChapters();
  chapterDrafts = normalizeDrafts(chapterDrafts);
  normalizeDraftSelection();
  if (!selectedDraftIndexes.size) return;
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  if (hasRawChaptersInPanel(manifest)) {
    openSelectedDraftsPromoteDestinationPanel(anchor);
    return;
  }
  await promoteSelectedDraftsToChapters('part');
}

async function promoteSelectedDraftsToChapters(destination = 'part') {
  ensureChapters();
  chapterDrafts = normalizeDrafts(chapterDrafts);
  normalizeDraftSelection();
  const selectedIndexes = Array.from(selectedDraftIndexes).sort((left, right) => left - right);
  if (!selectedIndexes.length) return;

  syncActiveEditorDocumentFromEditor();
  const selectedDrafts = selectedIndexes.map(index => {
    const draft = chapterDrafts[index];
    return draft ? { id: draft.id, contentPath: draft.contentPath, createdAt: draft.createdAt, title: draft.title } : null;
  }).filter(Boolean);
  const reservedTitles = new Set(chapters.map((chapter, index) => uniqueNameKey(chapterDisplayTitle(chapter, index))));
  for (const draft of selectedDrafts) {
    const titleKey = uniqueNameKey(draft.title);
    if (titleKey && reservedTitles.has(titleKey)) {
      showDuplicateReminder(text().duplicateChapterTitle);
      return;
    }
    if (titleKey) reservedTitles.add(titleKey);
  }

  closeDraftActionsPanel();
  let promotedCount = 0;
  for (const selectedDraft of selectedDrafts) {
    const currentIndex = chapterDrafts.findIndex(draft =>
      draft.id === selectedDraft.id &&
      draft.contentPath === selectedDraft.contentPath &&
      draft.createdAt === selectedDraft.createdAt
    );
    if (currentIndex < 0) continue;
    await promoteDraftToChapter(currentIndex, destination);
    promotedCount += 1;
  }
  if (promotedCount > 1) {
    showMiniReminder(text().selectedDraftsPromoted.replace('{count}', promotedCount));
  }
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

function handleEditorContentInput(event = null) {
  if (event?.inputType === 'historyUndo' || event?.inputType === 'historyRedo') {
    syncEditorPlaceholderState();
    return;
  }
  if (
    !event?.inputType &&
    performance.now() <= virtualEditorHistoryInputSuppressionUntil
  ) {
    syncEditorPlaceholderState();
    return;
  }
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
