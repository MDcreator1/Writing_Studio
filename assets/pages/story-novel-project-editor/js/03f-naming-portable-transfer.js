'use strict';

const NAMING_PORTABLE_FORMAT = 'lekhak-manch.naming-portable';
const NAMING_PORTABLE_VERSION = 1;
const NAMING_PORTABLE_MAX_NAMES = 50000;
let namingPortableTransferState = null;

function namingPortableText(value = '', maximum = 200000) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, maximum);
}

function namingPortableKey(value = '') {
  return namingPortableText(value, 300).replace(/\s+/g, ' ').toLocaleLowerCase();
}

function namingPortableAliases(values, name = '') {
  const primary = namingPortableKey(name);
  return [...new Map((Array.isArray(values) ? values : [])
    .map(value => namingPortableText(value, 300).replace(/\s+/g, ' '))
    .filter(value => value && namingPortableKey(value) !== primary)
    .map(value => [namingPortableKey(value), value])).values()].slice(0, 100);
}

function namingPortableCategoryTitle(value, categoryById = new Map()) {
  if (value && typeof value === 'object') return namingPortableText(value.title || value.name || value.id, 200);
  const raw = namingPortableText(value, 200);
  return categoryById.get(raw)?.title || raw || 'Character Names';
}

function namingPortableCanonicalName(source, categoryById = new Map()) {
  const item = source && typeof source === 'object' ? source : {};
  const name = namingPortableText(item.name || item.title, 300).replace(/\s+/g, ' ');
  if (!name) return null;
  return {
    name,
    aliases: namingPortableAliases(item.aliases || item.similarNames || item.alternateNames, name),
    category: namingPortableCategoryTitle(item.category || item.categoryTitle || item.categoryId, categoryById),
    description: namingPortableText(item.description ?? item.latestDescription ?? item.details)
  };
}

function migratePortableNamingPayload(raw) {
  if (!raw || (typeof raw !== 'object' && !Array.isArray(raw))) throw new Error('यह JSON object या names array नहीं है।');
  if (raw.format && raw.format !== NAMING_PORTABLE_FORMAT) throw new Error(`Unknown Naming import format: ${raw.format}`);
  const version = raw.format === NAMING_PORTABLE_FORMAT ? Number(raw.version) : 0;
  if (!Number.isInteger(version) || version < 0) throw new Error('Naming import version valid number नहीं है।');
  if (version > NAMING_PORTABLE_VERSION) {
    throw new Error(`यह Naming JSON version ${version} है; यह app अभी version ${NAMING_PORTABLE_VERSION} तक support करता है।`);
  }

  const categories = Array.isArray(raw.categories) ? raw.categories : [];
  const categoryById = new Map(categories.map(category => [String(category?.id || category?.title || ''), category || {}]));
  const sourceNames = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.names)
      ? raw.names
      : Array.isArray(raw.entries)
        ? raw.entries
        : [];
  if (sourceNames.length > NAMING_PORTABLE_MAX_NAMES) throw new Error(`एक file में अधिकतम ${NAMING_PORTABLE_MAX_NAMES} names import किए जा सकते हैं।`);

  const invalidRows = [];
  const canonical = [];
  sourceNames.forEach((item, index) => {
    const normalized = namingPortableCanonicalName(item, categoryById);
    if (normalized) canonical.push(normalized);
    else invalidRows.push(index + 1);
  });
  if (!canonical.length) throw new Error('इस JSON में कोई valid Naming entry नहीं मिली।');

  const byPrimary = new Map();
  let mergedDuplicates = 0;
  canonical.forEach(item => {
    const key = namingPortableKey(item.name);
    const previous = byPrimary.get(key);
    if (!previous) {
      byPrimary.set(key, item);
      return;
    }
    mergedDuplicates += 1;
    previous.aliases = namingPortableAliases([...previous.aliases, ...item.aliases], previous.name);
    if (item.description) previous.description = item.description;
    if (item.category) previous.category = item.category;
  });

  return {
    format: NAMING_PORTABLE_FORMAT,
    version: NAMING_PORTABLE_VERSION,
    sourceVersion: version,
    migrated: version !== NAMING_PORTABLE_VERSION,
    names: [...byPrimary.values()],
    report: { invalidRows, mergedDuplicates, inputCount: sourceNames.length }
  };
}

function portableNamingExportPayload(data) {
  const normalized = normalizeNamingData(data);
  const categories = new Map((normalized.categories || []).map(category => [category.id, category.title || category.id]));
  return {
    format: NAMING_PORTABLE_FORMAT,
    version: NAMING_PORTABLE_VERSION,
    names: (normalized.entries || []).map(entry => ({
      name: namingPortableText(entry.name, 300),
      aliases: namingPortableAliases(entry.similarNames, entry.name),
      category: categories.get(entry.categoryId) || entry.categoryId || 'Character Names',
      description: namingPortableText(entry.description)
    }))
  };
}

