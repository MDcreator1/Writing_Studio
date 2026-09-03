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
  if (window.lmAdvancedWordEditing && typeof window.lmAdvancedWordEditing.loadDictionaryPayload === 'function') {
    window.lmAdvancedWordEditing.loadDictionaryPayload(null, { projectHandle: storyHandle });
    if (typeof window.lmAdvancedWordEditing.flush === 'function') await window.lmAdvancedWordEditing.flush();
  }

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

async function ensureChapterContentLoaded(chapterIndex = curChap) {
  if (typeof chapterIndex !== 'number' || chapterIndex < 0 || !Array.isArray(chapters) || chapterIndex >= chapters.length) return;
  const chapter = chapters[chapterIndex];
  if (!chapter) return;
  if (!chapter.content) {
    await loadChapterContent(chapter);
  }
}

async function ensureDraftContentLoaded(draftIndex = curDraft) {
  if (typeof draftIndex !== 'number' || draftIndex < 0 || !Array.isArray(chapterDrafts) || draftIndex >= chapterDrafts.length) return;
  const draft = chapterDrafts[draftIndex];
  if (!draft) return;
  if (!draft.content) {
    await loadDraftContent(draft);
  }
}

async function ensureActiveDocumentContentLoaded() {
  if (typeof isDraftActive === 'function' && isDraftActive()) {
    await ensureDraftContentLoaded(curDraft);
  } else {
    await ensureChapterContentLoaded(curChap);
  }
}

async function loadChapterContent(chapter) {
  if (!chapter) return;
  if (chapter.content) {
    chapter._wordCount = storageWordCountFromEditorHTML(chapter.content);
    return;
  }
  if (!chapter.contentPath) return;

  try {
    if (projectDirectoryHandle) {
      const fileHandle = await getProjectFileHandle(chapter.contentPath, { create: true });
      chapter.contentHandle = fileHandle;
      const fileText = await readFileText(fileHandle);
      chapter.content = textToEditorHTML(fileText);
      chapter._wordCount = storageWordCountFromText(fileText);
      return;
    }
  } catch (error) {
    console.warn('Chapter content load failed:', chapter.contentPath, error);
  }
}

