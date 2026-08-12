'use strict';

(function initializeAdvancedWordEditingModule() {
  const STORAGE_KEY = 'lm_advanced_word_editing_dictionary_v1';
  const DATABASE_NAME = 'lm-advanced-word-editing';
  const DATABASE_STORE = 'state';
  const MAX_ALIASES_PER_RULE = 300;
  const DEVANAGARI = /[\u0900-\u097F]/u;
  const HINDI_MATRA = /[\u093A-\u094D\u0951-\u0957\u0962-\u0963]/u;
  const WORD_CHARACTER = /[\p{L}\p{N}\p{M}_]/u;
  const REPLACEMENT_WORD = /[\p{L}\p{N}]/u;
  const state = {
    rules: [], categories: ['General'], search: '', categoryFilter: 'all',
    sortMode: 'order', activeView: 'dictionary', keepEditorReplacements: true, showEditorQuickAction: false,
    collectUnmatchedReplacements: false, unmatchedReplacementThreshold: 3, unmatchedCategory: 'General',
    unmatchedObservations: new Map(), temporaryCandidates: [],
    expandedCategories: new Set(), visibleRules: [], draftAliases: [], root: null, loaded: false, restorePromise: null, persistTimer: 0, aliasResizeObserver: null, dialogDrag: null, outsideClickHandler: null
  };

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"]/gu, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]);
  }

  function escapeAttribute(value) { return escapeHTML(value).replace(/'/gu, '&#39;'); }
  function iconMarkup(name, className, fallback = '') {
    return typeof window.lmIcon === 'function' ? window.lmIcon(name, className) : fallback;
  }
  function createId() { return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function safeFilename(value) { return String(value || 'word-dictionary').trim().replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '-').replace(/\s+/gu, ' ').slice(0, 80) || 'word-dictionary'; }
  function parseAliases(value) { return [...new Set(String(value || '').split(/\r?\n/u).map(alias => alias.trim()).filter(Boolean))].slice(0, MAX_ALIASES_PER_RULE); }

  function normaliseRule(rawRule, order = 0) {
    if (!rawRule || typeof rawRule !== 'object') return null;
    const values = Array.isArray(rawRule.aliases)
      ? rawRule.aliases
      : Object.prototype.hasOwnProperty.call(rawRule, 'find') ? [rawRule.find] : [];
    const aliases = [...new Set(values.filter(alias => typeof alias === 'string' && alias.length > 0))].slice(0, MAX_ALIASES_PER_RULE);
    if (!aliases.length) return null;
    const categoryValue = rawRule.category ?? rawRule.group;
    const category = typeof categoryValue === 'string' && categoryValue.trim() ? categoryValue.trim().slice(0, 80) : 'General';
    const sourceMode = rawRule.finderMode || rawRule.findMode;
    const finderMode = ['raw', 'saved', 'deep'].includes(sourceMode) ? sourceMode : 'saved';
    return {
      id: typeof rawRule.id === 'string' && rawRule.id ? rawRule.id : createId(),
      aliases,
      find: aliases[0],
      replace: typeof rawRule.replace === 'string' ? rawRule.replace.slice(0, 500) : '',
      category,
      group: category,
      finderMode,
      order: Number.isFinite(rawRule.order) ? rawRule.order : order
    };
  }

  function sharedNamingCategoryTitles() {
    try {
      if (typeof namingData === 'undefined' || !Array.isArray(namingData?.categories)) return [];
      return namingData.categories.map(category => String(category?.title || category?.label || '').trim()).filter(Boolean);
    } catch { return []; }
  }

  function ensureCategories() {
    const existing = new Set(state.categories.map(category => String(category || '').trim()).filter(Boolean));
    const importedNamingCategories = sharedNamingCategoryTitles().filter(title => !existing.has(title));
    // One-way copy only: Naming categories become dictionary categories. Nothing
    // in this module writes replacement-only categories back into namingData.
    state.categories = [...new Set(['General', ...state.categories, ...importedNamingCategories, ...state.rules.map(rule => rule.category)].map(category => String(category || '').trim()).filter(Boolean))];
    return importedNamingCategories.length;
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(DATABASE_STORE)) request.result.createObjectStore(DATABASE_STORE); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function databaseState(mode, payload) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(DATABASE_STORE, mode === 'write' ? 'readwrite' : 'readonly');
      const request = mode === 'write'
        ? transaction.objectStore(DATABASE_STORE).put(payload, 'current')
        : transaction.objectStore(DATABASE_STORE).get('current');
      request.onsuccess = () => { const value = request.result || null; database.close(); resolve(value); };
      request.onerror = () => { database.close(); reject(request.error); };
    });
  }

  function serializableState() {
    return {
      version: 1, savedAt: Date.now(), rules: state.rules, categories: state.categories,
      search: state.search, categoryFilter: state.categoryFilter, sortMode: state.sortMode,
      activeView: state.activeView, keepEditorReplacements: state.keepEditorReplacements,
      showEditorQuickAction: state.showEditorQuickAction,
      collectUnmatchedReplacements: state.collectUnmatchedReplacements,
      unmatchedReplacementThreshold: state.unmatchedReplacementThreshold,
      unmatchedCategory: state.unmatchedCategory || 'General'
    };
  }

  function loadDictionaryPayload(saved) {
    if (saved && typeof saved === 'object') {
      state.rules = Array.isArray(saved.rules) ? saved.rules.map(normaliseRule).filter(Boolean) : [];
      state.categories = Array.isArray(saved.categories) ? saved.categories.filter(category => typeof category === 'string') : ['General'];
      state.search = typeof saved.search === 'string' ? saved.search : '';
      state.categoryFilter = typeof saved.categoryFilter === 'string' ? saved.categoryFilter : 'all';
      state.sortMode = ['order', 'count', 'alphabetical'].includes(saved.sortMode) ? saved.sortMode : 'order';
      state.activeView = ['editor', 'dictionary'].includes(saved.activeView) ? saved.activeView : 'dictionary';
      state.keepEditorReplacements = saved.keepEditorReplacements !== false;
      state.showEditorQuickAction = saved.showEditorQuickAction === true;
      state.collectUnmatchedReplacements = saved.collectUnmatchedReplacements === true;
      state.unmatchedReplacementThreshold = Math.min(10000, Math.max(1, Math.floor(Number(saved.unmatchedReplacementThreshold) || 3)));
      state.unmatchedCategory = typeof saved.unmatchedCategory === 'string' && saved.unmatchedCategory ? saved.unmatchedCategory : 'General';
      ensureCategories();
      renderAll(true);
      syncEditorQuickAction();
      setStorageStatus('Loaded from project folder (Story_Word_Editing.json)', 'success');
    }
  }

  async function restore() {
    if (state.loaded) return;
    if (state.restorePromise) return state.restorePromise;
    state.restorePromise = (async () => {
      let saved = null;
      if (typeof readWordEditingDataFromProject === 'function') {
        try { saved = await readWordEditingDataFromProject(); } catch { saved = null; }
      }
      if (!saved) {
        try { saved = await databaseState('read'); } catch { /* LocalStorage fallback below. */ }
      }
      if (!saved) {
        try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { saved = null; }
      }
      if (saved && typeof saved === 'object') {
        state.rules = Array.isArray(saved.rules) ? saved.rules.map(normaliseRule).filter(Boolean) : [];
        state.categories = Array.isArray(saved.categories) ? saved.categories.filter(category => typeof category === 'string') : ['General'];
        state.search = typeof saved.search === 'string' ? saved.search : '';
        state.categoryFilter = typeof saved.categoryFilter === 'string' ? saved.categoryFilter : 'all';
        state.sortMode = ['order', 'count', 'alphabetical'].includes(saved.sortMode) ? saved.sortMode : 'order';
        state.activeView = ['editor', 'dictionary'].includes(saved.activeView) ? saved.activeView : 'dictionary';
        state.keepEditorReplacements = saved.keepEditorReplacements !== false;
        state.showEditorQuickAction = saved.showEditorQuickAction === true;
        state.collectUnmatchedReplacements = saved.collectUnmatchedReplacements === true;
        state.unmatchedReplacementThreshold = Math.min(10000, Math.max(1, Math.floor(Number(saved.unmatchedReplacementThreshold) || 3)));
        state.unmatchedCategory = typeof saved.unmatchedCategory === 'string' && saved.unmatchedCategory ? saved.unmatchedCategory : 'General';
      }
      state.loaded = true;
    })();
    return state.restorePromise;
  }

  function setStorageStatus(message, tone = '') {
    const status = state.root?.querySelector('[data-awe-storage-status]');
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  async function persist() {
    window.clearTimeout(state.persistTimer);
    const payload = serializableState();
    let savedInProject = false;
    let indexed = false;
    if (typeof writeWordEditingDataToProject === 'function') {
      try { savedInProject = await writeWordEditingDataToProject(payload); } catch { savedInProject = false; }
    }
    try { await databaseState('write', payload); indexed = true; } catch { /* LocalStorage fallback below. */ }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); }
    catch {
      if (!indexed && !savedInProject) { setStorageStatus('Storage is full — export a backup', 'danger'); return false; }
    }
    if (savedInProject) {
      setStorageStatus('Dictionary saved to project folder', 'success');
    } else if (indexed) {
      setStorageStatus('Dictionary saved locally', 'success');
    } else {
      setStorageStatus('Saved in browser cache', 'success');
    }
    window.dispatchEvent(new CustomEvent('lm:advanced-word-editing-rules-changed', { detail: { rules: getRules() } }));
    return true;
  }

  function persistSoon() {
    window.clearTimeout(state.persistTimer);
    setStorageStatus('Saving dictionary…', 'working');
    state.persistTimer = window.setTimeout(persist, 220);
  }

  function toast(message, type = 'success') {
    const region = state.root?.querySelector('[data-awe-toast-region]');
    if (region) {
      const item = document.createElement('div');
      item.className = `awe-toast is-${type}`;
      item.textContent = message;
      region.appendChild(item);
      window.setTimeout(() => item.remove(), 3600);
    }
    if (!region && typeof window.showMiniReminder === 'function') window.showMiniReminder(message);
  }

  function filteredRules() {
    const query = state.search.trim().toLocaleLowerCase();
    return state.rules.filter(rule => {
      const searchable = `${rule.aliases.join(' ')} ${rule.replace} ${rule.category} ${rule.finderMode}`.toLocaleLowerCase();
      return !query || searchable.includes(query);
    });
  }

  function createRuleRow(rule) {
    const aliasCount = rule.aliases.length;
    const preview = aliasCount > 1 ? `${aliasCount} aliases: ${rule.aliases.slice(0, 3).join(', ')}${aliasCount > 3 ? ', …' : ''}` : '1 alias';
    const mode = rule.finderMode === 'saved' ? 'Save' : rule.finderMode === 'deep' ? 'Deep' : 'Raw';
    const aliases = rule.aliases.map((alias, index) => `<span class="awe-rule-alias-name" data-awe-alias-name>${index ? ', ' : ''}${escapeHTML(alias)}</span>`).join('');
    return `<div class="awe-rule-row" data-awe-rule-id="${escapeAttribute(rule.id)}" tabindex="0" title="${escapeAttribute(`${preview} → ${rule.replace || 'delete'}`)}"><div class="awe-rule-main"><strong class="awe-rule-replacement">${escapeHTML(rule.replace || '∅')}</strong><span class="awe-rule-alias-list" data-awe-alias-list title="${escapeAttribute(rule.aliases.join(', '))}">${aliases}<span class="awe-rule-alias-more" data-awe-alias-more hidden></span></span></div><div class="awe-rule-actions"><span class="awe-finder-mode is-${rule.finderMode}">${mode}</span><button type="button" data-awe-action="edit-rule" data-rule-id="${escapeAttribute(rule.id)}" aria-label="Edit rule">Edit</button></div></div>`;
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
      return `<section class="awe-category-card ${expanded ? 'is-expanded' : ''}" data-awe-category-card="${escapeAttribute(category.title)}"><div class="awe-category-title"><button class="awe-category-toggle" type="button" data-awe-action="toggle-category" data-category="${escapeAttribute(category.title)}" aria-expanded="${expanded}"><span class="awe-category-chevron" aria-hidden="true">${chevronIcon}</span><strong>${escapeHTML(category.title)}</strong><small>${category.rules.length}/${allCount}</small></button><button class="awe-category-add" type="button" data-awe-action="new-rule-in-category" data-category="${escapeAttribute(category.title)}" aria-label="Add replacement to ${escapeAttribute(category.title)}">${addIcon}</button></div><div class="awe-category-entries" ${expanded ? '' : 'hidden'}>${entries}</div></section>`;
    }).join('');
    if (resetScroll) workspace.scrollTop = 0;
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
    list.innerHTML = state.categories.map(category => {
      const count = state.rules.filter(rule => rule.category === category).length;
      return `<div class="awe-category-row"><span><strong>${escapeHTML(category)}</strong><small>${count.toLocaleString()} rules</small></span><div><button type="button" data-awe-action="rename-category" data-category="${escapeAttribute(category)}">Rename</button><button type="button" data-awe-action="delete-category" data-category="${escapeAttribute(category)}" ${category === 'General' ? 'disabled' : ''}>Delete</button></div></div>`;
    }).join('');
  }

  function renderAll(resetScroll = false) {
    if (!state.root) return;
    const search = state.root.querySelector('[data-awe-search]');
    if (search) search.value = state.search;
    renderCategoryControls();
    state.root.querySelectorAll('[data-awe-action="set-sort"]').forEach(button => button.classList.toggle('is-active', button.dataset.sort === state.sortMode));
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
    window.setTimeout(() => dialog.querySelector('textarea, input, button')?.focus(), 20);
  }

  function closeDialog(name) {
    const dialog = state.root?.querySelector(`[data-awe-dialog="${name}"]`);
    if (dialog) dialog.hidden = true;
    if (name === 'rule') endRuleDialogDrag();
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
    list.innerHTML = state.draftAliases.map((alias, index) => `<span class="awe-source-word-chip"><span>${escapeHTML(alias)}</span><button type="button" data-awe-action="remove-source-word" data-alias-index="${index}" aria-label="Remove ${escapeAttribute(alias)}">×</button></span>`).join('');
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

  function deleteRule() {
    const id = state.root?.querySelector('[data-awe-rule-form]')?.elements.ruleId.value;
    const rule = findRule(id);
    if (!rule || !window.confirm(`Delete the rule for “${rule.aliases[0]}”?`)) return;
    state.rules = state.rules.filter(item => item.id !== rule.id);
    renderAll(false); closeDialog('rule'); persistSoon(); toast('Rule deleted.');
  }

  function addCategory(event) {
    event.preventDefault();
    const input = event.currentTarget.elements.categoryName;
    const category = input.value.trim().slice(0, 80);
    if (!category) return;
    if (state.categories.some(item => item.localeCompare(category, undefined, { sensitivity: 'accent' }) === 0)) { toast('That category already exists.', 'error'); return; }
    state.categories.push(category); input.value = ''; renderCategoryControls(); renderCategoryList(); persistSoon();
  }

  function renameCategory(category) {
    const next = window.prompt('New category name:', category)?.trim().slice(0, 80);
    if (!next || next === category) return;
    if (state.categories.includes(next)) { toast('That category already exists.', 'error'); return; }
    state.categories = state.categories.map(item => item === category ? next : item);
    state.rules.forEach(rule => { if (rule.category === category) { rule.category = next; rule.group = next; } });
    if (state.categoryFilter === category) state.categoryFilter = next;
    renderAll(false); renderCategoryList(); persistSoon();
  }

  function deleteCategory(category) {
    if (category === 'General') return;
    const count = state.rules.filter(rule => rule.category === category).length;
    if (!window.confirm(`Delete “${category}”? ${count} rules will move to General.`)) return;
    state.categories = state.categories.filter(item => item !== category);
    state.rules.forEach(rule => { if (rule.category === category) { rule.category = 'General'; rule.group = 'General'; } });
    if (state.categoryFilter === category) state.categoryFilter = 'all';
    renderAll(false); renderCategoryList(); persistSoon();
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
      const replaceExisting = state.rules.length > 0 && window.confirm(`Import ${imported.rules.length.toLocaleString()} rules from ${file.name}? OK replaces the current dictionary; Cancel adds them.`);
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
      .filter(candidate => candidate.count <= state.unmatchedReplacementThreshold)
      .sort((first, second) => second.count - first.count || second.lastSeen - first.lastSeen);
    renderTemporaryCandidates();
  }

  function recordUnmatchedReplacement(source, replacement, count) {
    if (!state.collectUnmatchedReplacements) return null;
    const safeCount = Math.max(1, Math.floor(Number(count) || 1));
    const key = unmatchedObservationKey(source, replacement);
    const existing = state.unmatchedObservations.get(key);
    const candidate = existing || {
      id: createId(), source, replacement, count: 0, firstSeen: Date.now(), lastSeen: Date.now()
    };
    candidate.count += safeCount;
    candidate.lastSeen = Date.now();
    state.unmatchedObservations.set(key, candidate);

    if (candidate.count > state.unmatchedReplacementThreshold) {
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
    if (!state.root) return;
    const count = state.temporaryCandidates.length;
    state.root.querySelectorAll('[data-awe-temporary-count]').forEach(node => {
      node.textContent = count.toLocaleString();
    });
    const list = state.root.querySelector('[data-awe-temporary-list]');
    const empty = state.root.querySelector('[data-awe-temporary-empty]');
    if (empty) empty.hidden = count > 0;
    if (!list) return;
    list.innerHTML = state.temporaryCandidates.map(candidate => `
      <div class="awe-temporary-candidate-row">
        <div><strong>${escapeHTML(candidate.replacement)}</strong><span>${escapeHTML(candidate.source)} → ${escapeHTML(candidate.replacement)}</span><small>${candidate.count.toLocaleString()} replacements observed</small></div>
        <button type="button" data-awe-action="save-temporary-candidate" data-candidate-id="${escapeAttribute(candidate.id)}">Add to Dictionary</button>
      </div>`).join('');
  }

  function saveTemporaryCandidate(candidateId) {
    const candidate = state.temporaryCandidates.find(item => item.id === candidateId);
    if (!candidate) return;
    const namingEntry = namingEntryForReplacementWord(candidate.replacement);
    const category = namingCategoryTitle(namingEntry?.categoryId) || 'General';
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
    state.unmatchedObservations.delete(unmatchedObservationKey(candidate.source, candidate.replacement));
    refreshTemporaryCandidates();
    if (changed) {
      ensureCategories();
      renderAll(false);
      persistSoon();
      toast('Temporary replacement added to the main dictionary.');
    } else {
      toast('This replacement is already present in the main dictionary.');
    }
  }

  async function learnFromEditorReplacement({ source, replacement, count = 1 } = {}) {
    await restore();
    if (!count) return { learned: false, reason: 'empty' };
    const sourceWord = String(source || '').trim();
    const replacementWord = String(replacement || '').trim();
    if (!REPLACEMENT_WORD.test(sourceWord) || !REPLACEMENT_WORD.test(replacementWord) || replacementIdentity(sourceWord) === replacementIdentity(replacementWord)) {
      return { learned: false, reason: 'invalid' };
    }
    // The replacement is the canonical Naming entry. The Find value is saved
    // as an alias/source that should be replaced with that canonical word.
    const namingEntry = namingEntryForReplacementWord(replacementWord);
    if (!namingEntry) {
      const candidate = recordUnmatchedReplacement(sourceWord, replacementWord, count);
      return { learned: false, reason: 'not-a-naming-entry', candidate };
    }
    if (!state.keepEditorReplacements) return { learned: false, reason: 'disabled' };
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
    const exportPanel = state.root?.querySelector('[data-awe-export-panel]');
    if (exportPanel && !event.target.closest('.awe-export-wrap')) exportPanel.hidden = true;
    if (trigger?.dataset.aweAction === 'select-view') {
      state.activeView = trigger.dataset.view === 'editor' ? 'editor' : 'dictionary';
      renderWorkspaceView();
      persistSoon();
      return;
    }
    if (!trigger || !state.root?.contains(trigger)) {
      const row = event.target.closest('[data-awe-rule-id]');
      if (row && state.root?.contains(row)) openRuleDialog(findRule(row.dataset.aweRuleId));
      return;
    }
    const action = trigger.dataset.aweAction;
    if (action === 'apply-all-drafts-dictionary') applyDictionaryToAllDrafts({ source: 'settings' });
    else if (action === 'apply-editor-dictionary') applyDictionaryToEditor({ source: 'settings' });
    else if (action === 'open-temporary-candidates') { renderTemporaryCandidates(); openDialog('temporary-candidates'); }
    else if (action === 'close-temporary-candidates') closeDialog('temporary-candidates');
    else if (action === 'save-temporary-candidate') saveTemporaryCandidate(trigger.dataset.candidateId);
    else if (action === 'new-rule') openRuleDialog();
    else if (action === 'new-rule-in-category') openRuleDialog(null, trigger.dataset.category);
    else if (action === 'toggle-category') {
      const category = trigger.dataset.category;
      if (state.expandedCategories.has(category)) state.expandedCategories.delete(category);
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
    else if (action === 'toggle-export') {
      const panel = state.root.querySelector('[data-awe-export-panel]');
      if (panel) panel.hidden = !panel.hidden;
    }
    else if (action === 'edit-rule') openRuleDialog(findRule(trigger.dataset.ruleId));
    else if (action === 'close-rule') closeDialog('rule');
    else if (action === 'delete-rule') deleteRule();
    else if (action === 'open-source-word') setSourceWordInputOpen(true);
    else if (action === 'remove-source-word') {
      state.draftAliases.splice(Number(trigger.dataset.aliasIndex), 1);
      renderDraftAliases();
    }
    else if (action === 'open-categories') { renderCategoryList(); openDialog('categories'); }
    else if (action === 'close-categories') closeDialog('categories');
    else if (action === 'rename-category') renameCategory(trigger.dataset.category);
    else if (action === 'delete-category') deleteCategory(trigger.dataset.category);
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
      if (!state.root?.isConnected || event.target.closest?.('.awe-sort-wrap')) return;
      const sortPanel = state.root.querySelector('[data-awe-sort-panel]');
      if (sortPanel) sortPanel.hidden = true;
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
        persistSoon();
      }
      else if (event.target.matches('[data-awe-setting="show-editor-quick-action"]')) {
        state.showEditorQuickAction = event.target.checked;
        syncEditorQuickAction();
        persistSoon();
      }
      else if (event.target.matches('[data-awe-setting="collect-unmatched-replacements"]')) {
        state.collectUnmatchedReplacements = event.target.checked;
        renderWorkspaceView();
        persistSoon();
      }
      else if (event.target.matches('[data-awe-unmatched-threshold]')) {
        state.unmatchedReplacementThreshold = Math.min(10000, Math.max(1, Math.floor(Number(event.target.value) || 3)));
        event.target.value = String(state.unmatchedReplacementThreshold);
        refreshTemporaryCandidates();
        persistSoon();
      }
      else if (event.target.matches('[data-awe-unmatched-category]')) {
        state.unmatchedCategory = event.target.value || 'General';
        persistSoon();
      }
      else if (event.target.matches('[data-awe-finder-mode]')) syncFinderHelp();
      else if (event.target.matches('[name="replacement"]')) adoptExistingReplacementRule();
      else if (event.target.matches('[data-awe-file-input]')) { const file = event.target.files?.[0]; event.target.value = ''; if (file) importDictionaryFile(file); }
    });
    root.addEventListener('focusout', event => {
      if (!event.target.matches('[data-awe-source-word-input]')) return;
      window.setTimeout(() => {
        if (document.activeElement?.matches?.('[data-awe-action="open-source-word"]')) return;
        commitSourceWordInput();
      }, 0);
    });
    root.addEventListener('keydown', event => {
      const openDialogElement = root.querySelector('[data-awe-dialog]:not([hidden])');
      if (event.key === 'Escape' && openDialogElement) { event.preventDefault(); event.stopPropagation(); openDialogElement.hidden = true; return; }
      if (event.key === 'Enter' && event.target.matches('.awe-rule-row')) { event.preventDefault(); openRuleDialog(findRule(event.target.dataset.aweRuleId)); return; }
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
    const clearSearchIcon = iconMarkup('close', 'awe-search-clear-icon', '×');
    const sortIcon = iconMarkup('sortDirectionBars', 'awe-sort-icon', '≡');
    return `<div class="awe-workspace-switcher" role="tablist" aria-label="Advanced word editing workspace"><button type="button" role="tab" data-awe-action="select-view" data-view="editor" data-awe-view-tab="editor" aria-selected="false">Work on Editor</button><button type="button" role="tab" data-awe-action="select-view" data-view="dictionary" data-awe-view-tab="dictionary" aria-selected="true">Words Dictionary</button></div>
    <div class="awe-workspace" data-awe-root>
      <section class="awe-work-editor-panel" data-awe-editor-settings hidden>
        <div class="awe-editor-setting-row"><span><strong>Keep words and replacements from editor</strong><small>When enabled, replaced words from editor are remembered and processed based on occurrence limits.</small></span><div class="awe-unmatched-controls"><button type="button" data-awe-action="open-temporary-candidates">Temporary Names <b data-awe-temporary-count>0</b></button><label class="awe-setting-switch"><input type="checkbox" data-awe-setting="keep-editor-replacements"><i aria-hidden="true"></i><span class="sr-only">Keep words and replacements from editor</span></label></div></div>
        <div class="awe-editor-setting-row awe-unmatched-setting-row"><span><strong>Collect unmatched replacements</strong><small>Words replaced fewer times than threshold go to Temporary Names; words exceeding threshold automatically move to selected category.</small></span><div class="awe-unmatched-controls"><label class="awe-threshold-field"><span>More than</span><input type="number" min="1" max="10000" step="1" inputmode="numeric" data-awe-unmatched-threshold aria-label="Unmatched replacement occurrence limit"></label><label class="awe-threshold-field awe-unmatched-category-field"><select data-awe-unmatched-category title="Category for words exceeding occurrence limit"></select></label><label class="awe-setting-switch"><input type="checkbox" data-awe-setting="collect-unmatched-replacements"><i aria-hidden="true"></i><span class="sr-only">Collect unmatched replacements</span></label></div></div>
        <div class="awe-editor-setting-row"><span><strong>Apply Dictionary to All Drafts</strong><small>Apply saved dictionary rules across all drafts and chapters in this story project.</small></span><button class="awe-apply-editor-button" type="button" data-awe-action="apply-all-drafts-dictionary" title="Apply dictionary replacements to all project drafts">Apply to All Drafts</button></div>
        <div class="awe-editor-setting-row"><span><strong>Show quick refresh button</strong><small>Keep a dictionary refresh shortcut in the editor's bottom-right corner.</small></span><label class="awe-setting-switch"><input type="checkbox" data-awe-setting="show-editor-quick-action"><i aria-hidden="true"></i><span class="sr-only">Show quick refresh button in editor</span></label></div>
      </section>
      <div class="awe-dictionary-view" data-awe-dictionary-view>
      <div class="awe-workspace-head"><span>Dictionary workspace</span><strong data-awe-rule-summary>0 rules · 0 aliases</strong></div>
      <div class="awe-browser-tools"><div class="awe-search-box"><span class="awe-search-icon-wrap" aria-hidden="true">${searchIcon}</span><input type="search" data-awe-search placeholder="Search categories or replacement words…" autocomplete="off"><button type="button" data-awe-action="clear-search" aria-label="Clear search">${clearSearchIcon}</button></div><div class="awe-sort-wrap"><button class="awe-sort-button" type="button" data-awe-action="toggle-sort" aria-label="Sort dictionary">${sortIcon}</button><div class="awe-sort-panel" data-awe-sort-panel hidden><strong>Sort categories</strong><button class="is-active" type="button" data-awe-action="set-sort" data-sort="order">Dictionary order</button><button type="button" data-awe-action="set-sort" data-sort="count">Most rules</button><button type="button" data-awe-action="set-sort" data-sort="alphabetical">Alphabetical</button></div></div><button class="awe-browser-category-button" type="button" data-awe-action="open-categories">+ Category</button></div>
      <div class="awe-category-workspace" data-awe-category-workspace></div>
      <div class="awe-dictionary-actions"><input type="file" data-awe-file-input accept=".json,application/json" hidden><button class="is-danger" type="button" data-awe-action="clear-rules">Clear</button><div class="awe-export-wrap"><button type="button" data-awe-action="toggle-export" aria-haspopup="menu">Export</button><div class="awe-export-panel" data-awe-export-panel role="menu" hidden><button type="button" role="menuitem" data-awe-action="export-compatible">Compatible JSON</button><button type="button" role="menuitem" data-awe-action="export-studio">Studio JSON</button></div></div></div>
      </div>
      <div class="awe-dialog-backdrop" data-awe-dialog="rule" hidden><form class="awe-dialog awe-rule-entry-panel" data-awe-rule-form><header class="awe-naming-entry-head" data-awe-rule-drag-handle><div><h4 data-awe-rule-dialog-title>Add Word Replacement</h4></div><button class="awe-name-panel-close" type="button" data-awe-action="close-rule" aria-label="Close">×</button></header><input type="hidden" name="ruleId"><div class="awe-word-entry-field"><div class="awe-word-input-row" data-awe-word-input-row><input name="replacement" type="text" maxlength="500" autocomplete="off" placeholder="Replacement"><input type="text" data-awe-source-word-input maxlength="500" autocomplete="off" placeholder="Word to replace" hidden><button class="awe-source-word-add" type="button" data-awe-action="open-source-word" title="Add word to replace" aria-label="Add word to replace">+</button></div><div class="awe-source-word-list" data-awe-source-word-list aria-live="polite"></div></div><label class="awe-category-select-field"><span>Category</span><select name="category" data-awe-rule-category title="Naming categories and dictionary-only categories are available here."></select></label><div class="awe-rule-options"><label><span>Finder mode</span><select name="finderMode" data-awe-finder-mode title="Finder mode"><option value="saved">Save — exact complete word</option><option value="raw">Raw — case-free Hindi endings</option><option value="deep">Deep — no word boundary</option></select></label></div><div class="awe-rule-form-actions"><button class="awe-delete-rule-button" type="button" data-awe-delete-rule data-awe-action="delete-rule" hidden>Delete rule</button><button class="awe-save-rule-button" data-awe-save-rule type="submit">Add Replacement</button></div></form></div>
      <div class="awe-dialog-backdrop" data-awe-dialog="temporary-candidates" hidden><section class="awe-dialog awe-temporary-candidates-panel" role="dialog" aria-modal="true" aria-labelledby="aweTemporaryCandidatesTitle"><header><div><span>Editor observations</span><h4 id="aweTemporaryCandidatesTitle">Temporary Names <b data-awe-temporary-count>0</b></h4></div><button class="awe-name-panel-close" type="button" data-awe-action="close-temporary-candidates" aria-label="Close">×</button></header><p>These replacements exceeded your occurrence limit but their Replace value did not match a Naming category.</p><div class="awe-temporary-empty" data-awe-temporary-empty>No temporary replacement candidates yet.</div><div class="awe-temporary-list" data-awe-temporary-list></div></section></div>
      <div class="awe-dialog-backdrop" data-awe-dialog="categories" hidden><section class="awe-dialog"><header><div><span>Dictionary structure</span><h4>Manage categories</h4></div><button type="button" data-awe-action="close-categories" aria-label="Close">×</button></header><p>Renaming updates every related rule. Deleting a category moves its rules to General.</p><form class="awe-category-form" data-awe-category-form><input name="categoryName" type="text" maxlength="80" placeholder="New category name" autocomplete="off"><button class="is-primary" type="submit">Add category</button></form><div class="awe-category-list" data-awe-category-list></div><footer><span></span><button class="is-primary" type="button" data-awe-action="close-categories">Done</button></footer></section></div>
      <div class="awe-dialog-backdrop" data-awe-dialog="clear-rules" hidden><section class="awe-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="aweClearRulesTitle" aria-describedby="aweClearRulesBody"><div class="awe-confirm-icon" aria-hidden="true">!</div><div class="awe-confirm-copy"><h4 id="aweClearRulesTitle">Clear replacement dictionary?</h4><p id="aweClearRulesBody">All replacement rules will be permanently removed. This action cannot be undone.</p></div><div class="awe-confirm-actions"><button type="button" data-awe-action="cancel-clear-rules">Cancel</button><button class="is-danger awe-confirm-delete" type="button" data-awe-action="confirm-clear-rules">Clear all</button></div></section></div>
      <div class="awe-toast-region" data-awe-toast-region aria-live="polite"></div>
    </div>`;
  }

  async function mount(container = document) {
    const root = container.querySelector?.('[data-awe-root]');
    if (!root) return;
    state.root = root;
    bind(root);
    const importedBeforeRestore = ensureCategories();
    renderAll(false);
    await restore();
    if (state.root !== root || !root.isConnected) return;
    const importedAfterRestore = ensureCategories();
    renderAll(true);
    syncEditorQuickAction();
    setStorageStatus('Dictionary ready', 'success');
    if (importedBeforeRestore + importedAfterRestore > 0) persistSoon();
  }

  function getRules() { return state.rules.map(rule => ({ ...rule, aliases: [...rule.aliases] })); }
  function getActiveRules() { return getRules(); }
  function getTemporaryCandidates() { return state.temporaryCandidates.map(candidate => ({ ...candidate })); }
  function openImport() { state.root?.querySelector('[data-awe-file-input]')?.click(); }

  window.lmAdvancedWordEditing = Object.freeze({
    markup, mount, getRules, getActiveRules, runReplacementEngine, normaliseRule, extractImportedDictionary,
    openImport, applyDictionaryToAllDrafts, applyDictionaryToEditor, learnFromEditorReplacement, getTemporaryCandidates,
    syncEditorQuickAction, loadDictionaryPayload, flush: persist
  });

  const initializeEditorIntegration = () => restore().then(syncEditorQuickAction).catch(() => {});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeEditorIntegration, { once: true });
  else initializeEditorIntegration();
})();
