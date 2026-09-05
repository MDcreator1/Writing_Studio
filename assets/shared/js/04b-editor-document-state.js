function ensureChapters() {
  if (!hasActiveStory()) {
    chapters = [];
    chapterDrafts = [];
    chapterTrashDrafts = [];
    chapterEditDrafts = normalizeChapterEditDrafts(chapterEditDrafts);
    curChap = 0;
    curPart = 0;
    curDraft = -1;
    curTrashDraft = -1;
    activeEditorMode = 'chapter';
    trashReturnEditorState = null;
    expandedPartIndex = 0;
    selectedTrashDraftIndexes.clear();
    lastSelectedTrashDraftIndex = null;
    isDraftTrashMode = false;
    return;
  }

  if (!Array.isArray(chapters) || !chapters.length) {
    chapters = chaptersFromManifest();
  }
  chapters = chapters.map(normalizeChapter);
  chapterDrafts = normalizeDrafts(chapterDrafts);
  chapterTrashDrafts = normalizeTrashDrafts(chapterTrashDrafts);
  if (curTrashDraft < 0 || curTrashDraft >= chapterTrashDrafts.length) {
    curTrashDraft = chapterTrashDrafts.length ? chapterTrashDrafts.length - 1 : -1;
    if (activeEditorMode === 'trash' && curTrashDraft === -1) activeEditorMode = chapters.length ? 'chapter' : chapterDrafts.length ? 'draft' : 'chapter';
  }
  if (!chapters.length && !chapterDrafts.length && normalizeProjectManifest(projectManifest || createProjectManifest()).parts.length) {
    chapters = [createDefaultChapter()];
  }
  if (curChap < 0 || curChap >= chapters.length) curChap = 0;
  if (curDraft < 0 || curDraft >= chapterDrafts.length) {
    curDraft = chapterDrafts.length ? 0 : -1;
    if (activeEditorMode === 'draft' && curDraft === -1) activeEditorMode = 'chapter';
  }
  if (!chapters.length && chapterDrafts.length) {
    activeEditorMode = 'draft';
    curDraft = curDraft >= 0 ? curDraft : 0;
  }
  const partCount = normalizeProjectManifest(projectManifest || createProjectManifest()).parts.length;
  if (isDraftActive()) {
    curPart = -1;
    if (!partCount) expandedPartIndex = -1;
    else if (expandedPartIndex >= partCount) expandedPartIndex = -1;
    return;
  }
  curPart = chapters[curChap]?.partIndex ?? (partCount ? 0 : -1);
  if (!partCount) expandedPartIndex = -1;
  else if (expandedPartIndex >= partCount) expandedPartIndex = curPart;
}

function parseSavedEditorIndex(storageKey, fallback = -1) {
  const storedValue = localStorage.getItem(storageKey);
  if (storedValue === null) return fallback;
  const parsedValue = parseInt(storedValue, 10);
  return Number.isInteger(parsedValue) ? parsedValue : fallback;
}

function syncSidebarWithRestoredEditorTarget() {
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const partCount = manifest.parts.length;

  if (isDraftActive()) {
    curPart = -1;
    expandedPartIndex = -1;
    isRawChapterSectionExpanded = false;
    isPartsListCollapsedByRaw = partCount > 0;
    isPartsListForceExpanded = false;
    chapterListOverflowMode = partCount > 0 ? 'collapsed' : 'normal';
    return;
  }

  const activePartIndex = chapters[curChap]?.partIndex;
  const hasActivePart = partCount &&
    Number.isInteger(activePartIndex) &&
    activePartIndex >= 0 &&
    activePartIndex < partCount;

  curPart = hasActivePart ? activePartIndex : -1;
  expandedPartIndex = hasActivePart ? activePartIndex : -1;
  isRawChapterSectionExpanded = !hasActivePart && chapters.length > 0;
  isPartsListCollapsedByRaw = !hasActivePart && chapters.length > 0;
  isPartsListForceExpanded = Boolean(hasActivePart);
  if (hasActivePart && chapterListOverflowMode === 'collapsed') {
    chapterListOverflowMode = 'expanded';
  }
}

