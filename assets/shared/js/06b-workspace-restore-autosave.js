async function restoreProjectFromWorkspaceFolder() {
  const folderName = localStorage.getItem(PROJECT_FOLDER_KEY);
  const typeFolderName = localStorage.getItem(PROJECT_TYPE_FOLDER_KEY) || '';
  if (!workspaceDirectoryHandle || !folderName) return false;

  try {
    const handle = await workspaceProjectDirectoryHandle(folderName, typeFolderName);
    return loadLocalProject(handle, true, { typeFolderName });
  } catch (error) {
    if (error.name !== 'NotFoundError') {
      console.warn('Saved story folder restore from workspace failed:', error);
    }
  }

  if (typeFolderName) {
    try {
      const legacyHandle = await workspaceProjectDirectoryHandle(folderName, '');
      return loadLocalProject(legacyHandle, true, { typeFolderName: '' });
    } catch (error) {
      if (error.name !== 'NotFoundError') {
        console.warn('Saved legacy story folder restore failed:', error);
      }
    }
  }

  try {
    const resolvedStory = await resolveWorkspaceStoryHandle(folderName);
    const handle = resolvedStory?.handle || resolvedStory;
    return loadLocalProject(handle, true, { typeFolderName: resolvedStory?.typeFolderName || '' });
  } catch (error) {
    if (error.name !== 'NotFoundError') {
      console.warn('Saved story folder scan restore failed:', error);
    }
  }

  return false;
}

async function restoreLocalProject() {
  if (!supportsLocalProjectFolders()) return false;

  const workspaceHandle = await readWorkspaceHandle();
  if (workspaceHandle && await verifyProjectPermission(workspaceHandle)) {
    workspaceDirectoryHandle = workspaceHandle;
    localStorage.setItem(WORKSPACE_FOLDER_KEY, workspaceHandle.name || '');
  }

  const handle = await readProjectHandle();
  if (!handle) return restoreProjectFromWorkspaceFolder();

  projectDirectoryHandle = handle;
  localStorage.setItem(PROJECT_FOLDER_KEY, handle.name || '');
  activeProjectTypeFolderName = localStorage.getItem(PROJECT_TYPE_FOLDER_KEY) || '';

  if (!(await verifyProjectPermission(handle))) {
    projectDirectoryHandle = null;
    return restoreProjectFromWorkspaceFolder();
  }

  const loaded = await loadLocalProject(handle, false, { typeFolderName: activeProjectTypeFolderName });
  if (!loaded) {
    await deleteStoredDirectoryHandle(PROJECT_HANDLE_KEY);
    return restoreProjectFromWorkspaceFolder();
  }
  return true;
}

function clearActiveStoryState() {
  isProjectDataLoading = false;
  projectDirectoryHandle = null;
  setActiveProjectTypeFolderName('');
  projectManifest = null;
  chapters = [];
  chapterDrafts = [];
  chapterTrashDrafts = [];
  chapterEditDrafts = {};
  namingData = normalizeNamingData();
  storyFacts = [];
  curChap = 0;
  curPart = 0;
  curDraft = -1;
  curTrashDraft = -1;
  expandedPartIndex = 0;
  activeEditorMode = 'chapter';
  trashReturnEditorState = null;
  activeChapterEditKey = null;
  isChapterEditUnlocked = false;
  selectedTrashDraftIndexes.clear();
  lastSelectedTrashDraftIndex = null;
  isDraftTrashMode = false;
  if (window.lmAdvancedWordEditing && typeof window.lmAdvancedWordEditing.loadDictionaryPayload === 'function') {
    window.lmAdvancedWordEditing.loadDictionaryPayload(null, { projectHandle: null });
  }
  lastSavedChapterHTML = '';
  localStorage.removeItem(PROJECT_MANIFEST_KEY);
  localStorage.removeItem('lm_chapters');
  localStorage.removeItem(DRAFTS_STORAGE_KEY);
  localStorage.removeItem(TRASH_DRAFTS_STORAGE_KEY);
  localStorage.removeItem(CHAPTER_EDIT_DRAFTS_STORAGE_KEY);
  localStorage.removeItem(NAMING_STORAGE_KEY);
  localStorage.removeItem(FACTS_STORAGE_KEY);
  localStorage.removeItem(PROJECT_FOLDER_KEY);
  localStorage.removeItem(PROJECT_TYPE_FOLDER_KEY);
}

async function loadWorkspaceFolder(handle) {
  workspaceDirectoryHandle = handle;
  await saveWorkspaceHandle(handle);
  await deleteStoredDirectoryHandle(PROJECT_HANDLE_KEY);
  localStorage.setItem(PROJECT_MODE_KEY, 'workspace');
  localStorage.setItem(WORKSPACE_FOLDER_KEY, handle.name || '');
  clearActiveStoryState();
}

function chaptersForStorage() {
  return chapters.map(chapter => ({
    id: chapter.id,
    title: chapter.title,
    content: chapter.content,
    contentHTML: chapter.content || '',
    richContentHTML: editorDocumentRichContentForStorage(chapter),
    notes: chapter.notes || [],
    contentPath: chapter.contentPath || '',
    partIndex: chapter.partIndex || 0,
    chapterNo: chapter.chapterNo || 1,
    createdAt: chapter.createdAt || new Date().toISOString(),
    alignment: normalizeEditorAlignment(chapter.alignment),
    lineHeight: normalizeOptionalEditorLineHeight(chapter.lineHeight),
    paragraphGap: normalizeOptionalEditorParagraphGap(chapter.paragraphGap),
    paragraphMargin: normalizeOptionalEditorParagraphMargin(chapter.paragraphMargin),
    fontFamily: normalizeEditorFontFamily(chapter.fontFamily),
    fontSize: normalizeEditorFontSize(chapter.fontSize),
    editorSettings: chapter.editorSettings
      ? normalizeEditorSettings(chapter.editorSettings)
      : mergeProjectAutoScrollSettings(null),
    _wordCount: Number.isFinite(chapter._wordCount) ? chapter._wordCount : null,
    _wordCountVerifiedSignature: typeof chapter._wordCountVerifiedSignature === 'string'
      ? chapter._wordCountVerifiedSignature
      : ''
  }));
}

function draftsForStorage(includeContent = true) {
  return chapterDrafts.map(draft => ({
    id: draft.id,
    title: draft.title,
    content: includeContent ? draft.content : '',
    contentHTML: includeContent ? draft.content || '' : '',
    richContentHTML: editorDocumentRichContentForStorage(draft),
    notes: draft.notes || [],
    contentPath: draft.contentPath || '',
    draftNo: draft.draftNo || 1,
    createdAt: draft.createdAt || new Date().toISOString(),
    alignment: normalizeEditorAlignment(draft.alignment),
    lineHeight: normalizeOptionalEditorLineHeight(draft.lineHeight),
    paragraphGap: normalizeOptionalEditorParagraphGap(draft.paragraphGap),
    paragraphMargin: normalizeOptionalEditorParagraphMargin(draft.paragraphMargin),
    fontFamily: normalizeEditorFontFamily(draft.fontFamily),
    fontSize: normalizeEditorFontSize(draft.fontSize),
    editorSettings: draft.editorSettings
      ? normalizeEditorSettings(draft.editorSettings)
      : mergeProjectAutoScrollSettings(null),
    _wordCount: Number.isFinite(draft._wordCount) ? draft._wordCount : null,
    _wordCountVerifiedSignature: typeof draft._wordCountVerifiedSignature === 'string'
      ? draft._wordCountVerifiedSignature
      : ''
  }));
}

