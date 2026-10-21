'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', 'assets/pages/story-novel-project-editor/js', file), 'utf8');
const panels = read('03c-naming-deep-scan-facts.js');
const clone = value => JSON.parse(JSON.stringify(value));

function fixture(total, active = 0) {
  const display = { innerHTML: '' }, globalRow = { hidden: false }, notices = [];
  let reads = 0;
  const entries = Array.from({ length: total }, (_, i) => ({
    id: `name-${i}`, name: `[Name${i}]`, similarNames: [`[Alias${i}]`], categoryId: 'people',
    createdAt: i === 0 ? '2099-01-01' : '2000-01-01', updatedAt: i === 0 ? '2099-01-01' : '2000-01-01',
    source: { documentType: 'chapter', documentId: 'chapter-old' }, visible: i < active
  }));
  const snapshotScores = new Map(entries.map((entry, index) => [entry.id, index >= Math.max(0, total - 10) ? 1 : 0]));
  const context = {
    console, setTimeout: callback => callback(), clearTimeout() {}, requestAnimationFrame() {},
    document: { getElementById: id => id === 'tag-display' ? display : null, querySelector: () => globalRow },
    projectDirectoryHandle: { name: 'Story' }, documentKey: 'Drafts/one.txt', expandedNamingCategoryId: 'people',
    namingData: { categories: [{ id: 'people', title: 'People', color: 'char' }], entries },
    chapters: [{ id: 'chapter-old' }, { id: 'chapter-new' }],
    window: {
      categorySortOption: 'status', categorySearchQuery: '',
      LmInitialRendering: {
        ensureNamingCategoryData: async () => {},
        namingChapterOccurrenceScores: items => new Map(items.map(entry => [entry.id, snapshotScores.get(entry.id) ?? -1])),
        warmNamingChapterOccurrences: () => { reads++; }
      },
      LmNamingDeepScanSource: { buildTextIndex() { throw new Error('Pagination must never read chapter bodies'); } }
    },
    currentNamingChapterKey: () => context.documentKey,
    normalizeNamingData: value => value, activeNamingPanelText: () => 'active text',
    namingEntriesByActiveTextPriority: items => ({ activeDocumentEntries: items.filter(e => e.visible), detectedEntries: [], existingEntries: items.filter(e => !e.visible) }),
    isNamingEntryUsedInText: (entry, text) => [entry.name, ...entry.similarNames].some(name => text.includes(name)),
    namingEntryItemHtml: entry => `<i data-entry="${entry.id}"></i>`,
    namingEntryUsesOrphanStyle: () => false,
    initialNamingCategoriesForActiveDocument: () => context.namingData.categories,
    initializeNamingExpansionForDocument() {}, hiddenCategoriesForChapter: () => new Set(),
    namingSearchMode: 'name', namingSearchQuery: '', namingSortOption: 'status',
    namingCategoryGlobalCount: () => total, namingCategoryAllEntriesUseOrphanStyle: () => false,
    namingCategoryHasMixedOrphanEntries: () => false, namingCategoryShortcutLabel: () => '',
    escapeHtml: String, escapeJsString: String, lmChevronSpan: () => '', lmIcon: () => '',
    isFocus: false, updateShowAllCategoriesBtnVisibility() {}, showMiniReminder: message => notices.push(message),
    text: () => ({ showOtherNames: 'Show Other Names', hideExistingNames: 'Hide Names', noTagsInChapter: 'None in chapter', noTags: 'None' })
  };
  vm.createContext(context);
  vm.runInContext(read('03d-naming-category-sort.js'), context);
  vm.runInContext(panels.slice(panels.indexOf('function categorySortBarHtml'), panels.indexOf('function initialNamingCategoriesForActiveDocument')), context);
  vm.runInContext(panels.slice(panels.indexOf('function renderTags()'), panels.indexOf('function showNameDetail(')), context);
  return { context, entries, display, globalRow, notices, reads: () => reads,
    shown: () => (display.innerHTML.match(/data-entry=/g) || []).length };
}

