'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

class Project {
  constructor() { this.files = new Map(); this.hook = () => {}; this.removeHook = () => {}; this.failRemove = false; }
  async getFileHandle(name, options = {}) { return this.handle(name, options); }
  async getDirectoryHandle(name) {
    return {
      getDirectoryHandle: next => this.getDirectoryHandle(`${name}/${next}`),
      getFileHandle: (next, options) => this.handle(`${name}/${next}`, options),
      removeEntry: next => this.removeEntry(`${name}/${next}`)
    };
  }
  handle(name, options = {}) {
    if (!this.files.has(name)) {
      if (!options.create) throw Object.assign(new Error('Missing file'), { name: 'NotFoundError' });
      this.files.set(name, '');
    }
    return {
      getFile: async () => ({ text: async () => this.files.get(name) }),
      createWritable: async () => {
        let text;
        return { write: async value => { text = String(value); }, close: async () => {
          this.files.set(name, text);
          await this.hook(name, text);
        } };
      }
    };
  }
  async removeEntry(name) {
    if (this.failRemove && name.startsWith('Chapters/')) throw new Error('Disk disconnected');
    this.files.delete(name);
    await this.removeHook(name);
  }
}

class Element {
  constructor() { this.listeners = {}; this.textContent = ''; this.disabled = false; this.value = 0; }
  addEventListener(type, callback, options) { (this.listeners[type] ||= []).push({ callback, once: options?.once }); }
  fire(type) {
    const listeners = [...(this.listeners[type] || [])];
    this.listeners[type] = listeners.filter(listener => !listener.once);
    listeners.forEach(({ callback }) => callback({ preventDefault() {} }));
  }
  focus() {}
  setAttribute() {}
  removeAttribute() {}
}

