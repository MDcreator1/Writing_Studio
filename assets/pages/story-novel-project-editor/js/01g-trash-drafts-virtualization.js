function renderTrashDrafts() {
  const draftBox = document.getElementById('draftBox');
  if (!draftBox) return;

  chapterTrashDrafts = normalizeTrashDrafts(chapterTrashDrafts);
  normalizeTrashDraftSelection();
  draftBox.hidden = false;
  draftBox.classList.add('trash-draft-box');
  const selectedCount = selectedTrashDraftIndexes.size;
  const countLabel = selectedCount ? `${selectedCount}/${chapterTrashDrafts.length}` : chapterTrashDrafts.length;
  const restoreLabel = selectedCount ? text().restoreDrafts : text().restoreAllDrafts;
  const deleteLabel = selectedCount ? text().permanentlyDeleteDrafts : text().permanentlyDeleteDrafts;

  draftBox.innerHTML = `
    <div class="draft-box-title trash-box-title ${selectedCount ? 'has-draft-selection' : ''}" id="trashDraftBoxTitle">
      <span class="draft-title-label"><span class="draft-save-dot" aria-hidden="true"></span>${escapeHtml(text().trashDrafts)}</span>
      <span class="draft-title-actions">
        <button class="draft-title-delete-btn trash-title-action-btn trash-title-restore-btn" type="button" ${chapterTrashDrafts.length ? '' : 'disabled'}
          onclick="event.stopPropagation(); openTrashBulkActionPanel('restore', this)"
          title="${escapeHtml(restoreLabel)}" aria-label="${escapeHtml(restoreLabel)}">
          ${RESTORE_DRAFT_SVG}
        </button>
        <button class="draft-title-delete-btn trash-title-action-btn" type="button" ${chapterTrashDrafts.length ? '' : 'disabled'}
          onclick="event.stopPropagation(); openTrashBulkActionPanel('delete', this)"
          title="${escapeHtml(deleteLabel)}" aria-label="${escapeHtml(deleteLabel)}">
          ${DRAFT_DELETE_SVG}
        </button>
        <span class="draft-count-pill ${selectedCount ? 'is-selecting' : ''}">${escapeHtml(String(countLabel))}</span>
      </span>
    </div>
    ${chapterTrashDrafts.length
      ? chapterTrashDrafts.map((draft, index) => `
        <div class="chap-item draft-item trash-draft-item ${isTrashDraftActive() && index === curTrashDraft ? 'active' : ''} ${selectedTrashDraftIndexes.has(index) ? 'is-selected' : ''}"
          onclick="handleTrashDraftItemClick(event, ${index})" aria-selected="${selectedTrashDraftIndexes.has(index)}">
          <div class="chap-title-row">
            <span class="chap-file-icon draft-icon">T${index + 1}</span>
            <div class="chap-item-main">
              <span class="chap-title">${escapeHtml(draft.title || `${text().draftPrefix} ${index + 1}`)}</span>
              <span class="cn">${chapterWordTotal(draft, index)} ${escapeHtml(text().words)}</span>
            </div>
          </div>
          <button class="chapter-menu-btn" type="button" onclick="event.stopPropagation(); openTrashDraftActionsPanel(${index}, this)"
            title="${escapeHtml(text().trashActions)}" aria-label="${escapeHtml(text().trashActions)}">
            ${lmIcon("kebab")}
          </button>
        </div>`).join('')
      : `<div class="part-empty">${escapeHtml(text().trashEmpty)}</div>`}`;
  syncSidebarScrollThumbs();
}

function applyDraftBoxSaveIndicatorState() {
  const draftTitle = document.getElementById('draftBoxTitle');
  if (!draftTitle) return;
  const state = setDraftBoxSaveIndicator.state || 'idle';

  draftTitle.classList.remove('is-draft-saving', 'is-draft-saved');
  if (state === 'idle') return;

  draftTitle.classList.add(state === 'saved' ? 'is-draft-saved' : 'is-draft-saving');
}

function setDraftBoxSaveIndicator(state = 'busy') {
  clearTimeout(setDraftBoxSaveIndicator.timer);
  if (!chapterDrafts.length) {
    setDraftBoxSaveIndicator.state = 'idle';
    applyDraftBoxSaveIndicatorState();
    return;
  }

  setDraftBoxSaveIndicator.state = state;
  applyDraftBoxSaveIndicatorState();

  if (state === 'saved') {
    setDraftBoxSaveIndicator.timer = setTimeout(() => {
      setDraftBoxSaveIndicator.state = 'idle';
      applyDraftBoxSaveIndicatorState();
      if (!chapterDrafts.length) renderDrafts();
    }, 1800);
  }
}

function sidebarScrollTarget(kind = 'chapters') {
  if (kind === 'draft') return document.getElementById('draftBox');
  if (kind === 'raw') return document.getElementById('rawChapterList');
  return document.getElementById('chapter-list');
}

const CHAPTER_PANEL_MIN_LIST_HEIGHT = lmEditorAdvancedNumber('sidebarMinHeight', 160);
const DRAFT_COMPACT_VISIBLE_ITEMS = lmEditorAdvancedNumber('draftVisibleItems', 2.5);
const DRAFT_COMPACT_MIN_ITEMS = lmEditorAdvancedNumber('draftCompactMinimum', 3);
const DRAFT_COMPACT_FALLBACK_HEIGHT = lmEditorAdvancedNumber('draftFallbackHeight', 190);

function sidebarScrollKindKey(kind = 'chapters') {
  return kind === 'draft' || kind === 'raw' ? kind : 'chapters';
}

function sidebarScrollThumbId(kind = 'chapters') {
  const key = sidebarScrollKindKey(kind);
  if (key === 'draft') return 'draft-box-scroll-thumb';
  if (key === 'raw') return 'raw-chapter-scroll-thumb';
  return 'chapter-list-scroll-thumb';
}

function sidebarScrollThumbClass(kind = 'chapters') {
  const key = sidebarScrollKindKey(kind);
  if (key === 'draft') return 'draft-box-scroll-thumb';
  if (key === 'raw') return 'raw-chapter-scroll-thumb';
  return 'chapter-list-scroll-thumb';
}

function ensureSidebarScrollThumb(kind = 'chapters') {
  const panel = document.getElementById('chapter-panel');
  if (!panel) return null;
  const key = sidebarScrollKindKey(kind);
  const thumbId = sidebarScrollThumbId(key);
  let thumb = document.getElementById(thumbId);
  if (!thumb) {
    thumb = document.createElement('div');
    thumb.id = thumbId;
    thumb.className = `sidebar-scroll-thumb ${sidebarScrollThumbClass(key)}`;
    thumb.hidden = true;
    thumb.setAttribute('aria-hidden', 'true');
    panel.appendChild(thumb);
  }
  if (thumb.dataset.sidebarThumbReady !== 'true') {
    thumb.dataset.sidebarThumbReady = 'true';
    thumb.addEventListener('pointerdown', event => startSidebarScrollThumbDrag(key, event));
    thumb.addEventListener('pointerenter', () => setSidebarScrollbarHover(key, true));
    thumb.addEventListener('pointerleave', () => clearSidebarScrollbarHover(key));
  }
  return thumb;
}

function sidebarScrollMetrics(kind = 'chapters') {
  const key = sidebarScrollKindKey(kind);
  const panel = document.getElementById('chapter-panel');
  const thumb = ensureSidebarScrollThumb(key);
  const target = sidebarScrollTarget(key);
  if (!panel || !thumb || !target) return null;

  const targetStyle = window.getComputedStyle(target);
  const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
  const targetVisible = !target.hidden && targetStyle.display !== 'none' && target.clientHeight > 0;
  const isScrollable = targetVisible && maxScroll > 2;
  if (!isScrollable) {
    return { key, panel, thumb, target, maxScroll, targetVisible, isScrollable };
  }

  const panelRect = panel.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const trackPadding = 12;
  const trackTop = targetRect.top - panelRect.top + trackPadding;
  const trackHeight = Math.max(34, targetRect.height - trackPadding * 2);
  const thumbHeight = Math.min(trackHeight, Math.max(30, (target.clientHeight / target.scrollHeight) * trackHeight));
  const scrollableTrack = Math.max(1, trackHeight - thumbHeight);
  const thumbRightOffset = key === 'draft' ? 2.5 : -1;
  const thumbRight = Math.max(6, panelRect.right - targetRect.right + thumbRightOffset);

  return {
    key,
    panel,
    thumb,
    target,
    maxScroll,
    targetVisible,
    isScrollable,
    panelRect,
    targetRect,
    trackTop,
    trackHeight,
    thumbHeight,
    scrollableTrack,
    thumbRight
  };
}

