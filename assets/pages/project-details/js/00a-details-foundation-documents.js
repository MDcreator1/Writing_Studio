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
let projectDetailsConfirmLastFocus = null;
let projectDetailsConfirmResolve = null;
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
const PROJECT_DETAILS_CONFIRM_MODAL_ID = 'projectDetailsConfirmModal';
const PROJECT_DETAILS_CONFIRM_TITLE_ID = 'projectDetailsConfirmTitle';
const PROJECT_DETAILS_CONFIRM_BODY_ID = 'projectDetailsConfirmBody';
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

function projectDetailsFindWordChar(char) {
  return Boolean(char && /[\p{L}\p{N}\p{M}_]/u.test(char));
}

function projectDetailsFindBoundary(value, index) {
  return index < 0 || index >= value.length || !projectDetailsFindWordChar(value[index]);
}

const PROJECT_DETAILS_RAW_FIND_DEVANAGARI_CHAR_PATTERN = /[\u0900-\u097F]/u;
const PROJECT_DETAILS_RAW_FIND_DEVANAGARI_MARK_PATTERN = /[\u0900-\u0903\u093A\u093C\u093E-\u094F\u0951-\u0957\u0962-\u0963]/u;

function projectDetailsNormalizeRawFindToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase();
}

function projectDetailsNormalizeExactRawFindToken(value) {
  return String(value || '').normalize('NFD').toLocaleLowerCase();
}

function projectDetailsRawFindTokenHasDevanagari(value = '') {
  return PROJECT_DETAILS_RAW_FIND_DEVANAGARI_CHAR_PATTERN.test(String(value || ''));
}

function projectDetailsRawFindTokenEndsWithDevanagariMark(value = '') {
  const chars = Array.from(projectDetailsNormalizeExactRawFindToken(value));
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    const char = chars[index];
    if (PROJECT_DETAILS_RAW_FIND_DEVANAGARI_MARK_PATTERN.test(char)) return true;
    if (/\p{M}/u.test(char)) continue;
    return false;
  }
  return false;
}

function projectDetailsRawFindSuffixIsOnlyDevanagariMarks(value = '') {
  const chars = Array.from(String(value || ''));
  return chars.length > 0 && chars.every(char => PROJECT_DETAILS_RAW_FIND_DEVANAGARI_MARK_PATTERN.test(char));
}

function projectDetailsRawFindTokenMatches(token = '', query = '') {
  const tokenValue = String(token || '');
  const queryValue = String(query || '');
  if (!tokenValue || !queryValue) return false;
  if (!projectDetailsRawFindTokenHasDevanagari(tokenValue) && !projectDetailsRawFindTokenHasDevanagari(queryValue)) {
    return projectDetailsNormalizeRawFindToken(tokenValue) === projectDetailsNormalizeRawFindToken(queryValue);
  }

  const normalizedToken = projectDetailsNormalizeExactRawFindToken(tokenValue);
  const normalizedQuery = projectDetailsNormalizeExactRawFindToken(queryValue);
  if (!normalizedQuery) return false;
  if (projectDetailsRawFindTokenEndsWithDevanagariMark(queryValue)) return normalizedToken === normalizedQuery;
  if (normalizedToken === normalizedQuery) return true;
  if (!normalizedToken.startsWith(normalizedQuery)) return false;
  return projectDetailsRawFindSuffixIsOnlyDevanagariMarks(normalizedToken.slice(normalizedQuery.length));
}

function projectDetailsCountDeepTerm(textValue = '', termValue = '') {
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

function projectDetailsCountSafeTerm(textValue = '', termValue = '') {
  return projectDetailsTermRanges(textValue, termValue, 'safe').length;
}

function projectDetailsCountRawTerm(textValue = '', termValue = '') {
  return projectDetailsTermRanges(textValue, termValue, 'raw').length;
}

function projectDetailsCountTerm(textValue = '', termValue = '', mode = 'deep') {
  if (mode === 'raw') return projectDetailsCountRawTerm(textValue, termValue);
  if (mode === 'safe') return projectDetailsCountSafeTerm(textValue, termValue);
  return projectDetailsCountDeepTerm(textValue, termValue);
}

function projectDetailsDocumentFindMode(documentItem = {}) {
  return ['chapter', 'draft'].includes(documentItem?.type) ? 'raw' : 'deep';
}

function projectDetailsCountDocumentTerm(documentItem = {}, termValue = '') {
  return projectDetailsCountTerm(documentItem.text, termValue, projectDetailsDocumentFindMode(documentItem));
}

function projectDetailsTermRanges(textValue = '', termValue = '', mode = 'deep') {
  const term = String(termValue || '').trim();
  if (!term) return [];
  const text = String(textValue || '');
  if (mode === 'raw' && !/\s/.test(term)) {
    const rawRanges = [];
    const tokenPattern = /[\p{L}\p{N}\p{M}_]+/gu;
    let tokenMatch = tokenPattern.exec(text);
    while (tokenMatch) {
      if (projectDetailsRawFindTokenMatches(tokenMatch[0], term)) {
        rawRanges.push({ start: tokenMatch.index, end: tokenMatch.index + tokenMatch[0].length });
      }
      tokenMatch = tokenPattern.exec(text);
    }
    return rawRanges;
  }

  const isSafeMode = mode === 'safe';
  const isRawMode = mode === 'raw';
  const haystack = isSafeMode ? text : text.toLocaleLowerCase();
  const needle = isSafeMode ? term : term.toLocaleLowerCase();
  const ranges = [];
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    const matchEnd = index + term.length;
    if (
      (!isSafeMode && !isRawMode) ||
      (projectDetailsFindBoundary(text, index - 1) && projectDetailsFindBoundary(text, matchEnd))
    ) {
      ranges.push({ start: index, end: matchEnd });
    }
    index = haystack.indexOf(needle, matchEnd);
  }
  return ranges;
}

