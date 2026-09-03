async function refreshProjectDetailsSection(sectionName = 'documents') {
  const refreshBtn = document.getElementById('projectDetailsSectionRefreshBtn');
  if (refreshBtn) refreshBtn.classList.add('is-spinning');

  try {
    if (sectionName === 'notes') {
      projectDetailsMentionsCache = null;
      const documents = projectDetailsCurrentState?.documents || [];
      const newMentions = {};
      (namingData.entries || []).forEach(entry => {
        const rows = projectDetailsDocumentRowsForTerm(documents, entry.name);
        const totalMentions = rows.reduce((sum, row) => sum + row.count, 0);
        newMentions[entry.id] = {
          name: entry.name,
          totalMentions,
          rows: rows.map(r => ({
            documentId: r.documentItem?.id || '',
            documentKey: r.documentItem?.key || '',
            title: r.documentItem?.title || '',
            count: r.count
          }))
        };
      });
      await projectDetailsSaveMentionsCache(newMentions);
      await projectDetailsActivateTab('notes', { force: true });
      projectDetailsNotify('Names & Facts re-scanned & cache updated.');
    } else if (sectionName === 'documents') {
      const state = await projectDetailsLoadState();
      projectDetailsCurrentState = state;
      await projectDetailsActivateTab('documents', { force: true });
      projectDetailsNotify('Documents refreshed.');
    } else if (sectionName === 'changes') {
      await projectDetailsActivateTab('changes', { force: true });
      projectDetailsNotify('Graphical view refreshed.');
    }
  } catch (error) {
    console.warn('Section refresh failed:', error);
    projectDetailsNotify('Refresh failed.', true);
  } finally {
    if (refreshBtn) refreshBtn.classList.remove('is-spinning');
  }
}

function refreshProjectDetailsActiveSection() {
  const activeTabBtn = document.querySelector('.project-details-tab.is-active');
  const activeTab = activeTabBtn?.dataset?.projectDetailsTab || 'documents';
  refreshProjectDetailsSection(activeTab);
}

window.refreshProjectDetailsSection = refreshProjectDetailsSection;
window.refreshProjectDetailsActiveSection = refreshProjectDetailsActiveSection;

function initProjectDetailsGraphView() {
  const graph = document.getElementById('projectDetailsGraphView');
  if (!graph || graph.dataset.projectDetailsGraphViewBound === 'true') return;

  graph.dataset.projectDetailsGraphViewBound = 'true';
  graph.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const filterButton = target.closest('[data-project-details-graph-document-filter]');
    if (filterButton) {
      projectDetailsGraphDocumentFilter = ['all', 'chapter', 'draft'].includes(filterButton.dataset.projectDetailsGraphDocumentFilter)
        ? filterButton.dataset.projectDetailsGraphDocumentFilter
        : 'all';
      projectDetailsGraphSelectedDocumentId = '';
      projectDetailsGraphSelectedEntityKeys = [];
      projectDetailsRerenderGraphicalView();
      return;
    }

    const documentButton = target.closest('[data-project-details-graph-document-id]');
    if (documentButton) {
      projectDetailsGraphSelectedDocumentId = documentButton.dataset.projectDetailsGraphDocumentId || '';
      projectDetailsGraphSelectedEntityKeys = [];
      projectDetailsRerenderGraphicalView();
      return;
    }

    const entityModeButton = target.closest('[data-project-details-graph-entity-mode]');
    if (entityModeButton) {
      projectDetailsGraphEntityMode = entityModeButton.dataset.projectDetailsGraphEntityMode === 'facts' ? 'facts' : 'names';
      projectDetailsGraphSelectedEntityKeys = [];
      projectDetailsRerenderGraphicalView();
      return;
    }

    const entityButton = target.closest('[data-project-details-graph-entity-key]');
    if (!entityButton) return;
    const entityKey = entityButton.dataset.projectDetailsGraphEntityKey || '';
    if (!entityKey) return;
    if (projectDetailsGraphSelectedEntityKeys.includes(entityKey)) {
      projectDetailsGraphSelectedEntityKeys = projectDetailsGraphSelectedEntityKeys.filter(key => key !== entityKey);
    } else {
      projectDetailsGraphSelectedEntityKeys = [...projectDetailsGraphSelectedEntityKeys, entityKey].slice(-5);
    }
    projectDetailsRerenderGraphicalView();
  });
}