async function testPages() {
  for (const total of [1, 19, 20, 21, 40, 41, 65]) {
    const f = fixture(total), c = f.context;
    c.renderTags();
    assert.equal(f.shown(), 0);
    const original = clone(c.namingData);
    for (let expected = Math.min(total, 20); ; expected = Math.min(total, expected + 20)) {
      if (total - f.shown() <= 20) await c.showAllNamesForCategory('people');
      else await c.showExistingNamesForCategory('people');
      assert.equal(f.shown(), expected, `Page size for total ${total}`);
      const more = expected < total;
      assert.equal(f.display.innerHTML.includes('onclick="showExistingNamesForCategory('), total - expected > 20);
      assert.equal(f.display.innerHTML.includes('onclick="showAllNamesForCategory('), more);
      assert.equal(f.display.innerHTML.includes('onclick="hideExistingNamesForCategory('), !more);
      if (!more) break;
    }
    assert.equal(f.reads(), 1, 'Additional pages must not restart snapshot warmup');
    assert.deepEqual(clone(c.namingData), original, 'Reading occurrences must not alter names or their source');
    assert.equal(c.window.categorySortOption, 'occurrence');
    assert.equal(f.globalRow.hidden, true);
    c.hideExistingNamesForCategory('people');
    assert.equal(f.shown(), 0);
    assert.equal(c.expandedNamingCategoryId, 'people');
    assert.equal(f.globalRow.hidden, false);
    assert.equal(c.window.namingCategoryVisibleCount, 0);
  }
  const f = fixture(65, 3);
  f.context.renderTags();
  assert.equal(f.shown(), 3);
  await f.context.showExistingNamesForCategory('people');
  assert.equal(f.shown(), 23, 'The next 20 follow the initial visible allowance');
  await f.context.showExistingNamesForCategory('people');
  assert.equal(f.shown(), 43);
  f.context.hideExistingNamesForCategory('people');
  assert.equal(f.shown(), 3, 'Hide returns to the original active-document names');
  const manyActive = fixture(65, 25);
  manyActive.context.renderTags();
  assert.equal(manyActive.shown(), 25);
  await manyActive.context.showExistingNamesForCategory('people');
  assert.equal(manyActive.shown(), 45);
  manyActive.context.hideExistingNamesForCategory('people');
  assert.equal(manyActive.shown(), 25, 'Hide preserves the existing behavior even with over 20 active names');
}

async function testOccurrenceAndFilters() {
  const f = fixture(65), c = f.context;
  await c.showExistingNamesForCategory('people');
  const sorted = c.getCategoryFilteredSortedEntries('people', f.entries);
  assert.ok(sorted.slice(0, 10).every(e => Number(e.id.split('-')[1]) >= 55), 'Aliases in the newest chapter outrank older chapter names');
  assert.ok(sorted.findIndex(e => e.id === 'name-0') >= 10, 'Future creation/edit dates and original attachment cannot affect occurrence ordering');
  c.namingData.entries.push({ id: 'unseen', name: 'Never Seen', similarNames: [], categoryId: 'people', createdAt: '2100-01-01' });
  assert.equal(c.getCategoryFilteredSortedEntries('people', c.namingData.entries).at(-1).id, 'unseen');
  c.window.categorySearchQuery = '[Name6';
  c.window.namingCategoryVisibleCount = 20;
  c.renderTags();
  assert.equal(f.shown(), 6);
  assert.equal(f.display.innerHTML.includes('onclick="hideExistingNamesForCategory('), true);
  c.window.categorySearchQuery = '';
  c.setCategorySortOption('people', 'time');
  assert.equal(c.window.namingCategoryVisibleCount, 20);
  assert.equal(f.shown(), 20);
  assert.equal(c.getCategoryFilteredSortedEntries('people', c.namingData.entries)[0].id, 'unseen');
  c.documentKey = 'Drafts/two.txt';
  c.resetFullNamingCategoryListAfterDocumentSwitch();
  assert.equal(c.window.activeExpandedCategoryWithShowMore, null);
  assert.equal(c.window.namingCategoryOccurrenceOrder, null);
}

