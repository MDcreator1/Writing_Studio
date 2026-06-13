const HOME_PROJECT_TYPE_OPTIONS = [
  { value: 'story', label: 'Story Writing', supported: true },
  { value: 'novel', label: 'Novel Writing', supported: true },
  { value: 'news', label: 'News Article Writing', supported: true },
  { value: 'essay', label: 'Essay / Longform', supported: false },
  { value: 'poetry', label: 'Poetry', supported: false },
  { value: 'screenplay', label: 'Screenplay', supported: false }
];
const HOME_SUPPORTED_PROJECT_TYPE_VALUES = new Set(
  HOME_PROJECT_TYPE_OPTIONS.filter(option => option.supported).map(option => option.value)
);

function applyHomeDarkMode() {
  const mode = window.getCurrentThemeMode?.() || (isDark ? 'dark' : 'light');
  isDark = mode === 'dark';
  document.body.classList.toggle('light-mode', mode === 'light');
  document.body.classList.toggle('dark-mode', mode === 'dark');
  document.body.classList.toggle('grey-mode', mode === 'grey');
  document.body.classList.toggle('purple-mode', mode === 'purple');
  document.body.classList.toggle('sunset-mode', mode === 'sunset');
  document.body.classList.toggle('forest-mode', mode === 'forest');
  document.body.classList.toggle('colorful-mode', false);
  window.applyLekhakThemeClasses?.(mode);
  window.syncThemePanelState?.();
}

function toggleDark() {
  const currentMode = window.getCurrentThemeMode?.() || (isDark ? 'dark' : 'light');
  const nextMode = currentMode === 'dark' ? 'light' : 'dark';
  window.setStoredThemeMode?.(nextMode) || localStorage.setItem('lm_theme', nextMode);
  isDark = nextMode === 'dark';
  applyHomeDarkMode();
}

function saveToStorage() {
  const mode = window.getCurrentThemeMode?.() || (isDark ? 'dark' : 'light');
  localStorage.setItem('lm_theme', mode);
  localStorage.setItem('lm_dark', isDark);
  if (projectDirectoryHandle) {
    localStorage.setItem(PROJECT_MODE_KEY, 'local');
    localStorage.setItem(PROJECT_FOLDER_KEY, projectDirectoryHandle.name || '');
    if (typeof setActiveProjectTypeFolderName === 'function') {
      setActiveProjectTypeFolderName(currentProjectTypeFolderName());
    }
  } else if (workspaceDirectoryHandle) {
    localStorage.setItem(PROJECT_MODE_KEY, 'workspace');
    localStorage.setItem(WORKSPACE_FOLDER_KEY, workspaceDirectoryHandle.name || '');
  }
}

function renderStoryTypeOptions() {
  const typeSelect = document.getElementById('storyTypeInp');
  const languageSelect = document.getElementById('storyLanguageInp');
  if (typeSelect) {
    const selectedValue = typeSelect.value || 'novel';
    typeSelect.innerHTML = HOME_PROJECT_TYPE_OPTIONS
      .map(option => `<option value="${option.value}">${option.label}</option>`)
      .join('');
    typeSelect.value = HOME_SUPPORTED_PROJECT_TYPE_VALUES.has(selectedValue) ? selectedValue : 'novel';
  }
  if (languageSelect) {
    languageSelect.innerHTML = '<option value="en">English</option><option value="hi">Hindi</option>';
    languageSelect.value = 'en';
  }
  queueCustomSelectSync();
}

async function restoreHomeWorkspaceHandle() {
  const handle = await readWorkspaceHandle();
  if (!handle) return;

  if (!(await verifyProjectPermission(handle, false))) {
    setHomeMenuStatus(text().chooseWorkspaceFirst);
    return;
  }

  workspaceDirectoryHandle = handle;
  localStorage.setItem(PROJECT_MODE_KEY, 'workspace');
  localStorage.setItem(WORKSPACE_FOLDER_KEY, handle.name || '');
  setHomeMenuStatus(`Workspace ready: ${handle.name || 'Selected folder'}`);
}

function syncHomeLabels() {
  const copy = text();
  setText('brandName', copy.brand);
  setTitle('projectBtn', copy.openProjectTitle);
  document.getElementById('projectBtn')?.setAttribute('aria-label', copy.openProjectTitle);
  setTitle('storyLibraryBtn', copy.storyLibraryTitle);
  document.getElementById('storyLibraryBtn')?.setAttribute('aria-label', copy.storyLibraryTitle);
  setText('storyLibraryTitle', copy.storyLibraryTitle);
  setText('newStoryBtn', copy.newStory);
  setText('openExistingStoriesBtn', copy.openExistingStories);
  setTitle('darkBtn', copy.darkTitle);
  setText('projectGateTitle', copy.projectGateTitle);
  setText('projectGateBody', copy.projectGateBody);
  setText('projectGateNote', copy.projectGateNote);
  setText('projectSelectBtn', copy.projectSelect);
  setText('storyTitleLabel', copy.storyTitleLabel);
  setText('storyTypeLabel', 'Project Type');
  setText('storyAuthorLabel', copy.storyAuthorLabel);
  setText('storyLanguageLabel', copy.storyLanguageLabel);
  setText('storySynopsisLabel', copy.storySynopsisLabel);
  syncStoryInfoPanelModeText();
}

