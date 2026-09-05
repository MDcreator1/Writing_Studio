async function showAllNamingCategories(button = null) {
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try {
    namingData = normalizeNamingData(namingData);
    const chapterKey = currentNamingChapterKey();
    const hiddenSet = hiddenCategoriesForChapter(chapterKey);
    const categories = namingData.categories || [];
    const isShowingAll = window.activeNamingShowAllCategoriesKey === chapterKey;
    let message = '';

    if (!isShowingAll) {
      window.activeNamingShowAllCategoriesKey = chapterKey;
      if (namingData.hiddenByChapter) delete namingData.hiddenByChapter[chapterKey];
      namingData.visibleByChapter = { ...(namingData.visibleByChapter || {}), [chapterKey]: categories.map(category => category.id) };
      message = 'All categories are now visible.';
    } else {
      window.activeNamingShowAllCategoriesKey = '';
      const activeText = activeNamingPanelText();
      const categoryStats = categories.map(category => {
        const projectedEntries = (namingData.entries || []).filter(entry => entry.categoryId === category.id);
        return {
          id: category.id,
          matchingCount: projectedEntries.filter(entry => namingEntryNameInText(entry, activeText)).length,
          totalEntries: window.LmInitialRendering?.namingCategoryCount?.(category.id) ?? projectedEntries.length
        };
      });
      const visibleIds = new Set(categoryStats.filter(category => category.matchingCount > 0).map(category => category.id));
      categoryStats
        .filter(category => !visibleIds.has(category.id))
        .sort((left, right) => right.totalEntries - left.totalEntries)
        .slice(0, Math.max(0, 6 - visibleIds.size))
        .forEach(category => visibleIds.add(category.id));
      const visibleList = [...visibleIds];
      namingData.hiddenByChapter = { ...(namingData.hiddenByChapter || {}), [chapterKey]: categories.filter(category => !visibleIds.has(category.id)).map(category => category.id) };
      namingData.visibleByChapter = { ...(namingData.visibleByChapter || {}), [chapterKey]: visibleList };
      message = `Smart filter applied: ${visibleList.length} categories visible.`;
    }

    renderTags();
    await window.LmInitialRendering?.syncActiveNamingVisibility?.();
    if (typeof showSmartCopyToast === 'function') showSmartCopyToast(message);
  } catch (error) {
    console.warn('Category visibility update failed:', error);
    showMiniReminder('Category visibility सुरक्षित रूप से update नहीं हो सकी।');
  } finally {
    if (button) button.disabled = false;
  }
}

function updateShowAllCategoriesBtnVisibility() {
  const btn = document.getElementById('showAllCategoriesBtn');
  const display = document.getElementById('tag-display');
  if (!btn || !display) return;

  if (!display._hasShowAllBtnScrollListener) {
    display._hasShowAllBtnScrollListener = true;
    display.addEventListener('scroll', updateShowAllCategoriesBtnVisibility);
    window.addEventListener('resize', updateShowAllCategoriesBtnVisibility);
  }

  const chapterKey = currentNamingChapterKey();
  const hiddenSet = hiddenCategoriesForChapter(chapterKey);
  const categories = namingData?.categories || [];
  const hasHidden = categories.some(cat => hiddenSet.has(cat.id));

  const hasScroll = display.scrollHeight > display.clientHeight + 2;
  const isAtBottom = display.scrollTop + display.clientHeight >= display.scrollHeight - 6;

  // Always visible if any category is hidden (so user can un-hide all anytime), or if no scrollbar / thumb at bottom
  const shouldBeVisible = hasHidden || !hasScroll || isAtBottom;
  btn.style.display = shouldBeVisible ? 'inline-flex' : 'none';

  if (hasHidden) {
    btn.classList.add('is-filtered');
    btn.title = 'Show all categories (Some categories are hidden)';
  } else {
    btn.classList.remove('is-filtered');
    btn.title = 'Smart filter categories (Hide empty categories)';
  }
}

function closeCategoryActionPanel() {
  closeCategoryInfoPopover();
  clearTimeout(categoryManagerScrollHideTimer);
  categoryManagerScrollThumbDrag = null;
  activeCategoryShortcutEditId = null;
  const panel = document.getElementById('categoryActionPanel');
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = '';
    panel.onclick = null;
  }
  activeFloatingAnchor = null;
}

function ensureCategoryInfoPopover() {
  let panel = document.getElementById('categoryInfoPopover');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'categoryInfoPopover';
    panel.className = 'category-info-popover';
    panel.hidden = true;
    document.body.appendChild(panel);
  }
  return panel;
}

function closeCategoryInfoPopover() {
  clearTimeout(closeCategoryInfoPopover.timer);
  const panel = document.getElementById('categoryInfoPopover');
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = '';
    panel.onclick = null;
  }
  if (closeCategoryInfoPopover.parentClickHandler) {
    document.getElementById('categoryActionPanel')?.removeEventListener('click', closeCategoryInfoPopover.parentClickHandler);
    closeCategoryInfoPopover.parentClickHandler = null;
  }
}

function ensureNamingEntryDescriptionPopover() {
  let panel = document.getElementById('namingEntryDescriptionPopover');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'namingEntryDescriptionPopover';
    panel.className = 'category-info-popover naming-entry-description-popover';
    panel.hidden = true;
    document.body.appendChild(panel);
  }
  panel.classList.add('category-info-popover', 'naming-entry-description-popover');
  panel.dataset.positionKey = 'namingEntryDescriptionPopover';
  panel.setAttribute('role', 'button');
  panel.tabIndex = 0;
  if (panel.dataset.namingDescriptionInteractiveBound !== 'true') {
    panel.dataset.namingDescriptionInteractiveBound = 'true';
    panel.addEventListener('pointerenter', keepNamingEntryDescriptionPopoverOpen);
    panel.addEventListener('pointerleave', scheduleNamingEntryDescriptionInfoClose);
    panel.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      openNamingEntryDescriptionDetail();
    });
  }
  return panel;
}

function closeNamingEntryDescriptionPopover() {
  clearTimeout(closeNamingEntryDescriptionPopover.timer);
  clearNamingEntryDescriptionCloseTimer();
  cancelAnimationFrame(namingEntryDescriptionPositionRaf);
  namingEntryDescriptionPositionRaf = null;
  activeNamingEntryDescriptionId = null;
  activeNamingEntryDescriptionAnchor = null;
  const panel = document.getElementById('namingEntryDescriptionPopover');
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = '';
    panel.onclick = null;
    panel.removeAttribute('aria-label');
  }
}

async function copyNamingEntryOnDoubleClick(event, entryId, anchor = null) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const entry = namingData?.entries?.find(item => item.id === entryId);
  const visibleName = anchor?.querySelector?.('.tname > span')?.textContent?.trim();
  const name = visibleName || String(entry?.name || '').trim();
  if (!name) return false;
  let copied = false;
  try {
    const input = document.createElement('textarea');
    input.value = name;
    input.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
    input.setAttribute('readonly', '');
    document.body.appendChild(input);
    input.select();
    copied = document.execCommand('copy');
    input.remove();
  } catch (_error) { copied = false; }
  if (!copied && navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(name); copied = true; } catch (_error) { copied = false; }
  }
  const message = copied ? `नाम कॉपी हो गया: ${name}` : 'नाम कॉपी नहीं हो सका।';
  if (typeof showSmartCopyToast === 'function') showSmartCopyToast(message);
  else if (typeof showMiniReminder === 'function') showMiniReminder(message);
  return copied;
}