function bindSidebarScrollHoverTarget(kind = 'chapters') {
  const key = sidebarScrollKindKey(kind);
  const target = sidebarScrollTarget(key);
  if (!target || target.dataset.sidebarScrollHoverReady === key) return;
  target.dataset.sidebarScrollHoverReady = key;
  target.addEventListener('pointermove', event => handleSidebarScrollbarHover(key, event), { passive: true });
  target.addEventListener('pointerleave', () => clearSidebarScrollbarHover(key));
}

function setSidebarScrollbarHover(kind = 'chapters', isHovered = false) {
  const key = sidebarScrollKindKey(kind);
  const previousKind = sidebarScrollHoverKind;
  sidebarScrollHoverKind = isHovered ? key : (previousKind === key ? '' : previousKind);
  sidebarScrollTarget(key)?.classList.toggle('is-scrollbar-hovered', sidebarScrollHoverKind === key);
  if (previousKind && previousKind !== sidebarScrollHoverKind) {
    sidebarScrollTarget(previousKind)?.classList.remove('is-scrollbar-hovered');
    updateSidebarScrollThumb(previousKind, false);
  }
  updateSidebarScrollThumb(key, sidebarScrollTarget(key)?.classList.contains('is-scrolling'));
}

function handleSidebarScrollbarHover(kind = 'chapters', event) {
  const key = sidebarScrollKindKey(kind);
  const metrics = sidebarScrollMetrics(key);
  if (!metrics || !metrics.isScrollable) {
    setSidebarScrollbarHover(key, false);
    return;
  }

  const hoverWidth = 18;
  const hoverBleed = 8;
  const isInsideY = event.clientY >= metrics.targetRect.top && event.clientY <= metrics.targetRect.bottom;
  const isNearScrollbar =
    event.clientX >= metrics.targetRect.right - hoverWidth &&
    event.clientX <= metrics.targetRect.right + hoverBleed;
  setSidebarScrollbarHover(key, isInsideY && isNearScrollbar);
}

function clearSidebarScrollbarHover(kind = 'chapters') {
  setSidebarScrollbarHover(kind, false);
}

function startSidebarScrollThumbDrag(kind = 'chapters', event) {
  const key = sidebarScrollKindKey(kind);
  const metrics = sidebarScrollMetrics(key);
  if (!metrics || !metrics.isScrollable) return;

  event.preventDefault();
  event.stopPropagation();
  clearTimeout(sidebarScrollHideTimers[key]);
  sidebarScrollThumbDrag = {
    kind: key,
    pointerId: event.pointerId,
    startY: event.clientY,
    startScrollTop: metrics.target.scrollTop,
    maxScroll: metrics.maxScroll,
    scrollableTrack: metrics.scrollableTrack
  };
  sidebarScrollHoverKind = key;
  metrics.target.classList.add('is-scrolling');
  metrics.target.classList.add('is-scrollbar-hovered');
  metrics.thumb.classList.add('is-dragging');
  metrics.thumb.setPointerCapture?.(event.pointerId);
  updateSidebarScrollThumb(key, true);
}

function handleSidebarScrollThumbDrag(event) {
  const drag = sidebarScrollThumbDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;

  const target = sidebarScrollTarget(drag.kind);
  if (!target) return;

  event.preventDefault();
  const deltaY = event.clientY - drag.startY;
  const nextScrollTop = drag.startScrollTop + (deltaY / drag.scrollableTrack) * drag.maxScroll;
  target.scrollTop = clampNumber(nextScrollTop, 0, drag.maxScroll);
  updateSidebarScrollThumb(drag.kind, true);
}

function endSidebarScrollThumbDrag(event) {
  const drag = sidebarScrollThumbDrag;
  if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;

  const target = sidebarScrollTarget(drag.kind);
  const thumb = document.getElementById(sidebarScrollThumbId(drag.kind));
  thumb?.releasePointerCapture?.(drag.pointerId);
  thumb?.classList.remove('is-dragging');
  sidebarScrollThumbDrag = null;
  sidebarScrollHoverKind = '';
  target?.classList.remove('is-scrollbar-hovered');
  clearTimeout(sidebarScrollHideTimers[drag.kind]);
  if (target) {
    sidebarScrollHideTimers[drag.kind] = setTimeout(() => {
      target.classList.remove('is-scrolling');
      updateSidebarScrollThumb(drag.kind, false);
    }, 650);
  } else {
    updateSidebarScrollThumb(drag.kind, false);
  }
}

function updateSidebarScrollThumb(kind = 'chapters', visible = false) {
  const key = sidebarScrollKindKey(kind);
  const thumb = ensureSidebarScrollThumb(key);
  const metrics = sidebarScrollMetrics(key);
  if (!thumb) return;
  if (!metrics || !metrics.isScrollable) {
    thumb.hidden = true;
    thumb.classList.remove('is-visible', 'is-dragging');
    return;
  }

  const shouldShow = Boolean(
    (visible || sidebarScrollHoverKind === key || sidebarScrollThumbDrag?.kind === key) &&
    metrics.isScrollable
  );
  thumb.hidden = !shouldShow;
  thumb.classList.toggle('is-visible', shouldShow);
  if (!shouldShow) return;

  const thumbTop = metrics.trackTop + (metrics.target.scrollTop / metrics.maxScroll) * metrics.scrollableTrack;

  thumb.style.top = `${thumbTop}px`;
  thumb.style.right = `${metrics.thumbRight}px`;
  thumb.style.height = `${metrics.thumbHeight}px`;
}

function handleSidebarScrollReveal(kind = 'chapters') {
  const key = sidebarScrollKindKey(kind);
  const target = sidebarScrollTarget(key);
  if (!target) return;
  target.classList.add('is-scrolling');
  updateSidebarScrollThumb(key, true);
  clearTimeout(sidebarScrollHideTimers[key]);
  sidebarScrollHideTimers[key] = setTimeout(() => {
    target.classList.remove('is-scrolling');
    updateSidebarScrollThumb(key, false);
  }, 850);
}

function syncSidebarScrollThumbs() {
  requestAnimationFrame(() => {
    syncChapterPanelLayoutMetrics();
    bindSidebarScrollHoverTarget('draft');
    bindSidebarScrollHoverTarget('chapters');
    bindSidebarScrollHoverTarget('raw');
    updateSidebarScrollThumb('draft', false);
    updateSidebarScrollThumb('chapters', false);
    updateSidebarScrollThumb('raw', false);
  });
}

function chapterPanelOuterHeight(element) {
  if (!element || element.hidden) return 0;
  const style = window.getComputedStyle(element);
  return element.getBoundingClientRect().height +
    (parseFloat(style.marginTop) || 0) +
    (parseFloat(style.marginBottom) || 0);
}

function isExpandedSidebarListScrollable() {
  const panel = document.getElementById('chapter-panel');
  if (!panel?.classList.contains('is-sidebar-list-expanded')) return false;
  return [document.getElementById('chapter-list'), document.getElementById('rawChapterList')]
    .some(target => {
      if (!target || target.hidden) return false;
      const style = window.getComputedStyle(target);
      if (style.display === 'none' || style.visibility === 'hidden' || target.clientHeight <= 0) return false;
      return target.scrollHeight - target.clientHeight > 2;
    });
}

function draftBoxFullOuterHeight(draftBox) {
  if (!draftBox || draftBox.hidden) return 0;
  const style = window.getComputedStyle(draftBox);
  if (isExpandedSidebarListScrollable()) {
    return draftBox.getBoundingClientRect().height +
      (parseFloat(style.marginTop) || 0) +
      (parseFloat(style.marginBottom) || 0);
  }
  const borderHeight =
    (parseFloat(style.borderTopWidth) || 0) +
    (parseFloat(style.borderBottomWidth) || 0);
  return draftBox.scrollHeight + borderHeight +
    (parseFloat(style.marginTop) || 0) +
    (parseFloat(style.marginBottom) || 0);
}

function hasChapterPanelListContent() {
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  return Boolean(manifest.parts.length || chapters.length);
}

