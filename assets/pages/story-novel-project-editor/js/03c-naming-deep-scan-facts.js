function deepScanAllNamingEntries(buttonElement = null) {
  const btn = buttonElement || document.getElementById('namingDeepScanBtn');
  const countDeepScanSavedNameUses = (name, documentText) => {
    const cleanedName = normalizeScanText(name);
    const cleanedText = normalizeScanText(documentText);
    if (cleanedName.length < 2 || !cleanedText) return 0;

    try {
      const namePattern = cleanedName.split(/\s+/).map(escapeRegExp).join('\\s+');
      const wordUnit = '\\p{L}\\p{N}\\p{M}_';
      const pattern = `(^|[^${wordUnit}])${namePattern}(?=$|[^${wordUnit}])`;
      return [...cleanedText.matchAll(new RegExp(pattern, 'giu'))].length;
    } catch (_error) {
      // Saved matching must fail closed when Unicode-boundary support is
      // unavailable; a substring fallback would accept names inside words.
      return 0;
    }
  };
  if (btn) {
    btn.classList.add('is-scanning');
    btn.disabled = true;
  }

  setTimeout(() => {
    let updatedCount = 0;
    const entries = namingData && Array.isArray(namingData.entries) ? namingData.entries : [];

    entries.forEach(entry => {
      if (!entry || !entry.name) return;
      const name = entry.name;
      let foundInChapter = false;

      // 1. Search chapters from earliest (index 0) to latest
      if (Array.isArray(chapters)) {
        for (let i = 0; i < chapters.length; i++) {
          const chapter = chapters[i];
          if (!chapter) continue;
          const text = htmlToPlainText(chapter.content);
          if (countDeepScanSavedNameUses(name, text) > 0) {
            foundInChapter = true;
            const newChapterKey = chapter.contentPath || (typeof chapterStorageKey === 'function' ? chapterStorageKey(i) : `chap-${i}`);
            const newChapterNo = chapter.chapterNo || (i + 1);
            const newChapterTitle = chapter.title || '';

            const needsUpdate =
              entry.chapterStatus !== 'chapter' ||
              entry.documentType !== 'chapter' ||
              entry.chapterIndex !== i ||
              entry.chapterKey !== newChapterKey ||
              entry.descriptionMeta?.chapterStatus !== 'chapter' ||
              entry.descriptionMeta?.documentType !== 'chapter' ||
              entry.descriptionMeta?.draftKey != null ||
              entry.draftKey != null ||
              entry.orphanedAt != null ||
              entry.orphanedFromDraft != null ||
              entry.missingDocumentAt != null ||
              entry.missingDocumentMeta != null ||
              entry.missingNameMentionAt != null ||
              entry.missingNameMentionMeta != null ||
              Boolean(entry.sourceState) ||
              Boolean(entry.namingSourceState);

            if (needsUpdate) {
              entry.chapterStatus = 'chapter';
              entry.documentType = 'chapter';
              entry.chapterIndex = i;
              entry.chapterKey = newChapterKey;
              entry.chapterTitle = newChapterTitle;
              entry.chapterNo = newChapterNo;
              entry.contentPath = newChapterKey;
              entry.draftKey = null;
              entry.draftIndex = null;
              entry.draftNo = null;
              entry.draftTitle = '';
              entry.resolvedAt = null;
              entry.resolvedFromDraft = null;

              entry.descriptionMeta = {
                chapterStatus: 'chapter',
                documentType: 'chapter',
                chapterKey: newChapterKey,
                chapterIndex: i,
                chapterNo: newChapterNo,
                chapterTitle: newChapterTitle,
                contentPath: newChapterKey,
                savedAt: entry.createdAt || new Date().toISOString(),
                attachedAt: entry.createdAt || new Date().toISOString()
              };

              entry.orphanedAt = null;
              entry.orphanedFromDraft = null;
              entry.missingDocumentAt = null;
              entry.missingDocumentMeta = null;
              entry.missingNameMentionAt = null;
              entry.missingNameMentionMeta = null;
              entry.sourceState = null;
              entry.namingSourceState = null;
              updatedCount++;
            }
            break;
          }
        }
      }

      // 2. If not found in any chapter, search drafts from earliest (index 0) to latest
      if (!foundInChapter && Array.isArray(chapterDrafts)) {
        for (let i = 0; i < chapterDrafts.length; i++) {
          const draft = chapterDrafts[i];
          if (!draft) continue;
          const text = htmlToPlainText(draft.content);
          if (countDeepScanSavedNameUses(name, text) > 0) {
            const newDraftKey = draft.contentPath || (typeof draftFilePath === 'function' ? draftFilePath(i) : `draft-${i}`);
            const newDraftNo = draft.draftNo || (i + 1);
            const newDraftTitle = draft.title || '';

            const needsDraftUpdate =
              entry.chapterStatus !== 'draft' ||
              entry.documentType !== 'draft' ||
              entry.draftIndex !== i ||
              entry.draftKey !== newDraftKey ||
              entry.descriptionMeta?.chapterStatus !== 'draft' ||
              entry.descriptionMeta?.documentType !== 'draft' ||
              entry.orphanedAt != null ||
              entry.missingDocumentAt != null ||
              entry.missingNameMentionAt != null ||
              Boolean(entry.sourceState);

            if (needsDraftUpdate) {
              entry.chapterStatus = 'draft';
              entry.documentType = 'draft';
              entry.draftIndex = i;
              entry.draftKey = newDraftKey;
              entry.chapterKey = newDraftKey;
              entry.draftTitle = newDraftTitle;
              entry.chapterTitle = newDraftTitle;
              entry.draftNo = newDraftNo;
              entry.chapterIndex = null;
              entry.chapterNo = null;
              entry.contentPath = newDraftKey;
              entry.descriptionMeta = {
                chapterStatus: 'draft',
                documentType: 'draft',
                draftKey: newDraftKey,
                draftIndex: i,
                draftNo: newDraftNo,
                draftTitle: newDraftTitle,
                contentPath: newDraftKey,
                savedAt: entry.createdAt || new Date().toISOString(),
                attachedAt: entry.createdAt || new Date().toISOString()
              };

              entry.orphanedAt = null;
              entry.orphanedFromDraft = null;
              entry.missingDocumentAt = null;
              entry.missingDocumentMeta = null;
              entry.missingNameMentionAt = null;
              entry.missingNameMentionMeta = null;
              entry.sourceState = null;
              entry.namingSourceState = null;
              updatedCount++;
            }
            break;
          }
        }
      }
    });

    if (btn) {
      btn.classList.remove('is-scanning');
      btn.disabled = false;
    }

    if (updatedCount > 0) {
      saveNamingData();
      renderTags();
      const msg = `Deep scan complete: Updated first appearance for ${updatedCount} name(s)!`;
      if (typeof showSmartCopyToast === 'function') {
        showSmartCopyToast(msg);
      } else {
        alert(msg);
      }
    } else {
      const msg = `Deep scan complete: All names' first appearance metadata is up to date.`;
      if (typeof showSmartCopyToast === 'function') {
        showSmartCopyToast(msg);
      } else {
        alert(msg);
      }
    }
  }, 300);
}

