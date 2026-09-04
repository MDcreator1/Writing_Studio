'use strict';

(function initializeChapterSidebarDataModule() {
  async function loadProjectData() {
    if (await window.LmInitialRendering?.loadLeftPanelData?.()) return true;
    const sourceManifest = await readProjectManifest();
    if (!sourceManifest) return false;

    const legacyFacts = normalizeStoryFacts(sourceManifest.facts);
    projectManifest = projectManifestForStorage(sourceManifest);
    chapters = chaptersFromManifest(projectManifest);
    storyFacts = legacyFacts;
    await window.LmFactsPanelData?.ensureLegacyMigration?.(storyFacts);
    await Promise.all([
      readDraftsDataFromProject(),
      readTrashDraftsDataFromProject()
    ]);
    await window.LmInitialRendering?.syncLeftPanelData?.();
    return true;
  }

  function renderProjectData() {
    if (typeof renderChapters !== 'function') return false;
    renderChapters();
    return true;
  }

  window.LmChapterSidebarData = Object.freeze({
    loadProjectData,
    renderProjectData
  });
})();
