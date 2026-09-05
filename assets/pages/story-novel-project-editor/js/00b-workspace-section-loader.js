'use strict';
(function initializeWorkspaceSectionLoader() {
  let projectGeneration = 0;
  const pending = new Map();
  const ready = new Set();

  function reset() {
    projectGeneration += 1;
    pending.clear();
    ready.clear();
    window.LmInitialRendering?.reset?.();
    window.lmAdvancedWordEditing?.resetProjectData?.(projectDirectoryHandle || null);
  }

  function ensureOnce(section, loader) {
    if (ready.has(section)) return Promise.resolve();
    if (pending.has(section)) return pending.get(section);
    const generation = projectGeneration;
    const task = Promise.resolve()
      .then(loader)
      .then(() => {
        if (generation === projectGeneration) ready.add(section);
      })
      .finally(() => {
        if (generation === projectGeneration) pending.delete(section);
      });
    pending.set(section, task);
    return task;
  }

  function ensureMainEditor() {
    return ensureOnce('main-editor', async () => {
      const loaded = await ensureActiveDocumentContentLoaded();
      if (!loaded) throw new Error('Active document content could not be loaded safely.');
    });
  }

  function ensureStatusPanel() {
    return ensureOnce('status-panel', () => {
      if (typeof updateChapterStatus === 'function') updateChapterStatus();
    });
  }

  function ensureRecoveryData() {
    return ensureOnce('chapter-recovery', () => readChapterEditDraftsFromProject());
  }

  function ensureNamingData() {
    return ensureOnce('naming', () => window.LmInitialRendering?.loadNamingForActiveDocument?.() || readNamingDataFromProject());
  }

  function ensureFactsData() {
    return ensureOnce('facts', async () => {
      if (window.LmFactsPanelData?.loadProjectData) {
        await window.LmFactsPanelData.loadProjectData();
      } else {
        storyFacts = normalizeStoryFacts(projectManifest?.facts);
      }
    });
  }

  function ensureAIData() {
    return ensureOnce('ai', () => {
      if (typeof loadAIDeskState === 'function') loadAIDeskState();
    });
  }

  function ensureWordEditingData() {
    return ensureOnce('word-editing', async () => {
      if (!window.lmAdvancedWordEditing?.loadDictionaryPayload) return;
      const generation = projectGeneration;
      const targetHandle = projectDirectoryHandle;
      const payload = await readWordEditingDataFromProject(targetHandle);
      if (generation !== projectGeneration || targetHandle !== projectDirectoryHandle) return;
      window.lmAdvancedWordEditing.loadDictionaryPayload(payload, { projectHandle: targetHandle });
      if (!payload && typeof window.lmAdvancedWordEditing.flush === 'function') {
        await window.lmAdvancedWordEditing.flush();
      }
    });
  }

  function renderActiveRightPanel(panel = activeSidePanel) {
    if (panel === 'facts') {
      if (typeof renderFacts === 'function') renderFacts();
      return;
    }
    if (panel === 'ai') {
      if (typeof renderAIDesk === 'function') renderAIDesk();
      return;
    }
    if (typeof renderTags === 'function') renderTags();
  }

  async function ensureRightPanel(panel = activeSidePanel, options = {}) {
    if (panel === 'facts') {
      await ensureFactsData();
      if (options.render !== false) renderActiveRightPanel(panel);
      return;
    }
    if (panel === 'ai') {
      await ensureAIData();
      if (options.render !== false) renderActiveRightPanel(panel);
      return;
    }
    await ensureNamingData();
    if (options.render !== false) renderActiveRightPanel('naming');
  }

  async function loadProjectOpenSections(options = {}) {
    const visibleRightPanel = ['naming', 'facts', 'ai'].includes(options.activeRightPanel)
      ? options.activeRightPanel
      : 'naming';
    await ensureRecoveryData();
    await ensureMainEditor();
    await ensureRightPanel(visibleRightPanel);
    await ensureStatusPanel();
    const editor = typeof document === 'undefined' ? null : document.getElementById('editor');
    const loadEditorTools = () => ensureWordEditingData().catch(error => console.warn('Editor tools load failed:', error));
    editor?.addEventListener('focusin', loadEditorTools, { once: true });
    editor?.addEventListener('keydown', loadEditorTools, { once: true });
  }

  window.LmWorkspaceSectionLoader = Object.freeze({
    reset,
    isReady: section => ready.has(section),
    ensureMainEditor,
    ensureStatusPanel,
    ensureRecoveryData,
    ensureNamingData,
    ensureFactsData,
    ensureAIData,
    ensureWordEditingData,
    renderActiveRightPanel,
    ensureRightPanel,
    loadProjectOpenSections
  });
  window.renderActiveWorkspaceSidePanel = renderActiveRightPanel;
})();
