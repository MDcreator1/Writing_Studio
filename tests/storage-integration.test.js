'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const base = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(base, 'assets/shared/js/06a-project-storage-foundation.js'), 'utf8');
const functions = ['getProjectFileHandle', 'getProjectDirectoryHandle', 'removeProjectFileIfExists', 'readFileText', 'writeFileText'].map(name => source.match(new RegExp(`async function ${name}\\([^]*?\\n\\}`))[0]).join('\n');
const split = source.match(/function splitProjectPath\([^]*?\n\}/)[0];

(async () => {
  for (const page of ['home.html', 'story-novel-project-editor.html', 'project-details.html', 'news-article-editor.html']) {
    const html = fs.readFileSync(path.join(base, page), 'utf8');
    assert.ok(html.indexOf('06f-local-folder-adapter.js') < html.indexOf('06a-project-storage-foundation.js'), page);
    assert.ok(html.includes('06g-project-repository.js'), page);
    assert.ok(html.indexOf('06g-project-repository.js') < html.indexOf('06a-project-storage-foundation.js'), page);
  }
  for (const enabled of [false, true]) {
    const calls = [];
    const directory = {
      getDirectoryHandle: async (name, options = {}) => { calls.push(['directory', name, options.create]); return directory; },
      getFileHandle: async (name, options) => { calls.push(['file', name, options.create]); return { name }; },
      removeEntry: async name => { calls.push(['delete', name]); }
    };
    const context = { window: {}, projectDirectoryHandle: directory, console };
    vm.createContext(context);
    if (enabled) vm.runInContext(fs.readFileSync(path.join(base, 'assets/shared/js/06f-local-folder-adapter.js'), 'utf8'), context);
    if (enabled) vm.runInContext(fs.readFileSync(path.join(base, 'assets/shared/js/06g-project-repository.js'), 'utf8'), context);
    vm.runInContext(split + '\n' + functions, context);
    assert.equal((await context.getProjectFileHandle('/Chapters//one.txt', { create: true })).name, 'one.txt');
    await context.getProjectDirectoryHandle('Drafts', { create: true });
    await context.removeProjectFileIfExists('Drafts/one.txt');
    assert.deepEqual(calls, [
      ['directory', 'Chapters', true], ['file', 'one.txt', true],
      ['directory', 'Drafts', true], ['directory', 'Drafts', undefined], ['delete', 'one.txt']
    ].map(call => enabled && call[0] === 'directory' && call[2] === undefined ? [call[0], call[1], false] : call));
    let content = 'original';
    let fail = false;
    const handle = {
      getFile: async () => ({ text: async () => content }),
      createWritable: async () => {
        let pending;
        return {
          write: async value => { if (fail) throw new Error('write refused'); pending = value; },
          close: async () => { content = pending; }, abort: async () => {}
        };
      }
    };
    await context.writeFileText(handle, 'हिंदी\n\ntext');
    assert.equal(await context.readFileText(handle), 'हिंदी\n\ntext');
    fail = true;
    await assert.rejects(context.writeFileText(handle, 'lost'), /write refused/);
    assert.equal(content, 'हिंदी\n\ntext');
  }
  console.log('storage integration: page order, legacy fallback, adapter I/O and failures passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