function shouldConstrainChapterPanelLists() {
  if (!hasActiveStory() || !chapterDrafts.length || !hasChapterPanelListContent()) return false;

  const panel = document.getElementById('chapter-panel');
  const draftBox = document.getElementById('draftBox');
  const partsHeading = document.getElementById('partsHeading');
  const rawChapterSection = document.getElementById('rawChapterSection');
  const storySummary = document.getElementById('story-summary');
  const draftActionRow = document.querySelector('.draft-action-row');
  const chapterActionsBottom = document.querySelector('.chapter-actions-bottom');
  if (!panel || !draftBox || draftBox.hidden || !partsHeading || partsHeading.hidden) return false;

  const fixedHeight =
    chapterPanelOuterHeight(storySummary) +
    chapterPanelOuterHeight(draftActionRow) +
    draftBoxFullOuterHeight(draftBox) +
    chapterPanelOuterHeight(partsHeading) +
    chapterPanelOuterHeight(rawChapterSection) +
    chapterPanelOuterHeight(chapterActionsBottom);
  return panel.clientHeight - fixedHeight < CHAPTER_PANEL_MIN_LIST_HEIGHT;
}

function syncChapterPanelLayoutMetrics() {
  const panel = document.getElementById('chapter-panel');
  const draftBox = document.getElementById('draftBox');
  if (!panel || !draftBox || draftBox.hidden) {
    panel?.style.removeProperty('--draft-compact-height');
    return;
  }

  const draftTitle = document.getElementById('draftBoxTitle');
  const draftItem = draftBox.querySelector('.draft-item');
  if (!draftTitle || !draftItem) {
    panel.style.removeProperty('--draft-compact-height');
    return;
  }
  if (chapterDrafts.length < DRAFT_COMPACT_MIN_ITEMS) {
    panel.style.removeProperty('--draft-compact-height');
    return;
  }

  const draftBoxStyle = window.getComputedStyle(draftBox);
  const draftBoxChrome =
    (parseFloat(draftBoxStyle.paddingTop) || 0) +
    (parseFloat(draftBoxStyle.paddingBottom) || 0) +
    (parseFloat(draftBoxStyle.borderTopWidth) || 0) +
    (parseFloat(draftBoxStyle.borderBottomWidth) || 0);
  const measuredCompactHeight = Math.ceil(
    draftBoxChrome +
    chapterPanelOuterHeight(draftTitle) +
    chapterPanelOuterHeight(draftItem) * DRAFT_COMPACT_VISIBLE_ITEMS
  );
  const rootCompactHeight = parseFloat(
    window.getComputedStyle(document.documentElement).getPropertyValue('--draft-compact-height')
  );
  const compactHeight = rootCompactHeight > 0
    ? rootCompactHeight
    : measuredCompactHeight || DRAFT_COMPACT_FALLBACK_HEIGHT;
  panel.style.setProperty('--draft-compact-height', `${compactHeight}px`);
}

function applyChapterPanelOverflowClasses() {
  const panel = document.getElementById('chapter-panel');
  const chapterList = document.getElementById('chapter-list');
  if (!panel || !chapterList) return;

  syncChapterPanelLayoutMetrics();
  const isConstrained = chapterListOverflowMode !== 'normal' || isPartsListCollapsedByRaw || isPartsListForceExpanded;
  const isCollapsed = !isPartsListForceExpanded && (chapterListOverflowMode === 'collapsed' || isPartsListCollapsedByRaw);
  const rawSection = document.getElementById('rawChapterSection');
  const isPartsExpanded = !isCollapsed && (chapterListOverflowMode === 'expanded' || isPartsListForceExpanded);
  const isRawExpanded = Boolean(rawSection && !rawSection.hidden && rawSection.classList.contains('is-expanded'));
  const isExpandedAfterDraftOverflow = isPartsExpanded || isRawExpanded;
  const shouldCompactDraftBox = isExpandedAfterDraftOverflow && chapterDrafts.length >= DRAFT_COMPACT_MIN_ITEMS;
  panel.classList.toggle('is-chapter-list-constrained', isConstrained);
  panel.classList.toggle('is-chapter-list-collapsed', isCollapsed);
  panel.classList.toggle('is-chapter-list-expanded', isPartsExpanded);
  panel.classList.toggle('is-raw-list-expanded', isRawExpanded);
  panel.classList.toggle('is-sidebar-list-expanded', isExpandedAfterDraftOverflow);
  panel.classList.toggle('is-draft-box-compact', shouldCompactDraftBox);
  chapterList.hidden = isCollapsed;
  panel.classList.toggle('has-scrollable-sidebar-list', isExpandedSidebarListScrollable());
}

function scheduleChapterPanelOverflowCheck() {
  cancelAnimationFrame(chapterPanelOverflowRaf);
  chapterPanelOverflowRaf = requestAnimationFrame(() => {
    chapterPanelOverflowRaf = null;
    if (isPartsListForceExpanded || isPartsListCollapsedByRaw) {
      applyChapterPanelOverflowClasses();
      return;
    }
    const shouldConstrain = shouldConstrainChapterPanelLists();
    if (!shouldConstrain && chapterListOverflowMode !== 'normal') {
      chapterListOverflowMode = 'normal';
      renderChapters();
      return;
    }
    if (shouldConstrain && chapterListOverflowMode === 'normal') {
      chapterListOverflowMode = 'collapsed';
      renderChapters();
      return;
    }
    applyChapterPanelOverflowClasses();
  });
}

function toggleChapterListOverflowPanel() {
  const isCollapsed = !isPartsListForceExpanded && (chapterListOverflowMode === 'collapsed' || isPartsListCollapsedByRaw);
  if (chapterListOverflowMode === 'normal' && !isPartsListCollapsedByRaw && !isPartsListForceExpanded) return;
  if (isCollapsed) {
    isPartsListCollapsedByRaw = false;
    isPartsListForceExpanded = true;
    chapterListOverflowMode = 'expanded';
    isRawChapterSectionExpanded = false;
  } else {
    isPartsListForceExpanded = false;
    isPartsListCollapsedByRaw = true;
    if (chapterListOverflowMode !== 'normal') {
      chapterListOverflowMode = 'collapsed';
    }
  }
  renderChapters();
}

function toggleRawChapterExpansion() {
  const willExpandRawChapters = !isRawChapterSectionExpanded;
  isRawChapterSectionExpanded = willExpandRawChapters;
  if (willExpandRawChapters) {
    expandedPartIndex = -1;
    isPartsListCollapsedByRaw = true;
    isPartsListForceExpanded = false;
  }
  renderChapters();
}

function handleRawChapterToggleKeydown(event) {
  if (event.target !== event.currentTarget) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  toggleRawChapterExpansion();
}

function renderChapterPanelHeading(partsHeading, label) {
  if (!partsHeading) return;
  const isConstrained = chapterListOverflowMode !== 'normal' || isPartsListCollapsedByRaw || isPartsListForceExpanded;
  const isCollapsed = !isPartsListForceExpanded && (chapterListOverflowMode === 'collapsed' || isPartsListCollapsedByRaw);
  partsHeading.classList.toggle('is-collapse-toggle', isConstrained);
  if (!isConstrained) {
    partsHeading.textContent = label;
    partsHeading.removeAttribute('title');
    return;
  }

  partsHeading.title = isCollapsed ? `Show ${label}` : `Hide ${label}`;
  partsHeading.innerHTML = `
    <button class="parts-collapse-toggle-btn" type="button" onclick="toggleChapterListOverflowPanel()"
      aria-expanded="${!isCollapsed}">
      <span class="parts-collapse-label">${escapeHtml(label)}</span>
      ${lmChevronSpan(isCollapsed ? 'right' : 'down')}
    </button>`;
}