function harness() {
  const project = new Project();
  const naming = { categories: [], entries: [{ id: 'one', name: 'वीर', source: { documentType: 'draft' } }] };
  const originalDraft = { id: 'source-draft', title: 'Existing draft', content: 'untouched draft', contentPath: 'Drafts/original.txt', notes: ['Keep this note'], alignment: 'justify', fontSize: 20 };
  const originalChapter = { title: 'Existing chapter', content: 'untouched chapter', contentPath: 'Chapters/chapter_01.txt' };
  let dialog;
  const messages = [], updates = [], cache = new Map();
  const context = vm.createContext({
    console: { warn() {} }, setTimeout, Date, performance,
    projectDirectoryHandle: project, projectManifest: { title: 'Test', type: 'novel', parts: [], facts: [{ keyword: 'legacy fact' }] },
    chapters: [originalChapter], chapterDrafts: [originalDraft], namingData: naming,
    curChap: 0, curDraft: 0, curPart: -1, activeEditorMode: 'draft',
    isChapterEditUnlocked: true, activeChapterEditKey: 'edit-key', expandedPartIndex: 0,
    isRawChapterSectionExpanded: false, isPartsListCollapsedByRaw: false, isPartsListForceExpanded: false,
    chapterListOverflowMode: 'collapsed', selectedDraftIndexes: new Set([0]), lastSelectedDraftIndex: 0,
    PROJECT_NAMING_FILE: 'Story_Naming.json', PROJECT_DRAFTS_FILE: 'Story_Drafts.json', PROJECT_MANIFEST_FILE: 'Chapters_info.json',
    normalizeNamingData: clone, normalizeProjectManifest: clone, normalizeDraft: clone,
    normalizeDrafts: value => value.map(clone), normalizeChapter: clone,
    advancedPromoteNormalizedText: value => String(value || '').trim(),
    advancedPromoteWordCount: value => value.split(/\s+/).length,
    textToEditorHTML: value => value,
    createDefaultDraft: index => ({ title: `Draft ${index + 1}`, notes: [] }),
    advancedPromoteDefaultTitle: (base, index) => `${base} ${index + 1}`,
    advancedImportDocumentTitle: (state, index) => `${state.draftTitle} ${index + 1}`,
    advancedPromoteUniqueChapterTitle: title => title,
    chapterFilePath: index => `Chapters/chapter_${String(index + 1).padStart(2, '0')}.txt`,
    draftFilePath: index => `Drafts/draft_${index + 1}.txt`,
    normalizeDocumentKey: value => String(value || '').replace(/\\/g, '/'),
    isNamingEntryUsedInText: (entry, value) => String(value).includes(entry.name),
    hasRawChaptersInPanel: () => false, latestPartIndex: manifest => manifest.parts.length - 1,
    syncActiveEditorDocumentFromEditor() {}, flushEditorHTMLMemoryCommit: async () => {},
    cacheProjectManifest: value => cache.set('manifest', clone(value)),
    closeAdvancedDraftPromotePanel() {}, collapseChapterListsForDraftEditor() {},
    loadEditor() {}, renderChapters() {}, renderActiveWorkspaceSidePanel() {}, updateChapterStatus() {},
    rememberCurrentChapterSaved() {}, setDraftBoxSaveIndicator() {}, setSaveStatusDot() {},
    showMiniReminder: message => messages.push(message),
    document: {
      activeElement: { isConnected: false },
      body: { appendChild() {} },
      createElement() {
        dialog = new Element();
        const elements = new Map();
        dialog.querySelector = selector => {
          if (!elements.has(selector)) {
            const element = new Element();
            if (selector === '.text-import-progress-status') Object.defineProperty(element, 'textContent', {
              set(value) { this.text = value; updates.push(value); }, get() { return this.text; }
            });
            elements.set(selector, element);
          }
          return elements.get(selector);
        };
        dialog.showModal = () => { dialog.open = true; };
        dialog.close = () => { dialog.open = false; };
        dialog.remove = () => {};
        return dialog;
      }
    },
    window: { addEventListener() {}, removeEventListener() {}, LmInitialRendering: {
      ensureFullNamingData: async () => clone(context.namingData), reset() {},
      serializeNamingWrite: async (_project, work) => work(),
      syncLeftPanelData: async () => {}, syncNamingIndex: async () => {}
    }, LmNamingDeepScanSource: {
      buildTextIndex: async () => ({ chapterTexts: ['untouched chapter'] }),
      repairDraftSourcesSeenInChapters: async () => ({ updatedCount: 0 })
    } }
  });
  context.nextDraftFilePath = () => `Drafts/draft_${context.chapterDrafts.length + 1}.txt`;
  context.chaptersToManifest = () => ({ ...context.projectManifest, chapters: clone(context.chapters) });
  context.draftsForStorage = () => clone(context.chapterDrafts);
  context.saveToStorage = () => { cache.set('drafts', clone(context.chapterDrafts)); };
  context.scanNamingUsesForDocument = () => { context.namingData.detected = true; };
  context.captureNamingPromotionState = () => ({
    chapters: [...context.chapters], drafts: [...context.chapterDrafts], naming: clone(context.namingData),
    manifest: context.projectManifest, curChap: context.curChap, curDraft: context.curDraft, curPart: context.curPart,
    activeEditorMode: context.activeEditorMode
  });
  context.restoreNamingPromotionState = snapshot => {
    context.chapters = snapshot.chapters; context.chapterDrafts = snapshot.drafts;
    context.namingData = snapshot.naming; context.projectManifest = snapshot.manifest;
    for (const key of ['curChap', 'curDraft', 'curPart', 'activeEditorMode']) context[key] = snapshot[key];
  };
  const normalization = read('assets/shared/js/04a-state-defaults-normalization.js');
  vm.runInContext(normalization.slice(normalization.indexOf('function createNamingSource('), normalization.indexOf('function namingDocumentRegistry(')), context);
  vm.runInContext(normalization.slice(normalization.indexOf('function namingEntryBelongsToDraft('), normalization.indexOf('function deduplicateNamingDescriptionHistory(')), context);
  naming.entries[0].source = context.createNamingSource(originalDraft, 'draft', 0);
  naming.entries.push({ id: 'remaining-name', name: 'बाकी', source: clone(naming.entries[0].source) });
  vm.runInContext(read('assets/shared/js/06aa-naming-file-safety.js'), context);
  vm.runInContext(read('assets/pages/story-novel-project-editor/js/05b-text-import-progress.js'), context);
  project.files.set('Story_Naming.json', JSON.stringify(naming));
  project.files.set('Story_Drafts.json', JSON.stringify({ drafts: [originalDraft] }));
  project.files.set('Chapters_info.json', JSON.stringify(context.projectManifest));
  project.files.set(originalDraft.contentPath, originalDraft.content);
  project.files.set(originalChapter.contentPath, originalChapter.content);
  const baseline = new Map(project.files);
  return { context, project, baseline, messages, updates, cache,
    get dialog() { return dialog; },
    cancel() { dialog.querySelector('button').fire('click'); },
    apply(target, extra = {}) { return context.window.LmTextImportProgress.apply({ importTarget: target, draftTitle: 'Imported', ...extra }, [
      { title: 'First imported', text: 'first text वीर' }, { title: 'Second imported', text: 'second text' }
    ]); },
    promote(extra = {}) { return context.window.LmTextImportProgress.promote({ mode: 'draft', draftIndex: 0, ...extra }, [
      { title: 'Promoted chapter 1', text: 'first chapter वीर' }, { title: 'Promoted chapter 2', text: 'second chapter' }
    ], context.chapterDrafts[0]); }
  };
}