function trashDraftsForStorage(includeContent = true) {
  return normalizeTrashDrafts(chapterTrashDrafts).map(draft => ({
    id: draft.id,
    title: draft.title,
    content: includeContent ? draft.content : '',
    contentHTML: includeContent ? draft.content || '' : '',
    richContentHTML: editorDocumentRichContentForStorage(draft),
    notes: draft.notes || [],
    contentPath: draft.contentPath || '',
    draftNo: draft.draftNo || 1,
    originalDraftNo: draft.originalDraftNo || draft.draftNo || 1,
    originalContentPath: draft.originalContentPath || '',
    deletedAt: draft.deletedAt || new Date().toISOString(),
    createdAt: draft.createdAt || new Date().toISOString(),
    alignment: normalizeEditorAlignment(draft.alignment),
    lineHeight: normalizeOptionalEditorLineHeight(draft.lineHeight),
    paragraphGap: normalizeOptionalEditorParagraphGap(draft.paragraphGap),
    paragraphMargin: normalizeOptionalEditorParagraphMargin(draft.paragraphMargin),
    fontFamily: normalizeEditorFontFamily(draft.fontFamily),
    fontSize: normalizeEditorFontSize(draft.fontSize),
    editorSettings: draft.editorSettings
      ? normalizeEditorSettings(draft.editorSettings)
      : mergeProjectAutoScrollSettings(null),
    _wordCount: Number.isFinite(draft._wordCount) ? draft._wordCount : null
  }));
}

function chapterEditDraftsForStorage(includeContent = true) {
  return Object.values(normalizeChapterEditDrafts(chapterEditDrafts)).map(draft => ({
    id: draft.id,
    chapterKey: draft.chapterKey,
    chapterIndex: draft.chapterIndex,
    title: draft.title,
    content: includeContent ? draft.content : '',
    contentHTML: includeContent ? draft.content || '' : '',
    richContentHTML: editorDocumentRichContentForStorage(draft),
    contentPath: draft.contentPath || '',
    draftNo: draft.draftNo || 1,
    createdAt: draft.createdAt || new Date().toISOString(),
    updatedAt: draft.updatedAt || draft.createdAt || new Date().toISOString(),
    alignment: normalizeEditorAlignment(draft.alignment),
    lineHeight: normalizeOptionalEditorLineHeight(draft.lineHeight),
    paragraphGap: normalizeOptionalEditorParagraphGap(draft.paragraphGap),
    paragraphMargin: normalizeOptionalEditorParagraphMargin(draft.paragraphMargin),
    fontFamily: normalizeEditorFontFamily(draft.fontFamily),
    fontSize: normalizeEditorFontSize(draft.fontSize),
    editorSettings: draft.editorSettings
      ? normalizeEditorSettings(draft.editorSettings)
      : mergeProjectAutoScrollSettings(null),
    lastAutosavedHTML: draft.lastAutosavedHTML || draft.content || '',
    lastAutosavedText: draft.lastAutosavedText || ''
  }));
}

function persistProjectManifestSnapshot() {
  if (!hasActiveStory()) return null;
  const manifest = chaptersToManifest();
  manifest.createdAt = manifest.createdAt || projectManifest?.createdAt || new Date().toISOString();
  manifest.updatedAt = new Date().toISOString();
  projectManifest = manifest;
  cacheProjectManifest(manifest);
  return manifest;
}

function storyInfoFields() {
  return [
    document.getElementById('storyTitleInp'),
    document.getElementById('storyAuthorInp'),
    document.getElementById('storyTypeInp'),
    document.getElementById('storyLanguageInp'),
    document.getElementById('storySynopsisInp')
  ].filter(Boolean);
}

function storyInfoFormValues() {
  return {
    title: document.getElementById('storyTitleInp')?.value.trim() || '',
    author: document.getElementById('storyAuthorInp')?.value.trim() || '',
    type: document.getElementById('storyTypeInp')?.value || 'novel',
    language: document.getElementById('storyLanguageInp')?.value === 'hi' ? 'hi' : 'en',
    synopsis: document.getElementById('storySynopsisInp')?.value.trim() || ''
  };
}

function setStoryInfoOriginalValues(values = storyInfoFormValues()) {
  const card = document.querySelector('#story-info-modal .story-info-card');
  if (!card) return;
  card.dataset.originalTitle = String(values.title || '').trim();
  card.dataset.originalAuthor = String(values.author || '').trim();
  card.dataset.originalType = values.type || 'novel';
  card.dataset.originalLanguage = values.language || 'en';
  card.dataset.originalSynopsis = String(values.synopsis || '').trim();
}

function storyInfoHasChanges() {
  const card = document.querySelector('#story-info-modal .story-info-card');
  if (!card) return false;
  const values = storyInfoFormValues();
  return values.title !== (card.dataset.originalTitle || '') ||
    values.author !== (card.dataset.originalAuthor || '') ||
    values.type !== (card.dataset.originalType || 'novel') ||
    values.language !== (card.dataset.originalLanguage || 'en') ||
    values.synopsis !== (card.dataset.originalSynopsis || '');
}

function storyInfoOriginalValues() {
  const card = document.querySelector('#story-info-modal .story-info-card');
  return {
    title: card?.dataset.originalTitle || '',
    author: card?.dataset.originalAuthor || '',
    type: card?.dataset.originalType || 'novel',
    language: card?.dataset.originalLanguage || 'en',
    synopsis: card?.dataset.originalSynopsis || ''
  };
}

function applyStoryInfoFormValues(values = storyInfoOriginalValues()) {
  const titleInput = document.getElementById('storyTitleInp');
  const authorInput = document.getElementById('storyAuthorInp');
  const typeInput = document.getElementById('storyTypeInp');
  const languageInput = document.getElementById('storyLanguageInp');
  const synopsisInput = document.getElementById('storySynopsisInp');
  if (titleInput) titleInput.value = values.title || '';
  if (authorInput) authorInput.value = values.author || '';
  if (typeInput) typeInput.value = values.type === 'story' ? 'story' : 'novel';
  if (languageInput) languageInput.value = values.language === 'hi' ? 'hi' : 'en';
  if (synopsisInput) synopsisInput.value = values.synopsis || '';
  queueCustomSelectSync();
}

function syncStoryInfoDisplayValues(values = storyInfoFormValues()) {
  setText('storyTitleValue', values.title || text().untitledStory || 'Untitled Story');
  setText('storyAuthorValue', values.author || text().unknownAuthor);
  setText('storyTypeValue', storyTypeLabel(values.type));
  setText('storyLanguageValue', storyLanguageLabel(values.language));
  const synopsisValue = document.getElementById('storySynopsisValue');
  if (synopsisValue) {
    const synopsis = values.synopsis || '';
    synopsisValue.textContent = synopsis || text().storySynopsisEmpty;
    synopsisValue.classList.toggle('is-empty', !synopsis);
  }
}

function storyInfoTimestampLabel(manifest) {
  if (!manifest) return '';
  const updatedAt = manifest.updatedAt || '';
  const createdAt = manifest.createdAt || '';
  const value = updatedAt || createdAt;
  if (!value) return '';
  const prefix = updatedAt && updatedAt !== createdAt ? text().storyInfoLastSaved : text().storyInfoCreated;
  return `${prefix}: ${factTimeLabel(value)}`;
}

function updateStoryInfoTimestamp(manifest = normalizeProjectManifest(projectManifest || createProjectManifest())) {
  const timeLabel = document.getElementById('storyInfoTime');
  if (!timeLabel) return;
  const label = storyInfoPanelMode === 'create' ? '' : storyInfoTimestampLabel(manifest);
  timeLabel.textContent = label;
  timeLabel.title = label;
  timeLabel.hidden = !label;
}

