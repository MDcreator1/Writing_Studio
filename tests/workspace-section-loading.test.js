const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
let assertions = 0;
const check = (value, message) => {
  assert.ok(value, message);
  assertions += 1;
};

async function testSectionCoordinator() {
  const calls = { editor: 0, recovery: 0, naming: 0, word: 0, facts: 0, ai: 0, status: 0 };
  let activeDocumentLoadsSafely = true;
  const context = {
    window: {}, Promise, Map, Set,
    activeSidePanel: 'facts',
    projectManifest: { facts: [{ id: 1 }] },
    projectDirectoryHandle: { name: 'Story' },
    storyFacts: [],
    ensureActiveDocumentContentLoaded: async () => { calls.editor += 1; return activeDocumentLoadsSafely; },
    readChapterEditDraftsFromProject: async () => { calls.recovery += 1; },
    readNamingDataFromProject: async () => { calls.naming += 1; },
    readWordEditingDataFromProject: async () => { calls.word += 1; return {}; },
    normalizeStoryFacts: facts => { calls.facts += 1; return facts; },
    loadAIDeskState: () => { calls.ai += 1; },
    updateChapterStatus: () => { calls.status += 1; },
    renderFacts() {}, renderAIDesk() {}, renderTags() {}
  };
  context.window.lmAdvancedWordEditing = { loadDictionaryPayload() {} };
  vm.createContext(context);
  vm.runInContext(read('assets/pages/story-novel-project-editor/js/00b-workspace-section-loader.js'), context);

  const loader = context.window.LmWorkspaceSectionLoader;
  await loader.loadProjectOpenSections({ activeRightPanel: 'facts' });
  check(calls.editor === 1, 'active editor should load once');
  check(calls.recovery === 1, 'recovery metadata should load once');
  check(calls.naming === 0, 'hidden naming data should remain unloaded');
  check(calls.word === 0, 'word tools should wait for editor interaction');
  check(calls.facts === 1, 'visible facts data should initialize once');
  check(calls.ai === 0, 'hidden AI data should remain unloaded');
  check(calls.status === 1, 'status panel should render once');

  await loader.ensureRightPanel('naming');
  check(calls.naming === 1, 'naming data should load when its panel is requested');
  await loader.ensureWordEditingData();
  check(calls.word === 1, 'word tools should load on first editor demand');

  await Promise.all([loader.ensureRightPanel('ai'), loader.ensureRightPanel('ai')]);
  check(calls.ai === 1, 'concurrent AI requests should deduplicate data loading');

  activeDocumentLoadsSafely = false;
  loader.reset();
  await assert.rejects(loader.ensureMainEditor(), /could not be loaded safely/);
  assertions += 1;
}

async function testLegacyFactsMigration() {
  let written = '';
  const legacyPayload = { facts: [{ id: 'legacy' }] };
  const context = {
    window: {}, Object, JSON,
    storyFacts: [],
    projectManifest: { facts: [] },
    projectDirectoryHandle: { name: 'Story' },
    PROJECT_MANIFEST_FILE: 'Chapters_info.json',
    FACTS_STORAGE_KEY: 'facts',
    normalizeStoryFacts: facts => Array.isArray(facts) ? facts : [],
    localStorage: { setItem() {} },
    getProjectFileHandle: async (filePath, options = {}) => {
      if (filePath === 'Chapters_info.json') return { name: filePath };
      if (!options.create) throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
      return { name: filePath };
    },
    readFileText: async handle => handle.name === 'Chapters_info.json' ? JSON.stringify(legacyPayload) : '',
    writeFileText: async (_handle, value) => { written = value; },
    console
  };
  vm.createContext(context);
  vm.runInContext(read('assets/pages/story-novel-project-editor/js/00c-facts-panel-data.js'), context);
  await context.window.LmFactsPanelData.loadProjectData();
  check(context.storyFacts[0]?.id === 'legacy', 'legacy manifest facts should remain available');
  check(JSON.parse(written).facts[0]?.id === 'legacy', 'legacy facts should migrate to their panel file');
}

async function testFirstOpenMismatchRepairScope() {
  const firstHandle = { name: 'First' };
  const secondHandle = { name: 'Second' };
  let draftWrites = 0;
  const context = {
    window: {}, Object,
    performance: { getEntriesByType: () => [{ type: 'navigate' }] },
    projectDirectoryHandle: firstHandle,
    PROJECT_DRAFTS_FILE: 'Story_Drafts.json', DRAFTS_STORAGE_KEY: 'drafts',
    getProjectFileHandle: async () => ({}),
    draftsForStorage: () => [],
    writeFileText: async () => { draftWrites += 1; },
    localStorage: { setItem() {} },
    writeProjectManifest: async () => {}
  };
  vm.createContext(context);
  vm.runInContext(read('assets/pages/story-novel-project-editor/js/00d-first-project-open-repair.js'), context);
  const repair = context.window.LmFirstProjectOpenMismatchRepair;
  check(repair.begin(firstHandle) === true, 'fresh navigation first project should allow mismatch repair');
  const draft = { _wordCount: 2000, wordCount: 2000, _wordCountVerifiedSignature: 'saved' };
  check(await repair.repairDocument('draft', draft), 'first project mismatch should be repaired');
  check(draft._wordCount === null && draft.wordCount === null && draft._wordCountVerifiedSignature === '', 'repair should clear cached word metadata');
  check(draftWrites === 1, 'repair should persist corrected draft metadata');
  check(repair.begin(secondHandle) === false, 'later project switch should not allow repair');

  const reloadContext = {
    window: {}, Object,
    performance: { getEntriesByType: () => [{ type: 'reload' }] },
    projectDirectoryHandle: firstHandle,
    PROJECT_DRAFTS_FILE: 'Story_Drafts.json', DRAFTS_STORAGE_KEY: 'drafts',
    getProjectFileHandle: async () => ({}), draftsForStorage: () => [],
    writeFileText: async () => {}, localStorage: { setItem() {} },
    writeProjectManifest: async () => {}
  };
  vm.createContext(reloadContext);
  vm.runInContext(read('assets/pages/story-novel-project-editor/js/00d-first-project-open-repair.js'), reloadContext);
  check(reloadContext.window.LmFirstProjectOpenMismatchRepair.begin(firstHandle) === false, 'page reload should not allow repair');
}

