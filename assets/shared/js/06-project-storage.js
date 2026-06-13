let activeCustomSelectKey = null;
let customSelectCounter = 0;
let customSelectGlobalsBound = false;
let customSelectSyncRaf = null;
const customSelectObservers = new WeakMap();

function textToEditorHTML(value) {
  const normalizedText = String(value || '').replace(/\r\n?/g, '\n').trimEnd();
  if (!normalizedText.trim()) return '';

  return normalizedText
    .split(/((?:\n[ \t]*)+)/)
    .map(chunk => {
      if (!chunk) return '';
      if (/^(?:\n[ \t]*)+$/.test(chunk)) {
        const newlineCount = (chunk.match(/\n/g) || []).length;
        return Array.from({ length: Math.max(0, newlineCount - 1) }, () =>
          editorFileGapHTML()
        ).join('');
      }
      return `<p>${escapeHtml(chunk).replace(/\n/g, '<br>')}</p>`;
    })
    .join('');
}

function splitContinuousPasteText(value) {
  const cleanedText = String(value || '').replace(/\s+/g, ' ').trim();
  if (!cleanedText) return [];
  if (cleanedText.length <= 650) return [cleanedText];

  const sentences = cleanedText.match(/[^।.!?]+[।.!?]+["'”’]?|[^।.!?]+$/g)
    ?.map(sentence => sentence.trim())
    .filter(Boolean) || [cleanedText];
  const paragraphs = [];
  let currentParagraph = '';

  sentences.forEach(sentence => {
    const nextParagraph = currentParagraph ? `${currentParagraph} ${sentence}` : sentence;
    if (currentParagraph && nextParagraph.length > 560) {
      paragraphs.push(currentParagraph);
      currentParagraph = sentence;
    } else {
      currentParagraph = nextParagraph;
    }
  });

  if (currentParagraph) paragraphs.push(currentParagraph);
  return paragraphs;
}

function pasteTextEntry(textValue) {
  return {
    type: 'text',
    text: String(textValue || '').trim()
  };
}

function pasteGapEntry() {
  return { type: 'gap' };
}

function isPasteGapEntry(entry) {
  return entry?.type === 'gap';
}

function trimPasteBoundaryGaps(entries) {
  const safeEntries = Array.isArray(entries) ? [...entries] : [];
  while (safeEntries.length && isPasteGapEntry(safeEntries[0])) safeEntries.shift();
  while (safeEntries.length && isPasteGapEntry(safeEntries[safeEntries.length - 1])) safeEntries.pop();
  return safeEntries;
}

function pastedTextToParagraphs(value) {
  const normalizedText = String(value || '').replace(/\r\n?/g, '\n').trimEnd();
  if (!normalizedText.trim()) return [];
  if (normalizedText.includes('\n')) {
    const entries = normalizedText.split('\n').map(line => {
      const cleanLine = line.replace(/\u00a0/g, ' ').trim();
      return cleanLine ? pasteTextEntry(cleanLine) : pasteGapEntry();
    });
    return trimPasteBoundaryGaps(entries);
  }
  return splitContinuousPasteText(normalizedText).map(pasteTextEntry);
}

function pastedHtmlToParagraphs(html) {
  if (!html) return [];
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('script, style, meta, link').forEach(node => node.remove());
  const blockSelector = 'p, div, li, blockquote, h1, h2, h3, h4, h5, h6';
  const blocks = Array.from(template.content.querySelectorAll(blockSelector));
  const entries = blocks
    .filter(block => !block.querySelector(blockSelector))
    .map(block => {
      const textContent = (block.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      if (textContent) return pasteTextEntry(textContent);
      return pasteGapEntry();
    });
  return trimPasteBoundaryGaps(entries);
}

function paragraphsToEditorHTML(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map(entry => {
      if (isPasteGapEntry(entry)) return editorFileGapHTML();
      const paragraph = typeof entry === 'string' ? entry : entry?.text;
      if (!String(paragraph || '').trim()) return editorFileGapHTML();
      return `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`;
    })
    .join('');
}

function editorHTMLFromPaste(plainText, html) {
  const htmlParagraphs = pastedHtmlToParagraphs(html);
  const textParagraphs = pastedTextToParagraphs(plainText);
  const htmlHasGaps = htmlParagraphs.some(isPasteGapEntry);
  const textHasGaps = textParagraphs.some(isPasteGapEntry);
  const paragraphs = htmlParagraphs.length > 1 && (htmlHasGaps || !textHasGaps)
    ? htmlParagraphs
    : textParagraphs;
  return paragraphsToEditorHTML(paragraphs);
}

function normalizeProjectManifest(manifest = {}) {
  const topLevelChapters = Array.isArray(manifest.chapters) ? manifest.chapters : [];
  const rawParts = Array.isArray(manifest.parts) ? manifest.parts : [];
  const parts = rawParts.map(normalizePart);
  const updatedAt = manifest.updatedAt || manifest.updated_at || manifest.updated || '';
  const createdAt = manifest.createdAt || manifest.created_at || manifest.created || updatedAt || new Date().toISOString();

  return {
    title: manifest.title || projectDirectoryHandle?.name || 'Untitled Story',
    type: manifest.type || 'novel',
    author: manifest.author || '',
    language: ['en', 'hi'].includes(manifest.language) ? manifest.language : 'en',
    synopsis: manifest.synopsis || manifest.description || '',
    createdAt,
    updatedAt: updatedAt || createdAt,
    facts: normalizeStoryFacts(manifest.facts || manifest.storyFacts || []),
    chapters: topLevelChapters,
    parts
  };
}

function storyTypeLabel(type) {
  const safeType = String(type || '').trim().toLowerCase();
  if (safeType === 'story') return text().storyTypeStory;
  if (safeType === 'news') return text().storyTypeNews || 'News Article';
  return text().storyTypeNovel;
}

function isSupportedStoryProjectType(type) {
  return ['story', 'novel', 'news'].includes(String(type || '').trim().toLowerCase());
}

function storyLanguageLabel(language) {
  if (language === 'hi') return 'Hindi';
  return language === 'en' || !language ? 'English' : language;
}

const PROJECT_TYPE_FOLDER_BY_TYPE = {
  novel: 'Novels',
  story: 'Stories',
  news: 'News Articles'
};

const NEWS_PROJECT_DATA_FILE = 'NewsDesk_Articles.json';

function projectTypeFolderTitle(type) {
  return String(type || 'Project')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase()) || 'Project';
}

function pluralProjectTypeFolderTitle(title) {
  const safeTitle = String(title || 'Project').trim() || 'Project';
  if (/s$/i.test(safeTitle)) return safeTitle;
  if (/[^aeiou]y$/i.test(safeTitle)) return `${safeTitle.slice(0, -1)}ies`;
  return `${safeTitle}s`;
}

function projectTypeFolderName(type = 'novel') {
  const safeType = String(type || 'novel').trim().toLowerCase();
  return PROJECT_TYPE_FOLDER_BY_TYPE[safeType] || pluralProjectTypeFolderTitle(projectTypeFolderTitle(safeType));
}

function setActiveProjectTypeFolderName(typeFolderName = '') {
  activeProjectTypeFolderName = String(typeFolderName || '').trim();
  if (activeProjectTypeFolderName) {
    localStorage.setItem(PROJECT_TYPE_FOLDER_KEY, activeProjectTypeFolderName);
  } else {
    localStorage.removeItem(PROJECT_TYPE_FOLDER_KEY);
  }
}

function currentProjectTypeFolderName() {
  return activeProjectTypeFolderName || localStorage.getItem(PROJECT_TYPE_FOLDER_KEY) || '';
}

function projectWorkspacePath(folderName = '', typeFolderName = currentProjectTypeFolderName()) {
  const safeFolderName = String(folderName || '').trim();
  const safeTypeFolderName = String(typeFolderName || '').trim();
  if (!safeFolderName) return '';
  return safeTypeFolderName ? `${safeTypeFolderName}/${safeFolderName}` : safeFolderName;
}

async function workspaceProjectParentDirectory(typeFolderName = '', options = {}) {
  if (!workspaceDirectoryHandle) throw new Error(text().chooseWorkspaceFirst);
  const safeTypeFolderName = String(typeFolderName || '').trim();
  return safeTypeFolderName
    ? workspaceDirectoryHandle.getDirectoryHandle(safeTypeFolderName, { create: Boolean(options.create) })
    : workspaceDirectoryHandle;
}

async function workspaceProjectDirectoryHandle(folderName = '', typeFolderName = '', options = {}) {
  const parent = await workspaceProjectParentDirectory(typeFolderName, options);
  return parent.getDirectoryHandle(folderName, { create: Boolean(options.create) });
}

async function readProjectManifestFromDirectory(directoryHandle) {
  const manifestHandle = await directoryHandle.getFileHandle(PROJECT_MANIFEST_FILE);
  const manifest = JSON.parse(await readFileText(manifestHandle));
  return normalizeProjectManifest({
    ...manifest,
    title: manifest.title || directoryHandle.name || 'Untitled Story'
  });
}

function supportsLocalProjectFolders() {
  return 'showDirectoryPicker' in window && 'indexedDB' in window;
}

function openProjectDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PROJECT_DB_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(PROJECT_DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStoredDirectoryHandle(key = PROJECT_HANDLE_KEY) {
  const db = await openProjectDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECT_DB_STORE, 'readonly');
    const request = transaction.objectStore(PROJECT_DB_STORE).get(key);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function saveStoredDirectoryHandle(handle, key = PROJECT_HANDLE_KEY) {
  const db = await openProjectDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECT_DB_STORE, 'readwrite');
    transaction.objectStore(PROJECT_DB_STORE).put(handle, key);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function deleteStoredDirectoryHandle(key = PROJECT_HANDLE_KEY) {
  const db = await openProjectDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECT_DB_STORE, 'readwrite');
    transaction.objectStore(PROJECT_DB_STORE).delete(key);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function readProjectHandle() {
  return readStoredDirectoryHandle(PROJECT_HANDLE_KEY);
}

async function saveProjectHandle(handle) {
  return saveStoredDirectoryHandle(handle, PROJECT_HANDLE_KEY);
}

async function readWorkspaceHandle() {
  return readStoredDirectoryHandle(WORKSPACE_HANDLE_KEY);
}

async function saveWorkspaceHandle(handle) {
  return saveStoredDirectoryHandle(handle, WORKSPACE_HANDLE_KEY);
}

function activeEditorStateStorageKey(folderName = '', typeFolderName = currentProjectTypeFolderName()) {
  const folderKey = uniqueNameKey(projectWorkspacePath(folderName, typeFolderName));
  return folderKey ? `${ACTIVE_EDITOR_STATE_STORAGE_PREFIX}${folderKey}` : '';
}

function activeEditorStateSnapshot() {
  return {
    mode: isDraftActive() ? 'draft' : 'chapter',
    curChap,
    curDraft,
    savedAt: new Date().toISOString()
  };
}

function saveActiveEditorStateForStory(
  folderName = projectDirectoryHandle?.name || localStorage.getItem(PROJECT_FOLDER_KEY) || '',
  typeFolderName = currentProjectTypeFolderName()
) {
  const storageKey = activeEditorStateStorageKey(folderName, typeFolderName);
  if (!storageKey) return;
  localStorage.setItem(storageKey, JSON.stringify(activeEditorStateSnapshot()));
}

function readActiveEditorStateForStory(folderName = '', typeFolderName = currentProjectTypeFolderName()) {
  const storageKey = activeEditorStateStorageKey(folderName, typeFolderName);
  if (!storageKey) return null;
  try {
    const storedState = localStorage.getItem(storageKey);
    if (storedState) return JSON.parse(storedState);
    if (!typeFolderName) return null;
    const legacyStorageKey = activeEditorStateStorageKey(folderName, '');
    return JSON.parse(localStorage.getItem(legacyStorageKey) || 'null');
  } catch {
    return null;
  }
}

function migrateActiveEditorStateForStory(
  oldFolderName = '',
  newFolderName = '',
  oldTypeFolderName = currentProjectTypeFolderName(),
  newTypeFolderName = currentProjectTypeFolderName()
) {
  const oldKey = activeEditorStateStorageKey(oldFolderName, oldTypeFolderName);
  const newKey = activeEditorStateStorageKey(newFolderName, newTypeFolderName);
  if (!oldKey || !newKey || oldKey === newKey) return;
  const storedState = localStorage.getItem(oldKey);
  if (storedState) {
    localStorage.setItem(newKey, storedState);
    localStorage.removeItem(oldKey);
  }
}

function deleteActiveEditorStateForStory(folderName = '', typeFolderName = currentProjectTypeFolderName()) {
  const storageKey = activeEditorStateStorageKey(folderName, typeFolderName);
  if (storageKey) localStorage.removeItem(storageKey);
}

async function verifyProjectPermission(handle, requestPermission = false) {
  const options = { mode: 'readwrite' };
  if ((await handle.queryPermission(options)) === 'granted') return true;
  if (!requestPermission) return false;
  return (await handle.requestPermission(options)) === 'granted';
}

function splitProjectPath(path) {
  return String(path)
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
}

async function getProjectFileHandle(path, options = {}) {
  const parts = splitProjectPath(path);
  const fileName = parts.pop();
  let directory = projectDirectoryHandle;

  if (!directory || !fileName) throw new Error(`Invalid project file path: ${path}`);

  for (const part of parts) {
    directory = await directory.getDirectoryHandle(part, { create: Boolean(options.create) });
  }

  return directory.getFileHandle(fileName, { create: Boolean(options.create) });
}

async function getProjectDirectoryHandle(path, options = {}) {
  const parts = splitProjectPath(path);
  let directory = projectDirectoryHandle;
  if (!directory) throw new Error(`Invalid project directory path: ${path}`);

  for (const part of parts) {
    directory = await directory.getDirectoryHandle(part, { create: Boolean(options.create) });
  }

  return directory;
}

async function readFileText(fileHandle) {
  return (await fileHandle.getFile()).text();
}

async function writeFileText(fileHandle, value) {
  const writable = await fileHandle.createWritable();
  await writable.write(value);
  await writable.close();
}

async function removeProjectFileIfExists(path) {
  if (!projectDirectoryHandle || !path) return;

  try {
    const parts = splitProjectPath(path);
    const fileName = parts.pop();
    let directory = projectDirectoryHandle;
    if (!fileName) return;

    for (const part of parts) {
      directory = await directory.getDirectoryHandle(part);
    }
    await directory.removeEntry(fileName);
  } catch (error) {
    if (error.name !== 'NotFoundError') {
      console.warn('Project file delete failed:', path, error);
    }
  }
}

function removedChapterEditDraftsFilePath() {
  return ['Story', 'Chapter', 'Edit', 'Drafts'].join('_') + '.json';
}

async function removeRemovedChapterEditDraftsFile() {
  await removeProjectFileIfExists(removedChapterEditDraftsFilePath());
}

function createProjectManifest(folderName = 'Untitled Story') {
  const createdAt = new Date().toISOString();
  return {
    title: folderName,
    type: 'novel',
    author: '',
    language: 'en',
    synopsis: '',
    createdAt,
    updatedAt: createdAt,
    facts: [],
    chapters: [],
    parts: []
  };
}

function chapterManifestEntry(chapter, index, chapterNo = index + 1) {
  return {
    no: chapterNo,
    title: chapter.title,
    contentHTML: chapter.content || '',
    createdAt: chapter.createdAt || new Date().toISOString(),
    content_path: chapter.contentPath || chapterFilePath(index),
    alignment: normalizeEditorAlignment(chapter.alignment),
    lineHeight: normalizeOptionalEditorLineHeight(chapter.lineHeight),
    paragraphGap: normalizeOptionalEditorParagraphGap(chapter.paragraphGap),
    paragraphMargin: normalizeOptionalEditorParagraphMargin(chapter.paragraphMargin),
    fontFamily: normalizeEditorFontFamily(chapter.fontFamily),
    fontSize: normalizeEditorFontSize(chapter.fontSize),
    editorSettings: normalizeEditorSettings(chapter.editorSettings)
  };
}

function chaptersToManifest() {
  const baseManifest = normalizeProjectManifest(projectManifest || {});
  const hasParts = baseManifest.parts.length > 0;
  const baseDetails = {
    title: baseManifest.title || projectDirectoryHandle?.name || 'Untitled Story',
    type: baseManifest.type || 'novel',
    author: baseManifest.author || '',
    language: ['en', 'hi'].includes(baseManifest.language) ? baseManifest.language : 'en',
    synopsis: baseManifest.synopsis || '',
    createdAt: baseManifest.createdAt,
    updatedAt: baseManifest.updatedAt || baseManifest.createdAt,
    facts: normalizeStoryFacts(storyFacts)
  };

  if (!hasParts) {
    return {
      ...baseDetails,
      chapters: chapters.map((chapter, index) => chapterManifestEntry(chapter, index, index + 1)),
      parts: []
    };
  }

  const parts = baseManifest.parts.map((part, index) => ({
    no: part.no || index + 1,
    title: part.title || defaultPartTitle(index),
    synopsis: part.synopsis || '',
    createdAt: part.createdAt || new Date().toISOString(),
    chapters: []
  }));
  const topLevelChapters = [];

  chapters.forEach((chapter, index) => {
    const partIndex = Number.isInteger(chapter.partIndex) ? chapter.partIndex : -1;
    if (partIndex < 0 || partIndex >= parts.length) {
      topLevelChapters.push(chapterManifestEntry(chapter, index, topLevelChapters.length + 1));
      return;
    }

    parts[partIndex].chapters.push(chapterManifestEntry(chapter, index, parts[partIndex].chapters.length + 1));
  });

  return {
    ...baseDetails,
    chapters: topLevelChapters,
    parts
  };
}

async function readProjectManifest() {
  try {
    const manifestHandle = await getProjectFileHandle(PROJECT_MANIFEST_FILE);
    return normalizeProjectManifest(JSON.parse(await readFileText(manifestHandle)));
  } catch (error) {
    if (error.name !== 'NotFoundError') {
      console.warn('Project manifest read failed:', error);
    }
    return null;
  }
}

async function writeProjectManifest(manifest = chaptersToManifest(), options = {}) {
  if (!projectDirectoryHandle) return;
  const createdAt = manifest.createdAt || projectManifest?.createdAt || new Date().toISOString();
  const updatedAt = options.touchUpdated === false
    ? manifest.updatedAt || projectManifest?.updatedAt || createdAt
    : new Date().toISOString();
  projectManifest = normalizeProjectManifest({
    ...manifest,
    createdAt,
    updatedAt
  });
  storyFacts = normalizeStoryFacts(projectManifest.facts);
  const manifestHandle = await getProjectFileHandle(PROJECT_MANIFEST_FILE, { create: true });
  await writeFileText(manifestHandle, JSON.stringify(projectManifest, null, 2));
  localStorage.setItem(PROJECT_MANIFEST_KEY, JSON.stringify(projectManifest));
}

function isNewsProjectType(type) {
  return String(type || '').trim().toLowerCase() === 'news';
}

function defaultNewsProjectChecklist() {
  return {
    headline: false,
    subhead: false,
    sources: false,
    factcheck: false,
    media: false,
    seo: false,
    editor: false,
    legal: false
  };
}

function createDefaultNewsProjectArticle(manifest = {}) {
  const createdAt = manifest.createdAt || new Date().toISOString();
  const id = `news-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    headline: '',
    subhead: '',
    bodyHTML: '',
    sections: [],
    author: manifest.author || 'New reporter',
    beat: 'General',
    status: 'draft',
    section: 'General',
    pubTime: '',
    tags: [],
    sources: [],
    checklist: defaultNewsProjectChecklist(),
    notes: manifest.synopsis || '',
    createdAt,
    updatedAt: createdAt
  };
}

function createNewsDeskProjectState(manifest = {}) {
  const article = createDefaultNewsProjectArticle(manifest);
  return {
    version: 1,
    projectType: 'newsdesk',
    projectTitle: manifest.title || '',
    savedAt: new Date().toISOString(),
    wordTarget: 800,
    currentArticleId: article.id,
    articles: [article]
  };
}

async function writeNewsDeskProjectDataToDirectory(directoryHandle, state) {
  const dataHandle = await directoryHandle.getFileHandle(NEWS_PROJECT_DATA_FILE, { create: true });
  await writeFileText(dataHandle, JSON.stringify(state, null, 2));
}

async function activateNewsProjectHandle(newsHandle, typeFolderName, manifest) {
  projectDirectoryHandle = newsHandle;
  setActiveProjectTypeFolderName(typeFolderName);
  projectManifest = normalizeProjectManifest(manifest);
  await saveProjectHandle(newsHandle);
  localStorage.setItem(PROJECT_MODE_KEY, 'local');
  localStorage.setItem(PROJECT_FOLDER_KEY, newsHandle.name || '');
  localStorage.setItem(PROJECT_MANIFEST_KEY, JSON.stringify(projectManifest));
}

async function createNewsProjectFromInfoForm(storyTitle, typeFolderName) {
  const newsHandle = await createUniqueStoryDirectory(storyTitle, 'news');
  const createdAt = new Date().toISOString();
  const manifest = normalizeProjectManifest({
    ...createProjectManifest(storyTitle),
    type: 'news',
    author: document.getElementById('storyAuthorInp')?.value.trim() || '',
    language: document.getElementById('storyLanguageInp')?.value === 'hi' ? 'hi' : 'en',
    synopsis: document.getElementById('storySynopsisInp')?.value.trim() || '',
    createdAt,
    updatedAt: createdAt
  });
  const newsState = createNewsDeskProjectState(manifest);
  const manifestHandle = await newsHandle.getFileHandle(PROJECT_MANIFEST_FILE, { create: true });
  await writeFileText(manifestHandle, JSON.stringify(manifest, null, 2));
  await writeNewsDeskProjectDataToDirectory(newsHandle, newsState);
  await activateNewsProjectHandle(newsHandle, typeFolderName, manifest);
  const newsLocalKey = uniqueNameKey(projectWorkspacePath(newsHandle.name || '', typeFolderName));
  if (newsLocalKey) localStorage.setItem(`lm_newsdesk_state_v1:${newsLocalKey}`, JSON.stringify(newsState));
  localStorage.setItem(WORKSPACE_FOLDER_KEY, workspaceDirectoryHandle?.name || '');
  closeStoryInfoModal();
  hideProjectGate();
  if (typeof closeHomeRecentProjectsPanel === 'function') closeHomeRecentProjectsPanel();
  setHomeMenuStatus('');
  if (typeof saveToStorage === 'function') saveToStorage(false);
  navigateToNewsWorkspacePage();
}

async function readNamingDataFromProject() {
  if (!projectDirectoryHandle) return;
  try {
    const namingHandle = await getProjectFileHandle(PROJECT_NAMING_FILE);
    namingData = normalizeNamingData(JSON.parse(await readFileText(namingHandle)));
  } catch (error) {
    namingData = normalizeNamingData(namingData);
    await writeNamingDataToProject();
  }
  const documentLinksChanged = validateNamingEntryDocumentLinksOnProjectOpen();
  const draftMentionsChanged = validateNamingEntryDraftMentionsOnProjectOpen();
  if (documentLinksChanged || draftMentionsChanged) {
    await writeNamingDataToProject();
    return;
  }
  localStorage.setItem(NAMING_STORAGE_KEY, JSON.stringify(namingData));
}

async function writeNamingDataToProject() {
  if (!projectDirectoryHandle) return;
  namingData = normalizeNamingData(namingData);
  const namingHandle = await getProjectFileHandle(PROJECT_NAMING_FILE, { create: true });
  await writeFileText(namingHandle, JSON.stringify(namingData, null, 2));
  localStorage.setItem(NAMING_STORAGE_KEY, JSON.stringify(namingData));
}

function normalizeNamingDocumentPath(path = '') {
  return String(path || '').replace(/\\/g, '/').trim();
}

function normalizeNamingDocumentTitle(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function namingDocumentPaths(paths = []) {
  return [...new Set(paths.map(normalizeNamingDocumentPath).filter(Boolean))];
}

function namingLiveDocumentRefs(status = 'chapter') {
  if (status === 'draft') {
    return chapterDrafts.map((draft, index) => {
      const title = draft.title || `${text().draftPrefix} ${index + 1}`;
      return {
        status: 'draft',
        index,
        no: draft.draftNo || index + 1,
        title,
        titleKey: normalizeNamingDocumentTitle(title),
        paths: namingDocumentPaths([draft.contentPath, draftFilePath(index)])
      };
    });
  }

  return chapters.map((chapter, index) => {
    const title = chapterDisplayTitle(chapter, index);
    return {
      status: 'chapter',
      index,
      no: chapter.chapterNo || index + 1,
      title,
      titleKey: normalizeNamingDocumentTitle(title),
      paths: namingDocumentPaths([chapter.contentPath, chapterFilePath(index)])
    };
  });
}

function namingEntryDocumentPaths(entry = {}, status = normalizeNamingEntryStatus(entry)) {
  return namingDocumentPaths(status === 'draft'
    ? [entry.draftKey, entry.contentPath, entry.chapterKey]
    : [entry.chapterKey, entry.contentPath]);
}

function namingEntryDocumentTitle(entry = {}, status = normalizeNamingEntryStatus(entry)) {
  return status === 'draft'
    ? entry.draftTitle || entry.chapterTitle || ''
    : entry.chapterTitle || '';
}

function namingEntryDocumentExists(entry = {}) {
  const status = normalizeNamingEntryStatus(entry);
  if (status !== 'draft' && status !== 'chapter') return true;

  const documentRefs = namingLiveDocumentRefs(status);
  if (!documentRefs.length) return false;

  const entryPaths = new Set(namingEntryDocumentPaths(entry, status));
  const titleKey = normalizeNamingDocumentTitle(namingEntryDocumentTitle(entry, status));
  const entryIndex = status === 'draft' ? entry.draftIndex : entry.chapterIndex;
  const entryNo = status === 'draft' ? entry.draftNo : entry.chapterNo;

  return documentRefs.some(documentRef => {
    const pathMatches = entryPaths.size > 0 && documentRef.paths.some(path => entryPaths.has(path));
    const titleMatches = Boolean(titleKey && documentRef.titleKey === titleKey);
    const indexMatches = Number.isInteger(entryIndex) && entryIndex === documentRef.index;
    const numberMatches = entryNo !== null && entryNo !== undefined && Number(entryNo) === Number(documentRef.no);
    return pathMatches || titleMatches || (indexMatches && numberMatches);
  });
}

function namingEntryDocumentMetaSnapshot(entry = {}, missingAt = new Date().toISOString()) {
  const status = normalizeNamingEntryStatus(entry);
  return {
    chapterStatus: status,
    documentType: entry.documentType || status,
    chapterKey: entry.chapterKey || '',
    chapterIndex: Number.isInteger(entry.chapterIndex) ? entry.chapterIndex : null,
    chapterNo: entry.chapterNo ?? null,
    chapterTitle: entry.chapterTitle || '',
    draftKey: entry.draftKey || null,
    draftIndex: Number.isInteger(entry.draftIndex) ? entry.draftIndex : null,
    draftNo: entry.draftNo ?? null,
    draftTitle: entry.draftTitle || '',
    contentPath: entry.contentPath || '',
    missingAt
  };
}

function setNamingEntryDocumentUndefined(entry = {}, missingAt = new Date().toISOString()) {
  const missingDocumentMeta = entry.missingDocumentMeta || namingEntryDocumentMetaSnapshot(entry, missingAt);
  const previousDescriptionMeta = entry.descriptionMeta && typeof entry.descriptionMeta === 'object'
    ? entry.descriptionMeta
    : {};
  const undefinedMeta = {
    ...undefinedDescriptionChapterMeta(missingAt),
    missingDocumentAt: entry.missingDocumentAt || missingAt,
    missingDocumentMeta,
    sourceState: 'missing-document'
  };

  entry.chapterStatus = 'undefined';
  entry.documentType = 'undefined';
  entry.chapterKey = '';
  entry.chapterIndex = null;
  entry.chapterNo = null;
  entry.chapterTitle = '';
  entry.draftKey = null;
  entry.draftIndex = null;
  entry.draftNo = null;
  entry.draftTitle = '';
  entry.contentPath = '';
  entry.missingDocumentAt = undefinedMeta.missingDocumentAt;
  entry.missingDocumentMeta = missingDocumentMeta;
  entry.sourceState = 'missing-document';
  entry.descriptionMeta = {
    ...previousDescriptionMeta,
    ...undefinedMeta
  };
}

function namingMentionValidationText(value = '') {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function namingDecodeHtmlText(value = '') {
  const safeValue = String(value || '');
  if (!safeValue) return '';
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const probe = document.createElement('textarea');
    probe.innerHTML = safeValue;
    return probe.value;
  }
  return safeValue
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function namingEditorHtmlToPlainText(value = '') {
  const safeValue = String(value || '');
  if (!safeValue) return '';
  if (!/<[a-z][\s\S]*>/i.test(safeValue)) return namingMentionValidationText(safeValue);

  const separatedHtml = safeValue
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|section|article)>/gi, '\n');

  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const probe = document.createElement('div');
    probe.innerHTML = separatedHtml;
    return namingMentionValidationText(probe.textContent || '');
  }

  return namingMentionValidationText(
    namingDecodeHtmlText(separatedHtml.replace(/<[^>]+>/g, ' '))
  );
}

function namingDraftTextForMentionValidation(draft = {}, textOverride = null) {
  if (typeof textOverride === 'string') return namingMentionValidationText(textOverride);
  return namingEditorHtmlToPlainText(draft.content || draft.contentHTML || '');
}

function namingChapterTextForMentionValidation(chapter = {}, textOverride = null) {
  if (typeof textOverride === 'string') return namingMentionValidationText(textOverride);
  return namingEditorHtmlToPlainText(chapter.content || chapter.contentHTML || '');
}

function namingEntryNameFoundInText(entry = {}, textValue = '') {
  const name = String(entry.name || '').trim();
  if (!name) return true;
  const documentText = namingMentionValidationText(textValue);
  if (!documentText) return false;

  if (typeof countEditorFindMatches === 'function') {
    try {
      return countEditorFindMatches(documentText, name, 'deep') > 0;
    } catch (error) {
      console.warn('Naming entry mention scan failed:', error);
    }
  }

  return documentText.toLocaleLowerCase().includes(name.toLocaleLowerCase());
}

function namingLiveStoryTextsForMentionValidation(options = {}) {
  const textValues = [];

  chapters.forEach((chapter, index) => {
    const textOverride = options.activeChapterIndex === index ? options.activeText : null;
    textValues.push(namingChapterTextForMentionValidation(chapter, textOverride));
  });

  chapterDrafts.forEach((draft, index) => {
    const textOverride = options.activeDraftIndex === index ? options.activeText : null;
    textValues.push(namingDraftTextForMentionValidation(draft, textOverride));
  });

  Object.values(chapterEditDrafts || {}).forEach(draft => {
    if (!draft) return;
    textValues.push(namingEditorHtmlToPlainText(draft.content || draft.contentHTML || ''));
  });

  return textValues.filter(Boolean);
}

function namingEntryNameFoundInAnyStoryDocument(entry = {}, options = {}) {
  return namingLiveStoryTextsForMentionValidation(options)
    .some(textValue => namingEntryNameFoundInText(entry, textValue));
}

function namingEntryMatchesDraftDocument(entry = {}, draft = {}, draftIndex = -1) {
  if (normalizeNamingEntryStatus(entry) !== 'draft' || !draft) return false;
  const draftPrefix = typeof text === 'function' ? text().draftPrefix : 'Draft';
  const draftTitle = draft.title || `${draftPrefix} ${draftIndex + 1}`;
  const documentPaths = new Set(namingDocumentPaths([draft.contentPath, draftFilePath(draftIndex)]));
  const entryPaths = new Set(namingEntryDocumentPaths(entry, 'draft'));
  const pathMatches = [...entryPaths].some(path => documentPaths.has(path));
  const titleMatches = Boolean(
    normalizeNamingDocumentTitle(namingEntryDocumentTitle(entry, 'draft')) &&
    normalizeNamingDocumentTitle(namingEntryDocumentTitle(entry, 'draft')) === normalizeNamingDocumentTitle(draftTitle)
  );
  const indexMatches = Number.isInteger(entry.draftIndex) && entry.draftIndex === draftIndex;
  const numberMatches = entry.draftNo !== null &&
    entry.draftNo !== undefined &&
    Number(entry.draftNo) === Number(draft.draftNo || draftIndex + 1);
  return pathMatches || titleMatches || (indexMatches && numberMatches);
}

function namingEntryNameMentionMetaSnapshot(entry = {}, draft = {}, draftIndex = -1, checkedAt = new Date().toISOString()) {
  const draftPrefix = typeof text === 'function' ? text().draftPrefix : 'Draft';
  return {
    ...namingEntryDocumentMetaSnapshot(entry, checkedAt),
    checkedDraftIndex: draftIndex,
    checkedDraftNo: draft.draftNo || draftIndex + 1,
    checkedDraftTitle: draft.title || `${draftPrefix} ${draftIndex + 1}`,
    checkedContentPath: draft.contentPath || draftFilePath(draftIndex),
    missingNameMentionAt: checkedAt
  };
}

function namingEntryStoryMentionMetaSnapshot(entry = {}, checkedAt = new Date().toISOString()) {
  return {
    ...namingEntryDocumentMetaSnapshot(entry, checkedAt),
    checkedScope: 'story',
    missingNameMentionAt: checkedAt
  };
}

function setNamingEntryNameMentionUndefined(entry = {}, draft = {}, draftIndex = -1, checkedAt = new Date().toISOString()) {
  const missingNameMentionMeta = entry.missingNameMentionMeta ||
    namingEntryNameMentionMetaSnapshot(entry, draft, draftIndex, checkedAt);
  const previousDescriptionMeta = entry.descriptionMeta && typeof entry.descriptionMeta === 'object'
    ? entry.descriptionMeta
    : {};
  const undefinedMeta = {
    ...undefinedDescriptionChapterMeta(checkedAt),
    missingNameMentionAt: entry.missingNameMentionAt || checkedAt,
    missingNameMentionMeta,
    sourceState: 'missing-name-mention'
  };

  entry.chapterStatus = 'undefined';
  entry.documentType = 'undefined';
  entry.chapterKey = '';
  entry.chapterIndex = null;
  entry.chapterNo = null;
  entry.chapterTitle = '';
  entry.draftKey = null;
  entry.draftIndex = null;
  entry.draftNo = null;
  entry.draftTitle = '';
  entry.contentPath = '';
  entry.missingNameMentionAt = undefinedMeta.missingNameMentionAt;
  entry.missingNameMentionMeta = missingNameMentionMeta;
  entry.sourceState = 'missing-name-mention';
  entry.descriptionMeta = {
    ...previousDescriptionMeta,
    ...undefinedMeta
  };
}

function setNamingEntryStoryMentionUndefined(entry = {}, checkedAt = new Date().toISOString()) {
  const missingNameMentionMeta = entry.missingNameMentionMeta ||
    namingEntryStoryMentionMetaSnapshot(entry, checkedAt);
  const previousDescriptionMeta = entry.descriptionMeta && typeof entry.descriptionMeta === 'object'
    ? entry.descriptionMeta
    : {};
  const undefinedMeta = {
    ...undefinedDescriptionChapterMeta(checkedAt),
    missingNameMentionAt: entry.missingNameMentionAt || checkedAt,
    missingNameMentionMeta,
    sourceState: 'missing-name-mention'
  };

  entry.chapterStatus = 'undefined';
  entry.documentType = 'undefined';
  entry.chapterKey = '';
  entry.chapterIndex = null;
  entry.chapterNo = null;
  entry.chapterTitle = '';
  entry.draftKey = null;
  entry.draftIndex = null;
  entry.draftNo = null;
  entry.draftTitle = '';
  entry.contentPath = '';
  entry.missingNameMentionAt = undefinedMeta.missingNameMentionAt;
  entry.missingNameMentionMeta = missingNameMentionMeta;
  entry.sourceState = 'missing-name-mention';
  entry.descriptionMeta = {
    ...previousDescriptionMeta,
    ...undefinedMeta
  };
}

function validateNamingEntryMentionsForDraft(draftIndex = curDraft, options = {}) {
  if (!Number.isInteger(draftIndex) || draftIndex < 0 || draftIndex >= chapterDrafts.length) return false;
  const draft = chapterDrafts[draftIndex];
  if (!draft) return false;

  namingData = normalizeNamingData(namingData);
  const draftText = namingDraftTextForMentionValidation(draft, options.text);
  const checkedAt = options.checkedAt || new Date().toISOString();
  let didChange = false;

  namingData.entries.forEach(entry => {
    if (!namingEntryMatchesDraftDocument(entry, draft, draftIndex)) return;
    if (namingEntryNameFoundInText(entry, draftText)) return;
    setNamingEntryNameMentionUndefined(entry, draft, draftIndex, checkedAt);
    didChange = true;
  });

  if (didChange) namingData = normalizeNamingData(namingData);
  return didChange;
}

function validateNamingEntriesWithoutStoryMentions(options = {}) {
  namingData = normalizeNamingData(namingData);
  const checkedAt = options.checkedAt || new Date().toISOString();
  let didChange = false;

  namingData.entries.forEach(entry => {
    const status = normalizeNamingEntryStatus(entry);
    if (status !== 'draft' && status !== 'chapter') return;
    if (namingEntryNameFoundInAnyStoryDocument(entry, options)) return;
    setNamingEntryStoryMentionUndefined(entry, checkedAt);
    didChange = true;
  });

  if (didChange) namingData = normalizeNamingData(namingData);
  return didChange;
}

function validateNamingEntryDraftMentionsOnProjectOpen() {
  let didChange = false;
  chapterDrafts.forEach((draft, index) => {
    if (validateNamingEntryMentionsForDraft(index)) didChange = true;
  });
  if (validateNamingEntriesWithoutStoryMentions()) didChange = true;
  return didChange;
}

function validateNamingEntryDocumentLinksOnProjectOpen() {
  namingData = normalizeNamingData(namingData);
  const missingAt = new Date().toISOString();
  let didChange = false;

  namingData.entries.forEach(entry => {
    const status = normalizeNamingEntryStatus(entry);
    if (status !== 'draft' && status !== 'chapter') return;
    if (namingEntryDocumentExists(entry)) return;
    setNamingEntryDocumentUndefined(entry, missingAt);
    didChange = true;
  });

  if (didChange) namingData = normalizeNamingData(namingData);
  return didChange;
}

async function readDraftsDataFromProject() {
  if (!projectDirectoryHandle) return;
  try {
    const draftsHandle = await getProjectFileHandle(PROJECT_DRAFTS_FILE);
    const draftData = JSON.parse(await readFileText(draftsHandle));
    chapterDrafts = normalizeDrafts(Array.isArray(draftData) ? draftData : draftData.drafts);
  } catch (error) {
    chapterDrafts = normalizeDrafts(chapterDrafts);
    await writeDraftsDataToProject();
  }
  localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(draftsForStorage(false)));
}

async function writeDraftsDataToProject() {
  if (!projectDirectoryHandle) return;
  chapterDrafts = normalizeDrafts(chapterDrafts);
  const draftsHandle = await getProjectFileHandle(PROJECT_DRAFTS_FILE, { create: true });
  await writeFileText(draftsHandle, JSON.stringify({ drafts: draftsForStorage(false) }, null, 2));
  localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(draftsForStorage(false)));
}

async function readTrashDraftsDataFromProject() {
  if (!projectDirectoryHandle) return;
  try {
    const trashHandle = await getProjectFileHandle(PROJECT_TRASH_DRAFTS_FILE);
    const trashData = JSON.parse(await readFileText(trashHandle));
    chapterTrashDrafts = normalizeTrashDrafts(Array.isArray(trashData) ? trashData : trashData.drafts);
  } catch (error) {
    if (error.name !== 'NotFoundError') {
      console.warn('Trash drafts read failed:', error);
    }
    chapterTrashDrafts = normalizeTrashDrafts(chapterTrashDrafts);
    if (chapterTrashDrafts.length) await writeTrashDraftsDataToProject();
  }
  localStorage.setItem(TRASH_DRAFTS_STORAGE_KEY, JSON.stringify(trashDraftsForStorage(false)));
}

async function writeTrashDraftsDataToProject() {
  chapterTrashDrafts = normalizeTrashDrafts(chapterTrashDrafts);
  localStorage.setItem(TRASH_DRAFTS_STORAGE_KEY, JSON.stringify(trashDraftsForStorage(false)));
  if (!projectDirectoryHandle) return;
  await getProjectDirectoryHandle(PROJECT_TRASH_DIR, { create: true });
  const trashHandle = await getProjectFileHandle(PROJECT_TRASH_DRAFTS_FILE, { create: true });
  await writeFileText(trashHandle, JSON.stringify({ drafts: trashDraftsForStorage(false) }, null, 2));
}

async function readChapterEditDraftsFromProject() {
  if (!projectDirectoryHandle) return;
  await removeRemovedChapterEditDraftsFile();
  try {
    const draftsHandle = await getProjectFileHandle(PROJECT_CHAPTER_EDIT_DRAFTS_FILE);
    const draftData = JSON.parse(await readFileText(draftsHandle));
    chapterEditDrafts = normalizeChapterEditDrafts(draftData?.drafts || draftData);
  } catch (error) {
    chapterEditDrafts = normalizeChapterEditDrafts(chapterEditDrafts);
  }
  localStorage.setItem(CHAPTER_EDIT_DRAFTS_STORAGE_KEY, JSON.stringify(chapterEditDrafts));
}

async function writeChapterEditDraftsToProject() {
  chapterEditDrafts = normalizeChapterEditDrafts(chapterEditDrafts);
  localStorage.setItem(CHAPTER_EDIT_DRAFTS_STORAGE_KEY, JSON.stringify(chapterEditDrafts));
  if (!projectDirectoryHandle) return;
  await removeRemovedChapterEditDraftsFile();
  const storedDrafts = chapterEditDraftsForStorage(false);
  if (!storedDrafts.length) {
    await removeProjectFileIfExists(PROJECT_CHAPTER_EDIT_DRAFTS_FILE);
    return;
  }
  const draftsHandle = await getProjectFileHandle(PROJECT_CHAPTER_EDIT_DRAFTS_FILE, { create: true });
  await writeFileText(draftsHandle, JSON.stringify({ drafts: storedDrafts }, null, 2));
}

function persistChapterEditDrafts() {
  chapterEditDrafts = normalizeChapterEditDrafts(chapterEditDrafts);
  localStorage.setItem(CHAPTER_EDIT_DRAFTS_STORAGE_KEY, JSON.stringify(chapterEditDrafts));
  if (projectDirectoryHandle) {
    writeChapterEditDraftsToProject().catch(error => console.warn('Chapter edit draft save failed:', error));
  }
}

function saveNamingData() {
  namingData = normalizeNamingData(namingData);
  localStorage.setItem(NAMING_STORAGE_KEY, JSON.stringify(namingData));
  if (projectDirectoryHandle) {
    writeNamingDataToProject().catch(error => console.warn('Naming data save failed:', error));
  }
}

async function loadLocalProject(handle, shouldStoreHandle = true, options = {}) {
  const nextTypeFolderName = options.typeFolderName ?? currentProjectTypeFolderName();
  if (
    projectDirectoryHandle &&
    hasActiveStory() &&
    (
      projectDirectoryHandle.name !== handle.name ||
      currentProjectTypeFolderName() !== (nextTypeFolderName || '')
    )
  ) {
    saveActiveEditorStateForStory(projectDirectoryHandle.name || '', currentProjectTypeFolderName());
  }
  const savedEditorTarget = readActiveEditorStateForStory(handle.name || '', nextTypeFolderName);
  const shouldRestoreSavedTarget = Boolean(savedEditorTarget) ||
    (
      localStorage.getItem(PROJECT_FOLDER_KEY) === (handle.name || '') &&
      (localStorage.getItem(PROJECT_TYPE_FOLDER_KEY) || '') === (nextTypeFolderName || '')
    );
  projectDirectoryHandle = handle;
  setActiveProjectTypeFolderName(nextTypeFolderName);
  isDraftTrashMode = false;
  curTrashDraft = -1;
  trashReturnEditorState = null;
  selectedTrashDraftIndexes.clear();
  lastSelectedTrashDraftIndex = null;
  projectManifest = await readProjectManifest();
  if (!projectManifest) {
    projectDirectoryHandle = null;
    setActiveProjectTypeFolderName('');
    return false;
  }
  chapters = chaptersFromManifest(projectManifest);
  storyFacts = normalizeStoryFacts(projectManifest.facts);
  await Promise.all(chapters.map(loadChapterContent));
  await readDraftsDataFromProject();
  await Promise.all(chapterDrafts.map(loadDraftContent));
  await readTrashDraftsDataFromProject();
  await Promise.all(chapterTrashDrafts.map(loadDraftContent));
  await readChapterEditDraftsFromProject();
  await Promise.all(Object.values(chapterEditDrafts).map(loadChapterEditDraftContent));
  await readNamingDataFromProject();
  if (savedEditorTarget) {
    restoreSavedActiveEditorTarget(savedEditorTarget);
  } else if (shouldRestoreSavedTarget) {
    restoreSavedActiveEditorTarget();
  } else {
    curChap = chapters.length ? 0 : 0;
    curDraft = chapterDrafts.length ? 0 : -1;
    activeEditorMode = chapters.length ? 'chapter' : chapterDrafts.length ? 'draft' : 'chapter';
    activeChapterEditKey = null;
    isChapterEditUnlocked = false;
    syncSidebarWithRestoredEditorTarget();
  }
  ensureChapters();

  if (shouldStoreHandle) await saveProjectHandle(handle);
  localStorage.setItem(PROJECT_MODE_KEY, 'local');
  localStorage.setItem(PROJECT_FOLDER_KEY, handle.name || '');
  setActiveProjectTypeFolderName(nextTypeFolderName);
  localStorage.setItem(PROJECT_MANIFEST_KEY, JSON.stringify(projectManifest));
  hasStoredChapters = false;
  return true;
}

async function restoreProjectFromWorkspaceFolder() {
  const folderName = localStorage.getItem(PROJECT_FOLDER_KEY);
  const typeFolderName = localStorage.getItem(PROJECT_TYPE_FOLDER_KEY) || '';
  if (!workspaceDirectoryHandle || !folderName) return false;

  try {
    const handle = await workspaceProjectDirectoryHandle(folderName, typeFolderName);
    return loadLocalProject(handle, true, { typeFolderName });
  } catch (error) {
    if (error.name !== 'NotFoundError') {
      console.warn('Saved story folder restore from workspace failed:', error);
    }
  }

  if (typeFolderName) {
    try {
      const legacyHandle = await workspaceProjectDirectoryHandle(folderName, '');
      return loadLocalProject(legacyHandle, true, { typeFolderName: '' });
    } catch (error) {
      if (error.name !== 'NotFoundError') {
        console.warn('Saved legacy story folder restore failed:', error);
      }
    }
  }

  try {
    const resolvedStory = await resolveWorkspaceStoryHandle(folderName);
    const handle = resolvedStory?.handle || resolvedStory;
    return loadLocalProject(handle, true, { typeFolderName: resolvedStory?.typeFolderName || '' });
  } catch (error) {
    if (error.name !== 'NotFoundError') {
      console.warn('Saved story folder scan restore failed:', error);
    }
  }

  return false;
}

async function restoreLocalProject() {
  if (!supportsLocalProjectFolders()) return false;

  const workspaceHandle = await readWorkspaceHandle();
  if (workspaceHandle && await verifyProjectPermission(workspaceHandle)) {
    workspaceDirectoryHandle = workspaceHandle;
    localStorage.setItem(WORKSPACE_FOLDER_KEY, workspaceHandle.name || '');
  }

  const handle = await readProjectHandle();
  if (!handle) return restoreProjectFromWorkspaceFolder();

  projectDirectoryHandle = handle;
  localStorage.setItem(PROJECT_FOLDER_KEY, handle.name || '');
  activeProjectTypeFolderName = localStorage.getItem(PROJECT_TYPE_FOLDER_KEY) || '';

  if (!(await verifyProjectPermission(handle))) {
    projectDirectoryHandle = null;
    return restoreProjectFromWorkspaceFolder();
  }

  const loaded = await loadLocalProject(handle, false, { typeFolderName: activeProjectTypeFolderName });
  if (!loaded) {
    await deleteStoredDirectoryHandle(PROJECT_HANDLE_KEY);
    return restoreProjectFromWorkspaceFolder();
  }
  return true;
}

function clearActiveStoryState() {
  projectDirectoryHandle = null;
  setActiveProjectTypeFolderName('');
  projectManifest = null;
  chapters = [];
  chapterDrafts = [];
  chapterTrashDrafts = [];
  chapterEditDrafts = {};
  namingData = normalizeNamingData();
  storyFacts = [];
  curChap = 0;
  curPart = 0;
  curDraft = -1;
  curTrashDraft = -1;
  expandedPartIndex = 0;
  activeEditorMode = 'chapter';
  trashReturnEditorState = null;
  activeChapterEditKey = null;
  isChapterEditUnlocked = false;
  selectedTrashDraftIndexes.clear();
  lastSelectedTrashDraftIndex = null;
  isDraftTrashMode = false;
  lastSavedChapterHTML = '';
  localStorage.removeItem(PROJECT_MANIFEST_KEY);
  localStorage.removeItem('lm_chapters');
  localStorage.removeItem(DRAFTS_STORAGE_KEY);
  localStorage.removeItem(TRASH_DRAFTS_STORAGE_KEY);
  localStorage.removeItem(CHAPTER_EDIT_DRAFTS_STORAGE_KEY);
  localStorage.removeItem(NAMING_STORAGE_KEY);
  localStorage.removeItem(FACTS_STORAGE_KEY);
  localStorage.removeItem(PROJECT_FOLDER_KEY);
  localStorage.removeItem(PROJECT_TYPE_FOLDER_KEY);
}

async function loadWorkspaceFolder(handle) {
  workspaceDirectoryHandle = handle;
  await saveWorkspaceHandle(handle);
  await deleteStoredDirectoryHandle(PROJECT_HANDLE_KEY);
  localStorage.setItem(PROJECT_MODE_KEY, 'workspace');
  localStorage.setItem(WORKSPACE_FOLDER_KEY, handle.name || '');
  clearActiveStoryState();
}

function chaptersForStorage() {
  return chapters.map(chapter => ({
    id: chapter.id,
    title: chapter.title,
    content: chapter.content,
    contentHTML: chapter.content || '',
    notes: chapter.notes || [],
    contentPath: chapter.contentPath || '',
    partIndex: chapter.partIndex || 0,
    chapterNo: chapter.chapterNo || 1,
    createdAt: chapter.createdAt || new Date().toISOString(),
    alignment: normalizeEditorAlignment(chapter.alignment),
    lineHeight: normalizeOptionalEditorLineHeight(chapter.lineHeight),
    paragraphGap: normalizeOptionalEditorParagraphGap(chapter.paragraphGap),
    paragraphMargin: normalizeOptionalEditorParagraphMargin(chapter.paragraphMargin),
    fontFamily: normalizeEditorFontFamily(chapter.fontFamily),
    fontSize: normalizeEditorFontSize(chapter.fontSize),
    editorSettings: normalizeEditorSettings(chapter.editorSettings),
    _wordCount: Number.isFinite(chapter._wordCount) ? chapter._wordCount : null
  }));
}

function draftsForStorage(includeContent = true) {
  return chapterDrafts.map(draft => ({
    id: draft.id,
    title: draft.title,
    content: includeContent ? draft.content : '',
    contentHTML: draft.content || '',
    notes: draft.notes || [],
    contentPath: draft.contentPath || '',
    draftNo: draft.draftNo || 1,
    createdAt: draft.createdAt || new Date().toISOString(),
    alignment: normalizeEditorAlignment(draft.alignment),
    lineHeight: normalizeOptionalEditorLineHeight(draft.lineHeight),
    paragraphGap: normalizeOptionalEditorParagraphGap(draft.paragraphGap),
    paragraphMargin: normalizeOptionalEditorParagraphMargin(draft.paragraphMargin),
    fontFamily: normalizeEditorFontFamily(draft.fontFamily),
    fontSize: normalizeEditorFontSize(draft.fontSize),
    editorSettings: normalizeEditorSettings(draft.editorSettings),
    _wordCount: Number.isFinite(draft._wordCount) ? draft._wordCount : null
  }));
}

function trashDraftsForStorage(includeContent = true) {
  return normalizeTrashDrafts(chapterTrashDrafts).map(draft => ({
    id: draft.id,
    title: draft.title,
    content: includeContent ? draft.content : '',
    contentHTML: draft.content || '',
    notes: draft.notes || [],
    contentPath: draft.contentPath || '',
    draftNo: draft.draftNo || 1,
    originalDraftNo: draft.originalDraftNo || draft.draftNo || 1,
    originalContentPath: draft.originalContentPath || '',
    deletedAt: draft.deletedAt || new Date().toISOString(),
    createdAt: draft.createdAt || new Date().toISOString(),
    alignment: normalizeEditorAlignment(draft.alignment),
    lineHeight: normalizeOptionalEditorLineHeight(draft.lineHeight),
    paragraphGap: normalizeOptionalEditorParagraphGap(draft.paragraphGap),
    paragraphMargin: normalizeOptionalEditorParagraphMargin(draft.paragraphMargin),
    fontFamily: normalizeEditorFontFamily(draft.fontFamily),
    fontSize: normalizeEditorFontSize(draft.fontSize),
    editorSettings: normalizeEditorSettings(draft.editorSettings),
    _wordCount: Number.isFinite(draft._wordCount) ? draft._wordCount : null
  }));
}

function chapterEditDraftsForStorage(includeContent = true) {
  return Object.values(normalizeChapterEditDrafts(chapterEditDrafts)).map(draft => ({
    id: draft.id,
    chapterKey: draft.chapterKey,
    chapterIndex: draft.chapterIndex,
    title: draft.title,
    content: includeContent ? draft.content : '',
    contentHTML: draft.content || '',
    contentPath: draft.contentPath || '',
    draftNo: draft.draftNo || 1,
    createdAt: draft.createdAt || new Date().toISOString(),
    updatedAt: draft.updatedAt || draft.createdAt || new Date().toISOString(),
    alignment: normalizeEditorAlignment(draft.alignment),
    lineHeight: normalizeOptionalEditorLineHeight(draft.lineHeight),
    paragraphGap: normalizeOptionalEditorParagraphGap(draft.paragraphGap),
    paragraphMargin: normalizeOptionalEditorParagraphMargin(draft.paragraphMargin),
    fontFamily: normalizeEditorFontFamily(draft.fontFamily),
    fontSize: normalizeEditorFontSize(draft.fontSize),
    editorSettings: normalizeEditorSettings(draft.editorSettings),
    lastAutosavedHTML: draft.lastAutosavedHTML || draft.content || '',
    lastAutosavedText: draft.lastAutosavedText || ''
  }));
}

function persistProjectManifestSnapshot() {
  if (!hasActiveStory()) return null;
  const manifest = chaptersToManifest();
  manifest.createdAt = manifest.createdAt || projectManifest?.createdAt || new Date().toISOString();
  manifest.updatedAt = new Date().toISOString();
  projectManifest = manifest;
  localStorage.setItem(PROJECT_MANIFEST_KEY, JSON.stringify(manifest));
  return manifest;
}

function storyInfoFields() {
  return [
    document.getElementById('storyTitleInp'),
    document.getElementById('storyAuthorInp'),
    document.getElementById('storyTypeInp'),
    document.getElementById('storyLanguageInp'),
    document.getElementById('storySynopsisInp')
  ].filter(Boolean);
}

function storyInfoFormValues() {
  return {
    title: document.getElementById('storyTitleInp')?.value.trim() || '',
    author: document.getElementById('storyAuthorInp')?.value.trim() || '',
    type: document.getElementById('storyTypeInp')?.value || 'novel',
    language: document.getElementById('storyLanguageInp')?.value === 'hi' ? 'hi' : 'en',
    synopsis: document.getElementById('storySynopsisInp')?.value.trim() || ''
  };
}

function setStoryInfoOriginalValues(values = storyInfoFormValues()) {
  const card = document.querySelector('#story-info-modal .story-info-card');
  if (!card) return;
  card.dataset.originalTitle = String(values.title || '').trim();
  card.dataset.originalAuthor = String(values.author || '').trim();
  card.dataset.originalType = values.type || 'novel';
  card.dataset.originalLanguage = values.language || 'en';
  card.dataset.originalSynopsis = String(values.synopsis || '').trim();
}

function storyInfoHasChanges() {
  const card = document.querySelector('#story-info-modal .story-info-card');
  if (!card) return false;
  const values = storyInfoFormValues();
  return values.title !== (card.dataset.originalTitle || '') ||
    values.author !== (card.dataset.originalAuthor || '') ||
    values.type !== (card.dataset.originalType || 'novel') ||
    values.language !== (card.dataset.originalLanguage || 'en') ||
    values.synopsis !== (card.dataset.originalSynopsis || '');
}

function storyInfoOriginalValues() {
  const card = document.querySelector('#story-info-modal .story-info-card');
  return {
    title: card?.dataset.originalTitle || '',
    author: card?.dataset.originalAuthor || '',
    type: card?.dataset.originalType || 'novel',
    language: card?.dataset.originalLanguage || 'en',
    synopsis: card?.dataset.originalSynopsis || ''
  };
}

function applyStoryInfoFormValues(values = storyInfoOriginalValues()) {
  const titleInput = document.getElementById('storyTitleInp');
  const authorInput = document.getElementById('storyAuthorInp');
  const typeInput = document.getElementById('storyTypeInp');
  const languageInput = document.getElementById('storyLanguageInp');
  const synopsisInput = document.getElementById('storySynopsisInp');
  if (titleInput) titleInput.value = values.title || '';
  if (authorInput) authorInput.value = values.author || '';
  if (typeInput) typeInput.value = values.type === 'story' ? 'story' : 'novel';
  if (languageInput) languageInput.value = values.language === 'hi' ? 'hi' : 'en';
  if (synopsisInput) synopsisInput.value = values.synopsis || '';
  queueCustomSelectSync();
}

function syncStoryInfoDisplayValues(values = storyInfoFormValues()) {
  setText('storyTitleValue', values.title || text().untitledStory || 'Untitled Story');
  setText('storyAuthorValue', values.author || text().unknownAuthor);
  setText('storyTypeValue', storyTypeLabel(values.type));
  setText('storyLanguageValue', storyLanguageLabel(values.language));
  const synopsisValue = document.getElementById('storySynopsisValue');
  if (synopsisValue) {
    const synopsis = values.synopsis || '';
    synopsisValue.textContent = synopsis || text().storySynopsisEmpty;
    synopsisValue.classList.toggle('is-empty', !synopsis);
  }
}

function storyInfoTimestampLabel(manifest) {
  if (!manifest) return '';
  const updatedAt = manifest.updatedAt || '';
  const createdAt = manifest.createdAt || '';
  const value = updatedAt || createdAt;
  if (!value) return '';
  const prefix = updatedAt && updatedAt !== createdAt ? text().storyInfoLastSaved : text().storyInfoCreated;
  return `${prefix}: ${factTimeLabel(value)}`;
}

function updateStoryInfoTimestamp(manifest = normalizeProjectManifest(projectManifest || createProjectManifest())) {
  const timeLabel = document.getElementById('storyInfoTime');
  if (!timeLabel) return;
  const label = storyInfoPanelMode === 'create' ? '' : storyInfoTimestampLabel(manifest);
  timeLabel.textContent = label;
  timeLabel.title = label;
  timeLabel.hidden = !label;
}

function setStoryInfoEditMode(editing, options = {}) {
  const card = document.querySelector('#story-info-modal .story-info-card');
  const saveButton = document.getElementById('storyInfoSaveBtn');
  const editButton = document.getElementById('storyInfoEditBtn');
  const isCreateMode = storyInfoPanelMode === 'create';
  isStoryInfoEditing = isCreateMode || Boolean(editing);
  const title = isStoryInfoEditing ? text().storyInfoStopEdit : text().storyInfoEdit;

  storyInfoFields().forEach(field => {
    const canEdit = isStoryInfoEditing;
    const isSelect = field.tagName === 'SELECT';
    field.disabled = isSelect && !canEdit;
    field.readOnly = !isSelect && !canEdit;
    field.tabIndex = canEdit ? 0 : -1;
  });

  card?.classList.toggle('is-editing', isStoryInfoEditing);
  card?.classList.toggle('is-readonly', !isStoryInfoEditing);
  if (editButton) {
    editButton.hidden = isCreateMode;
    editButton.classList.toggle('is-active', isStoryInfoEditing);
    editButton.title = title;
    editButton.setAttribute('aria-label', title);
  }
  if (saveButton) saveButton.hidden = !isCreateMode;
  if (options.resetDirty) setStoryInfoOriginalValues();
  syncStoryInfoDisplayValues(isStoryInfoEditing ? storyInfoFormValues() : storyInfoOriginalValues());
  markStoryInfoEdited();
}

function beginStoryInfoEdit() {
  if (storyInfoPanelMode === 'create') return;
  if (isStoryInfoEditing) {
    applyStoryInfoFormValues(storyInfoOriginalValues());
    setStoryInfoEditMode(false);
    return;
  }
  setStoryInfoEditMode(true);
  requestAnimationFrame(() => {
    const titleInput = document.getElementById('storyTitleInp');
    titleInput?.focus();
    titleInput?.select?.();
  });
}

function markStoryInfoEdited() {
  const saveButton = document.getElementById('storyInfoSaveBtn');
  if (!saveButton) return;
  if (storyInfoPanelMode === 'create') {
    saveButton.hidden = false;
    return;
  }
  if (isStoryInfoEditing) syncStoryInfoDisplayValues(storyInfoFormValues());
  saveButton.hidden = !isStoryInfoEditing || !storyInfoHasChanges();
}

function fillStoryInfoForm() {
  if (storyInfoPanelMode === 'create') {
    document.getElementById('storyTitleInp').value = '';
    document.getElementById('storyTypeInp').value = 'novel';
    document.getElementById('storyAuthorInp').value = '';
    document.getElementById('storyLanguageInp').value = 'en';
    document.getElementById('storySynopsisInp').value = '';
    setStoryInfoOriginalValues({
      title: '',
      author: '',
      type: 'novel',
      language: 'en',
      synopsis: ''
    });
    updateStoryInfoTimestamp(null);
    setStoryInfoEditMode(true);
    queueCustomSelectSync();
    return;
  }

  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  document.getElementById('storyTitleInp').value = manifest.title || '';
  document.getElementById('storyTypeInp').value = manifest.type === 'story' ? 'story' : 'novel';
  document.getElementById('storyAuthorInp').value = manifest.author || '';
  document.getElementById('storyLanguageInp').value = ['en', 'hi'].includes(manifest.language) ? manifest.language : 'en';
  document.getElementById('storySynopsisInp').value = manifest.synopsis || '';
  setStoryInfoOriginalValues({
    title: manifest.title || '',
    author: manifest.author || '',
    type: manifest.type === 'story' ? 'story' : 'novel',
    language: ['en', 'hi'].includes(manifest.language) ? manifest.language : 'en',
    synopsis: manifest.synopsis || ''
  });
  updateStoryInfoTimestamp(manifest);
  setStoryInfoEditMode(false);
  queueCustomSelectSync();
}

function syncStoryInfoPanelModeText() {
  const copy = text();
  const libraryCopy = storyLibraryContextText();
  setTitle('storyInfoEditBtn', copy.storyInfoEdit);
  document.getElementById('storyInfoEditBtn')?.setAttribute('aria-label', copy.storyInfoEdit);
  if (storyInfoPanelMode === 'create') {
    setText('storyInfoTitle', libraryCopy.newStory);
    setText('storyInfoSaveBtn', copy.createStory);
    return;
  }

  setText('storyInfoTitle', copy.storyInfoTitle);
  setText('storyInfoSaveBtn', copy.storyInfoSave);
}

function storyInfoPanelPositionConfig() {
  if (storyInfoPanelMode === 'create') {
    if (isHomePage()) {
      return lmFloatingPanelPositionConfig?.('storyInfoCreateHome', {
        gap: 20,
        topOffset: -8,
        leftOffset: 0,
        rightOffset: 0,
        viewportPadding: 12,
        panelWidth: 430
      }) || {
        gap: 20,
        topOffset: -8,
        leftOffset: 0,
        rightOffset: 0,
        viewportPadding: 12,
        panelWidth: 430
      };
    }

    return lmFloatingPanelPositionConfig?.('storyInfoCreateIndex', {
      gap: 20,
      topOffset: 55,
      leftOffset: 140,
      rightOffset: 0,
      viewportPadding: 12,
      panelWidth: 430
    }) || {
      gap: 20,
      topOffset: 55,
      leftOffset: 140,
      rightOffset: 0,
      viewportPadding: 12,
      panelWidth: 430
    };
  }

  return lmFloatingPanelPositionConfig?.('storyInfoDetails', {
    gap: 25,
    topOffset: -8,
    leftOffset: 0,
    rightOffset: 0,
    viewportPadding: 12,
    panelWidth: 430
  }) || {
    gap: 25,
    topOffset: -8,
    leftOffset: 0,
    rightOffset: 0,
    viewportPadding: 12,
    panelWidth: 430
  };
}

function positionStoryInfoPanel() {
  const panel = document.getElementById('story-info-modal');
  const card = panel?.querySelector('.story-info-card');
  const anchor = document.getElementById(storyInfoAnchorId) || document.getElementById('storySummaryMenuBtn');
  if (!panel || !card || !anchor) return;

  const anchorRect = anchor.getBoundingClientRect();
  const positionConfig = storyInfoPanelPositionConfig();
  const gap = lmPanelNumber?.(positionConfig.gap, 25) ?? (positionConfig.gap || 25);
  const viewportPadding = lmPanelNumber?.(positionConfig.viewportPadding, 12) ?? 12;
  const leftOffset = lmPanelNumber?.(positionConfig.leftOffset, 0) ?? 0;
  const rightOffset = lmPanelNumber?.(positionConfig.rightOffset, 0) ?? 0;
  const topOffset = lmPanelNumber?.(positionConfig.topOffset, -8) ?? (positionConfig.topOffset || -8);
  const panelWidth = Math.min(lmPanelNumber?.(positionConfig.panelWidth, 430) ?? 430, window.innerWidth - viewportPadding * 2);
  panel.style.width = `${panelWidth}px`;

  const cardHeight = Math.min(card.offsetHeight || 520, window.innerHeight - viewportPadding * 2);
  let left = anchorRect.right + gap + leftOffset - rightOffset;
  if (left + panelWidth > window.innerWidth - viewportPadding) {
    left = Math.max(viewportPadding, anchorRect.left - panelWidth - gap + leftOffset - rightOffset);
  }

  let top = anchorRect.top + topOffset;
  top = Math.max(viewportPadding, Math.min(top, window.innerHeight - cardHeight - viewportPadding));
  panel.style.inset = `${top}px auto auto ${left}px`;
}

function openStoryInfoModal(options = {}) {
  storyInfoPanelMode = options.mode || 'edit';
  storyInfoAnchorId = options.anchorId || (storyInfoPanelMode === 'create' ? 'storyLibraryBtn' : 'storySummaryMenuBtn');
  closeStorySummaryMenu();
  fillStoryInfoForm();
  syncStoryInfoPanelModeText();
  const panel = document.getElementById('story-info-modal');
  if (!panel.classList.contains('is-visible') && typeof window.prepareFloatingPanelFocusReturn === 'function') {
    window.prepareFloatingPanelFocusReturn(panel);
  }
  panel.classList.add('is-visible');
  positionStoryInfoPanel();
  if (options.focusTitle) {
    if (storyInfoPanelMode !== 'create') setStoryInfoEditMode(true);
    setTimeout(() => {
      document.getElementById('storyTitleInp')?.focus();
      document.getElementById('storyTitleInp')?.select();
    }, 0);
  }
}

function closeStoryInfoModal() {
  document.getElementById('story-info-modal').classList.remove('is-visible');
  storyInfoPanelMode = 'edit';
  storyInfoAnchorId = 'storySummaryMenuBtn';
  isStoryInfoEditing = false;
}

function positionStorySummaryMenuPanel() {
  const panel = document.getElementById('storySummaryMenuPanel');
  const button = document.getElementById('storySummaryMenuBtn');
  if (!panel || !button) return;

  const buttonRect = button.getBoundingClientRect();
  const defaultTopOffset = -(buttonRect.height) / 3;
  const positionConfig = lmFloatingPanelPositionConfig?.('storySummaryMenuPanel', {
    gap: 16,
    topOffset: defaultTopOffset,
    leftOffset: 0,
    rightOffset: 0,
    panelWidth: 210,
    viewportPadding: 12
  }) || {};
  const viewportPadding = lmPanelNumber?.(positionConfig.viewportPadding, 12) ?? 12;
  const gap = lmPanelNumber?.(positionConfig.gap, 16) ?? 16;
  const leftOffset = lmPanelNumber?.(positionConfig.leftOffset, 0) ?? 0;
  const rightOffset = lmPanelNumber?.(positionConfig.rightOffset, 0) ?? 0;
  const topOffset = lmPanelNumber?.(positionConfig.topOffset, defaultTopOffset) ?? defaultTopOffset;
  const panelWidth = Math.min(lmPanelNumber?.(positionConfig.panelWidth, 210) ?? 210, window.innerWidth - viewportPadding * 2);
  panel.style.width = `${panelWidth}px`;

  let left = buttonRect.right + gap + leftOffset - rightOffset;
  if (left + panelWidth > window.innerWidth - viewportPadding) {
    left = Math.max(viewportPadding, buttonRect.left - panelWidth - gap + leftOffset - rightOffset);
  }

  const panelHeight = panel.offsetHeight || 50;
  let top = buttonRect.top + topOffset;
  top = Math.max(viewportPadding, Math.min(top, window.innerHeight - panelHeight - viewportPadding));
  panel.style.inset = `${top}px auto auto ${left}px`;
}

function setStorySummaryMenu(open) {
  const panel = document.getElementById('storySummaryMenuPanel');
  const button = document.getElementById('storySummaryMenuBtn');
  if (!panel || !button) return;
  if (open && panel.hidden && typeof window.prepareFloatingPanelFocusReturn === 'function') {
    window.prepareFloatingPanelFocusReturn(panel);
  }
  panel.hidden = !open;
  if (!open) {
    const confirmPanel = document.getElementById('storySummaryDeleteConfirm');
    if (confirmPanel) confirmPanel.hidden = true;
  }
  if (open) positionStorySummaryMenuPanel();
  button.classList.toggle('is-open', open);
  button.setAttribute('aria-expanded', String(open));
}

function toggleStorySummaryMenu(event) {
  event?.preventDefault();
  event?.stopPropagation();
  const panel = document.getElementById('storySummaryMenuPanel');
  setStorySummaryMenu(Boolean(panel?.hidden));
}

function closeStorySummaryMenu() {
  setStorySummaryMenu(false);
}

function openStoryDetailsFromSummaryMenu() {
  closeStoryDeleteConfirm();
  openStoryInfoModal();
}

function setStorySummarySaveIndicator(state = 'idle') {
  const summary = document.getElementById('story-summary');
  if (!summary) return;

  clearTimeout(storySummarySaveIndicatorTimer);
  summary.classList.remove('is-story-saving', 'is-story-saved');
  if (state === 'idle') return;

  summary.classList.add(state === 'saved' ? 'is-story-saved' : 'is-story-saving');
  if (state === 'saved') {
    storySummarySaveIndicatorTimer = setTimeout(() => {
      summary.classList.remove('is-story-saved');
    }, 1600);
  }
}

function openStoryDeleteConfirm(event = null) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const confirmPanel = document.getElementById('storySummaryDeleteConfirm');
  if (!confirmPanel) return;
  confirmPanel.hidden = false;
  positionStorySummaryMenuPanel();
}

function closeStoryDeleteConfirm(event = null) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const confirmPanel = document.getElementById('storySummaryDeleteConfirm');
  if (confirmPanel) confirmPanel.hidden = true;
  if (!document.getElementById('storySummaryMenuPanel')?.hidden) positionStorySummaryMenuPanel();
}

async function deleteActiveStory() {
  if (!hasActiveStory()) return;
  const folderName = projectDirectoryHandle?.name || localStorage.getItem(PROJECT_FOLDER_KEY) || '';
  const typeFolderName = currentProjectTypeFolderName();
  if (!workspaceDirectoryHandle || !folderName) {
    showMiniReminder(text().chooseWorkspaceFirst);
    return;
  }

  showAppLoader(text().storyDeleting);
  try {
    closeStoryDeleteConfirm();
    closeStorySummaryMenu();
    closeStoryInfoModal();
    try {
      await removeWorkspaceProjectDirectory(folderName, typeFolderName);
    } catch (deleteError) {
      if (!typeFolderName || deleteError.name !== 'NotFoundError') throw deleteError;
      await removeWorkspaceProjectDirectory(folderName, '');
    }
    deleteActiveEditorStateForStory(folderName, typeFolderName);
    await deleteStoredDirectoryHandle(PROJECT_HANDLE_KEY);
    clearActiveStoryState();
    hideProjectGate();
    if (isHomePage()) {
      resetHomeStoryList();
      await renderHomeExistingStoriesList();
      setHomeMenuStatus(text().storyDeleted);
      return;
    }
    navigateToHomePage();
  } catch (error) {
    console.warn('Story delete failed:', error);
    showMiniReminder(error?.message || text().storyCreateFailed);
  } finally {
    hideAppLoader();
  }
}

function updateStorySummary(manifestOverride = null) {
  if (!hasActiveStory()) {
    setText('storytype', '');
    setText('storyLanguageBadge', '');
    setText('storySummaryTitle', '');
    setText('Writername', '');
    return;
  }

  const manifest = normalizeProjectManifest(manifestOverride || projectManifest || createProjectManifest());
  const languageText = storyLanguageLabel(manifest.language);

  setText('storytype', storyTypeLabel(manifest.type));
  setText('storyLanguageBadge', languageText);
  setText('storySummaryTitle', manifest.title || 'Untitled Story');
  setText('Writername', (manifest.author || text().unknownAuthor));
  document.getElementById('storyLanguageBadge')?.setAttribute('title', languageText);
}

function syncSavedStoryInfoSnapshot(values, manifest) {
  const savedManifest = normalizeProjectManifest(manifest || projectManifest || createProjectManifest());
  const savedValues = {
    title: values.title || savedManifest.title || '',
    author: values.author || savedManifest.author || '',
    type: savedManifest.type || values.type || 'novel',
    language: savedManifest.language || values.language || 'en',
    synopsis: values.synopsis || savedManifest.synopsis || ''
  };

  projectManifest = savedManifest;
  localStorage.setItem(PROJECT_MANIFEST_KEY, JSON.stringify(savedManifest));
  updateStorySummary(savedManifest);
  setText('storyTitleValue', savedValues.title || text().untitledStory || 'Untitled Story');
  setText('storyAuthorValue', savedValues.author || text().unknownAuthor);
  setText('storyTypeValue', storyTypeLabel(savedValues.type));
  setText('storyLanguageValue', storyLanguageLabel(savedValues.language));
  try {
    setStoryInfoOriginalValues(savedValues);
    applyStoryInfoFormValues(savedValues);
    syncStoryInfoDisplayValues(savedValues);
    updateStoryInfoTimestamp(savedManifest);
  } catch (error) {
    console.warn('Story info display sync failed:', error);
  }
}

async function saveStoryInfo() {
  if (storyInfoPanelMode === 'create') {
    showAppLoader(text().loading);
    try {
      await createStoryFromInfoForm();
    } catch (error) {
      console.warn('Story create failed:', error);
      const errorMessage = error?.message || text().storyCreateFailed;
      if (errorMessage === text().duplicateStoryTitle) showDuplicateReminder(errorMessage);
      setHomeMenuStatus(errorMessage);
      setDefaultSaveStatus();
    } finally {
      hideAppLoader();
    }
    return;
  }

  if (!hasActiveStory()) return;
  const saveButton = document.getElementById('storyInfoSaveBtn');
  let manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const savedValues = storyInfoFormValues();
  const nextTitle = savedValues.title || manifest.title;
  const nextType = savedValues.type || manifest.type || 'novel';
  const currentTypeFolderName = currentProjectTypeFolderName();
  const nextTypeFolderName = projectTypeFolderName(nextType);
  const shouldRenameStoryFolder = Boolean(
    workspaceDirectoryHandle &&
    projectDirectoryHandle &&
    (
      uniqueNameKey(sanitizeStoryFolderName(nextTitle)) !== uniqueNameKey(projectDirectoryHandle.name || '') ||
      currentTypeFolderName !== nextTypeFolderName
    )
  );
  if (
    (uniqueNameKey(nextTitle) !== uniqueNameKey(manifest.title) || currentTypeFolderName !== nextTypeFolderName) &&
    await workspaceStoryTitleExists(nextTitle, projectDirectoryHandle?.name || '', nextType, currentTypeFolderName)
  ) {
    showDuplicateReminder(text().duplicateStoryTitle);
    setHomeMenuStatus(text().duplicateStoryTitle);
    return;
  }

  manifest.title = nextTitle;
  manifest.type = nextType;
  manifest.author = savedValues.author;
  manifest.language = savedValues.language === 'hi' ? 'hi' : 'en';
  manifest.synopsis = savedValues.synopsis;
  manifest.createdAt = manifest.createdAt || new Date().toISOString();
  manifest.updatedAt = new Date().toISOString();
  const structureManifest = chaptersToManifest();
  manifest.chapters = structureManifest.chapters;
  manifest.parts = structureManifest.parts;
  projectManifest = manifest;
  syncSavedStoryInfoSnapshot(savedValues, manifest);

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = text().saving;
  }
  setStorySummarySaveIndicator('saving');
  try {
    if (shouldRenameStoryFolder) {
      await renameActiveStoryFolderIfNeeded(nextTitle, nextType);
    }
    if (projectDirectoryHandle) {
      await writeProjectManifest(manifest);
    } else {
      manifest.updatedAt = new Date().toISOString();
      localStorage.setItem(PROJECT_MANIFEST_KEY, JSON.stringify(manifest));
    }
    syncSavedStoryInfoSnapshot(savedValues, projectManifest || manifest);
    closeStoryInfoModal();
    setStorySummarySaveIndicator('saved');
  } catch (error) {
    console.warn('Story info save failed:', error);
    setStorySummarySaveIndicator('idle');
    if (error?.message === text().duplicateStoryTitle) {
      showDuplicateReminder(text().duplicateStoryTitle);
      setHomeMenuStatus(text().duplicateStoryTitle);
    } else {
      showMiniReminder(error?.message || text().storyCreateFailed);
    }
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = text().storyInfoSave;
    }
  }
}

async function addPart() {
  if (!hasActiveStory()) return;
  showAppLoader(text().creatingPart);
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const targetIndex = manifest.parts.length;
  manifest.parts.push(createDefaultPart(targetIndex));
  if (targetIndex === 0) {
    chapters.forEach((chapter, index) => {
      chapter.partIndex = 0;
      chapter.chapterNo = index + 1;
    });
  } else {
    chapters.forEach(chapter => {
      const hasExistingPart = Number.isInteger(chapter.partIndex) &&
        chapter.partIndex >= 0 &&
        chapter.partIndex < targetIndex;
      if (!hasExistingPart) chapter.partIndex = targetIndex;
    });
  }

  projectManifest = manifest;
  curPart = targetIndex;
  expandedPartIndex = targetIndex;
  isRawChapterSectionExpanded = false;
  isPartsListCollapsedByRaw = false;
  isPartsListForceExpanded = true;
  if (chapterListOverflowMode === 'collapsed') chapterListOverflowMode = 'expanded';
  if (typeof reindexProjectStructure === 'function') reindexProjectStructure(manifest);
  persistProjectManifestSnapshot();
  saveToStorage(false);
  renderChapters();
  updateStorySummary();

  if (!projectDirectoryHandle) {
    setSaveStatusDot('saved', text().partInfoSaved);
    hideAppLoader();
    return;
  }

  requestAnimationFrame(() => {
    writeProjectManifest()
      .then(() => setSaveStatusDot('saved', text().partInfoSaved))
      .catch(error => {
        console.warn('Part create failed:', error);
        setDefaultSaveStatus();
      })
      .finally(() => hideAppLoader());
  });
}

async function writeChapterToLocalFile(chapterIndex, textValue) {
  if (!projectDirectoryHandle || !chapters[chapterIndex]) return;

  const chapter = chapters[chapterIndex];
  chapter.contentPath = chapter.contentPath || chapterFilePath(chapterIndex);
  const fileHandle = chapter.contentHandle || await getProjectFileHandle(chapter.contentPath, { create: true });

  chapter.contentHandle = fileHandle;
  await writeFileText(fileHandle, textValue);
  await writeProjectManifest();
}

async function writeCurrentChapterToLocalFile() {
  await writeChapterToLocalFile(curChap, getCleanEditorText());
}

async function writeDraftToLocalFile(draftIndex, textValue) {
  if (!projectDirectoryHandle || !chapterDrafts[draftIndex]) return;

  const draft = chapterDrafts[draftIndex];
  draft.contentPath = draft.contentPath || draftFilePath(draftIndex);
  const fileHandle = draft.contentHandle || await getProjectFileHandle(draft.contentPath, { create: true });

  draft.contentHandle = fileHandle;
  await writeFileText(fileHandle, textValue);
  await writeDraftsDataToProject();
}

async function writeCurrentDraftToLocalFile() {
  await writeDraftToLocalFile(curDraft, getCleanEditorText());
}

async function writeChapterEditDraftToLocalFile(draftKey, textValue) {
  if (!projectDirectoryHandle || !draftKey || !chapterEditDrafts[draftKey]) return;

  const draft = normalizeChapterEditDraft(chapterEditDrafts[draftKey], draftKey);
  const index = Number.isInteger(draft.chapterIndex) && draft.chapterIndex >= 0 ? draft.chapterIndex : curChap;
  draft.contentPath = draft.contentPath || chapterEditDraftFilePath(index);
  const fileHandle = draft.contentHandle || await getProjectFileHandle(draft.contentPath, { create: true });

  draft.contentHandle = fileHandle;
  draft.content = draft.content || textToEditorHTML(textValue);
  draft.updatedAt = new Date().toISOString();
  draft.lastAutosavedHTML = draft.content;
  draft.lastAutosavedText = String(textValue || '').replace(/\r\n?/g, '\n').trimEnd();
  chapterEditDrafts[draftKey] = draft;
  await writeFileText(fileHandle, draft.lastAutosavedText);
  await writeChapterEditDraftsToProject();
}

async function writeActiveChapterEditDraftToLocalFile() {
  const draft = activeChapterEditDraft();
  if (!draft) return;
  await writeChapterEditDraftToLocalFile(draft.chapterKey, getCleanEditorText());
}

async function readProjectTextFileIfExists(path) {
  if (!projectDirectoryHandle || !path) return null;

  try {
    const fileHandle = await getProjectFileHandle(path);
    return await readFileText(fileHandle);
  } catch (error) {
    if (error.name !== 'NotFoundError') {
      console.warn('Project text file compare read failed:', path, error);
    }
    return null;
  }
}

async function chapterEditDraftFileMatchesSavedChapter(index = curChap) {
  ensureChapters();
  const chapter = chapters[index];
  const draftKey = chapterEditDraftKey(index);
  const draft = chapterEditDrafts[draftKey]
    ? normalizeChapterEditDraft(chapterEditDrafts[draftKey], draftKey)
    : null;

  if (!chapter || !draft) return false;
  chapterEditDrafts[draftKey] = draft;

  const [draftFileText, chapterFileText] = await Promise.all([
    readProjectTextFileIfExists(draft.contentPath),
    readProjectTextFileIfExists(chapter.contentPath)
  ]);

  if (draftFileText === null || chapterFileText === null) return false;

  draft.content = draft.content || draft.contentHTML || textToEditorHTML(draftFileText);
  draft.lastAutosavedHTML = draft.lastAutosavedHTML || draft.content;
  draft.lastAutosavedText = normalizeChapterEditComparePlainTextFile(draftFileText);
  chapterEditDrafts[draftKey] = draft;

  const draftTitle = normalizeChapterEditCompareTitle(draft.title);
  const chapterTitle = normalizeChapterEditCompareTitle(chapterDisplayTitle(chapter, index));
  const textMatches = chapterEditPlainTextFilesMatch(draftFileText, chapterFileText);
  const formattingMatches = chapterEditFormattingMatchesSavedChapter(draft, chapter);

  return draftTitle === chapterTitle && textMatches && formattingMatches;
}

async function saveCurrentProject() {
  if (!hasActiveStory()) return;
  if (isTrashDraftActive()) return;
  if (typeof flushEditorHistorySnapshot === 'function') flushEditorHistorySnapshot('save');
  if (
    !isDraftActive() &&
    isChapterEditUnlocked &&
    !isChapterEditDraftActive() &&
    hasChapterEditContentChangedFromSaved(getCleanEditorHTML(), curChap)
  ) {
    materializeChapterEditDraftForChange();
  }

  if (isDraftActive()) {
    const namingChanged = scanActiveEditorForNamingUses(new Date().toISOString());
    saveToStorage();
    await writeCurrentDraftToLocalFile();
    await writeNamingDataToProject();
    if (activeSidePanel === 'naming' && namingChanged) renderTags();
    return;
  }

  if (isChapterEditDraftActive()) {
    const namingChanged = scanActiveEditorForNamingUses(new Date().toISOString());
    saveToStorage();
    const draft = activeChapterEditDraft();
    if (draft) {
      draft.updatedAt = new Date().toISOString();
      draft.lastAutosavedHTML = getCleanEditorHTML();
      draft.lastAutosavedText = getCleanEditorText();
    }
    await writeActiveChapterEditDraftToLocalFile();
    await writeNamingDataToProject();
    if (activeSidePanel === 'naming' && namingChanged) renderTags();
    return;
  }

  persistProjectManifestSnapshot();
  const chapterSavedAt = new Date().toISOString();
  scanCurrentChapterForNamingUses(curChap, getCleanEditorText(), chapterSavedAt);
  saveToStorage();
  await writeCurrentChapterToLocalFile();
  await writeNamingDataToProject();
  if (activeSidePanel === 'naming') renderTags();
}

function stopTimedAutoSave() {
  if (!autoSaveIntervalTimer) return;
  clearInterval(autoSaveIntervalTimer);
  autoSaveIntervalTimer = null;
}

function ensureTimedAutoSave() {
  if (autoSaveIntervalTimer || !isAutoSaveEnabled || !canEditActiveDocument()) return;
  autoSaveIntervalTimer = setInterval(() => {
    runAutoSave('interval');
  }, 3000);
}

async function runAutoSave(source = 'idle') {
  if (!isAutoSaveEnabled || isAutoSaveRunning || !canEditActiveDocument()) return;

  const saveSnapshot = getCleanEditorHTML();
  const chapterEditDraft = activeChapterEditDraft();
  const autoSaveBaseline = chapterEditDraft ? chapterEditDraft.lastAutosavedHTML || '' : lastSavedChapterHTML;
  if (saveSnapshot === autoSaveBaseline) {
    stopTimedAutoSave();
    setDefaultSaveStatus();
    return;
  }

  isAutoSaveRunning = true;
  try {
    await saveCurrentProject();
    const currentSnapshot = getCleanEditorHTML();
    const currentChapterEditDraft = activeChapterEditDraft();
    if (currentSnapshot === saveSnapshot) {
      if (currentChapterEditDraft) {
        currentChapterEditDraft.lastAutosavedHTML = saveSnapshot;
        currentChapterEditDraft.lastAutosavedText = getCleanEditorText();
        setSaveButtonSaved(true);
      } else {
        rememberCurrentChapterSaved(saveSnapshot);
      }
      stopTimedAutoSave();
      setSaveStatusDot('saved', text().saved);
    } else {
      if (currentChapterEditDraft) {
        currentChapterEditDraft.lastAutosavedHTML = saveSnapshot;
        currentChapterEditDraft.lastAutosavedText = editorHTMLToText(saveSnapshot);
      } else lastSavedChapterHTML = saveSnapshot;
      setSaveButtonSaved(false);
      showUnsavedSaveStatus(text().saving);
      ensureTimedAutoSave();
    }
  } catch (error) {
    console.warn(`Autosave (${source}) failed:`, error);
    setSaveButtonSaved(false);
    setDefaultSaveStatus();
  } finally {
    isAutoSaveRunning = false;
  }
}

async function commitChapterEditDraftToChapter(snapshot = {}) {
  const targetChapterIndex = Number.isInteger(snapshot.chapterIndex) ? snapshot.chapterIndex : curChap;
  const editorHTML = typeof snapshot.editorHTML === 'string' ? snapshot.editorHTML : getCleanEditorHTML();
  const editorText = typeof snapshot.editorText === 'string' ? snapshot.editorText : getCleanEditorText();
  const snapshotTitle = typeof snapshot.chapterTitle === 'string' ? snapshot.chapterTitle.trim() : '';

  if (
    typeof commitChapterTitleEdit === 'function' &&
    (isEditingChapterTitle || (typeof hasPendingChapterTitleCommit === 'function' && hasPendingChapterTitleCommit()))
  ) {
    const titleCommitted = await commitChapterTitleEdit();
    if (!titleCommitted) return false;
  }

  let chapter = chapters[targetChapterIndex];
  if (!chapter || isDraftActive() || isTrashDraftActive()) return false;

  curChap = targetChapterIndex;
  const draftKey = activeChapterEditKey || chapterEditDraftKey(targetChapterIndex);
  const draft = activeChapterEditDraft() ||
    (draftKey && chapterEditDrafts[draftKey]
      ? normalizeChapterEditDraft(chapterEditDrafts[draftKey], draftKey)
      : null);
  const normalizedDraftKey = draft?.chapterKey || draftKey;

  if (draft) {
    draft.content = editorHTML;
    if (snapshotTitle) draft.title = snapshotTitle;
    draft.updatedAt = new Date().toISOString();
    chapterEditDrafts[normalizedDraftKey] = draft;
  }

  const nextTitle = (snapshotTitle || draft?.title || activeEditorDisplayTitle() || chapterDisplayTitle(chapter, targetChapterIndex)).trim();
  if (chapterTitleExists(nextTitle, targetChapterIndex)) {
    showDuplicateReminder(text().duplicateChapterTitle);
    return false;
  }

  chapter = chapters[targetChapterIndex] || chapter;
  if (!chapter) return false;

  chapter.title = nextTitle;
  chapter.content = editorHTML;
  chapter.alignment = normalizeEditorAlignment(draft?.alignment ?? chapter.alignment);
  chapter.lineHeight = normalizeOptionalEditorLineHeight(draft?.lineHeight ?? chapter.lineHeight);
  chapter.paragraphGap = normalizeOptionalEditorParagraphGap(draft?.paragraphGap ?? chapter.paragraphGap);
  chapter.paragraphMargin = normalizeOptionalEditorParagraphMargin(draft?.paragraphMargin ?? chapter.paragraphMargin);
  chapter.fontFamily = normalizeEditorFontFamily(draft?.fontFamily ?? chapter.fontFamily);
  chapter.fontSize = normalizeEditorFontSize(draft?.fontSize ?? chapter.fontSize);
  setChapterWordCache(targetChapterIndex, countWordsFromText(editorText));

  const tempDraftPath = draft?.contentPath || '';
  if (draftKey) delete chapterEditDrafts[draftKey];
  if (normalizedDraftKey && normalizedDraftKey !== draftKey) delete chapterEditDrafts[normalizedDraftKey];
  activeEditorMode = 'chapter';
  curDraft = -1;
  activeChapterEditKey = null;
  isChapterEditUnlocked = false;
  isEditingChapterTitle = false;
  syncChapterTitleControls(targetChapterIndex, nextTitle);

  const chapterSavedAt = new Date().toISOString();
  scanCurrentChapterForNamingUses(targetChapterIndex, editorText, chapterSavedAt);
  persistProjectManifestSnapshot();
  saveToStorage(false);
  await writeChapterToLocalFile(targetChapterIndex, editorText);
  await writeNamingDataToProject();
  chapter.content = editorHTML;
  saveToStorage(false);
  if (tempDraftPath) await removeProjectFileIfExists(tempDraftPath);
  await writeChapterEditDraftsToProject();
  if (activeSidePanel === 'naming') renderTags();
  loadEditor();
  renderChapters();
  updateChapterStatus();
  renderCommittedChapterSnapshotInEditor(chapter, editorHTML);
  return true;
}

function renderCommittedChapterSnapshotInEditor(chapter, editorHTML) {
  const editor = document.getElementById('editor');
  if (!editor || !chapter) return;

  editor.innerHTML = editorHTML || '';
  normalizeEditorGapMarkers(editor);
  if (typeof normalizeEditorParagraphBlocks === 'function') normalizeEditorParagraphBlocks(editor);
  applyEditorAlignment(chapter.alignment);
  applyEditorSpacing(chapter.lineHeight, chapter.paragraphGap, chapter.paragraphMargin);
  if (typeof applyEditorFontFamily === 'function') applyEditorFontFamily(chapter.fontFamily);
  if (typeof applyEditorFontSize === 'function') applyEditorFontSize(chapter.fontSize);
  syncActiveEditorEditState();
  syncEditorPlaceholderState();
  lastSavedChapterHTML = getCleanEditorHTML();
  setSaveButtonSaved(true);
  updateStats();
  updateEditorScrollThumb(false);
}

async function manualSave() {
  if (!hasActiveStory()) return;
  if (isTrashDraftActive()) return;
  if (typeof flushEditorHistorySnapshot === 'function') flushEditorHistorySnapshot('manual-save');
  const titleInput = document.getElementById('chapterTitleInput');
  const editorSnapshot = {
    chapterIndex: curChap,
    editorHTML: getCleanEditorHTML(),
    editorText: getCleanEditorText(),
    chapterTitle: titleInput?.value?.trim() || activeEditorDisplayTitle()
  };
  if (
    typeof commitChapterTitleEdit === 'function' &&
    (isEditingChapterTitle || (typeof hasPendingChapterTitleCommit === 'function' && hasPendingChapterTitleCommit()))
  ) {
    const titleCommitted = await commitChapterTitleEdit();
    if (!titleCommitted) return;
  }
  if (
    !isDraftActive() &&
    isChapterEditUnlocked &&
    !isChapterEditDraftActive() &&
    hasChapterEditContentChangedFromSaved(editorSnapshot.editorHTML, editorSnapshot.chapterIndex)
  ) {
    materializeChapterEditDraftForChange(editorSnapshot.editorHTML);
  }
  const preSaveNamingChanged = scanActiveEditorForNamingUses(new Date().toISOString());
  if (!isDraftActive() && !isChapterEditUnlocked && !isChapterEditDraftActive()) {
    if (preSaveNamingChanged) {
      saveToStorage(false);
      await writeNamingDataToProject();
      if (activeSidePanel === 'naming') renderTags();
    }
    setSaveButtonSaved(true);
    setDefaultSaveStatus();
    showMiniReminder(text().chapterAlreadySaved);
    return;
  }
  if (isDraftActive() && getCleanEditorHTML() === lastSavedChapterHTML) {
    if (preSaveNamingChanged) {
      saveToStorage(false);
      await writeNamingDataToProject();
      if (activeSidePanel === 'naming') renderTags();
    }
    setSaveButtonSaved(true);
    setDefaultSaveStatus();
    showMiniReminder(text().draftAlreadySaved);
    return;
  }
  clearTimeout(autoSaveTimer);
  stopTimedAutoSave();
  setSaveStatusDot('busy', text().saving);
  setSaveButtonSaved(false);
  showAppLoader(text().savingProject);

  try {
    let committedChapterEdit = false;
    if (!isDraftActive() && isChapterEditUnlocked) {
      const committed = await commitChapterEditDraftToChapter(editorSnapshot);
      if (!committed) return;
      committedChapterEdit = true;
    } else {
      await saveCurrentProject();
    }
    rememberCurrentChapterSaved(committedChapterEdit ? editorSnapshot.editorHTML : null);
    setSaveStatusDot('saved', text().saved);
    if (committedChapterEdit) showMiniReminder(text().chapterEditSaved);
  } catch (error) {
    console.warn('Local save failed:', error);
    setSaveButtonSaved(false);
    setDefaultSaveStatus();
  } finally {
    hideAppLoader();
  }
}

async function selectLocalProjectFolder() {
  if (!supportsLocalProjectFolders()) {
    showProjectGate(text().projectUnsupported);
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({
      id: 'lekhak-manch-story',
      mode: 'readwrite'
    });

    if (!(await verifyProjectPermission(handle, true))) {
      showProjectGate(text().projectPermissionNeeded);
      return;
    }

    showAppLoader(text().loadingProject);
    await loadWorkspaceFolder(handle);
    hideProjectGate();
    refreshProjectUI();
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.warn('Story folder selection failed:', error);
      showProjectGate(text().projectPermissionNeeded);
    }
  } finally {
    hideAppLoader();
  }
}

function sanitizeStoryFolderName(value) {
  const cleaned = String(value || 'Untitled Story')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  return cleaned || 'Untitled Story';
}

async function copyProjectDirectoryContents(sourceDirectory, targetDirectory) {
  for await (const entry of sourceDirectory.values()) {
    if (entry.kind === 'directory') {
      const nextTargetDirectory = await targetDirectory.getDirectoryHandle(entry.name, { create: true });
      await copyProjectDirectoryContents(entry, nextTargetDirectory);
      continue;
    }
    if (entry.kind !== 'file') continue;
    const sourceFile = await entry.getFile();
    const targetFileHandle = await targetDirectory.getFileHandle(entry.name, { create: true });
    const writable = await targetFileHandle.createWritable();
    await writable.write(sourceFile);
    await writable.close();
  }
}

async function removeWorkspaceProjectDirectory(folderName, typeFolderName = '') {
  const parentDirectory = await workspaceProjectParentDirectory(typeFolderName);
  await parentDirectory.removeEntry(folderName, { recursive: true });
}

async function renameActiveStoryFolderIfNeeded(nextTitle, nextType = projectManifest?.type || 'novel') {
  if (!workspaceDirectoryHandle || !projectDirectoryHandle) return projectDirectoryHandle;

  const currentFolderName = projectDirectoryHandle.name || '';
  const nextFolderName = sanitizeStoryFolderName(nextTitle);
  const currentTypeFolderName = currentProjectTypeFolderName();
  const nextTypeFolderName = projectTypeFolderName(nextType);
  if (
    !nextFolderName ||
    (
      uniqueNameKey(nextFolderName) === uniqueNameKey(currentFolderName) &&
      currentTypeFolderName === nextTypeFolderName
    )
  ) {
    return projectDirectoryHandle;
  }

  const targetParentDirectory = await workspaceProjectParentDirectory(nextTypeFolderName, { create: true });
  try {
    const existingHandle = await targetParentDirectory.getDirectoryHandle(nextFolderName);
    const sameLocation = currentTypeFolderName === nextTypeFolderName &&
      uniqueNameKey(existingHandle.name) === uniqueNameKey(currentFolderName);
    if (!sameLocation) throw new Error(text().duplicateStoryTitle);
  } catch (error) {
    if (error.name !== 'NotFoundError') throw error;
  }

  try {
    saveActiveEditorStateForStory(currentFolderName, currentTypeFolderName);
    let didMoveProjectDirectory = false;
    if (typeof projectDirectoryHandle.move === 'function') {
      try {
        if (currentTypeFolderName !== nextTypeFolderName) {
          await projectDirectoryHandle.move(targetParentDirectory, nextFolderName);
        } else {
          await projectDirectoryHandle.move(nextFolderName);
        }
        didMoveProjectDirectory = true;
      } catch (moveError) {
        console.warn('Native story folder move failed, falling back to copy:', moveError);
      }
    }
    if (!didMoveProjectDirectory) {
      const copiedHandle = await targetParentDirectory.getDirectoryHandle(nextFolderName, { create: true });
      await copyProjectDirectoryContents(projectDirectoryHandle, copiedHandle);
      await removeWorkspaceProjectDirectory(currentFolderName, currentTypeFolderName);
    }

    let renamedHandle = projectDirectoryHandle;
    try {
      renamedHandle = await targetParentDirectory.getDirectoryHandle(nextFolderName);
    } catch (readError) {
      console.warn('Renamed story folder handle refresh failed:', readError);
    }
    await saveProjectHandle(renamedHandle);
    projectDirectoryHandle = renamedHandle;
    localStorage.setItem(PROJECT_FOLDER_KEY, renamedHandle.name || nextFolderName);
    setActiveProjectTypeFolderName(nextTypeFolderName);
    migrateActiveEditorStateForStory(
      currentFolderName,
      renamedHandle.name || nextFolderName,
      currentTypeFolderName,
      nextTypeFolderName
    );
    return renamedHandle;
  } catch (error) {
    console.warn('Story folder rename failed:', error);
    return projectDirectoryHandle;
  }
}

async function createUniqueStoryDirectory(baseTitle, type = 'novel') {
  if (!workspaceDirectoryHandle) throw new Error(text().chooseWorkspaceFirst);
  const baseName = sanitizeStoryFolderName(baseTitle);
  const typeFolderName = projectTypeFolderName(type);
  const parentDirectory = await workspaceProjectParentDirectory(typeFolderName, { create: true });

  try {
    await parentDirectory.getDirectoryHandle(baseName);
    throw new Error(text().duplicateStoryTitle);
  } catch (error) {
    if (error.name !== 'NotFoundError') throw error;
  }

  return parentDirectory.getDirectoryHandle(baseName, { create: true });
}

async function workspaceProjectManifestSummaries() {
  if (!workspaceDirectoryHandle) return [];
  const summaries = [];

  const scanProjectDirectory = async (entry, typeFolderName = '') => {
    try {
      const manifest = await readProjectManifestFromDirectory(entry);
      summaries.push({
        folderName: entry.name,
        typeFolderName,
        projectPath: projectWorkspacePath(entry.name, typeFolderName),
        title: manifest.title || entry.name,
        author: manifest.author || '',
        type: manifest.type || 'novel',
        language: manifest.language || 'en',
        createdAt: manifest.createdAt || '',
        updatedAt: manifest.updatedAt || manifest.createdAt || ''
      });
      return true;
    } catch (error) {
      if (error.name !== 'NotFoundError') console.warn('Story scan failed:', entry.name, error);
      return false;
    }
  };

  for await (const entry of workspaceDirectoryHandle.values()) {
    if (entry.kind !== 'directory') continue;
    if (await scanProjectDirectory(entry, '')) continue;

    for await (const childEntry of entry.values()) {
      if (childEntry.kind !== 'directory') continue;
      await scanProjectDirectory(childEntry, entry.name);
    }
  }

  return summaries;
}

async function workspaceStoryTitleExists(storyTitle, excludeFolderName = '', type = '', excludeTypeFolderName = currentProjectTypeFolderName()) {
  if (!workspaceDirectoryHandle) return false;
  const targetKey = uniqueNameKey(storyTitle);
  const targetFolderKey = uniqueNameKey(sanitizeStoryFolderName(storyTitle));
  const excludePathKey = uniqueNameKey(projectWorkspacePath(excludeFolderName, excludeTypeFolderName));
  if (!targetKey) return false;

  const summaries = await workspaceProjectManifestSummaries();
  for (const summary of summaries) {
    const summaryPathKey = uniqueNameKey(summary.projectPath || summary.folderName);
    if (excludePathKey && summaryPathKey === excludePathKey) continue;
    if (uniqueNameKey(summary.folderName) === targetFolderKey) return true;
    if (uniqueNameKey(summary.title || summary.folderName) === targetKey) return true;
  }
  return false;
}

function setStoryLibraryPanel(open) {
  const panel = document.getElementById('storyLibraryPanel');
  const button = document.getElementById('storyLibraryBtn');
  if (!panel || !button) return;
  if (open && typeof closeHomeRecentProjectsPanel === 'function') closeHomeRecentProjectsPanel();
  if (open && panel.hidden && typeof window.prepareFloatingPanelFocusReturn === 'function') {
    window.prepareFloatingPanelFocusReturn(panel);
  }
  panel.hidden = !open;
  button.classList.toggle('is-open', open);
  button.setAttribute('aria-expanded', String(open));
  if (open) positionStoryLibraryPanel();
}

function positionStoryLibraryPanel() {
  const panel = document.getElementById('storyLibraryPanel');
  const button = document.getElementById('storyLibraryBtn');
  if (!panel || !button || panel.hidden) return;
  const buttonRect = button.getBoundingClientRect();
  const positionConfig = lmFloatingPanelPositionConfig?.('storyLibraryPanel', {
    gap: 8,
    topOffset: 0,
    leftOffset: 0,
    rightOffset: 0,
    panelWidth: 250,
    viewportPadding: 12
  }) || {};
  const viewportPadding = lmPanelNumber?.(positionConfig.viewportPadding, 12) ?? 12;
  const gap = lmPanelNumber?.(positionConfig.gap, 8) ?? 8;
  const leftOffset = lmPanelNumber?.(positionConfig.leftOffset, 0) ?? 0;
  const rightOffset = lmPanelNumber?.(positionConfig.rightOffset, 0) ?? 0;
  const topOffset = lmPanelNumber?.(positionConfig.topOffset, 0) ?? 0;
  const panelWidth = Math.min(lmPanelNumber?.(positionConfig.panelWidth, 250) ?? 250, window.innerWidth - viewportPadding * 2);
  panel.style.width = `${panelWidth}px`;
  let left = buttonRect.left + leftOffset - rightOffset;
  left = Math.max(viewportPadding, Math.min(left, window.innerWidth - panelWidth - viewportPadding));
  let top = buttonRect.bottom + gap + topOffset;
  const panelHeight = panel.offsetHeight || 160;
  top = Math.max(viewportPadding, Math.min(top, window.innerHeight - panelHeight - viewportPadding));
  panel.style.inset = `${top}px auto auto ${left}px`;
}

function toggleStoryLibraryPanel(event) {
  event?.preventDefault();
  event?.stopPropagation();
  const panel = document.getElementById('storyLibraryPanel');
  setStoryLibraryPanel(Boolean(panel?.hidden));
}

function closeStoryLibraryPanel() {
  setStoryLibraryPanel(false);
}

function isHomePage() {
  return document.body?.dataset.page === 'home' || window.location.pathname.toLowerCase().endsWith('/home.html');
}

function storyLibraryContextText() {
  const copy = text();
  if (isHomePage()) return copy;
  return {
    ...copy,
    storyLibraryTitle: 'Stories / Novels',
    newStory: 'New Story / Novel',
    openExistingStories: 'Recent Stories / Novels',
    existingStoriesTitle: 'Recent Stories / Novels',
    noExistingStoriesFound: 'No recent stories or novels found'
  };
}

function navigateToWorkspacePage() {
  if (isHomePage()) window.location.href = 'story-novel-project-editor.html';
}

function navigateToNewsWorkspacePage() {
  if (window.location.pathname.toLowerCase().endsWith('/news-article-editor.html')) {
    if (typeof window.restoreNewsWorkspace === 'function') window.restoreNewsWorkspace();
    return;
  }
  window.location.href = 'news-article-editor.html';
}

function navigateToHomePage() {
  if (!isHomePage()) window.location.href = 'home.html';
}

function openNewStoryPanel(anchorId = 'storyLibraryBtn') {
  if (typeof anchorId !== 'string') anchorId = 'storyLibraryBtn';
  if (typeof closeHomeRecentProjectsPanel === 'function') closeHomeRecentProjectsPanel();
  if (!workspaceDirectoryHandle) {
    setHomeMenuStatus(text().chooseWorkspaceFirst);
    showProjectGate(text().chooseWorkspaceFirst);
    return;
  }
  closeStoryLibraryPanel();
  setHomeMenuStatus('');
  openStoryInfoModal({ mode: 'create', anchorId });
}

async function listWorkspaceStories() {
  if (!workspaceDirectoryHandle) return [];
  const stories = await workspaceProjectManifestSummaries();
  return stories.sort((first, second) => first.title.localeCompare(second.title));
}

function projectRecentTimeValue(project = {}) {
  const value = project.updatedAt || project.createdAt || '';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function recentProjectMetaText(project = {}) {
  const typeLabel = storyTypeLabel(project.type);
  const author = project.author ? ` - ${project.author}` : '';
  const updatedAt = project.updatedAt || project.createdAt || '';
  const date = new Date(updatedAt);
  const timeLabel = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(text().locale, { year: 'numeric', month: 'short', day: 'numeric' });
  return [typeLabel + author, timeLabel ? `${text().storyInfoLastSaved}: ${timeLabel}` : '']
    .filter(Boolean)
    .join(' - ');
}

async function listWorkspaceRecentProjects() {
  if (!workspaceDirectoryHandle) return [];
  const projects = await workspaceProjectManifestSummaries();
  return projects.sort((first, second) =>
    projectRecentTimeValue(second) - projectRecentTimeValue(first) ||
    first.title.localeCompare(second.title)
  );
}

function recentProjectButtonHtml(project, dataAttribute = 'data-story-folder') {
  return `
    <button class="story-library-story-btn" type="button" ${dataAttribute}="${escapeHtml(project.projectPath || project.folderName)}">
      <span>${escapeHtml(project.title)}</span>
      <small>${escapeHtml(recentProjectMetaText(project))}</small>
    </button>`;
}

async function renderRecentProjectsList() {
  const libraryCopy = storyLibraryContextText();
  const list = document.getElementById('storyLibraryList');
  if (!list) return;
  list.hidden = false;
  if (!workspaceDirectoryHandle) {
    list.innerHTML = `<div class="story-library-empty">${escapeHtml(text().chooseWorkspaceFirst)}</div>`;
    return;
  }

  list.innerHTML = `<div class="story-library-empty">${escapeHtml(text().loading)}</div>`;
  const stories = await listWorkspaceRecentProjects();
  if (!stories.length) {
    list.innerHTML = `<div class="story-library-empty">${escapeHtml(libraryCopy.noExistingStoriesFound)}</div>`;
  } else {
    list.innerHTML = `
      <div class="story-library-kicker">${escapeHtml(libraryCopy.existingStoriesTitle)}</div>
      ${stories.map(story => recentProjectButtonHtml(story, 'data-story-folder')).join('')}`;
  }
  positionStoryLibraryPanel();
}

async function renderExistingStoriesList() {
  await renderRecentProjectsList();
}

function setHomeMenuStatus(message = '') {
  const status = document.getElementById('homeMenuStatus');
  if (!status) return;
  status.hidden = !message;
  status.textContent = message;
}

function resetHomeStoryList() {
  const list = document.getElementById('homeStoryList');
  if (!list) return;
  list.hidden = true;
  list.innerHTML = '';
}

function setHomeRecentProjectsPanel(open) {
  const panel = document.getElementById('homeRecentProjectsModal');
  if (!panel) return false;
  if (open && !panel.classList.contains('is-visible') && typeof window.prepareFloatingPanelFocusReturn === 'function') {
    window.prepareFloatingPanelFocusReturn(panel);
  }
  panel.classList.toggle('is-visible', Boolean(open));
  if (open) positionHomeRecentProjectsPanel();
  return true;
}

function closeHomeRecentProjectsPanel() {
  setHomeRecentProjectsPanel(false);
}

function positionHomeRecentProjectsPanel() {
  const panel = document.getElementById('homeRecentProjectsModal');
  const card = panel?.querySelector('.home-recent-projects-card');
  const anchor = document.getElementById('storyLibraryBtn') || document.getElementById('openExistingStoriesBtn');
  if (!panel || !card || !anchor || !panel.classList.contains('is-visible')) return;

  const anchorRect = anchor.getBoundingClientRect();
  const positionConfig = lmFloatingPanelPositionConfig?.('homeRecentProjectsPanel', {
    gap: 20,
    topOffset: 50,
    leftOffset: 120,
    rightOffset: 0,
    viewportPadding: 12,
    panelWidth: 430
  }) || {
    gap: 20,
    topOffset: 50,
    leftOffset: 120,
    rightOffset: 0,
    viewportPadding: 12,
    panelWidth: 430
  };
  const gap = lmPanelNumber?.(positionConfig.gap, 20) ?? 20;
  const viewportPadding = lmPanelNumber?.(positionConfig.viewportPadding, 12) ?? 12;
  const leftOffset = lmPanelNumber?.(positionConfig.leftOffset, 120) ?? 120;
  const rightOffset = lmPanelNumber?.(positionConfig.rightOffset, 0) ?? 0;
  const topOffset = lmPanelNumber?.(positionConfig.topOffset, 50) ?? 50;
  const panelWidth = Math.min(lmPanelNumber?.(positionConfig.panelWidth, 430) ?? 430, window.innerWidth - viewportPadding * 2);
  panel.style.width = `${panelWidth}px`;

  const cardHeight = Math.min(card.offsetHeight || 420, window.innerHeight - viewportPadding * 2);
  let left = anchorRect.right + gap + leftOffset - rightOffset;
  if (left + panelWidth > window.innerWidth - viewportPadding) {
    left = Math.max(viewportPadding, anchorRect.left - panelWidth - gap + leftOffset - rightOffset);
  }
  let top = anchorRect.top + topOffset;
  top = Math.max(viewportPadding, Math.min(top, window.innerHeight - cardHeight - viewportPadding));
  panel.style.inset = `${top}px auto auto ${left}px`;
}

function openWritingTypePlaceholder(label) {
  setHomeMenuStatus(`${label} desk overview is ready. Its dedicated project creator will be connected next.`);
}

function homeRecentProjectsEmptyHtml(title, body, actionHtml = '') {
  return `
    <div class="home-recent-projects-empty">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(body)}</p>
      ${actionHtml}
    </div>`;
}

async function renderHomeRecentProjectsPanel() {
  const list = document.getElementById('homeRecentProjectsPanelList');
  const count = document.getElementById('homeRecentProjectsCount');
  if (!list) return false;

  resetHomeStoryList();
  closeStoryLibraryPanel();
  setHomeMenuStatus('');
  if (count) {
    count.textContent = text().existingStoriesTitle || 'Recent Projects';
    count.hidden = false;
  }
  list.innerHTML = homeRecentProjectsEmptyHtml(text().loading, 'Project list is loading...');
  setHomeRecentProjectsPanel(true);

  if (!workspaceDirectoryHandle) {
    if (count) count.textContent = text().chooseWorkspaceFirst;
    list.innerHTML = homeRecentProjectsEmptyHtml(
      text().chooseWorkspaceFirst,
      'Choose a workspace folder first, then recent projects will appear here.',
      `<button type="button" onclick="selectLocalProjectFolder()">${escapeHtml(text().projectSelect || 'Choose Folder')}</button>`
    );
    setHomeMenuStatus(text().chooseWorkspaceFirst);
    positionHomeRecentProjectsPanel();
    return true;
  }

  const stories = await listWorkspaceRecentProjects();
  if (count) count.textContent = stories.length ? `${stories.length} project${stories.length === 1 ? '' : 's'}` : text().noExistingStoriesFound;
  list.innerHTML = stories.length
    ? `<div class="story-library-kicker">${escapeHtml(text().existingStoriesTitle)}</div>
      ${stories.map(story => recentProjectButtonHtml(story, 'data-home-recent-story-folder')).join('')}`
    : homeRecentProjectsEmptyHtml(text().noExistingStoriesFound, 'No project has been created in this workspace yet.');
  positionHomeRecentProjectsPanel();
  return true;
}

async function renderHomeRecentProjectsList() {
  if (document.getElementById('homeRecentProjectsModal')) {
    await renderHomeRecentProjectsPanel();
    return;
  }

  const list = document.getElementById('homeStoryList');
  if (!list) return;
  list.hidden = false;

  if (!workspaceDirectoryHandle) {
    list.innerHTML = `<div class="story-library-empty">${escapeHtml(text().chooseWorkspaceFirst)}</div>`;
    setHomeMenuStatus(text().chooseWorkspaceFirst);
    showProjectGate(text().chooseWorkspaceFirst);
    return;
  }

  setHomeMenuStatus('');
  list.innerHTML = `<div class="story-library-empty">${escapeHtml(text().loading)}</div>`;
  const stories = await listWorkspaceRecentProjects();
  list.innerHTML = stories.length
    ? `<div class="story-library-kicker">${escapeHtml(text().existingStoriesTitle)}</div>
      ${stories.map(story => recentProjectButtonHtml(story, 'data-home-story-folder')).join('')}`
    : `<div class="story-library-empty">${escapeHtml(text().noExistingStoriesFound)}</div>`;
  positionStoryLibraryPanel();
}

async function renderHomeExistingStoriesList() {
  await renderHomeRecentProjectsList();
}

async function resolveWorkspaceStoryHandle(storyReference) {
  if (!workspaceDirectoryHandle) throw new Error(text().chooseWorkspaceFirst);
  const reference = String(storyReference || '').trim();
  if (!reference) throw new DOMException(text().noExistingStoriesFound, 'NotFoundError');

  const referenceParts = splitProjectPath(reference);
  if (referenceParts.length > 1) {
    try {
      const folderName = referenceParts.pop();
      let directory = workspaceDirectoryHandle;
      for (const part of referenceParts) {
        directory = await directory.getDirectoryHandle(part);
      }
      const handle = await directory.getDirectoryHandle(folderName);
      return {
        handle,
        typeFolderName: referenceParts.join('/')
      };
    } catch (pathError) {
      if (pathError.name !== 'NotFoundError') throw pathError;
    }
  }

  try {
    const handle = await workspaceDirectoryHandle.getDirectoryHandle(reference);
    return { handle, typeFolderName: '' };
  } catch (directError) {
    if (directError.name !== 'NotFoundError') throw directError;
  }

  const referenceKey = uniqueNameKey(reference);
  const referenceFolderKey = uniqueNameKey(sanitizeStoryFolderName(reference));
  const summaries = await workspaceProjectManifestSummaries();
  for (const summary of summaries) {
    const titleKey = uniqueNameKey(summary.title || summary.folderName);
    const titleFolderKey = uniqueNameKey(sanitizeStoryFolderName(summary.title || summary.folderName));
    if (
      uniqueNameKey(summary.folderName) === referenceKey ||
      uniqueNameKey(summary.folderName) === referenceFolderKey ||
      uniqueNameKey(summary.projectPath) === referenceKey ||
      uniqueNameKey(summary.projectPath) === referenceFolderKey ||
      titleKey === referenceKey ||
      titleFolderKey === referenceFolderKey
    ) {
      const handle = await workspaceProjectDirectoryHandle(summary.folderName, summary.typeFolderName);
      return { handle, typeFolderName: summary.typeFolderName || '' };
    }
  }

  throw new DOMException(text().noExistingStoriesFound, 'NotFoundError');
}

async function openWorkspaceStory(folderName) {
  if (!workspaceDirectoryHandle) return;
  showAppLoader(text().loadingProject);
  try {
    const resolvedStory = await resolveWorkspaceStoryHandle(folderName);
    const storyHandle = resolvedStory?.handle || resolvedStory;
    const typeFolderName = resolvedStory?.typeFolderName || '';
    if (!(await verifyProjectPermission(storyHandle, true))) {
      showProjectGate(text().projectPermissionNeeded);
      return;
    }
    const manifest = await readProjectManifestFromDirectory(storyHandle);
    if (isNewsProjectType(manifest.type)) {
      await activateNewsProjectHandle(storyHandle, typeFolderName, manifest);
      closeStoryLibraryPanel();
      if (typeof closeHomeRecentProjectsPanel === 'function') closeHomeRecentProjectsPanel();
      resetHomeStoryList();
      setHomeMenuStatus('');
      hideProjectGate();
      if (typeof saveToStorage === 'function') saveToStorage(false);
      navigateToNewsWorkspacePage();
      return;
    }
    const loaded = await loadLocalProject(storyHandle, true, { typeFolderName });
    if (!loaded) {
      setSaveStatusDot('idle', text().noExistingStoriesFound);
      return;
    }
    closeStoryLibraryPanel();
    if (typeof closeHomeRecentProjectsPanel === 'function') closeHomeRecentProjectsPanel();
    resetHomeStoryList();
    setHomeMenuStatus('');
    hideProjectGate();
    if (typeof saveToStorage === 'function') saveToStorage(false);
    if (isHomePage()) {
      navigateToWorkspacePage();
      return;
    }
    refreshProjectUI();
  } catch (error) {
    console.warn('Story open failed:', error);
    const message = error?.name === 'NotFoundError'
      ? text().noExistingStoriesFound
      : error?.message || text().projectPermissionNeeded;
    setHomeMenuStatus(message);
    showMiniReminder(message);
    setDefaultSaveStatus();
  } finally {
    hideAppLoader();
  }
}

async function createStoryFromInfoForm() {
  if (!workspaceDirectoryHandle) {
    showProjectGate(text().chooseWorkspaceFirst);
    return;
  }

  const storyTitle = document.getElementById('storyTitleInp').value.trim() || 'Untitled Story';
  const storyType = document.getElementById('storyTypeInp').value || 'novel';
  if (!isSupportedStoryProjectType(storyType)) {
    const reminder = text().projectTypeUnsupported || 'Only Story Writing, Novel Writing, and News Article Writing can be created right now.';
    setHomeMenuStatus(reminder);
    showMiniReminder(reminder);
    return;
  }
  const typeFolderName = projectTypeFolderName(storyType);
  if (await workspaceStoryTitleExists(storyTitle, '', storyType, '')) {
    showDuplicateReminder(text().duplicateStoryTitle);
    setHomeMenuStatus(text().duplicateStoryTitle);
    return;
  }
  if (isNewsProjectType(storyType)) {
    await createNewsProjectFromInfoForm(storyTitle, typeFolderName);
    return;
  }
  const storyHandle = await createUniqueStoryDirectory(storyTitle, storyType);
  projectDirectoryHandle = storyHandle;
  setActiveProjectTypeFolderName(typeFolderName);
  projectManifest = createProjectManifest(storyTitle);
  projectManifest.type = storyType;
  projectManifest.author = document.getElementById('storyAuthorInp').value.trim();
  projectManifest.language = document.getElementById('storyLanguageInp').value === 'hi' ? 'hi' : 'en';
  projectManifest.synopsis = document.getElementById('storySynopsisInp').value.trim();
  projectManifest = normalizeProjectManifest(projectManifest);

  chapters = chaptersFromManifest(projectManifest);
  chapterDrafts = [normalizeDraft({
    ...createDefaultDraft(0),
    title: text().defaultChapterTitle,
    contentPath: draftFilePath(0)
  }, 0)];
  chapterTrashDrafts = [];
  chapterEditDrafts = [];
  namingData = normalizeNamingData();
  storyFacts = [];
  curChap = 0;
  curPart = -1;
  curDraft = 0;
  curTrashDraft = -1;
  expandedPartIndex = -1;
  activeEditorMode = 'draft';
  isDraftTrashMode = false;
  trashReturnEditorState = null;
  selectedTrashDraftIndexes.clear();
  lastSelectedTrashDraftIndex = null;

  await saveProjectHandle(storyHandle);
  localStorage.setItem(PROJECT_MODE_KEY, 'local');
  localStorage.setItem(PROJECT_FOLDER_KEY, storyHandle.name || '');
  setActiveProjectTypeFolderName(typeFolderName);
  await getProjectDirectoryHandle('Chapters', { create: true });
  await getProjectDirectoryHandle('Drafts', { create: true });
  await getProjectDirectoryHandle(PROJECT_TRASH_DIR, { create: true });
  await getProjectDirectoryHandle(PROJECT_CHAPTER_EDIT_DRAFTS_DIR, { create: true });
  await writeProjectManifest(projectManifest, { touchUpdated: false });
  const draftHandle = await getProjectFileHandle(chapterDrafts[0].contentPath, { create: true });
  chapterDrafts[0].contentHandle = draftHandle;
  await writeFileText(draftHandle, '');
  await writeNamingDataToProject();
  await writeDraftsDataToProject();
  await writeTrashDraftsDataToProject();
  await writeChapterEditDraftsToProject();

  closeStoryInfoModal();
  hideProjectGate();
  if (typeof saveToStorage === 'function') saveToStorage(false);
  if (isHomePage()) {
    navigateToWorkspacePage();
    return;
  }
  refreshProjectUI();
  setSaveStatusDot('saved', text().storyCreated);
}

async function loadChapterContent(chapter) {
  if (!chapter.contentPath || chapter.content) return;

  try {
    if (projectDirectoryHandle) {
      const fileHandle = await getProjectFileHandle(chapter.contentPath, { create: true });
      chapter.contentHandle = fileHandle;
      const fileText = await readFileText(fileHandle);
      chapter.content = textToEditorHTML(fileText);
      chapter._wordCount = countWordsFromText(fileText);
      return;
    }
  } catch (error) {
    console.warn('Chapter content load failed:', chapter.contentPath, error);
  }
}

async function loadDraftContent(draft) {
  if (!draft.contentPath || draft.content) return;

  try {
    if (projectDirectoryHandle) {
      const fileHandle = await getProjectFileHandle(draft.contentPath, { create: true });
      draft.contentHandle = fileHandle;
      const fileText = await readFileText(fileHandle);
      draft.content = textToEditorHTML(fileText);
      draft._wordCount = countWordsFromText(fileText);
    }
  } catch (error) {
    console.warn('Draft content load failed:', draft.contentPath, error);
  }
}

async function loadChapterEditDraftContent(draft) {
  if (!draft?.contentPath || draft.content) return;

  try {
    if (projectDirectoryHandle) {
      const fileHandle = await getProjectFileHandle(draft.contentPath, { create: true });
      draft.contentHandle = fileHandle;
      const fileText = await readFileText(fileHandle);
      draft.content = textToEditorHTML(fileText);
      draft.lastAutosavedHTML = draft.lastAutosavedHTML || draft.content;
      draft.lastAutosavedText = draft.lastAutosavedText || fileText.replace(/\r\n?/g, '\n').trimEnd();
      chapterEditDrafts[draft.chapterKey] = normalizeChapterEditDraft(draft, draft.chapterKey);
    }
  } catch (error) {
    console.warn('Chapter edit draft content load failed:', draft.contentPath, error);
  }
}

function text() {
  return translations.en;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function uniqueNameKey(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function showMiniReminder(message) {
  if (!message) return;
  let reminder = document.getElementById('miniFloatingReminder');
  if (!reminder) {
    reminder = document.createElement('div');
    reminder.id = 'miniFloatingReminder';
    reminder.className = 'mini-floating-reminder';
    reminder.setAttribute('role', 'status');
    reminder.setAttribute('aria-live', 'polite');
    document.body.appendChild(reminder);
  }

  clearTimeout(miniReminderTimer);
  reminder.textContent = message;
  reminder.classList.add('is-visible');
  miniReminderTimer = setTimeout(() => {
    reminder.classList.remove('is-visible');
  }, 2600);
}

function showDuplicateReminder(message) {
  showMiniReminder(message);
  setSaveStatusDot('dirty', message);
}

function partTitleExists(title, excludePartIndex = -1) {
  const titleKey = uniqueNameKey(title);
  if (!titleKey) return false;
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  return manifest.parts.some((part, index) => index !== excludePartIndex && uniqueNameKey(part.title) === titleKey);
}

function chapterTitleExists(title, excludeChapterIndex = -1) {
  const titleKey = uniqueNameKey(title);
  if (!titleKey) return false;
  ensureChapters();
  return chapters.some((chapter, index) => index !== excludeChapterIndex && uniqueNameKey(chapterDisplayTitle(chapter, index)) === titleKey);
}

function namingCategoryTitleExists(title, excludeCategoryId = '') {
  const titleKey = uniqueNameKey(title);
  if (!titleKey) return false;
  namingData = normalizeNamingData(namingData);
  return namingData.categories.some(category => category.id !== excludeCategoryId && uniqueNameKey(category.title) === titleKey);
}

function factKeywordExists(keyword, excludeFactId = '') {
  const keywordKey = uniqueNameKey(keyword);
  if (!keywordKey) return false;
  storyFacts = normalizeStoryFacts(storyFacts);
  return storyFacts.some(fact => fact.id !== excludeFactId && uniqueNameKey(fact.keyword) === keywordKey);
}

function setTitle(id, value) {
  const el = document.getElementById(id);
  if (el) el.title = value;
}

function setPlaceholder(id, value) {
  const el = document.getElementById(id);
  if (el) el.placeholder = value;
}

function createStatusVisibilityMap(value = true) {
  return EDITOR_STATUS_KEYS.reduce((statusMap, statusKey) => {
    statusMap[statusKey] = Boolean(value);
    return statusMap;
  }, {});
}

function createDefaultStatusVisibilityMap() {
  return {
    ...createStatusVisibilityMap(false),
    save: true,
    words: true,
    paragraphs: true
  };
}

function normalizeStatusVisibility(savedValue) {
  if (savedValue === null) return createDefaultStatusVisibilityMap();
  if (savedValue === 'true' || savedValue === 'false') {
    return createStatusVisibilityMap(savedValue === 'true');
  }

  try {
    const parsedValue = JSON.parse(savedValue);
    if (parsedValue && typeof parsedValue === 'object') {
      return {
        ...createDefaultStatusVisibilityMap(),
        ...Object.fromEntries(
          EDITOR_STATUS_KEYS
            .filter(statusKey => Object.prototype.hasOwnProperty.call(parsedValue, statusKey))
            .map(statusKey => [statusKey, parsedValue[statusKey] !== false])
        )
      };
    }
  } catch (error) {
    console.warn('Status visibility settings parse failed:', error);
  }

  return createDefaultStatusVisibilityMap();
}

function normalizeStatusVisibilityValue(value) {
  if (value && typeof value === 'object') return normalizeStatusVisibility(JSON.stringify(value));
  if (typeof value === 'string') return normalizeStatusVisibility(value);
  if (value === true || value === false) return createStatusVisibilityMap(value);
  return createDefaultStatusVisibilityMap();
}

function normalizeBooleanSetting(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function editorSettingsDefaultFocusTime() {
  if (typeof editorAutoScrollDefaultFocusTimeMs === 'function') return editorAutoScrollDefaultFocusTimeMs();
  const focusTimeKey = typeof EDITOR_AUTO_SCROLL_FOCUS_TIME_KEY === 'string'
    ? EDITOR_AUTO_SCROLL_FOCUS_TIME_KEY
    : '';
  const storedValue = focusTimeKey ? Number(localStorage.getItem(focusTimeKey)) : NaN;
  return Number.isFinite(storedValue) && storedValue > 0 ? Math.round(storedValue) : 320;
}

function normalizeEditorSettings(settings = null) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const defaults = {
    autosaveEnabled: true,
    autoScrollEnabled: true,
    autoScrollMode: 'depth',
    autoScrollEmptyParagraphOnly: false,
    autoScrollFocusTime: editorSettingsDefaultFocusTime(),
    autoScrollDepth: null,
    autoScrollBandTop: null,
    autoScrollBandBottom: null,
    visibleStatuses: createDefaultStatusVisibilityMap(),
    findMode: 'safe',
    replaceScope: 'all'
  };

  const rawFocusTime = source.autoScrollFocusTime
    ?? source.auto_scroll_focus_time
    ?? source.editorAutoScrollFocusTime
    ?? source.focusTime;
  const normalizedFocusTime = typeof normalizeEditorAutoScrollFocusTime === 'function'
    ? normalizeEditorAutoScrollFocusTime(rawFocusTime ?? defaults.autoScrollFocusTime)
    : Math.max(1, Math.round(Number(rawFocusTime ?? defaults.autoScrollFocusTime) || defaults.autoScrollFocusTime));

  return {
    autosaveEnabled: normalizeBooleanSetting(
      source.autosaveEnabled ?? source.autoSaveEnabled ?? source.autosave_enabled,
      defaults.autosaveEnabled
    ),
    autoScrollEnabled: normalizeBooleanSetting(
      source.autoScrollEnabled ?? source.editorAutoScrollEnabled ?? source.auto_scroll_enabled,
      defaults.autoScrollEnabled
    ),
    autoScrollMode: normalizeEditorAutoScrollMode(
      source.autoScrollMode ?? source.editorAutoScrollMode ?? source.auto_scroll_mode ?? defaults.autoScrollMode
    ),
    autoScrollEmptyParagraphOnly: normalizeBooleanSetting(
      source.autoScrollEmptyParagraphOnly
        ?? source.editorAutoScrollEmptyOnly
        ?? source.auto_scroll_empty_paragraph_only,
      defaults.autoScrollEmptyParagraphOnly
    ),
    autoScrollFocusTime: normalizedFocusTime,
    autoScrollDepth: normalizeNullableEditorSetting(
      source.autoScrollDepth ?? source.editorAutoScrollDepth ?? source.auto_scroll_depth ?? defaults.autoScrollDepth
    ),
    autoScrollBandTop: normalizeNullableEditorSetting(
      source.autoScrollBandTop ?? source.editorAutoScrollBandTop ?? source.auto_scroll_band_top ?? defaults.autoScrollBandTop
    ),
    autoScrollBandBottom: normalizeNullableEditorSetting(
      source.autoScrollBandBottom ?? source.editorAutoScrollBandBottom ?? source.auto_scroll_band_bottom ?? defaults.autoScrollBandBottom
    ),
    visibleStatuses: normalizeStatusVisibilityValue(
      source.visibleStatuses ?? source.visible_statuses ?? source.statuses ?? defaults.visibleStatuses
    ),
    findMode: normalizeEditorFindMode(source.findMode ?? source.editorFindMode ?? source.find_mode ?? defaults.findMode),
    replaceScope: normalizeEditorReplaceScope(
      source.replaceScope ?? source.editorReplaceScope ?? source.replace_scope ?? defaults.replaceScope
    )
  };
}

function normalizeNullableEditorSetting(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function normalizeEditorFindMode(mode) {
  return EDITOR_FIND_MODES.includes(mode) ? mode : 'safe';
}

function normalizeEditorReplaceScope(scope) {
  return EDITOR_REPLACE_SCOPES.includes(scope) ? scope : 'all';
}

function isEditorFindModeSystemActive() {
  return !(typeof isChapterReviewModeForEditorSettings === 'function' && isChapterReviewModeForEditorSettings());
}

function isEditorAutoScrollSystemActive() {
  return Boolean(
    isEditorAutoScrollEnabled &&
    !(typeof isChapterReviewModeForEditorSettings === 'function' && isChapterReviewModeForEditorSettings()) &&
    (typeof canEditActiveDocument !== 'function' || canEditActiveDocument())
  );
}

function currentEditorFindMode() {
  editorFindMode = normalizeEditorFindMode(editorFindMode);
  return isEditorFindModeSystemActive() ? editorFindMode : 'deep';
}

function currentEditorReplaceScope() {
  editorReplaceScope = normalizeEditorReplaceScope(editorReplaceScope);
  return editorReplaceScope;
}

function editorFindModeLabel(mode = currentEditorFindMode(), short = false) {
  const copy = text();
  const safeMode = normalizeEditorFindMode(mode);
  if (safeMode === 'safe') return short ? copy.safeFindShort : copy.safeFind;
  if (safeMode === 'raw') return short ? copy.rawFindShort : copy.rawFind;
  return short ? copy.deepFindShort : copy.deepFind;
}

function editorReplaceScopeLabel(scope = currentEditorReplaceScope(), short = false) {
  const copy = text();
  const safeScope = normalizeEditorReplaceScope(scope);
  if (safeScope === 'after') return short ? copy.replaceScopeAfterShort : copy.replaceScopeAfter;
  if (safeScope === 'before') return short ? copy.replaceScopeBeforeShort : copy.replaceScopeBefore;
  return short ? copy.replaceScopeAllShort : copy.replaceScopeAll;
}

function visibleStatusCount() {
  const statusKeys = isTrashDraftActive() ? EDITOR_STAT_KEYS : EDITOR_STATUS_KEYS;
  return statusKeys.filter(statusKey => visibleEditorStatuses[statusKey]).length;
}

function applyHeaderStatusVisibility() {
  const hasVisibleStatus = visibleStatusCount() > 0;
  const hasVisibleStat = EDITOR_STAT_KEYS.some(statusKey => visibleEditorStatuses[statusKey]);
  const panel = document.getElementById('editor-info-panel');
  const statBar = document.getElementById('stat-bar');
  const focusStats = document.getElementById('focus-stats');

  if (panel) panel.classList.toggle('is-status-hidden', !hasVisibleStatus);
  if (statBar) statBar.hidden = !hasVisibleStat;
  if (focusStats) focusStats.hidden = !hasVisibleStat;
  document.querySelectorAll('[data-status-key]').forEach(statusEl => {
    const statusKey = statusEl.dataset.statusKey;
    statusEl.hidden = isTrashDraftActive() && statusKey === 'save'
      ? true
      : !visibleEditorStatuses[statusKey];
  });
  if (!hasVisibleStat && typeof hideFocusScrollStats === 'function') hideFocusScrollStats();
  syncFocusSaveStatusIndicator();
}

function defaultSaveStatusText() {
  return isAutoSaveEnabled ? text().autosave : text().autosaveOff;
}

function currentSaveStatusState() {
  const statusDot = document.getElementById('save-status');
  if (!statusDot || statusDot.hidden || !statusDot.classList.contains('is-visible')) return 'idle';
  if (statusDot.classList.contains('is-busy')) return 'busy';
  if (statusDot.classList.contains('is-dirty')) return 'dirty';
  if (statusDot.classList.contains('is-saved')) return 'saved';
  return 'idle';
}

function syncFocusSaveStatusIndicator(state = currentSaveStatusState(), label = document.getElementById('save-status')?.title || '') {
  const editor = document.getElementById('editor');
  if (!editor) return;

  const canEdit = typeof canEditActiveDocument === 'function' && canEditActiveDocument();
  const canShow = Boolean(
    isFocus &&
    canEdit &&
    visibleEditorStatuses.save &&
    !isTrashDraftActive() &&
    state !== 'idle'
  );
  const stateClasses = [
    'is-focus-save-indicator',
    'is-focus-save-busy',
    'is-focus-save-dirty',
    'is-focus-save-saved'
  ];

  editor.classList.remove(...stateClasses);
  editor.removeAttribute('data-focus-save-status');
  editor.removeAttribute('data-focus-save-label');

  if (!canShow) return;

  editor.classList.add('is-focus-save-indicator', `is-focus-save-${state}`);
  editor.dataset.focusSaveStatus = state;
  if (label) editor.dataset.focusSaveLabel = label;
}

function setSaveStatusDot(state = 'idle', label = defaultSaveStatusText()) {
  const statusDot = document.getElementById('save-status');
  if (!statusDot) return;

  if (isTrashDraftActive()) {
    statusDot.textContent = '';
    statusDot.hidden = true;
    statusDot.classList.remove('is-visible', 'is-busy', 'is-dirty', 'is-saved');
    syncFocusSaveStatusIndicator('idle');
    return;
  }

  clearTimeout(saveStatusHideTimer);
  clearTimeout(saveStatusSettleTimer);
  statusDot.hidden = !visibleEditorStatuses.save;
  statusDot.textContent = '';
  statusDot.setAttribute('aria-label', label);
  statusDot.title = label;
  statusDot.classList.toggle('is-visible', state !== 'idle');
  statusDot.classList.toggle('is-busy', state === 'busy');
  statusDot.classList.toggle('is-dirty', state === 'dirty');
  statusDot.classList.toggle('is-saved', state === 'saved');
  syncFocusSaveStatusIndicator(state, label);

  if (state === 'saved') {
    saveStatusHideTimer = setTimeout(() => setSaveStatusDot('idle', label), 2500);
  }
}

function setSidePanelSaveLine(state = 'idle', label = text().saved) {
  const saveLine = document.getElementById('side-panel-save-line');
  if (!saveLine) return;

  clearTimeout(sidePanelSaveLineHideTimer);
  saveLine.setAttribute('aria-label', label);
  saveLine.title = label;
  saveLine.classList.toggle('is-visible', state !== 'idle');
  saveLine.classList.toggle('is-busy', state === 'busy');
  saveLine.classList.toggle('is-saved', state === 'saved');

  if (state === 'saved') {
    sidePanelSaveLineHideTimer = setTimeout(() => setSidePanelSaveLine('idle', label), 1600);
  }
}

function showSidePanelSaveLine(label = text().saved) {
  setSidePanelSaveLine('saved', label);
}

function showUnsavedSaveStatus(label = text().unsaved) {
  setSaveStatusDot('busy', label);
  saveStatusSettleTimer = setTimeout(() => {
    if (isChapterEditDraftActive() || getCleanEditorHTML() !== lastSavedChapterHTML) {
      setSaveStatusDot('dirty', text().unsaved);
    }
  }, 650);
}

function setDefaultSaveStatus() {
  setSaveStatusDot('idle', defaultSaveStatusText());
}

function normalizeEditorAutoScrollMode(mode) {
  return EDITOR_AUTO_SCROLL_MODES.includes(mode) ? mode : 'depth';
}

function currentEditorAutoScrollMode() {
  editorAutoScrollMode = normalizeEditorAutoScrollMode(editorAutoScrollMode);
  return editorAutoScrollMode;
}

function editorAutoScrollModeLabel(mode = currentEditorAutoScrollMode(), short = false) {
  const copy = text();
  const safeMode = normalizeEditorAutoScrollMode(mode);
  if (safeMode === 'band') return short ? copy.editorAutoScrollModeBandShort : copy.editorAutoScrollModeBand;
  return short ? copy.editorAutoScrollModeDepthShort : copy.editorAutoScrollModeDepth;
}

function saveEditorSettings() {
  const settings = currentEditorSettingsSnapshot();
  writeEditorSettingsToLocalStorage(settings);
  persistEditorSettingsToActiveDocument(settings);
  return settings;
}

function currentEditorSettingsSnapshot() {
  return normalizeEditorSettings({
    autosaveEnabled: isAutoSaveEnabled,
    autoScrollEnabled: isEditorAutoScrollEnabled,
    autoScrollMode: currentEditorAutoScrollMode(),
    autoScrollEmptyParagraphOnly: isEditorAutoScrollEmptyParagraphOnly,
    autoScrollFocusTime: typeof currentEditorAutoScrollFocusTimeMs === 'function'
      ? currentEditorAutoScrollFocusTimeMs()
      : localStorage.getItem(EDITOR_AUTO_SCROLL_FOCUS_TIME_KEY),
    autoScrollDepth: localStorage.getItem(EDITOR_AUTO_SCROLL_DEPTH_KEY),
    autoScrollBandTop: localStorage.getItem(EDITOR_AUTO_SCROLL_BAND_TOP_KEY),
    autoScrollBandBottom: localStorage.getItem(EDITOR_AUTO_SCROLL_BAND_BOTTOM_KEY),
    visibleStatuses: visibleEditorStatuses,
    findMode: editorFindMode,
    replaceScope: editorReplaceScope
  });
}

function setLocalStorageNullableSetting(key, value) {
  const normalizedValue = normalizeNullableEditorSetting(value);
  if (normalizedValue === null) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, normalizedValue);
  }
}

function writeEditorSettingsToLocalStorage(settings) {
  const normalizedSettings = normalizeEditorSettings(settings);
  localStorage.setItem(AUTOSAVE_ENABLED_KEY, String(normalizedSettings.autosaveEnabled));
  localStorage.setItem(EDITOR_AUTO_SCROLL_ENABLED_KEY, String(normalizedSettings.autoScrollEnabled));
  localStorage.setItem(EDITOR_AUTO_SCROLL_MODE_KEY, normalizedSettings.autoScrollMode);
  localStorage.setItem(EDITOR_AUTO_SCROLL_EMPTY_ONLY_KEY, String(normalizedSettings.autoScrollEmptyParagraphOnly));
  localStorage.setItem(STATUS_VISIBILITY_KEY, JSON.stringify(normalizedSettings.visibleStatuses));
  localStorage.setItem(FIND_MODE_STORAGE_KEY, normalizedSettings.findMode);
  localStorage.setItem(REPLACE_SCOPE_STORAGE_KEY, normalizedSettings.replaceScope);
  localStorage.setItem(EDITOR_AUTO_SCROLL_FOCUS_TIME_KEY, String(normalizedSettings.autoScrollFocusTime));
  setLocalStorageNullableSetting(EDITOR_AUTO_SCROLL_DEPTH_KEY, normalizedSettings.autoScrollDepth);
  setLocalStorageNullableSetting(EDITOR_AUTO_SCROLL_BAND_TOP_KEY, normalizedSettings.autoScrollBandTop);
  setLocalStorageNullableSetting(EDITOR_AUTO_SCROLL_BAND_BOTTOM_KEY, normalizedSettings.autoScrollBandBottom);
}

function activeEditorSettingsDocument() {
  if (isTrashDraftActive()) return null;
  if (isChapterEditDraftActive()) return activeChapterEditDraft() || chapters[curChap] || null;
  return activeEditorDocument() || null;
}

function persistEditorSettingsToActiveDocument(settings) {
  const documentItem = activeEditorSettingsDocument();
  if (!documentItem) return;
  documentItem.editorSettings = normalizeEditorSettings(settings);
}

function applyEditorSettingsSnapshot(settings) {
  const normalizedSettings = normalizeEditorSettings(settings);
  isAutoSaveEnabled = normalizedSettings.autosaveEnabled;
  isEditorAutoScrollEnabled = normalizedSettings.autoScrollEnabled;
  editorAutoScrollMode = normalizeEditorAutoScrollMode(normalizedSettings.autoScrollMode);
  isEditorAutoScrollEmptyParagraphOnly = normalizedSettings.autoScrollEmptyParagraphOnly;
  visibleEditorStatuses = normalizeStatusVisibilityValue(normalizedSettings.visibleStatuses);
  editorFindMode = normalizeEditorFindMode(normalizedSettings.findMode);
  editorReplaceScope = normalizeEditorReplaceScope(normalizedSettings.replaceScope);
  writeEditorSettingsToLocalStorage(normalizedSettings);
  if (typeof restoreEditorAutoScrollDepthSetting === 'function') restoreEditorAutoScrollDepthSetting();

  if (!isAutoSaveEnabled && typeof stopTimedAutoSave === 'function') stopTimedAutoSave();
  if (typeof setDefaultSaveStatus === 'function') setDefaultSaveStatus();
  if (typeof updateEditorSettingsUI === 'function') updateEditorSettingsUI();
  if (typeof positionEditorAutoScrollDepthMarker === 'function') positionEditorAutoScrollDepthMarker();
  if (typeof syncEditorAutoScrollFocusSpeedControl === 'function') syncEditorAutoScrollFocusSpeedControl();
  if (isEditorAutoScrollSystemActive() && typeof scheduleEditorCaretAutoScroll === 'function') {
    scheduleEditorCaretAutoScroll();
  } else if (typeof cancelEditorCaretAutoScroll === 'function') {
    cancelEditorCaretAutoScroll();
  }

  return normalizedSettings;
}

function applyActiveEditorSettingsForDocument(documentItem = activeEditorSettingsDocument()) {
  if (isTrashDraftActive()) return null;
  const normalizedSettings = applyEditorSettingsSnapshot(documentItem?.editorSettings || null);
  if (documentItem) documentItem.editorSettings = normalizedSettings;
  return normalizedSettings;
}

function setEditorSettingsPanel(open) {
  const settingsPanel = document.getElementById('editorSettingsPanel');
  if (open && settingsPanel?.hidden && typeof window.prepareFloatingPanelFocusReturn === 'function') {
    window.prepareFloatingPanelFocusReturn(settingsPanel);
  }
  isEditorSettingsOpen = open;
  if (!open) {
    isStatusSelectorOpen = false;
    isFindSettingsSelectorOpen = false;
    isReplaceSettingsSelectorOpen = false;
    isEditorAutoScrollModeSelectorOpen = false;
  } else if (isTrashModeForEditorSettings()) {
    isStatusSelectorOpen = false;
    isFindSettingsSelectorOpen = false;
    isReplaceSettingsSelectorOpen = false;
    isEditorAutoScrollModeSelectorOpen = false;
  }
  updateEditorSettingsUI();
}

function toggleEditorSettings(event) {
  if (event) event.stopPropagation();
  setEditorSettingsPanel(!isEditorSettingsOpen);
}

function isChapterReviewModeForEditorSettings() {
  return hasActiveStory() &&
    activeEditorMode === 'chapter' &&
    curChap >= 0 &&
    Array.isArray(chapters) &&
    Boolean(chapters[curChap]) &&
    !isChapterEditUnlocked &&
    !isDraftActive() &&
    !isTrashDraftActive();
}

function isTrashModeForEditorSettings() {
  return Boolean(isDraftTrashMode || isTrashDraftActive());
}

function editorSettingsStatusKeys() {
  return isTrashModeForEditorSettings() || isChapterReviewModeForEditorSettings()
    ? EDITOR_STAT_KEYS
    : EDITOR_STATUS_KEYS;
}

function canShowStatusSelectorOptions() {
  return hasActiveStory();
}

function updateEditorSettingsUI() {
  const copy = text();
  const settingsPanel = document.getElementById('editorSettingsPanel');
  const settingsTitle = document.getElementById('editorSettingsTitle');
  const settingsBtn = document.getElementById('editorSettingsBtn');
  const autosaveBtn = document.getElementById('autosaveToggleBtn');
  const autoScrollModeBtn = document.getElementById('editorAutoScrollModeToggleBtn');
  const findSettingsBtn = document.getElementById('findSettingsToggleBtn');
  const replaceSettingsBtn = document.getElementById('replaceSettingsToggleBtn');
  const statusBtn = document.getElementById('statusVisibilityToggleBtn');
  const autoScrollModePanel = document.getElementById('editorAutoScrollModeSelectorPanel');
  const findSettingsPanel = document.getElementById('findSettingsSelectorPanel');
  const replaceSettingsPanel = document.getElementById('replaceSettingsSelectorPanel');
  const statusSelectorPanel = document.getElementById('statusSelectorPanel');
  const saveStatusOption = document.querySelector('[data-status-option="save"]');
  const statusOptionRows = document.querySelectorAll('#statusSelectorPanel .status-option-row');
  const isTrashMode = isTrashModeForEditorSettings();
  const canShowStatusOptions = canShowStatusSelectorOptions();
  const availableStatusKeys = editorSettingsStatusKeys();
  const statusKeyCount = availableStatusKeys.length;
  const activeStatusCount = availableStatusKeys.filter(statusKey => visibleEditorStatuses[statusKey]).length;
  const activeAutoScrollMode = currentEditorAutoScrollMode();
  const activeFindMode = currentEditorFindMode();
  const activeReplaceScope = currentEditorReplaceScope();
  const isChapterReviewMode = isChapterReviewModeForEditorSettings();
  const autoScrollActive = isEditorAutoScrollEnabled && !isChapterReviewMode;

  if (isChapterReviewMode || isTrashMode) {
    isFindSettingsSelectorOpen = false;
    isReplaceSettingsSelectorOpen = false;
    isEditorAutoScrollModeSelectorOpen = false;
  }
  if (!canShowStatusOptions) isStatusSelectorOpen = false;

  applyHeaderStatusVisibility();
  if (settingsPanel) settingsPanel.hidden = !isEditorSettingsOpen;
  if (settingsTitle) settingsTitle.hidden = isTrashMode;
  if (settingsBtn) settingsBtn.setAttribute('aria-expanded', String(isEditorSettingsOpen));
  if (autosaveBtn) {
    autosaveBtn.hidden = isTrashMode || isChapterReviewMode;
    autosaveBtn.setAttribute('aria-pressed', String(isAutoSaveEnabled));
  }
  if (autoScrollModeBtn) {
    autoScrollModeBtn.hidden = isTrashMode || isChapterReviewMode;
    autoScrollModeBtn.setAttribute('aria-expanded', String(isEditorAutoScrollModeSelectorOpen));
    autoScrollModeBtn.setAttribute('aria-pressed', String(autoScrollActive));
  }
  if (findSettingsBtn) {
    findSettingsBtn.hidden = isTrashMode || isChapterReviewMode;
    findSettingsBtn.setAttribute('aria-expanded', String(isFindSettingsSelectorOpen));
    findSettingsBtn.setAttribute('aria-pressed', 'true');
  }
  if (replaceSettingsBtn) {
    replaceSettingsBtn.hidden = isTrashMode || isChapterReviewMode;
    replaceSettingsBtn.setAttribute('aria-expanded', String(isReplaceSettingsSelectorOpen));
    replaceSettingsBtn.setAttribute('aria-pressed', 'true');
  }
  if (statusBtn) {
    statusBtn.hidden = false;
    statusBtn.setAttribute('aria-expanded', String(isStatusSelectorOpen && canShowStatusOptions));
    statusBtn.setAttribute('aria-pressed', String(activeStatusCount > 0));
  }
  if (autoScrollModePanel) autoScrollModePanel.hidden = isTrashMode || isChapterReviewMode || !isEditorAutoScrollModeSelectorOpen;
  if (findSettingsPanel) findSettingsPanel.hidden = isTrashMode || isChapterReviewMode || !isFindSettingsSelectorOpen;
  if (replaceSettingsPanel) replaceSettingsPanel.hidden = isTrashMode || isChapterReviewMode || !isReplaceSettingsSelectorOpen;
  if (statusSelectorPanel) statusSelectorPanel.hidden = !isStatusSelectorOpen || !canShowStatusOptions;
  statusOptionRows.forEach(optionRow => {
    optionRow.hidden = !canShowStatusOptions || !availableStatusKeys.includes(optionRow.dataset.statusOption);
  });
  if (saveStatusOption) saveStatusOption.hidden = !canShowStatusOptions || !availableStatusKeys.includes('save');

  setText('editorSettingsTitle', copy.editorSettings);
  setText('autosaveSettingLabel', copy.autosaveSetting);
  setText('editorAutoScrollModeLabel', copy.editorAutoScrollMode);
  setText('findSettingsLabel', copy.findSettings);
  setText('replaceSettingsLabel', copy.replaceSettings);
  setText('statusVisibilityLabel', copy.statusVisibilitySetting);
  setText('autosaveSettingState', isAutoSaveEnabled ? copy.settingOn : copy.settingOff);
  setText(
    'editorAutoScrollModeState',
    `${editorAutoScrollModeLabel(activeAutoScrollMode, true)} / ${autoScrollActive ? copy.settingOn : copy.settingOff}`
  );
  setText('findSettingsState', editorFindModeLabel(activeFindMode, true));
  setText('replaceSettingsState', editorReplaceScopeLabel(activeReplaceScope, true));
  setText('statusVisibilityState', `${activeStatusCount}/${statusKeyCount}`);
  setText('findModeSafeLabel', copy.safeFind);
  setText('findModeRawLabel', copy.rawFind);
  setText('findModeDeepLabel', copy.deepFind);
  setText('editorAutoScrollModeDepthLabel', copy.editorAutoScrollModeDepth);
  setText('editorAutoScrollModeBandLabel', copy.editorAutoScrollModeBand);
  setText('editorAutoScrollEmptyOnlyLabel', copy.editorAutoScrollEmptyOnly);
  setText('editorAutoScrollFocusSpeedPillLabel', copy.editorAutoScrollFocusSpeed);
  document.getElementById('editorAutoScrollFocusSpeedRange')?.setAttribute('aria-label', copy.editorAutoScrollFocusSpeed);
  setText('replaceScopeAfterLabel', copy.replaceScopeAfter);
  setText('replaceScopeBeforeLabel', copy.replaceScopeBefore);
  setText('replaceScopeAllLabel', copy.replaceScopeAll);
  setText('statusOptionSaveLabel', copy.saveStatusSetting);
  setText('statusOptionWordsLabel', copy.words);
  setText('statusOptionCharactersLabel', copy.characters);
  setText('statusOptionParagraphsLabel', copy.paragraphs);
  setText('statusOptionSentencesLabel', copy.sentences);
  setText('statusOptionReadingTimeLabel', copy.readingTimeSetting);
  updateStatusOptionState('save', 'statusOptionSaveState');
  updateStatusOptionState('words', 'statusOptionWordsState');
  updateStatusOptionState('characters', 'statusOptionCharactersState');
  updateStatusOptionState('paragraphs', 'statusOptionParagraphsState');
  updateStatusOptionState('sentences', 'statusOptionSentencesState');
  updateStatusOptionState('readingTime', 'statusOptionReadingTimeState');
  updateFindModeOptionState('safe', 'findModeSafeState');
  updateFindModeOptionState('raw', 'findModeRawState');
  updateFindModeOptionState('deep', 'findModeDeepState');
  updateEditorAutoScrollModeOptionState('depth', 'editorAutoScrollModeDepthState');
  updateEditorAutoScrollModeOptionState('band', 'editorAutoScrollModeBandState');
  updateEditorAutoScrollEmptyOnlyState();
  if (typeof syncEditorAutoScrollFocusSpeedControl === 'function') syncEditorAutoScrollFocusSpeedControl();
  updateReplaceScopeOptionState('after', 'replaceScopeAfterState');
  updateReplaceScopeOptionState('before', 'replaceScopeBeforeState');
  updateReplaceScopeOptionState('all', 'replaceScopeAllState');
  setTitle('editorSettingsBtn', copy.editorSettings);
  setTitle('autosaveToggleBtn', copy.autosaveSetting);
  setTitle('editorAutoScrollModeToggleBtn', copy.editorAutoScrollMode);
  setTitle('findSettingsToggleBtn', copy.findSettings);
  setTitle('replaceSettingsToggleBtn', copy.replaceSettings);
  setTitle('statusVisibilityToggleBtn', copy.statusVisibilitySetting);
  if (typeof syncFocusTopControlsState === 'function') syncFocusTopControlsState();
  if (typeof positionFocusTopOpenPanels === 'function') positionFocusTopOpenPanels();
}

function updateStatusOptionState(statusKey, stateId) {
  const copy = text();
  const optionBtn = document.querySelector(`[data-status-option="${statusKey}"]`);
  if (optionBtn) optionBtn.setAttribute('aria-pressed', String(Boolean(visibleEditorStatuses[statusKey])));
  setText(stateId, visibleEditorStatuses[statusKey] ? copy.settingOn : copy.settingOff);
}

function updateFindModeOptionState(mode, stateId) {
  const copy = text();
  const canUseFindMode = isEditorFindModeSystemActive();
  const isActive = canUseFindMode && currentEditorFindMode() === mode;
  const optionBtn = document.querySelector(`[data-find-mode="${mode}"]`);
  if (optionBtn) {
    optionBtn.disabled = !canUseFindMode;
    optionBtn.setAttribute('aria-pressed', String(isActive));
    optionBtn.classList.toggle('is-active', isActive);
    optionBtn.classList.toggle('is-disabled', !canUseFindMode);
  }
  setText(stateId, isActive ? copy.settingOn : copy.settingOff);
}

function updateEditorAutoScrollModeOptionState(mode, stateId) {
  const copy = text();
  const isActive = currentEditorAutoScrollMode() === mode;
  const optionBtn = document.querySelector(`[data-editor-auto-scroll-mode="${mode}"]`);
  if (optionBtn) {
    optionBtn.setAttribute('aria-pressed', String(isActive));
    optionBtn.classList.toggle('is-active', isActive);
  }
  setText(stateId, isActive ? copy.settingOn : copy.settingOff);
}

function updateEditorAutoScrollEmptyOnlyState() {
  const copy = text();
  const optionBtn = document.getElementById('editorAutoScrollEmptyOnlyToggleBtn');
  if (optionBtn) {
    optionBtn.setAttribute('aria-pressed', String(Boolean(isEditorAutoScrollEmptyParagraphOnly)));
    optionBtn.classList.toggle('is-active', Boolean(isEditorAutoScrollEmptyParagraphOnly));
  }
  setText('editorAutoScrollEmptyOnlyState', isEditorAutoScrollEmptyParagraphOnly ? copy.settingOn : copy.settingOff);
}

function updateReplaceScopeOptionState(scope, stateId) {
  const copy = text();
  const isActive = currentEditorReplaceScope() === scope;
  const optionBtn = document.querySelector(`[data-editor-replace-scope="${scope}"]`);
  if (optionBtn) {
    optionBtn.setAttribute('aria-pressed', String(isActive));
    optionBtn.classList.toggle('is-active', isActive);
  }
  setText(stateId, isActive ? copy.settingOn : copy.settingOff);
}

function toggleAutoSaveSetting() {
  if (isTrashDraftActive()) return;
  isAutoSaveEnabled = !isAutoSaveEnabled;
  clearTimeout(autoSaveTimer);
  if (!isAutoSaveEnabled) stopTimedAutoSave();
  saveEditorSettings();
  setDefaultSaveStatus();
  updateEditorSettingsUI();
  if (isAutoSaveEnabled) updateStats();
}

function toggleEditorAutoScrollSetting() {
  if (isChapterReviewModeForEditorSettings()) {
    isEditorAutoScrollModeSelectorOpen = false;
    if (typeof cancelEditorCaretAutoScroll === 'function') cancelEditorCaretAutoScroll();
    if (typeof positionEditorAutoScrollDepthMarker === 'function') positionEditorAutoScrollDepthMarker();
    updateEditorSettingsUI();
    return;
  }
  isEditorAutoScrollEnabled = !isEditorAutoScrollEnabled;
  saveEditorSettings();
  updateEditorSettingsUI();
  if (typeof positionEditorAutoScrollDepthMarker === 'function') positionEditorAutoScrollDepthMarker();
  if (isEditorAutoScrollEnabled) {
    if (typeof scheduleEditorCaretAutoScroll === 'function') scheduleEditorCaretAutoScroll();
  } else if (typeof cancelEditorCaretAutoScroll === 'function') {
    cancelEditorCaretAutoScroll();
  }
}

function isEditorAutoScrollModeStateClick(event) {
  return Boolean(event?.target?.closest?.('#editorAutoScrollModeState'));
}

function toggleEditorAutoScrollModePanel(event) {
  if (isChapterReviewModeForEditorSettings()) {
    isEditorAutoScrollModeSelectorOpen = false;
    if (typeof cancelEditorCaretAutoScroll === 'function') cancelEditorCaretAutoScroll();
    updateEditorSettingsUI();
    return;
  }
  if (isEditorAutoScrollModeStateClick(event)) {
    event.preventDefault();
    event.stopPropagation();
    toggleEditorAutoScrollSetting();
    return;
  }

  const autoScrollModePanel = document.getElementById('editorAutoScrollModeSelectorPanel');
  if (!isEditorAutoScrollModeSelectorOpen && autoScrollModePanel?.hidden && typeof window.prepareFloatingPanelFocusReturn === 'function') {
    window.prepareFloatingPanelFocusReturn(autoScrollModePanel);
  }
  isEditorAutoScrollModeSelectorOpen = !isEditorAutoScrollModeSelectorOpen;
  if (isEditorAutoScrollModeSelectorOpen) {
    isStatusSelectorOpen = false;
    isFindSettingsSelectorOpen = false;
    isReplaceSettingsSelectorOpen = false;
  }
  updateEditorSettingsUI();
}

function toggleStatusVisibilitySetting() {
  const statusSelectorPanel = document.getElementById('statusSelectorPanel');
  if (!isStatusSelectorOpen && statusSelectorPanel?.hidden && typeof window.prepareFloatingPanelFocusReturn === 'function') {
    window.prepareFloatingPanelFocusReturn(statusSelectorPanel);
  }
  isStatusSelectorOpen = !isStatusSelectorOpen;
  if (isStatusSelectorOpen) {
    isFindSettingsSelectorOpen = false;
    isReplaceSettingsSelectorOpen = false;
    isEditorAutoScrollModeSelectorOpen = false;
  }
  updateEditorSettingsUI();
}

function toggleFindSettingsPanel() {
  if (!isEditorFindModeSystemActive()) {
    isFindSettingsSelectorOpen = false;
    updateEditorSettingsUI();
    return;
  }
  const findSettingsPanel = document.getElementById('findSettingsSelectorPanel');
  if (!isFindSettingsSelectorOpen && findSettingsPanel?.hidden && typeof window.prepareFloatingPanelFocusReturn === 'function') {
    window.prepareFloatingPanelFocusReturn(findSettingsPanel);
  }
  isFindSettingsSelectorOpen = !isFindSettingsSelectorOpen;
  if (isFindSettingsSelectorOpen) {
    isStatusSelectorOpen = false;
    isReplaceSettingsSelectorOpen = false;
    isEditorAutoScrollModeSelectorOpen = false;
  }
  updateEditorSettingsUI();
}

function toggleReplaceSettingsPanel() {
  const replaceSettingsPanel = document.getElementById('replaceSettingsSelectorPanel');
  if (!isReplaceSettingsSelectorOpen && replaceSettingsPanel?.hidden && typeof window.prepareFloatingPanelFocusReturn === 'function') {
    window.prepareFloatingPanelFocusReturn(replaceSettingsPanel);
  }
  isReplaceSettingsSelectorOpen = !isReplaceSettingsSelectorOpen;
  if (isReplaceSettingsSelectorOpen) {
    isStatusSelectorOpen = false;
    isFindSettingsSelectorOpen = false;
    isEditorAutoScrollModeSelectorOpen = false;
  }
  updateEditorSettingsUI();
}

function toggleSingleStatusSetting(statusKey) {
  if (!EDITOR_STATUS_KEYS.includes(statusKey)) return;
  if (!editorSettingsStatusKeys().includes(statusKey)) return;
  visibleEditorStatuses[statusKey] = !visibleEditorStatuses[statusKey];
  saveEditorSettings();
  updateEditorSettingsUI();
}

function setEditorFindMode(mode, options = {}) {
  if (!isEditorFindModeSystemActive()) {
    isFindSettingsSelectorOpen = false;
    updateEditorSettingsUI();
    return;
  }
  const nextMode = normalizeEditorFindMode(mode);
  if (editorFindMode === nextMode && options.force !== true) {
    updateEditorSettingsUI();
    return;
  }
  editorFindMode = nextMode;
  if (options.persist !== false) saveEditorSettings();
  updateEditorSettingsUI();
  if (typeof doFind === 'function' && isFindOpen && document.getElementById('findInp')?.value) doFind();
  if (typeof syncEditorSelectionWordStatus === 'function') syncEditorSelectionWordStatus();
}

function setEditorAutoScrollMode(mode, options = {}) {
  if (isChapterReviewModeForEditorSettings()) {
    isEditorAutoScrollModeSelectorOpen = false;
    if (typeof cancelEditorCaretAutoScroll === 'function') cancelEditorCaretAutoScroll();
    if (typeof positionEditorAutoScrollDepthMarker === 'function') positionEditorAutoScrollDepthMarker();
    updateEditorSettingsUI();
    return;
  }
  const nextMode = normalizeEditorAutoScrollMode(mode);
  const shouldEnableAutoScroll = options.enable !== false;
  const modeChanged = editorAutoScrollMode !== nextMode;
  if (shouldEnableAutoScroll) isEditorAutoScrollEnabled = true;
  if (!modeChanged && options.force !== true) {
    if (shouldEnableAutoScroll && options.persist !== false) saveEditorSettings();
    updateEditorSettingsUI();
    if (typeof positionEditorAutoScrollDepthMarker === 'function') positionEditorAutoScrollDepthMarker();
    if (isEditorAutoScrollEnabled && typeof scheduleEditorCaretAutoScroll === 'function') scheduleEditorCaretAutoScroll();
    return;
  }
  editorAutoScrollMode = nextMode;
  if (options.persist !== false) saveEditorSettings();
  updateEditorSettingsUI();
  if (typeof positionEditorAutoScrollDepthMarker === 'function') positionEditorAutoScrollDepthMarker();
  if (typeof scheduleEditorCaretAutoScroll === 'function') scheduleEditorCaretAutoScroll();
}

function toggleEditorAutoScrollEmptyParagraphOnly() {
  if (isChapterReviewModeForEditorSettings()) {
    isEditorAutoScrollModeSelectorOpen = false;
    if (typeof cancelEditorCaretAutoScroll === 'function') cancelEditorCaretAutoScroll();
    updateEditorSettingsUI();
    return;
  }
  isEditorAutoScrollEmptyParagraphOnly = !isEditorAutoScrollEmptyParagraphOnly;
  saveEditorSettings();
  updateEditorSettingsUI();
  if (isEditorAutoScrollEnabled && typeof scheduleEditorCaretAutoScroll === 'function') {
    scheduleEditorCaretAutoScroll();
  } else if (typeof cancelEditorCaretAutoScroll === 'function') {
    cancelEditorCaretAutoScroll();
  }
}

function setEditorReplaceScope(scope, options = {}) {
  editorReplaceScope = normalizeEditorReplaceScope(scope);
  if (options.persist !== false) saveEditorSettings();
  updateEditorSettingsUI();
}

function showProjectGate(message = text().projectGateBody) {
  const gate = document.getElementById('project-gate');
  if (!gate) return;
  setText('projectGateBody', message);
  gate.classList.add('is-visible');
}

function hideProjectGate() {
  const gate = document.getElementById('project-gate');
  if (gate) gate.classList.remove('is-visible');
}

function showAppLoader(message = text().loading) {
  const loader = document.getElementById('appLoader');
  if (!loader) return;

  clearTimeout(appLoaderHideTimer);
  appLoadingDepth += 1;
  setText('appLoaderText', message);
  loader.hidden = false;
  loader.setAttribute('aria-label', message);
  requestAnimationFrame(() => {
    if (appLoadingDepth > 0 && !loader.hidden) loader.classList.add('is-visible');
  });
}

function hideAppLoader(force = false) {
  const loader = document.getElementById('appLoader');
  if (!loader) return;

  appLoadingDepth = force ? 0 : Math.max(0, appLoadingDepth - 1);
  if (appLoadingDepth > 0) return;

  loader.classList.remove('is-visible');
  appLoaderHideTimer = setTimeout(() => {
    if (appLoadingDepth === 0) loader.hidden = true;
  }, 180);
}

function refreshProjectUI() {
  if (isHomePage()) {
    hideProjectGate();
    if (workspaceDirectoryHandle) setHomeMenuStatus(`Workspace ready: ${workspaceDirectoryHandle.name || 'Selected folder'}`);
    return;
  }

  if (!hasActiveStory()) {
    navigateToHomePage();
    return;
  }

  applyLanguage();
  renderChapters();
  renderTags();
  renderNotes();
  loadEditor();
  updateChapterStatus();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function escapeJsString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function customSelectShouldEnhance(select) {
  return Boolean(
    select &&
    select.tagName === 'SELECT' &&
    !select.classList.contains('dock-native-select') &&
    select.dataset.customSelect !== 'off'
  );
}

function customSelectKey(select) {
  if (!select.dataset.customSelectKey) {
    customSelectCounter += 1;
    select.dataset.customSelectKey = select.id || `lm-custom-select-${customSelectCounter}`;
  }
  return select.dataset.customSelectKey;
}

function customSelectShell(select) {
  const nextElement = select?.nextElementSibling;
  return nextElement?.classList?.contains('lm-custom-select') ? nextElement : null;
}

function selectedCustomSelectOption(select) {
  return select.selectedOptions?.[0] ||
    Array.from(select.options).find(option => option.value === select.value) ||
    select.options[0] ||
    null;
}

function customSelectOptionText(option, fallback = '—') {
  return option?.textContent?.trim() || option?.value || fallback;
}

function isCustomSelectPlaceholderOption(select, option, optionIndex = -1) {
  if (!select || !option) return false;
  if (option.dataset?.placeholder === 'false') return false;
  if (option.dataset?.placeholder === 'true') return true;

  const isFirstOption = optionIndex === 0 || option === select.options?.[0];
  return isFirstOption && option.value === '';
}

function customSelectPlaceholderText(select) {
  const directPlaceholder =
    select?.dataset?.placeholder ||
    select?.getAttribute?.('placeholder') ||
    select?.getAttribute?.('aria-placeholder');

  if (directPlaceholder?.trim()) return directPlaceholder.trim();

  const firstOption = select?.options?.[0];
  if (firstOption && isCustomSelectPlaceholderOption(select, firstOption, 0)) {
    return customSelectOptionText(firstOption, select.getAttribute('aria-label') || 'Select');
  }

  return select?.getAttribute?.('aria-label') || 'Select';
}

function customSelectBoundaryElement(shell) {
  return shell?.closest?.([
    '[data-custom-select-boundary]',
    '.story-info-card',
    '.fact-compose-popover',
    '.naming-entry-panel',
    '.category-input-panel',
    '.category-action-panel',
    '.draft-details-panel',
    '.draft-actions-panel',
    '.draft-promote-destination-panel',
    '.chapter-to-draft-panel',
    '.part-details-panel',
    '.chapter-details-panel',
    '.side-workspace',
    '.modal-card',
    '.project-gate-card'
  ].join(', ')) || shell?.parentElement || document.documentElement;
}

function updateCustomSelectMenuHeight(select, shell, trigger, menu) {
  if (!shell || !trigger || !menu) return;

  const triggerRect = trigger.getBoundingClientRect();
  if (!triggerRect.height) {
    menu.style.removeProperty('--lm-custom-select-menu-max-height');
    return;
  }

  const boundary = customSelectBoundaryElement(shell);
  const boundaryRect = boundary?.getBoundingClientRect?.();
  const viewportBottom = Math.max(0, window.innerHeight - 12);
  const boundaryBottom = boundaryRect?.height
    ? Math.min(boundaryRect.bottom, viewportBottom)
    : viewportBottom;
  const gap = 7;
  const padding = 12;
  const availableBelow = Math.floor(boundaryBottom - triggerRect.bottom - gap - padding);
  const boundaryHeight = boundaryRect?.height || window.innerHeight;
  const availableByBox = Math.floor(boundaryHeight - triggerRect.height - gap - (padding * 2));
  const preferredMaxHeight = Number(select?.dataset?.menuMaxHeight) || 230;
  const availableHeight = availableBelow > 0 ? availableBelow : availableByBox;
  const usableHeight = Math.min(preferredMaxHeight, Math.max(48, availableHeight));

  menu.style.setProperty('--lm-custom-select-menu-max-height', `${Math.floor(usableHeight)}px`);
}

function closeCustomSelects() {
  if (!activeCustomSelectKey) return;
  const previousKey = activeCustomSelectKey;
  activeCustomSelectKey = null;
  document.querySelectorAll(`select[data-custom-select-key="${CSS.escape(previousKey)}"]`).forEach(syncCustomSelect);
}

function chooseCustomSelectOption(select, optionIndex) {
  if (!select || optionIndex < 0 || optionIndex >= select.options.length) return;
  const option = select.options[optionIndex];
  if (!option || option.hidden || option.disabled || isCustomSelectPlaceholderOption(select, option, optionIndex)) return;
  const previousValue = select.value;
  select.selectedIndex = optionIndex;
  syncCustomSelect(select);
  closeCustomSelects();

  if (select.value !== previousValue) {
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  requestAnimationFrame(() => syncCustomSelect(select));
}

function handleCustomSelectTriggerKey(event, select) {
  if (!select) return;
  const selectedIndex = Math.max(0, select.selectedIndex);

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    toggleCustomSelect(select);
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closeCustomSelects();
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (activeCustomSelectKey !== customSelectKey(select)) {
      activeCustomSelectKey = customSelectKey(select);
      syncCustomSelect(select);
      return;
    }

    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const selectableIndexes = Array.from(select.options)
      .map((option, optionIndex) => ({ option, optionIndex }))
      .filter(({ option, optionIndex }) =>
        !option.hidden &&
        !option.disabled &&
        !isCustomSelectPlaceholderOption(select, option, optionIndex)
      )
      .map(({ optionIndex }) => optionIndex);
    if (!selectableIndexes.length) return;

    const currentSelectableIndex = selectableIndexes.indexOf(selectedIndex);
    const fallbackIndex = delta > 0 ? selectableIndexes[0] : selectableIndexes[selectableIndexes.length - 1];
    const nextIndex = currentSelectableIndex === -1
      ? fallbackIndex
      : selectableIndexes[clampNumber(currentSelectableIndex + delta, 0, selectableIndexes.length - 1)];
    chooseCustomSelectOption(select, nextIndex);
  }
}

function ensureCustomSelect(select) {
  if (!customSelectShouldEnhance(select)) return null;

  const key = customSelectKey(select);
  select.classList.add('lm-native-select');
  let shell = customSelectShell(select);

  if (!shell) {
    shell = document.createElement('div');
    shell.className = 'lm-custom-select';
    shell.dataset.selectKey = key;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'lm-custom-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const value = document.createElement('span');
    value.className = 'lm-custom-select-value';

    const caret = document.createElement('span');
    caret.className = 'lm-custom-select-caret';
    caret.setAttribute('aria-hidden', 'true');

    const caretSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    caretSvg.setAttribute('viewBox', '0 0 512 512');
    caretSvg.setAttribute('focusable', 'false');
    const caretPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    caretPath.setAttribute('d', 'm98 190.06 139.78 163.12a24 24 0 0 0 36.44 0L414 190.06c13.34-15.57 2.28-39.62-18.22-39.62h-279.6c-20.5 0-31.56 24.05-18.18 39.62z');
    caretPath.setAttribute('fill', 'currentColor');
    caretSvg.append(caretPath);
    caret.append(caretSvg);

    const menu = document.createElement('div');
    menu.className = 'lm-custom-select-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    trigger.append(value, caret);
    shell.append(trigger, menu);
    select.insertAdjacentElement('afterend', shell);

    trigger.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      toggleCustomSelect(select);
    });
    shell.addEventListener('pointerdown', event => {
      event.stopPropagation();
    });
    trigger.addEventListener('keydown', event => handleCustomSelectTriggerKey(event, select));
  }

  if (!customSelectObservers.has(select)) {
    const observer = new MutationObserver(() => queueCustomSelectSync());
    observer.observe(select, { attributes: true, childList: true, subtree: true, characterData: true });
    customSelectObservers.set(select, observer);
    select.addEventListener('change', () => syncCustomSelect(select));
  }

  return shell;
}

function syncCustomSelect(select) {
  if (!customSelectShouldEnhance(select)) return;
  const shell = ensureCustomSelect(select);
  if (!shell) return;

  const key = customSelectKey(select);
  const trigger = shell.querySelector('.lm-custom-select-trigger');
  const valueLabel = shell.querySelector('.lm-custom-select-value');
  const menu = shell.querySelector('.lm-custom-select-menu');
  const selectedOption = selectedCustomSelectOption(select);
  const selectedOptionIndex = selectedOption ? Array.prototype.indexOf.call(select.options, selectedOption) : -1;
  const isShowingPlaceholder = !select.value || isCustomSelectPlaceholderOption(select, selectedOption, selectedOptionIndex);
  const selectedText = isShowingPlaceholder
    ? customSelectPlaceholderText(select)
    : customSelectOptionText(selectedOption, select.getAttribute('aria-label') || 'Select');
  const isOpen = activeCustomSelectKey === key;

  shell.classList.toggle('is-open', isOpen);
  shell.classList.toggle('is-disabled', select.disabled);
  shell.classList.toggle('has-placeholder', isShowingPlaceholder);
  shell.dataset.selectId = select.id || '';

  if (valueLabel) valueLabel.textContent = selectedText;
  if (trigger) {
    trigger.disabled = select.disabled;
    trigger.title = selectedText;
    trigger.setAttribute('aria-expanded', String(isOpen));
    trigger.setAttribute('aria-label', select.getAttribute('aria-label') || selectedText);
  }
  if (!menu) return;

  if (trigger) updateCustomSelectMenuHeight(select, shell, trigger, menu);
  menu.hidden = !isOpen;
  menu.innerHTML = '';
  Array.from(select.options).forEach((option, optionIndex) => {
    if (option.hidden || isCustomSelectPlaceholderOption(select, option, optionIndex)) return;
    const optionButton = document.createElement('button');
    optionButton.type = 'button';
    optionButton.className = 'lm-custom-select-option';
    optionButton.textContent = customSelectOptionText(option);
    optionButton.dataset.index = String(optionIndex);
    optionButton.setAttribute('role', 'option');
    optionButton.setAttribute('aria-selected', String(optionIndex === select.selectedIndex));
    optionButton.disabled = option.disabled;
    optionButton.classList.toggle('is-selected', optionIndex === select.selectedIndex);
    optionButton.addEventListener('pointerdown', event => {
      event.preventDefault();
      event.stopPropagation();
      if (!option.disabled) chooseCustomSelectOption(select, optionIndex);
    });
    optionButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (!option.disabled) chooseCustomSelectOption(select, optionIndex);
    });
    menu.appendChild(optionButton);
  });
}

function toggleCustomSelect(select) {
  if (!customSelectShouldEnhance(select) || select.disabled) return;
  const key = customSelectKey(select);
  activeCustomSelectKey = activeCustomSelectKey === key ? null : key;
  syncCustomSelects();
}

function syncCustomSelects(root = document) {
  root.querySelectorAll?.('select')?.forEach(select => {
    if (customSelectShouldEnhance(select)) syncCustomSelect(select);
  });
}

function queueCustomSelectSync(root = document) {
  cancelAnimationFrame(customSelectSyncRaf);
  customSelectSyncRaf = requestAnimationFrame(() => syncCustomSelects(root));
}

function initCustomSelects(root = document) {
  syncCustomSelects(root);
  if (customSelectGlobalsBound) return;
  customSelectGlobalsBound = true;

  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('.lm-custom-select')) closeCustomSelects();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeCustomSelects();
  });
  window.addEventListener('resize', closeCustomSelects);
}

document.addEventListener('DOMContentLoaded', () => {
  requestAnimationFrame(() => initCustomSelects());
});
