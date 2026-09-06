let namingDuplicateResolverState = null;

function namingDuplicateStableValue(value) {
  if (Array.isArray(value)) return value.map(namingDuplicateStableValue);
  if (!value || typeof value !== 'object') return value ?? null;
  return Object.keys(value).sort().reduce((result, key) => {
    if (key !== 'id') result[key] = namingDuplicateStableValue(value[key]);
    return result;
  }, {});
}

function namingDuplicateValueKey(value) {
  return JSON.stringify(namingDuplicateStableValue(value));
}

function namingDuplicateFieldValue(entry, field) {
  if (field === 'title') {
    const excluded = new Set(['id', 'createdAt', 'similarNames', 'aliases', 'description', 'descriptionMeta', 'descriptionHistory', 'descriptionCreatedAt', 'updatedAt']);
    return Object.fromEntries(Object.entries(entry).filter(([key]) => !excluded.has(key)));
  }
  if (field === 'createdAt') return entry.createdAt || '';
  if (field === 'aliases') return normalizeNamingAliases(entry.similarNames || [], entry.name).map(value => value.toLocaleLowerCase()).sort();
  if (field === 'description') return {
    description: entry.description || '', descriptionMeta: entry.descriptionMeta || null,
    descriptionHistory: entry.descriptionHistory || [], updatedAt: entry.updatedAt || entry.createdAt || ''
  };
  if (field === 'descriptionCreatedAt') return entry.descriptionCreatedAt || entry.createdAt || '';
  return null;
}

function preferredNamingDuplicateEntry(items = []) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || 0) || Number.MAX_SAFE_INTEGER;
    const rightTime = Date.parse(right.createdAt || 0) || Number.MAX_SAFE_INTEGER;
    if (leftTime !== rightTime) return leftTime - rightTime;
    const leftId = String(left.id || '');
    const rightId = String(right.id || '');
    const leftGenerated = /^name-\d+(?:-\d+)?$/i.test(leftId) ? 1 : 0;
    const rightGenerated = /^name-\d+(?:-\d+)?$/i.test(rightId) ? 1 : 0;
    return leftGenerated - rightGenerated || leftId.length - rightId.length || leftId.localeCompare(rightId);
  })[0];
}

function namingDuplicateTitleGroups(entries = []) {
  const groups = new Map();
  entries.forEach(entry => {
    const key = namingEntryNameKey(entry?.name || '');
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  });
  return [...groups.entries()].filter(([, items]) => items.length > 1).map(([key, items], index) => {
    const preferred = preferredNamingDuplicateEntry(items);
    const fields = ['title', 'createdAt', 'aliases', 'description', 'descriptionCreatedAt'];
    const mismatches = Object.fromEntries(fields.map(field => [field,
      new Set(items.map(entry => namingDuplicateValueKey(namingDuplicateFieldValue(entry, field)))).size > 1
    ]));
    const exactDuplicate = new Set(items.map(entry => namingDuplicateValueKey(entry))).size === 1;
    const choices = Object.fromEntries(fields.map(field => [field, mismatches[field] ? '' : preferred.id]));
    choices.aliases = [];
    const aliasEntries = items.filter(entry => normalizeNamingAliases(entry.similarNames || [], entry.name).length);
    const aliasVariants = new Set(aliasEntries.map(entry => namingDuplicateValueKey(namingDuplicateFieldValue(entry, 'aliases'))));
    if (!mismatches.aliases) choices.aliases = [preferred.id];
    else if (aliasEntries.length === 1 || aliasVariants.size === 1) {
      choices.aliases = [aliasEntries[0]?.id || items[0].id];
      mismatches.aliases = false;
    }
    return { id: `duplicate-${index}`, key, entries: items, choices, mismatches, exactDuplicate };
  });
}

function namingDuplicateTime(value) {
  if (!value) return 'Time not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function namingDuplicateCategory(entry) {
  return namingData.categories.find(category => category.id === entry.categoryId)?.title || 'Uncategorized';
}

function namingDuplicateResolverComplete() {
  return Boolean(namingDuplicateResolverState && [...(namingDuplicateResolverState.autoGroups || []), ...namingDuplicateResolverState.groups].every(namingDuplicateGroupComplete));
}

function namingDuplicateGroupComplete(group) {
  return ['title', 'createdAt', 'description', 'descriptionCreatedAt'].every(field => !group.mismatches[field] || Boolean(group.choices[field])) &&
    (!group.mismatches.aliases || group.choices.aliases.length > 0);
}

