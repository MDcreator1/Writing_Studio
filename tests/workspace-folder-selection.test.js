'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../assets/shared/js/06b-workspace-restore-autosave.js'), 'utf8');
const selectionSource = source.slice(source.indexOf('let workspacePickerPending'), source.indexOf('function sanitizeStoryFolderName'));

function setup({ permission = 'prompt', request = 'granted', pickerError, loadError, libraryError, home = true } = {}) {
  const events = [];
  const button = { hidden: true };
  const handle = { name: 'Existing workspace', kind: 'directory', requestPermission: async options => {
    events.push(['request', options.mode]);
    return request;
  } };
  let message = '';
  const context = vm.createContext({
    console: { warn() {} }, document: { getElementById: () => button, addEventListener() {} },
    isHomePage: () => home, supportsLocalProjectFolders: () => true,
    text: () => ({}), setHomeMenuStatus: value => { message = value; },
    showProjectGate: value => { message = value; }, hideProjectGate() {},
    showAppLoader() {}, hideAppLoader() {}, refreshProjectUI() {},
    renderHomeRecentProjectsList: async () => {
      events.push(['library']);
      if (libraryError) throw libraryError;
    },
    closeHomeRecentProjectsPanel: () => events.push(['close-library']),
    verifyProjectPermission: async (selected, requestPermission) => {
      assert.equal(selected, handle);
      assert.equal(requestPermission, false);
      return permission === 'granted';
    },
    loadWorkspaceFolder: async selected => {
      if (loadError) throw loadError;
      events.push(['load', selected]);
    },
    window: { showDirectoryPicker: async options => {
      events.push(['picker', options]);
      if (pickerError) throw pickerError;
      return handle;
    } }
  });
  vm.runInContext(selectionSource, context);
  return { context, events, handle, button, message: () => message };
}

test('picker requests editing access and offers an explicit permission retry when needed', async () => {
  const s = setup();
  await s.context.selectLocalProjectFolder();
  assert.equal(s.events[0][1].mode, 'readwrite');
  assert.equal(s.events.length, 1);
  assert.equal(s.button.hidden, false);
  assert.match(s.message(), /Existing workspace/);
  const approval = s.context.allowSelectedWorkspaceFolder();
  assert.equal(s.events[1][0], 'request'); // Called synchronously with the button action.
  await approval;
  assert.equal(s.events[1][1], 'readwrite');
  assert.deepEqual(s.events[2], ['load', s.handle]);
  assert.equal(s.events[3][0], 'library');
  assert.equal(s.button.hidden, true);
});

test('denied editing permission does not load or replace the existing workspace', async () => {
  const s = setup({ request: 'denied' });
  await s.context.selectLocalProjectFolder();
  await s.context.allowSelectedWorkspaceFolder();
  assert.equal(s.events.some(e => e[0] === 'load'), false);
  assert.match(s.message(), /not granted/);
  assert.equal(s.button.hidden, false);
});

test('previously granted editing access connects without another permission prompt', async () => {
  const s = setup({ permission: 'granted' });
  await s.context.selectLocalProjectFolder();
  assert.deepEqual(s.events.map(e => e[0]), ['picker', 'load', 'library']);
});

test('picker cancellation preserves the workspace and permits another selection', async () => {
  const s = setup({ pickerError: Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' }) });
  await s.context.selectLocalProjectFolder();
  assert.match(s.message(), /No folder was selected/);
  await s.context.selectLocalProjectFolder();
  assert.equal(s.events.filter(e => e[0] === 'picker').length, 2);
  assert.equal(s.events.some(e => e[0] === 'load'), false);
});

test('rapid repeated clicks open only one picker', async () => {
  const s = setup();
  await Promise.all([s.context.selectLocalProjectFolder(), s.context.selectLocalProjectFolder()]);
  assert.equal(s.events.filter(e => e[0] === 'picker').length, 1);
});

test('storage failures are reported as connection failures, not picker cancellations', async () => {
  const s = setup({ loadError: Object.assign(new Error('Storage full'), { name: 'QuotaExceededError' }) });
  await s.context.selectLocalProjectFolder();
  await s.context.allowSelectedWorkspaceFolder();
  assert.match(s.message(), /Could not connect.*QuotaExceededError.*Storage full/);
});

test('dropped directory uses the same permission flow without opening the Windows picker', async () => {
  const s = setup();
  let prevented = false;
  await s.context.receiveWorkspaceFolderDrop({
    preventDefault() { prevented = true; },
    dataTransfer: { items: [{ kind: 'file', getAsFileSystemHandle: () => Promise.resolve(s.handle) }] }
  });
  assert.equal(prevented, true);
  assert.equal(s.events.length, 0);
  assert.equal(s.button.hidden, false);
  await s.context.allowSelectedWorkspaceFolder();
  assert.deepEqual(s.events.map(e => e[0]), ['request', 'load', 'library']);
});

test('dropping an individual file does not replace the workspace', async () => {
  const s = setup();
  await s.context.receiveWorkspaceFolderDrop({
    preventDefault() {},
    dataTransfer: { items: [{ kind: 'file', getAsFileSystemHandle: () => Promise.resolve({ kind: 'file' }) }] }
  });
  assert.equal(s.events.length, 0);
  assert.match(s.message(), /rather than an individual file/);
});

test('a project-list failure keeps the successful workspace connection and permits retry', async () => {
  const s = setup({ permission: 'granted', libraryError: new Error('Unreadable manifest') });
  await s.context.selectLocalProjectFolder();
  assert.deepEqual(s.events.map(e => e[0]), ['picker', 'load', 'library', 'close-library']);
  assert.match(s.message(), /Workspace ready.*Open Recent Project to try again/);
  assert.equal(s.button.hidden, true);
});

test('editor connection does not try to render the home-page library', async () => {
  const s = setup({ permission: 'granted', home: false });
  await s.context.selectLocalProjectFolder();
  assert.deepEqual(s.events.map(e => e[0]), ['picker', 'load']);
});
