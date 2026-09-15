'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(clone(actual), clone(expected)); checks++; };
const stamp = '2026-09-05T10:00:00.000Z';
const chapter = { id: 'c1', contentPath: 'Chapters/one.txt', title: 'One', chapterNo: 1 };
const later = { id: 'c2', contentPath: 'Chapters/two.txt', title: 'Two', chapterNo: 2 };
const draft = { id: 'd1', contentPath: 'Drafts/one.txt', title: 'Draft', draftNo: 1 };
const other = { id: 'd2', contentPath: 'Drafts/two.txt', title: 'Other', draftNo: 2 };
const context = {
  console, Date, chapters: [chapter, later], chapterDrafts: [draft, other], curChap: 0, curDraft: 0,
  chapterFilePath: index => `Chapters/${index}.txt`, draftFilePath: index => `Drafts/${index}.txt`,
  namingData: {}, isNamingEntryUsedInText: (entry, text) => [entry.name, ...(entry.similarNames || [])].some(name => text.includes(name))
};
vm.createContext(context);
const normalization = read('assets/shared/js/04a-state-defaults-normalization.js');
vm.runInContext(normalization.slice(normalization.indexOf('function isDraftContentKey'), normalization.indexOf('function currentDescriptionChapterMeta')), context);
const fresh = (name = 'Alice', source = null) => ({ id: name, categoryId: 'characters', name, similarNames: [], description: ' old\r\ntext ', descriptionHistory: [], source, createdAt: stamp, updatedAt: stamp });
const source = (document, type = 'chapter', index = 0) => context.createNamingSource(document, type, index, stamp);
const withoutSource = entry => { const result = clone(entry); delete result.source; return result; };

function testHistory() {
  equal(context.isOrphanStyleNamingEntry(fresh('Unattached')), true);
  equal(context.isOrphanStyleNamingEntry(fresh('Attached', source(chapter))), false);
  const initial = fresh();
  equal(initial.descriptionHistory, []);
  for (const next of [{ name: 'Alicia' }, { similarNames: ['Al'] }, { categoryId: 'places' }, { description: 'old\ntext' }]) {
    const entry = fresh();
    context.applyNamingEntryEdit(entry, { ...entry, ...next });
    equal(entry.descriptionHistory, []);
  }
  const entry = fresh();
  context.applyNamingEntryEdit(entry, { ...entry, description: 'new' }, 'user');
  equal(entry.descriptionHistory[0].description, ' old\r\ntext ');
  equal(Object.keys(entry.descriptionHistory[0]).sort(), ['description', 'editedAt', 'editedBy']);
  assert.ok(Date.parse(entry.descriptionHistory[0].editedAt)); checks++;
  for (let index = 0; index < 55; index++) context.applyNamingEntryEdit(entry, { ...entry, description: String(index) });
  equal(entry.descriptionHistory.length, 50);
  equal(entry.descriptionHistory.at(-1).description, '53');
  const stable = clone(entry);
  context.applyNamingEntryEdit(entry, { ...entry, description: ' 54\r\n' });
  equal(entry, stable);
}

function testCategoryOrphanStatus() {
  const core = read('assets/pages/story-novel-project-editor/js/03a-naming-panel-core.js');
  context.window = { LmInitialRendering: {
    namingCategoryCount: () => 3,
    namingCategoryOrphanCount: () => 3
  } };
  vm.runInContext(core.slice(core.indexOf('function namingEntryUsesOrphanStyle'), core.indexOf('function canDeleteNamingCategory')), context);
  equal(context.namingCategoryAllEntriesUseOrphanStyle('characters'), true);
  equal(context.namingCategoryHasMixedOrphanEntries('characters'), false);
  context.window.LmInitialRendering.namingCategoryOrphanCount = () => 2;
  equal(context.namingCategoryAllEntriesUseOrphanStyle('characters'), false);
  equal(context.namingCategoryHasMixedOrphanEntries('characters'), true);
  context.window.LmInitialRendering.namingCategoryOrphanCount = () => 0;
  equal(context.namingCategoryHasMixedOrphanEntries('characters'), false);
  context.window.LmInitialRendering.namingCategoryCount = () => 0;
  context.window.LmInitialRendering.namingCategoryOrphanCount = () => 0;
  equal(context.namingCategoryAllEntriesUseOrphanStyle('characters'), false);
}