function setStoryInfoEditMode(editing, options = {}) {
  const card = document.querySelector('#story-info-modal .story-info-card');
  const saveButton = document.getElementById('storyInfoSaveBtn');
  const editButton = document.getElementById('storyInfoEditBtn');
  const isCreateMode = storyInfoPanelMode === 'create';
  isStoryInfoEditing = isCreateMode || Boolean(editing);
  const title = isStoryInfoEditing ? text().storyInfoStopEdit : text().storyInfoEdit;

  storyInfoFields().forEach(field => {
    const canEdit = isStoryInfoEditing;
    const isSelect = field.tagName === 'SELECT';
    field.disabled = isSelect && !canEdit;
    field.readOnly = !isSelect && !canEdit;
    field.tabIndex = canEdit ? 0 : -1;
  });

  card?.classList.toggle('is-editing', isStoryInfoEditing);
  card?.classList.toggle('is-readonly', !isStoryInfoEditing);
  if (editButton) {
    editButton.hidden = isCreateMode;
    editButton.classList.toggle('is-active', isStoryInfoEditing);
    editButton.title = title;
    editButton.setAttribute('aria-label', title);
  }
  if (saveButton) saveButton.hidden = !isCreateMode;
  if (options.resetDirty) setStoryInfoOriginalValues();
  syncStoryInfoDisplayValues(isStoryInfoEditing ? storyInfoFormValues() : storyInfoOriginalValues());
  markStoryInfoEdited();
}

function beginStoryInfoEdit() {
  if (storyInfoPanelMode === 'create') return;
  if (isStoryInfoEditing) {
    applyStoryInfoFormValues(storyInfoOriginalValues());
    setStoryInfoEditMode(false);
    return;
  }
  setStoryInfoEditMode(true);
  requestAnimationFrame(() => {
    const titleInput = document.getElementById('storyTitleInp');
    titleInput?.focus();
    titleInput?.select?.();
  });
}

function markStoryInfoEdited() {
  const saveButton = document.getElementById('storyInfoSaveBtn');
  if (!saveButton) return;
  if (storyInfoPanelMode === 'create') {
    saveButton.hidden = false;
    return;
  }
  if (isStoryInfoEditing) syncStoryInfoDisplayValues(storyInfoFormValues());
  saveButton.hidden = !isStoryInfoEditing || !storyInfoHasChanges();
}

function fillStoryInfoForm() {
  if (storyInfoPanelMode === 'create') {
    document.getElementById('storyTitleInp').value = '';
    document.getElementById('storyTypeInp').value = 'novel';
    document.getElementById('storyAuthorInp').value = '';
    document.getElementById('storyLanguageInp').value = 'en';
    document.getElementById('storySynopsisInp').value = '';
    setStoryInfoOriginalValues({
      title: '',
      author: '',
      type: 'novel',
      language: 'en',
      synopsis: ''
    });
    updateStoryInfoTimestamp(null);
    setStoryInfoEditMode(true);
    queueCustomSelectSync();
    return;
  }

  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  document.getElementById('storyTitleInp').value = manifest.title || '';
  document.getElementById('storyTypeInp').value = manifest.type === 'story' ? 'story' : 'novel';
  document.getElementById('storyAuthorInp').value = manifest.author || '';
  document.getElementById('storyLanguageInp').value = ['en', 'hi'].includes(manifest.language) ? manifest.language : 'en';
  document.getElementById('storySynopsisInp').value = manifest.synopsis || '';
  setStoryInfoOriginalValues({
    title: manifest.title || '',
    author: manifest.author || '',
    type: manifest.type === 'story' ? 'story' : 'novel',
    language: ['en', 'hi'].includes(manifest.language) ? manifest.language : 'en',
    synopsis: manifest.synopsis || ''
  });
  updateStoryInfoTimestamp(manifest);
  setStoryInfoEditMode(false);
  queueCustomSelectSync();
}

function syncStoryInfoPanelModeText() {
  const copy = text();
  const libraryCopy = storyLibraryContextText();
  setTitle('storyInfoEditBtn', copy.storyInfoEdit);
  document.getElementById('storyInfoEditBtn')?.setAttribute('aria-label', copy.storyInfoEdit);
  if (storyInfoPanelMode === 'create') {
    setText('storyInfoTitle', libraryCopy.newStory);
    setText('storyInfoSaveBtn', copy.createStory);
    return;
  }

  setText('storyInfoTitle', copy.storyInfoTitle);
  setText('storyInfoSaveBtn', copy.storyInfoSave);
}

function storyInfoPanelPositionConfig() {
  if (storyInfoPanelMode === 'create') {
    if (isHomePage()) {
      return lmFloatingPanelPositionConfig?.('storyInfoCreateHome', {
        gap: 20,
        topOffset: -8,
        leftOffset: 0,
        rightOffset: 0,
        viewportPadding: 12,
        panelWidth: 430
      }) || {
        gap: 20,
        topOffset: -8,
        leftOffset: 0,
        rightOffset: 0,
        viewportPadding: 12,
        panelWidth: 430
      };
    }

    return lmFloatingPanelPositionConfig?.('storyInfoCreateIndex', {
      gap: 20,
      topOffset: 55,
      leftOffset: 140,
      rightOffset: 0,
      viewportPadding: 12,
      panelWidth: 430
    }) || {
      gap: 20,
      topOffset: 55,
      leftOffset: 140,
      rightOffset: 0,
      viewportPadding: 12,
      panelWidth: 430
    };
  }

  return lmFloatingPanelPositionConfig?.('storyInfoDetails', {
    gap: 25,
    topOffset: -8,
    leftOffset: 0,
    rightOffset: 0,
    viewportPadding: 12,
    panelWidth: 430
  }) || {
    gap: 25,
    topOffset: -8,
    leftOffset: 0,
    rightOffset: 0,
    viewportPadding: 12,
    panelWidth: 430
  };
}

function positionStoryInfoPanel() {
  const panel = document.getElementById('story-info-modal');
  const card = panel?.querySelector('.story-info-card');
  const anchor = document.getElementById(storyInfoAnchorId) || document.getElementById('storySummaryMenuBtn');
  if (!panel || !card || !anchor) return;

  const anchorRect = anchor.getBoundingClientRect();
  const positionConfig = storyInfoPanelPositionConfig();
  const gap = lmPanelNumber?.(positionConfig.gap, 25) ?? (positionConfig.gap || 25);
  const viewportPadding = lmPanelNumber?.(positionConfig.viewportPadding, 12) ?? 12;
  const leftOffset = lmPanelNumber?.(positionConfig.leftOffset, 0) ?? 0;
  const rightOffset = lmPanelNumber?.(positionConfig.rightOffset, 0) ?? 0;
  const topOffset = lmPanelNumber?.(positionConfig.topOffset, -8) ?? (positionConfig.topOffset || -8);
  const panelWidth = Math.min(lmPanelNumber?.(positionConfig.panelWidth, 430) ?? 430, window.innerWidth - viewportPadding * 2);
  panel.style.width = `${panelWidth}px`;

  const cardHeight = Math.min(card.offsetHeight || 520, window.innerHeight - viewportPadding * 2);
  let left = anchorRect.right + gap + leftOffset - rightOffset;
  if (left + panelWidth > window.innerWidth - viewportPadding) {
    left = Math.max(viewportPadding, anchorRect.left - panelWidth - gap + leftOffset - rightOffset);
  }

  let top = anchorRect.top + topOffset;
  top = Math.max(viewportPadding, Math.min(top, window.innerHeight - cardHeight - viewportPadding));
  panel.style.inset = `${top}px auto auto ${left}px`;
}

