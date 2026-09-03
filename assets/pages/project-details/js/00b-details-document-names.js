function projectDetailsRenderDocumentInfoBlock(title, bodyHtml, emptyText) {
  return `
    <section class="project-details-document-info-block">
      <span>${projectDetailsEscapeHtml(title)}</span>
      ${bodyHtml || `<div class="project-details-empty-row">${projectDetailsEscapeHtml(emptyText)}</div>`}
    </section>
  `;
}

function projectDetailsRenderDetailSelector(items = [], selectedKey = '', attributeName = '', labelGetter = () => '') {
  if (items.length <= 1 || !attributeName) return '';
  return `
    <div class="project-details-detail-selector" role="list">
      ${items.map(item => `
        <button class="project-details-detail-option ${item.key === selectedKey ? 'is-active' : ''}" type="button"
          ${attributeName}="${projectDetailsEscapeHtml(item.key)}" aria-pressed="${item.key === selectedKey ? 'true' : 'false'}">
          <span>${projectDetailsEscapeHtml(labelGetter(item))}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function projectDetailsRenderAttachedNamesBlock(stats = {}, documentItem = {}, categoryById = new Map()) {
  const bodyHtml = (stats.attachedNames || []).length
    ? `<div class="project-details-detail-stack">
        ${stats.attachedNames.map(entry =>
          projectDetailsNameInfoRecord(entry, documentItem, categoryById)
        ).join('')}
      </div>`
    : '';

  return projectDetailsRenderDocumentInfoBlock('Attached Names', bodyHtml, 'No attached names');
}

function projectDetailsRenderDetectedNamesBlock(stats = {}, documentItem = {}, categoryById = new Map()) {
  const items = projectDetailsDetectedNameItems(stats.detectedNames || [], documentItem);
  const selectedItem = items.find(item => item.key === projectDetailsSelectedDetectedNameKey) || items[0] || null;
  projectDetailsSelectedDetectedNameKey = selectedItem?.key || '';

  const bodyHtml = selectedItem
    ? `${projectDetailsRenderDetailSelector(
          items,
          selectedItem.key,
          'data-project-details-detected-name-key',
          item => item.entry.name
        )}
      <div class="project-details-detail-stack">
        ${projectDetailsNameInfoRecord(selectedItem.entry, documentItem, categoryById, {
          isDetected: true,
          mentionCount: selectedItem.mentionCount
        })}
      </div>
      `
    : '';

  return projectDetailsRenderDocumentInfoBlock('Detected Names', bodyHtml, 'No category-name detections');
}

function projectDetailsRenderFactsBlock(stats = {}, documentItem = {}) {
  const items = projectDetailsFactItems(stats, documentItem);
  const selectedItem = items.find(item => item.key === projectDetailsSelectedFactKey) || items[0] || null;
  projectDetailsSelectedFactKey = selectedItem?.key || '';

  const bodyHtml = selectedItem
    ? `${projectDetailsRenderDetailSelector(
          items,
          selectedItem.key,
          'data-project-details-fact-key',
          item => `${item.fact.keyword} (${item.isDetected ? 'Detected' : 'Attached'})`
        )}
      <div class="project-details-detail-stack">
        ${projectDetailsFactInfoRecord(selectedItem.fact, documentItem, {
          isDetected: selectedItem.isDetected,
          mentionCount: selectedItem.mentionCount
        })}
      </div>
      `
    : '';

  return projectDetailsRenderDocumentInfoBlock('Facts', bodyHtml, 'No facts connected');
}

function projectDetailsRenderDocumentInfoPanel(stats = {}, documentItem = {}, categoryById = new Map()) {
  if (projectDetailsActiveDocumentInfoPanel === 'detected-names') {
    return projectDetailsRenderDetectedNamesBlock(stats, documentItem, categoryById);
  }
  if (projectDetailsActiveDocumentInfoPanel === 'facts') {
    return projectDetailsRenderFactsBlock(stats, documentItem);
  }
  return projectDetailsRenderAttachedNamesBlock(stats, documentItem, categoryById);
}

function projectDetailsRenderDocumentInfoButton(panelName, label, count, tone = 'info') {
  const isActive = projectDetailsActiveDocumentInfoPanel === panelName;
  return `
    <button class="project-details-mini-stat project-details-document-info-btn is-${projectDetailsEscapeHtml(tone)} ${isActive ? 'is-active' : ''}" type="button"
      data-project-details-document-info-panel="${projectDetailsEscapeHtml(panelName)}"
      aria-pressed="${isActive ? 'true' : 'false'}">
      <span>${projectDetailsEscapeHtml(label)}</span>
      <strong>${projectDetailsEscapeHtml(count)}</strong>
    </button>
  `;
}

function projectDetailsRenderDocumentDetail(documentItem = null) {
  if (!documentItem) {
    const modeTitle = projectDetailsDocumentModeTitle(projectDetailsDocumentMode || 'draft', true).toLowerCase();
    return `
      <article class="project-details-document-detail-panel is-empty">
        <strong>No ${projectDetailsEscapeHtml(modeTitle)} available</strong>
        <p>Select the other option on the left, or add a ${projectDetailsEscapeHtml(projectDetailsDocumentModeTitle(projectDetailsDocumentMode || 'draft').toLowerCase())} from the editor.</p>
      </article>
    `;
  }

  const stats = projectDetailsDocumentStats(documentItem);
  const categoryById = projectDetailsCategoryMap();
  const typeLabel = projectDetailsDocumentTypeLabel(documentItem);
  const indexLabel = String(documentItem.no || documentItem.index + 1).padStart(2, '0');
  const previewLabel = `Preview ${typeLabel}`;

  return `
    <article class="project-details-document-detail-panel">
      <div class="project-details-document-title">
        <div class="project-details-document-heading">
          <span class="project-details-document-number" aria-label="${projectDetailsEscapeHtml(typeLabel)}">${projectDetailsEscapeHtml(indexLabel)}</span>
          <div class="project-details-document-heading-copy">
            <h4>${projectDetailsEscapeHtml(documentItem.title)}</h4>
            <span class="project-details-document-word-count">${projectDetailsEscapeHtml(stats.words)} words</span>
          </div>
        </div>
        <div class="project-details-document-title-side">
          <small>${projectDetailsEscapeHtml(projectDetailsDateLabel(documentItem.createdAt))}</small>
          <button class="project-details-document-preview-btn" type="button"
            data-project-details-document-preview="${projectDetailsEscapeHtml(documentItem.id)}"
            aria-label="${projectDetailsEscapeHtml(previewLabel)}">Preview</button>
        </div>
      </div>
      <div class="project-details-mini-grid is-document-actions" role="group" aria-label="Document information panels">
        ${projectDetailsRenderDocumentInfoButton('attached-names', 'Attached Names', stats.attachedNames.length, 'info')}
        ${projectDetailsRenderDocumentInfoButton('detected-names', 'Detected Names', stats.detectedNames.length, 'success')}
        ${projectDetailsRenderDocumentInfoButton('facts', 'Facts', stats.attachedFacts.length + stats.detectedFacts.length, 'warning')}
      </div>
      ${projectDetailsRenderDocumentInfoPanel(stats, documentItem, categoryById)}
    </article>
  `;
}

function projectDetailsEnsureDocumentPreviewModal() {
  let modal = document.getElementById(PROJECT_DETAILS_PREVIEW_MODAL_ID);
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = PROJECT_DETAILS_PREVIEW_MODAL_ID;
  modal.className = 'project-details-document-preview-modal';
  modal.setAttribute('aria-hidden', 'true');
  const previewMentionBeforeIcon = window.lmIcon
    ? window.lmIcon('chevronLeft', 'project-details-preview-mention-icon project-details-preview-mention-icon-up')
    : '';
  const previewMentionAfterIcon = window.lmIcon
    ? window.lmIcon('chevronRight', 'project-details-preview-mention-icon project-details-preview-mention-icon-down')
    : '';
  modal.innerHTML = `
    <div class="project-details-document-preview-box" role="dialog" aria-modal="true" aria-label="Document preview">
      <div class="project-details-document-preview-text lm-id-projectDetailsDocumentPreviewText" id="${PROJECT_DETAILS_PREVIEW_TEXT_ID}" tabindex="0"></div>
      <div class="project-details-document-preview-mention-controls lm-id-projectDetailsDocumentPreviewMentionControls" id="${PROJECT_DETAILS_PREVIEW_MENTION_CONTROLS_ID}" hidden>
        <button type="button" data-project-details-preview-mention="before" title="Previous mention" aria-label="Previous mention">${previewMentionBeforeIcon}</button>
        <button type="button" data-project-details-preview-mention="after" title="Next mention" aria-label="Next mention">${previewMentionAfterIcon}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function projectDetailsFindDocumentById(documentId = '') {
  return (projectDetailsCurrentState?.documents || [])
    .find(documentItem => documentItem.id === documentId) || null;
}

function projectDetailsPreviewMentionMarks() {
  return [...(document.getElementById(PROJECT_DETAILS_PREVIEW_TEXT_ID)
    ?.querySelectorAll('.project-details-document-preview-mention') || [])];
}

function projectDetailsSetPreviewMention(index = 0) {
  const marks = projectDetailsPreviewMentionMarks();
  const controls = document.getElementById(PROJECT_DETAILS_PREVIEW_MENTION_CONTROLS_ID);
  if (!marks.length) {
    if (controls) controls.hidden = true;
    projectDetailsPreviewMentionIndex = 0;
    return false;
  }

  projectDetailsPreviewMentionIndex = ((index % marks.length) + marks.length) % marks.length;
  marks.forEach((mark, markIndex) => {
    mark.classList.toggle('is-active', markIndex === projectDetailsPreviewMentionIndex);
  });
  if (controls) {
    controls.hidden = false;
    controls.querySelectorAll('button').forEach(button => {
      button.disabled = marks.length <= 1;
    });
  }
  requestAnimationFrame(() => {
    marks[projectDetailsPreviewMentionIndex]?.scrollIntoView({ block: 'center', inline: 'nearest' });
  });
  return true;
}

function projectDetailsMovePreviewMention(direction = 'after') {
  const delta = direction === 'before' ? -1 : 1;
  projectDetailsSetPreviewMention(projectDetailsPreviewMentionIndex + delta);
}

function openProjectDetailsDocumentPreview(documentId = projectDetailsSelectedDocumentId, options = {}) {
  const documentItem = projectDetailsFindDocumentById(documentId);
  if (!documentItem) return;

  const modal = projectDetailsEnsureDocumentPreviewModal();
  const textContainer = document.getElementById(PROJECT_DETAILS_PREVIEW_TEXT_ID);
  const controls = document.getElementById(PROJECT_DETAILS_PREVIEW_MENTION_CONTROLS_ID);
  if (!textContainer) return;

  projectDetailsPreviewLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const documentText = projectDetailsDocumentText(documentItem);
  const mentionTerm = String(options.mentionTerm || '').trim();
  const mentionMode = projectDetailsDocumentFindMode(documentItem);
  if (mentionTerm) {
    textContainer.innerHTML = projectDetailsPreviewMentionHtml(documentText, mentionTerm, mentionMode);
  } else {
    textContainer.textContent = documentText;
    if (controls) controls.hidden = true;
    projectDetailsPreviewMentionIndex = 0;
  }
  textContainer.style.setProperty('--project-details-preview-font-size', `${projectDetailsDocumentFontSize(documentItem)}px`);
  modal.classList.add('is-visible');
  modal.setAttribute('aria-hidden', 'false');
  projectDetailsSyncCustomScrollThumbs(modal);
  requestAnimationFrame(() => {
    textContainer.focus?.({ preventScroll: true });
    if (mentionTerm) projectDetailsSetPreviewMention(Number(options.mentionIndex || 0));
  });
}

function closeProjectDetailsDocumentPreview() {
  const modal = document.getElementById(PROJECT_DETAILS_PREVIEW_MODAL_ID);
  if (!modal?.classList.contains('is-visible')) return;
  modal.classList.remove('is-visible');
  modal.setAttribute('aria-hidden', 'true');
  document.getElementById(PROJECT_DETAILS_PREVIEW_MENTION_CONTROLS_ID)?.setAttribute('hidden', '');
  projectDetailsPreviewMentionIndex = 0;
  projectDetailsPreviewLastFocus?.focus?.({ preventScroll: true });
  projectDetailsPreviewLastFocus = null;
  projectDetailsSyncCustomScrollThumbs();
}

function projectDetailsEnsureNameHistoryModal() {
  let modal = document.getElementById(PROJECT_DETAILS_NAME_HISTORY_MODAL_ID);
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = PROJECT_DETAILS_NAME_HISTORY_MODAL_ID;
  modal.className = 'project-details-name-history-modal';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <article class="project-details-name-history-panel" id="${PROJECT_DETAILS_NAME_HISTORY_PANEL_ID}" role="dialog" aria-modal="true" aria-label="Name description changes">
      <div class="project-details-name-history-panel-head">
        <div>
          <span>Name Description Edit</span>
          <h3 data-project-details-history-title></h3>
        </div>
        <button class="project-details-name-history-close" type="button" data-project-details-name-history-close aria-label="Close">Close</button>
      </div>
      <div class="project-details-name-history-panel-body" data-project-details-history-body></div>
    </article>
  `;
  document.body.appendChild(modal);
  return modal;
}

function projectDetailsNameHistoryRecord(entry = {}, historyIndex = 0) {
  const history = Array.isArray(entry.descriptionHistory) ? entry.descriptionHistory : [];
  const safeIndex = Math.max(0, Math.min(Number(historyIndex) || 0, Math.max(0, history.length - 1)));
  const item = history[safeIndex] || null;
  if (!item) return null;
  const hasPreviousSnapshot = Object.prototype.hasOwnProperty.call(item, 'previousDescription');
  const previousDescription = hasPreviousSnapshot && typeof item.previousDescription === 'string'
    ? item.previousDescription
    : safeIndex > 0 ? history[safeIndex - 1]?.description || '' : '';
  const nextDescription = item.description || '';
  const diff = projectDetailsDiffStats(previousDescription, nextDescription);
  return { item, previousDescription, nextDescription, diff };
}

function openProjectDetailsNameHistory(entryId = '', historyIndex = 0) {
  const entry = (namingData.entries || []).find(item => item.id === entryId);
  const record = projectDetailsNameHistoryRecord(entry, historyIndex);
  if (!entry || !record) return;

  const modal = projectDetailsEnsureNameHistoryModal();
  const title = modal.querySelector('[data-project-details-history-title]');
  const body = modal.querySelector('[data-project-details-history-body]');
  if (!body) return;

  projectDetailsNameHistoryLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (title) title.textContent = entry.name || 'Name';
  body.innerHTML = `
    <div class="project-details-name-history-meta">
      <span>${projectDetailsEscapeHtml(projectDetailsTimeLabel(record.item.editedAt) || projectDetailsDateLabel(record.item.editedAt))}</span>
      <strong>${projectDetailsEscapeHtml(projectDetailsMetaLabel(record.item.chapterMeta))}</strong>
      <em>+${projectDetailsEscapeHtml(record.diff.added)} / -${projectDetailsEscapeHtml(record.diff.removed)}</em>
    </div>
    <div class="project-details-name-history-compare">
      <section>
        <span>Before</span>
        <p>${projectDetailsEscapeHtml(record.previousDescription || 'No previous description.')}</p>
      </section>
      <section>
        <span>After</span>
        <p>${projectDetailsEscapeHtml(record.nextDescription || 'No description saved.')}</p>
      </section>
    </div>
  `;
  modal.classList.add('is-visible');
  modal.setAttribute('aria-hidden', 'false');
  projectDetailsSyncCustomScrollThumbs(modal);
  requestAnimationFrame(() => modal.querySelector('[data-project-details-name-history-close]')?.focus?.({ preventScroll: true }));
}

function closeProjectDetailsNameHistory() {
  const modal = document.getElementById(PROJECT_DETAILS_NAME_HISTORY_MODAL_ID);
  if (!modal?.classList.contains('is-visible')) return;
  modal.classList.remove('is-visible');
  modal.setAttribute('aria-hidden', 'true');
  projectDetailsNameHistoryLastFocus?.focus?.({ preventScroll: true });
  projectDetailsNameHistoryLastFocus = null;
  projectDetailsSyncCustomScrollThumbs();
}

function projectDetailsRenderDocuments(documents = []) {
  const grid = document.getElementById('projectDetailsDocumentGrid');
  const draftDocuments = projectDetailsDocumentsOfType(documents, 'draft');
  const chapterDocuments = projectDetailsDocumentsOfType(documents, 'chapter');

  if (!projectDetailsDocumentMode) {
    projectDetailsDocumentMode = draftDocuments.length ? 'draft' : 'chapter';
  }

  const activeMode = projectDetailsDocumentMode === 'chapter' ? 'chapter' : 'draft';
  const visibleDocuments = activeMode === 'chapter' ? chapterDocuments : draftDocuments;
  if (!visibleDocuments.some(documentItem => documentItem.id === projectDetailsSelectedDocumentId)) {
    projectDetailsSelectedDocumentId = visibleDocuments[0]?.id || '';
  }
  const selectedDocument = visibleDocuments.find(documentItem => documentItem.id === projectDetailsSelectedDocumentId) || null;
  if (selectedDocument) {
    if (selectedDocument.id !== projectDetailsLastRenderedDocumentId) {
      projectDetailsActiveDocumentInfoPanel = projectDetailsPreferredDocumentInfoPanel(projectDetailsDocumentStats(selectedDocument));
      projectDetailsSelectedDetectedNameKey = '';
      projectDetailsSelectedFactKey = '';
    }
    projectDetailsLastRenderedDocumentId = selectedDocument.id;
  } else {
    projectDetailsLastRenderedDocumentId = '';
    projectDetailsActiveDocumentInfoPanel = 'attached-names';
  }

  const modeButton = (mode, count) => `
    <button class="project-details-document-mode-btn ${activeMode === mode ? 'is-active' : ''}" type="button"
      data-project-details-document-mode="${mode}" aria-pressed="${activeMode === mode ? 'true' : 'false'}">
      <span>${projectDetailsEscapeHtml(projectDetailsDocumentModeTitle(mode, true))}</span>
      <strong>${projectDetailsEscapeHtml(count)}</strong>
    </button>
  `;

  grid.innerHTML = `
    <aside class="project-details-document-sidebar" aria-label="Project documents">
      <div class="project-details-document-mode-switch" role="group" aria-label="Document type">
        ${modeButton('draft', draftDocuments.length)}
        ${modeButton('chapter', chapterDocuments.length)}
      </div>
      <div class="project-details-document-picker-list">
        ${visibleDocuments.length
          ? visibleDocuments.map(documentItem =>
              projectDetailsRenderDocumentListItem(documentItem, documentItem.id === projectDetailsSelectedDocumentId)
            ).join('')
          : `<div class="project-details-empty-row">No ${projectDetailsEscapeHtml(projectDetailsDocumentModeTitle(activeMode, true).toLowerCase())} are available yet.</div>`}
      </div>
    </aside>
    ${projectDetailsRenderDocumentDetail(selectedDocument)}
  `;
  projectDetailsFocusActiveDocumentInfoButton(grid);
  projectDetailsFocusDescriptionEditor(grid);
  projectDetailsSyncCustomScrollThumbs(grid);
}

function projectDetailsDocumentRowsForTerm(documents = [], term = '') {
  return documents
    .map(documentItem => ({
      documentItem,
      count: projectDetailsCountDocumentTerm(documentItem, term)
    }))
    .filter(item => item.count > 0)
    .sort((left, right) => right.count - left.count);
}

function projectDetailsRenderTermRows(rows = []) {
  if (!rows.length) return '<div class="project-details-empty-row">No text appearance found in chapters or drafts.</div>';
  return `
    <div class="project-details-document-list">
      ${rows.map(row => `
        <div class="project-details-document-link">
          <span>${projectDetailsEscapeHtml(row.documentItem.title)}</span>
          <strong>${row.count}x</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function projectDetailsAttachedDocumentLabel(entry = {}, documents = []) {
  const match = documents.find(documentItem => projectDetailsNameDocumentMatches(entry, documentItem));
  if (match) return match.title;
  return projectDetailsMetaLabel(entry.descriptionMeta || entry);
}

function projectDetailsNameStatusTitle(status = '') {
  const normalizedStatus = String(status || '').toLowerCase();
  if (normalizedStatus === 'chapter' || normalizedStatus === 'draft') {
    return projectDetailsDocumentModeTitle(normalizedStatus);
  }
  if (normalizedStatus === 'undefined') return 'Undefined';
  return 'Project level';
}

function projectDetailsNameStatusClass(status = '') {
  const normalizedStatus = String(status || '').toLowerCase();
  return ['chapter', 'draft', 'undefined'].includes(normalizedStatus) ? normalizedStatus : 'project';
}

function projectDetailsNameMentionClass(totalMentions = 0) {
  return Number(totalMentions || 0) > 0 ? 'has-mentions' : 'has-no-mentions';
}

function projectDetailsDefinedInInfo(entry = {}, documents = []) {
  const match = documents.find(documentItem => projectDetailsNameDocumentMatches(entry, documentItem));
  if (match) {
    const status = match.type || 'project';
    return {
      title: match.title || projectDetailsDocumentTypeLabel(match),
      status,
      statusClass: projectDetailsNameStatusClass(status),
      statusTitle: projectDetailsNameStatusTitle(status)
    };
  }

  const status = normalizeNamingEntryStatus(entry);
  return {
    title: projectDetailsMetaLabel(entry.descriptionMeta || entry),
    status,
    statusClass: projectDetailsNameStatusClass(status),
    statusTitle: projectDetailsNameStatusTitle(status)
  };
}

let projectDetailsMentionsCache = null;

async function projectDetailsLoadMentionsCache() {
  if (projectDetailsMentionsCache) return projectDetailsMentionsCache;
  if (typeof readProjectDetailsCacheFile === 'function') {
    projectDetailsMentionsCache = await readProjectDetailsCacheFile('total-mentions.json');
  }
  return projectDetailsMentionsCache;
}

async function projectDetailsSaveMentionsCache(mentionsMap = {}) {
  const cacheData = {
    updatedAt: new Date().toISOString(),
    projectTitle: projectDetailsCurrentState?.manifest?.title || 'Untitled Story',
    mentions: mentionsMap
  };
  projectDetailsMentionsCache = cacheData;
  if (typeof writeProjectDetailsCacheFile === 'function') {
    await writeProjectDetailsCacheFile('total-mentions.json', cacheData);
  }
}

function projectDetailsNameViewModels(documents = []) {
  const categoryById = projectDetailsCategoryMap();
  const cachedMentions = projectDetailsMentionsCache?.mentions || {};
  let cacheDirty = false;
  const newScanMentions = { ...cachedMentions };

  const models = (namingData.entries || []).map(entry => {
    const cachedEntry = cachedMentions[entry.id] || cachedMentions[entry.name];
    let rows;
    let totalMentions;

    if (cachedEntry && Array.isArray(cachedEntry.rows) && typeof cachedEntry.totalMentions === 'number') {
      rows = cachedEntry.rows.map(r => {
        const docItem = documents.find(d => d.id === r.documentId || d.key === r.documentKey) ||
          r.documentItem ||
          { id: r.documentId || r.documentKey, title: r.title || 'Document', type: 'chapter' };
        return { documentItem: docItem, count: Number(r.count) || 0 };
      }).filter(r => r.count > 0);
      totalMentions = cachedEntry.totalMentions;
    } else {
      rows = projectDetailsDocumentRowsForTerm(documents, entry.name);
      totalMentions = rows.reduce((sum, row) => sum + row.count, 0);
      newScanMentions[entry.id] = {
        name: entry.name,
        totalMentions,
        rows: rows.map(r => ({
          documentId: r.documentItem?.id || '',
          documentKey: r.documentItem?.key || '',
          title: r.documentItem?.title || '',
          count: r.count
        }))
      };
      cacheDirty = true;
    }

    const definedIn = projectDetailsDefinedInInfo(entry, documents);
    return {
      entry,
      rows,
      totalMentions,
      category: categoryById.get(entry.categoryId),
      status: normalizeNamingEntryStatus(entry),
      definedIn,
      attachedChapterIndex: projectDetailsNameAttachedChapterIndex(entry, documents),
      latestTime: projectDetailsNameLatestTime(entry)
    };
  });

  if (cacheDirty) {
    projectDetailsSaveMentionsCache(newScanMentions).catch(e => console.warn('Cache save failed:', e));
  }

  return models;
}

function projectDetailsNameLatestTime(entry = {}) {
  const times = [entry.updatedAt, entry.createdAt, entry.resolvedAt, entry.chapterSavedAt]
    .map(value => new Date(value).getTime())
    .filter(value => Number.isFinite(value));
  return times.length ? Math.max(...times) : 0;
}

function projectDetailsNameAttachedChapterIndex(entry = {}, documents = []) {
  const match = documents.find(documentItem =>
    documentItem.type === 'chapter' && projectDetailsNameDocumentMatches(entry, documentItem)
  );
  if (match && Number.isInteger(match.index)) return match.index + 1;
  if (Number.isInteger(entry.chapterIndex) && normalizeNamingEntryStatus(entry) === 'chapter') return entry.chapterIndex + 1;
  const numericNo = Number(entry.chapterNo);
  return Number.isFinite(numericNo) && numericNo > 0 ? numericNo : Number.MAX_SAFE_INTEGER;
}

function projectDetailsNameRowsInChapterRange(model = {}, startValue = '', endValue = '') {
  const parseChapterLimit = value => {
    const textValue = String(value ?? '').trim();
    if (!textValue) return null;
    const numberValue = Number(textValue);
    return Number.isFinite(numberValue) ? numberValue : null;
  };
  const start = parseChapterLimit(startValue);
  const end = parseChapterLimit(endValue);
  if (start === null && end === null) return true;
  const rawMin = start !== null ? start : 1;
  const rawMax = end !== null ? end : Number.MAX_SAFE_INTEGER;
  const min = Math.min(rawMin, rawMax);
  const max = Math.max(rawMin, rawMax);
  return (model.rows || []).some(row => {
    const documentItem = row.documentItem || {};
    if (documentItem.type !== 'chapter') return false;
    const chapterNo = Number(documentItem.no || (Number.isInteger(documentItem.index) ? documentItem.index + 1 : NaN));
    return Number.isFinite(chapterNo) && chapterNo >= min && chapterNo <= max;
  });
}

function projectDetailsNameOccurrenceMatches(totalMentions = 0, range = 'all') {
  const count = Number(totalMentions || 0);
  if (range === '50+') return count > 50;
  if (range === '200+') return count > 200;
  if (range === '500+') return count > 500;
  return true;
}

function projectDetailsFilteredNameModels(models = []) {
  const filters = projectDetailsNameListFilter || {};
  return models
    .filter(model => {
      if (filters.categoryId && filters.categoryId !== 'all' && model.entry?.categoryId !== filters.categoryId) return false;
      if (!projectDetailsNameOccurrenceMatches(model.totalMentions, filters.occurrenceRange || 'all')) return false;
      return projectDetailsNameRowsInChapterRange(model, filters.chapterStart, filters.chapterEnd);
    })
    .sort(projectDetailsCompareNameModels);
}

function projectDetailsDefaultNameSortDirection(sortBy = 'time') {
  return sortBy === 'chapter-index' ? 'asc' : 'desc';
}

function projectDetailsNormalizeNameSortDirection(direction = '', sortBy = 'time') {
  const normalizedDirection = String(direction || '').toLowerCase();
  return normalizedDirection === 'asc' || normalizedDirection === 'desc'
    ? normalizedDirection
    : projectDetailsDefaultNameSortDirection(sortBy);
}

function projectDetailsNameSortDirectionMultiplier(direction = 'desc') {
  return direction === 'asc' ? 1 : -1;
}

function projectDetailsCompareNameModels(left = {}, right = {}) {
  const leftHasMentions = Number(left.totalMentions || 0) > 0 ? 0 : 1;
  const rightHasMentions = Number(right.totalMentions || 0) > 0 ? 0 : 1;
  if (leftHasMentions !== rightHasMentions) return leftHasMentions - rightHasMentions;

  const sortBy = projectDetailsNameListFilter?.sortBy || 'time';
  const sortDirection = projectDetailsNormalizeNameSortDirection(projectDetailsNameListFilter?.sortDirection, sortBy);
  const directionMultiplier = projectDetailsNameSortDirectionMultiplier(sortDirection);
  if (sortBy === 'occurrences') {
    const diff = Number(left.totalMentions || 0) - Number(right.totalMentions || 0);
    if (diff) return diff * directionMultiplier;
  } else if (sortBy === 'chapter-index') {
    const diff = Number(left.attachedChapterIndex || Number.MAX_SAFE_INTEGER) -
      Number(right.attachedChapterIndex || Number.MAX_SAFE_INTEGER);
    if (diff) return diff * directionMultiplier;
  } else {
    const diff = Number(left.latestTime || 0) - Number(right.latestTime || 0);
    if (diff) return diff * directionMultiplier;
  }

  return String(left.entry?.name || '').localeCompare(String(right.entry?.name || ''));
}

function projectDetailsRenderNameListItem(model = {}, isActive = false, itemIndex = 0) {
  const entry = model.entry || {};
  const displayIndex = Number.isFinite(itemIndex) ? itemIndex + 1 : 1;
  const mentionClass = projectDetailsNameMentionClass(model.totalMentions);
  return `
    <button class="project-details-name-list-item ${projectDetailsEscapeHtml(mentionClass)} ${isActive ? 'is-active' : ''}" type="button"
      data-project-details-name-id="${projectDetailsEscapeHtml(entry.id)}"
      aria-pressed="${isActive ? 'true' : 'false'}">
      <span class="project-details-name-list-avatar ${projectDetailsEscapeHtml(mentionClass)}">${projectDetailsEscapeHtml(displayIndex)}</span>
      <span class="project-details-name-list-copy">
        <b>${projectDetailsEscapeHtml(entry.name)}</b>
        <small>${projectDetailsEscapeHtml(model.category?.title || 'Naming')}</small>
      </span>
      <strong>${projectDetailsEscapeHtml(model.totalMentions)}</strong>
    </button>
  `;
}

function projectDetailsRenderNameFilterBar(nameModels = [], filteredCount = 0, chapterCount = 0) {
  const filters = projectDetailsNameListFilter || {};
  const activePanel = projectDetailsNameControlPanel || '';
  const isFilterOpen = activePanel === 'filter';
  const isSortOpen = activePanel === 'sort';
  const activeFilterCount = [
    filters.categoryId && filters.categoryId !== 'all',
    filters.occurrenceRange && filters.occurrenceRange !== 'all',
    String(filters.chapterStart || '').trim() || String(filters.chapterEnd || '').trim()
  ].filter(Boolean).length;
  const sortLabels = {
    time: 'Time',
    occurrences: 'Occurrences',
    'chapter-index': 'Chapter Index'
  };
  const sortLabel = sortLabels[filters.sortBy || 'time'] || 'Time';
  const sortDirection = projectDetailsNormalizeNameSortDirection(filters.sortDirection, filters.sortBy || 'time');
  const sortDirectionLabel = sortDirection === 'asc' ? 'Ascending' : 'Descending';
  const sortDirectionNextLabel = sortDirection === 'asc' ? 'descending' : 'ascending';
  const sortDirectionIconClass = sortDirection === 'asc'
    ? 'project-details-name-sort-direction-svg is-ascending'
    : 'project-details-name-sort-direction-svg';
  const sortDirectionIcon = typeof window.lmIcon === 'function'
    ? window.lmIcon('sortDirectionBars', sortDirectionIconClass)
    : '';
  const categoryOptions = [...new Map(nameModels
    .map(model => model.category || { id: model.entry?.categoryId || 'default', title: 'Naming' })
    .filter(category => category?.id)
    .map(category => [category.id, category])).values()]
    .sort((left, right) => String(left.title || '').localeCompare(String(right.title || '')));
  const categoryTitle = filters.categoryId && filters.categoryId !== 'all'
    ? categoryOptions.find(category => category.id === filters.categoryId)?.title || 'Selected'
    : 'All';
  const occurrenceLabels = {
    all: 'All',
    '50+': '50 से अधिक',
    '200+': '200 से अधिक',
    '500+': '500 से अधिक'
  };
  const occurrenceStatus = occurrenceLabels[filters.occurrenceRange || 'all'] || 'All';
  const chapterStart = String(filters.chapterStart || '').trim();
  const chapterEnd = String(filters.chapterEnd || '').trim();
  const chapterStatus = chapterStart || chapterEnd
    ? `${chapterStart || '1'} - ${chapterEnd || chapterCount || 'All'}`
    : 'All chapters';
  const filterViews = ['category', 'occurrence', 'chapter'];
  if (!filterViews.includes(projectDetailsNameFilterView)) projectDetailsNameFilterView = 'category';
  const activeFilterView = projectDetailsNameFilterView;
  const filterViewButton = (view, label, status) => `
    <button class="project-details-name-filter-view-btn ${activeFilterView === view ? 'is-active' : ''}" type="button"
      data-project-details-name-filter-view="${projectDetailsEscapeHtml(view)}" aria-pressed="${activeFilterView === view ? 'true' : 'false'}">
      <span>${projectDetailsEscapeHtml(label)}</span>
      <strong>${projectDetailsEscapeHtml(status)}</strong>
    </button>
  `;
  const filterOptionButton = (key, value, label, selectedValue) => `
    <button class="project-details-name-filter-option ${selectedValue === value ? 'is-active' : ''}" type="button"
      data-project-details-name-filter-option="${projectDetailsEscapeHtml(key)}"
      data-value="${projectDetailsEscapeHtml(value)}"
      aria-pressed="${selectedValue === value ? 'true' : 'false'}">
      <span>${projectDetailsEscapeHtml(label)}</span>
    </button>
  `;
  const sortOptionButton = (value, label) => `
    <button class="project-details-name-filter-option ${String(filters.sortBy || 'time') === value ? 'is-active' : ''}" type="button"
      data-project-details-name-sort-option="${projectDetailsEscapeHtml(value)}"
      aria-pressed="${String(filters.sortBy || 'time') === value ? 'true' : 'false'}">
      <span>${projectDetailsEscapeHtml(label)}</span>
    </button>
  `;
  const filterContent = {
    category: `
      <div class="project-details-name-filter-option-group" aria-label="Filter names by category">
        <span>Category</span>
        <div class="project-details-name-filter-option-list">
          ${filterOptionButton('categoryId', 'all', 'All', filters.categoryId || 'all')}
          ${categoryOptions.map(category =>
            filterOptionButton('categoryId', category.id, category.title || 'Naming', filters.categoryId || 'all')
          ).join('')}
        </div>
      </div>
    `,
    occurrence: `
      <div class="project-details-name-filter-option-group" aria-label="Filter names by occurrence count">
        <span>Occurrences</span>
        <div class="project-details-name-filter-option-list">
          ${filterOptionButton('occurrenceRange', 'all', 'All', filters.occurrenceRange || 'all')}
          ${filterOptionButton('occurrenceRange', '50+', '50 से अधिक', filters.occurrenceRange || 'all')}
          ${filterOptionButton('occurrenceRange', '200+', '200 से अधिक', filters.occurrenceRange || 'all')}
          ${filterOptionButton('occurrenceRange', '500+', '500 से अधिक', filters.occurrenceRange || 'all')}
        </div>
      </div>
    `,
    chapter: `
      <div class="project-details-name-filter-range" aria-label="Chapter range">
        <span>Chapter Area</span>
        <div class="project-details-name-number-control">
          <input class="project-details-name-number-input" data-project-details-name-chapter-start type="number" min="1" ${chapterCount ? `max="${projectDetailsEscapeHtml(chapterCount)}"` : ''} inputmode="numeric"
            placeholder="1" value="${projectDetailsEscapeHtml(filters.chapterStart || '')}" aria-label="Chapter range start">
          <span class="project-details-name-number-stepper" aria-label="Chapter range start controls">
            <button class="project-details-name-number-step" type="button" data-project-details-name-chapter-step="start" data-step="1" aria-label="Increase chapter start">
              <span data-lm-icon="collapseChevron" data-lm-icon-class="step-chevron-svg lm-chevron-up"></span>
            </button>
            <button class="project-details-name-number-step" type="button" data-project-details-name-chapter-step="start" data-step="-1" aria-label="Decrease chapter start">
              <span data-lm-icon="collapseChevron" data-lm-icon-class="step-chevron-svg lm-chevron-down"></span>
            </button>
          </span>
        </div>
        <i>to</i>
        <div class="project-details-name-number-control">
          <input class="project-details-name-number-input" data-project-details-name-chapter-end type="number" min="1" ${chapterCount ? `max="${projectDetailsEscapeHtml(chapterCount)}"` : ''} inputmode="numeric"
            placeholder="${projectDetailsEscapeHtml(chapterCount || 0)}" value="${projectDetailsEscapeHtml(filters.chapterEnd || '')}" aria-label="Chapter range end">
          <span class="project-details-name-number-stepper" aria-label="Chapter range end controls">
            <button class="project-details-name-number-step" type="button" data-project-details-name-chapter-step="end" data-step="1" aria-label="Increase chapter end">
              <span data-lm-icon="collapseChevron" data-lm-icon-class="step-chevron-svg lm-chevron-up"></span>
            </button>
            <button class="project-details-name-number-step" type="button" data-project-details-name-chapter-step="end" data-step="-1" aria-label="Decrease chapter end">
              <span data-lm-icon="collapseChevron" data-lm-icon-class="step-chevron-svg lm-chevron-down"></span>
            </button>
          </span>
        </div>
      </div>
    `
  }[activeFilterView];

  return `
    <div class="project-details-name-filter-bar" role="region" aria-label="Filter and sort names">
      <div class="project-details-name-filter-toolbar">
        <button class="project-details-name-control-btn ${isFilterOpen ? 'is-active' : ''}" type="button"
          data-project-details-name-control-panel="filter" aria-expanded="${isFilterOpen ? 'true' : 'false'}"
          aria-controls="projectDetailsNameFilterPanel">
          <span>Filter</span>
          <strong>${projectDetailsEscapeHtml(activeFilterCount)}</strong>
        </button>
        <button class="project-details-name-control-btn ${isSortOpen ? 'is-active' : ''}" type="button"
          data-project-details-name-control-panel="sort" aria-expanded="${isSortOpen ? 'true' : 'false'}"
          aria-controls="projectDetailsNameSortPanel">
          <span>Sort</span>
          <strong>${projectDetailsEscapeHtml(sortLabel)}</strong>
        </button>
      </div>
      <strong class="project-details-name-filter-count">${projectDetailsEscapeHtml(filteredCount)} / ${projectDetailsEscapeHtml(nameModels.length)}</strong>
      <div id="projectDetailsNameFilterPanel" class="project-details-name-control-panel is-floating is-filter" ${isFilterOpen ? '' : 'hidden'}>
        <div class="project-details-name-panel-head">
          <span>Filter Names</span>
          <strong>${activeFilterCount ? `${projectDetailsEscapeHtml(activeFilterCount)} active` : 'All names'}</strong>
        </div>
        <div class="project-details-name-control-grid">
          <div class="project-details-name-filter-tabs" role="tablist" aria-label="Name filter controls">
            ${filterViewButton('category', 'Category', categoryTitle)}
            ${filterViewButton('occurrence', 'Occurrences', occurrenceStatus)}
            ${filterViewButton('chapter', 'Chapter Area', chapterStatus)}
          </div>
          <div class="project-details-name-filter-content" data-project-details-name-filter-content="${projectDetailsEscapeHtml(activeFilterView)}">
            ${filterContent}
          </div>
        </div>
        <div class="project-details-name-panel-actions">
          <button class="project-details-name-filter-reset" type="button" data-project-details-name-filter-reset>Reset Filter</button>
          <button class="project-details-name-filter-close" type="button" data-project-details-name-control-close>Close</button>
        </div>
      </div>
      <div id="projectDetailsNameSortPanel" class="project-details-name-control-panel is-floating is-sort" ${isSortOpen ? '' : 'hidden'}>
        <div class="project-details-name-panel-head">
          <span>Sort Names</span>
          <strong>${projectDetailsEscapeHtml(sortLabel)} / ${projectDetailsEscapeHtml(sortDirectionLabel)}</strong>
        </div>
        <div class="project-details-name-control-grid">
          <div class="project-details-name-filter-option-group" aria-label="Sort names">
            <div class="project-details-name-filter-group-head">
              <span>Sort</span>
              <button class="project-details-name-sort-direction-btn" type="button"
                data-project-details-name-sort-direction="${projectDetailsEscapeHtml(sortDirection)}"
                aria-label="Switch to ${projectDetailsEscapeHtml(sortDirectionNextLabel)} sort"
                title="Switch to ${projectDetailsEscapeHtml(sortDirectionNextLabel)} sort">
                ${sortDirectionIcon || `<span>${sortDirection === 'asc' ? 'Asc' : 'Desc'}</span>`}
              </button>
            </div>
            <div class="project-details-name-filter-option-list">
              ${sortOptionButton('time', 'Time')}
              ${sortOptionButton('occurrences', 'Occurrences')}
              ${sortOptionButton('chapter-index', 'Chapter Index')}
            </div>
          </div>
        </div>
        <div class="project-details-name-panel-actions">
          <button class="project-details-name-filter-reset" type="button" data-project-details-name-sort-reset>Reset Sort</button>
          <button class="project-details-name-filter-close" type="button" data-project-details-name-control-close>Close</button>
        </div>
      </div>
    </div>
  `;
}

function projectDetailsPanelNumber(value, fallback = 0) {
  if (typeof window.lmPanelNumber === 'function') return window.lmPanelNumber(value, fallback);
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function projectDetailsNameControlPositionKey(panelName = '') {
  return panelName === 'sort'
    ? 'projectDetailsNameSortPanel'
    : 'projectDetailsNameFilterPanel';
}

function projectDetailsPositionNameControlPanel(panelName = projectDetailsNameControlPanel) {
  if (!panelName) return;
  const positionKey = projectDetailsNameControlPositionKey(panelName);
  const panel = document.getElementById(positionKey);
  const anchor = document.querySelector(`[data-project-details-name-control-panel="${panelName}"]`);
  if (!panel || !anchor || panel.hidden) return;

  const fallback = {
    gap: 8,
    topOffset: 6,
    leftOffset: 0,
    rightOffset: 0,
    panelWidth: panelName === 'sort' ? 235 : 318,
    viewportPadding: 12
  };
  const positionConfig = window.lmFloatingPanelPositionConfig?.(panel, fallback, { positionKey }) || fallback;
  const viewportPadding = projectDetailsPanelNumber(positionConfig.viewportPadding, 12);
  const panelWidth = Math.min(
    projectDetailsPanelNumber(positionConfig.panelWidth, fallback.panelWidth),
    Math.max(180, window.innerWidth - viewportPadding * 2)
  );

  panel.style.position = 'fixed';
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.width = `${panelWidth}px`;
  panel.style.maxWidth = `calc(100vw - ${viewportPadding * 2}px)`;
  panel.style.visibility = 'hidden';
  panel.style.left = `${viewportPadding}px`;
  panel.style.top = `${viewportPadding}px`;

  requestAnimationFrame(() => {
    if (panel.hidden) return;
    const gap = projectDetailsPanelNumber(positionConfig.gap, fallback.gap);
    const anchorRect = anchor.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const width = panelRect.width || panelWidth;
    const height = panelRect.height || 220;
    const minLeft = viewportPadding;
    const minTop = viewportPadding;
    const maxLeft = Math.max(minLeft, window.innerWidth - width - viewportPadding);
    const alignToEnd = panelName === 'sort';
    let left = alignToEnd ? anchorRect.right - width : anchorRect.left;
    let top = anchorRect.bottom + gap;

    const offsetPosition = window.lmApplyFloatingPanelPositionOffsets?.(
      { left, top },
      panel,
      positionConfig,
      { positionKey }
    ) || { left, top };

    left = Math.min(Math.max(offsetPosition.left, minLeft), maxLeft);
    top = Math.max(offsetPosition.top, minTop);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.visibility = '';
  });
}

function projectDetailsSyncNameControlPanelPosition() {
  if (!projectDetailsNameControlPanel) return;
  requestAnimationFrame(() => projectDetailsPositionNameControlPanel(projectDetailsNameControlPanel));
}

function projectDetailsCloseNameControlPanel() {
  if (!projectDetailsNameControlPanel) return false;
  projectDetailsNameControlPanel = '';
  projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
  return true;
}

function projectDetailsBindNameControlOutsideClose() {
  if (projectDetailsNameControlOutsideCloseBound) return;
  projectDetailsNameControlOutsideCloseBound = true;
  document.addEventListener('click', event => {
    if (!projectDetailsNameControlPanel && !projectDetailsFactControlPanel) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('.project-details-name-filter-bar, .project-details-name-control-panel, .project-details-fact-control-bar, .project-details-fact-control-panel')) return;
    projectDetailsCloseNameControlPanel();
    projectDetailsCloseFactControlPanel();
  });
}

function projectDetailsApplyNameSort(sortBy = 'time', options = {}) {
  const allowedSorts = new Set(['time', 'occurrences', 'chapter-index']);
  const nextSortBy = allowedSorts.has(sortBy) ? sortBy : 'time';
  const previousSortBy = projectDetailsNameListFilter?.sortBy || 'time';
  const previousDirection = projectDetailsNormalizeNameSortDirection(projectDetailsNameListFilter?.sortDirection, previousSortBy);
  const nextDirection = options.resetDirection || nextSortBy !== previousSortBy
    ? projectDetailsDefaultNameSortDirection(nextSortBy)
    : previousDirection;
  projectDetailsNameListFilter = {
    ...projectDetailsNameListFilter,
    sortBy: nextSortBy,
    sortDirection: nextDirection
  };
  projectDetailsSelectedNameId = '';
  projectDetailsNameControlPanel = 'sort';
  projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
}

function projectDetailsToggleNameSortDirection() {
  const sortBy = projectDetailsNameListFilter?.sortBy || 'time';
  const currentDirection = projectDetailsNormalizeNameSortDirection(projectDetailsNameListFilter?.sortDirection, sortBy);
  projectDetailsNameListFilter = {
    ...projectDetailsNameListFilter,
    sortDirection: currentDirection === 'asc' ? 'desc' : 'asc'
  };
  projectDetailsSelectedNameId = '';
  projectDetailsNameControlPanel = 'sort';
  projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
}

function projectDetailsClampNumber(value, min, max) {
  const lower = Number.isFinite(min) ? min : Number.MIN_SAFE_INTEGER;
  const upper = Number.isFinite(max) ? max : Number.MAX_SAFE_INTEGER;
  return Math.min(Math.max(value, lower), upper);
}

function projectDetailsAdjustChapterRangeInput(button, grid) {
  const fieldName = button?.dataset?.projectDetailsNameChapterStep;
  const delta = Number(button?.dataset?.step || 0);
  if (!fieldName || !delta) return false;

  const selector = fieldName === 'end'
    ? '[data-project-details-name-chapter-end]'
    : '[data-project-details-name-chapter-start]';
  const input = grid.querySelector(selector);
  if (!input) return false;

  const min = Number(input.min || 1);
  const max = Number(input.max);
  const fallback = Number(input.value || input.placeholder || min);
  const nextValue = projectDetailsClampNumber(
    Math.round((Number.isFinite(fallback) ? fallback : min) + delta),
    Number.isFinite(min) ? min : 1,
    Number.isFinite(max) ? max : Number.MAX_SAFE_INTEGER
  );

  input.value = String(nextValue);
  projectDetailsNameListFilter = {
    ...projectDetailsNameListFilter,
    chapterStart: grid.querySelector('[data-project-details-name-chapter-start]')?.value || '',
    chapterEnd: grid.querySelector('[data-project-details-name-chapter-end]')?.value || ''
  };
  projectDetailsSelectedNameId = '';
  projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
  return true;
}

function projectDetailsRenderNameAppearances(rows = [], entry = {}) {
  if (!rows.length) {
    return '<div class="project-details-empty-row">No text appearance found in chapters or drafts.</div>';
  }
  const sortedRows = projectDetailsSortAppearanceRows(rows);
  return `
    <div class="project-details-name-appearance-list">
      ${sortedRows.filter(row => row?.documentItem?.id).map(row => `
        <button class="project-details-name-appearance-row" type="button"
          data-project-details-name-appearance-document="${projectDetailsEscapeHtml(row.documentItem.id)}"
          data-project-details-name-appearance-entry="${projectDetailsEscapeHtml(entry.id || '')}">
          <span>${projectDetailsEscapeHtml(projectDetailsDocumentTypeLabel(row.documentItem))}</span>
          <b>${projectDetailsEscapeHtml(row.documentItem.title)}</b>
          <strong>${projectDetailsEscapeHtml(row.count)}x</strong>
        </button>
      `).join('')}
    </div>
  `;
}

function projectDetailsSortAppearanceRows(rows = []) {
  const typeRank = documentItem => {
    if (documentItem?.type === 'chapter') return 0;
    if (documentItem?.type === 'draft') return 1;
    return 2;
  };
  const documentIndex = documentItem => {
    if (Number.isInteger(documentItem?.index)) return documentItem.index;
    const numericNo = Number(documentItem?.no);
    return Number.isFinite(numericNo) ? numericNo - 1 : Number.MAX_SAFE_INTEGER;
  };

  return [...rows].sort((left, right) => {
    const leftDocument = left.documentItem || {};
    const rightDocument = right.documentItem || {};
    const rankDiff = typeRank(leftDocument) - typeRank(rightDocument);
    if (rankDiff) return rankDiff;
    const indexDiff = documentIndex(leftDocument) - documentIndex(rightDocument);
    if (indexDiff) return indexDiff;
    return String(leftDocument.title || '').localeCompare(String(rightDocument.title || ''));
  });
}

function projectDetailsRenderNameHistory(entry = {}) {
  const history = Array.isArray(entry.descriptionHistory)
    ? entry.descriptionHistory.map((item, index) => ({ item, index })).reverse()
    : [];
  if (!history.length) {
    return '<div class="project-details-empty-row">No description edit history recorded.</div>';
  }
  return `
    <div class="project-details-name-history-list">
      ${history.slice(0, 5).map(({ item, index }) => `
        <button class="project-details-name-history-row" type="button"
          data-project-details-name-history-entry="${projectDetailsEscapeHtml(entry.id || '')}"
          data-project-details-name-history-index="${projectDetailsEscapeHtml(index)}">
          <span>${projectDetailsEscapeHtml(projectDetailsTimeLabel(item.editedAt) || projectDetailsDateLabel(item.editedAt))}</span>
          <b>${projectDetailsEscapeHtml(projectDetailsMetaLabel(item.chapterMeta))}</b>
        </button>
      `).join('')}
    </div>
  `;
}

function openProjectDetailsNameAppearancePreview(documentId = '', entryId = '') {
  const entry = (namingData.entries || []).find(item => item.id === entryId);
  if (!entry) return;
  openProjectDetailsDocumentPreview(documentId, {
    mentionTerm: entry.name,
    mentionIndex: 0
  });
}

function projectDetailsRenderNameDetailIcon(kind = 'name', toneClass = 'has-no-mentions') {
  const isFact = kind === 'fact';
  return `
    <span class="project-details-name-detail-icon ${isFact ? `is-fact ${projectDetailsEscapeHtml(toneClass)}` : `is-name ${projectDetailsEscapeHtml(toneClass)}`}" aria-hidden="true">
      ${isFact
        ? `<svg viewBox="0 0 24 24" focusable="false">
            <path d="M7 4h10l-1 5 3 3v2H5v-2l3-3-1-5Z"></path>
            <path d="M12 14v6"></path>
            <path d="M9 20h6"></path>
          </svg>`
        : `<svg viewBox="0 0 24 24" focusable="false">
            <path d="M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"></path>
            <path d="M3.5 20.5c.55-3.35 2.35-5.15 5-5.15s4.45 1.8 5 5.15"></path>
            <path d="M15.5 7.5h5"></path>
            <path d="M15.5 12h4"></path>
            <path d="M15.5 16.5h5"></path>
          </svg>`}
    </span>
  `;
}

function projectDetailsRenderNameDetail(model = null, documents = []) {
  if (!model?.entry) {
    return `
      <article class="project-details-name-detail-panel is-empty">
        <strong>No name selected</strong>
        <p>Select a name from the list to inspect its attachment, appearances, and description history.</p>
      </article>
    `;
  }

  const entry = model.entry;
  const description = projectDetailsEntityDescription(entry.description, model.category?.info || 'No description saved for this name.');
  const definedIn = projectDetailsDefinedInInfo(entry, documents);
  const mentionClass = projectDetailsNameMentionClass(model.totalMentions);
  const isEditingTitle = projectDetailsEditingNameTitleId === entry.id;
  const editIcon = typeof window.lmIcon === 'function'
    ? window.lmIcon('edit', 'project-details-name-title-action-svg')
    : '';

  return `
    <article class="project-details-name-detail-panel">
      <div class="project-details-name-detail-top-group">
        <div class="project-details-name-detail-title">
          ${projectDetailsRenderNameDetailIcon('name', mentionClass)}
          <div class="project-details-name-detail-title-copy ${isEditingTitle ? 'is-editing' : ''}">
            ${isEditingTitle
              ? `<input class="project-details-name-title-input" type="text"
                  data-project-details-title-edit-input
                  data-project-details-name-title-input="${projectDetailsEscapeHtml(entry.id)}"
                  value="${projectDetailsEscapeHtml(entry.name)}"
                  aria-label="Edit name">`
              : `<h4>${projectDetailsEscapeHtml(entry.name)}</h4>`}
            <span>${projectDetailsEscapeHtml(model.category?.title || 'Naming')}</span>
          </div>
          <div class="project-details-name-detail-actions">
            <small class="${projectDetailsEscapeHtml(mentionClass)}">${projectDetailsEscapeHtml(projectDetailsMentionLabel(model.totalMentions))}</small>
            <div class="project-details-name-title-action-row">
              ${isEditingTitle
                ? `<button class="project-details-name-title-save" type="button"
                    data-project-details-name-title-save="${projectDetailsEscapeHtml(entry.id)}">Save</button>
                  <button class="project-details-name-title-cancel" type="button"
                    data-project-details-title-edit-cancel>Cancel</button>`
                : `<button class="project-details-name-edit-btn" type="button"
                    data-project-details-name-title-edit="${projectDetailsEscapeHtml(entry.id)}"
                    aria-label="Edit ${projectDetailsEscapeHtml(entry.name)}">
                    ${editIcon}<span>Edit</span>
                  </button>`}
              <button class="project-details-name-delete-btn" type="button"
                data-project-details-name-delete="${projectDetailsEscapeHtml(entry.id)}"
                aria-label="Delete ${projectDetailsEscapeHtml(entry.name)}">Delete</button>
            </div>
          </div>
        </div>
        <div class="project-details-name-detail-summary-row">
          <div class="project-details-mini-grid is-name-detail">
            <div class="project-details-mini-stat is-defined-in">
              <span>Defined In</span>
              <strong>
                <b>${projectDetailsEscapeHtml(definedIn.title)}</b>
                <em class="project-details-defined-status is-${projectDetailsEscapeHtml(definedIn.statusClass)} ${projectDetailsEscapeHtml(mentionClass)}">${projectDetailsEscapeHtml(definedIn.statusTitle)}</em>
              </strong>
            </div>
          </div>
          <section class="project-details-name-detail-block">
            <span>Description</span>
            <p>${projectDetailsEscapeHtml(description)}</p>
          </section>
        </div>
      </div>
      <div class="project-details-name-detail-block-row">
        <section class="project-details-name-detail-block">
          <span>Appearances</span>
          ${projectDetailsRenderNameAppearances(model.rows, entry)}
        </section>
        <section class="project-details-name-detail-block">
          <span>Recent Description Edits</span>
          ${projectDetailsRenderNameHistory(entry)}
        </section>
      </div>
    </article>
  `;
}

function projectDetailsFactAttachedLabel(fact = {}, documents = []) {
  const match = documents.find(documentItem => projectDetailsFactDocumentMatches(fact, documentItem));
  if (match) return match.title;
  if (fact.documentType === 'draft') return fact.draftTitle || (fact.draftNo ? `Draft ${fact.draftNo}` : 'Draft');
  return fact.chapterTitle || 'Project level';
}

function projectDetailsFactChapterEditKey(meta = {}) {
  if (!meta || typeof meta !== 'object') return '';
  const status = String(meta.chapterStatus || meta.documentType || '').toLowerCase();
  if (status && status !== 'chapter') return '';
  const path = projectDetailsNormalizePath(meta.chapterKey || meta.contentPath || '');
  if (path) return `path:${path}`;
  if (Number.isInteger(meta.chapterIndex)) return `index:${meta.chapterIndex}`;
  if (meta.chapterNo) return `no:${meta.chapterNo}`;
  const title = projectDetailsNormalizeTitle(meta.chapterTitle);
  return title ? `title:${title}` : '';
}

function projectDetailsFactEditedChapterCount(fact = {}, documents = []) {
  const editedChapters = new Set();
  const addMeta = meta => {
    const key = projectDetailsFactChapterEditKey(meta);
    if (key) editedChapters.add(key);
  };

  (Array.isArray(fact.descriptionHistory) ? fact.descriptionHistory : []).forEach(historyItem => {
    addMeta(historyItem?.chapterMeta || historyItem?.meta || historyItem?.descriptionMeta || historyItem);
  });

  if (!editedChapters.size && fact.updatedAt && fact.createdAt && fact.updatedAt !== fact.createdAt) {
    const matchedChapter = documents.find(documentItem =>
      documentItem.type === 'chapter' && projectDetailsFactDocumentMatches(fact, documentItem)
    );
    if (matchedChapter) {
      addMeta(projectDetailsChapterDescriptionMeta(matchedChapter, fact.updatedAt));
    } else {
      addMeta(fact);
    }
  }

  return editedChapters.size;
}

function projectDetailsFactEditToneClass(editedChapterCount = 0) {
  return Number(editedChapterCount || 0) > 0 ? 'has-edited-chapters' : 'has-no-edited-chapters';
}

function projectDetailsFactLatestTime(fact = {}) {
  const historyTimes = (Array.isArray(fact.descriptionHistory) ? fact.descriptionHistory : [])
    .map(item => item?.editedAt || item?.updatedAt || item?.createdAt);
  const times = [fact.updatedAt, fact.createdAt, ...historyTimes]
    .map(value => new Date(value).getTime())
    .filter(value => Number.isFinite(value));
  return times.length ? Math.max(...times) : 0;
}

function projectDetailsFactAttachedChapterIndex(fact = {}, documents = []) {
  const match = documents.find(documentItem =>
    documentItem.type === 'chapter' && projectDetailsFactDocumentMatches(fact, documentItem)
  );
  if (match && Number.isInteger(match.index)) return match.index + 1;
  if (Number.isInteger(fact.chapterIndex) && fact.chapterIndex >= 0) return fact.chapterIndex + 1;
  const numericNo = Number(fact.chapterNo);
  return Number.isFinite(numericNo) && numericNo > 0 ? numericNo : Number.MAX_SAFE_INTEGER;
}

function projectDetailsDefaultFactSortDirection(sortBy = 'time') {
  return sortBy === 'chapter-index' ? 'asc' : 'desc';
}

function projectDetailsNormalizeFactSortDirection(direction = '', sortBy = 'time') {
  const normalizedDirection = String(direction || '').toLowerCase();
  return normalizedDirection === 'asc' || normalizedDirection === 'desc'
    ? normalizedDirection
    : projectDetailsDefaultFactSortDirection(sortBy);
}

function projectDetailsCompareFactModels(left = {}, right = {}) {
  const sortBy = projectDetailsFactListFilter?.sortBy || 'time';
  const sortDirection = projectDetailsNormalizeFactSortDirection(projectDetailsFactListFilter?.sortDirection, sortBy);
  const directionMultiplier = projectDetailsNameSortDirectionMultiplier(sortDirection);
  if (sortBy === 'edited-chapters') {
    const diff = Number(left.editedChapterCount || 0) - Number(right.editedChapterCount || 0);
    if (diff) return diff * directionMultiplier;
  } else if (sortBy === 'chapter-index') {
    const diff = Number(left.attachedChapterIndex || Number.MAX_SAFE_INTEGER) -
      Number(right.attachedChapterIndex || Number.MAX_SAFE_INTEGER);
    if (diff) return diff * directionMultiplier;
  } else {
    const diff = Number(left.latestTime || 0) - Number(right.latestTime || 0);
    if (diff) return diff * directionMultiplier;
  }

  return String(left.fact?.keyword || '').localeCompare(String(right.fact?.keyword || ''));
}

function projectDetailsSortedFactModels(models = []) {
  return [...models].sort(projectDetailsCompareFactModels);
}

function projectDetailsRenderFactListAvatar(toneClass = 'has-no-edited-chapters') {
  const safeToneClass = projectDetailsEscapeHtml(toneClass);
  const iconHtml = typeof window.lmIcon === 'function'
    ? window.lmIcon('factNoEditedChapters')
    : '';
  return `
    <span class="project-details-name-list-avatar is-fact ${safeToneClass}" aria-hidden="true">
      ${iconHtml || 'F'}
    </span>
  `;
}

function projectDetailsFactViewModels(documents = []) {
  return (storyFacts || []).map((fact, index) => {
    const editedChapterCount = projectDetailsFactEditedChapterCount(fact, documents);
    const rows = projectDetailsDocumentRowsForTerm(documents, fact.keyword);
    const attachedChapterIndex = projectDetailsFactAttachedChapterIndex(fact, documents);
    return {
      fact,
      key: projectDetailsDetailKey('fact', fact, index),
      rows,
      totalMentions: rows.reduce((sum, row) => sum + row.count, 0),
      editedChapterCount,
      editToneClass: projectDetailsFactEditToneClass(editedChapterCount),
      attachedLabel: projectDetailsFactAttachedLabel(fact, documents),
      attachedChapterIndex,
      latestTime: projectDetailsFactLatestTime(fact)
    };
  });
}

function projectDetailsRenderFactListItem(model = {}, isActive = false) {
  const fact = model.fact || {};
  const toneClass = projectDetailsFactEditToneClass(model.editedChapterCount);
  const pinIcon = typeof window.lmIcon === 'function'
    ? window.lmIcon('factPin', 'project-details-fact-pin-svg')
    : '';
  return `
    <div class="project-details-name-list-item is-fact ${projectDetailsEscapeHtml(toneClass)} ${fact.pinned ? 'is-pinned' : ''} ${isActive ? 'is-active' : ''}">
      <button class="project-details-fact-list-main" type="button"
        data-project-details-fact-id="${projectDetailsEscapeHtml(model.key)}"
        aria-pressed="${isActive ? 'true' : 'false'}">
        ${projectDetailsRenderFactListAvatar(toneClass)}
        <span class="project-details-name-list-copy">
          <b>${projectDetailsEscapeHtml(fact.keyword)}</b>
          <small>${projectDetailsEscapeHtml(model.attachedLabel || 'Project level')}</small>
        </span>
        <strong title="Edited chapter descriptions" aria-label="${projectDetailsEscapeHtml(model.editedChapterCount)} chapters with edited fact descriptions">${projectDetailsEscapeHtml(model.editedChapterCount)}</strong>
      </button>
      <button class="project-details-fact-pin-btn ${fact.pinned ? 'is-active' : ''}" type="button"
        data-project-details-fact-pin="${projectDetailsEscapeHtml(model.key)}"
        aria-pressed="${fact.pinned ? 'true' : 'false'}"
        aria-label="${fact.pinned ? 'Unpin fact' : 'Pin fact'}"
        title="${fact.pinned ? 'Unpin fact' : 'Pin fact'}">
        ${pinIcon || 'Pin'}
      </button>
    </div>
  `;
}