function renderNamingDuplicateResolver() {
  const state = namingDuplicateResolverState;
  if (!state) return;
  let panel = document.getElementById('namingDuplicateResolverPanel');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'namingDuplicateResolverPanel';
    panel.className = 'naming-duplicate-resolver lm-id-namingDuplicateResolverPanel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'namingDuplicateResolverTitle');
    document.body.appendChild(panel);
  }
  const group = state.groups[state.currentIndex];
  const visibleFields = Object.entries(group.mismatches).filter(([, mismatch]) => mismatch).map(([field]) => field);
  panel.innerHTML = `
    <header><div><span>Deep Scan check</span><h3 id="namingDuplicateResolverTitle">Same title names detected</h3></div><button type="button" onclick="cancelNamingDuplicateResolution()" aria-label="Cancel duplicate resolution">×</button></header>
    <div class="naming-duplicate-resolver-intro">केवल अलग data दिखाया गया है। किसी card का title चुनकर उसका पूरा data लें, या fields अलग-अलग चुनें।</div>
    <div class="naming-duplicate-groups">
      <section class="naming-duplicate-group" data-group-id="${escapeHtml(group.id)}">
        <div class="naming-duplicate-group-head"><div><b>${escapeHtml(group.entries[0].name)}</b><span>Group ${state.currentIndex + 1} of ${state.groups.length} · ${visibleFields.length} differing field(s)</span></div></div>
        <div class="naming-duplicate-records">${group.entries.map(entry => {
          const id = escapeHtml(entry.id);
          const aliases = normalizeNamingAliases(entry.similarNames || [], entry.name);
          const wholeSelected = visibleFields.every(field => field === 'aliases' ? group.choices.aliases.length === 1 && group.choices.aliases[0] === entry.id : group.choices[field] === entry.id);
          const choiceClass = (field, selected) => `${selected ? 'is-selected' : ''} ${group.choices[field] && !selected ? 'is-other-selected' : ''}`;
          return `<article class="naming-duplicate-record ${wholeSelected ? 'is-whole-selected' : ''}">
            <div class="naming-duplicate-record-head"><button class="naming-duplicate-title ${choiceClass('title', group.choices.title === entry.id)} ${group.mismatches.title ? '' : 'is-matched'}" type="button" onclick="selectNamingDuplicateWhole('${escapeHtml(group.id)}','${id}')"><span>${escapeHtml(entry.name)} <small>${escapeHtml(namingDuplicateCategory(entry))}</small></span></button>${group.mismatches.createdAt ? `<button class="naming-duplicate-created ${choiceClass('createdAt', group.choices.createdAt === entry.id)}" type="button" onclick="selectNamingDuplicateField('${escapeHtml(group.id)}','createdAt','${id}')" aria-label="Use creation time ${escapeHtml(namingDuplicateTime(entry.createdAt))}"><time>${escapeHtml(namingDuplicateTime(entry.createdAt))}</time></button>` : ''}</div>
            ${group.mismatches.aliases ? `<button class="naming-duplicate-aliases ${group.choices.aliases.includes(entry.id) ? 'is-selected' : ''}" type="button" onclick="toggleNamingDuplicateAlias('${escapeHtml(group.id)}','${id}')">${aliases.length ? aliases.map(alias => `<span>${escapeHtml(alias)}</span>`).join('') : '<em>No aliases</em>'}</button>` : ''}
            ${group.mismatches.description ? `<button class="naming-duplicate-description ${choiceClass('description', group.choices.description === entry.id)}" type="button" onclick="selectNamingDuplicateField('${escapeHtml(group.id)}','description','${id}')"><span>${escapeHtml(entry.description || 'No description')}</span><time>Edited ${escapeHtml(namingDuplicateTime(entry.updatedAt || entry.createdAt))}</time><small>${(entry.descriptionHistory || []).length} history item(s)</small></button>` : ''}
            ${group.mismatches.descriptionCreatedAt ? `<button class="naming-duplicate-description-created ${choiceClass('descriptionCreatedAt', group.choices.descriptionCreatedAt === entry.id)}" type="button" onclick="selectNamingDuplicateField('${escapeHtml(group.id)}','descriptionCreatedAt','${id}')">Description created ${escapeHtml(namingDuplicateTime(entry.descriptionCreatedAt || entry.createdAt))}</button>` : ''}
          </article>`;
        }).join('')}</div>
      </section></div>
    <footer><span>${state.currentIndex + 1}/${state.groups.length} duplicate groups</span><button type="button" onclick="moveNamingDuplicateGroup(-1)" ${state.currentIndex === 0 ? 'disabled' : ''}>Back</button><button class="is-primary" type="button" onclick="${state.currentIndex === state.groups.length - 1 ? 'finishNamingDuplicateResolution()' : 'moveNamingDuplicateGroup(1)'}" ${namingDuplicateGroupComplete(group) ? '' : 'disabled'}>${state.currentIndex === state.groups.length - 1 ? 'Done' : 'Next'}</button></footer>`;
  panel.hidden = false;
  document.body.classList.add('is-resolving-naming-duplicates');
}