function openStoryInfoModal(options = {}) {
  storyInfoPanelMode = options.mode || 'edit';
  storyInfoAnchorId = options.anchorId || (storyInfoPanelMode === 'create' ? 'storyLibraryBtn' : 'storySummaryMenuBtn');
  closeStorySummaryMenu();
  fillStoryInfoForm();
  syncStoryInfoPanelModeText();
  const panel = document.getElementById('story-info-modal');
  if (!panel.classList.contains('is-visible') && typeof window.prepareFloatingPanelFocusReturn === 'function') {
    window.prepareFloatingPanelFocusReturn(panel);
  }
  panel.classList.add('is-visible');
  positionStoryInfoPanel();
  if (options.focusTitle) {
    if (storyInfoPanelMode !== 'create') setStoryInfoEditMode(true);
    setTimeout(() => {
      document.getElementById('storyTitleInp')?.focus();
      document.getElementById('storyTitleInp')?.select();
    }, 0);
  }
}

function closeStoryInfoModal() {
  document.getElementById('story-info-modal').classList.remove('is-visible');
  storyInfoPanelMode = 'edit';
  storyInfoAnchorId = 'storySummaryMenuBtn';
  isStoryInfoEditing = false;
}

function positionStorySummaryMenuPanel() {
  const panel = document.getElementById('storySummaryMenuPanel');
  const button = document.getElementById('storySummaryMenuBtn');
  if (!panel || !button) return;

  const buttonRect = button.getBoundingClientRect();
  const defaultTopOffset = -(buttonRect.height) / 3;
  const positionConfig = lmFloatingPanelPositionConfig?.('storySummaryMenuPanel', {
    gap: 16,
    topOffset: defaultTopOffset,
    leftOffset: 0,
    rightOffset: 0,
    panelWidth: 210,
    viewportPadding: 12
  }) || {};
  const viewportPadding = lmPanelNumber?.(positionConfig.viewportPadding, 12) ?? 12;
  const gap = lmPanelNumber?.(positionConfig.gap, 16) ?? 16;
  const leftOffset = lmPanelNumber?.(positionConfig.leftOffset, 0) ?? 0;
  const rightOffset = lmPanelNumber?.(positionConfig.rightOffset, 0) ?? 0;
  const topOffset = lmPanelNumber?.(positionConfig.topOffset, defaultTopOffset) ?? defaultTopOffset;
  const panelWidth = Math.min(lmPanelNumber?.(positionConfig.panelWidth, 210) ?? 210, window.innerWidth - viewportPadding * 2);
  panel.style.width = `${panelWidth}px`;

  let left = buttonRect.right + gap + leftOffset - rightOffset;
  if (left + panelWidth > window.innerWidth - viewportPadding) {
    left = Math.max(viewportPadding, buttonRect.left - panelWidth - gap + leftOffset - rightOffset);
  }

  const panelHeight = panel.offsetHeight || 50;
  let top = buttonRect.top + topOffset;
  top = Math.max(viewportPadding, Math.min(top, window.innerHeight - panelHeight - viewportPadding));
  panel.style.inset = `${top}px auto auto ${left}px`;
}

function setStorySummaryMenu(open) {
  const panel = document.getElementById('storySummaryMenuPanel');
  const button = document.getElementById('storySummaryMenuBtn');
  if (!panel || !button) return;
  if (open && panel.hidden && typeof window.prepareFloatingPanelFocusReturn === 'function') {
    window.prepareFloatingPanelFocusReturn(panel);
  }
  panel.hidden = !open;
  if (!open) {
    const confirmPanel = document.getElementById('storySummaryDeleteConfirm');
    if (confirmPanel) confirmPanel.hidden = true;
  }
  if (open) positionStorySummaryMenuPanel();
  button.classList.toggle('is-open', open);
  button.setAttribute('aria-expanded', String(open));
}

function toggleStorySummaryMenu(event) {
  event?.preventDefault();
  event?.stopPropagation();
  const panel = document.getElementById('storySummaryMenuPanel');
  setStorySummaryMenu(Boolean(panel?.hidden));
}

function closeStorySummaryMenu() {
  setStorySummaryMenu(false);
}

function openStoryDetailsFromSummaryMenu() {
  closeStoryDeleteConfirm();
  openStoryInfoModal();
}

function setStorySummarySaveIndicator(state = 'idle') {
  const summary = document.getElementById('story-summary');
  if (!summary) return;

  clearTimeout(storySummarySaveIndicatorTimer);
  summary.classList.remove('is-story-saving', 'is-story-saved');
  if (state === 'idle') return;

  summary.classList.add(state === 'saved' ? 'is-story-saved' : 'is-story-saving');
  if (state === 'saved') {
    storySummarySaveIndicatorTimer = setTimeout(() => {
      summary.classList.remove('is-story-saved');
    }, 1600);
  }
}

function openStoryDeleteConfirm(event = null) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const confirmPanel = document.getElementById('storySummaryDeleteConfirm');
  if (!confirmPanel) return;
  confirmPanel.hidden = false;
  positionStorySummaryMenuPanel();
}

function closeStoryDeleteConfirm(event = null) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const confirmPanel = document.getElementById('storySummaryDeleteConfirm');
  if (confirmPanel) confirmPanel.hidden = true;
  if (!document.getElementById('storySummaryMenuPanel')?.hidden) positionStorySummaryMenuPanel();
}

async function deleteActiveStory() {
  if (!hasActiveStory()) return;
  const folderName = projectDirectoryHandle?.name || localStorage.getItem(PROJECT_FOLDER_KEY) || '';
  const typeFolderName = currentProjectTypeFolderName();
  if (!workspaceDirectoryHandle || !folderName) {
    showMiniReminder(text().chooseWorkspaceFirst);
    return;
  }

  showAppLoader(text().storyDeleting);
  try {
    closeStoryDeleteConfirm();
    closeStorySummaryMenu();
    closeStoryInfoModal();
    try {
      await removeWorkspaceProjectDirectory(folderName, typeFolderName);
    } catch (deleteError) {
      if (!typeFolderName || deleteError.name !== 'NotFoundError') throw deleteError;
      await removeWorkspaceProjectDirectory(folderName, '');
    }
    deleteActiveEditorStateForStory(folderName, typeFolderName);
    await deleteStoredDirectoryHandle(PROJECT_HANDLE_KEY);
    clearActiveStoryState();
    hideProjectGate();
    if (isHomePage()) {
      resetHomeStoryList();
      await renderHomeExistingStoriesList();
      setHomeMenuStatus(text().storyDeleted);
      return;
    }
    navigateToHomePage();
  } catch (error) {
    console.warn('Story delete failed:', error);
    showMiniReminder(error?.message || text().storyCreateFailed);
  } finally {
    hideAppLoader();
  }
}

function updateStorySummary(manifestOverride = null) {
  if (!hasActiveStory()) {
    setText('storytype', '');
    setText('storyLanguageBadge', '');
    setText('storySummaryTitle', '');
    setText('Writername', '');
    return;
  }

  const manifest = normalizeProjectManifest(manifestOverride || projectManifest || createProjectManifest());
  const languageText = storyLanguageLabel(manifest.language);

  setText('storytype', storyTypeLabel(manifest.type));
  setText('storyLanguageBadge', languageText);
  setText('storySummaryTitle', manifest.title || 'Untitled Story');
  setText('Writername', (manifest.author || text().unknownAuthor));
  document.getElementById('storyLanguageBadge')?.setAttribute('title', languageText);
}

function syncSavedStoryInfoSnapshot(values, manifest) {
  const savedManifest = normalizeProjectManifest(manifest || projectManifest || createProjectManifest());
  const savedValues = {
    title: values.title || savedManifest.title || '',
    author: values.author || savedManifest.author || '',
    type: savedManifest.type || values.type || 'novel',
    language: savedManifest.language || values.language || 'en',
    synopsis: values.synopsis || savedManifest.synopsis || ''
  };

  projectManifest = savedManifest;
  cacheProjectManifest(savedManifest);
  updateStorySummary(savedManifest);
  setText('storyTitleValue', savedValues.title || text().untitledStory || 'Untitled Story');
  setText('storyAuthorValue', savedValues.author || text().unknownAuthor);
  setText('storyTypeValue', storyTypeLabel(savedValues.type));
  setText('storyLanguageValue', storyLanguageLabel(savedValues.language));
  try {
    setStoryInfoOriginalValues(savedValues);
    applyStoryInfoFormValues(savedValues);
    syncStoryInfoDisplayValues(savedValues);
    updateStoryInfoTimestamp(savedManifest);
  } catch (error) {
    console.warn('Story info display sync failed:', error);
  }
}