function bindHomeEvents() {
  document.getElementById('homeStoryList')?.addEventListener('click', event => {
    const storyButton = event.target.closest('[data-home-story-folder]');
    const storyReference = storyButton?.dataset.homeStoryFolder || storyButton?.getAttribute('data-home-story-folder');
    if (storyReference) openWorkspaceStory(storyReference);
  });

  document.getElementById('homeRecentProjectsPanelList')?.addEventListener('click', event => {
    const storyButton = event.target.closest('[data-home-recent-story-folder]');
    const storyReference = storyButton?.dataset.homeRecentStoryFolder || storyButton?.getAttribute('data-home-recent-story-folder');
    if (storyReference) openWorkspaceStory(storyReference);
  });

  document.getElementById('storyTypeInp')?.addEventListener('change', event => {
    const selectedValue = event.target?.value || '';
    if (!HOME_SUPPORTED_PROJECT_TYPE_VALUES.has(selectedValue)) {
      const reminder = text().projectTypeUnsupported || 'Only Story Writing, Novel Writing, and News Article Writing can be created right now.';
      setHomeMenuStatus(reminder);
      showMiniReminder(reminder);
    } else {
      setHomeMenuStatus('');
    }
  });

  document.addEventListener('pointerdown', event => {
    const storyLibraryPanel = document.getElementById('storyLibraryPanel');
    const storyLibraryBtn = document.getElementById('storyLibraryBtn');
    if (
      storyLibraryPanel &&
      !storyLibraryPanel.hidden &&
      !storyLibraryPanel.contains(event.target) &&
      !storyLibraryBtn?.contains(event.target)
    ) {
      closeStoryLibraryPanel();
    }

    const recentProjectsPanel = document.getElementById('homeRecentProjectsModal');
    const recentProjectsCard = recentProjectsPanel?.querySelector('.home-recent-projects-card');
    if (
      recentProjectsPanel?.classList.contains('is-visible') &&
      recentProjectsCard &&
      !recentProjectsCard.contains(event.target) &&
      !event.target.closest('#storyLibraryBtn')
    ) {
      closeHomeRecentProjectsPanel();
    }

    const storyInfoPanel = document.getElementById('story-info-modal');
    const storyInfoCard = storyInfoPanel?.querySelector('.story-info-card');
    if (
      storyInfoPanel?.classList.contains('is-visible') &&
      storyInfoCard &&
      !storyInfoCard.contains(event.target) &&
      !event.target.closest('#storyLibraryBtn')
    ) {
      closeStoryInfoModal();
    }
  });

  document.addEventListener('keydown', event => {
    const storyLibraryPanel = document.getElementById('storyLibraryPanel');
    if (event.key === 'Escape' && storyLibraryPanel && !storyLibraryPanel.hidden) {
      closeStoryLibraryPanel();
      return;
    }
    if (event.key === 'Escape' && document.getElementById('homeRecentProjectsModal')?.classList.contains('is-visible')) {
      closeHomeRecentProjectsPanel();
      return;
    }
    if (event.key === 'Escape' && document.getElementById('story-info-modal')?.classList.contains('is-visible')) {
      closeStoryInfoModal();
    }
  });

  window.addEventListener('resize', () => {
    if (!document.getElementById('storyLibraryPanel')?.hidden) positionStoryLibraryPanel();
    if (document.getElementById('homeRecentProjectsModal')?.classList.contains('is-visible')) positionHomeRecentProjectsPanel();
    if (document.getElementById('story-info-modal')?.classList.contains('is-visible')) positionStoryInfoPanel();
  });
}

async function initHome() {
  const mode = window.getStoredThemeMode?.() || (localStorage.getItem('lm_dark') === 'true' ? 'dark' : 'light');
  window.setStoredThemeMode?.(mode);
  isDark = mode === 'dark';
  applyHomeDarkMode();
  renderStoryTypeOptions();
  syncHomeLabels();
  initCustomSelects();
  hideProjectGate();
  bindHomeEvents();
  if (typeof selectHomeOverview === 'function') selectHomeOverview('story');

  try {
    await restoreHomeWorkspaceHandle();
  } catch (error) {
    console.warn('Workspace restore failed:', error);
  }
}

window.addEventListener('DOMContentLoaded', initHome);