function namingEntryItemHtml(entry, extraClass = '', activeText = null) {
  const isExistingEntry = String(extraClass).split(/\s+/).includes('naming-existing-entry');
  const isOrphanEntry = String(extraClass).split(/\s+/).includes('naming-orphan-entry');
  const isDetectedEntry = String(extraClass).split(/\s+/).includes('naming-detected-entry');
  const matchedName = isDetectedEntry ? namingEntryMatchedName(entry, activeText) : entry.name;
  const detectedAliasMatches = isDetectedEntry ? namingEntryDetectedAliasMatches(entry, activeText) : [];
  const dominantAlias = detectedAliasMatches.length >= 2 ? detectedAliasMatches[0] : null;
  const aliasTriggered = isDetectedEntry && matchedName && namingEntryNameKey(matchedName) !== namingEntryNameKey(entry.name);
  // A single alias match keeps the canonical title display. When two or more
  // aliases are present, the most frequent alias temporarily becomes the blue
  // item label; editor text and persisted naming metadata remain untouched.
  const detectedDisplayName = matchedName || entry.name;
  const displayName = dominantAlias?.name || (aliasTriggered ? entry.name : detectedDisplayName);
  const displayTitle = dominantAlias
    ? `Most frequent similar name: ${dominantAlias.name} (${dominantAlias.count})`
    : aliasTriggered
      ? `Found as ${matchedName}; shown as ${entry.name}`
      : '';
  const temporarySearchName = dominantAlias?.name || matchedName || entry.name;
  const mentionCount = isExistingEntry ? 0 : namingEntryMentionCount(entry, activeText);
  const deepFindingLabel = namingEntryDeepFindingLabel();
  return `
    <button class="tag-item naming-entry-item ${extraClass}" type="button"
      onpointerenter="handleNamingEntryItemPointerEnter(event, '${escapeJsString(entry.id)}')"
      onpointerleave="scheduleNamingEntryDescriptionInfoClose()"
      onclick="showNameDetail('${escapeJsString(entry.id)}', this)">
      <span class="tname ${aliasTriggered || dominantAlias ? 'is-alias-title-substitution' : ''}"${displayTitle ? ` title="${escapeHtml(displayTitle)}"` : ''}>
        <span>${escapeHtml(displayName)}</span>
      </span>
      ${isOrphanEntry ? `
        <span class="tag-refresh-btn" onclick="event.stopPropagation();scanStoryForNamingEntry('${escapeJsString(entry.id)}')" title="Scan story for this name" aria-label="Scan story for this name">
          ${refreshIconSvg()}
        </span>` : ''}
      ${isExistingEntry ? '' : `
        <span class="tag-find-meta" title="${escapeHtml(namingEntryDeepFindingTitle(mentionCount))}">
          <span class="tag-find-meta-count">${mentionCount}</span>
        </span>
        <span class="tag-find-btn" onclick="event.stopPropagation();findTag('${escapeJsString(temporarySearchName)}')" title="${escapeHtml(text().findTitle)}">${searchIconSvg()}</span>`}
    </button>`;
}