async function saveStoryInfo() {
  if (storyInfoPanelMode === 'create') {
    showAppLoader(text().loading);
    try {
      await createStoryFromInfoForm();
    } catch (error) {
      console.warn('Story create failed:', error);
      const errorMessage = error?.message || text().storyCreateFailed;
      if (errorMessage === text().duplicateStoryTitle) showDuplicateReminder(errorMessage);
      setHomeMenuStatus(errorMessage);
      setDefaultSaveStatus();
    } finally {
      hideAppLoader();
    }
    return;
  }

  if (!hasActiveStory()) return;
  const saveButton = document.getElementById('storyInfoSaveBtn');
  let manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const savedValues = storyInfoFormValues();
  const nextTitle = savedValues.title || manifest.title;
  const nextType = savedValues.type || manifest.type || 'novel';
  const currentTypeFolderName = currentProjectTypeFolderName();
  const nextTypeFolderName = projectTypeFolderName(nextType);
  const shouldRenameStoryFolder = Boolean(
    workspaceDirectoryHandle &&
    projectDirectoryHandle &&
    (
      uniqueNameKey(sanitizeStoryFolderName(nextTitle)) !== uniqueNameKey(projectDirectoryHandle.name || '') ||
      currentTypeFolderName !== nextTypeFolderName
    )
  );
  if (
    (uniqueNameKey(nextTitle) !== uniqueNameKey(manifest.title) || currentTypeFolderName !== nextTypeFolderName) &&
    await workspaceStoryTitleExists(nextTitle, projectDirectoryHandle?.name || '', nextType, currentTypeFolderName)
  ) {
    showDuplicateReminder(text().duplicateStoryTitle);
    setHomeMenuStatus(text().duplicateStoryTitle);
    return;
  }

  manifest.title = nextTitle;
  manifest.type = nextType;
  manifest.author = savedValues.author;
  manifest.language = savedValues.language === 'hi' ? 'hi' : 'en';
  manifest.synopsis = savedValues.synopsis;
  manifest.createdAt = manifest.createdAt || new Date().toISOString();
  manifest.updatedAt = new Date().toISOString();
  const structureManifest = chaptersToManifest();
  manifest.chapters = structureManifest.chapters;
  manifest.parts = structureManifest.parts;
  projectManifest = manifest;
  syncSavedStoryInfoSnapshot(savedValues, manifest);

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = text().saving;
  }
  setStorySummarySaveIndicator('saving');
  try {
    if (shouldRenameStoryFolder) {
      await renameActiveStoryFolderIfNeeded(nextTitle, nextType);
    }
    if (projectDirectoryHandle) {
      await writeProjectManifest(manifest);
    } else {
      manifest.updatedAt = new Date().toISOString();
      cacheProjectManifest(manifest);
    }
    syncSavedStoryInfoSnapshot(savedValues, projectManifest || manifest);
    closeStoryInfoModal();
    setStorySummarySaveIndicator('saved');
  } catch (error) {
    console.warn('Story info save failed:', error);
    setStorySummarySaveIndicator('idle');
    if (error?.message === text().duplicateStoryTitle) {
      showDuplicateReminder(text().duplicateStoryTitle);
      setHomeMenuStatus(text().duplicateStoryTitle);
    } else {
      showMiniReminder(error?.message || text().storyCreateFailed);
    }
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = text().storyInfoSave;
    }
  }
}

async function addPart() {
  if (!hasActiveStory()) return;
  showAppLoader(text().creatingPart);
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const targetIndex = manifest.parts.length;
  manifest.parts.push(createDefaultPart(targetIndex));
  if (targetIndex === 0) {
    chapters.forEach((chapter, index) => {
      chapter.partIndex = 0;
      chapter.chapterNo = index + 1;
    });
  } else {
    chapters.forEach(chapter => {
      const hasExistingPart = Number.isInteger(chapter.partIndex) &&
        chapter.partIndex >= 0 &&
        chapter.partIndex < targetIndex;
      if (!hasExistingPart) chapter.partIndex = targetIndex;
    });
  }

  projectManifest = manifest;
  curPart = targetIndex;
  expandedPartIndex = targetIndex;
  isRawChapterSectionExpanded = false;
  isPartsListCollapsedByRaw = false;
  isPartsListForceExpanded = true;
  if (chapterListOverflowMode === 'collapsed') chapterListOverflowMode = 'expanded';
  if (typeof reindexProjectStructure === 'function') reindexProjectStructure(manifest);
  persistProjectManifestSnapshot();
  saveToStorage(false);
  renderChapters();
  updateStorySummary();

  if (!projectDirectoryHandle) {
    setSaveStatusDot('saved', text().partInfoSaved);
    hideAppLoader();
    return;
  }

  requestAnimationFrame(() => {
    writeProjectManifest()
      .then(() => setSaveStatusDot('saved', text().partInfoSaved))
      .catch(error => {
        console.warn('Part create failed:', error);
        setDefaultSaveStatus();
      })
      .finally(() => hideAppLoader());
  });
}

async function writeChapterToLocalFile(chapterIndex, textValue) {
  if (!projectDirectoryHandle || !chapters[chapterIndex]) return;

  const chapter = chapters[chapterIndex];
  if (!documentTextWriteIsSafe(chapter, textValue)) throw new Error(`Unsafe blank chapter write blocked: ${chapter.contentPath || chapterIndex}`);
  chapter.contentPath = chapter.contentPath || chapterFilePath(chapterIndex);
  const fileHandle = chapter.contentHandle || await getProjectFileHandle(chapter.contentPath, { create: true });

  chapter.contentHandle = fileHandle;
  await writeFileText(fileHandle, textValue);
  await writeProjectManifest();
}

async function writeCurrentChapterToLocalFile() {
  await writeChapterToLocalFile(curChap, getCleanEditorText());
  await window.LmInitialRendering?.syncActiveDocumentData?.();
}

async function writeDraftToLocalFile(draftIndex, textValue) {
  if (!projectDirectoryHandle || !chapterDrafts[draftIndex]) return;

  const draft = chapterDrafts[draftIndex];
  if (!documentTextWriteIsSafe(draft, textValue)) throw new Error(`Unsafe blank draft write blocked: ${draft.contentPath || draftIndex}`);
  draft.contentPath = draft.contentPath || draftFilePath(draftIndex);
  const fileHandle = draft.contentHandle || await getProjectFileHandle(draft.contentPath, { create: true });

  draft.contentHandle = fileHandle;
  await writeFileText(fileHandle, textValue);
  await writeDraftsDataToProject();
}

function documentTextWriteIsSafe(documentItem, textValue) {
  if (String(textValue || '').trim()) return true;
  if (documentItem?._contentLoadState === 'loaded' && documentItem?._contentPresented === true) return true;
  const knownWords = Number(documentItem?._wordCount ?? documentItem?.wordCount);
  return !(knownWords > 0 || String(documentItem?._wordCountVerifiedSignature || '').length > 0);
}

async function writeCurrentDraftToLocalFile() {
  await writeDraftToLocalFile(curDraft, getCleanEditorText());
  await window.LmInitialRendering?.syncActiveDocumentData?.();
}

