'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const between = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const clone = value => JSON.parse(JSON.stringify(value));

async function main() {
  const events = [], frames = [], timers = [], cache = new Map(), writes = [], reminders = [];
  let normalizations = 0, failWrite = false, tick = Date.now();
  const inputs = { namingNameInp: { value: 'वीर' }, namingDescriptionInp: { value: 'पहला विवरण' } };
  const context = {
    console, Date: class extends Date { static now() { return ++tick; } },
    document: { hidden: false, getElementById: id => inputs[id] },
    requestAnimationFrame: callback => frames.push(callback),
    setTimeout: callback => timers.push(callback),
    namingData: { categories: [{ id: 'people', title: 'People' }], entries: [] },
    activeNamingCategoryId: 'people', activeEditingNamingEntryId: null,
    activeNamingSimilarNames: ['वीर', 'वीरू'], expandedNamingCategoryId: '',
    getCleanEditorText: () => 'वीर यहाँ है।',
    isNamingEntryUsedInText: (entry, text) => text.includes(entry.name),
    isTrashDraftActive: () => false,
    currentDescriptionChapterMeta: () => ({ documentId: 'draft-1' }),
    sourceFromNamingMeta: meta => meta,
    namingSourceReadView: entry => entry,
    normalizeSimilarNameValue: value => value.trim().replace(/\s+/g, ' '),
    closeNamingEntryPanel() {
      events.push('close'); context.activeEditingNamingEntryId = null; context.activeNamingSimilarNames = [];
    },
    showSidePanelSaveLine: message => events.push(message),
    renderTags: () => events.push('render'),
    text: () => ({ nameSaved: 'saved', nameEdited: 'edited' }),
    NAMING_STORAGE_KEY: 'naming', projectDirectoryHandle: { name: 'project' },
    normalizeNamingData: data => { normalizations++; return clone(data); },
    localStorage: { setItem: (key, value) => { events.push('cache'); cache.set(key, value); } },
    writeNamingDataToProject: options => {
      writes.push({ data: clone(context.namingData), options: clone(options) });
      return failWrite ? Promise.reject(new Error('disk unavailable')) : Promise.resolve(true);
    },
    showMiniReminder: message => reminders.push(message)
  };
  vm.createContext(context);
  const normalization = read('assets/shared/js/04a-state-defaults-normalization.js');
  vm.runInContext(between(normalization, 'function normalizeDescriptionForComparison', 'function migrateNamingDataset'), context);
  const storage = read('assets/shared/js/06a-project-storage-foundation.js');
  vm.runInContext(between(storage, 'function saveNamingData(', 'async function loadLocalProject('), context);
  const naming = read('assets/pages/story-novel-project-editor/js/03b-naming-categories-search.js');
  vm.runInContext(between(naming, 'let namingEntryRefreshScheduled', 'function namingEntryMentionCount('), context);

  context.saveNamingEntry();
  assert.deepEqual(events, ['close', 'saved', 'cache']);
  assert.equal(normalizations, 0, 'Single-entry Save must not normalize the whole story');
  assert.equal(context.namingData.entries.length, 1);
  assert.deepEqual(clone(context.namingData.entries[0].similarNames), ['वीरू']);
  assert.equal(context.namingData.entries[0].source.documentId, 'draft-1');
  assert.equal(JSON.parse(cache.get('naming')).entries[0].name, 'वीर', 'Recovery cache must be available immediately');
  assert.equal(writes.length, 1, 'Verified async persistence still runs');
  assert.equal(writes[0].options.skipNormalization, undefined, 'UI optimization is not a disk-write policy');
  assert.equal(frames.length, 1);

  // Another edit before paint must persist both changes and share one refresh.
  const entry = context.namingData.entries[0];
  context.activeEditingNamingEntryId = entry.id;
  context.activeNamingSimilarNames = ['वीरू'];
  inputs.namingNameInp.value = 'वीर प्रताप';
  inputs.namingDescriptionInp.value = 'नया विवरण';
  context.saveNamingEntry();
  assert.equal(frames.length, 1);
  assert.equal(entry.name, 'वीर प्रताप');
  assert.equal(entry.descriptionHistory[0].description, 'पहला विवरण');
  assert.equal(JSON.parse(cache.get('naming')).entries[0].name, 'वीर प्रताप');
  assert.equal(context.expandedNamingCategoryId, 'people');
  assert.equal(events.includes('render'), false);
  frames.shift()();
  assert.equal(events.includes('render'), false, 'Do not rebuild inside the pre-paint callback');
  timers.shift()();
  assert.equal(events.filter(event => event === 'render').length, 1);

  const writeCount = writes.length;
  context.activeEditingNamingEntryId = entry.id;
  context.activeNamingSimilarNames = ['वीरू'];
  context.saveNamingEntry();
  assert.equal(writes.length, writeCount, 'Unchanged edit does not write');
  inputs.namingNameInp.value = '   ';
  context.saveNamingEntry();
  assert.equal(writes.length, writeCount, 'Empty name does not write');

  context.saveNamingData({ allowEntryRemoval: true });
  assert.equal(normalizations, 1, 'Other storage callers keep normalization');
  assert.equal(writes.at(-1).options.allowEntryRemoval, true);
  context.document.hidden = true;
  inputs.namingNameInp.value = 'माया';
  context.activeEditingNamingEntryId = null;
  failWrite = true;
  context.console = { ...console, warn() {} };
  context.saveNamingEntry();
  assert.equal(frames.length, 0, 'Hidden pages must not wait for animation frames');
  assert.equal(JSON.parse(cache.get('naming')).entries.length, 2);
  await Promise.resolve();
  assert.equal(reminders.length, 1, 'A disk error must be visible and retain the recovery cache');
  timers.shift()();
  assert.equal(events.filter(event => event === 'render').length, 2);
  testSingleTextReadPerRender();
  console.log('Naming Save: immediate close/cache, deferred coalesced rendering, edit history, validation, and background failure recovery passed.');
}

