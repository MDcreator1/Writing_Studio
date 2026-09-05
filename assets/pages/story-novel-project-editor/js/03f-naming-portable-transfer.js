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
  return JSON.stringify((data.entries || []).map(entry => [entry.id, entry.name, entry.updatedAt, entry.categoryId, entry.description, entry.similarNames]));
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
  const importedOwners = new Map();
  return payload.names.map((incoming, index) => {
    const keys = namingPortableEntryKeys(incoming);
    const matches = [...new Map(keys.flatMap(key => existingByKey.get(key) || []).map(entry => [entry.id, entry])).values()];
    const exact = matches.filter(entry => namingPortableKey(entry.name) === namingPortableKey(incoming.name));
    const importedOverlap = [...new Set(keys.flatMap(key => importedOwners.get(key) || []))];
    keys.forEach(key => importedOwners.set(key, [...(importedOwners.get(key) || []), incoming.name]));
    const target = exact[0] || matches[0] || null;
    const descriptionConflict = Boolean(target && incoming.description && target.description &&
      namingPortableText(incoming.description) !== namingPortableText(target.description));
    const categoryConflict = Boolean(target && namingPortableKey(incoming.category) !== namingPortableKey(target.category));
    const ambiguous = matches.length > 1 || (!exact.length && matches.length > 0) || importedOverlap.length > 0;
    const needsReview = ambiguous || descriptionConflict || categoryConflict;
    let kind = 'new';
    if (importedOverlap.length) kind = 'import-overlap';
    else if (matches.length > 1) kind = 'multiple-match';
    else if (!exact.length && matches.length) kind = 'alias-collision';
    else if (descriptionConflict || categoryConflict) kind = 'field-conflict';
    else if (exact.length) kind = 'compatible';
    return {
      id: `portable-name-${index}`,
      incoming,
      matches,
      importedOverlap,
      kind,
      needsReview,
      action: kind === 'new' ? 'add' : ambiguous ? 'skip' : 'merge',
      targetId: target?.id || '',
      descriptionChoice: descriptionConflict ? 'existing' : incoming.description ? 'imported' : 'existing',
      categoryChoice: categoryConflict ? 'existing' : 'imported'
    };
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

function namingPortableConflictLabel(kind) {
  return ({
    'field-conflict': 'Name data differs',
    'alias-collision': 'Alias matches another name',
    'multiple-match': 'Matches multiple saved names',
    'import-overlap': 'Overlaps another imported name'
  })[kind] || 'Review required';
}

function namingPortableOption(value, label, selected) {
  return `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
}

function namingPortableConflictHTML(row) {
  const target = row.matches.find(item => item.id === row.targetId) || row.matches[0] || null;
  const actionOptions = row.matches.length
    ? [namingPortableOption('merge', 'Merge', row.action), namingPortableOption('replace', 'Replace existing', row.action), namingPortableOption('skip', 'Skip', row.action)]
    : [namingPortableOption('add', 'Add separately', row.action), namingPortableOption('skip', 'Skip', row.action)];
  const targetControl = row.matches.length > 1 ? `<label><span>Match with</span><select onchange="updatePortableNamingImportDecision('${row.id}', 'targetId', this.value)">${row.matches.map(item => namingPortableOption(item.id, item.name, row.targetId)).join('')}</select></label>` : '';
  const descriptionConflict = target && row.incoming.description && target.description && namingPortableText(row.incoming.description) !== namingPortableText(target.description);
  const categoryConflict = target && namingPortableKey(row.incoming.category) !== namingPortableKey(target.category);
  return `<article class="naming-transfer-conflict" data-portable-row="${row.id}">
    <div class="naming-transfer-conflict-head"><div><strong>${escapeHtml(row.incoming.name)}</strong><small>${escapeHtml(namingPortableConflictLabel(row.kind))}</small></div><span>${escapeHtml(row.incoming.category)}</span></div>
    <div class="naming-transfer-compare">
      <div><b>Imported</b><p>${escapeHtml(row.incoming.description || 'No description')}</p><small>${escapeHtml(row.incoming.aliases.join(', ') || 'No aliases')}</small></div>
      <div><b>Existing match</b><p>${escapeHtml(target?.description || (row.importedOverlap.length ? `Imported: ${row.importedOverlap.join(', ')}` : 'No saved match'))}</p><small>${escapeHtml(target ? [target.name, ...target.aliases].join(', ') : '')}</small></div>
    </div>
    <div class="naming-transfer-conflict-controls">
      <label><span>Action</span><select onchange="updatePortableNamingImportDecision('${row.id}', 'action', this.value)">${actionOptions.join('')}</select></label>
      ${targetControl}
      ${descriptionConflict ? `<label><span>Description</span><select onchange="updatePortableNamingImportDecision('${row.id}', 'descriptionChoice', this.value)">${namingPortableOption('existing', 'Keep existing', row.descriptionChoice)}${namingPortableOption('imported', 'Use imported', row.descriptionChoice)}</select></label>` : ''}
      ${categoryConflict ? `<label><span>Category</span><select onchange="updatePortableNamingImportDecision('${row.id}', 'categoryChoice', this.value)">${namingPortableOption('existing', 'Keep existing', row.categoryChoice)}${namingPortableOption('imported', 'Use imported', row.categoryChoice)}</select></label>` : ''}
    </div>
  </article>`;
}

function renderPortableNamingTransferPanel() {
  const modal = ensureNamingPortableTransferModal();
  const state = namingPortableTransferState;
  if (!state) {
    modal.hidden = true;
    return;
  }
  const rows = state.rows || [];
  const conflicts = rows.filter(row => row.needsReview);
  let content = '';
  let footer = '';
  if (state.stage === 'loading') {
    content = `<div class="naming-transfer-loading"><i></i><strong>Reading Naming JSON</strong><p>${escapeHtml(state.message || 'Checking format and version…')}</p></div>`;
    footer = `<button type="button" onclick="closePortableNamingTransferPanel()">Cancel</button>`;
  } else if (state.stage === 'applying') {
    content = `<div class="naming-transfer-loading"><i></i><strong>Importing and rebuilding Naming data</strong><p data-naming-transfer-progress-text>${escapeHtml(state.message || 'Preparing…')}</p><div class="naming-transfer-progress"><span data-naming-transfer-progress style="width:${Math.max(0, Math.min(100, state.progress || 0))}%"></span></div></div>`;
  } else if (state.stage === 'complete') {
    content = `<div class="naming-transfer-complete"><strong>Import complete</strong><p>${escapeHtml(state.message)}</p>${state.warning ? `<small>${escapeHtml(state.warning)}</small>` : ''}</div>`;
    footer = `<button class="is-primary" type="button" onclick="closePortableNamingTransferPanel()">Done</button>`;
  } else if (state.stage === 'failed') {
    content = `<div class="naming-transfer-complete"><strong>Import could not be loaded</strong><p>${escapeHtml(state.message)}</p>${state.warning ? `<small>${escapeHtml(state.warning)}</small>` : ''}</div>`;
    footer = `<button class="is-primary" type="button" onclick="closePortableNamingTransferPanel()">Close</button>`;
  } else {
    content = `${state.error ? `<div class="naming-transfer-error">${escapeHtml(state.error)}</div>` : ''}
      <div class="naming-transfer-version"><span>Portable JSON v${state.payload.version}</span><small>${state.payload.migrated ? `Converted from legacy/version ${state.payload.sourceVersion}` : 'Current format'}</small></div>
      <div class="naming-transfer-summary">
        <span><b>${rows.length}</b> valid names</span><span><b>${conflicts.length}</b> need review</span><span><b>${state.payload.report.invalidRows.length}</b> invalid skipped</span><span><b>${state.payload.report.mergedDuplicates}</b> duplicates merged</span>
      </div>
      ${conflicts.length ? `<div class="naming-transfer-conflict-list">${conflicts.map(namingPortableConflictHTML).join('')}</div>` : `<div class="naming-transfer-no-conflicts">No conflicts found. Names are ready for import and Deep Scan.</div>`}`;
    footer = `<button type="button" onclick="closePortableNamingTransferPanel()">Cancel</button><button class="is-primary" type="button" onclick="applyPortableNamingImport()">Import &amp; Deep Scan</button>`;
  }
  modal.innerHTML = `<section class="naming-transfer-card" role="dialog" aria-modal="true" aria-labelledby="namingTransferTitle">
    <header><div><span>Portable Naming JSON</span><h2 id="namingTransferTitle">${state.stage === 'loading' ? 'Loading import' : state.stage === 'complete' ? 'Import report' : state.stage === 'failed' ? 'Invalid import' : 'Review Naming import'}</h2></div><button type="button" onclick="closePortableNamingTransferPanel()" aria-label="Close">${window.lmIcon('close')}</button></header>
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
  namingPortableTransferState = { stage: 'loading', message: 'Checking JSON version and structure…', progress: 0, project };
  renderPortableNamingTransferPanel();
  try {
    if (file.size > 25 * 1024 * 1024) throw new Error('Naming JSON 25 MB से बड़ी नहीं हो सकती।');
    const rawText = await file.text();
    const payload = migratePortableNamingPayload(JSON.parse(rawText));
    namingPortableTransferState.message = 'Comparing imported names with this project…';
    renderPortableNamingTransferPanel();
    const fullData = normalizeNamingData(await window.LmInitialRendering?.ensureFullNamingData?.({ forceSource: true }) || namingData);
    if (project !== projectDirectoryHandle) throw new Error('Project changed while the Naming import was loading.');
    namingPortableTransferState = {
      stage: 'review', project, payload, rows: analyzePortableNamingImport(payload, fullData),
      baseRevision: namingPortableDatasetRevision(fullData), error: '', progress: 0
    };
    renderPortableNamingTransferPanel();
  } catch (error) {
    namingPortableTransferState = { stage: 'failed', message: 'JSON को review के लिए तैयार नहीं किया जा सका।', warning: error?.message || String(error), project };
    renderPortableNamingTransferPanel();
  }
}

function updatePortableNamingImportDecision(rowId, field, value) {
  const row = namingPortableTransferState?.rows?.find(item => item.id === rowId);
  if (!row || !['action', 'targetId', 'descriptionChoice', 'categoryChoice'].includes(field)) return;
  row[field] = String(value || '');
  if (field === 'targetId') renderPortableNamingTransferPanel();
}

function namingPortableSetProgress(message, progress) {
  if (!namingPortableTransferState) return;
  namingPortableTransferState.message = message;
  namingPortableTransferState.progress = progress;
  const modal = document.getElementById('namingPortableTransferModal');
  const textNode = modal?.querySelector('[data-naming-transfer-progress-text]');
  const bar = modal?.querySelector('[data-naming-transfer-progress]');
  if (textNode) textNode.textContent = message;
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, progress || 0))}%`;
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
  state.message = 'Rechecking authoritative Naming data…';
  state.progress = 2;
  renderPortableNamingTransferPanel();
  try {
    if (state.project !== projectDirectoryHandle) throw new Error('Project changed before import could begin.');
    const current = normalizeNamingData(await window.LmInitialRendering?.ensureFullNamingData?.({ forceSource: true }) || namingData);
    if (namingPortableDatasetRevision(current) !== state.baseRevision) throw new Error('Naming data changed after conflict review. Please load the JSON again.');
    const working = normalizeNamingData(JSON.parse(JSON.stringify(current)));
    working.categories = [...(working.categories || [])];
    working.entries = [...(working.entries || [])];
    const categoryMap = new Map(working.categories.map(category => [namingPortableKey(category.title), category]));
    const usedCategoryIds = new Set(working.categories.map(category => category.id));
    const usedEntryIds = new Set(working.entries.map(entry => entry.id));
    const affectedIds = new Set();
    let added = 0;
    let merged = 0;
    let replaced = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    state.rows.forEach((row, index) => {
      const incoming = row.incoming;
      if (row.action === 'skip') {
        skipped += 1;
        return;
      }
      const target = working.entries.find(entry => entry.id === row.targetId);
      if (!target || row.action === 'add') {
        const category = namingPortableEnsureCategory(working, incoming.category, categoryMap, usedCategoryIds);
        const entry = {
          id: namingPortableUniqueEntryId(usedEntryIds, index), categoryId: category.id,
          name: incoming.name, similarNames: namingPortableAliases(incoming.aliases, incoming.name),
          description: incoming.description, descriptionHistory: [], source: null,
          createdAt: now, updatedAt: now
        };
        working.entries.push(entry);
        affectedIds.add(entry.id);
        added += 1;
        return;
      }

      if (row.action === 'replace') {
        const importedCategory = namingPortableEnsureCategory(working, incoming.category, categoryMap, usedCategoryIds);
        applyNamingEntryEdit(target, {
          name: incoming.name, similarNames: incoming.aliases, categoryId: importedCategory.id,
          description: incoming.description
        }, 'portable-import');
        replaced += 1;
      } else {
        const resolvedCategoryId = row.categoryChoice === 'imported'
          ? namingPortableEnsureCategory(working, incoming.category, categoryMap, usedCategoryIds).id
          : target.categoryId;
        const aliases = namingPortableAliases([
          ...(target.similarNames || []), ...(namingPortableKey(target.name) === namingPortableKey(incoming.name) ? [] : [incoming.name]), ...incoming.aliases
        ], target.name);
        applyNamingEntryEdit(target, {
          name: target.name,
          similarNames: aliases,
          categoryId: resolvedCategoryId,
          description: row.descriptionChoice === 'imported' ? incoming.description : target.description
        }, 'portable-import');
        merged += 1;
      }
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
      message: `Added ${added}, merged ${merged}, replaced ${replaced}, skipped ${skipped}. Deep Scan checked ${affectedEntries.length} imported name(s).`,
      warning
    };
    renderPortableNamingTransferPanel();
  } catch (error) {
    console.warn('Portable Naming import failed:', error);
    state.stage = 'review';
    state.error = error?.message || String(error);
    renderPortableNamingTransferPanel();
  }
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && namingPortableTransferState?.stage !== 'applying') closePortableNamingTransferPanel();
});