async function writeChapterEditDraftToLocalFile(draftKey, textValue) {
  if (!projectDirectoryHandle || !draftKey || !chapterEditDrafts[draftKey]) return;

  const draft = normalizeChapterEditDraft(chapterEditDrafts[draftKey], draftKey);
  const index = Number.isInteger(draft.chapterIndex) && draft.chapterIndex >= 0 ? draft.chapterIndex : curChap;
  draft.contentPath = draft.contentPath || chapterEditDraftFilePath(index);
  const fileHandle = draft.contentHandle || await getProjectFileHandle(draft.contentPath, { create: true });

  draft.contentHandle = fileHandle;
  draft.content = draft.content || textToEditorHTML(textValue);
  draft.updatedAt = new Date().toISOString();
  const savedHTML = draft.content;
  const savedText = String(textValue || '').replace(/\r\n?/g, '\n').trimEnd();
  chapterEditDrafts[draftKey] = draft;
  await writeFileText(fileHandle, savedText);
  // Advance the persisted baseline only after the actual file write succeeds.
  draft.lastAutosavedHTML = savedHTML;
  draft.lastAutosavedText = savedText;
  await writeChapterEditDraftsToProject();
}

async function writeActiveChapterEditDraftToLocalFile() {
  const draft = activeChapterEditDraft();
  if (!draft) return;
  await writeChapterEditDraftToLocalFile(draft.chapterKey, getCleanEditorText());
  await window.LmInitialRendering?.syncActiveDocumentData?.();
}

async function readProjectTextFileIfExists(path) {
  if (!projectDirectoryHandle || !path) return null;

  try {
    const fileHandle = await getProjectFileHandle(path);
    return await readFileText(fileHandle);
  } catch (error) {
    if (error.name !== 'NotFoundError') {
      console.warn('Project text file compare read failed:', path, error);
    }
    return null;
  }
}

async function chapterEditDraftFileMatchesSavedChapter(index = curChap) {
  ensureChapters();
  const chapter = chapters[index];
  const draftKey = chapterEditDraftKey(index);
  const draft = chapterEditDrafts[draftKey]
    ? normalizeChapterEditDraft(chapterEditDrafts[draftKey], draftKey)
    : null;

  if (!chapter || !draft) return false;
  chapterEditDrafts[draftKey] = draft;

  const [draftFileText, chapterFileText] = await Promise.all([
    readProjectTextFileIfExists(draft.contentPath),
    readProjectTextFileIfExists(chapter.contentPath)
  ]);

  if (draftFileText === null || chapterFileText === null) return false;

  draft.content = draft.content || draft.contentHTML || textToEditorHTML(draftFileText);
  draft.lastAutosavedHTML = draft.lastAutosavedHTML || draft.content;
  draft.lastAutosavedText = normalizeChapterEditComparePlainTextFile(draftFileText);
  chapterEditDrafts[draftKey] = draft;

  const draftTitle = normalizeChapterEditCompareTitle(draft.title);
  const chapterTitle = normalizeChapterEditCompareTitle(chapterDisplayTitle(chapter, index));
  const textMatches = chapterEditPlainTextFilesMatch(draftFileText, chapterFileText);
  const formattingMatches = chapterEditFormattingMatchesSavedChapter(draft, chapter);

  return draftTitle === chapterTitle && textMatches && formattingMatches;
}

async function saveCurrentProject() {
  if (!hasActiveStory() || isProjectDataLoading) return;
  if (isTrashDraftActive()) return;
  await window.LmInitialRendering?.ensureFullNamingData?.();
  if (typeof flushEditorHTMLMemoryCommit === 'function') await flushEditorHTMLMemoryCommit();
  if (typeof flushEditorInputStatsUpdate === 'function') flushEditorInputStatsUpdate();
  if (typeof flushEditorHistorySnapshot === 'function') flushEditorHistorySnapshot('save');
  if (
    !isDraftActive() &&
    isChapterEditUnlocked &&
    !isChapterEditDraftActive() &&
    hasChapterEditContentChangedFromSaved(getCleanEditorHTML(), curChap)
  ) {
    materializeChapterEditDraftForChange();
  }

  if (isDraftActive()) {
    const namingChanged = scanActiveEditorForNamingUses(new Date().toISOString());
    saveToStorage();
    await writeCurrentDraftToLocalFile();
    await writeNamingDataToProject();
    if (activeSidePanel === 'naming' && namingChanged) renderTags();
    return;
  }

  if (isChapterEditDraftActive()) {
    const namingChanged = scanActiveEditorForNamingUses(new Date().toISOString());
    saveToStorage();
    await writeActiveChapterEditDraftToLocalFile();
    await writeNamingDataToProject();
    if (activeSidePanel === 'naming' && namingChanged) renderTags();
    return;
  }

  persistProjectManifestSnapshot();
  const chapterSavedAt = new Date().toISOString();
  scanCurrentChapterForNamingUses(curChap, getCleanEditorText(), chapterSavedAt);
  saveToStorage();
  await writeCurrentChapterToLocalFile();
  await writeNamingDataToProject();
  if (activeSidePanel === 'naming') renderTags();
}

function stopTimedAutoSave() {
  if (!autoSaveIntervalTimer) return;
  clearInterval(autoSaveIntervalTimer);
  autoSaveIntervalTimer = null;
}

function ensureTimedAutoSave() {
  if (autoSaveIntervalTimer || !isAutoSaveEnabled || !canEditActiveDocument()) return;
  autoSaveIntervalTimer = setInterval(() => {
    runAutoSave('interval');
  }, typeof lmEditorAdvancedNumber === 'function' ? lmEditorAdvancedNumber('autosaveIntervalDelay', 3000) : 3000);
}

function finishAutoSaveRun() {
  isAutoSaveRunning = false;
  if (!autoSaveRerunRequested) return;
  autoSaveRerunRequested = false;
  setTimeout(() => runAutoSave('queued'), 0);
}

async function runAutoSave(source = 'idle') {
  if (!isAutoSaveEnabled || !canEditActiveDocument()) return;
  if (isAutoSaveRunning) {
    // Do not drop an autosave request that arrives while a slower file write is
    // still running. The latest editor generation must get its own pass as soon
    // as the current write settles.
    autoSaveRerunRequested = true;
    return;
  }
  // Lock before the bridge/memory flush. A new input may continue its bridge
  // work, but any additional autosave request is queued instead of starting a
  // competing flush/save transaction.
  isAutoSaveRunning = true;

  // Restricted input rendering can still have paragraph patches or a newer
  // innerHTML buffer in flight. Capture the autosave baseline only after that
  // authoritative state reaches memory; otherwise a successful save is
  // incorrectly compared with a stale pre-flush snapshot and marked unsaved.
  if (typeof flushEditorHTMLMemoryCommit === 'function') {
    try {
      await flushEditorHTMLMemoryCommit();
    } catch (error) {
      console.warn(`Autosave (${source}) preflush failed:`, error);
      setSaveButtonSaved(false);
      setSaveStatusDot('dirty', text().unsaved);
      finishAutoSaveRun();
      return;
    }
  }
  const saveSnapshot = getCleanEditorHTML();
  const chapterEditDraft = activeChapterEditDraft();
  const autoSaveBaseline = chapterEditDraft ? chapterEditDraft.lastAutosavedHTML || '' : lastSavedChapterHTML;
  if (saveSnapshot === autoSaveBaseline) {
    // A preceding memory-buffer flush may have completed the same autosave
    // transaction before this runner reaches the disk-write branch. This is a
    // successful, clean state—not an indeterminate state—so synchronise the
    // visible save button as well as the timers/status line.
    if (typeof markActiveEditorInputPersisted === 'function') markActiveEditorInputPersisted();
    else setSaveButtonSaved(true);
    clearTimeout(autoSaveTimer);
    stopTimedAutoSave();
    setDefaultSaveStatus();
    finishAutoSaveRun();
    return;
  }

  setSaveButtonSaved(false);
  // The blinking dot begins only now: everything before this point was an
  // editor/innerHTML/memory transfer, while the next operation persists data.
  setSaveStatusDot('busy', text().saving);
  try {
    await saveCurrentProject();
    const currentSnapshot = getCleanEditorHTML();
    const currentChapterEditDraft = activeChapterEditDraft();
    if (currentSnapshot === saveSnapshot) {
      if (currentChapterEditDraft) {
        currentChapterEditDraft.lastAutosavedHTML = saveSnapshot;
        currentChapterEditDraft.lastAutosavedText = getCleanEditorText();
        setSaveButtonSaved(true);
      } else {
        rememberCurrentChapterSaved(saveSnapshot);
      }
      if (typeof markActiveEditorInputPersisted === 'function') markActiveEditorInputPersisted();
      else setSaveButtonSaved(true);
      clearTimeout(autoSaveTimer);
      stopTimedAutoSave();
      setSaveStatusDot('saved', text().saved);
    } else {
      if (currentChapterEditDraft) {
        currentChapterEditDraft.lastAutosavedHTML = saveSnapshot;
        currentChapterEditDraft.lastAutosavedText = editorHTMLToText(saveSnapshot);
      } else lastSavedChapterHTML = saveSnapshot;
      setSaveButtonSaved(false);
      showUnsavedSaveStatus(text().unsaved);
      ensureTimedAutoSave();
    }
  } catch (error) {
    console.warn(`Autosave (${source}) failed:`, error);
    setSaveButtonSaved(false);
    setSaveStatusDot('dirty', text().unsaved);
  } finally {
    finishAutoSaveRun();
  }
}

