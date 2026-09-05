function projectDetailsRenderFactControlBar(factModels = []) {
  const filters = projectDetailsFactListFilter || {};
  const activePanel = projectDetailsFactControlPanel || '';
  const isPinnedOpen = activePanel === 'pinned';
  const isSortOpen = activePanel === 'sort';
  const sortLabels = {
    time: 'Time',
    'chapter-index': 'Chapter Index',
    'edited-chapters': 'Edited Chapters'
  };
  const sortLabel = sortLabels[filters.sortBy || 'time'] || 'Time';
  const sortDirection = projectDetailsNormalizeFactSortDirection(filters.sortDirection, filters.sortBy || 'time');
  const sortDirectionLabel = sortDirection === 'asc' ? 'Ascending' : 'Descending';
  const sortDirectionNextLabel = sortDirection === 'asc' ? 'descending' : 'ascending';
  const sortDirectionIconClass = sortDirection === 'asc'
    ? 'project-details-name-sort-direction-svg is-ascending'
    : 'project-details-name-sort-direction-svg';
  const sortDirectionIcon = typeof window.lmIcon === 'function'
    ? window.lmIcon('sortDirectionBars', sortDirectionIconClass)
    : '';
  const pinnedModels = factModels.filter(model => model.fact?.pinned);
  const pinIcon = typeof window.lmIcon === 'function'
    ? window.lmIcon('factPin', 'project-details-fact-control-svg')
    : '';
  const sortOptionButton = (value, label) => `
    <button class="project-details-name-filter-option ${String(filters.sortBy || 'time') === value ? 'is-active' : ''}" type="button"
      data-project-details-fact-sort-option="${projectDetailsEscapeHtml(value)}"
      aria-pressed="${String(filters.sortBy || 'time') === value ? 'true' : 'false'}">
      <span>${projectDetailsEscapeHtml(label)}</span>
    </button>
  `;
  const pinnedListHtml = pinnedModels.length
    ? pinnedModels.map(model => `
        <button class="project-details-fact-pinned-item ${model.key === projectDetailsSelectedFactId ? 'is-active' : ''}" type="button"
          data-project-details-fact-pinned-select="${projectDetailsEscapeHtml(model.key)}"
          aria-pressed="${model.key === projectDetailsSelectedFactId ? 'true' : 'false'}">
          <span>${projectDetailsEscapeHtml(model.fact?.keyword || 'Fact')}</span>
          <strong>${projectDetailsEscapeHtml(model.editedChapterCount || 0)}</strong>
        </button>
      `).join('')
    : '<div class="project-details-empty-row">No pinned facts yet.</div>';

  return `
    <div class="project-details-fact-control-bar" role="region" aria-label="Fact list controls">
      <button class="project-details-fact-control-btn is-pinned ${isPinnedOpen ? 'is-active' : ''}" type="button"
        data-project-details-fact-control-panel="pinned"
        aria-expanded="${isPinnedOpen ? 'true' : 'false'}"
        aria-controls="projectDetailsFactPinnedPanel">
        ${pinIcon}
        <span>Pinned</span>
        <strong>${projectDetailsEscapeHtml(pinnedModels.length)}</strong>
      </button>
      <button class="project-details-fact-control-btn is-sort ${isSortOpen ? 'is-active' : ''}" type="button"
        data-project-details-fact-control-panel="sort"
        aria-expanded="${isSortOpen ? 'true' : 'false'}"
        aria-controls="projectDetailsFactSortPanel">
        <span>Sort</span>
        <strong>${projectDetailsEscapeHtml(sortLabel)}</strong>
      </button>
      <div id="projectDetailsFactPinnedPanel" class="project-details-fact-control-panel is-pinned" ${isPinnedOpen ? '' : 'hidden'}>
        <div class="project-details-name-panel-head">
          <span>Pinned Facts</span>
          <strong>${projectDetailsEscapeHtml(pinnedModels.length)}</strong>
        </div>
        <div class="project-details-fact-pinned-list">
          ${pinnedListHtml}
        </div>
      </div>
      <div id="projectDetailsFactSortPanel" class="project-details-fact-control-panel is-sort" ${isSortOpen ? '' : 'hidden'}>
        <div class="project-details-name-panel-head">
          <span>Sort Facts</span>
          <strong>${projectDetailsEscapeHtml(sortLabel)} / ${projectDetailsEscapeHtml(sortDirectionLabel)}</strong>
        </div>
        <div class="project-details-name-filter-option-group" aria-label="Sort facts">
          <div class="project-details-name-filter-group-head">
            <span>Sort</span>
            <button class="project-details-name-sort-direction-btn" type="button"
              data-project-details-fact-sort-direction="${projectDetailsEscapeHtml(sortDirection)}"
              aria-label="Switch to ${projectDetailsEscapeHtml(sortDirectionNextLabel)} sort"
              title="Switch to ${projectDetailsEscapeHtml(sortDirectionNextLabel)} sort">
              ${sortDirectionIcon || `<span>${sortDirection === 'asc' ? 'Asc' : 'Desc'}</span>`}
            </button>
          </div>
          <div class="project-details-name-filter-option-list">
            ${sortOptionButton('time', 'Time')}
            ${sortOptionButton('chapter-index', 'Chapter Index')}
            ${sortOptionButton('edited-chapters', 'Edited Chapter Descriptions')}
          </div>
        </div>
        <div class="project-details-name-panel-actions">
          <button class="project-details-name-filter-reset" type="button" data-project-details-fact-sort-reset>Reset Sort</button>
          <button class="project-details-name-filter-close" type="button" data-project-details-fact-control-close>Close</button>
        </div>
      </div>
    </div>
  `;
}

function projectDetailsApplyFactSort(sortBy = 'time', options = {}) {
  const allowedSorts = new Set(['time', 'chapter-index', 'edited-chapters']);
  const nextSortBy = allowedSorts.has(sortBy) ? sortBy : 'time';
  const previousSortBy = projectDetailsFactListFilter?.sortBy || 'time';
  const previousDirection = projectDetailsNormalizeFactSortDirection(projectDetailsFactListFilter?.sortDirection, previousSortBy);
  const nextDirection = options.resetDirection || nextSortBy !== previousSortBy
    ? projectDetailsDefaultFactSortDirection(nextSortBy)
    : previousDirection;
  projectDetailsFactListFilter = {
    ...projectDetailsFactListFilter,
    sortBy: nextSortBy,
    sortDirection: nextDirection
  };
  projectDetailsFactControlPanel = 'sort';
  projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
}

function projectDetailsToggleFactSortDirection() {
  const sortBy = projectDetailsFactListFilter?.sortBy || 'time';
  const currentDirection = projectDetailsNormalizeFactSortDirection(projectDetailsFactListFilter?.sortDirection, sortBy);
  projectDetailsFactListFilter = {
    ...projectDetailsFactListFilter,
    sortDirection: currentDirection === 'asc' ? 'desc' : 'asc'
  };
  projectDetailsFactControlPanel = 'sort';
  projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
}

function projectDetailsCloseFactControlPanel() {
  if (!projectDetailsFactControlPanel) return false;
  projectDetailsFactControlPanel = '';
  projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
  return true;
}

function projectDetailsFactIndexByKey(factKey = '') {
  return (storyFacts || []).findIndex((fact, index) =>
    projectDetailsDetailKey('fact', fact, index) === factKey
  );
}

async function projectDetailsPersistFactPins() {
  const manifest = projectDetailsEditManifest();
  if (!manifest) return;
  localStorage.setItem(FACTS_STORAGE_KEY, JSON.stringify(storyFacts || []));
  await projectDetailsPersistEditedManifest({
    ...manifest,
    facts: storyFacts || []
  });
}

async function projectDetailsPersistFacts() {
  const manifest = projectDetailsEditManifest();
  localStorage.setItem(FACTS_STORAGE_KEY, JSON.stringify(storyFacts || []));
  if (!manifest) return;
  await projectDetailsPersistEditedManifest({
    ...manifest,
    facts: storyFacts || []
  });
}