function selectNamingDuplicateWhole(groupId, entryId) {
  const group = namingDuplicateResolverState?.groups.find(item => item.id === groupId);
  if (!group) return;
  Object.keys(group.choices).forEach(field => {
    if (!group.mismatches[field]) return;
    group.choices[field] = field === 'aliases' ? [entryId] : entryId;
  });
  renderNamingDuplicateResolver();
}

function selectNamingDuplicateField(groupId, field, entryId) {
  const group = namingDuplicateResolverState?.groups.find(item => item.id === groupId);
  if (!group || !Object.hasOwn(group.choices, field)) return;
  group.choices[field] = entryId;
  renderNamingDuplicateResolver();
}

function toggleNamingDuplicateAlias(groupId, entryId) {
  const group = namingDuplicateResolverState?.groups.find(item => item.id === groupId);
  if (!group) return;
  const selected = new Set(group.choices.aliases);
  if (selected.has(entryId)) selected.delete(entryId); else selected.add(entryId);
  group.choices.aliases = [...selected];
  renderNamingDuplicateResolver();
}

function moveNamingDuplicateGroup(direction) {
  const state = namingDuplicateResolverState;
  if (!state) return;
  if (direction > 0 && !namingDuplicateGroupComplete(state.groups[state.currentIndex])) return;
  state.currentIndex = Math.max(0, Math.min(state.groups.length - 1, state.currentIndex + direction));
  renderNamingDuplicateResolver();
}

function cancelNamingDuplicateResolution() {
  const state = namingDuplicateResolverState;
  if (!state) return;
  document.getElementById('namingDuplicateResolverPanel')?.remove();
  document.body.classList.remove('is-resolving-naming-duplicates');
  namingDuplicateResolverState = null;
  state.resolve(false);
}