function getEntryTime(entry) {
  if (!entry) return 0;
  if (entry.updatedAt) {
    const t = new Date(entry.updatedAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (entry.createdAt) {
    const t = new Date(entry.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (entry.id) {
    const m = String(entry.id).match(/\d+/);
    if (m) return parseInt(m[0], 10);
  }
  return 0;
}

function getCategoryFilteredSortedEntries(categoryId, entries) {
  const query = String(window.categorySearchQuery || '').trim().toLocaleLowerCase();
  const sortOption = window.categorySortOption || 'status';

  let filtered = query
    ? entries.filter(e => String(e.name || '').toLocaleLowerCase().includes(query))
    : [...entries];

  if (sortOption === 'count') {
    filtered.sort((a, b) => {
      const countA = typeof namingEntryMentionCount === 'function' ? namingEntryMentionCount(a) : 0;
      const countB = typeof namingEntryMentionCount === 'function' ? namingEntryMentionCount(b) : 0;
      return countB - countA;
    });
  } else if (sortOption === 'time') {
    filtered.sort((a, b) => getEntryTime(b) - getEntryTime(a));
  }
  // 'status' is default order (as-is from the data)
  return filtered;
}

function categorySortBarHtml(categoryId) {
  const query = window.categorySearchQuery || '';
  const sortOption = window.categorySortOption || 'status';
  const searchIcon = typeof lmIcon === 'function' ? lmIcon('search') : '';
  const sortIcon = typeof lmIcon === 'function' ? lmIcon('sort') : '';
  return `
    <div class="cat-search-sort-row" data-cat-id="${escapeHtml(categoryId)}">
      <div class="naming-search-bar-container">
        <span class="cat-search-icon">${searchIcon}</span>
        <input type="text" class="naming-search-input cat-search-input" placeholder="Search in this category..." value="${escapeHtml(query)}" oninput="handleCategorySearch(event, '${escapeJsString(categoryId)}')" autocomplete="off">
      </div>
      <button class="naming-sort-btn cat-sort-btn ${sortOption !== 'status' ? 'is-active' : ''}" type="button" onclick="toggleCategorySortPanel(this, '${escapeJsString(categoryId)}')" title="Sort names in category" aria-label="Sort names in category">${sortIcon}</button>
    </div>`;
}

function existingNamingEntriesHtml(categoryId, entries) {
  const isActive = window.activeExpandedCategoryWithShowMore === categoryId;
  const filteredEntries = isActive ? getCategoryFilteredSortedEntries(categoryId, entries) : entries;
  return `
    <div class="naming-existing-list" ${isActive ? '' : 'hidden'}>
      ${filteredEntries.map(entry => namingEntryItemHtml(entry, namingEntryUsesOrphanStyle(entry) ? 'naming-existing-entry naming-orphan-entry' : 'naming-existing-entry')).join('')}
      <button class="hide-existing-names-btn" type="button" onclick="hideExistingNamesForCategory('${escapeJsString(categoryId)}', this)">
        ${escapeHtml(text().hideExistingNames)}
      </button>
    </div>`;
}

function showExistingNamesForCategory(categoryId, button = null) {
  window.activeExpandedCategoryWithShowMore = categoryId;
  expandedNamingCategoryId = categoryId;
  window.categorySearchQuery = '';
  window.categorySortOption = 'status';
  // Hide global search-sort row
  const globalRow = document.querySelector('.naming-search-sort-row');
  if (globalRow) globalRow.hidden = true;
  renderTags();
}

function hideExistingNamesForCategory(categoryId, button = null) {
  window.activeExpandedCategoryWithShowMore = null;
  expandedNamingCategoryId = categoryId;
  window.categorySearchQuery = '';
  window.categorySortOption = 'status';
  // Restore global search-sort row
  const globalRow = document.querySelector('.naming-search-sort-row');
  if (globalRow) globalRow.hidden = false;
  closeCategorySortPanel();
  renderTags();
}

function handleCategorySearch(event, categoryId) {
  window.categorySearchQuery = String(event.target.value || '');
  renderTags();
  // Restore focus to search input after re-render
  requestAnimationFrame(() => {
    const input = document.querySelector(`.cat-search-sort-row[data-cat-id="${CSS.escape(categoryId)}"] .cat-search-input`);
    if (input) {
      input.focus();
      const len = input.value.length;
      input.setSelectionRange(len, len);
    }
  });
}

function ensureCategorySortPanel() {
  let panel = document.getElementById('categorySortPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'categorySortPanel';
    panel.className = 'naming-sort-panel';
    panel.hidden = true;
    document.body.appendChild(panel);
  }
  return panel;
}

function closeCategorySortPanel() {
  clearTimeout(closeCategorySortPanel._timer);
  const panel = document.getElementById('categorySortPanel');
  if (panel) panel.hidden = true;
}

function openCategorySortPanel(anchor, categoryId) {
  const panel = ensureCategorySortPanel();
  clearTimeout(closeCategorySortPanel._timer);
  const sortOption = window.categorySortOption || 'status';
  panel.innerHTML = `
    <div class="naming-sort-header">
      <h4 class="naming-sort-title">Sort Names</h4>
      <button class="naming-sort-close-btn" type="button" onclick="closeCategorySortPanel()" title="Close" aria-label="Close">
        ${typeof lmIcon === 'function' ? lmIcon('closeCompact') : '&#x2715;'}
      </button>
    </div>
    <div class="naming-sort-options">
      <button class="naming-sort-option-btn ${sortOption === 'status' ? 'is-active' : ''}" type="button"
        onclick="setCategorySortOption('${escapeJsString(categoryId)}', 'status')">
        Status-wise (Default)
      </button>
      <button class="naming-sort-option-btn ${sortOption === 'count' ? 'is-active' : ''}" type="button"
        onclick="setCategorySortOption('${escapeJsString(categoryId)}', 'count')">
        Most Mentioned (High to Low)
      </button>
      <button class="naming-sort-option-btn ${sortOption === 'time' ? 'is-active' : ''}" type="button"
        onclick="setCategorySortOption('${escapeJsString(categoryId)}', 'time')">
        Created / Modified (Newest First)
      </button>
    </div>
  `;
  panel.hidden = false;
  if (typeof openNamingSortPanel === 'function') {
    // Position using existing positioning logic
    positionCategoryInfoPopover && positionCategoryInfoPopover(panel, anchor, 'categorySortPanel');
  }
  if (typeof positionPanel === 'function') {
    positionPanel(panel, anchor);
  }
  // Simple fallback positioning
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    panel.style.position = 'fixed';
    panel.style.top = (rect.bottom + 4) + 'px';
    panel.style.right = (window.innerWidth - rect.right) + 'px';
    panel.style.left = 'auto';
  }
  closeCategorySortPanel._timer = setTimeout(closeCategorySortPanel, 15000);
}

function toggleCategorySortPanel(anchor, categoryId) {
  const panel = document.getElementById('categorySortPanel');
  if (panel && !panel.hidden) {
    closeCategorySortPanel();
  } else {
    openCategorySortPanel(anchor, categoryId);
  }
}

function setCategorySortOption(categoryId, option) {
  window.categorySortOption = option;
  closeCategorySortPanel();
  renderTags();
}

function renderTags() {
  const display = document.getElementById('tag-display');
  if (!display) return;

  namingData = normalizeNamingData(namingData);
  const chapterKey = currentNamingChapterKey();
  const focusCategoryId = isFocus ? activeFocusNamingCategoryId : '';
  let visibleCategories = namingData.categories.filter(category =>
    isNamingCategoryVisible(category.id, chapterKey) || category.id === focusCategoryId
  );

  if (isNewDraftState()) {
    const getCategoryCount = (category) => {
      return namingData.entries.filter(entry => entry.categoryId === category.id).length;
    };
    visibleCategories = [...namingData.categories]
      .sort((a, b) => getCategoryCount(b) - getCategoryCount(a))
      .slice(0, 10);
  }

  if (namingSearchMode === 'name' && namingSearchQuery) {
    const activeText = activeNamingPanelText();
    const matchingEntries = namingData.entries.filter(entry =>
      String(entry.name || '').toLocaleLowerCase().includes(namingSearchQuery.toLocaleLowerCase())
    );

    if (!matchingEntries.length) {
      display.innerHTML = `<div class="naming-flat-search-empty">No names found matching "${escapeHtml(namingSearchQuery)}"</div>`;
      return;
    }

    const {
      activeDocumentEntries: entries,
      detectedEntries,
      existingEntries
    } = namingEntriesByActiveTextPriority(matchingEntries, activeText);

    const htmlParts = [];
    entries.forEach(entry => {
      htmlParts.push(namingEntryItemHtml(entry, '', activeText));
    });
    detectedEntries.forEach(entry => {
      htmlParts.push(namingEntryItemHtml(entry, 'naming-detected-entry', activeText));
    });
    existingEntries.forEach(entry => {
      const extraClass = namingEntryUsesOrphanStyle(entry)
        ? 'naming-existing-entry naming-orphan-entry'
        : 'naming-existing-entry';
      htmlParts.push(namingEntryItemHtml(entry, extraClass, activeText));
    });

    display.innerHTML = `<div class="naming-flat-search-list">${htmlParts.join('')}</div>`;
    return;
  }

  const filteredCategories = visibleCategories.filter(category =>
    !namingSearchQuery || (category.title || '').toLocaleLowerCase().includes(namingSearchQuery.toLocaleLowerCase())
  );

  if (!filteredCategories.length) {
    display.innerHTML = `<div class="naming-flat-search-empty">No categories found matching "${escapeHtml(namingSearchQuery)}"</div>`;
    return;
  }

  // Sort categories
  const sortedCategories = [...filteredCategories];

  if (namingSortOption === 'status') {
    const activeText = activeNamingPanelText();
    const getCategoryStatusScore = (category) => {
      const globalEntries = namingData.entries.filter(entry => entry.categoryId === category.id);
      const {
        activeDocumentEntries: entries,
        detectedEntries,
        existingEntries
      } = namingEntriesByActiveTextPriority(globalEntries, activeText);

      const hasChapterEntries = entries.length > 0;
      const hasDetectedEntries = detectedEntries.length > 0;
      const hasOtherEntries = existingEntries.length > 0;
      const hasOrphanEntries = !hasChapterEntries && !hasDetectedEntries && hasOtherEntries && existingEntries.some(entry => namingEntryUsesOrphanStyle(entry));
      const hasExistingEntries = !hasChapterEntries && !hasDetectedEntries && hasOtherEntries && !hasOrphanEntries;

      if (hasChapterEntries) return 4;
      if (hasDetectedEntries) return 3;
      if (hasExistingEntries) return 2;
      return 1;
    };
    sortedCategories.sort((a, b) => getCategoryStatusScore(b) - getCategoryStatusScore(a));
  } else if (namingSortOption === 'count') {
    const getCategoryCount = (category) => {
      return namingData.entries.filter(entry => entry.categoryId === category.id).length;
    };
    sortedCategories.sort((a, b) => getCategoryCount(b) - getCategoryCount(a));
  } else if (namingSortOption === 'alphabetical') {
    sortedCategories.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }));
  }

  display.innerHTML = sortedCategories.map(category => {
    const isExpanded = expandedNamingCategoryId === category.id;
    const activeText = activeNamingPanelText();
    const globalEntries = namingData.entries.filter(entry => entry.categoryId === category.id);
    const globalEntryCount = globalEntries.length;
    const canDeleteCategory = globalEntryCount === 0;
    const {
      activeDocumentEntries: entries,
      detectedEntries,
      existingEntries
    } = namingEntriesByActiveTextPriority(globalEntries, activeText);
    const hasChapterEntries = entries.length > 0;
    const hasDetectedEntries = detectedEntries.length > 0;
    const visibleEntryCount = entries.length + detectedEntries.length;
    const hasOtherEntries = existingEntries.length > 0;
    const hasExistingListEntries = !hasChapterEntries && !hasDetectedEntries && hasOtherEntries;
    const hasOrphanEntries = hasExistingListEntries && existingEntries.some(entry => namingEntryUsesOrphanStyle(entry));
    const hasExistingEntries = hasExistingListEntries && !hasOrphanEntries;
    const shortcutLabel = namingCategoryShortcutLabel(category.id);
    const addNameTitle = shortcutLabel
      ? `${text().addNameTitle} (${shortcutLabel})`
      : text().addNameTitle;
    const isShowingAll = isExpanded && window.activeExpandedCategoryWithShowMore === category.id;

    let entryHtml = '';
    if (isExpanded) {
      if (isShowingAll) {
        // Combine ALL entries and apply category-level filter+sort
        const allCategoryEntries = [...entries, ...detectedEntries, ...existingEntries];
        const filteredAll = getCategoryFilteredSortedEntries(category.id, allCategoryEntries);
        entryHtml = `
          ${filteredAll.map(entry => {
            const isDetected = detectedEntries.includes(entry);
            const isExisting = existingEntries.includes(entry);
            const extraClass = isExisting
              ? (namingEntryUsesOrphanStyle(entry) ? 'naming-existing-entry naming-orphan-entry' : 'naming-existing-entry')
              : isDetected ? 'naming-detected-entry' : '';
            return namingEntryItemHtml(entry, extraClass, activeText);
          }).join('')}
          <button class="hide-existing-names-btn" type="button" onclick="hideExistingNamesForCategory('${escapeJsString(category.id)}', this)">
            ${escapeHtml(text().hideExistingNames)}
          </button>`;
      } else {
        entryHtml = visibleEntryCount
          ? `${entries.map(entry => namingEntryItemHtml(entry, '', activeText)).join('')}
              ${detectedEntries.map(entry => namingEntryItemHtml(entry, 'naming-detected-entry', activeText)).join('')}
              ${hasOtherEntries ? `
                <div class="naming-existing-toggle-row">
                  <button class="show-existing-names-btn" type="button" onclick="showExistingNamesForCategory('${escapeJsString(category.id)}', this)">
                    ${escapeHtml(text().showOtherNames)}
                  </button>
                </div>
                ${existingNamingEntriesHtml(category.id, existingEntries)}` : ''}`
          : (hasExistingEntries || hasOrphanEntries)
            ? `<div class="naming-empty naming-chapter-empty naming-existing-toggle-row">
                <span>${escapeHtml(text().noTagsInChapter)}</span>
                <button class="show-existing-names-btn" type="button" onclick="showExistingNamesForCategory('${escapeJsString(category.id)}', this)">
                  ${escapeHtml(text().showExistingNames)}
                </button>
              </div>
              ${existingNamingEntriesHtml(category.id, existingEntries)}`
            : `<div class="naming-empty">${escapeHtml(text().noTags)}</div>`;
      }
    }

    return `
      <div class="cat-section naming-category-card ${isExpanded ? 'is-expanded' : ''}" data-category-id="${escapeHtml(category.id)}">
        <div class="cat-title cat-${escapeHtml(category.color)}">
          ${hasChapterEntries ? `<button class="category-name-entry-node category-action-trigger" type="button" onclick="handleCategoryActionTriggerClick(event, '${escapeJsString(category.id)}')" ondblclick="handleCategoryActionTriggerDoubleClick(event, '${escapeJsString(category.id)}')" onpointerenter="scheduleCategoryActionTriggerInfo(event, '${escapeJsString(category.id)}')" onpointerleave="clearCategoryActionTriggerInfo()" title="${escapeHtml(text().editCategoryTitle)}" aria-label="${escapeHtml(text().editCategoryTitle)}"></button>` : ''}
          ${!hasChapterEntries && hasDetectedEntries ? `<button class="category-detected-node category-action-trigger" type="button" onclick="handleCategoryActionTriggerClick(event, '${escapeJsString(category.id)}')" ondblclick="handleCategoryActionTriggerDoubleClick(event, '${escapeJsString(category.id)}')" onpointerenter="scheduleCategoryActionTriggerInfo(event, '${escapeJsString(category.id)}')" onpointerleave="clearCategoryActionTriggerInfo()" title="${escapeHtml(text().editCategoryTitle)}" aria-label="${escapeHtml(text().editCategoryTitle)}"></button>` : ''}
          ${hasOrphanEntries ? `<button class="category-orphan-node category-action-trigger" type="button" onclick="handleCategoryActionTriggerClick(event, '${escapeJsString(category.id)}')" ondblclick="handleCategoryActionTriggerDoubleClick(event, '${escapeJsString(category.id)}')" onpointerenter="scheduleCategoryActionTriggerInfo(event, '${escapeJsString(category.id)}')" onpointerleave="clearCategoryActionTriggerInfo()" title="${escapeHtml(text().editCategoryTitle)}" aria-label="${escapeHtml(text().editCategoryTitle)}"></button>` : ''}
          ${hasExistingEntries ? `<button class="category-existing-node category-action-trigger" type="button" onclick="handleCategoryActionTriggerClick(event, '${escapeJsString(category.id)}')" ondblclick="handleCategoryActionTriggerDoubleClick(event, '${escapeJsString(category.id)}')" onpointerenter="scheduleCategoryActionTriggerInfo(event, '${escapeJsString(category.id)}')" onpointerleave="clearCategoryActionTriggerInfo()" title="${escapeHtml(text().editCategoryTitle)}" aria-label="${escapeHtml(text().editCategoryTitle)}"></button>` : ''}
          ${!entries.length && canDeleteCategory ? `<button class="category-empty-node category-action-trigger" type="button" onclick="handleCategoryActionTriggerClick(event, '${escapeJsString(category.id)}')" ondblclick="handleCategoryActionTriggerDoubleClick(event, '${escapeJsString(category.id)}')" onpointerenter="scheduleCategoryActionTriggerInfo(event, '${escapeJsString(category.id)}')" onpointerleave="clearCategoryActionTriggerInfo()" title="${escapeHtml(text().editCategoryTitle)}" aria-label="${escapeHtml(text().editCategoryTitle)}"></button>` : ''}
          <div class="category-toggle" role="button" tabindex="0" onclick="toggleNamingCategory('${escapeJsString(category.id)}')" onkeydown="handleNamingCategoryToggleKey(event, '${escapeJsString(category.id)}')">
            ${lmChevronSpan(isExpanded ? 'down' : 'right')}
            <strong class="category-title-text">${escapeHtml(category.title)}</strong>
            <small title="${globalEntryCount} story-wide">${visibleEntryCount}/${globalEntryCount}</small>
          </div>
          <div class="category-action-set">
            <button class="category-add-btn" type="button" onclick="openNamingEntryPanel('${escapeJsString(category.id)}', this)" title="${escapeHtml(addNameTitle)}" aria-label="${escapeHtml(addNameTitle)}" ${shortcutLabel ? `data-lm-shortcut="${escapeHtml(shortcutLabel)}"` : ''}>
              ${lmIcon("categoryAdd")}
            </button>
          </div>
        </div>
        ${isShowingAll ? `<div class="cat-search-sort-wrapper">${categorySortBarHtml(category.id)}</div>` : ''}
        <div class="category-entries" ${isExpanded ? '' : 'hidden'}>${entryHtml}</div>
      </div>`;
  }).join('');

  if (isFocus && activeFocusNamingCategoryId) {
    requestAnimationFrame(() => syncFocusNamingCategoryPanel(activeFocusNamingCategoryId));
  }
  if (typeof updateSidebarScrollThumb === 'function') {
    requestAnimationFrame(() => updateSidebarScrollThumb('naming', false));
  }
  requestAnimationFrame(updateShowAllCategoriesBtnVisibility);
}

