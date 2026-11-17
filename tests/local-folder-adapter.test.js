'use strict';
const assert = require('node:assert/strict');
require('../assets/shared/js/06f-local-folder-adapter.js');
const { create, pathParts } = globalThis.LmLocalFolderAdapter;

class Directory {
  constructor() { this.files = new Map(); this.directories = new Map(); }
  async getDirectoryHandle(name, options = {}) {
    if (!this.directories.has(name) && options.create) this.directories.set(name, new Directory());
    if (!this.directories.has(name)) throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
    return this.directories.get(name);
  }
  async getFileHandle(name, options = {}) {
    if (!this.files.has(name) && options.create) this.files.set(name, { value: '', corrupt: false, fail: false });
    const item = this.files.get(name);
    if (!item) throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
    return {
      getFile: async () => ({ text: async () => item.value }),
      createWritable: async () => ({
        write: async value => { if (item.fail) throw new Error('disk full'); item.next = String(value); },
        close: async () => { item.value = item.corrupt ? 'corrupt' : item.next; },
        abort: async () => { item.next = undefined; }
      })
    };
  }
}

(async () => {
  const root = new Directory();
  const adapter = create(root);
  assert.deepEqual(pathParts('Chapters\\one.txt'), ['Chapters', 'one.txt']);
  for (const invalid of ['', '/x', 'x/', 'a//b', '../x', 'a/./b', 'a/../b']) {
    assert.throws(() => pathParts(invalid));
  }
  await adapter.writeText('Chapters/one.txt', 'पहला\n\nदूसरा');
  assert.equal(await adapter.readText('Chapters/one.txt'), 'पहला\n\nदूसरा');
  await adapter.writeJson('Story_Drafts.json', { drafts: [{ title: 'एक' }] });
  assert.deepEqual(await adapter.readJson('Story_Drafts.json'), { drafts: [{ title: 'एक' }] });
  root.files.get('Story_Drafts.json').corrupt = true;
  await assert.rejects(adapter.writeJson('Story_Drafts.json', { drafts: [] }), /verification failed/);
  const chapter = root.directories.get('Chapters').files.get('one.txt');
  chapter.fail = true;
  await assert.rejects(adapter.writeText('Chapters/one.txt', 'replacement'), /disk full/);
  assert.equal(await adapter.readText('Chapters/one.txt'), 'पहला\n\nदूसरा');
  console.log('local folder adapter: paths, round trip and write failures passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