async function testInitialRenderingCache() {
  let clock = 10;
  const files = new Map();
  const put = (name, value) => files.set(name, { text: JSON.stringify(value), lastModified: clock++ });
  put('Chapters_info.json', { title: 'Story', chapters: [{ id: 1, title: 'One', content: 'large body', contentPath: 'Chapters/1.txt' }], parts: [] });
  put('Story_Drafts.json', { drafts: [{ id: 2, title: 'Draft', content: 'draft body', contentPath: 'Drafts/1.txt' }] });
  put('Trash/Trash_Drafts.json', { drafts: [] });
  const context = {
    window: {}, Object, JSON, Promise, Map, Set, Date, RegExp, setTimeout, clearTimeout,
    PROJECT_MANIFEST_FILE: 'Chapters_info.json', PROJECT_DRAFTS_FILE: 'Story_Drafts.json',
    PROJECT_TRASH_DRAFTS_FILE: 'Trash/Trash_Drafts.json', PROJECT_NAMING_FILE: 'Story_Naming.json',
    PROJECT_MANIFEST_KEY: 'manifest', DRAFTS_STORAGE_KEY: 'drafts', TRASH_DRAFTS_STORAGE_KEY: 'trash',
    projectDirectoryHandle: { name: 'Story' }, projectManifest: { title: 'Story', chapters: [{ id: 1, title: 'One', content: 'large body', contentPath: 'Chapters/1.txt' }], parts: [] },
    chapters: [], chapterDrafts: [{ id: 2, title: 'Draft', content: 'draft body', contentPath: 'Drafts/1.txt' }], chapterTrashDrafts: [], storyFacts: [], namingData: { categories: [], entries: [] },
    curChap: 0, curDraft: 0, activeSidePanel: 'naming',
    activeEditorDocument: () => context.projectManifest?.chapters?.[0],
    isDraftActive: () => false,
    currentNamingChapterKey: () => 'Chapters/1.txt',
    activeNamingPanelText: () => 'Alice met Bob',
    getProjectDirectoryHandle: async () => ({}),
    getProjectFileHandle: async (name, options = {}) => {
      if (!files.has(name) && !options.create) throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
      if (!files.has(name)) files.set(name, { text: '', lastModified: clock++ });
      return { name, getFile: async () => ({ size: files.get(name).text.length, lastModified: files.get(name).lastModified }) };
    },
    readFileText: async handle => files.get(handle.name).text,
    writeFileText: async (handle, value) => files.set(handle.name, { text: value, lastModified: clock++ }),
    normalizeProjectManifest: value => value, normalizeStoryFacts: value => value || [],
    chaptersFromManifest: value => value.chapters || [], normalizeDrafts: value => value || [], normalizeTrashDrafts: value => value || [],
    draftsForStorage: () => context.chapterDrafts, trashDraftsForStorage: () => context.chapterTrashDrafts,
    normalizeNamingData: value => ({ schemaVersion: value?.schemaVersion || 2, categories: value?.categories || [], entries: value?.entries || [], hiddenByChapter: value?.hiddenByChapter || {}, visibleByChapter: value?.visibleByChapter || {} }),
    localStorage: { setItem() {} }, console
  };
  vm.createContext(context);
  vm.runInContext(read('assets/pages/story-novel-project-editor/js/00e-initial-rendering-store.js'), context);
  const rendering = context.window.LmInitialRendering;
  check(await rendering.syncLeftPanelData(), 'left rendering projection should be generated');
  const cache = JSON.parse(files.get('Initial_Rendering/Left_Panel.json').text);
  check(!('content' in cache.project.chapters[0]), 'left cache chapter should not contain its body');
  check(!('content' in cache.drafts[0]), 'left cache draft should not contain its body');
  context.namingData = {
    categories: [{ id: 'people', title: 'People' }],
    entries: [
      { id: 'alice', name: 'Alice', categoryId: 'people', chapterKey: 'Chapters/1.txt' },
      { id: 'bob', name: 'Bob', categoryId: 'people', chapterKey: 'Chapters/2.txt' },
      { id: 'carol', name: 'Carol', categoryId: 'people', chapterKey: 'Chapters/3.txt' }
    ]
  };
  check(await rendering.syncNamingIndex(), 'full naming data should create the active document snapshot');
  const snapshotPath = [...files.keys()].find(name => name.startsWith('Initial_Rendering/Naming_Documents/'));
  check(Boolean(snapshotPath), 'naming snapshot should live in the per-document folder');
  const namingSnapshot = JSON.parse(files.get(snapshotPath).text);
  check(namingSnapshot.namingData.entries.map(entry => entry.id).join(',') === 'alice,bob', 'snapshot should contain only names rendered for this document');
  check(namingSnapshot.categoryStates[0].words.map(word => word.state).join(',') === 'added,detected', 'snapshot should persist category-wise added and detected states');
  check(!files.has('Initial_Rendering/Naming_Panel.json'), 'single whole-story naming render index should not be generated');
  context.storyFacts = [
    { id: 'old-fact', createdAt: '2020-01-01T00:00:00.000Z', chapterIndex: 0 },
    { id: 'new-fact', createdAt: new Date().toISOString(), chapterIndex: 0 }
  ];
  const factsResult = await rendering.syncFactsPanelData({ mode: 'recent-days', days: 7 });
  check(factsResult.includedFacts === 1 && factsResult.totalFacts === 2, 'facts snapshot should honor the recent-day scope');
  const factsSnapshot = JSON.parse(files.get('Initial_Rendering/Facts_Panel.json').text);
  check(factsSnapshot.isPartial && factsSnapshot.facts[0]?.id === 'new-fact', 'partial facts rendering data should record its scope and selected facts');
  rendering.reset();
  context.namingData = { categories: [], entries: [] };
  check(await rendering.loadNamingForActiveDocument(), 'the saved per-document snapshot should reload directly');
  check(context.namingData.entries.length === 2, 'snapshot reload should restore the initial naming render without a story-wide scan');
  context.projectManifest = null;
  context.chapterDrafts = [];
  check(await rendering.loadLeftPanelData(), 'matching left cache should load without parsing primary JSON bodies');
  files.get('Chapters_info.json').lastModified = clock++;
  check(!(await rendering.loadLeftPanelData()), 'stale left cache should be rejected');
}

function testCategoryFullListSorting() {
  const context = {
    window: { categorySearchQuery: '', categorySortOption: 'chapter', LmInitialRendering: {} },
    chapters: Array.from({ length: 150 }, (_value, index) => ({ contentPath: `Chapters/chapter-${index + 1}.txt` })),
    chapterDrafts: Array.from({ length: 5 }, (_value, index) => ({ contentPath: `Drafts/draft-${index + 1}.txt` })),
    activeNamingPanelText: () => '', namingEntryMatchesActiveDocument: () => false,
    namingEntryNameInText: () => false, namingEntryUsesOrphanStyle: () => false
  };
  vm.createContext(context);
  vm.runInContext(read('assets/pages/story-novel-project-editor/js/03d-naming-category-sort.js'), context);
  const sorted = context.getCategoryFilteredSortedEntries('characters', [
    { id: 'old', name: 'Old', chapterNo: 1 },
    { id: 'unknown', name: 'Unknown' },
    { id: 'middle', name: 'Middle', descriptionMeta: { chapterNo: 3 } },
    { id: 'new', name: 'New', chapterIndex: 4 }
  ]);
  check(sorted.map(entry => entry.id).join(',') === 'new,middle,old,unknown', 'chapter sorting should include the full list newest-first and put unknown chapters last');
  const globalSorted = context.getCategoryFilteredSortedEntries('characters', [
    { id: 'part-one-50', name: 'Part one', chapterNo: 50, contentPath: 'Chapters/chapter-50.txt' },
    { id: 'part-two-50', name: 'Part two', chapterNo: 50, contentPath: 'Chapters/chapter-100.txt' },
    { id: 'part-three-20', name: 'Part three', chapterNo: 20, contentPath: 'Chapters/chapter-120.txt' }
  ]);
  check(globalSorted.map(entry => entry.id).join(',') === 'part-three-20,part-two-50,part-one-50', 'part-local chapter numbers must resolve through content paths to the 150-chapter global index');
  const draftFirstSorted = context.getCategoryFilteredSortedEntries('characters', [
    { id: 'chapter-new', name: 'Chapter new', chapterStatus: 'chapter', contentPath: 'Chapters/chapter-150.txt' },
    { id: 'draft-old', name: 'Draft old', chapterStatus: 'draft', draftIndex: 0, contentPath: 'Drafts/draft-1.txt' },
    { id: 'draft-new', name: 'Draft new', documentType: 'draft', contentPath: 'Drafts/draft-5.txt' },
    { id: 'chapter-old', name: 'Chapter old', chapterStatus: 'chapter', chapterNo: 2 }
  ]);
  check(draftFirstSorted.map(entry => entry.id).join(',') === 'draft-new,draft-old,chapter-new,chapter-old', 'creation-document sorting should put draft-created names first and order them by newest global draft index');
}