function testHistoryDeduplication() {
  const entry = fresh();
  entry.descriptionHistory = ['A', 'B', 'C', 'C', 'C', 'C', 'C', 'D', 'D', 'A'].map((description, index) => ({
    description, editedAt: `2026-09-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`, editedBy: `user-${index}`
  }));
  const original = clone(entry);
  equal(context.deduplicateNamingDescriptionHistory(entry), 5);
  equal(entry.descriptionHistory, [0, 1, 2, 7, 9].map(index => original.descriptionHistory[index]));
  equal({ ...entry, descriptionHistory: [] }, { ...original, descriptionHistory: [] });
  equal(context.deduplicateNamingDescriptionHistory(entry), 0);
  const exact = { descriptionHistory: [{ description: '' }, { description: '' }, null, { description: '' }, { description: 'A' }, { description: 'a' }, { description: 'A ' }] };
  equal(context.deduplicateNamingDescriptionHistory(exact), 1);
  equal(exact.descriptionHistory.length, 6);
  equal(context.deduplicateNamingDescriptionHistory({}), 0);
}

function testPromotionAndRefresh() {
  const alice = fresh('Alice', source(draft, 'draft'));
  const unrelated = fresh('Other Alice', source(other, 'draft', 1));
  unrelated.similarNames = ['Alice'];
  const remainderOnly = fresh('Rem', source(draft, 'draft'));
  const missing = fresh('Gone', source(draft, 'draft'));
  const secondOnly = fresh('Later', source(draft, 'draft'));
  const entries = [alice, unrelated, remainderOnly, missing, secondOnly];
  const before = entries.map(withoutSource);
  const maps = { hiddenByChapter: { old: ['characters'] }, visibleByChapter: { old: ['places'] }, detectedByChapter: { old: ['Alice'] } };
  context.namingData = { schemaVersion: 2, entries, ...clone(maps) };
  const remainder = { ...draft, id: 'remainder', contentPath: 'Drafts/remainder.txt' };
  const args = { draftIdentity: source(draft, 'draft'), createdChapters: [
    { chapter, index: 0, text: 'Alice' }, { chapter: later, index: 1, text: 'Alice Later' }
  ], remainderDraft: { draft: remainder, index: 0, text: 'Rem Alice' }, promotedAt: stamp };
  context.remapNamesForAdvancedPromotion(args);
  equal(alice.source.documentId, 'c1');
  equal(unrelated.source.documentId, 'd2');
  equal(remainderOnly.source.documentId, 'remainder');
  equal(missing.source, null);
  equal(secondOnly.source.documentId, 'c2');
  equal(entries.map(withoutSource), before);
  for (const field of Object.keys(maps)) equal(context.namingData[field], maps[field]);
  const once = clone(entries);
  context.remapNamesForAdvancedPromotion(args);
  equal(entries, once);

  const documents = context.namingDocumentRegistry(stamp).map(item => ({ ...item, text: 'Alice' }));
  const draftCreated = fresh('Alice', source(draft, 'draft'));
  context.refreshNamingEntrySource(draftCreated, documents, '2026-09-06T09:00:00.000Z');
  equal(draftCreated.source.documentId, 'c1');
  equal(draftCreated.source.documentType, 'chapter');
  const entry = fresh('Alice', source(later, 'chapter', 1));
  entry.custom = { retained: true };
  const content = withoutSource(entry);
  context.refreshNamingEntrySource(entry, documents, '2026-09-06T10:00:00.000Z');
  equal(entry.source.documentId, 'c2');
  equal(entry.source.attachedAt, stamp);
  equal(entry.source.checkedAt, '2026-09-06T10:00:00.000Z');
  documents[1].text = '';
  context.refreshNamingEntrySource(entry, documents);
  equal(entry.source.documentId, 'c1');
  documents.forEach(item => { item.text = ''; });
  documents[2].text = 'Alice';
  context.refreshNamingEntrySource(entry, documents);
  equal(entry.source.documentId, 'd1');
  documents[2].text = '';
  context.refreshNamingEntrySource(entry, documents);
  equal(entry.source, null);
  equal(withoutSource(entry), content);
  equal(context.sourcesIdentifySameDocument(source(draft, 'draft'), { ...source(draft, 'draft'), documentId: 'different' }), false);
  equal(context.sourcesIdentifySameDocument({ documentKey: 'Drafts\\one.txt' }, source(draft, 'draft')), true);

  // Ordinary chapter scans must never resolve another draft by text alone.
  const auto = read('assets/pages/story-novel-project-editor/js/01b-history-auto-scroll.js');
  vm.runInContext(auto.slice(auto.indexOf('function resolveDraftNamingEntriesForChapter'), auto.indexOf('function activeChapterTextForNameCount')), context);
  equal(context.resolveDraftNamingEntriesForChapter(0, 'Alice', stamp), false);
  context.namingData.entries = [fresh('Alice', source(draft, 'draft')), fresh('Gone', source(draft, 'draft')), unrelated];
  context.resolveDraftNamingEntriesForChapter(0, 'Alice', stamp, source(draft, 'draft'));
  equal(context.namingData.entries.map(item => item.source?.documentId || null), ['c1', null, 'd2']);
  vm.runInContext(auto.slice(auto.indexOf('function scanNamingUsesForDocument'), auto.indexOf('function scanCurrentChapterForNamingUses')), context);
  const sourcesBeforeDetection = context.namingData.entries.map(item => item.source);
  context.scanNamingUsesForDocument(later.contentPath, 'Alice Gone', null, stamp, { resolveUnattached: false });
  equal(context.namingData.entries.map(item => item.source), sourcesBeforeDetection);
  equal(context.namingData.detectedByChapter[later.contentPath], ['Alice', 'Other Alice']);
}

