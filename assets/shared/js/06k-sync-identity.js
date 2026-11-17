'use strict';

(function initializeSyncIdentity(root) {
  const PATH = '.lekhak-sync/identity.json';
  function create(adapter) {
    let queue = Promise.resolve();
    async function read() {
      try {
        const data = await adapter.readJson(PATH);
        if (data.version !== 1 || typeof data.projectId !== 'string' || !data.documents || typeof data.documents !== 'object' || Array.isArray(data.documents)) throw new Error('Invalid sync identity registry.');
        return data;
      } catch (error) {
        if (error.name !== 'NotFoundError') throw error;
        return { version: 1, projectId: root.LmParagraphModel.newId(), documents: {} };
      }
    }
    function transaction(action) {
      const perform = async () => {
        const data = await read();
        const result = action(data);
        await adapter.writeJson(PATH, data);
        return result;
      };
      const task = queue.then(() => root.navigator?.locks ? root.navigator.locks.request('lekhak-sync-identity-registry', perform) : perform());
      queue = task.catch(() => {});
      return task;
    }
    function key(document) {
      if (!document || typeof document.kind !== 'string' || !document.kind || typeof document.contentPath !== 'string' || !document.contentPath) throw new Error('Document kind and source path are required for identity mapping.');
      return JSON.stringify([document.kind, document.contentPath]);
    }
    function documentIdentity(scopeId, document) {
      const mappingKey = key(document);
      if (typeof scopeId !== 'string' || !scopeId) return Promise.reject(new Error('Identity scope is required.'));
      return transaction(data => {
        if (!data.documents[mappingKey]) data.documents[mappingKey] = root.LmParagraphModel.newId();
        return { scopeId, projectId: data.projectId, documentId: data.documents[mappingKey] };
      });
    }
    function remap(from, to) {
      const oldKey = key(from), newKey = key(to);
      return transaction(data => {
        if (!data.documents[oldKey]) throw new Error('Original document identity is missing.');
        if (data.documents[newKey] && data.documents[newKey] !== data.documents[oldKey]) throw new Error('Destination already has a different identity.');
        data.documents[newKey] = data.documents[oldKey];
        if (oldKey !== newKey) delete data.documents[oldKey];
        return data.documents[newKey];
      });
    }
    return Object.freeze({ documentIdentity, remap });
  }
  root.LmSyncIdentity = Object.freeze({ create, PATH });
})(typeof window === 'undefined' ? globalThis : window);
