(function initializeAdvancedImportPromoteSettings(global) {
  'use strict';

  const SETTINGS_KEY = 'lm_advanced_import_promote_settings_v1';
  const LEGACY_CONCLUSION_PREFIX = 'lm_advanced_promote_conclusion_v1';
  const IMPORT_CONCLUSION_PREFIX = 'lm_advanced_import_conclusion_v1';
  const IMPORT_DRAFT_CONCLUSION_PREFIX = 'lm_advanced_import_draft_conclusion_v1';
  const DEFAULTS = Object.freeze({
    importWordCount: 2500,
    importSplitMode: 'auto',
    importCustomWord: '',
    importTarget: 'drafts',
    importFontSize: 14,
    promoteWordCount: 2500,
    promoteFontSize: 14,
    promoteDestination: 'part',
    promoteAutoOpenAboveLimit: true
  });
  let activeWorkflowView = 'import';
  let importDraftConclusionValue = '';
  let lastImportTarget = 'drafts';

  function safeParse(value, fallback) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function clampWords(value, fallback) {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? Math.max(100, Math.min(50000, number)) : fallback;
  }

  function clampFontSize(value, fallback) {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? Math.max(10, Math.min(30, number)) : fallback;
  }

  function readSettings() {
    const stored = safeParse(localStorage.getItem(SETTINGS_KEY), {});
    const legacyImportWords = typeof global.lmEditorAdvancedNumber === 'function'
      ? global.lmEditorAdvancedNumber('importDefaultWords', DEFAULTS.importWordCount)
      : DEFAULTS.importWordCount;
    return {
      importWordCount: clampWords(stored.importWordCount, legacyImportWords),
      importSplitMode: stored.importSplitMode === 'custom' ? 'custom' : 'auto',
      importCustomWord: String(stored.importCustomWord || '').trim(),
      importTarget: stored.importTarget === 'chapters' ? 'chapters' : 'drafts',
      importFontSize: clampFontSize(stored.importFontSize, DEFAULTS.importFontSize),
      promoteWordCount: clampWords(stored.promoteWordCount, DEFAULTS.promoteWordCount),
      promoteFontSize: clampFontSize(stored.promoteFontSize, DEFAULTS.promoteFontSize),
      promoteDestination: stored.promoteDestination === 'raw' ? 'raw' : 'part',
      promoteAutoOpenAboveLimit: stored.promoteAutoOpenAboveLimit !== false
    };
  }

  function projectIdentity() {
    let title = '';
    try {
      title = global.projectDirectoryHandle?.name ||
        localStorage.getItem('lm_project_folder_name') ||
        localStorage.getItem(typeof global.PROJECT_FOLDER_KEY === 'string' ? global.PROJECT_FOLDER_KEY : 'lm_projectFolder') ||
        global.projectManifest?.title || '';
    } catch (_) {}
    return encodeURIComponent(String(title || 'default'));
  }

  function conclusionKey(mode) {
    const prefix = mode === 'import' ? IMPORT_CONCLUSION_PREFIX : LEGACY_CONCLUSION_PREFIX;
    return `${prefix}:${projectIdentity()}`;
  }

  function importDraftConclusionKey() {
    return `${IMPORT_DRAFT_CONCLUSION_PREFIX}:${projectIdentity()}`;
  }

  function readImportDraftConclusion(fallback = '') {
    try {
      const stored = localStorage.getItem(importDraftConclusionKey());
      return stored === null ? String(fallback || '') : stored;
    } catch (_) {
      return String(fallback || '');
    }
  }

  function saveImportDraftConclusion(value = '') {
    try {
      localStorage.setItem(importDraftConclusionKey(), String(value || '').replace(/\r\n?/g, '\n'));
    } catch (error) {
      console.warn('Advanced Import draft conclusion could not be saved:', error);
    }
  }

  function readPermanentConclusion(mode) {
    try {
      const ownKey = conclusionKey(mode);
      const ownValue = localStorage.getItem(ownKey);
      if (ownValue !== null) return ownValue;
      if (mode === 'import') {
        const legacyValue = localStorage.getItem(conclusionKey('promote'));
        if (legacyValue !== null) {
          localStorage.setItem(ownKey, legacyValue);
          return legacyValue;
        }
      }
    } catch (error) {
      console.warn('Advanced workflow conclusion could not be read:', error);
    }
    return '';
  }

  function savePermanentConclusion(mode, value) {
    try {
      localStorage.setItem(conclusionKey(mode), String(value || '').replace(/\r\n?/g, '\n'));
      return true;
    } catch (error) {
      console.warn('Advanced workflow conclusion could not be saved:', error);
      return false;
    }
  }

  function escapeMarkup(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function controlAttributes(key, defaultValue) {
    return `data-advanced-runtime-key="workflow-${key}" data-default-value="${escapeMarkup(defaultValue)}"`;
  }

  function numberControl(key, label, value, defaultValue, options = {}) {
    const minimum = options.min ?? 100;
    const maximum = options.max ?? 50000;
    const step = options.step ?? 100;
    const unit = options.unit || 'words';
    const icon = direction => typeof global.lmIcon === 'function'
      ? global.lmIcon('collapseChevron', `step-chevron-svg lm-chevron-${direction}`)
      : `<span aria-hidden="true">${direction === 'up' ? '&#9652;' : '&#9662;'}</span>`;
    return `<span class="advanced-runtime-number"><span class="advanced-number-stepper dock-fsize-control"><input class="dock-fsize-inp advanced-number-input" type="number" min="${minimum}" max="${maximum}" step="${step}" value="${value}" aria-label="${escapeMarkup(label)}" ${controlAttributes(key, defaultValue)}><span class="dock-fsize-stepper" aria-label="${escapeMarkup(label)} controls"><button class="dock-fsize-step" type="button" aria-label="Increase ${escapeMarkup(label)}" onclick="stepAdvancedNumberInput(event, 'workflow-${key}', 1)">${icon('up')}</button><button class="dock-fsize-step" type="button" aria-label="Decrease ${escapeMarkup(label)}" onclick="stepAdvancedNumberInput(event, 'workflow-${key}', -1)">${icon('down')}</button></span></span><em aria-hidden="true">${escapeMarkup(unit)}</em></span>`;
  }

  function conclusionMarkup(mode, value) {
    const label = mode === 'import' ? 'Advanced Import' : 'Advanced Promote';
    const cleanValue = String(value || '');
    const editIcon = typeof global.lmIcon === 'function' ? global.lmIcon('edit', 'advanced-workflow-conclusion-edit-icon') : '';
    const syncButton = mode === 'import' ? '<button type="button" class="advanced-workflow-conclusion-sync" data-import-conclusion-sync hidden onclick="LmAdvancedImportPromoteSettings.syncImportConclusion()"></button>' : '';
    return `<section class="advanced-workflow-conclusion" data-workflow-conclusion="${mode}"><header><span><strong>Permanent conclusion — ${label}</strong><small>Saved separately for this project and used only by ${label}.</small></span>${syncButton}</header><div class="advanced-workflow-conclusion-reading ${cleanValue ? '' : 'is-empty'}" data-workflow-conclusion-reading="${mode}">${cleanValue ? escapeMarkup(cleanValue) : 'No permanent conclusion added.'}</div><textarea hidden rows="1" placeholder="Write the ${label} conclusion…" oninput="LmAdvancedImportPromoteSettings.updateConclusion('${mode}', this)" ${controlAttributes(`${mode}Conclusion`, '')}>${escapeMarkup(cleanValue)}</textarea><button type="button" class="advanced-workflow-conclusion-edit" title="Edit conclusion" aria-label="Edit conclusion" onclick="LmAdvancedImportPromoteSettings.editConclusion('${mode}')">${editIcon}</button></section>`;
  }

  function renderSectionHtml() {
    const settings = readSettings();
    const importConclusion = readPermanentConclusion('import');
    const promoteConclusion = readPermanentConclusion('promote');
    importDraftConclusionValue = readImportDraftConclusion(importConclusion);
    lastImportTarget = settings.importTarget;
    return `<div class="advanced-workflow-switcher" role="tablist" aria-label="Import and Promote settings"><button type="button" role="tab" data-workflow-view-tab="import" class="${activeWorkflowView === 'import' ? 'is-active' : ''}" aria-selected="${activeWorkflowView === 'import'}" onclick="LmAdvancedImportPromoteSettings.switchView('import')">Advanced Import</button><button type="button" role="tab" data-workflow-view-tab="promote" class="${activeWorkflowView === 'promote' ? 'is-active' : ''}" aria-selected="${activeWorkflowView === 'promote'}" onclick="LmAdvancedImportPromoteSettings.switchView('promote')">Advanced Promote</button></div>
      <div class="advanced-workflow-workspace">
      <section class="advanced-workflow-view" data-workflow-view="import" ${activeWorkflowView === 'import' ? '' : 'hidden'}>
        <header class="advanced-workflow-view-head"><span>Import workflow</span><h4>Advanced Import</h4><p>Choose the defaults used whenever imported text opens in the advanced splitter.</p></header>
        <div class="advanced-runtime-settings-list">
          <div class="advanced-runtime-setting-row"><span><strong>Default word count</strong><p>Target words used for every imported draft or chapter.</p></span>${numberControl('importWordCount', 'Import default word count', settings.importWordCount, DEFAULTS.importWordCount)}</div>
          <div class="advanced-runtime-setting-row"><span><strong>Panel text size</strong><p>Use one font size for imported source text and every generated-document preview.</p></span>${numberControl('importFontSize', 'Import panel text size', settings.importFontSize, DEFAULTS.importFontSize, { min: 10, max: 30, step: 1, unit: 'px' })}</div>
          <label class="advanced-runtime-setting-row"><span><strong>Default splitting style</strong><p>Use smart automatic boundaries or split at a repeated separator word.</p></span><select ${controlAttributes('importSplitMode', DEFAULTS.importSplitMode)} onchange="LmAdvancedImportPromoteSettings.syncImportCustomWordVisibility()"><option value="auto" ${settings.importSplitMode === 'auto' ? 'selected' : ''}>Automatic</option><option value="custom" ${settings.importSplitMode === 'custom' ? 'selected' : ''}>Separating word</option></select></label>
          <label class="advanced-runtime-setting-row" data-advanced-workflow-custom-word ${settings.importSplitMode === 'custom' ? '' : 'hidden'}><span><strong>Default splitting word</strong><p>This word is pre-filled when Separating word is selected.</p></span><input class="advanced-workflow-text" type="text" value="${escapeMarkup(settings.importCustomWord)}" placeholder="e.g. अध्याय" ${controlAttributes('importCustomWord', DEFAULTS.importCustomWord)}></label>
          <label class="advanced-runtime-setting-row"><span><strong>Imported text creates</strong><p>Create editable drafts first, or save the generated items directly as chapters.</p></span><select onchange="LmAdvancedImportPromoteSettings.handleImportTargetChange()" ${controlAttributes('importTarget', DEFAULTS.importTarget)}><option value="drafts" ${settings.importTarget === 'drafts' ? 'selected' : ''}>Drafts</option><option value="chapters" ${settings.importTarget === 'chapters' ? 'selected' : ''}>Chapters directly</option></select></label>
        </div>
        ${conclusionMarkup('import', importConclusion)}
      </section>
      <section class="advanced-workflow-view" data-workflow-view="promote" ${activeWorkflowView === 'promote' ? '' : 'hidden'}>
        <header class="advanced-workflow-view-head"><span>Promote workflow</span><h4>Advanced Promote</h4><p>These defaults apply when an existing draft is promoted into chapters.</p></header>
        <div class="advanced-runtime-settings-list">
          <div class="advanced-runtime-setting-row"><span><strong>Default word count</strong><p>Initial words-per-chapter value for Advanced Promote.</p></span>${numberControl('promoteWordCount', 'Promote default word count', settings.promoteWordCount, DEFAULTS.promoteWordCount)}</div>
          <div class="advanced-runtime-setting-row"><span><strong>Panel text size</strong><p>Use one font size for the source draft and all promoted-chapter previews.</p></span>${numberControl('promoteFontSize', 'Promote panel text size', settings.promoteFontSize, DEFAULTS.promoteFontSize, { min: 10, max: 30, step: 1, unit: 'px' })}</div>
          <label class="advanced-runtime-setting-row"><span><strong>Default destination</strong><p>Prefer the most recent part, or Raw Chapters when that destination is available.</p></span><select ${controlAttributes('promoteDestination', DEFAULTS.promoteDestination)}><option value="part" ${settings.promoteDestination === 'part' ? 'selected' : ''}>Recent part</option><option value="raw" ${settings.promoteDestination === 'raw' ? 'selected' : ''}>Raw chapters</option></select></label>
          <div class="advanced-runtime-setting-row"><span><strong>Open Promote directly above word limit</strong><p>When a draft contains more words than the configured limit, skip the Raw / Advanced choice and open Advanced Promote directly.</p></span><label class="advanced-runtime-toggle" aria-label="Open Promote directly above word limit"><input type="checkbox" ${settings.promoteAutoOpenAboveLimit ? 'checked' : ''} ${controlAttributes('promoteAutoOpenAboveLimit', DEFAULTS.promoteAutoOpenAboveLimit)}><i aria-hidden="true"></i></label></div>
        </div>
        ${conclusionMarkup('promote', promoteConclusion)}
      </section>
      </div>`;
  }

  function panelControl(key) {
    return document.querySelector(`[data-advanced-runtime-key="workflow-${key}"]`);
  }

  function syncImportCustomWordVisibility() {
    const row = document.querySelector('[data-advanced-workflow-custom-word]');
    if (row) row.hidden = panelControl('importSplitMode')?.value !== 'custom';
    if (typeof global.syncCustomSelects === 'function') global.syncCustomSelects(document.getElementById('advancedEditorSettingsModal'));
    syncImportTargetConclusionAction();
  }

  function importTarget() {
    return panelControl('importTarget')?.value === 'chapters' ? 'chapters' : 'drafts';
  }

  function handleImportTargetChange() {
    const nextTarget = importTarget();
    const importInput = panelControl('importConclusion');
    if (lastImportTarget === 'drafts' && nextTarget === 'chapters' && importInput) {
      importDraftConclusionValue = importInput.value;
    }
    lastImportTarget = nextTarget;
    syncImportTargetConclusionAction();
  }

  function syncImportTargetConclusionAction() {
    const button = document.querySelector('[data-import-conclusion-sync]');
    const importInput = panelControl('importConclusion');
    if (!button || !importInput) return;
    const directChapters = importTarget() === 'chapters';
    const expectedValue = directChapters ? String(panelControl('promoteConclusion')?.value || '') : importDraftConclusionValue;
    button.textContent = directChapters ? 'Sync Promote Conclusion' : 'Sync Draft Conclusion';
    button.hidden = importInput.value === expectedValue;
  }

  function syncImportConclusion() {
    const importInput = panelControl('importConclusion');
    if (!importInput) return;
    const directChapters = importTarget() === 'chapters';
    if (directChapters && lastImportTarget === 'drafts') importDraftConclusionValue = importInput.value;
    importInput.value = directChapters
      ? String(panelControl('promoteConclusion')?.value || '')
      : importDraftConclusionValue;
    importInput.dispatchEvent(new Event('input', { bubbles: true }));
    syncImportTargetConclusionAction();
  }

  function switchView(view) {
    activeWorkflowView = view === 'promote' ? 'promote' : 'import';
    document.querySelectorAll('[data-workflow-view-tab]').forEach(button => {
      const active = button.dataset.workflowViewTab === activeWorkflowView;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-workflow-view]').forEach(section => {
      section.hidden = section.dataset.workflowView !== activeWorkflowView;
    });
  }

  function resizeConclusionInput(input) {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }

  function editConclusion(mode) {
    const section = document.querySelector(`[data-workflow-conclusion="${mode}"]`);
    const input = panelControl(`${mode}Conclusion`);
    const reading = section?.querySelector('[data-workflow-conclusion-reading]');
    if (!section || !input || !reading) return;
    const editing = section.classList.toggle('is-editing');
    input.hidden = !editing;
    reading.hidden = editing;
    const button = section.querySelector('.advanced-workflow-conclusion-edit');
    if (button) {
      button.title = editing ? 'Finish editing conclusion' : 'Edit conclusion';
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', String(editing));
    }
    if (editing) {
      resizeConclusionInput(input);
      input.focus();
    }
  }

  function updateConclusion(mode, input) {
    resizeConclusionInput(input);
    const reading = document.querySelector(`[data-workflow-conclusion-reading="${mode}"]`);
    if (!reading) return;
    const value = String(input?.value || '');
    reading.textContent = value || 'No permanent conclusion added.';
    reading.classList.toggle('is-empty', !value);
    if (mode === 'import' && importTarget() === 'drafts') importDraftConclusionValue = value;
    syncImportTargetConclusionAction();
  }

  function settingsFromPanel(options = {}) {
    const importWordCount = clampWords(panelControl('importWordCount')?.value, NaN);
    const promoteWordCount = clampWords(panelControl('promoteWordCount')?.value, NaN);
    const importFontSize = clampFontSize(panelControl('importFontSize')?.value, NaN);
    const promoteFontSize = clampFontSize(panelControl('promoteFontSize')?.value, NaN);
    const importSplitMode = panelControl('importSplitMode')?.value === 'custom' ? 'custom' : 'auto';
    const importCustomWord = String(panelControl('importCustomWord')?.value || '').trim();
    if (!Number.isFinite(importWordCount) || !Number.isFinite(promoteWordCount) || !Number.isFinite(importFontSize) || !Number.isFinite(promoteFontSize) || (importSplitMode === 'custom' && !importCustomWord)) {
      const invalid = !Number.isFinite(importWordCount)
        ? panelControl('importWordCount')
        : !Number.isFinite(promoteWordCount)
          ? panelControl('promoteWordCount')
          : !Number.isFinite(importFontSize)
            ? panelControl('importFontSize')
            : !Number.isFinite(promoteFontSize)
              ? panelControl('promoteFontSize')
          : panelControl('importCustomWord');
      invalid?.classList.add('is-invalid');
      invalid?.focus();
      if (typeof global.showMiniReminder === 'function') global.showMiniReminder('Advanced Import / Promote defaults are incomplete.');
      return null;
    }
    const next = {
      importWordCount,
      importSplitMode,
      importCustomWord,
      importTarget: panelControl('importTarget')?.value === 'chapters' ? 'chapters' : 'drafts',
      importFontSize,
      promoteWordCount,
      promoteFontSize,
      promoteDestination: panelControl('promoteDestination')?.value === 'raw' ? 'raw' : 'part',
      promoteAutoOpenAboveLimit: Boolean(panelControl('promoteAutoOpenAboveLimit')?.checked)
    };
    if (options.save === true) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      savePermanentConclusion('import', panelControl('importConclusion')?.value || '');
      savePermanentConclusion('promote', panelControl('promoteConclusion')?.value || '');
      saveImportDraftConclusion(importDraftConclusionValue);
    }
    return next;
  }

  global.LmAdvancedImportPromoteSettings = Object.freeze({
    defaults: DEFAULTS,
    read: readSettings,
    renderSectionHtml,
    validateFromPanel: () => Boolean(settingsFromPanel()),
    saveFromPanel: () => Boolean(settingsFromPanel({ save: true })),
    switchView,
    editConclusion,
    updateConclusion,
    syncImportCustomWordVisibility,
    handleImportTargetChange,
    syncImportConclusion,
    readPermanentConclusion,
    savePermanentConclusion
  });
})(window);
