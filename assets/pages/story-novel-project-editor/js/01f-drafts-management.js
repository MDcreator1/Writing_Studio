function switchTrashDraft(index) {
  if (!isDraftTrashMode || index < 0 || index >= chapterTrashDrafts.length) return;
  activeEditorMode = 'trash';
  curTrashDraft = index;
  isChapterEditUnlocked = false;
  activeChapterEditKey = null;
  isEditingChapterTitle = false;
  closeDraftActionsPanel();
  renderChapters();
  loadEditor();
  updateChapterStatus();
}

function closePartDetailsPanel() {
  const panel = document.getElementById('partDetailsPanel');
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = '';
  }
  activePartDetailsIndex = null;
  activeFloatingAnchor = null;
}

function openPartDetailsPanel(partIndex, anchor = null) {
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const panel = document.getElementById('partDetailsPanel');
  if (!panel || !manifest.parts[partIndex]) return;

  syncCurrentChapterContentFromEditor();
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  const copy = text();
  const part = normalizePart(manifest.parts[partIndex], partIndex);
  const partChapters = chapters.filter(chapter => chapter.partIndex === partIndex);
  const partWords = partWordTotal(partIndex);
  const canDelete = partWords === 0;
  const canDeleteKeepChapters = partIndex === manifest.parts.length - 1 && partChapters.length > 0 && partWords > 0;
  const partTitle = part.title || defaultPartTitle(partIndex);
  const partSynopsis = part.synopsis || '';
  activePartDetailsIndex = partIndex;
  activeFloatingAnchor = anchor;

  panel.innerHTML = `
    <div class="part-details-head chapter-details-head">
      <div class="chapter-details-heading">
        <span class="part-details-kicker">${escapeHtml(copy.partPrefix)} ${part.no || partIndex + 1}</span>
      </div>
      <div class="chapter-details-head-actions">
        <span class="chapter-created-stamp" title="${escapeHtml(copy.partCreated)}">${escapeHtml(partCreatedLabel(part.createdAt))}</span>
        <button class="name-panel-close" type="button" onclick="closePartDetailsPanel()">${CROSS_CLOSE_SVG}</button>
      </div>
    </div>
    <div class="chapter-title-summary part-edit-section" id="partTitleSummary">
      <span class="part-details-kicker">${escapeHtml(copy.partTitleLabel)}</span>
      <div class="chapter-title-display-row">
        <strong class="chapter-title-display">${escapeHtml(partTitle)}</strong>
        <button class="chapter-title-edit-btn" type="button" onclick="beginPartDetailsTitleEdit(${partIndex})"
          title="${escapeHtml(copy.editPart)}" aria-label="${escapeHtml(copy.editPart)}">
          ${lmIcon("detailEdit")}
        </button>
      </div>
      <input class="chapter-title-editor" type="text" id="partDetailsTitleInp" hidden
        value="${escapeHtml(partTitle)}" data-original-value="${escapeHtml(partTitle)}"
        data-empty-label="${escapeHtml(defaultPartTitle(partIndex))}"
        oninput="markPartDetailsEdited()" onblur="deactivatePartDetailsFieldEdit('partTitleSummary', 'partDetailsTitleInp')"
        onkeydown="handlePartDetailsKey(event, ${partIndex})">
    </div>
    <div class="part-details-grid">
      <div class="part-detail-card"><span>${escapeHtml(copy.partStatus)}</span><strong>${escapeHtml(partStatusLabel(partIndex, partChapters.length))}</strong></div>
      <div class="part-detail-card"><span>${escapeHtml(copy.chapters)}</span><strong>${partChapters.length}</strong></div>
    </div>
    <div class="chapter-title-summary part-edit-section" id="partSynopsisSummary">
      <span class="part-details-kicker">${escapeHtml(copy.partSummary)}</span>
      <div class="chapter-title-display-row">
        <strong class="chapter-title-display part-summary-display ${partSynopsis ? '' : 'is-muted'}">${escapeHtml(partSynopsis || '—')}</strong>
        <button class="chapter-title-edit-btn" type="button" onclick="beginPartDetailsSummaryEdit(${partIndex})"
          title="${escapeHtml(copy.partSummary)}" aria-label="${escapeHtml(copy.partSummary)}">
          ${lmIcon("detailEdit")}
        </button>
      </div>
      <textarea class="chapter-title-editor part-summary-editor" id="partDetailsSynopsisInp" hidden
        data-original-value="${escapeHtml(partSynopsis)}" data-empty-label="—" data-muted-when-empty="true"
        oninput="markPartDetailsEdited()" onblur="deactivatePartDetailsFieldEdit('partSynopsisSummary', 'partDetailsSynopsisInp')"
        onkeydown="handlePartDetailsKey(event, ${partIndex})">${escapeHtml(partSynopsis)}</textarea>
    </div>
    <div class="part-details-actions chapter-details-actions">
      ${canDelete ? `<button class="part-delete-btn part-delete-action-btn" data-part-delete-action="true" type="button" onclick="deletePartIfEmpty(${partIndex})">${escapeHtml(copy.partDelete)}</button>` : ''}
      ${canDeleteKeepChapters ? `<button class="part-delete-btn part-delete-action-btn part-keep-chapters-delete-btn" data-part-delete-action="true" type="button" onclick="deletePartKeepingChapters(${partIndex})">${escapeHtml(copy.partDeleteKeepChapters)}</button>` : ''}
      <button class="part-save-btn chapter-info-save-btn" id="partDetailsSaveBtn" type="button" hidden
        onclick="savePartDetailsPanel(${partIndex})">${escapeHtml(copy.partInfoSave)}</button>
    </div>`;

  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
}

function beginPartDetailsTitleEdit() {
  beginPartDetailsFieldEdit('partTitleSummary', 'partDetailsTitleInp');
}

function beginPartDetailsSummaryEdit() {
  beginPartDetailsFieldEdit('partSynopsisSummary', 'partDetailsSynopsisInp');
}

function beginPartDetailsFieldEdit(sectionId, inputId) {
  const section = document.getElementById(sectionId);
  const input = document.getElementById(inputId);
  if (!section || !input) return;

  section.classList.add('is-editing');
  input.hidden = false;
  markPartDetailsEdited();
  requestAnimationFrame(() => {
    input.focus();
    if (input.tagName !== 'TEXTAREA') input.select();
  });
}

function syncDetailSectionDisplay(section, input) {
  const display = section?.querySelector('.chapter-title-display');
  if (!display || !input) return;

  const nextValue = input.value.trim();
  const fallbackValue = input.dataset.emptyLabel || input.dataset.originalValue || '';
  display.textContent = nextValue || fallbackValue;
  display.classList.toggle('is-muted', input.dataset.mutedWhenEmpty === 'true' && !nextValue);
}

function deactivatePartDetailsFieldEdit(sectionId, inputId) {
  const section = document.getElementById(sectionId);
  const input = document.getElementById(inputId);
  if (!section || !input) return;

  section.classList.remove('is-editing');
  input.hidden = true;
  syncDetailSectionDisplay(section, input);
  markPartDetailsEdited();
}

function deactivatePartDetailsEdits() {
  deactivatePartDetailsFieldEdit('partTitleSummary', 'partDetailsTitleInp');
  deactivatePartDetailsFieldEdit('partSynopsisSummary', 'partDetailsSynopsisInp');
}

function cancelPartDetailsEdits() {
  ['partTitleSummary', 'partSynopsisSummary'].forEach(sectionId => {
    document.getElementById(sectionId)?.classList.remove('is-editing');
  });
  ['partDetailsTitleInp', 'partDetailsSynopsisInp'].forEach(inputId => {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.value = input.dataset.originalValue || '';
    input.hidden = true;
    const section = inputId === 'partDetailsTitleInp'
      ? document.getElementById('partTitleSummary')
      : document.getElementById('partSynopsisSummary');
    syncDetailSectionDisplay(section, input);
  });
  markPartDetailsEdited();
}

