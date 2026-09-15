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
  console.log('naming-draft-source-repair: chapter promotion and targeted scan passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
