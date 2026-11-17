'use strict';

(function initializeEditorWorkingCopy(root) {
  function reconcile(previous, text, idFactory = root.LmParagraphModel.newId) {
    const next = root.LmParagraphModel.fromText(text, idFactory);
    const before = previous || [];
    const equal = (a, b) => a.text === b.text && a.separator === b.separator;
    let start = 0;
    while (start < before.length && start < next.length && equal(before[start], next[start])) {
      next[start].id = before[start].id; start += 1;
    }
    let oldEnd = before.length, newEnd = next.length;
    while (oldEnd > start && newEnd > start && equal(before[oldEnd - 1], next[newEnd - 1])) {
      next[newEnd - 1].id = before[oldEnd - 1].id; oldEnd -= 1; newEnd -= 1;
    }
    const available = new Map();
    for (let i = start; i < oldEnd; i++) {
      const key = JSON.stringify([before[i].text, before[i].separator]);
      if (!available.has(key)) available.set(key, []);
      available.get(key).push(before[i]);
    }
    const claimed = new Set();
    const unmatched = [];
    for (let i = start; i < newEnd; i++) {
      const candidates = available.get(JSON.stringify([next[i].text, next[i].separator]));
      const match = candidates?.shift();
      if (match) { next[i].id = match.id; claimed.add(match.id); }
      else unmatched.push(i);
    }
    const remaining = before.slice(start, oldEnd).filter(item => !claimed.has(item.id));
    unmatched.forEach((index, offset) => { if (remaining[offset]) next[index].id = remaining[offset].id; });
    root.LmParagraphModel.validate(next);
    const oldIds = new Set(before.map(item => item.id));
    const oldById = new Map(before.map(item => [item.id, item]));
    const oldPredecessor = new Map(before.map((item, index) => [item.id, index ? before[index - 1].id : null]));
    const newIds = new Set(next.map(item => item.id));
    const changes = {
      removed: before.filter(item => !newIds.has(item.id)).map(item => item.id),
      upserts: next.flatMap((item, index) => {
        const old = oldById.get(item.id);
        const afterId = index ? next[index - 1].id : null;
        return !old || !equal(old, item) || oldPredecessor.get(item.id) !== afterId ? [{ ...item, afterId }] : [];
      }),
      inserted: next.filter(item => !oldIds.has(item.id)).map(item => item.id)
    };
    return { paragraphs: next, changes };
  }

  function create(store) {
    let queue = Promise.resolve();
    function stage(identity, text) {
      const captured = structuredClone(identity);
      if (typeof text !== 'string') return Promise.reject(new TypeError('Editor text must be a string.'));
      const task = queue.then(async () => {
        const before = await store.getDocument(captured);
        if (before && root.LmParagraphModel.toText(before.paragraphs) === text) return before.localVersion;
        const update = reconcile(before?.paragraphs, text);
        return store.stage({ ...captured, ...update, operationId: root.LmParagraphModel.newId(), baseVersion: before?.localVersion || 0 });
      });
      queue = task.catch(() => {});
      return task;
    }
    return Object.freeze({ stage, flush: () => queue });
  }

  let binding = null;
  function configure(value) {
    if (!value || !value.store || typeof value.identityForDocument !== 'function' || !value.folderHandle) throw new Error('Working copy requires explicit document identity and project binding.');
    binding = { ...value, controller: create(value.store) };
  }
  async function stageActive(snapshot) {
    const captured = binding;
    if (!captured) return Promise.resolve();
    if (snapshot.folderHandle !== captured.folderHandle) return Promise.resolve();
    const identity = await captured.identityForDocument(snapshot.document, snapshot.kind);
    if (!identity) return Promise.reject(new Error('Stable document identity is missing.'));
    return captured.controller.stage(identity, snapshot.text);
  }
  async function assertCacheResetSafe() {
    if(root.LmDatabaseEditor?.metadataUnsaved())throw new Error('Metadata अभी durable नहीं है। Retry या export करने के बाद cache reset करें।');
    if (binding) await binding.controller.flush();
    const store = await root.LmWorkingStore.open();
    try { if (await store.hasPending() || (binding && await binding.store.hasPending())) throw new Error('इस डिवाइस पर pending edits हैं। Cache reset से पहले उन्हें sync या export करें।'); }
    finally { store.close(); }
  }
  async function connectFolder({ folderHandle, scopeId }) {
    if (!folderHandle || typeof scopeId !== 'string' || !scopeId) throw new Error('Explicit folder and account/profile scope are required.');
    const store = await root.LmWorkingStore.open();
    const registry = root.LmSyncIdentity.create(root.LmProjectRepository.forFolder(folderHandle));
    configure({ store, folderHandle, identityForDocument: (document, kind) =>
      registry.documentIdentity(scopeId, { kind, contentPath: document?.contentPath }) });
    return Object.freeze({ store, registry });
  }
  root.LmEditorWorkingCopy = Object.freeze({ reconcile, create, configure, connectFolder, stageActive, assertCacheResetSafe,
    disconnect: () => { binding = null; } });
})(typeof window === 'undefined' ? globalThis : window);