function restoreSavedActiveEditorTarget(savedTarget = null) {
  const hasSavedTarget = savedTarget && typeof savedTarget === 'object';
  const targetChapterIndex = parseInt(savedTarget?.curChap, 10);
  const targetDraftIndex = parseInt(savedTarget?.curDraft, 10);
  const savedChapterIndex = hasSavedTarget
    ? (Number.isInteger(targetChapterIndex) ? clampNumber(targetChapterIndex, -1, Math.max(chapters.length - 1, -1)) : -1)
    : parseSavedEditorIndex('lm_curChap', curChap);
  const savedDraftIndex = hasSavedTarget
    ? (Number.isInteger(targetDraftIndex) ? clampNumber(targetDraftIndex, -1, Math.max(chapterDrafts.length - 1, -1)) : -1)
    : parseSavedEditorIndex('lm_curDraft', curDraft);
  const savedMode = hasSavedTarget ? savedTarget.mode : localStorage.getItem('lm_activeEditorMode');

  if (chapters.length) {
    curChap = savedChapterIndex >= 0 && savedChapterIndex < chapters.length
      ? savedChapterIndex
      : Math.min(Math.max(curChap, 0), chapters.length - 1);
  } else {
    curChap = 0;
  }

  const shouldRestoreDraft = savedMode === 'draft' || (!chapters.length && chapterDrafts.length);
  if (shouldRestoreDraft && savedDraftIndex >= 0 && savedDraftIndex < chapterDrafts.length) {
    curDraft = savedDraftIndex;
    activeEditorMode = 'draft';
    activeChapterEditKey = null;
    isChapterEditUnlocked = false;
    syncSidebarWithRestoredEditorTarget();
    return;
  }

  if (chapterDrafts.length) {
    curDraft = savedDraftIndex >= 0 && savedDraftIndex < chapterDrafts.length
      ? savedDraftIndex
      : Math.min(Math.max(curDraft, 0), chapterDrafts.length - 1);
  } else {
    curDraft = -1;
  }

  activeEditorMode = chapters.length ? 'chapter' : chapterDrafts.length ? 'draft' : 'chapter';
  activeChapterEditKey = null;
  isChapterEditUnlocked = false;
  syncSidebarWithRestoredEditorTarget();
}

function isDraftActive() {
  return activeEditorMode === 'draft' && curDraft >= 0 && Boolean(chapterDrafts[curDraft]);
}

function isTrashDraftActive() {
  return activeEditorMode === 'trash' && curTrashDraft >= 0 && Boolean(chapterTrashDrafts[curTrashDraft]);
}

function activeEditorDocument() {
  if (isChapterEditDraftActive()) return activeChapterEditDraft();
  if (isTrashDraftActive()) return chapterTrashDrafts[curTrashDraft];
  return isDraftActive() ? chapterDrafts[curDraft] : chapters[curChap];
}

function activeEditorDisplayTitle() {
  const documentItem = activeEditorDocument();
  if (isTrashDraftActive()) return documentItem?.title || `${text().draftPrefix} ${curTrashDraft + 1}`;
  if (isDraftActive()) return documentItem?.title || `${text().draftPrefix} ${curDraft + 1}`;
  if (isChapterEditDraftActive()) return documentItem?.title || chapterDisplayTitle(chapters[curChap], curChap);
  return chapterDisplayTitle(documentItem, curChap);
}

function activeEditorStorageKey() {
  if (isTrashDraftActive()) return chapterTrashDrafts[curTrashDraft]?.contentPath || trashDraftFilePath(curTrashDraft);
  return isDraftActive()
    ? chapterDrafts[curDraft]?.contentPath || draftFilePath(curDraft)
    : chapterStorageKey(curChap);
}

function chapterEditDraftKey(index = curChap) {
  return chapterStorageKey(index);
}

function isChapterEditDraftActive() {
  return isChapterEditUnlocked &&
    !isDraftActive() &&
    !isTrashDraftActive() &&
    activeChapterEditKey === chapterEditDraftKey(curChap) &&
    Boolean(chapterEditDrafts[activeChapterEditKey]);
}

function activeChapterEditDraft() {
  return isChapterEditDraftActive() ? chapterEditDrafts[activeChapterEditKey] : null;
}