function initProjectDetailsNoteBrowser() {
  const grid = document.getElementById('projectDetailsNoteGrid');
  if (!grid || grid.dataset.projectDetailsNoteBrowserBound === 'true') return;

  grid.dataset.projectDetailsNoteBrowserBound = 'true';
  window.addEventListener('resize', projectDetailsSyncNameControlPanelPosition, { passive: true });
  document.addEventListener('scroll', projectDetailsSyncNameControlPanelPosition, { passive: true, capture: true });
  projectDetailsBindNameControlOutsideClose();
  grid.addEventListener('change', event => {
    const filterField = event.target.closest('[data-project-details-name-filter]');
    if (filterField) {
      const key = filterField.dataset.projectDetailsNameFilter;
      if (key) projectDetailsNameListFilter = { ...projectDetailsNameListFilter, [key]: filterField.value || 'all' };
      projectDetailsSelectedNameId = '';
      projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
      return;
    }

    const sortField = event.target.closest('[data-project-details-name-sort]');
    if (sortField) {
      projectDetailsApplyNameSort(sortField.value || 'time');
      return;
    }

    const chapterStartField = event.target.closest('[data-project-details-name-chapter-start]');
    const chapterEndField = event.target.closest('[data-project-details-name-chapter-end]');
    if (chapterStartField || chapterEndField) {
      projectDetailsNameListFilter = {
        ...projectDetailsNameListFilter,
        chapterStart: grid.querySelector('[data-project-details-name-chapter-start]')?.value || '',
        chapterEnd: grid.querySelector('[data-project-details-name-chapter-end]')?.value || ''
      };
      projectDetailsSelectedNameId = '';
      projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
    }
  });

  grid.addEventListener('keydown', event => {
    const titleInput = event.target.closest('[data-project-details-title-edit-input]');
    if (titleInput && (event.key === 'Enter' || event.key === 'Escape')) {
      event.preventDefault();
      if (event.key === 'Escape') {
        projectDetailsClearTitleEditState();
        projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
        return;
      }
      if (titleInput.dataset.projectDetailsNameTitleInput) {
        projectDetailsPersistNameTitle(
          titleInput.dataset.projectDetailsNameTitleInput || '',
          titleInput.value || ''
        );
        return;
      }
      if (titleInput.dataset.projectDetailsFactTitleInput) {
        projectDetailsPersistFactTitle(
          titleInput.dataset.projectDetailsFactTitleInput || '',
          titleInput.value || ''
        );
        return;
      }
    }

    if (event.key !== 'Enter') return;
    if (!event.target.closest('[data-project-details-name-chapter-start], [data-project-details-name-chapter-end]')) return;
    event.preventDefault();
    projectDetailsNameListFilter = {
      ...projectDetailsNameListFilter,
      chapterStart: grid.querySelector('[data-project-details-name-chapter-start]')?.value || '',
      chapterEnd: grid.querySelector('[data-project-details-name-chapter-end]')?.value || ''
    };
    projectDetailsSelectedNameId = '';
    projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
  });

  grid.addEventListener('click', event => {
    const nameTitleEditButton = event.target.closest('[data-project-details-name-title-edit]');
    if (nameTitleEditButton) {
      event.preventDefault();
      projectDetailsEditingNameTitleId = nameTitleEditButton.dataset.projectDetailsNameTitleEdit || '';
      projectDetailsEditingFactTitleId = '';
      projectDetailsShouldFocusTitleEditor = true;
      projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
      return;
    }

    const factTitleEditButton = event.target.closest('[data-project-details-fact-title-edit]');
    if (factTitleEditButton) {
      event.preventDefault();
      projectDetailsEditingFactTitleId = factTitleEditButton.dataset.projectDetailsFactTitleEdit || '';
      projectDetailsEditingNameTitleId = '';
      projectDetailsShouldFocusTitleEditor = true;
      projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
      return;
    }

    const titleCancelButton = event.target.closest('[data-project-details-title-edit-cancel]');
    if (titleCancelButton) {
      event.preventDefault();
      projectDetailsClearTitleEditState();
      projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
      return;
    }

    const nameTitleSaveButton = event.target.closest('[data-project-details-name-title-save]');
    if (nameTitleSaveButton) {
      event.preventDefault();
      const entryId = nameTitleSaveButton.dataset.projectDetailsNameTitleSave || '';
      const input = [...grid.querySelectorAll('[data-project-details-name-title-input]')]
        .find(field => field.dataset.projectDetailsNameTitleInput === entryId);
      projectDetailsPersistNameTitle(entryId, input?.value || '');
      return;
    }

    const factTitleSaveButton = event.target.closest('[data-project-details-fact-title-save]');
    if (factTitleSaveButton) {
      event.preventDefault();
      const factId = factTitleSaveButton.dataset.projectDetailsFactTitleSave || '';
      const input = [...grid.querySelectorAll('[data-project-details-fact-title-input]')]
        .find(field => field.dataset.projectDetailsFactTitleInput === factId);
      projectDetailsPersistFactTitle(factId, input?.value || '');
      return;
    }

    const nameDeleteButton = event.target.closest('[data-project-details-name-delete]');
    if (nameDeleteButton) {
      event.preventDefault();
      projectDetailsDeleteName(nameDeleteButton.dataset.projectDetailsNameDelete || '');
      return;
    }

    const appearanceButton = event.target.closest('[data-project-details-name-appearance-document]');
    if (appearanceButton) {
      event.preventDefault();
      openProjectDetailsNameAppearancePreview(
        appearanceButton.dataset.projectDetailsNameAppearanceDocument || '',
        appearanceButton.dataset.projectDetailsNameAppearanceEntry || ''
      );
      return;
    }

    const historyButton = event.target.closest('[data-project-details-name-history-entry]');
    if (historyButton) {
      event.preventDefault();
      openProjectDetailsNameHistory(
        historyButton.dataset.projectDetailsNameHistoryEntry || '',
        Number(historyButton.dataset.projectDetailsNameHistoryIndex || 0)
      );
      return;
    }

    const modeButton = event.target.closest('[data-project-details-note-mode]');
    if (modeButton) {
      projectDetailsClearTitleEditState();
      projectDetailsNotesMode = modeButton.dataset.projectDetailsNoteMode === 'facts' ? 'facts' : 'names';
      if (projectDetailsNotesMode === 'facts') projectDetailsNameControlPanel = '';
      else projectDetailsFactControlPanel = '';
      projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
      return;
    }

    const factControlButton = event.target.closest('[data-project-details-fact-control-panel]');
    if (factControlButton) {
      const requestedPanel = factControlButton.dataset.projectDetailsFactControlPanel || '';
      projectDetailsFactControlPanel = projectDetailsFactControlPanel === requestedPanel ? '' : requestedPanel;
      projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
      return;
    }

    const factControlCloseButton = event.target.closest('[data-project-details-fact-control-close]');
    if (factControlCloseButton) {
      projectDetailsCloseFactControlPanel();
      return;
    }

    const factSortOptionButton = event.target.closest('[data-project-details-fact-sort-option]');
    if (factSortOptionButton) {
      event.preventDefault();
      projectDetailsApplyFactSort(factSortOptionButton.dataset.projectDetailsFactSortOption || 'time');
      return;
    }

    const factSortDirectionButton = event.target.closest('[data-project-details-fact-sort-direction]');
    if (factSortDirectionButton) {
      event.preventDefault();
      projectDetailsToggleFactSortDirection();
      return;
    }

    const factSortResetButton = event.target.closest('[data-project-details-fact-sort-reset]');
    if (factSortResetButton) {
      projectDetailsApplyFactSort('time', { resetDirection: true });
      return;
    }

    const pinnedFactButton = event.target.closest('[data-project-details-fact-pinned-select]');
    if (pinnedFactButton) {
      projectDetailsSelectedFactId = pinnedFactButton.dataset.projectDetailsFactPinnedSelect || '';
      projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
      return;
    }

    const factPinButton = event.target.closest('[data-project-details-fact-pin]');
    if (factPinButton) {
      event.preventDefault();
      projectDetailsToggleFactPin(factPinButton.dataset.projectDetailsFactPin || '');
      return;
    }

    const controlButton = event.target.closest('[data-project-details-name-control-panel]');
    if (controlButton) {
      const requestedPanel = controlButton.dataset.projectDetailsNameControlPanel || '';
      projectDetailsNameControlPanel = projectDetailsNameControlPanel === requestedPanel ? '' : requestedPanel;
      projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
      return;
    }

    const closeButton = event.target.closest('[data-project-details-name-control-close]');
    if (closeButton) {
      projectDetailsCloseNameControlPanel();
      return;
    }

    const filterViewButton = event.target.closest('[data-project-details-name-filter-view]');
    if (filterViewButton) {
      projectDetailsNameFilterView = filterViewButton.dataset.projectDetailsNameFilterView || 'category';
      projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
      return;
    }

    const filterOptionButton = event.target.closest('[data-project-details-name-filter-option]');
    if (filterOptionButton?.dataset.projectDetailsNameFilterOption) {
      const key = filterOptionButton.dataset.projectDetailsNameFilterOption;
      projectDetailsNameListFilter = {
        ...projectDetailsNameListFilter,
        [key]: filterOptionButton.dataset.value || 'all'
      };
      projectDetailsSelectedNameId = '';
      projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
      return;
    }

    const sortOptionButton = event.target.closest('[data-project-details-name-sort-option]');
    if (sortOptionButton) {
      event.preventDefault();
      projectDetailsApplyNameSort(sortOptionButton.dataset.projectDetailsNameSortOption || 'time');
      return;
    }

    const sortDirectionButton = event.target.closest('[data-project-details-name-sort-direction]');
    if (sortDirectionButton) {
      event.preventDefault();
      projectDetailsToggleNameSortDirection();
      return;
    }

    const chapterStepButton = event.target.closest('[data-project-details-name-chapter-step]');
    if (chapterStepButton) {
      if (projectDetailsAdjustChapterRangeInput(chapterStepButton, grid)) return;
    }

    const resetButton = event.target.closest('[data-project-details-name-filter-reset]');
    if (resetButton) {
      projectDetailsNameListFilter = {
        ...projectDetailsNameListFilter,
        categoryId: 'all',
        occurrenceRange: 'all',
        chapterStart: '',
        chapterEnd: ''
      };
      projectDetailsSelectedNameId = '';
      projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
      return;
    }

    const sortResetButton = event.target.closest('[data-project-details-name-sort-reset]');
    if (sortResetButton) {
      projectDetailsApplyNameSort('time', { resetDirection: true });
      return;
    }

    const nameButton = event.target.closest('[data-project-details-name-id]');
    if (nameButton) {
      projectDetailsClearTitleEditState();
      projectDetailsSelectedNameId = nameButton.dataset.projectDetailsNameId || '';
      projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
      return;
    }

    const factButton = event.target.closest('[data-project-details-fact-id]');
    if (factButton) {
      projectDetailsClearTitleEditState();
      projectDetailsSelectedFactId = factButton.dataset.projectDetailsFactId || '';
      projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
    }
  });
}

