'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname, '..', 'assets/pages/story-novel-project-editor/js/00e-initial-rendering-store.js'), 'utf8');

function fixture() {
  const files = new Map(), reads = [];
  let gate = null;
  const context = {
    console, clearTimeout, window: {}, projectDirectoryHandle: { name: 'A' },
    chapters: ['one', 'two', 'missing'].map(name => ({ contentPath: `Chapters/${name}.txt` })),
    getProjectFileHandle: async name => {
      assert.ok(name.startsWith('Initial_Rendering/Naming_Documents/') && name.endsWith('.json'), 'Occurrence warmup must not open chapter text or authoritative Naming files');
      const project = context.projectDirectoryHandle.name;
      reads.push(`${project}:${name}`);
      return { project, name };
    },
    readFileText: async handle => {
      const value = files.get(handle.project)?.find(([label]) => handle.name.includes(`/${label}-`))?.[1];
      if (gate) await gate;
      if (!value) throw Object.assign(new Error('no snapshot'), { name: 'NotFoundError' });
      return JSON.stringify(value);
    }
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return { context, api: context.window.LmInitialRendering, files, reads, setGate: value => { gate = value; } };
}
function snapshot(label, entries, matchedNames = {}) {
  return { schemaVersion: 4, document: { key: `Chapters/${label}.txt`, kind: 'chapter' },
    namingData: { schemaVersion: 2, entries },
    categoryStates: [{ words: entries.map(entry => ({ id: entry.id, matchedName: matchedNames[entry.id] || entry.name })) }] };
}

async function main() {
  const f = fixture();
  const a = { id: 'a', name: 'First Name', similarNames: ['Recent Alias'] };
  const b = { id: 'b', name: 'Older Name', similarNames: [] };
  const changed = { id: 'changed', name: 'Old Removed Name', similarNames: [] };
  f.files.set('A', [['one', snapshot('one', [a, b, changed])], ['two', snapshot('two', [a], { a: 'Recent Alias' })]]);
  const current = [{ ...a, name: 'Renamed', similarNames: ['Recent Alias', 'New Alias'] }, b,
    { ...changed, name: 'Different Name' }, { id: 'never-seen', name: 'No Appearance', createdAt: '2099-01-01' }];
  assert.equal(f.api.namingChapterOccurrenceScores(current).get('a'), -1, 'No source-creation fallback before snapshots arrive');
  const warm = f.api.warmNamingChapterOccurrences();
  assert.equal(f.api.warmNamingChapterOccurrences(), warm, 'Concurrent warmup is shared');
  await warm;
  assert.equal(f.api.namingChapterOccurrenceScores(current).get('a'), 1, 'The actual alias matched in a newer chapter survives adding aliases or changing the main name');
  assert.equal(f.api.namingChapterOccurrenceScores(current).get('b'), 0);
  assert.equal(f.api.namingChapterOccurrenceScores(current).get('changed'), -1, 'A removed alias/name cannot retain stale occurrence evidence');
  assert.equal(f.api.namingChapterOccurrenceScores(current).get('never-seen'), -1);
  assert.equal(f.reads.length, 3);
  await f.api.warmNamingChapterOccurrences();
  assert.equal(f.reads.length, 3, 'Repeated paging must reuse memory including absent snapshots');
  f.context.chapters.reverse();
  assert.equal(f.api.namingChapterOccurrenceScores(current).get('b'), 2, 'Chapter reordering uses current story order, not stored chapter numbers');

  const stale = fixture();
  stale.files.set('A', [['two', snapshot('two', [a])]]);
  let release;
  stale.setGate(new Promise(resolve => { release = resolve; }));
  const oldWarm = stale.api.warmNamingChapterOccurrences();
  await Promise.resolve();
  stale.api.reset();
  stale.context.projectDirectoryHandle = { name: 'B' };
  stale.files.set('B', [['one', snapshot('one', [b])]]);
  stale.setGate(null);
  await stale.api.warmNamingChapterOccurrences();
  release();
  await oldWarm;
  const isolated = stale.api.namingChapterOccurrenceScores([a, b]);
  assert.equal(isolated.get('a'), -1, 'Late reads from a previous project must not leak into the current project');
  assert.equal(isolated.get('b'), 0);
  console.log('Naming occurrence snapshots: memory reuse, matched aliases, missing snapshots, chapter order, and project isolation passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
