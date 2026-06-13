const PROJECT_DETAILS_MAX_CHIPS = 8;
let projectDetailsCurrentState = null;
let projectDetailsEditLastFocus = null;
let projectDetailsDocumentMode = '';
let projectDetailsSelectedDocumentId = '';
let projectDetailsActiveDocumentInfoPanel = 'attached-names';
let projectDetailsLastRenderedDocumentId = '';
let projectDetailsShouldFocusDocumentInfoButton = false;
let projectDetailsSelectedDetectedNameKey = '';
let projectDetailsSelectedFactKey = '';
let projectDetailsEditingNameDescriptionId = '';
let projectDetailsShouldFocusDescriptionEditor = false;
let projectDetailsSelectedNameId = '';
let projectDetailsNotesMode = 'names';
let projectDetailsSelectedFactId = '';
let projectDetailsNameControlPanel = '';
let projectDetailsNameFilterView = 'category';
let projectDetailsNameControlOutsideCloseBound = false;
let projectDetailsFactControlPanel = '';
let projectDetailsEditingNameTitleId = '';
let projectDetailsEditingFactTitleId = '';
let projectDetailsShouldFocusTitleEditor = false;
let projectDetailsPreviewLastFocus = null;
let projectDetailsPreviewMentionIndex = 0;
let projectDetailsNameHistoryLastFocus = null;
let projectDetailsStoryLibraryLoading = false;
let projectDetailsGraphDocumentFilter = 'all';
let projectDetailsGraphSelectedDocumentId = '';
let projectDetailsGraphEntityMode = 'names';
let projectDetailsGraphSelectedEntityKeys = [];
let projectDetailsNameListFilter = {
  categoryId: 'all',
  occurrenceRange: 'all',
  chapterStart: '',
  chapterEnd: '',
  sortBy: 'time',
  sortDirection: 'desc'
};
let projectDetailsFactListFilter = {
  sortBy: 'time',
  sortDirection: 'desc'
};

const PROJECT_DETAILS_PREVIEW_MODAL_ID = 'projectDetailsDocumentPreviewModal';
const PROJECT_DETAILS_PREVIEW_TEXT_ID = 'projectDetailsDocumentPreviewText';
const PROJECT_DETAILS_PREVIEW_MENTION_CONTROLS_ID = 'projectDetailsDocumentPreviewMentionControls';
const PROJECT_DETAILS_NAME_HISTORY_MODAL_ID = 'projectDetailsNameHistoryModal';
const PROJECT_DETAILS_NAME_HISTORY_PANEL_ID = 'projectDetailsNameHistoryPanel';
const PROJECT_DETAILS_CUSTOM_SCROLL_SELECTOR = [
  '.project-details-edit-panel',
  '.project-details-document-preview-text',
  '.project-details-name-history-panel-body',
  '.project-details-document-sidebar',
  '.project-details-document-picker-list',
  '.project-details-name-picker-list',
  '.project-details-name-filter-option-list',
  '.project-details-document-detail-panel',
  '.project-details-name-detail-panel',
  '.project-details-document-info-block',
  '.project-details-graph-stage-body',
  '.project-details-graph-info-list'
].join(',');
let projectDetailsScrollThumbSeed = 0;
let projectDetailsScrollThumbDrag = null;
const projectDetailsScrollHideTimers = new Map();

function projectDetailsJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function projectDetailsStoredJson(key, fallback = null) {
  return projectDetailsJson(localStorage.getItem(key), fallback);
}

