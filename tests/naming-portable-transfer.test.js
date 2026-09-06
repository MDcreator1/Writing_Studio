'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'pages', 'story-novel-project-editor', 'js', '03f-naming-portable-transfer.js'), 'utf8');
const context = {
  console,
  window: {},
  document: { addEventListener() {} },
  normalizeNamingData: value => ({
    schemaVersion: value?.schemaVersion || 2,
    categories: value?.categories || [],
    entries: value?.entries || []
  })
};
vm.createContext(context);
vm.runInContext(source, context);

const plain = value => JSON.parse(JSON.stringify(value));

const current = context.migratePortableNamingPayload({
  format: 'lekhak-manch.naming-portable',
  version: 1,
  names: [{ name: 'आरव', aliases: ['आरु'], category: 'Characters', description: 'मुख्य पात्र' }]
});
assert.strictEqual(current.sourceVersion, 1);
assert.strictEqual(current.migrated, false);
assert.deepStrictEqual(plain(current.names[0]), {
  name: 'आरव', aliases: ['आरु'], category: 'Characters', description: 'मुख्य पात्र'
});

const legacy = context.migratePortableNamingPayload({
  schemaVersion: 2,
  categories: [{ id: 'places', title: 'Places' }],
  entries: [{
    id: 'hidden-in-portable', name: 'राजनगर', similarNames: ['राज नगर'], categoryId: 'places',
    description: 'राजधानी', source: { documentKey: 'chapter-1' }, descriptionHistory: [{ description: 'old' }]
  }]
});
assert.strictEqual(legacy.sourceVersion, 0);
assert.strictEqual(legacy.migrated, true);
assert.deepStrictEqual(Object.keys(plain(legacy.names[0])).sort(), ['aliases', 'category', 'description', 'name']);
assert.strictEqual(legacy.names[0].category, 'Places');

const duplicates = context.migratePortableNamingPayload([
  { name: 'Mira', aliases: ['M'] },
  { name: ' mira ', aliases: ['Meera'], description: 'Latest' }
]);
assert.strictEqual(duplicates.names.length, 1);
assert.deepStrictEqual(plain(duplicates.names[0].aliases), ['M', 'Meera']);
assert.strictEqual(duplicates.names[0].description, 'Latest');
assert.strictEqual(duplicates.report.mergedDuplicates, 1);

assert.throws(() => context.migratePortableNamingPayload({
  format: 'lekhak-manch.naming-portable', version: 2, names: [{ name: 'Future' }]
}), /version 2/);

const exported = context.portableNamingExportPayload({
  categories: [{ id: 'characters', title: 'Characters' }],
  entries: [{
    id: 'private-id', name: 'Sia', similarNames: ['Siya'], categoryId: 'characters',
    description: 'Latest description', source: { count: 8 }, descriptionHistory: [{ description: 'Older' }]
  }]
});
assert.deepStrictEqual(Object.keys(plain(exported)).sort(), ['format', 'names', 'version']);
assert.deepStrictEqual(Object.keys(plain(exported.names[0])).sort(), ['aliases', 'category', 'description', 'name']);
assert.strictEqual(JSON.stringify(exported).includes('private-id'), false);
assert.strictEqual(JSON.stringify(exported).includes('Older'), false);

const analyzed = context.analyzePortableNamingImport({ names: [
  { name: 'Aarav', aliases: [], category: 'Characters', description: 'Same' },
  { name: 'Mira', aliases: [], category: 'People', description: 'New description' },
  { name: 'Siya', aliases: ['Sia'], category: 'Characters', description: '' },
  { name: 'Brand New', aliases: [], category: 'Places', description: '' }
] }, {
  categories: [{ id: 'characters', title: 'Characters' }],
  entries: [
    { id: 'aarav', name: 'Aarav', similarNames: [], categoryId: 'characters', description: 'Same' },
    { id: 'mira', name: 'Mira', similarNames: [], categoryId: 'characters', description: 'Old description' },
    { id: 'sia', name: 'Sia', similarNames: [], categoryId: 'characters', description: '' }
  ]
});
assert.strictEqual(analyzed[0].kind, 'compatible');
assert.strictEqual(analyzed[0].needsReview, false);
assert.strictEqual(analyzed[1].kind, 'field-conflict');
assert.strictEqual(analyzed[1].needsReview, true);
assert.strictEqual(analyzed[1].descriptionChoice, '');
assert.strictEqual(analyzed[1].categoryChoice, '');
assert.strictEqual(analyzed[1].conflicts.description, true);
assert.strictEqual(analyzed[1].conflicts.category, true);
assert.strictEqual(analyzed[2].kind, 'alias-collision');
assert.strictEqual(analyzed[2].action, 'merge');
assert.strictEqual(analyzed[2].titleChoice, '');
assert.strictEqual(analyzed[3].kind, 'new');
assert.strictEqual(analyzed[3].action, 'add');

