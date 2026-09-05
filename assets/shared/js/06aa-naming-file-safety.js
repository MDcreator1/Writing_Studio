'use strict';

(function initializeNamingFileSafety() {
  const writeTasks = new WeakMap();
  const migrationTasks = new WeakMap();
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

    // Stage and verify before touching the authoritative file.
    const stagingHandle = await projectHandle.getFileHandle('Story_Naming.pending.json', { create: true });
    await writeHandleText(stagingHandle, payload);
    const staged = await readHandleText(stagingHandle);
    validatePayload(staged, 'Staged naming data');
    if (staged !== payload) throw new Error('Naming staging verification failed.');
    if (projectHandle !== projectDirectoryHandle) throw new Error('Stale project Naming write was cancelled.');
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

  async function migrateAuthoritative(projectHandle, fallback = null) {
    if (migrationTasks.has(projectHandle)) return migrationTasks.get(projectHandle);
    const task = (async () => {
      const handle = await existingNamingFile(projectHandle, PROJECT_NAMING_FILE);
      const rawText = handle ? await readHandleText(handle) : '';
      const raw = rawText ? validatePayload(rawText, 'Authoritative naming data') : fallback;
      if (!raw) throw new Error('No complete Naming dataset is available for migration.');
      if (raw.schemaVersion >= 2) {
        if (!handle) await writeVerified(projectHandle, PROJECT_NAMING_FILE, JSON.stringify(raw, null, 2));
        return raw;
      }
      const migrated = migrateNamingDataset(raw);
      if (projectHandle !== projectDirectoryHandle) throw new Error('Stale project Naming migration was cancelled.');
      const backupDirectory = await (await projectHandle.getDirectoryHandle('Initial_Rendering', { create: true }))
        .getDirectoryHandle('Backups', { create: true });
      const backup = await backupDirectory.getFileHandle('Story_Naming.schema-v1.json', { create: true });
      const original = rawText || JSON.stringify(raw, null, 2);
      await writeHandleText(backup, original);
      if (await readHandleText(backup) !== original) throw new Error('Naming migration backup verification failed.');
      await writeVerified(projectHandle, PROJECT_NAMING_FILE, JSON.stringify(migrated, null, 2));
      return migrated;
    })();
    migrationTasks.set(projectHandle, task);
    try { return await task; }
    finally { migrationTasks.delete(projectHandle); }
  }

  const promotionJournalFile = 'Story_Naming.promotion.json';

  async function pathHandle(project, path, create = false) {
    const segments = String(path).replace(/\\/g, '/').split('/');
    if (segments.some(segment => !segment || segment === '.' || segment === '..' || segment.includes(':'))) throw new Error('Invalid promotion path');
    let directory = project;
    for (const segment of segments.slice(0, -1)) directory = await directory.getDirectoryHandle(segment, { create });
    return { directory, name: segments.at(-1), handle: await directory.getFileHandle(segments.at(-1), { create }) };
  }

  async function removePath(project, path) {
    try {
      const target = await pathHandle(project, path);
      await target.directory.removeEntry(target.name);
    } catch (error) { if (error?.name !== 'NotFoundError') throw error; }
  }

  async function restorePromotionFiles(project, journal) {
    for (const file of journal.previousFiles) {
      if (file.text === null) await removePath(project, file.path);
      else {
        const target = await pathHandle(project, file.path, true);
        await writeHandleText(target.handle, file.text);
        if (await readHandleText(target.handle) !== file.text) throw new Error('Promotion rollback verification failed.');
      }
    }
  }

  async function recoverPromotion(project) {
    const handle = await existingNamingFile(project, promotionJournalFile);
    if (!handle) return;
    const journal = JSON.parse(await readHandleText(handle));
    if (!journal || !Array.isArray(journal.previousFiles) || !Array.isArray(journal.removePaths)) throw new Error('Invalid promotion recovery journal.');
    if (journal.phase !== 'committed') await restorePromotionFiles(project, journal);
    else for (const path of journal.removePaths) await removePath(project, path);
    await project.removeEntry(promotionJournalFile);
  }

  async function commitPromotion(project, { promotionId, documents, removePaths = [] }) {
    if (!project) return true;
    await recoverPromotion(project);
    const paths = [...new Set([...documents.map(item => item.path), PROJECT_NAMING_FILE, PROJECT_DRAFTS_FILE, PROJECT_MANIFEST_FILE])];
    const previousFiles = [];
    for (const path of paths) {
      try { previousFiles.push({ path, text: await readHandleText((await pathHandle(project, path)).handle) }); }
      catch (error) {
        if (error?.name !== 'NotFoundError') throw error;
        previousFiles.push({ path, text: null });
      }
    }
    const journal = { promotionId, phase: 'prepared', previousFiles, removePaths };
    const journalHandle = await project.getFileHandle(promotionJournalFile, { create: true });
    const saveJournal = async () => {
      const value = JSON.stringify(journal);
      await writeHandleText(journalHandle, value);
      if (await readHandleText(journalHandle) !== value) throw new Error('Promotion journal verification failed.');
    };
    await saveJournal();
    try {
      for (const item of documents) {
        if (project !== projectDirectoryHandle) throw new Error('Project changed during promotion.');
        const handle = (await pathHandle(project, item.path, true)).handle;
        await writeHandleText(handle, item.text);
        if (await readHandleText(handle) !== item.text) throw new Error('Promoted document verification failed.');
      }
      if (!await writeCurrentProject(project, { skipSnapshotSync: true })) throw new Error('Naming promotion save failed.');
      if (project !== projectDirectoryHandle) throw new Error('Project changed during promotion.');
      await writeDraftsDataToProject();
      if (project !== projectDirectoryHandle) throw new Error('Project changed during promotion.');
      await writeProjectManifest();
      if (project !== projectDirectoryHandle) throw new Error('Project changed during promotion.');
      journal.phase = 'committed';
      await saveJournal();
    } catch (error) {
      await restorePromotionFiles(project, journal);
      await project.removeEntry(promotionJournalFile);
      throw error;
    }
    // The commit is durable. A cleanup failure is retried from the journal on open.
    try {
      for (const path of removePaths) await removePath(project, path);
      await project.removeEntry(promotionJournalFile);
    } catch (error) { console.warn('Committed promotion cleanup will retry on open:', error); }
    return true;
  }

  function writeCurrentProject(projectHandle, options = {}) {
    if (!projectHandle) return Promise.resolve(false);
    const previous = writeTasks.get(projectHandle) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      if (projectHandle !== projectDirectoryHandle) return false;
      const suppliedAuthoritativeData = options.authoritativeData
        ? normalizeNamingData(options.authoritativeData)
        : null;
      const hydratedData = suppliedAuthoritativeData ||
        await window.LmInitialRendering?.ensureFullNamingData?.({ projectHandle });
      if (projectHandle !== projectDirectoryHandle) return false;
      const existingHandle = await existingNamingFile(projectHandle, PROJECT_NAMING_FILE);
      const existingText = existingHandle ? await readHandleText(existingHandle) : '';
      const existingData = existingText ? validatePayload(existingText, 'Existing Story_Naming.json') : null;
      // Keep a local full-data reference: snapshot refresh may replace the global
      // namingData with a per-document projection while this async write is active.
      const capturedFullData = normalizeNamingData(suppliedAuthoritativeData || hydratedData || namingData);
      const authoritativeData = options.sourcePatches && existingData
        ? normalizeNamingData(existingData)
        : preserveRecordsUnlessExplicitlyRemoved(capturedFullData, existingData, options);
      if (options.sourcePatches) {
        for (const entry of authoritativeData.entries) {
          if (Object.prototype.hasOwnProperty.call(options.sourcePatches, entry.id)) entry.source = options.sourcePatches[entry.id];
        }
      }
      if (options.deduplicateDescriptionHistory === true) {
        authoritativeData.entries.forEach(deduplicateNamingDescriptionHistory);
      }
      const payload = JSON.stringify(authoritativeData, null, 2);
      const semanticPayload = JSON.stringify(authoritativeData);
      const semanticExisting = existingData ? JSON.stringify(normalizeNamingData(existingData)) : '';
      if (semanticPayload !== semanticExisting) {
        await writeVerified(projectHandle, PROJECT_NAMING_FILE, payload);
      }
      if (projectHandle !== projectDirectoryHandle) return true;
      try { localStorage.setItem(NAMING_STORAGE_KEY, JSON.stringify(authoritativeData)); }
      catch (cacheError) { console.warn('Naming browser cache update skipped:', cacheError); }
      try { if (!options.skipSnapshotSync) await window.LmInitialRendering?.syncNamingIndex?.(authoritativeData); }
      catch (snapshotError) { console.error('Naming rendering snapshot sync failed:', snapshotError); }
      return true;
    });
    writeTasks.set(projectHandle, task);
    return task;
  }

  window.LmNamingFileSafety = Object.freeze({ writeVerified, writeCurrentProject, migrateAuthoritative, commitPromotion, recoverPromotion });
})();