function testSingleTextReadPerRender() {
  let textReads = 0, statusReads = 0;
  const display = { innerHTML: '' };
  const context = {
    document: { getElementById: () => display },
    namingData: { categories: Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, title: `Category ${i}`, color: 'char' })), entries: [] },
    normalizeNamingData: value => value,
    currentNamingChapterKey: () => 'draft-1',
    activeNamingPanelText: () => { textReads++; return 'वीर यहाँ है।'; },
    resetFullNamingCategoryListAfterDocumentSwitch() {},
    window: { activeNamingShowAllCategoriesKey: 'draft-1' },
    hiddenCategoriesForChapter: () => new Set(),
    namingSearchMode: 'name', namingSearchQuery: '', namingSortOption: 'status',
    namingEntriesByActiveTextPriority: (entries, text) => {
      statusReads++;
      assert.equal(text, 'वीर यहाँ है।');
      return { activeDocumentEntries: [], detectedEntries: [], existingEntries: [] };
    },
    namingCategoryGlobalCount: () => 0,
    namingCategoryAllEntriesUseOrphanStyle: () => false,
    namingCategoryHasMixedOrphanEntries: () => false,
    namingCategoryShortcutLabel: () => '',
    initializeNamingExpansionForDocument() {}, expandedNamingCategoryId: '',
    text: () => ({ addNameTitle: 'Add' }),
    escapeHtml: String, escapeJsString: String, lmChevronSpan: () => '', lmIcon: () => '',
    isFocus: false, requestAnimationFrame() {}, updateShowAllCategoriesBtnVisibility() {}, syncExpandedNamingViewport() {}
  };
  vm.createContext(context);
  const rendering = read('assets/pages/story-novel-project-editor/js/03c-naming-deep-scan-facts.js');
  vm.runInContext(between(rendering, 'function renderTags()', 'function showNameDetail('), context);
  context.renderTags();
  assert.equal(textReads, 1, 'A list rebuild reads/clones the editor text only once');
  assert.equal(statusReads, 16, 'Each category is classified once for sorting and once for its card');
  assert.equal((display.innerHTML.match(/data-category-id=/g) || []).length, 8);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