function testStorageAndActionContracts() {
  const storage = read('assets/shared/js/06a-project-storage-foundation.js');
  const collections = read('assets/shared/js/06b-workspace-restore-autosave.js');
  const chapterActions = read('assets/pages/story-novel-project-editor/js/01h-virtual-editor-pipeline.js');
  const editorInit = read('assets/pages/story-novel-project-editor/js/01d-editor-init-chapters.js');
  const editorFoundation = read('assets/pages/story-novel-project-editor/js/01a-editor-foundation-history.js');
  const editorFormatting = read('assets/pages/story-novel-project-editor/js/02a-find-replace-core.js');
  const trashDraftVirtualization = read('assets/pages/story-novel-project-editor/js/01g-trash-drafts-virtualization.js');
  const iconRegistry = read('assets/shared/js/00-icon-registry.js');
  const draftActions = read('assets/pages/story-novel-project-editor/js/01i-draft-promote-smart-clipboard.js');
  const deepScan = read('assets/pages/story-novel-project-editor/js/03c-naming-deep-scan-facts.js');
  const categorySort = read('assets/pages/story-novel-project-editor/js/03d-naming-category-sort.js');
  const namingPanels = read('assets/pages/story-novel-project-editor/js/03b-naming-categories-search.js');
  const nameDetailAliases = read('assets/pages/story-novel-project-editor/js/03e-name-detail-aliases.js');
  const namingCore = read('assets/pages/story-novel-project-editor/js/03a-naming-panel-core.js');
  const sidePanelCss = read('assets/pages/story-novel-project-editor/css/02-side-panels.css');
  const editorLayoutCss = read('assets/pages/story-novel-project-editor/css/00-editor-layout.css');
  const floatingToolsCss = read('assets/pages/story-novel-project-editor/css/01-floating-tools.css');
  const advancedWordEditingCss = read('assets/pages/story-novel-project-editor/css/07-advanced-word-editing.css');
  const autoScrollHistory = read('assets/pages/story-novel-project-editor/js/01b-history-auto-scroll.js');
  const autoScrollFind = read('assets/pages/story-novel-project-editor/js/01c-auto-scroll-find.js');
  const loading = read('assets/shared/js/06c-workspace-library-settings.js');
  const autosave = read('assets/shared/js/06b-workspace-restore-autosave.js');
  const html = read('story-novel-project-editor.html');
  const rendering = read('assets/pages/story-novel-project-editor/js/00e-initial-rendering-store.js');
  const facts = read('assets/pages/story-novel-project-editor/js/00c-facts-panel-data.js');
  const sectionLoader = read('assets/pages/story-novel-project-editor/js/00b-workspace-section-loader.js');
  const advancedConfig = read('assets/shared/js/05a-editor-advanced-config.js');
  const wordEditing = read('assets/shared/js/05b-advanced-word-editing.js');
  const editorFormattingAI = read('assets/pages/story-novel-project-editor/js/02b-editor-formatting-ai.js');
  const sidebarData = read('assets/pages/story-novel-project-editor/js/00a-chapter-sidebar-data.js');
  const snapshotTools = read('assets/pages/story-novel-project-editor/js/00f-rendering-snapshot-tools.js');
  const sideInfoScroll = read('assets/pages/story-novel-project-editor/js/02d-side-info-scroll-thumbs.js');
  const customSelect = read('assets/shared/js/06d-editor-paste-settings.js');
  const sharedModalCss = read('assets/shared/css/01-find-modals.css');
  const advancedSettingsCss = read('assets/pages/story-novel-project-editor/css/06-advanced-editor-settings.css');
  const namingSafety = read('assets/shared/js/06aa-naming-file-safety.js');
  const portableNaming = read('assets/pages/story-novel-project-editor/js/03f-naming-portable-transfer.js');
  const normalization = read('assets/shared/js/04a-state-defaults-normalization.js');
  const projectDetails = read('assets/pages/project-details/js/00a-details-foundation-documents.js');

  check(storage.includes('projectManifestForStorage'), 'manifest writes should strip document bodies');
  check(normalization.includes('...normalizeEditorDocumentFormatting(source)') && !normalization.includes('Object.assign(documentItem, editorGlobalTextFormattingDefaults())'), 'loaded documents should retain their own text formatting instead of being reset to the global template');
  check(normalization.includes('...editorGlobalTextFormattingDefaults()') && normalization.includes('function createDefaultDraft'), 'new documents should still copy the current global formatting template');
  check(storage.includes('normalized.globalTextFormatting = { ...manifest.globalTextFormatting }'), 'manifest normalization should preserve the saved global formatting template');
  check(advancedConfig.includes('pf.globalFontSize ?? pf.fontSize ?? stored.globalFontSize'), 'each project global formatting template should take precedence over another project local browser cache');
  check(storage.includes('richContentHTML: editorDocumentRichContentForStorage(chapter)') && collections.includes('richContentHTML: editorDocumentRichContentForStorage(draft)'), 'formatted chapters and drafts should persist a rich-format sidecar while primary files stay plain text');
  check(loading.includes('function editorContentFromProjectText') && loading.includes('if (richText === plainText) return richHTML'), 'rich formatting should be restored only when it still matches the authoritative plain-text file');
  check(editorFoundation.includes("setEditorRenderMode(editor, 'rich')") || editorFormatting.includes("setEditorRenderMode(editor, 'rich')"), 'selection formatting should promote the active editor to a persistent rich-text surface');
  check(customSelect.includes('clearDocumentGlobalFormattingOverrides') && customSelect.includes('Object.assign(draft, globalFormatting)'), 'explicit global Apply should clear document formatting overrides before replacing their global fields');
  check(storage.includes('function cacheProjectManifest') && storage.includes('Project manifest browser cache write skipped'), 'manifest cache quota errors should not abort project opening');
  check(sidebarData.includes('projectManifest = projectManifestForStorage(sourceManifest)'), 'legacy embedded chapter bodies should be discarded before sidebar state is created');
  check(!collections.includes('localStorage.setItem(PROJECT_MANIFEST_KEY, JSON.stringify'), 'restore flows should use the compact non-blocking manifest cache writer');
  check(storage.includes('delete metadata.facts'), 'manifest writes should omit independently stored facts');
  check(storage.includes('LmNamingFileSafety.writeCurrentProject(targetHandle'), 'authoritative Story_Naming writes should use the guarded writer');
  check(namingSafety.includes('const writeTasks = new WeakMap()') && namingSafety.includes('projectHandle !== projectDirectoryHandle'), 'Story_Naming writes should be serialized and guarded per project handle');
  check(namingSafety.includes('Story_Naming.previous.json') && namingSafety.includes('verifiedText !== payload') && namingSafety.includes('writeHandleText(targetHandle, previousText)'), 'Story_Naming writes should create a backup, verify the result and roll back failures');
  check(namingSafety.includes('capturedFullData') && namingSafety.includes('preserveRecordsUnlessExplicitlyRemoved'), 'Story_Naming writes must capture full data and preserve records against projection races');
  check(namingSafety.includes('options.authoritativeData') && portableNaming.includes('authoritativeData: working'), 'reviewed portable imports should reach the guarded writer as an explicit authoritative dataset');
  check(html.includes('exportPortableNamingData()') && html.includes('openPortableNamingImportPicker()') && html.includes('03f-naming-portable-transfer.js'), 'Naming toolbar should expose versioned portable export and import actions');
  check(portableNaming.includes("NAMING_PORTABLE_FORMAT = 'lekhak-manch.naming-portable'") && portableNaming.includes('migratePortableNamingPayload') && portableNaming.includes('analyzePortableNamingImport'), 'portable Naming import should validate versions, migrate legacy data and analyze conflicts before writing');
  check(portableNaming.includes('refreshNamingEntrySource') && portableNaming.includes('rebuildAllNamingDocumentStates') && portableNaming.includes('deduplicateDescriptionHistory: true'), 'portable Naming import should deep scan affected names and rebuild document snapshots after the guarded save');
  check(sidePanelCss.includes('.naming-transfer-modal') && sidePanelCss.includes('.naming-transfer-conflict-list') && sideInfoScroll.includes("'.naming-transfer-conflict-list'"), 'portable Naming conflicts should use the full review panel and project custom scroll thumb');
  check(deepScan.includes('activeExpandedCategoryWithShowMoreDocumentKey') && deepScan.includes('resetFullNamingCategoryListAfterDocumentSwitch(chapterKey)'), 'document switches should collapse only the Show more naming list state');
  check(deepScan.includes('is-draft-created') && namingPanels.includes('namingEntryDraftAppearanceLabel') && !html.includes('nameDetailOrigin'), 'draft-created names should expose a text-color tag hint and hover-only origin label');
  check(sidePanelCss.includes('.naming-entry-item.is-draft-created .tname') && sidePanelCss.includes('var(--lm-status-orphan-color)') && !sidePanelCss.includes('.naming-entry-item.is-draft-created::before'), 'draft-origin styling should recolor only the name text and must not add a D marker');
  check(storage.includes("error?.name !== 'NotFoundError'") && storage.includes('overwrite blocked'), 'Naming read failures other than a missing file must never overwrite Story_Naming');
  check(rendering.includes("error?.name !== 'NotFoundError'") && rendering.includes('Stale project Naming read was cancelled'), 'full Naming hydration should fail closed and reject stale project reads');
  check(normalization.includes('invalidEntries') && normalization.includes('...entry'), 'Naming normalization should preserve custom fields and quarantine invalid entries');
  check(storage.includes('if (!hasExplicitText && !sourceIsLoaded) return false;') && storage.includes('if (!options.documentTexts && !allSourcesLoaded) return false;'), 'project-open mention validation should defer until lazy document bodies are available');
  const descriptionEdit = projectDetails.slice(projectDetails.indexOf('function projectDetailsPersistNameDescription'), projectDetails.indexOf('function projectDetailsRenderHero'));
  check(!descriptionEdit.includes('entry.chapterKey =') && !descriptionEdit.includes('entry.chapterIndex ='), 'description edits must not replace first-appearance metadata');
  check(html.includes('06aa-naming-file-safety.js'), 'the editor should load the guarded Story_Naming writer');
  check(html.includes('02d-side-info-scroll-thumbs.js') && sideInfoScroll.includes("'.fact-detail-popover'") && sideInfoScroll.includes("'.name-detail-popover'"), 'side information panels should load the shared floating scroll-thumb controller');
  check(sidePanelCss.includes('.lm-side-info-custom-scroll::-webkit-scrollbar') && sidePanelCss.includes('.side-info-scroll-thumb.is-visible'), 'side information panels should hide native scrollbars and expose only the custom thumb');
  check(editorLayoutCss.includes('#rawChapterSection.is-expanded') && editorLayoutCss.includes('grid-template-rows: minmax(34px, auto) minmax(0, 1fr)') && editorLayoutCss.includes('overflow: hidden'), 'expanded Temporary Chapters must stay inside its allocated sidebar height');
  check(editorLayoutCss.includes('#rawChapterSection>.raw-chapter-list') && editorLayoutCss.includes('height: 100%') && editorLayoutCss.includes('overflow-y: auto'), 'Temporary Chapters content must scroll inside its bounded grid row');
  check(sharedModalCss.includes('scrollbar-width: none !important') && sharedModalCss.includes('display: none !important') && advancedSettingsCss.includes('width: 0 !important'), 'custom select menus must never expose a visible native scrollbar');
  check(sharedModalCss.includes('border: 1px solid color-mix(in srgb, var(--border) 72%, transparent)') && sharedModalCss.includes('.lm-custom-select-option:not(:disabled):hover') && sharedModalCss.includes('.lm-custom-select-option:not(:disabled):focus-visible'), 'every custom select option should have a subtle border and matching pointer or keyboard highlight');
  check(html.includes('editor-auto-scroll-mode-switch') && html.includes('role="radiogroup"') && html.includes('Loop marker') && normalization.includes("editorAutoScrollModeBand: 'Loop marker'") && (html.match(/data-editor-auto-scroll-mode=/g) || []).length === 2, 'Depth Marker and Loop Marker should share one mutually exclusive mode switch with a stable localized label');
  check(!html.includes('editorAutoScrollModeDepthState') && !html.includes('editorAutoScrollModeBandState') && customSelect.includes("optionBtn.setAttribute('aria-checked', String(isActive))"), 'auto-scroll modes should expose selected state instead of separate On and Off badges');
  check(editorLayoutCss.includes('.editor-auto-scroll-mode-choice.is-active') && html.includes('editorAutoScrollEmptyOnlyToggleBtn') && html.includes('editorAutoScrollFocusSpeedRange'), 'mode switch styling should retain Paragraph Follow and Scrolling Speed controls');
  check(iconRegistry.includes('"chapterBoundaryTransfer"') && editorFoundation.includes("lmIcon('chapterBoundaryTransfer'"), 'chapter boundary transfer artwork should be fetched from the shared icon registry');
  check((trashDraftVirtualization.match(/lmChapterBoundaryTransferSpan\('down'\)/g) || []).length === 2 && trashDraftVirtualization.includes("lmChapterBoundaryTransferSpan('up')") && editorLayoutCss.includes('.chapter-boundary-transfer-icon.is-up') && editorLayoutCss.includes('transform: rotate(180deg)'), 'chapter boundary actions should use the down transfer icon and rotate the same icon 180 degrees for up');
  check(advancedConfig.includes('Apply Auto-scroll settings to all documents') && advancedConfig.includes('runAdvancedAutoScrollApplyGlobally()'), 'Advanced Auto-scroll should require an explicit project-wide apply action');
  check(advancedConfig.includes("'Active marker mode'") && advancedConfig.includes('The settings for both marker modes remain visible below.') && !advancedConfig.includes('syncAdvancedAutoScrollConditionalControls'), 'Advanced Auto-scroll should keep Depth and Loop marker settings visible regardless of the active mode selection');
  check(advancedConfig.indexOf("advancedRuntimeNumber('autoScrollDepth'") < advancedConfig.indexOf("advancedRuntimeToggle('autoScrollClickReposition'") && advancedConfig.includes('Reposition Depth Marker on editor click'), 'Depth Marker click-reposition control should appear immediately below its position control');
  check(loading.includes('autoScrollClickRepositionEnabled') && storage.includes('clickRepositionEnabled') && advancedConfig.includes('clickRepositionEnabled: template.autoScrollClickRepositionEnabled'), 'Depth Marker click-reposition preference should persist in document and project Auto-scroll settings');
  check(autoScrollFind.includes('isEditorAutoScrollDepthMode() && !isEditorAutoScrollClickRepositionEnabled'), 'disabled click repositioning should block only Depth Marker pointer placement');
  check(loading.includes("options.persistProject !== false && typeof persistActiveDocumentSettings === 'function'") && editorInit.includes('saveEditorSettings({ persistProject: false })'), 'manual Editor Settings changes should persist to the active project document without recursively saving storage snapshots');
  check(customSelect.includes('setEditorAutoScrollFocusTime(as.focusTime, { persist: false })'), 'loading the project Auto-scroll template must not overwrite an existing document setting before that document is restored');
  check(html.includes('editorAutoScrollApplyAllBtn') && html.includes('applyEditorAutoScrollPanelSettingsToAllDocuments(event)'), 'the normal Auto-scroll options panel should expose its own document-level Apply to all action');
  check(customSelect.includes("field: 'autoScrollEmptyParagraphOnly', pin: 'autoScrollParagraphFollow'") && customSelect.includes("field: 'autoScrollFocusTime', pin: 'autoScrollDuration'") && customSelect.includes("field: 'autoScrollClickRepositionEnabled', pin: 'autoScrollClickReposition'") && customSelect.includes(".filter(entry => !entry.pin || isEditorQuickSettingPinned(entry.pin))"), 'normal Auto-scroll bulk apply should use extensible visible-pin and active-marker field lists');
  const editorPanelApply = customSelect.slice(customSelect.indexOf('async function applyEditorAutoScrollPanelSettingsToAllDocuments'), customSelect.indexOf('function toggleEditorAutoScrollEmptyParagraphOnly'));
  check(editorPanelApply.includes('overwriteDocumentFromEditorAutoScrollPanel') && editorPanelApply.includes('Object.values(chapterEditDrafts') && editorPanelApply.includes('The other marker position will remain unchanged.'), 'normal Auto-scroll bulk apply should update all existing document collections without changing the inactive marker position');
  check(customSelect.includes('function updateProjectAutoScrollTemplateFromEditorPanel') && editorPanelApply.includes('updateProjectAutoScrollTemplateFromEditorPanel(sourceSettings, fields)') && editorPanelApply.includes('syncEditorAutoScrollGlobalOverrideMarkerState()'), 'normal Auto-scroll bulk apply should update the matching global template fields and immediately clear matching marker overrides');
  check(editorLayoutCss.includes('.editor-auto-scroll-apply-all') && editorLayoutCss.includes('.editor-auto-scroll-apply-all:disabled'), 'normal Auto-scroll Apply to all action should have stable panel styling and a busy state');
  check(advancedConfig.includes('autoScrollParagraphFollow: true') && advancedConfig.includes('autoScrollClickReposition: true') && advancedConfig.includes('autoScrollDuration: true'), 'Auto-scroll child controls should use persistent quick-pin preferences that preserve the current visible defaults');
  check(advancedConfig.includes('autoScrollApplyAll: true') && advancedConfig.includes("advancedQuickPinButton('autoScrollApplyAll', 'Auto-scroll Apply to all'") && loading.includes('autoScrollApplyAllBtn.hidden = !autoScrollApplyAllPinned'), 'Advanced Auto-scroll Apply to all pin should control the normal panel bulk-action visibility');
  check(advancedConfig.includes('data-advanced-quick-pin-parent=') && advancedConfig.includes("syncAdvancedQuickPinParentVisibility('autoscroll')"), 'Auto-scroll child pin icons should appear only while the parent Auto-scroll control is pinned');
  check(html.indexOf('editorAutoScrollEmptyOnlyToggleBtn') < html.indexOf('editorAutoScrollClickRepositionToggleBtn') && html.indexOf('editorAutoScrollClickRepositionToggleBtn') < html.indexOf('editorAutoScrollFocusSpeedRow'), 'Depth click reposition should appear between Paragraph Follow and Scrolling Speed in normal Editor Settings');
  check(loading.includes("autoScrollClickRepositionBtn.hidden = !autoScrollClickRepositionPinned || activeAutoScrollMode !== 'depth'") && customSelect.includes('function toggleEditorAutoScrollClickReposition()'), 'Depth click reposition should remain hidden in Loop mode and expose a document-level toggle in Depth mode');
  check(advancedConfig.includes('Save keeps these values as the project template without changing existing documents.') && advancedConfig.includes('storeAdvancedAutoScrollProjectTemplate(autoScrollTemplate);'), 'Save should persist the Auto-scroll project template without applying it to existing documents');
  check(advancedConfig.includes("if (key.startsWith('autoScroll'))") && !advancedConfig.slice(advancedConfig.indexOf('function syncAdvancedQuickControlsFromRuntime'), advancedConfig.indexOf('function handleAdvancedRuntimeControlChange')).includes("setAdvancedRuntimeControlValue('autoScroll"), 'document Auto-scroll changes should not mutate or replace the Advanced project template');
  check(advancedConfig.includes('function overwriteDocumentAutoScrollSettings') && advancedConfig.includes('...current,') && advancedConfig.includes('Object.values(chapterEditDrafts'), 'global Auto-scroll apply should overwrite only Auto-scroll fields across chapters, drafts, and chapter-edit drafts');
  check(loading.includes('function projectAutoScrollSettingsTemplate') && loading.includes('function mergeProjectAutoScrollSettings') && loading.includes('documentItem?.editorSettings || mergeProjectAutoScrollSettings(null)'), 'documents without saved settings should inherit the project Auto-scroll template');
  check(storage.includes('normalized.autoScroll = { ...manifest.autoScroll }'), 'manifest normalization should preserve the saved Auto-scroll project template across close and reopen');
  check(!advancedConfig.includes('defaultAutoScrollDepth') && !advancedConfig.includes('defaultAutoScrollBandTop') && !advancedConfig.includes('defaultAutoScrollBandBottom'), 'Developer settings should not duplicate the project-template marker positions');
  check(autoScrollHistory.includes("editorAutoScrollProjectTemplatePercent('autoScrollDepth'") && autoScrollHistory.includes("editorAutoScrollProjectTemplatePercent('autoScrollBandTop'") && autoScrollHistory.includes("editorAutoScrollProjectTemplatePercent('autoScrollBandBottom'"), 'marker fallback geometry should use the saved project Auto-scroll template');
  check(loading.includes('function activeDocumentAutoScrollPositionOverrides()') && loading.includes('return { depth, loop };') && loading.includes("depthMarker?.classList.toggle('has-global-position-override', overrides.depth)") && loading.includes("topMarker?.classList.toggle('has-global-position-override', overrides.loop)"), 'Depth and Loop marker override indicators should compare only their own independently scoped positions');
  check(loading.includes("const unit = normalizedValue.endsWith('px') ? 'px' : '%';"), 'numeric project marker positions should compare as percentages against document percentage strings');
  check(editorLayoutCss.includes('.editor-auto-scroll-depth-marker.has-global-position-override') && editorLayoutCss.includes('.has-global-position-override .editor-auto-scroll-depth-arrow') && editorLayoutCss.includes('fill: var(--accent2);'), 'only position-overridden Auto-scroll markers and arrows should use accent2');
  check(autosave.includes(': mergeProjectAutoScrollSettings(null)'), 'new unsaved documents should serialize the project Auto-scroll template before their first open');
  check(advancedConfig.includes('async function saveAdvancedEditorSettings()') && advancedConfig.includes('await writeProjectManifest(projectManifest)'), 'saving the Advanced project template should finish its disk manifest write before success or reload');
  check(customSelect.includes('centeredCustomSelectLeft') && customSelect.includes('(shellRect.width - menuWidth) / 2'), 'wider custom select menus should expand equally around their trigger center');
  check(html.includes('advanced-number-stepper dock-fsize-control') && html.includes('adjustWordEditingCollectMinimum(1)') && html.includes('adjustWordEditingCollectMinimum(-1)'), 'Word Editing mini collection settings should reuse the Advanced number stepper and its custom arrows');
  check(floatingToolsCss.includes('left: calc(100% + 10px)') && floatingToolsCss.includes('.word-editing-collect-mini-panel.opens-left'), 'Word Editing mini collection settings should open beside the quick panel and switch sides when viewport space requires it');
  check(editorFormattingAI.includes('function positionWordEditingCollectMiniPanel()') && editorFormattingAI.includes("miniPanel.classList.add('opens-left')") && editorFormattingAI.includes('roomLeft > roomRight'), 'Word Editing mini collection settings should choose the roomier side of its trigger');
  check(customSelect.includes("select.closest('.word-editing-collect-mini-panel')") && customSelect.includes('const maxVisibleOptions = 5;') && customSelect.includes('const relativeLeft = viewportLeft - shellRect.left;'), 'Word Editing mini category menu should use the Advanced Settings dimensions with transform-safe trigger-relative positioning');
  check(storage.includes("contentHTML: includeContent ? chapter.content || '' : ''"), 'local chapter index should omit bodies');
  check((collections.match(/contentHTML: includeContent \?/g) || []).length === 3, 'draft indexes should omit bodies');
  check(chapterActions.includes('await ensureChapterContentLoaded(index)'), 'chapter switch should load on demand');
  check(draftActions.includes('await ensureDraftContentLoaded(index)'), 'draft switch should load on demand');
  const deepScanSource = read('assets/pages/story-novel-project-editor/js/03aa-naming-deep-scan-source.js');
  check(deepScan.includes('LmNamingDeepScanSource.buildTextIndex'), 'deep scan should build its text index from authoritative document sources');
  check(deepScanSource.includes('getProjectFileHandle(documentItem.contentPath)') && deepScanSource.includes('readFileText(fileHandle)'), 'deep scan should read chapter and draft source files instead of trusting cached document content');
  check(deepScanSource.includes('batchSize = 10'), 'deep scan source reads should use bounded batches');
  check(deepScanSource.includes('chapterContentHashes') && deepScan.includes('sourceIndex,'), 'deep scan snapshot rebuilding should reuse already-read document content and hashes');
  check(!loading.includes('getProjectFileHandle(chapter.contentPath, { create: true })'), 'chapter lazy-load must not create a missing blank file');
  check(!loading.includes('getProjectFileHandle(draft.contentPath, { create: true })'), 'draft lazy-load must not create a missing blank file');
  check(loading.includes('empty-file-word-count-mismatch'), 'loader should detect zero-byte/positive-word metadata corruption');
  check(loading.includes("_contentLoadState: 'quarantined'"), 'non-repair switch should quarantine instead of blocking the document');
  check(autosave.includes('Unsafe blank draft write blocked'), 'autosave should block unsafe blank draft writes');
  check(chapterActions.includes('commitPreviousSnapshot: () => commitHiddenSwitchedSnapshotToMemory(switchedSnapshot)'), 'chapter switch must await snapshot normalization before saving');
  check(draftActions.includes('commitPreviousSnapshot: () => commitHiddenSwitchedSnapshotToMemory(switchedSnapshot)'), 'draft switch must await snapshot normalization before saving');
  check(chapterActions.includes('switchedSnapshot.projectHandle !== projectDirectoryHandle'), 'old-project snapshots must not save into a newly opened project');
  check(rendering.includes("const CACHE_DIR = 'Initial_Rendering'"), 'project rendering cache should use its own folder');
  check(rendering.includes('const NAMING_SCHEMA_VERSION = 4') && rendering.includes('sourceContentHash') && rendering.includes('contentHash: true'), 'Naming snapshots should use versioned content hashes instead of timestamp-only validation');
  check(rendering.includes('categoryOrphanCounts') && rendering.includes('namingCategoryOrphanCount'), 'Naming snapshots should retain category-wide orphan counts for lazy status rendering');
  check(rendering.includes('left.contentHash === right.contentHash'), 'Naming snapshot validation should reject content-hash mismatches');
  check(rendering.includes(').slice(0, 6);'), 'per-document Naming snapshots should cap initial categories at six');
  check(deepScan.includes('initialNamingCategoriesForActiveDocument(6)') && deepScan.includes('activeCount'), 'empty and populated drafts should render a maximum of six priority categories initially');
  check(namingPanels.includes('activeNamingShowAllCategoriesKey'), 'Show All Categories should remain an explicit user override of the six-category initial view');
  check(chapterActions.includes('shouldRefreshNamingProjection') && chapterActions.includes('queueActiveNamingSnapshotRefresh'), 'typing into an empty draft should refresh its lazy Naming projection for detected categories');
  check(rendering.includes('syncFactsPanelData') && rendering.includes('Facts_Panel.json'), 'facts panel should expose its own rendering snapshot builder');
  check(rendering.includes('namingSnapshotDocumentsForScope') && rendering.includes("recent-chapters"), 'naming snapshots should support scoped document selection');
  check(snapshotTools.includes("actionRow('left'") && snapshotTools.includes("actionRow('facts'") && snapshotTools.includes("actionRow('naming-snapshots'") && snapshotTools.includes("actionRow('naming'"), 'developer snapshot section should expose panel builders and the all-document Naming snapshot action');
  check(snapshotTools.includes('Recent day window') && snapshotTools.includes('Latest chapter window'), 'developer snapshot section should expose day and chapter conditions');
  check(advancedConfig.includes("'Rendering Snapshots'"), 'advanced developer settings should include a rendering snapshot section');
  check(
    advancedConfig.includes("'Rendering Snapshots', 'Project Cache & Storage'") &&
    advancedConfig.includes("category === 'Rendering Snapshots'") &&
    advancedConfig.includes("? '4'") &&
    advancedConfig.includes("category === 'Project Cache & Storage'") &&
    advancedConfig.includes("? 3"),
    'developer category navigation should reach cache storage after the rendering actions tab'
  );
  check(advancedConfig.includes('`${LM_EDITOR_ADVANCED_SCHEMA.length} internal controls`'), 'developer settings count should stay synchronized with its schema');
  check(advancedConfig.includes("await deleteAdvancedSettingsIndexedDB('lm-advanced-word-editing')"), 'word dictionary reset should wait for IndexedDB deletion before reloading its disk source');
  check(advancedConfig.includes('await Promise.all(databaseNames.map(deleteAdvancedSettingsIndexedDB))'), 'full studio reset should clear its IndexedDB databases before local settings and reload');
  check(advancedConfig.includes('LM_EDITOR_ADVANCED_HINDI_EXPLANATIONS') && advancedConfig.includes("focusIdleDelay: ['Focus mode में inactivity"), 'developer controls should provide dedicated Hindi runtime explanations');
  check(advancedConfig.includes('data-advanced-setting-description=') && advancedConfig.includes('data-advanced-setting-increased=') && advancedConfig.includes('data-advanced-setting-decreased='), 'developer explanation mode should update descriptions and both info-popover outcomes in place');
  check(advancedConfig.includes('advanced-editor-setting-info-popover lm-side-info-custom-scroll'), 'developer information popovers should use the shared custom scroll surface');
  check(advancedConfig.includes('developerLanguageToggle') && advancedConfig.includes('toggleAdvancedEditorExplanationLanguage()'), 'the Developer settings header should expose an English/Hindi explanation toggle');
  check(advancedConfig.includes('LM_EDITOR_ADVANCED_DIRECTION_RISK') && advancedConfig.includes('advancedEditorRiskColor') && advancedConfig.includes('updateAdvancedEditorRiskIndicator'), 'developer value changes should color each direction by its setting-specific distance from default and functional risk');
  check(advancedConfig.includes('<b>Increase</b>') && advancedConfig.includes('<b>Decrease</b>') && !advancedConfig.includes("'बढ़ाने पर' : 'If increased'"), 'Hindi explanation mode should retain the original Increase and Decrease headings');
  check(advancedSettingsCss.includes('backdrop-filter: blur(14px) saturate(125%)') && advancedSettingsCss.includes('background: color-mix(in srgb, var(--surface) 76%, transparent)') && advancedSettingsCss.includes('0 12px 30px rgba(10, 18, 32, .14)'), 'developer info popovers should use a translucent blurred surface with a softer shadow');
  check(deepScan.includes('options.snapshotScope') && deepScan.includes('} finally {'), 'naming Deep Scan should pass snapshot scope and always stop its spinner');
  check(deepScan.includes('chapterScanTexts') && deepScan.includes('createDeepScanSavedNameMatcher'), 'deep scan should normalize document text and compile name matchers only once per scan');
  check(storage.includes('[entry.name, ...(Array.isArray(entry.similarNames) ? entry.similarNames : [])]') && storage.includes("searchNames.some(name => countEditorFindMatches(documentText, name, 'deep') > 0)"), 'project-open mention validation should preserve metadata when a primary name or any saved similar name is present');
  check(deepScan.indexOf('buildTextIndex') < deepScan.indexOf('const authoritativeNamingData = normalizeNamingData(') && deepScan.includes('namingData = authoritativeNamingData'), 'deep scan must re-hydrate and pin the full Naming dataset after asynchronous source reads');
  check(deepScan.includes('refreshNamingEntrySource(entry, documents, checkedAt, matcher)') && !deepScan.includes('entry.descriptionMeta ='), 'deep scan repairs only source metadata through the shared helper');
  check(deepScan.includes('createDeepScanSavedNameMatcher(namingEntrySearchNames(entry))'), 'deep scan compiles primary-name and alias matchers for each entry');
  check(!deepScan.includes('hasDeepScanSavedNameUse(searchNames, text)'), 'deep scan should never test a saved-name matcher against its own search-name list');
  check(rendering.includes('const batchSize = 6') && rendering.includes('Promise.all(batch.map'), 'naming snapshots should write in bounded parallel batches');
  check(html.includes('namingDeepScanStatus'), 'naming deep scan should expose visible phase and progress feedback');
  check(rendering.includes('delete copy.content;') && rendering.includes('delete copy.contentHTML;'), 'left rendering cache must not duplicate document bodies');
  check(rendering.includes('const source = documentInfo.contentPath ? await fingerprint'), 'active document cache should track its primary text source');
  check(rendering.includes("const NAMING_DOCUMENTS_DIR = `${CACHE_DIR}/Naming_Documents`"), 'naming should keep one initial-render snapshot per document');
  check(rendering.includes('LEGACY_NAMING_ACTIVE_FILE'), 'the previous single active-document snapshot should remain migration-compatible');
  check(rendering.includes('state: namingWordState(entry, key)'), 'active naming projection should label added and detected words');
  check(rendering.includes('minimumVisibleCategoryIds') && rendering.includes('minimum = 6'), 'naming projection should provide at least six lightweight categories');
  check(rendering.includes('initialVisibleCategoryIds'), 'each naming snapshot should persist its relevant and fallback initial category selection');
  check(rendering.includes('LmNamingDeepScanSource.buildTextIndex') && rendering.includes("phase: 'reading'"), 'all-document snapshot builds should scan authoritative stored document text without changing first-appearance metadata');
  check(rendering.includes('loadedNamingCategoryIds') && rendering.includes('sourceData.entries.filter(entry => entry.categoryId === categoryId)'), 'placeholder category entries should load only after that category is requested');
  const showAllBlock = namingPanels.slice(namingPanels.indexOf('async function showAllNamingCategories'), namingPanels.indexOf('function updateShowAllCategoriesBtnVisibility'));
  check(showAllBlock.includes('syncActiveNamingVisibility') && !showAllBlock.includes('saveNamingData()'), 'show-all category visibility must update only its rendering snapshot, never Story_Naming');
  check(!showAllBlock.includes("ensureNamingCategoryData?.('*')") && showAllBlock.includes('namingCategoryCount'), 'show-all should use lightweight global counts without wildcard entry loading');
  check(namingCore.includes('await window.LmInitialRendering?.syncActiveNamingVisibility?.()'), 'individual category visibility changes should also avoid authoritative Naming writes');
  check(rendering.includes('sameFingerprint(snapshot.namingSource, currentNamingSource)'), 'stale naming snapshots should be rebuilt so document text detection stays current');
  check(deepScan.includes('ensureNamingCategoryData?.(categoryId)'), 'showing other names should load only the selected category');
  check(rendering.includes('writeNamingSnapshot(projection.identity'), 'deep refresh should rebuild every document naming snapshot');
  check(!rendering.includes('writeJson(NAMING_FILE'), 'the obsolete whole-story Naming_Panel cache should no longer be written');
  check(draftActions.includes('queueActiveNamingSnapshotRefresh'), 'editor changes should refresh the active document naming snapshot');
  check(deepScan.includes('async function deleteActiveNamingEntry') && deepScan.includes('await window.LmInitialRendering?.ensureFullNamingData?.()'), 'deleting a projected name must first restore the authoritative naming dataset');
  check(deepScan.includes('rebuildAllNamingDocumentStates'), 'deep scan should rebuild the new naming rendering architecture');
  check(deepScan.includes(".then(() => writeProjectManifest())"), 'facts file must finish saving before the legacy manifest can be stripped');
  check(categorySort.includes('namingStoryMentionCount'), 'show-more count sorting should use story-wide cached mention counts');
  check(categorySort.includes('rank(a) - rank(b) || compareNames(a, b)'), 'status sorting should order the complete category list deterministically');
  check(namingPanels.includes('namingEntryFirstAppearanceLabel(entry)'), 'name hover should render first-appearance chapter metadata');
  check(html.includes('nameDetailAliasesBox') && deepScan.includes('renderNameDetailSimilarNames(entry)'), 'name details should render an optional similar-names box between title and description');
  check(nameDetailAliases.includes('values.scrollWidth > values.clientWidth') && nameDetailAliases.includes('counter.textContent = `+(${remaining})`'), 'similar names should remain on one measured line and collapse overflow into a remaining-count label');
  check(nameDetailAliases.includes('box.hidden = aliases.length === 0'), 'name details should omit the similar-names box when no aliases exist');
  check(namingPanels.includes('copyNamingEntryOnDoubleClick'), 'naming entries should expose a clipboard copy handler');
  check(deepScan.includes('ondblclick="copyNamingEntryOnDoubleClick'), 'every rendered naming entry should copy on double-click');
  check(sidePanelCss.includes('text-overflow: ellipsis') && sidePanelCss.includes('.naming-entry-first-appearance'), 'long hover chapter titles should remain single-line ellipsized');
  check(storage.includes('syncLeftPanelData'), 'primary metadata writes should refresh the left rendering cache');
  check(storage.includes('await window.LmFactsPanelData.ensureLegacyMigration()'), 'manifest writes must preserve legacy facts before stripping them');
  check(facts.includes('readLegacyManifestFacts'), 'facts loader should recover from the primary manifest when its panel file is missing');
  check(autosave.includes('syncActiveDocumentData'), 'active document saves should refresh active/status rendering data');
  check(sectionLoader.includes('resetProjectData') && sectionLoader.includes('targetHandle !== projectDirectoryHandle'), 'dictionary loading should reset on project switch and reject stale reads');
  check(advancedConfig.includes("safeKey === 'advanced-word-editing'") && advancedConfig.includes('ensureWordEditingData'), 'opening Advanced Word Editing should demand-load its dictionary');
  check(wordEditing.includes('function resetProjectData') && wordEditing.includes('Dictionary will load when this section opens'), 'word dictionary module should support lazy project reset');
  check(html.includes('data-awe-dock-temporary-count') && html.includes('word-editing-quick-badge'), 'Temporary Names quick action should expose an icon-only live count badge');
  check(html.includes('wordEditingCollectMiniPanel') && html.includes('data-awe-dock-collect-category') && html.includes('data-awe-dock-collect-minimum-input'), 'Collect quick action should own a compact category and minimum-count panel');
  check(floatingToolsCss.includes('.word-editing-quick-panel:has(.word-editing-mini-category .lm-custom-select.is-open)') && floatingToolsCss.includes('.word-editing-mini-category .lm-custom-select-option') && floatingToolsCss.includes('width: max-content') && floatingToolsCss.includes('white-space: nowrap'), 'Collect category menu should expose the page backdrop and size unwrapped options from their longest label');
  check(!html.includes('<small>Keep words</small>') && !html.includes('data-awe-dock-collect-policy'), 'Word Editing quick actions should no longer render text labels');
  check(wordEditing.includes('minimumOccurrences: state.unmatchedReplacementThreshold,') && wordEditing.includes('state.unmatchedReplacementThreshold = minimum;') && wordEditing.includes('node.textContent = String(panelState.minimumOccurrences);'), 'quick threshold input and badge should show the exact same unsuffixed number as Advanced Word Editing');
  check(wordEditing.includes('renderWorkspaceView();') && wordEditing.includes('persistSoon();'), 'mini-panel changes should refresh Advanced controls and use project dictionary persistence');
  check(editorFormattingAI.includes('getEditorDockPanelState') && editorFormattingAI.includes('updateCollectSettingsFromDock'), 'Collect quick panel should read and update the shared Advanced Word Editing API');
  check(editorFormattingAI.includes('openTemporaryCandidatesFromDock') && !editorFormattingAI.slice(editorFormattingAI.indexOf('async function openWordEditingTemporaryNames'), editorFormattingAI.indexOf('async function openWordEditingCollectSettings')).includes('openEditorControlsFromDock'), 'Temporary Names quick action should open its standalone panel without opening Advanced Settings');
  check(wordEditing.includes('function ensureStandaloneTemporaryCandidatesDialog()') && wordEditing.includes("backdrop.dataset.aweDialog = 'temporary-candidates-standalone'") && wordEditing.includes('openTemporaryCandidatesFromDock'), 'Temporary Names should provide a reusable viewport-level standalone dialog');
  check(advancedWordEditingCss.includes('.awe-standalone-temporary-backdrop') && advancedWordEditingCss.includes('backdrop-filter: none') && advancedWordEditingCss.includes('0 5px 16px'), 'standalone Temporary Names should have no backdrop blur and only a minimal panel shadow');
  check(advancedWordEditingCss.includes('.awe-temporary-candidates-panel .awe-name-panel-close:hover') && advancedWordEditingCss.includes('background: transparent !important') && advancedWordEditingCss.includes('color-mix(in srgb, var(--accent) 14%, transparent)'), 'Temporary Names close button should stay transparent until hover or keyboard focus highlights it');
  check(wordEditing.includes('awe-temporary-candidate-copy') && wordEditing.includes('awe-temporary-target-arrow') && wordEditing.includes('awe-temporary-source-word') && wordEditing.includes('candidate.count.toLocaleString()'), 'Temporary candidates should render replacement, aimed arrow, source and count in one structured line');
  check(wordEditing.includes('data-awe-temporary-category') && wordEditing.includes('awe-temporary-confirm-button') && wordEditing.includes('awe-temporary-dismiss-button'), 'each Temporary candidate should expose category selection plus confirm and dismiss icon actions');
  check(wordEditing.includes('saveTemporaryCandidate(trigger.dataset.candidateId, category)') && wordEditing.includes('function dismissTemporaryCandidate(candidateId)'), 'Temporary candidate actions should save into the selected category or remove only that candidate');
  check(customSelect.includes("select.closest('.awe-temporary-candidate-row')") && advancedWordEditingCss.includes('grid-template-columns: max-content 32px 32px'), 'Temporary candidate category menus should reuse five-row Advanced menu sizing and centered trigger expansion');
  check(iconRegistry.includes('"temporaryCandidateConfirm"') && wordEditing.includes("iconMarkup('temporaryCandidateConfirm', 'awe-temporary-action-icon'"), 'Temporary candidate confirm actions should fetch the supplied check artwork from the shared icon registry');
  check(advancedWordEditingCss.includes('width: max-content') && advancedWordEditingCss.includes('max-width: min(420px, 46vw)'), 'Temporary candidate category buttons should size themselves to the selected category name while staying viewport-safe');
  check(advancedWordEditingCss.includes('grid-template-columns: minmax(0, 1fr) max-content') && advancedWordEditingCss.includes('justify-self: start') && advancedWordEditingCss.includes('justify-self: end'), 'Temporary candidate copy and action groups should stay anchored to opposite row edges');
  check(advancedWordEditingCss.includes('.awe-temporary-candidate-row .lm-custom-select-option') && advancedWordEditingCss.includes('white-space: nowrap') && advancedWordEditingCss.includes('word-break: normal'), 'Temporary candidate category menus should keep every category label on one line while measuring the widest option');
  check(advancedWordEditingCss.includes('max-height: min(292px, 55vh)') && advancedWordEditingCss.includes('grid-auto-rows: minmax(52px, auto)'), 'Temporary candidate lists should show up to five complete rows before scrolling');
  check(wordEditing.includes('fitStandaloneTemporaryPanelToCandidates') && wordEditing.includes("panel.dataset.aweUserSized === 'true'") && wordEditing.includes('Math.min(panel.getBoundingClientRect().height, window.innerHeight - 20)'), 'standalone Temporary Names height should follow one-to-five entries until the user resizes it');
  check(wordEditing.includes('beginTemporaryPanelPointerAction') && wordEditing.includes('moveTemporaryPanelPointerAction') && wordEditing.includes('TEMPORARY_PANEL_GEOMETRY_KEY'), 'standalone Temporary Names should support persisted header dragging and vertical resizing');
  check(advancedWordEditingCss.includes('.awe-temporary-height-resize-handle') && advancedWordEditingCss.includes('cursor: ns-resize') && advancedWordEditingCss.includes('resize: none'), 'Temporary Names should expose a height-only resize handle without width resizing');
  check(wordEditing.includes('data-awe-temporary-drag-handle') && wordEditing.includes('data-awe-temporary-resize-handle') && !wordEditing.slice(wordEditing.indexOf('data-awe-dialog="temporary-candidates"'), wordEditing.indexOf('data-awe-dialog="categories"')).includes('data-awe-temporary-resize-handle'), 'drag and resize affordances should belong only to the standalone Temporary Names panel');
  check(wordEditing.includes('function standaloneTemporaryPanelContentHeight') && wordEditing.includes('panelHeight - visibleListHeight + list.scrollHeight'), 'Temporary Names should calculate the exact expanded height at which its candidate scrollbar disappears');
  check(wordEditing.includes('Math.min(viewportHeight, resize.contentHeight)') && wordEditing.includes('clampStandaloneTemporaryPanelHeight(panel)'), 'Temporary Names height resizing and saved geometry should stop at the full-content barrier');
  check(wordEditing.includes('function syncTemporaryPanelResizeAvailability') && wordEditing.includes('list.scrollHeight > list.clientHeight + 1') && wordEditing.includes("handle.setAttribute('aria-disabled', String(!canResize))"), 'Temporary Names height resizing should be available only while its candidate list actually overflows');
  check(advancedWordEditingCss.includes('.can-resize-height .awe-temporary-height-resize-handle') && advancedWordEditingCss.includes('pointer-events: none') && advancedWordEditingCss.includes('pointer-events: auto'), 'Temporary Names resize grip should become inert as soon as every candidate is visible');
  check(advancedWordEditingCss.includes('background: var(--lm-floating-panel-glass-bg, var(--surface-raised))') && advancedWordEditingCss.includes('border-color: var(--lm-border-cloud-panel-color, var(--border))') && advancedWordEditingCss.includes('backdrop-filter: var(--lm-floating-panel-backdrop-filter, blur(18px))'), 'standalone Temporary Names should reuse the Naming Entry panel glass surface tokens');
  check(advancedWordEditingCss.includes('[data-awe-dialog="temporary-candidates"] .awe-temporary-candidates-panel'), 'Advanced Settings Temporary Names should reuse the same Naming Entry glass surface as its standalone panel');
  check(advancedWordEditingCss.includes('.awe-category-action-dialog .lm-custom-select.is-open') && advancedWordEditingCss.includes('.awe-category-action-buttons') && advancedWordEditingCss.includes('z-index: 3'), 'category action custom menus should stack above Delete and the remaining dialog actions');
  check(deepScan.includes('const groupedEntries = new Map()') && deepScan.includes('entry.categoryId') && deepScan.includes('naming-search-category-group'), 'global name search should group matching names by their source category');
  check(deepScan.includes('priority.activeDocumentEntries.map') && deepScan.includes('priority.detectedEntries.map') && deepScan.includes('priority.existingEntries.map'), 'each searched category group should retain active, detected and existing name priority');
  check(sidePanelCss.includes('.naming-grouped-search-list') && sidePanelCss.includes('.naming-search-category-heading') && sidePanelCss.includes('.naming-search-category-entries'), 'grouped name-search results should visually separate category headings from their matching names');
  check(sidePanelCss.includes('.naming-sort-option-btn {') && sidePanelCss.includes('display: block;') && sidePanelCss.includes('text-overflow: ellipsis'), 'Naming sort options should use a block formatting context so their direct text can ellipsize');

  const renderingLoader = html.indexOf('00e-initial-rendering-store.js');
  const snapshotToolLoader = html.indexOf('00f-rendering-snapshot-tools.js');
  const sidebar = html.indexOf('00a-chapter-sidebar-data.js');
  const coordinator = html.indexOf('00b-workspace-section-loader.js');
  const editor = html.indexOf('01a-editor-foundation-history.js');
  check(renderingLoader > 0 && renderingLoader < snapshotToolLoader && snapshotToolLoader < sidebar && sidebar < coordinator && coordinator < editor, 'rendering and section loaders should run before editor initialization');
}

(async () => {
  await testSectionCoordinator();
  await testLegacyFactsMigration();
  await testFirstOpenMismatchRepairScope();
  await testInitialRenderingCache();
  testCategoryFullListSorting();
  testStorageAndActionContracts();
  console.log(`workspace-section-loading: ${assertions} assertions passed`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
