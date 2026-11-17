'use strict';

(function initializeStorageContracts(root) {
  const MODES = Object.freeze({ LOCAL: 'local', DATABASE: 'database', HYBRID: 'hybrid' });
  const DESTINATIONS = Object.freeze({ FOLDER: 'folder', SERVER: 'server' });

  function normalizeMode(value) {
    return Object.values(MODES).includes(value) ? value : MODES.LOCAL;
  }

  function destinationsForMode(mode) {
    switch (normalizeMode(mode)) {
      case MODES.DATABASE: return [DESTINATIONS.SERVER];
      case MODES.HYBRID: return [DESTINATIONS.FOLDER, DESTINATIONS.SERVER];
      default: return [DESTINATIONS.FOLDER];
    }
  }

  function createSession(input = {}) {
    const mode = normalizeMode(input.mode);
    const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : '';
    const folderHandle = input.folderHandle || null;
    const remoteProjectId = typeof input.remoteProjectId === 'string' ? input.remoteProjectId.trim() : '';
    const accountId = typeof input.accountId === 'string' ? input.accountId.trim() : '';
    const profileId = typeof input.profileId === 'string' ? input.profileId.trim() : '';
    if (!projectId) throw new Error('Storage session requires a project ID.');
    if (mode !== MODES.DATABASE && !folderHandle) throw new Error('Folder binding is required for this storage mode.');
    if (mode !== MODES.LOCAL && (!remoteProjectId || !accountId || !profileId)) {
      throw new Error('Remote project, account and profile bindings are required for this storage mode.');
    }
    return Object.freeze({ mode, projectId, folderHandle, remoteProjectId, accountId, profileId,
      epoch: Number.isSafeInteger(input.epoch) && input.epoch >= 0 ? input.epoch : 0 });
  }

  function sameSession(left, right) {
    return Boolean(left && right && left.mode === right.mode && left.projectId === right.projectId &&
      left.folderHandle === right.folderHandle && left.remoteProjectId === right.remoteProjectId &&
      left.accountId === right.accountId && left.profileId === right.profileId && left.epoch === right.epoch);
  }

  function saveStatus(mode, revision, acknowledgements = {}) {
    const required = destinationsForMode(mode);
    const staged = typeof revision === 'string' && revision.length > 0;
    const pending = required.filter(destination => acknowledgements[destination] !== revision);
    return Object.freeze({ staged, pending: Object.freeze(pending), synced: staged && pending.length === 0 });
  }

  root.LmStorageContracts = Object.freeze({ MODES, DESTINATIONS, normalizeMode,
    destinationsForMode, createSession, sameSession, saveStatus });
})(typeof window === 'undefined' ? globalThis : window);