function projectDetailsToggleFactPin(factKey = '') {
  const factIndex = projectDetailsFactIndexByKey(factKey);
  if (factIndex < 0) return;
  storyFacts = (storyFacts || []).map((fact, index) =>
    index === factIndex ? { ...fact, pinned: !fact.pinned } : fact
  );
  const manifest = projectDetailsEditManifest();
  if (manifest) {
    projectManifest = normalizeProjectManifest({
      ...manifest,
      facts: storyFacts
    });
    if (projectDetailsCurrentState) projectDetailsCurrentState.manifest = projectManifest;
    localStorage.setItem(PROJECT_MANIFEST_KEY, JSON.stringify(projectManifest));
    localStorage.setItem(FACTS_STORAGE_KEY, JSON.stringify(storyFacts));
  }
  projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
  projectDetailsPersistFactPins().catch(error => {
    console.warn('Project details fact pin save failed:', error);
  });
}

function projectDetailsPersistFactTitle(factId = '', nextKeyword = '') {
  const keyword = String(nextKeyword || '').trim();
  const fact = (storyFacts || []).find(item => item.id === factId);
  if (!fact) return false;
  if (!keyword) {
    projectDetailsNotify('Fact keyword cannot be empty.');
    return false;
  }
  if (projectDetailsValueKey(keyword) === projectDetailsValueKey(fact.keyword)) {
    projectDetailsClearTitleEditState();
    projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
    return true;
  }
  const hasDuplicate = (storyFacts || []).some(item =>
    item.id !== factId && projectDetailsValueKey(item.keyword) === projectDetailsValueKey(keyword)
  );
  if (hasDuplicate) {
    projectDetailsNotify('This fact already exists.', true);
    return false;
  }

  const updatedAt = new Date().toISOString();
  storyFacts = (storyFacts || []).map(item =>
    item.id === factId ? { ...item, keyword, updatedAt } : item
  );
  const manifest = projectDetailsEditManifest();
  if (manifest) {
    projectManifest = normalizeProjectManifest({
      ...manifest,
      facts: storyFacts
    });
    if (projectDetailsCurrentState) projectDetailsCurrentState.manifest = projectManifest;
    localStorage.setItem(PROJECT_MANIFEST_KEY, JSON.stringify(projectManifest));
  }
  localStorage.setItem(FACTS_STORAGE_KEY, JSON.stringify(storyFacts));
  projectDetailsClearTitleEditState();
  projectDetailsRerenderAfterNamingEdit();
  projectDetailsNotify('Fact updated.');
  projectDetailsPersistFacts().catch(error => {
    console.warn('Project details fact title save failed:', error);
  });
  return true;
}

function projectDetailsRenderFactDetail(model = null) {
  if (!model?.fact) {
    return `
      <article class="project-details-name-detail-panel is-empty">
        <strong>No fact selected</strong>
        <p>Select a fact from the list to inspect its attachment and document appearances.</p>
      </article>
    `;
  }

  const fact = model.fact;
  const description = projectDetailsEntityDescription(fact.description, 'No description saved for this fact.');
  const toneClass = projectDetailsFactEditToneClass(model.editedChapterCount);
  const isEditingTitle = projectDetailsEditingFactTitleId === fact.id;
  const editIcon = typeof window.lmIcon === 'function'
    ? window.lmIcon('edit', 'project-details-name-title-action-svg')
    : '';
  return `
    <article class="project-details-name-detail-panel is-fact ${projectDetailsEscapeHtml(toneClass)}">
      <div class="project-details-name-detail-title">
        ${projectDetailsRenderNameDetailIcon('fact', toneClass)}
        <div class="project-details-name-detail-title-copy ${isEditingTitle ? 'is-editing' : ''}">
          ${isEditingTitle
            ? `<input class="project-details-name-title-input" type="text"
                data-project-details-title-edit-input
                data-project-details-fact-title-input="${projectDetailsEscapeHtml(fact.id)}"
                value="${projectDetailsEscapeHtml(fact.keyword)}"
                aria-label="Edit fact keyword">`
            : `<h4>${projectDetailsEscapeHtml(fact.keyword)}</h4>`}
          <span>Fact</span>
        </div>
        <div class="project-details-name-detail-actions">
          <small class="${projectDetailsEscapeHtml(toneClass)}">${projectDetailsEscapeHtml(projectDetailsMentionLabel(model.totalMentions))}</small>
          <div class="project-details-name-title-action-row">
            ${isEditingTitle
              ? `<button class="project-details-name-title-save" type="button"
                  data-project-details-fact-title-save="${projectDetailsEscapeHtml(fact.id)}">Save</button>
                <button class="project-details-name-title-cancel" type="button"
                  data-project-details-title-edit-cancel>Cancel</button>`
              : `<button class="project-details-name-edit-btn" type="button"
                  data-project-details-fact-title-edit="${projectDetailsEscapeHtml(fact.id)}"
                  aria-label="Edit ${projectDetailsEscapeHtml(fact.keyword)}">
                  ${editIcon}<span>Edit</span>
                </button>`}
          </div>
        </div>
      </div>
      <div class="project-details-mini-grid is-name-detail">
        <div class="project-details-mini-stat"><span>Attached To</span><strong>${projectDetailsEscapeHtml(model.attachedLabel)}</strong></div>
        <div class="project-details-mini-stat"><span>Pinned</span><strong>${fact.pinned ? 'Yes' : 'No'}</strong></div>
        <div class="project-details-mini-stat"><span>Created</span><strong>${projectDetailsEscapeHtml(projectDetailsDateLabel(fact.createdAt))}</strong></div>
        <div class="project-details-mini-stat"><span>Updated</span><strong>${projectDetailsEscapeHtml(projectDetailsDateLabel(fact.updatedAt))}</strong></div>
      </div>
      <section class="project-details-name-detail-block is-fact ${projectDetailsEscapeHtml(toneClass)}">
        <span>Description</span>
        <p>${projectDetailsEscapeHtml(description)}</p>
      </section>
      <section class="project-details-name-detail-block is-fact ${projectDetailsEscapeHtml(toneClass)}">
        <span>Appearances</span>
        ${projectDetailsRenderNameAppearances(model.rows)}
      </section>
    </article>
  `;
}

function projectDetailsRenderNoteModeButton(mode, label, count) {
  const isActive = projectDetailsNotesMode === mode;
  return `
    <button class="project-details-document-mode-btn ${isActive ? 'is-active' : ''}" type="button"
      data-project-details-note-mode="${projectDetailsEscapeHtml(mode)}"
      aria-pressed="${isActive ? 'true' : 'false'}">
      <span>${projectDetailsEscapeHtml(label)}</span>
      <strong>${projectDetailsEscapeHtml(count)}</strong>
    </button>
  `;
}

function projectDetailsRenderNotes(documents = []) {
  const grid = document.getElementById('projectDetailsNoteGrid');
  if (!grid) return;

  const nameModels = projectDetailsNameViewModels(documents);
  const factModels = projectDetailsSortedFactModels(projectDetailsFactViewModels(documents));
  const filteredNameModels = projectDetailsFilteredNameModels(nameModels);
  const chapterCount = documents.filter(documentItem => documentItem?.type === 'chapter').length;
  projectDetailsNotesMode = projectDetailsNotesMode === 'facts' ? 'facts' : 'names';

  if (projectDetailsNotesMode === 'facts') {
    projectDetailsNameControlPanel = '';
    if (!factModels.some(model => model.key === projectDetailsSelectedFactId)) {
      projectDetailsSelectedFactId = factModels[0]?.key || '';
    }
  } else {
    projectDetailsFactControlPanel = '';
    if (!filteredNameModels.some(model => model.entry.id === projectDetailsSelectedNameId)) {
      projectDetailsSelectedNameId = filteredNameModels[0]?.entry.id || '';
    }
  }

  const listHtml = projectDetailsNotesMode === 'facts'
    ? `${projectDetailsRenderFactControlBar(factModels)}
      ${factModels.length
        ? factModels.map(model =>
            projectDetailsRenderFactListItem(model, model.key === projectDetailsSelectedFactId)
          ).join('')
        : '<div class="project-details-empty-row">No facts are saved in this project yet.</div>'}`
    : `${projectDetailsRenderNameFilterBar(nameModels, filteredNameModels.length, chapterCount)}
      ${filteredNameModels.length
        ? filteredNameModels.map((model, index) =>
            projectDetailsRenderNameListItem(model, model.entry.id === projectDetailsSelectedNameId, index)
          ).join('')
        : '<div class="project-details-empty-row">No names match these filters.</div>'}`;

  const selectedFact = factModels.find(model => model.key === projectDetailsSelectedFactId) || factModels[0] || null;
  const selectedName = filteredNameModels.find(model => model.entry.id === projectDetailsSelectedNameId) || filteredNameModels[0] || null;

  grid.innerHTML = `
    <aside class="project-details-name-sidebar" aria-label="Project notes">
      <div class="project-details-document-mode-switch" role="group" aria-label="Note type">
        ${projectDetailsRenderNoteModeButton('names', 'Names', nameModels.length)}
        ${projectDetailsRenderNoteModeButton('facts', 'Facts', factModels.length)}
      </div>
      <div class="project-details-name-picker-list">
        ${listHtml}
      </div>
    </aside>
    ${projectDetailsNotesMode === 'facts'
      ? projectDetailsRenderFactDetail(selectedFact)
      : projectDetailsRenderNameDetail(selectedName, documents)}
  `;
  if (typeof hydrateLmIcons === 'function') hydrateLmIcons(grid);
  if (typeof initCustomSelects === 'function') initCustomSelects(grid);
  if (typeof syncCustomSelects === 'function') syncCustomSelects(grid);
  else if (typeof queueCustomSelectSync === 'function') queueCustomSelectSync(grid);
  projectDetailsFocusTitleEditor(grid);
  projectDetailsSyncNameControlPanelPosition();
  projectDetailsSyncCustomScrollThumbs(grid);
}

