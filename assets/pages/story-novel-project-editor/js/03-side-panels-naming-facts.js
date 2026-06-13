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
  expandedNamingCategoryId = expandedNamingCategoryId === categoryId ? '' : categoryId;
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
    typeof isSavedNameUsedInText === 'function' &&
    isSavedNameUsedInText(entry.name, textValue)
  );
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
    return entry.draftIndex === curDraft &&
      normalizeNamingMatchTitle(entry.draftTitle) === normalizeNamingMatchTitle(draftTitle);
  }

  const chapter = chapters[curChap];
  if (!chapter || entryStatus !== 'chapter') return false;
  const chapterTitle = chapterDisplayTitle(chapter, curChap);
  return entry.chapterIndex === curChap &&
    normalizeNamingMatchTitle(entry.chapterTitle) === normalizeNamingMatchTitle(chapterTitle) &&
    namingEntryPromotionMinuteMatchesChapter(entry, chapter);
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

function closeCategoryActionPanel() {
  closeCategoryInfoPopover();
  clearTimeout(categoryManagerScrollHideTimer);
  categoryManagerScrollThumbDrag = null;
  activeCategoryShortcutEditId = null;
  const panel = document.getElementById('categoryActionPanel');
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = '';
    panel.onclick = null;
  }
  activeFloatingAnchor = null;
}

function ensureCategoryInfoPopover() {
  let panel = document.getElementById('categoryInfoPopover');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'categoryInfoPopover';
    panel.className = 'category-info-popover';
    panel.hidden = true;
    document.body.appendChild(panel);
  }
  return panel;
}

function closeCategoryInfoPopover() {
  clearTimeout(closeCategoryInfoPopover.timer);
  const panel = document.getElementById('categoryInfoPopover');
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = '';
    panel.onclick = null;
  }
  if (closeCategoryInfoPopover.parentClickHandler) {
    document.getElementById('categoryActionPanel')?.removeEventListener('click', closeCategoryInfoPopover.parentClickHandler);
    closeCategoryInfoPopover.parentClickHandler = null;
  }
}

function ensureNamingEntryDescriptionPopover() {
  let panel = document.getElementById('namingEntryDescriptionPopover');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'namingEntryDescriptionPopover';
    panel.className = 'category-info-popover naming-entry-description-popover';
    panel.hidden = true;
    document.body.appendChild(panel);
  }
  panel.classList.add('category-info-popover', 'naming-entry-description-popover');
  panel.dataset.positionKey = 'namingEntryDescriptionPopover';
  panel.setAttribute('role', 'button');
  panel.tabIndex = 0;
  if (panel.dataset.namingDescriptionInteractiveBound !== 'true') {
    panel.dataset.namingDescriptionInteractiveBound = 'true';
    panel.addEventListener('pointerenter', keepNamingEntryDescriptionPopoverOpen);
    panel.addEventListener('pointerleave', scheduleNamingEntryDescriptionInfoClose);
    panel.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      openNamingEntryDescriptionDetail();
    });
  }
  return panel;
}

function closeNamingEntryDescriptionPopover() {
  clearTimeout(closeNamingEntryDescriptionPopover.timer);
  clearNamingEntryDescriptionCloseTimer();
  cancelAnimationFrame(namingEntryDescriptionPositionRaf);
  namingEntryDescriptionPositionRaf = null;
  activeNamingEntryDescriptionId = null;
  activeNamingEntryDescriptionAnchor = null;
  const panel = document.getElementById('namingEntryDescriptionPopover');
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = '';
    panel.onclick = null;
    panel.removeAttribute('aria-label');
  }
}

function isNameDetailPanelOpen() {
  const panel = document.getElementById('nameDetailPanel');
  return Boolean(panel && !panel.hidden);
}

function clearNamingEntryDescriptionInfoTimer() {
  clearTimeout(namingEntryDescriptionInfoTimer);
  namingEntryDescriptionInfoTimer = null;
}

function clearNamingEntryDescriptionCloseTimer() {
  clearTimeout(namingEntryDescriptionCloseTimer);
  namingEntryDescriptionCloseTimer = null;
}

function scheduleNamingEntryDescriptionInfoClose() {
  clearNamingEntryDescriptionInfoTimer();
  clearNamingEntryDescriptionCloseTimer();
  namingEntryDescriptionCloseTimer = setTimeout(() => {
    namingEntryDescriptionCloseTimer = null;
    closeNamingEntryDescriptionPopover();
  }, NAMING_ENTRY_DESCRIPTION_CLOSE_DELAY_MS);
}

function keepNamingEntryDescriptionPopoverOpen() {
  clearNamingEntryDescriptionInfoTimer();
  clearNamingEntryDescriptionCloseTimer();
  clearTimeout(closeNamingEntryDescriptionPopover.timer);
  closeNamingEntryDescriptionPopover.timer = setTimeout(closeNamingEntryDescriptionPopover, 15000);
}

function openNamingEntryDescriptionDetail() {
  const entryId = activeNamingEntryDescriptionId;
  if (!entryId) return;
  const anchor = document.body.contains(activeNamingEntryDescriptionAnchor)
    ? activeNamingEntryDescriptionAnchor
    : null;
  showNameDetail(entryId, anchor);
}

function openNamingEntryDescriptionPanel(entryId, anchor = null) {
  if (isNameDetailPanelOpen() || !anchor) return;
  const panel = ensureNamingEntryDescriptionPopover();
  if (!panel) return;

  namingData = normalizeNamingData(namingData);
  const entry = namingData.entries.find(item => item.id === entryId);
  if (!entry) return;

  closeCategoryInfoPopover();
  closeNamingEntryDescriptionPopover();
  clearNamingEntryDescriptionCloseTimer();
  activeNamingEntryDescriptionId = entryId;
  activeNamingEntryDescriptionAnchor = anchor;
  panel.onclick = null;
  panel.setAttribute('aria-label', `Open details for ${entry.name}`);

  const description = entry.description || 'No description added yet.';
  panel.innerHTML = `
    <p class="category-info-copy naming-entry-description-copy ${entry.description ? '' : 'is-muted'}">${escapeHtml(description)}</p>`;
  panel.hidden = false;
  positionCategoryInfoPopover(panel, anchor, 'namingEntryDescriptionPopover');
  closeNamingEntryDescriptionPopover.timer = setTimeout(closeNamingEntryDescriptionPopover, 15000);
  requestAnimationFrame(() => {
    panel.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      openNamingEntryDescriptionDetail();
    };
  });
}

function scheduleNamingEntryDescriptionInfo(event, entryId) {
  clearNamingEntryDescriptionInfoTimer();
  clearNamingEntryDescriptionCloseTimer();
  if (isNameDetailPanelOpen()) {
    closeNamingEntryDescriptionPopover();
    return;
  }
  const anchor = event?.currentTarget || event?.target;
  if (!anchor) return;
  namingEntryDescriptionInfoTimer = setTimeout(() => {
    namingEntryDescriptionInfoTimer = null;
    if (isNameDetailPanelOpen()) return;
    if (!document.body.contains(anchor)) return;
    openNamingEntryDescriptionPanel(entryId, anchor);
  }, NAMING_ENTRY_DESCRIPTION_INFO_DELAY_MS);
}

function clearNamingEntryDescriptionInfo() {
  clearNamingEntryDescriptionInfoTimer();
  closeNamingEntryDescriptionPopover();
}

function scheduleNamingEntryDescriptionReposition() {
  cancelAnimationFrame(namingEntryDescriptionPositionRaf);
  namingEntryDescriptionPositionRaf = requestAnimationFrame(() => {
    namingEntryDescriptionPositionRaf = null;
    const panel = document.getElementById('namingEntryDescriptionPopover');
    if (!panel || panel.hidden || !activeNamingEntryDescriptionId || !activeNamingEntryDescriptionAnchor) return;
    if (isNameDetailPanelOpen()) {
      closeNamingEntryDescriptionPopover();
      return;
    }
    if (!document.body.contains(activeNamingEntryDescriptionAnchor)) {
      closeNamingEntryDescriptionPopover();
      return;
    }
    positionCategoryInfoPopover(panel, activeNamingEntryDescriptionAnchor, 'namingEntryDescriptionPopover');
  });
}

window.addEventListener('resize', scheduleNamingEntryDescriptionReposition, { passive: true });

function clearCategoryActionTriggerClickTimer() {
  clearTimeout(categoryActionTriggerClickTimer);
  categoryActionTriggerClickTimer = null;
}

function clearCategoryActionTriggerInfoTimer() {
  clearTimeout(categoryActionTriggerInfoTimer);
  categoryActionTriggerInfoTimer = null;
}

function categoryCardElement(categoryId) {
  return [...document.querySelectorAll('.naming-category-card')]
    .find(card => card.dataset.categoryId === categoryId) || null;
}

function cancelInlineCategoryTitleEdit() {
  const activeEdit = activeInlineCategoryTitleEdit;
  activeInlineCategoryTitleEdit = null;
  if (!activeEdit) return;
  activeEdit.input?.remove();
  if (activeEdit.titleElement) activeEdit.titleElement.hidden = false;
  activeEdit.toggleElement?.classList.remove('is-inline-editing');
}

function saveInlineCategoryTitleEdit(categoryId, input) {
  namingData = normalizeNamingData(namingData);
  const category = namingData.categories.find(item => item.id === categoryId);
  if (!category || !input) {
    cancelInlineCategoryTitleEdit();
    return;
  }

  const cleanedTitle = input.value.trim();
  const originalTitle = category.title || '';
  if (!cleanedTitle) {
    input.focus();
    input.select();
    return;
  }
  if (cleanedTitle === originalTitle) {
    cancelInlineCategoryTitleEdit();
    return;
  }
  if (namingCategoryTitleExists(cleanedTitle, categoryId)) {
    showDuplicateReminder(text().duplicateCategoryTitle);
    input.focus();
    input.select();
    return;
  }

  activeInlineCategoryTitleEdit = null;
  namingData = normalizeNamingData({
    categories: namingData.categories.map(item =>
      item.id === categoryId ? { ...item, title: cleanedTitle } : item
    ),
    removedCategoryIds: namingData.removedCategoryIds,
    hiddenByChapter: namingData.hiddenByChapter,
    visibleByChapter: namingData.visibleByChapter,
    detectedByChapter: namingData.detectedByChapter,
    entries: namingData.entries
  });
  renderTags();
  saveNamingData();
  showSidePanelSaveLine(text().categoryTitleSaved);
}