function showNameDetail(entryId, anchor = null) {
  closeNamingEntryPanel();
  clearNamingEntryDescriptionInfo();
  document.querySelectorAll('.naming-entry-item.is-detail-active').forEach(item => item.classList.remove('is-detail-active'));
  activeFloatingAnchor = anchor;
  activeNamingEntryId = entryId;
  const entry = namingData.entries.find(item => item.id === entryId);
  if (!entry) return;
  anchor?.closest?.('.naming-entry-item')?.classList.add('is-detail-active');
  const category = namingData.categories.find(item => item.id === entry.categoryId);
  const mentionCount = countNamingEntryUsesInText(entry, activeChapterTextForNameCount());
  const editedAtLabel = nameDetailTimeLabel(entry);
  setText('nameDetailTitle', entry.name);
  setText('nameDetailUsage', mentionCount);
  setTitle('nameDetailUsage', `${text().activeChapterMentions}: ${mentionCount} ${text().times}`);
  setText('nameDetailDescription', entry.description || 'No description added yet.');
  setText('nameDetailEditedAt', editedAtLabel);
  document.getElementById('nameDetailEditedAt').hidden = !editedAtLabel;
  closeNameDeleteReminder();
  const panel = document.getElementById('nameDetailPanel');
  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
}

function closeNameDetailPanel() {
  closeNameDeleteReminder();
  document.getElementById('nameDetailPanel').hidden = true;
  document.querySelectorAll('.naming-entry-item.is-detail-active').forEach(item => item.classList.remove('is-detail-active'));
  activeFloatingAnchor = null;
  activeNamingEntryId = null;
}

