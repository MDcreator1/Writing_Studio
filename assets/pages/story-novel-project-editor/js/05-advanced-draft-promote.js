const lmRawDraftPromoteRequest = typeof requestPromoteDraftToChapter === 'function'
  ? requestPromoteDraftToChapter
  : null;

let advancedDraftPromoteState = null;

const ADVANCED_PROMOTE_SENTENCE_ENDINGS = ['\u0964', '.', '!', '?', '\u2026\u2026', '---'];
const ADVANCED_PROMOTE_OPEN_QUOTE = '\u201c';
const ADVANCED_PROMOTE_CLOSE_QUOTE = '\u201d';
const ADVANCED_PROMOTE_CONCLUSION_STORAGE_PREFIX = 'lm_advanced_promote_conclusion_v1';
const ADVANCED_IMPORT_DEFAULT_WORDS = lmEditorAdvancedNumber('importDefaultWords', 2500);
const ADVANCED_IMPORT_MINIMUM_WORDS = lmEditorAdvancedNumber('importMinimumWords', 100);
const ADVANCED_IMPORT_MAXIMUM_WORDS = lmEditorAdvancedNumber('importMaximumWords', 50000);
const ADVANCED_IMPORT_SMART_LOOK_AHEAD = lmEditorAdvancedNumber('importSmartLookAhead', 1200);
const ADVANCED_IMPORT_CUSTOM_MINIMUM_OCCURRENCES = lmEditorAdvancedNumber('customMinimumOccurrences', 2);
const ADVANCED_IMPORT_SELECT_HEIGHT = lmEditorAdvancedNumber('customSelectHeight', 110);

function advancedPromoteCopy(key, fallback = '') {
  const value = text()?.[key];
  return typeof value === 'string' && value ? value : fallback;
}

function advancedPromoteIcon(name, className = '') {
  return typeof window.lmIcon === 'function' ? window.lmIcon(name, className) : '';
}

