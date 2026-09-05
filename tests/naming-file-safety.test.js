'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class MemoryFileHandle {
  constructor(text = '') {
    this.text = text;
    this.corruptNextWrite = false;
    this.writeCount = 0;
  }

  async getFile() {
    return { text: async () => this.text };
  }

  async createWritable() {
    let outgoing = '';
    return {
      write: async value => { outgoing = String(value); },
      close: async () => {
        this.writeCount += 1;
        this.text = this.corruptNextWrite ? '{corrupt' : outgoing;
        this.corruptNextWrite = false;
      }
    };
  }
}

class MemoryDirectoryHandle {
  constructor(name) {
    this.name = name;
    this.files = new Map();
    this.directories = new Map();
  }

  async getFileHandle(name, options = {}) {
    if (!this.files.has(name)) {
      if (!options.create) throw Object.assign(new Error('Missing file'), { name: 'NotFoundError' });
      this.files.set(name, new MemoryFileHandle());
    }
    return this.files.get(name);
  }

  async getDirectoryHandle(name, options = {}) {
    if (!this.directories.has(name)) {
      if (!options.create) throw Object.assign(new Error('Missing directory'), { name: 'NotFoundError' });
      this.directories.set(name, new MemoryDirectoryHandle(name));
    }
    return this.directories.get(name);
  }

  async removeEntry(name) {
    this.files.delete(name);
  }
}

async function run() {
  const project = new MemoryDirectoryHandle('project-a');
  const otherProject = new MemoryDirectoryHandle('project-b');
  const cache = new Map();
  const context = {
    console,
    PROJECT_NAMING_FILE: 'Story_Naming.json',
    NAMING_STORAGE_KEY: 'naming-cache',
    projectDirectoryHandle: project,
    namingData: { categories: [{ id: 'characters', title: 'Characters' }], entries: [{ id: 'one', name: 'One' }] },
    normalizeNamingData: value => value,
    localStorage: { setItem: (key, value) => cache.set(key, value) },
    window: { LmInitialRendering: { ensureFullNamingData: async () => {}, syncNamingIndex: async () => {} } }
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shared', 'js', '06aa-naming-file-safety.js'), 'utf8');
  vm.runInContext(source, context);

  assert.strictEqual(await context.window.LmNamingFileSafety.writeCurrentProject(project), true);
  const namingFile = await project.getFileHandle('Story_Naming.json');
  const firstPayload = namingFile.text;
  context.namingData.entries.push({ id: 'two', name: 'Two' });
  assert.strictEqual(await context.window.LmNamingFileSafety.writeCurrentProject(project), true);
  const backupDirectory = await (await project.getDirectoryHandle('Initial_Rendering')).getDirectoryHandle('Backups');
  assert.strictEqual((await backupDirectory.getFileHandle('Story_Naming.previous.json')).text, firstPayload);

  const fullBeforeProjectionRace = JSON.parse(namingFile.text);
  context.window.LmInitialRendering.ensureFullNamingData = async () => {
    context.namingData = { categories: fullBeforeProjectionRace.categories, entries: [fullBeforeProjectionRace.entries[0]] };
    return fullBeforeProjectionRace;
  };
  assert.strictEqual(await context.window.LmNamingFileSafety.writeCurrentProject(project), true);
  assert.strictEqual(JSON.parse(namingFile.text).entries.length, 2, 'a concurrent rendering projection must not replace the full naming file');
  assert.strictEqual(namingFile.writeCount, 2, 'an unchanged authoritative payload must not rewrite Story_Naming.json');

  context.window.LmInitialRendering.ensureFullNamingData = async () => context.namingData;
  assert.strictEqual(await context.window.LmNamingFileSafety.writeCurrentProject(project), true);
  assert.strictEqual(JSON.parse(namingFile.text).entries.length, 2, 'missing records must be preserved unless removal is explicitly authorized');
  assert.strictEqual(await context.window.LmNamingFileSafety.writeCurrentProject(project, { allowEntryRemoval: true }), true);
  assert.strictEqual(JSON.parse(namingFile.text).entries.length, 1, 'an explicit manual removal must still be persisted');

  const importedAuthoritativeData = {
    categories: [{ id: 'imported', title: 'Imported' }],
    entries: [{ id: 'portable', name: 'Portable Name', categoryId: 'imported' }]
  };
  assert.strictEqual(await context.window.LmNamingFileSafety.writeCurrentProject(project, {
    authoritativeData: importedAuthoritativeData,
    allowEntryRemoval: true
  }), true);
  assert.strictEqual(JSON.parse(namingFile.text).entries[0].name, 'Portable Name', 'reviewed import data should be the authoritative save payload');

  const validBeforeFailure = namingFile.text;
  namingFile.corruptNextWrite = true;
  context.namingData.entries.push({ id: 'three', name: 'Three' });
  await assert.rejects(context.window.LmNamingFileSafety.writeCurrentProject(project));
  assert.strictEqual(namingFile.text, validBeforeFailure, 'failed verification must restore the previous valid file');

  context.projectDirectoryHandle = otherProject;
  assert.strictEqual(await context.window.LmNamingFileSafety.writeCurrentProject(project), false);
  assert.strictEqual(namingFile.text, validBeforeFailure, 'stale project writes must not touch the old project');
  console.log('naming-file-safety: backup, rollback and project isolation passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