function markPartDetailsEdited() {
  const saveButton = document.getElementById('partDetailsSaveBtn');
  if (!saveButton) return;

  const isEditing = ['partTitleSummary', 'partSynopsisSummary']
    .some(sectionId => document.getElementById(sectionId)?.classList.contains('is-editing'));
  const titleInput = document.getElementById('partDetailsTitleInp');
  const synopsisInput = document.getElementById('partDetailsSynopsisInp');
  const titleChanged = titleInput && titleInput.value.trim() !== (titleInput.dataset.originalValue || '').trim();
  const synopsisChanged = synopsisInput && synopsisInput.value.trim() !== (synopsisInput.dataset.originalValue || '').trim();
  const hasChanges = Boolean(titleChanged || synopsisChanged);
  document.querySelectorAll('#partDetailsPanel [data-part-delete-action]').forEach(button => {
    button.hidden = isEditing || hasChanges;
  });
  saveButton.hidden = !hasChanges;
}

function openDraftActionsPanel(draftIndex, anchor = null) {
  chapterDrafts = normalizeDrafts(chapterDrafts);
  const panel = document.getElementById('draftDetailsPanel');
  const draft = chapterDrafts[draftIndex];
  if (!panel || !draft) return;
  const canDeleteDraft = canDeleteDraftIndexes([draftIndex]);
  const deleteTitle = canDeleteDraft ? text().deleteDraft : text().draftDeleteLastDocumentBlocked;

  closePartDetailsPanel();
  closeDraftActionsPanel();
  closeChapterDetailsPanel();
  activeDraftDetailsIndex = draftIndex;
  activeFloatingAnchor = anchor;
  panel.classList.add('draft-actions-panel');
  panel.innerHTML = `
    <div class="part-details-head">
      <div>
        <span class="part-details-kicker">${escapeHtml(text().draftPrefix)} ${draftIndex + 1}</span>
        <strong>${escapeHtml(text().draftActions)}</strong>
      </div>
      <button class="name-panel-close" type="button" onclick="closeDraftActionsPanel()">${CROSS_CLOSE_SVG}</button>
    </div>
    <div class="draft-panel-actions">
      <button class="part-save-btn" type="button" onclick="requestPromoteDraftToChapter(${draftIndex}, this)">${escapeHtml(text().saveDraftAsChapter)}</button>
      <button class="part-delete-btn" type="button" ${canDeleteDraft ? `onclick="deleteDraftWithConfirm(${draftIndex})"` : 'disabled'}
        title="${escapeHtml(deleteTitle)}" aria-label="${escapeHtml(deleteTitle)}">${escapeHtml(text().deleteDraft)}</button>
    </div>`;

  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
}

function openTrashDraftActionsPanel(draftIndex, anchor = null) {
  chapterTrashDrafts = normalizeTrashDrafts(chapterTrashDrafts);
  const panel = document.getElementById('draftDetailsPanel');
  const draft = chapterTrashDrafts[draftIndex];
  if (!panel || !draft) return;

  closePartDetailsPanel();
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  activeDraftDetailsIndex = `trash:${draftIndex}`;
  activeFloatingAnchor = anchor;
  panel.classList.add('draft-actions-panel', 'trash-actions-panel');
  panel.innerHTML = `
    <div class="part-details-head">
      <div>
        <span class="part-details-kicker">${escapeHtml(text().trash)} ${draftIndex + 1}</span>
        <strong>${escapeHtml(text().trashActions)}</strong>
      </div>
      <button class="name-panel-close" type="button" onclick="closeDraftActionsPanel()">${CROSS_CLOSE_SVG}</button>
    </div>
    <div class="draft-panel-actions">
      <button class="part-save-btn trash-restore-action-btn" type="button" onclick="restoreTrashDraftsByIndexes([${draftIndex}])">${escapeHtml(text().restoreDraft)}</button>
      <button class="part-delete-btn" type="button" onclick="permanentlyDeleteTrashDraftsByIndexes([${draftIndex}])">${escapeHtml(text().permanentlyDeleteDraft)}</button>
    </div>`;

  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
}

function openDraftBulkDeletePanel(anchor = null) {
  chapterDrafts = normalizeDrafts(chapterDrafts);
  normalizeDraftSelection();
  const panel = document.getElementById('draftDetailsPanel');
  if (!panel || !chapterDrafts.length) return;

  const selectedCount = selectedDraftIndexes.size;
  const deleteAll = selectedCount === 0;
  const deleteIndexes = deleteAll
    ? chapterDrafts.map((_, index) => index)
    : Array.from(selectedDraftIndexes);
  if (!canDeleteDraftIndexes(deleteIndexes)) {
    showDraftDeleteBlockedReminder();
    return;
  }
  const deleteCount = deleteAll ? chapterDrafts.length : selectedCount;
  const copy = text();
  const title = deleteAll ? copy.deleteAllDraftsConfirmTitle : copy.deleteSelectedDraftsConfirmTitle;
  const body = deleteAll
    ? copy.deleteAllDraftsConfirmBody
    : copy.deleteSelectedDraftsConfirmBody.replace('{count}', deleteCount);

  closePartDetailsPanel();
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  activeDraftDetailsIndex = deleteAll ? 'all' : 'selected';
  activeFloatingAnchor = anchor;
  panel.classList.add('draft-actions-panel', 'draft-delete-confirm-panel');
  panel.innerHTML = `
    <div class="part-details-head draft-delete-confirm-head">
      <strong>${escapeHtml(title)}</strong>
      <div class="draft-delete-head-actions">
      <span class="draft-delete-count">${deleteCount} ${escapeHtml(copy.drafts)}</span>
        <button class="name-panel-close" type="button" onclick="closeDraftActionsPanel()">${CROSS_CLOSE_SVG}</button>
      </div>
    </div>
    <p class="draft-delete-confirm-copy">${escapeHtml(body)}</p>
    <div class="draft-panel-actions draft-delete-confirm-actions">
      <button class="panel-mini-btn" type="button" onclick="closeDraftActionsPanel()">${escapeHtml(copy.storyInfoCancel)}</button>
      <button class="part-delete-btn" type="button" onclick="deleteDraftBatchFromPanel(${deleteAll})">Delete</button>
    </div>`;

  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
}