const pendingMatches = context.analyzePortableNamingImport({ names: [
  { name: 'Ravi', aliases: ['Rav'], category: 'Characters', description: '' },
  { name: 'Rav', aliases: [], category: 'Characters', description: '' }
] }, { categories: [], entries: [] });
assert.strictEqual(pendingMatches[0].kind, 'new');
assert.strictEqual(pendingMatches[1].kind, 'alias-collision');
assert.strictEqual(pendingMatches[1].matches[0].pendingRowId, pendingMatches[0].id);
assert.strictEqual(pendingMatches[1].targetId, `pending-${pendingMatches[0].id}`);

const resolution = context.namingPortableResolution({ rows: analyzed });
assert.ok(resolution.total >= 3);
assert.ok(resolution.unresolved >= 3);

const revisionA = context.namingPortableDatasetRevision({
  schemaVersion: 2,
  categories: [{ id: 'people', title: 'People' }],
  entries: [
    { id: '2', name: 'Mira', categoryId: 'people', description: 'Lead', similarNames: ['Mi', 'M'], updatedAt: 'old' },
    { id: '1', name: 'Ravi', categoryId: 'people', description: '', similarNames: [] }
  ]
});
const revisionB = context.namingPortableDatasetRevision({
  schemaVersion: 2,
  categories: [{ id: 'people', title: 'People' }],
  entries: [
    { id: '1', name: 'Ravi', categoryId: 'people', description: '', similarNames: [] },
    { id: '2', name: 'Mira', categoryId: 'people', description: 'Lead', similarNames: ['M', 'Mi'], updatedAt: 'new' }
  ]
});
assert.strictEqual(revisionA, revisionB, 'revision must ignore hydration timestamps and collection ordering');
assert.notStrictEqual(revisionA, context.namingPortableDatasetRevision({
  schemaVersion: 2,
  categories: [{ id: 'people', title: 'People' }],
  entries: [{ id: '2', name: 'Mira', categoryId: 'people', description: 'Changed', similarNames: ['M', 'Mi'] }]
}), 'revision must still detect real Naming content changes');

const reviewedRows = context.analyzePortableNamingImport({ names: [
  { name: 'Mira', aliases: [], category: 'People', description: 'Imported' },
  { name: 'New name', aliases: [], category: 'People', description: '' }
] }, {
  categories: [{ id: 'people', title: 'People' }],
  entries: [{ id: 'mira', name: 'Mira', similarNames: [], categoryId: 'people', description: 'Old' }]
});
assert.strictEqual(context.validatePortableNamingImportTargets(reviewedRows, {
  categories: [{ id: 'people', title: 'Renamed People' }],
  entries: [
    { id: 'mira', name: 'Mira', similarNames: [], categoryId: 'people', description: 'Background update' },
    { id: 'unrelated', name: 'Other', similarNames: [], categoryId: 'people', description: '' }
  ]
}).valid, true, 'unrelated and non-identity background changes must not invalidate review');
assert.strictEqual(context.validatePortableNamingImportTargets(reviewedRows, {
  categories: [{ id: 'people', title: 'People' }],
  entries: [
    { id: 'mira', name: 'Mira', similarNames: [], categoryId: 'people', description: 'Old' },
    { id: 'new-collision', name: 'New name', similarNames: [], categoryId: 'people', description: '' }
  ]
}).valid, false, 'a newly introduced collision must invalidate review');

assert.ok(source.includes("if (namingPortableTransferState.rows.some(row => row.needsReview)) renderPortableNamingTransferPanel();"));
assert.ok(source.includes('else await applyPortableNamingImport();'), 'zero-conflict imports must skip review and start import automatically');
assert.ok(source.includes("title: 'Resolve Naming conflicts'") && source.includes("title: 'Scanning imported names'") && source.includes("title: 'Saving verified Naming data'") && source.includes("title: 'Rebuilding Naming snapshots'") && source.includes("title: 'Naming data is ready'"));

console.log('naming-portable-transfer: migration, auto-import and conflict analysis passed');
