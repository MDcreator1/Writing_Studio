'use strict';

(function initializeFirstProjectOpenMismatchRepair() {
  let firstOpenClaimed = false;
  let repairProjectHandle = null;
  const navigationEntry = performance.getEntriesByType?.('navigation')?.[0];
  const isPageReload = navigationEntry?.type === 'reload';

  function begin(projectHandle) {
    const enabled = !firstOpenClaimed && !isPageReload;
    firstOpenClaimed = true;
    repairProjectHandle = enabled ? projectHandle : null;
    return enabled;
  }

  async function repairDocument(kind, documentItem) {
    if (!documentItem || !repairProjectHandle || repairProjectHandle !== projectDirectoryHandle) return false;
    const knownWords = Number(documentItem._wordCount ?? documentItem.wordCount);
    if (!(knownWords > 0)) return false;

    documentItem._wordCount = null;
    documentItem.wordCount = null;
    documentItem._wordCountVerifiedSignature = '';
    if (kind === 'draft') {
      const handle = await getProjectFileHandle(PROJECT_DRAFTS_FILE, { create: true });
      const payload = JSON.stringify({ drafts: draftsForStorage(false) }, null, 2);
      await writeFileText(handle, payload);
      localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(draftsForStorage(false)));
    } else if (kind === 'chapter') await writeProjectManifest();
    else return false;
    return true;
  }

  window.LmFirstProjectOpenMismatchRepair = Object.freeze({ begin, repairDocument });
})();
