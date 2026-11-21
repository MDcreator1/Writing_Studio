'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/pages/story-novel-project-editor/js/01ia-draft-operation-progress.js'), 'utf8');
const nodes = [];
const listeners = new Set();
let focusRestored = 0;
const context = vm.createContext({
  setTimeout, Number, Boolean, Promise,
  window: { addEventListener: name => listeners.add(name), removeEventListener: name => listeners.delete(name) },
  document: {
    activeElement: { isConnected: true, focus() { focusRestored++; } },
    body: { appendChild() {} },
    createElement() {
      const children = new Map();
      const panel = { open: false, removed: false, events: {},
        setAttribute() {}, addEventListener(name, callback) { this.events[name] = callback; },
        querySelector(selector) { if (!children.has(selector)) children.set(selector, { textContent: '', removeAttribute(name) { delete this[name]; } }); return children.get(selector); },
        showModal() { this.open = true; }, close() { this.open = false; }, remove() { this.removed = true; }
      };
      nodes.push(panel); return panel;
    }
  }
});
vm.runInContext(source, context);
const progress = context.window.LmDraftProgress;
(async () => {
  let release;
  const pending = progress.run('Merge', 3, async () => {
    await progress.step('Reading', 1, 3);
    assert.equal(nodes[0].querySelector('progress').value, 1);
    await progress.step('Saving');
    assert.equal(nodes[0].querySelector('progress').value, undefined, 'unknown disk progress stays indeterminate');
    await new Promise(resolve => { release = resolve; });
    return 'saved';
  });
  while (!release) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(progress.active(), true);
  assert.equal(listeners.has('beforeunload'), true);
  let prevented = false;
  nodes[0].events.cancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true, 'Escape cannot silently cancel a destructive save');
  let duplicateRan = false;
  await progress.run('Delete', 1, () => { duplicateRan = true; });
  assert.equal(duplicateRan, false);
  release(); assert.equal(await pending, 'saved');
  assert.equal(progress.active(), false); assert.equal(listeners.size, 0);
  assert.equal(nodes[0].removed, true);
  await assert.rejects(progress.run('Delete', 1, async () => { throw new Error('Disk failure'); }), /Disk failure/);
  assert.equal(progress.active(), false); assert.equal(nodes[1].removed, true);
  assert.equal(listeners.size, 0); assert.equal(focusRestored, 2);
  console.log('draft-operation-progress: counts, indeterminate saves, duplicate prevention and failure cleanup passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
