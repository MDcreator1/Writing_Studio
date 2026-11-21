'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');

const source = fs.readFileSync(require.resolve('../assets/shared/js/06c-workspace-library-settings.js'), 'utf8');
const library = source.slice(source.indexOf('const OPENED_PROJECT_HISTORY_KEY'), source.indexOf('async function createStoryFromInfoForm'));

function setup(overrides = {}) {
  let entries = [];
  const context = vm.createContext({
    crypto: { randomUUID }, console, document: {
      addEventListener() {}, getElementById() { return null; }, querySelector() { return null; }
    },
    readStoredDirectoryHandle: async () => entries,
    saveStoredDirectoryHandle: async value => { entries = value; },
    readFileText: async file => JSON.stringify(file),
    PROJECT_MANIFEST_FILE: 'Chapters_info.json', NEWS_PROJECT_DATA_FILE: 'NewsDesk_Articles.json',
    isNewsProjectType: type => type === 'news',
    ...overrides
  });
  vm.runInContext(library, context);
  return context;
}

function folder(identity, name = 'Project') {
  return { identity, name, async isSameEntry(other) { return identity === other.identity; } };
}

test('recent cleanup persists removals and keeps empty, inaccessible and temporarily unavailable folders', async () => {
  const ctx = setup();
  for (const [id, error] of [[1, 'NotFoundError'], [2, null], [3, 'NotAllowedError'], [4, 'NotReadableError']]) {
    const handle = folder(id);
    handle.values = async function* () {
      if (error) throw Object.assign(new Error(error), { name: error });
    };
    await ctx.finishProjectLibraryOpen({ handle, typeFolderName: 'Novels' }, { title: handle.name });
  }
  assert.deepEqual(Array.from(await ctx.pruneMissingRecentProjects(), entry => entry.handle.identity), [4, 3, 2]);
  assert.deepEqual(Array.from(await ctx.readOpenedProjectHistory(), entry => entry.handle.identity), [4, 3, 2]);
});

test('history caps at seven opens and deduplicates by folder identity, including same-name external folders', async () => {
  const ctx = setup();
  const add = (handle, typeFolderName) => ctx.finishProjectLibraryOpen({ handle, typeFolderName }, { title: handle.name, type: 'novel' });
  for (let i = 0; i < 8; i++) await add(folder(i), i % 2 ? 'Novels' : '@external-' + i);
  const entries = await ctx.readOpenedProjectHistory();
  assert.deepEqual(Array.from(entries, entry => entry.handle.identity), [7, 6, 5, 4, 3, 2, 1]);
  const existingId = entries.find(entry => entry.handle.identity === 2).id;
  await add(folder(2), '@external-2');
  const reordered = await ctx.readOpenedProjectHistory();
  assert.equal(reordered[0].id, existingId);
  assert.equal(reordered[0].typeFolderName, '@external-2');
  assert.equal(reordered.length, 7);
});

test('external validation rejects missing manifests, malformed parts and missing referenced chapter files', async () => {
  const ctx = setup();
  const missing = () => { throw Object.assign(new Error('Missing file'), { name: 'NotFoundError' }); };
  await assert.rejects(ctx.validateExternalProjectFiles({ getFileHandle: missing }), /missing valid/);
  for (const manifest of [
    { title: 'Unrelated folder' },
    { title: 'Broken novel', parts: [{ chapters: [null] }] },
    { title: 'Missing chapter', chapters: [{ content_path: 'chapter.txt' }] }
  ]) {
    await assert.rejects(ctx.validateExternalProjectFiles({
      getFileHandle: async name => name === 'Chapters_info.json' ? manifest : missing()
    }), /missing valid/);
  }
  await ctx.validateExternalProjectFiles({ getFileHandle: async () => ({ title: 'New story', type: 'story', parts: [], chapters: [] }) });
});

test('selecting a project inside the workspace through the external picker is rejected', async () => {
  const handle = folder(1);
  const ctx = setup({
    supportsLocalProjectFolders: () => true,
    window: { showDirectoryPicker: async () => handle },
    workspaceDirectoryHandle: { resolve: async () => ['Novels', handle.name] }
  });
  ctx.openProjectFromLibrary = resolve => resolve();
  await assert.rejects(ctx.pickExternalWorkspaceProject(), /outside your workspace/);
});

test('creation seeds a blank first draft and independent naming before switching the editor', async () => {
  const creation = source.slice(source.indexOf('async function createStoryFromInfoForm'), source.indexOf('const editorDocumentContentLoadPromises'));
  const files = new Map();
  const directories = prefix => ({
    async getDirectoryHandle(name) { return directories(prefix + name + '/'); },
    async getFileHandle(name) { return prefix + name; }
  });
  const old = { name: 'Old novel' };
  const target = { name: 'New novel', ...directories('') };
  const events = [];
  const ctx = vm.createContext({
    projectDirectoryHandle: old, workspaceDirectoryHandle: {},
    document: { getElementById: id => id === 'saveBtn' ? null : { value: id === 'storyTitleInp' ? target.name : id === 'storyTypeInp' ? 'novel' : '' } },
    text: () => ({ defaultChapterTitle: 'Chapter 1' }),
    isSupportedStoryProjectType: () => true, projectTypeFolderName: () => 'Novels',
    workspaceStoryTitleExists: async () => false, isNewsProjectType: () => false,
    createProjectManifest: title => ({ title, chapters: [], parts: [] }),
    projectManifestForStorage: value => value, normalizeProjectManifest: value => value,
    createDefaultDraft: () => ({ contentPath: 'Drafts/draft_01.txt', content: '' }),
    normalizeNamingData: () => ({ entries: [] }), createUniqueStoryDirectory: async () => target,
    PROJECT_CHAPTER_EDIT_DRAFTS_DIR: 'Chapter edits', PROJECT_TRASH_DIR: 'Trash',
    PROJECT_TRASH_DRAFTS_FILE: 'Trash/Trash_Drafts.json', PROJECT_DRAFTS_FILE: 'Story_Drafts.json',
    PROJECT_NAMING_FILE: 'Story_Naming.json', PROJECT_MANIFEST_FILE: 'Chapters_info.json',
    writeFileText: async (file, data) => {
      assert.equal(ctx.projectDirectoryHandle, old);
      files.set(file, data);
    },
    readFileText: async file => files.get(file),
    loadLocalProject: async (handle, store, options) => {
      assert.equal(handle, target);
      assert.equal(store, true);
      assert.equal(options.freshProject, true);
      assert.deepEqual(JSON.parse(files.get('Story_Naming.json')).entries, []);
      assert.equal(JSON.parse(files.get('Story_Drafts.json')).drafts[0].title, 'Chapter 1');
      assert.equal(files.get('Drafts/draft_01.txt'), '');
      ctx.projectManifest = JSON.parse(files.get('Chapters_info.json'));
      events.push('load');
      return true;
    },
    finishProjectLibraryOpen() {}, closeStoryInfoModal: () => events.push('close'),
    hideProjectGate() {}, isHomePage: () => false,
    refreshProjectUI: () => events.push('render'), setSaveStatusDot() {}
  });
  vm.runInContext(creation, ctx);
  await ctx.createStoryFromInfoForm();
  assert.deepEqual(events, ['load', 'close', 'render']);
});