function namingPortableEntryKeys(entry) {
  return [...new Set([entry.name, ...(entry.aliases || entry.similarNames || [])].map(namingPortableKey).filter(Boolean))];
}

function namingPortableDatasetRevision(data) {
  const normalized = normalizeNamingData(data);
  const categories = (normalized.categories || [])
    .map(category => [String(category.id || ''), namingPortableKey(category.title || category.id)])
    .sort((left, right) => left[0].localeCompare(right[0]));
  const entries = (normalized.entries || [])
    .map(entry => [
      String(entry.id || ''),
      namingPortableKey(entry.name),
      String(entry.categoryId || ''),
      namingPortableText(entry.description),
      namingPortableAliases(entry.similarNames || entry.aliases, entry.name).map(namingPortableKey).sort()
    ])
    .sort((left, right) => left[0].localeCompare(right[0]));
  return JSON.stringify({ categories, entries });
}

function validatePortableNamingImportTargets(rows, currentData) {
  const normalized = normalizeNamingData(currentData);
  const currentEntries = new Map((normalized.entries || []).map(entry => [String(entry.id), entry]));
  const currentByKey = new Map();
  currentEntries.forEach(entry => namingPortableEntryKeys(entry).forEach(key => {
    if (!currentByKey.has(key)) currentByKey.set(key, []);
    currentByKey.get(key).push(entry);
  }));
  for (const row of rows || []) {
    const currentMatches = [...new Map(namingPortableEntryKeys(row.incoming)
      .flatMap(key => currentByKey.get(key) || []).map(entry => [String(entry.id), entry])).values()];
    if (row.action === 'add' && !row.matches.length && currentMatches.length) {
      return { valid: false, reason: `“${row.incoming.name}” now matches saved Naming data. Review the JSON again.` };
    }
    if (!row.targetId || row.targetId.startsWith('pending-')) continue;
    const target = currentEntries.get(String(row.targetId));
    if (!target) return { valid: false, reason: `The selected match for “${row.incoming.name}” no longer exists. Review the JSON again.` };
    if (!currentMatches.some(entry => String(entry.id) === String(row.targetId))) {
      return { valid: false, reason: `The selected match for “${row.incoming.name}” changed. Review the JSON again.` };
    }
  }
  return { valid: true };
}

function analyzePortableNamingImport(payload, existingData) {
  const normalized = normalizeNamingData(existingData);
  const categoryTitles = new Map((normalized.categories || []).map(category => [category.id, category.title || category.id]));
  const existing = (normalized.entries || []).map(entry => ({
    id: entry.id,
    name: entry.name,
    aliases: [...(entry.similarNames || [])],
    categoryId: entry.categoryId,
    category: categoryTitles.get(entry.categoryId) || entry.categoryId || '',
    description: String(entry.description || ''),
    keys: namingPortableEntryKeys(entry)
  }));
  const existingByKey = new Map();
  existing.forEach(entry => entry.keys.forEach(key => {
    if (!existingByKey.has(key)) existingByKey.set(key, []);
    existingByKey.get(key).push(entry);
  }));
  return payload.names.map((incoming, index) => {
    const keys = namingPortableEntryKeys(incoming);
    const matches = [...new Map(keys.flatMap(key => existingByKey.get(key) || []).map(entry => [entry.id, entry])).values()];
    const exact = matches.filter(entry => namingPortableKey(entry.name) === namingPortableKey(incoming.name));
    const importedOverlap = matches.filter(entry => entry.pendingRowId).map(entry => entry.name);
    const target = exact[0] || matches[0] || null;
    const descriptionConflict = Boolean(target && incoming.description && target.description &&
      namingPortableText(incoming.description) !== namingPortableText(target.description));
    const categoryConflict = Boolean(target && namingPortableKey(incoming.category) !== namingPortableKey(target.category));
    const aliasConflict = Boolean(target && JSON.stringify([...target.aliases].map(namingPortableKey).sort()) !==
      JSON.stringify([...incoming.aliases].map(namingPortableKey).sort()));
    const titleAliasConflict = Boolean(!exact.length && matches.length);
    const multipleMatch = matches.length > 1;
    const conflicts = {
      category: categoryConflict,
      description: descriptionConflict,
      aliases: Boolean(aliasConflict && !titleAliasConflict),
      titleAlias: titleAliasConflict,
      multiple: multipleMatch,
      pending: false
    };
    const needsReview = Object.values(conflicts).some(Boolean);
    let kind = 'new';
    if (multipleMatch) kind = 'multiple-match';
    else if (titleAliasConflict) kind = 'alias-collision';
    else if (needsReview) kind = 'field-conflict';
    else if (exact.length) kind = 'compatible';
    const row = {
      id: `portable-name-${index}`,
      incoming,
      matches,
      importedOverlap,
      kind, conflicts,
      needsReview,
      action: kind === 'new' ? 'add' : 'merge',
      targetId: multipleMatch ? '' : (target?.id || ''),
      categoryChoice: categoryConflict ? '' : (target ? 'existing' : 'imported'),
      descriptionChoice: descriptionConflict ? '' : (incoming.description ? 'imported-edit' : 'existing'),
      aliasChoice: conflicts.aliases ? '' : 'merge',
      titleChoice: titleAliasConflict ? '' : 'existing',
      includeChoice: conflicts.pending ? '' : 'include'
    };
    const pending = {
      id: `pending-${row.id}`, pendingRowId: row.id, name: incoming.name,
      aliases: [...incoming.aliases], category: incoming.category,
      description: incoming.description, keys
    };
    keys.forEach(key => {
      if (!existingByKey.has(key)) existingByKey.set(key, []);
      existingByKey.get(key).push(pending);
    });
    return row;
  });
}