function initProjectDetailsDocumentBrowser() {
  const grid = document.getElementById('projectDetailsDocumentGrid');
  if (!grid || grid.dataset.projectDetailsDocumentBrowserBound === 'true') return;

  grid.dataset.projectDetailsDocumentBrowserBound = 'true';
  grid.addEventListener('click', event => {
    const previewButton = event.target.closest('[data-project-details-document-preview]');
    if (previewButton) {
      openProjectDetailsDocumentPreview(previewButton.dataset.projectDetailsDocumentPreview || projectDetailsSelectedDocumentId);
      return;
    }

    const descriptionEditButton = event.target.closest('[data-project-details-description-edit]');
    if (descriptionEditButton) {
      projectDetailsEditingNameDescriptionId = descriptionEditButton.dataset.projectDetailsDescriptionEdit || '';
      projectDetailsShouldFocusDescriptionEditor = true;
      projectDetailsRenderDocuments(projectDetailsCurrentState?.documents || []);
      return;
    }

    const descriptionCancelButton = event.target.closest('[data-project-details-description-cancel]');
    if (descriptionCancelButton) {
      projectDetailsEditingNameDescriptionId = '';
      projectDetailsRenderDocuments(projectDetailsCurrentState?.documents || []);
      return;
    }

    const descriptionSaveButton = event.target.closest('[data-project-details-description-save]');
    if (descriptionSaveButton) {
      const entryId = descriptionSaveButton.dataset.projectDetailsDescriptionSave || '';
      const input = [...grid.querySelectorAll('[data-project-details-name-description-input]')]
        .find(field => field.dataset.projectDetailsNameDescriptionInput === entryId);
      const didSave = projectDetailsPersistNameDescription(entryId, input?.value || '');
      if (didSave) {
        projectDetailsEditingNameDescriptionId = '';
        projectDetailsSelectedDetectedNameKey = '';
        projectDetailsSelectedFactKey = '';
        projectDetailsLastRenderedDocumentId = '';
        projectDetailsActiveDocumentInfoPanel = 'attached-names';
        projectDetailsRerenderAfterNamingEdit();
      }
      return;
    }

    const detectedNameButton = event.target.closest('[data-project-details-detected-name-key]');
    if (detectedNameButton) {
      projectDetailsEditingNameDescriptionId = '';
      projectDetailsSelectedDetectedNameKey = detectedNameButton.dataset.projectDetailsDetectedNameKey || '';
      projectDetailsRenderDocuments(projectDetailsCurrentState?.documents || []);
      return;
    }

    const factButton = event.target.closest('[data-project-details-fact-key]');
    if (factButton) {
      projectDetailsEditingNameDescriptionId = '';
      projectDetailsSelectedFactKey = factButton.dataset.projectDetailsFactKey || '';
      projectDetailsRenderDocuments(projectDetailsCurrentState?.documents || []);
      return;
    }

    const infoPanelButton = event.target.closest('[data-project-details-document-info-panel]');
    if (infoPanelButton) {
      projectDetailsEditingNameDescriptionId = '';
      const panelName = infoPanelButton.dataset.projectDetailsDocumentInfoPanel || 'attached-names';
      projectDetailsActiveDocumentInfoPanel = projectDetailsNormalizeDocumentInfoPanel(panelName);
      projectDetailsRenderDocuments(projectDetailsCurrentState?.documents || []);
      return;
    }

    const modeButton = event.target.closest('[data-project-details-document-mode]');
    if (modeButton) {
      projectDetailsDocumentMode = modeButton.dataset.projectDetailsDocumentMode === 'chapter' ? 'chapter' : 'draft';
      projectDetailsSelectedDocumentId = '';
      projectDetailsLastRenderedDocumentId = '';
      projectDetailsShouldFocusDocumentInfoButton = true;
      projectDetailsSelectedDetectedNameKey = '';
      projectDetailsSelectedFactKey = '';
      projectDetailsEditingNameDescriptionId = '';
      projectDetailsRenderDocuments(projectDetailsCurrentState?.documents || []);
      return;
    }

    const documentButton = event.target.closest('[data-project-details-document-id]');
    if (documentButton) {
      projectDetailsSelectedDocumentId = documentButton.dataset.projectDetailsDocumentId || '';
      projectDetailsLastRenderedDocumentId = '';
      projectDetailsShouldFocusDocumentInfoButton = true;
      projectDetailsSelectedDetectedNameKey = '';
      projectDetailsSelectedFactKey = '';
      projectDetailsEditingNameDescriptionId = '';
      projectDetailsRenderDocuments(projectDetailsCurrentState?.documents || []);
    }
  });
}

