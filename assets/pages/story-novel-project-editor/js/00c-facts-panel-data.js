'use strict';

(function initializeFactsPanelDataModule() {
  const factsFile = 'Story_Facts.json';

  async function readDedicatedFacts() {
    try {
      const handle = await getProjectFileHandle(factsFile);
      const payload = JSON.parse(await readFileText(handle));
      return { found: true, facts: normalizeStoryFacts(Array.isArray(payload) ? payload : payload?.facts) };
    } catch (error) {
      if (error?.name === 'NotFoundError') return { found: false, facts: [] };
      console.warn('Facts data read failed:', error);
      return { found: false, facts: [] };
    }
  }

  async function readLegacyManifestFacts() {
    try {
      const handle = await getProjectFileHandle(PROJECT_MANIFEST_FILE);
      const payload = JSON.parse(await readFileText(handle));
      return normalizeStoryFacts(payload?.facts || payload?.storyFacts);
    } catch (error) {
      if (error?.name !== 'NotFoundError') console.warn('Legacy facts recovery failed:', error);
      return [];
    }
  }

  async function writeProjectData(facts = storyFacts) {
    storyFacts = normalizeStoryFacts(facts);
    localStorage.setItem(FACTS_STORAGE_KEY, JSON.stringify(storyFacts));
    if (!projectDirectoryHandle) return;
    const handle = await getProjectFileHandle(factsFile, { create: true });
    await writeFileText(handle, JSON.stringify({ facts: storyFacts }, null, 2));
  }

  async function ensureLegacyMigration(knownLegacyFacts = null) {
    if (!projectDirectoryHandle) return [];
    const dedicated = await readDedicatedFacts();
    if (dedicated.found) {
      storyFacts = dedicated.facts;
    } else {
      const supplied = knownLegacyFacts === null ? [] : normalizeStoryFacts(knownLegacyFacts);
      storyFacts = supplied.length ? supplied : await readLegacyManifestFacts();
      if (storyFacts.length) await writeProjectData(storyFacts);
    }
    localStorage.setItem(FACTS_STORAGE_KEY, JSON.stringify(storyFacts));
    return storyFacts;
  }

  async function loadProjectData() {
    if (!projectDirectoryHandle) return;
    await ensureLegacyMigration(projectManifest?.facts || null);
  }

  window.LmFactsPanelData = Object.freeze({ loadProjectData, writeProjectData, ensureLegacyMigration });
})();