function renderRawChapterSection(rawChapterSection, flatChapterItems = [], copy = text()) {
  if (!rawChapterSection) return;
  const hasRawChapters = flatChapterItems.length > 0;
  rawChapterSection.hidden = !hasRawChapters;
  rawChapterSection.classList.toggle('is-expanded', hasRawChapters && isRawChapterSectionExpanded);
  rawChapterSection.classList.toggle('is-collapsed', hasRawChapters && !isRawChapterSectionExpanded);
  if (!hasRawChapters) {
    rawChapterSection.classList.remove('has-chapter-selection', 'is-panel-saving', 'is-panel-saved');
    rawChapterSection.innerHTML = '';
    updateSidebarScrollThumb('raw', false);
    return;
  }
  const isExpanded = isRawChapterSectionExpanded;
  const selectedRawCount = selectedChapterScope === 'raw'
    ? flatChapterItems.filter(({ index }) => selectedChapterIndexes.has(index)).length
    : 0;
  rawChapterSection.classList.toggle('has-chapter-selection', selectedRawCount > 0);

  rawChapterSection.innerHTML = `
    <div class="parts-collapse-toggle-btn raw-chapters-toggle-btn" role="button" tabindex="0"
      onclick="toggleRawChapterExpansion()" onkeydown="handleRawChapterToggleKeydown(event)"
      aria-expanded="${isExpanded}">
      <span class="parts-collapse-label">${escapeHtml(copy.chapters)}</span>
      <button class="part-menu-btn chapter-to-draft-btn raw-chapter-to-draft-btn" type="button"
        onclick="event.stopPropagation(); openChapterRecentToDraftPanel('raw', -1, this)"
        title="${escapeHtml(copy.moveChaptersToDraft)}" aria-label="${escapeHtml(copy.moveChaptersToDraft)}">
        ${CHAPTER_TO_DRAFT_SVG}
      </button>
      ${lmChevronSpan(isExpanded ? 'down' : 'right')}
    </div>
    <div class="part-children raw-chapter-children raw-chapter-list" id="rawChapterList">
      ${isExpanded ? flatChapterItems.map(({ chapter, index }) => `
        <div class="chap-item ${!isDraftActive() && index === curChap ? 'active' : ''} ${selectedChapterIndexes.has(index) ? 'is-selected' : ''}"
          data-editor-document="chapter" data-editor-document-index="${index}"
          onclick="handleChapterItemClick(event, ${index})" aria-selected="${selectedChapterIndexes.has(index)}">
          <div class="chap-title-row">
            <span class="chap-file-icon">${chapterDisplayNumber(chapter, index)}</span>
            <div class="chap-item-main">
              <span class="chap-title">${escapeHtml(chapterDisplayTitle(chapter, index))}</span>
              <span class="cn">${chapterWordTotal(chapter, index)} ${copy.words}</span>
            </div>
          </div>
          <button class="chapter-menu-btn" type="button" onclick="event.stopPropagation(); openChapterDetailsPanel(${index}, this)"
            title="${escapeHtml(copy.chapterDetails)}" aria-label="${escapeHtml(copy.chapterDetails)}">
            ${lmIcon("kebab")}
          </button>
        </div>`).join('') : ''}
    </div>`;
  document.getElementById('rawChapterList')?.addEventListener('scroll', () => handleSidebarScrollReveal('raw'), { passive: true });
  bindSidebarScrollHoverTarget('raw');
}

function syncWorkspaceTopbarState() {
  const hasStory = hasActiveStory();

  const storyLibraryButton = document.getElementById('storyLibraryBtn');
  const exportButton = document.getElementById('exportBtn');
  if (storyLibraryButton) storyLibraryButton.hidden = !hasStory;
  if (exportButton) exportButton.hidden = !hasStory;

  if (hasStory) return;

  closeStoryLibraryPanel();
  closeStorySummaryMenu();
  closePartDetailsPanel();
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  closeFactComposer();
  closeFactDetailPanel();
  closeCategoryActionPanel();
  closeNamingEntryPanel();
  closeNameDetailPanel();
  setToolDock(false);
  setFindPanel(false);
}

function sidebarSaveHeadingForTarget(target = 'parts') {
  if (target === 'chapters') {
    const rawHeading = document.getElementById('rawChapterSection');
    if (rawHeading && !rawHeading.hidden) return rawHeading;
    return document.getElementById('partsHeading');
  }
  return document.getElementById('partsHeading');
}

function setSidebarSaveIndicator(target = 'parts', state = 'busy') {
  const heading = sidebarSaveHeadingForTarget(target);
  if (!heading) return;

  const timerKey = target === 'chapters' ? 'chaptersTimer' : 'partsTimer';
  clearTimeout(setSidebarSaveIndicator[timerKey]);
  heading.classList.remove('is-panel-saving', 'is-panel-saved');

  if (state === 'idle') return;

  heading.classList.add(state === 'saved' ? 'is-panel-saved' : 'is-panel-saving');
  if (state === 'saved') {
    setSidebarSaveIndicator[timerKey] = setTimeout(() => {
      heading.classList.remove('is-panel-saved');
    }, 1800);
  }
}

function sidebarSaveTargetForChapter(chapterIndex) {
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const chapter = chapters[chapterIndex];
  const partIndex = Number.isInteger(chapter?.partIndex) ? chapter.partIndex : -1;
  return manifest.parts.length && partIndex >= 0 && partIndex < manifest.parts.length
    ? 'parts'
    : 'chapters';
}

