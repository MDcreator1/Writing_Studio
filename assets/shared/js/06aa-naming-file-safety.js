'use strict';

(function initializeNamingFileSafety() {
  const writeTasks = new WeakMap();
  async function readHandleText(handle) {
    return (await handle.getFile()).text();
  }

  async function writeHandleText(handle, value) {
    const writable = await handle.createWritable();
    await writable.write(value);
    await writable.close();
  }

  function validatePayload(value, label) {
    const parsed = JSON.parse(value);
    if (!parsed || !Array.isArray(parsed.categories) || !Array.isArray(parsed.entries)) {
      throw new Error(`${label} is not a valid Story_Naming payload.`);
    }
    return parsed;
  }

  function preserveRecordsUnlessExplicitlyRemoved(outgoing, existing, options = {}) {
    if (!existing) return outgoing;
    const protectedData = { ...outgoing };
    if (options.allowEntryRemoval !== true) {
      const outgoingEntryIds = new Set((outgoing.entries || []).map(entry => entry?.id).filter(Boolean));
      protectedData.entries = [
        ...(outgoing.entries || []),
        ...(existing.entries || []).filter(entry => !entry?.id || !outgoingEntryIds.has(entry.id))
      ];
    }
    if (options.allowCategoryRemoval !== true) {
      const outgoingCategoryIds = new Set((outgoing.categories || []).map(category => category?.id).filter(Boolean));
      protectedData.categories = [
        ...(outgoing.categories || []),
        ...(existing.categories || []).filter(category => !category?.id || !outgoingCategoryIds.has(category.id))
      ];
    }
    return normalizeNamingData(protectedData);
  }

  async function existingNamingFile(projectHandle, fileName) {
    try {
      return await projectHandle.getFileHandle(fileName);
    } catch (error) {
      if (error?.name === 'NotFoundError') return null;
      throw error;
    }
  }

  async function writeBackup(projectHandle, previousText) {
    const initialDirectory = await projectHandle.getDirectoryHandle('Initial_Rendering', { create: true });
    const backupDirectory = await initialDirectory.getDirectoryHandle('Backups', { create: true });
    const backupHandle = await backupDirectory.getFileHandle('Story_Naming.previous.json', { create: true });
    await writeHandleText(backupHandle, previousText);
  }

  async function writeVerified(projectHandle, fileName, payload) {
    validatePayload(payload, 'Outgoing naming data');
    const previousHandle = await existingNamingFile(projectHandle, fileName);
    const previousText = previousHandle ? await readHandleText(previousHandle) : '';
    if (previousText) {
      validatePayload(previousText, 'Existing Story_Naming.json');
      await writeBackup(projectHandle, previousText);
    }

    const targetHandle = previousHandle || await projectHandle.getFileHandle(fileName, { create: true });
    try {
      await writeHandleText(targetHandle, payload);
      const verifiedText = await readHandleText(targetHandle);
      validatePayload(verifiedText, 'Verified Story_Naming.json');
      if (verifiedText !== payload) throw new Error('Story_Naming write verification did not match the outgoing payload.');
      return true;
    } catch (error) {
      if (previousText) {
        try { await writeHandleText(targetHandle, previousText); }
        catch (restoreError) { console.error('Story_Naming rollback failed:', restoreError); }
      } else if (typeof projectHandle.removeEntry === 'function') {
        try { await projectHandle.removeEntry(fileName); }
        catch (removeError) { console.error('Incomplete Story_Naming cleanup failed:', removeError); }
      }
      throw error;
    }
  }

  function writeCurrentProject(projectHandle, options = {}) {
    if (!projectHandle) return Promise.resolve(false);
    const previous = writeTasks.get(projectHandle) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      if (projectHandle !== projectDirectoryHandle) return false;
      const hydratedData = await window.LmInitialRendering?.ensureFullNamingData?.({ projectHandle });
      if (projectHandle !== projectDirectoryHandle) return false;
      const existingHandle = await existingNamingFile(projectHandle, PROJECT_NAMING_FILE);
      const existingText = existingHandle ? await readHandleText(existingHandle) : '';
      const existingData = existingText ? validatePayload(existingText, 'Existing Story_Naming.json') : null;
      // Keep a local full-data reference: snapshot refresh may replace the global
      // namingData with a per-document projection while this async write is active.
      const capturedFullData = normalizeNamingData(hydratedData || namingData);
      const authoritativeData = preserveRecordsUnlessExplicitlyRemoved(capturedFullData, existingData, options);
      const payload = JSON.stringify(authoritativeData, null, 2);
      const semanticPayload = JSON.stringify(authoritativeData);
      const semanticExisting = existingData ? JSON.stringify(normalizeNamingData(existingData)) : '';
      if (semanticPayload !== semanticExisting) {
        await writeVerified(projectHandle, PROJECT_NAMING_FILE, payload);
      }
      if (projectHandle !== projectDirectoryHandle) return true;
      try { localStorage.setItem(NAMING_STORAGE_KEY, JSON.stringify(authoritativeData)); }
      catch (cacheError) { console.warn('Naming browser cache update skipped:', cacheError); }
      try { await window.LmInitialRendering?.syncNamingIndex?.(authoritativeData); }
      catch (snapshotError) { console.error('Naming rendering snapshot sync failed:', snapshotError); }
      return true;
    });
    writeTasks.set(projectHandle, task);
    return task;
  }

  window.LmNamingFileSafety = Object.freeze({ writeVerified, writeCurrentProject });
})();