function testMigration() {
  const raw = { categories: [{ id: 'characters', title: 'Characters', custom: 1 }], removedCategoryIds: ['places'],
    hiddenByChapter: { x: ['a', 'a'] }, visibleByChapter: { y: ['b'] }, detectedByChapter: { z: ['Alice'] },
    entries: [
      { ...fresh(), source: undefined, chapterStatus: 'chapter', chapterKey: chapter.contentPath, custom: { retained: true }, descriptionHistory: [{ description: 'before', updatedAt: stamp, chapterMeta: {} }, null] },
      { ...fresh('Draft'), source: undefined, chapterStatus: 'draft', draftKey: draft.contentPath },
      { ...fresh('Missing'), source: undefined, chapterStatus: 'draft', draftKey: 'Drafts/gone.txt', draftIndex: 0, draftTitle: 'Draft' },
      { ...fresh('Existing', source(later, 'chapter', 1)), chapterKey: chapter.contentPath, sourceHistory: ['old'] },
      { broken: true }, null
    ] };
  const original = clone(raw);
  const result = context.migrateNamingDataset(raw);
  equal(raw, original);
  equal(result.schemaVersion, 2);
  equal(result.entries.map(item => item.source?.documentId || null), ['c1', 'd1', null, 'c2']);
  equal(result.invalidEntries, [{ broken: true }, null]);
  equal(result.invalidDescriptionHistory, [null]);
  equal(result.entries[0].descriptionHistory, [{ description: 'before', editedAt: stamp }]);
  equal(result.entries[0].description, raw.entries[0].description);
  equal(result.entries[0].custom, raw.entries[0].custom);
  for (const key of ['categories', 'removedCategoryIds', 'hiddenByChapter', 'visibleByChapter', 'detectedByChapter']) equal(result[key], raw[key]);
  equal(context.migrateNamingDataset(result), result);
  for (const entry of result.entries) {
    assert.ok(!Object.keys(entry).some(key => ['chapterKey', 'draftKey', 'sourceHistory', 'descriptionMeta'].includes(key))); checks++;
  }
  const normalized = context.normalizeNamingData(result);
  equal(normalized, result);
  equal(normalized.entries[1].draftKey, draft.contentPath);
  equal(Object.keys(context.namingSourceReadView(fresh())).length, 9);
  const withNullSource = { ...raw, entries: [{ ...fresh(), chapterStatus: 'chapter', chapterKey: chapter.contentPath }] };
  equal(context.migrateNamingDataset(withNullSource).entries[0].source.documentId, 'c1');
  return raw;
}

