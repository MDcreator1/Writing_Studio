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
      ...draftList.map((item, index) => ({ item, index, type: 'draft', textTarget: draftTexts, hashTarget: draftContentHashes }))
    ];
    const batchSize = 10;

    for (let offset = 0; offset < jobs.length; offset += batchSize) {
      const batch = jobs.slice(offset, offset + batchSize);
      await Promise.all(batch.map(async job => {
        const source = await readDocumentSource(job.item, job.type, job.index);
        job.textTarget[job.index] = source.text;
        job.hashTarget[job.index] = source.contentHash;
      }));
      const loaded = Math.min(offset + batch.length, jobs.length);
      options.onProgress?.({ loaded, total: jobs.length });
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    return { chapterTexts, draftTexts, chapterContentHashes, draftContentHashes };
  }

  window.LmNamingDeepScanSource = { buildTextIndex };
})();
