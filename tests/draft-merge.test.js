'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const source = read('assets/pages/story-novel-project-editor/js/01i-draft-promote-smart-clipboard.js');
const storage = read('assets/shared/js/06a-project-storage-foundation.js');
const context = vm.createContext({
  editorHTMLToText: value => value,
  escapeHtml: value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;'),
  createDefaultDraft: () => ({}),
  normalizeDraft: draft => draft,
  normalizeDrafts: drafts => drafts.map((draft, i) => ({ ...draft, draftNo: i + 1 })),
  normalizeEditorDocumentFormatting: () => ({}),
  countWordsFromText: value => value.trim().split(/\s+/).length,
  text: () => ({ draftPrefix: 'Draft' })
});
vm.runInContext(storage.slice(storage.indexOf('function textToEditorHTML('), storage.indexOf('function storageWordCountFromText(')), context);
vm.runInContext(source.slice(source.indexOf('function buildDraftMerge('), source.indexOf('async function confirmDraftMerge(')), context);
const drafts = ['zero', 'first\nlast', 'untouched', 'next\nend', 'tail'].map((content, id) => ({ id, content, title: `D${id}`, contentPath: `${id}.txt`, notes: [id] }));
const before = JSON.stringify(drafts);
const merged = context.buildDraftMerge(drafts, [3, 1], false, 'merged.txt');
assert.equal(merged.index, 1);
assert.equal(merged.mergedText, 'first\nlast\n\nnext\nend');
assert.equal(merged.merged.content, '<p>first</p><p>last</p><p><br></p><p>next</p><p>end</p>');
assert.deepEqual(Array.from(merged.drafts, draft => draft.contentPath), ['0.txt', 'merged.txt', '2.txt', '4.txt']);
assert.deepEqual(Array.from(merged.drafts, draft => draft.draftNo), [1, 2, 3, 4]);
const copied = context.buildDraftMerge(drafts, [3, 1], true, 'copy.txt');
assert.equal(copied.index, 0);
assert.deepEqual(Array.from(copied.drafts, draft => draft.contentPath), ['copy.txt', '0.txt', '1.txt', '2.txt', '3.txt', '4.txt']);
assert.equal(JSON.stringify(drafts), before);
assert.equal(context.buildDraftMerge(drafts, [4, 3, 2, 1, 0], false, 'all.txt').drafts.length, 1);
assert.throws(() => context.buildDraftMerge(drafts, [1, 1], false, 'bad.txt'));
assert.throws(() => context.buildDraftMerge(drafts, [1, 9], false, 'bad.txt'));
console.log('Draft merge tests passed.');