function initProjectDetailsDocumentPreview() {
  const modal = projectDetailsEnsureDocumentPreviewModal();
  if (modal.dataset.projectDetailsPreviewBound === 'true') return;
  modal.dataset.projectDetailsPreviewBound = 'true';
  modal.addEventListener('mousedown', event => {
    if (event.target === modal) closeProjectDetailsDocumentPreview();
  });
  modal.addEventListener('click', event => {
    const mentionButton = event.target.closest('[data-project-details-preview-mention]');
    if (!mentionButton) return;
    event.preventDefault();
    projectDetailsMovePreviewMention(mentionButton.dataset.projectDetailsPreviewMention || 'after');
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeProjectDetailsDocumentPreview();
      closeProjectDetailsNameHistory();
    }
  });
}

function initProjectDetailsNameHistoryPanel() {
  const modal = projectDetailsEnsureNameHistoryModal();
  if (modal.dataset.projectDetailsNameHistoryBound === 'true') return;
  modal.dataset.projectDetailsNameHistoryBound = 'true';
  modal.addEventListener('mousedown', event => {
    if (event.target === modal) closeProjectDetailsNameHistory();
  });
  modal.addEventListener('click', event => {
    if (event.target.closest('[data-project-details-name-history-close]')) {
      closeProjectDetailsNameHistory();
    }
  });
}