function advancedPromoteNormalizedText(value = '') {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function advancedPromoteWordCount(value = '') {
  return countWordsFromText(advancedPromoteNormalizedText(value));
}

function advancedPromoteSentenceEndPosition(value = '') {
  const source = String(value || '');
  const positions = ADVANCED_PROMOTE_SENTENCE_ENDINGS
    .map(symbol => source.indexOf(symbol))
    .filter(position => position >= 0);
  return positions.length ? Math.min(...positions) + 1 : -1;
}

function advancedPromotePreviousSentenceStart(value = '') {
  const source = String(value || '');
  let latestIndex = -1;
  let latestLength = 0;
  ADVANCED_PROMOTE_SENTENCE_ENDINGS.forEach(symbol => {
    const index = source.lastIndexOf(symbol);
    if (index > latestIndex) {
      latestIndex = index;
      latestLength = symbol.length;
    }
  });
  return latestIndex >= 0 ? latestIndex + latestLength : 0;
}

function advancedPromoteSafeSplit(value = '', limit = 2500) {
  const tokens = String(value || '').split(/(\s+)/);
  let words = 0;
  let index = 0;

  while (index < tokens.length && words < limit) {
    if (!/^\s+$/.test(tokens[index] || '')) words += 1;
    index += 1;
  }

  return [tokens.slice(0, index).join(''), tokens.slice(index).join('')];
}

function advancedPromoteSmartSplit(value = '', limit = 2500) {
  const [safeLeft, safeRight] = advancedPromoteSafeSplit(value, limit);
  let left = safeLeft;
  let right = safeRight;

  if (!right.trim()) return [left.trim(), right.trim()];

  let cut = advancedPromoteSentenceEndPosition(right);
  const lastOpenLeft = left.lastIndexOf(ADVANCED_PROMOTE_OPEN_QUOTE);
  const lastCloseLeft = left.lastIndexOf(ADVANCED_PROMOTE_CLOSE_QUOTE);
  const closeRight = right.indexOf(ADVANCED_PROMOTE_CLOSE_QUOTE);

  if (lastOpenLeft !== -1 && lastOpenLeft > lastCloseLeft && closeRight !== -1) {
    cut = closeRight + ADVANCED_PROMOTE_CLOSE_QUOTE.length;
  }

  if (cut < 0) {
    const newlineIndex = right.indexOf('\n');
    cut = newlineIndex >= 0 ? newlineIndex : 0;
  }

  const trimmedLeft = left.trimEnd();
  if (ADVANCED_PROMOTE_SENTENCE_ENDINGS.some(symbol => trimmedLeft.endsWith(symbol))) {
    return [left.trim(), right.trim()];
  }

  if (cut <= 0) return [left.trim(), right.trim()];
  return [(left + right.slice(0, cut)).trim(), right.slice(cut).trim()];
}

function advancedPromoteLastSentence(value = '', parameter = 0) {
  let full = advancedPromoteNormalizedText(value);
  if (!full) return '';

  if (parameter > 0) {
    const [firstPart] = advancedPromoteSmartSplit(full, parameter);
    full = firstPart.trim();
  }

  const noteIndex = full.indexOf('{Note');
  const cleaned = (noteIndex >= 0 ? full.slice(0, noteIndex) : full).trim();
  if (!cleaned) return '';

  if (cleaned.endsWith(ADVANCED_PROMOTE_CLOSE_QUOTE)) {
    const openIndex = cleaned.lastIndexOf(ADVANCED_PROMOTE_OPEN_QUOTE);
    if (openIndex >= 0) return cleaned.slice(openIndex).trim();
  }

  if (ADVANCED_PROMOTE_SENTENCE_ENDINGS.some(symbol => cleaned.endsWith(symbol))) {
    const start = advancedPromotePreviousSentenceStart(cleaned.slice(0, -1));
    return cleaned.slice(start).trim();
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.length <= 6 ? cleaned : words.slice(-6).join(' ');
}

function advancedPromoteFixSplitForChapter(value = '', limit = 2500) {
  let [firstPart, rest] = advancedPromoteSmartSplit(value, limit);
  firstPart = firstPart.trim();
  rest = rest.trim();
  if (!firstPart || !rest) return [firstPart, rest];

  const lastSentence = advancedPromoteLastSentence(firstPart);
  const lastSentenceWords = advancedPromoteWordCount(lastSentence);
  if (lastSentenceWords < 18 || !lastSentence) return [firstPart, rest];

  const safeFirst = firstPart.slice(0, Math.max(0, firstPart.length - lastSentence.length)).trim();
  if (advancedPromoteWordCount(safeFirst) <= limit - 10) {
    if (rest.startsWith(ADVANCED_PROMOTE_OPEN_QUOTE)) {
      const closeIndex = rest.indexOf(ADVANCED_PROMOTE_CLOSE_QUOTE);
      if (closeIndex !== -1) {
        return [(`${firstPart}\n\n${rest.slice(0, closeIndex + 1)}`).trim(), rest.slice(closeIndex + 1).trim()];
      }
    }

    const symbolIndex = advancedPromoteSentenceEndPosition(rest);
    if (symbolIndex > 0) {
      return [(`${firstPart}\n\n${rest.slice(0, symbolIndex)}`).trim(), rest.slice(symbolIndex).trim()];
    }

    return [firstPart, rest];
  }

  const sentenceStart = Math.max(0, firstPart.length - lastSentence.length);
  return [firstPart.slice(0, sentenceStart).trim(), (`${lastSentence}\n\n${rest}`).trim()];
}

function advancedPromoteDefaultChapterCount(sourceText = '', wordLimit = 2500) {
  const words = advancedPromoteWordCount(sourceText);
  if (!words) return 1;
  return clampNumber(Math.floor(words / Math.max(1, wordLimit)) || 1, 1, 50);
}

function advancedPromoteConclusionStorageKey() {
  const folderName = projectDirectoryHandle?.name ||
    localStorage.getItem(typeof PROJECT_FOLDER_KEY === 'string' ? PROJECT_FOLDER_KEY : 'lm_projectFolder') ||
    normalizeProjectManifest(projectManifest || createProjectManifest()).title ||
    'default';
  return `${ADVANCED_PROMOTE_CONCLUSION_STORAGE_PREFIX}:${encodeURIComponent(folderName)}`;
}

function advancedPromoteReadPermanentConclusion(mode = 'promote') {
  const managed = window.LmAdvancedImportPromoteSettings?.readPermanentConclusion?.(mode);
  if (typeof managed === 'string') return managed;
  try {
    return localStorage.getItem(advancedPromoteConclusionStorageKey()) || '';
  } catch (error) {
    console.warn('Advanced promote conclusion could not be read:', error);
    return '';
  }
}

function advancedPromoteSavePermanentConclusion(value = '', mode = 'promote') {
  if (window.LmAdvancedImportPromoteSettings?.savePermanentConclusion?.(mode, value)) return;
  try {
    localStorage.setItem(advancedPromoteConclusionStorageKey(), String(value || ''));
  } catch (error) {
    console.warn('Advanced promote conclusion could not be saved:', error);
  }
}

function advancedPromoteChapterBody(chapter = {}) {
  return String(chapter.body ?? chapter.text ?? '').replace(/\r\n?/g, '\n').trim();
}

function advancedPromoteChapterFullText(chapter = {}) {
  const body = advancedPromoteChapterBody(chapter);
  const conclusion = String(chapter.conclusion || '').replace(/\r\n?/g, '\n').trim();
  return [body, conclusion].filter(Boolean).join('\n\n\n');
}

function advancedPromoteSplitIsStale(state) {
  if (!state) return false;
  return state.generatedSourceText !== state.sourceText ||
    state.generatedWordLimit !== state.wordLimit ||
    state.generatedChapterCount !== state.chapterCount ||
    state.generatedSplitMode !== state.splitMode ||
    state.generatedCustomWord !== state.customWord;
}

function advancedPromoteChapterIsReady(chapter, state = advancedDraftPromoteState) {
  return advancedPromoteWordCount(advancedPromoteChapterBody(chapter)) >= (state?.wordLimit || 1);
}

function advancedPromoteHasInvalidChapters(state) {
  return Boolean(state?.chapters?.some(chapter => {
    const words = advancedPromoteWordCount(advancedPromoteChapterBody(chapter));
    return words > 0 && words < state.wordLimit;
  }));
}

function advancedPromoteDefaultTitle(baseTitle = '', index = 0) {
  const cleanBase = String(baseTitle || advancedPromoteCopy('chapterTitleLabel', 'Chapter')).trim() || advancedPromoteCopy('chapterTitleLabel', 'Chapter');
  return `${cleanBase} ${index + 1}`;
}

function advancedImportDocumentTitle(state, index = 0, target = state?.importTarget) {
  const documentType = target === 'chapters' ? 'Chapter' : 'Draft';
  const sourceTitle = String(state?.draftTitle || '').trim();
  return `${sourceTitle || 'Imported'} ${documentType} ${index + 1}`;
}

function advancedPromoteUniqueChapterTitle(baseTitle = '', usedKeys = new Set()) {
  const fallbackTitle = advancedPromoteCopy('chapterTitleLabel', 'Chapter');
  const cleanBase = String(baseTitle || fallbackTitle).trim() || fallbackTitle;
  let title = cleanBase;
  let suffix = 2;
  while (chapterTitleExists(title) || usedKeys.has(uniqueNameKey(title))) {
    title = `${cleanBase} ${suffix}`;
    suffix += 1;
  }
  usedKeys.add(uniqueNameKey(title));
  return title;
}

function advancedPromoteGenerateChapters(sourceText = '', options = {}) {
  const wordLimit = clampNumber(parseInt(options.wordLimit, 10) || 2500, 100, 50000);
  const requestedCount = clampNumber(parseInt(options.chapterCount, 10) || 1, 1, 50);
  const permanentConclusion = String(options.permanentConclusion || '').trim();
  const titleBase = String(options.titleBase || advancedPromoteCopy('chapterTitleLabel', 'Chapter')).trim();
  let remainingText = advancedPromoteNormalizedText(sourceText);
  const chaptersToCreate = [];

  for (let index = 0; index < requestedCount && remainingText.trim(); index += 1) {
    const remainingWords = advancedPromoteWordCount(remainingText);
    if (remainingWords < wordLimit) break;

    let [chapterText, restText] = advancedPromoteFixSplitForChapter(remainingText, wordLimit);
    if (advancedPromoteWordCount(chapterText) < wordLimit) {
      [chapterText, restText] = advancedPromoteSmartSplit(remainingText, wordLimit);
    }
    if (!chapterText.trim() || advancedPromoteWordCount(chapterText) < wordLimit) break;

    chaptersToCreate.push({
      id: `advanced-promote-${Date.now()}-${index}`,
      title: advancedPromoteDefaultTitle(titleBase, index),
      body: chapterText.trim(),
      conclusion: permanentConclusion,
      usesPermanentConclusion: true
    });

    if (!restText.trim()) {
      remainingText = '';
      break;
    }

    const carryLine = advancedPromoteLastSentence(chapterText);
    remainingText = `${carryLine ? `${carryLine}\n` : ''}${restText}`.trim();
  }

  return {
    chapters: chaptersToCreate,
    remainderText: remainingText.trim()
  };
}

function advancedImportUsesRawMode(state = advancedDraftPromoteState) {
  return Boolean(state?.mode === 'import' && state.wordLimit > advancedPromoteWordCount(state.sourceText));
}

function advancedPromoteSyncDraftSnapshot(draftIndex) {
  chapterDrafts = normalizeDrafts(chapterDrafts);
  const draft = chapterDrafts[draftIndex];
  if (!draft) return null;
  if (isDraftActive() && draftIndex === curDraft) {
    draft.content = getCleanEditorHTML();
    setDraftWordCache(draftIndex, countWordsFromText(getCleanEditorText()));
  }
  return draft;
}

function advancedPromoteSourceTextForDraft(draftIndex) {
  const draft = advancedPromoteSyncDraftSnapshot(draftIndex);
  if (!draft) return '';
  return isDraftActive() && draftIndex === curDraft
    ? getCleanEditorText()
    : editorHTMLToText(draft.content || '');
}

function openDraftPromoteModePanel(draftIndex, anchor = null) {
  chapterDrafts = normalizeDrafts(chapterDrafts);
  const panel = document.getElementById('draftDetailsPanel');
  const draft = chapterDrafts[draftIndex];
  if (!panel || !draft) return;

  const copy = text();
  const openedFromDraftActionPanel = Boolean(anchor?.closest?.('#draftDetailsPanel'));
  const positionAnchor = openedFromDraftActionPanel ? floatingAnchorSnapshot(anchor) : anchor;
  const positionKey = openedFromDraftActionPanel
    ? 'draftActionPromoteDestinationPanel'
    : 'editorPromoteDestinationPanel';
  closePartDetailsPanel();
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  activeDraftDetailsIndex = `promote-mode:${draftIndex}`;
  activeFloatingAnchor = positionAnchor;
  panel.dataset.positionKey = positionKey;
  panel.classList.add('draft-actions-panel', 'draft-promote-destination-panel', 'draft-promote-mode-panel');
  panel.innerHTML = `
    <div class="part-details-head draft-delete-confirm-head">
      <strong>${escapeHtml(copy.promoteModeTitle || 'Promote draft')}</strong>
      <button class="name-panel-close" type="button" onclick="closeDraftActionsPanel()">${CROSS_CLOSE_SVG}</button>
    </div>
      <p class="draft-delete-confirm-copy">${escapeHtml(copy.promoteModeBody || '')}</p>
      <div class="draft-promote-mode-grid">
        <button class="draft-promote-mode-btn" type="button" onclick="requestRawPromoteDraftToChapter(${draftIndex}, this)">
          <span class="draft-promote-mode-label"><strong>${escapeHtml(copy.rawPromote || 'Raw Promote')}</strong></span>
          <span class="draft-promote-mode-tooltip" role="tooltip">${escapeHtml(copy.rawPromoteBody || '')}</span>
        </button>
        <button class="draft-promote-mode-btn is-advanced" type="button" onclick="openAdvancedDraftPromotePanel(${draftIndex})">
          <span class="draft-promote-mode-label"><strong>${escapeHtml(copy.advancedPromote || 'Advanced Promote')}</strong></span>
          <span class="draft-promote-mode-tooltip" role="tooltip">${escapeHtml(copy.advancedPromoteBody || '')}</span>
        </button>
      </div>`;

  panel.hidden = false;
  positionFloatingPanel(panel, positionAnchor);
}

async function requestRawPromoteDraftToChapter(draftIndex, anchor = null) {
  if (typeof lmRawDraftPromoteRequest === 'function') {
    await lmRawDraftPromoteRequest(draftIndex, anchor || document.getElementById('promoteDraftBtn'));
  }
}

async function requestAdvancedPromoteDraftToChapter(draftIndex, anchor = null) {
  const workflowDefaults = window.LmAdvancedImportPromoteSettings?.read?.() || {};
  if (workflowDefaults.promoteAutoOpenAboveLimit !== false) {
    if (!(await ensureDraftContentLoaded(draftIndex))) {
      showMiniReminder('Draft content load नहीं हुआ; promote panel नहीं खोला गया।');
      return;
    }
    const sourceWords = advancedPromoteWordCount(advancedPromoteSourceTextForDraft(draftIndex));
    const wordLimit = clampNumber(parseInt(workflowDefaults.promoteWordCount, 10) || 2500, 100, 50000);
    if (sourceWords > wordLimit) {
      await openAdvancedDraftPromotePanel(draftIndex);
      return;
    }
  }
  openDraftPromoteModePanel(draftIndex, anchor || document.getElementById('promoteDraftBtn'));
}

function ensureAdvancedDraftPromoteModal() {
  let modal = document.getElementById('advancedDraftPromoteModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'advancedDraftPromoteModal';
  modal.className = 'advanced-draft-promote-modal lm-id-advancedDraftPromoteModal';
  modal.hidden = true;
  document.body.appendChild(modal);
  return modal;
}

async function openAdvancedDraftPromotePanel(draftIndex) {
  if (!(await ensureDraftContentLoaded(draftIndex))) {
    showMiniReminder('Draft content load नहीं हुआ; promote panel नहीं खोला गया।');
    return;
  }
  const draft = advancedPromoteSyncDraftSnapshot(draftIndex);
  if (!draft) return;

  const sourceText = advancedPromoteSourceTextForDraft(draftIndex);
  const workflowDefaults = window.LmAdvancedImportPromoteSettings?.read?.() || {};
  const wordLimit = clampNumber(parseInt(workflowDefaults.promoteWordCount, 10) || 2500, 100, 50000);
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const showDestination = hasRawChaptersInPanel(manifest);
  const permanentConclusion = advancedPromoteReadPermanentConclusion('promote');
  advancedDraftPromoteState = {
    mode: 'draft',
    draftIndex,
    draftTitle: draft.title || `${text().draftPrefix} ${draftIndex + 1}`,
    sourceText,
    generatedSourceText: sourceText,
    contentFontSize: clampNumber(parseInt(workflowDefaults.promoteFontSize, 10) || 14, 10, 30),
    wordLimit,
    generatedWordLimit: wordLimit,
    chapterCount: advancedPromoteDefaultChapterCount(sourceText, wordLimit),
    generatedChapterCount: advancedPromoteDefaultChapterCount(sourceText, wordLimit),
    permanentConclusion,
    splitMode: 'auto',
    generatedSplitMode: 'auto',
    customWord: '',
    generatedCustomWord: '',
    customSplitValid: true,
    customSplitReason: '',
    customValidationVisible: false,
    destination: workflowDefaults.promoteDestination === 'raw' ? 'raw' : 'part',
    showDestination,
    activeView: 'chapters',
    selectedChapterIndex: 0,
    chapters: [],
    remainderText: ''
  };

  const generated = advancedPromoteGenerateChapters(sourceText, {
    wordLimit: advancedDraftPromoteState.wordLimit,
    chapterCount: advancedDraftPromoteState.chapterCount,
    permanentConclusion,
    titleBase: advancedDraftPromoteState.draftTitle
  });
  advancedDraftPromoteState.chapters = generated.chapters;
  advancedDraftPromoteState.remainderText = generated.remainderText;

  closeDraftActionsPanel();
  renderAdvancedDraftPromotePanel();
}

function openAdvancedTextImportPanel(sourceText = '', sourceTitle = '') {
  const normalizedSource = advancedPromoteNormalizedText(sourceText);
  if (!normalizedSource) return;
  const workflowDefaults = window.LmAdvancedImportPromoteSettings?.read?.() || {};
  const wordLimit = clampNumber(parseInt(workflowDefaults.importWordCount, 10) || ADVANCED_IMPORT_DEFAULT_WORDS, ADVANCED_IMPORT_MINIMUM_WORDS, ADVANCED_IMPORT_MAXIMUM_WORDS);
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const permanentConclusion = advancedPromoteReadPermanentConclusion('import');
  advancedDraftPromoteState = {
    mode: 'import',
    draftIndex: -1,
    draftTitle: String(sourceTitle || 'Imported Text').trim() || 'Imported Text',
    sourceText: normalizedSource,
    generatedSourceText: normalizedSource,
    contentFontSize: clampNumber(parseInt(workflowDefaults.importFontSize, 10) || 14, 10, 30),
    wordLimit,
    generatedWordLimit: wordLimit,
    chapterCount: 1,
    generatedChapterCount: 1,
    permanentConclusion,
    splitMode: workflowDefaults.importSplitMode === 'custom' ? 'custom' : 'auto',
    generatedSplitMode: workflowDefaults.importSplitMode === 'custom' ? 'custom' : 'auto',
    customWord: String(workflowDefaults.importCustomWord || '').trim(),
    generatedCustomWord: String(workflowDefaults.importCustomWord || '').trim(),
    importTarget: workflowDefaults.importTarget === 'chapters' ? 'chapters' : 'drafts',
    customSplitValid: true,
    customSplitReason: '',
    customValidationVisible: false,
    destination: 'part',
    showDestination: hasRawChaptersInPanel(manifest),
    activeView: 'source',
    selectedChapterIndex: 0,
    chapters: [],
    remainderText: ''
  };
  const generated = advancedImportUsesRawMode(advancedDraftPromoteState)
    ? { chapters: [], valid: true, reason: '' }
    : advancedImportGenerateChapters(advancedDraftPromoteState);
  advancedDraftPromoteState.chapters = generated.chapters;
  advancedDraftPromoteState.remainderText = generated.remainderText;
  advancedDraftPromoteState.customSplitValid = generated.valid;
  advancedDraftPromoteState.customSplitReason = generated.reason;
  renderAdvancedDraftPromotePanel();
}

function advancedPromoteDestinationHTML(state) {
  if (!state?.showDestination) return '';
  const copy = text();
  return `
    <fieldset class="advanced-promote-destination">
      <legend>${escapeHtml(copy.advancedPromoteDestination || 'Destination')}</legend>
      <label>
        <input type="radio" name="advancedPromoteDestination" value="part" ${state.destination === 'raw' ? '' : 'checked'} onchange="setAdvancedPromoteDestination('part')">
        <span>${escapeHtml(copy.promoteToRecentPart || 'Recent Part')}</span>
      </label>
      <label>
        <input type="radio" name="advancedPromoteDestination" value="raw" ${state.destination === 'raw' ? 'checked' : ''} onchange="setAdvancedPromoteDestination('raw')">
        <span>${escapeHtml(copy.promoteToRawChapters || 'Raw Chapters')}</span>
      </label>
    </fieldset>`;
}

function advancedPromoteSettingsBarHTML(state) {
  const copy = text();
  const rawImportMode = advancedImportUsesRawMode(state);
  const applyBlockReason = advancedPromoteApplyBlockReason(state);
  const createButton = rawImportMode
    ? `<button class="advanced-promote-create-btn is-raw-import" type="button" onclick="applyAdvancedTextImportRaw()">${state.importTarget === 'chapters' ? 'Import as Chapter' : 'Raw Import'}</button>`
    : `<button class="advanced-promote-create-btn ${state.mode === 'import' && state.splitMode === 'custom' && !state.customSplitValid ? 'is-validation-blocked' : ''}" type="button" aria-disabled="${state.mode === 'import' && state.splitMode === 'custom' && !state.customSplitValid}" onclick="generateAdvancedPromoteChaptersFromPanel()">${escapeHtml(state.mode === 'import' ? (state.importTarget === 'chapters' ? 'Create Chapters' : 'Create Drafts') : (copy.advancedPromoteCreate || 'Create Chapters'))}</button>`;
  return `<div class="advanced-promote-settings-bar ${state.showDestination ? 'has-destination' : ''}">
        ${state.mode === 'import' ? `<label class="advanced-import-target-field">
          <span>Import as</span>
          <select id="advancedImportTarget" onchange="updateAdvancedImportTarget(this.value)">
            <option value="drafts" ${state.importTarget === 'chapters' ? '' : 'selected'}>Draft</option>
            <option value="chapters" ${state.importTarget === 'chapters' ? 'selected' : ''}>Chapter directly</option>
          </select>
        </label>
          <label class="advanced-import-split-field">
            <span>Split method</span>
            <select id="advancedImportSplitMode" data-menu-max-height="${ADVANCED_IMPORT_SELECT_HEIGHT}" onchange="updateAdvancedImportSplitMode(this.value)">
              <option value="auto" ${state.splitMode === 'auto' ? 'selected' : ''}>Auto smart split</option>
              <option value="custom" ${state.splitMode === 'custom' ? 'selected' : ''}>Custom word split</option>
            </select>
          </label>
          <label class="advanced-import-word-limit-field">
            <span>${escapeHtml(copy.advancedPromoteWordLimit || 'Words per chapter')}</span>
            <span class="advanced-import-word-limit-control advanced-number-stepper dock-fsize-control">
              <input class="dock-fsize-inp advanced-number-input" id="advancedPromoteWordLimitInp" data-advanced-runtime-key="advanced-promote-word-limit" type="number" min="${ADVANCED_IMPORT_MINIMUM_WORDS}" max="${ADVANCED_IMPORT_MAXIMUM_WORDS}" step="100" value="${state.wordLimit}" oninput="updateAdvancedPromoteSetting('wordLimit', this.value)">
              <span class="dock-fsize-stepper" aria-label="Words per chapter controls"><button class="dock-fsize-step" type="button" aria-label="Increase words per chapter" onclick="stepAdvancedNumberInput(event, 'advanced-promote-word-limit', 1)">${advancedPromoteIcon('collapseChevron', 'step-chevron-svg lm-chevron-up')}</button><button class="dock-fsize-step" type="button" aria-label="Decrease words per chapter" onclick="stepAdvancedNumberInput(event, 'advanced-promote-word-limit', -1)">${advancedPromoteIcon('collapseChevron', 'step-chevron-svg lm-chevron-down')}</button></span>
            </span>
          </label>
          <label class="advanced-import-custom-word" ${state.splitMode === 'custom' ? '' : 'hidden'}>
            <span>Custom split word</span>
            <span class="advanced-import-custom-input-wrap">
              <input class="${state.customSplitValid ? 'is-valid' : (state.customValidationVisible ? 'is-invalid' : '')}" id="advancedImportCustomWordInp" type="text" value="${escapeHtml(state.customWord)}" placeholder="e.g. अध्याय" oninput="updateAdvancedImportCustomWord(this.value)">
              <span class="advanced-import-validation-float ${state.customValidationVisible && !state.customSplitValid ? 'is-visible' : ''}" data-advanced-import-validation>${escapeHtml(state.customSplitReason || 'Choose a valid split word.')}</span>
            </span>
        </label>` : `<label class="advanced-promote-action-field advanced-promote-number-field">
          <span>${escapeHtml(copy.advancedPromoteWordLimit || 'Words per chapter')}</span>
          <span class="advanced-promote-number-control advanced-number-stepper dock-fsize-control">
            <input class="dock-fsize-inp advanced-number-input" id="advancedPromoteWordLimitInp" data-advanced-runtime-key="advanced-promote-word-limit" type="number" min="100" max="50000" step="100" value="${state.wordLimit}" oninput="updateAdvancedPromoteSetting('wordLimit', this.value)">
            <span class="dock-fsize-stepper" aria-label="Words per chapter controls"><button class="dock-fsize-step" type="button" aria-label="Increase words per chapter" onclick="stepAdvancedNumberInput(event, 'advanced-promote-word-limit', 1)">${advancedPromoteIcon('collapseChevron', 'step-chevron-svg lm-chevron-up')}</button><button class="dock-fsize-step" type="button" aria-label="Decrease words per chapter" onclick="stepAdvancedNumberInput(event, 'advanced-promote-word-limit', -1)">${advancedPromoteIcon('collapseChevron', 'step-chevron-svg lm-chevron-down')}</button></span>
          </span>
        </label>
          <label class="advanced-promote-action-field advanced-promote-number-field">
            <span>${escapeHtml(copy.advancedPromoteChapterCount || 'Chapter count')}</span>
            <span class="advanced-promote-number-control advanced-number-stepper dock-fsize-control">
              <input class="dock-fsize-inp advanced-number-input" id="advancedPromoteChapterCountInp" data-advanced-runtime-key="advanced-promote-chapter-count" type="number" min="1" max="50" step="1" value="${state.chapterCount}" oninput="updateAdvancedPromoteSetting('chapterCount', this.value)">
              <span class="dock-fsize-stepper" aria-label="Chapter count controls"><button class="dock-fsize-step" type="button" aria-label="Increase chapter count" onclick="stepAdvancedNumberInput(event, 'advanced-promote-chapter-count', 1)">${advancedPromoteIcon('collapseChevron', 'step-chevron-svg lm-chevron-up')}</button><button class="dock-fsize-step" type="button" aria-label="Decrease chapter count" onclick="stepAdvancedNumberInput(event, 'advanced-promote-chapter-count', -1)">${advancedPromoteIcon('collapseChevron', 'step-chevron-svg lm-chevron-down')}</button></span>
            </span>
          </label>`}
        ${advancedPromoteDestinationHTML(state)}
        <div class="advanced-promote-settings-actions">
          <div class="advanced-promote-action-field is-create-action">
            <strong>${escapeHtml(rawImportMode ? 'Import' : 'Creation')}</strong>
            ${createButton}
          </div>
          ${rawImportMode ? '' : `<div class="advanced-promote-action-field is-apply-action">
            <strong>${escapeHtml(state.mode === 'import' ? 'Final import' : 'Promotion')}</strong>
            <span class="advanced-promote-apply-input-wrap">
              <button class="advanced-promote-apply-btn ${applyBlockReason ? 'is-validation-blocked' : ''}" type="button" aria-disabled="${Boolean(applyBlockReason)}" onclick="handleAdvancedPromoteApplyClick(event)">${escapeHtml(state.mode === 'import' ? 'Advanced Import' : (copy.advancedPromoteApply || 'Promote Chapters'))}</button>
              <span class="advanced-import-validation-float advanced-promote-apply-validation" data-advanced-promote-apply-validation>${escapeHtml(applyBlockReason)}</span>
            </span>
          </div>`}
        </div>
      </div>`;
}

function advancedPromoteChapterListHTML(state) {
  const copy = text();
  if (!state.chapters.length) {
    return `<div class="advanced-promote-empty">${escapeHtml(state.mode === 'import' ? 'The source does not contain enough words for a full draft at this parameter.' : (copy.advancedPromoteNoFullChapter || 'The source does not contain enough words for a full chapter at this parameter.'))}</div>`;
  }

  return state.chapters.map((chapter, index) => {
    const fullWords = advancedPromoteWordCount(advancedPromoteChapterFullText(chapter));
    const isSelected = state.activeView === 'chapters' && index === state.selectedChapterIndex;
    return `
      <button class="advanced-promote-chapter-list-btn ${isSelected ? 'is-selected' : ''}" type="button" data-advanced-promote-list-index="${index}" onclick="selectAdvancedPromoteChapter(${index})" aria-pressed="${isSelected}">
        <span class="advanced-promote-chapter-number">${String(index + 1).padStart(2, '0')}</span>
        <span class="advanced-promote-chapter-list-copy">
          <strong data-advanced-promote-list-title="${index}">${escapeHtml(chapter.title)}</strong>
          <small><span data-advanced-promote-list-words="${index}">${fullWords}</span> ${escapeHtml(copy.advancedPromoteWords || copy.words || 'words')}</small>
        </span>
      </button>`;
  }).join('');
}

function advancedPromoteSelectedChapterHTML(state) {
  const copy = text();
  const chapter = state.chapters[state.selectedChapterIndex];
  if (!chapter) {
    return `
      <section class="advanced-promote-chapter-preview is-empty">
        <div class="advanced-promote-empty">${escapeHtml(copy.advancedPromoteNoChapters || 'Create split chapters to preview them here.')}</div>
      </section>`;
  }

  const index = state.selectedChapterIndex;
  const bodyWords = advancedPromoteWordCount(advancedPromoteChapterBody(chapter));
  const conclusionWords = advancedPromoteWordCount(chapter.conclusion || '');
  const fullText = advancedPromoteChapterFullText(chapter);
  const fullWords = advancedPromoteWordCount(fullText);
  const numberLabel = String(index + 1).padStart(2, '0');
  return `
    <section class="advanced-promote-chapter-preview" data-advanced-promote-chapter="${index}">
      <header class="advanced-promote-chapter-preview-head">
        <div class="advanced-promote-chapter-identity">
          <span class="advanced-promote-preview-number">${numberLabel}</span>
          <label class="advanced-promote-chapter-title-inline">
            <input type="text" value="${escapeHtml(chapter.title)}" oninput="updateAdvancedPromoteChapterTitle(${index}, this.value)" aria-label="${escapeHtml(copy.chapterTitleLabel || 'Chapter title')}">
          </label>
        </div>
        <div class="advanced-promote-chapter-meta" aria-live="polite">
          <span><b data-advanced-promote-body-words>${bodyWords}</b> ${escapeHtml(copy.advancedPromoteBodyWords || 'words')}</span>
          <span data-advanced-promote-full-word-state ${conclusionWords ? '' : 'hidden'}><b data-advanced-promote-final-words>${fullWords}</b> ${escapeHtml(copy.advancedPromoteFinalWords || 'full words')}</span>
          <span data-advanced-promote-conclusion-status>${escapeHtml(conclusionWords ? (copy.advancedPromoteConclusionAdded || 'Conclusion added') : (copy.advancedPromoteNoConclusion || 'No conclusion'))}</span>
        </div>
        <div class="advanced-promote-chapter-actions">
          <button type="button" data-advanced-promote-edit-btn onclick="focusAdvancedPromoteChapterEditor(${index})" title="${escapeHtml(copy.advancedPromoteEdit || 'Edit')}" aria-label="${escapeHtml(copy.advancedPromoteEdit || 'Edit')}">${advancedPromoteIcon('edit', 'advanced-promote-action-icon')}</button>
          <button type="button" onclick="copyAdvancedPromoteChapter(${index})" title="${escapeHtml(copy.advancedPromoteCopy || 'Copy')}" aria-label="${escapeHtml(copy.advancedPromoteCopy || 'Copy')}">${advancedPromoteIcon('smartCopyDefault', 'advanced-promote-action-icon')}</button>
          <button type="button" class="is-danger" onclick="deleteAdvancedPromoteChapter(${index})" title="${escapeHtml(copy.advancedPromoteDelete || 'Delete')}" aria-label="${escapeHtml(copy.advancedPromoteDelete || 'Delete')}">${advancedPromoteIcon('delete', 'advanced-promote-action-icon')}</button>
        </div>
      </header>

      <section class="advanced-promote-full-chapter">
        <div class="advanced-promote-full-reading" data-advanced-promote-full-reading>${escapeHtml(fullText)}</div>
        <textarea class="advanced-promote-full-editor" hidden oninput="updateAdvancedPromoteChapterFullText(${index}, this.value)">${escapeHtml(fullText)}</textarea>
      </section>
    </section>`;
}

function advancedImportRemainderViewHTML(state) {
  const words = advancedPromoteWordCount(state.remainderText);
  return `<section class="advanced-import-source-only is-remainder-draft"><div class="advanced-promote-section-head"><div><strong>Remainder Text</strong><p>This text will be saved as a draft when the chapters are imported.</p></div><span>${words} ${escapeHtml(text().words || 'words')}</span></div><textarea oninput="updateAdvancedPromoteRemainderText(this.value)">${escapeHtml(state.remainderText)}</textarea></section>`;
}

function advancedPromoteRemainderViewHTML(state) {
  const copy = text();
  const words = advancedPromoteWordCount(state.remainderText);
  return `<section class="advanced-promote-chapter-preview is-remainder-preview">
    <header class="advanced-promote-chapter-preview-head">
      <div class="advanced-promote-chapter-identity">
        <span class="advanced-promote-preview-number">DR</span>
        <div class="advanced-promote-remainder-identity"><strong>${escapeHtml(state.draftTitle || copy.advancedPromoteSource || 'Source Draft')}</strong></div>
      </div>
      <div class="advanced-promote-chapter-meta" aria-live="polite">
        <span><b data-advanced-promote-remainder-words>${words}</b> ${escapeHtml(copy.words || 'words')}</span>
        <span>${escapeHtml(copy.advancedPromoteRemainderBody || 'Stays saved in the source draft')}</span>
      </div>
    </header>
    <section class="advanced-promote-full-chapter">
      <textarea class="advanced-promote-full-editor" aria-label="${escapeHtml(copy.advancedPromoteRemainder || 'Remainder Text')}" oninput="updateAdvancedPromoteRemainderText(this.value)">${escapeHtml(state.remainderText)}</textarea>
    </section>
  </section>`;
}

function advancedPromoteCreatedViewHTML(state) {
  const copy = text();
  if (state.mode === 'import') {
    const remainderWords = advancedPromoteWordCount(state.remainderText);
    const importedSelected = state.activeView === 'source';
    const remainderSelected = state.activeView === 'remainder';
    const createdLabel = state.importTarget === 'chapters' ? 'Created Chapters' : 'Created Drafts';
    const remainderIndex = state.importTarget === 'chapters' && state.remainderText
      ? `<div class="advanced-import-index-separator is-remainder"><span>Remainder Text · As Draft</span></div><button class="advanced-promote-chapter-list-btn is-remainder-source ${remainderSelected ? 'is-selected' : ''}" type="button" onclick="setAdvancedPromoteView('remainder')" aria-pressed="${remainderSelected}"><span class="advanced-promote-chapter-number">DR</span><span class="advanced-promote-chapter-list-copy"><strong>Remainder Text</strong><small>${remainderWords} ${escapeHtml(copy.words || 'words')}</small></span></button>`
      : '';
    const detail = remainderSelected
      ? advancedImportRemainderViewHTML(state)
      : importedSelected
        ? `<section class="advanced-import-source-only"><textarea id="advancedPromoteSourceText" oninput="updateAdvancedPromoteSourceText(this.value)">${escapeHtml(state.sourceText)}</textarea></section>`
        : advancedPromoteSelectedChapterHTML(state);
    return `<main class="advanced-promote-created-view is-import-layout has-settings-bar">${advancedPromoteSettingsBarHTML(state)}<aside class="advanced-promote-chapter-index"><div class="advanced-promote-chapter-index-list"><button class="advanced-promote-chapter-list-btn is-imported-source ${importedSelected ? 'is-selected' : ''}" type="button" onclick="setAdvancedPromoteView('source')" aria-pressed="${importedSelected}"><span class="advanced-promote-chapter-number">IN</span><span class="advanced-promote-chapter-list-copy"><strong>Imported Text</strong><small>${advancedPromoteWordCount(state.sourceText)} ${escapeHtml(copy.words || 'words')}</small></span></button><div class="advanced-import-index-separator"><span>${createdLabel}</span></div>${advancedPromoteChapterListHTML(state)}${remainderIndex}</div>${state.chapters.length ? `<div class="advanced-promote-index-footer"><button type="button" onclick="reverseAdvancedPromoteCreation()">${escapeHtml(copy.advancedPromoteReverse || 'Reverse Creation')}</button></div>` : ''}</aside>${detail}</main>`;
  }
  const sourceSelected = state.activeView === 'source';
  const remainderSelected = state.activeView === 'remainder';
  const remainderWords = advancedPromoteWordCount(state.remainderText);
  const remainderIndex = state.remainderText
    ? `<div class="advanced-import-index-separator is-remainder"><span>Remainder Text · In Draft</span></div><button class="advanced-promote-chapter-list-btn is-remainder-source ${remainderSelected ? 'is-selected' : ''}" type="button" onclick="setAdvancedPromoteView('remainder')" aria-pressed="${remainderSelected}"><span class="advanced-promote-chapter-number">DR</span><span class="advanced-promote-chapter-list-copy"><strong>${escapeHtml(state.draftTitle || copy.advancedPromoteSource || 'Source Draft')}</strong><small>${remainderWords} ${escapeHtml(copy.words || 'words')}</small></span></button>`
    : '';
  const detail = remainderSelected
    ? advancedPromoteRemainderViewHTML(state)
    : sourceSelected
      ? advancedPromoteSourceDetailHTML(state)
      : advancedPromoteSelectedChapterHTML(state);
  return `
    <main class="advanced-promote-created-view is-import-layout has-settings-bar">
      ${advancedPromoteSettingsBarHTML(state)}
      <aside class="advanced-promote-chapter-index">
        <div class="advanced-promote-chapter-index-list"><button class="advanced-promote-chapter-list-btn is-imported-source ${sourceSelected ? 'is-selected' : ''}" type="button" onclick="setAdvancedPromoteView('source')" aria-pressed="${sourceSelected}"><span class="advanced-promote-chapter-number">SR</span><span class="advanced-promote-chapter-list-copy"><strong>${escapeHtml(copy.advancedPromoteSource || 'Source Draft')}</strong><small>${advancedPromoteWordCount(state.sourceText)} ${escapeHtml(copy.words || 'words')}</small></span></button><div class="advanced-import-index-separator"><span>${escapeHtml(copy.advancedPromoteCreatedChapters || 'Created Chapters')}</span></div>${advancedPromoteChapterListHTML(state)}${remainderIndex}</div>
        ${state.chapters.length ? `<div class="advanced-promote-index-footer"><button type="button" onclick="reverseAdvancedPromoteCreation()">${escapeHtml(copy.advancedPromoteReverse || 'Reverse Creation')}</button></div>` : ''}
      </aside>
      ${detail}
    </main>`;
}

function advancedPromoteSourceDetailHTML(state) {
  return `<section class="advanced-promote-source-view is-index-detail">
    <textarea id="advancedPromoteSourceText" aria-label="${escapeHtml(text().advancedPromoteSource || 'Source Draft')}" oninput="updateAdvancedPromoteSourceText(this.value)">${escapeHtml(state.sourceText)}</textarea>
  </section>`;
}

function advancedPromoteChapterTitleConflict(state) {
  if (!state || (state.mode === 'import' && state.importTarget !== 'chapters')) return null;
  const generatedKeys = new Map();
  for (let index = 0; index < state.chapters.length; index += 1) {
    const chapter = state.chapters[index];
    if (!advancedPromoteChapterBody(chapter)) continue;
    const title = String(chapter.title || advancedPromoteDefaultTitle(state.draftTitle, index)).trim();
    const key = uniqueNameKey(title);
    if (chapterTitleExists(title)) return { index, title, type: 'existing' };
    if (generatedKeys.has(key)) return { index, title, type: 'generated' };
    generatedKeys.set(key, index);
  }
  return null;
}

function advancedPromoteApplyBlockReason(state) {
  if (!state) return 'The promote panel is not ready.';
  if (advancedPromoteSplitIsStale(state)) return text().advancedPromoteRegenerateRequired || 'Source or split settings changed. Create chapters again before promoting.';
  if (!state.chapters.some(chapter => advancedPromoteChapterBody(chapter))) return text().advancedPromoteCreateFirst || 'Create at least one chapter first.';
  if (advancedPromoteHasInvalidChapters(state) && !state.allowShortImportChapter) return text().advancedPromoteBelowParameterBody || 'Every non-empty chapter must meet the word parameter before promotion.';
  if (state.mode === 'import' && state.customSplitValid === false && !state.allowShortImportChapter) return state.customSplitReason || 'Choose a valid custom split word.';
  const conflict = advancedPromoteChapterTitleConflict(state);
  if (!conflict) return '';
  return conflict.type === 'existing'
    ? `“${conflict.title}” title वाला chapter पहले से मौजूद है। Promote करने से पहले इसका नाम बदलें।`
    : `“${conflict.title}” title generated chapters में एक से अधिक बार है। हर chapter को अलग नाम दें।`;
}

function renderAdvancedDraftPromotePanel() {
  const state = advancedDraftPromoteState;
  const modal = ensureAdvancedDraftPromoteModal();
  if (!state) {
    modal.hidden = true;
    return;
  }
  const isInitialOpen = modal.hidden;

  if (state.chapters.length) {
    state.selectedChapterIndex = clampNumber(state.selectedChapterIndex, 0, state.chapters.length - 1);
  } else {
    state.selectedChapterIndex = 0;
  }

  const copy = text();
  const activeViewHTML = advancedPromoteCreatedViewHTML(state);

  modal.innerHTML = `
    <section class="advanced-promote-panel ${state.mode === 'import' ? 'is-text-import' : ''} ${isInitialOpen ? 'is-entering' : ''}" style="--advanced-promote-content-font-size:${state.contentFontSize || 14}px" role="dialog" aria-modal="true" aria-labelledby="advancedPromoteTitle">
      <header class="advanced-promote-header">
        <div>
          <h2 id="advancedPromoteTitle">${escapeHtml(state.mode === 'import' ? 'Advanced Text Import' : (copy.advancedPromoteTitle || 'Advanced Promote'))}</h2>
          ${state.mode === 'import' ? '' : `<p>${escapeHtml(state.draftTitle)}</p>`}
        </div>
        <button class="advanced-promote-close" type="button" onclick="closeAdvancedDraftPromotePanel()" aria-label="${escapeHtml(copy.close || 'Close')}">${CROSS_CLOSE_SVG}</button>
      </header>

      <div class="advanced-promote-body">${activeViewHTML}</div>
    </section>`;

  modal.hidden = false;
  document.body.classList.add('is-advanced-promote-open');
  requestAnimationFrame(() => {
    if (state.activeView === 'chapters') document.querySelector('.advanced-promote-chapter-list-btn.is-selected')?.focus();
  });
}
function closeAdvancedDraftPromotePanel() {
  const modal = document.getElementById('advancedDraftPromoteModal');
  if (modal) {
    modal.hidden = true;
    modal.innerHTML = '';
  }
  document.body.classList.remove('is-advanced-promote-open');
  advancedDraftPromoteState = null;
}

function setAdvancedPromoteView(view = 'chapters') {
  if (!advancedDraftPromoteState) return;
  syncAdvancedPromoteControlsFromPanel();
  advancedDraftPromoteState.activeView = view === 'source' ? 'source' : view === 'remainder' ? 'remainder' : 'chapters';
  renderAdvancedDraftPromotePanel();
}

function selectAdvancedPromoteChapter(index) {
  const state = syncAdvancedPromoteControlsFromPanel();
  if (!state?.chapters?.[index]) return;
  state.selectedChapterIndex = index;
  state.activeView = 'chapters';
  renderAdvancedDraftPromotePanel();
}

function updateAdvancedPromoteSetting(setting, value) {
  const state = advancedDraftPromoteState;
  if (!state) return;
  const wasRawImportMode = advancedImportUsesRawMode(state);
  if (setting === 'wordLimit') {
    state.wordLimit = state.mode === 'import'
      ? clampNumber(parseInt(value, 10) || ADVANCED_IMPORT_DEFAULT_WORDS, ADVANCED_IMPORT_MINIMUM_WORDS, ADVANCED_IMPORT_MAXIMUM_WORDS)
      : clampNumber(parseInt(value, 10) || 2500, 100, 50000);
  } else if (setting === 'chapterCount') {
    state.chapterCount = clampNumber(parseInt(value, 10) || 1, 1, 50);
  }
  if (state.mode === 'import' && wasRawImportMode !== advancedImportUsesRawMode(state)) {
    if (advancedImportUsesRawMode(state)) {
      state.chapters = [];
      state.remainderText = '';
      state.activeView = 'source';
    }
    renderAdvancedDraftPromotePanel();
    return;
  }
  const staleNote = document.querySelector('.advanced-promote-stale-note');
  if (staleNote) staleNote.hidden = !advancedPromoteSplitIsStale(state);
  refreshAdvancedPromoteApplyButton();
}

function updateAdvancedImportSplitMode(value = 'auto') {
  const state = syncAdvancedPromoteControlsFromPanel();
  if (!state || state.mode !== 'import') return;
  state.splitMode = value === 'custom' ? 'custom' : 'auto';
  if (state.splitMode === 'custom') {
    const validation = advancedImportCustomSplit(state.sourceText, state.customWord, state.wordLimit);
    state.customSplitValid = validation.valid;
    state.customSplitReason = validation.reason;
  } else {
    state.customSplitValid = true;
    state.customSplitReason = '';
  }
  state.customValidationVisible = false;
  state.activeView = 'source';
  renderAdvancedDraftPromotePanel();
}

function updateAdvancedImportTarget(value = 'drafts') {
  const state = advancedDraftPromoteState;
  if (!state || state.mode !== 'import') return;
  state.importTarget = value === 'chapters' ? 'chapters' : 'drafts';
  const generated = advancedImportUsesRawMode(state) ? { chapters: [], remainderText: '', valid: true, reason: '' } : advancedImportGenerateChapters(state);
  state.chapters = generated.chapters;
  state.remainderText = generated.remainderText;
  state.customSplitValid = generated.valid;
  state.customSplitReason = generated.reason;
  if (state.activeView === 'remainder' && !state.remainderText) state.activeView = 'source';
  renderAdvancedDraftPromotePanel();
}

function updateAdvancedImportCustomWord(value = '') {
  const state = advancedDraftPromoteState;
  if (!state || state.mode !== 'import') return;
  state.customWord = String(value || '').trim();
  const validation = advancedImportCustomSplit(state.sourceText, state.customWord, state.wordLimit);
  state.customSplitValid = validation.valid;
  state.customSplitReason = validation.reason;
  state.customValidationVisible = false;
  const validationNode = document.querySelector('[data-advanced-import-validation]');
  if (validationNode) {
    validationNode.textContent = validation.reason || 'Each split will meet the word parameter.';
    validationNode.classList.remove('is-visible');
  }
  const customInput = document.getElementById('advancedImportCustomWordInp');
  customInput?.classList.toggle('is-valid', validation.valid);
  customInput?.classList.remove('is-invalid');
  const createButton = document.querySelector('.advanced-promote-create-btn');
  createButton?.classList.toggle('is-validation-blocked', !validation.valid);
  createButton?.setAttribute('aria-disabled', String(!validation.valid));
  refreshAdvancedPromoteApplyButton();
}

function updateAdvancedPromoteSourceText(value = '') {
  const state = advancedDraftPromoteState;
  if (!state) return;
  const wasRawImportMode = advancedImportUsesRawMode(state);
  state.sourceText = String(value || '').replace(/\r\n?/g, '\n');
  if (state.mode === 'import' && wasRawImportMode !== advancedImportUsesRawMode(state)) {
    if (advancedImportUsesRawMode(state)) {
      state.chapters = [];
      state.remainderText = '';
      state.activeView = 'source';
    }
    renderAdvancedDraftPromotePanel();
    return;
  }
  const wordNode = document.querySelector('[data-advanced-promote-source-words]');
  if (wordNode) wordNode.textContent = `${advancedPromoteWordCount(state.sourceText)} ${text().words || 'words'}`;
  const staleNote = document.querySelector('.advanced-promote-stale-note');
  if (staleNote) staleNote.hidden = !advancedPromoteSplitIsStale(state);
  refreshAdvancedPromoteApplyButton();
}

function updateAdvancedPromoteRemainderText(value = '') {
  if (!advancedDraftPromoteState) return;
  advancedDraftPromoteState.remainderText = String(value || '').replace(/\r\n?/g, '\n');
}

function updateAdvancedPromotePermanentConclusion(value = '') {
  const state = advancedDraftPromoteState;
  if (!state) return;
  state.permanentConclusion = String(value || '').replace(/\r\n?/g, '\n');
  advancedPromoteSavePermanentConclusion(state.permanentConclusion, state.mode === 'import' ? 'import' : 'promote');
  state.chapters.forEach(chapter => {
    if (chapter.usesPermanentConclusion) chapter.conclusion = state.permanentConclusion;
  });
}

function updateAdvancedPromoteChapterTitle(index, value = '') {
  const chapter = advancedDraftPromoteState?.chapters?.[index];
  if (!chapter) return;
  chapter.title = String(value || '').trimStart();
  const listTitle = document.querySelector(`[data-advanced-promote-list-title="${index}"]`);
  if (listTitle) listTitle.textContent = chapter.title || advancedPromoteDefaultTitle(advancedDraftPromoteState.draftTitle, index);
  refreshAdvancedPromoteApplyButton();
}

function refreshAdvancedPromoteApplyButton() {
  const state = advancedDraftPromoteState;
  const button = document.querySelector('.advanced-promote-apply-btn');
  if (!state || !button) return;
  const reason = advancedPromoteApplyBlockReason(state);
  button.classList.toggle('is-validation-blocked', Boolean(reason));
  button.setAttribute('aria-disabled', String(Boolean(reason)));
  const validation = document.querySelector('[data-advanced-promote-apply-validation]');
  if (validation) {
    validation.textContent = reason;
    if (!reason) validation.classList.remove('is-visible');
  }
}

function handleAdvancedPromoteApplyClick(event) {
  event?.preventDefault?.();
  const state = syncAdvancedPromoteControlsFromPanel();
  const reason = advancedPromoteApplyBlockReason(state);
  if (!reason) {
    applyAdvancedDraftPromote();
    return;
  }
  const validation = document.querySelector('[data-advanced-promote-apply-validation]');
  if (!validation) {
    showMiniReminder(reason);
    return;
  }
  validation.textContent = reason;
  validation.classList.remove('is-visible');
  requestAnimationFrame(() => validation.classList.add('is-visible'));
}

function refreshAdvancedPromoteChapterMetrics(index) {
  const chapter = advancedDraftPromoteState?.chapters?.[index];
  const preview = document.querySelector(`[data-advanced-promote-chapter="${index}"]`);
  if (!chapter || !preview) return;
  const fullText = advancedPromoteChapterFullText(chapter);
  const bodyWords = advancedPromoteWordCount(advancedPromoteChapterBody(chapter));
  const conclusionWords = advancedPromoteWordCount(chapter.conclusion || '');
  const finalWords = advancedPromoteWordCount(fullText);
  const bodyWordNode = preview.querySelector('[data-advanced-promote-body-words]');
  const finalWordNode = preview.querySelector('[data-advanced-promote-final-words]');
  const fullWordState = preview.querySelector('[data-advanced-promote-full-word-state]');
  const conclusionState = preview.querySelector('[data-advanced-promote-conclusion-status]');
  const listWordNode = document.querySelector(`[data-advanced-promote-list-words="${index}"]`);
  if (bodyWordNode) bodyWordNode.textContent = bodyWords;
  if (finalWordNode) finalWordNode.textContent = finalWords;
  if (fullWordState) fullWordState.hidden = !conclusionWords;
  if (conclusionState) conclusionState.textContent = conclusionWords
    ? (text().advancedPromoteConclusionAdded || 'Conclusion added')
    : (text().advancedPromoteNoConclusion || 'No conclusion');
  if (listWordNode) listWordNode.textContent = finalWords;
  refreshAdvancedPromoteApplyButton();
}

function updateAdvancedPromoteChapterFullText(index, value = '') {
  const chapter = advancedDraftPromoteState?.chapters?.[index];
  if (!chapter) return;
  const fullText = String(value || '').replace(/\r\n?/g, '\n');
  const separator = '\n\n\n';
  const conclusionStart = chapter.conclusion ? fullText.lastIndexOf(separator) : -1;
  chapter.body = conclusionStart >= 0 ? fullText.slice(0, conclusionStart) : fullText;
  chapter.conclusion = conclusionStart >= 0 ? fullText.slice(conclusionStart + separator.length) : '';
  chapter.usesPermanentConclusion = Boolean(chapter.conclusion) && chapter.conclusion === advancedDraftPromoteState.permanentConclusion;
  refreshAdvancedPromoteChapterMetrics(index);
}

function focusAdvancedPromoteChapterEditor(index) {
  const preview = document.querySelector(`[data-advanced-promote-chapter="${index}"]`);
  const reading = preview?.querySelector('[data-advanced-promote-full-reading]');
  const editor = preview?.querySelector('.advanced-promote-full-editor');
  if (!reading || !editor) return;
  const opening = editor.hidden;
  editor.hidden = !opening;
  reading.hidden = opening;
  if (opening) editor.focus();
  else reading.textContent = advancedPromoteChapterFullText(advancedDraftPromoteState?.chapters?.[index]);
}

function advancedPromoteFallbackCopy(value = '') {
  const textarea = document.createElement('textarea');
  textarea.value = String(value || '');
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand?.('copy');
  textarea.remove();
  return Boolean(copied);
}

async function copyAdvancedPromoteChapter(index) {
  const chapter = advancedDraftPromoteState?.chapters?.[index];
  if (!chapter) return;
  const chapterText = advancedPromoteChapterFullText(chapter);
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(chapterText);
    else if (!advancedPromoteFallbackCopy(chapterText)) throw new Error('Clipboard unavailable');
    showMiniReminder(text().advancedPromoteCopied || 'Chapter copied');
  } catch (error) {
    if (advancedPromoteFallbackCopy(chapterText)) {
      showMiniReminder(text().advancedPromoteCopied || 'Chapter copied');
      return;
    }
    console.warn('Advanced promote copy failed:', error);
  }
}

function deleteAdvancedPromoteChapter(index) {
  const state = advancedDraftPromoteState;
  const chapter = state?.chapters?.[index];
  if (!state || !chapter) return;
  const returnedText = advancedPromoteChapterBody(chapter);
  if (returnedText) state.remainderText = [returnedText, state.remainderText].filter(Boolean).join('\n\n');
  state.chapters.splice(index, 1);
  state.selectedChapterIndex = clampNumber(index, 0, Math.max(0, state.chapters.length - 1));
  renderAdvancedDraftPromotePanel();
}

function setAdvancedPromoteDestination(destination = 'part') {
  if (!advancedDraftPromoteState) return;
  advancedDraftPromoteState.destination = destination === 'raw' ? 'raw' : 'part';
}

function syncAdvancedPromoteControlsFromPanel() {
  const state = advancedDraftPromoteState;
  if (!state) return null;

  const sourceInput = document.getElementById('advancedPromoteSourceText');
  if (sourceInput) state.sourceText = sourceInput.value.replace(/\r\n?/g, '\n');

  const limitInput = document.getElementById('advancedPromoteWordLimitInp');
  if (limitInput) state.wordLimit = state.mode === 'import'
    ? clampNumber(parseInt(limitInput.value, 10) || state.wordLimit, ADVANCED_IMPORT_MINIMUM_WORDS, ADVANCED_IMPORT_MAXIMUM_WORDS)
    : clampNumber(parseInt(limitInput.value, 10) || state.wordLimit, 100, 50000);

  const countInput = document.getElementById('advancedPromoteChapterCountInp');
  if (countInput) state.chapterCount = clampNumber(parseInt(countInput.value, 10) || state.chapterCount, 1, 50);

  const splitModeInput = document.getElementById('advancedImportSplitMode');
  if (splitModeInput) state.splitMode = splitModeInput.value === 'custom' ? 'custom' : 'auto';
  const importTargetInput = document.getElementById('advancedImportTarget');
  if (importTargetInput) state.importTarget = importTargetInput.value === 'chapters' ? 'chapters' : 'drafts';
  const customWordInput = document.getElementById('advancedImportCustomWordInp');
  if (customWordInput) state.customWord = customWordInput.value.trim();

  const permanentConclusionInput = document.getElementById('advancedPromotePermanentConclusionInp');
  if (permanentConclusionInput) state.permanentConclusion = permanentConclusionInput.value.replace(/\r\n?/g, '\n');

  const destinationInput = document.querySelector('input[name="advancedPromoteDestination"]:checked');
  if (destinationInput) state.destination = destinationInput.value === 'raw' ? 'raw' : 'part';

  const preview = document.querySelector(`[data-advanced-promote-chapter="${state.selectedChapterIndex}"]`);
  const selectedChapter = state.chapters[state.selectedChapterIndex];
  if (preview && selectedChapter) {
    selectedChapter.title = preview.querySelector('.advanced-promote-chapter-preview-head input')?.value || selectedChapter.title;
    const fullEditor = preview.querySelector('.advanced-promote-full-editor');
    if (fullEditor && !fullEditor.hidden) updateAdvancedPromoteChapterFullText(state.selectedChapterIndex, fullEditor.value);
  }

  const remainderInput = document.querySelector('.advanced-promote-source-remainder textarea');
  if (remainderInput) state.remainderText = remainderInput.value.replace(/\r\n?/g, '\n');
  return state;
}

function generateAdvancedPromoteChaptersFromPanel() {
  const state = syncAdvancedPromoteControlsFromPanel();
  if (!state) return;
  advancedPromoteSavePermanentConclusion(state.permanentConclusion);
  const generated = state.mode === 'import'
    ? advancedImportGenerateChapters(state)
    : advancedPromoteGenerateChapters(state.sourceText, {
        wordLimit: state.wordLimit,
        chapterCount: state.chapterCount,
        permanentConclusion: state.permanentConclusion,
        titleBase: state.draftTitle
      });
  if (state.mode === 'import' && !generated.valid) {
    state.customSplitValid = false;
    state.customSplitReason = generated.reason;
    state.customValidationVisible = true;
    state.activeView = 'source';
    renderAdvancedDraftPromotePanel();
    return;
  }
  state.chapters = generated.chapters;
  state.remainderText = generated.remainderText;
  state.generatedSourceText = state.sourceText;
  state.generatedWordLimit = state.wordLimit;
  state.generatedChapterCount = state.chapterCount;
  state.generatedSplitMode = state.splitMode;
  state.generatedCustomWord = state.customWord;
  state.customSplitValid = true;
  state.customSplitReason = '';
  state.customValidationVisible = false;
  state.selectedChapterIndex = 0;
  state.activeView = 'chapters';
  renderAdvancedDraftPromotePanel();
}

function reverseAdvancedPromoteCreation() {
  const state = syncAdvancedPromoteControlsFromPanel();
  if (!state) return;
  state.chapters = [];
  state.remainderText = '';
  state.generatedSourceText = state.sourceText;
  state.generatedWordLimit = state.wordLimit;
  state.generatedChapterCount = state.chapterCount;
  state.generatedSplitMode = state.splitMode;
  state.generatedCustomWord = state.customWord;
  state.selectedChapterIndex = 0;
  state.activeView = 'source';
  renderAdvancedDraftPromotePanel();
}

async function applyAdvancedTextImportAsDrafts(state, proposedDrafts = []) {
  if (!state || !proposedDrafts.length) return;
  showAppLoader('Importing drafts…');
  chapterDrafts = normalizeDrafts(chapterDrafts);
  const firstDraftIndex = chapterDrafts.length;
  const importedDrafts = [];

  proposedDrafts.forEach((item, offset) => {
    const draftIndex = chapterDrafts.length;
    const draftText = advancedPromoteNormalizedText(item.text);
    const draft = normalizeDraft({
      ...createDefaultDraft(draftIndex),
      id: Date.now() + offset,
      title: String(item.title || advancedPromoteDefaultTitle(state.draftTitle, offset)).trim(),
      content: textToEditorHTML(draftText),
      contentPath: nextDraftFilePath(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _wordCount: advancedPromoteWordCount(draftText),
      wordCount: advancedPromoteWordCount(draftText)
    }, draftIndex);
    chapterDrafts.push(draft);
    importedDrafts.push({ draft, text: draftText, index: draftIndex });
  });

  chapterDrafts = normalizeDrafts(chapterDrafts);
  saveToStorage(false);
  closeAdvancedDraftPromotePanel();
  renderChapters();
  setDraftBoxSaveIndicator('busy');

  try {
    if (projectDirectoryHandle) {
      for (const imported of importedDrafts) {
        await writeDraftToLocalFile(imported.index, imported.text);
      }
      await writeDraftsDataToProject();
    }
    setDraftBoxSaveIndicator('saved');
    await switchDraft(firstDraftIndex);
    setSaveStatusDot('saved', 'Drafts imported');
  } catch (error) {
    console.warn('Advanced text import failed:', error);
    if (projectDirectoryHandle) {
      await Promise.all(importedDrafts.map(imported =>
        removeProjectFileIfExists(imported.draft.contentPath).catch(() => false)
      ));
    }
    chapterDrafts.splice(firstDraftIndex, importedDrafts.length);
    chapterDrafts = normalizeDrafts(chapterDrafts);
    saveToStorage(false);
    renderChapters();
    setDraftBoxSaveIndicator('idle');
    showMiniReminder(error?.message || 'The imported drafts could not be saved.');
  } finally {
    hideAppLoader();
  }
}

async function applyAdvancedTextImportRaw() {
  const state = syncAdvancedPromoteControlsFromPanel();
  if (!state || state.mode !== 'import' || !state.sourceText.trim()) return;
  const sourceText = advancedPromoteNormalizedText(state.sourceText);
  const singleItem = {
    title: advancedImportDocumentTitle(state, 0),
    body: sourceText,
    text: [sourceText, state.permanentConclusion].filter(Boolean).join('\n\n\n'),
    conclusion: state.permanentConclusion,
    usesPermanentConclusion: true
  };
  if (state.importTarget === 'chapters') {
    state.chapters = [singleItem];
    state.allowShortImportChapter = true;
    state.generatedSourceText = state.sourceText;
    state.generatedWordLimit = state.wordLimit;
    state.generatedChapterCount = state.chapterCount;
    state.generatedSplitMode = state.splitMode;
    state.generatedCustomWord = state.customWord;
    await applyAdvancedDraftPromote();
    return;
  }
  await applyAdvancedTextImportAsDrafts(state, [singleItem]);
}

async function applyAdvancedDraftPromote() {
  return runNamingPromotion(performAdvancedDraftPromote);
}

async function performAdvancedDraftPromote() {
  const state = syncAdvancedPromoteControlsFromPanel();
  if (!state) return;
  const isTextImport = state.mode === 'import';

  if (advancedPromoteSplitIsStale(state)) {
    showMiniReminder(text().advancedPromoteRegenerateRequired || 'Source or split settings changed. Create chapters again before promoting.');
    state.activeView = 'source';
    renderAdvancedDraftPromotePanel();
    return;
  }
  if (advancedPromoteHasInvalidChapters(state) && !state.allowShortImportChapter) {
    showMiniReminder(text().advancedPromoteBelowParameterBody || 'Every non-empty chapter must meet the word parameter before promotion.');
    return;
  }
  if (isTextImport && state.customSplitValid === false && !state.allowShortImportChapter) {
    showMiniReminder(state.customSplitReason || 'Choose a valid custom split word.');
    return;
  }
  const titleConflict = advancedPromoteChapterTitleConflict(state);
  if (titleConflict) {
    showMiniReminder(advancedPromoteApplyBlockReason(state));
    state.selectedChapterIndex = titleConflict.index;
    state.activeView = 'chapters';
    renderAdvancedDraftPromotePanel();
    return;
  }

  const draft = isTextImport
    ? normalizeDraft({ ...createDefaultDraft(chapterDrafts.length), title: state.draftTitle }, chapterDrafts.length)
    : advancedPromoteSyncDraftSnapshot(state.draftIndex);
  if (!draft) return;

  const proposedChapters = state.chapters
    .map(chapter => ({
      ...chapter,
      title: String(chapter.title || '').trim(),
      body: advancedPromoteNormalizedText(advancedPromoteChapterBody(chapter)),
      text: advancedPromoteNormalizedText(advancedPromoteChapterFullText(chapter))
    }))
    .filter(chapter => chapter.body);

  if (!proposedChapters.length) {
    showMiniReminder(text().advancedPromoteCreateFirst || 'Create at least one chapter first.');
    return;
  }

  if (isTextImport && state.importTarget !== 'chapters') {
    await applyAdvancedTextImportAsDrafts(state, proposedChapters);
    return;
  }

  await window.LmInitialRendering?.ensureFullNamingData?.();
  const promotionSnapshot = captureNamingPromotionState();
  const draftIdentity = isTextImport ? null : createNamingSource(draft, 'draft', state.draftIndex);
  showAppLoader(isTextImport ? 'Importing chapters…' : (text().advancedPromoteApply || text().saveDraftAsChapter));

  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const hasParts = manifest.parts.length > 0;
  const shouldPromoteToRaw = state.destination === 'raw' && state.showDestination && hasRawChaptersInPanel(manifest);
  const targetPartIndex = shouldPromoteToRaw ? -1 : hasParts ? latestPartIndex(manifest) : -1;
  const firstChapterIndex = chapters.length;
  const basePartChapterCount = targetPartIndex >= 0
    ? chapters.filter(chapter => chapter.partIndex === targetPartIndex).length
    : hasParts
      ? chapters.filter(chapter => {
        const partIndex = Number.isInteger(chapter.partIndex) ? chapter.partIndex : -1;
        return partIndex < 0 || partIndex >= manifest.parts.length;
      }).length
      : chapters.length;
  const promotedAt = new Date().toISOString();
  const usedTitleKeys = new Set();
  const draftPath = isTextImport ? '' : draft.contentPath;

  const newChapters = proposedChapters.map((item, offset) => {
    const chapterIndex = firstChapterIndex + offset;
    const title = advancedPromoteUniqueChapterTitle(
      item.title || advancedPromoteDefaultTitle(state.draftTitle, offset),
      usedTitleKeys
    );
    return normalizeChapter({
      id: Date.now() + offset,
      title,
      content: textToEditorHTML(item.text),
      notes: draft.notes || [],
      contentPath: chapterFilePath(chapterIndex),
      partIndex: targetPartIndex,
      chapterNo: basePartChapterCount + offset + 1,
      createdAt: promotedAt,
      alignment: draft.alignment,
      lineHeight: draft.lineHeight,
      paragraphGap: draft.paragraphGap,
      paragraphMargin: draft.paragraphMargin,
      fontFamily: draft.fontFamily,
      fontSize: draft.fontSize,
      _wordCount: advancedPromoteWordCount(item.text)
    }, chapterIndex, targetPartIndex, basePartChapterCount + offset);
  });

  newChapters.forEach((chapter, offset) => {
    chapters.push(chapter);

  });

  const remainderText = advancedPromoteNormalizedText(state.remainderText);
  let importedRemainderDraft = null;
  if (isTextImport && state.importTarget === 'chapters' && remainderText) {
    const remainderDraftIndex = chapterDrafts.length;
    importedRemainderDraft = {
      index: remainderDraftIndex,
      draft: normalizeDraft({
        ...createDefaultDraft(remainderDraftIndex),
        id: Date.now() + newChapters.length + 1,
        title: `${state.draftTitle} Remainder Draft`,
        content: textToEditorHTML(remainderText),
        contentPath: nextDraftFilePath(),
        createdAt: promotedAt,
        updatedAt: promotedAt,
        _wordCount: advancedPromoteWordCount(remainderText),
        wordCount: advancedPromoteWordCount(remainderText)
      }, remainderDraftIndex)
    };
    chapterDrafts.push(importedRemainderDraft.draft);
  }
  if (!isTextImport) {
    if (remainderText) {
      const remainderDraft = normalizeDraft({
        ...draft,
        id: Date.now() + newChapters.length + 1,
        contentPath: nextDraftFilePath(),
        contentHandle: null,
        title: draft.title || `${text().draftPrefix} ${state.draftIndex + 1}`,
        content: textToEditorHTML(remainderText),
        updatedAt: promotedAt,
        _wordCount: advancedPromoteWordCount(remainderText)
      }, state.draftIndex);
      chapterDrafts.splice(state.draftIndex, 1, remainderDraft);
    } else {
      chapterDrafts.splice(state.draftIndex, 1);
    }
  }

  if (!isTextImport) remapNamesForAdvancedPromotion({
    draftIdentity,
    createdChapters: newChapters.map((chapter, offset) => ({ chapter, index: firstChapterIndex + offset, text: proposedChapters[offset].text })),
    remainderDraft: remainderText ? { draft: chapterDrafts[state.draftIndex], index: state.draftIndex, text: remainderText } : null,
    promotedAt
  });
  newChapters.forEach((chapter, offset) => {
    scanNamingUsesForDocument(chapter.contentPath, proposedChapters[offset].text, null, promotedAt, { resolveUnattached: false });
  });
  if (!isTextImport && remainderText) {
    scanNamingUsesForDocument(chapterDrafts[state.draftIndex].contentPath, remainderText, null, promotedAt, { resolveUnattached: false });
  }

  chapterDrafts = normalizeDrafts(chapterDrafts);
  selectedDraftIndexes.clear();
  lastSelectedDraftIndex = null;
  activeEditorMode = 'chapter';
  isChapterEditUnlocked = false;
  curChap = firstChapterIndex;
  if (!isTextImport) curDraft = chapterDrafts.length ? Math.min(state.draftIndex, chapterDrafts.length - 1) : -1;
  syncDraftPromoteButton();
  curPart = targetPartIndex;
  expandedPartIndex = targetPartIndex;
  isRawChapterSectionExpanded = shouldPromoteToRaw;
  isPartsListCollapsedByRaw = shouldPromoteToRaw;
  isPartsListForceExpanded = !shouldPromoteToRaw && targetPartIndex >= 0;
  if (!shouldPromoteToRaw && targetPartIndex >= 0 && chapterListOverflowMode === 'collapsed') chapterListOverflowMode = 'expanded';

  let promotionCommitted = false;
  const promotedNamingData = namingData;
  try {
    const documents = newChapters.map((chapter, offset) => ({ path: chapter.contentPath, text: proposedChapters[offset].text }));
    if (!isTextImport && remainderText) documents.push({ path: chapterDrafts[state.draftIndex].contentPath, text: remainderText });
    if (importedRemainderDraft) documents.push({ path: importedRemainderDraft.draft.contentPath, text: remainderText });
    await window.LmNamingFileSafety.commitPromotion(projectDirectoryHandle, {
      promotionId: state.promotionId || (state.promotionId = `promotion-${promotedAt}`),
      documents,
      removePaths: draftPath ? [draftPath] : []
    });
    promotionCommitted = true;
    persistProjectManifestSnapshot();
    saveToStorage(false);
    closeAdvancedDraftPromotePanel();
    await loadEditor();
    await window.LmInitialRendering?.syncNamingIndex?.(promotedNamingData);
    renderChapters();
    renderActiveWorkspaceSidePanel();
    updateChapterStatus();
    rememberCurrentChapterSaved();
    setDraftBoxSaveIndicator('saved');
    setSaveStatusDot('saved', text().advancedPromoteSaved || text().draftPromoted);
  } catch (error) {
    if (!promotionCommitted) restoreNamingPromotionState(promotionSnapshot);
    console.warn('Advanced draft promote failed:', error);
    showMiniReminder(promotionCommitted ? 'Promotion saved; reload to refresh the editor.' : 'Promotion save failed; original draft is recoverable.');
    setDraftBoxSaveIndicator('idle');
  } finally {
    hideAppLoader();
  }
}

try {
  requestPromoteDraftToChapter = requestAdvancedPromoteDraftToChapter;
} catch (error) {
  console.warn('Advanced promote hook failed:', error);
}

window.openDraftPromoteModePanel = openDraftPromoteModePanel;
window.requestRawPromoteDraftToChapter = requestRawPromoteDraftToChapter;
window.requestPromoteDraftToChapter = requestAdvancedPromoteDraftToChapter;
window.openAdvancedDraftPromotePanel = openAdvancedDraftPromotePanel;
window.openAdvancedTextImportPanel = openAdvancedTextImportPanel;
window.closeAdvancedDraftPromotePanel = closeAdvancedDraftPromotePanel;
window.generateAdvancedPromoteChaptersFromPanel = generateAdvancedPromoteChaptersFromPanel;
window.reverseAdvancedPromoteCreation = reverseAdvancedPromoteCreation;
window.applyAdvancedDraftPromote = applyAdvancedDraftPromote;
window.handleAdvancedPromoteApplyClick = handleAdvancedPromoteApplyClick;
window.setAdvancedPromoteView = setAdvancedPromoteView;
window.selectAdvancedPromoteChapter = selectAdvancedPromoteChapter;
window.updateAdvancedPromoteSetting = updateAdvancedPromoteSetting;
window.updateAdvancedPromoteSourceText = updateAdvancedPromoteSourceText;
window.updateAdvancedPromoteRemainderText = updateAdvancedPromoteRemainderText;
window.updateAdvancedPromotePermanentConclusion = updateAdvancedPromotePermanentConclusion;
window.updateAdvancedPromoteChapterTitle = updateAdvancedPromoteChapterTitle;
window.updateAdvancedPromoteChapterFullText = updateAdvancedPromoteChapterFullText;
window.focusAdvancedPromoteChapterEditor = focusAdvancedPromoteChapterEditor;
window.copyAdvancedPromoteChapter = copyAdvancedPromoteChapter;
window.deleteAdvancedPromoteChapter = deleteAdvancedPromoteChapter;
window.setAdvancedPromoteDestination = setAdvancedPromoteDestination;