async function commitChapterEditDraftToChapter(snapshot = {}) {
  const targetChapterIndex = Number.isInteger(snapshot.chapterIndex) ? snapshot.chapterIndex : curChap;
  const editorHTML = typeof snapshot.editorHTML === 'string' ? snapshot.editorHTML : getCleanEditorHTML();
  const editorText = typeof snapshot.editorText === 'string' ? snapshot.editorText : getCleanEditorText();
  const snapshotTitle = typeof snapshot.chapterTitle === 'string' ? snapshot.chapterTitle.trim() : '';

  if (
    typeof commitChapterTitleEdit === 'function' &&
    (isEditingChapterTitle || (typeof hasPendingChapterTitleCommit === 'function' && hasPendingChapterTitleCommit()))
  ) {
    const titleCommitted = await commitChapterTitleEdit();
    if (!titleCommitted) return false;
  }

  let chapter = chapters[targetChapterIndex];
  if (!chapter || isDraftActive() || isTrashDraftActive()) return false;

  curChap = targetChapterIndex;
  const draftKey = activeChapterEditKey || chapterEditDraftKey(targetChapterIndex);
  const draft = activeChapterEditDraft() ||
    (draftKey && chapterEditDrafts[draftKey]
      ? normalizeChapterEditDraft(chapterEditDrafts[draftKey], draftKey)
      : null);
  const normalizedDraftKey = draft?.chapterKey || draftKey;

  if (draft) {
    draft.content = editorHTML;
    if (snapshotTitle) draft.title = snapshotTitle;
    draft.updatedAt = new Date().toISOString();
    chapterEditDrafts[normalizedDraftKey] = draft;
  }

  const nextTitle = (snapshotTitle || draft?.title || activeEditorDisplayTitle() || chapterDisplayTitle(chapter, targetChapterIndex)).trim();
  if (chapterTitleExists(nextTitle, targetChapterIndex)) {
    showDuplicateReminder(text().duplicateChapterTitle);
    return false;
  }

  chapter = chapters[targetChapterIndex] || chapter;
  if (!chapter) return false;

  chapter.title = nextTitle;
  chapter.content = editorHTML;
  if (draft) {
    chapter.alignment = normalizeEditorAlignment(draft.alignment);
    chapter.lineHeight = normalizeOptionalEditorLineHeight(draft.lineHeight);
    chapter.paragraphGap = normalizeOptionalEditorParagraphGap(draft.paragraphGap);
    chapter.paragraphMargin = normalizeOptionalEditorParagraphMargin(draft.paragraphMargin);
    chapter.fontFamily = normalizeEditorFontFamily(draft.fontFamily);
    chapter.fontSize = normalizeEditorFontSize(draft.fontSize);
    if (draft.editorSettings) {
      chapter.editorSettings = normalizeEditorSettings(draft.editorSettings);
    }
  }
  setChapterWordCache(targetChapterIndex, countWordsFromText(editorText));

  const tempDraftPath = draft?.contentPath || '';
  if (draftKey) delete chapterEditDrafts[draftKey];
  if (normalizedDraftKey && normalizedDraftKey !== draftKey) delete chapterEditDrafts[normalizedDraftKey];
  activeEditorMode = 'chapter';
  curDraft = -1;
  activeChapterEditKey = null;
  isChapterEditUnlocked = false;
  isEditingChapterTitle = false;
  syncChapterTitleControls(targetChapterIndex, nextTitle);

  const chapterSavedAt = new Date().toISOString();
  scanCurrentChapterForNamingUses(targetChapterIndex, editorText, chapterSavedAt);
  persistProjectManifestSnapshot();
  saveToStorage(false);
  await writeChapterToLocalFile(targetChapterIndex, editorText);
  await writeNamingDataToProject();
  chapter.content = editorHTML;
  saveToStorage(false);
  if (tempDraftPath) await removeProjectFileIfExists(tempDraftPath);
  await writeChapterEditDraftsToProject();
  if (activeSidePanel === 'naming') renderTags();
  loadEditor();
  renderChapters();
  updateChapterStatus();
  renderCommittedChapterSnapshotInEditor(chapter, editorHTML);
  return true;
}

function renderCommittedChapterSnapshotInEditor(chapter, editorHTML) {
  const editor = document.getElementById('editor');
  if (!editor || !chapter) return;

  if (typeof shouldVirtualizeEditorDocument === 'function' && shouldVirtualizeEditorDocument(chapter)) {
    const sequence = ++editorDocumentLoadSequence;
    resetActiveEditorHTMLBuffer(editorHTML || chapter.content || '');
    startVirtualEditorDocument(chapter, sequence);
    return;
  }

  editor.innerHTML = editorHTML || '';
  normalizeEditorGapMarkers(editor);
  if (typeof normalizeEditorParagraphBlocks === 'function') normalizeEditorParagraphBlocks(editor);
  applyEditorAlignment(chapter.alignment);
  applyEditorSpacing(chapter.lineHeight, chapter.paragraphGap, null);
  if (typeof applyEditorFontFamily === 'function') applyEditorFontFamily(chapter.fontFamily);
  if (typeof applyEditorFontSize === 'function') applyEditorFontSize(chapter.fontSize);
  syncActiveEditorEditState();
  syncEditorPlaceholderState();
  lastSavedChapterHTML = getCleanEditorHTML();
  setSaveButtonSaved(true);
  updateStats();
  updateEditorScrollThumb(false);
}

