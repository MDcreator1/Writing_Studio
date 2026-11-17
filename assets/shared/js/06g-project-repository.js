'use strict';

(function initializeProjectRepository(root) {
  const folders = new WeakMap();
  const identities = new WeakMap();
  let identitySequence = 0;

  // A repository is permanently bound to its captured folder. It must never
  // resolve a path against a mutable active-project global after an await.
  function forFolder(handle) {
    if (!handle) throw new Error('Project folder is not selected.');
    if (!folders.has(handle)) folders.set(handle, root.LmLocalFolderAdapter.create(handle));
    return folders.get(handle);
  }

  function createSessionController() {
    let current = null;
    let epoch = 0;
    function activate(binding) {
      current = root.LmStorageContracts.createSession({ ...binding, epoch: ++epoch });
      return current;
    }
    function clear() { current = null; epoch += 1; }
    function isCurrent(captured) { return captured !== null && captured === current; }
    async function run(operation) {
      const captured = current;
      if (!captured) throw new Error('No active project session.');
      const result = await operation(captured);
      if (!isCurrent(captured)) throw new Error('Project session changed during operation.');
      return result;
    }
    return Object.freeze({ activate, clear, isCurrent, run, current: () => current });
  }

  const sessions = createSessionController();
  function activateFolder(handle) {
    if (!handle) { sessions.clear(); return null; }
    if (!identities.has(handle)) identities.set(handle, `local-session-${++identitySequence}`);
    // These IDs are session-local. Durable portable IDs belong to milestone 3.
    return sessions.activate({ projectId: identities.get(handle), folderHandle: handle, mode: 'local' });
  }

  root.LmProjectRepository = Object.freeze({ forFolder, createSessionController, activateFolder, sessions });
})(typeof window === 'undefined' ? globalThis : window);