function projectDetailsPreviewMentionHtml(textValue = '', termValue = '', mode = 'deep') {
  const text = String(textValue || '');
  const ranges = projectDetailsTermRanges(text, termValue, mode);
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
    : projectDetailsCountDocumentTerm(documentItem, entry.name);

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
    : projectDetailsCountDocumentTerm(documentItem, fact.keyword);
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
      mentionCount: projectDetailsCountDocumentTerm(documentItem, entry.name)
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
    mentionCount: projectDetailsCountDocumentTerm(documentItem, fact.keyword),
    isDetected: false
  }));
  const detectedItems = (stats.detectedFacts || []).map((fact, index) => ({
    fact,
    key: projectDetailsDetailKey('detected-fact', fact, index),
    mentionCount: projectDetailsCountDocumentTerm(documentItem, fact.keyword),
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
    projectDetailsCountDocumentTerm(documentItem, entry.name) > 0
  );
  const attachedFacts = facts.filter(fact => projectDetailsFactDocumentMatches(fact, documentItem));
  const detectedFacts = facts.filter(fact =>
    !projectDetailsFactDocumentMatches(fact, documentItem) &&
    projectDetailsCountDocumentTerm(documentItem, fact.keyword) > 0
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

function projectDetailsEnsureConfirmModal() {
  let modal = document.getElementById(PROJECT_DETAILS_CONFIRM_MODAL_ID);
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = PROJECT_DETAILS_CONFIRM_MODAL_ID;
  modal.className = 'project-details-confirm-modal';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <article class="project-details-confirm-panel" role="dialog" aria-modal="true"
      aria-labelledby="${PROJECT_DETAILS_CONFIRM_TITLE_ID}"
      aria-describedby="${PROJECT_DETAILS_CONFIRM_BODY_ID}">
      <div class="project-details-confirm-mark" aria-hidden="true">
        <span data-lm-icon="delete"></span>
      </div>
      <div class="project-details-confirm-copy">
        <span class="project-details-confirm-kicker" data-project-details-confirm-kicker>Confirm action</span>
        <h3 id="${PROJECT_DETAILS_CONFIRM_TITLE_ID}" data-project-details-confirm-title></h3>
        <p id="${PROJECT_DETAILS_CONFIRM_BODY_ID}" data-project-details-confirm-body></p>
      </div>
      <div class="project-details-confirm-actions">
        <button class="project-details-confirm-cancel" type="button" data-project-details-confirm-cancel>Cancel</button>
        <button class="project-details-confirm-primary" type="button" data-project-details-confirm-accept>Delete</button>
      </div>
    </article>
  `;
  document.body.appendChild(modal);
  if (typeof window.hydrateLmIcons === 'function') window.hydrateLmIcons(modal);
  return modal;
}

function closeProjectDetailsConfirmModal(result = false) {
  const modal = document.getElementById(PROJECT_DETAILS_CONFIRM_MODAL_ID);
  if (!modal?.classList.contains('is-visible')) return;

  modal.classList.remove('is-visible');
  modal.setAttribute('aria-hidden', 'true');
  const resolve = projectDetailsConfirmResolve;
  projectDetailsConfirmResolve = null;
  projectDetailsConfirmLastFocus?.focus?.({ preventScroll: true });
  projectDetailsConfirmLastFocus = null;
  if (typeof resolve === 'function') resolve(Boolean(result));
}

function projectDetailsConfirm(options = {}) {
  const modal = projectDetailsEnsureConfirmModal();
  const title = modal.querySelector('[data-project-details-confirm-title]');
  const body = modal.querySelector('[data-project-details-confirm-body]');
  const kicker = modal.querySelector('[data-project-details-confirm-kicker]');
  const acceptButton = modal.querySelector('[data-project-details-confirm-accept]');
  const cancelButton = modal.querySelector('[data-project-details-confirm-cancel]');

  if (kicker) kicker.textContent = options.kicker || 'Confirm action';
  if (title) title.textContent = options.title || 'Are you sure?';
  if (body) body.textContent = options.body || '';
  if (acceptButton) {
    acceptButton.textContent = options.confirmLabel || 'Confirm';
    acceptButton.classList.toggle('is-danger', options.tone === 'danger');
  }
  if (cancelButton) cancelButton.textContent = options.cancelLabel || 'Cancel';

  if (projectDetailsConfirmResolve) closeProjectDetailsConfirmModal(false);
  projectDetailsConfirmLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.classList.add('is-visible');
  modal.setAttribute('aria-hidden', 'false');

  return new Promise(resolve => {
    projectDetailsConfirmResolve = resolve;
    requestAnimationFrame(() => cancelButton?.focus?.({ preventScroll: true }));
  });
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

async function projectDetailsDeleteName(entryId = '') {
  const entry = (namingData.entries || []).find(item => item.id === entryId);
  if (!entry) return false;
  const shouldDelete = await projectDetailsConfirm({
    kicker: 'Delete name',
    title: `Delete "${entry.name}"?`,
    body: 'This will remove the saved name, its attachment, and description history from this project.',
    confirmLabel: 'Delete Name',
    cancelLabel: 'Keep Name',
    tone: 'danger'
  });
  if (!shouldDelete) return false;

  namingData.entries = (namingData.entries || []).filter(item => item.id !== entryId);
  projectDetailsRemoveNameReferences(entryId);
  projectDetailsSelectedNameId = '';
  projectDetailsSaveNamingData();
  projectDetailsRerenderAfterNamingEdit();
  projectDetailsNotify('Name deleted.');
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