function initProjectDetailsConfirmModal() {
  const modal = projectDetailsEnsureConfirmModal();
  if (modal.dataset.projectDetailsConfirmBound === 'true') return;
  modal.dataset.projectDetailsConfirmBound = 'true';
  modal.addEventListener('mousedown', event => {
    if (event.target === modal) closeProjectDetailsConfirmModal(false);
  });
  modal.addEventListener('click', event => {
    if (event.target.closest('[data-project-details-confirm-cancel]')) {
      closeProjectDetailsConfirmModal(false);
      return;
    }
    if (event.target.closest('[data-project-details-confirm-accept]')) {
      closeProjectDetailsConfirmModal(true);
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeProjectDetailsConfirmModal(false);
  });
}

function projectDetailsSetEditButtonState(hasProject) {
  const button = document.getElementById('projectDetailsEditBtn');
  if (button) button.disabled = !hasProject;
}

function projectDetailsFieldValue(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

function projectDetailsSetEditStatus(message = '', isError = false) {
  const status = document.getElementById('projectDetailsEditStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', Boolean(isError));
}

function projectDetailsEditManifest() {
  return projectDetailsCurrentState?.manifest || projectManifest || projectDetailsStoredJson(PROJECT_MANIFEST_KEY, null);
}

function projectDetailsTypeEditLabel(manifest = {}) {
  if (typeof storyTypeLabel === 'function') return storyTypeLabel(manifest.type || 'project');
  return projectTypeFolderTitle(manifest.type || 'project');
}

function projectDetailsSetEditField(id, value = '') {
  const field = document.getElementById(id);
  if (field) field.value = value;
}

function projectDetailsSyncEditCustomSelects() {
  const panel = document.getElementById('projectDetailsEditPanel');
  if (!panel) return;
  if (typeof initCustomSelects === 'function') initCustomSelects(panel);
  if (typeof syncCustomSelects === 'function') syncCustomSelects(panel);
  else if (typeof queueCustomSelectSync === 'function') queueCustomSelectSync(panel);
}

function openProjectDetailsEditPanel() {
  const manifest = projectDetailsEditManifest();
  if (!manifest) return;

  projectDetailsEditLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  projectDetailsSetEditField('projectDetailsEditTitle', manifest.title || '');
  projectDetailsSetEditField('projectDetailsEditType', projectDetailsTypeEditLabel(manifest));
  projectDetailsSetEditField('projectDetailsEditLanguage', ['en', 'hi'].includes(manifest.language) ? manifest.language : 'en');
  projectDetailsSetEditField('projectDetailsEditAuthor', manifest.author || '');
  projectDetailsSetEditField('projectDetailsEditSynopsis', manifest.synopsis || '');
  projectDetailsSyncEditCustomSelects();
  projectDetailsSetEditStatus('');

  const modal = document.getElementById('projectDetailsEditModal');
  modal?.classList.add('is-visible');
  modal?.setAttribute('aria-hidden', 'false');
  projectDetailsSyncCustomScrollThumbs(modal || document);

  requestAnimationFrame(() => {
    const titleInput = document.getElementById('projectDetailsEditTitle');
    titleInput?.focus();
    titleInput?.select?.();
  });
}

function closeProjectDetailsEditPanel() {
  const modal = document.getElementById('projectDetailsEditModal');
  modal?.classList.remove('is-visible');
  modal?.setAttribute('aria-hidden', 'true');
  projectDetailsSetEditStatus('');
  projectDetailsEditLastFocus?.focus?.();
  projectDetailsEditLastFocus = null;
  projectDetailsSyncCustomScrollThumbs();
}

async function projectDetailsPersistEditedManifest(nextManifest) {
  const hasProjectHandle = typeof projectDirectoryHandle !== 'undefined' && Boolean(projectDirectoryHandle);
  if (typeof writeProjectManifest === 'function' && hasProjectHandle) {
    await writeProjectManifest(nextManifest);
    return;
  }

  const createdAt = nextManifest.createdAt || projectManifest?.createdAt || new Date().toISOString();
  projectManifest = normalizeProjectManifest({
    ...nextManifest,
    createdAt,
    updatedAt: new Date().toISOString()
  });
  localStorage.setItem(PROJECT_MANIFEST_KEY, JSON.stringify(projectManifest));
}

async function saveProjectDetailsFromPanel(event) {
  event?.preventDefault?.();
  const manifest = projectDetailsEditManifest();
  if (!manifest) return;

  const saveButton = document.getElementById('projectDetailsEditSave');
  const previousButtonText = saveButton?.textContent || 'Save Details';

  try {
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = 'Saving...';
      saveButton.setAttribute('aria-busy', 'true');
    }
    projectDetailsSetEditStatus('Saving project details...');

    const nextManifest = normalizeProjectManifest({
      ...manifest,
      title: projectDetailsFieldValue('projectDetailsEditTitle') || manifest.title || 'Untitled Story',
      author: projectDetailsFieldValue('projectDetailsEditAuthor'),
      language: projectDetailsFieldValue('projectDetailsEditLanguage') === 'hi' ? 'hi' : 'en',
      synopsis: document.getElementById('projectDetailsEditSynopsis')?.value?.trim() || ''
    });

    await projectDetailsPersistEditedManifest(nextManifest);
    const state = await projectDetailsLoadState();
    projectDetailsRenderAll(state);
    closeProjectDetailsEditPanel();
  } catch (error) {
    console.warn('Project details edit save failed:', error);
    projectDetailsSetEditStatus('Project details could not be saved.', true);
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = previousButtonText;
      saveButton.removeAttribute('aria-busy');
    }
  }
}

