'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '../assets/pages/story-novel-project-editor/js', name), 'utf8');
function load(context, source, start, end) {
  vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))), context);
}

async function run() {
  const writes = [];
  let fullSaves = 0;
  const navigation = vm.createContext({
    projectDirectoryHandle: { name: 'Story' }, curChap: 4, curPart: 1, curDraft: 2,
    isDraftActive: () => true, currentProjectTypeFolderName: () => 'Stories',
    localStorage: { setItem: (key, value) => writes.push([key, value]) },
    saveActiveEditorStateForStory: (...args) => writes.push(['identity', ...args]),
    saveToStorage: () => fullSaves++
  });
  load(navigation, read('01d-editor-init-chapters.js'), 'function saveEditorNavigationToStorage', 'function saveToStorage');
  navigation.saveEditorNavigationToStorage();
  assert.equal(fullSaves, 0);
  assert.deepEqual(writes.map(([key]) => key), ['lm_curChap', 'lm_curPart', 'lm_curDraft', 'lm_activeEditorMode', 'identity']);
  navigation.projectDirectoryHandle = null;
  navigation.saveEditorNavigationToStorage();
  assert.equal(fullSaves, 1, 'memory-only projects retain full recovery saves');

  const events = [];
  const frames = [], timers = [];
  const context = vm.createContext({
    console, editorDocumentLoadSequence: 1, activeSidePanel: 'facts', curChap: 0, curDraft: 0,
    window: {}, requestAnimationFrame: task => frames.push(task), setTimeout: task => timers.push(task),
    finalizeEditorDocumentAfterPaint: () => events.push('history'),
    runSurfaceEditorWorkerAnalysis: () => events.push('analysis'),
    updateChapterStatus() {}, saveEditorNavigationToStorage: () => events.push('navigation'),
    scheduleAdjacentEditorDocumentPrefetch() {}, isDraftActive: () => false,
    renderActiveWorkspaceSidePanel() {}, setSaveStatusDot: () => events.push('saved-indicator'),
    setDefaultSaveStatus() {}, text: () => ({ saved: 'saved' })
  });
  const pipeline = read('01h-virtual-editor-pipeline.js');
  load(context, pipeline, 'function scheduleEditorDocumentPostRender', 'async function switchChap');
  const tasks = {
    commitPreviousSnapshot: () => events.push('commit'),
    cleanupPreviousEditDraft: () => events.push('cleanup'),
    savePreviousDocument: () => events.push('save-previous'),
    releasePreviousSnapshot: () => events.push('release')
  };
  context.scheduleEditorDocumentPostRender(1, { content: 'body' }, tasks);
  frames.shift()();
  assert.deepEqual(events, ['history'], 'expensive work waits beyond the frame callback');
  timers.shift()();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['history', 'analysis', 'navigation', 'commit', 'cleanup', 'save-previous', 'release', 'saved-indicator']);
  events.length = 0;
  context.scheduleEditorDocumentPostRender(1, { content: 'old' }, tasks);
  context.editorDocumentLoadSequence = 2;
  frames.shift()(); timers.shift()();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['commit', 'cleanup', 'save-previous', 'release'], 'superseded navigation still saves the previous document without changing the new UI');

  let rebuilds = 0, hidden = false;
  const target = { classList: { add() {} }, closest: () => hidden ? {} : null };
  context.document = { querySelectorAll: () => [], querySelector: () => target };
  context.renderChapters = () => rebuilds++;
  load(context, pipeline, 'function syncImmediateSidebarDocumentHighlight', 'function finalizeEditorDocumentAfterPaint');
  context.syncImmediateSidebarDocumentHighlight('chapter', 0, 2);
  assert.equal(frames.length, 0, 'visible row switches do not rebuild the sidebar');
  hidden = true;
  context.syncImmediateSidebarDocumentHighlight('chapter', 0, 2);
  frames.shift()();
  assert.equal(rebuilds, 1, 'a retained row inside a collapsed section still opens its section');

  const classSet = new Set(['is-expanded', 'is-active-part']);
  const toggle = { value: 'true', getAttribute() { return this.value; }, setAttribute(key, value) { this.value = value; } };
  const section = {
    classList: { remove: (...keys) => keys.forEach(key => classSet.delete(key)), add: key => classSet.add(key) },
    querySelector: () => toggle
  };
  let selected = false;
  const panel = {
    querySelector: selector => selector.startsWith('[data-editor-document=') ? target : selected ? {} : null,
    querySelectorAll: () => [section]
  };
  Object.assign(context, {
    document: { getElementById: id => id === 'chapter-panel' ? panel : null },
    isDraftTrashMode: false, projectManifest: { parts: [{}] },
    lmChevronSpan: () => 'right-chevron', renderChapterPanelHeading() {}, syncWorkspaceTopbarState() {},
    updateChapterPanelBottomActions() {}, updateStorySummary() {}, applyChapterPanelOverflowClasses() {},
    scheduleChapterPanelOverflowCheck() {}, syncSidebarScrollThumbs() {}
  });
  load(context, read('01g-trash-drafts-virtualization.js'), 'function syncSidebarForDraftNavigation', 'function renderChapters');
  context.syncSidebarForDraftNavigation();
  assert.deepEqual([...classSet], ['is-collapsed']);
  assert.equal(toggle.value, 'false');
  assert.equal(rebuilds, 1, 'normal draft navigation preserves the existing row DOM');
  selected = true;
  context.syncSidebarForDraftNavigation();
  assert.equal(rebuilds, 2, 'selection action menus retain the full-render fallback');
  console.log('document-switch-performance: navigation persistence, frame scheduling, stale saves and sidebar transitions passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