async function manualSave() {
  if (!hasActiveStory()) return;
  if (isTrashDraftActive()) return;
  await window.LmInitialRendering?.ensureFullNamingData?.();
  if (typeof flushEditorHTMLMemoryCommit === 'function') await flushEditorHTMLMemoryCommit();
  if (typeof flushEditorInputStatsUpdate === 'function') flushEditorInputStatsUpdate();
  if (typeof flushEditorHistorySnapshot === 'function') flushEditorHistorySnapshot('manual-save');
  const titleInput = document.getElementById('chapterTitleInput');
  const editorSnapshot = {
    chapterIndex: curChap,
    editorHTML: getCleanEditorHTML(),
    editorText: getCleanEditorText(),
    chapterTitle: titleInput?.value?.trim() || activeEditorDisplayTitle()
  };
  if (
    typeof commitChapterTitleEdit === 'function' &&
    (isEditingChapterTitle || (typeof hasPendingChapterTitleCommit === 'function' && hasPendingChapterTitleCommit()))
  ) {
    const titleCommitted = await commitChapterTitleEdit();
    if (!titleCommitted) return;
  }
  if (
    !isDraftActive() &&
    isChapterEditUnlocked &&
    !isChapterEditDraftActive() &&
    hasChapterEditContentChangedFromSaved(editorSnapshot.editorHTML, editorSnapshot.chapterIndex)
  ) {
    materializeChapterEditDraftForChange(editorSnapshot.editorHTML);
  }
  const preSaveNamingChanged = scanActiveEditorForNamingUses(new Date().toISOString());
  if (!isDraftActive() && !isChapterEditUnlocked && !isChapterEditDraftActive()) {
    if (preSaveNamingChanged) {
      saveToStorage(false);
      await writeNamingDataToProject();
      if (activeSidePanel === 'naming') renderTags();
    }
    setSaveButtonSaved(true);
    setDefaultSaveStatus();
    showMiniReminder(text().chapterAlreadySaved);
    return;
  }
  if (isDraftActive() && getCleanEditorHTML() === lastSavedChapterHTML) {
    if (preSaveNamingChanged) {
      saveToStorage(false);
      await writeNamingDataToProject();
      if (activeSidePanel === 'naming') renderTags();
    }
    setSaveButtonSaved(true);
    setDefaultSaveStatus();
    showMiniReminder(text().draftAlreadySaved);
    return;
  }
  clearTimeout(autoSaveTimer);
  stopTimedAutoSave();
  setSaveStatusDot('busy', text().saving);
  setSaveButtonSaved(false);
  showAppLoader(text().savingProject);

  try {
    let committedChapterEdit = false;
    if (!isDraftActive() && isChapterEditUnlocked) {
      const committed = await commitChapterEditDraftToChapter(editorSnapshot);
      if (!committed) return;
      committedChapterEdit = true;
    } else {
      await saveCurrentProject();
    }
    rememberCurrentChapterSaved(committedChapterEdit ? editorSnapshot.editorHTML : null);
    setSaveStatusDot('saved', text().saved);
    if (committedChapterEdit) showMiniReminder(text().chapterEditSaved);
  } catch (error) {
    console.warn('Local save failed:', error);
    setSaveButtonSaved(false);
    setDefaultSaveStatus();
  } finally {
    hideAppLoader();
  }
}

async function selectLocalProjectFolder() {
  if (!supportsLocalProjectFolders()) {
    showProjectGate(text().projectUnsupported);
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({
      id: 'lekhak-manch-story',
      mode: 'readwrite'
    });

    if (!(await verifyProjectPermission(handle, true))) {
      showProjectGate(text().projectPermissionNeeded);
      return;
    }

    showAppLoader(text().loadingProject);
    await loadWorkspaceFolder(handle);
    hideProjectGate();
    refreshProjectUI();
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.warn('Story folder selection failed:', error);
      showProjectGate(text().projectPermissionNeeded);
    }
  } finally {
    hideAppLoader();
  }
}

function sanitizeStoryFolderName(value) {
  const cleaned = String(value || 'Untitled Story')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  return cleaned || 'Untitled Story';
}

async function copyProjectDirectoryContents(sourceDirectory, targetDirectory) {
  for await (const entry of sourceDirectory.values()) {
    if (entry.kind === 'directory') {
      const nextTargetDirectory = await targetDirectory.getDirectoryHandle(entry.name, { create: true });
      await copyProjectDirectoryContents(entry, nextTargetDirectory);
      continue;
    }
    if (entry.kind !== 'file') continue;
    const sourceFile = await entry.getFile();
    const targetFileHandle = await targetDirectory.getFileHandle(entry.name, { create: true });
    const writable = await targetFileHandle.createWritable();
    await writable.write(sourceFile);
    await writable.close();
  }
}

async function removeWorkspaceProjectDirectory(folderName, typeFolderName = '') {
  const parentDirectory = await workspaceProjectParentDirectory(typeFolderName);
  await parentDirectory.removeEntry(folderName, { recursive: true });
}

async function renameActiveStoryFolderIfNeeded(nextTitle, nextType = projectManifest?.type || 'novel') {
  if (!workspaceDirectoryHandle || !projectDirectoryHandle) return projectDirectoryHandle;

  const currentFolderName = projectDirectoryHandle.name || '';
  const nextFolderName = sanitizeStoryFolderName(nextTitle);
  const currentTypeFolderName = currentProjectTypeFolderName();
  const nextTypeFolderName = projectTypeFolderName(nextType);
  if (
    !nextFolderName ||
    (
      uniqueNameKey(nextFolderName) === uniqueNameKey(currentFolderName) &&
      currentTypeFolderName === nextTypeFolderName
    )
  ) {
    return projectDirectoryHandle;
  }

  const targetParentDirectory = await workspaceProjectParentDirectory(nextTypeFolderName, { create: true });
  try {
    const existingHandle = await targetParentDirectory.getDirectoryHandle(nextFolderName);
    const sameLocation = currentTypeFolderName === nextTypeFolderName &&
      uniqueNameKey(existingHandle.name) === uniqueNameKey(currentFolderName);
    if (!sameLocation) throw new Error(text().duplicateStoryTitle);
  } catch (error) {
    if (error.name !== 'NotFoundError') throw error;
  }

  try {
    saveActiveEditorStateForStory(currentFolderName, currentTypeFolderName);
    let didMoveProjectDirectory = false;
    if (typeof projectDirectoryHandle.move === 'function') {
      try {
        if (currentTypeFolderName !== nextTypeFolderName) {
          await projectDirectoryHandle.move(targetParentDirectory, nextFolderName);
        } else {
          await projectDirectoryHandle.move(nextFolderName);
        }
        didMoveProjectDirectory = true;
      } catch (moveError) {
        console.warn('Native story folder move failed, falling back to copy:', moveError);
      }
    }
    if (!didMoveProjectDirectory) {
      const copiedHandle = await targetParentDirectory.getDirectoryHandle(nextFolderName, { create: true });
      await copyProjectDirectoryContents(projectDirectoryHandle, copiedHandle);
      await removeWorkspaceProjectDirectory(currentFolderName, currentTypeFolderName);
    }

    let renamedHandle = projectDirectoryHandle;
    try {
      renamedHandle = await targetParentDirectory.getDirectoryHandle(nextFolderName);
    } catch (readError) {
      console.warn('Renamed story folder handle refresh failed:', readError);
    }
    await saveProjectHandle(renamedHandle);
    projectDirectoryHandle = renamedHandle;
    localStorage.setItem(PROJECT_FOLDER_KEY, renamedHandle.name || nextFolderName);
    setActiveProjectTypeFolderName(nextTypeFolderName);
    migrateActiveEditorStateForStory(
      currentFolderName,
      renamedHandle.name || nextFolderName,
      currentTypeFolderName,
      nextTypeFolderName
    );
    return renamedHandle;
  } catch (error) {
    console.warn('Story folder rename failed:', error);
    return projectDirectoryHandle;
  }
}

async function createUniqueStoryDirectory(baseTitle, type = 'novel') {
  if (!workspaceDirectoryHandle) throw new Error(text().chooseWorkspaceFirst);
  const baseName = sanitizeStoryFolderName(baseTitle);
  const typeFolderName = projectTypeFolderName(type);
  const parentDirectory = await workspaceProjectParentDirectory(typeFolderName, { create: true });

  try {
    await parentDirectory.getDirectoryHandle(baseName);
    throw new Error(text().duplicateStoryTitle);
  } catch (error) {
    if (error.name !== 'NotFoundError') throw error;
  }

  return parentDirectory.getDirectoryHandle(baseName, { create: true });
}