function openNameDeleteReminder() {
  const reminder = document.getElementById('nameDeleteReminder');
  if (!reminder || !activeNamingEntryId) return;
  setText('nameDeleteReminderTitle', text().deleteNameTitle);
  setText('nameDeleteReminderBody', text().deleteNameBody);
  setText('nameDeleteCancelBtn', text().cancelDeleteName);
  setText('nameDeleteConfirmBtn', text().confirmDeleteName);
  reminder.hidden = false;
  requestAnimationFrame(() => document.getElementById('nameDeleteConfirmBtn')?.focus());
}

function closeNameDeleteReminder() {
  const reminder = document.getElementById('nameDeleteReminder');
  if (reminder) reminder.hidden = true;
}

function deleteActiveNamingEntry() {
  if (!activeNamingEntryId) return;
  const entry = namingData.entries.find(item => item.id === activeNamingEntryId);
  if (!entry) {
    closeNameDetailPanel();
    return;
  }

  namingData = normalizeNamingData({
    ...namingData,
    entries: namingData.entries.filter(item => item.id !== activeNamingEntryId)
  });
  expandedNamingCategoryId = entry.categoryId || expandedNamingCategoryId;
  closeNameDetailPanel();
  renderTags();
  saveNamingData();
  showSidePanelSaveLine(text().nameDeleted);
}

function findTag(name) {
  document.getElementById('findInp').value = name;
  setFindPanel(true);
  doFind();
}

function saveFacts() {
  storyFacts = normalizeStoryFacts(storyFacts);
  localStorage.setItem(FACTS_STORAGE_KEY, JSON.stringify(storyFacts));
  projectManifest = normalizeProjectManifest({
    ...(projectManifest || createProjectManifest(projectDirectoryHandle?.name)),
    facts: storyFacts
  });
  localStorage.setItem(PROJECT_MANIFEST_KEY, JSON.stringify(projectManifest));
  if (projectDirectoryHandle) {
    writeProjectManifest().catch(error => console.warn('Facts save failed:', error));
  }
}

function populateFactChapterSelect(selectedIndex = curChap) {
  const select = document.getElementById('factChapterSel');
  if (!select) return;
  select.innerHTML = `<option value="">${escapeHtml(text().factChapterLabel)}</option>` +
    chapters.map((chapter, index) =>
      `<option value="${index}">${escapeHtml(factChapterOptionLabel(chapter, index))}</option>`
    ).join('');
  select.value = Number.isInteger(selectedIndex) ? String(selectedIndex) : '';
  queueCustomSelectSync();
}

function setFactComposerMode(isEditing = false) {
  setText('addFactBtn', isEditing ? text().saveFact : text().addFact);
}

function clearFactComposerFields() {
  const keywordInput = document.getElementById('factKeywordInp');
  const descriptionInput = document.getElementById('factDescriptionInp');
  if (keywordInput) keywordInput.value = '';
  if (descriptionInput) descriptionInput.value = '';
  populateFactChapterSelect(null);
}

function openFactComposer(anchor = null) {
  const panel = document.getElementById('factComposerPanel');
  if (!panel) return;
  closeFactDetailPanel();
  activeEditingFactId = null;
  activeFloatingAnchor = anchor || document.getElementById('openFactComposerBtn');
  setFactComposerMode(false);
  clearFactComposerFields();
  if (isFocus) {
    showFocusFactComposerPanel(panel);
  } else {
    restoreFactComposerPanelHome(panel);
    panel.hidden = false;
    panel.classList.remove('is-focus-center-panel', 'is-focus-fact-composer-panel');
    delete panel.dataset.focusPortal;
    delete panel.dataset.focusPanelSlot;
    delete panel.dataset.focusPanelClose;
    panel.style.display = '';
    panel.style.visibility = '';
    panel.style.opacity = '';
    panel.style.removeProperty('--focus-entry-left');
    panel.style.removeProperty('--focus-entry-top');
    positionFloatingPanel(panel, activeFloatingAnchor);
    requestAnimationFrame(() => document.getElementById('factKeywordInp')?.focus());
  }
}

function closeFactComposer() {
  const panel = document.getElementById('factComposerPanel');
  if (panel) {
    panel.hidden = true;
    panel.classList.remove('is-focus-center-panel', 'is-focus-fact-composer-panel');
    delete panel.dataset.focusPortal;
    delete panel.dataset.focusPanelSlot;
    delete panel.dataset.focusPanelClose;
    panel.style.display = '';
    panel.style.visibility = '';
    panel.style.opacity = '';
    panel.style.removeProperty('--focus-entry-left');
    panel.style.removeProperty('--focus-entry-top');
    restoreFactComposerPanelHome(panel);
  }
  activeEditingFactId = null;
  setFactComposerMode(false);
  activeFloatingAnchor = null;
}

function closeFactDetailPanel() {
  const panel = document.getElementById('factDetailPanel');
  if (panel) {
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = '';
    delete panel.dataset.factId;
    delete panel.dataset.focusPanelSlot;
    delete panel.dataset.focusPanelClose;
    panel.classList.remove('category-action-card-panel', 'category-manager-panel', 'category-info-panel');
    panel.classList.remove('is-focus-center-panel', 'is-focus-fact-detail-panel');
    panel.style.display = '';
    panel.style.visibility = '';
    panel.style.opacity = '';
    panel.style.removeProperty('--focus-entry-left');
    panel.style.removeProperty('--focus-entry-top');
  }
  document.querySelectorAll('.fact-item.is-detail-active').forEach(item => item.classList.remove('is-detail-active'));
  activeFloatingAnchor = null;
}

function focusInvalidFactField(field, message) {
  if (typeof showMiniReminder === 'function') showMiniReminder(message);
  requestAnimationFrame(() => field?.focus());
}

function clearFactSearchFilter() {
  const searchInput = document.getElementById('factSearchInp');
  if (searchInput) searchInput.value = '';
}