function renderChapters() {
  syncWorkspaceTopbarState();
  const chapterList = document.getElementById('chapter-list');
  const storySummary = document.getElementById('story-summary');
  const draftActionRow = document.querySelector('.draft-action-row');
  const partsHeading = document.getElementById('partsHeading');
  const rawChapterSection = document.getElementById('rawChapterSection');
  const chapterActionsBottom = document.querySelector('.chapter-actions-bottom');

  if (!hasActiveStory()) {
    chapterListOverflowMode = 'normal';
    isPartsListCollapsedByRaw = false;
    isPartsListForceExpanded = false;
    isRawChapterSectionExpanded = false;
    isDraftTrashMode = false;
    applyChapterPanelOverflowClasses();
    renderDrafts();
    updateChapterPanelBottomActions();
    if (storySummary) storySummary.hidden = true;
    if (draftActionRow) draftActionRow.hidden = true;
    if (partsHeading) partsHeading.hidden = true;
    if (rawChapterSection) {
      rawChapterSection.hidden = true;
      rawChapterSection.innerHTML = '';
    }
    if (chapterActionsBottom) chapterActionsBottom.hidden = true;
    if (chapterList) chapterList.innerHTML = `<div class="no-story-empty">${escapeHtml(text().noStoryAvailable)}</div>`;
    updateStorySummary();
    syncSidebarScrollThumbs();
    return;
  }

  if (storySummary) storySummary.hidden = false;
  if (draftActionRow) draftActionRow.hidden = false;
  if (partsHeading) partsHeading.hidden = false;
  if (rawChapterSection) {
    rawChapterSection.hidden = true;
    rawChapterSection.innerHTML = '';
  }
  if (chapterActionsBottom) chapterActionsBottom.hidden = false;
  ensureChapters();
  normalizeChapterSelection();
  normalizeTrashDraftSelection();

  if (isDraftTrashMode) {
    selectedDraftIndexes.clear();
    lastSelectedDraftIndex = null;
    selectedChapterIndexes.clear();
    selectedChapterScope = null;
    if (draftActionRow) draftActionRow.hidden = true;
    if (partsHeading) partsHeading.hidden = true;
    if (chapterList) {
      chapterList.hidden = true;
      chapterList.innerHTML = '';
    }
    if (rawChapterSection) {
      rawChapterSection.hidden = true;
      rawChapterSection.innerHTML = '';
    }
    renderTrashDrafts();
    updateChapterPanelBottomActions();
    applyChapterPanelOverflowClasses();
    syncSidebarScrollThumbs();
    return;
  }

  if (chapterList) chapterList.hidden = false;
  renderDrafts();
  updateChapterPanelBottomActions();
  const copy = text();
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const hasParts = manifest.parts.length > 0;
  if (partsHeading) {
    partsHeading.hidden = !hasParts && !chapters.length;
    renderChapterPanelHeading(partsHeading, hasParts ? copy.parts : copy.chapters);
  }
  if (!hasParts) {
    isRawChapterSectionExpanded = false;
    isPartsListCollapsedByRaw = false;
    isPartsListForceExpanded = false;
    renderRawChapterSection(rawChapterSection, [], copy);
    chapterList.innerHTML = chapters.length
      ? chapters.map((chapter, index) => `
          <div class="chap-item ${!isDraftActive() && index === curChap ? 'active' : ''} ${selectedChapterIndexes.has(index) ? 'is-selected' : ''}"
            data-editor-document="chapter" data-editor-document-index="${index}"
            onclick="handleChapterItemClick(event, ${index})" aria-selected="${selectedChapterIndexes.has(index)}">
            <div class="chap-title-row">
                <span class="chap-file-icon">${chapterDisplayNumber(chapter, index)}</span>
                <div class="chap-item-main">
                  <span class="chap-title">${escapeHtml(chapterDisplayTitle(chapter, index))}</span>
                  <span class="cn">${chapterWordTotal(chapter, index)} ${copy.words}</span>
                </div>
              </div>
            <button class="chapter-menu-btn" type="button" onclick="event.stopPropagation(); openChapterDetailsPanel(${index}, this)"
              title="${escapeHtml(copy.chapterDetails)}" aria-label="${escapeHtml(copy.chapterDetails)}">
              ${lmIcon("kebab")}
            </button>
          </div>`)
        .join('')
      : `<div class="part-empty">${escapeHtml(copy.noSavedChapters)}</div>`;
    updateStorySummary();
    applyChapterPanelOverflowClasses();
    scheduleChapterPanelOverflowCheck();
    syncSidebarScrollThumbs();
    return;
  }

  const chaptersByPart = new Map();
  const flatChapterItems = [];

  chapters.forEach((chapter, index) => {
    const partIndex = Number.isInteger(chapter.partIndex) ? chapter.partIndex : -1;
    if (partIndex < 0 || partIndex >= manifest.parts.length) {
      flatChapterItems.push({ chapter, index });
      return;
    }
    if (!chaptersByPart.has(partIndex)) chaptersByPart.set(partIndex, []);
    chaptersByPart.get(partIndex).push({ chapter, index });
  });

  const partSections = manifest.parts.map((part, partIndex) => {
    const isExpanded = partIndex === expandedPartIndex;
    const isActivePart = partIndex === curPart;
    const partChapters = chaptersByPart.get(partIndex) || [];
    const canShowPartChapterToDraft = canConvertPartChaptersToDraft(partIndex);
    const selectedInPartCount = selectedChapterScope === chapterScopeKey('part', partIndex)
      ? partChapters.filter(({ index }) => selectedChapterIndexes.has(index)).length
      : 0;
    const boundaryActions = partChapterBoundarySelection(partIndex);
    const selectedBoundaryActions = selectedInPartCount ? `
      ${boundaryActions.moveUp ? `<button class="part-menu-btn chapter-boundary-transfer-btn" type="button"
        onclick="event.stopPropagation(); moveSelectedPartBoundaryChapters(${partIndex}, 'up')"
        title="Move selected chapters to the previous part" aria-label="Move selected chapters to the previous part">
        ${lmChevronSpan('up')}
      </button>` : ''}
      ${boundaryActions.moveDown ? `<button class="part-menu-btn chapter-boundary-transfer-btn" type="button"
        onclick="event.stopPropagation(); moveSelectedPartBoundaryChapters(${partIndex}, 'down')"
        title="Move selected chapters to the next part" aria-label="Move selected chapters to the next part">
        ${lmChevronSpan('down')}
      </button>` : ''}
      ${boundaryActions.moveToTemporary ? `<button class="part-menu-btn chapter-boundary-transfer-btn" type="button"
        onclick="event.stopPropagation(); moveSelectedPartBoundaryChapters(${partIndex}, 'temporary')"
        title="Move selected chapters to Temporary Chapters" aria-label="Move selected chapters to Temporary Chapters">
        ${lmChevronSpan('down')}
      </button>` : ''}
      ${boundaryActions.moveToDraft ? `<button class="part-menu-btn chapter-to-draft-btn chapter-boundary-transfer-btn" type="button"
        onclick="event.stopPropagation(); openChapterRecentToDraftPanel('part', ${partIndex}, this)"
        title="${escapeHtml(copy.moveChaptersToDraft)}" aria-label="${escapeHtml(copy.moveChaptersToDraft)}">
        ${CHAPTER_TO_DRAFT_SVG}
      </button>` : ''}` : '';

    const chapterItems = isExpanded && partChapters.length
      ? partChapters.map(({ chapter, index }, chapterIndex) => `
          <div class="chap-item ${!isDraftActive() && index === curChap ? 'active' : ''} ${selectedChapterIndexes.has(index) ? 'is-selected' : ''}"
            data-editor-document="chapter" data-editor-document-index="${index}"
            onclick="handleChapterItemClick(event, ${index})" aria-selected="${selectedChapterIndexes.has(index)}">
            <div class="chap-title-row">
                <span class="chap-file-icon">${chapterDisplayNumber(chapter, index)}</span>
                <div class="chap-item-main">
                  <span class="chap-title">${escapeHtml(chapterDisplayTitle(chapter, index))}</span>
                  <span class="cn">${chapterWordTotal(chapter, index)} ${copy.words}</span>
                </div>
            </div>
            <button class="chapter-menu-btn" type="button" onclick="event.stopPropagation(); openChapterDetailsPanel(${index}, this)"
              title="${escapeHtml(copy.chapterDetails)}" aria-label="${escapeHtml(copy.chapterDetails)}">
              ${lmIcon("kebab")}
            </button>
          </div>`)
        .join('')
      : isExpanded
        ? `<div class="part-empty">${escapeHtml(copy.noChaptersInPart)}</div>`
        : '';

    return `
      <div class="part-section ${isExpanded ? 'is-expanded' : 'is-collapsed'} ${isActivePart ? 'is-active-part' : ''} ${selectedInPartCount ? 'has-chapter-selection' : ''}">
        <div class="part-header">
          <div class="part-tree-main">
            <button class="part-toggle-btn" type="button" onclick="togglePartExpansion(${partIndex})" aria-expanded="${isExpanded}">
              ${lmChevronSpan(isExpanded ? 'down' : 'right')}
            </button>
            <button class="part-copy part-copy-btn" type="button" onclick="togglePartExpansion(${partIndex})" title="Expand / Collapse">
              <div class="part-title">${escapeHtml(part.title || defaultPartTitle(partIndex))}</div>
              <div class="part-meta">${partChapters.length} ${escapeHtml(copy.chapters)}${part.synopsis ? ' Â· ' + escapeHtml(part.synopsis) : ''}</div>
            </button>
          </div>
          ${selectedBoundaryActions}
          ${partChapters.length && canShowPartChapterToDraft && !selectedInPartCount ? `<button class="part-menu-btn chapter-to-draft-btn" type="button"
            onclick="event.stopPropagation(); openChapterRecentToDraftPanel('part', ${partIndex}, this)"
            title="${escapeHtml(copy.moveChaptersToDraft)}" aria-label="${escapeHtml(copy.moveChaptersToDraft)}">
            ${CHAPTER_TO_DRAFT_SVG}
          </button>` : ''}
          <button class="part-menu-btn part-details-menu-btn" type="button" onclick="openPartDetailsPanel(${partIndex}, this)" title="${escapeHtml(copy.partDetails)}" aria-label="${escapeHtml(copy.partDetails)}">
            ${lmIcon("kebab")}
          </button>
        </div>
        <div class="part-children part-chapter-children">${chapterItems}</div>
      </div>`;
  }).join('');

  chapterList.innerHTML = partSections;
  renderRawChapterSection(rawChapterSection, flatChapterItems, copy);
  updateStorySummary();
  applyChapterPanelOverflowClasses();
  scheduleChapterPanelOverflowCheck();
  syncSidebarScrollThumbs();
}

let editorDocumentLoadSequence = 0;
let activeEditorHTMLBuffer = '';
let activeEditorHTMLBufferVersion = 0;
let committedEditorHTMLBufferVersion = 0;
let editorHTMLMemoryCommitTimer = null;
let activeEditorHTMLAnalysisPromise = null;
let activeEditorHTMLBridgePromise = null;
let editorInputBridgeSequence = 0;
let completedEditorInputBridgeSequence = 0;
let persistedEditorInputSequence = 0;
const switchedDocumentSnapshots = new Map();
let switchedDocumentSnapshotSequence = 0;
const EDITOR_READING_WORDS_PER_MINUTE = lmEditorAdvancedNumber('readingWordsPerMinute', 200);
const EDITOR_PROCESSING_WORKER_URL = `assets/pages/story-novel-project-editor/js/editor-processing-worker.js?v=20260813-preserve-empty-lines&readingWpm=${EDITOR_READING_WORDS_PER_MINUTE}`;
const EDITOR_HTML_BRIDGE_WORKER_URL = `assets/pages/story-novel-project-editor/js/editor-html-bridge-worker.js?v=20260813-preserve-empty-lines&readingWpm=${EDITOR_READING_WORDS_PER_MINUTE}&maxWindow=${lmEditorAdvancedNumber('workerWindowMaximum', 40)}`;
let editorWorkerJobSequence = 0;

function editorWorkerNamesPayload() {
  return (namingData?.entries || []).map(entry => ({ id: entry.id, names: namingEntrySearchNames(entry) }));
}