function projectDetailsDiffStats(previousValue = '', nextValue = '') {
  const previous = String(previousValue || '');
  const next = String(nextValue || '');
  let prefix = 0;
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix += 1;

  let previousSuffix = previous.length - 1;
  let nextSuffix = next.length - 1;
  while (
    previousSuffix >= prefix &&
    nextSuffix >= prefix &&
    previous[previousSuffix] === next[nextSuffix]
  ) {
    previousSuffix -= 1;
    nextSuffix -= 1;
  }

  return {
    added: Math.max(0, nextSuffix - prefix + 1),
    removed: Math.max(0, previousSuffix - prefix + 1)
  };
}

function projectDetailsNameChanges() {
  const changes = [];
  (namingData.entries || []).forEach(entry => {
    const history = Array.isArray(entry.descriptionHistory) ? entry.descriptionHistory : [];
    if (history.length) {
      let previousDescription = '';
      history.forEach(historyItem => {
        if (typeof historyItem.previousDescription === 'string') {
          previousDescription = historyItem.previousDescription;
        }
        const diff = projectDetailsDiffStats(previousDescription, historyItem.description);
        changes.push({
          kind: 'Name',
          title: entry.name,
          target: projectDetailsMetaLabel(historyItem.chapterMeta),
          time: historyItem.editedAt,
          added: diff.added,
          removed: diff.removed
        });
        previousDescription = historyItem.description;
      });
      return;
    }

    if (entry.description) {
      changes.push({
        kind: 'Name',
        title: entry.name,
        target: projectDetailsMetaLabel(entry.descriptionMeta || entry),
        time: entry.createdAt,
        added: String(entry.description || '').length,
        removed: 0
      });
    }
  });
  return changes;
}

function projectDetailsFactChanges(documents = []) {
  return (storyFacts || []).flatMap(fact => {
    const target = projectDetailsFactAttachedLabel(fact, documents);
    const changes = [{
      kind: 'Fact',
      title: fact.keyword,
      target,
      time: fact.createdAt,
      added: String(fact.description || '').length,
      removed: 0
    }];
    if (fact.updatedAt && fact.updatedAt !== fact.createdAt) {
      changes.push({
        kind: 'Fact',
        title: fact.keyword,
        target,
        time: fact.updatedAt,
        added: String(fact.description || '').length,
        removed: 0
      });
    }
    return changes;
  });
}

function projectDetailsBuildChanges(documents = []) {
  return [...projectDetailsNameChanges(), ...projectDetailsFactChanges(documents)]
    .sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime());
}

function projectDetailsGraphDocuments(documents = []) {
  const safeFilter = ['all', 'chapter', 'draft'].includes(projectDetailsGraphDocumentFilter)
    ? projectDetailsGraphDocumentFilter
    : 'all';
  return documents
    .filter(documentItem => safeFilter === 'all' || documentItem.type === safeFilter)
    .sort((left, right) => {
      if (safeFilter === 'all' && left.type !== right.type) return left.type === 'chapter' ? -1 : 1;
      return (left.index ?? 0) - (right.index ?? 0);
    });
}

function projectDetailsGraphDocumentFilterButton(filterName = 'all', label = '', count = 0) {
  const isActive = projectDetailsGraphDocumentFilter === filterName;
  return `
    <button class="project-details-document-mode-btn ${isActive ? 'is-active' : ''}" type="button"
      data-project-details-graph-document-filter="${projectDetailsEscapeHtml(filterName)}"
      aria-pressed="${isActive ? 'true' : 'false'}">
      <span>${projectDetailsEscapeHtml(label)}</span>
      <strong>${projectDetailsEscapeHtml(count)}</strong>
    </button>
  `;
}

function projectDetailsGraphDocumentListItem(documentItem = {}, isActive = false) {
  const stats = projectDetailsDocumentStats(documentItem);
  const indexLabel = String(documentItem.no || documentItem.index + 1).padStart(2, '0');
  const typeLabel = projectDetailsDocumentTypeLabel(documentItem);
  const wordCount = projectDetailsWordCount(documentItem.text).toLocaleString('en-IN');
  return `
    <button class="project-details-document-list-item ${isActive ? 'is-active' : ''}" type="button"
      data-project-details-graph-document-id="${projectDetailsEscapeHtml(documentItem.id)}"
      aria-pressed="${isActive ? 'true' : 'false'}">
      <span class="project-details-document-list-index">${projectDetailsEscapeHtml(indexLabel)}</span>
      <span class="project-details-document-list-text">
        <b>${projectDetailsEscapeHtml(documentItem.title)}</b>
        <small>${projectDetailsEscapeHtml(typeLabel)} - ${projectDetailsEscapeHtml(wordCount)} words</small>
      </span>
      <strong class="project-details-document-list-name-counts" aria-label="Names ${projectDetailsEscapeHtml(stats.attachedNames.length + stats.detectedNames.length)}, facts ${projectDetailsEscapeHtml(stats.attachedFacts.length + stats.detectedFacts.length)}">
        <span class="is-saved"><b>${projectDetailsEscapeHtml(stats.attachedNames.length + stats.detectedNames.length)}</b></span>
        <span class="is-attached"><b>${projectDetailsEscapeHtml(stats.attachedFacts.length + stats.detectedFacts.length)}</b></span>
      </strong>
    </button>
  `;
}

function projectDetailsGraphDocumentPanel(documents = [], selectedDocument = null) {
  const chapterCount = documents.filter(documentItem => documentItem.type === 'chapter').length;
  const draftCount = documents.filter(documentItem => documentItem.type === 'draft').length;
  const visibleDocuments = projectDetailsGraphDocuments(documents);
  return `
    <aside class="project-details-document-sidebar project-details-graph-side is-documents" aria-label="Graph documents">
      <div class="project-details-graph-side-head">
        <span>Documents</span>
        <strong>${projectDetailsEscapeHtml(documents.length)}</strong>
      </div>
      <div class="project-details-document-mode-switch is-graph" role="group" aria-label="Graph document filter">
        ${projectDetailsGraphDocumentFilterButton('all', 'All', documents.length)}
        ${projectDetailsGraphDocumentFilterButton('chapter', 'Chapters', chapterCount)}
        ${projectDetailsGraphDocumentFilterButton('draft', 'Drafts', draftCount)}
      </div>
      <div class="project-details-document-picker-list">
        ${visibleDocuments.length
          ? visibleDocuments.map(documentItem =>
              projectDetailsGraphDocumentListItem(documentItem, selectedDocument?.id === documentItem.id)
            ).join('')
          : '<div class="project-details-empty-row">No documents found for this filter.</div>'}
      </div>
    </aside>
  `;
}

function projectDetailsGraphNameModels(documents = []) {
  return projectDetailsNameViewModels(documents)
    .sort((left, right) =>
      Number(right.totalMentions || 0) - Number(left.totalMentions || 0) ||
      String(left.entry?.name || '').localeCompare(String(right.entry?.name || ''))
    );
}

