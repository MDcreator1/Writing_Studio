let activeCustomSelectKey = null;
let customSelectCounter = 0;
let customSelectGlobalsBound = false;
let customSelectSyncRaf = null;
const customSelectObservers = new WeakMap();
function textToEditorHTML(value) {
  const normalizedText = String(value || '').replace(/\r\n?/g, '\n');
  if (!normalizedText.trim()) return '';
  return normalizedText.split('\n')
    .map(line => `<p>${line ? escapeHtml(line) : '<br>'}</p>`)
    .join('');
}
function storageWordCountFromText(value) {
  const normalizedValue = String(value || '').replace(/\u00a0/g, ' ').trim();
  return normalizedValue ? normalizedValue.split(/\s+/).length : 0;
}
function storageWordCountFromEditorHTML(value) {
  if (typeof htmlToCountableText === 'function' && typeof countWordsFromText === 'function') {
    return countWordsFromText(htmlToCountableText(value));
  }
  const root = document.createElement('div');
  root.innerHTML = String(value || '');
  return storageWordCountFromText(root.textContent || '');
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

function editorPasteEntriesFromClipboard(plainText, html) {
  const htmlParagraphs = pastedHtmlToParagraphs(html);
  const textParagraphs = pastedTextToParagraphs(plainText);
  const htmlHasGaps = htmlParagraphs.some(isPasteGapEntry);
  const textHasGaps = textParagraphs.some(isPasteGapEntry);
  return htmlParagraphs.length > 1 && (htmlHasGaps || !textHasGaps)
    ? htmlParagraphs
    : textParagraphs;
}

function normalizeSmartPasteLineSpacing(value) {
  const max = typeof SMART_PASTE_LINE_SPACING_MAX === 'number' ? SMART_PASTE_LINE_SPACING_MAX : 3;
  return Math.max(0, Math.min(max, Math.round(Number(value) * 10) / 10));
}

function normalizeSmartPasteParagraphGap(value) {
  const max = typeof SMART_PASTE_PARAGRAPH_GAP_MAX === 'number' ? SMART_PASTE_PARAGRAPH_GAP_MAX : 3;
  return Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
}

function normalizeSmartPasteFontSize(value) {
  const max = typeof SMART_PASTE_FONT_SIZE_MAX === 'number' ? SMART_PASTE_FONT_SIZE_MAX : 36;
  return Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
}

function isSmartPasteFormattingEnabled() {
  return typeof isPasteSettingsEnabled !== 'undefined' && Boolean(isPasteSettingsEnabled);
}

function smartPasteTextEntries(entries) {
  return trimPasteBoundaryGaps(entries)
    .filter(entry => !isPasteGapEntry(entry))
    .map(entry => typeof entry === 'string' ? entry : entry?.text)
    .map(value => String(value || '').replace(/\u00a0/g, ' ').trim())
    .filter(Boolean);
}

function smartPasteParagraphStyleAttribute() {
  const styles = [];
  const fontSize = normalizeSmartPasteFontSize(typeof smartPasteFontSize === 'undefined' ? 0 : smartPasteFontSize);
  const lineSpacing = normalizeSmartPasteLineSpacing(typeof smartPasteLineSpacing === 'undefined' ? 0 : smartPasteLineSpacing);
  if (fontSize > 0) styles.push(`font-size:${fontSize}px`);
  if (lineSpacing > 0) styles.push(`line-height:${lineSpacing}`);
  return styles.length ? ` style="${styles.join(';')}"` : '';
}

function smartPasteGapHTML(gapCount) {
  const safeGap = normalizeSmartPasteParagraphGap(gapCount);
  return Array.from({ length: safeGap }, () => editorFileGapHTML()).join('');
}

function smartPasteEntriesToEditorHTML(entries) {
  const textEntries = smartPasteTextEntries(entries);
  if (!textEntries.length) return '';
  const styleAttr = smartPasteParagraphStyleAttribute();
  const separator = smartPasteGapHTML(typeof smartPasteParagraphGap === 'undefined' ? 0 : smartPasteParagraphGap);
  return textEntries
    .map(textValue => `<p${styleAttr}>${escapeHtml(textValue).replace(/\n/g, '<br>')}</p>`)
    .join(separator);
}

function smartPasteEntriesToPlainText(entries, fallbackText = '') {
  const textEntries = smartPasteTextEntries(entries);
  if (!textEntries.length) return String(fallbackText || '').replace(/\r\n?/g, '\n');
  const gap = normalizeSmartPasteParagraphGap(typeof smartPasteParagraphGap === 'undefined' ? 0 : smartPasteParagraphGap);
  return textEntries.join('\n'.repeat(gap + 1));
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
  const paragraphs = editorPasteEntriesFromClipboard(plainText, html);
  return isSmartPasteFormattingEnabled()
    ? smartPasteEntriesToEditorHTML(paragraphs)
    : paragraphsToEditorHTML(paragraphs);
}

function editorTextFromPaste(plainText, html) {
  const paragraphs = editorPasteEntriesFromClipboard(plainText, html);
  return isSmartPasteFormattingEnabled()
    ? smartPasteEntriesToPlainText(paragraphs, plainText)
    : String(plainText || '').replace(/\r\n?/g, '\n');
}

function normalizeProjectManifest(manifest = {}) {
  const topLevelChapters = Array.isArray(manifest.chapters) ? manifest.chapters : [];
  const rawParts = Array.isArray(manifest.parts) ? manifest.parts : [];
  const parts = rawParts.map(normalizePart);
  const updatedAt = manifest.updatedAt || manifest.updated_at || manifest.updated || '';
  const createdAt = manifest.createdAt || manifest.created_at || manifest.created || updatedAt || new Date().toISOString();

  const normalized = {
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
  if (manifest.autoScroll && typeof manifest.autoScroll === 'object') {
    normalized.autoScroll = { ...manifest.autoScroll };
  }
  if (manifest.globalTextFormatting && typeof manifest.globalTextFormatting === 'object') {
    normalized.globalTextFormatting = { ...manifest.globalTextFormatting };
  }
  if (manifest.smartPaste && typeof manifest.smartPaste === 'object') {
    normalized.smartPaste = { ...manifest.smartPaste };
  }
  return normalized;
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

const PROJECT_DETAILS_CACHE_DIR = 'project-details';

async function readProjectDetailsCacheFile(filename = 'total-mentions.json') {
  const path = `${PROJECT_DETAILS_CACHE_DIR}/${filename}`;
  if (typeof projectDirectoryHandle !== 'undefined' && projectDirectoryHandle) {
    try {
      const fileHandle = await getProjectFileHandle(path);
      const text = await readFileText(fileHandle);
      return text ? JSON.parse(text) : null;
    } catch (error) {
      if (error?.name !== 'NotFoundError') {
        console.warn('Project details cache read failed:', path, error);
      }
    }
  }

  const folderName = typeof projectDirectoryHandle !== 'undefined' && projectDirectoryHandle?.name
    ? projectDirectoryHandle.name
    : localStorage.getItem('lm_project_folder_name') || 'default';
  const localKey = `lm_project_details_cache_${typeof uniqueNameKey === 'function' ? uniqueNameKey(folderName) : folderName}_${filename.replace(/[^a-z0-9_-]/gi, '_')}`;
  try {
    const raw = localStorage.getItem(localKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeProjectDetailsCacheFile(filename = 'total-mentions.json', data = {}) {
  const path = `${PROJECT_DETAILS_CACHE_DIR}/${filename}`;
  const jsonString = JSON.stringify(data, null, 2);

  if (typeof projectDirectoryHandle !== 'undefined' && projectDirectoryHandle) {
    try {
      const fileHandle = await getProjectFileHandle(path, { create: true });
      await writeFileText(fileHandle, jsonString);
    } catch (error) {
      console.warn('Project details cache file write failed:', path, error);
    }
  }

  const folderName = typeof projectDirectoryHandle !== 'undefined' && projectDirectoryHandle?.name
    ? projectDirectoryHandle.name
    : localStorage.getItem('lm_project_folder_name') || 'default';
  const localKey = `lm_project_details_cache_${typeof uniqueNameKey === 'function' ? uniqueNameKey(folderName) : folderName}_${filename.replace(/[^a-z0-9_-]/gi, '_')}`;
  try {
    localStorage.setItem(localKey, jsonString);
  } catch (e) {
    console.warn('Project details cache localStorage write failed:', e);
  }
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
    globalTextFormatting: {
      globalFontSize: 16,
      globalLineSpacing: 0,
      globalParagraphGap: 1,
      reviewModeMargin: 0,
      globalAlignment: 'justify',
      globalFontFamily: 'Lora'
    },
    smartPaste: {
      enabled: true,
      lineSpacing: 0,
      paragraphGap: 1,
      fontSize: 16
    },
    autoScroll: {
      enabled: true,
      emptyOnly: false,
      clickRepositionEnabled: true,
      mode: 'depth',
      focusTime: 320,
      depth: 72,
      bandTop: 34,
      bandBottom: 78,
      bandMinGap: 22
    },
    facts: [],
    chapters: [],
    parts: []
  };
}

function chapterManifestEntry(chapter, index, chapterNo = index + 1) {
  const includeContent = !projectDirectoryHandle;
  const words = Number.isFinite(chapter._wordCount)
    ? chapter._wordCount
    : (Number.isFinite(chapter.wordCount)
      ? chapter.wordCount
      : (typeof countWordsFromText === 'function' && typeof htmlToCountableText === 'function' && chapter.content
        ? countWordsFromText(htmlToCountableText(chapter.content))
        : null));

  return {
    no: chapterNo,
    title: chapter.title,
    contentHTML: includeContent ? chapter.content || '' : '',
    richContentHTML: editorDocumentRichContentForStorage(chapter),
    createdAt: chapter.createdAt || new Date().toISOString(),
    content_path: chapter.contentPath || chapterFilePath(index),
    alignment: normalizeEditorAlignment(chapter.alignment),
    lineHeight: normalizeOptionalEditorLineHeight(chapter.lineHeight),
    paragraphGap: normalizeOptionalEditorParagraphGap(chapter.paragraphGap),
    paragraphMargin: normalizeOptionalEditorParagraphMargin(chapter.paragraphMargin),
    fontFamily: normalizeEditorFontFamily(chapter.fontFamily),
    fontSize: normalizeEditorFontSize(chapter.fontSize),
    editorSettings: chapter.editorSettings
      ? normalizeEditorSettings(chapter.editorSettings)
      : mergeProjectAutoScrollSettings(null),
    wordCount: words,
    _wordCount: words
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
    globalTextFormatting: baseManifest.globalTextFormatting || {
      globalFontSize: 16,
      globalLineSpacing: 0,
      globalParagraphGap: 1,
      reviewModeMargin: 0,
      globalAlignment: 'justify',
      globalFontFamily: 'Lora'
    },
    smartPaste: baseManifest.smartPaste || {
      enabled: Boolean(typeof isPasteSettingsEnabled !== 'undefined' ? isPasteSettingsEnabled : true),
      lineSpacing: typeof smartPasteLineSpacing !== 'undefined' ? smartPasteLineSpacing : 0,
      paragraphGap: typeof smartPasteParagraphGap !== 'undefined' ? smartPasteParagraphGap : 1,
      fontSize: typeof smartPasteFontSize !== 'undefined' ? smartPasteFontSize : 16
    },
    autoScroll: baseManifest.autoScroll || {
      enabled: Boolean(typeof isEditorAutoScrollEnabled !== 'undefined' ? isEditorAutoScrollEnabled : true),
      emptyOnly: Boolean(typeof isEditorAutoScrollEmptyParagraphOnly !== 'undefined' ? isEditorAutoScrollEmptyParagraphOnly : false),
      clickRepositionEnabled: Boolean(typeof isEditorAutoScrollClickRepositionEnabled !== 'undefined' ? isEditorAutoScrollClickRepositionEnabled : true),
      mode: typeof editorAutoScrollMode !== 'undefined' ? editorAutoScrollMode : 'depth',
      focusTime: typeof currentEditorAutoScrollFocusTimeMs === 'function' ? currentEditorAutoScrollFocusTimeMs() : 320,
      depth: typeof advancedStoredPercent === 'function' ? advancedStoredPercent(EDITOR_AUTO_SCROLL_DEPTH_KEY, 72) : 72,
      bandTop: typeof advancedStoredPercent === 'function' ? advancedStoredPercent(EDITOR_AUTO_SCROLL_BAND_TOP_KEY, 34) : 34,
      bandBottom: typeof advancedStoredPercent === 'function' ? advancedStoredPercent(EDITOR_AUTO_SCROLL_BAND_BOTTOM_KEY, 78) : 78,
      bandMinGap: typeof lmEditorAdvancedNumber === 'function' ? lmEditorAdvancedNumber('autoScrollBandMinGap', 22) : 22
    },
    ...(projectDirectoryHandle ? {} : { facts: normalizeStoryFacts(storyFacts) })
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

function projectManifestForStorage(manifest) {
  const stripChapter = chapter => {
    const metadata = { ...chapter };
    delete metadata.content;
    delete metadata.contentHTML;
    delete metadata.content_html;
    return metadata;
  };
  const metadata = {
    ...manifest,
    chapters: (manifest.chapters || []).map(stripChapter),
    parts: (manifest.parts || []).map(part => ({
      ...part,
      chapters: (part.chapters || []).map(stripChapter)
    }))
  };
  delete metadata.facts;
  return metadata;
}

function cacheProjectManifest(manifest = projectManifest) {
  try {
    localStorage.setItem(PROJECT_MANIFEST_KEY, JSON.stringify(projectManifestForStorage(normalizeProjectManifest(manifest || {}))));
    return true;
  } catch (error) {
    console.warn('Project manifest browser cache write skipped:', error); return false;
  }
}

async function writeProjectManifest(manifest = chaptersToManifest(), options = {}) {
  if (!projectDirectoryHandle) return;
  const includedFacts = Object.prototype.hasOwnProperty.call(manifest, 'facts')
    ? normalizeStoryFacts(manifest.facts)
    : null;
  if (includedFacts?.length && window.LmFactsPanelData?.writeProjectData) {
    storyFacts = includedFacts;
    await window.LmFactsPanelData.writeProjectData(includedFacts);
  } else if (window.LmFactsPanelData?.ensureLegacyMigration) {
    // Do not replace the legacy manifest until its detached facts file exists.
    await window.LmFactsPanelData.ensureLegacyMigration();
  }
  const createdAt = manifest.createdAt || projectManifest?.createdAt || new Date().toISOString();
  const updatedAt = options.touchUpdated === false
    ? manifest.updatedAt || projectManifest?.updatedAt || createdAt
    : new Date().toISOString();
  projectManifest = projectManifestForStorage(normalizeProjectManifest({
    ...manifest,
    createdAt,
    updatedAt
  }));
  if (includedFacts?.length) storyFacts = includedFacts;
  const manifestHandle = await getProjectFileHandle(PROJECT_MANIFEST_FILE, { create: true });
  await writeFileText(manifestHandle, JSON.stringify(projectManifest, null, 2));
  cacheProjectManifest(projectManifest);
  await window.LmInitialRendering?.syncLeftPanelData?.();
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
  cacheProjectManifest(projectManifest);
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
    if (error?.name !== 'NotFoundError') {
      console.error('Story_Naming.json read failed; overwrite blocked:', error);
      showMiniReminder('Story_Naming.json सुरक्षित रूप से पढ़ी नहीं जा सकी; overwrite रोक दिया गया है।');
      throw error;
    }
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
async function writeNamingDataToProject(options = {}) {
  const targetHandle = projectDirectoryHandle;
  if (!targetHandle) return false;
  return window.LmNamingFileSafety.writeCurrentProject(targetHandle, options);
}

async function readWordEditingDataFromProject(targetDirectoryHandle = projectDirectoryHandle) {
  if (!targetDirectoryHandle) return null;
  try {
    const fileHandle = await targetDirectoryHandle.getFileHandle(PROJECT_WORD_EDITING_FILE);
    const content = await readFileText(fileHandle);
    if (!content) return null;
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (error) {
    /* File might not exist in project yet. */
  }
  return null;
}
async function writeWordEditingDataToProject(payload, targetDirectoryHandle = projectDirectoryHandle) {
  if (!targetDirectoryHandle || !payload) return false;
  try {
    const fileHandle = await targetDirectoryHandle.getFileHandle(PROJECT_WORD_EDITING_FILE, { create: true });
    await writeFileText(fileHandle, JSON.stringify(payload, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing word editing dictionary to project:', error);
    return false;
  }
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
  const searchNames = [...new Map(
    [entry.name, ...(Array.isArray(entry.similarNames) ? entry.similarNames : [])]
      .map(value => String(value || '').trim().replace(/\s+/g, ' '))
      .filter(Boolean)
      .map(value => [value.toLocaleLowerCase(), value])
  ).values()];
  if (!searchNames.length) return true;
  const documentText = namingMentionValidationText(textValue);
  if (!documentText) return false;

  if (typeof countEditorFindMatches === 'function') {
    try {
      return searchNames.some(name => countEditorFindMatches(documentText, name, 'deep') > 0);
    } catch (error) {
      console.warn('Naming entry mention scan failed:', error);
    }
  }

  const normalizedText = documentText.toLocaleLowerCase();
  return searchNames.some(name => normalizedText.includes(name.toLocaleLowerCase()));
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
  const textValues = Array.isArray(options.documentTexts)
    ? options.documentTexts.map(namingMentionValidationText).filter(Boolean)
    : namingLiveStoryTextsForMentionValidation(options);
  return textValues
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
  const hasExplicitText = typeof options.text === 'string';
  const sourceIsLoaded = draft._contentLoadState === 'loaded' || typeof draft.content === 'string' || typeof draft.contentHTML === 'string';
  if (!hasExplicitText && !sourceIsLoaded) return false;

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
  const searchableDocuments = [...chapters, ...chapterDrafts];
  const allSourcesLoaded = searchableDocuments.every(item =>
    item?._contentLoadState === 'loaded' || typeof item?.content === 'string' || typeof item?.contentHTML === 'string'
  );
  if (!options.documentTexts && !allSourcesLoaded) return false;
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
  await window.LmInitialRendering?.syncLeftPanelData?.();
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
  await window.LmInitialRendering?.syncLeftPanelData?.();
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

function saveNamingData(options = {}) {
  namingData = normalizeNamingData(namingData);
  localStorage.setItem(NAMING_STORAGE_KEY, JSON.stringify(namingData));
  if (projectDirectoryHandle) {
    writeNamingDataToProject(options).catch(error => console.warn('Naming data save failed:', error));
  }
}

async function loadLocalProject(handle, shouldStoreHandle = true, options = {}) {
  isProjectDataLoading = true;
  clearTimeout(autoSaveTimer);
  if (typeof stopTimedAutoSave === 'function') stopTimedAutoSave();
  if (typeof editorDocumentLoadSequence === 'number') editorDocumentLoadSequence += 1;
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
  window.LmWorkspaceSectionLoader?.reset?.();
  isDraftTrashMode = false;
  curTrashDraft = -1;
  trashReturnEditorState = null;
  selectedTrashDraftIndexes.clear();
  lastSelectedTrashDraftIndex = null;
  const chapterSidebarData = window.LmChapterSidebarData;
  const sidebarDataLoaded = chapterSidebarData?.loadProjectData
    ? await chapterSidebarData.loadProjectData()
    : await (async () => {
      projectManifest = await readProjectManifest();
      if (!projectManifest) return false;
      chapters = chaptersFromManifest(projectManifest);
      storyFacts = normalizeStoryFacts(projectManifest.facts);
      await Promise.all([
        readDraftsDataFromProject(),
        readTrashDraftsDataFromProject()
      ]);
      return true;
    })();
  if (!sidebarDataLoaded) {
    projectDirectoryHandle = null;
    setActiveProjectTypeFolderName('');
    isProjectDataLoading = false;
    return false;
  }
  window.LmFirstProjectOpenMismatchRepair?.begin?.(handle);
  loadPasteCopySettings();
  loadAutoScrollSettingsFromManifest();
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
  chapterSidebarData?.renderProjectData?.();

  if (window.LmWorkspaceSectionLoader?.loadProjectOpenSections) {
    await window.LmWorkspaceSectionLoader.loadProjectOpenSections({ activeRightPanel: activeSidePanel });
  } else {
    await Promise.all([
      readChapterEditDraftsFromProject(),
      readNamingDataFromProject()
    ]);
    if (window.lmAdvancedWordEditing && typeof window.lmAdvancedWordEditing.loadDictionaryPayload === 'function') {
      const projectWordEditingData = await readWordEditingDataFromProject(projectDirectoryHandle);
      window.lmAdvancedWordEditing.loadDictionaryPayload(projectWordEditingData, { projectHandle: projectDirectoryHandle });
      if (!projectWordEditingData && typeof window.lmAdvancedWordEditing.flush === 'function') {
        await window.lmAdvancedWordEditing.flush();
      }
    }
    await ensureActiveDocumentContentLoaded();
  }

  if (shouldStoreHandle) await saveProjectHandle(handle);
  localStorage.setItem(PROJECT_MODE_KEY, 'local');
  localStorage.setItem(PROJECT_FOLDER_KEY, handle.name || '');
  setActiveProjectTypeFolderName(nextTypeFolderName);
  cacheProjectManifest(projectManifest);
  hasStoredChapters = false;
  isProjectDataLoading = false;
  return true;
}
