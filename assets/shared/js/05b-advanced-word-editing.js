'use strict';
(function initializeAdvancedWordEditingModule() { const MAX_ALIASES_PER_RULE = 300;
  const DEVANAGARI = /[\u0900-\u097F]/u;
  const HINDI_MATRA = /[\u093A-\u094D\u0951-\u0957\u0962-\u0963]/u;
  const WORD_CHARACTER = /[\p{L}\p{N}\p{M}_]/u;
  const REPLACEMENT_WORD = /[\p{L}\p{N}]/u;
  const state = { rules: [], categories: ['General'], search: '', categoryFilter: 'all', sortMode: 'order', customCategoriesFirst: false, activeView: 'dictionary', keepEditorReplacements: true, showEditorQuickAction: false, collectUnmatchedReplacements: false, unmatchedReplacementThreshold: 3, unmatchedCategory: 'General', unmatchedObservations: new Map(), temporaryCandidates: [], namingCategories: new Set(), expandedCategories: new Set(), visibleRules: [], selectedRuleIds: new Set(), selectionAnchorRuleId: '', pendingDeleteRuleIds: [], editingCategory: '', categoryFormOpen: false, categoryAction: null, draftAliases: [], root: null, loaded: false, restorePromise: null, projectHandle: null, persistTimer: 0, categoryScrollTimer: 0, aliasResizeObserver: null, dialogDrag: null, temporaryPanelDrag: null, temporaryPanelResize: null, outsideClickHandler: null };
  const TEMPORARY_PANEL_GEOMETRY_KEY = 'lm-awe-temporary-panel-geometry-v1';
  function escapeHTML(value) { return String(value ?? '').replace(/[&<>"]/gu, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]); }
  function escapeAttribute(value) { return escapeHTML(value).replace(/'/gu, '&#39;'); }
  function iconMarkup(name, className, fallback = '') { let markup = typeof window.lmIcon === 'function' ? window.lmIcon(name, className) : '';
    if (name === 'import') markup = markup.replace(/viewBox="[^"]+"/u, 'viewBox="0 0 8.48 8.48"');
    if (markup && (!['delete', 'edit'].includes(name) || /<svg\b/iu.test(markup))) return markup;
    if (fallback) return fallback;
    if (name === 'delete') return `<svg class="${escapeAttribute(className)}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 9h2v10H8V9Zm6 0h2v10h-2V9ZM7 4l1-2h8l1 2h5v2H2V4h5Zm-2 5h2v12h10V9h2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9Z"/></svg>`;
    if (name === 'edit') return `<svg class="${escapeAttribute(className)}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 16.75V20h3.25L17.81 9.44l-3.25-3.25L4 16.75Zm16.71-10.04a1 1 0 0 0 0-1.42l-2-2a1 1 0 0 0-1.42 0l-1.44 1.44 3.25 3.25 1.61-1.27Z"/></svg>`;
    return ''; }
  function createId() { return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function safeFilename(value) { return String(value || 'word-dictionary').trim().replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '-').replace(/\s+/gu, ' ').slice(0, 80) || 'word-dictionary'; }
  function parseAliases(value) { return [...new Set(String(value || '').split(/\r?\n/u).map(alias => alias.trim()).filter(Boolean))].slice(0, MAX_ALIASES_PER_RULE); }
  function normaliseRule(rawRule, order = 0) { if (!rawRule || typeof rawRule !== 'object') return null;
    const values = Array.isArray(rawRule.aliases)
      ? rawRule.aliases
      : Object.prototype.hasOwnProperty.call(rawRule, 'find') ? [rawRule.find] : [];
    const aliases = [...new Set(values.filter(alias => typeof alias === 'string' && alias.length > 0))].slice(0, MAX_ALIASES_PER_RULE);
    if (!aliases.length) return null;
    const categoryValue = rawRule.category ?? rawRule.group;
    const category = typeof categoryValue === 'string' && categoryValue.trim() ? categoryValue.trim().slice(0, 80) : 'General';
    const sourceMode = rawRule.finderMode || rawRule.findMode;
    const finderMode = ['raw', 'saved', 'deep'].includes(sourceMode) ? sourceMode : 'saved';
    return { id: typeof rawRule.id === 'string' && rawRule.id ? rawRule.id : createId(), aliases, find: aliases[0], replace: typeof rawRule.replace === 'string' ? rawRule.replace.slice(0, 500) : '', category, group: category, finderMode, order: Number.isFinite(rawRule.order) ? rawRule.order : order }; }
  function sharedNamingCategoryTitles() { try { if (typeof namingData === 'undefined' || !Array.isArray(namingData?.categories)) return [];
      return namingData.categories.map(category => String(category?.title || category?.label || '').trim()).filter(Boolean); } catch { return []; } }
  function isNamingCategory(category) { return [...state.namingCategories, ...sharedNamingCategoryTitles()].some(title => title.localeCompare(category, undefined, { sensitivity: 'accent' }) === 0); }
  function ensureCategories() { const existing = new Set(state.categories.map(category => String(category || '').trim()).filter(Boolean));
    const namingCategories = sharedNamingCategoryTitles();
    namingCategories.forEach(title => state.namingCategories.add(title));
    const importedNamingCategories = namingCategories.filter(title => !existing.has(title));
    // One-way copy only: Naming categories become dictionary categories. Nothing
    // in this module writes replacement-only categories back into namingData.
    state.categories = [...new Set(['General', ...state.categories, ...importedNamingCategories, ...state.rules.map(rule => rule.category)].map(category => String(category || '').trim()).filter(Boolean))];
    return importedNamingCategories.length; }
  function serializableState() { return { version: 1, savedAt: Date.now(), rules: state.rules, categories: state.categories, search: state.search, categoryFilter: state.categoryFilter, sortMode: state.sortMode, customCategoriesFirst: state.customCategoriesFirst, activeView: state.activeView, keepEditorReplacements: state.keepEditorReplacements, showEditorQuickAction: state.showEditorQuickAction, collectUnmatchedReplacements: state.collectUnmatchedReplacements, unmatchedReplacementThreshold: state.unmatchedReplacementThreshold, unmatchedCategory: state.unmatchedCategory || 'General' }; }
  function loadDictionaryPayload(saved, options = {}) { const payload = saved && typeof saved === 'object' ? saved : {};
    window.clearTimeout(state.persistTimer);
    state.persistTimer = 0;
    state.projectHandle = options.projectHandle || (typeof projectDirectoryHandle !== 'undefined' ? projectDirectoryHandle : null);
    state.loaded = true;
    state.restorePromise = Promise.resolve();
    { state.rules = Array.isArray(payload.rules) ? payload.rules.map(normaliseRule).filter(Boolean) : [];
      state.categories = Array.isArray(payload.categories) ? payload.categories.filter(category => typeof category === 'string') : ['General'];
      state.search = typeof payload.search === 'string' ? payload.search : '';
      state.categoryFilter = typeof payload.categoryFilter === 'string' ? payload.categoryFilter : 'all';
      state.sortMode = ['order', 'count', 'alphabetical'].includes(payload.sortMode) ? payload.sortMode : 'order';
      state.customCategoriesFirst = payload.customCategoriesFirst === true;
      state.activeView = ['editor', 'dictionary'].includes(payload.activeView) ? payload.activeView : 'dictionary';
      state.keepEditorReplacements = payload.keepEditorReplacements !== false;
      state.showEditorQuickAction = payload.showEditorQuickAction === true;
      state.collectUnmatchedReplacements = payload.collectUnmatchedReplacements === true;
      state.unmatchedReplacementThreshold = Math.min(10000, Math.max(1, Math.floor(Number(payload.unmatchedReplacementThreshold) || 3)));
      state.unmatchedCategory = typeof payload.unmatchedCategory === 'string' && payload.unmatchedCategory ? payload.unmatchedCategory : 'General';
      state.unmatchedObservations.clear();
      state.temporaryCandidates = [];
      state.namingCategories.clear();
      state.selectedRuleIds.clear();
      state.expandedCategories.clear();
      ensureCategories();
      renderAll(true);
      syncEditorQuickAction();
      syncEditorDockPanel();
      setStorageStatus(saved ? 'Loaded from project folder (Story_Word_Editing.json)' : 'New project dictionary ready', 'success'); } }
  function resetProjectData(projectHandle = null) {
    window.clearTimeout(state.persistTimer);
    state.persistTimer = 0;
    state.rules = [];
    state.categories = ['General'];
    state.search = '';
    state.categoryFilter = 'all';
    state.namingCategories.clear();
    state.expandedCategories.clear();
    state.selectedRuleIds.clear();
    state.unmatchedObservations.clear();
    state.temporaryCandidates = [];
    state.projectHandle = projectHandle;
    state.loaded = false;
    state.restorePromise = null;
    renderAll(true);
    setStorageStatus(projectHandle ? 'Dictionary will load when this section opens' : 'Open a project to load its dictionary');
  }
  async function restore() { if (state.loaded) return;
    if (state.restorePromise) return state.restorePromise;
    state.restorePromise = (async () => { const handle = typeof projectDirectoryHandle !== 'undefined' ? projectDirectoryHandle : null;
      let saved = null;
      if (handle && typeof readWordEditingDataFromProject === 'function') { try { saved = await readWordEditingDataFromProject(handle); } catch { saved = null; } }
      loadDictionaryPayload(saved, { projectHandle: handle }); })();
    return state.restorePromise; }
  function setStorageStatus(message, tone = '') { const status = state.root?.querySelector('[data-awe-storage-status]');
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone; }
  async function persist() { window.clearTimeout(state.persistTimer);
    const payload = serializableState();
    const targetHandle = state.projectHandle;
    const activeHandle = typeof projectDirectoryHandle !== 'undefined' ? projectDirectoryHandle : null;
    if (!targetHandle || targetHandle !== activeHandle) { setStorageStatus('Open a project before saving its dictionary', 'danger');
      return false; }
    let savedInProject = false;
    if (typeof writeWordEditingDataToProject === 'function') { try { savedInProject = await writeWordEditingDataToProject(payload, targetHandle); } catch { savedInProject = false; } }
    if (savedInProject) setStorageStatus('Dictionary saved to project folder', 'success');
    else { setStorageStatus('Project dictionary could not be saved', 'danger');
      return false; }
    window.dispatchEvent(new CustomEvent('lm:advanced-word-editing-rules-changed', { detail: { rules: getRules() } }));
    return true; }
  function persistSoon() { window.clearTimeout(state.persistTimer);
    setStorageStatus('Saving dictionary…', 'working');
    state.persistTimer = window.setTimeout(persist, 220); }
  function toast(message, type = 'success') { const region = state.root?.querySelector('[data-awe-toast-region]');
    if (region) { const item = document.createElement('div');
      item.className = `awe-toast is-${type}`;
      item.textContent = message;
      region.appendChild(item);
      window.setTimeout(() => item.remove(), 3600); }
    if (!region && typeof window.showMiniReminder === 'function') window.showMiniReminder(message); }
  function filteredRules() { const query = state.search.trim().toLocaleLowerCase();
    return state.rules.filter(rule => { const searchable = `${rule.aliases.join(' ')} ${rule.replace} ${rule.category} ${rule.finderMode}`.toLocaleLowerCase();
      return !query || searchable.includes(query); }); }
  function createRuleRow(rule) { const aliasCount = rule.aliases.length;
    const preview = aliasCount > 1 ? `${aliasCount} aliases: ${rule.aliases.slice(0, 3).join(', ')}${aliasCount > 3 ? ', …' : ''}` : '1 alias';
    const mode = rule.finderMode === 'saved' ? 'Save' : rule.finderMode === 'deep' ? 'Deep' : 'Raw';
    const aliases = rule.aliases.map((alias, index) => `<span class="awe-rule-alias-name" data-awe-alias-name>${index ? ', ' : ''}${escapeHTML(alias)}</span>`).join('');
    const selected = state.selectedRuleIds.has(rule.id);
    return `<div class="awe-rule-row ${selected ? 'is-selected' : ''}" data-awe-rule-id="${escapeAttribute(rule.id)}" tabindex="0" aria-selected="${selected}" title="${escapeAttribute(`${preview} → ${rule.replace || 'delete'}`)}"><div class="awe-rule-main"><strong class="awe-rule-replacement">${escapeHTML(rule.replace || '∅')}</strong><span class="awe-rule-alias-list" data-awe-alias-list title="${escapeAttribute(rule.aliases.join(', '))}">${aliases}<span class="awe-rule-alias-more" data-awe-alias-more hidden></span></span></div><div class="awe-rule-actions"><span class="awe-finder-mode is-${rule.finderMode}">${mode}</span><button class="awe-row-delete-btn" type="button" data-awe-action="request-delete-rule" data-rule-id="${escapeAttribute(rule.id)}" aria-label="Delete rule" hidden>${iconMarkup('delete', 'awe-delete-icon')}</button><button class="awe-rule-edit-btn" type="button" data-awe-action="edit-rule" data-rule-id="${escapeAttribute(rule.id)}" aria-label="Edit rule">${iconMarkup('edit', 'awe-edit-icon')}</button></div></div>`; }
  function selectedRulesInCategory(category) { return state.rules.filter(rule => rule.category === category && state.selectedRuleIds.has(rule.id)); }
  function clearRuleSelection() { if (!state.selectedRuleIds.size && !state.selectionAnchorRuleId) return false;
    state.selectedRuleIds.clear();
    state.selectionAnchorRuleId = '';
    applyRuleSelectionUI();
    return true; }
  function pruneRuleSelection() { const validIds = new Set(state.rules.map(rule => rule.id));
    state.selectedRuleIds.forEach(id => { if (!validIds.has(id)) state.selectedRuleIds.delete(id); });
    if (!validIds.has(state.selectionAnchorRuleId)) state.selectionAnchorRuleId = ''; }
  function applyRuleSelectionUI() { if (!state.root) return;
    pruneRuleSelection();
    const renderedIds = new Set([...state.root.querySelectorAll('[data-awe-rule-id]')].map(row => row.dataset.aweRuleId));
    state.selectedRuleIds.forEach(id => { if (!renderedIds.has(id)) state.selectedRuleIds.delete(id); });
    if (state.selectionAnchorRuleId && !renderedIds.has(state.selectionAnchorRuleId)) state.selectionAnchorRuleId = '';
    const selectedCount = state.selectedRuleIds.size;
    state.root.querySelectorAll('[data-awe-rule-id]').forEach(row => { const selected = state.selectedRuleIds.has(row.dataset.aweRuleId);
      row.classList.toggle('is-selected', selected);
      row.setAttribute('aria-selected', String(selected));
      const deleteButton = row.querySelector('.awe-row-delete-btn');
      if (deleteButton) deleteButton.hidden = !(selectedCount === 1 && selected); });
    state.root.querySelectorAll('[data-awe-category-card]').forEach(card => { const category = card.dataset.aweCategoryCard;
      const selectedInCategory = selectedRulesInCategory(category).length;
      const allCount = state.rules.filter(rule => rule.category === category).length;
      const visibleCount = state.visibleRules.filter(rule => rule.category === category).length;
      const count = card.querySelector('.awe-category-toggle small');
      if (count) { count.textContent = selectedCount > 1 && selectedInCategory ? `${selectedInCategory} selected` : `${visibleCount}/${allCount}`;
        count.classList.toggle('is-selection-count', selectedCount > 1 && selectedInCategory > 0); }
      const deleteButton = card.querySelector('.awe-category-delete-selected-button');
      if (deleteButton) { deleteButton.hidden = !(selectedCount > 1 && selectedInCategory > 0);
        deleteButton.setAttribute('aria-label', `Delete Selected (${selectedInCategory})`);
        deleteButton.title = `Delete Selected (${selectedInCategory})`;
        const label = deleteButton.querySelector('[data-awe-delete-selected-label]');
        if (label) label.textContent = `Delete Selected (${selectedInCategory})`; } }); }
  function selectRuleRow(row, event = {}) { const id = row?.dataset.aweRuleId;
    if (!id) return;
    const renderedIds = [...state.root.querySelectorAll('[data-awe-rule-id]')].map(item => item.dataset.aweRuleId);
    const additive = event.ctrlKey || event.metaKey;
    if (event.shiftKey) { let anchor = state.selectionAnchorRuleId;
      if (!renderedIds.includes(anchor)) anchor = renderedIds.find(item => state.selectedRuleIds.has(item)) || id;
      const from = renderedIds.indexOf(anchor);
      const to = renderedIds.indexOf(id);
      if (!additive) state.selectedRuleIds.clear();
      if (from >= 0 && to >= 0) renderedIds.slice(Math.min(from, to), Math.max(from, to) + 1).forEach(item => state.selectedRuleIds.add(item));
      state.selectionAnchorRuleId = anchor; } else if (additive) { if (state.selectedRuleIds.has(id)) state.selectedRuleIds.delete(id);
      else state.selectedRuleIds.add(id);
      state.selectionAnchorRuleId = id; } else if (state.selectedRuleIds.size === 1 && state.selectedRuleIds.has(id)) { state.selectedRuleIds.clear();
      state.selectionAnchorRuleId = ''; } else {
      state.selectedRuleIds.clear();
      state.selectedRuleIds.add(id);
      state.selectionAnchorRuleId = id;
    }
    applyRuleSelectionUI();
  }
  function fitRuleAliases() {
    state.root?.querySelectorAll('[data-awe-alias-list]').forEach(list => {
      const aliases = [...list.querySelectorAll('[data-awe-alias-name]')];
      const more = list.querySelector('[data-awe-alias-more]');
      aliases.forEach(alias => { alias.hidden = false; });
      more.hidden = true;
      more.textContent = '';
      if (list.scrollWidth <= list.clientWidth) return;
      more.hidden = false;
      let hiddenCount = 0;
      for (let index = aliases.length - 1; index >= 0 && list.scrollWidth > list.clientWidth; index -= 1) {
        aliases[index].hidden = true;
        hiddenCount += 1;
        more.textContent = `${hiddenCount < aliases.length ? ', ' : ''}+${hiddenCount} other${hiddenCount === 1 ? '' : 's'}`;
      }
    });
  }
  function scheduleRuleAliasFit() { window.requestAnimationFrame(fitRuleAliases); }
  function renderRules(resetScroll = false) {
    if (!state.root) return;
    state.visibleRules = filteredRules();
    const aliasCount = state.rules.reduce((count, rule) => count + rule.aliases.length, 0);
    const summary = state.root.querySelector('[data-awe-rule-summary]');
    if (summary) summary.textContent = `${state.rules.length.toLocaleString()} rules · ${aliasCount.toLocaleString()} aliases`;
    const workspace = state.root.querySelector('[data-awe-category-workspace]');
    if (!workspace) return;
    const query = state.search.trim().toLocaleLowerCase();
    let categories = state.categories.map((title, index) => ({
      title, index, rules: state.visibleRules.filter(rule => rule.category === title)
    })).filter(category => !query || category.title.toLocaleLowerCase().includes(query) || category.rules.length);
    if (state.sortMode === 'count') categories.sort((a, b) => b.rules.length - a.rules.length || a.index - b.index);
    else if (state.sortMode === 'alphabetical') categories.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    if (state.customCategoriesFirst) categories.sort((a, b) => Number(isNamingCategory(a.title)) - Number(isNamingCategory(b.title)));
    if (!categories.length) {
      workspace.innerHTML = `<div class="awe-category-empty">No categories or replacement rules match “${escapeHTML(state.search)}”.</div>`;
      return;
    }
    workspace.innerHTML = categories.map(category => {
      const expanded = query ? true : state.expandedCategories.has(category.title);
      const chevronIcon = iconMarkup('collapseChevron', `awe-category-chevron-icon lm-chevron-${expanded ? 'down' : 'right'}`, expanded ? '⌄' : '›');
      const addIcon = iconMarkup('categoryAdd', 'awe-category-add-icon', '+');
      const allCount = state.rules.filter(rule => rule.category === category.title).length;
      const entries = expanded
        ? (category.rules.length ? category.rules.map(createRuleRow).join('') : '<div class="awe-category-entry-empty">No replacement rules in this category.</div>')
        : '';
      const namingCategory = isNamingCategory(category.title);
      return `<section class="awe-category-card ${expanded ? 'is-expanded' : ''} ${namingCategory ? 'is-naming-category' : ''}" data-awe-category-card="${escapeAttribute(category.title)}"><div class="awe-category-title"><button class="awe-category-toggle" type="button" data-awe-action="toggle-category" data-category="${escapeAttribute(category.title)}" aria-expanded="${expanded}"><span class="awe-category-chevron" aria-hidden="true">${chevronIcon}</span><strong>${escapeHTML(category.title)}</strong><small>${category.rules.length}/${allCount}</small></button><button class="awe-category-delete-selected-button" type="button" data-awe-action="request-delete-selected" data-category="${escapeAttribute(category.title)}" aria-label="Delete selected rules" hidden>${iconMarkup('delete', 'awe-delete-icon')}<span class="sr-only" data-awe-delete-selected-label>Delete Selected</span></button><button class="awe-category-add" type="button" data-awe-action="new-rule-in-category" data-category="${escapeAttribute(category.title)}" aria-label="Add replacement to ${escapeAttribute(category.title)}">${addIcon}</button></div><div class="awe-category-entries" ${expanded ? '' : 'hidden'}>${entries}</div></section>`;
    }).join('');
    if (resetScroll) workspace.scrollTop = 0;
    applyRuleSelectionUI();
    scheduleRuleAliasFit();
  }
  function renderCategoryControls() {
    ensureCategories();
    const ruleCategory = state.root?.querySelector('[data-awe-rule-category]');
    if (ruleCategory) {
      const previous = ruleCategory.value;
      ruleCategory.innerHTML = state.categories.map(category => `<option value="${escapeAttribute(category)}">${escapeHTML(category)}</option>`).join('');
      ruleCategory.value = state.categories.includes(previous) ? previous : 'General';
    }
  }
  function renderCategoryList() {
    const list = state.root?.querySelector('[data-awe-category-list]');
    if (!list) return;
    ensureCategories();
    const editIcon = iconMarkup('edit', 'awe-category-action-icon');
    const deleteIcon = iconMarkup('delete', 'awe-category-action-icon');
    list.innerHTML = state.categories.map(category => {
      const count = state.rules.filter(rule => rule.category === category).length;
      if (state.editingCategory === category) {
        return `<form class="awe-category-row awe-inline-rename-form is-editing" data-awe-category-rename-form data-category="${escapeAttribute(category)}"><input name="categoryName" type="text" maxlength="80" value="${escapeAttribute(category)}" aria-label="Category name"><button class="is-primary" type="submit">Save</button></form>`;
      }
      return `<div class="awe-category-row"><span><strong>${escapeHTML(category)}</strong><small>${count.toLocaleString()} rules${isNamingCategory(category) ? ' · Naming category' : ''}</small></span><div><button class="awe-category-rename-btn" type="button" data-awe-action="rename-category" data-category="${escapeAttribute(category)}" aria-label="Rename ${escapeAttribute(category)}" title="${isNamingCategory(category) ? 'Rename this category from the Naming panel' : 'Rename category'}" ${isNamingCategory(category) ? 'disabled' : ''}>${editIcon}</button><button class="awe-category-delete-btn" type="button" data-awe-action="manage-category" data-category="${escapeAttribute(category)}" aria-label="Manage ${escapeAttribute(category)}" title="Manage category rules">${deleteIcon}</button></div></div>`;
    }).join('');
    if (state.editingCategory) window.requestAnimationFrame(() => { const input = list.querySelector('[data-awe-category-rename-form] input'); input?.focus(); input?.select(); });
  }
  function renderAll(resetScroll = false) {
    if (!state.root) return;
    const search = state.root.querySelector('[data-awe-search]');
    if (search) search.value = state.search;
    renderCategoryControls();
    state.root.querySelectorAll('[data-awe-action="set-sort"]').forEach(button => button.classList.toggle('is-active', button.dataset.sort === state.sortMode));
    state.root.querySelector('[data-awe-action="toggle-custom-first"]')?.classList.toggle('is-active', state.customCategoriesFirst);
    renderRules(resetScroll);
    renderWorkspaceView();
  }
  function renderUnmatchedCategoryOptions() {
    if (!state.root) return;
    const select = state.root.querySelector('[data-awe-unmatched-category]');
    if (!select) return;
    const currentVal = state.unmatchedCategory || 'General';
    select.innerHTML = state.categories.map(cat => `<option value="${escapeAttribute(cat)}"${cat === currentVal ? ' selected' : ''}>${escapeHTML(cat)}</option>`).join('');
    if (typeof syncCustomSelects === 'function') syncCustomSelects(state.root);
  }
  function renderWorkspaceView() {
    if (!state.root) return;
    state.root.dataset.aweView = state.activeView;
    const viewScope = state.root.parentElement || state.root;
    viewScope.querySelectorAll('[data-awe-view-tab]').forEach(button => {
      const active = button.dataset.aweViewTab === state.activeView;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    const editorSettings = state.root.querySelector('[data-awe-editor-settings]');
    const dictionary = state.root.querySelector('[data-awe-dictionary-view]');
    if (editorSettings) editorSettings.hidden = state.activeView !== 'editor';
    if (dictionary) dictionary.hidden = state.activeView !== 'dictionary';
    const keepToggle = state.root.querySelector('[data-awe-setting="keep-editor-replacements"]');
    const quickToggle = state.root.querySelector('[data-awe-setting="show-editor-quick-action"]');
    const unmatchedToggle = state.root.querySelector('[data-awe-setting="collect-unmatched-replacements"]');
    const unmatchedThreshold = state.root.querySelector('[data-awe-unmatched-threshold]');
    if (keepToggle) keepToggle.checked = state.keepEditorReplacements;
    if (quickToggle) quickToggle.checked = state.showEditorQuickAction;
    if (unmatchedToggle) unmatchedToggle.checked = state.collectUnmatchedReplacements;
    if (unmatchedThreshold) {
      unmatchedThreshold.value = String(state.unmatchedReplacementThreshold);
    }
    renderUnmatchedCategoryOptions();
    renderTemporaryCandidates();
    if (typeof syncCustomSelects === 'function') syncCustomSelects(state.root);
  }
  function openDialog(name) {
    const dialog = state.root?.querySelector(`[data-awe-dialog="${name}"]`);
    if (!dialog) return;
    dialog.hidden = false;
    window.setTimeout(() => {
      if (typeof syncCustomSelects === 'function') syncCustomSelects(dialog);
      dialog.querySelector('textarea, input, button')?.focus();
    }, 20);
  }
  function closeDialog(name) {
    const dialog = state.root?.querySelector(`[data-awe-dialog="${name}"]`);
    if (dialog) dialog.hidden = true;
    if (name === 'rule') endRuleDialogDrag();
    if (name === 'categories') {
      state.editingCategory = '';
      state.categoryFormOpen = false;
      syncCategoryFooter();
    }
    if (name === 'delete-rule') state.pendingDeleteRuleIds = [];
    if (name === 'category-action') state.categoryAction = null;
  }
  function syncCategoryFooter() {
    const footer = state.root?.querySelector('[data-awe-category-footer]');
    if (!footer) return;
    const trigger = footer.querySelector('[data-awe-action="show-category-form"]');
    const form = footer.querySelector('[data-awe-category-form]');
    if (trigger) trigger.hidden = state.categoryFormOpen;
    if (form) {
      form.hidden = !state.categoryFormOpen;
      if (state.categoryFormOpen) window.requestAnimationFrame(() => form.elements.categoryName?.focus());
      else form.reset();
    }
  }
  function beginRuleDialogDrag(event) {
    if (event.button !== 0 || event.target.closest('button, input, select, textarea')) return;
    const handle = event.target.closest('[data-awe-rule-drag-handle]');
    const panel = handle?.closest('.awe-rule-entry-panel');
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.transform = 'none';
    state.dialogDrag = { panel, pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    handle.setPointerCapture?.(event.pointerId);
    panel.classList.add('is-dragging');
    event.preventDefault();
  }
  function moveRuleDialog(event) {
    const drag = state.dialogDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = drag.panel.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - rect.width - 8, event.clientX - drag.offsetX));
    const top = Math.max(8, Math.min(window.innerHeight - rect.height - 8, event.clientY - drag.offsetY));
    drag.panel.style.left = `${left}px`;
    drag.panel.style.top = `${top}px`;
    event.preventDefault();
  }
  function endRuleDialogDrag(event) {
    if (!state.dialogDrag || (event?.pointerId != null && state.dialogDrag.pointerId !== event.pointerId)) return;
    state.dialogDrag.panel.classList.remove('is-dragging');
    state.dialogDrag = null;
  }
  function readTemporaryPanelGeometry() {
    try {
      const value = JSON.parse(localStorage.getItem(TEMPORARY_PANEL_GEOMETRY_KEY) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch { return null; }
  }
  function saveTemporaryPanelGeometry(panel) {
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    try {
      localStorage.setItem(TEMPORARY_PANEL_GEOMETRY_KEY, JSON.stringify({
        left: Math.round(rect.left),
        top: Math.round(rect.top)
      }));
    } catch { /* UI geometry persistence is best effort. */ }
  }
  function normalizeTemporaryPanelPosition(panel) {
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${Math.round(rect.left)}px`;
    panel.style.top = `${Math.round(rect.top)}px`;
    panel.style.transform = 'none';
    return rect;
  }
  function clampTemporaryPanelPosition(panel, left, top) {
    const gap = 10;
    const rect = panel.getBoundingClientRect();
    return {
      left: Math.max(gap, Math.min(window.innerWidth - rect.width - gap, left)),
      top: Math.max(gap, Math.min(window.innerHeight - rect.height - gap, top))
    };
  }
  function fitStandaloneTemporaryPanelToCandidates(panel) {
    if (!panel || panel.dataset.aweUserSized === 'true') return;
    panel.classList.add('is-measuring-default-height');
    panel.style.height = 'auto';
    const desiredHeight = Math.min(standaloneTemporaryPanelDefaultHeight(panel), window.innerHeight - 20);
    panel.style.height = `${Math.round(desiredHeight)}px`;
    panel.classList.remove('is-measuring-default-height');
    syncTemporaryPanelResizeAvailability(panel);
  }
  function temporaryPanelBaseMinimumHeight(panel) {
    return panel?.querySelector('.awe-temporary-candidate-row') ? 0 : 150;
  }
  function standaloneTemporaryPanelDefaultHeight(panel) {
    const list = panel?.querySelector('[data-awe-temporary-list]');
    const rows = list ? [...list.querySelectorAll('.awe-temporary-candidate-row')] : [];
    if (!panel || !list || !rows.length) return 150;
    const panelHeight = panel.getBoundingClientRect().height;
    const listHeight = list.getBoundingClientRect().height;
    const rowHeight = rows[0].getBoundingClientRect().height || (window.innerWidth <= 720 ? 88 : 52);
    const rowGap = Number.parseFloat(getComputedStyle(list).rowGap) || 8;
    const visibleRows = Math.min(5, rows.length);
    const defaultListHeight = (rowHeight * visibleRows) + (rowGap * Math.max(0, visibleRows - 1));
    return Math.max(temporaryPanelBaseMinimumHeight(panel), Math.ceil(panelHeight - listHeight + defaultListHeight));
  }
  function syncTemporaryPanelResizeAvailability(panel) {
    const list = panel?.querySelector('[data-awe-temporary-list]');
    const handle = panel?.querySelector('[data-awe-temporary-resize-handle]');
    if (!panel || !list || !handle) return false;
    const hasMoreThanDefaultRows = list.querySelectorAll('.awe-temporary-candidate-row').length > 5;
    const hasOverflow = list.scrollHeight > list.clientHeight + 1;
    const canResize = hasMoreThanDefaultRows || hasOverflow;
    panel.classList.toggle('can-resize-height', canResize);
    handle.setAttribute('aria-disabled', String(!canResize));
    handle.title = canResize
      ? (hasOverflow ? 'Drag to show more names' : 'Drag to adjust panel height')
      : 'All temporary names are already visible';
    return canResize;
  }
  function standaloneTemporaryPanelContentHeight(panel) {
    const list = panel?.querySelector('[data-awe-temporary-list]');
    if (!panel || !list) return 150;
    const panelHeight = panel.getBoundingClientRect().height;
    const visibleListHeight = list.getBoundingClientRect().height;
    return Math.max(temporaryPanelBaseMinimumHeight(panel), Math.ceil(panelHeight - visibleListHeight + list.scrollHeight) + 1);
  }
  function clampStandaloneTemporaryPanelHeight(panel) {
    if (!panel || panel.dataset.aweUserSized !== 'true') return;
    const rect = panel.getBoundingClientRect();
    const baseMinimum = temporaryPanelBaseMinimumHeight(panel);
    const viewportLimit = Math.max(baseMinimum, window.innerHeight - rect.top - 10);
    const contentLimit = standaloneTemporaryPanelContentHeight(panel);
    const maximumHeight = Math.max(baseMinimum, Math.min(viewportLimit, contentLimit));
    if (rect.height > maximumHeight) panel.style.height = `${Math.round(maximumHeight)}px`;
  }
  function reconcileStandaloneTemporaryPanelHeight(panel) {
    if (!panel) return;
    const itemCount = panel.querySelectorAll('.awe-temporary-candidate-row').length;
    if (itemCount <= 5) {
      delete panel.dataset.aweUserSized;
      fitStandaloneTemporaryPanelToCandidates(panel);
      return;
    }
    if (panel.dataset.aweUserSized === 'true') clampStandaloneTemporaryPanelHeight(panel);
    else fitStandaloneTemporaryPanelToCandidates(panel);
    syncTemporaryPanelResizeAvailability(panel);
  }
  function restoreStandaloneTemporaryPanelGeometry(panel) {
    const saved = readTemporaryPanelGeometry();
    delete panel.dataset.aweUserSized;
    fitStandaloneTemporaryPanelToCandidates(panel);
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
      const next = clampTemporaryPanelPosition(panel, saved.left, saved.top);
      panel.style.left = `${Math.round(next.left)}px`;
      panel.style.top = `${Math.round(next.top)}px`;
      panel.style.transform = 'none';
    }
    syncTemporaryPanelResizeAvailability(panel);
  }
  function beginTemporaryPanelPointerAction(event) {
    if (event.button !== 0) return;
    const panel = event.target.closest('.awe-standalone-temporary-backdrop .awe-temporary-candidates-panel');
    if (!panel) return;
    const resizeHandle = event.target.closest('[data-awe-temporary-resize-handle]');
    if (resizeHandle) {
      if (!syncTemporaryPanelResizeAvailability(panel)) return;
      const rect = normalizeTemporaryPanelPosition(panel);
      state.temporaryPanelResize = {
        panel,
        pointerId: event.pointerId,
        startY: event.clientY,
        startHeight: rect.height,
        minimumHeight: standaloneTemporaryPanelDefaultHeight(panel),
        contentHeight: standaloneTemporaryPanelContentHeight(panel)
      };
      resizeHandle.setPointerCapture?.(event.pointerId);
      panel.classList.add('is-resizing');
      event.preventDefault();
      return;
    }
    if (event.target.closest('button, input, select, textarea, .lm-custom-select')) return;
    const handle = event.target.closest('[data-awe-temporary-drag-handle]');
    if (!handle) return;
    const rect = normalizeTemporaryPanelPosition(panel);
    state.temporaryPanelDrag = { panel, pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    handle.setPointerCapture?.(event.pointerId);
    panel.classList.add('is-dragging');
    event.preventDefault();
  }
  function moveTemporaryPanelPointerAction(event) {
    const resize = state.temporaryPanelResize;
    if (resize?.pointerId === event.pointerId) {
      const viewportHeight = window.innerHeight - resize.panel.getBoundingClientRect().top - 10;
      const maxHeight = Math.max(150, Math.min(viewportHeight, resize.contentHeight));
      const requestedHeight = resize.startHeight + event.clientY - resize.startY;
      const minimumHeight = Math.min(maxHeight, Math.max(150, resize.minimumHeight || 150));
      resize.panel.style.height = `${Math.max(minimumHeight, Math.min(maxHeight, requestedHeight))}px`;
      resize.panel.dataset.aweUserSized = 'true';
      const canResizeFurther = syncTemporaryPanelResizeAvailability(resize.panel);
      if (!canResizeFurther && requestedHeight >= maxHeight) endTemporaryPanelPointerAction(event);
      event.preventDefault();
      return;
    }
    const drag = state.temporaryPanelDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = clampTemporaryPanelPosition(drag.panel, event.clientX - drag.offsetX, event.clientY - drag.offsetY);
    drag.panel.style.left = `${Math.round(next.left)}px`;
    drag.panel.style.top = `${Math.round(next.top)}px`;
    event.preventDefault();
  }
  function endTemporaryPanelPointerAction(event) {
    const drag = state.temporaryPanelDrag;
    if (drag && (event?.pointerId == null || drag.pointerId === event.pointerId)) {
      drag.panel.classList.remove('is-dragging');
      saveTemporaryPanelGeometry(drag.panel);
      state.temporaryPanelDrag = null;
    }
    const resize = state.temporaryPanelResize;
    if (resize && (event?.pointerId == null || resize.pointerId === event.pointerId)) {
      resize.panel.classList.remove('is-resizing');
      syncTemporaryPanelResizeAvailability(resize.panel);
      saveTemporaryPanelGeometry(resize.panel);
      state.temporaryPanelResize = null;
    }
  }
  function findRule(id) { return state.rules.find(rule => rule.id === id) || null; }
  function replacementIdentity(value) {
    return String(value || '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
  }
  function adoptExistingReplacementRule(options = {}) {
    const form = state.root?.querySelector('[data-awe-rule-form]');
    if (!form || form.elements.ruleId.value) return null;
    const identity = replacementIdentity(form.elements.replacement.value);
    if (!identity) return null;
    const existing = state.rules.find(rule => replacementIdentity(rule.replace) === identity);
    if (!existing) return null;
    commitSourceWordInput();
    state.draftAliases = [...new Set([...existing.aliases, ...state.draftAliases])];
    form.elements.ruleId.value = existing.id;
    form.elements.replacement.value = existing.replace;
    form.elements.category.value = existing.category;
    form.elements.finderMode.value = existing.finderMode;
    renderDraftAliases();
    state.root.querySelector('[data-awe-rule-dialog-title]').textContent = 'Edit Word Replacement';
    state.root.querySelector('[data-awe-save-rule]').textContent = 'Save Replacement';
    state.root.querySelector('[data-awe-delete-rule]').hidden = false;
    syncFinderHelp();
    if (options.notify !== false) toast(`“${existing.replace}” already exists. Editing its existing rule.`);
    return existing;
  }
  function renderDraftAliases() {
    const list = state.root?.querySelector('[data-awe-source-word-list]');
    if (!list) return;
    list.innerHTML = state.draftAliases.map((alias, index) => `<span class="awe-source-word-chip"><span>${escapeHTML(alias)}</span><button type="button" data-awe-action="remove-source-word" data-alias-index="${index}" aria-label="Remove ${escapeAttribute(alias)}">${iconMarkup('close', 'awe-source-word-remove-icon')}</button></span>`).join('');
  }
  function setSourceWordInputOpen(open, options = {}) {
    const row = state.root?.querySelector('[data-awe-word-input-row]');
    const input = state.root?.querySelector('[data-awe-source-word-input]');
    if (!row || !input) return;
    row.classList.toggle('is-source-input-open', open);
    input.hidden = !open;
    if (open && options.focus !== false) window.setTimeout(() => input.focus(), 0);
    if (!open) input.value = '';
  }
  function commitSourceWordInput(options = {}) {
    const input = state.root?.querySelector('[data-awe-source-word-input]');
    if (!input) return false;
    const alias = input.value.trim();
    if (alias && !state.draftAliases.includes(alias)) {
      state.draftAliases.push(alias);
      renderDraftAliases();
    }
    input.value = '';
    if (options.keepOpen !== true) setSourceWordInputOpen(false);
    return Boolean(alias);
  }
  function syncFinderHelp() {
    const select = state.root?.querySelector('[data-awe-finder-mode]');
    if (!select) return;
    const explanation = ({
      raw: 'Case-insensitive complete-word matching. Hindi may include only extra trailing matras.',
      saved: 'Exact, case-sensitive complete-word matching.',
      deep: 'Case-insensitive matching without word boundaries; the source sequence stays exact.'
    })[select.value];
    select.title = explanation;
  }
  function openRuleDialog(rule = null, preferredCategory = 'General') {
    const form = state.root?.querySelector('[data-awe-rule-form]');
    if (!form) return;
    form.reset();
    form.elements.replacement.classList.remove('is-invalid');
    form.elements.replacement.removeAttribute('aria-invalid');
    form.elements.ruleId.value = rule?.id || '';
    form.elements.replacement.value = rule?.replace || '';
    state.draftAliases = rule ? [...rule.aliases] : [];
    renderDraftAliases();
    setSourceWordInputOpen(false, { focus: false });
    renderCategoryControls();
    form.elements.category.value = rule?.category || (state.categories.includes(preferredCategory) ? preferredCategory : 'General');
    form.elements.finderMode.value = rule?.finderMode || 'saved';
    state.root.querySelector('[data-awe-rule-dialog-title]').textContent = rule ? 'Edit Word Replacement' : 'Add Word Replacement';
    state.root.querySelector('[data-awe-save-rule]').textContent = rule ? 'Save Replacement' : 'Add Replacement';
    state.root.querySelector('[data-awe-delete-rule]').hidden = !rule;
    syncFinderHelp();
    openDialog('rule');
    window.setTimeout(() => form.elements.replacement.focus(), 20);
  }
  function saveRule(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const replacementInput = form.elements.replacement;
    const replacement = replacementInput.value.trim();
    if (!REPLACEMENT_WORD.test(replacement)) {
      replacementInput.classList.add('is-invalid');
      replacementInput.setAttribute('aria-invalid', 'true');
      replacementInput.focus();
      toast('Enter at least one replacement word.', 'error');
      return;
    }
    replacementInput.classList.remove('is-invalid');
    replacementInput.removeAttribute('aria-invalid');
    commitSourceWordInput();
    adoptExistingReplacementRule();
    const aliases = parseAliases(state.draftAliases.join('\n'));
    if (!aliases.length) {
      toast('Add at least one source word or phrase.', 'error');
      setSourceWordInputOpen(true);
      return;
    }
    const draft = normaliseRule({
      id: form.elements.ruleId.value, aliases, replace: replacement,
      category: form.elements.category.value,
      finderMode: form.elements.finderMode.value, order: state.rules.length
    }, state.rules.length);
    const index = state.rules.findIndex(rule => rule.id === draft.id);
    if (index >= 0) state.rules[index] = { ...draft, order: state.rules[index].order };
    else state.rules.push(draft);
    ensureCategories(); renderAll(false); closeDialog('rule'); persistSoon();
    toast(index >= 0 ? 'Rule updated.' : 'Rule added.');
  }
  function requestRuleDeletion(ids) {
    const validIds = [...new Set(ids)].filter(id => findRule(id));
    if (!validIds.length) return;
    state.pendingDeleteRuleIds = validIds;
    const title = state.root?.querySelector('[data-awe-delete-rule-title]');
    const body = state.root?.querySelector('[data-awe-delete-rule-body]');
    if (title) title.textContent = validIds.length === 1 ? 'Delete this replacement rule?' : `Delete ${validIds.length} replacement rules?`;
    if (body) body.textContent = validIds.length === 1
      ? 'This rule will be permanently removed from the replacement dictionary.'
      : 'These selected rules will be permanently removed from the replacement dictionary.';
    openDialog('delete-rule');
  }
  function confirmRuleDeletion() {
    const ids = new Set(state.pendingDeleteRuleIds);
    if (!ids.size) { closeDialog('delete-rule'); return; }
    const deletedCount = state.rules.filter(rule => ids.has(rule.id)).length;
    state.rules = state.rules.filter(rule => !ids.has(rule.id));
    ids.forEach(id => state.selectedRuleIds.delete(id));
    if (ids.has(state.selectionAnchorRuleId)) state.selectionAnchorRuleId = '';
    state.pendingDeleteRuleIds = [];
    closeDialog('delete-rule');
    closeDialog('rule');
    renderAll(false);
    persistSoon();
    toast(deletedCount === 1 ? 'Rule deleted.' : `${deletedCount} rules deleted.`);
  }
  function addCategory(event) {
    event.preventDefault();
    const input = event.currentTarget.elements.categoryName;
    const category = input.value.trim().slice(0, 80);
    if (!category) return;
    if (state.categories.some(item => item.localeCompare(category, undefined, { sensitivity: 'accent' }) === 0)) { toast('That category already exists.', 'error'); return; }
    state.categories.push(category);
    input.value = '';
    state.categoryFormOpen = false;
    renderCategoryControls();
    renderRules(false);
    renderCategoryList();
    syncCategoryFooter();
    persistSoon();
  }
  function renameCategory(category) {
    if (isNamingCategory(category)) {
      toast('Naming categories का नाम Naming panel से बदला जा सकता है।', 'error');
      return;
    }
    state.editingCategory = category;
    renderCategoryList();
  }
  function saveCategoryRename(event) {
    event.preventDefault();
    const form = event.target;
    const category = form.dataset.category;
    const next = form.elements.categoryName.value.trim().slice(0, 80);
    if (!next) return;
    if (next === category) {
      state.editingCategory = '';
      renderCategoryList();
      return;
    }
    if (state.categories.some(item => item !== category && item.localeCompare(next, undefined, { sensitivity: 'accent' }) === 0)) { toast('That category already exists.', 'error'); return; }
    state.categories = state.categories.map(item => item === category ? next : item);
    state.rules.forEach(rule => { if (rule.category === category) { rule.category = next; rule.group = next; } });
    if (state.categoryFilter === category) state.categoryFilter = next;
    if (state.expandedCategories.delete(category)) state.expandedCategories.add(next);
    state.editingCategory = '';
    renderAll(false); renderCategoryList(); persistSoon();
  }
  function openCategoryAction(category) {
    if (!state.categories.includes(category)) return;
    state.categoryAction = { category, stage: 'choices' };
    renderCategoryActionDialog();
    openDialog('category-action');
  }
  function renderCategoryActionDialog() {
    const operation = state.categoryAction;
    const dialog = state.root?.querySelector('[data-awe-dialog="category-action"]');
    if (!dialog || !operation) return;
    const { category, stage } = operation;
    const rules = state.rules.filter(rule => rule.category === category);
    const protectedCategory = category === 'General' || isNamingCategory(category);
    const title = dialog.querySelector('[data-awe-category-action-title]');
    const copy = dialog.querySelector('[data-awe-category-action-copy]');
    const select = dialog.querySelector('[data-awe-category-target]');
    title.textContent = `Manage “${category}”`;
    copy.textContent = `${rules.length.toLocaleString()} replacement rules are currently inside this category.`;
    if (stage === 'choices') {
      select.innerHTML = `<option value="" data-placeholder="true">Choose destination category</option>${state.categories.filter(item => item !== category).map(item => `<option value="${escapeAttribute(item)}">${escapeHTML(item)}</option>`).join('')}`;
      select.value = '';
    }
    select.disabled = stage === 'choices';
    dialog.classList.toggle('is-move-selecting', stage === 'move-select');
    dialog.classList.toggle('is-move-ready', stage === 'move-ready');
    dialog.querySelector('[data-awe-category-initial-actions]').hidden = stage === 'move-ready';
    dialog.querySelector('[data-awe-category-move-actions]').hidden = stage !== 'move-ready';
    dialog.querySelector('[data-awe-action="delete-category-and-rules"]').disabled = protectedCategory;
    dialog.querySelector('[data-awe-action="delete-category-and-rules"]').title = protectedCategory ? 'Naming and General categories cannot be deleted' : '';
    dialog.querySelector('[data-awe-action="move-category-and-delete"]').hidden = protectedCategory;
    if (typeof syncCustomSelects === 'function') syncCustomSelects(dialog);
  }
  function clearCategorySelection(category) {
    selectedRulesInCategory(category).forEach(rule => state.selectedRuleIds.delete(rule.id));
    if (findRule(state.selectionAnchorRuleId)?.category === category) state.selectionAnchorRuleId = '';
  }
  function completeCategoryAction(action) {
    const operation = state.categoryAction;
    if (!operation) return;
    const { category } = operation;
    const dialog = state.root?.querySelector('[data-awe-dialog="category-action"]');
    const target = dialog?.querySelector('[data-awe-category-target]')?.value;
    const affected = state.rules.filter(rule => rule.category === category).length;
    const movesRules = action === 'move-only' || action === 'move-delete';
    const deletesCategory = action === 'delete-category' || action === 'move-delete';
    if (movesRules && (!target || target === category)) { toast('Choose another category.', 'error'); return; }
    if (deletesCategory && (category === 'General' || isNamingCategory(category))) { toast('Naming और General categories को delete नहीं किया जा सकता।', 'error'); return; }
    clearCategorySelection(category);
    if (movesRules) {
      state.rules.forEach(rule => { if (rule.category === category) { rule.category = target; rule.group = target; } });
    } else {
      state.rules = state.rules.filter(rule => rule.category !== category);
    }
    if (deletesCategory) {
      state.categories = state.categories.filter(item => item !== category);
      state.expandedCategories.delete(category);
      if (state.categoryFilter === category) state.categoryFilter = 'all';
    }
    closeDialog('category-action');
    renderAll(false);
    renderCategoryList();
    persistSoon();
    if (movesRules) toast(`${affected.toLocaleString()} rules moved${deletesCategory ? ' and category deleted' : ''}.`);
    else toast(`${affected.toLocaleString()} rules deleted${deletesCategory ? ' with the category' : ''}.`);
  }
  function downloadJSON(payload, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportCompatibleDictionary() {
    const dictionary = {};
    state.rules.forEach(rule => {
      if (!dictionary[rule.category]) dictionary[rule.category] = {};
      const current = dictionary[rule.category][rule.replace];
      const aliases = [...new Set([...(Array.isArray(current) ? current : current === undefined ? [] : [current]), ...rule.aliases])];
      dictionary[rule.category][rule.replace] = aliases.length === 1 ? aliases[0] : aliases;
    });
    downloadJSON(dictionary, `${safeFilename(document.title)}-compatible-dictionary.json`);
    toast('Compatible dictionary exported.');
  }
  function exportStudioDictionary() {
    downloadJSON({ format: 'lm-advanced-word-editing', version: 1, exportedAt: new Date().toISOString(), categories: state.categories, rules: state.rules }, `${safeFilename(document.title)}-word-editing-dictionary.json`);
    toast('Full Studio dictionary exported.');
  }
  function extractImportedDictionary(payload) {
    const imported = { rules: [], categories: [], format: 'unknown' };
    if (Array.isArray(payload) || Array.isArray(payload?.rules)) {
      const sourceRules = Array.isArray(payload) ? payload : payload.rules;
      imported.rules = sourceRules.map(normaliseRule).filter(Boolean).map((rule, index) => ({ ...rule, id: createId(), order: index }));
      imported.categories = Array.isArray(payload?.categories) ? payload.categories.filter(category => typeof category === 'string' && category.trim()).map(category => category.trim()) : [];
      imported.format = 'studio'; return imported;
    }
    if (!payload || typeof payload !== 'object') return imported;
    const entries = Object.entries(payload);
    const categoryMaps = entries.filter(([, mappings]) => mappings && typeof mappings === 'object' && !Array.isArray(mappings));
    if (categoryMaps.length) {
      categoryMaps.forEach(([category, mappings]) => {
        imported.categories.push(category);
        Object.entries(mappings).forEach(([replacement, aliases]) => {
          const rule = normaliseRule({ aliases: Array.isArray(aliases) ? aliases : [aliases], replace: replacement, category, finderMode: 'saved' }, imported.rules.length);
          if (rule) imported.rules.push(rule);
        });
      });
      imported.format = 'compatible'; return imported;
    }
    entries.forEach(([find, replace]) => {
      if (typeof replace !== 'string') return;
      const rule = normaliseRule({ aliases: [find], replace, category: 'Imported', finderMode: 'saved' }, imported.rules.length);
      if (rule) imported.rules.push(rule);
    });
    imported.categories = imported.rules.length ? ['Imported'] : [];
    imported.format = 'simple'; return imported;
  }
  async function importDictionaryFile(file) {
    try {
      const contents = await file.text();
      const imported = extractImportedDictionary(JSON.parse(contents.replace(/^\uFEFF/u, '')));
      if (!imported.rules.length) throw new Error('No valid replacement entries were found');
      let replaceExisting = false;
      if (state.rules.length > 0) {
        const decision = typeof window.requestAdvancedSettingsDecision === 'function'
          ? await window.requestAdvancedSettingsDecision({ title: 'Import replacement dictionary', message: `${imported.rules.length.toLocaleString()} rules were found in ${file.name}. Choose whether to replace the current dictionary or add them to it.`, actions: [{ value: 'cancel', label: 'Cancel' }, { value: 'add', label: 'Add to Current' }, { value: 'replace', label: 'Replace Current', tone: 'danger' }] })
          : 'add';
        if (!decision || decision === 'cancel') return;
        replaceExisting = decision === 'replace';
      }
      if (replaceExisting) state.rules = imported.rules;
      else {
        const offset = state.rules.length;
        state.rules.push(...imported.rules.map((rule, index) => ({ ...rule, id: createId(), order: offset + index })));
      }
      state.categories = [...new Set([...state.categories, ...imported.categories])];
      renderAll(true); persistSoon();
      const aliases = imported.rules.reduce((total, rule) => total + rule.aliases.length, 0);
      toast(`${imported.rules.length.toLocaleString()} rules and ${aliases.toLocaleString()} aliases imported.`);
    } catch (error) { toast(`Dictionary import failed: ${error.message}`, 'error'); }
  }
  function finderSettings(rule) {
    const mode = ['saved', 'raw', 'deep'].includes(rule.finderMode) ? rule.finderMode : 'saved';
    return { mode, foldCase: mode !== 'saved', requiresWholeWord: mode !== 'deep', acceptsTrailingHindiMatras: mode === 'raw' };
  }
  function createTrie() { return { children: new Map(), terminals: [] }; }
  function addFinderTerm(root, term, rule, priority, settings) {
    let node = root;
    for (const character of Array.from(term)) {
      const key = settings.foldCase ? character.toLocaleLowerCase() : character;
      if (!node.children.has(key)) node.children.set(key, createTrie());
      node = node.children.get(key);
    }
    node.terminals.push({ rule, priority, length: Array.from(term).length, canAbsorbTrailingHindiMatras: settings.acceptsTrailingHindiMatras && DEVANAGARI.test(term) });
  }
  function chooseMatch(first, second) {
    if (!first) return second; if (!second) return first;
    if (first.length !== second.length) return first.length > second.length ? first : second;
    return first.priority <= second.priority ? first : second;
  }
  function finderMatch(root, source, start, settings) {
    let node = root; let best = null;
    for (let position = start; position < source.length; position += 1) {
      const key = settings.foldCase ? source[position].toLocaleLowerCase() : source[position];
      node = node.children.get(key); if (!node) break;
      for (const terminal of node.terminals) {
        let endPosition = position;
        if (terminal.canAbsorbTrailingHindiMatras) while (HINDI_MATRA.test(source[endPosition + 1] || '')) endPosition += 1;
        if (settings.requiresWholeWord && (WORD_CHARACTER.test(source[start - 1] || '') || WORD_CHARACTER.test(source[endPosition + 1] || ''))) continue;
        best = chooseMatch(best, { ...terminal, start, end: endPosition + 1 });
      }
    }
    return best;
  }
  function runReplacementEngine(text, rules = state.rules) {
    const activeRules = rules.map(normaliseRule).filter(Boolean);
    if (!activeRules.length) return { text: String(text ?? ''), count: 0, matches: [] };
    const source = Array.from(String(text ?? '')); const roots = new Map();
    activeRules.forEach((rule, priority) => {
      const settings = finderSettings(rule);
      if (!roots.has(settings.mode)) roots.set(settings.mode, { settings, root: createTrie() });
      rule.aliases.forEach(alias => addFinderTerm(roots.get(settings.mode).root, alias, rule, priority, settings));
    });
    const output = []; const matches = []; let cursor = 0;
    for (let position = 0; position < source.length;) {
      let best = null;
      roots.forEach(entry => { best = chooseMatch(best, finderMatch(entry.root, source, position, entry.settings)); });
      if (!best || best.end <= position) { position += 1; continue; }
      output.push(source.slice(cursor, best.start).join(''), best.rule.replace);
      matches.push({ start: best.start, end: best.end, source: source.slice(best.start, best.end).join(''), replacement: best.rule.replace, ruleId: best.rule.id });
      cursor = best.end; position = best.end;
    }
    output.push(source.slice(cursor).join(''));
    return { text: output.join(''), count: matches.length, matches };
  }
  function syncEditorQuickAction() {
    const editorWrap = document.getElementById('editor-wrap');
    if (!editorWrap) return;
    let button = document.getElementById('aweEditorRefreshQuickBtn');
    if (!button) {
      button = document.createElement('button');
      button.id = 'aweEditorRefreshQuickBtn';
      button.className = 'awe-editor-refresh-quick-button';
      button.type = 'button';
      button.title = 'Apply Word Dictionary';
      button.setAttribute('aria-label', 'Apply Word Dictionary to editor');
      button.innerHTML = iconMarkup('refresh', 'awe-editor-refresh-quick-icon', '↻');
      button.addEventListener('click', () => applyDictionaryToEditor({ source: 'quick-action' }));
      editorWrap.appendChild(button);
    }
    button.hidden = !state.showEditorQuickAction;
  }
  function editorDockPanelState() {
    ensureCategories();
    return {
      keepEditorReplacements: state.keepEditorReplacements,
      collectUnmatchedReplacements: state.collectUnmatchedReplacements,
      unmatchedReplacementThreshold: state.unmatchedReplacementThreshold,
      minimumOccurrences: state.unmatchedReplacementThreshold,
      unmatchedCategory: state.unmatchedCategory || 'General',
      temporaryCount: state.temporaryCandidates.length,
      categories: [...state.categories]
    };
  }
  function syncEditorDockPanel() {
    const panelState = editorDockPanelState();
    const keepButton = document.getElementById('wordEditingKeepBtn');
    if (keepButton) {
      keepButton.classList.toggle('is-active', panelState.keepEditorReplacements);
      keepButton.setAttribute('aria-pressed', String(panelState.keepEditorReplacements));
      keepButton.title = panelState.keepEditorReplacements
        ? 'Stop keeping words and replacements from editor'
        : 'Keep words and replacements from editor';
      const icon = keepButton.querySelector('[data-awe-dock-keep-icon]');
      if (icon && typeof window.lmIcon === 'function') {
        icon.innerHTML = window.lmIcon(panelState.keepEditorReplacements ? 'saveFilled' : 'saveOutline');
      }
    }
    document.querySelectorAll('[data-awe-dock-temporary-count]').forEach(node => {
      node.textContent = panelState.temporaryCount.toLocaleString();
    });
    document.querySelectorAll('[data-awe-dock-collect-minimum]').forEach(node => {
      node.textContent = String(panelState.minimumOccurrences);
    });
    const collectButton = document.getElementById('wordEditingCollectSettingsBtn');
    if (collectButton) {
      collectButton.classList.toggle('is-active', panelState.collectUnmatchedReplacements);
      collectButton.classList.toggle('is-collection-off', !panelState.collectUnmatchedReplacements);
      collectButton.title = panelState.collectUnmatchedReplacements
        ? `Collect in ${panelState.unmatchedCategory} when occurrences exceed ${panelState.minimumOccurrences}`
        : `Collection off · saved threshold ${panelState.minimumOccurrences}`;
    }
    const miniToggle = document.querySelector('[data-awe-dock-collect-enabled]');
    if (miniToggle) miniToggle.checked = panelState.collectUnmatchedReplacements;
    const miniMinimum = document.querySelector('[data-awe-dock-collect-minimum-input]');
    if (miniMinimum && document.activeElement !== miniMinimum) {
      miniMinimum.value = String(panelState.minimumOccurrences);
    }
    const miniCategory = document.querySelector('[data-awe-dock-collect-category]');
    if (miniCategory) {
      const optionsKey = panelState.categories.join('\u0000');
      if (miniCategory.dataset.optionsKey !== optionsKey) {
        miniCategory.innerHTML = panelState.categories.map(category =>
          `<option value="${escapeAttribute(category)}">${escapeHTML(category)}</option>`
        ).join('');
        miniCategory.dataset.optionsKey = optionsKey;
      }
      miniCategory.value = panelState.unmatchedCategory;
    }
  }
  async function getEditorDockPanelState() {
    await restore();
    syncEditorDockPanel();
    return editorDockPanelState();
  }
  async function updateCollectSettingsFromDock(changes = {}) {
    await restore();
    ensureCategories();
    if (Object.prototype.hasOwnProperty.call(changes, 'enabled')) {
      state.collectUnmatchedReplacements = Boolean(changes.enabled);
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'minimumOccurrences')) {
      const minimum = Math.min(10000, Math.max(1, Math.floor(Number(changes.minimumOccurrences) || 3)));
      state.unmatchedReplacementThreshold = minimum;
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'category')) {
      const category = String(changes.category || '').trim();
      state.unmatchedCategory = state.categories.includes(category) ? category : 'General';
    }
    refreshTemporaryCandidates();
    renderWorkspaceView();
    syncEditorDockPanel();
    persistSoon();
    return editorDockPanelState();
  }
  async function setKeepEditorReplacementsFromDock(enabled) {
    await restore();
    state.keepEditorReplacements = Boolean(enabled);
    const advancedToggle = state.root?.querySelector('[data-awe-setting="keep-editor-replacements"]');
    if (advancedToggle) advancedToggle.checked = state.keepEditorReplacements;
    syncEditorDockPanel();
    persistSoon();
    return editorDockPanelState();
  }
  async function toggleKeepEditorReplacementsFromDock() {
    await restore();
    return setKeepEditorReplacementsFromDock(!state.keepEditorReplacements);
  }
  async function openEditorControlsFromDock(openTemporary = false) {
    await restore();
    state.activeView = 'editor';
    if (typeof window.openAdvancedEditorSettings === 'function') window.openAdvancedEditorSettings();
    if (typeof window.selectAdvancedEditorTopSection === 'function') {
      window.selectAdvancedEditorTopSection('advanced-word-editing');
    }
    renderWorkspaceView();
    if (openTemporary) window.requestAnimationFrame(() => {
      renderTemporaryCandidates();
      openDialog('temporary-candidates');
    });
  }
  function ensureStandaloneTemporaryCandidatesDialog() {
    let backdrop = document.getElementById('aweStandaloneTemporaryCandidates');
    if (backdrop) return backdrop;
    backdrop = document.createElement('div');
    backdrop.id = 'aweStandaloneTemporaryCandidates';
    backdrop.className = 'awe-dialog-backdrop awe-standalone-temporary-backdrop';
    backdrop.dataset.aweDialog = 'temporary-candidates-standalone';
    backdrop.hidden = true;
    backdrop.innerHTML = `<section class="awe-dialog awe-temporary-candidates-panel" role="dialog" aria-modal="true" aria-labelledby="aweStandaloneTemporaryCandidatesTitle"><header data-awe-temporary-drag-handle><div><h4 id="aweStandaloneTemporaryCandidatesTitle">Temporary Names <b data-awe-temporary-count>0</b></h4></div><button class="awe-name-panel-close" type="button" data-awe-action="close-temporary-candidates-standalone" aria-label="Close">${iconMarkup('close', 'awe-name-panel-close-icon')}</button></header><p>These replacements exceeded your occurrence limit but their Replace value did not match a Naming category.</p><div class="awe-temporary-empty" data-awe-temporary-empty>No temporary replacement candidates yet.</div><div class="awe-temporary-list" data-awe-temporary-list></div><div class="awe-temporary-height-resize-handle" data-awe-temporary-resize-handle role="separator" aria-orientation="horizontal" aria-label="Resize Temporary Names panel height"></div></section>`;
    backdrop.addEventListener('click', event => {
      const action = event.target.closest('[data-awe-action]')?.dataset.aweAction;
      if (event.target === backdrop || action === 'close-temporary-candidates-standalone') {
        endTemporaryPanelPointerAction();
        backdrop.hidden = true;
        return;
      }
      handleClick(event);
    });
    backdrop.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      endTemporaryPanelPointerAction();
      backdrop.hidden = true;
    });
    backdrop.querySelector('[data-awe-temporary-resize-handle]')?.addEventListener('dblclick', event => {
      const panel = backdrop.querySelector('.awe-temporary-candidates-panel');
      if (!panel) return;
      delete panel.dataset.aweUserSized;
      fitStandaloneTemporaryPanelToCandidates(panel);
      saveTemporaryPanelGeometry(panel);
      event.preventDefault();
    });
    backdrop.addEventListener('pointerdown', beginTemporaryPanelPointerAction);
    backdrop.addEventListener('pointermove', moveTemporaryPanelPointerAction);
    backdrop.addEventListener('pointerup', endTemporaryPanelPointerAction);
    backdrop.addEventListener('pointercancel', endTemporaryPanelPointerAction);
    document.body.appendChild(backdrop);
    return backdrop;
  }
  async function openTemporaryCandidatesFromDock() {
    await restore();
    const backdrop = ensureStandaloneTemporaryCandidatesDialog();
    renderTemporaryCandidates();
    backdrop.hidden = false;
    window.requestAnimationFrame(() => {
      const panel = backdrop.querySelector('.awe-temporary-candidates-panel');
      restoreStandaloneTemporaryPanelGeometry(panel);
      backdrop.querySelector('button')?.focus();
    });
  }
  function applyDictionaryToHTMLString(htmlString) {
    if (!htmlString || typeof htmlString !== 'string') return { html: htmlString, count: 0 };
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${htmlString}</body>`, 'text/html');
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    let count = 0;
    textNodes.forEach(node => {
      const res = runReplacementEngine(node.nodeValue || '');
      if (res.count > 0) {
        node.nodeValue = res.text;
        count += res.count;
      }
    });
    return { html: doc.body.innerHTML, count };
  }
  async function applyDictionaryToAllDrafts(options = {}) {
    await restore();
    if (!state.rules.length) {
      toast('The replacement dictionary is empty.', 'error');
      return { count: 0, changed: false };
    }
    let totalReplacements = 0;
    // 1. Process in-memory chapterDrafts
    if (typeof chapterDrafts !== 'undefined' && Array.isArray(chapterDrafts)) {
      chapterDrafts.forEach(draft => {
        if (draft && typeof draft.content === 'string') {
          const res = applyDictionaryToHTMLString(draft.content);
          if (res.count > 0) {
            draft.content = res.html;
            totalReplacements += res.count;
          }
        }
      });
    }
    // 2. Process in-memory chapters
    if (typeof chapters !== 'undefined' && Array.isArray(chapters)) {
      chapters.forEach(chapter => {
        if (chapter && typeof chapter.content === 'string') {
          const res = applyDictionaryToHTMLString(chapter.content);
          if (res.count > 0) {
            chapter.content = res.html;
            totalReplacements += res.count;
          }
        }
      });
    }
    // 3. Process in-memory chapterEditDrafts
    if (typeof chapterEditDrafts !== 'undefined' && chapterEditDrafts && typeof chapterEditDrafts === 'object') {
      Object.values(chapterEditDrafts).forEach(draft => {
        if (draft && typeof draft.content === 'string') {
          const res = applyDictionaryToHTMLString(draft.content);
          if (res.count > 0) {
            draft.content = res.html;
            totalReplacements += res.count;
          }
        }
      });
    }
    // 4. Process active editor DOM if currently visible
    const editor = document.getElementById('editor');
    if (editor) {
      if (typeof clearHighlights === 'function') clearHighlights({ sync: false });
      if (typeof captureEditorHistorySnapshot === 'function') captureEditorHistorySnapshot('advanced-word-editing-all-drafts-before', { force: true });
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      let editorCount = 0;
      textNodes.forEach(node => {
        const res = runReplacementEngine(node.nodeValue || '');
        if (res.count > 0) {
          node.nodeValue = res.text;
          editorCount += res.count;
        }
      });
      if (editorCount > 0) {
        editor.normalize();
        if (typeof syncEditorPlaceholderState === 'function') syncEditorPlaceholderState();
        if (typeof stageEditorHTMLForMemoryCommit === 'function') {
          stageEditorHTMLForMemoryCommit();
          if (typeof scheduleSaveButtonTypingIdleCheck === 'function') scheduleSaveButtonTypingIdleCheck();
          if (typeof updateStats === 'function') updateStats({ sourceHTML: typeof getCleanEditorHTML === 'function' ? getCleanEditorHTML() : editor.innerHTML, deferMemoryCommit: true });
        } else {
          editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
        }
        if (typeof captureEditorHistorySnapshot === 'function') captureEditorHistorySnapshot('advanced-word-editing-all-drafts-after', { force: true });
      }
    }
    // 5. Persist updated drafts & project manifest to storage & disk
    if (typeof saveToStorage === 'function') saveToStorage(true);
    if (typeof hasActiveStory === 'function' && hasActiveStory() && typeof projectDirectoryHandle !== 'undefined' && projectDirectoryHandle) {
      try {
        await Promise.all([
          typeof writeDraftsDataToProject === 'function' ? writeDraftsDataToProject() : Promise.resolve(),
          typeof writeChapterEditDraftsToProject === 'function' ? writeChapterEditDraftsToProject() : Promise.resolve()
        ]);
      } catch (err) {
        console.error('Failed to write updated draft files:', err);
      }
    }
    if (totalReplacements > 0) {
      toast(`${totalReplacements.toLocaleString()} dictionary replacement${totalReplacements === 1 ? '' : 's'} applied across all project drafts.`);
    } else {
      toast('No dictionary replacements were found in any project draft.');
    }
    window.dispatchEvent(new CustomEvent('lm:advanced-word-editing-all-drafts-applied', { detail: { count: totalReplacements, source: options.source || 'settings' } }));
    return { count: totalReplacements, changed: totalReplacements > 0 };
  }
  async function applyDictionaryToEditor(options = {}) {
    await restore();
    if (typeof canEditActiveDocument === 'function' && !canEditActiveDocument()) {
      toast('Open an editable draft or chapter before applying the dictionary.', 'error');
      return { count: 0, changed: false };
    }
    if (!state.rules.length) {
      toast('The replacement dictionary is empty.', 'error');
      return { count: 0, changed: false };
    }
    const editor = document.getElementById('editor');
    if (!editor) return { count: 0, changed: false };
    if (typeof temporarilyMaterializeVirtualEditor === 'function') {
      await temporarilyMaterializeVirtualEditor('advanced-word-editing');
    }
    if (typeof clearHighlights === 'function') clearHighlights({ sync: false });
    if (typeof captureEditorHistorySnapshot === 'function') captureEditorHistorySnapshot('advanced-word-editing-before', { force: true });
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    let replacementCount = 0;
    textNodes.forEach(node => {
      const result = runReplacementEngine(node.nodeValue || '');
      if (!result.count) return;
      node.nodeValue = result.text;
      replacementCount += result.count;
    });
    if (!replacementCount) {
      toast('No dictionary replacements were found in the active editor.');
      return { count: 0, changed: false };
    }
    editor.normalize();
    if (typeof syncEditorPlaceholderState === 'function') syncEditorPlaceholderState();
    if (typeof stageEditorHTMLForMemoryCommit === 'function') {
      stageEditorHTMLForMemoryCommit();
      if (typeof scheduleSaveButtonTypingIdleCheck === 'function') scheduleSaveButtonTypingIdleCheck();
      if (typeof updateStats === 'function') updateStats({ sourceHTML: typeof getCleanEditorHTML === 'function' ? getCleanEditorHTML() : editor.innerHTML, deferMemoryCommit: true });
    } else {
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
    }
    if (typeof captureEditorHistorySnapshot === 'function') captureEditorHistorySnapshot('advanced-word-editing-after', { force: true });
    toast(`${replacementCount.toLocaleString()} dictionary replacement${replacementCount === 1 ? '' : 's'} applied.`);
    window.dispatchEvent(new CustomEvent('lm:advanced-word-editing-editor-applied', { detail: { count: replacementCount, source: options.source || 'settings' } }));
    return { count: replacementCount, changed: true };
  }
  function namingEntryForReplacementWord(replacement) {
    try {
      if (typeof namingData === 'undefined' || !Array.isArray(namingData?.entries)) return null;
      const identity = replacementIdentity(replacement);
      return namingData.entries.find(entry => {
        const names = typeof namingEntrySearchNames === 'function'
          ? namingEntrySearchNames(entry)
          : [entry?.name, ...(Array.isArray(entry?.similarNames) ? entry.similarNames : [])];
        return names.some(name => replacementIdentity(name) === identity);
      }) || null;
    } catch { return null; }
  }
  function namingCategoryTitle(categoryId) {
    try {
      if (typeof namingData === 'undefined') return '';
      return String(namingData?.categories?.find(category => category.id === categoryId)?.title || '').trim();
    } catch { return ''; }
  }
  function unmatchedObservationKey(source, replacement) {
    return `${replacementIdentity(replacement)}\u0000${replacementIdentity(source)}`;
  }
  function refreshTemporaryCandidates() {
    state.temporaryCandidates = [...state.unmatchedObservations.values()]
      .sort((first, second) => second.count - first.count || second.lastSeen - first.lastSeen);
    renderTemporaryCandidates();
  }
  function recordUnmatchedReplacement(source, replacement, count) {
    const safeCount = Math.max(1, Math.floor(Number(count) || 1));
    const key = unmatchedObservationKey(source, replacement);
    const existing = state.unmatchedObservations.get(key);
    const candidate = existing || {
      id: createId(), source, replacement, count: 0, firstSeen: Date.now(), lastSeen: Date.now()
    };
    candidate.count += safeCount;
    candidate.lastSeen = Date.now();
    state.unmatchedObservations.set(key, candidate);
    if (state.collectUnmatchedReplacements && candidate.count > state.unmatchedReplacementThreshold) {
      const category = state.unmatchedCategory || 'General';
      let rule = state.rules.find(item => replacementIdentity(item.replace) === replacementIdentity(replacement));
      let changed = false;
      if (!rule) {
        rule = normaliseRule({ aliases: [source], replace: replacement, category, finderMode: 'saved', order: state.rules.length }, state.rules.length);
        if (rule) { state.rules.push(rule); changed = true; }
      } else if (!rule.aliases.some(alias => replacementIdentity(alias) === replacementIdentity(source))) {
        rule.aliases.push(source);
        rule.find = rule.aliases[0];
        changed = true;
      }
      state.unmatchedObservations.delete(key);
      refreshTemporaryCandidates();
      if (changed) {
        ensureCategories();
        renderAll(false);
        persistSoon();
        toast(`"${source} → ${replacement}" auto-added to "${category}" category.`);
      }
    } else {
      refreshTemporaryCandidates();
    }
    return candidate;
  }
  function renderTemporaryCandidates() {
    const count = state.temporaryCandidates.length;
    document.querySelectorAll('[data-awe-temporary-count]').forEach(node => {
      node.textContent = count.toLocaleString();
    });
    const confirmIcon = iconMarkup('temporaryCandidateConfirm', 'awe-temporary-action-icon', '✓');
    const dismissIcon = iconMarkup('close', 'awe-temporary-action-icon');
    const categoryOptions = state.categories.map(category =>
      `<option value="${escapeAttribute(category)}">${escapeHTML(category)}</option>`
    ).join('');
    const rows = state.temporaryCandidates.map(candidate => {
      const preferredCategory = state.categories.includes(candidate.selectedCategory)
        ? candidate.selectedCategory
        : (state.categories.includes(state.unmatchedCategory) ? state.unmatchedCategory : 'General');
      const selectedOptions = categoryOptions.replace(`value="${escapeAttribute(preferredCategory)}"`, `value="${escapeAttribute(preferredCategory)}" selected`);
      return `
      <div class="awe-temporary-candidate-row" data-awe-temporary-candidate-id="${escapeAttribute(candidate.id)}">
        <div class="awe-temporary-candidate-copy">
          <strong title="${escapeAttribute(candidate.replacement)}">${escapeHTML(candidate.replacement)}</strong>
          <span class="awe-temporary-target-arrow" aria-hidden="true">←</span>
          <span class="awe-temporary-source-word" title="${escapeAttribute(candidate.source)}">${escapeHTML(candidate.source)}</span>
          <small title="${candidate.count.toLocaleString()} replacements observed">${candidate.count.toLocaleString()}</small>
        </div>
        <div class="awe-temporary-candidate-actions">
          <label class="awe-temporary-category-field"><select data-awe-temporary-category aria-label="Category for ${escapeAttribute(candidate.replacement)}">${selectedOptions}</select></label>
          <button class="awe-temporary-confirm-button" type="button" data-awe-action="save-temporary-candidate" data-candidate-id="${escapeAttribute(candidate.id)}" title="Add to selected category" aria-label="Add ${escapeAttribute(candidate.replacement)} to selected category">${confirmIcon}</button>
          <button class="awe-temporary-dismiss-button" type="button" data-awe-action="dismiss-temporary-candidate" data-candidate-id="${escapeAttribute(candidate.id)}" title="Remove temporary candidate" aria-label="Remove ${escapeAttribute(candidate.replacement)} from Temporary Names">${dismissIcon}</button>
        </div>
      </div>`;
    }).join('');
    document.querySelectorAll('[data-awe-dialog="temporary-candidates"], [data-awe-dialog="temporary-candidates-standalone"]').forEach(dialog => {
      const empty = dialog.querySelector('[data-awe-temporary-empty]');
      const list = dialog.querySelector('[data-awe-temporary-list]');
      if (empty) empty.hidden = count > 0;
      if (list) list.innerHTML = rows;
      if (typeof syncCustomSelects === 'function') syncCustomSelects(dialog);
      if (dialog.dataset.aweDialog === 'temporary-candidates-standalone' && !dialog.hidden) {
        window.requestAnimationFrame(() => {
          const panel = dialog.querySelector('.awe-temporary-candidates-panel');
          reconcileStandaloneTemporaryPanelHeight(panel);
        });
      }
    });
    syncEditorDockPanel();
  }
  function saveTemporaryCandidate(candidateId, selectedCategory = '') {
    const candidate = state.temporaryCandidates.find(item => item.id === candidateId);
    if (!candidate) return;
    const useCollectedCategory = state.collectUnmatchedReplacements &&
      candidate.count > state.unmatchedReplacementThreshold;
    const requestedCategory = String(selectedCategory || '').trim();
    const fallbackCategory = useCollectedCategory ? (state.unmatchedCategory || 'General') : 'General';
    const category = state.categories.includes(requestedCategory) ? requestedCategory : fallbackCategory;
    let rule = state.rules.find(item => replacementIdentity(item.replace) === replacementIdentity(candidate.replacement));
    let changed = false;
    if (!rule) {
      rule = normaliseRule({ aliases: [candidate.source], replace: candidate.replacement, category, finderMode: 'saved', order: state.rules.length }, state.rules.length);
      if (rule) { state.rules.push(rule); changed = true; }
    } else if (!rule.aliases.some(alias => replacementIdentity(alias) === replacementIdentity(candidate.source))) {
      rule.aliases.push(candidate.source);
      rule.find = rule.aliases[0];
      changed = true;
    }
    if (rule && rule.category !== category) {
      rule.category = category;
      changed = true;
    }
    state.unmatchedObservations.delete(unmatchedObservationKey(candidate.source, candidate.replacement));
    refreshTemporaryCandidates();
    if (changed) {
      ensureCategories();
      renderAll(false);
      persistSoon();
      toast(`Temporary replacement added to "${category}".`);
    } else {
      toast('This replacement is already present in the main dictionary.');
    }
  }
  function dismissTemporaryCandidate(candidateId) {
    const candidate = state.temporaryCandidates.find(item => item.id === candidateId);
    if (!candidate) return;
    state.unmatchedObservations.delete(unmatchedObservationKey(candidate.source, candidate.replacement));
    refreshTemporaryCandidates();
    toast('Temporary candidate removed.');
  }
  async function learnFromEditorReplacement({ source, replacement, count = 1 } = {}) {
    await restore();
    if (!count) return { learned: false, reason: 'empty' };
    const sourceWord = String(source || '').trim();
    const replacementWord = String(replacement || '').trim();
    if (!REPLACEMENT_WORD.test(sourceWord) || !REPLACEMENT_WORD.test(replacementWord) || replacementIdentity(sourceWord) === replacementIdentity(replacementWord)) {
      return { learned: false, reason: 'invalid' };
    }
    if (!state.keepEditorReplacements) return { learned: false, reason: 'disabled' };
    if (!state.collectUnmatchedReplacements) {
      const candidate = recordUnmatchedReplacement(sourceWord, replacementWord, count);
      return { learned: false, reason: 'temporary-collection', candidate };
    }
    // The replacement is the canonical Naming entry. The Find value is saved
    // as an alias/source that should be replaced with that canonical word.
    const namingEntry = namingEntryForReplacementWord(replacementWord);
    if (!namingEntry) {
      const candidate = recordUnmatchedReplacement(sourceWord, replacementWord, count);
      return { learned: false, reason: 'not-a-naming-entry', candidate };
    }
    const category = namingCategoryTitle(namingEntry.categoryId) || 'General';
    let rule = state.rules.find(item => replacementIdentity(item.replace) === replacementIdentity(replacementWord));
    let learned = false;
    if (!rule) {
      rule = normaliseRule({ aliases: [sourceWord], replace: replacementWord, category, finderMode: 'saved', order: state.rules.length }, state.rules.length);
      if (!rule) return { learned: false, reason: 'invalid-rule' };
      state.rules.push(rule);
      learned = true;
    } else {
      if (!rule.aliases.some(alias => replacementIdentity(alias) === replacementIdentity(sourceWord))) {
        rule.aliases.push(sourceWord);
        rule.find = rule.aliases[0];
        learned = true;
      }
      if (rule.category !== category) {
        rule.category = category;
        rule.group = category;
        learned = true;
      }
    }
    if (!learned) return { learned: false, reason: 'already-known' };
    ensureCategories();
    if (state.root?.isConnected) renderAll(false);
    persistSoon();
    window.dispatchEvent(new CustomEvent('lm:advanced-word-editing-learned', { detail: { ruleId: rule.id, source: sourceWord, replacement: replacementWord, category } }));
    return { learned: true, rule: { ...rule, aliases: [...rule.aliases] } };
  }
  function handleClick(event) {
    const trigger = event.target.closest('[data-awe-action]');
    const isStandaloneTemporaryAction = Boolean(
      trigger?.closest('[data-awe-dialog="temporary-candidates-standalone"]')
    );
    const exportPanel = state.root?.querySelector('[data-awe-export-panel]');
    if (exportPanel && !event.target.closest('.awe-export-wrap')) exportPanel.hidden = true;
    const backdrop = event.target.matches?.('[data-awe-dialog]') ? event.target : null;
    if (backdrop) {
      closeDialog(backdrop.dataset.aweDialog);
      return;
    }
    if (trigger?.dataset.aweAction === 'select-view') {
      state.activeView = trigger.dataset.view === 'editor' ? 'editor' : 'dictionary';
      renderWorkspaceView();
      persistSoon();
      return;
    }
    if (!trigger || (!state.root?.contains(trigger) && !isStandaloneTemporaryAction)) {
      const row = event.target.closest('[data-awe-rule-id]');
      if (row && state.root?.contains(row)) selectRuleRow(row, event);
      else if (event.target.closest('[data-awe-category-workspace]')) clearRuleSelection();
      return;
    }
    const action = trigger.dataset.aweAction;
    if (action === 'apply-all-drafts-dictionary') applyDictionaryToAllDrafts({ source: 'settings' });
    else if (action === 'apply-editor-dictionary') applyDictionaryToEditor({ source: 'settings' });
    else if (action === 'open-temporary-candidates') { renderTemporaryCandidates(); openDialog('temporary-candidates'); }
    else if (action === 'close-temporary-candidates') closeDialog('temporary-candidates');
    else if (action === 'save-temporary-candidate') {
      const row = trigger.closest('.awe-temporary-candidate-row');
      const category = row?.querySelector('[data-awe-temporary-category]')?.value || '';
      saveTemporaryCandidate(trigger.dataset.candidateId, category);
    }
    else if (action === 'dismiss-temporary-candidate') dismissTemporaryCandidate(trigger.dataset.candidateId);
    else if (action === 'new-rule') openRuleDialog();
    else if (action === 'new-rule-in-category') openRuleDialog(null, trigger.dataset.category);
    else if (action === 'toggle-category') {
      const category = trigger.dataset.category;
      if (state.expandedCategories.has(category)) {
        state.expandedCategories.delete(category);
        selectedRulesInCategory(category).forEach(rule => state.selectedRuleIds.delete(rule.id));
        if (findRule(state.selectionAnchorRuleId)?.category === category) state.selectionAnchorRuleId = '';
      }
      else state.expandedCategories.add(category);
      renderRules(false);
    }
    else if (action === 'toggle-sort') {
      const panel = state.root.querySelector('[data-awe-sort-panel]');
      if (panel) panel.hidden = !panel.hidden;
    }
    else if (action === 'set-sort') {
      state.sortMode = trigger.dataset.sort;
      const panel = state.root.querySelector('[data-awe-sort-panel]');
      if (panel) panel.hidden = true;
      state.root.querySelectorAll('[data-awe-action="set-sort"]').forEach(button => button.classList.toggle('is-active', button.dataset.sort === state.sortMode));
      renderRules(true); persistSoon();
    }
    else if (action === 'toggle-custom-first') {
      state.customCategoriesFirst = !state.customCategoriesFirst;
      trigger.classList.toggle('is-active', state.customCategoriesFirst);
      renderRules(true);
      persistSoon();
    }
    else if (action === 'step-unmatched-threshold') {
      const input = state.root.querySelector('[data-awe-unmatched-threshold]');
      if (!input) return;
      const direction = Number(trigger.dataset.direction) || 0;
      input.value = String(Math.min(10000, Math.max(1, Math.floor(Number(input.value) || 3) + direction)));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    else if (action === 'toggle-export') {
      const panel = state.root.querySelector('[data-awe-export-panel]');
      if (panel) panel.hidden = !panel.hidden;
    }
    else if (action === 'edit-rule') openRuleDialog(findRule(trigger.dataset.ruleId));
    else if (action === 'close-rule') closeDialog('rule');
    else if (action === 'delete-rule') {
      const id = state.root?.querySelector('[data-awe-rule-form]')?.elements.ruleId.value;
      requestRuleDeletion([id]);
    }
    else if (action === 'request-delete-rule') requestRuleDeletion([trigger.dataset.ruleId]);
    else if (action === 'request-delete-selected') requestRuleDeletion(selectedRulesInCategory(trigger.dataset.category).map(rule => rule.id));
    else if (action === 'close-delete-rule') closeDialog('delete-rule');
    else if (action === 'confirm-delete-rule') confirmRuleDeletion();
    else if (action === 'open-source-word') setSourceWordInputOpen(true);
    else if (action === 'remove-source-word') {
      state.draftAliases.splice(Number(trigger.dataset.aliasIndex), 1);
      renderDraftAliases();
    }
    else if (action === 'open-categories') {
      state.editingCategory = '';
      state.categoryFormOpen = false;
      renderCategoryList();
      syncCategoryFooter();
      openDialog('categories');
    }
    else if (action === 'close-categories') closeDialog('categories');
    else if (action === 'show-category-form') {
      state.categoryFormOpen = true;
      syncCategoryFooter();
    }
    else if (action === 'rename-category') renameCategory(trigger.dataset.category);
    else if (action === 'manage-category') openCategoryAction(trigger.dataset.category);
    else if (action === 'close-category-action') closeDialog('category-action');
    else if (action === 'start-category-move') {
      if (!state.categoryAction) return;
      state.categoryAction.stage = 'move-select';
      renderCategoryActionDialog();
      const select = state.root?.querySelector('[data-awe-category-target]');
      window.requestAnimationFrame(() => {
        if (typeof syncCustomSelect === 'function' && select) syncCustomSelect(select);
        select?.nextElementSibling?.querySelector('.lm-custom-select-trigger')?.focus();
      });
    }
    else if (action === 'cancel-category-move') {
      if (!state.categoryAction) return;
      state.categoryAction.stage = 'choices';
      renderCategoryActionDialog();
    }
    else if (action === 'clear-category-rules') completeCategoryAction('clear');
    else if (action === 'delete-category-and-rules') completeCategoryAction('delete-category');
    else if (action === 'move-category-only') completeCategoryAction('move-only');
    else if (action === 'move-category-and-delete') completeCategoryAction('move-delete');
    else if (action === 'clear-search') { state.search = ''; state.root.querySelector('[data-awe-search]').value = ''; renderRules(true); persistSoon(); }
    else if (action === 'import') state.root.querySelector('[data-awe-file-input]').click();
    else if (action === 'export-compatible') { state.root.querySelector('[data-awe-export-panel]').hidden = true; exportCompatibleDictionary(); }
    else if (action === 'export-studio') { state.root.querySelector('[data-awe-export-panel]').hidden = true; exportStudioDictionary(); }
    else if (action === 'clear-rules' && state.rules.length) openDialog('clear-rules');
    else if (action === 'cancel-clear-rules') closeDialog('clear-rules');
    else if (action === 'confirm-clear-rules') {
      state.rules = [];
      state.categories = ['General'];
      state.categoryFilter = 'all';
      state.expandedCategories.clear();
      state.selectedRuleIds.clear();
      state.selectionAnchorRuleId = '';
      closeDialog('clear-rules');
      renderAll(true);
      persistSoon();
      toast('Replacement dictionary cleared.');
    }
  }
  function bind(root) {
    if (root.dataset.aweBound === 'true') return;
    root.dataset.aweBound = 'true';
    state.aliasResizeObserver?.disconnect?.();
    state.aliasResizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleRuleAliasFit) : null;
    state.aliasResizeObserver?.observe(root.querySelector('[data-awe-category-workspace]') || root);
    if (state.outsideClickHandler) document.removeEventListener('pointerdown', state.outsideClickHandler);
    state.outsideClickHandler = event => {
      if (!state.root?.isConnected) return;
      if (!event.target.closest?.('.awe-sort-wrap')) {
        const sortPanel = state.root.querySelector('[data-awe-sort-panel]');
        if (sortPanel) sortPanel.hidden = true;
      }
      if (state.editingCategory && !event.target.closest?.('[data-awe-category-rename-form]')) {
        const editing = state.editingCategory;
        window.setTimeout(() => {
          if (state.editingCategory !== editing) return;
          state.editingCategory = '';
          renderCategoryList();
        }, 0);
      }
    };
    document.addEventListener('pointerdown', state.outsideClickHandler);
    root.addEventListener('click', handleClick);
    const workspaceSwitcher = root.previousElementSibling?.matches?.('.awe-workspace-switcher')
      ? root.previousElementSibling
      : root.parentElement?.querySelector?.('.awe-workspace-switcher');
    if (workspaceSwitcher && workspaceSwitcher.dataset.aweBound !== 'true') {
      workspaceSwitcher.dataset.aweBound = 'true';
      workspaceSwitcher.addEventListener('click', handleClick);
    }
    root.addEventListener('pointerdown', beginRuleDialogDrag);
    root.addEventListener('pointermove', moveRuleDialog);
    root.addEventListener('pointerup', endRuleDialogDrag);
    root.addEventListener('pointercancel', endRuleDialogDrag);
    root.querySelector('[data-awe-rule-form]')?.addEventListener('submit', saveRule);
    root.querySelector('[data-awe-category-form]')?.addEventListener('submit', addCategory);
    root.addEventListener('submit', event => {
      if (event.target.matches('[data-awe-category-rename-form]')) saveCategoryRename(event);
    });
    root.addEventListener('input', event => {
      if (event.target.matches('[name="replacement"]')) {
        event.target.classList.remove('is-invalid');
        event.target.removeAttribute('aria-invalid');
      }
      if (!event.target.matches('[data-awe-search]')) return;
      state.search = event.target.value; renderRules(true); persistSoon();
    });
    root.addEventListener('change', event => {
      if (event.target.matches('[data-awe-setting="keep-editor-replacements"]')) {
        state.keepEditorReplacements = event.target.checked;
        syncEditorDockPanel();
        persistSoon();
      }
      else if (event.target.matches('[data-awe-setting="show-editor-quick-action"]')) {
        state.showEditorQuickAction = event.target.checked;
        syncEditorQuickAction();
        persistSoon();
      }
      else if (event.target.matches('[data-awe-setting="collect-unmatched-replacements"]')) {
        state.collectUnmatchedReplacements = event.target.checked;
        refreshTemporaryCandidates();
        renderWorkspaceView();
        syncEditorDockPanel();
        persistSoon();
      }
      else if (event.target.matches('[data-awe-unmatched-threshold]')) {
        state.unmatchedReplacementThreshold = Math.min(10000, Math.max(1, Math.floor(Number(event.target.value) || 3)));
        event.target.value = String(state.unmatchedReplacementThreshold);
        refreshTemporaryCandidates();
        syncEditorDockPanel();
        persistSoon();
      }
      else if (event.target.matches('[data-awe-unmatched-category]')) {
        state.unmatchedCategory = event.target.value || 'General';
        syncEditorDockPanel();
        persistSoon();
      }
      else if (event.target.matches('[data-awe-category-target]')) {
        if (!state.categoryAction || !event.target.value) return;
        state.categoryAction.stage = 'move-ready';
        renderCategoryActionDialog();
      }
      else if (event.target.matches('[data-awe-finder-mode]')) syncFinderHelp();
      else if (event.target.matches('[name="replacement"]')) adoptExistingReplacementRule();
      else if (event.target.matches('[data-awe-file-input]')) { const file = event.target.files?.[0]; event.target.value = ''; if (file) importDictionaryFile(file); }
    });
    root.addEventListener('focusout', event => {
      if (event.target.matches('[data-awe-category-form] input')) {
        const form = event.target.closest('[data-awe-category-form]');
        window.setTimeout(() => {
          if (!state.categoryFormOpen || form?.contains(document.activeElement)) return;
          state.categoryFormOpen = false;
          syncCategoryFooter();
        }, 0);
        return;
      }
      if (!event.target.matches('[data-awe-source-word-input]')) return;
      window.setTimeout(() => {
        if (document.activeElement?.matches?.('[data-awe-action="open-source-word"]')) return;
        commitSourceWordInput();
      }, 0);
    });
    root.addEventListener('scroll', event => {
      if (!event.target.matches?.('[data-awe-category-list]')) return;
      event.target.classList.add('is-scrolling');
      window.clearTimeout(state.categoryScrollTimer);
      state.categoryScrollTimer = window.setTimeout(() => event.target.classList.remove('is-scrolling'), 420);
    }, true);
    root.addEventListener('keydown', event => {
      const openDialogs = [...root.querySelectorAll('[data-awe-dialog]:not([hidden])')];
      const openDialogElement = openDialogs[openDialogs.length - 1];
      if (event.key === 'Escape' && state.editingCategory) {
        event.preventDefault();
        state.editingCategory = '';
        renderCategoryList();
        return;
      }
      if (event.key === 'Escape' && openDialogElement) { event.preventDefault(); event.stopPropagation(); closeDialog(openDialogElement.dataset.aweDialog); return; }
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.awe-rule-row')) { event.preventDefault(); selectRuleRow(event.target, event); return; }
      if (event.target.matches('[data-awe-source-word-input]') && event.key === 'Enter') {
        event.preventDefault();
        commitSourceWordInput({ keepOpen: true });
        return;
      }
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'n') { event.preventDefault(); openRuleDialog(); }
      else if (modifier && event.altKey && event.key.toLowerCase() === 'f') { event.preventDefault(); root.querySelector('[data-awe-search]')?.focus(); }
    });
  }
  function markup() {
    const searchIcon = iconMarkup('search', 'awe-search-icon', '⌕');
    const clearSearchIcon = iconMarkup('close', 'awe-search-clear-icon');
    const sortIcon = iconMarkup('sortDirectionBars', 'awe-sort-icon', '≡');
    const customFirstIcon = iconMarkup('moveup', 'awe-custom-first-icon', '↑');
    const importIcon = iconMarkup('import', 'awe-import-icon', '⇩');
    const closeIcon = iconMarkup('close', 'awe-category-close-icon');
    const panelCloseIcon = iconMarkup('close', 'awe-name-panel-close-icon');
    return `<div class="awe-workspace-switcher" role="tablist" aria-label="Advanced word editing workspace"><button type="button" role="tab" data-awe-action="select-view" data-view="editor" data-awe-view-tab="editor" aria-selected="false">Work on Editor</button><button type="button" role="tab" data-awe-action="select-view" data-view="dictionary" data-awe-view-tab="dictionary" aria-selected="true">Words Dictionary</button></div>
    <div class="awe-workspace" data-awe-root>
      <section class="awe-work-editor-panel" data-awe-editor-settings hidden>
        <div class="awe-editor-setting-row"><span><strong>Keep words and replacements from editor</strong><small>When enabled, replaced words from editor are remembered and processed based on occurrence limits.</small></span><div class="awe-unmatched-controls"><button type="button" data-awe-action="open-temporary-candidates">Temporary Names <b data-awe-temporary-count>0</b></button><label class="awe-setting-switch"><input type="checkbox" data-awe-setting="keep-editor-replacements"><i aria-hidden="true"></i><span class="sr-only">Keep words and replacements from editor</span></label></div></div>
        <div class="awe-editor-setting-row awe-unmatched-setting-row"><span><strong>Collect in Category</strong><small>Off keeps every unmatched replacement in Temporary Names. On moves entries above the chosen count into the selected category.</small></span><div class="awe-unmatched-controls"><label class="awe-threshold-field"><span>More than</span><span class="awe-threshold-stepper advanced-number-stepper dock-fsize-control"><input class="dock-fsize-inp advanced-number-input" type="number" min="1" max="10000" step="1" inputmode="numeric" data-awe-unmatched-threshold aria-label="Unmatched replacement occurrence limit"><span class="dock-fsize-stepper"><button class="dock-fsize-step" type="button" data-awe-action="step-unmatched-threshold" data-direction="1" aria-label="Increase threshold">${iconMarkup('collapseChevron', 'step-chevron-svg lm-chevron-up')}</button><button class="dock-fsize-step" type="button" data-awe-action="step-unmatched-threshold" data-direction="-1" aria-label="Decrease threshold">${iconMarkup('collapseChevron', 'step-chevron-svg lm-chevron-down')}</button></span></span></label><label class="awe-threshold-field awe-unmatched-category-field"><select data-awe-unmatched-category title="Category for words exceeding occurrence limit"></select></label><label class="awe-setting-switch"><input type="checkbox" data-awe-setting="collect-unmatched-replacements"><i aria-hidden="true"></i><span class="sr-only">Collect in Category</span></label></div></div>
        <div class="awe-editor-setting-row"><span><strong>Show quick refresh button</strong><small>Keep a dictionary refresh shortcut in the editor's bottom-right corner.</small></span><label class="awe-setting-switch"><input type="checkbox" data-awe-setting="show-editor-quick-action"><i aria-hidden="true"></i><span class="sr-only">Show quick refresh button in editor</span></label></div>
        <div class="awe-editor-setting-row"><span><strong>Apply Dictionary to All Drafts</strong><small>Apply saved dictionary rules across all drafts and chapters in this story project.</small></span><button class="awe-apply-editor-button" type="button" data-awe-action="apply-all-drafts-dictionary" title="Apply dictionary replacements to all project drafts">Apply to All Drafts</button></div>
      </section>
      <div class="awe-dictionary-view" data-awe-dictionary-view>
      <div class="awe-workspace-head"><span>Dictionary workspace</span><strong data-awe-rule-summary>0 rules · 0 aliases</strong></div>
      <div class="awe-browser-tools"><div class="awe-search-box"><span class="awe-search-icon-wrap" aria-hidden="true">${searchIcon}</span><input type="search" data-awe-search placeholder="Search categories or replacement words…" autocomplete="off"><button type="button" data-awe-action="clear-search" aria-label="Clear search">${clearSearchIcon}</button></div><div class="awe-sort-wrap"><button class="awe-sort-button" type="button" data-awe-action="toggle-sort" aria-label="Sort dictionary">${sortIcon}</button><div class="awe-sort-panel" data-awe-sort-panel hidden><strong>Sort categories</strong><button class="is-active" type="button" data-awe-action="set-sort" data-sort="order">Dictionary order</button><button type="button" data-awe-action="set-sort" data-sort="count">Most rules</button><button type="button" data-awe-action="set-sort" data-sort="alphabetical">Alphabetical</button></div></div><button class="awe-custom-first-button" type="button" data-awe-action="toggle-custom-first" aria-label="Show dictionary-only categories first" title="Show dictionary-only categories first">${customFirstIcon}</button><button class="advanced-word-editing-import-button" type="button" data-awe-action="import">${importIcon}<span>Import</span></button></div>
      <div class="awe-category-workspace" data-awe-category-workspace></div>
      <div class="awe-dictionary-actions"><button class="awe-manage-categories-button" type="button" data-awe-action="open-categories">Manage Categories</button><input type="file" data-awe-file-input accept=".json,application/json" hidden><div class="awe-dictionary-actions-right"><button class="is-danger" type="button" data-awe-action="clear-rules">Clear</button><div class="awe-export-wrap"><button type="button" data-awe-action="toggle-export" aria-haspopup="menu">Export</button><div class="awe-export-panel" data-awe-export-panel role="menu" hidden><button type="button" role="menuitem" data-awe-action="export-compatible">Compatible JSON</button><button type="button" role="menuitem" data-awe-action="export-studio">Studio JSON</button></div></div></div></div>
      </div>
      <div class="awe-dialog-backdrop" data-awe-dialog="rule" hidden><form class="awe-dialog awe-rule-entry-panel" data-awe-rule-form><header class="awe-naming-entry-head" data-awe-rule-drag-handle><div><h4 data-awe-rule-dialog-title>Add Word Replacement</h4></div><button class="awe-name-panel-close" type="button" data-awe-action="close-rule" aria-label="Close">${panelCloseIcon}</button></header><input type="hidden" name="ruleId"><div class="awe-word-entry-field"><div class="awe-word-input-row" data-awe-word-input-row><input name="replacement" type="text" maxlength="500" autocomplete="off" placeholder="Replacement"><input type="text" data-awe-source-word-input maxlength="500" autocomplete="off" placeholder="Word to replace" hidden><button class="awe-source-word-add" type="button" data-awe-action="open-source-word" title="Add word to replace" aria-label="Add word to replace">+</button></div><div class="awe-source-word-list" data-awe-source-word-list aria-live="polite"></div></div><label class="awe-category-select-field"><span>Category</span><select name="category" data-awe-rule-category title="Naming categories and dictionary-only categories are available here."></select></label><div class="awe-rule-options"><label><span>Finder mode</span><select name="finderMode" data-awe-finder-mode title="Finder mode"><option value="saved">Save — exact complete word</option><option value="raw">Raw — case-free Hindi endings</option><option value="deep">Deep — no word boundary</option></select></label></div><div class="awe-rule-form-actions"><button class="awe-delete-rule-button" type="button" data-awe-delete-rule data-awe-action="delete-rule" hidden>Delete rule</button><button class="awe-save-rule-button" data-awe-save-rule type="submit">Add Replacement</button></div></form></div>
      <div class="awe-dialog-backdrop" data-awe-dialog="temporary-candidates" hidden><section class="awe-dialog awe-temporary-candidates-panel" role="dialog" aria-modal="true" aria-labelledby="aweTemporaryCandidatesTitle"><header><div><h4 id="aweTemporaryCandidatesTitle">Temporary Names <b data-awe-temporary-count>0</b></h4></div><button class="awe-name-panel-close" type="button" data-awe-action="close-temporary-candidates" aria-label="Close">${panelCloseIcon}</button></header><p>These replacements exceeded your occurrence limit but their Replace value did not match a Naming category.</p><div class="awe-temporary-empty" data-awe-temporary-empty>No temporary replacement candidates yet.</div><div class="awe-temporary-list" data-awe-temporary-list></div></section></div>
      <div class="awe-dialog-backdrop" data-awe-dialog="categories" hidden><section class="awe-dialog awe-category-dialog" role="dialog" aria-modal="true" aria-labelledby="aweCategoryDialogTitle"><header><div><h4 id="aweCategoryDialogTitle">Manage Categories</h4></div><button class="awe-category-close-btn" type="button" data-awe-action="close-categories" aria-label="Close">${closeIcon}</button></header><div class="awe-category-list" data-awe-category-list tabindex="0"></div><footer class="awe-category-footer" data-awe-category-footer><button class="awe-add-category-trigger-btn" type="button" data-awe-action="show-category-form">+ Add Category</button><form class="awe-category-form awe-inline-category-form" data-awe-category-form hidden><input name="categoryName" type="text" maxlength="80" placeholder="New category name" autocomplete="off"><button class="is-primary" type="submit">Save</button></form></footer></section></div>
      <div class="awe-dialog-backdrop" data-awe-dialog="category-action" hidden><section class="awe-confirm-dialog awe-category-action-dialog" role="alertdialog" aria-modal="true" aria-labelledby="aweCategoryActionTitle" aria-describedby="aweCategoryActionCopy"><div class="awe-confirm-icon" aria-hidden="true">!</div><div class="awe-confirm-copy"><h4 id="aweCategoryActionTitle" data-awe-category-action-title>Manage category rules</h4><p id="aweCategoryActionCopy" data-awe-category-action-copy></p><label class="awe-category-target-field"><span>Destination category</span><select data-awe-category-target aria-label="Destination category" disabled></select></label></div>
      <div class="awe-confirm-actions awe-category-action-buttons" data-awe-category-initial-actions><button type="button" data-awe-action="close-category-action">Cancel</button><button type="button" data-awe-action="start-category-move">Move Words</button><button type="button" data-awe-action="clear-category-rules">Clear</button><button class="is-danger" type="button" data-awe-action="delete-category-and-rules">Delete</button></div><div class="awe-confirm-actions awe-category-action-buttons awe-category-move-actions" data-awe-category-move-actions hidden><button type="button" data-awe-action="cancel-category-move">Cancel</button><button type="button" data-awe-action="move-category-only">Move Only</button><button class="is-danger" type="button" data-awe-action="move-category-and-delete">Move & Delete</button></div></section></div>
      <div class="awe-dialog-backdrop" data-awe-dialog="delete-rule" hidden><section class="awe-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="aweDeleteRuleTitle" aria-describedby="aweDeleteRuleBody"><div class="awe-confirm-icon" aria-hidden="true">!</div><div class="awe-confirm-copy"><h4 id="aweDeleteRuleTitle" data-awe-delete-rule-title>Delete this replacement rule?</h4><p id="aweDeleteRuleBody" data-awe-delete-rule-body>This rule will be permanently removed from the replacement dictionary.</p></div><div class="awe-confirm-actions"><button type="button" data-awe-action="close-delete-rule">Cancel</button><button class="is-danger awe-confirm-delete" type="button" data-awe-action="confirm-delete-rule">Delete Rule</button></div></section></div>
      <div class="awe-dialog-backdrop" data-awe-dialog="clear-rules" hidden><section class="awe-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="aweClearRulesTitle" aria-describedby="aweClearRulesBody"><div class="awe-confirm-icon" aria-hidden="true">!</div><div class="awe-confirm-copy"><h4 id="aweClearRulesTitle">Clear replacement dictionary?</h4><p id="aweClearRulesBody">All replacement rules will be permanently removed. This action cannot be undone.</p></div><div class="awe-confirm-actions"><button type="button" data-awe-action="cancel-clear-rules">Cancel</button><button class="is-danger awe-confirm-delete" type="button" data-awe-action="confirm-clear-rules">Clear all</button></div></section></div>
      <div class="awe-toast-region" data-awe-toast-region aria-live="polite"></div>
    </div>`;
  }
  async function mount(container = document) {
    const root = container.querySelector?.('[data-awe-root]');
    if (!root) return;
    state.root = root;
    root.querySelectorAll('.awe-name-panel-close').forEach(button => {
      button.innerHTML = iconMarkup('close', 'awe-name-panel-close-icon');
    });
    bind(root);
    const importedBeforeRestore = ensureCategories();
    renderAll(false);
    const section = root.closest?.('[data-advanced-top-section]');
    if (section?.hidden) {
      setStorageStatus('Dictionary will load when this section opens');
      return;
    }
    if (window.LmWorkspaceSectionLoader?.ensureWordEditingData) {
      await window.LmWorkspaceSectionLoader.ensureWordEditingData();
    } else {
      await restore();
    }
    if (state.root !== root || !root.isConnected) return;
    const importedAfterRestore = ensureCategories();
    renderAll(true);
    syncEditorQuickAction();
    syncEditorDockPanel();
    setStorageStatus('Dictionary ready', 'success');
    if (importedBeforeRestore + importedAfterRestore > 0) persistSoon();
  }
  function getRules() { return state.rules.map(rule => ({ ...rule, aliases: [...rule.aliases] })); }
  function getActiveRules() { return getRules(); }
  function getTemporaryCandidates() { return state.temporaryCandidates.map(candidate => ({ ...candidate })); }
  function openImport() { state.root?.querySelector('[data-awe-file-input]')?.click(); }
  function openCategories() {
    if (!state.root) return;
    state.editingCategory = '';
    state.categoryFormOpen = false;
    renderCategoryList();
    syncCategoryFooter();
    openDialog('categories');
  }
  window.lmAdvancedWordEditing = Object.freeze({
    markup, mount, getRules, getActiveRules, runReplacementEngine, normaliseRule, extractImportedDictionary,
    openImport, openCategories, applyDictionaryToAllDrafts, applyDictionaryToEditor, learnFromEditorReplacement, getTemporaryCandidates,
    syncEditorQuickAction, syncEditorDockPanel, editorDockPanelState, getEditorDockPanelState,
    updateCollectSettingsFromDock,
    toggleKeepEditorReplacementsFromDock, openEditorControlsFromDock, openTemporaryCandidatesFromDock,
    loadDictionaryPayload, resetProjectData, flush: persist
  });
  const initializeEditorIntegration = () => Promise.resolve().then(() => {
    syncEditorQuickAction();
    syncEditorDockPanel();
  }).catch(() => {});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeEditorIntegration, { once: true });
  else initializeEditorIntegration();
})();
