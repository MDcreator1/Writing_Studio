'use strict';

(function initializeInitialRenderingStore() {
  const CACHE_DIR = 'Initial_Rendering';
  const LEFT_FILE = `${CACHE_DIR}/Left_Panel.json`;
  const ACTIVE_FILE = `${CACHE_DIR}/Active_Document.json`;
  const STATUS_FILE = `${CACHE_DIR}/Status_Panel.json`;
  const FACTS_PANEL_FILE = `${CACHE_DIR}/Facts_Panel.json`;
  const NAMING_DOCUMENTS_DIR = `${CACHE_DIR}/Naming_Documents`;
  const LEGACY_NAMING_INDEX_FILE = `${CACHE_DIR}/Naming_Panel.json`;
  const LEGACY_NAMING_ACTIVE_FILE = `${CACHE_DIR}/Naming_Active_Document.json`;
  const SCHEMA_VERSION = 1;
  const NAMING_SCHEMA_VERSION = 4;
  let namingMode = 'empty';
  let namingIndex = null;
  let fullNamingData = null;
  let namingProjectionBaseline = new Map();
  let namingProjectionDocumentKey = '';
  let loadedNamingCategoryIds = new Set();
  let namingSnapshotTimer = 0;
  let namingSnapshotTask = null;
  let namingGeneration = 0;
  let legacyNamingCleanupDone = false;
  let activeWriteSignature = '';
  let activeWriteTask = null;
  const namingWriteTasks = new WeakMap();

  function withoutDocumentBody(value) {
    if (!value || typeof value !== 'object') return value;
    const copy = { ...value };
    delete copy.content;
    delete copy.contentHTML;
    delete copy.content_html;
    delete copy.contentHandle;
    copy._contentLoadState = 'unloaded';
    copy._contentPresented = false;
    return copy;
  }

  function manifestProjection(manifest = {}) {
    const cleanChapter = chapter => withoutDocumentBody(chapter);
    const projected = {
      ...manifest,
      chapters: (manifest.chapters || []).map(cleanChapter),
      parts: (manifest.parts || []).map(part => ({
        ...part,
        chapters: (part.chapters || []).map(cleanChapter)
      }))
    };
    delete projected.facts;
    return projected;
  }

  function draftProjection(items = []) {
    return items.map(withoutDocumentBody);
  }

  function normalizedSnapshotScope(scope = {}) {
    const mode = ['all', 'recent-days', 'recent-chapters'].includes(scope.mode) ? scope.mode : 'all';
    return {
      mode,
      days: Math.max(1, Math.floor(Number(scope.days) || 30)),
      chapters: Math.max(1, Math.floor(Number(scope.chapters) || 50))
    };
  }

  function factChapterIndex(fact = {}) {
    if (Number.isInteger(fact.chapterIndex)) return fact.chapterIndex;
    const key = fact.chapterKey || fact.contentPath || fact.descriptionMeta?.contentPath || '';
    const pathIndex = key ? chapters.findIndex(chapter => chapter.contentPath === key) : -1;
    if (pathIndex >= 0) return pathIndex;
    const chapterNo = Number(fact.chapterNo);
    return Number.isFinite(chapterNo) && chapterNo > 0 ? chapterNo - 1 : -1;
  }

  function scopedFacts(facts = [], scope = {}) {
    const normalized = normalizedSnapshotScope(scope);
    if (normalized.mode === 'recent-days') {
      const cutoff = Date.now() - normalized.days * 86400000;
      return facts.filter(fact => fact.pinned || Date.parse(fact.updatedAt || fact.createdAt || 0) >= cutoff);
    }
    if (normalized.mode === 'recent-chapters') {
      const firstIndex = Math.max(0, chapters.length - normalized.chapters);
      return facts.filter(fact => fact.pinned || factChapterIndex(fact) >= firstIndex);
    }
    return facts;
  }

  async function sourceContentHash(value = '') {
    const textValue = String(value);
    if (globalThis.crypto?.subtle && typeof TextEncoder !== 'undefined') {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(textValue));
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    let first = 2166136261;
    let second = 2246822519;
    for (let index = 0; index < textValue.length; index++) {
      const code = textValue.charCodeAt(index);
      first = Math.imul(first ^ code, 16777619);
      second = Math.imul(second ^ code, 3266489917);
    }
    return `${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
  }

  async function fingerprint(path, options = {}) {
    try {
      const handle = await getProjectFileHandle(path);
      const file = await handle.getFile();
      const result = { size: file.size, lastModified: file.lastModified };
      if (options.contentHash) result.contentHash = await sourceContentHash(await file.text());
      return result;
    } catch (error) {
      if (error?.name !== 'NotFoundError') console.warn('Render source fingerprint failed:', path, error);
      return null;
    }
  }

  function sameFingerprint(left, right) {
    if (!left || !right) return left === right;
    if (left.contentHash || right.contentHash) {
      return Boolean(left.contentHash && right.contentHash) &&
        left.contentHash === right.contentHash;
    }
    return left.size === right.size && left.lastModified === right.lastModified;
  }

  async function readJson(path) {
    try {
      const handle = await getProjectFileHandle(path);
      const textValue = await readFileText(handle);
      return textValue ? JSON.parse(textValue) : null;
    } catch (error) {
      if (error?.name !== 'NotFoundError') console.warn('Render cache read failed:', path, error);
      return null;
    }
  }

  async function writeJson(path, payload) {
    await getProjectDirectoryHandle(CACHE_DIR, { create: true });
    const handle = await getProjectFileHandle(path, { create: true });
    await writeFileText(handle, JSON.stringify(payload, null, 2));
  }

  async function leftSourceFingerprints() {
    const [manifest, drafts, trashDrafts] = await Promise.all([
      fingerprint(PROJECT_MANIFEST_FILE),
      fingerprint(PROJECT_DRAFTS_FILE),
      fingerprint(PROJECT_TRASH_DRAFTS_FILE)
    ]);
    return { manifest, drafts, trashDrafts };
  }

  function leftCacheMatches(cache, sources) {
    return cache?.schemaVersion === SCHEMA_VERSION &&
      sameFingerprint(cache.sources?.manifest, sources.manifest) &&
      sameFingerprint(cache.sources?.drafts, sources.drafts) &&
      sameFingerprint(cache.sources?.trashDrafts, sources.trashDrafts);
  }

  async function syncLeftPanelData() {
    if (!projectDirectoryHandle || !projectManifest) return false;
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      sources: await leftSourceFingerprints(),
      project: manifestProjection(projectManifest),
      drafts: draftProjection(typeof draftsForStorage === 'function' ? draftsForStorage(false) : chapterDrafts),
      trashDrafts: draftProjection(typeof trashDraftsForStorage === 'function' ? trashDraftsForStorage(false) : chapterTrashDrafts)
    };
    await writeJson(LEFT_FILE, payload);
    return true;
  }

  async function syncFactsPanelData(scope = {}) {
    if (!projectDirectoryHandle) return { includedFacts: 0, totalFacts: 0 };
    const normalizedScope = normalizedSnapshotScope(scope);
    const facts = normalizeStoryFacts(storyFacts || []);
    const included = scopedFacts(facts, normalizedScope);
    await writeJson(FACTS_PANEL_FILE, {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      source: await fingerprint('Story_Facts.json'),
      scope: normalizedScope,
      isPartial: normalizedScope.mode !== 'all',
      totalFacts: facts.length,
      facts: included
    });
    return { includedFacts: included.length, totalFacts: facts.length, scope: normalizedScope };
  }

  async function loadLeftPanelData() {
    if (!projectDirectoryHandle) return false;
    const sources = await leftSourceFingerprints();
    const cache = await readJson(LEFT_FILE);
    if (!leftCacheMatches(cache, sources) || !cache.project) return false;
    projectManifest = normalizeProjectManifest(cache.project);
    chapters = chaptersFromManifest(projectManifest);
    chapterDrafts = normalizeDrafts(cache.drafts || []);
    chapterTrashDrafts = normalizeTrashDrafts(cache.trashDrafts || []);
    storyFacts = [];
    if (typeof cacheProjectManifest === 'function') cacheProjectManifest(projectManifest);
    else localStorage.setItem(PROJECT_MANIFEST_KEY, JSON.stringify(manifestProjection(projectManifest)));
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(draftProjection(cache.drafts || [])));
    localStorage.setItem(TRASH_DRAFTS_STORAGE_KEY, JSON.stringify(draftProjection(cache.trashDrafts || [])));
    return true;
  }

  function activeDocumentDescriptor() {
    const item = typeof activeEditorDocument === 'function' ? activeEditorDocument() : null;
    if (!item) return null;
    const kind = typeof isDraftActive === 'function' && isDraftActive()
      ? 'draft'
      : typeof isTrashDraftActive === 'function' && isTrashDraftActive()
        ? 'trash-draft'
        : typeof isChapterEditDraftActive === 'function' && isChapterEditDraftActive()
          ? 'chapter-edit-draft'
          : 'chapter';
    return {
      kind,
      id: item.id || null,
      index: kind === 'draft' ? curDraft : kind === 'trash-draft' ? curTrashDraft : curChap,
      contentPath: item.contentPath || '',
      title: item.title || '',
      wordCount: Number.isFinite(item._wordCount) ? item._wordCount : null,
      formatting: {
        alignment: item.alignment,
        lineHeight: item.lineHeight,
        paragraphGap: item.paragraphGap,
        paragraphMargin: item.paragraphMargin,
        fontFamily: item.fontFamily,
        fontSize: item.fontSize,
        editorSettings: item.editorSettings || null
      }
    };
  }

  async function syncActiveDocumentData() {
    const documentInfo = activeDocumentDescriptor();
    if (!projectDirectoryHandle || !documentInfo) return false;
    const source = documentInfo.contentPath ? await fingerprint(documentInfo.contentPath) : null;
    await Promise.all([
      writeJson(ACTIVE_FILE, {
        schemaVersion: SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        source,
        document: documentInfo
      }),
      writeJson(STATUS_FILE, {
        schemaVersion: SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        documentKey: documentInfo.contentPath || String(documentInfo.id || ''),
        kind: documentInfo.kind,
        title: documentInfo.title,
        wordCount: documentInfo.wordCount
      })
    ]);
    return true;
  }

  function queueActiveDocumentSync() {
    const info = activeDocumentDescriptor();
    if (!info || !projectDirectoryHandle) return;
    const signature = JSON.stringify(info);
    if (signature === activeWriteSignature) return;
    activeWriteSignature = signature;
    activeWriteTask = Promise.resolve(activeWriteTask)
      .catch(() => {})
      .then(syncActiveDocumentData)
      .catch(error => console.warn('Active render cache write failed:', error));
  }

  function namingEntryProjection(entry = {}) {
    const projected = { ...entry };
    delete projected.notes;
    delete projected.missingDocumentMeta;
    delete projected.missingNameMentionMeta;
    return Object.prototype.hasOwnProperty.call(projected, 'source') ? namingSourceReadView(projected) : projected;
  }

  function namingSearchNames(entry = {}) {
    return [entry.name, ...(Array.isArray(entry.similarNames) ? entry.similarNames : [])]
      .map(value => String(value || '').trim())
      .filter(Boolean);
  }

  function nameOccursInText(entry, value) {
    const source = String(value || '');
    return namingSearchNames(entry).some(name => {
      try {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split(/\s+/).join('\\s+');
        return new RegExp(`(^|[^\\p{L}\\p{N}\\p{M}_])${escaped}(?=$|[^\\p{L}\\p{N}\\p{M}_])`, 'iu').test(source);
      } catch (_error) {
        return false;
      }
    });
  }

  function nameUseCountInText(entry, value) {
    if (typeof countNamingEntryUsesInText === 'function') return countNamingEntryUsesInText(entry, value);
    const source = String(value || '');
    return namingSearchNames(entry).reduce((total, name) => {
      try {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split(/\s+/).join('\\s+');
        const expression = new RegExp(`(^|[^\\p{L}\\p{N}\\p{M}_])${escaped}(?=$|[^\\p{L}\\p{N}\\p{M}_])`, 'giu');
        return total + [...source.matchAll(expression)].length;
      } catch (_error) {
        return total;
      }
    }, 0);
  }

  function entryMatchesDocument(entry, key) {
    return [entry.source?.documentKey, entry.chapterKey, entry.draftKey, entry.contentPath, entry.descriptionMeta?.contentPath]
      .some(value => value && value === key);
  }

  function namingWordState(entry, key) {
    return entryMatchesDocument(entry, key) ? 'added' : 'detected';
  }

  function namingCategoryState(categories, entries, key, totals = {}, textValue = '') {
    return categories.map(category => {
      const words = entries
        .filter(entry => entry.categoryId === category.id)
        .map(entry => ({
          id: entry.id,
          name: entry.name,
          matchedName: namingSearchNames(entry).find(name => nameOccursInText({ name }, textValue)) || entry.name,
          state: namingWordState(entry, key)
        }));
      return {
        id: category.id,
        title: category.title,
        totalStoryWords: totals[category.id] || 0,
        defaultWordCount: words.length,
        words
      };
    });
  }

  function categoryCounts(entries = []) {
    return entries.reduce((counts, entry) => {
      counts[entry.categoryId] = (counts[entry.categoryId] || 0) + 1;
      return counts;
    }, {});
  }

  function categoryOrphanCounts(entries = []) {
    return entries.reduce((counts, entry) => {
      if (typeof isOrphanStyleNamingEntry === 'function' && isOrphanStyleNamingEntry(entry)) {
        counts[entry.categoryId] = (counts[entry.categoryId] || 0) + 1;
      }
      return counts;
    }, {});
  }

  function namingDocumentIdentity(item = null, kind = '', index = -1) {
    const activeItem = item || (typeof activeEditorDocument === 'function' ? activeEditorDocument() : null);
    const activeKind = kind || (typeof isDraftActive === 'function' && isDraftActive() ? 'draft' : 'chapter');
    const activeIndex = index >= 0 ? index : activeKind === 'draft' ? curDraft : curChap;
    const contentPath = activeItem?.contentPath || '';
    const key = item
      ? contentPath || `${activeKind}-${activeIndex}`
      : typeof currentNamingChapterKey === 'function' ? currentNamingChapterKey() : contentPath || `${activeKind}-${activeIndex}`;
    return { key, kind: activeKind, index: activeIndex, title: activeItem?.title || '', contentPath };
  }

  function stableNamingKeyHash(value = '') {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function namingSnapshotPath(identity) {
    const label = String(identity.contentPath || identity.key || `${identity.kind}-${identity.index}`)
      .split(/[\\/]/u).pop().replace(/\.[^.]+$/u, '')
      .replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 48) || 'document';
    return `${NAMING_DOCUMENTS_DIR}/${label}-${stableNamingKeyHash(identity.key)}.json`;
  }

  function activeDocumentMap(source = {}, key = '') {
    return source?.[key]?.length ? { [key]: [...source[key]] } : {};
  }

  function mergeActiveDocumentMap(fullMap = {}, projectedMap = {}, key = '') {
    const merged = { ...fullMap, ...projectedMap };
    if (key && !Object.prototype.hasOwnProperty.call(projectedMap, key)) delete merged[key];
    return merged;
  }

  function createNamingIndex(data, options = {}) {
    const normalized = normalizeNamingData(data);
    return {
      isFull: options.isFull === true,
      categories: normalized.categories,
      removedCategoryIds: normalized.removedCategoryIds || [],
      hiddenByChapter: normalized.hiddenByChapter || {},
      visibleByChapter: normalized.visibleByChapter || {},
      detectedByChapter: normalized.detectedByChapter || {},
      categoryCounts: options.categoryCounts || categoryCounts(normalized.entries),
      categoryOrphanCounts: options.categoryOrphanCounts || categoryOrphanCounts(normalized.entries),
      storyMentionCounts: options.storyMentionCounts || {},
      entries: normalized.entries.map(namingEntryProjection)
    };
  }

  async function cleanupLegacyNamingCaches() {
    if (legacyNamingCleanupDone || typeof removeProjectFileIfExists !== 'function') return;
    legacyNamingCleanupDone = true;
    await Promise.all([
      removeProjectFileIfExists(LEGACY_NAMING_INDEX_FILE),
      removeProjectFileIfExists(LEGACY_NAMING_ACTIVE_FILE)
    ]).catch(error => console.warn('Legacy naming render cache cleanup failed:', error));
  }

  async function writeNamingSnapshot(identity, textValue, entries, options = {}) {
    const counts = options.categoryCounts || namingIndex?.categoryCounts || categoryCounts(entries);
    const detectedIds = entries.filter(entry => namingWordState(entry, identity.key) === 'detected').map(entry => entry.id);
    const hiddenByChapter = activeDocumentMap(options.hiddenByChapter || namingIndex?.hiddenByChapter, identity.key);
    const visibleByChapter = activeDocumentMap(options.visibleByChapter || namingIndex?.visibleByChapter, identity.key);
    const detectedByChapter = detectedIds.length ? { [identity.key]: detectedIds } : {};
    const projected = normalizeNamingData({
      schemaVersion: 2,
      categories: options.categories || namingIndex?.categories || [],
      entries: entries.map(namingEntryProjection),
      removedCategoryIds: options.removedCategoryIds || namingIndex?.removedCategoryIds || [],
      hiddenByChapter,
      visibleByChapter,
      detectedByChapter
    });
    const categoryStates = namingCategoryState(projected.categories, projected.entries, identity.key, counts, textValue);
    const relevantCategoryIds = categoryStates
      .filter(state => state.defaultWordCount > 0)
      .sort((left, right) => right.defaultWordCount - left.defaultWordCount || right.totalStoryWords - left.totalStoryWords)
      .map(state => state.id);
    const initialVisibleCategoryIds = minimumVisibleCategoryIds(
      [...new Set([...relevantCategoryIds, ...(visibleByChapter[identity.key] || [])])],
      hiddenByChapter[identity.key] || [],
      6
    ).slice(0, 6);
    await getProjectDirectoryHandle(NAMING_DOCUMENTS_DIR, { create: true });
    await writeJson(namingSnapshotPath(identity), {
      schemaVersion: NAMING_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      document: identity,
      documentSource: options.documentSource === undefined
        ? (identity.contentPath ? await fingerprint(identity.contentPath, { contentHash: true }) : null)
        : options.documentSource,
      namingSource: options.namingSource === undefined ? await fingerprint(PROJECT_NAMING_FILE, { contentHash: true }) : options.namingSource,
      categoryCounts: counts,
      categoryOrphanCounts: options.categoryOrphanCounts || namingIndex?.categoryOrphanCounts || categoryOrphanCounts(entries),
      storyMentionCounts: options.storyMentionCounts || namingIndex?.storyMentionCounts || {},
      initialVisibleCategoryIds,
      categoryStates,
      namingData: projected
    });
    await cleanupLegacyNamingCaches();
    return projected;
  }

  async function writeActiveNamingProjection(options = {}) {
    if (!namingIndex?.entries) return false;
    const identity = namingDocumentIdentity();
    const textValue = typeof activeNamingPanelText === 'function' ? activeNamingPanelText() : '';
    await repairActiveChapterDraftSources(identity, textValue);
    const entries = namingIndex.entries.filter(entry => nameOccursInText(entry, textValue));
    const projectedData = await writeNamingSnapshot(identity, textValue, entries);
    namingData = projectedData;
    if (fullNamingData) {
      ['detectedByChapter'].forEach(field => {
        fullNamingData[field] = { ...(fullNamingData[field] || {}) };
        if (namingData[field]?.[identity.key]?.length) fullNamingData[field][identity.key] = [...namingData[field][identity.key]];
        else delete fullNamingData[field][identity.key];
      });
    }
    if (options.preserveFull && fullNamingData) {
      namingData = normalizeNamingData(fullNamingData);
      namingMode = 'full';
      namingProjectionBaseline = new Map();
      namingProjectionDocumentKey = '';
      return true;
    }
    namingProjectionBaseline = new Map(namingData.entries.map(entry => [entry.id, JSON.stringify(entry)]));
    namingProjectionDocumentKey = identity.key;
    loadedNamingCategoryIds = new Set();
    namingMode = 'projection';
    return true;
  }

  async function repairActiveChapterDraftSources(identity = namingDocumentIdentity(), textValue = '') {
    if (identity.kind !== 'chapter' || !String(textValue || '').trim()) return 0;
    const visibleDraftSourceIds = (namingIndex?.entries || []).filter(entry =>
      entry?.source?.documentType === 'draft' && nameOccursInText(entry, textValue)
    ).map(entry => entry.id);
    if (!visibleDraftSourceIds.length || !window.LmNamingDeepScanSource?.repairDraftSourcesSeenInChapters) return 0;

    await ensureFullNamingData();
    const repaired = await window.LmNamingDeepScanSource.repairDraftSourcesSeenInChapters({
      entries: namingData.entries,
      entryIds: visibleDraftSourceIds,
      triggerTexts: [textValue]
    });
    if (!repaired.updatedCount) return 0;

    namingData = normalizeNamingData(namingData);
    fullNamingData = namingData;
    namingIndex = createNamingIndex(namingData, { isFull: true });
    namingMode = 'full';
    await writeNamingDataToProject({ authoritativeData: namingData });
    return repaired.updatedCount;
  }

  async function loadNamingSnapshot(identity = namingDocumentIdentity()) {
    const snapshot = await readJson(namingSnapshotPath(identity));
    if (!snapshot || snapshot.namingData?.schemaVersion !== 2 || snapshot.schemaVersion !== NAMING_SCHEMA_VERSION || snapshot.document?.key !== identity.key) return false;
    const currentSource = identity.contentPath ? await fingerprint(identity.contentPath, { contentHash: true }) : null;
    if (!sameFingerprint(snapshot.documentSource, currentSource)) return false;
    const currentNamingSource = await fingerprint(PROJECT_NAMING_FILE, { contentHash: true });
    if (!sameFingerprint(snapshot.namingSource, currentNamingSource)) return false;
    namingData = normalizeNamingData(snapshot.namingData);
    namingIndex = createNamingIndex(namingData, {
      categoryCounts: snapshot.categoryCounts,
      categoryOrphanCounts: snapshot.categoryOrphanCounts,
      storyMentionCounts: snapshot.storyMentionCounts
    });
    namingProjectionBaseline = new Map(namingData.entries.map(entry => [entry.id, JSON.stringify(entry)]));
    namingProjectionDocumentKey = identity.key;
    loadedNamingCategoryIds = new Set();
    namingMode = 'projection';
    return true;
  }

  async function migrateLegacyActiveNamingSnapshot(identity) {
    const legacy = await readJson(LEGACY_NAMING_ACTIVE_FILE);
    if (!legacy?.namingData || legacy.namingData.schemaVersion !== 2 || legacy.documentKey !== identity.key) return false;
    namingData = normalizeNamingData(legacy.namingData);
    namingIndex = createNamingIndex(namingData, {
      categoryCounts: legacy.categoryCounts,
      categoryOrphanCounts: legacy.categoryOrphanCounts,
      storyMentionCounts: legacy.storyMentionCounts
    });
    const textValue = typeof activeNamingPanelText === 'function' ? activeNamingPanelText() : '';
    await writeNamingSnapshot(identity, textValue, namingData.entries);
    namingProjectionBaseline = new Map(namingData.entries.map(entry => [entry.id, JSON.stringify(entry)]));
    namingProjectionDocumentKey = identity.key;
    loadedNamingCategoryIds = new Set();
    namingMode = 'projection';
    return true;
  }

  async function syncNamingIndex(authoritativeData = null) {
    if (!projectDirectoryHandle || (!authoritativeData && !namingData)) return false;
    namingData = normalizeNamingData(authoritativeData || namingData);
    fullNamingData = namingData;
    namingIndex = createNamingIndex(namingData, { isFull: true });
    namingMode = 'full';
    return writeActiveNamingProjection({ preserveFull: true });
  }

  function documentText(documentItem = {}) {
    if (typeof htmlToPlainText === 'function') return htmlToPlainText(documentItem.content || '');
    if (typeof editorHTMLToText === 'function') return editorHTMLToText(documentItem.content || '');
    const node = typeof document === 'undefined' ? null : document.createElement('div');
    if (!node) return String(documentItem.content || '');
    node.innerHTML = String(documentItem.content || '');
    return node.textContent || '';
  }

  async function namingSnapshotDocumentsForScope(documents, scope = {}) {
    const normalized = normalizedSnapshotScope(scope);
    if (normalized.mode === 'all') return { documents, scope: normalized };
    const activeKey = namingDocumentIdentity().key;
    if (normalized.mode === 'recent-chapters') {
      const chapterDocuments = documents.filter(documentInfo => documentInfo.kind === 'chapter');
      const selected = chapterDocuments.slice(-normalized.chapters);
      const active = documents.find(({ item, index, kind }) => namingDocumentIdentity(item, kind, index).key === activeKey);
      if (active && !selected.includes(active)) selected.push(active);
      return { documents: selected, scope: normalized };
    }
    const cutoff = Date.now() - normalized.days * 86400000;
    const matches = await Promise.all(documents.map(async documentInfo => {
      const identity = namingDocumentIdentity(documentInfo.item, documentInfo.kind, documentInfo.index);
      const source = identity.contentPath ? await fingerprint(identity.contentPath) : null;
      const fallbackTime = Date.parse(documentInfo.item.updatedAt || documentInfo.item.createdAt || 0);
      const changedAt = Number(source?.lastModified) || fallbackTime;
      return identity.key === activeKey || changedAt >= cutoff ? documentInfo : null;
    }));
    return { documents: matches.filter(Boolean), scope: normalized };
  }

  async function rebuildAllNamingDocumentStates(options = {}) {
    await ensureFullNamingData();
    namingIndex = createNamingIndex(namingData, { isFull: true });
    const documents = [
      ...(Array.isArray(chapters) ? chapters.map((item, index) => ({ item, index, kind: 'chapter' })) : []),
      ...(Array.isArray(chapterDrafts) ? chapterDrafts.map((item, index) => ({ item, index, kind: 'draft' })) : [])
    ];
    const sourceIndex = options.sourceIndex || await window.LmNamingDeepScanSource.buildTextIndex({
      onProgress: ({ loaded, total }) => options.onProgress?.({ phase: 'reading', loaded, total })
    });
    const repairedSources = await window.LmNamingDeepScanSource?.repairDraftSourcesSeenInChapters?.({
      entries: namingData.entries,
      sourceIndex,
      triggerTexts: sourceIndex.chapterTexts
    });
    if (repairedSources?.updatedCount) {
      namingData = normalizeNamingData(namingData);
      fullNamingData = namingData;
      namingIndex = createNamingIndex(namingData, { isFull: true });
      namingMode = 'full';
      await writeNamingDataToProject({ authoritativeData: namingData });
    }
    const documentStates = {};
    const storyMentionCounts = {};
    const projections = documents.map(({ item, index, kind }) => {
      const identity = namingDocumentIdentity(item, kind, index);
      const value = kind === 'draft' ? sourceIndex.draftTexts[index] : sourceIndex.chapterTexts[index];
      const contentHash = kind === 'draft' ? sourceIndex.draftContentHashes?.[index] : sourceIndex.chapterContentHashes?.[index];
      const matching = namingIndex.entries.filter(entry => {
        const count = nameUseCountInText(entry, value);
        if (!count) return false;
        storyMentionCounts[entry.id] = (storyMentionCounts[entry.id] || 0) + count;
        return true;
      });
      const categories = {};
      matching.forEach(entry => {
        const state = namingWordState(entry, identity.key);
        categories[entry.categoryId] ||= { added: [], detected: [] };
        categories[entry.categoryId][state].push(entry.id);
      });
      documentStates[identity.key] = { kind, index, title: item.title || '', categories };
      return { identity, value, matching, documentSource: contentHash ? { contentHash } : undefined };
    });
    namingIndex.storyMentionCounts = storyMentionCounts;
    const namingSource = await fingerprint(PROJECT_NAMING_FILE, { contentHash: true });
    const scoped = await namingSnapshotDocumentsForScope(documents, options.scope || options);
    const selectedKeys = new Set(scoped.documents.map(({ item, index, kind }) => namingDocumentIdentity(item, kind, index).key));
    const selectedProjections = projections.filter(projection => selectedKeys.has(projection.identity.key));
    const batchSize = 6;
    for (let offset = 0; offset < selectedProjections.length; offset += batchSize) {
      const batch = selectedProjections.slice(offset, offset + batchSize);
      await Promise.all(batch.map(projection => writeNamingSnapshot(projection.identity, projection.value, projection.matching, {
        storyMentionCounts,
        namingSource,
        documentSource: projection.documentSource
      })));
      options.onProgress?.({ phase: 'writing', written: Math.min(offset + batch.length, selectedProjections.length), total: selectedProjections.length });
    }
    await loadNamingSnapshot(namingDocumentIdentity());
    return {
      documentStates,
      scannedDocuments: documents.length,
      writtenSnapshots: selectedProjections.length,
      scope: scoped.scope
    };
  }

  async function loadNamingForActiveDocument() {
    const identity = namingDocumentIdentity();
    if (await loadNamingSnapshot(identity)) {
      const activeText = typeof activeNamingPanelText === 'function' ? activeNamingPanelText() : '';
      if (await repairActiveChapterDraftSources(identity, activeText)) await writeActiveNamingProjection();
      return true;
    }
    if (await migrateLegacyActiveNamingSnapshot(identity)) {
      const activeText = typeof activeNamingPanelText === 'function' ? activeNamingPanelText() : '';
      if (await repairActiveChapterDraftSources(identity, activeText)) await writeActiveNamingProjection();
      return true;
    }
    if (fullNamingData) {
      namingData = normalizeNamingData(fullNamingData);
      namingIndex = createNamingIndex(namingData, { isFull: true });
      namingMode = 'full';
      await writeActiveNamingProjection();
      return true;
    }
    await ensureFullNamingData({ forceSource: true });
    namingIndex = createNamingIndex(namingData, { isFull: true });
    await writeActiveNamingProjection();
    return true;
  }

  async function ensureNamingCategoryData(categoryId) {
    if (!namingIndex) return loadNamingForActiveDocument();
    if (namingMode !== 'projection' || loadedNamingCategoryIds.has(categoryId)) return true;
    let sourceData = fullNamingData;
    if (!sourceData) {
      const handle = await getProjectFileHandle(PROJECT_NAMING_FILE);
      sourceData = normalizeNamingData(await window.LmNamingFileSafety.migrateAuthoritative(projectDirectoryHandle));
    }
    const categoryEntries = sourceData.entries.filter(entry => entry.categoryId === categoryId);
    const otherEntries = namingData.entries.filter(entry => entry.categoryId !== categoryId);
    namingData = normalizeNamingData({ ...namingData, entries: [...otherEntries, ...categoryEntries] });
    categoryEntries.forEach(entry => namingProjectionBaseline.set(entry.id, JSON.stringify(entry)));
    namingIndex = createNamingIndex(namingData, {
      categoryCounts: namingIndex.categoryCounts,
      categoryOrphanCounts: namingIndex.categoryOrphanCounts,
      storyMentionCounts: namingIndex.storyMentionCounts
    });
    loadedNamingCategoryIds.add(categoryId);
    return true;
  }

  async function syncActiveNamingVisibility() {
    if (!namingIndex || !projectDirectoryHandle) return false;
    namingIndex.hiddenByChapter = normalizeNamingData(namingData).hiddenByChapter || {};
    namingIndex.visibleByChapter = namingData.visibleByChapter || {};
    await writeActiveNamingProjection();
    return true;
  }

  function serializeNamingWrite(projectHandle, writer) {
    if (typeof projectHandle === 'function') {
      writer = projectHandle;
      projectHandle = projectDirectoryHandle;
    }
    if (!projectHandle) return Promise.resolve().then(writer);
    const previous = namingWriteTasks.get(projectHandle) || Promise.resolve();
    const task = previous.catch(() => {}).then(writer);
    namingWriteTasks.set(projectHandle, task);
    return task;
  }

  async function ensureFullNamingData(options = {}) {
    if (namingMode === 'full' && !options.forceSource) return namingData;
    const projectedDocumentKey = namingMode === 'projection' ? namingProjectionDocumentKey : '';
    const targetHandle = options.projectHandle || projectDirectoryHandle;
    let fullData;
    if (fullNamingData && !options.forceSource) {
      fullData = normalizeNamingData(fullNamingData);
    } else {
      try {
        const handle = targetHandle
          ? await targetHandle.getFileHandle(PROJECT_NAMING_FILE)
          : await getProjectFileHandle(PROJECT_NAMING_FILE);
        fullData = normalizeNamingData(await window.LmNamingFileSafety.migrateAuthoritative(targetHandle));
      } catch (error) {
        if (error?.name !== 'NotFoundError') throw error;
        if (namingMode === 'projection') throw new Error('Complete Naming source is unavailable; projection cannot be migrated.');
        fullData = normalizeNamingData(await window.LmNamingFileSafety.migrateAuthoritative(targetHandle, projectManifest?.namingData || namingData));
      }
    }
    if (targetHandle && targetHandle !== projectDirectoryHandle) throw new Error('Stale project Naming read was cancelled.');
    if (namingMode !== 'projection') {
      namingData = fullData;
      namingMode = 'full';
      fullNamingData = namingData;
      namingIndex = createNamingIndex(namingData, { isFull: true });
      namingProjectionBaseline = new Map();
      namingProjectionDocumentKey = '';
      return namingData;
    }
    const projected = normalizeNamingData(namingData);
    const byId = new Map(fullData.entries.map(entry => [entry.id, entry]));
    projected.entries.forEach(entry => {
      const baseline = namingProjectionBaseline.get(entry.id);
      if (baseline === JSON.stringify(entry)) return;
      const original = byId.get(entry.id);
      byId.set(entry.id, original ? {
        ...original,
        ...entry,
        descriptionHistory: (entry.descriptionHistory || original.descriptionHistory || []).slice(-50)
      } : entry);
    });
    namingData = normalizeNamingData({
      ...fullData,
      categories: projected.categories?.length ? projected.categories : fullData.categories,
      entries: [...byId.values()],
      removedCategoryIds: projected.removedCategoryIds || fullData.removedCategoryIds,
      hiddenByChapter: mergeActiveDocumentMap(fullData.hiddenByChapter, projected.hiddenByChapter, projectedDocumentKey),
      visibleByChapter: mergeActiveDocumentMap(fullData.visibleByChapter, projected.visibleByChapter, projectedDocumentKey),
      detectedByChapter: mergeActiveDocumentMap(fullData.detectedByChapter, projected.detectedByChapter, projectedDocumentKey)
    });
    fullNamingData = namingData;
    namingIndex = createNamingIndex(namingData, { isFull: true });
    namingMode = 'full';
    namingProjectionBaseline = new Map();
    namingProjectionDocumentKey = '';
    return namingData;
  }

  function namingCategoryCount(categoryId) {
    return namingIndex?.categoryCounts?.[categoryId] ??
      (namingData?.entries || []).filter(entry => entry.categoryId === categoryId).length;
  }

  function namingCategoryOrphanCount(categoryId) {
    return namingIndex?.categoryOrphanCounts?.[categoryId] ??
      (namingData?.entries || []).filter(entry => entry.categoryId === categoryId &&
        typeof isOrphanStyleNamingEntry === 'function' && isOrphanStyleNamingEntry(entry)).length;
  }

  function minimumVisibleCategoryIds(categoryIds = [], hiddenIds = [], minimum = 6) {
    const selected = new Set(categoryIds);
    const hidden = new Set(hiddenIds);
    const categories = namingIndex?.categories || namingData?.categories || [];
    [...categories]
      .filter(category => !selected.has(category.id) && !hidden.has(category.id))
      .sort((left, right) => namingCategoryCount(right.id) - namingCategoryCount(left.id))
      .some(category => {
        if (selected.size >= minimum) return true;
        selected.add(category.id);
        return false;
      });
    return [...selected];
  }

  function namingStoryMentionCount(entryId) {
    return namingIndex?.storyMentionCounts?.[entryId] ?? null;
  }

  function queueActiveNamingSnapshotRefresh() {
    if (!projectDirectoryHandle) return;
    const generation = namingGeneration;
    clearTimeout(namingSnapshotTimer);
    namingSnapshotTimer = setTimeout(() => {
      namingSnapshotTask = Promise.resolve(namingSnapshotTask)
        .catch(() => {})
        .then(async () => {
          if (generation !== namingGeneration) return;
          await ensureFullNamingData();
          if (generation !== namingGeneration) return;
          await writeActiveNamingProjection();
          if (activeSidePanel === 'naming' && typeof renderTags === 'function') renderTags();
        })
        .catch(error => console.warn('Active naming snapshot refresh failed:', error));
    }, 180);
  }

  function reset() {
    namingGeneration += 1;
    clearTimeout(namingSnapshotTimer);
    namingMode = 'empty';
    namingIndex = null;
    fullNamingData = null;
    namingProjectionBaseline = new Map();
    namingProjectionDocumentKey = '';
    loadedNamingCategoryIds = new Set();
    namingSnapshotTimer = 0;
    namingSnapshotTask = null;
    legacyNamingCleanupDone = false;
    activeWriteSignature = '';
    activeWriteTask = null;
  }

  window.LmInitialRendering = Object.freeze({
    loadLeftPanelData,
    syncLeftPanelData,
    syncFactsPanelData,
    queueActiveDocumentSync,
    syncActiveDocumentData,
    loadNamingForActiveDocument,
    ensureNamingCategoryData,
    syncActiveNamingVisibility,
    serializeNamingWrite,
    ensureFullNamingData,
    syncNamingIndex,
    rebuildAllNamingDocumentStates,
    queueActiveNamingSnapshotRefresh,
    namingCategoryCount,
    namingCategoryOrphanCount,
    minimumVisibleCategoryIds,
    namingStoryMentionCount,
    sourceContentHash,
    reset
  });
})();