function projectDetailsGraphFactModels(documents = []) {
  return projectDetailsSortedFactModels(projectDetailsFactViewModels(documents));
}

function projectDetailsGraphEntityKey(kind = 'name', key = '') {
  return `${kind}:${key}`;
}

function projectDetailsGraphEntityKind(key = '') {
  return String(key || '').startsWith('fact:') ? 'fact' : 'name';
}

function projectDetailsGraphEntityRawKey(key = '') {
  return String(key || '').replace(/^(name|fact):/, '');
}

function projectDetailsGraphEntityModeButton(mode = 'names', label = '', count = 0) {
  const isActive = projectDetailsGraphEntityMode === mode;
  return `
    <button class="project-details-document-mode-btn ${isActive ? 'is-active' : ''}" type="button"
      data-project-details-graph-entity-mode="${projectDetailsEscapeHtml(mode)}"
      aria-pressed="${isActive ? 'true' : 'false'}">
      <span>${projectDetailsEscapeHtml(label)}</span>
      <strong>${projectDetailsEscapeHtml(count)}</strong>
    </button>
  `;
}

function projectDetailsGraphEntityButton(model = {}, kind = 'name', isActive = false, index = 0) {
  const isFact = kind === 'fact';
  const key = isFact
    ? projectDetailsGraphEntityKey('fact', model.key)
    : projectDetailsGraphEntityKey('name', model.entry?.id || '');
  const title = isFact ? model.fact?.keyword || 'Fact' : model.entry?.name || 'Name';
  const subtitle = isFact ? model.attachedLabel || 'Fact' : model.category?.title || 'Naming';
  const count = isFact ? model.editedChapterCount : model.totalMentions;
  const avatar = isFact
    ? projectDetailsRenderFactListAvatar(model.editToneClass)
    : `<span class="project-details-name-list-avatar ${projectDetailsEscapeHtml(projectDetailsNameMentionClass(model.totalMentions))}" aria-hidden="true">${projectDetailsEscapeHtml(index + 1)}</span>`;
  return `
    <button class="project-details-name-list-item project-details-graph-entity-item ${isFact ? `is-fact ${projectDetailsEscapeHtml(model.editToneClass)}` : projectDetailsEscapeHtml(projectDetailsNameMentionClass(model.totalMentions))} ${isActive ? 'is-active' : ''}" type="button"
      data-project-details-graph-entity-key="${projectDetailsEscapeHtml(key)}"
      aria-pressed="${isActive ? 'true' : 'false'}">
      ${avatar}
      <span class="project-details-name-list-copy">
        <b>${projectDetailsEscapeHtml(title)}</b>
        <small>${projectDetailsEscapeHtml(subtitle)}</small>
      </span>
      <strong>${projectDetailsEscapeHtml(count || 0)}</strong>
    </button>
  `;
}

function projectDetailsGraphEntityPanel(documents = []) {
  const nameModels = projectDetailsGraphNameModels(documents);
  const factModels = projectDetailsGraphFactModels(documents);
  const activeModels = projectDetailsGraphEntityMode === 'facts' ? factModels : nameModels;
  return `
    <aside class="project-details-name-sidebar project-details-graph-side is-entities" aria-label="Graph names and facts">
      <div class="project-details-graph-side-head">
        <span>Names & Facts</span>
        <strong>${projectDetailsEscapeHtml(projectDetailsGraphSelectedEntityKeys.length)} selected</strong>
      </div>
      <div class="project-details-document-mode-switch is-graph" role="group" aria-label="Graph entity type">
        ${projectDetailsGraphEntityModeButton('names', 'Names', nameModels.length)}
        ${projectDetailsGraphEntityModeButton('facts', 'Facts', factModels.length)}
      </div>
      <div class="project-details-name-picker-list">
        ${activeModels.length
          ? activeModels.map((model, index) => {
              const key = projectDetailsGraphEntityMode === 'facts'
                ? projectDetailsGraphEntityKey('fact', model.key)
                : projectDetailsGraphEntityKey('name', model.entry?.id || '');
              return projectDetailsGraphEntityButton(
                model,
                projectDetailsGraphEntityMode === 'facts' ? 'fact' : 'name',
                projectDetailsGraphSelectedEntityKeys.includes(key),
                index
              );
            }).join('')
          : `<div class="project-details-empty-row">No ${projectDetailsGraphEntityMode === 'facts' ? 'facts' : 'names'} saved yet.</div>`}
      </div>
    </aside>
  `;
}

function projectDetailsGraphDocumentNameBars(documentItem = null) {
  if (!documentItem) return [];
  const stats = projectDetailsDocumentStats(documentItem);
  const nameMap = new Map();
  [...(stats.attachedNames || []), ...(stats.detectedNames || [])].forEach(entry => {
    if (!entry?.id) return;
    const count = projectDetailsCountDocumentTerm(documentItem, entry.name);
    if (count <= 0) return;
    nameMap.set(entry.id, {
      entry,
      count: (nameMap.get(entry.id)?.count || 0) + count,
      isAttached: projectDetailsNameDocumentMatches(entry, documentItem)
    });
  });
  return [...nameMap.values()]
    .sort((left, right) => right.count - left.count || String(left.entry.name || '').localeCompare(String(right.entry.name || '')));
}