function fallbackEditorWorkerAnalysis(payload = {}) {
  const normalizedHTML = payload.plainTextMode
    ? (payload.rawText?.trim() ? textToEditorHTML(String(payload.rawText).replace(/\r\n?/g, '\n').trimEnd()) : '')
    : String(payload.html || payload.rawHTML || '');
  const textValue = payload.plainTextMode
    ? String(payload.rawText || '').replace(/\r\n?/g, '\n').trimEnd()
    : editorHTMLToText(normalizedHTML);
  const words = countWordsFromText(textValue);
  return {
    normalizedHTML,
    text: textValue,
    stats: {
      words,
      characters: textValue.replace(/\s/g, '').length,
      paragraphs: textValue.split(/\n+/).filter(part => part.trim()).length || (textValue.trim() ? 1 : 0),
      sentences: textValue.split(/[।.!?]+/).filter(sentence => sentence.trim()).length,
      readingTime: Math.max(1, Math.round(words / EDITOR_READING_WORDS_PER_MINUTE))
    },
    nameMatches: []
  };
}

function createEditorWorkerLane({
  cancelPrevious = false,
  workerUrl = EDITOR_PROCESSING_WORKER_URL,
  fallbackHandler = fallbackEditorWorkerAnalysis
} = {}) {
  let worker = null;
  const pending = new Map();
  const responseTimeout = lmEditorAdvancedNumber('workerResponseTimeout', 8000);

  function rejectPending(reason = 'Worker restarted') {
    pending.forEach(({ reject, timeoutId }) => {
      clearTimeout(timeoutId);
      reject(new DOMException(reason, 'AbortError'));
    });
    pending.clear();
  }

  function stop() {
    worker?.terminate();
    worker = null;
  }

  function start() {
    if (worker || typeof Worker !== 'function') return worker;
    worker = new Worker(workerUrl);
    worker.onmessage = event => {
      const message = event.data || {};
      const task = pending.get(message.id);
      if (!task) return;
      pending.delete(message.id);
      clearTimeout(task.timeoutId);
      if (message.ok) task.resolve(message.result);
      else task.reject(new Error(message.error?.message || 'Editor worker task failed'));
    };
    worker.onerror = error => {
      const failure = new Error(error?.message || 'Editor processing worker failed');
      pending.forEach(({ reject, timeoutId }) => {
        clearTimeout(timeoutId);
        reject(failure);
      });
      pending.clear();
      stop();
    };
    return worker;
  }

  return {
    async run(payload = {}, type = 'analyze') {
      if (cancelPrevious && pending.size) {
        rejectPending('Superseded by a newer editor analysis');
        stop();
      }
      const activeWorker = start();
      if (!activeWorker) return fallbackHandler(payload);
      const id = ++editorWorkerJobSequence;
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          const timedOutTask = pending.get(id);
          if (!timedOutTask) return;
          pending.delete(id);
          timedOutTask.reject(new Error(`Editor Worker timed out after ${responseTimeout} ms`));
          rejectPending('Worker restarted after timeout');
          stop();
        }, responseTimeout);
        pending.set(id, { resolve, reject, timeoutId });
        activeWorker.postMessage({ id, type, payload });
      });
    },
    stop() {
      rejectPending('Editor worker stopped');
      stop();
    }
  };
}

const editorSurfaceWorkerLane = createEditorWorkerLane({ cancelPrevious: true });
const editorSnapshotWorkerLane = createEditorWorkerLane({ cancelPrevious: false });
const editorHTMLBridgeWorkerLane = createEditorWorkerLane({
  cancelPrevious: false,
  workerUrl: EDITOR_HTML_BRIDGE_WORKER_URL,
  fallbackHandler: payload => ({
    html: payload.plainTextMode
      ? (String(payload.rawText || '').trim() ? textToEditorHTML(String(payload.rawText).replace(/\r\n?/g, '\n').trimEnd()) : '')
      : String(payload.rawHTML || ''),
    inputSequence: payload.inputSequence,
    capturedAt: payload.capturedAt
  })
});
const VIRTUAL_EDITOR_WORD_THRESHOLD = lmEditorAdvancedNumber('virtualWordThreshold', 3000);
const VIRTUAL_EDITOR_WINDOW_SIZE = lmEditorAdvancedNumber('virtualWindowSize', 25);
let activeVirtualEditorDocument = null;
let virtualEditorScrollFrame = null;
let virtualEditorWindowRequest = 0;
let virtualEditorBeforeInputContext = null;
let virtualEditorMaterializeTimer = null;
let virtualEditorFullAnalysisTimer = null;
let virtualEditorPatchBatchTimer = null;
let virtualEditorPendingPatchBatch = null;
let virtualEditorProgrammaticScrollGuard = 0;
let isExpandingVirtualEditorSelection = false;
let virtualEditorSelectionExpansionPromise = null;
let isVirtualEditorDOMSelectionTransaction = false;
let virtualEditorDOMSelectionTransactionSequence = 0;
const VIRTUAL_EDITOR_PATCH_BATCH_MS = lmEditorAdvancedNumber('patchBatchDelay', 75);
const VIRTUAL_EDITOR_MATERIALIZE_DELAY_MS = lmEditorAdvancedNumber('materializeDelay', 700);
const VIRTUAL_EDITOR_FULL_ANALYSIS_DELAY_MS = lmEditorAdvancedNumber('fullAnalysisDelay', 2200);
const EDITOR_MEMORY_COMMIT_DELAY_MS = lmEditorAdvancedNumber('memoryCommitDelay', 180);
const EDITOR_AUTOSAVE_DELAY_MS = lmEditorAdvancedNumber('autosaveDelay', 1500);
const RESTRICTED_INPUT_IDLE_DELAY_MS = lmEditorAdvancedNumber('restrictedInputIdleDelay', 3000);
const SAVE_BUTTON_TYPING_IDLE_CHECK_MS = lmEditorAdvancedNumber('autosaveInputIdleDelay', 750);
const SAVE_BUTTON_STATE_POLL_MS = 120;
let isRestrictedInputRenderingActive = false;
let restrictedInputIdleTimer = null;
let restrictedInputCloseSequence = 0;
let saveButtonTypingIdleTimer = null;

function activeEditorSaveBaselineHTML() {
  const chapterEditDraft = typeof activeChapterEditDraft === 'function' ? activeChapterEditDraft() : null;
  return chapterEditDraft ? chapterEditDraft.lastAutosavedHTML || '' : lastSavedChapterHTML;
}

function markActiveEditorInputPersisted() {
  persistedEditorInputSequence = editorInputBridgeSequence;
  setSaveButtonSaved(true);
}

function reconcileSaveButtonAfterTyping(inputSequence, documentSequence) {
  if (inputSequence !== editorInputBridgeSequence || documentSequence !== editorDocumentLoadSequence) return;
  if (!isAutoSaveEnabled || !canEditActiveDocument()) return;

  const baselineHTML = activeEditorSaveBaselineHTML();
  const memoryIsCurrent = committedEditorHTMLBufferVersion === activeEditorHTMLBufferVersion;
  const snapshotIsSaved = persistedEditorInputSequence === inputSequence ||
    (memoryIsCurrent && activeEditorHTMLBuffer === baselineHTML);

  // Re-apply the state even when data-save-state already says "saved". This
  // repairs an icon/class that was left visually stale by an earlier async UI
  // callback and also synchronises the focus-mode save button.
  if (snapshotIsSaved) {
    setSaveButtonSaved(true);
    return;
  }

  saveButtonTypingIdleTimer = setTimeout(() => {
    saveButtonTypingIdleTimer = null;
    reconcileSaveButtonAfterTyping(inputSequence, documentSequence);
  }, SAVE_BUTTON_STATE_POLL_MS);
}

function scheduleSaveButtonTypingIdleCheck() {
  clearTimeout(saveButtonTypingIdleTimer);
  const inputSequence = editorInputBridgeSequence;
  const documentSequence = editorDocumentLoadSequence;
  saveButtonTypingIdleTimer = setTimeout(() => {
    saveButtonTypingIdleTimer = null;
    if (
      inputSequence === editorInputBridgeSequence &&
      documentSequence === editorDocumentLoadSequence &&
      isAutoSaveEnabled &&
      canEditActiveDocument()
    ) {
      // This timeout has already fired, so a subsequent input must not cancel
      // this save or its non-cancelling HTML bridge lane. That later input will
      // simply schedule/queue the next autosave generation.
      runAutoSave('typing-idle-750');
    }
    reconcileSaveButtonAfterTyping(inputSequence, documentSequence);
  }, SAVE_BUTTON_TYPING_IDLE_CHECK_MS);
}

