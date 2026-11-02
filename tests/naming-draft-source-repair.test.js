'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const chapters = [
  { id: 'c1', contentPath: 'Chapters/one.txt', title: 'One', chapterNo: 1, content: 'पहला अध्याय' },
  { id: 'c2', contentPath: 'Chapters/two.txt', title: 'Two', chapterNo: 2, content: 'यहाँ Alice पहली बार अध्याय में है' }
];
const drafts = [{ id: 'd1', contentPath: 'Drafts/one.txt', title: 'Draft', draftNo: 1, content: 'Alice और Bob' }];
const context = vm.createContext({
  console,
  Date,
  setTimeout,
  window: {},
  projectDirectoryHandle: null,
  chapters,
  chapterDrafts: drafts,
  curChap: 0,
  curDraft: 0,
  chapterFilePath: index => `Chapters/${index}.txt`,
  draftFilePath: index => `Drafts/${index}.txt`,
  htmlToPlainText: value => String(value || ''),
  normalizeScanText: value => String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim(),
  isNamingEntryUsedInText: (entry, text) => [entry.name, ...(entry.similarNames || [])].some(name => String(text).includes(name))
});

const normalization = read('assets/shared/js/04a-state-defaults-normalization.js');
vm.runInContext(normalization.slice(normalization.indexOf('function isDraftContentKey'), normalization.indexOf('function currentDescriptionChapterMeta')), context);
vm.runInContext(read('assets/pages/story-novel-project-editor/js/03aa-naming-deep-scan-source.js'), context);

const draftSource = context.createNamingSource(drafts[0], 'draft', 0, '2026-09-06T10:00:00.000Z');
const entries = [
  { id: 'alice', name: 'Alice', similarNames: [], source: { ...draftSource } },
  { id: 'bob', name: 'Bob', similarNames: [], source: { ...draftSource } }
];

(async () => {
  const result = await context.window.LmNamingDeepScanSource.repairDraftSourcesSeenInChapters({
    entries,
    triggerTexts: ['Alice'],
    checkedAt: '2026-09-06T11:00:00.000Z'
  });
  assert.equal(result.updatedCount, 1);
  assert.equal(entries[0].source.documentType, 'chapter');
  assert.equal(entries[0].source.documentId, 'c2');
  assert.equal(entries[1].source.documentType, 'draft', 'unrelated draft names remain untouched');
  assert.equal(result.sourceIndex.draftTexts.every(value => value === undefined), true, 'targeted repair does not read draft bodies');

  const pending = [{ id: 'pending', name: 'Unsaved', similarNames: [], source: { ...draftSource } }];
  const pendingResult = await context.window.LmNamingDeepScanSource.repairDraftSourcesSeenInChapters({
    entries: pending,
    triggerTexts: ['Unsaved']
  });
  assert.equal(pendingResult.updatedCount, 0);
  assert.equal(pending[0].source.documentType, 'draft', 'an editor-only occurrence cannot detach its source before chapter autosave');

  context.projectDirectoryHandle = { name: 'project' };
  context.getProjectFileHandle = async contentPath => {
    if (contentPath === 'Drafts/one.txt') {
      const error = new Error('The requested file could not be found.');
      error.name = 'NotFoundError';
      throw error;
    }
    return { contentPath };
  };
  context.readFileText = async handle => handle.contentPath.includes('two.txt') ? 'Alice in chapter' : 'First chapter';
  const tolerantIndex = await context.window.LmNamingDeepScanSource.buildTextIndex({ tolerateReadErrors: true });
  assert.equal(tolerantIndex.readErrors.length, 1, 'tolerant scans report each unreadable source');
  assert.equal(tolerantIndex.readErrors[0].contentPath, 'Drafts/one.txt');
  assert.equal(tolerantIndex.draftTexts[0], '', 'an unreadable source is represented by empty scan text');
  const freshEntries = () => [{ id: 'alice', name: 'Alice', similarNames: [], source: { ...draftSource } }];
  context.getProjectFileHandle = async contentPath => {
    if (contentPath === 'Chapters/one.txt') throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    return { contentPath };
  };
  context.readFileText = async () => 'Alice in later chapter';
  const blocked = freshEntries();
  const incomplete = await context.window.LmNamingDeepScanSource.repairDraftSourcesSeenInChapters({ entries: blocked, triggerTexts: ['Alice'] });
  assert.equal(incomplete.incomplete, true);
  assert.equal(incomplete.updatedCount, 0);
  assert.equal(blocked[0].source.documentType, 'draft', 'failed early chapter must not become a false absence');
  context.getProjectFileHandle = async contentPath => ({ contentPath });
  context.readFileText = async () => 'Alice in saved chapter';
  const retried = await context.window.LmNamingDeepScanSource.repairDraftSourcesSeenInChapters({ entries: blocked, triggerTexts: ['Alice'] });
  assert.equal(retried.updatedCount, 1);
  assert.equal(blocked[0].source.documentId, 'c1', 'a successful retry selects the earliest saved occurrence');
  for (const chapterTexts of [[, 'Alice'], ['Alice']]) {
    const sparseEntries = freshEntries();
    const sparse = await context.window.LmNamingDeepScanSource.repairDraftSourcesSeenInChapters({ entries: sparseEntries, sourceIndex: { chapterTexts } });
    assert.equal(sparse.incomplete, true);
    assert.equal(sparseEntries[0].source.documentType, 'draft');
  }
  const draftErrorEntries = freshEntries();
  await context.window.LmNamingDeepScanSource.repairDraftSourcesSeenInChapters({ entries: draftErrorEntries,
    sourceIndex: { chapterTexts: ['Alice', 'Alice'], readErrors: [{ documentType: 'draft', index: 0 }] } });
  assert.equal(draftErrorEntries[0].source.documentId, 'c1', 'an unrelated draft error does not invalidate a complete chapter scan');
  const switchedEntries = freshEntries();
  let switched = false;
  const oldProject = context.projectDirectoryHandle;
  context.readFileText = async () => { if (!switched) { switched = true; context.projectDirectoryHandle = {}; } return 'Alice'; };
  await assert.rejects(context.window.LmNamingDeepScanSource.repairDraftSourcesSeenInChapters({ entries: switchedEntries }), /Project changed/);
  assert.equal(switchedEntries[0].source.documentType, 'draft');
  context.projectDirectoryHandle = oldProject;
  context.readFileText = async () => { if (chapters[0].id === 'c1') chapters.reverse(); return 'Alice'; };
  const reorderedEntries = freshEntries();
  await assert.rejects(context.window.LmNamingDeepScanSource.repairDraftSourcesSeenInChapters({ entries: reorderedEntries }), /structure changed/);
  assert.equal(reorderedEntries[0].source.documentType, 'draft');
  chapters.reverse();
  console.log('naming-draft-source-repair: chapter promotion and targeted scan passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