async function testStaleAndFailedLoads() {
  const f = fixture(40), c = f.context;
  let release;
  c.window.LmInitialRendering.ensureNamingCategoryData = () => new Promise(resolve => { release = resolve; });
  const button = { disabled: false, setAttribute() {}, removeAttribute() {} };
  const load = c.showExistingNamesForCategory('people', button);
  await Promise.resolve();
  assert.equal(button.disabled, true);
  await c.showExistingNamesForCategory('people', button);
  c.documentKey = 'Drafts/changed.txt';
  release();
  await load;
  assert.equal(button.disabled, false);
  assert.equal(c.window.activeExpandedCategoryWithShowMore, undefined);
  c.window.LmInitialRendering.ensureNamingCategoryData = async () => {};
  await c.showExistingNamesForCategory('people', button);
  assert.equal(f.notices.length, 0);
  assert.equal(f.shown(), 20);
  c.hideExistingNamesForCategory('people');
  c.window.LmInitialRendering.ensureNamingCategoryData = async () => { throw new Error('read failed'); };
  c.console = { ...console, error() {} };
  await c.showExistingNamesForCategory('people', button);
  assert.equal(button.disabled, false);
  assert.equal(f.notices.length, 1);
  assert.equal(c.window.activeExpandedCategoryWithShowMore, null);
}

async function testImmediatePageAndStableLayout() {
  const f = fixture(65), c = f.context;
  let release, bar = false;
  c.window.LmInitialRendering.warmNamingChapterOccurrences = () => new Promise(resolve => { release = resolve; });
  const list = { innerHTML: '', insertAdjacentHTML: () => { bar = true; } };
  const card = { dataset: { categoryId: 'people' }, querySelector: selector => selector === '.category-entries' ? list : bar ? {} : null };
  f.display.querySelectorAll = () => [card];
  c.renderTags = () => { throw new Error('A pagination click must not rebuild the entire Naming panel'); };
  await c.showExistingNamesForCategory('people');
  assert.equal((list.innerHTML.match(/data-entry=/g) || []).length, 20, 'First page cannot wait for background snapshot reads');
  assert.match(list.innerHTML, /class="naming-existing-toggle-row"><button class="show-existing-names-btn"/);
  assert.equal(bar, true);
  await c.showExistingNamesForCategory('people');
  assert.equal((list.innerHTML.match(/data-entry=/g) || []).length, 40);
  assert.match(list.innerHTML, /class="naming-existing-toggle-row"><button class="show-existing-names-btn"/);
  release();
  await Promise.resolve();
  assert.equal((list.innerHTML.match(/data-entry=/g) || []).length, 40, 'Background completion preserves the revealed count');
}

async function testShowAllNames() {
  for (const active of [0, 3, 25]) {
    const f = fixture(65, active), c = f.context;
    const original = clone(c.namingData);
    c.renderTags();
    assert.equal(f.display.innerHTML.includes('onclick="showAllNamesForCategory('), true);
    await c.showAllNamesForCategory('people');
    assert.equal(f.shown(), 65);
    assert.equal(c.window.categorySortOption, 'occurrence');
    assert.equal(f.display.innerHTML.includes('onclick="showExistingNamesForCategory('), false);
    assert.equal(f.display.innerHTML.includes('onclick="showAllNamesForCategory('), false);
    assert.equal(f.display.innerHTML.includes('onclick="hideExistingNamesForCategory('), true);
    const ids = [...f.display.innerHTML.matchAll(/data-entry="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(ids, Array.from(c.getCategoryFilteredSortedEntries('people', f.entries), entry => entry.id));
    c.hideExistingNamesForCategory('people');
    assert.equal(f.shown(), active);
    assert.deepEqual(clone(c.namingData), original);
  }
  // Exactly one page left exposes only Show All, both initially and mid-list.
  const f = fixture(40), c = f.context;
  c.renderTags();
  await c.showExistingNamesForCategory('people');
  assert.equal(f.shown(), 20);
  assert.equal(f.display.innerHTML.includes('onclick="showExistingNamesForCategory('), false);
  assert.equal(f.display.innerHTML.includes('onclick="showAllNamesForCategory('), true);
  await c.showAllNamesForCategory('people');
  assert.equal(f.shown(), 40);
  c.hideExistingNamesForCategory('people');
  await c.showExistingNamesForCategory('people');
  c.window.categorySearchQuery = '[Name3';
  c.window.namingCategoryVisibleCount = 20;
  c.renderTags();
  assert.equal(f.shown(), 11, 'Existing search filtering is preserved');
}

(async () => {
  await testPages();
  await testOccurrenceAndFilters();
  await testStaleAndFailedLoads();
  await testImmediatePageAndStableLayout();
  await testShowAllNames();
  console.log('Naming category: snapshot ordering, immediate 20-name pages, stable button layout, filters, and hide/reset passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