function openChapterRecentToDraftPanel(scopeType = 'all', scopeIndex = -1, anchor = null) {
  ensureChapters();
  syncCurrentChapterContentFromEditor();
  normalizeChapterSelection();
  const panel = document.getElementById('draftDetailsPanel');
  const scopeIndexes = chapterIndexesForScope(scopeType, scopeIndex);
  if (scopeType === 'part' && !canConvertPartChaptersToDraft(scopeIndex)) return;
  if (!panel || !scopeIndexes.length) return;

  const scopeKey = chapterScopeKey(scopeType, scopeIndex);
  const selectedCount = selectedChapterScope === scopeKey ? selectedChapterIndexes.size : 0;
  const selectedIndexes = selectedCount
    ? Array.from(selectedChapterIndexes)
      .filter(index => Number.isInteger(index) && index >= 0 && index < chapters.length)
      .sort((left, right) => left - right)
    : [];
  const selectedWords = selectedIndexes.reduce((total, index) => total + chapterWordTotalForDeleteCheck(index), 0);
  const canDeleteSelectedEmptyChapters = selectedIndexes.length > 0 && selectedWords === 0;
  const defaultCount = selectedCount || 1;
  const shouldShowCountInput = selectedCount === 0;
  const copy = text();

  closePartDetailsPanel();
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  activeDraftDetailsIndex = `chapter-to-draft:${scopeKey}`;
  activeFloatingAnchor = anchor;
  panel.classList.add('draft-actions-panel', 'chapter-to-draft-panel');
  panel.innerHTML = `
    <div class="part-details-head draft-delete-confirm-head">
      <strong>${escapeHtml(copy.recentChaptersToDraft)}</strong>
      <button class="name-panel-close" type="button" onclick="closeDraftActionsPanel()">${CROSS_CLOSE_SVG}</button>
    </div>
    ${shouldShowCountInput ? `<p class="draft-delete-confirm-copy">${escapeHtml(copy.recentChaptersToDraftBody)}</p>` : ''}
    ${shouldShowCountInput ? `<label class="chapter-to-draft-count-field">
      <span class="chapter-to-draft-count-wrap">
        <span class="chapter-to-draft-count-control">
          <input id="chapterToDraftCountInp" type="number" min="1" max="${scopeIndexes.length}" value="${defaultCount}">
          <span class="chapter-to-draft-count-stepper" aria-label="${escapeHtml(copy.chapterConvertCountLabel)} controls">
            <button class="chapter-to-draft-count-step" type="button" onclick="adjustChapterToDraftCount(1)" aria-label="Increase recent chapters">${lmIcon('collapseChevron', 'step-chevron-svg lm-chevron-up')}</button>
            <button class="chapter-to-draft-count-step" type="button" onclick="adjustChapterToDraftCount(-1)" aria-label="Decrease recent chapters">${lmIcon('collapseChevron', 'step-chevron-svg lm-chevron-down')}</button>
          </span>
        </span>
        <small>${defaultCount}/${scopeIndexes.length} ${escapeHtml(copy.chapterConvertCountLabel)}</small>
      </span>
    </label>` : ''}
    <div class="draft-panel-actions draft-delete-confirm-actions">
      <button class="${canDeleteSelectedEmptyChapters ? 'part-delete-btn' : 'panel-mini-btn'}" type="button"
        onclick="${canDeleteSelectedEmptyChapters ? `deleteSelectedEmptyChaptersFromPanel('${scopeType}', ${scopeIndex})` : 'closeDraftActionsPanel()'}">
        ${escapeHtml(canDeleteSelectedEmptyChapters ? copy.confirmDeleteName : copy.storyInfoCancel)}
      </button>
      <button class="part-delete-btn" id="chapterToDraftConfirmBtn" type="button" onclick="convertRecentChaptersToDraftFromPanel('${scopeType}', ${scopeIndex})">${escapeHtml(copy.moveChapterToDraft)}</button>
    </div>`;

  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
  requestAnimationFrame(() => document.getElementById('chapterToDraftConfirmBtn')?.focus());
}

async function convertRecentChaptersToDraftFromPanel(scopeType = 'all', scopeIndex = -1) {
  const scopeKey = chapterScopeKey(scopeType, scopeIndex);
  if (selectedChapterScope === scopeKey && selectedChapterIndexes.size) {
    await moveChaptersToDraft(Array.from(selectedChapterIndexes));
    return;
  }

  const input = document.getElementById('chapterToDraftCountInp');
  const count = parseInt(input?.value || '1', 10) || 1;
  await moveRecentChaptersToDraft(scopeType, scopeIndex, count);
}

async function deleteSelectedEmptyChaptersFromPanel(scopeType = 'all', scopeIndex = -1) {
  const scopeKey = chapterScopeKey(scopeType, scopeIndex);
  if (selectedChapterScope !== scopeKey || !selectedChapterIndexes.size) return;
  await deleteEmptyChaptersByIndexes(Array.from(selectedChapterIndexes));
}

function adjustChapterToDraftCount(delta) {
  const input = document.getElementById('chapterToDraftCountInp');
  if (!input) return;
  const minCount = Number(input.min) || 1;
  const maxCount = Number(input.max) || Math.max(minCount, 1);
  const currentCount = Number(input.value) || minCount;
  input.value = clampNumber(currentCount + delta, minCount, maxCount);
  input.focus();
}

function openChapterDetailsPanel(chapterIndex, anchor = null) {
  ensureChapters();
  if (isEditingChapterTitle) commitChapterTitleEdit();
  syncCurrentChapterContentFromEditor();
  const panel = document.getElementById('chapterDetailsPanel');
  const chapter = chapters[chapterIndex];
  if (!panel || !chapter) return;

  closePartDetailsPanel();
  closeDraftActionsPanel();
  const copy = text();
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const hasParts = manifest.parts.length > 0;
  const partIndex = hasParts && Number.isInteger(chapter.partIndex) ? chapter.partIndex : 0;
  const part = hasParts ? normalizePart(manifest.parts[partIndex], partIndex) : null;
  const partLabel = part ? part.title || defaultPartTitle(partIndex) : copy.chapters;
  const stats = chapterDetailsStats(chapter);
  const canDelete = stats.words === 0;
  const canMoveToDraft = chapterIndex === chapters.length - 1;
  const chapterTitle = chapterDisplayTitle(chapter, chapterIndex);
  activeChapterDetailsIndex = chapterIndex;
  activeFloatingAnchor = anchor;

  panel.innerHTML = `
    <div class="part-details-head chapter-details-head">
      <div class="chapter-details-heading">
        <span class="part-details-kicker">${escapeHtml(copy.chapterStatus)} ${escapeHtml(chapterDisplayNumber(chapter, chapterIndex))}</span>
      </div>
      <div class="chapter-details-head-actions">
        <span class="chapter-created-stamp" title="${escapeHtml(copy.chapterCreated)}">${escapeHtml(chapterCreatedLabel(chapter.createdAt))}</span>
        <button class="name-panel-close" type="button" onclick="closeChapterDetailsPanel()">${CROSS_CLOSE_SVG}</button>
      </div>
    </div>
    <div class="chapter-title-summary" id="chapterTitleSummary">
      <span class="part-details-kicker">${escapeHtml(copy.chapterTitleLabel)}</span>
      <div class="chapter-title-display-row">
        <strong class="chapter-title-display">${escapeHtml(chapterTitle)}</strong>
        <button class="chapter-title-edit-btn" type="button" onclick="beginChapterDetailsTitleEdit(${chapterIndex})"
          title="${escapeHtml(copy.editChapterTitle)}" aria-label="${escapeHtml(copy.editChapterTitle)}">
          ${lmIcon("detailEdit")}
        </button>
      </div>
      <input class="chapter-title-editor" type="text" id="chapterDetailsTitleInp" hidden
        value="${escapeHtml(chapterTitle)}" data-original-value="${escapeHtml(chapterTitle)}"
        data-empty-label="${escapeHtml(`${text().newChapterPrefix} ${chapterIndex + 1}`)}"
        oninput="markChapterDetailsTitleEdited()" onblur="deactivateChapterDetailsTitleEdit()"
        onkeydown="handleChapterDetailsKey(event, ${chapterIndex})">
    </div>
    <div class="part-details-grid chapter-details-grid">
      <div class="part-detail-card"><span>${escapeHtml(copy.partStatus)}</span><strong>${escapeHtml(chapterStatusLabel(chapterIndex))}</strong></div>
      <div class="part-detail-card"><span>${escapeHtml(copy.words)}</span><strong>${stats.words}</strong></div>
      <div class="part-detail-card"><span>${escapeHtml(copy.characters)}</span><strong>${stats.characters}</strong></div>
      <div class="part-detail-card"><span>${escapeHtml(copy.chapterPartLabel)}</span><strong>${escapeHtml(partLabel)}</strong></div>
    </div>
    <div class="part-details-actions chapter-details-actions">
      ${canDelete ? `<button class="part-delete-btn" id="chapterDetailsDeleteBtn" type="button" onclick="deleteChapterIfEmpty(${chapterIndex})">${escapeHtml(copy.chapterDelete)}</button>` : ''}
      ${canMoveToDraft ? `<button class="part-delete-btn" id="chapterDetailsToDraftBtn" type="button" onclick="moveChapterToDraft(${chapterIndex})">${escapeHtml(copy.moveChapterToDraft)}</button>` : ''}
      <button class="part-save-btn chapter-info-save-btn" id="chapterDetailsSaveBtn" type="button" hidden
        onclick="saveChapterDetailsPanel(${chapterIndex})">${escapeHtml(copy.chapterInfoSave)}</button>
    </div>`;

  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
}

function beginChapterDetailsTitleEdit() {
  const titleWrap = document.getElementById('chapterTitleSummary');
  const titleInput = document.getElementById('chapterDetailsTitleInp');
  if (!titleWrap || !titleInput) return;

  titleWrap.classList.add('is-editing');
  titleInput.hidden = false;
  markChapterDetailsTitleEdited();
  requestAnimationFrame(() => {
    titleInput.focus();
    titleInput.select();
  });
}

