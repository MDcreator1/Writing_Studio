'use strict';
const assert = require('node:assert/strict');
require('../assets/shared/js/06h-paragraph-model.js');
const model = globalThis.LmParagraphModel;
let id = 0;
const ids = () => String(++id);
for (const text of ['', '\n', '\r\n', 'a\r\nb\rc\n', 'पहला\n\nदूसरा\n', 'क्‍ष 👩‍💻', 'x'.repeat(100000)]) {
  assert.equal(model.toText(model.fromText(text, ids)), text);
}
const original = model.fromText('पहला दूसरा\r\nअंत', ids);
const split = model.apply(original, { type: 'split', paragraphId: original[0].id, offset: 5, newParagraphId: 'new' });
assert.equal(split[0].id, original[0].id);
assert.equal(split[1].id, 'new');
const joined = model.apply(split, { type: 'join', paragraphId: split[0].id, nextParagraphId: 'new' });
assert.equal(model.toText(joined), model.toText(original));
assert.equal(original.length, 2);
assert.throws(() => model.apply(original, { type: 'update', paragraphId: original[0].id, text: 'a\nb' }));
assert.throws(() => model.apply(model.fromText('😀', ids), { type: 'split', paragraphId: String(id), offset: 1 }));
assert.throws(() => model.fromText('a\nb', () => 'duplicate'));
console.log('paragraph model: lossless text, identities, split/join and invalid input passed');