function initProjectDetailsEditPanel() {
  const modal = document.getElementById('projectDetailsEditModal');
  const form = document.getElementById('projectDetailsEditPanel');
  if (!modal || !form || form.dataset.projectDetailsBound === 'true') return;

  projectDetailsSyncEditCustomSelects();
  form.dataset.projectDetailsBound = 'true';
  form.addEventListener('submit', saveProjectDetailsFromPanel);
  document.getElementById('projectDetailsEditClose')?.addEventListener('click', closeProjectDetailsEditPanel);
  modal.addEventListener('mousedown', event => {
    if (event.target === modal) closeProjectDetailsEditPanel();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modal.classList.contains('is-visible')) closeProjectDetailsEditPanel();
  });
}

async function initProjectDetailsPage() {
  try {
    const state = await projectDetailsLoadState();
    projectDetailsRenderAll(state);
  } catch (error) {
    console.warn('Project details render failed:', error);
    projectDetailsRenderAll(null);
  }
}

async function openProjectDetailsWorkspacePicker() {
  if (!('showDirectoryPicker' in window)) {
    window.location.href = 'home.html';
    return;
  }

  try {
    const handle = await window.showDirectoryPicker();
    let projectHandle = handle;
    let inferredTypeFolder = localStorage.getItem(PROJECT_TYPE_FOLDER_KEY) || '';

    try {
      await handle.getFileHandle(PROJECT_MANIFEST_FILE);
    } catch {
      const savedFolderName = localStorage.getItem(PROJECT_FOLDER_KEY) || '';
      if (!savedFolderName) {
        if (typeof saveWorkspaceHandle === 'function') await saveWorkspaceHandle(handle);
        localStorage.setItem(WORKSPACE_FOLDER_KEY, handle.name || '');
        window.location.href = 'home.html';
        return;
      }

      const parentHandle = inferredTypeFolder
        ? await handle.getDirectoryHandle(inferredTypeFolder)
        : handle;
      projectHandle = await parentHandle.getDirectoryHandle(savedFolderName);
    }

    if (typeof verifyProjectPermission === 'function' && !(await verifyProjectPermission(projectHandle, true))) return;
    projectDirectoryHandle = projectHandle;
    if (typeof saveProjectHandle === 'function') await saveProjectHandle(projectHandle);
    localStorage.setItem(PROJECT_FOLDER_KEY, projectHandle.name || '');
    if (typeof setActiveProjectTypeFolderName === 'function') setActiveProjectTypeFolderName(inferredTypeFolder);
    await initProjectDetailsPage();
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.warn('Project details folder picker failed:', error);
    }
  }
}

window.openProjectDetailsWorkspacePicker = openProjectDetailsWorkspacePicker;
window.openProjectDetailsEditPanel = openProjectDetailsEditPanel;
window.closeProjectDetailsEditPanel = closeProjectDetailsEditPanel;
window.saveProjectDetailsFromPanel = saveProjectDetailsFromPanel;
window.toggleProjectDetailsStoryLibrary = toggleProjectDetailsStoryLibrary;
window.closeProjectDetailsStoryLibraryPanel = closeProjectDetailsStoryLibraryPanel;

document.addEventListener('DOMContentLoaded', () => {
  projectDetailsBindCustomScrollThumbEvents();
  initProjectDetailsTabs();
  initProjectDetailsDocumentBrowser();
  initProjectDetailsNoteBrowser();
  initProjectDetailsGraphView();
  initProjectDetailsDocumentPreview();
  initProjectDetailsNameHistoryPanel();
  initProjectDetailsConfirmModal();
  initProjectDetailsEditPanel();
  initProjectDetailsStoryLibrary();
  initProjectDetailsPage();
});
