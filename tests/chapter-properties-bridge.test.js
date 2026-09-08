'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/pages/story-novel-project-editor/js/00g-chapter-properties.js'), 'utf8');

function missing() { return Object.assign(new Error('Missing'), { name: 'NotFoundError' }); }
function fixture(enabled = true) {
  const files = new Map();
  const warnings = [];
  const handles = new Map();
  const runtimeChapters = [];
  const project = {
    async resolve(handle) { return files.has(handle.key) ? handle.key.split('/') : null; },
    async getDirectoryHandle(name) {
      if (name === '.chapter-properties' && !enabled) throw missing();
      return { async getFileHandle(filename, options) {
        const key = `${name}/${filename}`;
        if (!files.has(key) && !options?.create) throw missing();
        if (!handles.has(key)) handles.set(key, {
          name: filename, key,
          async isSameEntry(other) { return key === other.key; },
          async getFile() { return { async text() { return files.get(key); } }; },
          async createWritable() {
            let pending;
            return { async write(value) { pending = value; }, async close() { files.set(key, pending); } };
          }
        });
        return handles.get(key);
      } };
    }
  };
  if (enabled) files.set('.chapter-properties/enabled.json', JSON.stringify({ schemaVersion: 1, nonce: 'session' }));
  files.set('Chapters/chapter_01.txt', 'story');
  files.set('Drafts/chapter_01.txt', 'draft with same filename');
  const context = vm.createContext({ window: {}, crypto: webcrypto, TextEncoder, Uint8Array,
    projectDirectoryHandle: project, chapters: runtimeChapters, console: { warn: (...args) => warnings.push(args) },
    showMiniReminder: value => warnings.push(value) });
  vm.runInContext(source, context);
  return { bridge: context.window.LmChapterProperties, project, files, warnings, runtimeChapters };
}

(async () => {
  const payload = JSON.stringify({ parts: [], chapters: [{ content_path: 'Chapters/chapter_01.txt' }] });
  const absent = fixture(false);
  assert.equal(await absent.bridge.afterManifestSaved(absent.project, payload), false);
  assert.equal(absent.files.has('.chapter-properties/save-request.json'), false, 'ordinary projects are not enrolled');

  const f = fixture();
  const chapter = await (await f.project.getDirectoryHandle('Chapters')).getFileHandle('chapter_01.txt');
  const draft = await (await f.project.getDirectoryHandle('Drafts')).getFileHandle('chapter_01.txt');
  f.bridge.noteWrite(draft, 'draft with same filename');
  await f.bridge.afterManifestSaved(f.project, payload);
  let request = JSON.parse(f.files.get('.chapter-properties/save-request.json'));
  assert.deepEqual(request.changedPaths, [], 'same filename in Drafts is not a chapter edit');
  f.bridge.noteWrite(chapter, 'story');
  await f.bridge.afterManifestSaved(f.project, payload);
  request = JSON.parse(f.files.get('.chapter-properties/save-request.json'));
  assert.deepEqual(request.changedPaths, ['Chapters/chapter_01.txt']);
  assert.equal(request.nonce, 'session');
  assert.equal(request.contentHashes['Chapters/chapter_01.txt'], require('node:crypto').createHash('sha256').update('story').digest('hex'));
  assert.equal(request.manifestHash, require('node:crypto').createHash('sha256').update(payload).digest('hex'));

  f.files.set('.chapter-properties/status.json', JSON.stringify({ nonce: 'session', requestId: request.requestId, ok: true }));
  f.bridge.noteWrite(chapter, 'story'); // A second edit after the acknowledged request must survive cleanup.
  await f.bridge.afterManifestSaved(f.project, payload);
  request = JSON.parse(f.files.get('.chapter-properties/save-request.json'));
  assert.deepEqual(request.changedPaths, ['Chapters/chapter_01.txt']);
  f.files.set('.chapter-properties/status.json', JSON.stringify({ nonce: 'session', requestId: request.requestId, ok: true }));
  await f.bridge.afterManifestSaved(f.project, payload);
  assert.deepEqual(JSON.parse(f.files.get('.chapter-properties/save-request.json')).changedPaths, []);

  f.files.set('.chapter-properties/status.json', JSON.stringify({ nonce: 'session', ok: false, message: 'Index mismatch' }));
  assert.equal(await f.bridge.afterManifestSaved(f.project, payload), true, 'helper failure must not fail the completed text save');
  assert.ok(f.warnings.some(item => String(item).includes('Index mismatch')));
  const deletion = { phase: 'applied', revision: 'delete-1', deletedPaths: ['Chapters/chapter_01.txt'] };
  f.files.set('.chapter-properties/deletion-state.json', JSON.stringify(deletion));
  await assert.rejects(f.bridge.beforeManifestSave(f.project, JSON.parse(payload)), /ऑटोसेव/);
  await f.bridge.beforeManifestSave(f.project, { parts: [], chapters: [] });
  await assert.rejects(f.bridge.beforeChapterWrite(f.project, 'Chapters/chapter_01.txt'), /ऑटोसेव/);
  await f.bridge.beforeFileWrite(draft, 'draft');
  f.runtimeChapters.push({ contentPath: 'Chapters/chapter_01.txt' });
  await assert.rejects(f.bridge.beforeChapterWrite(f.project, 'Chapters/chapter_04.txt'), /ऑटोसेव/);
  await f.bridge.checkExternalDeletion();
  assert.ok(f.warnings.some(item => String(item).includes('नई सूची')));
  f.runtimeChapters.splice(0, 1, { contentPath: 'Chapters/chapter_03.txt' });
  assert.equal(f.bridge.newChapterPath(1), 'Chapters/chapter_04.txt');
  assert.equal(f.bridge.newChapterPath(2), 'Chapters/chapter_05.txt', 'bulk creation after gaps uses distinct unused filenames');
  f.files.delete('Chapters/chapter_01.txt');
  await assert.rejects(f.bridge.beforeFileWrite(chapter, 'stale text'), /ऑटोसेव/);
  f.files.delete('.chapter-properties/deletion-state.json');
  f.files.set('.chapter-properties/index-backup.json', JSON.stringify({ chapters: [{ path: 'Chapters/chapter_01.txt' }] }));
  await assert.rejects(f.bridge.beforeChapterWrite(f.project, 'Chapters/chapter_01.txt'), /ऑटोसेव/, 'protect deletion before helper debounce completes');
  console.log('chapter-properties-bridge: disabled helper, handle identity, manifest hash, acknowledgments, and failure reporting passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