function beginInlineCategoryTitleEdit(categoryId) {
  namingData = normalizeNamingData(namingData);
  const category = namingData.categories.find(item => item.id === categoryId);
  const card = categoryCardElement(categoryId);
  const toggleElement = card?.querySelector?.('.category-toggle');
  const titleElement = toggleElement?.querySelector?.('.category-title-text');
  if (!category || !toggleElement || !titleElement) return;

  cancelInlineCategoryTitleEdit();
  closeCategoryActionPanel();
  closeCategoryInfoPopover();
  closeNamingEntryDescriptionPopover();
  closeNamingEntryPanel();
  closeNameDetailPanel();

  const input = document.createElement('input');
  input.className = 'category-title-inline-input';
  input.type = 'text';
  input.value = category.title || '';
  input.setAttribute('aria-label', text().editCategoryTitle);
  input.addEventListener('click', event => event.stopPropagation());
  input.addEventListener('pointerdown', event => event.stopPropagation());
  input.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      saveInlineCategoryTitleEdit(categoryId, input);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelInlineCategoryTitleEdit();
    }
  });
  input.addEventListener('blur', () => {
    requestAnimationFrame(() => {
      if (activeInlineCategoryTitleEdit?.input === input) cancelInlineCategoryTitleEdit();
    });
  });

  titleElement.hidden = true;
  titleElement.insertAdjacentElement('afterend', input);
  toggleElement.classList.add('is-inline-editing');
  activeInlineCategoryTitleEdit = { categoryId, input, titleElement, toggleElement };
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function handleCategoryActionTriggerClick(event, categoryId) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (event?.detail > 1) {
    clearCategoryActionTriggerClickTimer();
    return;
  }
  clearCategoryActionTriggerClickTimer();
  clearCategoryActionTriggerInfoTimer();
  closeCategoryInfoPopover();
  categoryActionTriggerClickTimer = setTimeout(() => {
    categoryActionTriggerClickTimer = null;
    beginInlineCategoryTitleEdit(categoryId);
  }, CATEGORY_ACTION_TRIGGER_CLICK_DELAY_MS);
}

function handleCategoryActionTriggerDoubleClick(event, categoryId) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  clearCategoryActionTriggerClickTimer();
  clearCategoryActionTriggerInfoTimer();
  cancelInlineCategoryTitleEdit();
  closeCategoryInfoPopover();
  hideNamingCategoryForChapter(categoryId);
}

function scheduleCategoryActionTriggerInfo(event, categoryId) {
  clearCategoryActionTriggerInfoTimer();
  const anchor = event?.currentTarget || event?.target;
  if (!anchor) return;
  categoryActionTriggerInfoTimer = setTimeout(() => {
    categoryActionTriggerInfoTimer = null;
    if (!document.body.contains(anchor)) return;
    openCategoryInfoPanel(categoryId, anchor);
  }, CATEGORY_ACTION_TRIGGER_INFO_DELAY_MS);
}

function clearCategoryActionTriggerInfo() {
  clearCategoryActionTriggerInfoTimer();
  closeCategoryInfoPopover();
}

function categoryManagerScrollElements() {
  const panel = document.getElementById('categoryActionPanel');
  return {
    panel,
    list: document.getElementById('categoryVisibilityList'),
    thumb: document.getElementById('categoryManagerScrollThumb')
  };
}

function categoryManagerScrollMetrics() {
  const { panel, list, thumb } = categoryManagerScrollElements();
  if (!panel || !list || !thumb || list.scrollHeight <= list.clientHeight + 1) return null;
  const panelRect = panel.getBoundingClientRect();
  const listRect = list.getBoundingClientRect();
  const trackHeight = list.clientHeight;
  const thumbHeight = Math.max(30, Math.round((list.clientHeight / list.scrollHeight) * trackHeight));
  const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
  const maxScroll = Math.max(1, list.scrollHeight - list.clientHeight);
  const thumbTop = (list.scrollTop / maxScroll) * maxThumbTop;
  return {
    panel,
    list,
    thumb,
    maxScroll,
    maxThumbTop,
    top: Math.round(listRect.top - panelRect.top + thumbTop),
    right: Math.max(7, Math.round(panelRect.right - listRect.right - 5)),
    height: thumbHeight
  };
}

function updateCategoryManagerScrollThumb(visible = false) {
  const { thumb } = categoryManagerScrollElements();
  const metrics = categoryManagerScrollMetrics();
  if (!thumb || !metrics) {
    if (thumb) {
      thumb.hidden = true;
      thumb.classList.remove('is-visible', 'is-dragging');
    }
    return;
  }

  thumb.hidden = false;
  thumb.style.top = `${metrics.top}px`;
  thumb.style.right = `${metrics.right}px`;
  thumb.style.height = `${metrics.height}px`;
  thumb.classList.toggle('is-visible', Boolean(visible || categoryManagerScrollThumbDrag));
}

function revealCategoryManagerScrollThumb() {
  clearTimeout(categoryManagerScrollHideTimer);
  updateCategoryManagerScrollThumb(true);
  categoryManagerScrollHideTimer = setTimeout(() => updateCategoryManagerScrollThumb(false), 900);
}