function ensureChapterEditDraft(index = curChap) {
  ensureChapters();
  const chapter = chapters[index];
  if (!chapter) return null;

  const chapterKey = chapterEditDraftKey(index);
  if (!chapterEditDrafts[chapterKey]) {
    chapterEditDrafts[chapterKey] = normalizeChapterEditDraft({
      id: `chapter-edit-${Date.now()}`,
      chapterKey,
      chapterIndex: index,
      title: chapterDisplayTitle(chapter, index),
      content: index === curChap ? getCleanEditorHTML() : chapter.content || '',
      contentPath: chapterEditDraftFilePath(index),
      draftNo: index + 1,
      alignment: chapter.alignment,
      lineHeight: chapter.lineHeight,
      paragraphGap: chapter.paragraphGap,
      paragraphMargin: chapter.paragraphMargin,
      fontFamily: chapter.fontFamily,
      fontSize: chapter.fontSize,
      createdAt: new Date().toISOString(),
      lastAutosavedHTML: chapter.content || '',
      lastAutosavedText: typeof editorHTMLToText === 'function' ? editorHTMLToText(chapter.content || '') : ''
    }, chapterKey);
  }

  chapterEditDrafts[chapterKey].chapterIndex = index;
  return chapterEditDrafts[chapterKey];
}