function projectDetailsClampNumber(value = 0, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function projectDetailsCssLength(style, propertyName = '', fallback = 0) {
  const rawValue = style?.getPropertyValue?.(propertyName)?.trim();
  if (!rawValue) return fallback;
  const numericValue = Number.parseFloat(rawValue);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function projectDetailsCustomScrollTargets(root = document) {
  const targets = [];
  if (root?.matches?.(PROJECT_DETAILS_CUSTOM_SCROLL_SELECTOR)) targets.push(root);
  targets.push(...(root?.querySelectorAll?.(PROJECT_DETAILS_CUSTOM_SCROLL_SELECTOR) || []));
  return [...new Set(targets)].filter(target => target instanceof HTMLElement);
}

function projectDetailsScrollTargetId(target) {
  if (!target.dataset.projectDetailsScrollId) {
    projectDetailsScrollThumbSeed += 1;
    target.dataset.projectDetailsScrollId = `project-details-scroll-${projectDetailsScrollThumbSeed}`;
  }
  return target.dataset.projectDetailsScrollId;
}

function projectDetailsScrollTargetById(scrollId = '') {
  return scrollId ? document.querySelector(`[data-project-details-scroll-id="${scrollId}"]`) : null;
}

function projectDetailsScrollTargetKind(target) {
  if (!target?.matches) return 'generic';
  if (target.matches('.project-details-document-picker-list')) return 'document-picker';
  if (target.matches('.project-details-name-picker-list')) return 'name-picker';
  if (target.matches('.project-details-document-info-block')) return 'document-info';
  if (target.matches('.project-details-document-sidebar')) return 'document-sidebar';
  if (target.matches('.project-details-document-detail-panel')) return 'document-detail';
  if (target.matches('.project-details-name-detail-panel')) return 'name-detail';
  if (target.matches('.project-details-graph-stage-body')) return 'graph-stage';
  if (target.matches('.project-details-graph-info-list')) return 'graph-info';
  if (target.matches('.project-details-edit-panel')) return 'edit-panel';
  if (target.matches('.project-details-document-preview-text')) return 'document-preview';
  if (target.matches('.project-details-name-history-panel-body')) return 'name-history';
  if (target.matches('.project-details-name-filter-option-list')) return 'name-filter-options';
  return 'generic';
}

function projectDetailsSyncScrollThumbKind(thumb, target) {
  if (!thumb) return;
  const kind = projectDetailsScrollTargetKind(target);
  thumb.dataset.projectDetailsScrollKind = kind;
  [...thumb.classList]
    .filter(className => /^is-.+-scroll-thumb$/.test(className))
    .forEach(className => thumb.classList.remove(className));
  thumb.classList.add(`is-${kind}-scroll-thumb`);
}

function projectDetailsEnsureScrollThumb(target) {
  if (!target) return null;
  const scrollId = projectDetailsScrollTargetId(target);
  let thumb = document.querySelector(`[data-project-details-scroll-thumb-for="${scrollId}"]`);
  if (!thumb) {
    thumb = document.createElement('div');
    thumb.className = 'project-details-scroll-thumb';
    thumb.hidden = true;
    thumb.setAttribute('aria-hidden', 'true');
    thumb.dataset.projectDetailsScrollThumbFor = scrollId;
    document.body.appendChild(thumb);
  }
  projectDetailsSyncScrollThumbKind(thumb, target);
  if (thumb.dataset.projectDetailsScrollThumbReady !== 'true') {
    thumb.dataset.projectDetailsScrollThumbReady = 'true';
    thumb.addEventListener('pointerdown', event => {
      const owner = projectDetailsScrollTargetById(thumb.dataset.projectDetailsScrollThumbFor || '');
      projectDetailsStartScrollThumbDrag(owner, event);
    });
    thumb.addEventListener('pointerenter', () => {
      const owner = projectDetailsScrollTargetById(thumb.dataset.projectDetailsScrollThumbFor || '');
      owner?.classList.add('is-scrollbar-hovered');
      projectDetailsUpdateScrollThumb(owner, true);
    });
    thumb.addEventListener('pointerleave', () => {
      if (projectDetailsScrollThumbDrag) return;
      const owner = projectDetailsScrollTargetById(thumb.dataset.projectDetailsScrollThumbFor || '');
      owner?.classList.remove('is-scrollbar-hovered');
      projectDetailsUpdateScrollThumb(owner, false);
    });
  }
  return thumb;
}

function projectDetailsScrollMetrics(target) {
  if (!target?.isConnected) return null;
  const thumb = projectDetailsEnsureScrollThumb(target);
  if (!thumb) return null;

  const style = window.getComputedStyle(target);
  const targetRect = target.getBoundingClientRect();
  const modalShell = target.closest?.(
    '.project-details-edit-modal, .project-details-document-preview-modal, .project-details-name-history-modal'
  );
  const modalHidden = Boolean(modalShell && !modalShell.classList.contains('is-visible'));
  const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
  const targetVisible =
    !target.hidden &&
    !modalHidden &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    targetRect.height > 0 &&
    target.clientHeight > 0;
  const isScrollable = targetVisible && maxScroll > 2;
  if (!isScrollable) return { thumb, target, maxScroll, targetVisible, isScrollable };

  const trackPadding = projectDetailsCssLength(style, '--project-details-scroll-thumb-track-padding', 12);
  const trackPaddingTop = projectDetailsCssLength(style, '--project-details-scroll-thumb-track-padding-top', trackPadding);
  const trackPaddingBottom = projectDetailsCssLength(style, '--project-details-scroll-thumb-track-padding-bottom', trackPadding);
  const trackTopOffset = projectDetailsCssLength(style, '--project-details-scroll-thumb-top-offset', 0);
  const trackBottomOffset = projectDetailsCssLength(style, '--project-details-scroll-thumb-bottom-offset', 0);
  const thumbRightOffset = projectDetailsCssLength(style, '--project-details-scroll-thumb-right-offset', 3);
  const thumbRightMin = projectDetailsCssLength(style, '--project-details-scroll-thumb-right-min', 6);
  const thumbWidth = projectDetailsCssLength(style, '--project-details-scroll-thumb-width', 6);
  const thumbMinHeight = projectDetailsCssLength(style, '--project-details-scroll-thumb-min-height', 30);
  const hoverWidth = projectDetailsCssLength(style, '--project-details-scroll-thumb-hover-width', 18);
  const hoverBleed = projectDetailsCssLength(style, '--project-details-scroll-thumb-hover-bleed', 8);
  const trackTop = targetRect.top + trackPaddingTop + trackTopOffset;
  const trackHeight = Math.max(34, targetRect.height - trackPaddingTop - trackPaddingBottom - trackTopOffset - trackBottomOffset);
  const thumbHeight = Math.min(trackHeight, Math.max(thumbMinHeight, (target.clientHeight / target.scrollHeight) * trackHeight));
  const scrollableTrack = Math.max(1, trackHeight - thumbHeight);
  const thumbRight = Math.max(thumbRightMin, window.innerWidth - targetRect.right + thumbRightOffset);

  return {
    thumb,
    target,
    maxScroll,
    targetRect,
    targetVisible,
    isScrollable,
    trackTop,
    trackHeight,
    thumbHeight,
    thumbWidth,
    scrollableTrack,
    thumbRight,
    hoverWidth,
    hoverBleed
  };
}

function projectDetailsUpdateScrollThumb(target, visible = false) {
  if (!target) return;
  const metrics = projectDetailsScrollMetrics(target);
  const thumb = metrics?.thumb || projectDetailsEnsureScrollThumb(target);
  if (!thumb) return;

  if (!metrics?.isScrollable) {
    thumb.hidden = true;
    thumb.classList.remove('is-visible', 'is-dragging');
    return;
  }

  const isDragging = projectDetailsScrollThumbDrag?.target === target;
  const shouldShow = Boolean(
    visible ||
    isDragging ||
    target.classList.contains('is-scrolling') ||
    target.classList.contains('is-scrollbar-hovered')
  );
  thumb.hidden = !shouldShow;
  thumb.classList.toggle('is-visible', shouldShow);
  if (!shouldShow) return;

  const thumbTop = metrics.trackTop + (target.scrollTop / metrics.maxScroll) * metrics.scrollableTrack;
  thumb.style.top = `${thumbTop}px`;
  thumb.style.right = `${metrics.thumbRight}px`;
  thumb.style.width = `${metrics.thumbWidth}px`;
  thumb.style.height = `${metrics.thumbHeight}px`;
}

function projectDetailsHandleScrollReveal(event) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;
  target.classList.add('is-scrolling');
  projectDetailsUpdateScrollThumb(target, true);
  const scrollId = projectDetailsScrollTargetId(target);
  clearTimeout(projectDetailsScrollHideTimers.get(scrollId));
  projectDetailsScrollHideTimers.set(scrollId, setTimeout(() => {
    target.classList.remove('is-scrolling');
    projectDetailsUpdateScrollThumb(target, false);
  }, 850));
}

function projectDetailsHandleScrollbarHover(event) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;
  const metrics = projectDetailsScrollMetrics(target);
  if (!metrics?.isScrollable) {
    target.classList.remove('is-scrollbar-hovered');
    projectDetailsUpdateScrollThumb(target, false);
    return;
  }

  const isInsideY = event.clientY >= metrics.targetRect.top && event.clientY <= metrics.targetRect.bottom;
  const isNearScrollbar =
    event.clientX >= metrics.targetRect.right - metrics.hoverWidth &&
    event.clientX <= metrics.targetRect.right + metrics.hoverBleed;
  target.classList.toggle('is-scrollbar-hovered', isInsideY && isNearScrollbar);
  projectDetailsUpdateScrollThumb(target, isInsideY && isNearScrollbar);
}

function projectDetailsClearScrollbarHover(event) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement) || projectDetailsScrollThumbDrag?.target === target) return;
  target.classList.remove('is-scrollbar-hovered');
  projectDetailsUpdateScrollThumb(target, false);
}

function projectDetailsStartScrollThumbDrag(target, event) {
  if (!target) return;
  const metrics = projectDetailsScrollMetrics(target);
  if (!metrics?.isScrollable) return;

  event.preventDefault();
  event.stopPropagation();
  const scrollId = projectDetailsScrollTargetId(target);
  clearTimeout(projectDetailsScrollHideTimers.get(scrollId));
  projectDetailsScrollThumbDrag = {
    target,
    pointerId: event.pointerId,
    startY: event.clientY,
    startScrollTop: target.scrollTop,
    maxScroll: metrics.maxScroll,
    scrollableTrack: metrics.scrollableTrack
  };
  target.classList.add('is-scrolling', 'is-scrollbar-hovered');
  metrics.thumb.classList.add('is-dragging');
  metrics.thumb.setPointerCapture?.(event.pointerId);
  projectDetailsUpdateScrollThumb(target, true);
}