function virtualEditorLogicalParagraphs(text) {
  // Every newline is structural editor data. Empty array entries represent
  // user-created blank lines and must survive restricted rendering.
  return String(text || '').replace(/\r\n?/g, '\n').split('\n');
}

function virtualEditorLogicalParagraphIndexForTextOffset(text, offset) {
  const source = String(text || '').replace(/\r\n?/g, '\n');
  const safeOffset = Math.max(0, Math.min(source.length, Number(offset) || 0));
  return Math.max(0, source.slice(0, safeOffset).split('\n').length - 1);
}

function virtualEditorParagraphSeparator() {
  // Configured and manually edited gaps already exist as empty logical lines.
  // Adding the configured gap again here would duplicate or erase formatting.
  return '\n';
}

function captureVirtualEditorGlobalSelection(editor, state) {
  const snapshot = currentEditorHistorySelection(editor);
  if (!snapshot) return null;
  const textValue = editor.textContent || '';
  const fullTextValue = state.temporarilyMaterialized
    ? textValue
    : Array.isArray(state.sessionParagraphs)
      ? state.sessionParagraphs.join('\n')
      : editorHTMLToText(activeEditorHTMLBuffer || state.html || state.documentItem?.content || '');
  const endpoint = offset => {
    const localParagraph = virtualEditorLogicalParagraphIndexForTextOffset(textValue, offset);
    const paragraphStart = virtualEditorParagraphStartOffset(textValue, localParagraph);
    return {
      paragraph: localParagraph + (state.temporarilyMaterialized ? 0 : state.start),
      offsetInParagraph: Math.max(0, offset - paragraphStart)
    };
  };
  const start = endpoint(snapshot.startTextOffset);
  const end = endpoint(snapshot.endTextOffset);
  const absoluteOffset = point => virtualEditorParagraphStartOffset(fullTextValue, point.paragraph) + point.offsetInParagraph;
  return {
    start,
    end,
    // Keep absolute offsets as a cross-render fallback. A restricted-input
    // session may finish before Undo is invoked, leaving a full plain DOM with
    // no active virtual state; paragraph-only metadata would otherwise resolve
    // to offset zero in the normal restore path.
    startTextOffset: absoluteOffset(start),
    endTextOffset: absoluteOffset(end),
    collapsed: snapshot.collapsed,
    direction: snapshot.direction
  };
}

function restoreVirtualEditorGlobalSelection(editor, snapshot) {
  if (!editor || !snapshot) return false;
  const textValue = editor.textContent || '';
  const state = activeVirtualEditorDocument;
  const paragraphBase = state && !state.temporarilyMaterialized ? state.start : 0;
  const backingText = state && !state.temporarilyMaterialized && Array.isArray(state.sessionParagraphs)
    ? state.sessionParagraphs.join('\n')
    : textValue;
  const renderedParagraphs = virtualEditorLogicalParagraphs(textValue);
  const endpointFor = edge => {
    const stored = snapshot[edge];
    if (Number.isFinite(Number(stored?.paragraph))) return stored;
    const absoluteOffset = Number(snapshot[`${edge}TextOffset`]);
    if (!Number.isFinite(absoluteOffset)) return null;
    const paragraph = virtualEditorLogicalParagraphIndexForTextOffset(backingText, absoluteOffset);
    return {
      paragraph,
      offsetInParagraph: Math.max(0, absoluteOffset - virtualEditorParagraphStartOffset(backingText, paragraph))
    };
  };
  const positionFor = endpoint => {
    if (!endpoint) return null;
    const localParagraph = Number(endpoint.paragraph) - paragraphBase;
    if (!Number.isInteger(localParagraph) || localParagraph < 0 || localParagraph >= renderedParagraphs.length) return null;
    const localOffset = Math.max(0, Math.min(
      renderedParagraphs[localParagraph].length,
      Number(endpoint.offsetInParagraph) || 0
    ));
    const paragraphStart = virtualEditorParagraphStartOffset(textValue, localParagraph);
    return editorHistoryPositionForTextOffset(editor, paragraphStart + localOffset);
  };
  const start = positionFor(endpointFor('start'));
  const end = positionFor(endpointFor('end'));
  if (!start?.node || !end?.node) return false;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  if (snapshot.direction === 'backward' && typeof selection?.setBaseAndExtent === 'function') {
    selection.setBaseAndExtent(end.node, end.offset, start.node, start.offset);
  }
  savedEditorRange = range.cloneRange();
  return true;
}

function expandVirtualEditorForSelection(snapshot = null) {
  const state = activeVirtualEditorDocument;
  const editor = document.getElementById('editor');
  if (!state || !editor) return Promise.resolve(false);
  if (state.temporarilyMaterialized) return Promise.resolve(true);
  if (virtualEditorSelectionExpansionPromise) return virtualEditorSelectionExpansionPromise;
  const preserved = snapshot || captureVirtualEditorGlobalSelection(editor, state);
  isExpandingVirtualEditorSelection = true;
  virtualEditorSelectionExpansionPromise = Promise.resolve(temporarilyMaterializeVirtualEditor('selection'))
    .then(materialized => {
      if (materialized && preserved) restoreVirtualEditorGlobalSelection(editor, preserved);
      return materialized;
    })
    .finally(() => {
      isExpandingVirtualEditorSelection = false;
      virtualEditorSelectionExpansionPromise = null;
    });
  return virtualEditorSelectionExpansionPromise;
}