function projectDetailsGraphHorizontalBars(items = [], options = {}) {
  const maxCount = Math.max(1, ...items.map(item => Number(item.count || 0)));
  if (!items.length) {
    return `<div class="project-details-graph-empty">${projectDetailsEscapeHtml(options.emptyText || 'No graph data available.')}</div>`;
  }
  return `
    <div class="project-details-graph-bars">
      ${items.map((item, index) => {
        const width = Math.max(4, Math.round((Number(item.count || 0) / maxCount) * 100));
        return `
          <div class="project-details-graph-bar-row" style="--graph-bar-width: ${projectDetailsEscapeHtml(width)}%; --graph-bar-index: ${projectDetailsEscapeHtml(index)};">
            <span>${projectDetailsEscapeHtml(item.label)}</span>
            <div class="project-details-graph-bar-track"><i></i></div>
            <strong>${projectDetailsEscapeHtml(item.count)}</strong>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function projectDetailsGraphNameInfoList(items = [], documentItem = null) {
  const categoryById = projectDetailsCategoryMap();
  if (!items.length || !documentItem) {
    return '<div class="project-details-empty-row">No names found in this document.</div>';
  }
  return `
    <div class="project-details-graph-info-list">
      ${items.slice(0, 12).map(item =>
        projectDetailsNameInfoRecord(item.entry, documentItem, categoryById, {
          isDetected: !item.isAttached,
          mentionCount: item.count
        })
      ).join('')}
    </div>
  `;
}

function projectDetailsGraphChapterDocuments(documents = []) {
  return documents
    .filter(documentItem => documentItem.type === 'chapter')
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
}

function projectDetailsGraphSelectedEntityModels(documents = []) {
  const nameModels = projectDetailsGraphNameModels(documents);
  const factModels = projectDetailsGraphFactModels(documents);
  return projectDetailsGraphSelectedEntityKeys
    .map(key => {
      const kind = projectDetailsGraphEntityKind(key);
      const rawKey = projectDetailsGraphEntityRawKey(key);
      const model = kind === 'fact'
        ? factModels.find(item => item.key === rawKey)
        : nameModels.find(item => item.entry?.id === rawKey);
      return model ? { key, kind, model } : null;
    })
    .filter(Boolean);
}

function projectDetailsGraphChapterRowsForEntity(entity = {}, chapterDocuments = []) {
  const term = entity.kind === 'fact'
    ? entity.model?.fact?.keyword || ''
    : entity.model?.entry?.name || '';
  return chapterDocuments.map(documentItem => ({
    documentItem,
    count: projectDetailsCountDocumentTerm(documentItem, term)
  }));
}

function projectDetailsGraphLineSvg(rows = [], toneIndex = 0) {
  const width = 520;
  const height = 150;
  const paddingX = 24;
  const paddingY = 22;
  const maxCount = Math.max(1, ...rows.map(row => Number(row.count || 0)));
  const xStep = rows.length > 1 ? (width - paddingX * 2) / (rows.length - 1) : 0;
  const points = rows.map((row, index) => {
    const x = rows.length > 1 ? paddingX + xStep * index : width / 2;
    const y = height - paddingY - (Number(row.count || 0) / maxCount) * (height - paddingY * 2);
    return { x, y, count: row.count, label: row.documentItem.title };
  });
  const pointString = points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  return `
    <svg class="project-details-graph-line-svg is-tone-${projectDetailsEscapeHtml(toneIndex % 5)}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Chapter occurrence line">
      <path class="project-details-graph-grid-line" d="M${paddingX} ${height - paddingY}H${width - paddingX}"></path>
      <polyline class="project-details-graph-polyline" points="${projectDetailsEscapeHtml(pointString)}"></polyline>
      ${points.map(point => `
        <circle class="project-details-graph-point" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4">
          <title>${projectDetailsEscapeHtml(point.label)}: ${projectDetailsEscapeHtml(point.count)} mentions</title>
        </circle>
      `).join('')}
    </svg>
  `;
}

function projectDetailsGraphChapterMetaMatches(meta = {}, documentItem = {}) {
  if (!meta || !documentItem || documentItem.type !== 'chapter') return false;
  const metaPath = projectDetailsNormalizePath(meta.chapterKey || meta.contentPath || '');
  if (metaPath && projectDetailsDocumentPaths(documentItem).has(metaPath)) return true;
  if (Number.isInteger(meta.chapterIndex) && meta.chapterIndex === documentItem.index) return true;
  if (meta.chapterNo && Number(meta.chapterNo) === Number(documentItem.no)) return true;
  return Boolean(meta.chapterTitle && projectDetailsNormalizeTitle(meta.chapterTitle) === projectDetailsNormalizeTitle(documentItem.title));
}

function projectDetailsGraphNameEditCountForChapter(entry = {}, documentItem = {}) {
  let count = 0;
  (Array.isArray(entry.descriptionHistory) ? entry.descriptionHistory : []).forEach(historyItem => {
    const meta = historyItem?.chapterMeta || historyItem?.meta || historyItem?.descriptionMeta || historyItem;
    if (projectDetailsGraphChapterMetaMatches(meta, documentItem)) count += 1;
  });
  if (!count && entry.description && projectDetailsGraphChapterMetaMatches(entry.descriptionMeta || entry, documentItem)) count += 1;
  return count;
}

function projectDetailsGraphFactEditCountForChapter(fact = {}, documentItem = {}) {
  let count = 0;
  (Array.isArray(fact.descriptionHistory) ? fact.descriptionHistory : []).forEach(historyItem => {
    const meta = historyItem?.chapterMeta || historyItem?.meta || historyItem?.descriptionMeta || historyItem;
    if (projectDetailsGraphChapterMetaMatches(meta, documentItem)) count += 1;
  });
  if (!count && fact.description && projectDetailsGraphChapterMetaMatches(fact.descriptionMeta || fact, documentItem)) count += 1;
  if (!count && fact.updatedAt && fact.createdAt && fact.updatedAt !== fact.createdAt && projectDetailsFactDocumentMatches(fact, documentItem)) count += 1;
  return count;
}

function projectDetailsGraphEditCountsByChapter(selectedEntities = [], chapterDocuments = []) {
  return chapterDocuments.map(documentItem => ({
    documentItem,
    count: selectedEntities.reduce((sum, entity) => {
      if (entity.kind === 'fact') return sum + projectDetailsGraphFactEditCountForChapter(entity.model.fact, documentItem);
      return sum + projectDetailsGraphNameEditCountForChapter(entity.model.entry, documentItem);
    }, 0)
  }));
}

function projectDetailsGraphEntityChart(documents = []) {
  const chapterDocuments = projectDetailsGraphChapterDocuments(documents);
  const selectedEntities = projectDetailsGraphSelectedEntityModels(documents);
  if (!selectedEntities.length) return '';
  const editRows = projectDetailsGraphEditCountsByChapter(selectedEntities, chapterDocuments);
  const editBars = editRows.map(row => ({
    label: row.documentItem.title,
    count: row.count
  })).filter(row => row.count > 0);
  return `
    <section class="project-details-graph-card is-entity-focus">
      <div class="project-details-graph-card-head">
        <div>
          <span>Selected Entity Graph</span>
          <h3>Chapter-wise appearances</h3>
        </div>
        <strong>${projectDetailsEscapeHtml(selectedEntities.length)} selected</strong>
      </div>
      <div class="project-details-graph-selected-chips">
        ${selectedEntities.map(entity => `
          <span class="${entity.kind === 'fact' ? 'is-fact' : 'is-name'}">${projectDetailsEscapeHtml(entity.kind === 'fact' ? entity.model.fact.keyword : entity.model.entry.name)}</span>
        `).join('')}
      </div>
      <div class="project-details-graph-line-stack">
        ${selectedEntities.map((entity, index) => {
          const rows = projectDetailsGraphChapterRowsForEntity(entity, chapterDocuments);
          return `
            <article class="project-details-graph-line-card">
              <header>
                <span>${projectDetailsEscapeHtml(entity.kind === 'fact' ? 'Fact' : 'Name')}</span>
                <strong>${projectDetailsEscapeHtml(entity.kind === 'fact' ? entity.model.fact.keyword : entity.model.entry.name)}</strong>
              </header>
              ${chapterDocuments.length
                ? projectDetailsGraphLineSvg(rows, index)
                : '<div class="project-details-graph-empty">No chapters available for a line chart.</div>'}
            </article>
          `;
        }).join('')}
      </div>
    </section>
    <section class="project-details-graph-card">
      <div class="project-details-graph-card-head">
        <div>
          <span>Description Edits</span>
          <h3>Chapters with edited name/fact descriptions</h3>
        </div>
      </div>
      ${projectDetailsGraphHorizontalBars(editBars, { emptyText: 'No chapter-level description edits found for the selected items.' })}
    </section>
  `;
}

function projectDetailsGraphDocumentChart(selectedDocument = null) {
  if (!selectedDocument) {
    return `
      <section class="project-details-graph-card is-empty">
        <div class="project-details-graph-empty">Select a document on the left to build its graphical map.</div>
      </section>
    `;
  }
  const nameItems = projectDetailsGraphDocumentNameBars(selectedDocument);
  const stats = projectDetailsDocumentStats(selectedDocument);
  const chartItems = nameItems.map(item => ({
    label: item.entry.name,
    count: item.count
  }));
  return `
    <section class="project-details-graph-card is-document-focus">
      <div class="project-details-graph-card-head">
        <div>
          <span>${projectDetailsEscapeHtml(projectDetailsDocumentTypeLabel(selectedDocument))}</span>
          <h3>${projectDetailsEscapeHtml(selectedDocument.title)}</h3>
        </div>
        <strong>${projectDetailsEscapeHtml(projectDetailsWordCount(selectedDocument.text).toLocaleString('en-IN'))} words</strong>
      </div>
      <div class="project-details-graph-metrics">
        <div><span>Names</span><strong>${projectDetailsEscapeHtml(nameItems.length)}</strong></div>
        <div><span>Facts</span><strong>${projectDetailsEscapeHtml((stats.attachedFacts || []).length + (stats.detectedFacts || []).length)}</strong></div>
        <div><span>Mentions</span><strong>${projectDetailsEscapeHtml(nameItems.reduce((sum, item) => sum + item.count, 0))}</strong></div>
      </div>
      ${projectDetailsGraphHorizontalBars(chartItems, { emptyText: 'No saved names appear in this document yet.' })}
    </section>
    <section class="project-details-graph-card">
      <div class="project-details-graph-card-head">
        <div>
          <span>Name Information</span>
          <h3>Names found in this document</h3>
        </div>
      </div>
      ${projectDetailsGraphNameInfoList(nameItems, selectedDocument)}
    </section>
  `;
}

function projectDetailsRenderGraphicalView(documents = [], changes = []) {
  const graph = document.getElementById('projectDetailsGraphView');
  if (!graph) return;

  const visibleDocuments = projectDetailsGraphDocuments(documents);
  if (!visibleDocuments.some(documentItem => documentItem.id === projectDetailsGraphSelectedDocumentId)) {
    projectDetailsGraphSelectedDocumentId = visibleDocuments[0]?.id || documents[0]?.id || '';
  }
  const selectedDocument = documents.find(documentItem => documentItem.id === projectDetailsGraphSelectedDocumentId) || visibleDocuments[0] || documents[0] || null;
  let selectedEntities = projectDetailsGraphSelectedEntityModels(documents);
  if (selectedEntities.length !== projectDetailsGraphSelectedEntityKeys.length) {
    projectDetailsGraphSelectedEntityKeys = selectedEntities.map(entity => entity.key);
    selectedEntities = projectDetailsGraphSelectedEntityModels(documents);
  }
  const centerHtml = selectedEntities.length
    ? projectDetailsGraphEntityChart(documents)
    : projectDetailsGraphDocumentChart(selectedDocument);

  graph.innerHTML = `
    ${projectDetailsGraphDocumentPanel(documents, selectedDocument)}
    <main class="project-details-graph-stage" aria-label="Graphical project connections">
      <div class="project-details-graph-stage-head">
        <div>
          <span>Graphical View</span>
          <h2>Document, name and fact connections</h2>
        </div>
        <div class="project-details-graph-stage-summary">
          <span>${projectDetailsEscapeHtml(documents.length)} docs</span>
          <span>${projectDetailsEscapeHtml(namingData.entries.length)} names</span>
          <span>${projectDetailsEscapeHtml((storyFacts || []).length)} facts</span>
          <span>${projectDetailsEscapeHtml(changes.length)} edits</span>
        </div>
      </div>
      <div class="project-details-graph-stage-body">
        ${centerHtml}
      </div>
    </main>
    ${projectDetailsGraphEntityPanel(documents)}
  `;

  if (typeof hydrateLmIcons === 'function') hydrateLmIcons(graph);
  projectDetailsSyncCustomScrollThumbs(graph);
}

function projectDetailsRenderChanges(changes = []) {
  projectDetailsRenderGraphicalView(projectDetailsCurrentState?.documents || [], changes);
}

function projectDetailsRerenderGraphicalView() {
  projectDetailsRenderGraphicalView(
    projectDetailsCurrentState?.documents || [],
    projectDetailsCurrentState?.changes || []
  );
}

function projectDetailsSetEmptyState(isEmpty) {
  document.getElementById('projectDetailsEmpty').hidden = !isEmpty;
  document.getElementById('projectDetailsStatGrid').hidden = isEmpty;
  document.querySelector('.project-details-tabs').hidden = isEmpty;
  document.querySelectorAll('.project-details-section').forEach(section => {
    section.hidden = isEmpty;
  });
}

async function projectDetailsLoadState() {
  await projectDetailsGetStoredProjectHandle();

  if (projectDirectoryHandle) await window.LmNamingFileSafety.recoverPromotion(projectDirectoryHandle);
  const storedManifest = projectDetailsStoredJson(PROJECT_MANIFEST_KEY, null);
  const projectManifestFile = await projectDetailsReadProjectJsonFile(PROJECT_MANIFEST_FILE);
  const rawManifest = projectManifestFile || storedManifest;
  if (!rawManifest) return null;

  projectManifest = normalizeProjectManifest(rawManifest);
  chapters = chaptersFromManifest(projectManifest);

  const projectDraftData = await projectDetailsReadProjectJsonFile(PROJECT_DRAFTS_FILE);
  const rawDrafts = Array.isArray(projectDraftData)
    ? projectDraftData
    : Array.isArray(projectDraftData?.drafts)
      ? projectDraftData.drafts
      : projectDetailsReadDraftsFromStorage();
  chapterDrafts = normalizeDrafts(rawDrafts);

  const projectNamingData = await projectDetailsReadProjectJsonFile(PROJECT_NAMING_FILE);
  const namingFallback = projectNamingData || rawManifest.namingData || projectDetailsStoredJson(NAMING_STORAGE_KEY, { categories: [], entries: [] });
  namingData = normalizeNamingData(projectDirectoryHandle
    ? await window.LmNamingFileSafety.migrateAuthoritative(projectDirectoryHandle, namingFallback)
    : migrateNamingDataset(namingFallback));

  const storedFacts = projectDetailsStoredJson(FACTS_STORAGE_KEY, []);
  const factSource = Array.isArray(projectManifest.facts) && projectManifest.facts.length
    ? projectManifest.facts
    : storedFacts;
  const rawFactById = new Map((Array.isArray(factSource) ? factSource : [])
    .filter(fact => fact && typeof fact === 'object')
    .map(fact => [String(fact.id || ''), fact]));
  storyFacts = normalizeStoryFacts(factSource).map((fact, index) => {
    const rawFact = rawFactById.get(String(fact.id || '')) ||
      (Array.isArray(factSource) && typeof factSource[index] === 'object' ? factSource[index] : {});
    return {
      ...fact,
      documentType: rawFact.documentType || rawFact.chapterStatus || fact.documentType || 'chapter',
      draftKey: rawFact.draftKey || null,
      draftIndex: Number.isInteger(rawFact.draftIndex) ? rawFact.draftIndex : null,
      draftNo: rawFact.draftNo || null,
      draftTitle: rawFact.draftTitle || '',
      descriptionMeta: rawFact.descriptionMeta || rawFact.meta || fact.descriptionMeta || null,
      descriptionHistory: Array.isArray(rawFact.descriptionHistory)
        ? rawFact.descriptionHistory
        : fact.descriptionHistory || []
    };
  });

  const fileTextByPath = await projectDetailsReadDocumentFileTexts();
  const documents = projectDetailsBuildDocuments(fileTextByPath);
  const changes = projectDetailsBuildChanges(documents);

  return { manifest: projectManifest, documents, changes };
}

let projectDetailsTabLoaded = {
  documents: false,
  notes: false,
  changes: false
};

function projectDetailsRenderAll(state) {
  projectDetailsCurrentState = state || null;
  projectDetailsSetEditButtonState(Boolean(state?.manifest));

  if (!state) {
    projectDetailsSetEmptyState(true);
    projectDetailsSyncCustomScrollThumbs();
    return;
  }

  projectDetailsSetEmptyState(false);
  projectDetailsRenderHero(state.manifest);
  projectDetailsRenderStats(state.documents, state.changes);

  projectDetailsTabLoaded = {
    documents: false,
    notes: false,
    changes: false
  };

  const activeTabBtn = document.querySelector('.project-details-tab.is-active');
  const activeTab = activeTabBtn?.dataset?.projectDetailsTab || 'documents';
  projectDetailsActivateTab(activeTab);
  projectDetailsSyncCustomScrollThumbs();
}

function projectDetailsStoryLibraryButton() {
  return document.getElementById('openExistingStoriesBtn');
}

function projectDetailsStoryLibraryPanel() {
  return document.getElementById('projectDetailsStoryLibraryPanel');
}

function projectDetailsStoryLibraryList() {
  return document.getElementById('projectDetailsStoryLibraryList');
}

function projectDetailsTextValue(key = '', fallback = '') {
  if (typeof text !== 'function') return fallback;
  const copy = text();
  return copy?.[key] || fallback;
}

function projectDetailsCurrentProjectType() {
  const manifest = projectDetailsCurrentState?.manifest ||
    projectManifest ||
    projectDetailsStoredJson(PROJECT_MANIFEST_KEY, null) ||
    {};
  return String(manifest.type || 'novel').trim().toLowerCase() || 'novel';
}

function projectDetailsCurrentProjectTypeLabel() {
  const currentType = projectDetailsCurrentProjectType();
  if (typeof storyTypeLabel === 'function') return storyTypeLabel(currentType);
  if (typeof projectTypeFolderTitle === 'function') return projectTypeFolderTitle(currentType);
  return 'Project';
}

function projectDetailsProjectType(project = {}) {
  const explicitType = String(project.type || '').trim().toLowerCase();
  if (explicitType) return explicitType;
  const folderName = String(project.typeFolderName || '').trim().toLowerCase();
  if (folderName.includes('news')) return 'news';
  if (folderName.includes('stor')) return 'story';
  return 'novel';
}

function projectDetailsProjectTimeValue(project = {}) {
  if (typeof projectRecentTimeValue === 'function') return projectRecentTimeValue(project);
  const timestamp = Date.parse(project.updatedAt || project.createdAt || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function projectDetailsSameTypeProjects(projects = []) {
  const currentType = projectDetailsCurrentProjectType();
  return projects
    .filter(project => projectDetailsProjectType(project) === currentType)
    .sort((first, second) =>
      projectDetailsProjectTimeValue(second) - projectDetailsProjectTimeValue(first) ||
      String(first.title || first.folderName || '').localeCompare(String(second.title || second.folderName || ''))
    );
}

function projectDetailsStoryLibraryEmptyHtml(message = '', showWorkspaceButton = false) {
  return `
    <div class="story-library-empty project-details-story-library-empty">
      <span>${projectDetailsEscapeHtml(message)}</span>
      ${showWorkspaceButton ? '<button class="project-details-story-library-workspace-btn" type="button" data-project-details-library-open-workspace>Choose Workspace</button>' : ''}
    </div>`;
}

function projectDetailsStoryLibraryProjectButtonHtml(project = {}) {
  if (typeof recentProjectButtonHtml === 'function') {
    return recentProjectButtonHtml(project, 'data-project-details-story-folder');
  }

  const reference = project.projectPath || project.folderName || '';
  const title = project.title || project.folderName || 'Untitled Project';
  const meta = typeof recentProjectMetaText === 'function'
    ? recentProjectMetaText(project)
    : projectDetailsCurrentProjectTypeLabel();
  return `
    <button class="story-library-story-btn" type="button" data-project-details-story-folder="${projectDetailsEscapeHtml(reference)}">
      <span>${projectDetailsEscapeHtml(title)}</span>
      <small>${projectDetailsEscapeHtml(meta)}</small>
    </button>`;
}

function projectDetailsPositionStoryLibraryPanel() {
  const panel = projectDetailsStoryLibraryPanel();
  const button = projectDetailsStoryLibraryButton();
  if (!panel || !button || panel.hidden) return;

  const buttonRect = button.getBoundingClientRect();
  const defaultConfig = {
    gap: 8,
    topOffset: 0,
    leftOffset: 0,
    rightOffset: 0,
    panelWidth: 310,
    viewportPadding: 12
  };
  const positionConfig = typeof lmFloatingPanelPositionConfig === 'function'
    ? lmFloatingPanelPositionConfig('projectDetailsStoryLibraryPanel', defaultConfig)
    : defaultConfig;
  const panelNumber = typeof lmPanelNumber === 'function'
    ? lmPanelNumber
    : ((value, fallback) => {
      const numericValue = Number.parseFloat(value);
      return Number.isFinite(numericValue) ? numericValue : fallback;
    });
  const viewportPadding = panelNumber(positionConfig.viewportPadding, 12) ?? 12;
  const gap = panelNumber(positionConfig.gap, 8) ?? 8;
  const leftOffset = panelNumber(positionConfig.leftOffset, 0) ?? 0;
  const rightOffset = panelNumber(positionConfig.rightOffset, 0) ?? 0;
  const topOffset = panelNumber(positionConfig.topOffset, 0) ?? 0;
  const availableWidth = Math.max(180, window.innerWidth - viewportPadding * 2);
  const panelWidth = Math.min(panelNumber(positionConfig.panelWidth, 310) ?? 310, availableWidth);
  panel.style.width = `${panelWidth}px`;

  let left = buttonRect.left + leftOffset - rightOffset;
  left = Math.max(viewportPadding, Math.min(left, window.innerWidth - panelWidth - viewportPadding));
  const panelHeight = panel.offsetHeight || 190;
  const maxTop = Math.max(viewportPadding, window.innerHeight - panelHeight - viewportPadding);
  let top = buttonRect.bottom + gap + topOffset;
  top = Math.max(viewportPadding, Math.min(top, maxTop));
  panel.style.inset = `${top}px auto auto ${left}px`;
}

function projectDetailsSetStoryLibraryPanel(open) {
  const panel = projectDetailsStoryLibraryPanel();
  const button = projectDetailsStoryLibraryButton();
  if (!panel || !button) return;
  if (open && panel.hidden && typeof window.prepareFloatingPanelFocusReturn === 'function') {
    window.prepareFloatingPanelFocusReturn(panel);
  }
  panel.hidden = !open;
  panel.classList.toggle('is-open', Boolean(open));
  button.classList.toggle('is-open', Boolean(open));
  button.setAttribute('aria-expanded', String(Boolean(open)));
  if (open) projectDetailsPositionStoryLibraryPanel();
}

function closeProjectDetailsStoryLibraryPanel() {
  projectDetailsSetStoryLibraryPanel(false);
}

async function projectDetailsRestoreWorkspaceHandle(requestPermission = true) {
  if (workspaceDirectoryHandle) {
    if (!requestPermission || typeof verifyProjectPermission !== 'function') return true;
    return verifyProjectPermission(workspaceDirectoryHandle, true);
  }
  if (typeof readWorkspaceHandle !== 'function' || typeof verifyProjectPermission !== 'function') return false;

  try {
    const handle = await readWorkspaceHandle();
    if (!handle) return false;
    if (!(await verifyProjectPermission(handle, requestPermission))) return false;
    workspaceDirectoryHandle = handle;
    localStorage.setItem(WORKSPACE_FOLDER_KEY, handle.name || '');
    return true;
  } catch (error) {
    console.warn('Project details workspace restore failed:', error);
    return false;
  }
}

async function projectDetailsChooseWorkspaceForLibrary() {
  if (!('showDirectoryPicker' in window)) return false;
  try {
    const handle = await window.showDirectoryPicker();
    if (typeof verifyProjectPermission === 'function' && !(await verifyProjectPermission(handle, true))) return false;
    workspaceDirectoryHandle = handle;
    if (typeof saveWorkspaceHandle === 'function') await saveWorkspaceHandle(handle);
    localStorage.setItem(WORKSPACE_FOLDER_KEY, handle.name || '');
    return true;
  } catch (error) {
    if (error.name !== 'AbortError') console.warn('Project details workspace choose failed:', error);
    return false;
  }
}

async function projectDetailsRenderStoryLibraryList() {
  const list = projectDetailsStoryLibraryList();
  const title = document.getElementById('projectDetailsStoryLibraryTitle');
  if (!list || projectDetailsStoryLibraryLoading) return;

  const typeLabel = projectDetailsCurrentProjectTypeLabel();
  if (title) title.textContent = `${typeLabel} Projects`;
  list.hidden = false;
  list.innerHTML = projectDetailsStoryLibraryEmptyHtml(`Loading ${typeLabel.toLowerCase()} projects...`);
  projectDetailsPositionStoryLibraryPanel();
  projectDetailsStoryLibraryLoading = true;

  try {
    const workspaceReady = await projectDetailsRestoreWorkspaceHandle(true);
    if (!workspaceReady) {
      list.innerHTML = projectDetailsStoryLibraryEmptyHtml(
        'Choose the workspace folder to show saved projects here.',
        true
      );
      return;
    }

    const projects = typeof workspaceProjectManifestSummaries === 'function'
      ? await workspaceProjectManifestSummaries()
      : [];
    const sameTypeProjects = projectDetailsSameTypeProjects(projects);
    if (!sameTypeProjects.length) {
      list.innerHTML = projectDetailsStoryLibraryEmptyHtml(`No saved ${typeLabel.toLowerCase()} projects found.`);
      return;
    }

    list.innerHTML = sameTypeProjects.map(projectDetailsStoryLibraryProjectButtonHtml).join('');
  } catch (error) {
    console.warn('Project details story library render failed:', error);
    list.innerHTML = projectDetailsStoryLibraryEmptyHtml(error?.message || 'Saved projects could not be loaded.');
  } finally {
    projectDetailsStoryLibraryLoading = false;
    projectDetailsPositionStoryLibraryPanel();
  }
}

function projectDetailsResetAfterLibraryProjectSwitch() {
  projectDetailsEditLastFocus = null;
  projectDetailsDocumentMode = '';
  projectDetailsSelectedDocumentId = '';
  projectDetailsActiveDocumentInfoPanel = 'attached-names';
  projectDetailsLastRenderedDocumentId = '';
  projectDetailsShouldFocusDocumentInfoButton = false;
  projectDetailsSelectedDetectedNameKey = '';
  projectDetailsSelectedFactKey = '';
  projectDetailsEditingNameDescriptionId = '';
  projectDetailsShouldFocusDescriptionEditor = false;
  projectDetailsSelectedNameId = '';
  projectDetailsSelectedFactId = '';
  projectDetailsNameControlPanel = '';
  projectDetailsFactControlPanel = '';
  projectDetailsPreviewLastFocus = null;
  projectDetailsPreviewMentionIndex = 0;
  projectDetailsNameHistoryLastFocus = null;
  projectDetailsGraphDocumentFilter = 'all';
  projectDetailsGraphSelectedDocumentId = '';
  projectDetailsGraphEntityMode = 'names';
  projectDetailsGraphSelectedEntityKeys = [];
  projectDetailsClearTitleEditState();
  document.getElementById(PROJECT_DETAILS_PREVIEW_MODAL_ID)?.classList.remove('is-visible');
  document.getElementById(PROJECT_DETAILS_NAME_HISTORY_MODAL_ID)?.classList.remove('is-visible');
  const editModal = document.getElementById('projectDetailsEditModal');
  if (editModal) {
    editModal.classList.remove('is-visible');
    editModal.setAttribute('aria-hidden', 'true');
  }
}

async function projectDetailsOpenStoryFromLibrary(storyReference = '') {
  const list = projectDetailsStoryLibraryList();
  const loadingProject = projectDetailsTextValue('loadingProject', 'Loading project...');
  if (list) {
    list.innerHTML = projectDetailsStoryLibraryEmptyHtml(loadingProject);
    projectDetailsPositionStoryLibraryPanel();
  }
  if (typeof showAppLoader === 'function') showAppLoader(loadingProject);

  try {
    const workspaceReady = await projectDetailsRestoreWorkspaceHandle(true);
    if (!workspaceReady) throw new Error('Choose the workspace folder first.');
    if (typeof resolveWorkspaceStoryHandle !== 'function' || typeof readProjectManifestFromDirectory !== 'function') {
      throw new Error('Project library is not available on this page.');
    }

    const resolvedStory = await resolveWorkspaceStoryHandle(storyReference);
    const storyHandle = resolvedStory?.handle || resolvedStory;
    const typeFolderName = resolvedStory?.typeFolderName || '';
    if (!storyHandle) throw new Error('Project folder was not found.');
    if (typeof verifyProjectPermission === 'function' && !(await verifyProjectPermission(storyHandle, true))) {
      throw new Error(projectDetailsTextValue('projectPermissionNeeded', 'Project permission is needed.'));
    }

    const nextManifest = await readProjectManifestFromDirectory(storyHandle);
    const currentType = projectDetailsCurrentProjectType();
    const nextType = String(nextManifest.type || 'novel').trim().toLowerCase() || 'novel';
    if (nextType !== currentType) {
      throw new Error(`Only ${projectDetailsCurrentProjectTypeLabel().toLowerCase()} projects can be opened from this panel.`);
    }

    projectDirectoryHandle = storyHandle;
    projectManifest = normalizeProjectManifest(nextManifest);
    chapters = chaptersFromManifest(projectManifest);
    if (typeof saveProjectHandle === 'function') await saveProjectHandle(storyHandle);
    localStorage.setItem(PROJECT_MODE_KEY, 'local');
    localStorage.setItem(PROJECT_FOLDER_KEY, storyHandle.name || '');
    localStorage.setItem(PROJECT_MANIFEST_KEY, JSON.stringify(projectManifest));
    if (typeof setActiveProjectTypeFolderName === 'function') {
      setActiveProjectTypeFolderName(typeFolderName);
    } else if (typeFolderName) {
      localStorage.setItem(PROJECT_TYPE_FOLDER_KEY, typeFolderName);
    } else {
      localStorage.removeItem(PROJECT_TYPE_FOLDER_KEY);
    }

    projectDetailsResetAfterLibraryProjectSwitch();
    closeProjectDetailsStoryLibraryPanel();
    const state = await projectDetailsLoadState();
    projectDetailsRenderAll(state);
    projectDetailsNotify(`${projectManifest.title || storyHandle.name || 'Project'} opened.`);
  } catch (error) {
    console.warn('Project details story open failed:', error);
    const message = error?.name === 'NotFoundError'
      ? 'Saved project was not found.'
      : error?.message || 'Project could not be opened.';
    if (list) list.innerHTML = projectDetailsStoryLibraryEmptyHtml(message, /workspace/i.test(message));
    projectDetailsNotify(message);
  } finally {
    if (typeof hideAppLoader === 'function') hideAppLoader();
    projectDetailsPositionStoryLibraryPanel();
  }
}

async function toggleProjectDetailsStoryLibrary(event) {
  event?.preventDefault();
  event?.stopPropagation();
  const panel = projectDetailsStoryLibraryPanel();
  const shouldOpen = Boolean(panel?.hidden);
  projectDetailsSetStoryLibraryPanel(shouldOpen);
  if (shouldOpen) await projectDetailsRenderStoryLibraryList();
}

function initProjectDetailsStoryLibrary() {
  const button = projectDetailsStoryLibraryButton();
  const panel = projectDetailsStoryLibraryPanel();
  if (!button || !panel || button.dataset.projectDetailsStoryLibraryBound === 'true') return;

  button.dataset.projectDetailsStoryLibraryBound = 'true';
  button.addEventListener('click', toggleProjectDetailsStoryLibrary);
  panel.addEventListener('click', async event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const workspaceButton = target.closest('[data-project-details-library-open-workspace]');
    if (workspaceButton) {
      event.preventDefault();
      if (await projectDetailsChooseWorkspaceForLibrary()) await projectDetailsRenderStoryLibraryList();
      return;
    }

    const projectButton = target.closest('[data-project-details-story-folder]');
    if (!projectButton) return;
    event.preventDefault();
    await projectDetailsOpenStoryFromLibrary(projectButton.dataset.projectDetailsStoryFolder || '');
  });
  document.addEventListener('pointerdown', event => {
    if (panel.hidden) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || button.contains(target) || panel.contains(target)) return;
    closeProjectDetailsStoryLibraryPanel();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) closeProjectDetailsStoryLibraryPanel();
  });
  window.addEventListener('resize', projectDetailsPositionStoryLibraryPanel, { passive: true });
}

