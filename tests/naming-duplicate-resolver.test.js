const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('assets/pages/story-novel-project-editor/js/03c-naming-deep-scan-facts.js', 'utf8');
const context = {
  console,
  namingEntryNameKey: value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase(),
  normalizeNamingAliases: (values, title) => [...new Set((values || []).map(value => String(value).trim()).filter(value => value && value.toLocaleLowerCase() !== String(title).toLocaleLowerCase()))],
  normalizeNamingData: value => value,
  localStorage: { setItem() {} },
  NAMING_STORAGE_KEY: 'naming',
  document: {
    addEventListener() {},
    getElementById: () => null,
    body: { classList: { remove() {} } }
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context);

const entries = [
  { id: 'one', name: ' Same  Name ', categoryId: 'a', similarNames: ['First'], description: 'Old', descriptionHistory: [{ description: 'Earlier', editedAt: '2024-01-01' }], createdAt: '2024-01-01', updatedAt: '2024-02-01' },
  { id: 'two', name: 'same name', categoryId: 'b', similarNames: ['Second'], description: 'New', descriptionHistory: [{ description: 'Old new', editedAt: '2024-03-01' }], createdAt: '2024-02-01', updatedAt: '2024-04-01' },
  { id: 'other', name: 'Other' }
];
context.namingData = { categories: [], entries };
const groups = vm.runInContext('namingDuplicateTitleGroups(namingData.entries)', context);
assert.strictEqual(groups.length, 1);
assert.deepStrictEqual(Array.from(groups[0].entries, entry => entry.id), ['one', 'two']);
assert.strictEqual(groups[0].mismatches.createdAt, true);
assert.deepStrictEqual(Array.from(groups[0].choices.aliases), []);

vm.runInContext(`namingDuplicateResolverState = {
  groups: namingDuplicateTitleGroups(namingData.entries),
  resolve() {}
}; namingDuplicateResolverState.groups[0].choices = {
  title: 'one', createdAt: 'one', aliases: ['two'], description: 'two', descriptionCreatedAt: 'one'
}; finishNamingDuplicateResolution();`, context);
assert.deepStrictEqual(Array.from(context.namingData.entries, entry => entry.id), ['one', 'other']);
assert.strictEqual(context.namingData.entries[0].name, ' Same  Name ');
assert.deepStrictEqual(Array.from(context.namingData.entries[0].similarNames), ['Second']);
assert.strictEqual(context.namingData.entries[0].description, 'New');
assert.deepStrictEqual(Array.from(context.namingData.entries[0].descriptionHistory, item => item.description), ['Old new']);
assert.strictEqual(context.namingData.entries[0].createdAt, '2024-01-01');
assert.strictEqual(context.namingData.entries[0].updatedAt, '2024-04-01');

context.namingData = { categories: [], entries: [
  { id: 'exact-a', name: 'Exact', categoryId: 'a', similarNames: ['E'], description: 'Same', createdAt: '2024-01-01', updatedAt: '2024-01-02' },
  { id: 'exact-b', name: 'Exact', categoryId: 'a', similarNames: ['E'], description: 'Same', createdAt: '2024-01-01', updatedAt: '2024-01-02' }
] };
const exactGroups = vm.runInContext('namingDuplicateTitleGroups(namingData.entries)', context);
assert.strictEqual(exactGroups[0].exactDuplicate, true);
assert.strictEqual(vm.runInContext('namingDuplicateGroupComplete(namingDuplicateTitleGroups(namingData.entries)[0])', context), true);

console.log('naming duplicate resolver: detection and hybrid merge passed');