function projectDetailsHandleScrollThumbDrag(event) {
  const drag = projectDetailsScrollThumbDrag;
  if (!drag || event.pointerId !== drag.pointerId || !drag.target?.isConnected) return;

  event.preventDefault();
  const deltaY = event.clientY - drag.startY;
  drag.target.scrollTop = projectDetailsClampNumber(
    drag.startScrollTop + (deltaY / drag.scrollableTrack) * drag.maxScroll,
    0,
    drag.maxScroll
  );
  projectDetailsUpdateScrollThumb(drag.target, true);
}

function projectDetailsEndScrollThumbDrag(event) {
  const drag = projectDetailsScrollThumbDrag;
  if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;

  const target = drag.target;
  const thumb = target?.dataset?.projectDetailsScrollId
    ? document.querySelector(`[data-project-details-scroll-thumb-for="${target.dataset.projectDetailsScrollId}"]`)
    : null;
  thumb?.releasePointerCapture?.(drag.pointerId);
  thumb?.classList.remove('is-dragging');
  projectDetailsScrollThumbDrag = null;
  target?.classList.remove('is-scrollbar-hovered');
  if (!target) return;

  const scrollId = projectDetailsScrollTargetId(target);
  clearTimeout(projectDetailsScrollHideTimers.get(scrollId));
  projectDetailsScrollHideTimers.set(scrollId, setTimeout(() => {
    target.classList.remove('is-scrolling');
    projectDetailsUpdateScrollThumb(target, false);
  }, 650));
}

function projectDetailsCleanupScrollThumbs() {
  document.querySelectorAll('.project-details-scroll-thumb[data-project-details-scroll-thumb-for]').forEach(thumb => {
    const scrollId = thumb.dataset.projectDetailsScrollThumbFor || '';
    if (!projectDetailsScrollTargetById(scrollId)) thumb.remove();
  });
}

function projectDetailsBindCustomScrollTarget(target) {
  if (!target) return;
  target.classList.add('project-details-custom-scroll-target');
  projectDetailsEnsureScrollThumb(target);
  if (target.dataset.projectDetailsCustomScrollReady === 'true') return;
  target.dataset.projectDetailsCustomScrollReady = 'true';
  target.addEventListener('scroll', projectDetailsHandleScrollReveal, { passive: true });
  target.addEventListener('pointermove', projectDetailsHandleScrollbarHover, { passive: true });
  target.addEventListener('pointerleave', projectDetailsClearScrollbarHover);
}

function projectDetailsSyncCustomScrollThumbs(root = document) {
  projectDetailsCleanupScrollThumbs();
  const targets = projectDetailsCustomScrollTargets(root);
  targets.forEach(projectDetailsBindCustomScrollTarget);
  requestAnimationFrame(() => targets.forEach(target => projectDetailsUpdateScrollThumb(target, false)));
}

function projectDetailsBindCustomScrollThumbEvents() {
  if (document.body?.dataset.projectDetailsCustomScrollEvents === 'true') return;
  if (document.body) document.body.dataset.projectDetailsCustomScrollEvents = 'true';
  document.addEventListener('pointermove', projectDetailsHandleScrollThumbDrag);
  document.addEventListener('pointerup', projectDetailsEndScrollThumbDrag);
  document.addEventListener('pointercancel', projectDetailsEndScrollThumbDrag);
  window.addEventListener('resize', () => projectDetailsSyncCustomScrollThumbs(), { passive: true });
  document.addEventListener('scroll', () => {
    projectDetailsCustomScrollTargets().forEach(target => {
      if (target.classList.contains('is-scrolling') || target.classList.contains('is-scrollbar-hovered')) {
        projectDetailsUpdateScrollThumb(target, true);
      }
    });
  }, { passive: true, capture: true });
}

function projectDetailsEscapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function projectDetailsDateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not saved';
  return date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function projectDetailsTimeLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function projectDetailsNormalizePath(value = '') {
  return String(value || '').replace(/\\/g, '/').trim();
}

function projectDetailsPlainTextFromHtml(value = '') {
  const template = document.createElement('template');
  template.innerHTML = String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '</p>\n');
  return (template.content.textContent || '').replace(/\u00a0/g, ' ').trimEnd();
}

function projectDetailsDocumentText(documentItem = {}) {
  if (typeof documentItem.fileText === 'string') return documentItem.fileText;
  if (/<[a-z][\s\S]*>/i.test(documentItem.content || '')) {
    return projectDetailsPlainTextFromHtml(documentItem.content);
  }
  return String(documentItem.content || '').replace(/\r\n?/g, '\n').trimEnd();
}

function projectDetailsNormalizePreviewFontSize(value, fallback = 16) {
  const rawValue = value === undefined || value === null || value === '' ? fallback : value;
  if (typeof normalizeEditorFontSize === 'function') return normalizeEditorFontSize(rawValue);
  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) return fallback;
  const min = typeof EDITOR_FONT_SIZE_MIN === 'number' ? EDITOR_FONT_SIZE_MIN : 10;
  const max = typeof EDITOR_FONT_SIZE_MAX === 'number' ? EDITOR_FONT_SIZE_MAX : 40;
  return Math.min(Math.max(Math.round(numericValue), min), max);
}

function projectDetailsDocumentFontSize(documentItem = {}) {
  const source = documentItem.source && typeof documentItem.source === 'object' ? documentItem.source : {};
  const settings = (
    documentItem.editorSettings ||
    documentItem.editor_settings ||
    source.editorSettings ||
    source.editor_settings ||
    {}
  );
  const candidates = [
    documentItem.fontSize,
    documentItem.font_size,
    source.fontSize,
    source.font_size,
    settings.fontSize,
    settings.font_size
  ];
  const savedValue = candidates.find(value => value !== undefined && value !== null && value !== '');
  return projectDetailsNormalizePreviewFontSize(savedValue, 16);
}

function projectDetailsWordCount(textValue = '') {
  const text = String(textValue || '').trim();
  if (!text) return 0;
  try {
    return (text.match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu) || []).length;
  } catch {
    return (text.match(/[A-Za-z0-9]+/g) || []).length;
  }
}

function projectDetailsCountTerm(textValue = '', termValue = '') {
  const term = String(termValue || '').trim().toLocaleLowerCase();
  if (!term) return 0;
  const text = String(textValue || '').toLocaleLowerCase();
  let count = 0;
  let index = text.indexOf(term);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(term, index + term.length);
  }
  return count;
}