function namingDuplicateHistory(items = []) {
  const seen = new Set();
  return items.flat().filter(item => {
    if (!item) return false;
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(-50);
}

function finishNamingDuplicateResolution() {
  const state = namingDuplicateResolverState;
  if (!state || !namingDuplicateResolverComplete()) return;
  const removedIds = new Set();
  [...(state.autoGroups || []), ...state.groups].forEach(group => {
    const byId = id => group.entries.find(entry => entry.id === id);
    const titleEntry = byId(group.choices.title);
    const createdEntry = byId(group.choices.createdAt);
    const descriptionEntry = byId(group.choices.description);
    const descriptionCreatedEntry = byId(group.choices.descriptionCreatedAt);
    const survivor = titleEntry;
    const aliases = group.choices.aliases.flatMap(id => byId(id)?.similarNames || []);
    Object.assign(survivor, {
      name: titleEntry.name,
      categoryId: titleEntry.categoryId,
      source: titleEntry.source || null,
      createdAt: createdEntry.createdAt,
      similarNames: normalizeNamingAliases(aliases, titleEntry.name),
      description: descriptionEntry.description || '',
      descriptionMeta: descriptionEntry.descriptionMeta || null,
      descriptionCreatedAt: descriptionCreatedEntry.descriptionCreatedAt || descriptionCreatedEntry.createdAt,
      descriptionHistory: [...(descriptionEntry.descriptionHistory || [])],
      updatedAt: descriptionEntry.updatedAt || descriptionEntry.createdAt || survivor.updatedAt
    });
    group.entries.forEach(entry => { if (entry.id !== survivor.id) removedIds.add(entry.id); });
  });
  namingData = normalizeNamingData({ ...namingData, entries: namingData.entries.filter(entry => !removedIds.has(entry.id)) });
  localStorage.setItem(NAMING_STORAGE_KEY, JSON.stringify(namingData));
  document.getElementById('namingDuplicateResolverPanel')?.remove();
  document.body.classList.remove('is-resolving-naming-duplicates');
  namingDuplicateResolverState = null;
  state.resolve(true);
}

function resolveDuplicateNamingTitles(groups) {
  return new Promise(resolve => {
    const autoGroups = groups.filter(group => group.exactDuplicate);
    const reviewGroups = groups.filter(group => !group.exactDuplicate);
    namingDuplicateResolverState = { groups: reviewGroups, autoGroups, resolve, currentIndex: 0 };
    if (!reviewGroups.length) finishNamingDuplicateResolution(); else renderNamingDuplicateResolver();
  });
}

async function deepScanAllNamingEntries(buttonElement = null, options = {}) {
  const btn = buttonElement || document.getElementById('namingDeepScanBtn');
  const createDeepScanSavedNameMatcher = searchNames => {
    const expressions = searchNames.map(searchName => {
      const cleanedName = normalizeScanText(searchName);
      if (cleanedName.length < 2) return null;
      try {
        const namePattern = cleanedName.split(/\s+/).map(escapeRegExp).join('\\s+');
        const wordUnit = '\\p{L}\\p{N}\\p{M}_';
        const pattern = `(^|[^${wordUnit}])${namePattern}(?=$|[^${wordUnit}])`;
        return new RegExp(pattern, 'iu');
      } catch (_error) {
        return null;
      }
    }).filter(Boolean);
    return documentText => expressions.some(expression => expression.test(documentText));
  };
  if (btn) {
    btn.classList.add('is-scanning');
    btn.disabled = true;
  }
  const setProgress = (message, progress = null, done = false) => window.LmRenderingSnapshotTools?.setDeepScanStatus?.(message, progress, done);
  setProgress('Preparing Naming Deep Scan…', 0);

  setTimeout(async () => {
    try {
    const scanProject = projectDirectoryHandle;
    // Snapshot loading can replace the global namingData with a document-only
    // projection while the source files are being read. Re-hydrate here, after
    // the asynchronous read, and keep this authoritative object for the whole
    // scan so a document switch cannot make us save an incomplete projection.
    const preflightNamingData = normalizeNamingData(
      await window.LmInitialRendering?.ensureFullNamingData?.({ forceSource: true }) || namingData
    );
    namingData = preflightNamingData;
    if (scanProject !== projectDirectoryHandle) throw new Error('Project changed during Naming scan.');
    const duplicateGroups = namingDuplicateTitleGroups(namingData.entries);
    if (duplicateGroups.length) {
      setProgress(`${duplicateGroups.length} duplicate title group(s) need review…`, 2);
      const resolved = await resolveDuplicateNamingTitles(duplicateGroups);
      if (!resolved) {
        options.onComplete?.({ error: false, cancelled: true, message: 'Deep Scan cancelled before duplicate titles were changed.' });
        return;
      }
      await writeNamingDataToProject({ authoritativeData: namingData, deduplicateDescriptionHistory: true, allowEntryRemoval: true });
    }
    const sourceIndex = await window.LmNamingDeepScanSource.buildTextIndex({
      onProgress: ({ loaded, total }) => setProgress(`Reading source documents ${loaded}/${total}…`, total ? loaded / total * 12 : 12)
    });
    const authoritativeNamingData = normalizeNamingData(
      await window.LmInitialRendering?.ensureFullNamingData?.({ forceSource: true }) || namingData
    );
    namingData = authoritativeNamingData;
    if (scanProject !== projectDirectoryHandle) throw new Error('Project changed during Naming scan.');
    const chapterScanTexts = sourceIndex.chapterTexts;
    const draftScanTexts = sourceIndex.draftTexts;
    const checkedAt = new Date().toISOString();
    const documents = namingDocumentRegistry(checkedAt).map(item => ({ ...item,
      text: item.documentType === 'draft' ? draftScanTexts[item.index] : chapterScanTexts[item.index]
    }));
    let updatedCount = 0;
    const entries = namingData && Array.isArray(namingData.entries) ? namingData.entries : [];

    for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
      const entry = entries[entryIndex];
      if (!entry || !entry.name) continue;
      if (entryIndex % 8 === 0) {
        setProgress(`Scanning names ${entryIndex + 1}/${entries.length}…`, entries.length ? entryIndex / entries.length * 78 : 78);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      const previousSource = JSON.stringify(entry.source);
      const matcher = createDeepScanSavedNameMatcher(namingEntrySearchNames(entry));
      refreshNamingEntrySource(entry, documents, checkedAt, matcher);
      if (JSON.stringify(entry.source) !== previousSource) updatedCount++;
    }

    let renderingRebuildFailed = false;
    try {
      setProgress('Saving Naming metadata and snapshots…', 80);
      {
        if (scanProject !== projectDirectoryHandle) throw new Error('Project changed during Naming scan.');
        // Run cleanup on the latest durable history inside the serialized writer,
        // even when every source is already null or unchanged.
        await writeNamingDataToProject({
          authoritativeData: namingData,
          allowEntryRemoval: true,
          deduplicateDescriptionHistory: true
        });
      }
      await window.LmInitialRendering?.rebuildAllNamingDocumentStates?.({
        scope: options.snapshotScope || { mode: 'all' },
        sourceIndex,
        onProgress: ({ written, total }) => setProgress(`Writing snapshots ${written}/${total}…`, 80 + (total ? written / total * 18 : 18))
      });
    } catch (error) {
      renderingRebuildFailed = true;
      console.warn('Naming render architecture rebuild failed:', error);
    }
    if (btn) {
      btn.classList.remove('is-scanning');
      btn.disabled = false;
    }
    renderTags();
    if (renderingRebuildFailed) {
      const message = 'Deep scan पूरा हुआ, लेकिन naming rendering cache दोबारा नहीं बन सका।';
      showMiniReminder(message);
      options.onComplete?.({ error: true, message });
      return;
    }

    if (updatedCount > 0) {
      const msg = `Deep scan complete: Updated ${updatedCount} name attachment(s) and cleaned duplicate description history.`;
      if (typeof showSmartCopyToast === 'function') {
        showSmartCopyToast(msg);
      } else {
        alert(msg);
      }
      options.onComplete?.({ error: false, message: msg, updatedCount });
    } else {
      const msg = `Deep scan complete: Sources verified and duplicate description history cleaned.`;
      if (typeof showSmartCopyToast === 'function') {
        showSmartCopyToast(msg);
      } else {
        alert(msg);
      }
      options.onComplete?.({ error: false, message: msg, updatedCount });
    }
    } catch (error) {
      console.warn('Naming Deep Scan failed:', error);
      const message = `Naming Deep Scan failed: ${error?.message || error}`;
      showMiniReminder(message);
      options.onComplete?.({ error: true, message });
    } finally {
      setProgress('', 100, true);
      if (btn) {
        btn.classList.remove('is-scanning');
        btn.disabled = false;
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
  const draftCreatedClass = typeof isDraftNamingEntry === 'function' && isDraftNamingEntry(entry)
    ? 'is-draft-created'
    : '';
  return `
    <button class="tag-item naming-entry-item ${extraClass} ${draftCreatedClass}" type="button"
      onpointerenter="handleNamingEntryItemPointerEnter(event, '${escapeJsString(entry.id)}')"
      onpointerleave="scheduleNamingEntryDescriptionInfoClose()"
      ondblclick="copyNamingEntryOnDoubleClick(event, '${escapeJsString(entry.id)}', this)"
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

async function showExistingNamesForCategory(categoryId, button = null) {
  await window.LmInitialRendering?.ensureNamingCategoryData?.(categoryId);
  window.activeExpandedCategoryWithShowMore = categoryId;
  window.activeExpandedCategoryWithShowMoreDocumentKey = currentNamingChapterKey();
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
  window.activeExpandedCategoryWithShowMoreDocumentKey = '';
  expandedNamingCategoryId = categoryId;
  window.categorySearchQuery = '';
  window.categorySortOption = 'status';
  // Restore global search-sort row
  const globalRow = document.querySelector('.naming-search-sort-row');
  if (globalRow) globalRow.hidden = false;
  closeCategorySortPanel();
  renderTags();
}

function resetFullNamingCategoryListAfterDocumentSwitch(chapterKey = currentNamingChapterKey()) {
  if (!window.activeExpandedCategoryWithShowMore) return false;
  const sourceKey = window.activeExpandedCategoryWithShowMoreDocumentKey || '';
  if (!sourceKey || sourceKey === chapterKey) return false;
  window.activeExpandedCategoryWithShowMore = null;
  window.activeExpandedCategoryWithShowMoreDocumentKey = '';
  window.categorySearchQuery = '';
  window.categorySortOption = 'status';
  const globalRow = document.querySelector('.naming-search-sort-row');
  if (globalRow) globalRow.hidden = false;
  closeCategorySortPanel();
  return true;
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
      <button class="naming-sort-option-btn ${sortOption === 'chapter' ? 'is-active' : ''}" type="button"
        onclick="setCategorySortOption('${escapeJsString(categoryId)}', 'chapter')">
        Creation Document (Drafts First, Newest First)
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

function initialNamingCategoriesForActiveDocument(maximum = 6) {
  const chapterKey = currentNamingChapterKey();
  const activeText = activeNamingPanelText();
  const hiddenIds = hiddenCategoriesForChapter(chapterKey);
  const explicitIds = visibleCategoriesForChapter(chapterKey);
  const focusCategoryId = isFocus ? activeFocusNamingCategoryId : '';
  const getGlobalCount = category =>
    window.LmInitialRendering?.namingCategoryCount?.(category.id) ??
    namingData.entries.filter(entry => entry.categoryId === category.id).length;
  const ranked = namingData.categories
    .map((category, index) => ({
      category,
      index,
      focus: category.id === focusCategoryId ? 1 : 0,
      explicit: explicitIds.has(category.id) ? 1 : 0,
      activeCount: activeText
        ? namingData.entries.filter(entry => entry.categoryId === category.id && namingEntryNameInText(entry, activeText)).length
        : 0,
      globalCount: getGlobalCount(category)
    }))
    .filter(item => item.focus || !hiddenIds.has(item.category.id))
    .sort((left, right) =>
      right.focus - left.focus ||
      right.activeCount - left.activeCount ||
      right.explicit - left.explicit ||
      right.globalCount - left.globalCount ||
      left.index - right.index
    );
  return ranked.slice(0, Math.max(0, maximum)).map(item => item.category);
}

let namingExpansionDocument = null;

function initializeNamingExpansionForDocument(chapterKey, sortedCategories) {
  if (namingExpansionDocument?.project === projectDirectoryHandle &&
      namingExpansionDocument?.key === chapterKey) return;
  expandedNamingCategoryId = sortedCategories[0]?.id || '';
  // Wait for an actual category list before remembering the document: lazy
  // loading or an empty search result may temporarily leave it empty.
  if (sortedCategories.length) namingExpansionDocument = { project: projectDirectoryHandle, key: chapterKey };
}

function renderTags() {
  const display = document.getElementById('tag-display');
  if (!display) return;

  namingData = normalizeNamingData(namingData);
  const chapterKey = currentNamingChapterKey();
  resetFullNamingCategoryListAfterDocumentSwitch(chapterKey);
  const isShowingAllCategories = window.activeNamingShowAllCategoriesKey === chapterKey;
  let visibleCategories = isShowingAllCategories
    ? namingData.categories.filter(category => !hiddenCategoriesForChapter(chapterKey).has(category.id))
    : initialNamingCategoriesForActiveDocument(6);

  if (namingSearchMode === 'name' && namingSearchQuery) {
    const activeText = activeNamingPanelText();
    const matchingEntries = namingData.entries.filter(entry =>
      String(entry.name || '').toLocaleLowerCase().includes(namingSearchQuery.toLocaleLowerCase())
    );

    if (!matchingEntries.length) {
      display.innerHTML = `<div class="naming-flat-search-empty">No names found matching "${escapeHtml(namingSearchQuery)}"</div>`;
      return;
    }

    const categoryOrder = new Map(namingData.categories.map((category, index) => [category.id, index]));
    const categoryById = new Map(namingData.categories.map(category => [category.id, category]));
    const groupedEntries = new Map();
    matchingEntries.forEach(entry => {
      const categoryId = entry.categoryId || '__uncategorized__';
      if (!groupedEntries.has(categoryId)) groupedEntries.set(categoryId, []);
      groupedEntries.get(categoryId).push(entry);
    });

    const searchGroups = [...groupedEntries.entries()].map(([categoryId, groupEntries]) => {
      const category = categoryById.get(categoryId) || { id: categoryId, title: 'Uncategorized' };
      const priority = namingEntriesByActiveTextPriority(groupEntries, activeText);
      const statusScore = priority.activeDocumentEntries.length
        ? 3
        : priority.detectedEntries.length ? 2 : 1;
      return { category, groupEntries, priority, statusScore };
    });

    if (namingSortOption === 'count') {
      searchGroups.sort((left, right) => right.groupEntries.length - left.groupEntries.length ||
        (categoryOrder.get(left.category.id) ?? Number.MAX_SAFE_INTEGER) - (categoryOrder.get(right.category.id) ?? Number.MAX_SAFE_INTEGER));
    } else if (namingSortOption === 'alphabetical') {
      searchGroups.sort((left, right) => String(left.category.title || '').localeCompare(String(right.category.title || ''), undefined, { sensitivity: 'base' }));
    } else {
      searchGroups.sort((left, right) => right.statusScore - left.statusScore ||
        (categoryOrder.get(left.category.id) ?? Number.MAX_SAFE_INTEGER) - (categoryOrder.get(right.category.id) ?? Number.MAX_SAFE_INTEGER));
    }

    const groupedHtml = searchGroups.map(({ category, groupEntries, priority }) => {
      const entryHtml = [
        ...priority.activeDocumentEntries.map(entry => namingEntryItemHtml(entry, '', activeText)),
        ...priority.detectedEntries.map(entry => namingEntryItemHtml(entry, 'naming-detected-entry', activeText)),
        ...priority.existingEntries.map(entry => namingEntryItemHtml(
          entry,
          namingEntryUsesOrphanStyle(entry)
            ? 'naming-existing-entry naming-orphan-entry'
            : 'naming-existing-entry',
          activeText
        ))
      ].join('');
      return `<section class="naming-search-category-group" data-category-id="${escapeHtml(category.id)}">
        <header class="naming-search-category-heading">
          <strong>${escapeHtml(category.title || 'Uncategorized')}</strong>
          <small>${groupEntries.length} ${groupEntries.length === 1 ? 'name' : 'names'}</small>
        </header>
        <div class="naming-search-category-entries">${entryHtml}</div>
      </section>`;
    }).join('');

    display.innerHTML = `<div class="naming-grouped-search-list">${groupedHtml}</div>`;
    return;
  }

  const filteredCategories = visibleCategories.filter(category =>
    !namingSearchQuery || (category.title || '').toLocaleLowerCase().includes(namingSearchQuery.toLocaleLowerCase())
  );

  if (!filteredCategories.length) {
    initializeNamingExpansionForDocument(chapterKey, []);
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
      const globalEntryCount = namingCategoryGlobalCount(category.id);
      const visibleEntryCount = entries.length + detectedEntries.length;
      const hasOtherEntries = existingEntries.length > 0 || globalEntryCount > visibleEntryCount;
      const hasOrphanEntries = !hasChapterEntries && !hasDetectedEntries && hasOtherEntries &&
        namingCategoryAllEntriesUseOrphanStyle(category.id, globalEntryCount);
      const hasExistingEntries = !hasChapterEntries && !hasDetectedEntries && hasOtherEntries && !hasOrphanEntries;

      if (hasChapterEntries) return 4;
      if (hasDetectedEntries) return 3;
      if (hasExistingEntries) return 2;
      return 1;
    };
    sortedCategories.sort((a, b) => getCategoryStatusScore(b) - getCategoryStatusScore(a));
  } else if (namingSortOption === 'count') {
    const getCategoryCount = (category) => {
      return window.LmInitialRendering?.namingCategoryCount?.(category.id) ?? namingData.entries.filter(entry => entry.categoryId === category.id).length;
    };
    sortedCategories.sort((a, b) => getCategoryCount(b) - getCategoryCount(a));
  } else if (namingSortOption === 'alphabetical') {
    sortedCategories.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }));
  }

  initializeNamingExpansionForDocument(chapterKey, sortedCategories);
  display.innerHTML = sortedCategories.map(category => {
    const isExpanded = expandedNamingCategoryId === category.id;
    const activeText = activeNamingPanelText();
    const globalEntries = namingData.entries.filter(entry => entry.categoryId === category.id);
    const globalEntryCount = window.LmInitialRendering?.namingCategoryCount?.(category.id) ?? globalEntries.length;
    const canDeleteCategory = globalEntryCount === 0;
    const {
      activeDocumentEntries: entries,
      detectedEntries,
      existingEntries
    } = namingEntriesByActiveTextPriority(globalEntries, activeText);
    const hasChapterEntries = entries.length > 0;
    const hasDetectedEntries = detectedEntries.length > 0;
    const visibleEntryCount = entries.length + detectedEntries.length;
    const hasOtherEntries = existingEntries.length > 0 || globalEntryCount > visibleEntryCount;
    const hasExistingListEntries = !hasChapterEntries && !hasDetectedEntries && hasOtherEntries;
    const hasOrphanEntries = hasExistingListEntries && namingCategoryAllEntriesUseOrphanStyle(category.id, globalEntryCount);
    const hasExistingEntries = hasExistingListEntries && !hasOrphanEntries;
    const mixedOrphanClass = namingCategoryHasMixedOrphanEntries(category.id, globalEntryCount) ? ' has-orphan-members' : '';
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
          ${hasChapterEntries ? `<button class="category-name-entry-node category-action-trigger${mixedOrphanClass}" type="button" onclick="handleCategoryActionTriggerClick(event, '${escapeJsString(category.id)}')" ondblclick="handleCategoryActionTriggerDoubleClick(event, '${escapeJsString(category.id)}')" onpointerenter="scheduleCategoryActionTriggerInfo(event, '${escapeJsString(category.id)}')" onpointerleave="clearCategoryActionTriggerInfo()" title="${escapeHtml(text().editCategoryTitle)}" aria-label="${escapeHtml(text().editCategoryTitle)}"></button>` : ''}
          ${!hasChapterEntries && hasDetectedEntries ? `<button class="category-detected-node category-action-trigger${mixedOrphanClass}" type="button" onclick="handleCategoryActionTriggerClick(event, '${escapeJsString(category.id)}')" ondblclick="handleCategoryActionTriggerDoubleClick(event, '${escapeJsString(category.id)}')" onpointerenter="scheduleCategoryActionTriggerInfo(event, '${escapeJsString(category.id)}')" onpointerleave="clearCategoryActionTriggerInfo()" title="${escapeHtml(text().editCategoryTitle)}" aria-label="${escapeHtml(text().editCategoryTitle)}"></button>` : ''}
          ${hasOrphanEntries ? `<button class="category-orphan-node category-action-trigger" type="button" onclick="handleCategoryActionTriggerClick(event, '${escapeJsString(category.id)}')" ondblclick="handleCategoryActionTriggerDoubleClick(event, '${escapeJsString(category.id)}')" onpointerenter="scheduleCategoryActionTriggerInfo(event, '${escapeJsString(category.id)}')" onpointerleave="clearCategoryActionTriggerInfo()" title="${escapeHtml(text().editCategoryTitle)}" aria-label="${escapeHtml(text().editCategoryTitle)}"></button>` : ''}
          ${hasExistingEntries ? `<button class="category-existing-node category-action-trigger${mixedOrphanClass}" type="button" onclick="handleCategoryActionTriggerClick(event, '${escapeJsString(category.id)}')" ondblclick="handleCategoryActionTriggerDoubleClick(event, '${escapeJsString(category.id)}')" onpointerenter="scheduleCategoryActionTriggerInfo(event, '${escapeJsString(category.id)}')" onpointerleave="clearCategoryActionTriggerInfo()" title="${escapeHtml(text().editCategoryTitle)}" aria-label="${escapeHtml(text().editCategoryTitle)}"></button>` : ''}
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
  renderNameDetailSimilarNames(entry);
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

async function deleteActiveNamingEntry() {
  if (!activeNamingEntryId) return;
  await window.LmInitialRendering?.ensureFullNamingData?.();
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
  saveNamingData({ allowEntryRemoval: true });
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
    facts: projectDirectoryHandle ? [] : storyFacts
  });
  localStorage.setItem(PROJECT_MANIFEST_KEY, JSON.stringify(projectManifest));
  if (projectDirectoryHandle) {
    Promise.resolve(window.LmFactsPanelData?.writeProjectData?.(storyFacts))
      .then(() => writeProjectManifest())
      .catch(error => console.warn('Facts save failed:', error));
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
  const sectionLoader = window.LmWorkspaceSectionLoader;
  if (!sectionLoader?.ensureRightPanel) {
    syncSidePanelAvailability();
    return;
  }
  sectionLoader.ensureRightPanel(panel, { render: false })
    .then(syncSidePanelAvailability)
    .catch(error => {
      console.warn(`Side panel load failed (${panel}):`, error);
      syncSidePanelAvailability();
    });
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
        <div class="naming-legend-item">
          <span class="category-action-trigger category-existing-node has-orphan-members"></span>
          <span class="naming-legend-text">मुख्य status के साथ नीचे orphan-color dot: इस श्रेणी में attached names के साथ orphan names भी हैं (Mixed category containing orphan names)</span>
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
        <div class="naming-legend-item">
          <span class="tag-item naming-entry-item is-draft-created"><span class="tname">नाम</span></span>
          <span class="naming-legend-text">नाम का टेक्स्ट orphan color में: creation document अभी Draft है (Created in a draft, not a chapter)</span>
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

function closeNamingColorLegendPanelOnOutsidePointer(event) {
  const panel = document.getElementById('namingColorLegendPanel');
  if (!panel || panel.hidden) return;
  const trigger = document.getElementById('namingLegendTriggerBtn');
  const target = event.target;
  if (panel.contains(target) || trigger?.contains(target)) return;
  closeNamingColorLegendPanel();
}

document.addEventListener('pointerdown', closeNamingColorLegendPanelOnOutsidePointer, true);

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
  clearTimeout(handleNamingSearch.loadTimer);
  if (namingSearchMode === 'name' && namingSearchQuery) {
    handleNamingSearch.loadTimer = setTimeout(() => {
      Promise.resolve(window.LmInitialRendering?.ensureFullNamingData?.())
        .then(renderTags)
        .catch(error => console.warn('Naming search data load failed:', error));
    }, 120);
    return;
  }
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