function cancelChapterDetailsTitleEdit() {
  const titleWrap = document.getElementById('chapterTitleSummary');
  const titleInput = document.getElementById('chapterDetailsTitleInp');
  if (!titleWrap || !titleInput) return;

  titleInput.value = titleInput.dataset.originalValue || '';
  titleInput.hidden = true;
  titleWrap.classList.remove('is-editing');
  syncDetailSectionDisplay(titleWrap, titleInput);
  markChapterDetailsTitleEdited();
}

function deactivateChapterDetailsTitleEdit() {
  const titleWrap = document.getElementById('chapterTitleSummary');
  const titleInput = document.getElementById('chapterDetailsTitleInp');
  if (!titleWrap || !titleInput) return;

  titleInput.hidden = true;
  titleWrap.classList.remove('is-editing');
  syncDetailSectionDisplay(titleWrap, titleInput);
  markChapterDetailsTitleEdited();
}

function markChapterDetailsTitleEdited() {
  const titleWrap = document.getElementById('chapterTitleSummary');
  const titleInput = document.getElementById('chapterDetailsTitleInp');
  const saveButton = document.getElementById('chapterDetailsSaveBtn');
  const deleteButton = document.getElementById('chapterDetailsDeleteBtn');
  const moveToDraftButton = document.getElementById('chapterDetailsToDraftBtn');
  if (!titleWrap || !titleInput || !saveButton) return;

  const originalTitle = (titleInput.dataset.originalValue || '').trim();
  const nextTitle = titleInput.value.trim();
  const hasChanges = nextTitle !== originalTitle;
  saveButton.hidden = !hasChanges;
  if (deleteButton) deleteButton.hidden = hasChanges;
  if (moveToDraftButton) moveToDraftButton.hidden = hasChanges;
}

function handleChapterDetailsKey(event, chapterIndex) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    if (document.getElementById('chapterTitleSummary')?.classList.contains('is-editing')) {
      cancelChapterDetailsTitleEdit();
    } else {
      closeChapterDetailsPanel();
    }
  } else if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    if (!document.getElementById('chapterDetailsSaveBtn')?.hidden) saveChapterDetailsPanel(chapterIndex);
  }
}

async function saveChapterDetailsPanel(chapterIndex) {
  ensureChapters();
  const chapter = chapters[chapterIndex];
  if (!chapter) return;

  const titleInput = document.getElementById('chapterDetailsTitleInp');
  const saveButton = document.getElementById('chapterDetailsSaveBtn');
  if (saveButton?.disabled) return;
  const sidebarTarget = sidebarSaveTargetForChapter(chapterIndex);

  const cleanedTitle = titleInput?.value.trim() || `${text().newChapterPrefix} ${chapterIndex + 1}`;
  if (chapterTitleExists(cleanedTitle, chapterIndex)) {
    showDuplicateReminder(text().duplicateChapterTitle);
    return;
  }

  if (chapterIndex === curChap) {
    isEditingChapterTitle = false;
  }

  try {
    if (saveButton) {
      saveButton.hidden = false;
      saveButton.disabled = true;
      saveButton.textContent = text().saving;
      saveButton.setAttribute('aria-busy', 'true');
    }
    if (titleInput) titleInput.disabled = true;
    setSidebarSaveIndicator(sidebarTarget, 'busy');
    const result = await saveSavedChapterTitle(chapterIndex, cleanedTitle, { syncEditDraft: true });
    setSaveButtonSaved(isChapterEditDraftActive()
      ? getCleanEditorHTML() === (result?.editDraft?.lastAutosavedHTML || activeChapterEditDraft()?.lastAutosavedHTML || '')
      : true);
    setSidebarSaveIndicator(sidebarTarget, 'saved');
    closeChapterDetailsPanel();
  } catch (error) {
    console.warn('Chapter details save failed:', error);
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = text().chapterInfoSave;
      saveButton.removeAttribute('aria-busy');
    }
    if (titleInput) titleInput.disabled = false;
    setSidebarSaveIndicator(sidebarTarget, 'idle');
  }
}

function handlePartDetailsKey(event, partIndex) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    const hasOpenEdit = ['partTitleSummary', 'partSynopsisSummary']
      .some(sectionId => document.getElementById(sectionId)?.classList.contains('is-editing'));
    if (hasOpenEdit) {
      cancelPartDetailsEdits();
    } else {
      closePartDetailsPanel();
    }
  } else if (event.key === 'Enter' && !event.shiftKey && event.target.tagName !== 'TEXTAREA') {
    event.preventDefault();
    event.stopPropagation();
    if (!document.getElementById('partDetailsSaveBtn')?.hidden) savePartDetailsPanel(partIndex);
  }
}

async function savePartDetailsPanel(partIndex) {
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  if (!manifest.parts[partIndex]) return;
  const saveButton = document.getElementById('partDetailsSaveBtn');
  const titleInput = document.getElementById('partDetailsTitleInp');
  const synopsisInput = document.getElementById('partDetailsSynopsisInp');
  if (saveButton?.disabled) return;

  const existingPart = normalizePart(manifest.parts[partIndex], partIndex);
  const nextTitle = titleInput?.value.trim() || defaultPartTitle(partIndex);
  if (partTitleExists(nextTitle, partIndex)) {
    showDuplicateReminder(text().duplicatePartTitle);
    return;
  }

  manifest.parts[partIndex] = {
    ...existingPart,
    title: nextTitle,
    synopsis: synopsisInput?.value.trim() || '',
    createdAt: existingPart.createdAt || new Date().toISOString(),
    chapters: existingPart.chapters || []
  };

  projectManifest = manifest;
  persistProjectManifestSnapshot();
  saveToStorage(false);
  renderChapters();
  updateStorySummary();

  try {
    if (saveButton) {
      saveButton.hidden = false;
      saveButton.disabled = true;
      saveButton.textContent = text().saving;
      saveButton.setAttribute('aria-busy', 'true');
    }
    if (titleInput) titleInput.disabled = true;
    if (synopsisInput) synopsisInput.disabled = true;
    setSidebarSaveIndicator('parts', 'busy');
    if (projectDirectoryHandle) await writeProjectManifest();
    setSidebarSaveIndicator('parts', 'saved');
    closePartDetailsPanel();
  } catch (error) {
    console.warn('Part details save failed:', error);
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = text().partInfoSave;
      saveButton.removeAttribute('aria-busy');
    }
    if (titleInput) titleInput.disabled = false;
    if (synopsisInput) synopsisInput.disabled = false;
    setSidebarSaveIndicator('parts', 'idle');
  }
}

async function deleteChapterIfEmpty(chapterIndex) {
  ensureChapters();
  syncCurrentChapterContentFromEditor();
  const chapter = chapters[chapterIndex];
  if (!chapter || chapterWordTotalForDeleteCheck(chapterIndex) > 0) return;

  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const oldCurChap = curChap;
  const deletedPartIndex = chapter.partIndex || 0;
  const deletedPath = chapter.contentPath || '';
  chapters.splice(chapterIndex, 1);
  ensureChapterAfterDelete(manifest, deletedPartIndex);

  if (!chapters.length) curChap = 0;
  else if (oldCurChap === chapterIndex) curChap = Math.min(chapterIndex, chapters.length - 1);
  else if (oldCurChap > chapterIndex) curChap = oldCurChap - 1;
  else curChap = oldCurChap;

  reindexProjectStructure(manifest);
  curPart = chapters[curChap]?.partIndex ?? (manifest.parts.length ? 0 : -1);
  expandedPartIndex = manifest.parts.length ? curPart : -1;
  persistProjectManifestSnapshot();
  saveToStorage(false);
  closeChapterDetailsPanel();
  loadEditor();
  renderChapters();
  renderTags();
  renderNotes();
  updateStorySummary();
  updateChapterStatus();

  try {
    await removeProjectFileIfExists(deletedPath);
    if (projectDirectoryHandle) await writeProjectManifest();
    setSaveStatusDot('saved', text().chapterDeleted);
    showMiniReminder(text().chapterDeleted);
  } catch (error) {
    console.warn('Chapter delete failed:', error);
    setDefaultSaveStatus();
    showMiniReminder(text().storyCreateFailed);
  }
}

