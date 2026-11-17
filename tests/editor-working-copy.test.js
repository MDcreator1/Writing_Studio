'use strict';
const assert = require('node:assert/strict');
require('../assets/shared/js/06h-paragraph-model.js');
require('../assets/shared/js/06j-editor-working-copy.js');
const model = globalThis.LmParagraphModel;
const working = globalThis.LmEditorWorkingCopy;
let count = 0;
const ids = () => 'id-' + (++count);

(async () => {
  const initial = model.fromText('पहला\nदूसरा\nअंत', ids);
  const update = working.reconcile(initial, 'पहला\nनया\nदूसरा\nअंत', ids);
  assert.equal(update.paragraphs[0].id, initial[0].id);
  assert.equal(update.paragraphs[2].id, initial[1].id);
  assert.equal(update.paragraphs[3].id, initial[2].id);
  assert.equal(update.changes.inserted.length, 1);
  const deletion = working.reconcile(update.paragraphs, 'पहला\nअंत', ids);
  assert.equal(deletion.changes.removed.length, 2);
  const moved = working.reconcile(initial, 'दूसरा\nपहला\nअंत', ids);
  assert.equal(moved.paragraphs[0].id, initial[1].id);
  assert.equal(moved.paragraphs[1].id, initial[0].id);
  assert.equal(moved.changes.upserts.length, 3);
  let current = null;
  const pending = [];
  const store = {
    getDocument: async () => structuredClone(current),
    stage: async operation => {
      assert.equal(operation.baseVersion, current?.localVersion || 0);
      pending.push(operation);
      current = { ...operation, localVersion: operation.baseVersion + 1 };
      return current.localVersion;
    }
  };
  const controller = working.create(store);
  const identity = { scopeId: 'account/profile', projectId: 'p1', documentId: 'd1' };
  const first = controller.stage(identity, 'one');
  const second = controller.stage(identity, 'two');
  identity.documentId = 'wrong';
  await Promise.all([first, second]);
  assert.equal(current.localVersion, 2);
  assert.equal(pending[0].documentId, 'd1');
  await controller.stage({ ...identity, documentId: 'd1' }, 'two');
  assert.equal(pending.length, 2);
  await working.stageActive({}); // Local only has no configured working-store writes.
  console.log('editor working copy: identities, reconciliation, ordered staging and no-op save passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