function waitForVirtualEditorFullDOM(editor, state, attempts = 8) {
  return new Promise(resolve => {
    let readyFrames = 0;
    const check = () => {
      const currentState = activeVirtualEditorDocument;
      const expectedLength = Math.max(0, Number(state.fullTextCharacterCount) || 0);
      const renderedLength = String(editor.textContent || '').replace(/\r\n?/g, '\n').length;
      const isReady = Boolean(
        currentState?.key === state.key &&
        currentState.temporarilyMaterialized &&
        renderedLength >= expectedLength
      );
      readyFrames = isReady ? readyFrames + 1 : 0;
      if (readyFrames >= 2 || attempts <= 1) {
        resolve(readyFrames >= 2);
        return;
      }
      attempts -= 1;
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

function handleVirtualEditorClipboardShortcut(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const key = typeof shortcutKey === 'function'
    ? shortcutKey(event)
    : String(event.key || '').toLowerCase();
  if (!['a', 'c', 'x', 'v'].includes(key) || !activeVirtualEditorDocument) return;
  if (activeVirtualEditorDocument.temporarilyMaterialized && !isRestrictedInputRenderingActive) return;
  const editor = document.getElementById('editor');
  if (!editor || (event.target !== editor && !editor.contains(event.target)) || document.activeElement !== editor) return;
  if (key === 'a') {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const state = activeVirtualEditorDocument;
    expandVirtualEditorForSelection().then(async materialized => {
      if (!materialized) return;
      const fullDOMReady = await waitForVirtualEditorFullDOM(editor, state);
      if (!fullDOMReady || activeVirtualEditorDocument?.key !== state.key) return;
      isVirtualEditorDOMSelectionTransaction = true;
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      savedEditorRange = range.cloneRange();
      requestAnimationFrame(() => { isVirtualEditorDOMSelectionTransaction = false; });
    });
    return;
  }
  if (activeVirtualEditorDocument.temporarilyMaterialized) return;
  expandVirtualEditorForSelection();
}

function handleVirtualEditorSelectionExpansion() {
  const state = activeVirtualEditorDocument;
  const editor = document.getElementById('editor');
  const selection = window.getSelection();
  if (!state || !editor || state.temporarilyMaterialized || isExpandingVirtualEditorSelection || !selection?.rangeCount || selection.isCollapsed) return;
  const snapshot = currentEditorHistorySelection(editor);
  if (!snapshot) return;
  const textLength = (editor.textContent || '').length;
  const reachesWindowBoundary = snapshot.startTextOffset <= 0 || snapshot.endTextOffset >= textLength;
  const selectedParagraphs = virtualEditorLogicalParagraphIndexForTextOffset(editor.textContent || '', snapshot.endTextOffset) -
    virtualEditorLogicalParagraphIndexForTextOffset(editor.textContent || '', snapshot.startTextOffset) + 1;
  if (reachesWindowBoundary || selectedParagraphs >= VIRTUAL_EDITOR_WINDOW_SIZE) {
    expandVirtualEditorForSelection(captureVirtualEditorGlobalSelection(editor, state));
  }
}

function virtualEditorParagraphStartOffset(text, paragraphIndex) {
  const source = String(text || '').replace(/\r\n?/g, '\n');
  if (paragraphIndex <= 0) return 0;
  let index = 0;
  let paragraph = 0;
  const separators = /\n/g;
  let match;
  while ((match = separators.exec(source))) {
    paragraph += 1;
    index = match.index + 1;
    if (paragraph >= paragraphIndex) return index;
  }
  return source.length;
}

function virtualEditorTextOffsetViewportTop(editor, textOffset) {
  if (!editor || typeof editorHistoryPositionForTextOffset !== 'function') return null;
  const position = editorHistoryPositionForTextOffset(editor, textOffset, { boundaryAffinity: 'forward' });
  if (!position?.node) return null;
  const range = document.createRange();
  const maxOffset = position.node.nodeType === Node.TEXT_NODE
    ? position.node.nodeValue?.length || 0
    : position.node.childNodes?.length || 0;
  const safeOffset = Math.max(0, Math.min(maxOffset, position.offset || 0));
  range.setStart(position.node, safeOffset);
  if (position.node.nodeType === Node.TEXT_NODE && safeOffset < maxOffset) range.setEnd(position.node, safeOffset + 1);
  else range.collapse(true);
  const rect = range.getClientRects()[0] || range.getBoundingClientRect();
  return Number.isFinite(rect?.top) ? rect.top : null;
}

function createVirtualEditorVisualShield(editor) {
  const wrap = document.getElementById('editor-wrap');
  if (!editor || !wrap) return null;
  wrap.querySelector('.virtual-editor-visual-shield')?.remove();
  const editorRect = editor.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const shield = editor.cloneNode(true);
  shield.removeAttribute('id');
  shield.removeAttribute('contenteditable');
  shield.setAttribute('aria-hidden', 'true');
  shield.classList.remove('is-empty');
  shield.classList.add('virtual-editor-visual-shield');
  shield.style.left = `${editorRect.left - wrapRect.left}px`;
  shield.style.top = `${editorRect.top - wrapRect.top}px`;
  shield.style.width = `${editorRect.width}px`;
  shield.style.height = `${editorRect.height}px`;
  wrap.appendChild(shield);
  shield.scrollTop = editor.scrollTop;
  shield.scrollLeft = editor.scrollLeft;
  return shield;
}

function releaseVirtualEditorVisualShield(shield, editor, anchor, localOffset, preferCaret = false) {
  if (!shield) return;
  requestAnimationFrame(() => {
    // Recheck after fonts/layout and the virtual pseudo-spacers have settled.
    const caretRect = preferCaret && typeof editorCaretRect === 'function' ? editorCaretRect(editor) : null;
    const settledTop = Number.isFinite(caretRect?.top)
      ? caretRect.top
      : virtualEditorTextOffsetViewportTop(editor, localOffset);
    if (Number.isFinite(settledTop) && Number.isFinite(anchor?.top)) {
      editor.scrollTop += settledTop - anchor.top;
    }
    updateEditorScrollThumb(false);
    requestAnimationFrame(() => shield.remove());
  });
}

function virtualEditorSelectionParagraphRange(editor, text, selectionSnapshot = currentEditorHistorySelection(editor)) {
  const paragraphs = virtualEditorLogicalParagraphs(text);
  if (!selectionSnapshot) return { start: 0, end: Math.min(1, paragraphs.length), paragraphCount: paragraphs.length };
  const startLine = virtualEditorLogicalParagraphIndexForTextOffset(text, selectionSnapshot.startTextOffset);
  const adjustedEndOffset = selectionSnapshot.collapsed
    ? selectionSnapshot.endTextOffset
    : Math.max(selectionSnapshot.startTextOffset, selectionSnapshot.endTextOffset - 1);
  const endLine = virtualEditorLogicalParagraphIndexForTextOffset(text, adjustedEndOffset);

  if (!selectionSnapshot.collapsed) {
    return {
      start: Math.max(0, startLine - 2),
      end: Math.min(paragraphs.length, endLine + 3),
      paragraphCount: paragraphs.length
    };
  }

  if (!(paragraphs[startLine] || '').trim()) {
    return {
      start: Math.max(0, startLine - 1),
      end: Math.min(paragraphs.length, startLine + 2),
      paragraphCount: paragraphs.length
    };
  }

  return { start: startLine, end: startLine + 1, paragraphCount: paragraphs.length };
}

function captureVirtualEditorBeforeInputContext(event) {
  const editor = document.getElementById('editor');
  if (!activeVirtualEditorDocument || !editor) {
    virtualEditorBeforeInputContext = null;
    return;
  }
  const textValue = editor.textContent || '';
  const selectionSnapshot = currentEditorHistorySelection(editor);
  const context = virtualEditorSelectionParagraphRange(editor, textValue, selectionSnapshot);
  if (selectionSnapshot?.collapsed) {
    const paragraphs = virtualEditorLogicalParagraphs(textValue);
    const line = virtualEditorLogicalParagraphIndexForTextOffset(textValue, selectionSnapshot.startTextOffset);
    const lineStart = virtualEditorParagraphStartOffset(textValue, line);
    const lineEnd = lineStart + String(paragraphs[line] || '').length;
    if (event?.inputType === 'deleteContentBackward' && selectionSnapshot.startTextOffset === lineStart && line > 0) {
      context.start = Math.min(context.start, line - 1);
    } else if (event?.inputType === 'deleteContentForward' && selectionSnapshot.startTextOffset === lineEnd && line < paragraphs.length - 1) {
      context.end = Math.max(context.end, line + 2);
    }
  }
  virtualEditorBeforeInputContext = context;
}

function virtualEditorPatchPayload(editor, state) {
  const textValue = String(editor?.textContent || '').replace(/\r\n?/g, '\n');
  const paragraphs = virtualEditorLogicalParagraphs(textValue);
  if (state.temporarilyMaterialized) {
    virtualEditorBeforeInputContext = null;
    return {
      start: 0,
      end: state.total,
      paragraphs,
      windowStart: 0
    };
  }
  const before = virtualEditorBeforeInputContext;
  virtualEditorBeforeInputContext = null;

  if (!before) {
    const current = virtualEditorSelectionParagraphRange(editor, textValue);
    return {
      start: state.start + current.start,
      end: state.start + current.end,
      paragraphs: paragraphs.slice(current.start, current.end),
      windowStart: state.start
    };
  }

  const paragraphDelta = paragraphs.length - before.paragraphCount;
  const replacementEnd = Math.max(before.start, Math.min(paragraphs.length, before.end + paragraphDelta));
  return {
    start: state.start + before.start,
    end: state.start + before.end,
    paragraphs: paragraphs.slice(before.start, replacementEnd),
    windowStart: state.start
  };
}

function flushVirtualEditorPatchBatch() {
  clearTimeout(virtualEditorPatchBatchTimer);
  virtualEditorPatchBatchTimer = null;
  const batch = virtualEditorPendingPatchBatch;
  virtualEditorPendingPatchBatch = null;
  if (!batch?.patches?.length) return activeEditorHTMLBridgePromise;

  const bridgeTask = editorHTMLBridgeWorkerLane.run({
    documentKey: batch.documentKey,
    patches: batch.patches,
    windowStart: batch.windowStart,
    windowSize: VIRTUAL_EDITOR_WINDOW_SIZE
  }, 'patch-virtual-batch');

  activeEditorHTMLBridgePromise = bridgeTask
    .then(result => {
      if (
        !result ||
        batch.documentSequence !== editorDocumentLoadSequence ||
        activeVirtualEditorDocument?.key !== batch.documentKey
      ) return null;
      completedEditorInputBridgeSequence = Math.max(completedEditorInputBridgeSequence, batch.inputSequence);
      applyVirtualEditorDeltaResult(result);
      if (batch.inputSequence === editorInputBridgeSequence && !virtualEditorPendingPatchBatch) {
        scheduleVirtualEditorIdleStages();
      }
      return result;
    })
    .catch(error => {
      console.warn('Virtual editor patch batch failed:', error);
      setSaveButtonSaved(false);
      setDefaultSaveStatus();
      return null;
    });
  return activeEditorHTMLBridgePromise;
}