async function deleteEmptyChaptersByIndexes(chapterIndexes = []) {
  ensureChapters();
  const uniqueIndexes = Array.from(new Set(chapterIndexes))
    .filter(index => Number.isInteger(index) && index >= 0 && index < chapters.length)
    .sort((left, right) => left - right);
  if (!uniqueIndexes.length) return;

  if (uniqueIndexes.includes(curChap) && isEditingChapterTitle) {
    const titleCommitted = await commitChapterTitleEdit();
    if (!titleCommitted) return;
  }

  syncCurrentChapterContentFromEditor();
  const hasWords = uniqueIndexes.some(index => chapterWordTotalForDeleteCheck(index) > 0);
  if (hasWords) return;

  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const wasDraftActive = isDraftActive();
  const currentChapterRef = chapters[curChap];
  const oldCurDraft = curDraft;
  const deletedSet = new Set(uniqueIndexes);
  const activeChapterDeleted = !wasDraftActive && deletedSet.has(curChap);
  const firstDeletedChapter = chapters[uniqueIndexes[0]];
  const preferredPartIndex = Number.isInteger(firstDeletedChapter?.partIndex) ? firstDeletedChapter.partIndex : 0;
  const deletedPaths = uniqueIndexes
    .map(index => chapters[index]?.contentPath)
    .filter(Boolean);
  const editDraftPaths = uniqueIndexes
    .map(index => {
      const editDraftKey = chapterEditDraftKey(index);
      const editDraftPath = chapterEditDrafts[editDraftKey]?.contentPath || '';
      delete chapterEditDrafts[editDraftKey];
      return editDraftPath;
    })
    .filter(Boolean);

  chapters = chapters.filter((_, index) => !deletedSet.has(index));
  ensureChapterAfterDelete(manifest, preferredPartIndex);
  selectedChapterIndexes.clear();
  selectedChapterScope = null;
  isChapterEditUnlocked = false;
  activeChapterEditKey = null;

  if (wasDraftActive) {
    activeEditorMode = 'draft';
    curDraft = Math.min(oldCurDraft, Math.max(0, chapterDrafts.length - 1));
  } else if (activeChapterDeleted) {
    activeEditorMode = 'chapter';
    curChap = chapters.length ? Math.min(uniqueIndexes[0], chapters.length - 1) : 0;
  } else {
    activeEditorMode = 'chapter';
    const currentStillIndex = chapters.indexOf(currentChapterRef);
    curChap = chapters.length ? (currentStillIndex >= 0 ? currentStillIndex : Math.min(curChap, chapters.length - 1)) : 0;
  }

  const activePartIndex = chapters[curChap]?.partIndex;
  const hasActivePart = manifest.parts.length &&
    Number.isInteger(activePartIndex) &&
    activePartIndex >= 0 &&
    activePartIndex < manifest.parts.length;
  curPart = hasActivePart ? activePartIndex : -1;
  expandedPartIndex = hasActivePart ? curPart : -1;
  isRawChapterSectionExpanded = !hasActivePart && chapters.length > 0;
  isPartsListCollapsedByRaw = !hasActivePart && chapters.length > 0;
  isPartsListForceExpanded = hasActivePart;

  reindexProjectStructure(manifest);
  persistProjectManifestSnapshot();
  saveToStorage(false);
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  loadEditor();
  renderChapters();
  renderTags();
  renderNotes();
  updateStorySummary();
  updateChapterStatus();
  focusSidebarItemAfterRender(wasDraftActive ? 'draft' : hasActivePart ? 'chapter' : 'raw');

  try {
    if (projectDirectoryHandle) {
      await Promise.all([...deletedPaths, ...editDraftPaths].map(removeProjectFileIfExists));
      await writeProjectManifest();
      await writeChapterEditDraftsToProject();
    }
    const message = uniqueIndexes.length === 1 ? text().chapterDeleted : (text().chaptersDeleted || text().chapterDeleted);
    setSaveStatusDot('saved', message);
    showMiniReminder(message);
  } catch (error) {
    console.warn('Empty chapters delete failed:', error);
    setDefaultSaveStatus();
    showMiniReminder(text().storyCreateFailed);
  }
}

async function moveChapterToDraft(chapterIndex) {
  ensureChapters();
  if (chapterIndex !== chapters.length - 1) return;
  if (isEditingChapterTitle && chapterIndex === curChap) {
    const titleCommitted = await commitChapterTitleEdit();
    if (!titleCommitted) return;
  }

  syncCurrentChapterContentFromEditor();
  const chapter = chapters[chapterIndex];
  if (!chapter) return;

  showAppLoader(text().movingChapterToDraft);
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const oldChapterPath = chapter.contentPath || '';
  const editDraftKey = chapterEditDraftKey(chapterIndex);
  const editDraft = chapterEditDrafts[editDraftKey]
    ? normalizeChapterEditDraft(chapterEditDrafts[editDraftKey], editDraftKey)
    : null;
  const shouldUseActiveEditDraft = chapterIndex === curChap && isChapterEditDraftActive();
  const shouldUseStoredEditDraft = Boolean(
    editDraft &&
    !shouldUseActiveEditDraft &&
    !isChapterEditDraftSameAsChapter(editDraft, chapterIndex)
  );
  const draftIndex = chapterDrafts.length;
  const draftPath = nextDraftFilePath();
  const draftContent = shouldUseActiveEditDraft
    ? getCleanEditorHTML()
    : shouldUseStoredEditDraft
      ? editDraft.content || ''
      : chapter.content || '';
  const draftText = shouldUseActiveEditDraft
    ? getCleanEditorText()
    : editorHTMLToText(draftContent);
  const draftTitle = (shouldUseActiveEditDraft || shouldUseStoredEditDraft) && editDraft?.title
    ? editDraft.title
    : chapterDisplayTitle(chapter, chapterIndex);
  const newDraft = normalizeDraft({
    ...createDefaultDraft(draftIndex),
    id: Date.now(),
    title: draftTitle,
    content: draftContent,
    notes: chapter.notes || [],
    contentPath: draftPath,
    createdAt: chapter.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    alignment: chapter.alignment,
    lineHeight: chapter.lineHeight,
    paragraphGap: chapter.paragraphGap,
    paragraphMargin: chapter.paragraphMargin,
    fontFamily: chapter.fontFamily,
    fontSize: chapter.fontSize,
    _wordCount: countWordsFromText(draftText)
  }, draftIndex);
  const editDraftPath = editDraft?.contentPath || '';

  chapters.splice(chapterIndex, 1);
  chapterDrafts.push(newDraft);
  chapterDrafts = normalizeDrafts(chapterDrafts);
  delete chapterEditDrafts[editDraftKey];
  selectedDraftIndexes.clear();
  lastSelectedDraftIndex = null;
  activeEditorMode = 'draft';
  isChapterEditUnlocked = false;
  activeChapterEditKey = null;
  curDraft = chapterDrafts.length - 1;
  curChap = chapters.length ? Math.min(chapterIndex, chapters.length - 1) : 0;
  curPart = -1;
  expandedPartIndex = -1;
  isRawChapterSectionExpanded = false;
  isPartsListCollapsedByRaw = false;
  isPartsListForceExpanded = false;
  reindexProjectStructure(manifest);
  persistProjectManifestSnapshot();
  saveToStorage(false);
  closeChapterDetailsPanel();
  setDraftBoxSaveIndicator('busy');
  loadEditor();
  renderChapters();
  renderTags();
  renderNotes();
  updateStorySummary();
  updateChapterStatus();
  focusSidebarItemAfterRender('draft');

  try {
    if (projectDirectoryHandle) {
      await writeDraftToLocalFile(curDraft, draftText);
      await removeProjectFileIfExists(oldChapterPath);
      if (editDraftPath) await removeProjectFileIfExists(editDraftPath);
      await writeProjectManifest();
      await writeDraftsDataToProject();
      await writeChapterEditDraftsToProject();
    }
    setDraftBoxSaveIndicator('saved');
  } catch (error) {
    console.warn('Chapter move to draft failed:', error);
    setDraftBoxSaveIndicator('idle');
    setDefaultSaveStatus();
  } finally {
    hideAppLoader();
  }
}

