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
assert.strictEqual(analyzed[1].descriptionChoice, 'existing');
assert.strictEqual(analyzed[2].kind, 'alias-collision');
assert.strictEqual(analyzed[2].action, 'skip');
assert.strictEqual(analyzed[3].kind, 'new');
assert.strictEqual(analyzed[3].action, 'add');

console.log('naming-portable-transfer: migration, export minimization and conflict analysis passed');