async function run() {
  for (const target of ['chapters', 'drafts']) {
    // Cancel while the first new document is being written, then after metadata.
    for (const cancelAt of ['document', 'metadata', 'commit']) {
      const h = harness();
      h.project.hook = async (file, value) => {
        if ((cancelAt === 'document' && file.includes(target === 'chapters' ? 'chapter_02' : 'draft_2')) ||
            (cancelAt === 'metadata' && file === 'Story_Drafts.json') ||
            (cancelAt === 'commit' && file === 'Text_Import.transaction.json' && JSON.parse(value).phase === 'committed')) h.cancel();
      };
      await h.apply(target, { remainderText: target === 'chapters' ? 'remainder text' : '' });
      assert.deepEqual(h.project.files, h.baseline, `${target}: ${cancelAt} cancellation restores every byte and removes all new files`);
      assert.equal(h.context.chapters.length, 1);
      assert.equal(h.context.chapterDrafts.length, 1);
      assert.equal(h.context.activeEditorMode, 'draft');
      assert.equal(h.context.isChapterEditUnlocked, true);
      assert.equal(h.context.activeChapterEditKey, 'edit-key');
      assert.deepEqual(clone(h.context.namingData), JSON.parse(h.baseline.get('Story_Naming.json')));
      assert.equal(h.cache.size, 0, 'an incomplete import is never published to browser caches');
      assert.match(h.messages.at(-1), /cancelled/);
      assert.ok(h.updates.includes('Cancelling import…'));
      assert.equal(h.dialog.open, false);
    }
    const success = harness();
    await success.apply(target, { remainderText: target === 'chapters' ? 'remainder text' : '' });
    assert.equal(success.context.chapters.length, target === 'chapters' ? 3 : 1);
    assert.equal(success.context.chapterDrafts.length, target === 'chapters' ? 2 : 3);
    assert.equal(success.project.files.has('Text_Import.transaction.json'), false);
    assert.equal(success.context.activeEditorMode, target === 'chapters' ? 'chapter' : 'draft');
    assert.deepEqual(JSON.parse(success.project.files.get('Chapters_info.json')).facts, [{ keyword: 'legacy fact' }]);
    assert.ok(success.updates.includes('Import complete'));
    assert.equal(success.dialog.querySelector('progress').value, 100);
    assert.equal(success.dialog.querySelector('button').disabled, true);
    assert.equal(success.messages.length, 0);
  }
  const early = harness();
  const earlyRun = early.apply('drafts');
  early.cancel();
  await earlyRun;
  assert.deepEqual(early.project.files, early.baseline, 'cancel before preparation creates no files');

  for (const remainder of ['', 'remaining text बाकी']) {
    for (const cancelAt of ['chapter', 'metadata', 'source-delete', 'commit']) {
      const h = harness();
      h.project.hook = async (file, value) => {
        if ((cancelAt === 'chapter' && file === 'Chapters/chapter_02.txt') ||
            (cancelAt === 'metadata' && file === 'Story_Drafts.json') ||
            (cancelAt === 'commit' && file === 'Text_Import.transaction.json' && JSON.parse(value).phase === 'committed')) h.cancel();
      };
      h.project.removeHook = async file => { if (cancelAt === 'source-delete' && file === 'Drafts/original.txt') h.cancel(); };
      await h.promote({ remainderText: remainder });
      assert.deepEqual(h.project.files, h.baseline, `promotion ${cancelAt}: source, metadata and all file bytes restored`);
      assert.equal(h.context.chapters.length, 1);
      assert.equal(h.context.chapterDrafts[0].id, 'source-draft');
      assert.equal(h.context.activeEditorMode, 'draft');
      assert.equal(h.context.curDraft, 0);
      assert.deepEqual(clone(h.context.namingData), JSON.parse(h.baseline.get('Story_Naming.json')));
      assert.equal(h.cache.size, 0);
      assert.match(h.messages.at(-1), /Promotion cancelled/);
      assert.ok(h.updates.includes('Cancelling promotion…'));
    }
    const success = harness();
    await success.promote({ remainderText: remainder });
    assert.equal(success.context.chapters.length, 3);
    assert.equal(success.context.chapterDrafts.length, remainder ? 1 : 0);
    assert.equal(success.project.files.has('Drafts/original.txt'), false, 'successful promotion consumes the original draft file');
    assert.deepEqual(clone(success.context.chapters[1].notes), ['Keep this note']);
    assert.equal(success.context.chapters[1].alignment, 'justify');
    assert.equal(success.context.chapters[1].fontSize, 20);
    const entries = JSON.parse(success.project.files.get('Story_Naming.json')).entries;
    assert.equal(entries[0].source.documentKey, 'Chapters/chapter_02.txt', 'names move from source draft to first matching promoted chapter');
    if (remainder) {
      const remaining = success.context.chapterDrafts[0];
      assert.equal(remaining.title, 'Existing draft');
      assert.equal(success.project.files.get(remaining.contentPath), remainder);
      assert.equal(entries[1].source.documentKey, remaining.contentPath, 'remainder-only names remain attached to the remainder draft');
    } else {
      assert.equal(entries[1].source, null);
    }
    assert.ok(success.updates.includes('Promoting chapter 1 of 2…'));
    assert.ok(success.updates.includes('Promotion complete'));
    assert.equal(success.dialog.querySelector('.text-import-progress-count span').textContent, '2 of 2 chapters promoted');
    assert.equal(success.messages.length, 0);
  }
  const removeFailure = harness();
  let removalFailed = false;
  removeFailure.project.removeHook = async file => {
    if (file === 'Drafts/original.txt' && !removalFailed) { removalFailed = true; throw new Error('Source removal failed'); }
  };
  await removeFailure.promote();
  assert.deepEqual(removeFailure.project.files, removeFailure.baseline, 'failure after source deletion still restores the original draft');
  assert.match(removeFailure.messages.at(-1), /Promotion failed; its changes were undone/);

  const failure = harness();
  let failed = false;
  failure.project.hook = async file => {
    if (!failed && file === 'Story_Drafts.json') { failed = true; throw new Error('Disk write failed'); }
  };
  await failure.apply('chapters');
  assert.deepEqual(failure.project.files, failure.baseline, 'metadata write failure rolls back the whole import');
  assert.match(failure.messages.at(-1), /failed; its changes were undone/);

  const recovery = harness();
  recovery.project.hook = async file => {
    if (file === 'Chapters/chapter_02.txt') { recovery.project.failRemove = true; recovery.cancel(); }
  };
  const interrupted = recovery.apply('chapters');
  while (!recovery.updates.includes('Cleanup needs attention')) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(recovery.dialog.open, true, 'rollback failure keeps the progress panel open');
  assert.equal(recovery.messages.length, 0, 'cancellation is not reported as complete while recovery is pending');
  recovery.project.failRemove = false;
  recovery.dialog.querySelector('button').fire('click');
  await interrupted;
  assert.deepEqual(recovery.project.files, recovery.baseline, 'Retry cleanup completes rollback');

  const crash = harness();
  crash.project.files.set('Chapters/new.txt', 'partial import');
  crash.project.files.set('Story_Drafts.json', 'partial metadata');
  crash.project.files.set('Text_Import.transaction.json', JSON.stringify({ phase: 'prepared', previousFiles: [
    { path: 'Chapters/new.txt', text: null }, { path: 'Story_Drafts.json', text: crash.baseline.get('Story_Drafts.json') }
  ] }));
  await crash.context.window.LmNamingFileSafety.recoverPromotion(crash.project);
  assert.deepEqual(crash.project.files, crash.baseline, 'project-open recovery reverses an interrupted import');
  console.log('text-import-progress: import, promotion, source rollback, naming remap, remainder, cancellation and recovery passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