function addFact() {
  const keywordInput = document.getElementById('factKeywordInp');
  const descriptionInput = document.getElementById('factDescriptionInp');
  const chapterSelect = document.getElementById('factChapterSel');
  const keyword = keywordInput?.value.trim() || '';
  const description = descriptionInput?.value.trim() || '';
  if (!keyword) {
    focusInvalidFactField(keywordInput, text().factKeywordRequired);
    return;
  }
  if (!description) {
    focusInvalidFactField(descriptionInput, text().factDescriptionRequired);
    return;
  }
  if (factKeywordExists(keyword, activeEditingFactId || '')) {
    showDuplicateReminder(text().duplicateFactKeyword);
    return;
  }
  const hasChapterStatus = chapterSelect?.value !== '';
  const chapterIndex = hasChapterStatus
    ? clampNumber(parseInt(chapterSelect?.value || '0', 10) || 0, 0, Math.max(chapters.length - 1, 0))
    : -1;
  const chapter = hasChapterStatus ? chapters[chapterIndex] || {} : {};
  const chapterKey = hasChapterStatus ? chapterStorageKey(chapterIndex) : '';
  const editedAt = new Date().toISOString();
  const chapterMeta = hasChapterStatus
    ? {
      chapterStatus: 'chapter',
      documentType: 'chapter',
      chapterKey,
      chapterIndex,
      chapterNo: chapter.chapterNo || chapterIndex + 1,
      chapterTitle: chapterDisplayTitle(chapter, chapterIndex),
      contentPath: chapterKey,
      savedAt: editedAt
    }
    : null;
  const editingFact = storyFacts.find(fact => fact.id === activeEditingFactId);
  if (editingFact) {
    const descriptionChanged = String(editingFact.description || '').trim() !== description;
    storyFacts = normalizeStoryFacts(storyFacts.map(fact =>
      fact.id === editingFact.id
        ? {
          ...fact,
          keyword,
          description,
          chapterKey,
          chapterIndex: hasChapterStatus ? chapterIndex : null,
          chapterNo: chapterMeta?.chapterNo || '',
          chapterTitle: chapterMeta?.chapterTitle || '',
          descriptionMeta: chapterMeta || fact.descriptionMeta || null,
          descriptionHistory: descriptionChanged && chapterMeta
            ? [
              ...(Array.isArray(fact.descriptionHistory) ? fact.descriptionHistory : []),
              { description, editedAt, chapterMeta }
            ]
            : fact.descriptionHistory,
          updatedAt: editedAt
        }
        : fact
    ));
    saveFacts();
    closeFactComposer();
    clearFactSearchFilter();
    renderFacts();
    showSidePanelSaveLine(text().factEdited);
    return;
  }

  const createdAt = new Date().toISOString();
  storyFacts = normalizeStoryFacts([
    {
      id: `fact-${Date.now()}`,
      keyword,
      description,
      chapterKey,
      chapterIndex: hasChapterStatus ? chapterIndex : null,
      chapterNo: chapterMeta?.chapterNo || '',
      chapterTitle: chapterMeta?.chapterTitle || '',
      createdAt,
      updatedAt: createdAt,
      descriptionMeta: chapterMeta,
      descriptionHistory: [],
      pinned: false
    },
    ...storyFacts
  ]);
  keywordInput.value = '';
  descriptionInput.value = '';
  visibleFactCount = FACTS_PAGE_SIZE;
  saveFacts();
  closeFactComposer();
  clearFactSearchFilter();
  renderFacts();
  showSidePanelSaveLine(text().factSaved);
}