async function loadDraftContent(draft) {
  if (!draft) return;
  if (draft.content) {
    draft._wordCount = storageWordCountFromEditorHTML(draft.content);
    return;
  }
  if (!draft.contentPath) return;

  try {
    if (projectDirectoryHandle) {
      const fileHandle = await getProjectFileHandle(draft.contentPath, { create: true });
      draft.contentHandle = fileHandle;
      const fileText = await readFileText(fileHandle);
      draft.content = textToEditorHTML(fileText);
      draft._wordCount = storageWordCountFromText(fileText);
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
  return true;
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
    const savedDuration = typeof lmEditorAdvancedNumber === 'function' ? lmEditorAdvancedNumber('savedStatusDuration', 2500) : 2500;
    saveStatusHideTimer = setTimeout(() => setSaveStatusDot('idle', label), savedDuration);
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
    const sideSaveDuration = typeof lmEditorAdvancedNumber === 'function' ? lmEditorAdvancedNumber('sideSaveDuration', 1600) : 1600;
    sidePanelSaveLineHideTimer = setTimeout(() => setSidePanelSaveLine('idle', label), sideSaveDuration);
  }
}

function showSidePanelSaveLine(label = text().saved) {
  setSidePanelSaveLine('saved', label);
}

function showUnsavedSaveStatus(label = text().unsaved) {
  // Dirty means data has changed but no real persistence write is running.
  // Reserve the animated busy state for runAutoSave/manualSave file writes.
  setSaveStatusDot('dirty', label || text().unsaved);
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
    isPasteSettingsSelectorOpen = false;
    isCopySettingsSelectorOpen = false;
  } else if (isTrashModeForEditorSettings()) {
    isStatusSelectorOpen = false;
    isFindSettingsSelectorOpen = false;
    isReplaceSettingsSelectorOpen = false;
    isEditorAutoScrollModeSelectorOpen = false;
    isPasteSettingsSelectorOpen = false;
    isCopySettingsSelectorOpen = false;
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
  const globalFormattingBtn = document.getElementById('applyStylesGloballyContainer');
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
  const autoScrollPinned = typeof isEditorQuickSettingPinned === 'function' ? isEditorQuickSettingPinned('autoscroll') : true;
  const findPinned = typeof isEditorQuickSettingPinned === 'function' ? isEditorQuickSettingPinned('find') : true;
  const replacePinned = typeof isEditorQuickSettingPinned === 'function' ? isEditorQuickSettingPinned('replace') : true;
  const globalFormattingPinned = typeof isEditorQuickSettingPinned === 'function' ? isEditorQuickSettingPinned('globalFormatting') : true;

  if (isChapterReviewMode || isTrashMode) {
    isReplaceSettingsSelectorOpen = false;
    isEditorAutoScrollModeSelectorOpen = false;
  }
  if (isTrashMode) isFindSettingsSelectorOpen = false;
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
    autoScrollModeBtn.hidden = isTrashMode || isChapterReviewMode || !autoScrollPinned;
    autoScrollModeBtn.setAttribute('aria-expanded', String(isEditorAutoScrollModeSelectorOpen));
    autoScrollModeBtn.setAttribute('aria-pressed', String(autoScrollActive));
  }
  if (findSettingsBtn) {
    findSettingsBtn.hidden = isTrashMode || !findPinned;
    findSettingsBtn.setAttribute('aria-expanded', String(isFindSettingsSelectorOpen));
    findSettingsBtn.setAttribute('aria-pressed', 'true');
  }
  if (replaceSettingsBtn) {
    replaceSettingsBtn.hidden = isTrashMode || isChapterReviewMode || !replacePinned;
    replaceSettingsBtn.setAttribute('aria-expanded', String(isReplaceSettingsSelectorOpen));
    replaceSettingsBtn.setAttribute('aria-pressed', 'true');
  }
  if (globalFormattingBtn) {
    const showGlobalFormatting = !isTrashMode && globalFormattingPinned;
    globalFormattingBtn.hidden = !showGlobalFormatting;
    globalFormattingBtn.style.display = showGlobalFormatting ? 'flex' : 'none';
  }
  if (statusBtn) {
    statusBtn.hidden = false;
    statusBtn.setAttribute('aria-expanded', String(isStatusSelectorOpen && canShowStatusOptions));
    statusBtn.setAttribute('aria-pressed', String(activeStatusCount > 0));
  }
  if (autoScrollModePanel) autoScrollModePanel.hidden = isTrashMode || isChapterReviewMode || !autoScrollPinned || !isEditorAutoScrollModeSelectorOpen;
  if (findSettingsPanel) findSettingsPanel.hidden = isTrashMode || !findPinned || !isFindSettingsSelectorOpen;
  if (replaceSettingsPanel) replaceSettingsPanel.hidden = isTrashMode || isChapterReviewMode || !replacePinned || !isReplaceSettingsSelectorOpen;
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
  // Paste & Copy settings UI
  updatePasteSettingsUI();
  updateCopySettingsUI();
  if (typeof syncFocusTopControlsState === 'function') syncFocusTopControlsState();
  if (typeof positionFocusTopOpenPanels === 'function') positionFocusTopOpenPanels();
}

function getStoryStorageKey(baseKey) {
  const projectFolder = projectDirectoryHandle?.name || localStorage.getItem(PROJECT_FOLDER_KEY) || 'global';
  return `lm_story:${projectFolder}:${baseKey}`;
}

function smartPasteLineSpacingLabel(value) {
  const safeValue = normalizeSmartPasteLineSpacing(value);
  return safeValue > 0 ? String(safeValue) : 'Default';
}

function smartPasteFontSizeLabel(value) {
  const safeValue = normalizeSmartPasteFontSize(value);
  return safeValue > 0 ? `${safeValue}px` : 'Default';
}

function updateSmartPasteRange(rangeId, valueId, value, formatter) {
  const range = document.getElementById(rangeId);
  const valueEl = document.getElementById(valueId);
  const nextValue = Number(value) || 0;
  if (range) {
    range.value = String(nextValue);
    syncCopyGapsRangeFill(range);
  }
  if (valueEl) valueEl.textContent = formatter(nextValue);
}

function syncCopyGapsRangeFill(rangeEl) {
  if (!rangeEl) return;
  const min = Number(rangeEl.min) || 0;
  const max = Number(rangeEl.max) || 3;
  const val = Number(rangeEl.value) || 0;
  const pct = max === min ? 0 : ((val - min) / (max - min)) * 100;
  const pill = rangeEl.closest('.editor-focus-speed-pill');
  if (pill) pill.style.setProperty('--editor-auto-scroll-focus-speed-fill', pct + '%');
}

