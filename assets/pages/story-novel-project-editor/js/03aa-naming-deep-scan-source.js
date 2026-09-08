(function initNamingDeepScanSource() {
  const scanText = value => {
    const text = String(value || '');
    return typeof normalizeScanText === 'function' ? normalizeScanText(text) : text.normalize('NFC').replace(/\s+/g, ' ').trim();
  };

  async function readDocumentSource(documentItem, documentType, index) {
    if (projectDirectoryHandle) {
      if (!documentItem?.contentPath) throw new Error(`${documentType} ${index + 1} source path is missing.`);
      const fileHandle = await getProjectFileHandle(documentItem.contentPath);
      const sourceText = await readFileText(fileHandle);
      return {
        text: scanText(sourceText),
        contentHash: await window.LmInitialRendering?.sourceContentHash?.(sourceText)
      };
    }

    const memoryText = typeof htmlToPlainText === 'function'
      ? htmlToPlainText(documentItem?.content || '')
      : documentItem?.content || '';
    return {
      text: scanText(memoryText),
      contentHash: await window.LmInitialRendering?.sourceContentHash?.(memoryText)
    };
  }

  async function buildTextIndex(options = {}) {
    const chapterList = Array.isArray(chapters) ? chapters : [];
    const draftList = Array.isArray(chapterDrafts) ? chapterDrafts : [];
    const chapterTexts = new Array(chapterList.length);
    const draftTexts = new Array(draftList.length);
    const chapterContentHashes = new Array(chapterList.length);
    const draftContentHashes = new Array(draftList.length);
    const jobs = [
      ...chapterList.map((item, index) => ({ item, index, type: 'chapter', textTarget: chapterTexts, hashTarget: chapterContentHashes })),
      ...(options.includeDrafts === false ? [] : draftList.map((item, index) => ({ item, index, type: 'draft', textTarget: draftTexts, hashTarget: draftContentHashes })))
    ];
    const batchSize = 10;

    for (let offset = 0; offset < jobs.length; offset += batchSize) {
      const batch = jobs.slice(offset, offset + batchSize);
      await Promise.all(batch.map(async job => {
        try {
          const source = await readDocumentSource(job.item, job.type, job.index);
          job.textTarget[job.index] = source.text;
          job.hashTarget[job.index] = source.contentHash;
        } catch (error) {
          if (!options.tolerateReadErrors) throw error;
          job.textTarget[job.index] = '';
          job.hashTarget[job.index] = null;
          console.warn(`Naming source repair skipped unreadable ${job.type}:`, job.item?.contentPath || job.index, error);
        }
      }));
      const loaded = Math.min(offset + batch.length, jobs.length);
      options.onProgress?.({ loaded, total: jobs.length });
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    return { chapterTexts, draftTexts, chapterContentHashes, draftContentHashes };
  }

  async function repairDraftSourcesSeenInChapters(options = {}) {
    const entries = Array.isArray(options.entries) ? options.entries : [];
    const allowedIds = options.entryIds ? new Set(options.entryIds) : null;
    const triggerTexts = (Array.isArray(options.triggerTexts) ? options.triggerTexts : [])
      .map(scanText)
      .filter(Boolean);
    const candidates = entries.filter(entry =>
      entry?.source?.documentType === 'draft' &&
      (!allowedIds || allowedIds.has(entry.id)) &&
      (!triggerTexts.length || triggerTexts.some(text => isNamingEntryUsedInText(entry, text)))
    );
    if (!candidates.length) return { updatedCount: 0, sourceIndex: options.sourceIndex || null };

    const scanProject = projectDirectoryHandle;
    const sourceIndex = options.sourceIndex || await buildTextIndex({
      includeDrafts: false,
      tolerateReadErrors: true,
      onProgress: options.onProgress
    });
    if (scanProject !== projectDirectoryHandle) throw new Error('Project changed during draft-source repair.');

    const checkedAt = options.checkedAt || new Date().toISOString();
    const chapterDocuments = (Array.isArray(chapters) ? chapters : []).map((document, index) => ({
      document,
      index,
      documentType: 'chapter',
      source: createNamingSource(document, 'chapter', index, checkedAt),
      text: sourceIndex.chapterTexts[index] || ''
    }));
    let updatedCount = 0;
    candidates.forEach(entry => {
      // The active editor can be ahead of its file while an autosave is still
      // pending. Do not detach the draft source unless the deep scan confirms
      // a durable chapter occurrence.
      const chapterMatch = chapterDocuments.find(item => isNamingEntryUsedInText(entry, item.text || ''));
      if (!chapterMatch) return;
      const previousSource = JSON.stringify(entry.source);
      refreshNamingEntrySource(entry, chapterDocuments, checkedAt);
      if (entry.source?.documentType === 'chapter' && JSON.stringify(entry.source) !== previousSource) updatedCount++;
    });
    return { updatedCount, sourceIndex };
  }

  window.LmNamingDeepScanSource = { buildTextIndex, repairDraftSourcesSeenInChapters };
})();
