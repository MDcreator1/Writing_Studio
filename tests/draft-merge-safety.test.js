'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const source = read('assets/pages/story-novel-project-editor/js/01i-draft-promote-smart-clipboard.js');

async function scenario({ copy = false, active = 'draft', fail = '', selectedActive = false, changeProject = '' } = {}) {
  const disk = new Map([['a.txt', 'old'], ['b.txt', 'B'], ['c.txt', 'C']]);
  const events = [];
  const originalProject = {};
  const context = vm.createContext({
    console: { warn() {} }, Date, Math,
    projectDirectoryHandle: originalProject, activeDraftDetailsIndex: 'merge:selected',
    activeEditorMode: active, curDraft: 0, curChap: 0, curPart: 0,
    isChapterEditUnlocked: active === 'chapter-edit', activeChapterEditKey: 'edit-a',
    chapterDrafts: ['A', 'B', 'C'].map((content, index) => ({ id: index, title: content, content, contentPath: `${'abc'[index]}.txt` })),
    namingData: { entries: [{ id: 'name', source: { id: selectedActive ? 0 : 1 } }] },
    editorHTMLToText: value => value, textToEditorHTML: value => value,
    createDefaultDraft: () => ({}), normalizeDraft: value => value,
    normalizeDrafts: drafts => drafts.map((draft, index) => ({ ...draft, draftNo: index + 1 })),
    normalizeEditorDocumentFormatting: () => ({}), countWordsFromText: value => value.split(/\s+/).length,
    text: () => ({ draftPrefix: 'Draft' }), createNamingSource: draft => ({ id: draft.id }),
    sourcesIdentifySameDocument: (a, b) => a.id === b.id,
    namingEntryBelongsToDraft: (entry, src) => entry.source.id === src.id,
    nextDraftFilePath: () => 'merged.txt',
    showAppLoader: () => events.push('loader'), hideAppLoader: () => events.push('hide'),
    flushEditorHTMLMemoryCommit: async () => {
      events.push('flush');
      if (fail === 'flush') throw new Error('Worker failure');
      if (changeProject === 'flush') context.projectDirectoryHandle = {};
    },
    syncActiveEditorDocumentFromEditor: () => { events.push('sync'); if (active === 'draft') context.chapterDrafts[0].content = 'latest'; },
    isDraftActive: () => active === 'draft', isChapterEditDraftActive: () => active === 'chapter-edit',
    writeCurrentDraftToLocalFile: async () => {
      events.push('save-active'); if (fail === 'save') throw new Error('Permission denied');
      disk.set('a.txt', context.chapterDrafts[0].content);
      if (changeProject === 'save') context.projectDirectoryHandle = {};
    },
    writeActiveChapterEditDraftToLocalFile: async () => { events.push('save-edit'); disk.set('edit.txt', 'latest edit'); },
    ensureDraftContentLoaded: async () => fail !== 'load',
    captureNamingPromotionState: () => ({ drafts: context.chapterDrafts, naming: JSON.parse(JSON.stringify(context.namingData)) }),
    restoreNamingPromotionState: snapshot => { context.chapterDrafts = snapshot.drafts; context.namingData = snapshot.naming; events.push('rollback'); },
    clearSidebarSelections() {}, closeDraftActionsPanel() {}, persistProjectManifestSnapshot() {}, saveToStorage() {},
    loadEditor: async () => { events.push('paint'); if (fail === 'paint') throw new Error('Render failure'); },
    renderChapters() {}, renderActiveWorkspaceSidePanel() {}, updateChapterStatus() {}, setDraftBoxSaveIndicator() {}, showMiniReminder() {},
    window: { LmNamingFileSafety: { commitPromotion: async (project, { documents, removePaths }) => {
      events.push('commit'); if (fail === 'commit') throw new Error('Disk disconnected');
      for (const file of documents) disk.set(file.path, file.text);
      for (const file of removePaths) disk.delete(file);
      if (changeProject === 'commit') { context.projectDirectoryHandle = {}; context.activeEditorMode = 'other-project'; }
    } } }
  });
  vm.runInContext(source.slice(0, source.indexOf('function openSelectedDraftsPromoteDestinationPanel(')) +
    source.slice(source.indexOf('let namingPromotionBusy = false;'), source.indexOf('async function promoteDraftToChapter(')), context);
  context.isProjectDataLoading = false;
  context.autoSaveTimer = null;
  context.clearTimeout = () => {};
  const ids = selectedActive ? [0, 1] : [1, 2];
  vm.runInContext(`pendingDraftMerge = { project: projectDirectoryHandle, sources: ${JSON.stringify(ids.map(id => ({ id })))} };`, context);
  await context.confirmDraftMerge(copy);
  assert.equal(events.at(-1), 'hide', 'loader always closes');
  assert.equal(vm.runInContext('namingPromotionBusy', context), false, 'operation lock is released');
  if (!changeProject) assert.equal(context.isProjectDataLoading, false, 'loading state is restored');
  if (fail && fail !== 'paint') {
    assert.equal(disk.has('merged.txt'), false);
    assert.equal(disk.has('b.txt'), true, 'source survives failure');
    assert.equal(context.activeEditorMode, active);
    assert.equal(context.chapterDrafts.length, 3);
  } else if (changeProject && changeProject !== 'commit') {
    assert.equal(events.includes('commit'), false, 'project change cancels old merge');
  } else {
    assert.equal(disk.has('merged.txt'), true);
    if (changeProject === 'commit') assert.equal(context.activeEditorMode, 'other-project', 'old completion must not repaint the new project');
    else assert.equal(context.activeEditorMode, 'draft');
    if (active === 'draft') {
      if (copy || !selectedActive) assert.equal(disk.get('a.txt'), 'latest');
      if (selectedActive) assert.ok(disk.get('merged.txt').startsWith('latest'));
      assert.ok(events.indexOf('flush') < events.indexOf('save-active'));
      assert.ok(events.indexOf('save-active') < events.indexOf('commit'));
    }
    if (active === 'chapter-edit') assert.equal(disk.get('edit.txt'), 'latest edit');
    assert.equal(disk.has('b.txt'), copy);
  }
}

(async () => {
  for (const copy of [false, true]) {
    for (const active of ['draft', 'chapter-edit', 'review']) await scenario({ copy, active });
    await scenario({ copy, selectedActive: true });
    for (const fail of ['flush', 'save', 'load', 'commit', 'paint']) await scenario({ copy, fail });
    for (const changeProject of ['flush', 'save', 'commit']) await scenario({ copy, changeProject });
  }
  console.log('draft-merge-safety: 24 save, failure, project-switch, rollback and rendering scenarios passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