function testEditorCreationAndProjection() {
  const inputs = { namingNameInp: { value: 'Alice' }, namingDescriptionInp: { value: 'first' } };
  Object.assign(context, { document: { getElementById: id => inputs[id] },
    activeNamingCategoryId: 'characters', activeEditingNamingEntryId: null, activeNamingSimilarNames: [],
    normalizeSimilarNameValue: value => value, getCleanEditorText: () => 'Alice', isTrashDraftActive: () => false,
    currentDescriptionChapterMeta: () => ({ documentType: 'chapter', chapterKey: chapter.contentPath }),
    renderTags() {}, saveNamingData() {}, closeNamingEntryPanel() {}, showSidePanelSaveLine() {}, text: () => ({})
  });
  context.namingData = context.normalizeNamingData({ schemaVersion: 2, entries: [] });
  const editor = read('assets/pages/story-novel-project-editor/js/03b-naming-categories-search.js');
  vm.runInContext(editor.slice(editor.indexOf('function saveNamingEntry'), editor.indexOf('function namingEntryMentionCount')), context);
  context.saveNamingEntry();
  const entry = context.namingData.entries[0];
  equal(Object.keys(entry).length, 9);
  equal(entry.source.documentId, 'c1');
  equal(entry.descriptionHistory, []);
  context.activeEditingNamingEntryId = entry.id;
  inputs.namingNameInp.value = 'Alicia';
  context.saveNamingEntry();
  equal(entry.descriptionHistory, []);
  inputs.namingDescriptionInp.value = 'second';
  context.saveNamingEntry();
  equal(entry.descriptionHistory[0].description, 'first');
  const rendering = read('assets/pages/story-novel-project-editor/js/00e-initial-rendering-store.js');
  vm.runInContext(rendering.slice(rendering.indexOf('  function namingEntryProjection'), rendering.indexOf('  function namingSearchNames')), context);
  equal(context.namingEntryProjection(entry).descriptionHistory, entry.descriptionHistory);
  equal(context.namingEntryProjection(entry).chapterKey, chapter.contentPath);
}

class File {
  constructor(text = '') { this.text = text; this.corrupt = false; }
  async getFile() { return { text: async () => this.text }; }
  async createWritable() {
    let pending;
    return { write: async text => { pending = text; }, close: async () => {
      this.text = this.corrupt ? '{broken' : pending; this.corrupt = false;
    } };
  }
}
class Directory {
  constructor() { this.files = new Map(); this.directories = new Map(); }
  async getFileHandle(name, options = {}) {
    if (!this.files.has(name)) {
      if (!options.create) throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
      this.files.set(name, new File());
    }
    return this.files.get(name);
  }
  async getDirectoryHandle(name, options = {}) {
    if (!this.directories.has(name)) {
      if (!options.create) throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
      this.directories.set(name, new Directory());
    }
    return this.directories.get(name);
  }
  async removeEntry(name) { this.files.delete(name); }
}