function updatePasteSettingsUI() {
  const pasteBtn = document.getElementById('pasteSettingsToggleBtn');
  const pasteState = document.getElementById('pasteSettingsState');
  const pastePanel = document.getElementById('smartPasteOptionsPanel');
  const autoApplyToggleBtn = document.getElementById('autoApplySmartPasteToggleBtn');
  const autoApplyState = document.getElementById('autoApplySmartPasteState');
  const reviewMarginRow = document.getElementById('reviewMarginSettingRow');
  const copy = text();
  const isReviewMode = isChapterReviewModeForEditorSettings();
  const smartPastePinned = typeof isEditorQuickSettingPinned === 'function' ? isEditorQuickSettingPinned('smartPaste') : true;
  const reviewMarginPinned = typeof isEditorQuickSettingPinned === 'function' ? isEditorQuickSettingPinned('reviewMargin') : true;

  // ── Mode-based row swap ───────────────────────────────────────
  // Review mode → show margin row, hide paste toggle + panel
  // Edit / Draft → hide margin row, show paste toggle
  if (reviewMarginRow) reviewMarginRow.hidden = !isReviewMode || !reviewMarginPinned;
  if (pasteBtn) pasteBtn.hidden = isReviewMode || !smartPastePinned;
  if ((isReviewMode || !smartPastePinned) && isPasteSettingsSelectorOpen) {
    isPasteSettingsSelectorOpen = false;
  }

  // ── 1. Main panel toggle button and panel visibility ─────────
  if (pastePanel) pastePanel.hidden = !smartPastePinned || !isPasteSettingsSelectorOpen;
  if (!isReviewMode && smartPastePinned) {
    if (pasteBtn) {
      pasteBtn.setAttribute('aria-expanded', String(isPasteSettingsSelectorOpen));
      pasteBtn.setAttribute('aria-pressed', String(Boolean(isPasteSettingsEnabled)));
      pasteBtn.classList.toggle('is-active', Boolean(isPasteSettingsEnabled));
    }
    if (pasteState) {
      pasteState.textContent = isPasteSettingsEnabled ? (copy.settingOn || 'On') : (copy.settingOff || 'Off');
    }
  }

  // ── Sync active margin button ─────────────────────────────────
  if (isReviewMode) {
    const activeMargin = String(typeof editorReviewModeMarginDefault === 'function' ? editorReviewModeMarginDefault() : 0);
    const customMarginButton = document.getElementById('reviewMarginBtnCustom');
    const hasPresetMargin = ['0', '8', '16', '24'].includes(activeMargin);
    if (customMarginButton) {
      customMarginButton.hidden = hasPresetMargin;
      customMarginButton.dataset.marginValue = activeMargin;
      customMarginButton.textContent = activeMargin;
    }
    document.querySelectorAll('.review-margin-btn').forEach(btn => {
      const isActive = btn.dataset.marginValue === activeMargin;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }

  // ── 2. Sliders inside panel ───────────────────────────────────
  updateSmartPasteRange('smartPasteLineSpacingRange', 'smartPasteLineSpacingValue', smartPasteLineSpacing, smartPasteLineSpacingLabel);
  updateSmartPasteRange('smartPasteParagraphGapRange', 'smartPasteParagraphGapValue', smartPasteParagraphGap, value => String(value));
  updateSmartPasteRange('smartPasteFontSizeRange', 'smartPasteFontSizeValue', smartPasteFontSize, smartPasteFontSizeLabel);

  const rangeRows = document.querySelectorAll('.editor-smart-paste-range-row');
  rangeRows.forEach(row => {
    row.style.opacity = isPasteSettingsEnabled ? '1' : '0.5';
    row.style.pointerEvents = isPasteSettingsEnabled ? 'auto' : 'none';
  });

  // ── 3. Independent global-format auto-apply state ────────────
  if (autoApplyToggleBtn) {
    autoApplyToggleBtn.setAttribute('aria-pressed', String(smartPasteAutoApply));
    autoApplyToggleBtn.classList.toggle('is-active', smartPasteAutoApply);
  }
  if (autoApplyState) {
    autoApplyState.textContent = smartPasteAutoApply ? (copy.settingOn || 'On') : (copy.settingOff || 'Off');
  }
  if (typeof syncAdvancedQuickControlsFromRuntime === 'function') syncAdvancedQuickControlsFromRuntime();
}