function isNameDetailPanelOpen() {
  const panel = document.getElementById('nameDetailPanel');
  return Boolean(panel && !panel.hidden);
}

function clearNamingEntryDescriptionInfoTimer() {
  clearTimeout(namingEntryDescriptionInfoTimer);
  namingEntryDescriptionInfoTimer = null;
}

function clearNamingEntryDescriptionCloseTimer() {
  clearTimeout(namingEntryDescriptionCloseTimer);
  namingEntryDescriptionCloseTimer = null;
}

function scheduleNamingEntryDescriptionInfoClose() {
  clearNamingEntryDescriptionInfoTimer();
  clearNamingEntryDescriptionCloseTimer();
  namingEntryDescriptionCloseTimer = setTimeout(() => {
    namingEntryDescriptionCloseTimer = null;
    closeNamingEntryDescriptionPopover();
  }, NAMING_ENTRY_DESCRIPTION_CLOSE_DELAY_MS);
}

function keepNamingEntryDescriptionPopoverOpen() {
  clearNamingEntryDescriptionInfoTimer();
  clearNamingEntryDescriptionCloseTimer();
  clearTimeout(closeNamingEntryDescriptionPopover.timer);
  closeNamingEntryDescriptionPopover.timer = setTimeout(closeNamingEntryDescriptionPopover, 15000);
}

function openNamingEntryDescriptionDetail() {
  const entryId = activeNamingEntryDescriptionId;
  if (!entryId) return;
  const anchor = document.body.contains(activeNamingEntryDescriptionAnchor)
    ? activeNamingEntryDescriptionAnchor
    : null;
  showNameDetail(entryId, anchor);
}

function namingEntryFirstAppearanceLabel(entry = {}) {
  const status = typeof normalizeNamingEntryStatus === 'function'
    ? normalizeNamingEntryStatus(entry)
    : String(entry.chapterStatus || entry.documentType || '').toLowerCase();
  if (status !== 'chapter') return '';
  const chapterNo = typeof namingEntryFirstAppearanceChapterNo === 'function'
    ? namingEntryFirstAppearanceChapterNo(entry)
    : Number(entry.chapterNo || entry.descriptionMeta?.chapterNo || 0);
  if (!chapterNo) return '';
  const chapterTitle = String(
    entry.chapterTitle || entry.descriptionMeta?.chapterTitle ||
    (Number.isInteger(entry.chapterIndex) ? chapters[entry.chapterIndex]?.title : '') || 'Untitled Chapter'
  ).trim();
  return `${chapterNo}. ${chapterTitle}`;
}

function namingEntryDraftAppearanceLabel(entry = {}) {
  const status = typeof normalizeNamingEntryStatus === 'function'
    ? normalizeNamingEntryStatus(entry)
    : String(entry.chapterStatus || entry.documentType || '').toLowerCase();
  if (status !== 'draft') return '';
  const draftNo = Number(entry.draftNo || (Number.isInteger(entry.draftIndex) ? entry.draftIndex + 1 : 0));
  const draftTitle = String(
    entry.draftTitle || entry.chapterTitle ||
    (Number.isInteger(entry.draftIndex) ? chapterDrafts[entry.draftIndex]?.title : '') ||
    (draftNo ? `Draft ${draftNo}` : 'Draft')
  ).trim();
  return draftTitle;
}

function openNamingEntryDescriptionPanel(entryId, anchor = null) {
  if (isNameDetailPanelOpen() || !anchor) return;
  const panel = ensureNamingEntryDescriptionPopover();
  if (!panel) return;

  namingData = normalizeNamingData(namingData);
  const entry = namingData.entries.find(item => item.id === entryId);
  if (!entry) return;

  closeCategoryInfoPopover();
  closeNamingEntryDescriptionPopover();
  clearNamingEntryDescriptionCloseTimer();
  activeNamingEntryDescriptionId = entryId;
  activeNamingEntryDescriptionAnchor = anchor;
  panel.onclick = null;
  panel.setAttribute('aria-label', `Open details for ${entry.name}`);

  const description = entry.description || 'No description added yet.';
  const firstAppearance = namingEntryFirstAppearanceLabel(entry);
  const draftAppearance = namingEntryDraftAppearanceLabel(entry);
  panel.innerHTML = `
    ${firstAppearance ? `<div class="naming-entry-first-appearance" title="${escapeHtml(firstAppearance)}">${escapeHtml(firstAppearance)}</div>` : ''}
    ${draftAppearance ? `<div class="naming-entry-first-appearance is-draft-origin" title="${escapeHtml(draftAppearance)}">${escapeHtml(draftAppearance)}</div>` : ''}
    <p class="category-info-copy naming-entry-description-copy ${entry.description ? '' : 'is-muted'}">${escapeHtml(description)}</p>`;
  panel.hidden = false;
  positionCategoryInfoPopover(panel, anchor, 'namingEntryDescriptionPopover');
  closeNamingEntryDescriptionPopover.timer = setTimeout(closeNamingEntryDescriptionPopover, 15000);
  requestAnimationFrame(() => {
    panel.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      openNamingEntryDescriptionDetail();
    };
  });
}

function scheduleNamingEntryDescriptionInfo(event, entryId) {
  clearNamingEntryDescriptionInfoTimer();
  clearNamingEntryDescriptionCloseTimer();
  if (isNameDetailPanelOpen()) {
    closeNamingEntryDescriptionPopover();
    return;
  }
  const anchor = event?.currentTarget || event?.target;
  if (!anchor) return;
  namingEntryDescriptionInfoTimer = setTimeout(() => {
    namingEntryDescriptionInfoTimer = null;
    if (isNameDetailPanelOpen()) return;
    if (!document.body.contains(anchor)) return;
    openNamingEntryDescriptionPanel(entryId, anchor);
  }, NAMING_ENTRY_DESCRIPTION_INFO_DELAY_MS);
}

function clearNamingEntryDescriptionInfo() {
  clearNamingEntryDescriptionInfoTimer();
  closeNamingEntryDescriptionPopover();
}

function scheduleNamingEntryDescriptionReposition() {
  cancelAnimationFrame(namingEntryDescriptionPositionRaf);
  namingEntryDescriptionPositionRaf = requestAnimationFrame(() => {
    namingEntryDescriptionPositionRaf = null;
    const panel = document.getElementById('namingEntryDescriptionPopover');
    if (!panel || panel.hidden || !activeNamingEntryDescriptionId || !activeNamingEntryDescriptionAnchor) return;
    if (isNameDetailPanelOpen()) {
      closeNamingEntryDescriptionPopover();
      return;
    }
    if (!document.body.contains(activeNamingEntryDescriptionAnchor)) {
      closeNamingEntryDescriptionPopover();
      return;
    }
    positionCategoryInfoPopover(panel, activeNamingEntryDescriptionAnchor, 'namingEntryDescriptionPopover');
  });
}

window.addEventListener('resize', scheduleNamingEntryDescriptionReposition, { passive: true });

function clearCategoryActionTriggerClickTimer() {
  clearTimeout(categoryActionTriggerClickTimer);
  categoryActionTriggerClickTimer = null;
}

function clearCategoryActionTriggerInfoTimer() {
  clearTimeout(categoryActionTriggerInfoTimer);
  categoryActionTriggerInfoTimer = null;
}

function categoryCardElement(categoryId) {
  return [...document.querySelectorAll('.naming-category-card')]
    .find(card => card.dataset.categoryId === categoryId) || null;
}

