const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const directory = path.join(__dirname, '..', 'assets/pages/story-novel-project-editor/js');
const source = ['01g-trash-drafts-virtualization.js', '01h-virtual-editor-pipeline.js']
  .map(name => fs.readFileSync(path.join(directory, name), 'utf8')).join('\n');
function load(context, names) {
  vm.createContext(context);
  for (const name of names) {
    const match = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
    assert.ok(match, name);
    vm.runInContext(match[0], context);
  }
  return context;
}
const noop = () => {};
function environment() {
  const editor = {
    textContent: '', dataset: {}, scrollTop: 0, scrollHeight: 1000, clientHeight: 500,
    classList: { add: noop, remove: noop }, style: { setProperty: noop }
  };
  const selection = { removeAllRanges: noop, addRange(range) { this.offset = range.offset; } };
  const context = {
    editor, selection, console,
    document: { getElementById: () => editor, createRange: () => ({
      setStart(node, offset) { this.offset = offset; }, collapse: noop,
      cloneRange() { return this; }
    }) },
    window: { getSelection: () => selection },
    activeVirtualEditorDocument: { key: 'draft', start: 0, total: 100, temporarilyMaterialized: true },
    VIRTUAL_EDITOR_WINDOW_SIZE: 25, virtualEditorDOMSelectionTransactionSequence: 0,
    isVirtualEditorDOMSelectionTransaction: false, virtualEditorWindowRequest: 0,
    editorInputBridgeSequence: 1, restrictedInputCloseSequence: 0,
    requestAnimationFrame: noop, cancelEditorCaretAutoScroll: noop,
    setEditorRenderMode: noop, setPlainTextEditorValue: (e, text) => { e.textContent = text; },
    editorHistoryPositionForTextOffset: (e, offset) => ({ node: e, offset }),
    createVirtualEditorVisualShield: () => ({ remove: noop }),
    releaseVirtualEditorVisualShield: noop, editorCaretRect: () => ({ top: 100 }),
    virtualEditorTextOffsetViewportTop: () => 100, updateEditorScrollThumb: noop,
    currentEditorHistorySelection: () => ({ collapsed: true }),
    isFindOpen: false
  };
  return load(context, ['virtualEditorParagraphSeparator', 'virtualEditorLogicalParagraphs',
    'virtualEditorLogicalParagraphIndexForTextOffset', 'virtualEditorParagraphStartOffset']);
}

// Empty window-leading paragraphs and paragraph-end spaces are coordinates,
// including when Enter splits a Hindi paragraph after a space.
const rendered = environment();
load(rendered, ['applyVirtualEditorWindow']);
for (const lines of [
  ['', 'पहला शब्द ', 'अगला शब्द', ''],
  ['', 'पैराग्राफ', ''], // Backspace removed one of two lines above the paragraph.
  ['', '', 'पैराग्राफ', ''],
  ['', '', '']
]) {
  const text = lines.join('\n');
  const paragraph = lines.length - 2;
  rendered.applyVirtualEditorWindow({ documentKey: 'draft', start: 40,
    total: 100, windowText: text }, { caretAnchor: { paragraph: 40 + paragraph, offsetInParagraph: 0 } });
  assert.equal(rendered.editor.textContent, text, 'window rendering preserves every character');
  assert.equal(rendered.selection.offset, lines.slice(0, paragraph).join('\n').length + (paragraph ? 1 : 0),
    'caret remains at the intended paragraph start');
}