function projectDetailsTermRanges(textValue = '', termValue = '') {
  const term = String(termValue || '').trim();
  if (!term) return [];
  const text = String(textValue || '');
  const lowerText = text.toLocaleLowerCase();
  const lowerTerm = term.toLocaleLowerCase();
  const ranges = [];
  let index = lowerText.indexOf(lowerTerm);
  while (index !== -1) {
    ranges.push({ start: index, end: index + term.length });
    index = lowerText.indexOf(lowerTerm, index + term.length);
  }
  return ranges;
}

function projectDetailsPreviewMentionHtml(textValue = '', termValue = '') {
  const text = String(textValue || '');
  const ranges = projectDetailsTermRanges(text, termValue);
  if (!ranges.length) return projectDetailsEscapeHtml(text);

  let html = '';
  let cursor = 0;
  ranges.forEach((range, index) => {
    html += projectDetailsEscapeHtml(text.slice(cursor, range.start));
    html += `<mark class="project-details-document-preview-mention" data-project-details-preview-mention-index="${projectDetailsEscapeHtml(index)}">${projectDetailsEscapeHtml(text.slice(range.start, range.end))}</mark>`;
    cursor = range.end;
  });
  html += projectDetailsEscapeHtml(text.slice(cursor));
  return html;
}

function projectDetailsReadDraftsFromStorage() {
  const storedDrafts = projectDetailsStoredJson(DRAFTS_STORAGE_KEY, []);
  if (Array.isArray(storedDrafts)) return storedDrafts;
  return Array.isArray(storedDrafts?.drafts) ? storedDrafts.drafts : [];
}

async function projectDetailsGetStoredProjectHandle() {
  if (typeof readProjectHandle !== 'function' || typeof verifyProjectPermission !== 'function') return null;
  try {
    const handle = await readProjectHandle();
    if (!handle) return null;
    if (!(await verifyProjectPermission(handle, false))) return null;
    projectDirectoryHandle = handle;
    return handle;
  } catch (error) {
    console.warn('Project details handle restore failed:', error);
    return null;
  }
}

async function projectDetailsReadProjectText(path) {
  if (!projectDirectoryHandle || !path || typeof getProjectFileHandle !== 'function') return null;
  try {
    const fileHandle = await getProjectFileHandle(path);
    return await readFileText(fileHandle);
  } catch (error) {
    if (error.name !== 'NotFoundError') {
      console.warn('Project details file read failed:', path, error);
    }
    return null;
  }
}

async function projectDetailsReadProjectJsonFile(path) {
  const textValue = await projectDetailsReadProjectText(path);
  return projectDetailsJson(textValue, null);
}

function projectDetailsDocumentTitle(documentItem = {}, fallback = '') {
  if (documentItem.type === 'chapter') {
    return chapterDisplayTitle(documentItem.source, documentItem.index);
  }
  return documentItem.title || fallback;
}

function projectDetailsDocumentPaths(documentItem = {}) {
  const paths = [
    documentItem.key,
    documentItem.contentPath,
    documentItem.type === 'chapter' ? chapterFilePath(documentItem.index) : draftFilePath(documentItem.index)
  ];
  return new Set(paths.map(projectDetailsNormalizePath).filter(Boolean));
}

function projectDetailsEntryPaths(entry = {}) {
  return new Set([
    entry.contentPath,
    entry.chapterKey,
    entry.draftKey
  ].map(projectDetailsNormalizePath).filter(Boolean));
}

function projectDetailsNameDocumentMatches(entry = {}, documentItem = {}) {
  const entryStatus = normalizeNamingEntryStatus(entry);
  const docStatus = documentItem.type;
  if ((entryStatus !== 'draft' && entryStatus !== 'chapter') || entryStatus !== docStatus) return false;

  const documentPaths = projectDetailsDocumentPaths(documentItem);
  const entryPaths = projectDetailsEntryPaths(entry);
  const pathMatches = [...entryPaths].some(path => documentPaths.has(path));

  if (pathMatches) return true;

  if (docStatus === 'draft') {
    if (Number.isInteger(entry.draftIndex) && entry.draftIndex === documentItem.index) return true;
    if (entry.draftNo && Number(entry.draftNo) === Number(documentItem.no)) return true;
    return projectDetailsNormalizeTitle(entry.draftTitle) === projectDetailsNormalizeTitle(documentItem.title);
  }

  if (Number.isInteger(entry.chapterIndex) && entry.chapterIndex === documentItem.index) return true;
  if (entry.chapterNo && Number(entry.chapterNo) === Number(documentItem.no)) return true;
  return projectDetailsNormalizeTitle(entry.chapterTitle) === projectDetailsNormalizeTitle(documentItem.title);
}

function projectDetailsFactDocumentMatches(fact = {}, documentItem = {}) {
  const factStatus = String(fact.documentType || fact.chapterStatus || '').toLowerCase();
  const isDraftFact = factStatus === 'draft' || Boolean(fact.draftKey || Number.isInteger(fact.draftIndex));
  if (documentItem.type === 'draft') {
    if (!isDraftFact) return false;
    const documentPaths = projectDetailsDocumentPaths(documentItem);
    const factPaths = new Set([
      fact.draftKey,
      fact.contentPath,
      fact.chapterKey
    ].map(projectDetailsNormalizePath).filter(Boolean));
    if ([...factPaths].some(path => documentPaths.has(path))) return true;
    if (Number.isInteger(fact.draftIndex) && fact.draftIndex === documentItem.index) return true;
    if (fact.draftNo && Number(fact.draftNo) === Number(documentItem.no)) return true;
    return projectDetailsNormalizeTitle(fact.draftTitle) === projectDetailsNormalizeTitle(documentItem.title);
  }

  if (isDraftFact) return false;
  const documentPaths = projectDetailsDocumentPaths(documentItem);
  const factPath = projectDetailsNormalizePath(fact.chapterKey || '');
  if (factPath && documentPaths.has(factPath)) return true;
  if (Number.isInteger(fact.chapterIndex) && fact.chapterIndex === documentItem.index) return true;
  if (fact.chapterNo && Number(fact.chapterNo) === Number(documentItem.no)) return true;
  return projectDetailsNormalizeTitle(fact.chapterTitle) === projectDetailsNormalizeTitle(documentItem.title);
}