function cancelInlineCategoryTitleEdit() {
  const activeEdit = activeInlineCategoryTitleEdit;
  activeInlineCategoryTitleEdit = null;
  if (!activeEdit) return;
  activeEdit.input?.remove();
  if (activeEdit.titleElement) activeEdit.titleElement.hidden = false;
  activeEdit.toggleElement?.classList.remove('is-inline-editing');
}

function saveInlineCategoryTitleEdit(categoryId, input) {
  namingData = normalizeNamingData(namingData);
  const category = namingData.categories.find(item => item.id === categoryId);
  if (!category || !input) {
    cancelInlineCategoryTitleEdit();
    return;
  }

  const cleanedTitle = input.value.trim();
  const originalTitle = category.title || '';
  if (!cleanedTitle) {
    input.focus();
    input.select();
    return;
  }
  if (cleanedTitle === originalTitle) {
    cancelInlineCategoryTitleEdit();
    return;
  }
  if (namingCategoryTitleExists(cleanedTitle, categoryId)) {
    showDuplicateReminder(text().duplicateCategoryTitle);
    input.focus();
    input.select();
    return;
  }

  activeInlineCategoryTitleEdit = null;
  namingData = normalizeNamingData({
    categories: namingData.categories.map(item =>
      item.id === categoryId ? { ...item, title: cleanedTitle } : item
    ),
    removedCategoryIds: namingData.removedCategoryIds,
    hiddenByChapter: namingData.hiddenByChapter,
    visibleByChapter: namingData.visibleByChapter,
    detectedByChapter: namingData.detectedByChapter,
    entries: namingData.entries
  });
  renderTags();
  saveNamingData();
  showSidePanelSaveLine(text().categoryTitleSaved);
}

function beginInlineCategoryTitleEdit(categoryId) {
  namingData = normalizeNamingData(namingData);
  const category = namingData.categories.find(item => item.id === categoryId);
  const card = categoryCardElement(categoryId);
  const toggleElement = card?.querySelector?.('.category-toggle');
  const titleElement = toggleElement?.querySelector?.('.category-title-text');
  if (!category || !toggleElement || !titleElement) return;

  cancelInlineCategoryTitleEdit();
  closeCategoryActionPanel();
  closeCategoryInfoPopover();
  closeNamingEntryDescriptionPopover();
  closeNamingEntryPanel();
  closeNameDetailPanel();

  const input = document.createElement('input');
  input.className = 'category-title-inline-input';
  input.type = 'text';
  input.value = category.title || '';
  input.setAttribute('aria-label', text().editCategoryTitle);
  input.addEventListener('click', event => event.stopPropagation());
  input.addEventListener('pointerdown', event => event.stopPropagation());
  input.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      saveInlineCategoryTitleEdit(categoryId, input);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelInlineCategoryTitleEdit();
    }
  });
  input.addEventListener('blur', () => {
    requestAnimationFrame(() => {
      if (activeInlineCategoryTitleEdit?.input === input) cancelInlineCategoryTitleEdit();
    });
  });

  titleElement.hidden = true;
  titleElement.insertAdjacentElement('afterend', input);
  toggleElement.classList.add('is-inline-editing');
  activeInlineCategoryTitleEdit = { categoryId, input, titleElement, toggleElement };
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function handleCategoryActionTriggerClick(event, categoryId) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (event?.detail > 1) {
    clearCategoryActionTriggerClickTimer();
    return;
  }
  clearCategoryActionTriggerClickTimer();
  clearCategoryActionTriggerInfoTimer();
  closeCategoryInfoPopover();
  categoryActionTriggerClickTimer = setTimeout(() => {
    categoryActionTriggerClickTimer = null;
    beginInlineCategoryTitleEdit(categoryId);
  }, CATEGORY_ACTION_TRIGGER_CLICK_DELAY_MS);
}

function handleCategoryActionTriggerDoubleClick(event, categoryId) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  clearCategoryActionTriggerClickTimer();
  clearCategoryActionTriggerInfoTimer();
  cancelInlineCategoryTitleEdit();
  closeCategoryInfoPopover();
  hideNamingCategoryForChapter(categoryId);
}

function scheduleCategoryActionTriggerInfo(event, categoryId) {
  clearCategoryActionTriggerInfoTimer();
  const anchor = event?.currentTarget || event?.target;
  if (!anchor) return;
  categoryActionTriggerInfoTimer = setTimeout(() => {
    categoryActionTriggerInfoTimer = null;
    if (!document.body.contains(anchor)) return;
    openCategoryInfoPanel(categoryId, anchor);
  }, CATEGORY_ACTION_TRIGGER_INFO_DELAY_MS);
}

function clearCategoryActionTriggerInfo() {
  clearCategoryActionTriggerInfoTimer();
  closeCategoryInfoPopover();
}

function categoryManagerScrollElements() {
  const panel = document.getElementById('categoryActionPanel');
  return {
    panel,
    list: document.getElementById('categoryVisibilityList'),
    thumb: document.getElementById('categoryManagerScrollThumb')
  };
}

function categoryManagerScrollMetrics() {
  const { panel, list, thumb } = categoryManagerScrollElements();
  if (!panel || !list || !thumb || list.scrollHeight <= list.clientHeight + 1) return null;
  const panelRect = panel.getBoundingClientRect();
  const listRect = list.getBoundingClientRect();
  const trackHeight = list.clientHeight;
  const thumbHeight = Math.max(30, Math.round((list.clientHeight / list.scrollHeight) * trackHeight));
  const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
  const maxScroll = Math.max(1, list.scrollHeight - list.clientHeight);
  const thumbTop = (list.scrollTop / maxScroll) * maxThumbTop;
  return {
    panel,
    list,
    thumb,
    maxScroll,
    maxThumbTop,
    top: Math.round(listRect.top - panelRect.top + thumbTop),
    right: Math.max(7, Math.round(panelRect.right - listRect.right - 5)),
    height: thumbHeight
  };
}

function updateCategoryManagerScrollThumb(visible = false) {
  const { thumb } = categoryManagerScrollElements();
  const metrics = categoryManagerScrollMetrics();
  if (!thumb || !metrics) {
    if (thumb) {
      thumb.hidden = true;
      thumb.classList.remove('is-visible', 'is-dragging');
    }
    return;
  }

  thumb.hidden = false;
  thumb.style.top = `${metrics.top}px`;
  thumb.style.right = `${metrics.right}px`;
  thumb.style.height = `${metrics.height}px`;
  thumb.classList.toggle('is-visible', Boolean(visible || categoryManagerScrollThumbDrag));
}

function revealCategoryManagerScrollThumb() {
  clearTimeout(categoryManagerScrollHideTimer);
  updateCategoryManagerScrollThumb(true);
  categoryManagerScrollHideTimer = setTimeout(() => updateCategoryManagerScrollThumb(false), 900);
}