function startCategoryManagerScrollThumbDrag(event) {
  if (event.button !== undefined && event.button !== 0) return;
  const metrics = categoryManagerScrollMetrics();
  if (!metrics) return;
  categoryManagerScrollThumbDrag = {
    pointerId: event.pointerId,
    startY: event.clientY,
    startScrollTop: metrics.list.scrollTop,
    maxScroll: metrics.maxScroll,
    maxThumbTop: Math.max(1, metrics.maxThumbTop)
  };
  metrics.thumb.classList.add('is-dragging', 'is-visible');
  metrics.thumb.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function handleCategoryManagerScrollThumbDrag(event) {
  const drag = categoryManagerScrollThumbDrag;
  const { list } = categoryManagerScrollElements();
  if (!drag || !list || event.pointerId !== drag.pointerId) return;
  const deltaY = event.clientY - drag.startY;
  list.scrollTop = clampNumber(drag.startScrollTop + (deltaY / drag.maxThumbTop) * drag.maxScroll, 0, drag.maxScroll);
  updateCategoryManagerScrollThumb(true);
  event.preventDefault();
}

function endCategoryManagerScrollThumbDrag(event) {
  const drag = categoryManagerScrollThumbDrag;
  if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
  const { thumb } = categoryManagerScrollElements();
  thumb?.releasePointerCapture?.(drag.pointerId);
  thumb?.classList.remove('is-dragging');
  categoryManagerScrollThumbDrag = null;
  revealCategoryManagerScrollThumb();
}

function initCategoryManagerScrollThumb() {
  const { list, thumb } = categoryManagerScrollElements();
  if (!list || !thumb) return;
  list.addEventListener('scroll', revealCategoryManagerScrollThumb, { passive: true });
  list.addEventListener('pointerenter', revealCategoryManagerScrollThumb, { passive: true });
  list.addEventListener('pointermove', revealCategoryManagerScrollThumb, { passive: true });
  list.addEventListener('pointerleave', () => {
    clearTimeout(categoryManagerScrollHideTimer);
    categoryManagerScrollHideTimer = setTimeout(() => updateCategoryManagerScrollThumb(false), 320);
  });
  thumb.addEventListener('pointerdown', startCategoryManagerScrollThumbDrag);
  thumb.addEventListener('pointermove', handleCategoryManagerScrollThumbDrag);
  thumb.addEventListener('pointerup', endCategoryManagerScrollThumbDrag);
  thumb.addEventListener('pointercancel', endCategoryManagerScrollThumbDrag);
  thumb.addEventListener('pointerenter', () => updateCategoryManagerScrollThumb(true));
  thumb.addEventListener('pointerleave', () => {
    if (!categoryManagerScrollThumbDrag) updateCategoryManagerScrollThumb(false);
  });
  requestAnimationFrame(() => updateCategoryManagerScrollThumb(false));
}

function categoryManagerPanelHtml() {
  const categoryRows = namingData.categories.map(category => {
    const isVisible = isNamingCategoryVisible(category.id);
    const canDeleteCategory = canDeleteNamingCategory(category.id);
    return `
      <div class="category-visibility-row ${canDeleteCategory ? 'can-delete-category' : ''}">
        <span>${escapeHtml(category.title)}</span>
        ${canDeleteCategory ? `<button class="category-manager-delete-btn" type="button"
          onclick="deleteNamingCategory('${escapeJsString(category.id)}', event)"
          title="${escapeHtml(text().deleteCategoryTitle)}" aria-label="${escapeHtml(text().deleteCategoryTitle)}">
          ${DRAFT_DELETE_SVG}
        </button>` : ''}
        ${categoryVisibilityToggleButton(category.id, isVisible, 'category-visibility-row-toggle')}
      </div>`;
  }).join('');
  return `
    <div class="category-panel-head">
      <div class="category-manager-heading">
        <h4>${escapeHtml(text().categoryManagerTitle)}</h4>
      </div>
    <button class="name-panel-close" type="button" onclick="closeCategoryActionPanel()">${CROSS_CLOSE_SVG}</button>
    </div>
    <div class="category-visibility-list" id="categoryVisibilityList">${categoryRows}</div>
    <div class="category-manager-scroll-thumb" id="categoryManagerScrollThumb" hidden aria-hidden="true"></div>`;
}

function categoryManagerHomePanelHtml() {
  return `
    <div class="category-panel-head">
      <div class="category-manager-heading">
        <h4>${escapeHtml(text().categoryManagerHeading)}</h4>
      </div>
      <button class="name-panel-close" type="button" onclick="closeCategoryActionPanel()">${CROSS_CLOSE_SVG}</button>
    </div>
    <div class="category-manager-choice-list">
      <button class="category-manager-choice-btn" type="button" onclick="openCategoryVisibilityPanel(activeFloatingAnchor)">
        <span>${escapeHtml(text().categoryManagerVisibility)}</span>
      </button>
      <button class="category-manager-choice-btn" type="button" onclick="openCategoryShortcutsPanel(activeFloatingAnchor)">
        <span>${escapeHtml(text().categoryManagerShortcuts)}</span>
      </button>
    </div>`;
}

function categoryShortcutsPanelHtml() {
  const definitions = new Map(namingCategoryShortcutDefinitions().map(definition => [definition.categoryId, definition]));
  const categoryRows = namingData.categories.map(category => {
    const definition = definitions.get(category.id);
    const shortcutLabel = definition?.label || '';
    const shortcutValue = definition?.sequence || '';
    const isEditing = activeCategoryShortcutEditId === category.id;
    const customShortcut = namingCategoryCustomShortcut(category);
    const shortcutMode = customShortcut ? text().saved : text().categoryShortcutAutoHint;

    return `
      <div class="category-shortcut-row ${isEditing ? 'is-editing' : ''}">
        <span class="category-shortcut-title">${escapeHtml(category.title)}</span>
        <div class="category-shortcut-control">
          <div class="category-shortcut-display" ${isEditing ? 'hidden' : ''}>
            <button class="category-shortcut-value" type="button" onclick="beginCategoryShortcutEdit('${escapeJsString(category.id)}')"
              title="${escapeHtml(shortcutMode)}" aria-label="${escapeHtml(text().categoryShortcutEditTitle)}"
              ${shortcutLabel ? `data-lm-shortcut="${escapeHtml(shortcutLabel)}"` : ''}>
              ${escapeHtml(shortcutLabel || '—')}
            </button>
            <button class="category-shortcut-edit-btn" type="button" onclick="beginCategoryShortcutEdit('${escapeJsString(category.id)}')"
              title="${escapeHtml(text().categoryShortcutEditTitle)}" aria-label="${escapeHtml(text().categoryShortcutEditTitle)}">
              ${lmIcon("edit")}
            </button>
          </div>
          <div class="category-shortcut-edit-wrap" ${isEditing ? '' : 'hidden'}>
            <input class="category-shortcut-input" id="categoryShortcutInput_${escapeHtml(category.id)}" type="text"
              value="${escapeHtml(shortcutLabel)}" placeholder="Alt+C+N"
              data-original-sequence="${escapeHtml(shortcutValue)}"
              oninput="markCategoryShortcutUnsaved('${escapeJsString(category.id)}')"
              onkeydown="handleCategoryShortcutKey(event, '${escapeJsString(category.id)}')">
            <button class="category-shortcut-save-btn" id="categoryShortcutSave_${escapeHtml(category.id)}" type="button"
              onclick="saveCategoryShortcutEdit('${escapeJsString(category.id)}')" hidden>Save</button>
            <button class="category-shortcut-cancel-btn" type="button" onclick="cancelCategoryShortcutEdit()">Cancel</button>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="category-panel-head">
      <div class="category-manager-heading">
        <h4>${escapeHtml(text().categoryShortcutsTitle)}</h4>
      </div>
      <button class="name-panel-close" type="button" onclick="closeCategoryActionPanel()">${CROSS_CLOSE_SVG}</button>
    </div>
    <div class="category-shortcut-list">${categoryRows}</div>`;
}

function refreshCategoryManagerPanel() {
  const panel = document.getElementById('categoryActionPanel');
  if (!panel || panel.hidden || !panel.classList.contains('category-manager-panel')) return false;
  const previousScrollTop = document.getElementById('categoryVisibilityList')?.scrollTop || 0;
  namingData = normalizeNamingData(namingData);
  panel.innerHTML = categoryManagerPanelHtml();
  const list = document.getElementById('categoryVisibilityList');
  if (list) list.scrollTop = previousScrollTop;
  initCategoryManagerScrollThumb();
  return true;
}

function openCategoryManagerPanel(anchor = null) {
  const panel = document.getElementById('categoryActionPanel');
  if (!panel) return;

  namingData = normalizeNamingData(namingData);
  activeCategoryShortcutEditId = null;
  closeCategoryInfoPopover();
  closeNamingEntryPanel();
  closeNameDetailPanel();
  activeFloatingAnchor = anchor;
  panel.classList.remove('category-action-card-panel', 'category-info-panel', 'category-manager-panel', 'category-shortcut-manager-panel');
  panel.classList.add('category-manager-menu-panel');

  panel.innerHTML = categoryManagerHomePanelHtml();
  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
}

function openCategoryVisibilityPanel(anchor = activeFloatingAnchor) {
  const panel = document.getElementById('categoryActionPanel');
  if (!panel) return;

  namingData = normalizeNamingData(namingData);
  activeCategoryShortcutEditId = null;
  closeCategoryInfoPopover();
  closeNamingEntryPanel();
  closeNameDetailPanel();
  activeFloatingAnchor = anchor;
  panel.classList.remove('category-action-card-panel', 'category-info-panel', 'category-manager-menu-panel', 'category-shortcut-manager-panel');
  panel.classList.add('category-manager-panel');

  panel.innerHTML = categoryManagerPanelHtml();
  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
  initCategoryManagerScrollThumb();
}

function openCategoryShortcutsPanel(anchor = activeFloatingAnchor) {
  const panel = document.getElementById('categoryActionPanel');
  if (!panel) return;

  namingData = normalizeNamingData(namingData);
  closeCategoryInfoPopover();
  closeNamingEntryPanel();
  closeNameDetailPanel();
  activeFloatingAnchor = anchor;
  panel.classList.remove('category-action-card-panel', 'category-info-panel', 'category-manager-menu-panel', 'category-manager-panel');
  panel.classList.add('category-shortcut-manager-panel');

  panel.innerHTML = categoryShortcutsPanelHtml();
  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
  if (activeCategoryShortcutEditId) {
    requestAnimationFrame(() => document.getElementById(`categoryShortcutInput_${activeCategoryShortcutEditId}`)?.focus());
  }
}

function refreshCategoryShortcutsPanel() {
  const panel = document.getElementById('categoryActionPanel');
  if (!panel || panel.hidden || !panel.classList.contains('category-shortcut-manager-panel')) return false;
  panel.innerHTML = categoryShortcutsPanelHtml();
  return true;
}

function beginCategoryShortcutEdit(categoryId) {
  activeCategoryShortcutEditId = categoryId;
  refreshCategoryShortcutsPanel();
  requestAnimationFrame(() => {
    const input = document.getElementById(`categoryShortcutInput_${categoryId}`);
    input?.focus();
    input?.select();
  });
}

function cancelCategoryShortcutEdit() {
  activeCategoryShortcutEditId = null;
  refreshCategoryShortcutsPanel();
  if (typeof setSidePanelSaveLine === 'function') setSidePanelSaveLine('idle', text().saved);
}

function markCategoryShortcutUnsaved(categoryId) {
  const input = document.getElementById(`categoryShortcutInput_${categoryId}`);
  const saveButton = document.getElementById(`categoryShortcutSave_${categoryId}`);
  if (!input || !saveButton) return;

  const parsedInput = parseCategoryShortcutEditInput(input.value);
  const normalizedValue = parsedInput.sequence;
  const originalSequence = normalizeNamingShortcutInput(input.dataset.originalSequence);
  const duplicate = parsedInput.isValid && normalizedValue && isNamingShortcutUsedByAnotherCategory(normalizedValue, categoryId);
  input.classList.toggle('is-invalid', !parsedInput.isValid);
  input.classList.toggle('is-duplicate', Boolean(duplicate));
  saveButton.hidden = parsedInput.isValid && normalizedValue === originalSequence && !duplicate;
  saveButton.disabled = !parsedInput.isValid || Boolean(duplicate);
  if (!parsedInput.isValid) {
    if (typeof setSidePanelSaveLine === 'function') setSidePanelSaveLine('busy', parsedInput.message);
  } else if (duplicate) {
    if (typeof setSidePanelSaveLine === 'function') setSidePanelSaveLine('busy', text().categoryShortcutDuplicate);
  } else if (normalizedValue !== originalSequence) {
    if (typeof setSidePanelSaveLine === 'function') setSidePanelSaveLine('busy', text().categoryShortcutUnsaved);
  }
}

function saveCategoryShortcutEdit(categoryId) {
  const input = document.getElementById(`categoryShortcutInput_${categoryId}`);
  if (!input) return;
  const parsedInput = parseCategoryShortcutEditInput(input.value);
  if (!parsedInput.isValid) {
    input.classList.add('is-invalid');
    if (typeof setSidePanelSaveLine === 'function') setSidePanelSaveLine('busy', parsedInput.message);
    return;
  }
  const saved = updateNamingCategoryShortcut(categoryId, parsedInput.sequence);
  if (!saved) {
    input.classList.add('is-duplicate');
    return;
  }
  activeCategoryShortcutEditId = null;
  openCategoryShortcutsPanel(activeFloatingAnchor);
}

function appendCategoryShortcutKey(input, categoryId, key) {
  if (!input) return;
  const replacementKey = String(key || '').toLocaleLowerCase();
  if (!/^[a-z0-9]$/u.test(replacementKey)) return;

  const parsedInput = parseCategoryShortcutEditInput(input.value);
  const currentSequence = !parsedInput.isValid || (input.selectionStart === 0 && input.selectionEnd === input.value.length)
    ? ''
    : parsedInput.sequence;
  const nextSequence = `${currentSequence}${replacementKey}`.slice(0, 6);
  input.value = namingShortcutLabelFromSequence(nextSequence);
  input.setSelectionRange(input.value.length, input.value.length);
  markCategoryShortcutUnsaved(categoryId);
}

function handleCategoryShortcutKey(event, categoryId) {
  if (event.key === 'Alt') {
    event.preventDefault();
    return;
  }
  if (event.altKey) {
    event.preventDefault();
    if (event.ctrlKey || event.shiftKey || event.metaKey || ['Tab', 'Control', 'Shift'].includes(event.key)) {
      if (typeof setSidePanelSaveLine === 'function') setSidePanelSaveLine('busy', text().categoryShortcutForbiddenKey);
      return;
    }
    appendCategoryShortcutKey(event.currentTarget, categoryId, event.key);
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    saveCategoryShortcutEdit(categoryId);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    cancelCategoryShortcutEdit();
  }
}

function openCategoryInfoPanel(categoryId, anchor = activeFloatingAnchor) {
  const panel = ensureCategoryInfoPopover();
  if (!panel) return;

  namingData = normalizeNamingData(namingData);
  const category = namingData.categories.find(item => item.id === categoryId);
  if (!category) return;

  closeCategoryInfoPopover();
  panel.onclick = null;

  const categoryInfo = category.info || text().categoryInfoEmpty;
  panel.innerHTML = `
    <p class="category-info-copy ${category.info ? '' : 'is-muted'}">${escapeHtml(categoryInfo)}</p>`;
  panel.hidden = false;
  positionCategoryInfoPopover(panel, anchor);
  closeCategoryInfoPopover.timer = setTimeout(closeCategoryInfoPopover, 15000);
  requestAnimationFrame(() => {
    panel.onclick = event => {
      event.stopPropagation();
      closeCategoryInfoPopover();
    };
    closeCategoryInfoPopover.parentClickHandler = event => {
      if (event.target?.closest?.('.category-info-btn')) return;
      closeCategoryInfoPopover();
    };
    document.getElementById('categoryActionPanel')?.addEventListener('click', closeCategoryInfoPopover.parentClickHandler);
  });
}

function clampInfoPopoverPosition(panel, left, top, positionConfig = {}) {
  const clampMode = String(
    positionConfig.clampMode || (positionConfig.clampToViewport ? 'viewport' : 'panel')
  ).toLowerCase();
  if (positionConfig.clamp === false || clampMode === 'none') {
    return {
      left: Math.round(left),
      top: Math.round(top)
    };
  }
  if (clampMode !== 'viewport') return clampFloatingPanelPosition(panel, left, top);
  const viewportPadding = lmPanelNumber?.(positionConfig.viewportPadding, 12) ?? 12;
  const panelWidth = panel?.offsetWidth || 260;
  const panelHeight = panel?.offsetHeight || 160;
  return {
    left: clampNumber(
      Math.round(left),
      viewportPadding,
      Math.max(viewportPadding, window.innerWidth - panelWidth - viewportPadding)
    ),
    top: clampNumber(
      Math.round(top),
      viewportPadding,
      Math.max(viewportPadding, window.innerHeight - panelHeight - viewportPadding)
    )
  };
}

function alignedInfoPopoverPosition(anchorRect, panelWidth, panelHeight, panelGap, placement, alignment) {
  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const anchorCenterY = anchorRect.top + anchorRect.height / 2;
  const normalizedPlacement = String(placement || 'right').toLowerCase();
  const normalizedAlignment = String(alignment || 'start').toLowerCase();
  let left = anchorRect.right + panelGap;
  let top = anchorRect.top;

  if (normalizedPlacement === 'left') {
    left = anchorRect.left - panelWidth - panelGap;
  } else if (normalizedPlacement === 'top') {
    left = anchorRect.left;
    top = anchorRect.top - panelHeight - panelGap;
  } else if (normalizedPlacement === 'bottom') {
    left = anchorRect.left;
    top = anchorRect.bottom + panelGap;
  } else if (normalizedPlacement === 'center') {
    left = anchorCenterX - panelWidth / 2;
    top = anchorCenterY - panelHeight / 2;
  }

  if (['left', 'right'].includes(normalizedPlacement)) {
    if (normalizedAlignment === 'center') top = anchorCenterY - panelHeight / 2;
    if (normalizedAlignment === 'end') top = anchorRect.bottom - panelHeight;
  }
  if (['top', 'bottom'].includes(normalizedPlacement)) {
    if (normalizedAlignment === 'center') left = anchorCenterX - panelWidth / 2;
    if (normalizedAlignment === 'end') left = anchorRect.right - panelWidth;
  }

  return { left, top };
}

function anchorGapInfoPopoverLeft(anchorRect, panel, panelWidth, panelGap, placement, manualOffsetX, positionConfig = {}) {
  const viewportPadding = lmPanelNumber?.(positionConfig.viewportPadding, 12) ?? 12;
  const viewportRight = window.innerWidth - viewportPadding;
  const normalizedPlacement = String(placement || 'right').toLowerCase();
  const preferredSide = normalizedPlacement === 'left' ? 'left' : 'right';
  const sideRange = side => {
    const isRight = side === 'right';
    const min = isRight ? anchorRect.right + panelGap : viewportPadding;
    const max = isRight
      ? viewportRight - panelWidth
      : anchorRect.left - panelGap - panelWidth;
    const available = isRight
      ? viewportRight - anchorRect.right - panelGap
      : anchorRect.left - panelGap - viewportPadding;
    const desired = isRight
      ? anchorRect.right + panelGap + manualOffsetX
      : anchorRect.left - panelWidth - panelGap + manualOffsetX;
    return { side, min, max, available, desired };
  };
  const preferredRange = sideRange(preferredSide);
  const fallbackRange = sideRange(preferredSide === 'right' ? 'left' : 'right');
  const fittingRange = [preferredRange, fallbackRange].find(range => range.max >= range.min);
  if (fittingRange) {
    panel.style.removeProperty('max-width');
    return clampNumber(fittingRange.desired, fittingRange.min, fittingRange.max);
  }

  const bestRange = [preferredRange, fallbackRange]
    .sort((firstRange, secondRange) => secondRange.available - firstRange.available)[0];
  if (bestRange.available > 80) {
    const availableWidth = Math.floor(bestRange.available);
    panel.style.maxWidth = `${availableWidth}px`;
    return bestRange.side === 'right'
      ? Math.round(anchorRect.right + panelGap)
      : Math.round(Math.max(viewportPadding, anchorRect.left - panelGap - availableWidth));
  }

  panel.style.removeProperty('max-width');
  return clampNumber(
    preferredRange.desired,
    viewportPadding,
    Math.max(viewportPadding, viewportRight - panelWidth)
  );
}

function positionCategoryInfoPopover(panel, anchor, positionKey = 'categoryInfoPopover') {
  if (!panel || !anchor) return;
  panel.style.visibility = 'hidden';
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.left = 'var(--floating-panel-fallback-left, 12px)';
  panel.style.top = 'var(--floating-panel-fallback-top, 12px)';
  panel.style.removeProperty('max-width');

  requestAnimationFrame(() => {
    const anchorRect = anchor.getBoundingClientRect?.();
    if (!anchorRect) {
      panel.style.visibility = '';
      return;
    }
    const positionConfig = lmFloatingPanelPositionConfig?.(panel, {
      gap: 20,
      topOffset: 0,
      leftOffset: 0,
      rightOffset: 0
    }, { positionKey }) || {};
    const panelGap = lmPanelNumber?.(positionConfig.gap, 20) ?? 20;
    const leftOffset = lmPanelNumber?.(positionConfig.leftOffset, 0) ?? 0;
    const rightOffset = lmPanelNumber?.(positionConfig.rightOffset, 0) ?? 0;
    const topOffset = lmPanelNumber?.(positionConfig.topOffset, 0) ?? 0;
    const offsetX = lmPanelNumber?.(positionConfig.offsetX, 0) ?? 0;
    const offsetY = lmPanelNumber?.(positionConfig.offsetY, 0) ?? 0;
    const panelRect = panel.getBoundingClientRect();
    const panelWidth = panelRect.width || panel.offsetWidth || 260;
    const panelHeight = panelRect.height || panel.offsetHeight || 160;
    const placement = positionConfig.placement || positionConfig.anchorSide || 'right';
    const manualOffsetX = offsetX + leftOffset - rightOffset;
    const manualOffsetY = offsetY + topOffset;
    const preserveAnchorGap = Boolean(positionConfig.preserveAnchorGap) &&
      ['left', 'right'].includes(String(placement || '').toLowerCase());
    const applyOffsetsAfterClamp = String(positionConfig.offsetMode || '').toLowerCase() === 'afterclamp' && !preserveAnchorGap;
    const basePosition = alignedInfoPopoverPosition(
      anchorRect,
      panelWidth,
      panelHeight,
      panelGap,
      placement,
      positionConfig.alignment
    );
    if (preserveAnchorGap) {
      const left = anchorGapInfoPopoverLeft(anchorRect, panel, panelWidth, panelGap, placement, manualOffsetX, positionConfig);
      const safePosition = clampInfoPopoverPosition(panel, left, basePosition.top + manualOffsetY, positionConfig);
      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = `${safePosition.top}px`;
      panel.style.visibility = '';
      return;
    }
    const left = basePosition.left + (applyOffsetsAfterClamp ? 0 : manualOffsetX);
    const top = basePosition.top + (applyOffsetsAfterClamp ? 0 : manualOffsetY);
    const safePosition = clampInfoPopoverPosition(panel, left, top, positionConfig);
    panel.style.left = `${Math.round(safePosition.left + (applyOffsetsAfterClamp ? manualOffsetX : 0))}px`;
    panel.style.top = `${Math.round(safePosition.top + (applyOffsetsAfterClamp ? manualOffsetY : 0))}px`;
    panel.style.visibility = '';
  });
}

function categoryActionPanelPosition(panel, anchor, anchorRect, panelWidth, panelHeight, bounds) {
  const categoryTitleRect = anchor
    ?.closest?.('.cat-title')
    ?.querySelector?.('.category-toggle')
    ?.getBoundingClientRect?.();
  const categoryAnchorRect = categoryTitleRect || anchorRect;
  const positionConfig = lmFloatingPanelPositionConfig?.(panel, { gap: 24 }, { positionKey: 'categoryActionPanel' }) || {};
  const leftGap = lmPanelNumber?.(positionConfig.gap, 24) ?? 24;
  let left = categoryAnchorRect.left - categoryAnchorRect.width - panelWidth/4 - leftGap;
  let top = categoryAnchorRect.top;
  if (top < bounds.minTop) top = categoryAnchorRect.bottom;
  return { left, top };
}

function categoryManagerPanelPosition(panel, anchor, anchorRect, panelWidth, panelHeight, bounds) {
  const managerAnchorRect = anchor
    ?.closest?.('.add-category-actions')
    ?.querySelector?.('#addCategoryBtn')
    ?.getBoundingClientRect?.() || anchorRect;
  const positionConfig = lmFloatingPanelPositionConfig?.(panel, { gap: 18 }, { positionKey: 'categoryManagerPanel' }) || {};
  const panelGap = lmPanelNumber?.(positionConfig.gap, 18) ?? 18;
  let left = managerAnchorRect.left + managerAnchorRect.width + panelWidth;
  let top = managerAnchorRect.top - panelHeight - panelGap;
  if (top < bounds.minTop) top = managerAnchorRect.bottom + panelGap;
  return { left, top };
}

function positionFloatingPanel(panel, anchor) {
  if (!panel) return;
  if (typeof prepareFloatingPanelFocusReturn === 'function') prepareFloatingPanelFocusReturn(panel);

  panel.style.visibility = 'hidden';
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.left = 'var(--floating-panel-fallback-left, 12px)';
  panel.style.top = 'var(--floating-panel-fallback-top, 12px)';

  requestAnimationFrame(() => {
    if (!['chapterDetailsPanel', 'factDetailPanel', 'categoryActionPanel'].includes(panel.id) && applySavedFloatingPanelPosition(panel)) return;

    const positionConfig = lmFloatingPanelPositionConfig?.(panel, {
      gap: 15,
      topOffset: 0,
      leftOffset: 0,
      rightOffset: 0
    }) || {};
    const gap = lmPanelNumber?.(positionConfig.gap, 15) ?? 15;
    const anchorRect = anchor?.getBoundingClientRect?.();
    const panelRect = panel.getBoundingClientRect();
    const bounds = floatingPanelBounds(panel);
    const panelWidth = Math.min(panelRect.width || 300, window.innerWidth - gap * 2);
    const panelHeight = Math.min(panelRect.height || 220, window.innerHeight - gap * 2);
    const canOverlayChapterTree = ['partDetailsPanel', 'chapterDetailsPanel'].includes(panel.id);
    let left = anchorRect
      ? anchorRect.left - panelWidth - gap
      : window.innerWidth - panelWidth - gap;
    let top = anchorRect ? anchorRect.top : window.innerHeight - panelHeight;

    if (panel.id === 'categoryActionPanel' && anchorRect) {
      const isManagerPanel = panel.classList.contains('category-manager-panel') ||
        panel.classList.contains('category-manager-menu-panel') ||
        panel.classList.contains('category-shortcut-manager-panel');
      const categoryPosition = isManagerPanel
        ? categoryManagerPanelPosition(panel, anchor, anchorRect, panelWidth, panelHeight, bounds)
        : categoryActionPanelPosition(panel, anchor, anchorRect, panelWidth, panelHeight, bounds);
      left = categoryPosition.left;
      top = categoryPosition.top;
    } else if (panel.id === 'factDetailPanel') {
      const keyPanelRect = document.getElementById('tab-notes')?.getBoundingClientRect();
      const keyListRect = document.getElementById('facts-display')?.getBoundingClientRect();
      left = (keyPanelRect?.left || anchorRect?.left || window.innerWidth) - panelWidth - gap;
      top = anchorRect?.top || keyListRect?.top || keyPanelRect?.top || gap;
    } else if (panel.id === 'chapterDetailsPanel') {
      const chapterRect = document.getElementById('chapter-panel')?.getBoundingClientRect();
      const preferredLeft = (chapterRect?.right || anchorRect?.right || 0) + gap;
      left = preferredLeft + panelWidth <= window.innerWidth - gap
        ? preferredLeft
        : Math.max(gap, window.innerWidth - panelWidth - gap);
      top = anchorRect ? anchorRect.top : (chapterRect?.top || top);
    } else if (anchorRect && canOverlayChapterTree) {
      left = Math.max(gap, anchorRect.right - panelWidth);
    } else if (anchorRect && left < bounds.minLeft) {
      left = anchorRect.right + gap;
    }
    if (left + panelWidth > window.innerWidth - gap) left = window.innerWidth - panelWidth - gap;
    if (top + panelHeight > window.innerHeight) top = window.innerHeight - panelHeight;

    const offsetPosition = lmApplyFloatingPanelPositionOffsets?.({ left, top }, panel, positionConfig) || { left, top };
    const safePosition = clampFloatingPanelPosition(panel, offsetPosition.left, offsetPosition.top);
    panel.style.left = `${safePosition.left}px`;
    panel.style.top = `${safePosition.top}px`;
    panel.style.visibility = '';
  });
}

function openNamingEntryPanel(categoryId, anchor = null) {
  closeNameDetailPanel();
  activeNamingCategoryId = categoryId;
  activeEditingNamingEntryId = null;
  activeFloatingAnchor = anchor;
  const category = namingData.categories.find(item => item.id === categoryId);
  setText('namingEntryCategory', category?.title || text().addNameTitle);
  setText('namingEntryTitle', text().addNameTitle);
  setText('namingSaveBtn', text().saveName);
  document.getElementById('namingNameInp').value = '';
  document.getElementById('namingDescriptionInp').value = '';
  const panel = document.getElementById('namingEntryPanel');
  if (isFocus) {
    showFocusNamingEntryPanel(panel, categoryId);
  } else {
    panel.hidden = false;
    restoreNamingEntryPanelHome(panel);
    panel.classList.remove('is-focus-caret-panel', 'is-focus-center-panel');
    panel.style.display = '';
    panel.style.visibility = '';
    panel.style.opacity = '';
    positionFloatingPanel(panel, anchor);
    requestAnimationFrame(() => document.getElementById('namingNameInp')?.focus());
  }
}

function openNameDetailEditPanel(anchor = null) {
  const entry = namingData.entries.find(item => item.id === activeNamingEntryId);
  if (!entry) return;

  activeEditingNamingEntryId = entry.id;
  activeNamingCategoryId = entry.categoryId;
  activeFloatingAnchor = anchor;
  const category = namingData.categories.find(item => item.id === entry.categoryId);
  setText('namingEntryCategory', category?.title || text().editNameTitle);
  setText('namingEntryTitle', text().editNameTitle);
  setText('namingSaveBtn', text().saveName);
  document.getElementById('namingNameInp').value = entry.name || '';
  document.getElementById('namingDescriptionInp').value = entry.description || '';
  closeNameDetailPanel();
  activeFloatingAnchor = anchor;
  const panel = document.getElementById('namingEntryPanel');
  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
  requestAnimationFrame(() => document.getElementById('namingNameInp')?.focus());
}

function closeNamingEntryPanel(options = {}) {
  const panel = document.getElementById('namingEntryPanel');
  const preserveFocusSidePanels = Boolean(options.preserveFocusSidePanels);
  const suppressFocusRestore = Boolean(options.suppressFocusRestore);
  const shouldRestoreFocusEditor = Boolean(isFocus && panel && !panel.hidden && panel.classList.contains('is-focus-center-panel'));
  panel.hidden = true;
  panel.classList.remove('is-focus-caret-panel', 'is-focus-center-panel');
  delete panel.dataset.focusPortal;
  panel.style.display = '';
  panel.style.visibility = '';
  panel.style.opacity = '';
  panel.style.removeProperty('--focus-entry-left');
  panel.style.removeProperty('--focus-entry-top');
  restoreNamingEntryPanelHome(panel);
  activeFloatingAnchor = null;
  activeEditingNamingEntryId = null;
  if (!preserveFocusSidePanels) hideFocusNamingCategoryPanel();
  if (shouldRestoreFocusEditor && !suppressFocusRestore) {
    requestAnimationFrame(restoreFocusNamingEntryEditorFocus);
  }
}

function saveNamingEntry() {
  const nameInput = document.getElementById('namingNameInp');
  const descriptionInput = document.getElementById('namingDescriptionInp');
  const name = nameInput.value.trim();
  if (!name || !activeNamingCategoryId) return;

  const editingEntry = namingData.entries.find(entry => entry.id === activeEditingNamingEntryId);
  if (editingEntry) {
    const description = descriptionInput.value.trim();
    const editedAt = new Date().toISOString();
    const descriptionMeta = currentDescriptionChapterMeta(editedAt);
    const changed = editingEntry.name !== name || editingEntry.description !== description;

    if (changed) {
      editingEntry.name = name;
      editingEntry.description = description;
      editingEntry.updatedAt = editedAt;
      editingEntry.descriptionMeta = descriptionMeta;
      editingEntry.descriptionHistory = [
        ...(Array.isArray(editingEntry.descriptionHistory) ? editingEntry.descriptionHistory : []),
        { description, editedAt, chapterMeta: descriptionMeta }
      ];
      expandedNamingCategoryId = editingEntry.categoryId;
      renderTags();
      saveNamingData();
      showSidePanelSaveLine(text().nameEdited);
    }

    closeNamingEntryPanel();
    return;
  }

  const createdAt = new Date().toISOString();
  const shouldAttachToActiveDocument = typeof isSavedNameUsedInText === 'function' &&
    isSavedNameUsedInText(name, getCleanEditorText());
  const descriptionMeta = shouldAttachToActiveDocument
    ? currentDescriptionChapterMeta(createdAt)
    : undefinedDescriptionChapterMeta(createdAt);
  namingData.entries.push({
    id: `name-${Date.now()}`,
    categoryId: activeNamingCategoryId,
    chapterKey: descriptionMeta.chapterKey,
    chapterIndex: descriptionMeta.chapterIndex,
    chapterNo: descriptionMeta.chapterNo,
    chapterTitle: descriptionMeta.chapterTitle,
    chapterStatus: descriptionMeta.chapterStatus,
    documentType: descriptionMeta.documentType,
    draftKey: descriptionMeta.draftKey || null,
    draftIndex: descriptionMeta.draftIndex ?? null,
    draftNo: descriptionMeta.draftNo ?? null,
    draftTitle: descriptionMeta.draftTitle || '',
    contentPath: descriptionMeta.contentPath,
    name,
    description: descriptionInput.value.trim(),
    createdAt,
    updatedAt: createdAt,
    descriptionMeta,
    descriptionHistory: []
  });

  closeNamingEntryPanel();
  expandedNamingCategoryId = activeNamingCategoryId;
  renderTags();
  saveNamingData();
  showSidePanelSaveLine(text().nameSaved);
}

function namingEntryMentionCount(entry = {}, activeText = null) {
  const textValue = activeText ?? (
    typeof activeChapterTextForNameCount === 'function'
      ? activeChapterTextForNameCount()
      : activeNamingPanelText()
  );
  return typeof countSavedNameUsesInText === 'function'
    ? countSavedNameUsesInText(entry.name, textValue)
    : 0;
}

function namingEntryDeepFindingLabel() {
  return text().deepFinding || text().deepFind || 'Deep Finding';
}

function namingEntryDeepFindingTitle(count) {
  return `${namingEntryDeepFindingLabel()}: ${count} ${text().times}`;
}

function syncNamingEntryDeepFindingCount(button, entry = {}) {
  const badge = button?.querySelector?.('.tag-find-meta');
  if (!badge) return;
  const count = namingEntryMentionCount(entry);
  const countNode = badge.querySelector?.('.tag-find-meta-count');
  if (countNode) countNode.textContent = String(count);
  badge.title = namingEntryDeepFindingTitle(count);
}

function handleNamingEntryItemPointerEnter(event, entryId) {
  const entry = namingData.entries.find(item => item.id === entryId);
  if (entry) syncNamingEntryDeepFindingCount(event.currentTarget, entry);
  scheduleNamingEntryDescriptionInfo(event, entryId);
}

function namingEntryItemHtml(entry, extraClass = '', activeText = null) {
  const isExistingEntry = String(extraClass).split(/\s+/).includes('naming-existing-entry');
  const mentionCount = isExistingEntry ? 0 : namingEntryMentionCount(entry, activeText);
  const deepFindingLabel = namingEntryDeepFindingLabel();
  return `
    <button class="tag-item naming-entry-item ${extraClass}" type="button"
      onpointerenter="handleNamingEntryItemPointerEnter(event, '${escapeJsString(entry.id)}')"
      onpointerleave="scheduleNamingEntryDescriptionInfoClose()"
      onclick="showNameDetail('${escapeJsString(entry.id)}', this)">
      <span class="tname">
        <span>${escapeHtml(entry.name)}</span>
      </span>
      ${isExistingEntry ? '' : `
        <span class="tag-find-meta" title="${escapeHtml(namingEntryDeepFindingTitle(mentionCount))}">
          <span class="tag-find-meta-count">${mentionCount}</span>
        </span>
        <span class="tag-find-btn" onclick="event.stopPropagation();findTag('${escapeJsString(entry.name)}')" title="${escapeHtml(text().findTitle)}">${searchIconSvg()}</span>`}
    </button>`;
}

function existingNamingEntriesHtml(categoryId, entries) {
  return `
    <div class="naming-existing-list" hidden>
      ${entries.map(entry => namingEntryItemHtml(entry, namingEntryUsesOrphanStyle(entry) ? 'naming-existing-entry naming-orphan-entry' : 'naming-existing-entry')).join('')}
      <button class="hide-existing-names-btn" type="button" onclick="hideExistingNamesForCategory('${escapeJsString(categoryId)}', this)">
        ${escapeHtml(text().hideExistingNames)}
      </button>
    </div>`;
}

function showExistingNamesForCategory(categoryId, button = null) {
  const card = button?.closest?.('.naming-category-card');
  const list = card?.querySelector?.('.naming-existing-list');
  const triggerRow = button?.closest?.('.naming-existing-toggle-row');
  if (!list) return;
  expandedNamingCategoryId = categoryId;
  list.hidden = false;
  if (triggerRow) triggerRow.hidden = true;
}

function hideExistingNamesForCategory(categoryId, button = null) {
  const card = button?.closest?.('.naming-category-card');
  const list = card?.querySelector?.('.naming-existing-list');
  const triggerRow = card?.querySelector?.('.naming-existing-toggle-row');
  if (list) list.hidden = true;
  if (triggerRow) triggerRow.hidden = false;
  expandedNamingCategoryId = categoryId;
}

function renderTags() {
  const display = document.getElementById('tag-display');
  if (!display) return;

  namingData = normalizeNamingData(namingData);
  const chapterKey = currentNamingChapterKey();
  const focusCategoryId = isFocus ? activeFocusNamingCategoryId : '';
  const visibleCategories = namingData.categories.filter(category =>
    isNamingCategoryVisible(category.id, chapterKey) || category.id === focusCategoryId
  );

  if (!visibleCategories.length) {
    display.innerHTML = `<div class="naming-empty naming-empty-panel">${escapeHtml(text().noVisibleCategories)}</div>`;
    return;
  }

  display.innerHTML = visibleCategories.map(category => {
    const isExpanded = expandedNamingCategoryId === category.id;
    const activeText = activeNamingPanelText();
    const globalEntries = namingData.entries.filter(entry => entry.categoryId === category.id);
    const globalEntryCount = globalEntries.length;
    const canDeleteCategory = globalEntryCount === 0;
    const {
      activeDocumentEntries: entries,
      detectedEntries,
      existingEntries
    } = namingEntriesByActiveTextPriority(globalEntries, activeText);
    const hasChapterEntries = entries.length > 0;
    const hasDetectedEntries = detectedEntries.length > 0;
    const visibleEntryCount = entries.length + detectedEntries.length;
    const hasOtherEntries = existingEntries.length > 0;
    const hasExistingListEntries = !hasChapterEntries && !hasDetectedEntries && hasOtherEntries;
    const hasOrphanEntries = hasExistingListEntries && existingEntries.some(entry => namingEntryUsesOrphanStyle(entry));
    const hasExistingEntries = hasExistingListEntries && !hasOrphanEntries;
    const shortcutLabel = namingCategoryShortcutLabel(category.id);
    const addNameTitle = shortcutLabel
      ? `${text().addNameTitle} (${shortcutLabel})`
      : text().addNameTitle;
    const entryHtml = visibleEntryCount
      ? `${entries.map(entry => namingEntryItemHtml(entry, '', activeText)).join('')}
          ${detectedEntries.map(entry => namingEntryItemHtml(entry, 'naming-detected-entry', activeText)).join('')}
          ${hasOtherEntries ? `
            <div class="naming-existing-toggle-row">
              <button class="show-existing-names-btn" type="button" onclick="showExistingNamesForCategory('${escapeJsString(category.id)}', this)">
                ${escapeHtml(text().showOtherNames)}
              </button>
            </div>
            ${existingNamingEntriesHtml(category.id, existingEntries)}` : ''}`
      : (hasExistingEntries || hasOrphanEntries)
        ? `<div class="naming-empty naming-chapter-empty naming-existing-toggle-row">
            <span>${escapeHtml(text().noTagsInChapter)}</span>
            <button class="show-existing-names-btn" type="button" onclick="showExistingNamesForCategory('${escapeJsString(category.id)}', this)">
              ${escapeHtml(text().showExistingNames)}
            </button>
          </div>
          ${existingNamingEntriesHtml(category.id, existingEntries)}`
        : `<div class="naming-empty">${escapeHtml(text().noTags)}</div>`;

    return `
      <div class="cat-section naming-category-card ${isExpanded ? 'is-expanded' : ''}" data-category-id="${escapeHtml(category.id)}">
        <div class="cat-title cat-${escapeHtml(category.color)}">
          ${hasChapterEntries ? `<button class="category-name-entry-node category-action-trigger" type="button" onclick="handleCategoryActionTriggerClick(event, '${escapeJsString(category.id)}')" ondblclick="handleCategoryActionTriggerDoubleClick(event, '${escapeJsString(category.id)}')" onpointerenter="scheduleCategoryActionTriggerInfo(event, '${escapeJsString(category.id)}')" onpointerleave="clearCategoryActionTriggerInfo()" title="${escapeHtml(text().editCategoryTitle)}" aria-label="${escapeHtml(text().editCategoryTitle)}"></button>` : ''}
          ${!hasChapterEntries && hasDetectedEntries ? `<button class="category-detected-node category-action-trigger" type="button" onclick="handleCategoryActionTriggerClick(event, '${escapeJsString(category.id)}')" ondblclick="handleCategoryActionTriggerDoubleClick(event, '${escapeJsString(category.id)}')" onpointerenter="scheduleCategoryActionTriggerInfo(event, '${escapeJsString(category.id)}')" onpointerleave="clearCategoryActionTriggerInfo()" title="${escapeHtml(text().editCategoryTitle)}" aria-label="${escapeHtml(text().editCategoryTitle)}"></button>` : ''}
          ${hasOrphanEntries ? `<button class="category-orphan-node category-action-trigger" type="button" onclick="handleCategoryActionTriggerClick(event, '${escapeJsString(category.id)}')" ondblclick="handleCategoryActionTriggerDoubleClick(event, '${escapeJsString(category.id)}')" onpointerenter="scheduleCategoryActionTriggerInfo(event, '${escapeJsString(category.id)}')" onpointerleave="clearCategoryActionTriggerInfo()" title="${escapeHtml(text().editCategoryTitle)}" aria-label="${escapeHtml(text().editCategoryTitle)}"></button>` : ''}
          ${hasExistingEntries ? `<button class="category-existing-node category-action-trigger" type="button" onclick="handleCategoryActionTriggerClick(event, '${escapeJsString(category.id)}')" ondblclick="handleCategoryActionTriggerDoubleClick(event, '${escapeJsString(category.id)}')" onpointerenter="scheduleCategoryActionTriggerInfo(event, '${escapeJsString(category.id)}')" onpointerleave="clearCategoryActionTriggerInfo()" title="${escapeHtml(text().editCategoryTitle)}" aria-label="${escapeHtml(text().editCategoryTitle)}"></button>` : ''}
          ${!entries.length && canDeleteCategory ? `<button class="category-empty-node category-action-trigger" type="button" onclick="handleCategoryActionTriggerClick(event, '${escapeJsString(category.id)}')" ondblclick="handleCategoryActionTriggerDoubleClick(event, '${escapeJsString(category.id)}')" onpointerenter="scheduleCategoryActionTriggerInfo(event, '${escapeJsString(category.id)}')" onpointerleave="clearCategoryActionTriggerInfo()" title="${escapeHtml(text().editCategoryTitle)}" aria-label="${escapeHtml(text().editCategoryTitle)}"></button>` : ''}
          <div class="category-toggle" role="button" tabindex="0" onclick="toggleNamingCategory('${escapeJsString(category.id)}')" onkeydown="handleNamingCategoryToggleKey(event, '${escapeJsString(category.id)}')">
            ${lmChevronSpan(isExpanded ? 'down' : 'right')}
            <strong class="category-title-text">${escapeHtml(category.title)}</strong>
            <small title="${globalEntryCount} story-wide">${visibleEntryCount}/${globalEntryCount}</small>
          </div>
          <div class="category-action-set">
            <button class="category-add-btn" type="button" onclick="openNamingEntryPanel('${escapeJsString(category.id)}', this)" title="${escapeHtml(addNameTitle)}" aria-label="${escapeHtml(addNameTitle)}" ${shortcutLabel ? `data-lm-shortcut="${escapeHtml(shortcutLabel)}"` : ''}>
              ${lmIcon("categoryAdd")}
            </button>
          </div>
        </div>
        <div class="category-entries" ${isExpanded ? '' : 'hidden'}>${entryHtml}</div>
      </div>`;
  }).join('');

  if (isFocus && activeFocusNamingCategoryId) {
    requestAnimationFrame(() => syncFocusNamingCategoryPanel(activeFocusNamingCategoryId));
  }
}

function showNameDetail(entryId, anchor = null) {
  closeNamingEntryPanel();
  clearNamingEntryDescriptionInfo();
  document.querySelectorAll('.naming-entry-item.is-detail-active').forEach(item => item.classList.remove('is-detail-active'));
  activeFloatingAnchor = anchor;
  activeNamingEntryId = entryId;
  const entry = namingData.entries.find(item => item.id === entryId);
  if (!entry) return;
  anchor?.closest?.('.naming-entry-item')?.classList.add('is-detail-active');
  const category = namingData.categories.find(item => item.id === entry.categoryId);
  const mentionCount = countSavedNameUsesInText(entry.name, activeChapterTextForNameCount());
  const editedAtLabel = nameDetailTimeLabel(entry);
  setText('nameDetailTitle', entry.name);
  setText('nameDetailUsage', mentionCount);
  setTitle('nameDetailUsage', `${text().activeChapterMentions}: ${mentionCount} ${text().times}`);
  setText('nameDetailDescription', entry.description || 'No description added yet.');
  setText('nameDetailEditedAt', editedAtLabel);
  document.getElementById('nameDetailEditedAt').hidden = !editedAtLabel;
  closeNameDeleteReminder();
  const panel = document.getElementById('nameDetailPanel');
  panel.hidden = false;
  positionFloatingPanel(panel, anchor);
}

function closeNameDetailPanel() {
  closeNameDeleteReminder();
  document.getElementById('nameDetailPanel').hidden = true;
  document.querySelectorAll('.naming-entry-item.is-detail-active').forEach(item => item.classList.remove('is-detail-active'));
  activeFloatingAnchor = null;
  activeNamingEntryId = null;
}

function openNameDeleteReminder() {
  const reminder = document.getElementById('nameDeleteReminder');
  if (!reminder || !activeNamingEntryId) return;
  setText('nameDeleteReminderTitle', text().deleteNameTitle);
  setText('nameDeleteReminderBody', text().deleteNameBody);
  setText('nameDeleteCancelBtn', text().cancelDeleteName);
  setText('nameDeleteConfirmBtn', text().confirmDeleteName);
  reminder.hidden = false;
  requestAnimationFrame(() => document.getElementById('nameDeleteConfirmBtn')?.focus());
}

function closeNameDeleteReminder() {
  const reminder = document.getElementById('nameDeleteReminder');
  if (reminder) reminder.hidden = true;
}

function deleteActiveNamingEntry() {
  if (!activeNamingEntryId) return;
  const entry = namingData.entries.find(item => item.id === activeNamingEntryId);
  if (!entry) {
    closeNameDetailPanel();
    return;
  }

  namingData = normalizeNamingData({
    ...namingData,
    entries: namingData.entries.filter(item => item.id !== activeNamingEntryId)
  });
  expandedNamingCategoryId = entry.categoryId || expandedNamingCategoryId;
  closeNameDetailPanel();
  renderTags();
  saveNamingData();
  showSidePanelSaveLine(text().nameDeleted);
}

function findTag(name) {
  document.getElementById('findInp').value = name;
  setFindPanel(true);
  doFind();
}

function saveFacts() {
  storyFacts = normalizeStoryFacts(storyFacts);
  localStorage.setItem(FACTS_STORAGE_KEY, JSON.stringify(storyFacts));
  projectManifest = normalizeProjectManifest({
    ...(projectManifest || createProjectManifest(projectDirectoryHandle?.name)),
    facts: storyFacts
  });
  localStorage.setItem(PROJECT_MANIFEST_KEY, JSON.stringify(projectManifest));
  if (projectDirectoryHandle) {
    writeProjectManifest().catch(error => console.warn('Facts save failed:', error));
  }
}

function populateFactChapterSelect(selectedIndex = curChap) {
  const select = document.getElementById('factChapterSel');
  if (!select) return;
  select.innerHTML = `<option value="">${escapeHtml(text().factChapterLabel)}</option>` +
    chapters.map((chapter, index) =>
      `<option value="${index}">${escapeHtml(factChapterOptionLabel(chapter, index))}</option>`
    ).join('');
  select.value = Number.isInteger(selectedIndex) ? String(selectedIndex) : '';
  queueCustomSelectSync();
}

function setFactComposerMode(isEditing = false) {
  setText('addFactBtn', isEditing ? text().saveFact : text().addFact);
}

function clearFactComposerFields() {
  const keywordInput = document.getElementById('factKeywordInp');
  const descriptionInput = document.getElementById('factDescriptionInp');
  if (keywordInput) keywordInput.value = '';
  if (descriptionInput) descriptionInput.value = '';
  populateFactChapterSelect(null);
}

function openFactComposer(anchor = null) {
  const panel = document.getElementById('factComposerPanel');
  if (!panel) return;
  closeFactDetailPanel();
  activeEditingFactId = null;
  activeFloatingAnchor = anchor || document.getElementById('openFactComposerBtn');
  setFactComposerMode(false);
  clearFactComposerFields();
  if (isFocus) {
    showFocusFactComposerPanel(panel);
  } else {
    restoreFactComposerPanelHome(panel);
    panel.hidden = false;
    panel.classList.remove('is-focus-center-panel', 'is-focus-fact-composer-panel');
    delete panel.dataset.focusPortal;
    delete panel.dataset.focusPanelSlot;
    delete panel.dataset.focusPanelClose;
    panel.style.display = '';
    panel.style.visibility = '';
    panel.style.opacity = '';
    panel.style.removeProperty('--focus-entry-left');
    panel.style.removeProperty('--focus-entry-top');
    positionFloatingPanel(panel, activeFloatingAnchor);
    requestAnimationFrame(() => document.getElementById('factKeywordInp')?.focus());
  }
}

function closeFactComposer() {
  const panel = document.getElementById('factComposerPanel');
  if (panel) {
    panel.hidden = true;
    panel.classList.remove('is-focus-center-panel', 'is-focus-fact-composer-panel');
    delete panel.dataset.focusPortal;
    delete panel.dataset.focusPanelSlot;
    delete panel.dataset.focusPanelClose;
    panel.style.display = '';
    panel.style.visibility = '';
    panel.style.opacity = '';
    panel.style.removeProperty('--focus-entry-left');
    panel.style.removeProperty('--focus-entry-top');
    restoreFactComposerPanelHome(panel);
  }
  activeEditingFactId = null;
  setFactComposerMode(false);
  activeFloatingAnchor = null;
}

function closeFactDetailPanel() {
  const panel = document.getElementById('factDetailPanel');
  if (panel) {
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = '';
    delete panel.dataset.factId;
    delete panel.dataset.focusPanelSlot;
    delete panel.dataset.focusPanelClose;
    panel.classList.remove('category-action-card-panel', 'category-manager-panel', 'category-info-panel');
    panel.classList.remove('is-focus-center-panel', 'is-focus-fact-detail-panel');
    panel.style.display = '';
    panel.style.visibility = '';
    panel.style.opacity = '';
    panel.style.removeProperty('--focus-entry-left');
    panel.style.removeProperty('--focus-entry-top');
  }
  document.querySelectorAll('.fact-item.is-detail-active').forEach(item => item.classList.remove('is-detail-active'));
  activeFloatingAnchor = null;
}

function focusInvalidFactField(field, message) {
  if (typeof showMiniReminder === 'function') showMiniReminder(message);
  requestAnimationFrame(() => field?.focus());
}

function clearFactSearchFilter() {
  const searchInput = document.getElementById('factSearchInp');
  if (searchInput) searchInput.value = '';
}

function addFact() {
  const keywordInput = document.getElementById('factKeywordInp');
  const descriptionInput = document.getElementById('factDescriptionInp');
  const chapterSelect = document.getElementById('factChapterSel');
  const keyword = keywordInput?.value.trim() || '';
  const description = descriptionInput?.value.trim() || '';
  if (!keyword) {
    focusInvalidFactField(keywordInput, text().factKeywordRequired);
    return;
  }
  if (!description) {
    focusInvalidFactField(descriptionInput, text().factDescriptionRequired);
    return;
  }
  if (factKeywordExists(keyword, activeEditingFactId || '')) {
    showDuplicateReminder(text().duplicateFactKeyword);
    return;
  }
  const hasChapterStatus = chapterSelect?.value !== '';
  const chapterIndex = hasChapterStatus
    ? clampNumber(parseInt(chapterSelect?.value || '0', 10) || 0, 0, Math.max(chapters.length - 1, 0))
    : -1;
  const chapter = hasChapterStatus ? chapters[chapterIndex] || {} : {};
  const chapterKey = hasChapterStatus ? chapterStorageKey(chapterIndex) : '';
  const editedAt = new Date().toISOString();
  const chapterMeta = hasChapterStatus
    ? {
        chapterStatus: 'chapter',
        documentType: 'chapter',
        chapterKey,
        chapterIndex,
        chapterNo: chapter.chapterNo || chapterIndex + 1,
        chapterTitle: chapterDisplayTitle(chapter, chapterIndex),
        contentPath: chapterKey,
        savedAt: editedAt
      }
    : null;
  const editingFact = storyFacts.find(fact => fact.id === activeEditingFactId);
  if (editingFact) {
    const descriptionChanged = String(editingFact.description || '').trim() !== description;
    storyFacts = normalizeStoryFacts(storyFacts.map(fact =>
      fact.id === editingFact.id
        ? {
            ...fact,
            keyword,
            description,
            chapterKey,
            chapterIndex: hasChapterStatus ? chapterIndex : null,
            chapterNo: chapterMeta?.chapterNo || '',
            chapterTitle: chapterMeta?.chapterTitle || '',
            descriptionMeta: chapterMeta || fact.descriptionMeta || null,
            descriptionHistory: descriptionChanged && chapterMeta
              ? [
                  ...(Array.isArray(fact.descriptionHistory) ? fact.descriptionHistory : []),
                  { description, editedAt, chapterMeta }
                ]
              : fact.descriptionHistory,
            updatedAt: editedAt
          }
        : fact
    ));
    saveFacts();
    closeFactComposer();
    clearFactSearchFilter();
    renderFacts();
    showSidePanelSaveLine(text().factEdited);
    return;
  }

  const createdAt = new Date().toISOString();
  storyFacts = normalizeStoryFacts([
    {
      id: `fact-${Date.now()}`,
      keyword,
      description,
      chapterKey,
      chapterIndex: hasChapterStatus ? chapterIndex : null,
      chapterNo: chapterMeta?.chapterNo || '',
      chapterTitle: chapterMeta?.chapterTitle || '',
      createdAt,
      updatedAt: createdAt,
      descriptionMeta: chapterMeta,
      descriptionHistory: [],
      pinned: false
    },
    ...storyFacts
  ]);
  keywordInput.value = '';
  descriptionInput.value = '';
  visibleFactCount = FACTS_PAGE_SIZE;
  saveFacts();
  closeFactComposer();
  clearFactSearchFilter();
  renderFacts();
  showSidePanelSaveLine(text().factSaved);
}

function handleFactInputKey(event) {
  if (event.key !== 'Enter') return;
  if (event.target?.id === 'factDescriptionInp' && !event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  addFact();
}

function updateFactSearch() {
  visibleFactCount = FACTS_PAGE_SIZE;
  renderFacts();
}

function factCardHtml(fact, state = 'recent') {
  const isPinned = Boolean(fact.pinned);
  const stateClass = state === 'current' ? 'fact-current-entry' : 'fact-recent-entry';
  const pinTitle = isPinned ? text().factUnpinTitle : text().factPinTitle;
  return `
    <article class="fact-item ${stateClass}" onclick="openFactDetailPanel('${escapeJsString(fact.id)}', this)">
      <div class="fact-item-head">
        <strong>${escapeHtml(fact.keyword)}</strong>
        <span class="fact-time-stamp">${escapeHtml(factTimeLabel(fact.createdAt))}</span>
      </div>
      <button class="fact-pin-btn ${isPinned ? 'is-pinned' : ''}" type="button"
        onclick="event.stopPropagation(); toggleFactPin('${escapeJsString(fact.id)}')"
        title="${escapeHtml(pinTitle)}" aria-label="${escapeHtml(pinTitle)}">
        ${lmIcon("factPin")}
      </button>
    </article>`;
}

function factChapterMetaText(fact) {
  if (!fact?.chapterKey && !fact?.chapterNo && !fact?.chapterTitle) return '';
  const chapterLabel = fact.chapterNo ? `${text().chapterStatus} ${fact.chapterNo}` : text().chapterStatus;
  return `${chapterLabel}${fact.chapterTitle ? ` ${fact.chapterTitle}` : ''}`;
}

function toggleFactPin(factId) {
  storyFacts = normalizeStoryFacts(storyFacts).map(fact =>
    fact.id === factId ? { ...fact, pinned: !fact.pinned, updatedAt: new Date().toISOString() } : fact
  );
  renderFacts();
  saveFacts();
  showSidePanelSaveLine(text().factSaved);
}

function openFactDetailEditPanel(factId, anchor = null) {
  const fact = normalizeStoryFacts(storyFacts).find(item => item.id === factId);
  if (!fact) return;

  closeFactDeleteReminder();
  closeFactDetailPanel();
  activeEditingFactId = fact.id;
  activeFloatingAnchor = anchor || document.getElementById('openFactComposerBtn');
  setFactComposerMode(true);
  const selectedChapterIndex = Number.isInteger(fact.chapterIndex) && fact.chapterIndex >= 0 ? fact.chapterIndex : null;
  populateFactChapterSelect(selectedChapterIndex);
  document.getElementById('factKeywordInp').value = fact.keyword || '';
  document.getElementById('factDescriptionInp').value = fact.description || '';
  const panel = document.getElementById('factComposerPanel');
  if (!panel) return;
  panel.hidden = false;
  positionFloatingPanel(panel, activeFloatingAnchor);
  requestAnimationFrame(() => document.getElementById('factKeywordInp')?.focus());
}

function openFactDetailPanel(factId, anchor = null) {
  const fact = normalizeStoryFacts(storyFacts).find(item => item.id === factId);
  if (!fact) return;

  closeFactComposer();
  document.querySelectorAll('.fact-item.is-detail-active').forEach(item => item.classList.remove('is-detail-active'));
  anchor?.closest?.('.fact-item')?.classList.add('is-detail-active');
  let panel = document.getElementById('factDetailPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'factDetailPanel';
    panel.className = 'fact-detail-popover lm-id-factDetailPanel';
    document.body.appendChild(panel);
  }

  const chapterMeta = factChapterMetaText(fact);
  panel.dataset.factId = fact.id;
  panel.innerHTML = `
    <div class="fact-detail-head">
      <strong>${escapeHtml(fact.keyword)}</strong>
      <span class="fact-time-stamp">${escapeHtml(factTimeLabel(fact.createdAt))}</span>
    </div>
    ${chapterMeta ? `<div class="fact-detail-meta">${escapeHtml(chapterMeta)}</div>` : ''}
    <div class="fact-detail-description-wrap">
      <p>${escapeHtml(fact.description)}</p>
      <button class="name-detail-edit-btn fact-detail-edit-btn" type="button"
        onclick="event.stopPropagation(); openFactDetailEditPanel('${escapeJsString(fact.id)}', this)"
        title="${escapeHtml(text().editFactTitle)}" aria-label="${escapeHtml(text().editFactTitle)}">
        ${lmIcon("edit")}
      </button>
    </div>
    <div class="fact-detail-footer">
      <div class="name-detail-edited-at">${escapeHtml(factTimeLabel(fact.updatedAt || fact.createdAt))}</div>
      <button class="name-detail-delete-btn fact-detail-delete-btn" type="button"
        onclick="event.stopPropagation(); openFactDeleteReminder('${escapeJsString(fact.id)}')"
        title="${escapeHtml(text().factDeleteTitle)}" aria-label="${escapeHtml(text().factDeleteTitle)}">
        ${lmIcon("delete")}
      </button>
    </div>
    <div class="name-delete-reminder fact-delete-reminder" id="factDeleteReminder" hidden>
      <strong>${escapeHtml(text().factDeleteConfirmTitle)}</strong>
      <p>${escapeHtml(text().factDeleteConfirmBody)}</p>
      <div class="name-delete-reminder-actions">
        <button class="name-delete-cancel-btn" type="button" onclick="closeFactDeleteReminder()">Cancel</button>
        <button class="name-delete-confirm-btn" type="button" onclick="deleteFact('${escapeJsString(fact.id)}')">${escapeHtml(text().confirmDeleteName)}</button>
      </div>
    </div>`;

  panel.hidden = false;
  activeFloatingAnchor = anchor;
  panel.setAttribute('aria-hidden', 'false');
  if (isFocus) {
    panel.classList.add('is-focus-center-panel', 'is-focus-fact-detail-panel');
    panel.style.setProperty('display', 'block', 'important');
    panel.style.setProperty('visibility', 'visible', 'important');
    panel.style.setProperty('opacity', '1', 'important');
    if (typeof claimFocusPanelSlot === 'function') {
      claimFocusPanelSlot(panel, 'center', { closeFunction: 'closeFactDetailPanel' });
    }
    positionFocusFactCenterPanel(panel);
    requestAnimationFrame(() => positionFocusFactCenterPanel(panel));
  } else {
    panel.classList.remove('is-focus-center-panel', 'is-focus-fact-detail-panel');
    delete panel.dataset.focusPanelSlot;
    delete panel.dataset.focusPanelClose;
    panel.style.display = '';
    panel.style.visibility = '';
    panel.style.opacity = '';
    panel.style.removeProperty('--focus-entry-left');
    panel.style.removeProperty('--focus-entry-top');
    positionFloatingPanel(panel, anchor);
  }
}

function openFactDeleteReminder(factId) {
  const panel = document.getElementById('factDetailPanel');
  if (!panel || panel.dataset.factId !== factId) return;
  const reminder = document.getElementById('factDeleteReminder');
  if (reminder) reminder.hidden = false;
}

function closeFactDeleteReminder() {
  const reminder = document.getElementById('factDeleteReminder');
  if (reminder) reminder.hidden = true;
}

function renderFacts() {
  const display = document.getElementById('facts-display');
  const actions = document.getElementById('factListActions');
  if (!display || !actions) return;

  storyFacts = normalizeStoryFacts(storyFacts);
  const query = document.getElementById('factSearchInp')?.value.trim().toLowerCase() || '';
  const filteredFacts = query
    ? storyFacts.filter(fact => fact.keyword.toLowerCase().includes(query))
    : storyFacts;
  const currentChapterKey = chapterStorageKey(curChap);
  const pinnedFacts = filteredFacts.filter(fact => fact.pinned);
  const unpinnedFacts = filteredFacts.filter(fact => !fact.pinned);
  const currentChapterFacts = unpinnedFacts.filter(fact => fact.chapterKey === currentChapterKey);
  const recentFacts = unpinnedFacts.filter(fact => fact.chapterKey !== currentChapterKey);
  const visibleRecentFacts = recentFacts.slice(0, visibleFactCount);
  const sections = [];

  if (pinnedFacts.length) {
    sections.push(`
      <section class="fact-section">
        <div class="fact-section-title">${escapeHtml(text().pinnedFacts)}</div>
        ${pinnedFacts.map(fact => factCardHtml(fact, fact.chapterKey === currentChapterKey ? 'current' : 'recent')).join('')}
      </section>`);
  }

  if (currentChapterFacts.length) {
    sections.push(`
      <section class="fact-section">
        <div class="fact-section-title">${escapeHtml(text().factsInCurrentChapter)}</div>
        ${currentChapterFacts.map(fact => factCardHtml(fact, 'current')).join('')}
      </section>`);
  }

  if (visibleRecentFacts.length) {
    sections.push(`
      <section class="fact-section">
        <div class="fact-section-title">${escapeHtml(text().recentFacts)}</div>
        ${visibleRecentFacts.map(fact => factCardHtml(fact, 'recent')).join('')}
      </section>`);
  }

  display.innerHTML = sections.length
    ? sections.join('')
    : `<p class="fact-empty">${escapeHtml(query ? text().noFactMatches : text().noFacts)}</p>`;

  const hasMore = visibleFactCount < recentFacts.length;
  const canCollapse = recentFacts.length > FACTS_PAGE_SIZE && !hasMore;
  actions.innerHTML = hasMore
    ? `<button class="fact-more-btn" type="button" onclick="showMoreFacts()">${escapeHtml(text().showMoreFacts)}</button>`
    : canCollapse
      ? `<button class="fact-more-btn" type="button" onclick="showLessFacts()">${escapeHtml(text().showLessFacts)}</button>`
      : '';
  refreshVisibleFocusFactsPanel();
}

function renderNotes() {
  renderFacts();
}

function showMoreFacts() {
  visibleFactCount += FACTS_PAGE_SIZE;
  renderFacts();
}

function showLessFacts() {
  visibleFactCount = FACTS_PAGE_SIZE;
  renderFacts();
  document.getElementById('facts-display')?.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteFact(factId) {
  const panel = document.getElementById('factDetailPanel');
  storyFacts = storyFacts.filter(fact => fact.id !== factId);
  if (panel?.dataset.factId === factId) closeFactDetailPanel();
  renderFacts();
  saveFacts();
  showSidePanelSaveLine(text().factDeleted);
}

function isSidePanelAiOnlyMode() {
  return hasActiveStory() && (
    Boolean(isDraftTrashMode) ||
    isTrashDraftActive()
  );
}

function syncSidePanelAvailability() {
  const aiOnly = isSidePanelAiOnlyMode();
  const requestedPanel = aiOnly ? 'ai' : activeSidePanel;
  const panel = ['naming', 'facts', 'ai'].includes(requestedPanel) ? requestedPanel : 'naming';
  const namingButton = document.getElementById('namingTabBtn');
  const factsButton = document.getElementById('factsTabBtn');
  const aiButton = document.getElementById('aiBtn');
  const notePanel = document.getElementById('note-panel');
  const namingPanel = document.getElementById('tab-tags');
  const factsPanel = document.getElementById('tab-notes');
  const aiPanel = document.getElementById('ai-panel');
  const trashAiOnly = Boolean(isDraftTrashMode) || isTrashDraftActive();

  activeSidePanel = panel;
  [namingButton, factsButton, aiButton].forEach(button => {
    if (button) button.classList.remove('active');
  });
  namingButton?.classList.toggle('active', panel === 'naming');
  factsButton?.classList.toggle('active', panel === 'facts');
  aiButton?.classList.toggle('active', panel === 'ai');

  if (namingButton) namingButton.hidden = aiOnly;
  if (factsButton) factsButton.hidden = aiOnly;
  if (aiButton) aiButton.hidden = false;
  if (notePanel) notePanel.classList.toggle('is-trash-ai-only', trashAiOnly);
  if (namingPanel) namingPanel.hidden = aiOnly || panel !== 'naming';
  if (factsPanel) factsPanel.hidden = aiOnly || panel !== 'facts';
  if (aiPanel) aiPanel.hidden = panel !== 'ai';
  isAIOpen = panel === 'ai';

  if (panel !== 'facts') closeFactComposer();
  if (aiOnly) {
    closeFactDetailPanel();
    closeCategoryActionPanel();
    closeNamingEntryPanel();
    closeNameDetailPanel();
  }

  if (!aiOnly && panel === 'naming') renderTags();
  if (!aiOnly && panel === 'facts') renderFacts();
  if (panel === 'ai' && typeof renderAIDesk === 'function') renderAIDesk();
  return aiOnly;
}

function switchSidePanel(panel) {
  activeSidePanel = panel;
  syncSidePanelAvailability();
}

function exportTxt() {
  if (!hasActiveStory()) return;
  const out = chapters.map(chapter => {
    const tmp = document.createElement('div');
    tmp.innerHTML = chapter.content;
    return '=== ' + chapter.title + ' ===\n\n' + (tmp.textContent || '');
  }).join('\n\n\n');
  const link = document.createElement('a');
  link.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(out);
  link.download = text().exportFile;
  link.click();
}