function normalizeChapterEditCompareTitle(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeChapterEditCompareFileText(value) {
  const textValue = typeof editorHTMLToText === 'function'
    ? editorHTMLToText(value)
    : String(value || '');
  return String(textValue || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trimEnd();
}

function chapterEditContentMatches(leftContent, rightContent) {
  return normalizeChapterEditCompareFileText(leftContent) === normalizeChapterEditCompareFileText(rightContent);
}

function normalizeChapterEditCompareHTML(value) {
  const root = document.createElement('div');
  root.innerHTML = String(value || '');
  if (typeof unwrapHighlights === 'function') unwrapHighlights(root);
  root.querySelectorAll('.hindi-pending-virama-boundary, [data-lm-pending-virama-boundary]').forEach(node => node.remove());
  if (typeof normalizeEditorGapMarkers === 'function') normalizeEditorGapMarkers(root);
  if (typeof normalizeEditorParagraphBlocks === 'function') normalizeEditorParagraphBlocks(root);
  if (typeof isEditorVisuallyEmpty === 'function' && isEditorVisuallyEmpty(root)) return '';
  root.querySelectorAll('[style]').forEach(node => {
    const styleValue = node.getAttribute('style')
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .sort()
      .join('; ');
    if (styleValue) node.setAttribute('style', `${styleValue};`);
    else node.removeAttribute('style');
  });
  return root.innerHTML.trim();
}

function chapterEditFormattingContentMatches(leftContent, rightContent) {
  return normalizeChapterEditCompareHTML(leftContent) === normalizeChapterEditCompareHTML(rightContent);
}

function normalizeChapterEditComparePlainTextFile(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trimEnd();
}

function chapterEditPlainTextFilesMatch(leftText, rightText) {
  return normalizeChapterEditComparePlainTextFile(leftText) === normalizeChapterEditComparePlainTextFile(rightText);
}

function chapterEditDraftMismatchKeys(draft, chapter, index = curChap) {
  if (!draft || !chapter) return [];
  const mismatchKeys = [];
  const draftTitle = normalizeChapterEditCompareTitle(draft.title || chapterDisplayTitle(chapter, index));
  const chapterTitle = normalizeChapterEditCompareTitle(chapterDisplayTitle(chapter, index));
  if (draftTitle !== chapterTitle) mismatchKeys.push('title');
  const textMatches = chapterEditContentMatches(draft.content, chapter.content);
  if (!textMatches) mismatchKeys.push('text');
  else if (!chapterEditFormattingContentMatches(draft.content, chapter.content)) mismatchKeys.push('selectionFormatting');
  if (normalizeEditorAlignment(draft.alignment) !== normalizeEditorAlignment(chapter.alignment)) mismatchKeys.push('alignment');
  if (normalizeOptionalEditorLineHeight(draft.lineHeight) !== normalizeOptionalEditorLineHeight(chapter.lineHeight)) mismatchKeys.push('lineHeight');
  if (normalizeOptionalEditorParagraphGap(draft.paragraphGap) !== normalizeOptionalEditorParagraphGap(chapter.paragraphGap)) mismatchKeys.push('paragraphGap');
  if (normalizeOptionalEditorParagraphMargin(draft.paragraphMargin) !== normalizeOptionalEditorParagraphMargin(chapter.paragraphMargin)) mismatchKeys.push('paragraphMargin');
  if (normalizeEditorFontFamily(draft.fontFamily) !== normalizeEditorFontFamily(chapter.fontFamily)) mismatchKeys.push('fontFamily');
  if (normalizeEditorFontSize(draft.fontSize) !== normalizeEditorFontSize(chapter.fontSize)) mismatchKeys.push('fontSize');
  return mismatchKeys;
}

function chapterEditFormattingMatchesSavedChapter(draft, chapter) {
  if (!draft || !chapter) return true;
  return normalizeEditorAlignment(draft.alignment) === normalizeEditorAlignment(chapter.alignment) &&
    normalizeOptionalEditorLineHeight(draft.lineHeight) === normalizeOptionalEditorLineHeight(chapter.lineHeight) &&
    normalizeOptionalEditorParagraphGap(draft.paragraphGap) === normalizeOptionalEditorParagraphGap(chapter.paragraphGap) &&
    normalizeOptionalEditorParagraphMargin(draft.paragraphMargin) === normalizeOptionalEditorParagraphMargin(chapter.paragraphMargin) &&
    normalizeEditorFontFamily(draft.fontFamily) === normalizeEditorFontFamily(chapter.fontFamily) &&
    normalizeEditorFontSize(draft.fontSize) === normalizeEditorFontSize(chapter.fontSize) &&
    chapterEditFormattingContentMatches(draft.content, chapter.content);
}

function chapterEditDraftTitleAndContentMatchSavedChapter(draft, chapter, index = curChap) {
  if (!draft || !chapter) return true;
  return chapterEditDraftMismatchKeys(draft, chapter, index).length === 0;
}

function chapterEditDraftMismatchReminderMessage(draft, chapter, index = curChap) {
  const mismatchKeys = chapterEditDraftMismatchKeys(draft, chapter, index);
  if (!mismatchKeys.length) return '';
  const copy = text();
  const labels = {
    title: copy.chapterEditMismatchTitle,
    text: copy.chapterEditMismatchText,
    alignment: copy.chapterEditMismatchAlignment,
    lineHeight: copy.chapterEditMismatchLineHeight,
    paragraphGap: copy.chapterEditMismatchParagraphGap,
    paragraphMargin: copy.chapterEditMismatchParagraphMargin,
    fontFamily: copy.chapterEditMismatchFontFamily,
    fontSize: copy.chapterEditMismatchFontSize,
    selectionFormatting: copy.chapterEditMismatchSelectionFormatting
  };
  return `${copy.chapterEditMismatchPrefix} ${mismatchKeys.map(key => labels[key] || key).join(', ')}`;
}

function isChapterEditContentSameAsSavedChapter(content, index = curChap) {
  const chapter = chapters[index];
  if (!chapter) return true;
  return chapterEditContentMatches(content, chapter.content) &&
    chapterEditFormattingContentMatches(content, chapter.content);
}

function hasChapterEditContentChangedFromSaved(content = getCleanEditorHTML(), index = curChap) {
  return !isChapterEditContentSameAsSavedChapter(content, index);
}

function chapterEditDraftMatchesSavedChapter(draft, chapter, index = curChap) {
  if (!draft || !chapter) return true;
  return chapterEditDraftTitleAndContentMatchSavedChapter(draft, chapter, index);
}

function isChapterEditDraftSameAsChapter(draft = activeChapterEditDraft(), index = curChap) {
  const chapter = chapters[index];
  return chapterEditDraftMatchesSavedChapter(draft, chapter, index);
}

function activateChapterEditDraft(index = curChap) {
  ensureChapters();
  if (index < 0 || index >= chapters.length) return;
  curChap = index;
  const targetPartIndex = chapters[curChap]?.partIndex;
  const hasTargetPart = Number.isInteger(targetPartIndex) && targetPartIndex >= 0;
  curPart = hasTargetPart ? targetPartIndex : -1;
  expandedPartIndex = hasTargetPart ? curPart : -1;
  isRawChapterSectionExpanded = !hasTargetPart;
  isPartsListCollapsedByRaw = !hasTargetPart;
  isPartsListForceExpanded = hasTargetPart;
  if (hasTargetPart && chapterListOverflowMode === 'collapsed') chapterListOverflowMode = 'expanded';
  activeEditorMode = 'chapter';
  const chapterKey = chapterEditDraftKey(curChap);
  const hadExistingDraft = Boolean(chapterEditDrafts[chapterKey]);
  const existingDraft = chapterEditDrafts[chapterKey]
    ? normalizeChapterEditDraft(chapterEditDrafts[chapterKey], chapterKey)
    : null;
  const draft = existingDraft || ensureChapterEditDraft(curChap);
  if (draft) {
    draft.chapterIndex = curChap;
    chapterEditDrafts[chapterKey] = draft;
    activeChapterEditKey = draft.chapterKey;
  } else {
    activeChapterEditKey = null;
  }
  isChapterEditUnlocked = true;
  if (draft) {
    const draftText = typeof editorHTMLToText === 'function'
      ? editorHTMLToText(draft.content || chapters[curChap]?.content || '')
      : '';
    const draftHasUnsavedMemoryChanges =
      draft.content !== (draft.lastAutosavedHTML || '') ||
      normalizeChapterEditComparePlainTextFile(draftText) !==
        normalizeChapterEditComparePlainTextFile(draft.lastAutosavedText || '');
    // Opening an already durable, unchanged draft must not cause another
    // disk write. Changed memory content (or a newly-created draft) still
    // follows the existing durable-write path.
    const needsDurableWrite = !hadExistingDraft || draftHasUnsavedMemoryChanges;
    if (needsDurableWrite && typeof writeChapterEditDraftToLocalFile === 'function' && projectDirectoryHandle) {
      writeChapterEditDraftToLocalFile(draft.chapterKey, draftText)
        .catch(error => console.warn('Chapter edit draft open save failed:', error));
    } else if (needsDurableWrite) {
      persistChapterEditDrafts();
    }
  }
  loadEditor();
  renderChapters();
  if (typeof renderActiveWorkspaceSidePanel === 'function') renderActiveWorkspaceSidePanel();
  else {
    renderTags();
    renderNotes();
  }
  updateChapterStatus();
  syncActiveEditorEditState();
  const draftMatchesChapter = draft && isChapterEditDraftSameAsChapter(draft, curChap);
  if (draft && !draftMatchesChapter && (draft.content || '') !== (draft.lastAutosavedHTML || '')) {
    showUnsavedSaveStatus(text().unsaved);
  } else {
    setSaveButtonSaved(true);
    setDefaultSaveStatus();
  }
  const mismatchReminder = chapterEditDraftMismatchReminderMessage(draft, chapters[curChap], curChap);
  if (mismatchReminder) showMiniReminder(mismatchReminder);
  document.getElementById('editor')?.focus({ preventScroll: true });
}

function setChapterEditRecoveryActions({ discardLabel, discardHandler, useLabel, useHandler }) {
  const discardButton = document.getElementById('chapterEditRecoveryDiscardBtn');
  const useButton = document.getElementById('chapterEditRecoveryUseBtn');

  if (discardButton) {
    discardButton.textContent = discardLabel;
    discardButton.onclick = discardHandler;
  }
  if (useButton) {
    useButton.textContent = useLabel;
    useButton.onclick = useHandler;
  }
}

function openChapterEditRecoveryModal(focusButtonId = 'chapterEditRecoveryUseBtn') {
  const panel = document.getElementById('chapter-edit-recovery-modal');
  if (!panel) return;
  panel.classList.add('is-visible');
  panel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('is-chapter-edit-recovery-open');
  requestAnimationFrame(() => document.getElementById(focusButtonId)?.focus({ preventScroll: true }));
}

function showChapterEditRecoveryPanel(index = curChap) {
  pendingChapterEditRecoveryIndex = index;
  setText('chapterEditRecoveryKicker', text().chapterEditRecoveryKicker);
  setText('chapterEditRecoveryTitle', text().chapterEditRecoveryTitle);
  setText('chapterEditRecoveryBody', text().chapterEditRecoveryBody);
  setChapterEditRecoveryActions({
    discardLabel: text().chapterEditRecoveryDiscard,
    discardHandler: discardChapterEditRecovery,
    useLabel: text().chapterEditRecoveryUse,
    useHandler: useChapterEditRecovery
  });
  openChapterEditRecoveryModal('chapterEditRecoveryUseBtn');
}

function handleChapterEditRecoveryBackdrop(event) {
  if (event.target?.id === 'chapter-edit-recovery-modal') closeChapterEditRecoveryPanel();
}

function closeChapterEditRecoveryPanel() {
  pendingChapterEditRecoveryIndex = null;
  const panel = document.getElementById('chapter-edit-recovery-modal');
  if (!panel) return;
  panel.classList.remove('is-visible');
  panel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('is-chapter-edit-recovery-open');
}

function useChapterEditRecovery() {
  const index = Number.isInteger(pendingChapterEditRecoveryIndex) ? pendingChapterEditRecoveryIndex : curChap;
  closeChapterEditRecoveryPanel();
  activateChapterEditDraft(index);
}

async function discardChapterEditRecovery() {
  const index = Number.isInteger(pendingChapterEditRecoveryIndex) ? pendingChapterEditRecoveryIndex : curChap;
  const chapterKey = chapterEditDraftKey(index);
  const chapter = chapters[index];
  delete chapterEditDrafts[chapterKey];

  if (chapter) {
    chapterEditDrafts[chapterKey] = normalizeChapterEditDraft({
      id: `chapter-edit-${Date.now()}`,
      chapterKey,
      chapterIndex: index,
      title: chapterDisplayTitle(chapter, index),
      content: chapter.content || '',
      contentPath: chapterEditDraftFilePath(index),
      draftNo: index + 1,
      alignment: chapter.alignment,
      lineHeight: chapter.lineHeight,
      paragraphGap: chapter.paragraphGap,
      paragraphMargin: chapter.paragraphMargin,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastAutosavedHTML: chapter.content || '',
      lastAutosavedText: typeof editorHTMLToText === 'function' ? editorHTMLToText(chapter.content || '') : ''
    }, chapterKey);
  }

  curChap = index;
  const targetPartIndex = chapters[curChap]?.partIndex;
  const hasTargetPart = Number.isInteger(targetPartIndex) && targetPartIndex >= 0;
  curPart = hasTargetPart ? targetPartIndex : -1;
  expandedPartIndex = hasTargetPart ? curPart : -1;
  isRawChapterSectionExpanded = !hasTargetPart;
  isPartsListCollapsedByRaw = !hasTargetPart;
  isPartsListForceExpanded = hasTargetPart;
  if (hasTargetPart && chapterListOverflowMode === 'collapsed') chapterListOverflowMode = 'expanded';
  activeEditorMode = 'chapter';
  activeChapterEditKey = chapterKey;
  isChapterEditUnlocked = Boolean(chapterEditDrafts[chapterKey]);
  isEditingChapterTitle = false;
  const titleButton = document.getElementById('cur-chap');
  const titleInput = document.getElementById('chapterTitleInput');
  if (titleInput) titleInput.hidden = true;
  if (titleButton) titleButton.hidden = false;
  closeChapterEditRecoveryPanel();
  if (chapter && typeof writeChapterEditDraftToLocalFile === 'function') {
    await writeChapterEditDraftToLocalFile(chapterKey, editorHTMLToText(chapter.content || ''));
  } else {
    await writeChapterEditDraftsToProject();
  }
  saveToStorage(false);
  loadEditor();
  renderChapters();
  if (typeof renderActiveWorkspaceSidePanel === 'function') renderActiveWorkspaceSidePanel();
  else {
    renderTags();
    renderNotes();
  }
  syncActiveEditorEditState();
  updateChapterStatus();
  setSaveStatusDot('saved', text().chapterEditRecoveryDiscarded);
  document.getElementById('editor')?.focus({ preventScroll: true });
}

function canEditActiveDocument() {
  return !isProjectDataLoading && activeEditorDocument()?._contentLoadState !== 'quarantined' &&
    (isDraftActive() || isChapterEditUnlocked);
}

function syncActiveEditorDocumentFromEditor() {
  if (
    !isDraftActive() &&
    isChapterEditUnlocked &&
    !isChapterEditDraftActive() &&
    typeof materializeChapterEditDraftForChange === 'function' &&
    hasChapterEditContentChangedFromSaved(getCleanEditorHTML(), curChap)
  ) {
    materializeChapterEditDraftForChange();
  }
  const documentItem = activeEditorDocument();
  const editor = document.getElementById('editor');
  if (editor && documentItem) documentItem.content = getCleanEditorHTML();
}