function projectDetailsUpdateRefreshButtonLabel(tabName = 'documents') {
  const btnText = document.getElementById('projectDetailsRefreshBtnText');
  if (!btnText) return;
  const labels = {
    documents: 'Refresh Documents',
    notes: 'Refresh Names & Facts',
    changes: 'Refresh View'
  };
  btnText.textContent = labels[tabName] || 'Refresh Section';
}

function projectDetailsShowSectionLoader(tabName, visible = true) {
  const loaderId = tabName === 'notes'
    ? 'projectDetailsLoaderNotes'
    : tabName === 'changes'
      ? 'projectDetailsLoaderChanges'
      : 'projectDetailsLoaderDocuments';
  const loader = document.getElementById(loaderId);
  if (loader) loader.hidden = !visible;
}

async function projectDetailsActivateTab(tabName = 'documents', options = {}) {
  const allowedTabs = ['documents', 'notes', 'changes'];
  const safeTab = allowedTabs.includes(tabName) ? tabName : 'documents';

  document.querySelectorAll('[data-project-details-tab]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.projectDetailsTab === safeTab);
  });
  document.querySelectorAll('[data-project-details-section]').forEach(section => {
    section.classList.toggle('is-active', section.dataset.projectDetailsSection === safeTab);
  });

  projectDetailsUpdateRefreshButtonLabel(safeTab);

  const force = Boolean(options.force);
  if (!projectDetailsTabLoaded[safeTab] || force) {
    projectDetailsShowSectionLoader(safeTab, true);
    try {
      if (safeTab === 'notes') {
        if (force) projectDetailsMentionsCache = null;
        await projectDetailsLoadMentionsCache();
        projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
      } else if (safeTab === 'changes') {
        projectDetailsRenderChanges(projectDetailsCurrentState?.changes || []);
      } else if (safeTab === 'documents') {
        projectDetailsRenderDocuments(projectDetailsCurrentState?.documents || []);
      }
      projectDetailsTabLoaded[safeTab] = true;
    } catch (e) {
      console.warn(`Tab ${safeTab} load failed:`, e);
    } finally {
      projectDetailsShowSectionLoader(safeTab, false);
      projectDetailsSyncCustomScrollThumbs();
    }
  }
}

function initProjectDetailsTabs() {
  document.querySelectorAll('[data-project-details-tab]').forEach(button => {
    button.addEventListener('click', () => projectDetailsActivateTab(button.dataset.projectDetailsTab));
  });
}