function chapterToDraftPayload(chapterIndex, draftIndex, timestamp = new Date().toISOString(), draftPath = nextDraftFilePath()) {
  const chapter = chapters[chapterIndex];
  if (!chapter) return null;

  const editDraftKey = chapterEditDraftKey(chapterIndex);
  const editDraft = chapterEditDrafts[editDraftKey]
    ? normalizeChapterEditDraft(chapterEditDrafts[editDraftKey], editDraftKey)
    : null;
  const shouldUseActiveEditDraft = chapterIndex === curChap && isChapterEditDraftActive();
  const shouldUseStoredEditDraft = Boolean(
    editDraft &&
    !shouldUseActiveEditDraft &&
    !isChapterEditDraftSameAsChapter(editDraft, chapterIndex)
  );
  const draftContent = shouldUseActiveEditDraft
    ? getCleanEditorHTML()
    : shouldUseStoredEditDraft
      ? editDraft.content || ''
      : chapter.content || '';
  const draftText = shouldUseActiveEditDraft
    ? getCleanEditorText()
    : editorHTMLToText(draftContent);
  const draftTitle = (shouldUseActiveEditDraft || shouldUseStoredEditDraft) && editDraft?.title
    ? editDraft.title
    : chapterDisplayTitle(chapter, chapterIndex);
  const draft = normalizeDraft({
    ...createDefaultDraft(draftIndex),
    id: Date.now() + draftIndex,
    title: draftTitle,
    content: draftContent,
    notes: chapter.notes || [],
    contentPath: draftPath,
    createdAt: chapter.createdAt || timestamp,
    updatedAt: timestamp,
    alignment: chapter.alignment,
    lineHeight: chapter.lineHeight,
    paragraphGap: chapter.paragraphGap,
    paragraphMargin: chapter.paragraphMargin,
    fontFamily: chapter.fontFamily,
    fontSize: chapter.fontSize,
    _wordCount: countWordsFromText(draftText)
  }, draftIndex);

  return {
    chapter,
    chapterIndex,
    draft,
    draftText,
    oldChapterPath: chapter.contentPath || '',
    editDraftKey,
    editDraftPath: editDraft?.contentPath || ''
  };
}

async function moveChaptersToDraft(chapterIndexes = []) {
  ensureChapters();
  const uniqueIndexes = Array.from(new Set(chapterIndexes))
    .filter(index => Number.isInteger(index) && index >= 0 && index < chapters.length)
    .sort((left, right) => left - right);
  if (!uniqueIndexes.length) return;

  if (uniqueIndexes.includes(curChap) && isEditingChapterTitle) {
    const titleCommitted = await commitChapterTitleEdit();
    if (!titleCommitted) return;
  }

  syncCurrentChapterContentFromEditor();
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const wasDraftActive = isDraftActive();
  const currentChapterRef = chapters[curChap];
  const oldCurDraft = curDraft;
  const originalDraftCount = chapterDrafts.length;
  const convertedSet = new Set(uniqueIndexes);
  const activeChapterConverted = !wasDraftActive && convertedSet.has(curChap);
  const timestamp = new Date().toISOString();

  showAppLoader(uniqueIndexes.length > 1 ? text().movingChaptersToDraft : text().movingChapterToDraft);
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
  const payloads = uniqueIndexes.map((chapterIndex, offset) => (
    chapterToDraftPayload(
      chapterIndex,
      originalDraftCount + offset,
      timestamp,
      reserveDraftPath(originalDraftCount + offset)
    )
  )).filter(Boolean);
  if (!payloads.length) {
    hideAppLoader();
    return;
  }

  chapters = chapters.filter((_, index) => !convertedSet.has(index));
  payloads.forEach(payload => {
    chapterDrafts.push(payload.draft);
    delete chapterEditDrafts[payload.editDraftKey];
  });
  chapterDrafts = normalizeDrafts(chapterDrafts);
  selectedDraftIndexes.clear();
  lastSelectedDraftIndex = null;
  selectedChapterIndexes.clear();
  selectedChapterScope = null;
  isChapterEditUnlocked = false;
  activeChapterEditKey = null;

  if (activeChapterConverted) {
    activeEditorMode = 'draft';
    curDraft = originalDraftCount + payloads.findIndex(payload => payload.chapterIndex === curChap);
    curChap = chapters.length ? Math.min(curChap, chapters.length - 1) : 0;
    curPart = -1;
    expandedPartIndex = -1;
    isRawChapterSectionExpanded = false;
    isPartsListCollapsedByRaw = false;
    isPartsListForceExpanded = false;
  } else if (wasDraftActive) {
    activeEditorMode = 'draft';
    curDraft = Math.min(oldCurDraft, chapterDrafts.length - 1);
  } else {
    const currentStillIndex = chapters.indexOf(currentChapterRef);
    curChap = chapters.length ? (currentStillIndex >= 0 ? currentStillIndex : Math.min(curChap, chapters.length - 1)) : 0;
    const activePartIndex = chapters[curChap]?.partIndex;
    const hasActivePart = manifest.parts.length &&
      Number.isInteger(activePartIndex) &&
      activePartIndex >= 0 &&
      activePartIndex < manifest.parts.length;
    curPart = hasActivePart ? activePartIndex : -1;
    expandedPartIndex = hasActivePart ? curPart : -1;
    isRawChapterSectionExpanded = !hasActivePart;
    isPartsListCollapsedByRaw = !hasActivePart;
    isPartsListForceExpanded = hasActivePart;
  }

  reindexProjectStructure(manifest);
  persistProjectManifestSnapshot();
  saveToStorage(false);
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  setDraftBoxSaveIndicator('busy');
  loadEditor();
  renderChapters();
  renderTags();
  renderNotes();
  updateStorySummary();
  updateChapterStatus();
  focusSidebarItemAfterRender(activeChapterConverted || wasDraftActive ? 'draft' : 'chapter');

  try {
    if (projectDirectoryHandle) {
      await Promise.all(payloads.map(async payload => {
        const draftHandle = await getProjectFileHandle(payload.draft.contentPath, { create: true });
        payload.draft.contentHandle = draftHandle;
        await writeFileText(draftHandle, payload.draftText);
      }));
      await Promise.all(payloads.flatMap(payload => [
        payload.oldChapterPath,
        payload.editDraftPath
      ].filter(Boolean).map(removeProjectFileIfExists)));
      await writeProjectManifest();
      await writeDraftsDataToProject();
      await writeChapterEditDraftsToProject();
    }
    setDraftBoxSaveIndicator('saved');
  } catch (error) {
    console.warn('Chapters move to draft failed:', error);
    setDraftBoxSaveIndicator('idle');
    setDefaultSaveStatus();
  } finally {
    hideAppLoader();
  }
}

async function moveRecentChaptersToDraft(scopeType = 'all', scopeIndex = -1, count = 1) {
  const indexes = recentChapterIndexesForScope(scopeType, scopeIndex, count);
  await moveChaptersToDraft(indexes);
}

function focusSidebarItemAfterRender(target = 'chapter') {
  requestAnimationFrame(() => {
    const selector = target === 'draft'
      ? '#draftBox .draft-item.active'
      : target === 'raw'
        ? '#rawChapterSection .chap-item.active'
        : '#chapter-list .chap-item.active, #chapter-list .is-active-part .part-header';
    document.querySelector(selector)?.scrollIntoView({ block: 'nearest' });
  });
}

