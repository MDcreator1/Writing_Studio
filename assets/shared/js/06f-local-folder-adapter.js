'use strict';

(function initializeLocalFolderAdapter(root) {
  async function readHandleText(handle) {
    return (await handle.getFile()).text();
  }

  async function writeHandleText(handle, value) {
    const writable = await handle.createWritable();
    try {
      await writable.write(value);
      await writable.close();
    } catch (error) {
      try { await writable.abort?.(); } catch (_) { /* preserve original failure */ }
      throw error;
    }
  }
  function pathParts(path) {
    if (typeof path !== 'string' || !path.trim()) throw new Error('Project path is required.');
    const parts = path.replace(/\\/g, '/').split('/');
    if (parts.some(part => !part || part === '.' || part === '..' || part.includes('\0'))) {
      throw new Error('Invalid project-relative path.');
    }
    return parts;
  }

  function create(folderHandle) {
    if (!folderHandle || typeof folderHandle.getFileHandle !== 'function') {
      throw new Error('A project folder handle is required.');
    }

    async function directory(path, options = {}) {
      const parts = path === '' ? [] : pathParts(path);
      let directory = folderHandle;
      for (const part of parts) {
        directory = await directory.getDirectoryHandle(part, { create: Boolean(options.create) });
      }
      return directory;
    }

    async function file(path, createMissing = false) {
      const parts = pathParts(path);
      const parent = await directory(parts.slice(0, -1).join('/'), { create: createMissing });
      return parent.getFileHandle(parts.at(-1), { create: createMissing });
    }

    async function readText(path) {
      return readHandleText(await file(path));
    }

    async function writeText(path, value, options = {}) {
      const text = String(value);
      const handle = await file(path, true);
      await writeHandleText(handle, text);
      if (options.verify && (await (await handle.getFile()).text()) !== text) {
        throw new Error(`Project file verification failed: ${path}`);
      }
    }

    async function readJson(path) {
      return JSON.parse(await readText(path));
    }

    async function writeJson(path, payload) {
      await writeText(path, JSON.stringify(payload, null, 2), { verify: true });
    }

    async function removeFile(path) {
      const parts = pathParts(path);
      const parent = await directory(parts.slice(0, -1).join('/'));
      await parent.removeEntry(parts.at(-1));
    }

    return Object.freeze({ readText, writeText, readJson, writeJson, removeFile,
      getFileHandle: (path, options = {}) => file(path, Boolean(options.create)),
      getDirectoryHandle: directory });
  }

  root.LmLocalFolderAdapter = Object.freeze({ create, pathParts, readHandleText, writeHandleText });
})(typeof window === 'undefined' ? globalThis : window);