function handleFactInputKey(event) {
  if (event.key !== 'Enter') return;
  if (event.target?.id === 'factDescriptionInp' && !event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  addFact();
}

function updateFactSearch() {
  visibleFactCount = FACTS_PAGE_SIZE;
  renderFacts();
}

function factCardHtml(fact, state = 'recent') {
  const isPinned = Boolean(fact.pinned);
  const stateClass = state === 'current' ? 'fact-current-entry' : 'fact-recent-entry';
  const pinTitle = isPinned ? text().factUnpinTitle : text().factPinTitle;
  return `
    <article class="fact-item ${stateClass}" onclick="openFactDetailPanel('${escapeJsString(fact.id)}', this)">
      <div class="fact-item-head">
        <strong>${escapeHtml(fact.keyword)}</strong>
        <span class="fact-time-stamp">${escapeHtml(factTimeLabel(fact.createdAt))}</span>
      </div>
      <button class="fact-pin-btn ${isPinned ? 'is-pinned' : ''}" type="button"
        onclick="event.stopPropagation(); toggleFactPin('${escapeJsString(fact.id)}')"
        title="${escapeHtml(pinTitle)}" aria-label="${escapeHtml(pinTitle)}">
        ${lmIcon("pinUnpinned", "fact-pin-svg")}
      </button>
    </article>`;
}

function factChapterMetaText(fact) {
  if (!fact?.chapterKey && !fact?.chapterNo && !fact?.chapterTitle) return '';
  const chapterLabel = fact.chapterNo ? `${text().chapterStatus} ${fact.chapterNo}` : text().chapterStatus;
  return `${chapterLabel}${fact.chapterTitle ? ` ${fact.chapterTitle}` : ''}`;
}

function toggleFactPin(factId) {
  storyFacts = normalizeStoryFacts(storyFacts).map(fact =>
    fact.id === factId ? { ...fact, pinned: !fact.pinned, updatedAt: new Date().toISOString() } : fact
  );
  renderFacts();
  saveFacts();
  showSidePanelSaveLine(text().factSaved);
}

function openFactDetailEditPanel(factId, anchor = null) {
  const fact = normalizeStoryFacts(storyFacts).find(item => item.id === factId);
  if (!fact) return;

  closeFactDeleteReminder();
  closeFactDetailPanel();
  activeEditingFactId = fact.id;
  activeFloatingAnchor = anchor || document.getElementById('openFactComposerBtn');
  setFactComposerMode(true);
  const selectedChapterIndex = Number.isInteger(fact.chapterIndex) && fact.chapterIndex >= 0 ? fact.chapterIndex : null;
  populateFactChapterSelect(selectedChapterIndex);
  document.getElementById('factKeywordInp').value = fact.keyword || '';
  document.getElementById('factDescriptionInp').value = fact.description || '';
  const panel = document.getElementById('factComposerPanel');
  if (!panel) return;
  panel.hidden = false;
  positionFloatingPanel(panel, activeFloatingAnchor);
  requestAnimationFrame(() => document.getElementById('factKeywordInp')?.focus());
}

function openFactDetailPanel(factId, anchor = null) {
  const fact = normalizeStoryFacts(storyFacts).find(item => item.id === factId);
  if (!fact) return;

  closeFactComposer();
  document.querySelectorAll('.fact-item.is-detail-active').forEach(item => item.classList.remove('is-detail-active'));
  anchor?.closest?.('.fact-item')?.classList.add('is-detail-active');
  let panel = document.getElementById('factDetailPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'factDetailPanel';
    panel.className = 'fact-detail-popover lm-id-factDetailPanel';
    document.body.appendChild(panel);
  }

  const chapterMeta = factChapterMetaText(fact);
  panel.dataset.factId = fact.id;
  panel.innerHTML = `
    <div class="fact-detail-head">
      <strong>${escapeHtml(fact.keyword)}</strong>
      <span class="fact-time-stamp">${escapeHtml(factTimeLabel(fact.createdAt))}</span>
    </div>
    ${chapterMeta ? `<div class="fact-detail-meta">${escapeHtml(chapterMeta)}</div>` : ''}
    <div class="fact-detail-description-wrap">
      <p>${escapeHtml(fact.description)}</p>
      <button class="name-detail-edit-btn fact-detail-edit-btn" type="button"
        onclick="event.stopPropagation(); openFactDetailEditPanel('${escapeJsString(fact.id)}', this)"
        title="${escapeHtml(text().editFactTitle)}" aria-label="${escapeHtml(text().editFactTitle)}">
        ${lmIcon("edit")}
      </button>
    </div>
    <div class="fact-detail-footer">
      <div class="name-detail-edited-at">${escapeHtml(factTimeLabel(fact.updatedAt || fact.createdAt))}</div>
      <button class="name-detail-delete-btn fact-detail-delete-btn" type="button"
        onclick="event.stopPropagation(); openFactDeleteReminder('${escapeJsString(fact.id)}')"
        title="${escapeHtml(text().factDeleteTitle)}" aria-label="${escapeHtml(text().factDeleteTitle)}">
        ${lmIcon("delete")}
      </button>
    </div>
    <div class="name-delete-reminder fact-delete-reminder" id="factDeleteReminder" hidden>
      <strong>${escapeHtml(text().factDeleteConfirmTitle)}</strong>
      <p>${escapeHtml(text().factDeleteConfirmBody)}</p>
      <div class="name-delete-reminder-actions">
        <button class="name-delete-cancel-btn" type="button" onclick="closeFactDeleteReminder()">Cancel</button>
        <button class="name-delete-confirm-btn" type="button" onclick="deleteFact('${escapeJsString(fact.id)}')">${escapeHtml(text().confirmDeleteName)}</button>
      </div>
    </div>`;

  panel.hidden = false;
  activeFloatingAnchor = anchor;
  panel.setAttribute('aria-hidden', 'false');
  if (isFocus) {
    panel.classList.add('is-focus-center-panel', 'is-focus-fact-detail-panel');
    panel.style.setProperty('display', 'block', 'important');
    panel.style.setProperty('visibility', 'visible', 'important');
    panel.style.setProperty('opacity', '1', 'important');
    if (typeof claimFocusPanelSlot === 'function') {
      claimFocusPanelSlot(panel, 'center', { closeFunction: 'closeFactDetailPanel' });
    }
    positionFocusFactCenterPanel(panel);
    requestAnimationFrame(() => positionFocusFactCenterPanel(panel));
  } else {
    panel.classList.remove('is-focus-center-panel', 'is-focus-fact-detail-panel');
    delete panel.dataset.focusPanelSlot;
    delete panel.dataset.focusPanelClose;
    panel.style.display = '';
    panel.style.visibility = '';
    panel.style.opacity = '';
    panel.style.removeProperty('--focus-entry-left');
    panel.style.removeProperty('--focus-entry-top');
    positionFloatingPanel(panel, anchor);
  }
}

function openFactDeleteReminder(factId) {
  const panel = document.getElementById('factDetailPanel');
  if (!panel || panel.dataset.factId !== factId) return;
  const reminder = document.getElementById('factDeleteReminder');
  if (reminder) reminder.hidden = false;
}

function closeFactDeleteReminder() {
  const reminder = document.getElementById('factDeleteReminder');
  if (reminder) reminder.hidden = true;
}

function renderFacts() {
  const display = document.getElementById('facts-display');
  const actions = document.getElementById('factListActions');
  if (!display || !actions) return;

  storyFacts = normalizeStoryFacts(storyFacts);
  const query = document.getElementById('factSearchInp')?.value.trim().toLowerCase() || '';
  const filteredFacts = query
    ? storyFacts.filter(fact => fact.keyword.toLowerCase().includes(query))
    : storyFacts;
  const currentChapterKey = chapterStorageKey(curChap);
  const pinnedFacts = filteredFacts.filter(fact => fact.pinned);
  const unpinnedFacts = filteredFacts.filter(fact => !fact.pinned);
  const currentChapterFacts = unpinnedFacts.filter(fact => fact.chapterKey === currentChapterKey);
  const recentFacts = unpinnedFacts.filter(fact => fact.chapterKey !== currentChapterKey);
  const visibleRecentFacts = recentFacts.slice(0, visibleFactCount);
  const sections = [];

  if (pinnedFacts.length) {
    sections.push(`
      <section class="fact-section">
        <div class="fact-section-title">${escapeHtml(text().pinnedFacts)}</div>
        ${pinnedFacts.map(fact => factCardHtml(fact, fact.chapterKey === currentChapterKey ? 'current' : 'recent')).join('')}
      </section>`);
  }

  if (currentChapterFacts.length) {
    sections.push(`
      <section class="fact-section">
        <div class="fact-section-title">${escapeHtml(text().factsInCurrentChapter)}</div>
        ${currentChapterFacts.map(fact => factCardHtml(fact, 'current')).join('')}
      </section>`);
  }

  if (visibleRecentFacts.length) {
    sections.push(`
      <section class="fact-section">
        <div class="fact-section-title">${escapeHtml(text().recentFacts)}</div>
        ${visibleRecentFacts.map(fact => factCardHtml(fact, 'recent')).join('')}
      </section>`);
  }

  display.innerHTML = sections.length
    ? sections.join('')
    : `<p class="fact-empty">${escapeHtml(query ? text().noFactMatches : text().noFacts)}</p>`;

  const hasMore = visibleFactCount < recentFacts.length;
  const canCollapse = recentFacts.length > FACTS_PAGE_SIZE && !hasMore;
  actions.innerHTML = hasMore
    ? `<button class="fact-more-btn" type="button" onclick="showMoreFacts()">${escapeHtml(text().showMoreFacts)}</button>`
    : canCollapse
      ? `<button class="fact-more-btn" type="button" onclick="showLessFacts()">${escapeHtml(text().showLessFacts)}</button>`
      : '';
  refreshVisibleFocusFactsPanel();
}

function renderNotes() {
  renderFacts();
}

function showMoreFacts() {
  visibleFactCount += FACTS_PAGE_SIZE;
  renderFacts();
}

function showLessFacts() {
  visibleFactCount = FACTS_PAGE_SIZE;
  renderFacts();
  document.getElementById('facts-display')?.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteFact(factId) {
  const panel = document.getElementById('factDetailPanel');
  storyFacts = storyFacts.filter(fact => fact.id !== factId);
  if (panel?.dataset.factId === factId) closeFactDetailPanel();
  renderFacts();
  saveFacts();
  showSidePanelSaveLine(text().factDeleted);
}

function isSidePanelAiOnlyMode() {
  return hasActiveStory() && (
    Boolean(isDraftTrashMode) ||
    isTrashDraftActive()
  );
}

function syncSidePanelAvailability() {
  const aiOnly = isSidePanelAiOnlyMode();
  const requestedPanel = aiOnly ? 'ai' : activeSidePanel;
  const panel = ['naming', 'facts', 'ai'].includes(requestedPanel) ? requestedPanel : 'naming';
  const namingButton = document.getElementById('namingTabBtn');
  const factsButton = document.getElementById('factsTabBtn');
  const aiButton = document.getElementById('aiBtn');
  const notePanel = document.getElementById('note-panel');
  const namingPanel = document.getElementById('tab-tags');
  const factsPanel = document.getElementById('tab-notes');
  const aiPanel = document.getElementById('ai-panel');
  const trashAiOnly = Boolean(isDraftTrashMode) || isTrashDraftActive();

  activeSidePanel = panel;
  [namingButton, factsButton, aiButton].forEach(button => {
    if (button) button.classList.remove('active');
  });
  namingButton?.classList.toggle('active', panel === 'naming');
  factsButton?.classList.toggle('active', panel === 'facts');
  aiButton?.classList.toggle('active', panel === 'ai');

  if (namingButton) namingButton.hidden = aiOnly;
  if (factsButton) factsButton.hidden = aiOnly;
  if (aiButton) aiButton.hidden = false;
  if (notePanel) notePanel.classList.toggle('is-trash-ai-only', trashAiOnly);
  if (namingPanel) namingPanel.hidden = aiOnly || panel !== 'naming';
  if (factsPanel) factsPanel.hidden = aiOnly || panel !== 'facts';
  if (aiPanel) aiPanel.hidden = panel !== 'ai';
  isAIOpen = panel === 'ai';

  if (panel !== 'facts') closeFactComposer();
  if (aiOnly) {
    closeFactDetailPanel();
    closeCategoryActionPanel();
    closeNamingEntryPanel();
    closeNameDetailPanel();
  }

  if (!aiOnly && panel === 'naming') renderTags();
  if (!aiOnly && panel === 'facts') renderFacts();
  if (panel === 'ai' && typeof renderAIDesk === 'function') renderAIDesk();
  return aiOnly;
}

function switchSidePanel(panel) {
  activeSidePanel = panel;
  syncSidePanelAvailability();
}

function ensureNamingColorLegendPanel() {
  let panel = document.getElementById('namingColorLegendPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'namingColorLegendPanel';
    panel.className = 'naming-color-legend-panel';
    panel.hidden = true;
    document.body.appendChild(panel);
  }
  return panel;
}

function closeNamingColorLegendPanel() {
  clearTimeout(closeNamingColorLegendPanel.timer);
  const panel = document.getElementById('namingColorLegendPanel');
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = '';
  }
  const triggerBtn = document.getElementById('namingLegendTriggerBtn');
  if (triggerBtn && typeof lmIcon === 'function') {
    triggerBtn.innerHTML = lmIcon('categoryInfoClosed');
  }
}

function openNamingColorLegendPanel(anchor) {
  const panel = ensureNamingColorLegendPanel();
  if (!panel || !anchor) return;

  closeNamingColorLegendPanel();
  closeCategoryInfoPopover();
  closeNamingEntryDescriptionPopover();

  const triggerBtn = document.getElementById('namingLegendTriggerBtn');
  if (triggerBtn && typeof lmIcon === 'function') {
    triggerBtn.innerHTML = lmIcon('categoryInfoOpened');
  }

  panel.innerHTML = `
    <div class="naming-legend-header">
      <h4 class="naming-legend-title">Naming Status Legend</h4>
      <button class="naming-legend-close-btn" type="button" onclick="closeNamingColorLegendPanel()" title="Close" aria-label="Close">
        ${lmIcon ? lmIcon('closeCompact') : '✖'}
      </button>
    </div>
    
    <div class="naming-legend-section">
      <h5 class="naming-legend-section-title">Category Status (श्रेणी संकेतक)</h5>
      <div class="naming-legend-list">
        <div class="naming-legend-item">
          <span class="category-action-trigger category-name-entry-node"></span>
          <span class="naming-legend-text">अध्याय में सक्रिय नाम (Active chapter names saved)</span>
        </div>
        <div class="naming-legend-item">
          <span class="category-action-trigger category-detected-node"></span>
          <span class="naming-legend-text">पहचाने गए नाम, सहेजे नहीं (Detected names in chapter, not saved)</span>
        </div>
        <div class="naming-legend-item">
          <span class="category-action-trigger category-existing-node"></span>
          <span class="naming-legend-text">केवल अन्य अध्यायों के नाम (Names saved in other chapters only)</span>
        </div>
        <div class="naming-legend-item">
          <span class="category-action-trigger category-empty-node"></span>
          <span class="naming-legend-text">खाली श्रेणी या अनाथ नाम (खाली श्रेणी के लिए भी यही नोड दिखेगा) / Empty category or contains orphan names</span>
        </div>
      </div>
    </div>

    <div class="naming-legend-section">
      <h5 class="naming-legend-section-title">Name Tag Items (नाम टैग आइटम)</h5>
      <div class="naming-legend-list">
        <div class="naming-legend-item">
          <span class="tag-item naming-entry-item">नाम</span>
          <span class="naming-legend-text">अध्याय में सक्रिय/सहेजा नाम (Saved active name in chapter)</span>
        </div>
        <div class="naming-legend-item">
          <span class="tag-item naming-entry-item naming-detected-entry">नाम</span>
          <span class="naming-legend-text">अध्याय में पहचाना गया नाम (Detected name, not saved)</span>
        </div>
        <div class="naming-legend-item">
          <span class="tag-item naming-entry-item naming-existing-entry">नाम</span>
          <span class="naming-legend-text">अन्य अध्यायों में सहेजा नाम (Saved name used in other chapters only)</span>
        </div>
        <div class="naming-legend-item">
          <span class="tag-item naming-entry-item naming-existing-entry naming-orphan-entry">नाम</span>
          <span class="naming-legend-text">अनाथ/असंबंधित नाम (Orphaned saved name)</span>
        </div>
      </div>
    </div>
  `;

  panel.hidden = false;
  positionCategoryInfoPopover(panel, anchor, 'namingColorLegendPanel');
  closeNamingColorLegendPanel.timer = setTimeout(closeNamingColorLegendPanel, 15000);
}

function toggleNamingColorLegendPanel(anchor) {
  const panel = document.getElementById('namingColorLegendPanel');
  if (panel && !panel.hidden) {
    closeNamingColorLegendPanel();
  } else {
    openNamingColorLegendPanel(anchor);
  }
}

function exportTxt() {
  if (!hasActiveStory()) return;
  const out = chapters.map(chapter => {
    const tmp = document.createElement('div');
    tmp.innerHTML = chapter.content;
    return '=== ' + chapter.title + ' ===\n\n' + (tmp.textContent || '');
  }).join('\n\n\n');
  const link = document.createElement('a');
  link.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(out);
  link.download = text().exportFile;
  link.click();
}

// Search & Sort State
window.namingSearchMode = 'category';
window.namingSearchQuery = '';
window.namingSortOption = 'status';

function toggleNamingSearchMode() {
  const btn = document.getElementById('namingSearchToggleBtn');
  const input = document.getElementById('namingSearchInput');
  if (namingSearchMode === 'category') {
    namingSearchMode = 'name';
    if (btn) {
      btn.classList.remove('is-active');
      btn.title = "Search names (Active) / Search categories (Inactive)";
      btn.innerHTML = typeof lmIcon === 'function' ? lmIcon('namingSearchName') : '';
    }
    if (input) {
      input.placeholder = "Search names...";
    }
  } else {
    namingSearchMode = 'category';
    if (btn) {
      btn.classList.add('is-active');
      btn.title = "Search categories (Active) / Search names (Inactive)";
      btn.innerHTML = typeof lmIcon === 'function' ? lmIcon('namingSearchCategory') : '';
    }
    if (input) {
      input.placeholder = "Search categories...";
    }
  }
  renderTags();
}

function handleNamingSearch(event) {
  namingSearchQuery = String(event.target.value || '').trim();
  renderTags();
}

function ensureNamingSortPanel() {
  let panel = document.getElementById('namingSortPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'namingSortPanel';
    panel.className = 'naming-sort-panel';
    panel.hidden = true;
    document.body.appendChild(panel);
  }
  return panel;
}

function closeNamingSortPanel() {
  clearTimeout(closeNamingSortPanel.timer);
  const panel = document.getElementById('namingSortPanel');
  if (panel) panel.hidden = true;
}

function openNamingSortPanel(anchor) {
  const panel = ensureNamingSortPanel();
  clearTimeout(closeNamingSortPanel.timer);
  closeNamingColorLegendPanel();
  closeCategoryInfoPopover();
  closeNamingEntryDescriptionPopover();

  panel.innerHTML = `
    <div class="naming-sort-header">
      <h4 class="naming-sort-title">Sort Categories</h4>
      <button class="naming-sort-close-btn" type="button" onclick="closeNamingSortPanel()" title="Close" aria-label="Close">
        ${lmIcon ? lmIcon('closeCompact') : '✖'}
      </button>
    </div>
    <div class="naming-sort-options">
      <button class="naming-sort-option-btn ${namingSortOption === 'status' ? 'is-active' : ''}" type="button" onclick="setNamingSortOption('status')">
        Status-wise (Default)
      </button>
      <button class="naming-sort-option-btn ${namingSortOption === 'count' ? 'is-active' : ''}" type="button" onclick="setNamingSortOption('count')">
        Name Count (High to Low)
      </button>
      <button class="naming-sort-option-btn ${namingSortOption === 'alphabetical' ? 'is-active' : ''}" type="button" onclick="setNamingSortOption('alphabetical')">
        Alphabetical (A to Z)
      </button>
    </div>
  `;

  panel.hidden = false;
  positionCategoryInfoPopover(panel, anchor, 'namingSortPanel');
  closeNamingSortPanel.timer = setTimeout(closeNamingSortPanel, 15000);
}

function toggleNamingSortPanel(anchor) {
  const panel = document.getElementById('namingSortPanel');
  if (panel && !panel.hidden) {
    closeNamingSortPanel();
  } else {
    openNamingSortPanel(anchor);
  }
}

function setNamingSortOption(option) {
  namingSortOption = option;
  closeNamingSortPanel();
  renderTags();
}

function isNewDraftState() {
  if (typeof activeEditorMode === 'undefined' || activeEditorMode !== 'draft') return false;
  if (typeof curDraft === 'undefined' || curDraft < 0 || typeof chapterDrafts === 'undefined' || curDraft >= chapterDrafts.length) return false;
  const draft = chapterDrafts[curDraft];
  if (!draft) return false;

  const content = String(draft.content || '').trim();
  if (content === '' || content === '<p></p>' || content === '<p><br></p>') {
    return true;
  }

  const plainText = htmlToPlainText(content).trim();
  return plainText.length === 0;
}