function syncSidebarAfterPartKeepDelete(wasDraftActive = false, activeChapterMovedToRaw = false) {
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  if (wasDraftActive) {
    return 'draft';
  }

  const activePartIndex = chapters[curChap]?.partIndex;
  const activeChapterHasPart = manifest.parts.length &&
    Number.isInteger(activePartIndex) &&
    activePartIndex >= 0 &&
    activePartIndex < manifest.parts.length;

  if (activeChapterMovedToRaw || !activeChapterHasPart) {
    curPart = -1;
    expandedPartIndex = -1;
    isRawChapterSectionExpanded = true;
    isPartsListCollapsedByRaw = true;
    isPartsListForceExpanded = false;
    return 'raw';
  }

  curPart = activePartIndex;
  expandedPartIndex = curPart;
  isRawChapterSectionExpanded = false;
  isPartsListCollapsedByRaw = false;
  isPartsListForceExpanded = true;
  if (chapterListOverflowMode === 'collapsed') chapterListOverflowMode = 'expanded';
  return 'part';
}

async function deletePartIfEmpty(partIndex) {
  ensureChapters();
  syncCurrentChapterContentFromEditor();
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  if (!manifest.parts[partIndex] || partWordTotal(partIndex) > 0) return;

  const oldCurChap = curChap;
  const currentChapterRef = chapters[curChap];
  const wasDraftActive = isDraftActive();
  const previousSidebarState = wasDraftActive ? {
    curPart,
    expandedPartIndex,
    isRawChapterSectionExpanded,
    isPartsListCollapsedByRaw,
    isPartsListForceExpanded,
    chapterListOverflowMode
  } : null;
  const deletedPaths = chapters
    .filter(chapter => chapter.partIndex === partIndex)
    .map(chapter => chapter.contentPath)
    .filter(Boolean);

  chapters = chapters.filter(chapter => chapter.partIndex !== partIndex);
  chapters.forEach(chapter => {
    if (chapter.partIndex > partIndex) chapter.partIndex -= 1;
  });

  manifest.parts.splice(partIndex, 1);
  ensureChapterAfterDelete(manifest, Math.max(0, Math.min(partIndex, manifest.parts.length - 1)));

  const currentStillIndex = chapters.indexOf(currentChapterRef);
  curChap = chapters.length
    ? currentStillIndex >= 0 ? currentStillIndex : Math.min(oldCurChap, chapters.length - 1)
    : 0;
  reindexProjectStructure(manifest);
  if (wasDraftActive && previousSidebarState) {
    const shiftPartIndexAfterDelete = value => {
      if (!Number.isInteger(value) || value < 0) return value;
      if (value === partIndex) return -1;
      return value > partIndex ? value - 1 : value;
    };
    curPart = shiftPartIndexAfterDelete(previousSidebarState.curPart);
    expandedPartIndex = shiftPartIndexAfterDelete(previousSidebarState.expandedPartIndex);
    isRawChapterSectionExpanded = previousSidebarState.isRawChapterSectionExpanded;
    isPartsListCollapsedByRaw = previousSidebarState.isPartsListCollapsedByRaw;
    isPartsListForceExpanded = previousSidebarState.isPartsListForceExpanded;
    chapterListOverflowMode = previousSidebarState.chapterListOverflowMode;
  } else {
    curPart = chapters[curChap]?.partIndex ?? (manifest.parts.length ? 0 : -1);
    expandedPartIndex = manifest.parts.length ? curPart : -1;
  }
  persistProjectManifestSnapshot();
  saveToStorage(false);
  closePartDetailsPanel();
  loadEditor();
  renderChapters();
  renderTags();
  renderNotes();
  updateStorySummary();
  updateChapterStatus();

  try {
    await Promise.all(deletedPaths.map(removeProjectFileIfExists));
    if (projectDirectoryHandle) await writeProjectManifest();
    setSaveStatusDot('saved', text().partDeleted);
  } catch (error) {
    console.warn('Part delete failed:', error);
    setDefaultSaveStatus();
  }
}

async function deletePartKeepingChapters(partIndex) {
  ensureChapters();
  syncCurrentChapterContentFromEditor();
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  if (!manifest.parts[partIndex] || partIndex !== manifest.parts.length - 1) return;

  const oldCurChap = curChap;
  const currentChapterRef = chapters[curChap];
  const wasDraftActive = isDraftActive();
  const previousSidebarState = wasDraftActive ? {
    curPart,
    expandedPartIndex,
    isRawChapterSectionExpanded,
    isPartsListCollapsedByRaw,
    isPartsListForceExpanded,
    chapterListOverflowMode
  } : null;
  const activeChapterMovedToRaw = !wasDraftActive && currentChapterRef?.partIndex === partIndex;
  let movedChapterCount = 0;
  chapters.forEach(chapter => {
    if (chapter.partIndex === partIndex) {
      chapter.partIndex = -1;
      movedChapterCount += 1;
    } else if (chapter.partIndex > partIndex) {
      chapter.partIndex -= 1;
    }
  });
  if (!movedChapterCount) return;

  manifest.parts.splice(partIndex, 1);
  const currentStillIndex = chapters.indexOf(currentChapterRef);
  curChap = chapters.length
    ? currentStillIndex >= 0 ? currentStillIndex : Math.min(oldCurChap, chapters.length - 1)
    : 0;
  reindexProjectStructure(manifest);
  let sidebarFocusTarget = 'draft';
  if (wasDraftActive && previousSidebarState) {
    curPart = previousSidebarState.curPart === partIndex ? -1 : previousSidebarState.curPart;
    expandedPartIndex = previousSidebarState.expandedPartIndex === partIndex ? -1 : previousSidebarState.expandedPartIndex;
    isRawChapterSectionExpanded = previousSidebarState.isRawChapterSectionExpanded;
    isPartsListCollapsedByRaw = previousSidebarState.isPartsListCollapsedByRaw;
    isPartsListForceExpanded = previousSidebarState.isPartsListForceExpanded;
    chapterListOverflowMode = previousSidebarState.chapterListOverflowMode;
  } else {
    sidebarFocusTarget = syncSidebarAfterPartKeepDelete(wasDraftActive, activeChapterMovedToRaw);
  }
  persistProjectManifestSnapshot();
  saveToStorage(false);
  closePartDetailsPanel();
  loadEditor();
  renderChapters();
  renderTags();
  renderNotes();
  updateStorySummary();
  updateChapterStatus();
  focusSidebarItemAfterRender(sidebarFocusTarget);

  try {
    if (projectDirectoryHandle) await writeProjectManifest();
    setSaveStatusDot('saved', text().partDeletedKeepChapters);
  } catch (error) {
    console.warn('Part delete without chapter delete failed:', error);
    setDefaultSaveStatus();
  }
}

function togglePartExpansion(partIndex) {
  const willExpand = expandedPartIndex !== partIndex;
  expandedPartIndex = willExpand ? partIndex : -1;
  if (willExpand) {
    isRawChapterSectionExpanded = false;
    isPartsListCollapsedByRaw = false;
    isPartsListForceExpanded = true;
    if (chapterListOverflowMode === 'collapsed') chapterListOverflowMode = 'expanded';
  }
  renderChapters();
}

function updateChapterPanelBottomActions() {
  const trashButton = document.getElementById('trashToggleBtn');
  const addPartButton = document.getElementById('addPartBtn');

  if (trashButton) {
    const trashCount = chapterTrashDrafts.length;
    const shouldShowTrash = hasActiveStory() && !isDraftTrashMode && trashCount > 0;
    trashButton.hidden = !shouldShowTrash;
    trashButton.innerHTML = `
      ${TRASH_MODE_SVG}
      <span class="trash-toggle-count-badge" aria-hidden="true">${escapeHtml(String(trashCount))}</span>`;
    trashButton.title = text().trashDrafts;
    trashButton.setAttribute('aria-label', `${text().trashDrafts}: ${trashCount}`);
  }

  if (addPartButton) {
    addPartButton.hidden = !hasActiveStory();
    addPartButton.textContent = isDraftTrashMode ? text().workspace : text().addPart;
    addPartButton.title = isDraftTrashMode ? text().workspace : text().addPart;
    addPartButton.setAttribute('aria-label', isDraftTrashMode ? text().workspace : text().addPart);
    addPartButton.onclick = isDraftTrashMode ? () => setDraftTrashMode(false) : addPart;
  }
}