async function testDurability(raw) {
  const project = new Directory();
  Object.assign(context, { projectDirectoryHandle: project, PROJECT_NAMING_FILE: 'Story_Naming.json',
    PROJECT_DRAFTS_FILE: 'Story_Drafts.json', PROJECT_MANIFEST_FILE: 'Chapters_info.json', NAMING_STORAGE_KEY: 'naming',
    localStorage: { setItem() {} }, window: {},
    writeDraftsDataToProject: async () => { (await project.getFileHandle('Story_Drafts.json', { create: true })).text = '{"drafts":[]}'; },
    writeProjectManifest: async () => { throw new Error('manifest failure'); }
  });
  vm.runInContext(read('assets/shared/js/06aa-naming-file-safety.js'), context);
  const safety = context.window.LmNamingFileSafety;
  const file = await project.getFileHandle('Story_Naming.json', { create: true });
  file.text = JSON.stringify(raw);
  const original = file.text;
  (await project.getFileHandle('Story_Naming.pending.json', { create: true })).corrupt = true;
  await assert.rejects(safety.migrateAuthoritative(project), /JSON|position|property|Staged|Unexpected|Expected/); checks++;
  equal(file.text, original);
  const migrated = await safety.migrateAuthoritative(project);
  equal(JSON.parse(file.text), migrated);
  const backup = await (await (await project.getDirectoryHandle('Initial_Rendering')).getDirectoryHandle('Backups')).getFileHandle('Story_Naming.schema-v1.json');
  equal(backup.text, original);
  equal(await safety.migrateAuthoritative(project), migrated);
  // A source refresh applies against the latest durable dataset, even if the UI
  // holds an older description, custom field or visibility map.
  const latest = clone(migrated);
  latest.entries[0].description = 'saved during scan';
  latest.entries[0].custom = { latest: true };
  latest.visibleByChapter = { latest: ['characters'], empty: [] };
  file.text = JSON.stringify(latest);
  context.namingData = context.normalizeNamingData(migrated);
  await safety.writeCurrentProject(project, { sourcePatches: { Alice: source(later, 'chapter', 1) } });
  const refreshed = JSON.parse(file.text);
  equal(withoutSource(refreshed.entries[0]), withoutSource(latest.entries[0]));
  equal(refreshed.visibleByChapter, latest.visibleByChapter);
  equal(refreshed.entries[0].source.documentId, 'c2');
  const history = ['first', 'same', 'same', 'same', 'new', 'first'].map((description, index) => ({ description, editedAt: String(index) }));
  refreshed.entries[0].descriptionHistory = history;
  file.text = JSON.stringify(refreshed);
  // No source changes, and the runtime still has stale history: cleanup must
  // use the latest saved history and preserve meaningful returns to old text.
  await safety.writeCurrentProject(project, { sourcePatches: {}, deduplicateDescriptionHistory: true });
  const cleaned = JSON.parse(file.text);
  equal(cleaned.entries[0].descriptionHistory, [history[0], history[1], history[4], history[5]]);
  equal({ ...cleaned, entries: [] }, { ...refreshed, entries: [] });
  equal({ ...cleaned.entries[0], descriptionHistory: [] }, { ...refreshed.entries[0], descriptionHistory: [] });
  const cleanedText = file.text;
  await safety.writeCurrentProject(project, { sourcePatches: {}, deduplicateDescriptionHistory: true });
  equal(file.text, cleanedText);
  const oldDrafts = '{"drafts":[{"id":"d1"}]}';
  (await project.getFileHandle('Story_Drafts.json', { create: true })).text = oldDrafts;
  (await project.getFileHandle('Chapters_info.json', { create: true })).text = '{"chapters":[]}';
  const draftDirectory = await project.getDirectoryHandle('Drafts', { create: true });
  (await draftDirectory.getFileHandle('one.txt', { create: true })).text = 'original source';
  context.namingData = context.normalizeNamingData(migrated);
  const beforeNaming = file.text;
  await assert.rejects(safety.commitPromotion(project, { promotionId: 'one', documents: [{ path: 'Chapters/new.txt', text: 'Alice' }], removePaths: ['Drafts/one.txt'] }), /manifest failure/); checks++;
  equal(file.text, beforeNaming);
  equal((await project.getFileHandle('Story_Drafts.json')).text, oldDrafts);
  equal((await draftDirectory.getFileHandle('one.txt')).text, 'original source');
  assert.ok(!(await project.getDirectoryHandle('Chapters')).files.has('new.txt')); checks++;
  // Recovery after interruption restores the original metadata before any project load.
  (await project.getFileHandle('Story_Naming.promotion.json', { create: true })).text = JSON.stringify({ promotionId: 'two', phase: 'prepared', previousFiles: [{ path: 'Story_Drafts.json', text: oldDrafts }], removePaths: ['Drafts/one.txt'] });
  (await project.getFileHandle('Story_Drafts.json')).text = 'partial';
  await safety.recoverPromotion(project);
  equal((await project.getFileHandle('Story_Drafts.json')).text, oldDrafts);
  equal((await draftDirectory.getFileHandle('one.txt')).text, 'original source');
  context.writeProjectManifest = async () => { (await project.getFileHandle('Chapters_info.json')).text = '{"chapters":[{"id":"c1"}]}'; };
  await safety.commitPromotion(project, { promotionId: 'three', documents: [{ path: 'Chapters/new.txt', text: 'Alice' }], removePaths: ['Drafts/one.txt'] });
  equal(draftDirectory.files.has('one.txt'), false);
  equal((await (await project.getDirectoryHandle('Chapters')).getFileHandle('new.txt')).text, 'Alice');
}

(async () => {
  testHistory(); testHistoryDeduplication(); testPromotionAndRefresh(); testCategoryOrphanStatus();
  testEditorCreationAndProjection();
  await testDurability(testMigration());
  console.log(`naming-source-v2: ${checks} behavior and recovery assertions passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
