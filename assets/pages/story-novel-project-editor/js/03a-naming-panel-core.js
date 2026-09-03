let activeNamingSimilarNames = [];

function normalizeSimilarNameValue(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function renderNamingSimilarNames() {
  const list = document.getElementById('namingSimilarNamesList');
  if (!list) return;
  list.innerHTML = activeNamingSimilarNames.map((name, index) => `
    <span class="naming-similar-name-chip">
      <span>${escapeHtml(name)}</span>
      <button type="button" onclick="removeNamingSimilarName(${index})" aria-label="Remove ${escapeHtml(name)}">&times;</button>
    </span>`).join('');
}

function setNamingSimilarNameInputOpen(open) {
  const row = document.getElementById('namingNameInputRow');
  const input = document.getElementById('namingSimilarNameInp');
  if (!row || !input) return;
  const isOpen = Boolean(open);
  input.hidden = !isOpen;
  row.classList.toggle('is-similar-input-open', isOpen);
  if (!isOpen) input.value = '';
}

function addNamingSimilarName() {
  const input = document.getElementById('namingSimilarNameInp');
  if (input?.hidden) {
    setNamingSimilarNameInputOpen(true);
    requestAnimationFrame(() => input.focus());
    return;
  }
  const primaryName = normalizeSimilarNameValue(document.getElementById('namingNameInp')?.value);
  const candidate = normalizeSimilarNameValue(input?.value);
  if (!candidate) {
    input?.focus();
    return;
  }
  const candidateKey = candidate.toLocaleLowerCase();
  if (
    candidateKey === primaryName.toLocaleLowerCase() ||
    activeNamingSimilarNames.some(name => name.toLocaleLowerCase() === candidateKey)
  ) {
    if (input) input.value = '';
    input?.focus();
    return;
  }
  activeNamingSimilarNames.push(candidate);
  if (input) input.value = '';
  renderNamingSimilarNames();
  input?.focus();
}

function removeNamingSimilarName(index) {
  if (!Number.isInteger(index) || index < 0 || index >= activeNamingSimilarNames.length) return;
  activeNamingSimilarNames.splice(index, 1);
  renderNamingSimilarNames();
}

function handleNamingSimilarNameKey(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  event.stopPropagation();
  addNamingSimilarName();
}

function handleNamingSimilarNameBlur() {
  // Defer one frame so a completed +/Enter add can settle first. The plus
  // button prevents pointer focus from leaving the input while it is clicked.
  requestAnimationFrame(() => {
    const input = document.getElementById('namingSimilarNameInp');
    if (document.activeElement !== input) setNamingSimilarNameInputOpen(false);
  });
}

function addTag() {
  activeNamingCategoryId = activeNamingCategoryId || expandedNamingCategoryId || namingData.categories[0]?.id;
  saveNamingEntry();
}

function addNamingCategory() {
  const input = document.getElementById('newNamingCategoryInp');
  const infoInput = document.getElementById('newNamingCategoryInfoInp');
  const title = input.value.trim();
  if (!title) return;
  if (namingCategoryTitleExists(title)) {
    showDuplicateReminder(text().duplicateCategoryTitle);
    return;
  }

  const category = {
    id: namingCategoryId(title),
    title,
    info: infoInput?.value.trim() || '',
    color: ['char', 'place', 'thing', 'other'][namingData.categories.length % 4]
  };
  const removedCategoryIds = new Set(namingData.removedCategoryIds || []);
  removedCategoryIds.delete(category.id);
  const chapterKey = currentNamingChapterKey();
  const visibleByChapter = { ...(namingData.visibleByChapter || {}) };
  const visibleSet = new Set(visibleByChapter[chapterKey] || []);
  visibleSet.add(category.id);
  visibleByChapter[chapterKey] = [...visibleSet];

  namingData = normalizeNamingData({
    categories: [...namingData.categories, category],
    removedCategoryIds: [...removedCategoryIds],
    hiddenByChapter: namingData.hiddenByChapter,
    visibleByChapter,
    detectedByChapter: namingData.detectedByChapter,
    entries: namingData.entries
  });
  expandedNamingCategoryId = category.id;
  input.value = '';
  if (infoInput) infoInput.value = '';
  setCategoryInputPanel(false);
  renderTags();
  saveNamingData();
  showSidePanelSaveLine(text().categorySaved);
}

const NAMING_CATEGORY_SHORTCUT_TIMEOUT_MS = 1200;
const DEVANAGARI_SHORTCUT_KEY_MAP = {
  अ: 'a',
  आ: 'a',
  इ: 'i',
  ई: 'i',
  उ: 'u',
  ऊ: 'u',
  ए: 'e',
  ऐ: 'e',
  ओ: 'o',
  औ: 'o',
  क: 'k',
  ख: 'k',
  ग: 'g',
  घ: 'g',
  ङ: 'n',
  च: 'c',
  छ: 'c',
  ज: 'j',
  झ: 'j',
  ञ: 'n',
  ट: 't',
  ठ: 't',
  ड: 'd',
  ढ: 'd',
  ण: 'n',
  त: 't',
  थ: 't',
  द: 'd',
  ध: 'd',
  न: 'n',
  प: 'h',
  फ: 'f',
  ब: 'b',
  भ: 'b',
  म: 'm',
  य: 'y',
  र: 'r',
  ल: 'l',
  व: 'v',
  श: 's',
  ष: 's',
  स: 's',
  ह: 'h',
  क़: 'k',
  ख़: 'k',
  ग़: 'g',
  ज़: 'j',
  ड़: 'd',
  ढ़: 'd',
  फ़: 'f',
  य़: 'y'
};
const DEVANAGARI_PHONETIC_SHORTCUT_KEY_MAP = {
  प: 'p',
  फ: 'ph',
  ख: 'kh',
  घ: 'gh',
  छ: 'ch',
  झ: 'jh',
  ठ: 'th',
  ढ: 'dh',
  थ: 't',
  ध: 'd',
  भ: 'bh',
  ञ: 'y',
  ङ: 'n'
};
let namingShortcutBuffer = '';
let namingShortcutResetTimer = null;
let activeCategoryShortcutEditId = null;
let activeFocusNamingCategoryId = null;
let namingEntryPanelHome = null;
let isFocusNamingEntryOpening = false;
let focusNamingEntryReturnSelection = null;
let focusNamingEditorPointerAt = 0;
let factComposerPanelHome = null;
let isFocusFactComposerOpening = false;
let focusFactSearchQuery = '';
let focusFactVisibleCount = FACTS_PAGE_SIZE;
let focusFactsEditorHoverTimer = null;
const FOCUS_FACTS_EDITOR_HOVER_CLOSE_MS = 2000;

function categoryShortcutForbiddenTokens(value) {
  return String(value || '')
    .toLocaleLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(token => ['ctrl', 'control', 'shift', 'tab'].includes(token));
}

function normalizeNamingShortcutInput(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase()
    .replace(/^alt/i, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 6);
}

function parseCategoryShortcutEditInput(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return { sequence: '', isValid: true, message: '' };
  if (categoryShortcutForbiddenTokens(rawValue).length) {
    return { sequence: '', isValid: false, message: text().categoryShortcutForbiddenKey };
  }
  if (!rawValue.toLocaleLowerCase().startsWith('alt')) {
    return { sequence: '', isValid: false, message: text().categoryShortcutNeedsAlt };
  }

  const sequence = normalizeNamingShortcutInput(rawValue);
  if (!sequence) return { sequence: '', isValid: false, message: text().categoryShortcutNeedsKey };
  return { sequence, isValid: true, message: '' };
}

function namingShortcutLabelFromSequence(sequence) {
  const cleanedSequence = normalizeNamingShortcutInput(sequence);
  return cleanedSequence ? `Alt+${cleanedSequence.toUpperCase().split('').join('+')}` : '';
}

function namingCategoryCustomShortcut(category) {
  return normalizeNamingShortcutInput(category?.shortcut || category?.shortcutSequence || '');
}

function resetNamingShortcutBuffer() {
  clearTimeout(namingShortcutResetTimer);
  namingShortcutResetTimer = null;
  namingShortcutBuffer = '';
}

function scheduleNamingShortcutReset() {
  clearTimeout(namingShortcutResetTimer);
  namingShortcutResetTimer = setTimeout(resetNamingShortcutBuffer, NAMING_CATEGORY_SHORTCUT_TIMEOUT_MS);
}

function namingShortcutWords(title) {
  return String(title || '')
    .normalize('NFC')
    .match(/[\p{L}\p{M}\p{N}]+/gu) || [];
}

function namingShortcutKeyCandidatesForWord(word) {
  const normalizedWord = String(word || '').normalize('NFC');
  const candidates = [];

  for (const character of Array.from(normalizedWord)) {
    if (/[\u0900-\u0903\u093C-\u094D\u0951-\u0957\u0962-\u0963]/u.test(character)) continue;

    const lowerCharacter = character.toLocaleLowerCase();
    if (/^[a-z0-9]$/u.test(lowerCharacter)) {
      candidates.push(lowerCharacter);
      break;
    }

    const primaryKey = DEVANAGARI_SHORTCUT_KEY_MAP[character];
    const phoneticKey = DEVANAGARI_PHONETIC_SHORTCUT_KEY_MAP[character];
    if (primaryKey) candidates.push(primaryKey[0].toLocaleLowerCase());
    if (phoneticKey) candidates.push(phoneticKey[0].toLocaleLowerCase());

    const asciiFallback = lowerCharacter
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .match(/[a-z0-9]/u)?.[0];
    if (asciiFallback) candidates.push(asciiFallback);

    if (candidates.length) break;
  }

  return [...new Set(candidates.filter(key => /^[a-z0-9]$/u.test(key)))];
}

function namingShortcutPrimaryKeyForWord(word) {
  return namingShortcutKeyCandidatesForWord(word)[0] || '';
}

function namingShortcutAliasSequences(keyCandidateSets) {
  return keyCandidateSets.reduce((sequences, candidates) => {
    if (!candidates.length) return sequences;
    return sequences.flatMap(sequence => candidates.map(candidate => `${sequence}${candidate}`));
  }, ['']);
}

function namingCategoryShortcutBase(category) {
  const words = namingShortcutWords(category?.title || category?.id);
  const shortcutWords = words.length >= 2 ? words.slice(0, 2) : words.slice(0, 1);
  const keyCandidateSets = shortcutWords.map(namingShortcutKeyCandidatesForWord);
  const primaryKeys = shortcutWords.map(namingShortcutPrimaryKeyForWord).filter(Boolean);
  return {
    base: primaryKeys.join(''),
    keyCandidateSets,
    needsNumber: words.length < 2
  };
}

function namingCategoryShortcutDefinitions() {
  namingData = normalizeNamingData(namingData);
  const generatedCategoryBases = namingData.categories
    .map((category, index) => ({
      category,
      index,
      customShortcut: namingCategoryCustomShortcut(category),
      ...namingCategoryShortcutBase(category)
    }))
    .filter(item => !item.customShortcut)
    .filter(item => item.base && item.keyCandidateSets.every(candidates => candidates.length));
  const baseGroups = generatedCategoryBases.reduce((groups, item) => {
    const group = groups.get(item.base) || [];
    group.push(item);
    groups.set(item.base, group);
    return groups;
  }, new Map());
  const generatedDefinitions = new Map(generatedCategoryBases.map(item => {
    const group = baseGroups.get(item.base) || [item];
    const suffix = item.needsNumber || group.length > 1
      ? String(group.findIndex(groupItem => groupItem.category.id === item.category.id) + 1)
      : '';
    const aliases = namingShortcutAliasSequences(item.keyCandidateSets)
      .map(alias => `${alias}${suffix}`)
      .filter(Boolean);
    const primarySequence = `${item.base}${suffix}`;
    return [item.category.id, {
      category: item.category,
      categoryId: item.category.id,
      sequence: primarySequence,
      aliases: [...new Set([primarySequence, ...aliases])],
      label: namingShortcutLabelFromSequence(primarySequence),
      index: item.index,
      isCustom: false
    }];
  }));

  return namingData.categories.map((category, index) => {
    const customShortcut = namingCategoryCustomShortcut(category);
    if (customShortcut) {
      return {
        category,
        categoryId: category.id,
        sequence: customShortcut,
        aliases: [customShortcut],
        label: namingShortcutLabelFromSequence(customShortcut),
        index,
        isCustom: true
      };
    }

    return generatedDefinitions.get(category.id) || {
      category,
      categoryId: category.id,
      sequence: '',
      aliases: [],
      label: '',
      index,
      isCustom: false
    };
  }).filter(definition => definition.sequence);
}

function namingCategoryShortcutDefinition(categoryId) {
  return namingCategoryShortcutDefinitions().find(definition => definition.categoryId === categoryId) || null;
}

function namingCategoryShortcutLabel(categoryId) {
  return namingCategoryShortcutDefinition(categoryId)?.label || '';
}

function isNamingShortcutUsedByAnotherCategory(sequence, categoryId) {
  const normalizedSequence = normalizeNamingShortcutInput(sequence);
  if (!normalizedSequence) return false;
  return namingCategoryShortcutDefinitions().some(definition =>
    definition.categoryId !== categoryId &&
    definition.aliases.some(alias => normalizeNamingShortcutInput(alias) === normalizedSequence)
  );
}

function updateNamingCategoryShortcut(categoryId, sequence) {
  const normalizedSequence = normalizeNamingShortcutInput(sequence);
  if (normalizedSequence && isNamingShortcutUsedByAnotherCategory(normalizedSequence, categoryId)) {
    showDuplicateReminder(text().categoryShortcutDuplicate);
    if (typeof setSidePanelSaveLine === 'function') setSidePanelSaveLine('busy', text().categoryShortcutDuplicate);
    return false;
  }

  namingData = normalizeNamingData({
    ...namingData,
    categories: namingData.categories.map(category =>
      category.id === categoryId ? { ...category, shortcut: normalizedSequence } : category
    )
  });
  saveNamingData();
  renderTags();
  if (typeof showSidePanelSaveLine === 'function') showSidePanelSaveLine(text().categoryShortcutSaved);
  return true;
}

function namingShortcutMatches() {
  const definitions = namingCategoryShortcutDefinitions();
  const exactMatches = definitions.filter(definition =>
    definition.aliases.some(alias => alias === namingShortcutBuffer)
  );
  const hasPrefixMatch = definitions.some(definition =>
    definition.aliases.some(alias => alias.startsWith(namingShortcutBuffer))
  );

  return { exactMatches, hasPrefixMatch };
}

function isNamingCategoryShortcutContextActive() {
  const editor = document.getElementById('editor');
  if (!editor || !canEditActiveDocument() || isTrashDraftActive()) return false;
  const activeElement = document.activeElement;
  return activeElement === editor || editor.contains(activeElement);
}

function ensureFocusNamingCategoryPanel() {
  let panel = document.getElementById('focusNamingCategoryPanel');
  if (panel) return panel;

  panel = document.createElement('div');
  panel.id = 'focusNamingCategoryPanel';
  panel.className = 'focus-naming-category-panel lm-id-focusNamingCategoryPanel';
  panel.dataset.focusPanelSlot = 'right';
  panel.dataset.focusPanelClose = 'hideFocusNamingCategoryPanel';
  panel.hidden = true;
  document.body.appendChild(panel);
  return panel;
}

function moveNamingEntryPanelToBody(panel) {
  if (!panel) return;
  if (!namingEntryPanelHome) {
    namingEntryPanelHome = {
      parent: panel.parentNode,
      nextSibling: panel.nextSibling
    };
  }
  if (panel.parentNode !== document.body) document.body.appendChild(panel);
}

function restoreNamingEntryPanelHome(panel = document.getElementById('namingEntryPanel')) {
  if (!panel || !namingEntryPanelHome?.parent || panel.parentNode === namingEntryPanelHome.parent) return;
  const { parent, nextSibling } = namingEntryPanelHome;
  if (nextSibling && nextSibling.parentNode === parent) {
    parent.insertBefore(panel, nextSibling);
  } else {
    parent.appendChild(panel);
  }
}

function captureFocusNamingEntryReturnSelection() {
  if (!isFocus || typeof editorRangeToTextOffsets !== 'function') return;
  const editor = document.getElementById('editor');
  const selection = window.getSelection();
  let sourceRange = null;
  if (
    selection?.rangeCount &&
    typeof isNodeInsideEditor === 'function' &&
    isNodeInsideEditor(selection.anchorNode) &&
    isNodeInsideEditor(selection.focusNode)
  ) {
    sourceRange = selection.getRangeAt(0).cloneRange();
  } else if (
    savedEditorRange &&
    typeof isNodeInsideEditor === 'function' &&
    isNodeInsideEditor(savedEditorRange.startContainer) &&
    isNodeInsideEditor(savedEditorRange.endContainer)
  ) {
    sourceRange = savedEditorRange.cloneRange();
  }
  focusNamingEntryReturnSelection = editorRangeToTextOffsets(sourceRange, editor);
}

function restoreFocusNamingEntryEditorFocus() {
  if (!isFocus) return false;
  const restored = typeof restoreEditorSelectionFromTextOffsets === 'function' &&
    restoreEditorSelectionFromTextOffsets(focusNamingEntryReturnSelection);
  focusNamingEntryReturnSelection = null;
  if (restored) return true;
  if (typeof restoreEditorSelection === 'function' && restoreEditorSelection()) return true;
  document.getElementById('editor')?.focus({ preventScroll: true });
  return true;
}

function positionFocusNamingEntryPanel(panel) {
  if (!panel) return false;
  const editor = document.getElementById('editor');
  if (!isFocus || !editor) return false;
  const config = window.lmFocusPanelPositionConfig?.(panel, {
    topOffset: 0,
    leftOffset: 0,
    rightOffset: 0,
    panelWidthFallback: 360,
    panelHeightFallback: 280,
    viewportPadding: 14
  }, { positionKey: 'focusNamingEntryPanel' }) || {};
  const editorRect = editor.getBoundingClientRect();
  const panelWidth = panel.offsetWidth || window.lmFocusPanelNumber?.(config.panelWidthFallback, 360) || 360;
  const panelHeight = panel.offsetHeight || window.lmFocusPanelNumber?.(config.panelHeightFallback, 280) || 280;
  const padding = window.lmFocusPanelNumber?.(config.viewportPadding, 14) ?? 14;
  const topOffset = window.lmFocusPanelNumber?.(config.topOffset, 0) ?? 0;
  const leftOffset = window.lmFocusPanelNumber?.(config.leftOffset, 0) ?? 0;
  const rightOffset = window.lmFocusPanelNumber?.(config.rightOffset, 0) ?? 0;
  const left = clampNumber(
    editorRect.left + editorRect.width / 2 - panelWidth / 2 + leftOffset - rightOffset,
    padding,
    Math.max(padding, window.innerWidth - panelWidth - padding)
  );
  const top = clampNumber(
    editorRect.top + editorRect.height / 2 - panelHeight / 2 + topOffset,
    padding,
    Math.max(padding, window.innerHeight - panelHeight - padding)
  );
  panel.style.position = 'fixed';
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.transform = 'none';
  panel.style.setProperty('--focus-entry-left', `${Math.round(left)}px`);
  panel.style.setProperty('--focus-entry-top', `${Math.round(top)}px`);
  return true;
}

function showFocusNamingEntryPanel(panel, categoryId) {
  if (!panel) return;
  isFocusNamingEntryOpening = true;
  captureFocusNamingEntryReturnSelection();
  if (typeof prepareFloatingPanelFocusReturn === 'function') prepareFloatingPanelFocusReturn(panel);
  moveNamingEntryPanelToBody(panel);
  activeFocusNamingCategoryId = categoryId;
  panel.hidden = false;
  panel.removeAttribute('hidden');
  panel.dataset.focusPortal = 'true';
  panel.classList.add('is-focus-center-panel');
  panel.classList.remove('is-focus-caret-panel');
  panel.style.setProperty('display', 'flex', 'important');
  panel.style.setProperty('visibility', 'visible', 'important');
  panel.style.setProperty('opacity', '1', 'important');
  if (typeof claimFocusPanelSlot === 'function') claimFocusPanelSlot(panel, 'center');
  positionFocusNamingEntryPanel(panel);
  requestAnimationFrame(() => {
    positionFocusNamingEntryPanel(panel);
    syncFocusNamingCategoryPanel(categoryId);
    document.getElementById('namingNameInp')?.focus({ preventScroll: true });
  });
  setTimeout(() => {
    isFocusNamingEntryOpening = false;
  }, 180);
}

function hideFocusNamingCategoryPanel() {
  activeFocusNamingCategoryId = null;
  const panel = document.getElementById('focusNamingCategoryPanel');
  if (!panel) return;
  panel.hidden = true;
  panel.innerHTML = '';
  panel.style.top = '';
  panel.style.maxHeight = '';
}

function positionFocusNamingCategoryPanel(panel) {
  const editor = document.getElementById('editor');
  if (!isFocus || !panel || !editor) return false;

  const editorRect = editor.getBoundingClientRect();
  const padding = 14;
  panel.style.top = `${Math.max(padding, Math.round(editorRect.top))}px`;
  panel.style.right = `${padding}px`;
  panel.style.maxHeight = `${Math.max(180, Math.round(window.innerHeight - editorRect.top - padding))}px`;
  panel.style.transform = 'none';
  return true;
}

function syncFocusNamingCategoryPanel(categoryId = activeFocusNamingCategoryId) {
  const panel = ensureFocusNamingCategoryPanel();
  if (!isFocus || !categoryId) {
    panel.hidden = true;
    panel.innerHTML = '';
    return false;
  }

  const sourceCard = [...document.querySelectorAll('#tag-display .naming-category-card')]
    .find(card => card.dataset.categoryId === categoryId);
  if (!sourceCard) {
    panel.hidden = true;
    panel.innerHTML = '';
    return false;
  }

  panel.innerHTML = '';
  panel.appendChild(sourceCard.cloneNode(true));
  positionFocusNamingCategoryPanel(panel);
  panel.hidden = false;
  if (typeof claimFocusPanelSlot === 'function') {
    claimFocusPanelSlot(panel, 'right', { closeFunction: 'hideFocusNamingCategoryPanel' });
  }
  return true;
}

function ensureFocusFactsPanel() {
  let panel = document.getElementById('focusFactsPanel');
  if (panel) return panel;

  panel = document.createElement('div');
  panel.id = 'focusFactsPanel';
  panel.className = 'focus-facts-panel lm-id-focusFactsPanel';
  panel.dataset.focusPanelSlot = 'right';
  panel.dataset.focusPanelClose = 'hideFocusFactsPanel';
  panel.dataset.positionKey = 'focusFactsPanel';
  panel.hidden = true;
  panel.setAttribute('aria-hidden', 'true');
  panel.addEventListener('pointerenter', clearFocusFactsEditorHoverTimer);
  panel.addEventListener('pointerleave', clearFocusFactsEditorHoverTimer);
  document.body.appendChild(panel);
  return panel;
}

function focusFactRelatedCenterPanels() {
  return [
    document.getElementById('factComposerPanel'),
    document.getElementById('factDetailPanel')
  ].filter(panel => panel?.classList.contains('is-focus-center-panel'));
}

function isFocusFactRelatedTarget(target) {
  const factsPanel = document.getElementById('focusFactsPanel');
  return Boolean(
    factsPanel?.contains(target) ||
    focusFactRelatedCenterPanels().some(panel => !panel.hidden && panel.contains(target))
  );
}

function clearFocusFactsEditorHoverTimer() {
  clearTimeout(focusFactsEditorHoverTimer);
  focusFactsEditorHoverTimer = null;
}

function closeFocusFactRelatedPanels() {
  const composer = document.getElementById('factComposerPanel');
  const detail = document.getElementById('factDetailPanel');
  if (composer?.classList.contains('is-focus-center-panel') && !composer.hidden) closeFactComposer();
  if (detail?.classList.contains('is-focus-center-panel') && !detail.hidden) closeFactDetailPanel();
}

function hideFocusFactsPanel(options = {}) {
  window.clearFocusHoverIntent?.('right');
  clearFocusFactsEditorHoverTimer();
  const panel = document.getElementById('focusFactsPanel');
  if (panel) {
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    panel.classList.remove('is-visible');
    panel.innerHTML = '';
  }
  if (options.closeRelated !== false) closeFocusFactRelatedPanels();
}

function scheduleFocusFactsEditorHoverClose() {
  const panel = document.getElementById('focusFactsPanel');
  if (!panel || panel.hidden || focusFactsEditorHoverTimer) return;
  focusFactsEditorHoverTimer = setTimeout(() => {
    focusFactsEditorHoverTimer = null;
    hideFocusFactsPanel();
  }, FOCUS_FACTS_EDITOR_HOVER_CLOSE_MS);
}

function focusFactsFilteredData() {
  storyFacts = normalizeStoryFacts(storyFacts);
  const query = focusFactSearchQuery.trim().toLowerCase();
  const filteredFacts = query
    ? storyFacts.filter(fact => fact.keyword.toLowerCase().includes(query))
    : storyFacts;
  const currentChapterKey = chapterStorageKey(curChap);
  const pinnedFacts = filteredFacts.filter(fact => fact.pinned);
  const unpinnedFacts = filteredFacts.filter(fact => !fact.pinned);
  const currentChapterFacts = unpinnedFacts.filter(fact => fact.chapterKey === currentChapterKey);
  const recentFacts = unpinnedFacts.filter(fact => fact.chapterKey !== currentChapterKey);
  return { pinnedFacts, currentChapterFacts, recentFacts };
}

function focusFactsSectionHtml(title, facts, state) {
  if (!facts.length) return '';
  return `
    <section class="fact-section">
      <div class="fact-section-title">${escapeHtml(title)}</div>
      ${facts.map(fact => factCardHtml(fact, state)).join('')}
    </section>`;
}

function renderFocusFactsPanel(panel = document.getElementById('focusFactsPanel')) {
  if (!panel) return false;
  const copy = text();
  const { pinnedFacts, currentChapterFacts, recentFacts } = focusFactsFilteredData();
  const visibleRecentFacts = recentFacts.slice(0, focusFactVisibleCount);
  const sections = [
    focusFactsSectionHtml(copy.pinnedFacts, pinnedFacts, 'recent'),
    focusFactsSectionHtml(copy.factsInCurrentChapter, currentChapterFacts, 'current'),
    focusFactsSectionHtml(copy.recentFacts, visibleRecentFacts, 'recent')
  ].filter(Boolean);
  const hasMore = focusFactVisibleCount < recentFacts.length;
  const canCollapse = recentFacts.length > FACTS_PAGE_SIZE && !hasMore;

  panel.innerHTML = `
    <div class="focus-facts-shell">
      <div class="facts-search-wrap focus-facts-search-wrap">
        <input type="text" id="focusFactSearchInp" class="lm-id-focusFactSearchInp"
          value="${escapeHtml(focusFactSearchQuery)}"
          placeholder="${escapeHtml(copy.factSearchPlaceholder)}"
          oninput="updateFocusFactSearch(this.value)">
        <button class="fact-open-compose-btn lm-id-focusOpenFactComposerBtn" type="button"
          onclick="openFactComposer(this)">${escapeHtml(copy.addFact)}</button>
      </div>
      <div class="chapter-notes fact-list focus-facts-list">
        ${sections.length ? sections.join('') : `<p class="fact-empty">${escapeHtml(focusFactSearchQuery ? copy.noFactMatches : copy.noFacts)}</p>`}
      </div>
      <div class="fact-list-actions focus-facts-actions">
        ${hasMore
      ? `<button class="fact-more-btn" type="button" onclick="showMoreFocusFacts()">${escapeHtml(copy.showMoreFacts)}</button>`
      : canCollapse
        ? `<button class="fact-more-btn" type="button" onclick="showLessFocusFacts()">${escapeHtml(copy.showLessFacts)}</button>`
        : ''}
      </div>
    </div>`;
  return true;
}

function positionFocusFactsPanel() {
  const panel = document.getElementById('focusFactsPanel');
  const editor = document.getElementById('editor');
  if (!panel || panel.hidden || !editor) return false;

  const editorRect = editor.getBoundingClientRect();
  const config = window.lmFocusPanelPositionConfig?.(panel, {
    gap: 16,
    topOffset: 0,
    leftOffset: 0,
    rightOffset: 0,
    panelWidth: 315,
    viewportPadding: 12
  }, { positionKey: 'focusFactsPanel' }) || window.lmFloatingPanelPositionConfig?.(panel, {
    gap: 16,
    topOffset: 0,
    leftOffset: 0,
    rightOffset: 0,
    panelWidth: 315,
    viewportPadding: 12
  }, { positionKey: 'focusFactsPanel' }) || {};
  const panelWidth = window.lmFocusPanelNumber?.(config.panelWidth, 315) ?? window.lmPanelNumber?.(config.panelWidth, 315) ?? 315;
  const panelHeight = panel.offsetHeight || panel.getBoundingClientRect().height || editorRect.height;
  const padding = window.lmFocusPanelNumber?.(config.viewportPadding, 12) ?? window.lmPanelNumber?.(config.viewportPadding, 12) ?? 12;
  const gap = window.lmFocusPanelNumber?.(config.gap, 16) ?? window.lmPanelNumber?.(config.gap, 16) ?? 16;
  const leftOffset = window.lmFocusPanelNumber?.(config.leftOffset, 0) ?? window.lmPanelNumber?.(config.leftOffset, 0) ?? 0;
  const rightOffset = window.lmFocusPanelNumber?.(config.rightOffset, 0) ?? window.lmPanelNumber?.(config.rightOffset, 0) ?? 0;
  const topOffset = window.lmFocusPanelNumber?.(config.topOffset, 0) ?? window.lmPanelNumber?.(config.topOffset, 0) ?? 0;
  const left = Math.min(
    Math.max(padding, editorRect.right + gap + leftOffset - rightOffset),
    Math.max(padding, window.innerWidth - panelWidth - padding)
  );
  const top = Math.min(
    Math.max(padding, editorRect.top + topOffset),
    Math.max(padding, window.innerHeight - panelHeight - padding)
  );

  panel.style.position = 'fixed';
  panel.style.width = `${Math.round(panelWidth)}px`;
  panel.style.maxHeight = `${Math.max(180, Math.round(Math.min(editorRect.height, window.innerHeight - padding * 2)))}px`;
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  return true;
}

function showFocusFactsPanel() {
  if (!isFocus || isTrashDraftActive()) return false;
  if (typeof isFocusTopPanelOpen === 'function' && isFocusTopPanelOpen()) return false;
  const panel = ensureFocusFactsPanel();
  if (!renderFocusFactsPanel(panel)) return false;

  clearFocusFactsEditorHoverTimer();
  panel.hidden = false;
  panel.setAttribute('aria-hidden', 'false');
  panel.classList.add('is-visible');
  if (typeof claimFocusPanelSlot === 'function') {
    claimFocusPanelSlot(panel, 'right', { closeFunction: 'hideFocusFactsPanel' });
  }
  positionFocusFactsPanel();
  return true;
}

function refreshVisibleFocusFactsPanel() {
  const panel = document.getElementById('focusFactsPanel');
  if (!panel || panel.hidden) return false;
  renderFocusFactsPanel(panel);
  positionFocusFactsPanel();
  return true;
}

function updateFocusFactSearch(value = '') {
  focusFactSearchQuery = String(value || '');
  focusFactVisibleCount = FACTS_PAGE_SIZE;
  refreshVisibleFocusFactsPanel();
  requestAnimationFrame(() => {
    const input = document.getElementById('focusFactSearchInp');
    if (!input) return;
    input.focus({ preventScroll: true });
    input.setSelectionRange?.(input.value.length, input.value.length);
  });
}

function showMoreFocusFacts() {
  focusFactVisibleCount += FACTS_PAGE_SIZE;
  refreshVisibleFocusFactsPanel();
}

function showLessFocusFacts() {
  focusFactVisibleCount = FACTS_PAGE_SIZE;
  refreshVisibleFocusFactsPanel();
  document.querySelector('#focusFactsPanel .focus-facts-list')?.scrollTo({ top: 0, behavior: 'smooth' });
}

function isFocusFactsHoverZone(event) {
  if (!isFocus || !event) return false;
  if (typeof isFocusTopPanelOpen === 'function' && isFocusTopPanelOpen()) return false;
  const editor = document.getElementById('editor');
  const panel = document.getElementById('focusFactsPanel');
  if (panel?.contains(event.target) || isFocusFactRelatedTarget(event.target)) return true;
  if (!editor || editor.contains(event.target)) return false;

  const editorRect = editor.getBoundingClientRect();
  return event.clientX > editorRect.right &&
    event.clientY >= editorRect.top &&
    event.clientY <= editorRect.bottom;
}

function handleFocusFactsPointerMove(event) {
  if (!isFocus) {
    window.clearFocusHoverIntent?.('right');
    hideFocusFactsPanel();
    return;
  }
  if (typeof isFocusTopPanelOpen === 'function' && isFocusTopPanelOpen()) {
    window.clearFocusHoverIntent?.('right');
    hideFocusFactsPanel();
    return;
  }
  if (isFocusFactRelatedTarget(event.target)) {
    window.clearFocusHoverIntent?.('right');
    clearFocusFactsEditorHoverTimer();
    return;
  }
  const editor = document.getElementById('editor');
  if (editor?.contains(event.target)) {
    window.clearFocusHoverIntent?.('right');
    scheduleFocusFactsEditorHoverClose();
    return;
  }
  clearFocusFactsEditorHoverTimer();
  if (isFocusFactsHoverZone(event)) {
    const panel = document.getElementById('focusFactsPanel');
    if (panel && !panel.hidden) {
      window.clearFocusHoverIntent?.('right');
      showFocusFactsPanel();
    } else if (typeof window.scheduleFocusHoverIntent === 'function') {
      window.scheduleFocusHoverIntent('right', event, isFocusFactsHoverZone, showFocusFactsPanel);
    } else {
      showFocusFactsPanel();
    }
  } else {
    window.clearFocusHoverIntent?.('right');
    hideFocusFactsPanel({ closeRelated: false });
  }
}

function handleFocusFactsPointerDown(event) {
  if (!isFocus) {
    hideFocusFactsPanel();
    return;
  }
  const panel = document.getElementById('focusFactsPanel');
  if (!panel || panel.hidden) return;
  if (panel.contains(event.target)) {
    clearFocusFactsEditorHoverTimer();
    return;
  }
  hideFocusFactsPanel({ closeRelated: false });
}

function moveFactComposerPanelToBody(panel) {
  if (!panel) return;
  if (!factComposerPanelHome) {
    factComposerPanelHome = {
      parent: panel.parentNode,
      nextSibling: panel.nextSibling
    };
  }
  if (panel.parentNode !== document.body) document.body.appendChild(panel);
}

function restoreFactComposerPanelHome(panel = document.getElementById('factComposerPanel')) {
  if (!panel || !factComposerPanelHome?.parent || panel.parentNode === factComposerPanelHome.parent) return;
  const { parent, nextSibling } = factComposerPanelHome;
  if (nextSibling && nextSibling.parentNode === parent) parent.insertBefore(panel, nextSibling);
  else parent.appendChild(panel);
}

function positionFocusFactCenterPanel(panel) {
  if (!panel) return false;
  const editor = document.getElementById('editor');
  if (!isFocus || !editor) return false;
  const config = window.lmFocusPanelPositionConfig?.(panel, {
    topOffset: 0,
    leftOffset: 0,
    rightOffset: 0,
    panelWidthFallback: 360,
    panelHeightFallback: 280,
    viewportPadding: 14
  }, { positionKey: 'focusFactCenterPanel' }) || {};
  const editorRect = editor.getBoundingClientRect();
  const panelWidth = panel.offsetWidth || window.lmFocusPanelNumber?.(config.panelWidthFallback, 360) || 360;
  const panelHeight = panel.offsetHeight || window.lmFocusPanelNumber?.(config.panelHeightFallback, 280) || 280;
  const padding = window.lmFocusPanelNumber?.(config.viewportPadding, 14) ?? 14;
  const topOffset = window.lmFocusPanelNumber?.(config.topOffset, 0) ?? 0;
  const leftOffset = window.lmFocusPanelNumber?.(config.leftOffset, 0) ?? 0;
  const rightOffset = window.lmFocusPanelNumber?.(config.rightOffset, 0) ?? 0;
  const left = clampNumber(
    editorRect.left + editorRect.width / 2 - panelWidth / 2 + leftOffset - rightOffset,
    padding,
    Math.max(padding, window.innerWidth - panelWidth - padding)
  );
  const top = clampNumber(
    editorRect.top + editorRect.height / 2 - panelHeight / 2 + topOffset,
    padding,
    Math.max(padding, window.innerHeight - panelHeight - padding)
  );
  panel.style.position = 'fixed';
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.transform = 'none';
  panel.style.setProperty('--focus-entry-left', `${Math.round(left)}px`);
  panel.style.setProperty('--focus-entry-top', `${Math.round(top)}px`);
  return true;
}

function showFocusFactComposerPanel(panel) {
  if (!panel) return;
  isFocusFactComposerOpening = true;
  if (typeof prepareFloatingPanelFocusReturn === 'function') prepareFloatingPanelFocusReturn(panel);
  moveFactComposerPanelToBody(panel);
  panel.hidden = false;
  panel.removeAttribute('hidden');
  panel.dataset.focusPortal = 'true';
  panel.classList.add('is-focus-center-panel', 'is-focus-fact-composer-panel');
  panel.style.setProperty('display', 'flex', 'important');
  panel.style.setProperty('visibility', 'visible', 'important');
  panel.style.setProperty('opacity', '1', 'important');
  if (typeof claimFocusPanelSlot === 'function') {
    claimFocusPanelSlot(panel, 'center', { closeFunction: 'closeFactComposer' });
  }
  positionFocusFactCenterPanel(panel);
  requestAnimationFrame(() => {
    positionFocusFactCenterPanel(panel);
    document.getElementById('factKeywordInp')?.focus({ preventScroll: true });
  });
  setTimeout(() => {
    isFocusFactComposerOpening = false;
  }, 180);
}

document.addEventListener('focusin', event => {
  const editor = document.getElementById('editor');
  if (isFocusNamingEntryOpening || !isFocus || !activeFocusNamingCategoryId || !editor?.contains(event.target)) return;
  if (Date.now() - focusNamingEditorPointerAt > 700) return;
  closeNamingEntryPanel();
});

document.addEventListener('pointerdown', event => {
  const editor = document.getElementById('editor');
  if (!isFocus || !activeFocusNamingCategoryId || !editor?.contains(event.target)) return;
  focusNamingEditorPointerAt = Date.now();
}, true);

function openNamingEntryPanelFromShortcut(categoryId) {
  const category = namingData.categories.find(item => item.id === categoryId);
  if (!category) return false;

  if (typeof setFindPanel === 'function') setFindPanel(false);
  if (typeof setToolDock === 'function') setToolDock(false);
  switchSidePanel('naming');
  expandedNamingCategoryId = categoryId;
  if (isFocus) activeFocusNamingCategoryId = categoryId;
  renderTags();
  openNamingEntryPanel(categoryId, null);
  return true;
}

function handleNamingCategoryShortcut(event, key) {
  if (!event.altKey || event.ctrlKey || event.metaKey || !isNamingCategoryShortcutContextActive()) {
    resetNamingShortcutBuffer();
    return false;
  }

  if (!/^[a-z0-9]$/u.test(key)) {
    if (key !== 'alt') resetNamingShortcutBuffer();
    return false;
  }

  namingShortcutBuffer = `${namingShortcutBuffer}${key}`.slice(0, 4);
  const { exactMatches, hasPrefixMatch } = namingShortcutMatches();

  if (!hasPrefixMatch) {
    resetNamingShortcutBuffer();
    return false;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  if (exactMatches.length) {
    const selectedMatch = exactMatches
      .sort((firstMatch, secondMatch) => firstMatch.index - secondMatch.index)[0];
    resetNamingShortcutBuffer();
    openNamingEntryPanelFromShortcut(selectedMatch.categoryId);
    return true;
  }

  scheduleNamingShortcutReset();
  return true;
}

let categoryManagerScrollThumbDrag = null;
let categoryManagerScrollHideTimer = null;
let categoryActionTriggerClickTimer = null;
let categoryActionTriggerInfoTimer = null;
let namingEntryDescriptionInfoTimer = null;
let namingEntryDescriptionCloseTimer = null;
let namingEntryDescriptionPositionRaf = null;
let activeNamingEntryDescriptionId = null;
let activeNamingEntryDescriptionAnchor = null;
let activeInlineCategoryTitleEdit = null;
const CATEGORY_ACTION_TRIGGER_CLICK_DELAY_MS = 320;
const CATEGORY_ACTION_TRIGGER_INFO_DELAY_MS = 250;
const NAMING_ENTRY_DESCRIPTION_INFO_DELAY_MS = 250;
const NAMING_ENTRY_DESCRIPTION_CLOSE_DELAY_MS = 260;

function setCategoryInputPanel(open, anchor = document.getElementById('addCategoryBtn')) {
  const panel = document.getElementById('categoryInputPanel');
  const input = document.getElementById('newNamingCategoryInp');
  const infoInput = document.getElementById('newNamingCategoryInfoInp');
  if (!panel || !input) return;
  panel.hidden = !open;
  if (open) {
    closeCategoryActionPanel();
    closeNamingEntryPanel();
    closeNameDetailPanel();
    activeFloatingAnchor = anchor;
    positionFloatingPanel(panel, anchor);
    requestAnimationFrame(() => input.focus());
  } else {
    input.value = '';
    if (infoInput) infoInput.value = '';
    activeFloatingAnchor = null;
  }
}

function toggleCategoryInputPanel(anchor = document.getElementById('addCategoryBtn')) {
  const panel = document.getElementById('categoryInputPanel');
  setCategoryInputPanel(panel?.hidden !== false, anchor);
}

function handleCategoryInputKey(event) {
  if (event.key === 'Enter' && event.target?.tagName !== 'TEXTAREA') {
    event.preventDefault();
    addNamingCategory();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    setCategoryInputPanel(false);
  }
}

function toggleNamingCategory(categoryId) {
  const isClosingCurrent = expandedNamingCategoryId === categoryId;
  expandedNamingCategoryId = isClosingCurrent ? '' : categoryId;

  if (window.activeExpandedCategoryWithShowMore) {
    if (isClosingCurrent || window.activeExpandedCategoryWithShowMore !== expandedNamingCategoryId) {
      window.activeExpandedCategoryWithShowMore = null;
      window.categorySearchQuery = '';
      window.categorySortOption = 'status';
      const globalRow = document.querySelector('.naming-search-sort-row');
      if (globalRow) globalRow.hidden = false;
      closeCategorySortPanel();
    }
  }

  renderTags();
}

function handleNamingCategoryToggleKey(event, categoryId) {
  if (event.target?.closest?.('.category-title-inline-input')) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  toggleNamingCategory(categoryId);
}

function currentNamingChapterKey() {
  return activeEditorStorageKey();
}

function hiddenCategoriesForChapter(chapterKey = currentNamingChapterKey()) {
  namingData = normalizeNamingData(namingData);
  return new Set(namingData.hiddenByChapter?.[chapterKey] || []);
}

function visibleCategoriesForChapter(chapterKey = currentNamingChapterKey()) {
  namingData = normalizeNamingData(namingData);
  return new Set(namingData.visibleByChapter?.[chapterKey] || []);
}

function namingCategoryChapterCount(categoryId, chapterKey = currentNamingChapterKey()) {
  return namingData.entries.filter(entry => entry.categoryId === categoryId && entry.chapterKey === chapterKey).length;
}

function activeNamingPanelText() {
  return typeof getCleanEditorText === 'function' ? getCleanEditorText() : '';
}

function namingEntryNameInText(entry = {}, textValue = activeNamingPanelText()) {
  return Boolean(
    entry?.name &&
    textValue &&
    typeof isNamingEntryUsedInText === 'function' &&
    isNamingEntryUsedInText(entry, textValue)
  );
}

function namingEntryMatchedName(entry = {}, textValue = activeNamingPanelText()) {
  if (!textValue || typeof namingEntrySearchNames !== 'function' || typeof isSavedNameUsedInText !== 'function') return '';
  return namingEntrySearchNames(entry).find(name => isSavedNameUsedInText(name, textValue)) || '';
}

function namingEntryDetectedAliasMatches(entry = {}, textValue = activeNamingPanelText()) {
  if (!textValue || typeof countSavedNameUsesInText !== 'function') return [];
  return (Array.isArray(entry.similarNames) ? entry.similarNames : [])
    .map((name, index) => ({ name, index, count: countSavedNameUsesInText(name, textValue) }))
    .filter(match => match.count > 0)
    .sort((left, right) => right.count - left.count || left.index - right.index);
}

function normalizeNamingMatchTitle(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function namingMinuteStamp(value = '') {
  const time = Date.parse(value);
  return Number.isFinite(time) ? Math.floor(time / 60000) : null;
}

function namingEntryPromotionMinuteMatchesChapter(entry = {}, chapter = {}) {
  const promotedMinute = namingMinuteStamp(entry.draftPromotedAt);
  if (promotedMinute === null) return true;

  const chapterMinute = namingMinuteStamp(chapter.createdAt);
  if (chapterMinute === null) return true;
  return promotedMinute === chapterMinute;
}

function namingEntryMatchesActiveDocument(entry = {}, activeText = activeNamingPanelText()) {
  if (!namingEntryNameInText(entry, activeText)) return false;

  const entryStatus = normalizeNamingEntryStatus(entry);
  if (isDraftActive()) {
    const draft = chapterDrafts[curDraft];
    if (!draft || entryStatus !== 'draft') return false;
    const draftTitle = draft.title || activeEditorDisplayTitle();
    const draftKey = draft.contentPath || (typeof draftFilePath === 'function' ? draftFilePath(curDraft) : `draft-${curDraft}`);
    return (
      entry.draftIndex === curDraft ||
      entry.draftKey === draftKey ||
      entry.chapterKey === draftKey ||
      entry.contentPath === draftKey
    );
  }

  const chapter = chapters[curChap];
  if (!chapter || entryStatus !== 'chapter') return false;
  const chapterKey = chapter.contentPath || (typeof chapterStorageKey === 'function' ? chapterStorageKey(curChap) : `chap-${curChap}`);

  return (
    entry.chapterIndex === curChap ||
    entry.chapterKey === chapterKey ||
    entry.contentPath === chapterKey
  );
}

function namingCategoryDetectedCount(categoryId, chapterKey = currentNamingChapterKey()) {
  const activeText = activeNamingPanelText();
  return namingData.entries.filter(entry =>
    entry.categoryId === categoryId &&
    !namingEntryMatchesActiveDocument(entry, activeText) &&
    namingEntryNameInText(entry, activeText)
  ).length;
}

function namingEntriesByActiveTextPriority(entries = [], activeText = activeNamingPanelText()) {
  const activeDocumentEntries = entries.filter(entry => namingEntryMatchesActiveDocument(entry, activeText));
  const activeDocumentNameKeys = new Set(activeDocumentEntries.map(entry => namingEntryNameKey(entry.name)));
  const detectedEntries = entries.filter(entry =>
    !activeDocumentNameKeys.has(namingEntryNameKey(entry.name)) &&
    namingEntryNameInText(entry, activeText) &&
    !namingEntryMatchesActiveDocument(entry, activeText)
  );
  const detectedNameKeys = new Set(detectedEntries.map(entry => namingEntryNameKey(entry.name)));
  const existingEntries = entries.filter(entry =>
    !activeDocumentNameKeys.has(namingEntryNameKey(entry.name)) &&
    !detectedNameKeys.has(namingEntryNameKey(entry.name)) &&
    !namingEntryNameInText(entry, activeText)
  );

  return { activeDocumentEntries, detectedEntries, existingEntries };
}

function namingEntryUsesOrphanStyle(entry = {}) {
  return typeof isOrphanStyleNamingEntry === 'function'
    ? isOrphanStyleNamingEntry(entry)
    : normalizeNamingEntryStatus(entry) === 'orphan';
}

function namingCategoryUndefinedCount(categoryId) {
  return namingData.entries.filter(entry =>
    entry.categoryId === categoryId &&
    isUndefinedNamingEntry(entry)
  ).length;
}

function normalizeNamingSourcePath(path = '') {
  return String(path || '').replace(/\\/g, '/').trim();
}

function namingEntrySourcePaths(entry = {}) {
  const chapterStatus = normalizeNamingEntryStatus(entry);
  const sourceKeys = chapterStatus === 'draft'
    ? [entry.draftKey, entry.contentPath, entry.chapterKey]
    : chapterStatus === 'chapter'
      ? [entry.chapterKey, entry.contentPath]
      : [entry.chapterKey, entry.contentPath, entry.draftKey];
  return [...new Set(sourceKeys.map(normalizeNamingSourcePath).filter(Boolean))];
}

function namingDocumentPathSets() {
  const livePaths = new Set([
    ...chapters.map(chapter => chapter.contentPath),
    ...chapterDrafts.map(draft => draft.contentPath)
  ].map(normalizeNamingSourcePath).filter(Boolean));
  const trashPaths = new Set(chapterTrashDrafts
    .flatMap(draft => [draft.contentPath, draft.originalContentPath])
    .map(normalizeNamingSourcePath)
    .filter(Boolean));

  return { livePaths, trashPaths };
}

function isNamingEntrySourceDetached(entry = {}, pathSets = namingDocumentPathSets()) {
  if (normalizeNamingEntryStatus(entry) === 'orphan') return true;

  const sourcePaths = namingEntrySourcePaths(entry);
  if (!sourcePaths.length) return false;

  if (sourcePaths.some(path => pathSets.trashPaths.has(path) || path.startsWith(`${PROJECT_TRASH_DIR}/`))) {
    return true;
  }

  return !sourcePaths.some(path => pathSets.livePaths.has(path));
}

function namingCategoryDetachedCount(categoryId) {
  const pathSets = namingDocumentPathSets();
  return namingData.entries.filter(entry =>
    entry.categoryId === categoryId &&
    isNamingEntrySourceDetached(entry, pathSets)
  ).length;
}

function isNamingCategoryVisible(categoryId, chapterKey = currentNamingChapterKey()) {
  if (hiddenCategoriesForChapter(chapterKey).has(categoryId)) return false;
  if (visibleCategoriesForChapter(chapterKey).has(categoryId)) return true;
  return namingCategoryChapterCount(categoryId, chapterKey) > 0 ||
    namingCategoryDetectedCount(categoryId, chapterKey) > 0 ||
    namingCategoryUndefinedCount(categoryId) > 0 ||
    namingCategoryDetachedCount(categoryId) > 0;
}

function categoryVisibilityIconSvg(isVisible) {
  return isVisible
    ? `${lmIcon("categoryVisible")}`
    : `${lmIcon("categoryHidden")}`;
}

function categoryVisibilityToggleButton(categoryId, isVisible, extraClass = '', showText = false) {
  const actionName = isVisible ? 'hideNamingCategoryForChapter' : 'showNamingCategoryForChapter';
  const label = isVisible ? text().hideCategoryInChapter : text().showCategoryInChapter;
  const shortLabel = isVisible ? text().hideCategory : text().showCategory;
  return `
    <button class="category-visibility-toggle ${isVisible ? 'is-on' : 'is-off'} ${extraClass}" type="button"
      onclick="${actionName}('${escapeJsString(categoryId)}')" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
      ${showText ? `<span class="category-visibility-label">${escapeHtml(shortLabel)}</span>` : ''}
      <span class="category-visibility-switch" aria-hidden="true">
        <span>${categoryVisibilityIconSvg(isVisible)}</span>
      </span>
    </button>`;
}

function namingCategoryGlobalCount(categoryId) {
  return namingData.entries.filter(entry => entry.categoryId === categoryId).length;
}

function canDeleteNamingCategory(categoryId) {
  return namingCategoryGlobalCount(categoryId) === 0;
}

function isCategoryManagerPanelOpen() {
  const panel = document.getElementById('categoryActionPanel');
  return Boolean(panel && !panel.hidden && panel.classList.contains('category-manager-panel'));
}

function deleteNamingCategory(categoryId, event = null) {
  event?.stopPropagation?.();
  namingData = normalizeNamingData(namingData);
  if (!canDeleteNamingCategory(categoryId)) return;
  const keepManagerOpen = isCategoryManagerPanelOpen();

  const defaultIds = new Set(defaultNamingCategories().map(category => category.id));
  const removedCategoryIds = new Set(namingData.removedCategoryIds || []);
  if (defaultIds.has(categoryId)) removedCategoryIds.add(categoryId);
  const hiddenByChapter = Object.fromEntries(
    Object.entries(namingData.hiddenByChapter || {}).map(([chapterKey, categoryIds]) => [
      chapterKey,
      categoryIds.filter(id => id !== categoryId)
    ])
  );
  const visibleByChapter = Object.fromEntries(
    Object.entries(namingData.visibleByChapter || {}).map(([chapterKey, categoryIds]) => [
      chapterKey,
      categoryIds.filter(id => id !== categoryId)
    ])
  );

  namingData = normalizeNamingData({
    categories: namingData.categories.filter(category => category.id !== categoryId),
    removedCategoryIds: [...removedCategoryIds],
    hiddenByChapter,
    visibleByChapter,
    detectedByChapter: namingData.detectedByChapter,
    entries: namingData.entries.filter(entry => entry.categoryId !== categoryId)
  });
  if (expandedNamingCategoryId === categoryId) expandedNamingCategoryId = namingData.categories[0]?.id || '';
  if (activeNamingCategoryId === categoryId) activeNamingCategoryId = null;
  closeNamingEntryPanel();
  closeNameDetailPanel();
  renderTags();
  if (keepManagerOpen) refreshCategoryManagerPanel();
  else closeCategoryActionPanel();
  saveNamingData();
  showSidePanelSaveLine(text().categoryDeleted);
}

function setNamingCategoryChapterVisibility(categoryId, hidden) {
  namingData = normalizeNamingData(namingData);
  const keepManagerOpen = isCategoryManagerPanelOpen();
  const chapterKey = currentNamingChapterKey();
  const hiddenSet = hiddenCategoriesForChapter(chapterKey);
  const visibleSet = visibleCategoriesForChapter(chapterKey);

  if (hidden) {
    hiddenSet.add(categoryId);
    visibleSet.delete(categoryId);
  } else {
    hiddenSet.delete(categoryId);
    visibleSet.add(categoryId);
  }

  namingData.hiddenByChapter = {
    ...(namingData.hiddenByChapter || {}),
    [chapterKey]: [...hiddenSet]
  };
  namingData.visibleByChapter = {
    ...(namingData.visibleByChapter || {}),
    [chapterKey]: [...visibleSet]
  };
  if (!namingData.hiddenByChapter[chapterKey].length) delete namingData.hiddenByChapter[chapterKey];
  if (!namingData.visibleByChapter[chapterKey].length) delete namingData.visibleByChapter[chapterKey];

  renderTags();
  if (keepManagerOpen) refreshCategoryManagerPanel();
  else closeCategoryActionPanel();
  saveNamingData();
  showSidePanelSaveLine(hidden ? text().categoryHiddenSaved : text().categoryShownSaved);
}

function hideNamingCategoryForChapter(categoryId) {
  setNamingCategoryChapterVisibility(categoryId, true);
}

function showNamingCategoryForChapter(categoryId) {
  setNamingCategoryChapterVisibility(categoryId, false);
}