function openTrashBulkActionPanel(action = 'restore', anchor = null) {
  chapterTrashDrafts = normalizeTrashDrafts(chapterTrashDrafts);
  normalizeTrashDraftSelection();
  const panel = document.getElementById('draftDetailsPanel');
  const batchIndexes = trashDraftBatchIndexes();
  if (!panel || !batchIndexes.length) return;

  const copy = text();
  const isRestore = action === 'restore';
  const actionLabel = isRestore ? copy.restoreDrafts : copy.permanentlyDeleteDrafts;
  const buttonLabel = isRestore ? copy.restoreDraft : copy.permanentlyDeleteDraft;
  const clickHandler = isRestore ? 'restoreTrashDraftBatchFromPanel()' : 'permanentlyDeleteTrashDraftBatchFromPanel()';
  const actionClass = isRestore ? 'part-save-btn trash-restore-action-btn' : 'part-delete-btn';

  closePartDetailsPanel();
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  activeDraftDetailsIndex = `trash-bulk:${action}`;
  activeFloatingAnchor = anchor;
  panel.classList.add('draft-actions-panel', 'trash-actions-panel', 'trash-bulk-actions-panel');
  panel.innerHTML = `
    <div class="part-details-head">
      <div>
        <span class="part-details-kicker">${escapeHtml(copy.trash)} ${batchIndexes.length}</span>
        <strong>${escapeHtml(actionLabel)}</strong>
      </div>
      <button class="name-panel-close" type="button" onclick="closeDraftActionsPanel()">${CROSS_CLOSE_SVG}</button>
    </div>
    <div class="draft-panel-actions">
      <button class="panel-mini-btn" type="button" onclick="closeDraftActionsPanel()">${escapeHtml(copy.storyInfoCancel)}</button>
      <button class="${actionClass}" type="button" onclick="${clickHandler}">${escapeHtml(buttonLabel)}</button>
    </div>`;

  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
}

function restoreEditorAfterTrashMode() {
  const returnState = trashReturnEditorState;
  if (returnState?.mode === 'draft' && chapterDrafts[returnState.curDraft]) {
    activeEditorMode = 'draft';
    curDraft = returnState.curDraft;
  } else if (returnState?.mode === 'chapter' && chapters[returnState.curChap]) {
    activeEditorMode = 'chapter';
    curChap = returnState.curChap;
  } else if (chapterDrafts.length) {
    activeEditorMode = 'draft';
    curDraft = Math.min(Math.max(curDraft, 0), chapterDrafts.length - 1);
  } else {
    activeEditorMode = 'chapter';
    curChap = chapters.length ? Math.min(Math.max(curChap, 0), chapters.length - 1) : 0;
  }
  curTrashDraft = chapterTrashDrafts.length ? Math.min(Math.max(curTrashDraft, 0), chapterTrashDrafts.length - 1) : -1;
  trashReturnEditorState = null;
}

function setDraftTrashMode(enabled = true) {
  if (enabled && !chapterTrashDrafts.length) {
    isDraftTrashMode = false;
    showMiniReminder(text().trashEmpty);
  } else {
    isDraftTrashMode = Boolean(enabled);
  }
  if (isDraftTrashMode) {
    trashReturnEditorState = activeEditorMode === 'trash'
      ? trashReturnEditorState
      : { mode: activeEditorMode, curChap, curDraft };
    activeEditorMode = 'trash';
    curTrashDraft = chapterTrashDrafts.length - 1;
    isChapterEditUnlocked = false;
    activeChapterEditKey = null;
    isEditingChapterTitle = false;
    if (isFocus && typeof toggleFocus === 'function') toggleFocus();
  } else if (activeEditorMode === 'trash') {
    restoreEditorAfterTrashMode();
  }
  closeDraftActionsPanel();
  closePartDetailsPanel();
  closeChapterDetailsPanel();
  clearSidebarSelections(false);
  if (!isDraftTrashMode) clearTrashDraftSelection(false);
  renderChapters();
  loadEditor();
  updateChapterStatus();
}

function renderDrafts() {
  const draftBox = document.getElementById('draftBox');
  if (!draftBox) return;
  draftBox.classList.remove('trash-draft-box');
  if (!hasActiveStory()) {
    selectedDraftIndexes.clear();
    lastSelectedDraftIndex = null;
    draftBox.hidden = true;
    draftBox.innerHTML = '';
    updateSidebarScrollThumb('draft', false);
    return;
  }

  chapterDrafts = normalizeDrafts(chapterDrafts);
  normalizeDraftSelection();
  if (!chapterDrafts.length) {
    selectedDraftIndexes.clear();
    lastSelectedDraftIndex = null;
    setDraftBoxSaveIndicator.state = 'idle';
    clearTimeout(setDraftBoxSaveIndicator.timer);
    draftBox.innerHTML = '';
    draftBox.hidden = true;
    updateSidebarScrollThumb('draft', false);
    return;
  }

  draftBox.hidden = false;
  const selectedDraftCount = selectedDraftIndexes.size;
  const draftCountLabel = selectedDraftCount ? `${selectedDraftCount}/${chapterDrafts.length}` : chapterDrafts.length;
  const deleteDraftsLabel = selectedDraftCount ? text().deleteSelectedDrafts : text().deleteAllDrafts;
  const draftDeleteIndexes = selectedDraftCount
    ? Array.from(selectedDraftIndexes)
    : chapterDrafts.map((_, index) => index);
  const canDeleteDraftBatch = canDeleteDraftIndexes(draftDeleteIndexes);
  const draftDeleteTitle = canDeleteDraftBatch ? deleteDraftsLabel : text().draftDeleteLastDocumentBlocked;
  draftBox.innerHTML = `
    <div class="draft-box-title ${selectedDraftCount ? 'has-draft-selection' : ''}" id="draftBoxTitle">
      <span class="draft-title-label"><span class="draft-save-dot" aria-hidden="true"></span>${escapeHtml(text().drafts)}</span>
      <span class="draft-title-actions">
        <button class="draft-title-delete-btn draft-title-promote-btn" type="button" ${selectedDraftCount ? '' : 'disabled'}
          onclick="event.stopPropagation(); requestPromoteSelectedDrafts(this)"
          title="${escapeHtml(text().promoteSelectedDrafts)}" aria-label="${escapeHtml(text().promoteSelectedDrafts)}">
          ${DRAFT_PROMOTE_SVG}
        </button>
        <button class="draft-title-delete-btn" type="button" ${canDeleteDraftBatch ? '' : 'disabled'}
          onclick="event.stopPropagation(); openDraftBulkDeletePanel(this)"
          title="${escapeHtml(draftDeleteTitle)}" aria-label="${escapeHtml(draftDeleteTitle)}">
          ${DRAFT_DELETE_SVG}
        </button>
        <span class="draft-count-pill ${selectedDraftCount ? 'is-selecting' : ''}">${escapeHtml(String(draftCountLabel))}</span>
      </span>
    </div>
    ${chapterDrafts.map((draft, index) => `
      <div class="chap-item draft-item ${isDraftActive() && index === curDraft ? 'active' : ''} ${selectedDraftIndexes.has(index) ? 'is-selected' : ''}"
        data-editor-document="draft" data-editor-document-index="${index}"
        onclick="handleDraftItemClick(event, ${index})" aria-selected="${selectedDraftIndexes.has(index)}">
        <div class="chap-title-row">
            <span class="chap-file-icon draft-icon">D${index + 1}</span>
            <div class="chap-item-main">
              <span class="chap-title">${escapeHtml(draft.title || `${text().draftPrefix} ${index + 1}`)}</span>
              <span class="cn">${chapterWordTotal(draft, index)} ${escapeHtml(text().words)}</span>
            </div>
          </div>
        <button class="chapter-menu-btn" type="button" onclick="event.stopPropagation(); openDraftActionsPanel(${index}, this)"
          title="${escapeHtml(text().draftActions)}" aria-label="${escapeHtml(text().draftActions)}">
          ${lmIcon("kebab")}
        </button>
      </div>`).join('')}`;
  applyDraftBoxSaveIndicatorState();
  syncSidebarScrollThumbs();
}