function projectDetailsNormalizeTitle(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function projectDetailsMetaLabel(meta = {}) {
  if (!meta || typeof meta !== 'object') return 'Project level';
  const status = String(meta.chapterStatus || meta.documentType || '').toLowerCase();
  if (status === 'draft') {
    return meta.draftTitle || meta.chapterTitle || (meta.draftNo ? `Draft ${meta.draftNo}` : 'Draft');
  }
  if (status === 'chapter') {
    return meta.chapterTitle || (meta.chapterNo ? `Chapter ${meta.chapterNo}` : 'Chapter');
  }
  if (status === 'undefined') return 'Unattached';
  return meta.chapterTitle || meta.draftTitle || 'Project level';
}

function projectDetailsBuildDocuments(fileTextByPath = new Map()) {
  const chapterDocuments = chapters.map((chapter, index) => {
    const contentPath = chapter.contentPath || chapterFilePath(index);
    const key = contentPath;
    const source = { ...chapter };
    const fileText = fileTextByPath.get(projectDetailsNormalizePath(contentPath));
    const documentItem = {
      id: `chapter:${key}`,
      type: 'chapter',
      index,
      no: chapter.chapterNo || index + 1,
      key,
      contentPath,
      title: chapterDisplayTitle(chapter, index),
      content: chapter.content || '',
      fileText,
      notes: Array.isArray(chapter.notes) ? chapter.notes : [],
      createdAt: chapter.createdAt,
      fontSize: projectDetailsNormalizePreviewFontSize(chapter.fontSize || chapter.font_size || 16),
      editorSettings: chapter.editorSettings || chapter.editor_settings || null,
      source
    };
    documentItem.text = projectDetailsDocumentText(documentItem);
    return documentItem;
  });

  const draftDocuments = chapterDrafts.map((draft, index) => {
    const contentPath = draft.contentPath || draftFilePath(index);
    const key = contentPath;
    const fileText = fileTextByPath.get(projectDetailsNormalizePath(contentPath));
    const documentItem = {
      id: `draft:${key}`,
      type: 'draft',
      index,
      no: draft.draftNo || index + 1,
      key,
      contentPath,
      title: draft.title || `Draft ${index + 1}`,
      content: draft.content || '',
      fileText,
      notes: Array.isArray(draft.notes) ? draft.notes : [],
      createdAt: draft.createdAt,
      fontSize: projectDetailsNormalizePreviewFontSize(draft.fontSize || draft.font_size || 16),
      editorSettings: draft.editorSettings || draft.editor_settings || null,
      source: { ...draft }
    };
    documentItem.text = projectDetailsDocumentText(documentItem);
    return documentItem;
  });

  return [...chapterDocuments, ...draftDocuments];
}

async function projectDetailsReadDocumentFileTexts() {
  const paths = [
    ...chapters.map((chapter, index) => chapter.contentPath || chapterFilePath(index)),
    ...chapterDrafts.map((draft, index) => draft.contentPath || draftFilePath(index))
  ];
  const textByPath = new Map();

  await Promise.all(paths.map(async path => {
    const normalizedPath = projectDetailsNormalizePath(path);
    const textValue = await projectDetailsReadProjectText(normalizedPath);
    if (typeof textValue === 'string') textByPath.set(normalizedPath, textValue);
  }));

  return textByPath;
}

function projectDetailsCategoryMap() {
  return new Map(namingData.categories.map(category => [category.id, category]));
}

function projectDetailsLimitChips(items = [], className = '') {
  const visibleItems = items.slice(0, PROJECT_DETAILS_MAX_CHIPS);
  const chipHtml = visibleItems.map(item =>
    `<span class="project-details-chip ${className}">${projectDetailsEscapeHtml(item)}</span>`
  ).join('');
  const remaining = items.length - visibleItems.length;
  return remaining > 0
    ? `${chipHtml}<span class="project-details-chip">+${remaining} more</span>`
    : chipHtml;
}

function projectDetailsDetailKey(prefix = 'item', item = {}, index = 0) {
  return `${prefix}:${item.id || item.name || item.keyword || index}`;
}

function projectDetailsMentionLabel(count = 0) {
  return `${count} mention${count === 1 ? '' : 's'}`;
}

function projectDetailsDetailMeta(rows = []) {
  const visibleRows = rows.filter(row =>
    row &&
    row.value !== undefined &&
    row.value !== null &&
    String(row.value).trim() !== ''
  );

  if (!visibleRows.length) return '';

  return `
    <dl class="project-details-detail-meta">
      ${visibleRows.map(row => `
        <div>
          <dt>${projectDetailsEscapeHtml(row.label)}</dt>
          <dd>${projectDetailsEscapeHtml(row.value)}</dd>
        </div>
      `).join('')}
    </dl>
  `;
}

function projectDetailsEntityDescription(value = '', emptyText = 'No information saved yet.') {
  const textValue = String(value || '').trim();
  return textValue || emptyText;
}

function projectDetailsRecordDateRow(createdAt = '', updatedAt = '') {
  const createdLabel = projectDetailsTimeLabel(createdAt) || projectDetailsDateLabel(createdAt);
  const updatedLabel = projectDetailsTimeLabel(updatedAt || createdAt) || projectDetailsDateLabel(updatedAt || createdAt);
  return `
    <div class="project-details-detail-date-row">
      <span><b>Created At</b><time datetime="${projectDetailsEscapeHtml(createdAt || '')}">${projectDetailsEscapeHtml(createdLabel)}</time></span>
      <span><b>Edited At</b><time datetime="${projectDetailsEscapeHtml(updatedAt || createdAt || '')}">${projectDetailsEscapeHtml(updatedLabel)}</time></span>
    </div>
  `;
}

function projectDetailsChapterDescriptionMeta(documentItem = {}, timestamp = new Date().toISOString()) {
  return {
    chapterStatus: 'chapter',
    documentType: 'chapter',
    chapterKey: documentItem.key || documentItem.contentPath || chapterFilePath(documentItem.index),
    chapterIndex: Number.isInteger(documentItem.index) ? documentItem.index : null,
    chapterNo: documentItem.no || (Number.isInteger(documentItem.index) ? documentItem.index + 1 : null),
    chapterTitle: documentItem.title || '',
    draftKey: null,
    draftIndex: null,
    draftNo: null,
    draftTitle: '',
    contentPath: documentItem.contentPath || documentItem.key || chapterFilePath(documentItem.index),
    savedAt: timestamp
  };
}

function projectDetailsRenderNameDescription(entry = {}, documentItem = {}, description = '') {
  const canEditDescription = documentItem.type === 'chapter';
  const isEditing = canEditDescription && projectDetailsEditingNameDescriptionId === entry.id;
  return `
    <div class="project-details-record-description ${isEditing ? 'is-editing' : ''}">
      ${isEditing
        ? `<textarea class="project-details-record-description-editor"
            data-project-details-name-description-input="${projectDetailsEscapeHtml(entry.id)}"
            aria-label="Edit description for ${projectDetailsEscapeHtml(entry.name)}">${projectDetailsEscapeHtml(description)}</textarea>
          <div class="project-details-record-description-actions">
            <button class="project-details-record-description-cancel" type="button"
              data-project-details-description-cancel="${projectDetailsEscapeHtml(entry.id)}">Cancel</button>
            <button class="project-details-record-description-save" type="button"
              data-project-details-description-save="${projectDetailsEscapeHtml(entry.id)}">Save</button>
          </div>`
        : `<p>${projectDetailsEscapeHtml(description)}</p>
          ${canEditDescription
            ? `<button class="project-details-record-description-edit" type="button"
                data-project-details-description-edit="${projectDetailsEscapeHtml(entry.id)}"
                title="Edit description" aria-label="Edit description for ${projectDetailsEscapeHtml(entry.name)}">Edit</button>`
            : ''}`
      }
    </div>
  `;
}

function projectDetailsNameInfoRecord(entry = {}, documentItem = {}, categoryById = new Map(), options = {}) {
  const category = categoryById.get(entry.categoryId);
  const description = projectDetailsEntityDescription(
    entry.description,
    category?.info || 'No description saved for this name.'
  );
  const mentionCount = Number.isFinite(options.mentionCount)
    ? options.mentionCount
    : projectDetailsCountTerm(documentItem.text, entry.name);

  return `
    <article class="project-details-detail-record ${options.isDetected ? 'is-detected' : 'is-attached'}">
      <div class="project-details-detail-record-head">
        <div>
          <span>Name</span>
          <strong>${projectDetailsEscapeHtml(entry.name)}</strong>
        </div>
        <small aria-label="${projectDetailsEscapeHtml(entry.name)} appears ${projectDetailsEscapeHtml(mentionCount)} times in this document">${projectDetailsEscapeHtml(mentionCount)}x</small>
      </div>
      ${projectDetailsRenderNameDescription(entry, documentItem, description)}
      ${projectDetailsRecordDateRow(entry.createdAt, entry.updatedAt)}
    </article>
  `;
}

function projectDetailsFactInfoRecord(fact = {}, documentItem = {}, options = {}) {
  const description = projectDetailsEntityDescription(fact.description, 'No description saved for this fact.');
  const mentionCount = Number.isFinite(options.mentionCount)
    ? options.mentionCount
    : projectDetailsCountTerm(documentItem.text, fact.keyword);
  return `
    <article class="project-details-detail-record ${options.isDetected ? 'is-detected' : 'is-fact'}">
      <div class="project-details-detail-record-head">
        <div>
          <span>Name</span>
          <strong>${projectDetailsEscapeHtml(fact.keyword)}</strong>
        </div>
        <small aria-label="${projectDetailsEscapeHtml(fact.keyword)} appears ${projectDetailsEscapeHtml(mentionCount)} times in this document">${projectDetailsEscapeHtml(mentionCount)}x</small>
      </div>
      <p>${projectDetailsEscapeHtml(description)}</p>
      ${projectDetailsRecordDateRow(fact.createdAt, fact.updatedAt)}
    </article>
  `;
}

function projectDetailsDetectedNameItems(entries = [], documentItem = {}) {
  return entries
    .map((entry, index) => ({
      entry,
      key: projectDetailsDetailKey('detected-name', entry, index),
      mentionCount: projectDetailsCountTerm(documentItem.text, entry.name)
    }))
    .sort((left, right) =>
      right.mentionCount - left.mentionCount ||
      String(left.entry.name || '').localeCompare(String(right.entry.name || ''))
    );
}

function projectDetailsFactItems(stats = {}, documentItem = {}) {
  const attachedItems = (stats.attachedFacts || []).map((fact, index) => ({
    fact,
    key: projectDetailsDetailKey('attached-fact', fact, index),
    mentionCount: projectDetailsCountTerm(documentItem.text, fact.keyword),
    isDetected: false
  }));
  const detectedItems = (stats.detectedFacts || []).map((fact, index) => ({
    fact,
    key: projectDetailsDetailKey('detected-fact', fact, index),
    mentionCount: projectDetailsCountTerm(documentItem.text, fact.keyword),
    isDetected: true
  })).sort((left, right) =>
    right.mentionCount - left.mentionCount ||
    String(left.fact.keyword || '').localeCompare(String(right.fact.keyword || ''))
  );

  return [...attachedItems, ...detectedItems];
}

function projectDetailsDocumentStats(documentItem = {}) {
  const entries = namingData.entries || [];
  const facts = storyFacts || [];
  const attachedNames = entries.filter(entry => projectDetailsNameDocumentMatches(entry, documentItem));
  const detectedNames = entries.filter(entry =>
    !projectDetailsNameDocumentMatches(entry, documentItem) &&
    projectDetailsCountTerm(documentItem.text, entry.name) > 0
  );
  const attachedFacts = facts.filter(fact => projectDetailsFactDocumentMatches(fact, documentItem));
  const detectedFacts = facts.filter(fact =>
    !projectDetailsFactDocumentMatches(fact, documentItem) &&
    projectDetailsCountTerm(documentItem.text, fact.keyword) > 0
  );

  return {
    words: projectDetailsWordCount(documentItem.text),
    characters: String(documentItem.text || '').length,
    notes: documentItem.notes.length,
    attachedNames,
    detectedNames,
    attachedFacts,
    detectedFacts
  };
}

function projectDetailsNormalizeDocumentInfoPanel(panelName = '') {
  return ['attached-names', 'detected-names', 'facts'].includes(panelName)
    ? panelName
    : 'attached-names';
}

function projectDetailsPreferredDocumentInfoPanel(stats = {}) {
  const attachedNameCount = (stats.attachedNames || []).length;
  const detectedNameCount = (stats.detectedNames || []).length;
  const factCount = (stats.attachedFacts || []).length + (stats.detectedFacts || []).length;

  if (attachedNameCount > 0) return 'attached-names';
  if (detectedNameCount > 0) return 'detected-names';
  if (factCount > 0) return 'facts';
  return 'attached-names';
}

function projectDetailsFocusActiveDocumentInfoButton(grid) {
  if (!projectDetailsShouldFocusDocumentInfoButton || !grid) return;
  projectDetailsShouldFocusDocumentInfoButton = false;
  requestAnimationFrame(() => {
    const activeButton = [...grid.querySelectorAll('[data-project-details-document-info-panel]')]
      .find(button => button.dataset.projectDetailsDocumentInfoPanel === projectDetailsActiveDocumentInfoPanel);
    activeButton?.focus?.({ preventScroll: true });
  });
}

function projectDetailsFocusDescriptionEditor(grid) {
  if (!projectDetailsShouldFocusDescriptionEditor || !grid) return;
  projectDetailsShouldFocusDescriptionEditor = false;
  requestAnimationFrame(() => {
    const editor = grid.querySelector('[data-project-details-name-description-input]');
    editor?.focus?.({ preventScroll: true });
    editor?.select?.();
  });
}

function projectDetailsFocusTitleEditor(grid) {
  if (!projectDetailsShouldFocusTitleEditor || !grid) return;
  projectDetailsShouldFocusTitleEditor = false;
  requestAnimationFrame(() => {
    const editor = grid.querySelector('[data-project-details-title-edit-input]');
    editor?.focus?.({ preventScroll: true });
    editor?.select?.();
  });
}

function projectDetailsClearTitleEditState() {
  projectDetailsEditingNameTitleId = '';
  projectDetailsEditingFactTitleId = '';
  projectDetailsShouldFocusTitleEditor = false;
}

function projectDetailsValueKey(value = '') {
  if (typeof uniqueNameKey === 'function') return uniqueNameKey(value);
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function projectDetailsNotify(message = '', isDuplicate = false) {
  if (!message) return;
  if (isDuplicate && typeof showDuplicateReminder === 'function') {
    showDuplicateReminder(message);
    return;
  }
  if (typeof showMiniReminder === 'function') {
    showMiniReminder(message);
    return;
  }
  console.warn(message);
}

function projectDetailsNameTitleExists(name = '', excludeEntryId = '') {
  const nameKey = projectDetailsValueKey(name);
  if (!nameKey) return false;
  return (namingData.entries || []).some(entry =>
    entry.id !== excludeEntryId && projectDetailsValueKey(entry.name) === nameKey
  );
}

function projectDetailsRerenderAfterNamingEdit() {
  const documents = projectDetailsCurrentState?.documents || [];
  const changes = projectDetailsBuildChanges(documents);
  projectDetailsCurrentState = projectDetailsCurrentState
    ? { ...projectDetailsCurrentState, changes }
    : projectDetailsCurrentState;
  projectDetailsRenderStats(documents, changes);
  projectDetailsRenderDocuments(documents);
  projectDetailsRenderNotes(documents);
  projectDetailsRenderChanges(changes);
}

function projectDetailsPersistNameTitle(entryId = '', nextName = '') {
  const entry = (namingData.entries || []).find(item => item.id === entryId);
  const name = String(nextName || '').trim();
  if (!entry) return false;
  if (!name) {
    projectDetailsNotify('Name cannot be empty.');
    return false;
  }
  if (projectDetailsValueKey(name) === projectDetailsValueKey(entry.name)) {
    projectDetailsClearTitleEditState();
    projectDetailsRenderNotes(projectDetailsCurrentState?.documents || []);
    return true;
  }
  if (projectDetailsNameTitleExists(name, entryId)) {
    projectDetailsNotify('This name already exists.', true);
    return false;
  }

  entry.name = name;
  entry.updatedAt = new Date().toISOString();
  projectDetailsClearTitleEditState();
  projectDetailsSaveNamingData();
  projectDetailsRerenderAfterNamingEdit();
  projectDetailsNotify('Name updated.');
  return true;
}

function projectDetailsSaveNamingData() {
  namingData = normalizeNamingData(namingData);
  if (typeof saveNamingData === 'function') {
    saveNamingData();
  } else {
    localStorage.setItem(NAMING_STORAGE_KEY, JSON.stringify(namingData));
    if (typeof writeNamingDataToProject === 'function') {
      writeNamingDataToProject().catch(error => console.warn('Project details naming save failed:', error));
    }
  }
}

function projectDetailsRemoveNameReferences(entryId = '') {
  if (!entryId || !namingData?.detectedByChapter) return;
  Object.entries(namingData.detectedByChapter).forEach(([chapterKey, entryIds]) => {
    const nextIds = Array.isArray(entryIds) ? entryIds.filter(id => id !== entryId) : [];
    if (nextIds.length) namingData.detectedByChapter[chapterKey] = nextIds;
    else delete namingData.detectedByChapter[chapterKey];
  });
}

function projectDetailsDeleteName(entryId = '') {
  const entry = (namingData.entries || []).find(item => item.id === entryId);
  if (!entry) return false;
  const shouldDelete = typeof window.confirm !== 'function' ||
    window.confirm(`Delete "${entry.name}"? This will remove the saved name and its description history.`);
  if (!shouldDelete) return false;

  namingData.entries = (namingData.entries || []).filter(item => item.id !== entryId);
  projectDetailsRemoveNameReferences(entryId);
  projectDetailsSelectedNameId = '';
  projectDetailsSaveNamingData();
  projectDetailsRerenderAfterNamingEdit();
  return true;
}

function projectDetailsPersistNameDescription(entryId = '', description = '') {
  const entry = (namingData.entries || []).find(item => item.id === entryId);
  const documentItem = (projectDetailsCurrentState?.documents || [])
    .find(item => item.id === projectDetailsSelectedDocumentId);
  if (!entry || !documentItem || documentItem.type !== 'chapter') return false;

  const editedAt = new Date().toISOString();
  const descriptionMeta = projectDetailsChapterDescriptionMeta(documentItem, editedAt);
  const previousDescription = String(entry.description || '').trim();
  const nextDescription = String(description || '').trim();
  entry.description = nextDescription;
  entry.updatedAt = editedAt;
  entry.chapterKey = descriptionMeta.chapterKey;
  entry.chapterIndex = descriptionMeta.chapterIndex;
  entry.chapterNo = descriptionMeta.chapterNo;
  entry.chapterTitle = descriptionMeta.chapterTitle;
  entry.chapterStatus = 'chapter';
  entry.documentType = 'chapter';
  entry.draftKey = null;
  entry.draftIndex = null;
  entry.draftNo = null;
  entry.draftTitle = '';
  entry.contentPath = descriptionMeta.contentPath;
  entry.descriptionMeta = descriptionMeta;
  entry.descriptionHistory = [
    ...(Array.isArray(entry.descriptionHistory) ? entry.descriptionHistory : []),
    { previousDescription, description: nextDescription, editedAt, chapterMeta: descriptionMeta }
  ];

  projectDetailsSaveNamingData();
  return true;
}

function projectDetailsRenderHero(manifest = {}) {
  const title = manifest.title || localStorage.getItem(PROJECT_FOLDER_KEY) || 'No project selected';
  const typeLabel = typeof storyTypeLabel === 'function'
    ? storyTypeLabel(manifest.type || 'project')
    : projectTypeFolderTitle(manifest.type || 'project');
  const author = manifest.author || 'Unknown author';
  const language = storyLanguageLabel(manifest.language);
  const synopsis = manifest.synopsis || 'No description or synopsis has been added yet.';
  const createdLabel = projectDetailsTimeLabel(manifest.createdAt) || projectDetailsDateLabel(manifest.createdAt);
  const updatedLabel = projectDetailsTimeLabel(manifest.updatedAt) || projectDetailsDateLabel(manifest.updatedAt || manifest.createdAt);

  document.getElementById('projectDetailsTitle').textContent = title;
  document.getElementById('projectDetailsKicker').textContent = `${typeLabel} Details`;
  document.getElementById('projectDetailsLanguage').textContent = language;
  document.getElementById('projectDetailsSynopsis').textContent = author;
  document.getElementById('projectDetailsDescription').textContent = synopsis;
  document.getElementById('projectDetailsCreatedTime').textContent = `Created: ${createdLabel}`;
  document.getElementById('projectDetailsUpdatedTime').textContent = `Updated: ${updatedLabel}`;
}

function projectDetailsRenderStats(documents = [], changes = []) {
  const chapterCount = documents.filter(documentItem => documentItem.type === 'chapter').length;
  const draftCount = documents.filter(documentItem => documentItem.type === 'draft').length;
  const totalWords = documents.reduce((sum, documentItem) => sum + projectDetailsWordCount(documentItem.text), 0);
  const noteCount = namingData.entries.length;
  const factCount = storyFacts.length;
  const fileTotal = Math.max(chapterCount + draftCount, 1);
  const noteTotal = Math.max(noteCount + factCount, 1);
  const extraBaseline = Math.max(totalWords, changes.length, 1);
  const statMeter = (value, total) => {
    const safeValue = Math.max(0, Number(value) || 0);
    const safeTotal = Math.max(1, Number(total) || 1);
    return Math.min(100, Math.round((safeValue / safeTotal) * 100));
  };
  const statRow = (label, value, detail, meter) => `
    <div class="project-details-stat-row" style="--stat-meter: ${projectDetailsEscapeHtml(meter)}%;">
      <span>
        <b>${projectDetailsEscapeHtml(label)}</b>
        <i>${projectDetailsEscapeHtml(detail)}</i>
      </span>
      <strong>${projectDetailsEscapeHtml(value)}</strong>
    </div>`;
  const statCard = ({ className, icon, title, subtitle, total, totalLabel, rows }) => `
    <article class="project-details-stat-card ${projectDetailsEscapeHtml(className)}">
      <div class="project-details-stat-head">
        <span class="project-details-stat-icon" aria-hidden="true">${projectDetailsEscapeHtml(icon)}</span>
        <div class="project-details-stat-title">
          <span class="project-details-stat-kicker">${projectDetailsEscapeHtml(title)}</span>
          <small>${projectDetailsEscapeHtml(subtitle)}</small>
        </div>
        <strong class="project-details-stat-total">
          ${projectDetailsEscapeHtml(total)}
          <small>${projectDetailsEscapeHtml(totalLabel)}</small>
        </strong>
      </div>
      <div class="project-details-stat-rows">
        ${rows.join('')}
      </div>
    </article>`;

  document.getElementById('projectDetailsStatGrid').innerHTML = `
    ${statCard({
      className: 'is-files',
      icon: 'F',
      title: 'Files',
      subtitle: 'Project structure',
      total: documents.length,
      totalLabel: 'total',
      rows: [
        statRow('Drafts', draftCount, 'working files', statMeter(draftCount, fileTotal)),
        statRow('Chapters', chapterCount, 'published sections', statMeter(chapterCount, fileTotal))
      ]
    })}
    ${statCard({
      className: 'is-notes',
      icon: 'N',
      title: 'Notes',
      subtitle: 'Names and facts',
      total: noteCount + factCount,
      totalLabel: 'items',
      rows: [
        statRow('Names', noteCount, 'tracked entries', statMeter(noteCount, noteTotal)),
        statRow('Facts', factCount, 'reference notes', statMeter(factCount, noteTotal))
      ]
    })}
    ${statCard({
      className: 'is-extra',
      icon: 'W',
      title: 'Extra Detail',
      subtitle: 'Writing activity',
      total: totalWords.toLocaleString('en-IN'),
      totalLabel: 'words',
      rows: [
        statRow('Word Count', totalWords.toLocaleString('en-IN'), 'all documents', statMeter(totalWords, extraBaseline)),
        statRow('Changes', changes.length, 'description edits', statMeter(changes.length, extraBaseline))
      ]
    })}
  `;
}

function projectDetailsDocumentsOfType(documents = [], mode = 'draft') {
  const safeMode = mode === 'chapter' ? 'chapter' : 'draft';
  return documents
    .filter(documentItem => documentItem.type === safeMode)
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
}

function projectDetailsDocumentModeTitle(mode = 'draft', plural = false) {
  if (mode === 'chapter') return plural ? 'Chapters' : 'Chapter';
  return plural ? 'Drafts' : 'Draft';
}

function projectDetailsDocumentTypeLabel(documentItem = {}) {
  return `${projectDetailsDocumentModeTitle(documentItem.type)} ${documentItem.no || documentItem.index + 1}`;
}

function projectDetailsRenderDocumentListItem(documentItem = {}, isActive = false) {
  const stats = projectDetailsDocumentStats(documentItem);
  const indexLabel = String(documentItem.no || documentItem.index + 1).padStart(2, '0');
  const typeLabel = projectDetailsDocumentTypeLabel(documentItem);
  const wordCount = projectDetailsWordCount(documentItem.text).toLocaleString('en-IN');
  return `
    <button class="project-details-document-list-item ${isActive ? 'is-active' : ''}" type="button"
      data-project-details-document-id="${projectDetailsEscapeHtml(documentItem.id)}"
      aria-pressed="${isActive ? 'true' : 'false'}">
      <span class="project-details-document-list-index">${projectDetailsEscapeHtml(indexLabel)}</span>
      <span class="project-details-document-list-text">
        <b>${projectDetailsEscapeHtml(documentItem.title)}</b>
        <small>${projectDetailsEscapeHtml(wordCount)}</small>
      </span>
      <strong class="project-details-document-list-name-counts" aria-label="Detected ${projectDetailsEscapeHtml(stats.detectedNames.length)}, attached ${projectDetailsEscapeHtml(stats.attachedNames.length)}">
        <span class="is-saved"><b>${projectDetailsEscapeHtml(stats.detectedNames.length)}</b></span>
        <span class="is-attached"><b>${projectDetailsEscapeHtml(stats.attachedNames.length)}</b></span>
      </strong>
    </button>
  `;
}

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
  if (mentionTerm) {
    textContainer.innerHTML = projectDetailsPreviewMentionHtml(documentText, mentionTerm);
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
      count: projectDetailsCountTerm(documentItem.text, term)
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

function projectDetailsNameViewModels(documents = []) {
  const categoryById = projectDetailsCategoryMap();
  return (namingData.entries || []).map(entry => {
    const rows = projectDetailsDocumentRowsForTerm(documents, entry.name);
    const definedIn = projectDetailsDefinedInInfo(entry, documents);
    return {
      entry,
      rows,
      totalMentions: rows.reduce((sum, row) => sum + row.count, 0),
      category: categoryById.get(entry.categoryId),
      status: normalizeNamingEntryStatus(entry),
      definedIn,
      attachedChapterIndex: projectDetailsNameAttachedChapterIndex(entry, documents),
      latestTime: projectDetailsNameLatestTime(entry)
    };
  });
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
    const count = projectDetailsCountTerm(documentItem.text, entry.name);
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
    count: projectDetailsCountTerm(documentItem.text, term)
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
  namingData = normalizeNamingData(projectNamingData || projectDetailsStoredJson(NAMING_STORAGE_KEY, {}));

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
  projectDetailsRenderDocuments(state.documents);
  projectDetailsRenderNotes(state.documents);
  projectDetailsRenderChanges(state.changes);
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

function projectDetailsActivateTab(tabName = 'documents') {
  document.querySelectorAll('[data-project-details-tab]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.projectDetailsTab === tabName);
  });
  document.querySelectorAll('[data-project-details-section]').forEach(section => {
    section.classList.toggle('is-active', section.dataset.projectDetailsSection === tabName);
  });
}

function initProjectDetailsTabs() {
  document.querySelectorAll('[data-project-details-tab]').forEach(button => {
    button.addEventListener('click', () => projectDetailsActivateTab(button.dataset.projectDetailsTab));
  });
}

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
  initProjectDetailsEditPanel();
  initProjectDetailsStoryLibrary();
  initProjectDetailsPage();
});