function startCategoryManagerScrollThumbDrag(event) {
  if (event.button !== undefined && event.button !== 0) return;
  const metrics = categoryManagerScrollMetrics();
  if (!metrics) return;
  categoryManagerScrollThumbDrag = {
    pointerId: event.pointerId,
    startY: event.clientY,
    startScrollTop: metrics.list.scrollTop,
    maxScroll: metrics.maxScroll,
    maxThumbTop: Math.max(1, metrics.maxThumbTop)
  };
  metrics.thumb.classList.add('is-dragging', 'is-visible');
  metrics.thumb.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function handleCategoryManagerScrollThumbDrag(event) {
  const drag = categoryManagerScrollThumbDrag;
  const { list } = categoryManagerScrollElements();
  if (!drag || !list || event.pointerId !== drag.pointerId) return;
  const deltaY = event.clientY - drag.startY;
  list.scrollTop = clampNumber(drag.startScrollTop + (deltaY / drag.maxThumbTop) * drag.maxScroll, 0, drag.maxScroll);
  updateCategoryManagerScrollThumb(true);
  event.preventDefault();
}

function endCategoryManagerScrollThumbDrag(event) {
  const drag = categoryManagerScrollThumbDrag;
  if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
  const { thumb } = categoryManagerScrollElements();
  thumb?.releasePointerCapture?.(drag.pointerId);
  thumb?.classList.remove('is-dragging');
  categoryManagerScrollThumbDrag = null;
  revealCategoryManagerScrollThumb();
}

function initCategoryManagerScrollThumb() {
  const { list, thumb } = categoryManagerScrollElements();
  if (!list || !thumb) return;
  list.addEventListener('scroll', revealCategoryManagerScrollThumb, { passive: true });
  list.addEventListener('pointerenter', revealCategoryManagerScrollThumb, { passive: true });
  list.addEventListener('pointermove', revealCategoryManagerScrollThumb, { passive: true });
  list.addEventListener('pointerleave', () => {
    clearTimeout(categoryManagerScrollHideTimer);
    categoryManagerScrollHideTimer = setTimeout(() => updateCategoryManagerScrollThumb(false), 320);
  });
  thumb.addEventListener('pointerdown', startCategoryManagerScrollThumbDrag);
  thumb.addEventListener('pointermove', handleCategoryManagerScrollThumbDrag);
  thumb.addEventListener('pointerup', endCategoryManagerScrollThumbDrag);
  thumb.addEventListener('pointercancel', endCategoryManagerScrollThumbDrag);
  thumb.addEventListener('pointerenter', () => updateCategoryManagerScrollThumb(true));
  thumb.addEventListener('pointerleave', () => {
    if (!categoryManagerScrollThumbDrag) updateCategoryManagerScrollThumb(false);
  });
  requestAnimationFrame(() => updateCategoryManagerScrollThumb(false));
}

function categoryManagerPanelHtml() {
  const categoryRows = namingData.categories.map(category => {
    const isVisible = isNamingCategoryVisible(category.id);
    const canDeleteCategory = canDeleteNamingCategory(category.id);
    return `
      <div class="category-visibility-row ${canDeleteCategory ? 'can-delete-category' : ''}">
        <span>${escapeHtml(category.title)}</span>
        ${canDeleteCategory ? `<button class="category-manager-delete-btn" type="button"
          onclick="deleteNamingCategory('${escapeJsString(category.id)}', event)"
          title="${escapeHtml(text().deleteCategoryTitle)}" aria-label="${escapeHtml(text().deleteCategoryTitle)}">
          ${DRAFT_DELETE_SVG}
        </button>` : ''}
        ${categoryVisibilityToggleButton(category.id, isVisible, 'category-visibility-row-toggle')}
      </div>`;
  }).join('');
  return `
    <div class="category-panel-head">
      <div class="category-manager-heading">
        <h4>${escapeHtml(text().categoryManagerTitle)}</h4>
      </div>
    <button class="name-panel-close" type="button" onclick="closeCategoryActionPanel()">${CROSS_CLOSE_SVG}</button>
    </div>
    <div class="category-visibility-list" id="categoryVisibilityList">${categoryRows}</div>
    <div class="category-manager-scroll-thumb" id="categoryManagerScrollThumb" hidden aria-hidden="true"></div>`;
}

function categoryManagerHomePanelHtml() {
  return `
    <div class="category-panel-head">
      <div class="category-manager-heading">
        <h4>${escapeHtml(text().categoryManagerHeading)}</h4>
      </div>
      <button class="name-panel-close" type="button" onclick="closeCategoryActionPanel()">${CROSS_CLOSE_SVG}</button>
    </div>
    <div class="category-manager-choice-list">
      <button class="category-manager-choice-btn" type="button" onclick="openCategoryVisibilityPanel(activeFloatingAnchor)">
        <span>${escapeHtml(text().categoryManagerVisibility)}</span>
      </button>
      <button class="category-manager-choice-btn" type="button" onclick="openCategoryShortcutsPanel(activeFloatingAnchor)">
        <span>${escapeHtml(text().categoryManagerShortcuts)}</span>
      </button>
    </div>`;
}

function categoryShortcutsPanelHtml() {
  const definitions = new Map(namingCategoryShortcutDefinitions().map(definition => [definition.categoryId, definition]));
  const categoryRows = namingData.categories.map(category => {
    const definition = definitions.get(category.id);
    const shortcutLabel = definition?.label || '';
    const shortcutValue = definition?.sequence || '';
    const isEditing = activeCategoryShortcutEditId === category.id;
    const customShortcut = namingCategoryCustomShortcut(category);
    const shortcutMode = customShortcut ? text().saved : text().categoryShortcutAutoHint;

    return `
      <div class="category-shortcut-row ${isEditing ? 'is-editing' : ''}">
        <span class="category-shortcut-title">${escapeHtml(category.title)}</span>
        <div class="category-shortcut-control">
          <div class="category-shortcut-display" ${isEditing ? 'hidden' : ''}>
            <button class="category-shortcut-value" type="button" onclick="beginCategoryShortcutEdit('${escapeJsString(category.id)}')"
              title="${escapeHtml(shortcutMode)}" aria-label="${escapeHtml(text().categoryShortcutEditTitle)}"
              ${shortcutLabel ? `data-lm-shortcut="${escapeHtml(shortcutLabel)}"` : ''}>
              ${escapeHtml(shortcutLabel || '—')}
            </button>
            <button class="category-shortcut-edit-btn" type="button" onclick="beginCategoryShortcutEdit('${escapeJsString(category.id)}')"
              title="${escapeHtml(text().categoryShortcutEditTitle)}" aria-label="${escapeHtml(text().categoryShortcutEditTitle)}">
              ${lmIcon("edit")}
            </button>
          </div>
          <div class="category-shortcut-edit-wrap" ${isEditing ? '' : 'hidden'}>
            <input class="category-shortcut-input" id="categoryShortcutInput_${escapeHtml(category.id)}" type="text"
              value="${escapeHtml(shortcutLabel)}" placeholder="Alt+C+N"
              data-original-sequence="${escapeHtml(shortcutValue)}"
              oninput="markCategoryShortcutUnsaved('${escapeJsString(category.id)}')"
              onkeydown="handleCategoryShortcutKey(event, '${escapeJsString(category.id)}')">
            <button class="category-shortcut-save-btn" id="categoryShortcutSave_${escapeHtml(category.id)}" type="button"
              onclick="saveCategoryShortcutEdit('${escapeJsString(category.id)}')" hidden>Save</button>
            <button class="category-shortcut-cancel-btn" type="button" onclick="cancelCategoryShortcutEdit()">Cancel</button>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="category-panel-head">
      <div class="category-manager-heading">
        <h4>${escapeHtml(text().categoryShortcutsTitle)}</h4>
      </div>
      <button class="name-panel-close" type="button" onclick="closeCategoryActionPanel()">${CROSS_CLOSE_SVG}</button>
    </div>
    <div class="category-shortcut-list">${categoryRows}</div>`;
}

function refreshCategoryManagerPanel() {
  const panel = document.getElementById('categoryActionPanel');
  if (!panel || panel.hidden || !panel.classList.contains('category-manager-panel')) return false;
  const previousScrollTop = document.getElementById('categoryVisibilityList')?.scrollTop || 0;
  namingData = normalizeNamingData(namingData);
  panel.innerHTML = categoryManagerPanelHtml();
  const list = document.getElementById('categoryVisibilityList');
  if (list) list.scrollTop = previousScrollTop;
  initCategoryManagerScrollThumb();
  return true;
}

function openCategoryManagerPanel(anchor = null) {
  const panel = document.getElementById('categoryActionPanel');
  if (!panel) return;

  namingData = normalizeNamingData(namingData);
  activeCategoryShortcutEditId = null;
  closeCategoryInfoPopover();
  closeNamingEntryPanel();
  closeNameDetailPanel();
  activeFloatingAnchor = anchor;
  panel.classList.remove('category-action-card-panel', 'category-info-panel', 'category-manager-panel', 'category-shortcut-manager-panel');
  panel.classList.add('category-manager-menu-panel');

  panel.innerHTML = categoryManagerHomePanelHtml();
  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
}

function openCategoryVisibilityPanel(anchor = activeFloatingAnchor) {
  const panel = document.getElementById('categoryActionPanel');
  if (!panel) return;

  namingData = normalizeNamingData(namingData);
  activeCategoryShortcutEditId = null;
  closeCategoryInfoPopover();
  closeNamingEntryPanel();
  closeNameDetailPanel();
  activeFloatingAnchor = anchor;
  panel.classList.remove('category-action-card-panel', 'category-info-panel', 'category-manager-menu-panel', 'category-shortcut-manager-panel');
  panel.classList.add('category-manager-panel');

  panel.innerHTML = categoryManagerPanelHtml();
  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
  initCategoryManagerScrollThumb();
}

function openCategoryShortcutsPanel(anchor = activeFloatingAnchor) {
  const panel = document.getElementById('categoryActionPanel');
  if (!panel) return;

  namingData = normalizeNamingData(namingData);
  closeCategoryInfoPopover();
  closeNamingEntryPanel();
  closeNameDetailPanel();
  activeFloatingAnchor = anchor;
  panel.classList.remove('category-action-card-panel', 'category-info-panel', 'category-manager-menu-panel', 'category-manager-panel');
  panel.classList.add('category-shortcut-manager-panel');

  panel.innerHTML = categoryShortcutsPanelHtml();
  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
  if (activeCategoryShortcutEditId) {
    requestAnimationFrame(() => document.getElementById(`categoryShortcutInput_${activeCategoryShortcutEditId}`)?.focus());
  }
}

function refreshCategoryShortcutsPanel() {
  const panel = document.getElementById('categoryActionPanel');
  if (!panel || panel.hidden || !panel.classList.contains('category-shortcut-manager-panel')) return false;
  panel.innerHTML = categoryShortcutsPanelHtml();
  return true;
}

function beginCategoryShortcutEdit(categoryId) {
  activeCategoryShortcutEditId = categoryId;
  refreshCategoryShortcutsPanel();
  requestAnimationFrame(() => {
    const input = document.getElementById(`categoryShortcutInput_${categoryId}`);
    input?.focus();
    input?.select();
  });
}

function cancelCategoryShortcutEdit() {
  activeCategoryShortcutEditId = null;
  refreshCategoryShortcutsPanel();
  if (typeof setSidePanelSaveLine === 'function') setSidePanelSaveLine('idle', text().saved);
}

function markCategoryShortcutUnsaved(categoryId) {
  const input = document.getElementById(`categoryShortcutInput_${categoryId}`);
  const saveButton = document.getElementById(`categoryShortcutSave_${categoryId}`);
  if (!input || !saveButton) return;

  const parsedInput = parseCategoryShortcutEditInput(input.value);
  const normalizedValue = parsedInput.sequence;
  const originalSequence = normalizeNamingShortcutInput(input.dataset.originalSequence);
  const duplicate = parsedInput.isValid && normalizedValue && isNamingShortcutUsedByAnotherCategory(normalizedValue, categoryId);
  input.classList.toggle('is-invalid', !parsedInput.isValid);
  input.classList.toggle('is-duplicate', Boolean(duplicate));
  saveButton.hidden = parsedInput.isValid && normalizedValue === originalSequence && !duplicate;
  saveButton.disabled = !parsedInput.isValid || Boolean(duplicate);
  if (!parsedInput.isValid) {
    if (typeof setSidePanelSaveLine === 'function') setSidePanelSaveLine('busy', parsedInput.message);
  } else if (duplicate) {
    if (typeof setSidePanelSaveLine === 'function') setSidePanelSaveLine('busy', text().categoryShortcutDuplicate);
  } else if (normalizedValue !== originalSequence) {
    if (typeof setSidePanelSaveLine === 'function') setSidePanelSaveLine('busy', text().categoryShortcutUnsaved);
  }
}

function saveCategoryShortcutEdit(categoryId) {
  const input = document.getElementById(`categoryShortcutInput_${categoryId}`);
  if (!input) return;
  const parsedInput = parseCategoryShortcutEditInput(input.value);
  if (!parsedInput.isValid) {
    input.classList.add('is-invalid');
    if (typeof setSidePanelSaveLine === 'function') setSidePanelSaveLine('busy', parsedInput.message);
    return;
  }
  const saved = updateNamingCategoryShortcut(categoryId, parsedInput.sequence);
  if (!saved) {
    input.classList.add('is-duplicate');
    return;
  }
  activeCategoryShortcutEditId = null;
  openCategoryShortcutsPanel(activeFloatingAnchor);
}

function appendCategoryShortcutKey(input, categoryId, key) {
  if (!input) return;
  const replacementKey = String(key || '').toLocaleLowerCase();
  if (!/^[a-z0-9]$/u.test(replacementKey)) return;

  const parsedInput = parseCategoryShortcutEditInput(input.value);
  const currentSequence = !parsedInput.isValid || (input.selectionStart === 0 && input.selectionEnd === input.value.length)
    ? ''
    : parsedInput.sequence;
  const nextSequence = `${currentSequence}${replacementKey}`.slice(0, 6);
  input.value = namingShortcutLabelFromSequence(nextSequence);
  input.setSelectionRange(input.value.length, input.value.length);
  markCategoryShortcutUnsaved(categoryId);
}

function handleCategoryShortcutKey(event, categoryId) {
  if (event.key === 'Alt') {
    event.preventDefault();
    return;
  }
  if (event.altKey) {
    event.preventDefault();
    if (event.ctrlKey || event.shiftKey || event.metaKey || ['Tab', 'Control', 'Shift'].includes(event.key)) {
      if (typeof setSidePanelSaveLine === 'function') setSidePanelSaveLine('busy', text().categoryShortcutForbiddenKey);
      return;
    }
    appendCategoryShortcutKey(event.currentTarget, categoryId, event.key);
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    saveCategoryShortcutEdit(categoryId);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    cancelCategoryShortcutEdit();
  }
}

function openCategoryInfoPanel(categoryId, anchor = activeFloatingAnchor) {
  const panel = ensureCategoryInfoPopover();
  if (!panel) return;

  namingData = normalizeNamingData(namingData);
  const category = namingData.categories.find(item => item.id === categoryId);
  if (!category) return;

  closeCategoryInfoPopover();
  panel.onclick = null;

  const categoryInfo = category.info || text().categoryInfoEmpty;
  panel.innerHTML = `
    <p class="category-info-copy ${category.info ? '' : 'is-muted'}">${escapeHtml(categoryInfo)}</p>`;
  panel.hidden = false;
  positionCategoryInfoPopover(panel, anchor);
  closeCategoryInfoPopover.timer = setTimeout(closeCategoryInfoPopover, 15000);
  requestAnimationFrame(() => {
    panel.onclick = event => {
      event.stopPropagation();
      closeCategoryInfoPopover();
    };
    closeCategoryInfoPopover.parentClickHandler = event => {
      if (event.target?.closest?.('.category-info-btn')) return;
      closeCategoryInfoPopover();
    };
    document.getElementById('categoryActionPanel')?.addEventListener('click', closeCategoryInfoPopover.parentClickHandler);
  });
}

function clampInfoPopoverPosition(panel, left, top, positionConfig = {}) {
  const clampMode = String(
    positionConfig.clampMode || (positionConfig.clampToViewport ? 'viewport' : 'panel')
  ).toLowerCase();
  if (positionConfig.clamp === false || clampMode === 'none') {
    return {
      left: Math.round(left),
      top: Math.round(top)
    };
  }
  if (clampMode !== 'viewport') return clampFloatingPanelPosition(panel, left, top);
  const viewportPadding = lmPanelNumber?.(positionConfig.viewportPadding, 12) ?? 12;
  const panelWidth = panel?.offsetWidth || 260;
  const panelHeight = panel?.offsetHeight || 160;
  return {
    left: clampNumber(
      Math.round(left),
      viewportPadding,
      Math.max(viewportPadding, window.innerWidth - panelWidth - viewportPadding)
    ),
    top: clampNumber(
      Math.round(top),
      viewportPadding,
      Math.max(viewportPadding, window.innerHeight - panelHeight - viewportPadding)
    )
  };
}

function alignedInfoPopoverPosition(anchorRect, panelWidth, panelHeight, panelGap, placement, alignment) {
  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const anchorCenterY = anchorRect.top + anchorRect.height / 2;
  const normalizedPlacement = String(placement || 'right').toLowerCase();
  const normalizedAlignment = String(alignment || 'start').toLowerCase();
  let left = anchorRect.right + panelGap;
  let top = anchorRect.top;

  if (normalizedPlacement === 'left') {
    left = anchorRect.left - panelWidth - panelGap;
  } else if (normalizedPlacement === 'top') {
    left = anchorRect.left;
    top = anchorRect.top - panelHeight - panelGap;
  } else if (normalizedPlacement === 'bottom') {
    left = anchorRect.left;
    top = anchorRect.bottom + panelGap;
  } else if (normalizedPlacement === 'center') {
    left = anchorCenterX - panelWidth / 2;
    top = anchorCenterY - panelHeight / 2;
  }

  if (['left', 'right'].includes(normalizedPlacement)) {
    if (normalizedAlignment === 'center') top = anchorCenterY - panelHeight / 2;
    if (normalizedAlignment === 'end') top = anchorRect.bottom - panelHeight;
  }
  if (['top', 'bottom'].includes(normalizedPlacement)) {
    if (normalizedAlignment === 'center') left = anchorCenterX - panelWidth / 2;
    if (normalizedAlignment === 'end') left = anchorRect.right - panelWidth;
  }

  return { left, top };
}

function anchorGapInfoPopoverLeft(anchorRect, panel, panelWidth, panelGap, placement, manualOffsetX, positionConfig = {}) {
  const viewportPadding = lmPanelNumber?.(positionConfig.viewportPadding, 12) ?? 12;
  const viewportRight = window.innerWidth - viewportPadding;
  const normalizedPlacement = String(placement || 'right').toLowerCase();
  const preferredSide = normalizedPlacement === 'left' ? 'left' : 'right';
  const sideRange = side => {
    const isRight = side === 'right';
    const min = isRight ? anchorRect.right + panelGap : viewportPadding;
    const max = isRight
      ? viewportRight - panelWidth
      : anchorRect.left - panelGap - panelWidth;
    const available = isRight
      ? viewportRight - anchorRect.right - panelGap
      : anchorRect.left - panelGap - viewportPadding;
    const desired = isRight
      ? anchorRect.right + panelGap + manualOffsetX
      : anchorRect.left - panelWidth - panelGap + manualOffsetX;
    return { side, min, max, available, desired };
  };
  const preferredRange = sideRange(preferredSide);
  const fallbackRange = sideRange(preferredSide === 'right' ? 'left' : 'right');
  const fittingRange = [preferredRange, fallbackRange].find(range => range.max >= range.min);
  if (fittingRange) {
    panel.style.removeProperty('max-width');
    return clampNumber(fittingRange.desired, fittingRange.min, fittingRange.max);
  }

  const bestRange = [preferredRange, fallbackRange]
    .sort((firstRange, secondRange) => secondRange.available - firstRange.available)[0];
  if (bestRange.available > 80) {
    const availableWidth = Math.floor(bestRange.available);
    panel.style.maxWidth = `${availableWidth}px`;
    return bestRange.side === 'right'
      ? Math.round(anchorRect.right + panelGap)
      : Math.round(Math.max(viewportPadding, anchorRect.left - panelGap - availableWidth));
  }

  panel.style.removeProperty('max-width');
  return clampNumber(
    preferredRange.desired,
    viewportPadding,
    Math.max(viewportPadding, viewportRight - panelWidth)
  );
}

function positionCategoryInfoPopover(panel, anchor, positionKey = 'categoryInfoPopover') {
  if (!panel || !anchor) return;
  panel.style.visibility = 'hidden';
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.left = 'var(--floating-panel-fallback-left, 12px)';
  panel.style.top = 'var(--floating-panel-fallback-top, 12px)';
  panel.style.removeProperty('max-width');

  requestAnimationFrame(() => {
    const anchorRect = anchor.getBoundingClientRect?.();
    if (!anchorRect) {
      panel.style.visibility = '';
      return;
    }
    const positionConfig = lmFloatingPanelPositionConfig?.(panel, {
      gap: 20,
      topOffset: 0,
      leftOffset: 0,
      rightOffset: 0
    }, { positionKey }) || {};
    const panelGap = lmPanelNumber?.(positionConfig.gap, 20) ?? 20;
    const leftOffset = lmPanelNumber?.(positionConfig.leftOffset, 0) ?? 0;
    const rightOffset = lmPanelNumber?.(positionConfig.rightOffset, 0) ?? 0;
    const topOffset = lmPanelNumber?.(positionConfig.topOffset, 0) ?? 0;
    const offsetX = lmPanelNumber?.(positionConfig.offsetX, 0) ?? 0;
    const offsetY = lmPanelNumber?.(positionConfig.offsetY, 0) ?? 0;
    const panelRect = panel.getBoundingClientRect();
    const panelWidth = panelRect.width || panel.offsetWidth || 260;
    const panelHeight = panelRect.height || panel.offsetHeight || 160;
    const placement = positionConfig.placement || positionConfig.anchorSide || 'right';
    const manualOffsetX = offsetX + leftOffset - rightOffset;
    const manualOffsetY = offsetY + topOffset;
    const preserveAnchorGap = Boolean(positionConfig.preserveAnchorGap) &&
      ['left', 'right'].includes(String(placement || '').toLowerCase());
    const applyOffsetsAfterClamp = String(positionConfig.offsetMode || '').toLowerCase() === 'afterclamp' && !preserveAnchorGap;
    const basePosition = alignedInfoPopoverPosition(
      anchorRect,
      panelWidth,
      panelHeight,
      panelGap,
      placement,
      positionConfig.alignment
    );
    if (preserveAnchorGap) {
      const left = anchorGapInfoPopoverLeft(anchorRect, panel, panelWidth, panelGap, placement, manualOffsetX, positionConfig);
      const safePosition = clampInfoPopoverPosition(panel, left, basePosition.top + manualOffsetY, positionConfig);
      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = `${safePosition.top}px`;
      panel.style.visibility = '';
      return;
    }
    const left = basePosition.left + (applyOffsetsAfterClamp ? 0 : manualOffsetX);
    const top = basePosition.top + (applyOffsetsAfterClamp ? 0 : manualOffsetY);
    const safePosition = clampInfoPopoverPosition(panel, left, top, positionConfig);
    panel.style.left = `${Math.round(safePosition.left + (applyOffsetsAfterClamp ? manualOffsetX : 0))}px`;
    panel.style.top = `${Math.round(safePosition.top + (applyOffsetsAfterClamp ? manualOffsetY : 0))}px`;
    panel.style.visibility = '';
  });
}

function categoryActionPanelPosition(panel, anchor, anchorRect, panelWidth, panelHeight, bounds) {
  const categoryTitleRect = anchor
    ?.closest?.('.cat-title')
    ?.querySelector?.('.category-toggle')
    ?.getBoundingClientRect?.();
  const categoryAnchorRect = categoryTitleRect || anchorRect;
  const positionConfig = lmFloatingPanelPositionConfig?.(panel, { gap: 24 }, { positionKey: 'categoryActionPanel' }) || {};
  const leftGap = lmPanelNumber?.(positionConfig.gap, 24) ?? 24;
  let left = categoryAnchorRect.left - categoryAnchorRect.width - panelWidth / 4 - leftGap;
  let top = categoryAnchorRect.top;
  if (top < bounds.minTop) top = categoryAnchorRect.bottom;
  return { left, top };
}

function categoryManagerPanelPosition(panel, anchor, anchorRect, panelWidth, panelHeight, bounds) {
  const managerAnchorRect = anchor
    ?.closest?.('.add-category-actions')
    ?.querySelector?.('#addCategoryBtn')
    ?.getBoundingClientRect?.() || anchorRect;
  const positionConfig = lmFloatingPanelPositionConfig?.(panel, { gap: 18 }, { positionKey: 'categoryManagerPanel' }) || {};
  const panelGap = lmPanelNumber?.(positionConfig.gap, 18) ?? 18;
  let left = managerAnchorRect.left + managerAnchorRect.width + panelWidth;
  let top = managerAnchorRect.top - panelHeight - panelGap;
  if (top < bounds.minTop) top = managerAnchorRect.bottom + panelGap;
  return { left, top };
}

function positionFloatingPanel(panel, anchor) {
  if (!panel) return;
  if (typeof prepareFloatingPanelFocusReturn === 'function') prepareFloatingPanelFocusReturn(panel);
  // In focus mode the original draft action button is hidden in the normal
  // editor chrome. Use the visible focus-top action as the positioning anchor
  // so draft action/promote panels open directly below that button.
  const focusDraftAnchor = typeof isFocus !== 'undefined' && isFocus &&
    panel.id === 'draftDetailsPanel'
    ? document.getElementById('focusTopChapterActionBtn')
    : null;
  if (focusDraftAnchor && typeof positionFocusTopPanel === 'function') {
    panel.classList.add('is-focus-top-panel');
    if (typeof claimFocusPanelSlot === 'function') {
      claimFocusPanelSlot(panel, 'top', { closeFunction: 'closeDraftActionsPanel' });
    }
    panel.style.visibility = 'hidden';
    requestAnimationFrame(() => {
      if (!panel.hidden) positionFocusTopPanel(panel, focusDraftAnchor, 'focusTopPanel');
    });
    return;
  }
  panel.style.visibility = 'hidden';
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.left = 'var(--floating-panel-fallback-left, 12px)';
  panel.style.top = 'var(--floating-panel-fallback-top, 12px)';

  requestAnimationFrame(() => {
    if (!['chapterDetailsPanel', 'factDetailPanel', 'categoryActionPanel'].includes(panel.id) && applySavedFloatingPanelPosition(panel)) return;

    const positionConfig = lmFloatingPanelPositionConfig?.(panel, {
      gap: 15,
      topOffset: 0,
      leftOffset: 0,
      rightOffset: 0
    }) || {};
    const gap = lmPanelNumber?.(positionConfig.gap, 15) ?? 15;
    const anchorRect = anchor?.getBoundingClientRect?.();
    const panelRect = panel.getBoundingClientRect();
    const bounds = floatingPanelBounds(panel);
    const panelWidth = Math.min(panelRect.width || 300, window.innerWidth - gap * 2);
    const panelHeight = Math.min(panelRect.height || 220, window.innerHeight - gap * 2);
    const canOverlayChapterTree = ['partDetailsPanel', 'chapterDetailsPanel'].includes(panel.id);
    let left = anchorRect
      ? anchorRect.left - panelWidth - gap
      : window.innerWidth - panelWidth - gap;
    let top = anchorRect ? anchorRect.top : window.innerHeight - panelHeight;

    if (panel.id === 'categoryActionPanel' && anchorRect) {
      const isManagerPanel = panel.classList.contains('category-manager-panel') ||
        panel.classList.contains('category-manager-menu-panel') ||
        panel.classList.contains('category-shortcut-manager-panel');
      const categoryPosition = isManagerPanel
        ? categoryManagerPanelPosition(panel, anchor, anchorRect, panelWidth, panelHeight, bounds)
        : categoryActionPanelPosition(panel, anchor, anchorRect, panelWidth, panelHeight, bounds);
      left = categoryPosition.left;
      top = categoryPosition.top;
    } else if (panel.id === 'factDetailPanel') {
      const keyPanelRect = document.getElementById('tab-notes')?.getBoundingClientRect();
      const keyListRect = document.getElementById('facts-display')?.getBoundingClientRect();
      left = (keyPanelRect?.left || anchorRect?.left || window.innerWidth) - panelWidth - gap;
      top = anchorRect?.top || keyListRect?.top || keyPanelRect?.top || gap;
    } else if (panel.id === 'chapterDetailsPanel') {
      const chapterRect = document.getElementById('chapter-panel')?.getBoundingClientRect();
      const preferredLeft = (chapterRect?.right || anchorRect?.right || 0) + gap;
      left = preferredLeft + panelWidth <= window.innerWidth - gap
        ? preferredLeft
        : Math.max(gap, window.innerWidth - panelWidth - gap);
      top = anchorRect ? anchorRect.top : (chapterRect?.top || top);
    } else if (anchorRect && canOverlayChapterTree) {
      left = Math.max(gap, anchorRect.right - panelWidth);
    } else if (anchorRect && left < bounds.minLeft) {
      left = anchorRect.right + gap;
    }
    if (left + panelWidth > window.innerWidth - gap) left = window.innerWidth - panelWidth - gap;
    if (top + panelHeight > window.innerHeight) top = window.innerHeight - panelHeight;

    const offsetPosition = lmApplyFloatingPanelPositionOffsets?.({ left, top }, panel, positionConfig) || { left, top };
    const safePosition = clampFloatingPanelPosition(panel, offsetPosition.left, offsetPosition.top);
    panel.style.left = `${safePosition.left}px`;
    panel.style.top = `${safePosition.top}px`;
    panel.style.visibility = '';
  });
}

function openNamingEntryPanel(categoryId, anchor = null) {
  closeNameDetailPanel();
  activeNamingCategoryId = categoryId;
  activeEditingNamingEntryId = null;
  activeFloatingAnchor = anchor;
  const category = namingData.categories.find(item => item.id === categoryId);
  setText('namingEntryCategory', category?.title || text().addNameTitle);
  setText('namingEntryTitle', text().addNameTitle);
  setText('namingSaveBtn', text().saveName);
  document.getElementById('namingNameInp').value = '';
  document.getElementById('namingSimilarNameInp').value = '';
  setNamingSimilarNameInputOpen(false);
  activeNamingSimilarNames = [];
  renderNamingSimilarNames();
  document.getElementById('namingDescriptionInp').value = '';
  const panel = document.getElementById('namingEntryPanel');
  if (isFocus) {
    showFocusNamingEntryPanel(panel, categoryId);
  } else {
    panel.hidden = false;
    restoreNamingEntryPanelHome(panel);
    panel.classList.remove('is-focus-caret-panel', 'is-focus-center-panel');
    panel.style.display = '';
    panel.style.visibility = '';
    panel.style.opacity = '';
    positionFloatingPanel(panel, anchor);
    requestAnimationFrame(() => document.getElementById('namingNameInp')?.focus());
  }
}

function openNameDetailEditPanel(anchor = null) {
  const entry = namingData.entries.find(item => item.id === activeNamingEntryId);
  if (!entry) return;

  activeEditingNamingEntryId = entry.id;
  activeNamingCategoryId = entry.categoryId;
  activeFloatingAnchor = anchor;
  const category = namingData.categories.find(item => item.id === entry.categoryId);
  setText('namingEntryCategory', category?.title || text().editNameTitle);
  setText('namingEntryTitle', text().editNameTitle);
  setText('namingSaveBtn', text().saveName);
  document.getElementById('namingNameInp').value = entry.name || '';
  document.getElementById('namingSimilarNameInp').value = '';
  setNamingSimilarNameInputOpen(false);
  activeNamingSimilarNames = [...(Array.isArray(entry.similarNames) ? entry.similarNames : [])];
  renderNamingSimilarNames();
  document.getElementById('namingDescriptionInp').value = entry.description || '';
  closeNameDetailPanel();
  activeFloatingAnchor = anchor;
  const panel = document.getElementById('namingEntryPanel');
  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
  requestAnimationFrame(() => document.getElementById('namingNameInp')?.focus());
}

function closeNamingEntryPanel(options = {}) {
  const panel = document.getElementById('namingEntryPanel');
  const preserveFocusSidePanels = Boolean(options.preserveFocusSidePanels);
  const suppressFocusRestore = Boolean(options.suppressFocusRestore);
  const shouldRestoreFocusEditor = Boolean(isFocus && panel && !panel.hidden && panel.classList.contains('is-focus-center-panel'));
  panel.hidden = true;
  panel.classList.remove('is-focus-caret-panel', 'is-focus-center-panel');
  delete panel.dataset.focusPortal;
  panel.style.display = '';
  panel.style.visibility = '';
  panel.style.opacity = '';
  panel.style.removeProperty('--focus-entry-left');
  panel.style.removeProperty('--focus-entry-top');
  restoreNamingEntryPanelHome(panel);
  activeFloatingAnchor = null;
  activeEditingNamingEntryId = null;
  setNamingSimilarNameInputOpen(false);
  activeNamingSimilarNames = [];
  renderNamingSimilarNames();
  if (!preserveFocusSidePanels) hideFocusNamingCategoryPanel();
  if (shouldRestoreFocusEditor && !suppressFocusRestore) {
    requestAnimationFrame(restoreFocusNamingEntryEditorFocus);
  }
}

function saveNamingEntry() {
  const nameInput = document.getElementById('namingNameInp');
  const descriptionInput = document.getElementById('namingDescriptionInp');
  const name = nameInput.value.trim();
  if (!name || !activeNamingCategoryId) return;
  const similarNames = activeNamingSimilarNames.filter(alias => alias.toLocaleLowerCase() !== normalizeSimilarNameValue(name).toLocaleLowerCase());

  const editingEntry = namingData.entries.find(entry => entry.id === activeEditingNamingEntryId);
  if (editingEntry) {
    const changed = applyNamingEntryEdit(editingEntry, {
      name, similarNames, categoryId: activeNamingCategoryId, description: descriptionInput.value
    });
    if (changed) {
      expandedNamingCategoryId = editingEntry.categoryId;
      renderTags();
      saveNamingData();
      showSidePanelSaveLine(text().nameEdited);
    }

    closeNamingEntryPanel();
    return;
  }

  const createdAt = new Date().toISOString();
  const shouldAttachToActiveDocument = typeof isNamingEntryUsedInText === 'function' &&
    isNamingEntryUsedInText({ name, similarNames }, getCleanEditorText());
  const source = shouldAttachToActiveDocument && !isTrashDraftActive()
    ? sourceFromNamingMeta(currentDescriptionChapterMeta(createdAt), createdAt) : null;
  namingData.entries.push(namingSourceReadView({
    id: `name-${Date.now()}`,
    categoryId: activeNamingCategoryId,
    name,
    similarNames: normalizeNamingAliases(similarNames, name),
    description: descriptionInput.value.trim(),
    descriptionHistory: [],
    source,
    createdAt,
    updatedAt: createdAt
  }));

  closeNamingEntryPanel();
  expandedNamingCategoryId = activeNamingCategoryId;
  renderTags();
  saveNamingData();
  showSidePanelSaveLine(text().nameSaved);
}

function namingEntryMentionCount(entry = {}, activeText = null) {
  const textValue = activeText ?? (
    typeof activeChapterTextForNameCount === 'function'
      ? activeChapterTextForNameCount()
      : activeNamingPanelText()
  );
  return typeof countSavedNameUsesInText === 'function'
    ? countNamingEntryUsesInText(entry, textValue)
    : 0;
}

function namingEntryDeepFindingLabel() {
  return text().deepFinding || text().deepFind || 'Deep Finding';
}

function namingEntryDeepFindingTitle(count) {
  return `${namingEntryDeepFindingLabel()}: ${count} ${text().times}`;
}

function syncNamingEntryDeepFindingCount(button, entry = {}) {
  const badge = button?.querySelector?.('.tag-find-meta');
  if (!badge) return;
  const count = namingEntryMentionCount(entry);
  const countNode = badge.querySelector?.('.tag-find-meta-count');
  if (countNode) countNode.textContent = String(count);
  badge.title = namingEntryDeepFindingTitle(count);
}

function handleNamingEntryItemPointerEnter(event, entryId) {
  const entry = namingData.entries.find(item => item.id === entryId);
  if (entry) syncNamingEntryDeepFindingCount(event.currentTarget, entry);
  scheduleNamingEntryDescriptionInfo(event, entryId);
}

function refreshIconSvg() {
  return `<svg class="btn-svg tag-refresh-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm-6 8c0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3c-3.31 0-6-2.69-6-6z" fill="currentColor"/>
  </svg>`;
}

function htmlToPlainText(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = String(html || '');
  return tmp.textContent || '';
}

async function scanStoryForNamingEntry(entryId) {
  const scanProject = projectDirectoryHandle;
  const sourceIndex = await window.LmNamingDeepScanSource.buildTextIndex();
  await window.LmInitialRendering?.ensureFullNamingData?.();
  if (scanProject !== projectDirectoryHandle) throw new Error('Project changed during Naming scan.');
  const entry = namingData.entries.find(item => item.id === entryId);
  if (!entry) return false;
  const documents = namingDocumentRegistry().map(item => ({ ...item,
    text: item.documentType === 'draft' ? sourceIndex.draftTexts[item.index] : sourceIndex.chapterTexts[item.index]
  }));
  refreshNamingEntrySource(entry, documents);
  await writeNamingDataToProject({ sourcePatches: { [entry.id]: entry.source } });
  renderTags();
  return Boolean(entry.source);
}