function ensureNamingPortableTransferModal() {
  let modal = document.getElementById('namingPortableTransferModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'namingPortableTransferModal';
  modal.className = 'naming-transfer-modal';
  modal.hidden = true;
  modal.addEventListener('click', event => {
    if (event.target === modal) closePortableNamingTransferPanel();
  });
  document.body.appendChild(modal);
  return modal;
}

const NAMING_PORTABLE_SECTIONS = [
  ['category', 'Category mismatching'], ['description', 'Description mismatching'],
  ['aliases', 'Aliases mismatching'], ['titleAlias', 'Aliases match, title differs'],
  ['multiple', 'Matches multiple saved names'], ['pending', 'Imported-name collision']
];

function namingPortableTarget(row) {
  return row.matches.find(item => item.id === row.targetId) || row.matches[0] || null;
}

function namingPortableDecisionRequired(row, type) {
  if (!row.conflicts?.[type]) return false;
  if (type === 'category') return !row.categoryChoice;
  if (type === 'description') return !row.descriptionChoice;
  if (type === 'aliases') return !row.aliasChoice;
  if (type === 'titleAlias') return !row.titleChoice;
  if (type === 'multiple') return !row.targetId;
  if (type === 'pending') return !row.includeChoice;
  return false;
}

function namingPortableResolution(state) {
  const decisions = (state.rows || []).flatMap(row => NAMING_PORTABLE_SECTIONS
    .filter(([type]) => row.conflicts?.[type]).map(([type]) => !namingPortableDecisionRequired(row, type)));
  const resolved = decisions.filter(Boolean).length;
  return { resolved, total: decisions.length, unresolved: decisions.length - resolved };
}

function namingPortableChoice(row, field, value, label) {
  return `<button type="button" class="naming-transfer-choice ${row[field] === value ? 'is-selected' : ''}" onclick="updatePortableNamingImportDecision('${row.id}', '${field}', '${value}')">${escapeHtml(label)}</button>`;
}

function namingPortableSectionRowHTML(row, type) {
  const target = namingPortableTarget(row);
  let controls = '';
  if (type === 'category') controls = `${namingPortableChoice(row, 'categoryChoice', 'existing', target?.category || 'Existing category')}${namingPortableChoice(row, 'categoryChoice', 'imported', row.incoming.category || 'Imported category')}`;
  if (type === 'description') controls = `<button class="naming-transfer-preview-btn" type="button" onclick="openPortableNamingDescriptionPreview('${row.id}')" title="Preview both descriptions">↗</button>${namingPortableChoice(row, 'descriptionChoice', 'existing', 'Use existing')}${namingPortableChoice(row, 'descriptionChoice', 'imported-edit', 'Merge as edit')}${namingPortableChoice(row, 'descriptionChoice', 'imported-clear', 'Use imported')}`;
  if (type === 'aliases') controls = `${namingPortableChoice(row, 'aliasChoice', 'existing', 'Use existing')}${namingPortableChoice(row, 'aliasChoice', 'merge', 'Merge aliases')}${namingPortableChoice(row, 'aliasChoice', 'imported', 'Use imported')}`;
  if (type === 'titleAlias') {
    const shared = row.matches.flatMap(item => item.keys.filter(key => namingPortableEntryKeys(row.incoming).includes(key)));
    controls = `<span class="naming-transfer-shared">${escapeHtml([...new Set(shared)].join(', ') || 'Shared alias')}</span>${namingPortableChoice(row, 'titleChoice', 'existing', target?.name || 'Existing title')}${namingPortableChoice(row, 'titleChoice', 'imported', row.incoming.name)}`;
  }
  if (type === 'multiple') controls = `<label class="naming-transfer-target"><span>Match with</span><select onchange="updatePortableNamingImportDecision('${row.id}', 'targetId', this.value)"><option value="">Choose a saved name…</option>${row.matches.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === row.targetId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>`;
  if (type === 'pending') controls = `<span class="naming-transfer-shared">Also overlaps: ${escapeHtml(row.importedOverlap.join(', '))}</span>${namingPortableChoice(row, 'includeChoice', 'include', 'Resolve with saved match')}${namingPortableChoice(row, 'includeChoice', 'exclude', 'Do not import this name')}`;
  return `<article class="naming-transfer-review-row"><strong>${escapeHtml(row.incoming.name)}</strong><div class="naming-transfer-row-controls">${controls}</div></article>`;
}

function namingPortableBulkHTML(type, count) {
  const choices = type === 'category' ? [['categoryChoice','existing','Keep existing for all'],['categoryChoice','imported','Use imported for all']]
    : type === 'description' ? [['descriptionChoice','existing','Existing for all'],['descriptionChoice','imported-edit','Merge as edit for all'],['descriptionChoice','imported-clear','Imported for all']]
    : type === 'aliases' ? [['aliasChoice','existing','Existing for all'],['aliasChoice','merge','Merge for all'],['aliasChoice','imported','Imported for all']]
    : type === 'titleAlias' ? [['titleChoice','existing','Existing titles for all'],['titleChoice','imported','Imported titles for all']]
    : type === 'pending' ? [['includeChoice','include','Resolve all'],['includeChoice','exclude','Exclude all']]
    : [];
  return choices.length ? `<div class="naming-transfer-header-actions"><span>${count} conflicts</span>${choices.map(([field,value,label]) => `<button type="button" onclick="applyPortableNamingBulkDecision('${type}','${field}','${value}')">${label}</button>`).join('')}</div>` : '';
}

function namingPortableReviewHTML(state) {
  const active = state.activeSection || NAMING_PORTABLE_SECTIONS.find(([type]) => state.rows.some(row => row.conflicts?.[type]))?.[0];
  state.activeSection = active;
  const sectionRows = state.rows.filter(row => row.conflicts?.[active]);
  return `<div class="naming-transfer-review-layout">
    <nav class="naming-transfer-review-nav" aria-label="Conflict types">${NAMING_PORTABLE_SECTIONS.map(([type,label]) => {
      const rows = state.rows.filter(row => row.conflicts?.[type]);
      if (!rows.length) return '';
      const unresolved = rows.filter(row => namingPortableDecisionRequired(row, type)).length;
      return `<button type="button" class="${active === type ? 'is-active' : ''}" onclick="selectPortableNamingSection('${type}')"><span>${escapeHtml(label)}</span><b>${unresolved ? `${unresolved}/${rows.length}` : `✓ ${rows.length}`}</b></button>`;
    }).join('')}</nav>
    <section class="naming-transfer-review-content"><header><div><small>Conflict group</small><h3>${escapeHtml(NAMING_PORTABLE_SECTIONS.find(([type]) => type === active)?.[1] || 'Ready')}</h3></div>${namingPortableBulkHTML(active, sectionRows.length)}</header><div class="naming-transfer-review-rows">${sectionRows.map(row => namingPortableSectionRowHTML(row, active)).join('') || '<p>No conflicts in this section.</p>'}</div></section>
  </div>`;
}

function namingPortableSummaryHTML(state) {
  const rows = state.rows || [];
  const importedCategories = [...new Set(rows.map(row => namingPortableKey(row.incoming.category)).filter(Boolean))];
  const existingCategories = new Set((state.existingCategoryTitles || rows.flatMap(row => row.matches.filter(match => !match.pendingRowId).map(match => match.category))).map(namingPortableKey).filter(Boolean));
  const matchedCategories = importedCategories.filter(category => existingCategories.has(category)).length;
  const titleMatches = rows.filter(row => row.matches.some(match => !match.pendingRowId && namingPortableKey(match.name) === namingPortableKey(row.incoming.name))).length;
  const aliasMatches = rows.filter(row => row.matches.some(match => !match.pendingRowId && match.keys.some(key => namingPortableEntryKeys(row.incoming).includes(key))) && !row.matches.some(match => !match.pendingRowId && namingPortableKey(match.name) === namingPortableKey(row.incoming.name))).length;
  return `<div class="naming-transfer-summary"><span><b>${titleMatches}</b>Existing title matches</span><span><b>${aliasMatches}</b>Existing alias matches</span><span><b>${rows.length}</b>Imported names</span><span><b>${importedCategories.length}</b>Total categories</span><span class="is-match"><b>${matchedCategories}</b>Categories matched</span><span class="is-new"><b>${importedCategories.length - matchedCategories}</b>New categories</span></div>`;
}

function namingPortableHeaderCopy(state = {}) {
  if (state.stage === 'loading' && state.phase === 'compare') return { kicker: 'Project comparison', title: 'Comparing Naming data', description: 'Checking imported names against this project.' };
  if (state.stage === 'loading') return { kicker: 'Naming import', title: 'Validating Naming JSON', description: 'Checking the selected file and its format.' };
  if (state.stage === 'review') return { kicker: 'Conflict review', title: 'Resolve Naming conflicts', description: 'Choose which saved or imported values should be kept.' };
  if (state.stage === 'applying' && state.phase === 'scan') return { kicker: 'Deep Scan', title: 'Scanning imported names', description: 'Checking names across chapters and drafts.' };
  if (state.stage === 'applying' && state.phase === 'save') return { kicker: 'Saving import', title: 'Saving verified Naming data', description: 'Writing the resolved names safely to the project.' };
  if (state.stage === 'applying' && state.phase === 'rebuild') return { kicker: 'Refreshing views', title: 'Rebuilding Naming snapshots', description: 'Updating document views with the imported names.' };
  if (state.stage === 'applying') return { kicker: 'Import & Deep Scan', title: 'Preparing the Naming import', description: 'Rechecking project data before changes are applied.' };
  if (state.stage === 'complete') return { kicker: 'Import complete', title: 'Naming data is ready', description: 'The import and Deep Scan finished successfully.' };
  return { kicker: 'Import stopped', title: 'Naming import could not finish', description: 'Review the error below before trying again.' };
}

function renderPortableNamingTransferPanel() {
  const modal = ensureNamingPortableTransferModal();
  const state = namingPortableTransferState;
  if (!state) {
    modal.hidden = true;
    return;
  }
  modal.dataset.stage = state.stage || 'review';
  modal.querySelector('.naming-transfer-description-preview')?.remove();
  const rows = state.rows || [];
  const conflicts = rows.filter(row => row.needsReview);
  const stageCopy = namingPortableHeaderCopy(state);
  let content = '';
  let footer = '';
  if (state.stage === 'loading') {
    content = `<div class="naming-transfer-loading"><i></i><strong>Checking Naming data</strong><p>${escapeHtml(state.message || 'Checking format and version…')}</p></div>`;
    footer = `<button type="button" onclick="closePortableNamingTransferPanel()">Cancel</button>`;
  } else if (state.stage === 'applying') {
    content = `<div class="naming-transfer-loading"><i></i><strong>Import &amp; Deep Scan in progress</strong><p data-naming-transfer-progress-text>${escapeHtml(state.message || 'Preparing…')}</p><div class="naming-transfer-progress"><span data-naming-transfer-progress style="width:${Math.max(0, Math.min(100, state.progress || 0))}%"></span></div></div>`;
  } else if (state.stage === 'complete') {
    const report = state.report || {};
    content = `<div class="naming-transfer-complete"><div class="naming-transfer-complete-heading"><i>✓</i><div><strong>Import complete</strong><p>Naming data was imported, verified and refreshed successfully.</p></div></div><div class="naming-transfer-complete-tags"><span><b>${report.added || 0}</b>Added</span><span><b>${report.merged || 0}</b>Merged</span><span><b>${report.replaced || 0}</b>Replaced</span><span><b>${report.excluded || 0}</b>Not imported</span><span><b>${report.scanned || 0}</b>Deep scanned</span></div>${state.warning ? `<small>${escapeHtml(state.warning)}</small>` : ''}<button class="naming-transfer-complete-done" type="button" onclick="closePortableNamingTransferPanel()">Done</button></div>`;
  } else if (state.stage === 'failed') {
    content = `<div class="naming-transfer-complete"><strong>Import could not be loaded</strong><p>${escapeHtml(state.message)}</p>${state.warning ? `<small>${escapeHtml(state.warning)}</small>` : ''}</div>`;
    footer = `<button class="is-primary" type="button" onclick="closePortableNamingTransferPanel()">Close</button>`;
  } else {
    const resolution = namingPortableResolution(state);
    const progress = resolution.total ? resolution.resolved / resolution.total * 100 : 100;
    content = `${state.error ? `<div class="naming-transfer-error">${escapeHtml(state.error)}</div>` : ''}
      <div class="naming-transfer-version"><div><strong>Import overview</strong><small>The status tags below compare imported names and categories with this project's saved Naming data.</small></div><span>JSON v${state.payload.version}${state.payload.migrated ? ` · converted from v${state.payload.sourceVersion}` : ''}</span></div>
      ${namingPortableSummaryHTML(state)}
      ${conflicts.length ? namingPortableReviewHTML(state) : `<div class="naming-transfer-no-conflicts">No conflicts found. Names are ready for import and Deep Scan.</div>`}`;
    footer = `<div class="naming-transfer-resolution"><div><span style="width:${progress}%"></span></div><small><b>${resolution.resolved}</b> of ${resolution.total} conflicts resolved · ${resolution.unresolved} unresolved</small></div><button type="button" onclick="closePortableNamingTransferPanel()">Cancel</button><button class="is-primary" type="button" onclick="applyPortableNamingImport()" ${resolution.unresolved ? 'disabled title="Resolve every conflict before importing"' : ''}>Import &amp; Deep Scan</button>`;
  }
  modal.innerHTML = `<section class="naming-transfer-card" role="dialog" aria-modal="true" aria-labelledby="namingTransferTitle">
    <header><div class="naming-transfer-heading"><h2 id="namingTransferTitle" data-naming-transfer-title>${escapeHtml(stageCopy.title)}</h2><p data-naming-transfer-description>${escapeHtml(stageCopy.description)}</p></div><button type="button" onclick="closePortableNamingTransferPanel()" aria-label="Close">${window.lmIcon('close')}</button></header>
    <div class="naming-transfer-body">${content}</div>
    ${footer ? `<footer>${footer}</footer>` : ''}
  </section>`;
  modal.hidden = false;
}

function closePortableNamingTransferPanel() {
  if (namingPortableTransferState?.stage === 'applying') return;
  namingPortableTransferState = null;
  const modal = document.getElementById('namingPortableTransferModal');
  if (modal) modal.hidden = true;
}

function openPortableNamingImportPicker() {
  if (typeof hasActiveStory === 'function' && !hasActiveStory()) return;
  const input = document.getElementById('namingPortableImportInput');
  if (!input) return;
  input.value = '';
  input.click();
}

async function exportPortableNamingData() {
  if (typeof hasActiveStory === 'function' && !hasActiveStory()) return;
  try {
    const fullData = normalizeNamingData(await window.LmInitialRendering?.ensureFullNamingData?.({ forceSource: true }) || namingData);
    const payload = portableNamingExportPayload(fullData);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const projectTitle = namingPortableText(projectManifest?.title || projectManifest?.name || 'story', 100).replace(/[\\/:*?"<>|]+/g, '-');
    link.href = URL.createObjectURL(blob);
    link.download = `${projectTitle || 'story'}-naming-v${NAMING_PORTABLE_VERSION}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    if (typeof showMiniReminder === 'function') showMiniReminder(`Exported ${payload.names.length} portable Naming entries.`);
  } catch (error) {
    console.warn('Portable Naming export failed:', error);
    if (typeof showMiniReminder === 'function') showMiniReminder(error?.message || 'Naming export failed.');
  }
}

async function loadPortableNamingImportFile(file) {
  if (!file) return;
  const project = projectDirectoryHandle;
  namingPortableTransferState = { stage: 'loading', phase: 'validate', message: 'Checking JSON version and structure…', progress: 0, project };
  renderPortableNamingTransferPanel();
  try {
    if (file.size > 25 * 1024 * 1024) throw new Error('Naming JSON 25 MB से बड़ी नहीं हो सकती।');
    const rawText = await file.text();
    const payload = migratePortableNamingPayload(JSON.parse(rawText));
    namingPortableTransferState.phase = 'compare';
    namingPortableTransferState.message = 'Comparing imported names with this project…';
    renderPortableNamingTransferPanel();
    const fullData = normalizeNamingData(await window.LmInitialRendering?.ensureFullNamingData?.({ forceSource: true }) || namingData);
    if (project !== projectDirectoryHandle) throw new Error('Project changed while the Naming import was loading.');
    namingPortableTransferState = {
      stage: 'review', project, payload, rows: analyzePortableNamingImport(payload, fullData),
      existingCategoryTitles: (fullData.categories || []).map(category => category.title || category.id),
      baseRevision: namingPortableDatasetRevision(fullData), error: '', progress: 0
    };
    if (namingPortableTransferState.rows.some(row => row.needsReview)) renderPortableNamingTransferPanel();
    else await applyPortableNamingImport();
  } catch (error) {
    namingPortableTransferState = { stage: 'failed', message: 'JSON को review के लिए तैयार नहीं किया जा सका।', warning: error?.message || String(error), project };
    renderPortableNamingTransferPanel();
  }
}

function updatePortableNamingImportDecision(rowId, field, value) {
  const row = namingPortableTransferState?.rows?.find(item => item.id === rowId);
  if (!row || !['action', 'targetId', 'descriptionChoice', 'categoryChoice', 'aliasChoice', 'titleChoice', 'includeChoice'].includes(field)) return;
  row[field] = String(value || '');
  if (field === 'targetId' && row.targetId) {
    const target = namingPortableTarget(row);
    if (target) {
      row.conflicts.category = namingPortableKey(row.incoming.category) !== namingPortableKey(target.category);
      row.conflicts.description = Boolean(row.incoming.description && target.description && namingPortableText(row.incoming.description) !== namingPortableText(target.description));
      row.conflicts.titleAlias = namingPortableKey(row.incoming.name) !== namingPortableKey(target.name);
      row.conflicts.aliases = !row.conflicts.titleAlias && JSON.stringify([...row.incoming.aliases].map(namingPortableKey).sort()) !== JSON.stringify([...(target.aliases || [])].map(namingPortableKey).sort());
      row.categoryChoice = row.conflicts.category ? '' : 'existing';
      row.descriptionChoice = row.conflicts.description ? '' : (row.incoming.description ? 'imported-edit' : 'existing');
      row.aliasChoice = row.conflicts.aliases ? '' : 'merge';
      row.titleChoice = row.conflicts.titleAlias ? '' : 'existing';
    }
  }
  renderPortableNamingTransferPanel();
}

function selectPortableNamingSection(type) {
  if (!namingPortableTransferState || !NAMING_PORTABLE_SECTIONS.some(([key]) => key === type)) return;
  namingPortableTransferState.activeSection = type;
  renderPortableNamingTransferPanel();
}

function applyPortableNamingBulkDecision(type, field, value) {
  const state = namingPortableTransferState;
  if (!state?.rows) return;
  state.rows.filter(row => row.conflicts?.[type]).forEach(row => { row[field] = value; });
  renderPortableNamingTransferPanel();
}

function openPortableNamingDescriptionPreview(rowId) {
  const row = namingPortableTransferState?.rows?.find(item => item.id === rowId);
  if (!row) return;
  const target = namingPortableTarget(row);
  namingPortableTransferState.previewRowId = rowId;
  const modal = ensureNamingPortableTransferModal();
  modal.insertAdjacentHTML('beforeend', `<div class="naming-transfer-description-preview" role="dialog" aria-modal="true" aria-label="Description comparison"><section><header><div><small>Description comparison</small><h3>${escapeHtml(row.incoming.name)}</h3></div><button type="button" onclick="closePortableNamingDescriptionPreview()" aria-label="Close">×</button></header><div class="naming-transfer-description-columns"><article><b>Existing</b><p>${escapeHtml(target?.description || 'No description')}</p></article><i aria-hidden="true"></i><article><b>Imported</b><p>${escapeHtml(row.incoming.description || 'No description')}</p></article></div></section></div>`);
}

function closePortableNamingDescriptionPreview() {
  namingPortableTransferState && (namingPortableTransferState.previewRowId = '');
  document.querySelector('.naming-transfer-description-preview')?.remove();
}

function namingPortableSetProgress(message, progress) {
  if (!namingPortableTransferState) return;
  namingPortableTransferState.message = message;
  namingPortableTransferState.progress = progress;
  namingPortableTransferState.phase = /snapshot|rebuild/i.test(message) ? 'rebuild'
    : /saving|writing verified/i.test(message) ? 'save'
      : /reading chapters|reading source|deep scan|scanning imported/i.test(message) ? 'scan'
        : 'prepare';
  const modal = document.getElementById('namingPortableTransferModal');
  const textNode = modal?.querySelector('[data-naming-transfer-progress-text]');
  const bar = modal?.querySelector('[data-naming-transfer-progress]');
  const copy = namingPortableHeaderCopy(namingPortableTransferState);
  const kicker = modal?.querySelector('[data-naming-transfer-kicker]');
  const title = modal?.querySelector('[data-naming-transfer-title]');
  const description = modal?.querySelector('[data-naming-transfer-description]');
  if (textNode) textNode.textContent = message;
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, progress || 0))}%`;
  if (kicker) kicker.textContent = copy.kicker;
  if (title) title.textContent = copy.title;
  if (description) description.textContent = copy.description;
}

function namingPortableUniqueEntryId(usedIds, index) {
  const baseId = `name-import-${Date.now()}-${index}`;
  let id = baseId;
  let suffix = 1;
  while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
  usedIds.add(id);
  return id;
}

function namingPortableEnsureCategory(working, title, categoryMap, usedCategoryIds) {
  const key = namingPortableKey(title || 'Character Names');
  if (categoryMap.has(key)) return categoryMap.get(key);
  const cleanedTitle = namingPortableText(title || 'Character Names', 200);
  const baseId = namingCategoryId(cleanedTitle);
  let id = baseId;
  let suffix = 2;
  while (usedCategoryIds.has(id)) id = `${baseId}-${suffix++}`;
  usedCategoryIds.add(id);
  const category = { id, title: cleanedTitle, color: 'other', info: '' };
  working.categories.push(category);
  categoryMap.set(key, category);
  return category;
}

async function applyPortableNamingImport() {
  const state = namingPortableTransferState;
  if (!state || state.stage !== 'review') return;
  state.stage = 'applying';
  state.phase = 'prepare';
  state.message = 'Rechecking authoritative Naming data…';
  state.progress = 2;
  renderPortableNamingTransferPanel();
  try {
    const resolution = namingPortableResolution(state);
    if (resolution.unresolved) throw new Error(`Resolve all ${resolution.unresolved} remaining conflicts before importing.`);
    if (state.project !== projectDirectoryHandle) throw new Error('Project changed before import could begin.');
    const current = normalizeNamingData(await window.LmInitialRendering?.ensureFullNamingData?.({ forceSource: true }) || namingData);
    const targetValidation = validatePortableNamingImportTargets(state.rows, current);
    if (!targetValidation.valid) throw new Error(targetValidation.reason);
    const working = normalizeNamingData(JSON.parse(JSON.stringify(current)));
    working.categories = [...(working.categories || [])];
    working.entries = [...(working.entries || [])];
    const categoryMap = new Map(working.categories.map(category => [namingPortableKey(category.title), category]));
    const usedCategoryIds = new Set(working.categories.map(category => category.id));
    const usedEntryIds = new Set(working.entries.map(entry => entry.id));
    const affectedIds = new Set();
    const importedTargetIds = new Map();
    let added = 0;
    let merged = 0;
    let replaced = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    state.rows.forEach((row, index) => {
      const incoming = row.incoming;
      if (row.includeChoice === 'exclude') {
        skipped += 1;
        return;
      }
      const resolvedTargetId = row.targetId.startsWith('pending-')
        ? importedTargetIds.get(row.targetId.slice('pending-'.length))
        : row.targetId;
      const target = working.entries.find(entry => entry.id === resolvedTargetId);
      if (!target || row.action === 'add') {
        const category = namingPortableEnsureCategory(working, incoming.category, categoryMap, usedCategoryIds);
        const entry = {
          id: namingPortableUniqueEntryId(usedEntryIds, index), categoryId: category.id,
          name: incoming.name, similarNames: namingPortableAliases(incoming.aliases, incoming.name),
          description: incoming.description, descriptionHistory: [], source: null,
          createdAt: now, updatedAt: now
        };
        working.entries.push(entry);
        importedTargetIds.set(row.id, entry.id);
        affectedIds.add(entry.id);
        added += 1;
        return;
      }

      const resolvedCategoryId = row.categoryChoice === 'imported'
        ? namingPortableEnsureCategory(working, incoming.category, categoryMap, usedCategoryIds).id
        : target.categoryId;
      const resolvedName = row.titleChoice === 'imported' ? incoming.name : target.name;
      const existingAliases = target.similarNames || target.aliases || [];
      let aliases = existingAliases;
      if (row.aliasChoice === 'imported') aliases = incoming.aliases;
      else if (row.aliasChoice === 'merge' || row.conflicts?.titleAlias) aliases = [
        ...existingAliases, ...(namingPortableKey(target.name) === namingPortableKey(incoming.name) ? [] : [row.titleChoice === 'imported' ? target.name : incoming.name]), ...incoming.aliases
      ];
      const nextDescription = row.descriptionChoice === 'existing' ? target.description : incoming.description;
      applyNamingEntryEdit(target, {
        name: resolvedName,
        similarNames: namingPortableAliases(aliases, resolvedName),
        categoryId: resolvedCategoryId,
        description: nextDescription
      }, 'portable-import');
      if (row.descriptionChoice === 'imported-clear') target.descriptionHistory = [];
      merged += 1;
      importedTargetIds.set(row.id, target.id);
      affectedIds.add(target.id);
    });

    const affectedEntries = working.entries.filter(entry => affectedIds.has(entry.id));
    let sourceIndex = null;
    if (affectedEntries.length) {
      namingPortableSetProgress('Reading chapters and drafts for Deep Scan…', 12);
      sourceIndex = await window.LmNamingDeepScanSource.buildTextIndex({
        onProgress: ({ loaded, total }) => namingPortableSetProgress(`Reading source documents ${loaded}/${total}…`, 12 + (total ? loaded / total * 24 : 24))
      });
      if (state.project !== projectDirectoryHandle) throw new Error('Project changed during Naming Deep Scan.');
      const checkedAt = new Date().toISOString();
      const documents = namingDocumentRegistry(checkedAt).map(item => ({
        ...item,
        text: item.documentType === 'draft' ? sourceIndex.draftTexts[item.index] : sourceIndex.chapterTexts[item.index]
      }));
      for (let index = 0; index < affectedEntries.length; index++) {
        refreshNamingEntrySource(affectedEntries[index], documents, checkedAt);
        if (index % 8 === 0) {
          namingPortableSetProgress(`Deep scanning imported names ${index + 1}/${affectedEntries.length}…`, 38 + (index / affectedEntries.length * 32));
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    }

    namingPortableSetProgress('Saving verified Naming data…', 74);
    await writeNamingDataToProject({ authoritativeData: working, deduplicateDescriptionHistory: true });
    if (state.project !== projectDirectoryHandle) throw new Error('Project changed before Naming save completed.');
    let warning = '';
    try {
      namingPortableSetProgress('Rebuilding document Naming snapshots…', 82);
      await window.LmInitialRendering?.rebuildAllNamingDocumentStates?.({
        scope: { mode: 'all' }, sourceIndex,
        onProgress: ({ written, total }) => namingPortableSetProgress(`Writing Naming snapshots ${written}/${total}…`, 82 + (total ? written / total * 17 : 17))
      });
    } catch (snapshotError) {
      console.warn('Portable Naming import snapshot rebuild failed:', snapshotError);
      warning = 'Names सुरक्षित रूप से save हो गए, लेकिन rendering snapshots दोबारा नहीं बन सके। अगला Deep Scan इन्हें बना देगा।';
    }
    renderTags();
    namingPortableTransferState = {
      stage: 'complete', project: state.project,
      report: { added, merged, replaced, excluded: skipped, scanned: affectedEntries.length },
      warning
    };
    renderPortableNamingTransferPanel();
  } catch (error) {
    console.warn('Portable Naming import failed:', error);
    state.stage = 'failed';
    state.message = 'Naming import could not be completed.';
    state.warning = error?.message || String(error);
    renderPortableNamingTransferPanel();
  }
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && namingPortableTransferState?.stage !== 'applying') closePortableNamingTransferPanel();
});