// Two full-DOM edits before a Worker acknowledgement must replace the current
// full range; stale totals used to leave duplicated trailing paragraphs.
const batch = environment();
Object.assign(batch, {
  virtualEditorBeforeInputContext: null, virtualEditorPendingPatchBatch: null,
  clearTimeout: noop, setTimeout: () => 1, flushVirtualEditorPatchBatch: noop,
  virtualEditorPatchBatchTimer: null, virtualEditorMaterializeTimer: null,
  virtualEditorFullAnalysisTimer: null, VIRTUAL_EDITOR_PATCH_BATCH_MS: 50
});
load(batch, ['virtualEditorPatchPayload', 'queueVirtualEditorPatchBatch', 'applyVirtualEditorDeltaResult']);
const paragraphs = Array.from({ length: 80 }, (_, i) => `पैराग्राफ ${i} ` + 'शब्द '.repeat(50));
const state = batch.activeVirtualEditorDocument;
state.sessionParagraphs = [...paragraphs];
state.total = paragraphs.length;
const split = [...paragraphs];
split.splice(40, 1, 'पहला भाग ', 'दूसरा भाग');
batch.editor.textContent = split.join('\n');
batch.queueVirtualEditorPatchBatch(batch.editor, state, 1, 1);
split.splice(41, 0, '');
batch.editor.textContent = split.join('\n');
batch.queueVirtualEditorPatchBatch(batch.editor, state, 2, 1);
assert.equal(state.total, split.length);
assert.equal(state.sessionParagraphs.join('\n'), split.join('\n'));
const workerParagraphs = [...paragraphs];
for (const patch of batch.virtualEditorPendingPatchBatch.patches) {
  workerParagraphs.splice(patch.start, patch.end - patch.start, ...patch.paragraphs);
}
assert.equal(workerParagraphs.join('\n'), split.join('\n'), 'batched Enter edits do not duplicate the tail');
Object.assign(batch, { setEditorStatValues: noop, isDraftActive: () => true,
  setDraftWordCache: noop, updateActiveDocumentWordCountLabel: noop, curDraft: 0 });
state.start = 60; state.end = 82;
batch.applyVirtualEditorDeltaResult({ documentKey: 'draft', start: 57, end: 82, total: 81, revision: 1 });
assert.equal(state.start, 60, 'acknowledgement cannot move the visible window base');
assert.equal(state.end, 82);
assert.equal(state.total, split.length, 'older acknowledgements cannot replace live totals');

// Resolve a delayed Worker response after the user types, moves the caret,
// ends the session, or replaces the document with another instance of its key.
async function responseCase(change, shouldRender, expectedOffset = 7) {
  const ctx = environment();
  const applications = [];
  let resolve;
  let anchor = { paragraph: 40, top: 100, caretAnchor: { paragraph: 40, offsetInParagraph: 7 } };
  Object.assign(ctx, {
    editorHTMLBridgeWorkerLane: { run: () => new Promise(done => { resolve = done; }) },
    temporaryVirtualEditorViewportAnchor: () => anchor,
    applyVirtualEditorWindow: (result, options) => applications.push(options)
  });
  load(ctx, ['restoreVirtualEditorWindowAroundViewport']);
  ctx.restoreVirtualEditorWindowAroundViewport({ preferCaret: true, viewportAnchor: anchor });
  change(ctx, value => { anchor = value; });
  resolve({ documentKey: 'draft', start: 28, end: 53, total: 100, windowText: 'text' });
  await new Promise(done => setImmediate(done));
  assert.equal(applications.length, shouldRender ? 1 : 0);
  if (shouldRender) assert.equal(applications[0].caretAnchor.offsetInParagraph, expectedOffset);
}
(async () => {
  await responseCase(noop, true);
  await responseCase(ctx => { ctx.editorInputBridgeSequence++; }, false);
  await responseCase(ctx => { ctx.restrictedInputCloseSequence++; }, false);
  await responseCase(ctx => { ctx.activeVirtualEditorDocument = { ...ctx.activeVirtualEditorDocument }; }, false);
  await responseCase((ctx, setAnchor) => setAnchor({ paragraph: 40, top: 100,
    caretAnchor: { paragraph: 40, offsetInParagraph: 15 } }), true, 15);
  await responseCase((ctx, setAnchor) => setAnchor({ paragraph: 70, top: 100,
    caretAnchor: { paragraph: 70, offsetInParagraph: 0 } }), false);
  console.log('editor-caret-virtualization: lossless windows, paragraph edits and delayed responses passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
