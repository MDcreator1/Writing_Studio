'use strict';

// The native helper watches ONLY this explicitly selected project's request file.
// No HTTP service, browser extension, or changes to TXT story content are needed.
(function initializeChapterPropertiesBridge() {
  const writes = new Map();
  let sequence = 0;
  let queued = Promise.resolve();
  let lastWarning = '';
  const sent = new Map();
  const deletedByProject = new WeakMap();
  const notifiedDeletions = new WeakMap();

  async function deletionState(project) {
    try {
      const directory = await project.getDirectoryHandle('.chapter-properties');
      const state = await jsonFile(directory, 'deletion-state.json');
      deletedByProject.set(project, new Set(state.deletedPaths || []));
      return state;
    } catch (error) {
      if (error.name === 'NotFoundError') return null;
      throw error;
    }
  }

  function deletedChapterError() {
    return new Error('चैप्टर TXT बाहर से हटाई गई है और सूची बदल गई है। प्रोजेक्ट दोबारा खोलें; पुराना ऑटोसेव रोका गया।');
  }

  async function beforeManifestSave(project, manifest) {
    const state = await deletionState(project);
    if (!state) return;
    const deleted = new Set(state.deletedPaths || []);
    const records = [...(manifest.parts || []).flatMap(part => part.chapters || []), ...(manifest.chapters || [])];
    if (records.some(record => deleted.has(record.content_path || record.contentPath))) throw deletedChapterError();
  }

  async function beforeChapterWrite(project, relative) {
    if (!/^Chapters\/[^/:\\]+\.txt$/i.test(relative)) return;
    const state = await deletionState(project);
    if (state?.deletedPaths?.includes(relative)) throw deletedChapterError();
    if (state && project === projectDirectoryHandle && typeof chapters !== 'undefined' &&
        chapters.some(chapter => state.deletedPaths.includes(chapter.contentPath))) throw deletedChapterError();
    // Also protects the short interval BEFORE the helper confirms deletion.
    let backup;
    try { backup = await jsonFile(await project.getDirectoryHandle('.chapter-properties'), 'index-backup.json'); }
    catch (error) { if (error.name === 'NotFoundError') return; throw error; }
    if (!backup.chapters?.some(record => record.path === relative)) return;
    try { await (await project.getDirectoryHandle('Chapters')).getFileHandle(relative.slice(9)); }
    catch (error) { if (error.name === 'NotFoundError') throw deletedChapterError(); throw error; }
  }

  async function beforeFileWrite(handle, value) {
    if (!handle || !projectDirectoryHandle) return;
    if (handle.name === 'Chapters_info.json') {
      const location = await projectDirectoryHandle.resolve(handle);
      if (location?.length === 1) await beforeManifestSave(projectDirectoryHandle, JSON.parse(value));
      return;
    }
    if (!handle.name?.toLowerCase().endsWith('.txt')) return;
    const relative = await projectDirectoryHandle.resolve(handle);
    if (relative?.[0] === 'Chapters') await beforeChapterWrite(projectDirectoryHandle, relative.join('/'));
    else if (!relative) await beforeChapterWrite(projectDirectoryHandle, `Chapters/${handle.name}`);
  }

  function newChapterPath(index) {
    const existing = typeof chapters !== 'undefined' ? chapters : [];
    const paths = [...existing.map(chapter => chapter.contentPath || ''),
      ...(deletedByProject.get(projectDirectoryHandle) || [])];
    const highest = paths.reduce((max, path) => Math.max(max, Number(path.match(/^Chapters\/chapter_(\d+)\.txt$/i)?.[1]) || 0), 0);
    const number = Math.max(highest + 1, existing.length + 1) + Math.max(0, index - existing.length);
    return `Chapters/chapter_${String(number).padStart(2, '0')}.txt`;
  }

  async function checkExternalDeletion() {
    if (typeof projectDirectoryHandle === 'undefined' || !projectDirectoryHandle) return;
    const project = projectDirectoryHandle;
    const state = await deletionState(project);
    if (!state || state.phase !== 'applied' || notifiedDeletions.get(project) === state.revision) return;
    notifiedDeletions.set(project, state.revision);
    // Keep any unsaved text visible; never reload the page automatically.
    if (typeof chapters !== 'undefined' && chapters.some(chapter => state.deletedPaths.includes(chapter.contentPath))) {
      warn('बाहर से हटाए गए चैप्टरों का रिकॉर्ड हटाकर क्रम अपडेट कर दिया गया है। नई सूची के लिए प्रोजेक्ट दोबारा खोलें।');
    }
  }

  async function sha256(value) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function noteWrite(handle, value) {
    if (handle?.name?.toLowerCase().endsWith('.txt')) {
      writes.set(handle, { version: ++sequence, hash: sha256(value).catch(() => null) });
    }
  }

  async function jsonFile(directory, name) {
    return JSON.parse(await (await directory.getFileHandle(name)).getFile().then(file => file.text()));
  }

  async function stateDirectory(project) {
    try {
      const directory = await project.getDirectoryHandle('.chapter-properties');
      const enabled = await jsonFile(directory, 'enabled.json');
      if (enabled.schemaVersion !== 1 || !enabled.nonce) return null;
      return { directory, enabled };
    } catch (error) {
      if (error.name === 'NotFoundError') return null;
      throw error;
    }
  }

  function warn(message) {
    if (message === lastWarning) return;
    lastWarning = message;
    console.warn('Chapter properties:', message);
    if (typeof showMiniReminder === 'function') showMiniReminder(message);
  }

  async function send(project, payload) {
    const state = await stateDirectory(project);
    if (!state) return false;
    const { directory, enabled } = state;
    try {
      const status = await jsonFile(directory, 'status.json');
      if (status.nonce === enabled.nonce && status.ok && sent.has(status.requestId)) {
        const cutoff = sent.get(status.requestId);
        for (const [handle, record] of writes) if (record.version <= cutoff) writes.delete(handle);
        sent.clear();
      } else if (status.nonce === enabled.nonce && !status.ok) {
        warn(`टेक्स्ट सेव है; Chapter Properties अपडेट नहीं हुईं: ${status.message}`);
      }
    } catch (error) {
      if (error.name !== 'NotFoundError') throw error;
    }
    const manifest = JSON.parse(payload);
    const records = [...(manifest.parts || []).flatMap(part => part.chapters || []), ...(manifest.chapters || [])];
    const changedPaths = [];
    const contentHashes = {};
    const cutoff = sequence;
    const pendingWrites = new Map(writes);
    let chaptersDirectory = null;
    for (const record of records) {
      const relative = record.content_path || '';
      if (!/^Chapters\/[^/:\\]+\.txt$/i.test(relative)) continue;
      const name = relative.slice('Chapters/'.length);
      const candidates = [...pendingWrites.keys()].filter(handle => handle.name === name);
      if (!candidates.length) continue;
      chaptersDirectory ||= await project.getDirectoryHandle('Chapters');
      const actual = await chaptersDirectory.getFileHandle(name);
      for (const handle of candidates) {
        if (await actual.isSameEntry(handle)) {
          const hash = await pendingWrites.get(handle).hash;
          if (!hash) throw new Error('Saved chapter hash could not be computed.');
          changedPaths.push(relative);
          contentHashes[relative] = hash;
          break;
        }
      }
    }
    const manifestHash = await sha256(payload);
    const requestId = crypto.randomUUID();
    const handle = await directory.getFileHandle('save-request.json', { create: true });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify({ nonce: enabled.nonce, requestId, manifestHash, changedPaths, contentHashes }));
    await writable.close();
    sent.set(requestId, cutoff);
    if (sent.size > 50) sent.delete(sent.keys().next().value);
    return true;
  }

  function afterManifestSaved(project, payload) {
    queued = queued.then(() => send(project, payload)).catch(error => {
      warn(`टेक्स्ट सेव है; Chapter Properties अनुरोध विफल: ${error.message}`);
      return false;
    });
    return queued;
  }

  async function showStatus() {
    if (!projectDirectoryHandle) return warn('पहले प्रोजेक्ट खोलें।');
    const state = await stateDirectory(projectDirectoryHandle);
    if (!state) return warn('Windows helper शुरू करें: tools/start-chapter-properties.cmd');
    const status = await jsonFile(state.directory, 'status.json');
    const request = await jsonFile(state.directory, 'save-request.json').catch(() => null);
    const pending = request?.nonce === state.enabled.nonce && request.requestId !== status.requestId;
    lastWarning = '';
    warn(pending ? 'Chapter Properties अपडेट की प्रतीक्षा है। Helper की विंडो खुली रखें।'
      : status.ok ? `${status.chapters} चैप्टर की Properties सुरक्षित हैं।` : status.message);
  }

  if (typeof setInterval === 'function') setInterval(() => {
    checkExternalDeletion().catch(error => console.warn('Chapter deletion status:', error));
  }, 2000);
  window.LmChapterProperties = Object.freeze({ noteWrite, afterManifestSaved, showStatus,
    beforeManifestSave, beforeChapterWrite, beforeFileWrite, newChapterPath, checkExternalDeletion });
})();
